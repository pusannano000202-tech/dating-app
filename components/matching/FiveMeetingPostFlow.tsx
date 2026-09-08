'use client'

import { ArrowRight, CheckCircle2, Loader2, RotateCw } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import ContinuationFeeCheckout from '@/components/matching/ContinuationFeeCheckout'
import { resolveMutationAttempt, type MutationAttempt } from '@/lib/matching/continuation-journey-client'

type AfterState = { occurrence_id: string; series_id: string; transition_id: string; program_day: number; final_program_day: boolean; friend_targets: Array<{ target_user_id: string; alias: string }> }
type AfterLoadState = 'loading' | 'ready' | 'blocked' | 'error'

export default function FiveMeetingPostFlow({ occurrenceId }: { occurrenceId: string }) {
  const [after, setAfter] = useState<AfterState | null>(null)
  const [loadState, setLoadState] = useState<AfterLoadState>('loading')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const openNextAttempt = useRef<MutationAttempt | null>(null)

  const load = useCallback(async () => {
    setLoadState('loading')
    setNotice('')
    try {
      const response = await fetch(`/api/match/occurrences/${encodeURIComponent(occurrenceId)}/after`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as (Partial<AfterState> & { error?: string }) | null
      if (!response.ok) {
        if (response.status === 409 && payload?.error === 'not_ready') {
          setAfter(null)
          setLoadState('blocked')
          return
        }
        throw new Error('load_failed')
      }
      if (!isAfter(payload)) throw new Error('invalid_payload')
      setAfter(payload)
      setLoadState('ready')
    } catch {
      setAfter(null)
      setLoadState('error')
    }
  }, [occurrenceId])

  useEffect(() => { void load() }, [load])

  async function openNext() {
    if (!after || busy) return
    openNextAttempt.current = resolveMutationAttempt(openNextAttempt.current, `occurrence-open-next:${occurrenceId}`)
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(`/api/match/occurrences/${encodeURIComponent(occurrenceId)}/after`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open_next', idempotency_key: openNextAttempt.current.key }),
      })
      const payload = await response.json().catch(() => null) as { series_id?: string; error?: string } | null
      if (!response.ok || typeof payload?.series_id !== 'string') {
        setNotice(payload?.error === 'not_ready'
          ? '출석 확인 또는 비공개 선택이 끝난 뒤 다음 회차를 열 수 있어요.'
          : '다음 회차를 열지 못했어요. 잠시 후 다시 확인해 주세요.')
        return
      }
      window.location.assign(`/match/series/${encodeURIComponent(payload.series_id)}`)
    } catch {
      setNotice('다음 회차를 열지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-3xl border border-boot-hairline bg-white p-5 shadow-sm sm:p-6">
      <p className="text-[11px] font-black tracking-[0.16em] text-boot-primary">계속 만나기 · 만남 뒤</p>
      <h2 className="mt-1 text-xl font-black">오늘 만남을 마친 뒤 선택</h2>
      <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">계속 만나기와 친구 요청은 각각 본인이 직접 선택해요. 누구의 거절 여부도 공개하지 않습니다.</p>

      {loadState === 'loading' ? (
        <div className="mt-5 flex min-h-24 flex-col items-center justify-center rounded-2xl bg-boot-soft"><Loader2 className="animate-spin text-boot-primary" /><p className="mt-2 text-xs font-bold text-boot-muted">출석과 다음 선택 상태를 확인하는 중이에요.</p></div>
      ) : null}

      {loadState === 'blocked' ? (
        <div className="mt-5 rounded-2xl border border-[#E0A34A]/25 bg-[#FFF8E9] p-4">
          <p className="font-black text-[#8A5A14]">아직 다음 선택이 열리지 않았어요</p>
          <p className="mt-1 text-sm font-bold leading-6 text-[#7A6547]">만남이 완료되고 실제 출석이 확정되면 계속할지 선택할 수 있어요.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl bg-[#8A5A14] px-4 text-xs font-black text-white">다시 확인</button>
            <Link href={`/match/occurrences/${occurrenceId}`} className="flex min-h-11 items-center justify-center rounded-xl border border-[#E0A34A]/25 bg-white px-4 text-xs font-black text-[#8A5A14]">회차 화면으로 돌아가기</Link>
          </div>
        </div>
      ) : null}

      {loadState === 'error' ? (
        <div className="mt-5 rounded-2xl border border-[#E65D4D]/20 bg-[#FFF5F2] p-4 text-center" role="alert">
          <RotateCw className="mx-auto text-[#D84F40]" />
          <p className="mt-2 text-sm font-black">만남 뒤 상태를 불러오지 못했어요</p>
          <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">출석이 막힌 것으로 단정하지 않았어요. 연결을 확인해 주세요.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl bg-boot-primary px-4 text-xs font-black text-white">다시 확인</button>
            <Link href={`/match/occurrences/${occurrenceId}`} className="flex min-h-11 items-center justify-center rounded-xl border border-boot-hairline bg-white px-4 text-xs font-black text-boot-primary">회차 화면으로 돌아가기</Link>
          </div>
        </div>
      ) : null}

      {loadState === 'ready' && after && !after.final_program_day ? (
        <button type="button" onClick={() => void openNext()} disabled={busy} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45">{busy ? '다음 회차 여는 중…' : '다음 회차 선택 열기'} {!busy ? <ArrowRight size={16} /> : null}</button>
      ) : null}

      {loadState === 'ready' && after?.final_program_day ? (
        <div className="mt-5 rounded-2xl border border-[#147A70]/20 bg-[#EAF7F5] p-4">
          <p className="flex items-center gap-2 font-black text-[#115F57]"><CheckCircle2 size={18} />프로그램 Day 5까지 모두 마쳤어요</p>
          <p className="mt-1 text-sm font-bold leading-6 text-[#315F5B]">추가 회차 결제는 없어요. 친구 요청은 아래에서 원하는 상대에게만 별도로 보낼 수 있어요.</p>
          <Link href="/calendar" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-black text-[#147A70]">완료 일정 보기</Link>
        </div>
      ) : null}

      {loadState === 'ready' && after?.friend_targets.length ? (
        <div className="mt-5 border-t border-boot-hairline pt-4">
          <p className="text-xs font-black text-boot-muted">별도 친구 요청 · 상대별 명시적 요청</p>
          <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">이미 친구이거나 요청이 진행 중인 상대는 결제 대상에서 제외돼요.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {after.friend_targets.map((target) => (
              <div key={target.target_user_id} className="rounded-2xl border border-boot-primary/20 p-3">
                <p className="mb-3 text-sm font-black text-boot-primary">{target.alias}에게 친구 요청</p>
                <ContinuationFeeCheckout transitionId={after.transition_id} purpose="friend_request" targetUserId={target.target_user_id} returnPath={`/match/occurrences/${occurrenceId}/after`} disabled={busy} onComplete={load} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {loadState === 'ready' && after && after.friend_targets.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-boot-hairline bg-boot-soft p-4">
          <p className="text-sm font-black text-boot-ink">지금 새로 요청할 수 있는 상대가 없어요</p>
          <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">이미 친구이거나 요청이 진행 중인 상대는 결제 대상에서 제외돼요.</p>
        </div>
      ) : null}

      {notice ? <p role="status" className="mt-4 text-xs font-bold leading-5 text-boot-muted">{notice}</p> : null}
    </section>
  )
}

function isAfter(value: unknown): value is AfterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Partial<AfterState>
  return typeof row.occurrence_id === 'string'
    && typeof row.series_id === 'string'
    && typeof row.transition_id === 'string'
    && typeof row.program_day === 'number'
    && typeof row.final_program_day === 'boolean'
    && Array.isArray(row.friend_targets)
}
