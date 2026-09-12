'use client'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react'
import {ArrowRight,BellRing,Check,RefreshCw} from 'lucide-react'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import {parseApplicationStatusView,canRestartApplication,applicationBasePath,type NativeApplicationKind,type ApplicationStateView} from '@/lib/meetups/application-view'
import s from './meetup-admission.module.css'

export default function MeetupAdmissionStatus({meetupId,kind,children}:{meetupId:string;kind?:NativeApplicationKind;children:ReactNode}){
 const account=useHistoryAccount(),accountRef=useRef(account);accountRef.current=account
 const router=useRouter(),epoch=useRef(0),controller=useRef<AbortController|null>(null),changing=useRef(false)
 const [snapshot,setSnapshot]=useState<{owner:string;application:ApplicationStateView|null}|null>(null)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false)
 const [restart,setRestart]=useState<{owner:string;applicationId:string}|null>(null)
 const load=useCallback(async()=>{
  if(!account||account==='unavailable')return
  controller.current?.abort();const abort=new AbortController(),ticket=++epoch.current;controller.current=abort
  const timer=setTimeout(()=>abort.abort(),12000)
  try{
   const response=await fetch(`${applicationBasePath(meetupId,kind)}/application/status`,{cache:'no-store',signal:abort.signal})
   const parsed=response.ok?parseApplicationStatusView(await response.json(),account,meetupId,kind):null
   if(ticket!==epoch.current||accountRef.current!==account)return
   if(!parsed)throw Error('unavailable')
   setSnapshot({owner:account,application:parsed.application});setError('')
   if(parsed.application?.admission==='accepted'&&parsed.application.chatHref&&document.visibilityState==='visible')router.replace(parsed.application.chatHref)
  }catch{if(ticket===epoch.current&&accountRef.current===account){setSnapshot(null);setError('신청 결과를 확인하지 못했어요. 새로 신청하지 않고 기존 상태부터 확인할게요.')}}
  finally{clearTimeout(timer);if(ticket===epoch.current)controller.current=null}
 },[account,meetupId,kind,router])
 useEffect(()=>{
  ++epoch.current;controller.current?.abort();setSnapshot(null);setConfirm(false);setRestart(null);setError('');void load()
  const wake=()=>{if(document.visibilityState==='visible'&&!controller.current&&!changing.current)void load()}
  const timer=window.setInterval(wake,8000);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake)
  return()=>{++epoch.current;controller.current?.abort();window.clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake)}
 },[load])
 const visible=snapshot?.owner===account?snapshot:null
 async function cancel(){
  const a=visible?.application
  if(!a||a.admission!=='pending'||changing.current)return
  const owner=account,ticket=++epoch.current;controller.current?.abort();changing.current=true;setBusy(true)
  try{
   const response=await fetch(`${applicationBasePath(meetupId,kind)}/application/cancel`,{method:'POST',headers:{'Content-Type':'application/json',...(kind&&owner?{'X-Quantum-Owner':owner}:{})},body:JSON.stringify({applicationId:a.id,revision:a.revision}),signal:AbortSignal.timeout(12000)})
   if(ticket!==epoch.current||accountRef.current!==owner)return
   setConfirm(false)
   if(!response.ok){setSnapshot(null);setError('이미 처리되었거나 취소 결과를 확인할 수 없어요. 최신 신청 상태를 확인해 주세요.');return}
   await load()
  }catch{if(ticket===epoch.current&&accountRef.current===owner){setSnapshot(null);setError('취소 결과를 확인하지 못했어요. 최신 상태를 다시 확인해 주세요.')}}
  finally{changing.current=false;setBusy(false)}
 }
 if(visible&&visible.application===null)return children
 if(visible?.application&&canRestartApplication(visible.application,restart,account))return <><aside className="mx-auto max-w-xl px-5 pt-4 text-sm leading-6 text-[#856956]">이전 신청은 종료됐어요. 이전 보증금 {visible.application.amountKrw.toLocaleString('ko-KR')}원 · {visible.application.payment==='refund_due'?'반환 처리 대기':visible.application.payment==='refunded'?'공급자 반환 확인':'반환 상태 확인 필요'}. 새 신청과 별도로 유지되며 자동으로 재결제하거나 이월하지 않아요.<button className="ml-2 min-h-11 font-bold underline" onClick={()=>setRestart(null)}>이전 신청 보기</button></aside>{children}</>
 if(account===null||account==='unavailable')return children
 return <div className={s.page}>{error?<section className={s.surface}><div className={s.error} role="alert">{error}<button onClick={()=>void load()}>상태 다시 확인</button></div></section>:visible?.application?<ApplicationStatusCard application={visible.application} confirm={confirm} busy={busy} onRefresh={()=>void load()} onCancel={()=>setConfirm(true)} onBack={()=>setConfirm(false)} onConfirm={()=>void cancel()} onRestart={()=>{if(account&&account!=='unavailable')setRestart({owner:account,applicationId:visible.application!.id})}}/>:<section className={s.surface}><p className={s.empty} role="status">기존 신청 상태를 확인하고 있어요…</p></section>}</div>
}

export function ApplicationStatusCard({application:a,confirm=false,busy=false,onRefresh,onCancel,onBack,onConfirm,onOpenChat,onRestart}:{application:ApplicationStateView;confirm?:boolean;busy?:boolean;onRefresh:()=>void;onCancel:()=>void;onBack:()=>void;onConfirm:()=>void;onOpenChat?:()=>void;onRestart?:()=>void}){
 const accepted=a.admission==='accepted',pending=a.admission==='pending'
 return <section className={`${s.surface} ${s.status}`} aria-label="내 참가 신청 상태"><span className={s.badge}>{accepted?<Check size={15}/>:<BellRing size={15}/>} {accepted?'함께할 준비 완료':pending?'신청 접수 완료':'신청 종료'}</span>
  <h2>{accepted?'우리 모임 채팅으로 가요':pending?'방장에게 신청을 전했어요':'신청 결과를 확인해 주세요'}</h2>
  <p>{accepted?'입장 전 대화도 읽을 수 있어요. 먼저 정한 시간과 장소를 확인하고 인사해 주세요.':pending?'기존 모임 채팅방과 방장 알림함에 신청 소식을 전달했어요. 이 화면을 나가도 승인 소식은 알림함에 남아요.':a.admission==='declined'?'이번 신청은 수락되지 않았어요. 보증금 반환 상태는 아래에서 따로 확인하세요.':'신청이 취소됐어요. 보증금 반환 완료와는 다른 상태예요.'}</p>
  <div className={s.payment}><span>이 모임 보증금<br/><b>{a.amountKrw.toLocaleString('ko-KR')}원</b></span><strong>{a.payment==='held'?'예치 확인':a.payment==='refund_due'?'반환 처리 대기':'공급자 반환 확인'}</strong></div>
  {a.payment==='refund_due'?<p>반환 처리가 필요한 상태예요. 실제 결제수단에 돌려받았다는 뜻은 아니에요.</p>:null}
  {!pending&&!accepted&&onRestart?<button className={`${s.primary} mb-3 w-full`} onClick={onRestart}>다시 신청하기<ArrowRight size={17}/></button>:null}
  <div className={s.actions}>{accepted&&a.chatHref?onOpenChat?<button className={s.primary} onClick={onOpenChat}>모임 채팅으로<ArrowRight size={17}/></button>:<Link className={s.primary} href={a.chatHref}>모임 채팅으로<ArrowRight size={17}/></Link>:<button className={s.primary} disabled={busy} onClick={onRefresh}><RefreshCw size={16}/>신청 상태 확인</button>}<Link className={s.secondary} href="/notifications">알림함</Link></div>
  {accepted&&!a.chatHref?<p>현재 채팅 참여 권한을 확인할 수 없어요. 방에서 나갔거나 모임 상태가 바뀌었을 수 있어요.</p>:null}
  {pending?confirm?<div className={s.confirm}><p>참가 신청을 취소할까요? 보증금은 반환 대상으로 처리해요.</p><div className={s.actions}><button disabled={busy} className={s.secondary} onClick={onBack}>계속 기다리기</button><button disabled={busy} className={s.primary} onClick={onConfirm}>{busy?'취소 확인 중…':'신청 취소 확인'}</button></div></div>:<button className={s.subtle} onClick={onCancel}>기다리지 않고 신청 취소</button>:null}
  <p className={s.roomTitle}>휴대폰 알림은 알림함에서 기기 알림을 켠 경우에 받을 수 있어요.</p>
 </section>
}
