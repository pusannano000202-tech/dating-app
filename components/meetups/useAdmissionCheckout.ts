'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {requestTossPaymentWindow,type TossBrowserPaymentRequest} from '@/lib/payments/toss-browser'
import {checkoutOrderId,type CheckoutRoom} from '@/lib/meetups/admission-checkout-contract'
import {applicationBasePath,parseApplicationStatusView,type ApplicationStateView} from '@/lib/meetups/application-view'
import type {AdmissionApplicationInput} from '@/lib/meetups/admission-contract'
import type {MeetupApplicationResult} from './MeetupApplicationFlow'

function resultView(a:ApplicationStateView|null):MeetupApplicationResult{
 return a?{applicationId:a.id,admission:a.admission==='pending'?'submitted':a.admission==='cancelled'?'withdrawn':a.admission,payment:a.payment,chatHref:a.chatHref}:{applicationId:null,admission:'draft',payment:'unpaid'}
}
export function useAdmissionCheckout(room:CheckoutRoom,owner:string|null,metadata:Record<string,unknown>={}){
 const [available,setAvailable]=useState<string|null>(null)
 const [pending,setPending]=useState<{owner:string;orderId:string;state:string}|null>(null)
 const metadataKey=JSON.stringify(metadata),key=owner?`quantum-admission-order:${owner}:${room.kind}:${room.id}`:null
 useEffect(()=>{
  setAvailable(null);setPending(null);if(!owner)return
  const controller=new AbortController()
  void fetch(`/api/meetups/admission/checkout?kind=${room.kind}&room=${encodeURIComponent(room.id)}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal}).then(async response=>{
   const value=await response.json();if(!controller.signal.aborted&&response.ok&&value.accountKey===owner){
    if(key&&checkoutOrderId(value.pendingOrder?.orderId)){sessionStorage.setItem(key,value.pendingOrder.orderId);setPending({owner,orderId:value.pendingOrder.orderId,state:value.pendingOrder.state})}
    if(value.checkoutEnabled===true)setAvailable(owner)
   }
  }).catch(()=>{})
  return()=>controller.abort()
 },[owner,room.kind,room.id])
 const refresh=useCallback(async({signal}:{signal:AbortSignal}):Promise<MeetupApplicationResult>=>{
  if(!owner)throw new Error('auth_required')
  const kind=room.kind==='custom_meetup'?undefined:room.kind
  // A room status may describe an older cancelled/refund_due application. It
  // cannot clear a later order: reconcile the saved order before reading status.
  const orderId=key?sessionStorage.getItem(key):null
  if(!checkoutOrderId(orderId)){
   const response=await fetch(`${applicationBasePath(room.id,kind)}/application/status`,{cache:'no-store',credentials:'same-origin',signal})
   const status=response.ok?parseApplicationStatusView(await response.json(),owner,room.id,kind):null
   if(!status)throw new Error('checkout_reconciliation_required')
   return resultView(status.application)
  }
  const recovery=await fetch('/api/meetups/admission/checkout/confirm',{method:'POST',credentials:'same-origin',signal,headers:{'Content-Type':'application/json','X-Quantum-Owner':owner},body:JSON.stringify({room,orderId,paymentKey:null,amount:null})})
  const body=await recovery.json()
  if(body?.error==='checkout_aborted'){if(key)sessionStorage.removeItem(key);setPending(null);return {applicationId:null,admission:'draft',payment:'failed'}}
  if(!recovery.ok)throw new Error(typeof body?.error==='string'?body.error:'checkout_reconciliation_required')
  const parsed=parseApplicationStatusView(body,owner,room.id,kind)
  if(!parsed?.application)throw new Error('checkout_reconciliation_required')
  if(key)sessionStorage.removeItem(key);setPending(null);return resultView(parsed.application)
 },[owner,room.kind,room.id,key])
 const submit=useCallback(async(input:AdmissionApplicationInput|null,{signal}:{signal:AbortSignal}):Promise<MeetupApplicationResult>=>{
  if(!owner||available!==owner)throw new Error('checkout_unavailable')
  if(input===null&&(!pending||pending.owner!==owner))throw new Error('checkout_unavailable')
  const response=await fetch('/api/meetups/admission/checkout',{method:'POST',credentials:'same-origin',signal,headers:{'Content-Type':'application/json','X-Quantum-Owner':owner},body:JSON.stringify(input===null?{room,resumeOrderId:pending!.orderId}:{room,input:room.kind==='custom_meetup'?input:{...input,metadata:JSON.parse(metadataKey)}})})
  const value=await response.json()
  if(!response.ok)throw new Error(typeof value?.error==='string'?value.error:'checkout_reconciliation_required')
  if(value.accountKey!==owner||value.room?.kind!==room.kind||value.room?.id!==room.id||!checkoutOrderId(value.orderId))throw new Error('checkout_reconciliation_required')
  // Persist only the opaque order, never introduction, payment key or provider secrets.
  // This keeps retry recovery tied to this account/room across provider navigation.
  if(key)sessionStorage.setItem(key,value.orderId)
  if(!value.checkout)return refresh({signal})
  const checkout=value.checkout as TossBrowserPaymentRequest
  if(checkout.provider!=='toss'||checkout.method!=='CARD'||checkout.orderId!==value.orderId||checkout.customerKey!==owner||!Number.isSafeInteger(checkout.amount)||checkout.amount<=0||[checkout.successUrl,checkout.failUrl].some(url=>{try{const u=new URL(url);return u.origin!==location.origin||u.pathname!=='/meetups/payment-return'}catch{return true}}))throw new Error('checkout_reconciliation_required')
  if(signal.aborted)throw new DOMException('Aborted','AbortError')
  try{await requestTossPaymentWindow(checkout)}catch(error){
   const code=error&&typeof error==='object'&&'code'in error?String(error.code):''
   if(['USER_CANCEL','PAY_PROCESS_CANCELED','PAY_PROCESS_ABORTED'].includes(code))throw new Error('payment_cancelled')
   throw new Error('checkout_reconciliation_required')
  }
  return {applicationId:null,admission:'draft',payment:'pending'}
 },[owner,available,room.kind,room.id,metadataKey,key,refresh,pending])
 const application=useMemo<MeetupApplicationResult|undefined>(()=>pending?.owner===owner?{applicationId:null,admission:'draft',payment:'reconciliation_required'}:undefined,[pending,owner])
 const resume=useCallback((options:{signal:AbortSignal})=>submit(null,options),[submit])
 return {submit:available===owner&&owner&&!pending?submit:undefined,refresh,application,resume:available===owner&&pending?.owner===owner&&pending.state==='prepared'?resume:undefined}
}
