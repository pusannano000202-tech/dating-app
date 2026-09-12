'use client'

import Link from 'next/link'
import {useCallback,useEffect,useRef,useState} from 'react'
import {ArrowRight,Check,MessageCircle,Megaphone,RefreshCw,ShieldCheck,UserRound} from 'lucide-react'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import {parseApplicationManagementView,latestApplicationNotices,applicationBasePath,applicationPagePath,type NativeApplicationKind,type ApplicationManagementView,type ApplicantView} from '@/lib/meetups/application-view'
import s from './meetup-admission.module.css'

/** Private introductions exist only in the host response; room notices contain no introduction. */
export default function MeetupApplications({meetupId,kind,noticesOnly=false}:{meetupId:string;kind?:NativeApplicationKind;noticesOnly?:boolean}){
 const account=useHistoryAccount(),accountRef=useRef(account);accountRef.current=account
 const [data,setData]=useState<ApplicationManagementView|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [confirmation,setConfirmation]=useState<{application:ApplicantView;action:'approve'|'decline'}|null>(null)
 const epoch=useRef(0),request=useRef<AbortController|null>(null),mutation=useRef(false),pageCursor=useRef<string|undefined>(undefined)
 const load=useCallback(async(before?:string)=>{
  if(!account||account==='unavailable')return
  pageCursor.current=before
  request.current?.abort();const controller=new AbortController(),ticket=++epoch.current;request.current=controller
  const timer=setTimeout(()=>controller.abort(),12000)
  try{
   const response=await fetch(`${applicationBasePath(meetupId,kind)}/applications${before?'?before='+encodeURIComponent(before):''}`,{cache:'no-store',signal:controller.signal})
   const payload=await response.json(),parsed=response.ok?parseApplicationManagementView(payload,account,meetupId,kind):null
   if(ticket!==epoch.current||accountRef.current!==account)return
   if(!parsed)throw Error('unavailable')
   setData(parsed);setError('')
  }catch{if(ticket===epoch.current&&accountRef.current===account){setData(null);setError('신청 현황을 확인하지 못했어요. 확인되기 전에는 수락·거절하지 않아요.')}}
  finally{clearTimeout(timer);if(ticket===epoch.current)request.current=null}
 },[account,meetupId,kind])
 useEffect(()=>{
  ++epoch.current;request.current?.abort();pageCursor.current=undefined;setData(null);setConfirmation(null);setError('');void load()
  const wake=()=>{if(document.visibilityState==='visible'&&!request.current&&!mutation.current)void load(pageCursor.current)}
  const timer=window.setInterval(wake,8000);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake)
  return()=>{++epoch.current;request.current?.abort();window.clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake)}
 },[load])
 async function decide(){
  if(!confirmation||mutation.current||!data?.isHost||data.accountKey!==account)return
  const owner=account,ticket=++epoch.current;request.current?.abort();mutation.current=true;setBusy(true);setError('')
  try{
   const response=await fetch(`${applicationBasePath(meetupId,kind)}/applications`,{method:'PATCH',headers:{'Content-Type':'application/json',...(kind&&owner?{'X-Quantum-Owner':owner}:{})},body:JSON.stringify({applicationId:confirmation.application.id,action:confirmation.action,revision:confirmation.application.revision}),signal:AbortSignal.timeout(12000)})
   if(ticket!==epoch.current||accountRef.current!==owner)return
   setConfirmation(null)
   if(!response.ok){setError('먼저 처리된 신청이거나 방 상태가 바뀌었어요. 최신 상태를 확인해 주세요.');setData(null);return}
   await load(pageCursor.current)
  }catch{if(ticket===epoch.current&&accountRef.current===owner){setConfirmation(null);setData(null);setError('처리 결과를 확인하지 못했어요. 다시 누르기 전에 최신 상태를 확인해 주세요.')}}
  finally{mutation.current=false;setBusy(false)}
 }
 const visible=data?.accountKey===account?data:null
 if(noticesOnly){
  if(!visible)return error?<div className={s.error}>{error}<button onClick={()=>void load(pageCursor.current)}>다시 확인</button></div>:null
  return <RoomApplicationNotices data={visible} kind={kind}/>
 }
 return <section className={s.surface} aria-label="모임 참가 신청 관리">
  <div className={s.heading}><div><span className={s.eyebrow}>TOGETHER, NEXT</span><h2>함께하고 싶은 사람들이에요</h2></div>{visible?.isHost?<span className={s.badge}>대기 {visible.pendingCount}명</span>:null}</div>
  <p className={s.intro}>{visible?.room.title??'이 모임'} · 소개는 방장에게만 보여요.<br/>수락하면 모임 채팅에서 바로 이야기할 수 있어요.</p>
  {error?<div className={s.error} role="alert">{error}<button onClick={()=>void load(pageCursor.current)}><RefreshCw size={14} className="inline"/> 다시 확인</button></div>:null}
  {!visible&&!error?<p className={s.empty} role="status">{account===null?'로그인 후 신청 현황을 볼 수 있어요.':account==='unavailable'?'로그인 연결을 확인해 주세요.':'신청 현황을 확인하고 있어요…'}</p>:null}
  {visible&&!visible.isHost?<p className={s.empty}>참가 신청 검토는 이 방의 방장만 할 수 있어요.</p>:null}
  {visible?.isHost?<ApplicationReviewCards data={visible} busy={busy} confirmation={confirmation} onChoose={(application,action)=>setConfirmation({application,action})} onBack={()=>setConfirmation(null)} onConfirm={()=>void decide()}/>:null}
  {visible&&(visible.hasMore||pageCursor.current)?<div className={s.applications}>{pageCursor.current?<button className={s.secondary} disabled={busy} onClick={()=>{setConfirmation(null);void load()}}>최신 신청 보기</button>:null}{visible.hasMore?<button className={s.secondary} disabled={busy} onClick={()=>{setConfirmation(null);void load(visible.nextCursor!)}}>이전 신청 보기</button>:null}</div>:null}
 </section>
}

export function ApplicationReviewCards({data,busy=false,confirmation=null,onChoose,onBack,onConfirm}:{data:ApplicationManagementView;busy?:boolean;confirmation?:{application:ApplicantView;action:'approve'|'decline'}|null;onChoose:(a:ApplicantView,action:'approve'|'decline')=>void;onBack:()=>void;onConfirm:()=>void}){
 return <div className={s.applications}>{!data.applications.length?<p className={s.empty}>새 신청이 오면 여기에 모아드려요.<br/>방장 알림과 모임 채팅에서도 알려드려요.</p>:data.applications.map(a=><article key={a.id} className={s.applicant}>
  <div className={s.person}><span className={s.avatar}><UserRound size={21}/></span><div><strong>{a.alias}</strong><small>{new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(a.createdAt))} 신청</small></div></div>
  {a.metadata?.role?<span className={s.badge}>{a.metadata.role==='mentor'?'경험을 나눌게요':'도움을 구할게요'}</span>:null}
  <p className={s.quote}>“{a.intro}”</p>{a.strength?<p className={s.strength}><b>함께하면 이런 점이 좋아요</b>{a.strength}</p>:null}
  <p className={s.strength}><ShieldCheck size={15} className="mr-1 inline"/>{a.admission==='pending'&&a.payment==='held'?'참가 보증금 확인됨':a.admission==='accepted'?'참가 승인됨':a.payment==='refund_due'?'참가 종료 · 반환 처리 대기':a.payment==='refunded'?'반환 확인됨':'신청 상태 확인 필요'}</p>
  {a.admission==='pending'&&a.payment==='held'?confirmation?.application.id===a.id?<div className={s.confirm}><p>{confirmation.action==='approve'?'수락하면 이 모임의 기존 대화도 읽을 수 있어요. 함께할까요?':'이 신청을 거절할까요? 보증금은 반환 대상으로 처리되며, 실제 반환 완료와는 달라요.'}</p><div className={s.actions}><button disabled={busy} className={s.secondary} onClick={onBack}>돌아가기</button><button disabled={busy} className={s.primary} onClick={onConfirm}>{busy?'처리 확인 중…':confirmation.action==='approve'?'수락하고 채팅에 초대':'거절 확인'}</button></div></div>:<div className={s.actions}><button disabled={busy} className={s.secondary} onClick={()=>onChoose(a,'decline')}>거절</button><button disabled={busy||data.room.memberCount>=data.room.capacity} className={s.primary} onClick={()=>onChoose(a,'approve')}><Check size={17}/>{data.room.memberCount>=data.room.capacity?'정원이 찼어요':'함께하기'}</button></div>:null}
 </article>)}</div>
}

export function RoomApplicationNotices({data,kind}:{data:ApplicationManagementView;kind?:NativeApplicationKind}){
 return <div aria-label="퀀텀 모집 공지">{latestApplicationNotices(data.notices).map(n=><aside key={n.id} className={s.notice}><Megaphone size={19}/><div><p><b>퀀텀 안내</b> · {n.text}</p><small>{new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(n.createdAt))}</small></div></aside>)}{data.isHost&&data.pendingCount>0?<aside className={s.notice}><MessageCircle size={20}/><div><p>함께하고 싶은 <b>{data.pendingCount}명</b>이 기다리고 있어요.</p><Link href={`${applicationPagePath(data.room.id,kind)}/applications`}>참가 신청 확인<ArrowRight size={15}/></Link></div></aside>:null}</div>
}
