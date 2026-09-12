'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'

/** Data and in-flight mutations are fenced by both the account and exact resource. */
export function useHostedResource<T>(url:string|null,parse:(payload:unknown,owner:string)=>T|null){
 const account=useHistoryAccount(),scope=`${account}:${url}`,current=useRef(scope);current.current=scope
 const epoch=useRef(0),request=useRef<AbortController|null>(null),mutating=useRef<symbol|null>(null)
 const [snapshot,setSnapshot]=useState<{scope:string;data:T}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
 const load=useCallback(async()=>{
  if(mutating.current)return
  if(!url||!account||account==='unavailable'){setLoading(false);return}
  request.current?.abort();const abort=new AbortController(),ticket=++epoch.current;request.current=abort
  const timer=setTimeout(()=>abort.abort(),12000);setLoading(true)
  try{
   const response=await fetch(url,{cache:'no-store',signal:abort.signal}),body=await response.json()
   if(current.current!==scope||ticket!==epoch.current)return
   const parsed=response.ok?parse(body,account):null
   if(!parsed)throw Error(typeof body?.error==='string'?body.error:'unavailable')
   setSnapshot({scope,data:parsed});setError('')
  }catch(e){if(current.current===scope&&ticket===epoch.current){setSnapshot(null);setError(e instanceof Error?e.message:'unavailable')}}
  finally{clearTimeout(timer);if(current.current===scope&&ticket===epoch.current){setLoading(false);request.current=null}}
 },[url,account,scope,parse])
 useEffect(()=>{
  ++epoch.current;request.current?.abort();request.current=null;mutating.current=null;setSnapshot(null);setError('');setBusy(false);void load()
  const wake=()=>{if(document.visibilityState==='visible'&&!request.current&&!mutating.current)void load()}
  const timer=setInterval(wake,15000);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake)
  return()=>{++epoch.current;request.current?.abort();clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake)}
 },[load])
 async function mutate<R>(endpoint:string,body:unknown,decode:(body:unknown)=>R|null):Promise<R|null>{
  if(mutating.current||!account||account==='unavailable')return null
  const mutationToken=Symbol('hosted-mutation');mutating.current=mutationToken;setBusy(true);setError('');request.current?.abort();const ticket=++epoch.current,abort=new AbortController();request.current=abort
  const timer=setTimeout(()=>abort.abort(),12000)
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Quantum-Owner':account},body:JSON.stringify(body),signal:abort.signal})
   const payload=await response.json()
   if(current.current!==scope||ticket!==epoch.current)return null
   const parsed=response.ok?decode(payload):null
   if(!parsed)throw Error(typeof payload?.error==='string'?payload.error:'unavailable')
   return parsed
  }catch(e){if(current.current===scope&&ticket===epoch.current){setSnapshot(null);setError(e instanceof Error?e.message:'unavailable')}return null}
  finally{clearTimeout(timer);if(mutating.current===mutationToken){mutating.current=null;if(current.current===scope){setBusy(false);if(ticket===epoch.current)request.current=null}}}
 }
 return{account,data:snapshot?.scope===scope?snapshot.data:null,error,busy,loading,load,mutate}
}
