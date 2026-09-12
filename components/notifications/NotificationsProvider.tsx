'use client'

import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import {mergeNotificationPages,newArrival,parseNotificationPage,type NotificationRow} from '@/lib/notifications/common-contract'
import {CommonPushAccountBoundary} from './PushNotificationSettings'

export type NotificationState={ownerId?:string|null;items:NotificationRow[];unread:number|null;status:'loading'|'ready'|'auth_required'|'unavailable';hasMore:boolean;busy:boolean;arrival:NotificationRow|null;error:string|null;refresh:()=>Promise<void>;loadMore:()=>Promise<void>;markRead:(id?:string)=>Promise<boolean>;dismissArrival:()=>void}
export const NotificationContext=createContext<NotificationState|null>(null)
const empty:NotificationState={items:[],unread:null,status:'loading',hasMore:false,busy:false,arrival:null,error:null,refresh:async()=>{},loadMore:async()=>{},markRead:async()=>false,dismissArrival:()=>{}}
export const useNotifications=()=>useContext(NotificationContext)??empty
type Cursor={created_at:string;id:string}|null
type Stored={owner:string|null|undefined;items:NotificationRow[];unread:number|null;status:NotificationState['status'];arrival:NotificationRow|null;error:string|null;hasMore:boolean}
const initial=(owner:Stored['owner']):Stored=>({owner,items:[],unread:null,status:owner===null?'auth_required':'loading',arrival:null,error:null,hasMore:false})

/** One account-fenced source for the bell, notification inbox and read-only guide conversation. */
export default function NotificationsProvider({children}:{children:ReactNode}){
 const account=useHistoryAccount(),[stored,setStored]=useState<Stored>(()=>initial(undefined)),[busy,setBusy]=useState(false)
 const epoch=useRef(0),seen=useRef<NotificationRow[]|null>(null),cursor=useRef<Cursor>(null),paged=useRef(false),inflight=useRef(false)
 const accountRef=useRef(account);accountRef.current=account
 const invalidate=useCallback(()=>{++epoch.current;inflight.current=false},[])
 const refresh=useCallback(async()=>{
  if(!account||account==='unavailable'||inflight.current)return
  const ticket=epoch.current,owner=account;inflight.current=true
  try{
   const [list,countResponse]=await Promise.all([fetch('/api/notifications/social/page?limit=50',{cache:'no-store',signal:AbortSignal.timeout(12000)}),fetch('/api/notifications/unread-count',{cache:'no-store',signal:AbortSignal.timeout(12000)})])
   const [payload,count]=await Promise.all([list.json().catch(()=>null),countResponse.json().catch(()=>null)])
   if(ticket!==epoch.current||accountRef.current!==owner)return
   if(list.status===401||countResponse.status===401){seen.current=null;setStored({...initial(owner),status:'auth_required'});return}
   const rows=list.ok?parseNotificationPage(payload):null
   if(!rows||!countResponse.ok||payload.owner_id!==owner||count?.owner_id!==owner||!Number.isSafeInteger(count.count)||count.count<0||typeof payload.has_more!=='boolean')throw Error('unavailable')
   const arrival=newArrival(seen.current,rows);seen.current=rows
   if(!paged.current)cursor.current=payload.next_cursor as Cursor
   setStored(old=>({owner,items:mergeNotificationPages(old.owner===owner?old.items:[],rows),unread:count.count,status:'ready',error:null,hasMore:paged.current?old.hasMore:payload.has_more,arrival:arrival??old.arrival}))
  }catch{if(ticket===epoch.current&&accountRef.current===owner)setStored(old=>({...old,owner,status:'unavailable',unread:null,arrival:null,error:'알림 연결을 확인하지 못했어요. 다시 확인해 주세요.'}))}
  finally{if(ticket===epoch.current)inflight.current=false}
 },[account])
 useEffect(()=>{
  invalidate();seen.current=null;cursor.current=null;paged.current=false;setBusy(false);setStored(initial(account))
  if(account==='unavailable'){setStored({...initial(account),status:'unavailable',error:'로그인 연결을 확인하지 못했어요.'});return}
  void refresh()
  const focus=()=>{if(document.visibilityState==='visible')void refresh()}
  const timer=window.setInterval(focus,15000)
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus)
  return()=>{invalidate();window.clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}
 },[account,refresh,invalidate])
 const loadMore=useCallback(async()=>{
  if(!account||!cursor.current||busy)return
  const ticket=epoch.current;setBusy(true)
  try{
   const params=new URLSearchParams({limit:'50',before_created_at:cursor.current.created_at,before_id:cursor.current.id})
   const response=await fetch('/api/notifications/social/page?'+params,{cache:'no-store',signal:AbortSignal.timeout(12000)}),payload=await response.json()
   if(ticket!==epoch.current||accountRef.current!==account)return
   const rows=response.ok?parseNotificationPage(payload):null
   if(!rows||payload.owner_id!==account||typeof payload.has_more!=='boolean')throw Error('unavailable')
   cursor.current=payload.next_cursor as Cursor;paged.current=true
   setStored(old=>({...old,items:mergeNotificationPages(old.items,rows),hasMore:payload.has_more,error:null}))
  }catch{if(ticket===epoch.current)setStored(old=>({...old,error:'이전 안내를 불러오지 못했어요. 다시 시도해 주세요.'}))}
  finally{if(ticket===epoch.current)setBusy(false)}
 },[account,busy])
 const markRead=useCallback(async(id?:string)=>{
  if(!account||account==='unavailable')return false
  const ticket=epoch.current
  try{
   const response=await fetch('/api/notifications/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(id?{notification_id:id}:{all:true}),signal:AbortSignal.timeout(12000)})
   const result=await response.json()
   if(ticket!==epoch.current||accountRef.current!==account)return false
   if(!response.ok||result.ok!==true)throw Error('read_failed')
   // Discard any list/count response captured before this acknowledgement.
   ++epoch.current;inflight.current=false;setBusy(false)
   setStored(old=>{const readAt=new Date().toISOString(),delta=id?old.items.some(n=>n.id===id&&!n.read_at)?1:0:old.unread??0;return {...old,items:old.items.map(n=>!id||n.id===id?{...n,read_at:n.read_at??readAt}:n),unread:old.unread===null?null:Math.max(0,old.unread-delta),arrival:!id||old.arrival?.id===id?null:old.arrival,error:null}})
   void refresh();return true
  }catch{if(ticket===epoch.current)setStored(old=>({...old,error:'읽음 상태를 저장하지 못했어요. 다시 시도해 주세요.'}));return false}
 },[account,refresh])
 const visible=stored.owner===account?stored:initial(account)
 return <NotificationContext.Provider value={{...visible,ownerId:account&&account!=='unavailable'?account:null,busy,refresh,loadMore,markRead,dismissArrival:()=>setStored(old=>({...old,arrival:null}))}}><CommonPushAccountBoundary ownerId={account==='unavailable'?undefined:account}/>{children}</NotificationContext.Provider>
}
