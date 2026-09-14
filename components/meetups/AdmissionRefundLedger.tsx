'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleDollarSign, Clock3, RefreshCw, ShieldCheck } from 'lucide-react'
import { useHistoryAccount } from '@/components/content-history/useHistoryAccount'
import { parseAdmissionRefundSummary, refundUuid, type AdmissionRefundSummary } from '@/lib/meetups/admission-refund'

type Action = 'request' | 'approve' | 'retry'
type Notice = { owner: string; message: string; code?: string }
type Selection = { owner: string; item: AdmissionRefundSummary; action: Action }
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A45539] disabled:cursor-not-allowed disabled:opacity-45'
const primary = `${button} bg-[#A45539] text-white hover:bg-[#8C432C]`
const secondary = `${button} border border-[#E3D9CB] bg-white text-[#705B4B] hover:bg-[#FAF5ED]`
const titleByKind = { custom_meetup: '모임', study: '스터디', mentoring: '멘토링' }
const stateCopy = {
  unavailable: { label: '보관 중', description: '현재 참여 중인 모임의 보증금이에요. 반환 대상이 되면 이곳에서 신청할 수 있어요.' },
  available: { label: '반환 신청 가능', description: '반환 대상 보증금이에요. 본인이 신청하면 운영자가 내역을 확인해요.' },
  requested: { label: '운영자 검토 대기', description: '반환 신청을 접수했어요. 운영자가 확인한 뒤 처리해요.' },
  approved: { label: '승인 · 반환 대기', description: '운영자가 승인했어요. 결제사 반환은 아직 대기 중이에요.' },
  processing: { label: '반환 처리 중', description: '결제사 처리 결과를 확인하고 있어요. 확인되면 반환 완료로 바뀌어요.' },
  failed: { label: '반환 확인 필요', description: '아직 반환 완료를 확인하지 못했어요. 운영자가 원인을 확인하고 다시 처리해요.' },
  completed: { label: '반환 완료', description: '결제사에서 보증금 반환을 확인했어요. 결제수단에 반영되는 시점은 결제사에 따라 달라요.' },
}
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

export function parseRefundLedger(value: unknown, owner: string): AdmissionRefundSummary[] | null {
  const payload = record(value)
  if (!payload || payload.accountKey !== owner || !Array.isArray(payload.refunds)) return null
  const result = payload.refunds.map(parseAdmissionRefundSummary)
  if (result.some(item => !item) || new Set(result.map(item => item?.depositId)).size !== result.length) return null
  return result as AdmissionRefundSummary[]
}
export function refundErrorMessage(code: string) {
  if (code === 'mfa_required') return '운영자 보안 인증이 필요해요. 2단계 인증을 완료한 뒤 다시 확인해 주세요.'
  if (code === 'reauthentication_required') return '보증금을 안전하게 처리하려면 최근 로그인이 필요해요. 다시 로그인한 뒤 이어서 진행해 주세요.'
  if (['unauthenticated', 'not_authenticated'].includes(code)) return '로그인이 만료됐어요. 다시 로그인해 주세요.'
  if (['forbidden', 'super_admin_required'].includes(code)) return '이 화면을 이용할 수 있는 최고 관리자 권한이 없어요.'
  if (code === 'account_changed') return '계정이 바뀌었어요. 현재 계정의 보증금 내역을 다시 확인해 주세요.'
  if (['refund_not_available', 'refund_request_conflict', 'refund_lease_active', 'refund_state_conflict', 'refund_not_approved'].includes(code)) return '이미 처리 중이거나 상태가 바뀌었어요. 최신 내역을 다시 확인해 주세요.'
  if (['refund_reconciliation_required', 'refund_attempts_exhausted', 'refund_owner_unavailable'].includes(code)) return '운영 확인이 필요한 반환 건이에요. 확인 전에는 반환 완료로 표시되지 않아요.'
  return '보증금 내역을 확인하지 못했어요. 연결 상태를 확인하고 다시 불러와 주세요.'
}

export default function AdmissionRefundLedger({ admin = false }: { admin?: boolean }) {
  const account = useHistoryAccount(), ownerRef = useRef(account)
  ownerRef.current = account
  const epoch = useRef(0), reading = useRef<AbortController | null>(null), changing = useRef<AbortController | null>(null)
  const invalidate = useCallback(() => {
    // Invalidate the latest request generation, not a captured DOM ref value.
    ++epoch.current; reading.current?.abort(); changing.current?.abort()
  }, [])
  const [snapshot, setSnapshot] = useState<{ owner: string; items: AdmissionRefundSummary[] } | null>(null)
  const [error, setError] = useState<Notice | null>(null), [notice, setNotice] = useState<Notice | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const endpoint = admin ? '/api/admin/super-admin/meetup-refunds' : '/api/meetups/admission/refunds'
  const path = admin ? '/admin/super-admin/meetup-refunds' : '/profile/deposits'

  const load = useCallback(async () => {
    if (!refundUuid(account) || changing.current) return
    reading.current?.abort()
    const controller = new AbortController(), ticket = ++epoch.current
    reading.current = controller; setLoading(true); setError(null); setSelection(null)
    const timer = setTimeout(() => controller.abort(), 12000)
    try {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin', headers: { 'X-Quantum-Owner': account }, signal: controller.signal })
      const payload: unknown = await response.json()
      if (ticket !== epoch.current || ownerRef.current !== account) return
      if (!response.ok) throw new Error(String(record(payload)?.error ?? 'unavailable'))
      const items = parseRefundLedger(payload, account)
      if (!items) throw new Error('account_changed')
      setSnapshot({ owner: account, items })
    } catch (cause) {
      if (ticket === epoch.current && ownerRef.current === account) {
        const code = cause instanceof Error ? cause.message : 'unavailable'
        setSnapshot(null); setError({ owner: account, code, message: refundErrorMessage(code) })
      }
    } finally {
      clearTimeout(timer)
      if (ticket === epoch.current && ownerRef.current === account) { setLoading(false); reading.current = null }
    }
  }, [account, endpoint])

  useEffect(() => {
    invalidate(); changing.current = null
    setSnapshot(null); setError(null); setNotice(null); setSelection(null); setBusy(false)
    setLoading(account === undefined || refundUuid(account))
    void load()
    return invalidate
  }, [account, load, invalidate])

  const visible = snapshot?.owner === account ? snapshot : null
  const visibleError = error?.owner === account ? error : null
  const visibleNotice = notice?.owner === account ? notice : null
  const selected = selection?.owner === account ? selection : null

  async function submit() {
    if (!selected || !refundUuid(account) || !visible || changing.current) return
    const current = visible.items.find(item => item.depositId === selected.item.depositId)
    if (!current || !allowedAction(current, admin, selected.action)) return
    const owner = account, ticket = ++epoch.current, controller = new AbortController()
    reading.current?.abort(); changing.current = controller; setBusy(true); setError(null); setNotice(null)
    const timer = setTimeout(() => controller.abort(), 12000)
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Quantum-Owner': owner }, signal: controller.signal,
        body: JSON.stringify(admin ? { depositId: current.depositId, requestId: current.requestId, action: selected.action } : { depositId: current.depositId }) })
      const payload = record(await response.json())
      if (ticket !== epoch.current || ownerRef.current !== owner) return
      if (!response.ok) throw new Error(String(payload?.error ?? 'unavailable'))
      const refund = parseAdmissionRefundSummary(payload?.refund)
      if (payload?.accountKey !== owner || !refund || refund.depositId !== current.depositId
        || admin && refund.requestId !== current.requestId) throw new Error('account_changed')
      setSnapshot({ owner, items: visible.items.map(item => item.depositId === refund.depositId ? refund : item) })
      setSelection(null)
      setNotice({ owner, message: refund.refundState === 'completed' ? '결제사 반환 완료를 확인했어요.'
        : selected.action === 'request' ? '반환 신청을 접수했어요. 운영자 확인을 기다려 주세요.'
          : '반환 처리 대기열에 반영했어요. 결제사 확인 후 완료로 바뀌어요.' })
    } catch (cause) {
      if (ticket === epoch.current && ownerRef.current === owner) {
        const code = cause instanceof Error ? cause.message : 'unavailable'
        setSnapshot(null); setSelection(null)
        setError({ owner, code, message: refundErrorMessage(code) })
      }
    } finally {
      clearTimeout(timer)
      if (changing.current === controller) changing.current = null
      if (ticket === epoch.current && ownerRef.current === owner) setBusy(false)
    }
  }

  return <main className="min-h-screen bg-[#FBF8F2] px-5 pb-24 pt-6 text-[#3C3028]">
    <div className="mx-auto max-w-3xl">
      <Link href={admin ? '/admin' : '/profile/edit'} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#796453]"><ArrowLeft size={17}/>{admin ? '운영자 대시보드' : '내 프로필'}</Link>
      <header className="mt-5 flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[0.16em] text-[#A45539]">{admin ? 'RETURN REVIEW' : 'MY DEPOSITS'}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{admin ? '모임 보증금 반환 검토' : '내 모임 보증금'}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#796453]">{admin ? '참여자의 반환 신청을 확인하고 승인해 주세요. 승인은 처리 대기이며, 결제사 확인 후에 반환 완료가 됩니다.' : '참여했던 모임별 보증금과 반환 진행 상황을 한곳에서 확인해요.'}</p></div>
        <span className="mt-7 hidden rounded-2xl bg-[#F1E4D7] p-4 text-[#A45539] sm:block">{admin ? <ShieldCheck size={26}/> : <CircleDollarSign size={26}/>}</span>
      </header>
      {!admin && <Link href="/match" className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#796453] underline underline-offset-4">기존 매칭 보증금은 만남에서 확인<ArrowRight size={14}/></Link>}
      <div className="mt-5 flex items-center justify-between gap-3 border-b border-[#E3D9CB] pb-3">
        <p className="text-sm font-semibold">{visible ? `${visible.items.length}건의 보증금` : '보증금 내역'}</p>
        <button className={secondary} onClick={() => void load()} disabled={loading || busy || !refundUuid(account)}><RefreshCw size={15}/>새로고침</button>
      </div>
      {visibleNotice && <p role="status" className="mt-4 rounded-xl bg-[#EAF2E8] p-4 text-sm leading-6 text-[#395C42]">{visibleNotice.message}</p>}
      {visibleError && <div role="alert" className="mt-5 rounded-2xl border border-[#E9CDBA] bg-[#FFF1E5] p-5 text-sm leading-6 text-[#8B432C]">
        <p>{visibleError.message}</p>
        {visibleError.code === 'mfa_required' ? <Link className={`${button} mt-2 underline`} href={`/auth/mfa?returnTo=${encodeURIComponent(path)}`}>2단계 인증하기</Link>
          : ['reauthentication_required','unauthenticated','not_authenticated'].includes(visibleError.code ?? '') ? <Link className={`${button} mt-2 underline`} href={`/login?reauth=1&redirect=${encodeURIComponent(path)}`}>다시 로그인하기</Link>
            : <button className={`${button} mt-2 underline`} onClick={() => void load()} disabled={busy}>내역 다시 확인</button>}
      </div>}
      {account === null ? <section className="mt-5 rounded-2xl bg-white p-6"><p className="text-sm leading-6">내 보증금을 확인하려면 로그인해 주세요.</p><Link className={`${primary} mt-4`} href={`/login?redirect=${encodeURIComponent(path)}`}>로그인하기<ArrowRight size={16}/></Link></section>
        : account === 'unavailable' ? <p role="alert" className="mt-5 rounded-2xl border border-[#E9CDBA] p-6 text-sm leading-6">로그인 상태를 확인하지 못했어요. 연결 상태를 확인한 뒤 페이지를 다시 열어 주세요.</p>
          : loading ? <p role="status" className="mt-5 rounded-2xl border border-[#E3D9CB] bg-white p-6 text-sm text-[#796453]">보증금 내역을 확인하고 있어요…</p>
            : visible && visible.items.length === 0 ? <section className="mt-5 rounded-2xl border border-dashed border-[#D9CCBA] p-8 text-center"><CircleDollarSign className="mx-auto text-[#AE8B70]" size={28}/><p className="mt-3 font-semibold">{admin ? '검토할 반환 신청이 없어요' : '아직 모임 보증금 내역이 없어요'}</p><p className="mt-2 text-sm leading-6 text-[#796453]">{admin ? '신청이 접수되면 이곳에 표시돼요.' : '보증금을 낸 모임에 참여하면 이곳에 기록돼요.'}</p></section>
              : visible && <div className="mt-5 space-y-4">{visible.items.map(item => <AdmissionRefundCard key={item.depositId} item={item} admin={admin} busy={busy}
                confirm={selected?.item.depositId === item.depositId ? selected.action : null}
                onSelect={action => { if (refundUuid(account)) setSelection({ owner: account, item, action }) }} onBack={() => setSelection(null)} onConfirm={() => void submit()}/>)}</div>}
    </div>
  </main>
}

function allowedAction(item: AdmissionRefundSummary, admin: boolean, action: Action) {
  const needsManualRecovery = ['refund_attempts_exhausted', 'refund_owner_unavailable'].includes(item.lastError ?? '')
  return admin ? Boolean(item.requestId) && (action === 'approve' && item.refundState === 'requested' || action === 'retry' && item.refundState === 'failed' && !needsManualRecovery)
    : action === 'request' && item.refundState === 'available' && item.payment === 'refund_due'
}
export function AdmissionRefundCard({ item, admin = false, busy = false, confirm = null, onSelect, onBack, onConfirm }: {
  item: AdmissionRefundSummary; admin?: boolean; busy?: boolean; confirm?: Action | null
  onSelect: (action: Action) => void; onBack: () => void; onConfirm: () => void
}) {
  const state = stateCopy[item.refundState], completed = item.refundState === 'completed'
  const action: Action | null = allowedAction(item, admin, 'request') ? 'request' : allowedAction(item, admin, 'approve') ? 'approve' : allowedAction(item, admin, 'retry') ? 'retry' : null
  const actionLabel = action === 'request' ? '반환 신청하기' : action === 'approve' ? '반환 승인하기' : '반환 다시 처리'
  return <article className="rounded-2xl border border-[#E7DDD0] bg-white p-5 shadow-[0_4px_20px_#6F4D2B05] sm:p-6" aria-label={`${item.roomTitle ?? '모임'} 보증금 ${item.depositId}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-[#98755A]">{titleByKind[item.room.kind]}</span>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${completed ? 'bg-[#EAF2E8] text-[#395C42]' : 'bg-[#F7EEE4] text-[#946041]'}`}>{completed ? <Check size={13}/> : <Clock3 size={13}/>} {state.label}</span></div>
    <h2 className="mt-3 break-words text-lg font-bold">{item.roomTitle ?? '이름을 확인할 수 없는 모임'}</h2>
    <p className="mt-2 break-all text-[11px] leading-5 text-[#998575]">보증금 번호 · {item.depositId}</p>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[#F0E8DF] pt-4"><span className="text-sm text-[#796453]">{completed ? '반환 확인 금액' : '모임 보증금'}</span><strong className="text-2xl font-bold tabular-nums">{item.amountKrw.toLocaleString('ko-KR')}<span className="ml-1 text-sm font-medium">원</span></strong></div>
    <p className="mt-3 text-sm leading-6 text-[#796453]">{state.description}</p>
    {admin && item.lastError === 'refund_attempts_exhausted' && <p className="mt-2 text-sm leading-6 text-[#8B432C]">자동 처리 한도에 도달했어요. 결제사 원거래와 처리 이력을 별도로 확인해야 해요.</p>}
    {admin && item.lastError === 'refund_owner_unavailable' && <p className="mt-2 text-sm leading-6 text-[#8B432C]">계정과 원거래 확인이 필요한 건이에요. 확인 전에는 다시 처리할 수 없어요.</p>}
    {item.requestedAt && <p className="mt-2 text-xs text-[#998575]">신청 {formatDate(item.requestedAt)}{item.completedAt ? ` · 반환 확인 ${formatDate(item.completedAt)}` : ''}</p>}
    {action && (confirm === action ? <section className="mt-4 rounded-xl bg-[#FBF5ED] p-4" aria-label="보증금 반환 확인">
      <p className="text-sm font-semibold leading-6">{action === 'request' ? `${item.amountKrw.toLocaleString('ko-KR')}원 반환을 신청할까요?` : action === 'approve' ? '이 반환 신청을 승인할까요?' : '확인한 반환 건을 다시 처리할까요?'}</p>
      <p className="mt-1 text-xs leading-5 text-[#796453]">{action === 'request' ? '운영자가 확인한 뒤 원래 결제수단으로 반환을 진행해요.' : '처리 대기열에 반영하며, 결제사 반환이 확인돼야 완료됩니다.'}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button className={secondary} onClick={onBack} disabled={busy}>돌아가기</button><button className={primary} onClick={onConfirm} disabled={busy}>{busy ? '처리 중…' : action === 'request' ? '반환 신청 확인' : action === 'approve' ? '승인 확인' : '재처리 확인'}</button></div>
    </section> : <button className={`${primary} mt-4 w-full sm:w-auto`} disabled={busy} onClick={() => onSelect(action)}>{actionLabel}<ArrowRight size={15}/></button>)}
  </article>
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(value))
}
