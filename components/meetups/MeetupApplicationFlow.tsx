'use client'

import Image from 'next/image'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, CreditCard, Loader2, MapPin, MessageCircle, ShieldCheck, Wallet } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { parseAdmissionDepositQuote, validateAdmissionApplication, type AdmissionApplicationInput, type AdmissionDepositQuote, type AdmissionPaymentMethod, type AdmissionPaymentState, type AdmissionRoomTarget, type AdmissionState } from '@/lib/meetups/admission-contract'
import styles from './meetup-application.module.css'

export type MeetupApplicationResult = Readonly<{
  applicationId: string | null
  admission: AdmissionState
  payment: AdmissionPaymentState
  chatHref?: string | null
}>
export type MeetupApplicationFlowProps = {
  room: AdmissionRoomTarget
  meetup: { title: string; activityLabel: string; imageSrc: string; imageAlt?: string; summary?: string; scheduleLabel?: string; locationLabel?: string }
  accountKey: string | null
  quote: AdmissionDepositQuote | null
  policy: { summary: string; conditions: readonly string[]; href?: string } | null
  carryover?: { eligible: boolean; availableKrw: number | null }
  onSubmit?: (input: AdmissionApplicationInput, options: { signal: AbortSignal }) => Promise<MeetupApplicationResult>
  onRefreshStatus?: (options: { signal: AbortSignal }) => Promise<MeetupApplicationResult>
  onCancel: () => void
  onOpenChat?: (result: MeetupApplicationResult) => void
  application?: MeetupApplicationResult | null
}

const paymentLabels: Record<AdmissionPaymentState, string> = {
  unconfigured: '납부 준비 전', unpaid: '미납', pending: '결제 확인 중', held: '보증금 납부 확인',
  refund_pending: '반환 처리 중', refunded: '반환 확인', failed: '결제 실패', reconciliation_required: '결제 상태 재확인 필요',
}
const admissionLabels: Record<AdmissionState, string> = {
  draft: '접수 전', submitted: '접수 확인 · 개설자 승인 대기', accepted: '개설자 승인 확인', declined: '개설자 미승인', withdrawn: '신청 철회', expired: '신청 만료',
}
function confirmedResult(value: unknown): value is MeetupApplicationResult {
  if (!value || typeof value !== 'object') return false
  const result = value as MeetupApplicationResult
  return Object.hasOwn(paymentLabels, result.payment) && Object.hasOwn(admissionLabels, result.admission)
    && (result.applicationId === null ? result.admission === 'draft' : typeof result.applicationId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.applicationId))
}
function errorCopy(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (/intro_required|intro_too_long|invalid_intro|invalid_strength/.test(code)) return '소개는 한 줄로 80자, 장점은 120자 이내로 입력해 주세요. 보이지 않는 제어문자는 사용할 수 없어요.'
  if (/payment_cancelled|payment_canceled/.test(code)) return '결제를 취소했어요. 작성한 소개는 그대로예요.'
  if (/insufficient|balance/.test(code)) return '이월 가능한 보증금 잔액이 부족해요. 새 결제를 선택해 주세요.'
  if (/carryover|payment_method/.test(code)) return '이 모임에는 보증금을 이월할 수 없어요. 새 결제를 선택해 주세요.'
  if (/quote_expired|policy_changed|quote_mismatch/.test(code)) return '보증금 조건이 바뀌었거나 만료됐어요. 최신 조건을 다시 확인해 주세요.'
  if (/unconfigured|unavailable|quote_invalid/.test(code)) return '아직 보증금 납부를 준비 중이에요. 현재는 결제·신청할 수 없어요.'
  if (/unauthenticated|not_authenticated|auth_required/.test(code)) return '로그인 상태를 다시 확인해 주세요. 신청은 접수되지 않았어요.'
  return '처리 결과를 확인하지 못했어요. 작성한 내용은 유지했으며, 결제·신청 상태를 다시 확인해 주세요.'
}

/** Parent supplies authenticated quotes and real API callbacks. No demo or payment authority lives here. */
export default function MeetupApplicationFlow({ room, meetup, accountKey, quote: rawQuote, policy, carryover, onSubmit, onRefreshStatus, onCancel, onOpenChat, application }: MeetupApplicationFlowProps) {
  const identityKey = JSON.stringify([accountKey, room.kind, room.id])
  const [draftOwner, setDraftOwner] = useState(identityKey)
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [intro, setIntro] = useState('')
  const [strength, setStrength] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<AdmissionPaymentMethod>('new')
  const [policyRead, setPolicyRead] = useState(false)
  const [consent, setConsent] = useState(false)
  const [result, setResult] = useState<MeetupApplicationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const introInput = useRef<HTMLTextAreaElement>(null)
  const request = useRef<{ controller: AbortController; key: string } | null>(null)
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null)
  const applicationBinding = useRef({ value: application, owner: identityKey })
  if (applicationBinding.current.value !== application) applicationBinding.current = { value: application, owner: identityKey }
  const ids = useId()
  const quote = parseAdmissionDepositQuote(rawQuote)
  const quoteKey = JSON.stringify([room.kind, room.id, quote?.id, quote?.policyVersion, quote?.amountKrw, quote?.expiresAt, quote?.paymentMethods, policy])
  const contextKey = JSON.stringify([accountKey, quoteKey])
  const currentContext = useRef(contextKey)
  currentContext.current = contextKey
  const quoteMatches = Boolean(quote && quote.room.kind === room.kind && quote.room.id === room.id && Date.parse(quote.expiresAt) > Date.now() && !expired)
  const policyReady = Boolean(policy?.summary.trim() && policy.conditions.length && policy.conditions.every(condition => condition.trim()))
  const amount = quote ? `${quote.amountKrw.toLocaleString('ko-KR')}원` : '확인 필요'
  const balance = carryover?.availableKrw
  const carryoverAllowed = Boolean(quoteMatches && quote?.paymentMethods.includes('carryover') && carryover?.eligible && typeof balance === 'number' && Number.isSafeInteger(balance) && balance >= quote.amountKrw)
  const methodAllowed = paymentMethod === 'new' ? Boolean(quoteMatches && quote?.paymentMethods.includes('new')) : carryoverAllowed
  const hiddenControls = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/
  const introValid = intro.trim().length > 0 && [...intro].length <= 80 && [...strength].length <= 120 && !hiddenControls.test(intro) && !hiddenControls.test(strength.replace(/\n/g, ''))
  const canSubmit = Boolean(accountKey && onSubmit && introValid && quoteMatches && policyReady && methodAllowed && policyRead && consent && !busy)
  const accepted = result?.admission === 'accepted' && result.payment === 'held'
  const submitted = result?.admission === 'submitted' && result.payment === 'held'
  const recoverable = result?.admission === 'draft' && ['failed', 'unpaid', 'unconfigured'].includes(result.payment)
  const statusHeading = uncertain || result?.payment === 'reconciliation_required' ? '처리 상태를 다시 확인해요'
    : result?.admission === 'declined' ? '이번 신청은 승인되지 않았어요'
      : result?.admission === 'withdrawn' ? '신청을 철회했어요'
        : result?.admission === 'expired' ? '신청 기간이 지났어요'
          : accepted ? '함께할 준비가 됐어요' : submitted ? '신청을 보냈어요'
            : result?.payment === 'unpaid' ? '결제 준비 상태예요'
              : result?.payment === 'unconfigured' ? '아직 신청할 수 없어요'
                : result?.payment === 'held' ? '신청 접수를 확인하고 있어요'
                  : result?.payment === 'failed' ? '결제가 완료되지 않았어요'
                    : ['refund_pending', 'refunded'].includes(result?.payment ?? '') ? '보증금 반환 상태예요' : '결제 확인 중이에요'

  useEffect(() => {
    request.current?.controller.abort(); request.current = null
    attempt.current = null; setBusy(false); setIntro(''); setStrength(''); setStep(0); setResult(null); setError(null); setUncertain(false); setDraftOwner(identityKey)
    setPaymentMethod('new'); setConsent(false); setPolicyRead(false)
  }, [accountKey, room.kind, room.id])
  useEffect(() => {
    const interrupted = request.current !== null
    request.current?.controller.abort(); request.current = null; attempt.current = null
    setBusy(false); setConsent(false); setPolicyRead(false); setPaymentMethod('new')
    if (interrupted) { setUncertain(true); setResult(null); setStep(2); setError('보증금 조건이 변경되어 이전 결과를 화면에 적용하지 않았어요. 결제 상태를 먼저 확인해 주세요.') }
    setExpired(Boolean(quote && Date.parse(quote.expiresAt) <= Date.now()))
    if (!quote) return
    const delay = Date.parse(quote.expiresAt) - Date.now()
    if (delay > 0 && delay <= 2147483647) { const timer = setTimeout(() => { setExpired(true); setConsent(false) }, delay); return () => clearTimeout(timer) }
  // quoteKey includes every displayed policy and amount field; a changed quote requires fresh consent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey])
  useEffect(() => {
    if (application && accountKey && applicationBinding.current.owner === identityKey && confirmedResult(application)) { setResult(application); setUncertain(false); setStep(2) }
  }, [application, accountKey, identityKey])
  useEffect(() => { heading.current?.focus() }, [step])
  useEffect(() => () => { request.current?.controller.abort(); request.current = null }, [])

  async function perform(refresh = false) {
    if (request.current || !accountKey) return
    if (!refresh && !canSubmit) return
    if (refresh && !onRefreshStatus) return
    let input: AdmissionApplicationInput | undefined
    if (!refresh) {
      const fingerprint = JSON.stringify([contextKey, intro, strength, paymentMethod])
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() }
      const validated = validateAdmissionApplication({ intro, strength, paymentMethod, consent, policyVersion: quote?.policyVersion, quoteId: quote?.id, idempotencyKey: attempt.current!.id }, { room, quote, nowMs: Date.now() })
      if (!validated.ok) { setError(errorCopy(new Error(validated.error))); return }
      input = validated.value
    }
    const active = { controller: new AbortController(), key: contextKey }
    request.current = active; setBusy(true); setError(null)
    try {
      const next = refresh ? await onRefreshStatus!({ signal: active.controller.signal }) : await onSubmit!(input!, { signal: active.controller.signal })
      if (active.controller.signal.aborted || request.current !== active || currentContext.current !== active.key) return
      if (!confirmedResult(next)) throw new Error('invalid_application_response')
      setResult(next); setUncertain(false); setStep(2)
    } catch (cause) {
      if (active.controller.signal.aborted || request.current !== active || currentContext.current !== active.key) return
      setError(errorCopy(cause))
      const code = cause instanceof Error ? cause.message : ''
      if (!/payment_cancelled|payment_canceled|insufficient|balance|carryover|payment_method|quote_expired|policy_changed|quote_mismatch|unconfigured|unavailable|quote_invalid|unauthenticated|not_authenticated|auth_required/.test(code)) {
        setUncertain(true); setResult(null); setStep(2)
      }
    } finally {
      if (request.current === active) { request.current = null; setBusy(false) }
    }
  }
  function back() {
    if (busy) return
    if (step === 0 || step === 2 && !recoverable) onCancel()
    else { setStep(step === 2 ? 1 : 0); setError(null) }
  }
  function stopWaiting() {
    request.current?.controller.abort(); request.current = null; setBusy(false)
    setError('결과 확인을 중단했어요. 결제가 취소된 것은 아니에요. 다시 결제하기 전에 상태를 확인해 주세요.')
    setUncertain(true); setResult(null); setStep(2)
  }

  if (draftOwner !== identityKey) return <main className={styles.page} aria-label="모임 참가 신청"><p role="status">현재 계정의 신청 화면을 준비하고 있어요.</p></main>

  return <main className={styles.page} aria-label="모임 참가 신청">
    <div className={styles.shell}>
      <header className={styles.topbar}><button type="button" className={styles.iconButton} onClick={back} disabled={busy} aria-label={step === 0 ? '신청 화면 닫기' : '이전 단계'}><ArrowLeft size={22} /></button><span>모임 신청</span><span className={styles.stepCount}>{step + 1}<span> / 3</span></span></header>
      <ol className={styles.progress} aria-label="참가 신청 단계">{['모임 확인', '보증금', '접수 확인'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-complete={step > index}><span className={styles.srOnly}>{label}</span></li>)}</ol>

      {step === 0 ? <section className={styles.stage} aria-labelledby={`${ids}-heading`}>
        <div className={styles.hero}><Image src={meetup.imageSrc} alt={meetup.imageAlt ?? `${meetup.activityLabel} 활동 분위기 예시`} fill priority sizes="(max-width: 520px) 100vw, 460px" /><span className={styles.photoBadge}>{meetup.activityLabel}</span></div>
        <div className={styles.introHeading}><p className={styles.eyebrow}>함께할 준비, 됐나요?</p><h1 id={`${ids}-heading`} ref={heading} tabIndex={-1}>{meetup.title}</h1>{meetup.summary ? <p className={styles.description}>{meetup.summary}</p> : null}</div>
        {meetup.scheduleLabel || meetup.locationLabel ? <div className={styles.meta}>{meetup.scheduleLabel ? <span><Clock3 size={15} />{meetup.scheduleLabel}</span> : null}{meetup.locationLabel ? <span><MapPin size={15} />{meetup.locationLabel}</span> : null}</div> : null}
        <div className={styles.introForm}><div className={styles.labelRow}><label htmlFor={`${ids}-intro`}>나를 한 줄로 소개해요 <span>필수</span></label><span id={`${ids}-intro-count`}>{[...intro].length}/80</span></div><textarea id={`${ids}-intro`} ref={introInput} name="intro" value={intro} rows={2} aria-describedby={`${ids}-intro-count ${ids}-privacy`} placeholder="함께하고 싶은 이유를 가볍게 알려주세요." onChange={event => { if ([...event.target.value].length <= 80) setIntro(event.target.value) }} />
          <details className={styles.strength}><summary>나의 장점도 알려줄까요? <span>선택</span><ChevronDown size={17} /></summary><label className={styles.srOnly} htmlFor={`${ids}-strength`}>나의 장점 · 최대 120자</label><textarea id={`${ids}-strength`} name="strength" value={strength} rows={2} placeholder="예: 어려운 문제도 끝까지 같이 풀어요." onChange={event => { if ([...event.target.value].length <= 120) setStrength(event.target.value) }} /><p>{[...strength].length}/120</p></details><p id={`${ids}-privacy`} className={styles.privacy}>소개는 신청 검토용이에요. 연락처는 쓰지 않아도 돼요.</p>
        </div>
      </section> : step === 1 ? <section className={styles.stage} aria-labelledby={`${ids}-heading`}>
        <div className={styles.depositHeading}><p className={styles.eyebrow}>서로의 시간을 소중히</p><h1 id={`${ids}-heading`} ref={heading} tabIndex={-1}>보증금을 확인해요</h1><p className={styles.description}>납부 확인 후 신청을 접수해요.<br />참가 확정은 개설자 승인 다음이에요.</p></div>
        <div className={styles.amountCard}><div><span>{meetup.activityLabel} · 참가 보증금</span><strong className={!quote ? styles.unknownAmount : undefined}>{amount}</strong><small>{meetup.title}</small></div><div className={styles.depositPhoto}><Image src={meetup.imageSrc} alt="" fill sizes="88px" /></div></div>
        {!quoteMatches || !policyReady || !onSubmit ? <p className={styles.notice} role="status">{expired ? '보증금 확인 시간이 지났어요. 최신 조건을 다시 불러와 주세요.' : '보증금 금액·정책과 납부 연결을 준비 중이에요. 지금은 결제·신청할 수 없어요.'}</p> : null}
        <fieldset className={styles.methods} disabled={busy}><legend>어떻게 납부할까요?</legend><label data-selected={paymentMethod === 'new'}><input type="radio" name="paymentMethod" value="new" checked={paymentMethod === 'new'} disabled={!quoteMatches || !quote?.paymentMethods.includes('new')} onChange={() => setPaymentMethod('new')} /><CreditCard size={22} /><span><strong>새로 결제</strong><small>확인된 보증금을 납부해요</small></span></label><label data-selected={paymentMethod === 'carryover'} data-disabled={!carryoverAllowed}><input type="radio" name="paymentMethod" value="carryover" checked={paymentMethod === 'carryover'} disabled={!carryoverAllowed} onChange={() => { if (carryoverAllowed) setPaymentMethod('carryover') }} /><Wallet size={22} /><span><strong>반환 가능한 보증금 이월</strong><small>{carryoverAllowed ? `사용 가능 ${balance!.toLocaleString('ko-KR')}원` : typeof balance === 'number' && quote && balance < quote.amountKrw ? '이월할 수 있는 잔액이 부족해요' : '현재 이 모임에 이월할 수 없어요'}</small></span></label></fieldset>
        <details className={styles.policy} key={quoteKey} onToggle={event => { if (event.currentTarget.open && policyReady) setPolicyRead(true) }}><summary><ShieldCheck size={19} /><span>반환·취소 조건 읽기</span><ChevronDown size={18} /></summary>{policyReady && policy ? <div><p>{policy.summary}</p><ul>{policy.conditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul>{policy.href && /^https:\/\//.test(policy.href) ? <a href={policy.href} target="_blank" rel="noreferrer">정책 전문 열기 ↗</a> : null}<small>적용 정책: {quote?.policyVersion ?? '확인 전'}</small></div> : <p>확정된 정책이 아직 준비되지 않았어요.</p>}</details>
        <label className={styles.consent}><input type="checkbox" name="consent" checked={consent} disabled={!policyRead || !policyReady || !quoteMatches || busy} onChange={event => setConsent(event.target.checked)} /><span>보증금 금액과 반환·취소 조건을<br />읽었으며 동의해요. <strong>필수</strong></span></label>
      </section> : <section className={`${styles.stage} ${styles.receipt}`} aria-labelledby={`${ids}-heading`}>
        <div className={styles.receiptPhoto}><Image src={meetup.imageSrc} alt={meetup.imageAlt ?? `${meetup.activityLabel} 활동 분위기 예시`} fill sizes="(max-width: 520px) 100vw, 460px" /><span>{accepted || submitted ? <Check size={26} /> : <Clock3 size={26} />}</span></div>
        <p className={styles.eyebrow}>{meetup.activityLabel} · {meetup.title}</p><h1 id={`${ids}-heading`} ref={heading} tabIndex={-1}>{statusHeading}</h1>
        <p className={styles.description}>{accepted ? '개설자가 참가를 승인했어요.\n채팅방에서 첫인사를 나눠보세요.' : submitted ? '개설자의 승인을 기다리고 있어요.\n승인 후 채팅방에 들어갈 수 있어요.' : '화면 이동이나 결제 준비만으로 완료되지 않아요.\n아래에서 실제 확인된 상태를 확인해 주세요.'}</p>
        <dl className={styles.statusList}><div><dt>보증금</dt><dd data-confirmed={result?.payment === 'held'}>{uncertain ? '납부 여부 확인 필요' : result ? paymentLabels[result.payment] : '확인 전'}</dd></div><div><dt>참가 신청</dt><dd data-confirmed={result?.admission === 'accepted'}>{uncertain ? '접수 여부 확인 필요' : result ? admissionLabels[result.admission] : '접수 전'}</dd></div></dl>
        {uncertain || result?.payment === 'reconciliation_required' ? <p className={styles.notice}>중복 결제를 막기 위해 상태를 먼저 확인해 주세요. 확인 전에는 다시 신청하지 않아요.</p> : null}
      </section>}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions} aria-busy={busy}>
        {step === 0 ? <><p>다음 단계에서 보증금과 반환 조건을 확인해요.</p><button type="button" className={styles.primary} disabled={!introValid} onClick={() => { setStep(1); setError(null) }}>보증금 확인하기<ArrowRight size={19} /></button></> : step === 1 ? <><p>{busy ? '확인 요청 중 · 아직 결제·신청 완료가 아니에요.' : !policyRead ? '반환·취소 조건을 먼저 열어 확인해 주세요.' : '납부 확인 → 신청 접수 → 개설자 승인'}</p><div className={styles.actionRow}><button type="button" className={styles.previous} onClick={back} disabled={busy}>이전</button><button type="button" className={styles.primary} disabled={!canSubmit} onClick={() => void perform()}>{busy ? <><Loader2 size={20} className={styles.spin} />확인 요청 중</> : <>{paymentMethod === 'carryover' ? '동의하고 이월·신청' : '동의하고 결제·신청'}<ArrowRight size={18} /></>}</button></div>{busy ? <button type="button" className={styles.quietButton} onClick={stopWaiting}>결과 확인 중단</button> : null}</> : <>{accepted ? <button type="button" className={styles.primary} disabled={!onOpenChat || busy} onClick={() => { if (result && accepted) onOpenChat?.(result) }}>채팅방 들어가기<MessageCircle size={19} /></button> : onRefreshStatus ? <button type="button" className={styles.primary} disabled={busy} onClick={() => void perform(true)}>{busy ? <Loader2 size={20} className={styles.spin} /> : null}상태 다시 확인</button> : <button type="button" className={styles.primary} onClick={onCancel}>모임으로 돌아가기<ArrowRight size={19} /></button>}{recoverable ? <button type="button" className={styles.quietButton} onClick={() => { setStep(1); setError(null) }}>입력한 내용으로 돌아가기</button> : null}{accepted || onRefreshStatus ? <button type="button" className={styles.quietButton} onClick={onCancel} disabled={busy}>모임으로 돌아가기</button> : null}</>}
        <span className={styles.srOnly} role="status" aria-live="polite">{busy ? '서버 응답을 기다리고 있어요.' : result ? `${paymentLabels[result.payment]}. ${admissionLabels[result.admission]}.` : ''}</span>
      </div>
    </div>
  </main>
}
