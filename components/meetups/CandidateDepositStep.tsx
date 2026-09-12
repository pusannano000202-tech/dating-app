'use client'

import {useCallback} from 'react'
import {ArrowLeft,ArrowRight,Check,LockKeyhole,ShieldCheck} from 'lucide-react'
import {parseCandidateDepositContext,type CandidateDepositContext} from '@/lib/meetups/candidate-deposit-contract'
import type {CandidateScope} from '@/lib/meetups/candidate-board-contract'
import {positionLabel} from '@/lib/meetups/candidate-board-view'
import {useHostedResource} from './useHostedResource'
import s from './candidate-board.module.css'

type StepProps={scope:CandidateScope;demo?:boolean;context?:CandidateDepositContext|null;loading?:boolean;error?:string;busy?:boolean;consent?:boolean;onConsent?:(value:boolean)=>void;onPublish?:()=>void;onFailure?:()=>void;onRefresh?:()=>void;onBack:()=>void;onCancel:()=>void}

/** Financial preparation is separate from publication. There is no live payment adapter here. */
export function CandidateDepositStep({scope,demo=false,context=null,loading=false,error='',busy=false,consent=false,onConsent,onPublish,onFailure,onRefresh,onBack,onCancel}:StepProps){
 const activity=scope.kind==='league'?positionLabel(scope.key):scope.kind==='study'?'전공 스터디':scope.kind==='mentoring'?'우리 과 멘토링':'모임'
 return <section className={s.depositStep} aria-label="등록 전 보증금 확인">
  <button type="button" className={s.depositBack} onClick={onBack} disabled={busy}><ArrowLeft size={16}/>소개 수정</button>
  <div className={s.depositProgress} aria-label="대기 등록 2단계 중 2단계"><span><Check size={13}/>소개</span><i/><strong>2 보증금</strong></div>
  <div className={s.depositTitle}><span className={s.depositIcon}><ShieldCheck size={30}/></span><h1>함께할 준비,<br/>보증금부터 확인해요.</h1><p>납부 확인 후 내 카드가 공개돼요.<br/>아직 팀에 합류하는 단계는 아니에요.</p></div>
  <div className={s.depositReceipt}>
   <div><span>등록할 활동</span><strong>{activity} 합류 대기</strong></div>
   <div><span>등록 전 보증금</span><strong className={s.depositAmount}>{demo?'10,000원':loading?'확인 중':'연결 준비 중'}</strong></div>
   <p><LockKeyhole size={14}/>{demo?'예시 금액 · 실제 결제는 발생하지 않아요':'운영 금액·정책은 서버 확인 후 표시해요'}</p>
  </div>
  <ol className={s.depositSteps}><li><span>1</span><div><strong>보증금 확인 후 공개</strong><p>실패하거나 취소하면 글이 올라가지 않아요.</p></div></li><li><span>2</span><div><strong>팀 합류까지 한 번만</strong><p>같은 돈을 다시 내지 않도록 연결하는 흐름이에요.</p></div></li></ol>
  {demo?<>
   <label className={s.consent}><input type="checkbox" checked={consent} onChange={e=>onConsent?.(e.target.checked)} disabled={busy}/><span>가상 보증금 납부 후 대기 글이 공개되는 체험임을 확인했어요.</span></label>
   <button type="button" className={s.primary} disabled={busy||!consent||!onPublish} onClick={()=>{if(!busy&&consent)onPublish?.()}}>예시 보증금 납부하고 등록하기<ArrowRight size={18}/></button>
   <button type="button" className={s.textButton} disabled={busy} onClick={onFailure}>예시 결제 실패 흐름 보기</button>
  </>:<div className={s.depositUnavailable} role="status"><strong>{loading?'보증금 정보를 확인하고 있어요':context?'등록 전 결제 연결을 준비하고 있어요':'보증금 정보를 확인하지 못했어요'}</strong><p>{context?'지금은 결제하거나 글을 공개할 수 없어요. 납부와 팀 귀속이 연결되기 전에는 돈을 받지 않아요.':'납부 가능 여부를 확인하기 전에는 결제·공개하지 않아요.'}</p><button type="button" className={s.secondary} onClick={onRefresh} disabled={loading}>연결 다시 확인하기</button></div>}
  {error&&<p className={s.alert} role="alert">{demo?error:'연결 상태를 확인하지 못했어요. 입력한 소개는 이 화면에 유지돼요.'}</p>}
  <button type="button" className={s.textButton} onClick={onCancel} disabled={busy}>등록하지 않고 돌아가기</button>
  <p className={s.small}>대기를 취소해도 자동 반환되지 않아요.<br/>보증금 반환 신청을 하면 반환을 진행해요.<br/>{demo?'로컬 예시이며 실제 납부·반환은 발생하지 않아요.':'실제 반환 신청·결제 연결은 준비 중입니다.'}</p>
 </section>
}

export function LiveCandidateDepositStep({scope,ownerId,onBack,onCancel}:{scope:CandidateScope;ownerId:string;onBack:()=>void;onCancel:()=>void}){
 const parse=useCallback((payload:unknown,owner:string)=>{
  const value=parseCandidateDepositContext((payload as {data?:unknown}|null)?.data)
  return value&&value.owner_id===owner&&owner===ownerId&&value.scope.kind===scope.kind&&value.scope.key===scope.key?value:null
 },[ownerId,scope.kind,scope.key])
 const resource=useHostedResource(`/api/meetups/candidates/deposit?${new URLSearchParams({scope_kind:scope.kind,scope_key:scope.key})}`,parse)
 return <CandidateDepositStep scope={scope} context={resource.data} loading={resource.loading} error={resource.error} onRefresh={()=>{void resource.load()}} onBack={onBack} onCancel={onCancel}/>
}
