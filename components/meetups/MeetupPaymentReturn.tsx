'use client'
import Link from 'next/link'
import {useRouter,useSearchParams} from 'next/navigation'
import {useEffect,useRef,useState} from 'react'
import {Loader2,ShieldCheck} from 'lucide-react'
import {createClient} from '@/lib/supabase'
import {isSupabaseConfigured} from '@/lib/utils'
import {checkoutRoom,checkoutOrderId,checkoutReturnPath,checkoutRecoveryUrl} from '@/lib/meetups/admission-checkout-contract'
import {parseApplicationStatusView} from '@/lib/meetups/application-view'

export default function MeetupPaymentReturn(){
 const params=useSearchParams(),router=useRouter()
 const [attempt]=useState(()=>{
  const room=checkoutRoom({kind:params.get('kind'),id:params.get('room')}),orderId=params.get('order'),providerOrder=params.get('orderId')
  if(!room||!checkoutOrderId(orderId)||(providerOrder!==null&&providerOrder!==orderId)||[...params.keys()].some(k=>params.getAll(k).length!==1))return null
  const success=params.get('checkout')==='success',paymentKey=success?params.get('paymentKey'):null,rawAmount=params.get('amount'),amount=success&&rawAmount&&/^\d+$/.test(rawAmount)?Number(rawAmount):null
  if(success&&(!paymentKey||!Number.isSafeInteger(amount)||Number(amount)<=0))return null
  return {room,orderId,paymentKey,amount,success}
 })
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),expectedOwner=useRef<string|null>(null)
 useEffect(()=>{
  // Keep only the opaque order/room for safe refresh recovery. Provider payment
  // key, amount and success claim are removed; refresh performs lookup only.
  window.history.replaceState(window.history.state,'',attempt?checkoutRecoveryUrl(attempt.room,attempt.orderId):'/meetups/payment-return')
  if(!attempt||!isSupabaseConfigured()){setError('결제 복귀 정보를 확인하지 못했어요. 모임의 신청 상태를 확인해 주세요.');return}
  const controller=new AbortController(),client=createClient()
  let owner:string|null=null
  const subscription=client.auth.onAuthStateChange((_event,session)=>{
   if(owner&&session?.user.id!==owner){controller.abort();setBusy(false);setError('계정이 바뀌었어요. 결제한 계정으로 로그인해 신청 상태를 확인해 주세요.')}
  }).data.subscription
  setBusy(true);setError('')
  void(async()=>{
   try{
    const {data:{user},error:authError}=await client.auth.getUser()
    if(authError||!user)throw new Error('login')
    if(expectedOwner.current&&expectedOwner.current!==user.id)throw new Error('account_changed')
    expectedOwner.current=user.id;owner=user.id
    const response=await fetch('/api/meetups/admission/checkout/confirm',{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json','X-Quantum-Owner':user.id},body:JSON.stringify({room:attempt.room,orderId:attempt.orderId,paymentKey:attempt.paymentKey,amount:attempt.amount})})
    const value=await response.json()
    if(!response.ok)throw new Error(value?.error??'unavailable')
    const kind=attempt.room.kind==='custom_meetup'?undefined:attempt.room.kind,parsed=parseApplicationStatusView(value,user.id,attempt.room.id,kind)
    if(!parsed?.application)throw new Error('unavailable')
    if(controller.signal.aborted)return
    sessionStorage.removeItem(`quantum-admission-order:${user.id}:${attempt.room.kind}:${attempt.room.id}`)
    router.replace(checkoutReturnPath(attempt.room))
   }catch(cause){
    if(controller.signal.aborted)return
    const code=cause instanceof Error?cause.message:''
    setError(code==='login'?'결제한 계정으로 로그인한 뒤 신청 상태를 확인해 주세요.':code==='checkout_aborted'||code==='checkout_not_paid'&&!attempt.success?'결제가 완료되지 않았어요. 신청도 아직 접수되지 않았어요.':code==='checkout_unavailable'?'현재 결제 연결이 꺼져 있어요. 결제나 접수가 완료된 것으로 표시하지 않아요.':'결제·접수 결과를 확인하지 못했어요. 중복 결제를 하지 말고 같은 주문의 상태를 다시 확인해 주세요.')
   }finally{if(!controller.signal.aborted)setBusy(false)}
  })()
  return()=>{controller.abort();subscription.unsubscribe()}
 },[attempt,retry,router])
 return <main className="mx-auto min-h-[70vh] max-w-md px-5 pb-28 pt-14"><div className="rounded-3xl border border-boot-hairline bg-white p-6">
  <ShieldCheck size={30} className="mb-5 text-boot-primary"/><h1 className="text-2xl font-black">보증금과 신청을 확인해요</h1>
  <p className="mt-4 text-sm leading-7 text-boot-muted" role="status">{busy?'결제 공급자와 서버의 접수 기록을 확인하고 있어요. 창 이동만으로 납부나 참가가 확정되지는 않아요.':error}</p>
  {busy?<Loader2 className="mt-5 animate-spin text-boot-primary"/>:attempt?<button type="button" className="mt-6 min-h-12 w-full rounded-xl bg-boot-primary px-4 font-bold text-white" onClick={()=>setRetry(value=>value+1)}>같은 주문 상태 다시 확인</button>:null}
  <Link href={attempt?checkoutReturnPath(attempt.room):'/meetups'} className="mt-4 flex min-h-11 items-center justify-center font-bold text-boot-primary">신청 상태로 돌아가기</Link>
 </div></main>
}
