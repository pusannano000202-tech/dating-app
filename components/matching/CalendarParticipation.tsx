'use client'

import { ArrowRight, Check, CheckCircle2, CreditCard, Heart, Loader2, RefreshCw, UserRoundPlus } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseCalendarPreparation, type CalendarEvent, type CalendarPreparationResponse } from '@/lib/matching/event-calendar'
import { isCalendarEventOpen } from '@/lib/matching/calendar-navigation'
import { calendarWeeklyApplicationsPath } from '@/lib/matching/weekly-navigation'
import CalendarReadinessGate, { useCalendarReadiness } from './CalendarReadinessGate'
import s from './match-journey.module.css'

type Friend = {user_id: string; display_name: string | null; status: string}
export default function CalendarParticipation({event,eligible,preview,stale,serverNow,ownerId,onRefresh}: {
  event: CalendarEvent; eligible: boolean; preview: boolean; stale: boolean; serverNow: string; ownerId: string|null; onRefresh: () => Promise<void>
}) {
  const [application,setApplication] = useState<CalendarPreparationResponse|null>(null)
  const [friends,setFriends] = useState<Friend[]>([])
  const [friendsState,setFriendsState] = useState<'loading'|'ready'|'unavailable'>('loading')
  const [friendsRefresh,setFriendsRefresh] = useState(0)
  const [selected,setSelected] = useState('')
  const [consent,setConsent] = useState(false)
  const [loading,setLoading] = useState(!preview)
  const [unavailable,setUnavailable] = useState(false)
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState('')
  const generation = useRef(0)
  const alive = useRef(true)
  const mutation = useRef(false)
  const attempt = useRef<{key:string;identity:string}|null>(null)
  const readController = useRef<AbortController|null>(null)
  const isCouple = event.audience === 'couple'
  const open = isCalendarEventOpen(event,serverNow,stale)
  const readiness = useCalendarReadiness(!isCouple && !preview, ownerId)

  const reload = useCallback(async () => {
    if (preview) return
    readController.current?.abort()
    const controller = new AbortController()
    readController.current = controller
    const timeout = window.setTimeout(()=>controller.abort(),12_000)
    const current = ++generation.current
    try {
      const response = await fetch(`/api/match/calendar/${event.id}/application?audience=${event.audience}`, {cache:'no-store',signal:controller.signal})
      const payload: unknown = await response.json().catch(() => null)
      if (!alive.current || current !== generation.current) return
      if (!response.ok || !payload || typeof payload !== 'object' || !('application' in payload)) throw new Error('load_failed')
      const parsed = payload.application === null ? null : parseCalendarPreparation(payload.application)
      if (payload.application !== null && (!parsed || parsed.eventId !== event.id || parsed.audience !== event.audience)) throw new Error('invalid_application')
      setApplication(parsed)
      setUnavailable(false)
    } catch { if (alive.current && current === generation.current) setUnavailable(true) }
    finally { window.clearTimeout(timeout); if (alive.current && current === generation.current) {setLoading(false);readController.current=null} }
  },[event.audience,event.id,preview])

  useEffect(() => {
    alive.current = true
    void reload()
    const focus = () => { if (document.visibilityState === 'visible' && !mutation.current) void reload() }
    const timer = window.setInterval(focus,30_000)
    window.addEventListener('focus',focus)
    document.addEventListener('visibilitychange',focus)
    return () => { alive.current=false; generation.current+=1; readController.current?.abort(); window.clearInterval(timer); window.removeEventListener('focus',focus); document.removeEventListener('visibilitychange',focus) }
  },[reload])
  useEffect(() => {
    if (!isCouple || preview) return
    const controller = new AbortController()
    const timeout = window.setTimeout(()=>controller.abort(),12_000)
    setFriendsState('loading')
    void fetch('/api/match/couple-parties',{cache:'no-store',signal:controller.signal}).then(async response => response.ok ? response.json() : null).then(payload => {
      if (controller.signal.aborted) return
      if (!Array.isArray(payload?.friends)) throw new Error('friends_unavailable')
      setFriends(payload.friends.filter((friend:unknown):friend is Friend => friend !== null && typeof friend === 'object'
        && 'user_id' in friend && typeof friend.user_id === 'string' && 'status' in friend && friend.status === 'active'
        && 'display_name' in friend && (friend.display_name === null || typeof friend.display_name === 'string')))
      setFriendsState('ready')
    }).catch(() => {if(alive.current)setFriendsState('unavailable')}).finally(()=>window.clearTimeout(timeout))
    return () => {controller.abort();window.clearTimeout(timeout)}
  },[isCouple,preview,friendsRefresh])

  async function run(action:()=>Promise<void>) {
    if (mutation.current) return
    mutation.current=true; setBusy(true); setNotice('')
    try { await action() } catch(error) {
      if(alive.current)setNotice(error instanceof Error && error.message === 'matching_features_not_ready'
        ? calendarError(error.message) : '처리 결과를 확인하지 못했어요. 다시 확인한 뒤 이어가 주세요.')
      if(error instanceof Error && error.message === 'matching_features_not_ready') await readiness.check()
    }
    finally { mutation.current=false; if(alive.current)setBusy(false) }
  }
  async function prepare() {
    if (!eligible || !consent || !open || unavailable || isCouple && !selected && !preview) return
    if (preview) {
      setApplication({audience:event.audience,eventId:event.id,entryId:'92d7b294-e67a-4947-8188-bd363db55ba6',intentId:null,orderId:null,refundState:'unavailable',status:isCouple?'pending_partner':'payment_pending',role:isCouple?'leader':'self',myConsent:true,partnerAccepted:isCouple?false:null,depositAmountKrw:10000,depositPolicyStatus:'not_connected',checkoutEnabled:false,applicationFinalized:false,myDepositState:'unpaid',partnerDepositReady:isCouple?false:null})
      return
    }
    await run(async () => {
      if (!await readiness.check()) return
      const identity = `${event.id}:${selected}`
      if (attempt.current?.identity !== identity) attempt.current={identity,key:crypto.randomUUID()}
      const response = await fetch(`/api/match/calendar/${event.id}/apply`,{method:'POST',headers:{'Content-Type':'application/json',...(ownerId?{'X-Quantum-Owner':ownerId}:{})},body:JSON.stringify({audience:event.audience,...(isCouple?{partnerUserId:selected}:{}),idempotencyKey:attempt.current.key,participationConsent:true})})
      const payload = await response.json().catch(()=>null)
      const parsed = response.ok ? parseCalendarPreparation(payload?.application) : null
      if (!parsed || parsed.eventId !== event.id || parsed.audience !== event.audience) {
        if (payload?.error === 'matching_features_not_ready') await readiness.check()
        setNotice(calendarError(payload?.error)); await reload(); return
      }
      attempt.current=null
      if(alive.current){setApplication(parsed);setConsent(false)}
      await onRefresh()
    })
  }
  async function acceptPartner() {
    if (!application || !consent || preview || unavailable || stale) return
    await run(async () => {
      const response = await fetch('/api/match/couple-parties/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({party_id:application.entryId,partner_consent:true})})
      if(!response.ok){const payload=await response.json().catch(()=>null);setNotice(calendarError(payload?.error))}
      await reload(); await onRefresh()
    })
  }
  async function cancel() {
    if(!application || preview || unavailable || !window.confirm('이 행사 참가 준비를 취소할까요? 결제한 보증금은 별도의 반환 상태로 확인할 수 있어요.'))return
    await run(async()=>{
      const response=await fetch(`/api/match/calendar/${event.id}/application`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({audience:event.audience,entryId:application.entryId})})
      if(!response.ok){const payload=await response.json().catch(()=>null);setNotice(calendarError(payload?.error))}
      await reload();await onRefresh()
    })
  }
  async function pay() {
    if(!application||!application.checkoutEnabled||!application.myConsent||preview||stale||unavailable||!ownerId)return
    await run(async()=>{
      if (!await readiness.check()) return
      const {requestCalendarCheckout}=await import('@/lib/payments/calendar-browser')
      await requestCalendarCheckout({audience:event.audience,eventId:event.id,entryId:application.entryId,ownerId})
      await reload()
    })
  }
  async function requestRefund() {
    if(!application?.orderId||!ownerId||preview||unavailable||!['available','failed'].includes(application.refundState))return
    if(!window.confirm('이 행사에 결제한 보증금 10,000원의 반환을 요청할까요? 원래 결제 수단으로 취소되며, 결과가 확인된 뒤 반환 완료로 표시돼요.'))return
    await run(async()=>{
      const {requestCalendarRefund}=await import('@/lib/payments/calendar-browser')
      await requestCalendarRefund({audience:event.audience,eventId:event.id,orderId:application.orderId!,ownerId})
      await reload();await onRefresh()
    })
  }

  if(loading)return <div className={s.empty} role="status"><Loader2 size={24} className="animate-spin"/>내 신청 상태를 확인하고 있어요.</div>
  const legacy = application?.status === 'awaiting_consents' || application?.status === 'assigned'
  const ended = application && ['cancelled','expired','completed'].includes(application.status)
  const partnerPending = application?.status === 'pending_partner'
  const myPaid = application?.myDepositState === 'held'
  return <section>
    <div className={s.stepHeading}><span className={s.eyebrow}>{preview?'검수용 예시 · ':''}{event.title}</span><h2>{!application ? isCouple ? '연인과 함께 준비해요' : '이날 함께할까요?' : ended ? '신청 상태를 확인해요' : application.applicationFinalized ? '참가 신청이 완료됐어요' : partnerPending ? '연인의 확인을 기다려요' : myPaid ? '내 보증금은 확인됐어요' : '보증금을 확인해 주세요'}</h2></div>
    {unavailable ? <div className={s.notice} role="status">신청 상태를 확인하지 못했어요. 이전 상태로 중복 신청하지 않도록 다시 확인해 주세요.<button className={s.quietButton} onClick={()=>void reload()}><RefreshCw size={15}/>다시 확인</button></div> : null}
    {!isCouple&&!preview&&!ended&&!legacy&&!application?.applicationFinalized&&!myPaid ? <CalendarReadinessGate value={readiness.value} onRetry={readiness.check}/> : null}
    {!application ? <>
      {!eligible ? <p className={s.notice}>내 연애 상태에 맞는 행사인지 확인해 주세요. <Link href="/profile/relationship" className={s.quietButton}>내 연애 상태 확인하기</Link></p> : null}
      {isCouple ? <div className={s.facts}><div className={s.fact}><Heart size={20}/><span>내 연인과 다른 커플이 함께하는 2대2<small>상대도 직접 수락해야 둘의 참가 준비가 완료돼요.</small></span></div>
        {preview ? <div className={s.notice}>예시 파트너 · 실제 친구에게 초대가 전송되지 않아요.</div> : friendsState==='loading' ? <p role="status" className={s.notice}>친구 목록을 불러오고 있어요.</p> : friendsState==='unavailable' ? <div className={s.notice}>친구 목록을 확인하지 못했어요.<button className={s.quietButton} onClick={()=>setFriendsRefresh(value=>value+1)}>다시 불러오기</button></div> : friends.length ? <label className={s.field}>함께 갈 연인<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">친구 목록에서 선택</option>{friends.map(friend=><option key={friend.user_id} value={friend.user_id}>{friend.display_name||'내 친구'}</option>)}</select></label> : <Link href="/friends" className={`${s.button} ${s.secondary}`}><UserRoundPlus size={18}/>연인과 친구 연결하기</Link>}
      </div> : null}
      <div className={s.facts}><div className={s.fact}><CreditCard size={20}/><span>내 보증금 10,000원<small>이 행사에 대한 본인 결제만 인정돼요. 다른 모임의 보증금과 구분합니다.</small></span></div></div>
      <label className={s.consent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>선택한 날짜·장소와 각자 보증금 10,000원을 확인했어요.{isCouple?' 연인에게 이 행사 초대를 보내는 데 동의해요.':''}</span></label>
      <button className={s.button} disabled={!eligible||!consent||!open||unavailable||busy||readiness.value.status!=='ready'||isCouple&&!selected&&!preview} onClick={()=>void prepare()}>{busy?<Loader2 size={18} className="animate-spin"/>:null}{isCouple?'연인에게 행사 초대 보내기':'보증금 단계로'}<ArrowRight size={18}/></button>
      <p className={s.notice}>이 단계만으로 결제되거나 최종 참가 신청이 완료되지는 않아요.</p>
    </> : <>
      <div className={s.facts}>
        <div className={s.fact}><CheckCircle2 size={20}/><span>참가 확인<small>{application.myConsent?'내 의사 확인 완료':'내 의사 확인 필요'}{isCouple?application.partnerAccepted?' · 연인 수락 완료':' · 연인 수락 대기':''}</small></span></div>
        <div className={s.fact}><CreditCard size={20}/><span>내 보증금 10,000원<small>{depositLabel(application.myDepositState)}{isCouple?application.partnerDepositReady?' · 연인 보증금 확인 완료':' · 연인 보증금 미확인':''}</small></span></div>
      </div>
      {partnerPending&&application.role==='partner' ? <><label className={s.consent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>이 행사에 연인과 함께 참가하고, 내 보증금을 별도로 준비하는 데 동의해요.</span></label><button className={s.button} disabled={!consent||busy||stale||unavailable||preview} onClick={()=>void acceptPartner()}><Check size={18}/>초대 수락하고 이어가기</button></> : null}
      {partnerPending&&application.role==='leader' ? <p className={s.notice}>연인이 직접 수락하면 각자의 보증금 단계로 이어져요. 아직 두 사람의 참가 신청은 완료되지 않았어요.</p> : null}
      {preview&&partnerPending ? <button className={`${s.button} ${s.secondary}`} onClick={()=>setApplication({...application,status:'payment_pending',partnerAccepted:true})}>예시: 연인이 수락한 다음 보기 <ArrowRight size={17}/></button> : null}
      {!ended&&!partnerPending&&!application.applicationFinalized ? <>
        {!myPaid ? <button className={s.button} onClick={()=>void pay()} disabled={preview||!application.checkoutEnabled||busy||stale||unavailable||!ownerId||readiness.value.status!=='ready'}><CreditCard size={18}/>{preview?'예시 결제 단계 · 실제 결제 안 됨':application.checkoutEnabled?'내 보증금 10,000원 결제하기':'보증금 결제 연결 확인 중'}</button> : <p className={s.notice}>{isCouple?'두 사람의 준비가 모두 확인되면':'참가 처리가 확인되면'} 신청 상태가 갱신돼요. 같은 보증금을 다시 결제하지 마세요.</p>}
        {!application.checkoutEnabled&&!preview ? <p className={s.notice}>현재 이 행사의 결제 연결이 준비되지 않아 돈을 받지 않아요. 참가 신청 완료로 처리하지 않습니다.</p> : null}
      </> : null}
      {application.applicationFinalized ? <p className={s.notice}>{application.status==='matched'?'함께 만날 커플팀이 정해졌어요. 안내되는 날짜와 장소를 확인해 주세요.':'신청은 접수됐어요. 팀 확정 여부는 별도로 확인해 주세요.'}</p> : null}
      {['available','failed'].includes(application.refundState) ? <button className={`${s.button} ${s.secondary}`} onClick={()=>void requestRefund()} disabled={busy||preview||unavailable||!ownerId||!application.orderId}>보증금 10,000원 반환 요청</button> : null}
      {['requested','processing'].includes(application.refundState) ? <p className={s.notice} role="status">반환 요청이 접수됐어요. 원결제 취소 결과를 확인 중이며 아직 반환 완료가 아니에요.</p> : null}
      {application.refundState==='completed' ? <p className={s.notice} role="status">원결제 취소가 확인됐어요. 실제 입금·한도 복원 시점은 결제 수단에 따라 달라질 수 있어요.</p> : null}
      {legacy ? <Link href={calendarWeeklyApplicationsPath(event)} className={`${s.button} ${s.secondary}`}>기존 신청의 친구 동의·확정 일정 확인</Link> : null}
      {!ended&&!legacy ? <button className={s.quietButton} disabled={busy||preview||unavailable} onClick={()=>void cancel()}>참가 준비 취소</button> : null}
      <div><Link href="/profile/deposits" className={s.quietButton}>내 보증금 내역 확인 <ArrowRight size={15}/></Link></div>
    </>}
    {notice?<p className={s.notice} role="status">{notice}</p>:null}
  </section>
}

function depositLabel(state:CalendarPreparationResponse['myDepositState']) {
  return {unavailable:'아직 결제 연결이 확인되지 않았어요',unpaid:'미납부',held:'납부 확인',refund_due:'반환 대상',refund_pending:'반환 처리 중',refunded:'반환 완료'}[state]
}
function calendarError(error:unknown) {
  if(error==='matching_features_not_ready')return '프로필과 내부 매칭 준비가 필요해요. 준비를 마친 뒤 이 행사에서 이어가 주세요.'
  if(error==='calendar_payment_unavailable')return '이 행사의 보증금 연결이 준비되지 않았어요. 결제나 신청 완료로 처리하지 않았습니다.'
  if(typeof error==='string'&&/closed|deadline|unavailable_event/.test(error))return '모집이 마감됐거나 행사 상태가 바뀌었어요. 최신 일정을 다시 확인해 주세요.'
  if(typeof error==='string'&&/relationship|consent/.test(error))return '참가 자격과 두 사람의 동의 상태를 다시 확인해 주세요.'
  return '처리를 완료하지 못했어요. 최신 신청 상태를 다시 확인해 주세요.'
}
