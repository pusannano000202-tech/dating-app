'use client'

import { ArrowRight, CalendarDays, Check, Loader2, RotateCw, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import ContinuationFeeCheckout from '@/components/matching/ContinuationFeeCheckout'
import ContinuationJoinConsentCard from '@/components/matching/ContinuationJoinConsentCard'
import ContinuationSeriesAlbum from '@/components/matching/ContinuationSeriesAlbum'
import FiveMeetingCalendar from '@/components/matching/FiveMeetingCalendar'
import { resolveMutationAttempt, type MutationAttempt } from '@/lib/matching/continuation-journey-client'
import { parseContinuationSeries, type ContinuationSeries } from '@/lib/matching/five-meeting-state'

type SeriesLoadState = 'loading' | 'ready' | 'error'

export default function FiveMeetingSeriesExperience({ seriesId }: { seriesId: string }) {
  const [series, setSeries] = useState<ContinuationSeries | null>(null)
  const [loadState, setLoadState] = useState<SeriesLoadState>('loading')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const mutationAttempt = useRef<MutationAttempt | null>(null)

  const load = useCallback(async () => {
    setLoadState('loading')
    setNotice('')
    try {
      const response = await fetch(`/api/match/series/${encodeURIComponent(seriesId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      const parsed = parseContinuationSeries(payload)
      if (!response.ok || !parsed) throw new Error('load_failed')
      setSeries(parsed)
      setLoadState('ready')
    } catch {
      setSeries(null)
      setLoadState('error')
    }
  }, [seriesId])

  useEffect(() => { void load() }, [load])

  async function mutate(body: Record<string, unknown>) {
    mutationAttempt.current = resolveMutationAttempt(
      mutationAttempt.current,
      `series-next-action:${seriesId}:${JSON.stringify(body)}`,
    )
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(`/api/match/series/${encodeURIComponent(seriesId)}/next-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idempotency_key: mutationAttempt.current.key }),
      })
      if (!response.ok) throw new Error('mutation_failed')
      await load()
    } catch {
      setNotice('상태가 바뀌었거나 마감된 단계예요. 다시 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  if (loadState === 'loading' || !series) {
    return (
      <main className="min-h-screen booting-paper px-4 py-8 text-boot-ink">
        <div className="mx-auto max-w-3xl rounded-3xl border border-boot-hairline bg-white p-8 text-center">
          {loadState === 'loading' ? (
            <><Loader2 className="mx-auto animate-spin text-boot-primary" /><p className="mt-3 text-sm font-bold text-boot-muted">계속 만나기 상태를 확인하는 중이에요.</p></>
          ) : (
            <>
              <RotateCw className="mx-auto text-boot-primary" />
              <h1 className="mt-3 text-xl font-black">계속 만나기를 불러오지 못했어요</h1>
              <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">저장된 진행이 사라진 것은 아니에요. 다시 확인하거나 매칭 화면으로 돌아가 주세요.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => void load()} className="min-h-12 rounded-2xl bg-boot-primary px-4 text-sm font-black text-white">다시 불러오기</button>
                <Link href="/match" className="flex min-h-12 items-center justify-center rounded-2xl border border-boot-hairline px-4 text-sm font-black text-boot-primary">매칭으로 돌아가기</Link>
              </div>
            </>
          )}
        </div>
      </main>
    )
  }

  const transition = series.transitions.at(-1)
  const occurrence = series.occurrences.find((item) => item.occurrenceId === series.latestOccurrenceId)
  const sourceTitle = typeof series.source.activity.title === 'string'
    ? series.source.activity.title
    : activityLabel(series.source.activityKind)
  const sourceNarration = series.source.activityKind === 'board_game'
    ? `${sourceTitle}으로 첫 만남을 마쳐 프로그램 Day 2부터 이어가요.`
    : `${sourceTitle}으로 첫 만남을 마쳐 보드게임 프로그램 Day 1부터 이어가요.`
  const journeyPosition = occurrence && series.nextAction === 'open_occurrence'
    ? `프로그램 Day ${occurrence.programDay} · 실제 ${occurrence.physicalMeetingNo}번째 만남`
    : transition
      ? `다음 프로그램 Day ${transition.targetProgramDay} · 실제 ${transition.physicalMeetingNo}번째 만남`
      : `다음 프로그램 Day ${series.startProgramDay} · 실제 2번째 만남`

  return (
    <main className="min-h-screen booting-paper px-4 pb-24 pt-6 text-boot-ink">
      <div className="mx-auto max-w-3xl space-y-5">
        <section className="overflow-hidden rounded-3xl border border-boot-hairline bg-white shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
          <header className="bg-gradient-to-br from-[#13211f] to-[#21443e] px-5 py-6 text-white sm:px-7">
            <p className="text-[11px] font-black tracking-[0.18em] text-[#F3B95F]">계속 만나기 · 동의 후 진행</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">우리 그룹의 다음 이야기</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-white/75">{sourceNarration}</p>
            <p className="mt-4 inline-flex rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white">{journeyPosition}</p>
          </header>

          <div className="p-5 sm:p-7">
            <div className="flex items-start gap-3 rounded-2xl bg-boot-soft p-4">
              <ShieldCheck className="shrink-0 text-boot-primary" />
              <p className="text-sm font-bold leading-6 text-boot-muted">내 선택과 내 결제만 확인할 수 있어요. 연락처와 다른 사람의 선택은 자동 공개하지 않습니다.</p>
            </div>

            {series.nextAction === 'open_transition' ? (
              <button type="button" disabled={busy} onClick={() => void mutate({ action: 'open_transition' })} className="mt-5 min-h-14 w-full rounded-2xl bg-boot-primary px-4 font-black text-white disabled:opacity-45">{busy ? '여는 중…' : '다음 회차 선택 열기'}</button>
            ) : null}

            {series.nextAction === 'choose' && transition ? (
              <div className="mt-5">
                <p className="mb-3 text-sm font-black text-boot-ink">지금 할 일 · 계속 만날지 선택해 주세요</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={() => void mutate({ action: 'set_choice', transition_id: transition.transitionId, choice: 'continue', expected_roster_revision: transition.rosterRevision })} className="min-h-14 rounded-2xl bg-boot-primary px-3 font-black text-white disabled:opacity-45"><Check className="mr-1 inline" size={17} />계속 만나기</button>
                  <button type="button" disabled={busy} onClick={() => void mutate({ action: 'set_choice', transition_id: transition.transitionId, choice: 'end', expected_roster_revision: transition.rosterRevision })} className="min-h-14 rounded-2xl border border-boot-hairline bg-white px-3 font-black text-boot-muted disabled:opacity-45">여기까지</button>
                </div>
              </div>
            ) : null}

            {series.nextAction === 'pay_fee' && transition ? (
              <div className="mt-5">
                <p className="mb-3 text-sm font-black text-boot-ink">지금 할 일 · 내 참가비 확인</p>
                <ContinuationFeeCheckout transitionId={transition.transitionId} purpose="next_occurrence" returnPath={`/match/series/${seriesId}`} disabled={busy} onComplete={load} />
              </div>
            ) : null}

            {series.nextAction === 'open_occurrence' && occurrence ? (
              <Link href={`/match/occurrences/${occurrence.occurrenceId}`} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-boot-primary px-4 font-black text-white">Day {occurrence.programDay} · 확정된 만남 열기 <ArrowRight size={18} /></Link>
            ) : null}

            {series.nextAction === 'completed' ? (
              <div className="mt-5 rounded-2xl border border-[#147A70]/20 bg-[#EAF7F5] p-4">
                <p className="font-black text-[#115F57]">5회 만남을 모두 마쳤어요</p>
                <p className="mt-1 text-sm font-bold leading-6 text-[#315F5B]">완료된 일정은 아래 캘린더에서 다시 확인할 수 있어요.</p>
                <Link href="/match" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-black text-[#147A70]">새 만남 둘러보기</Link>
              </div>
            ) : null}

            {!['open_transition', 'choose', 'pay_fee', 'open_occurrence', 'completed'].includes(series.nextAction) ? (
              <p className="mt-5 rounded-2xl bg-boot-soft p-4 text-sm font-black leading-6 text-boot-muted">{waitLabel(series.nextAction)}</p>
            ) : null}
            {notice ? <p role="status" className="mt-4 text-xs font-bold leading-5 text-boot-muted">{notice}</p> : null}

            <Link href="/calendar" className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-boot-hairline px-4 text-sm font-black text-boot-primary"><CalendarDays size={17} />전체 일정 보기</Link>
          </div>
        </section>

        <ContinuationJoinConsentCard seriesId={seriesId} />
        <FiveMeetingCalendar seriesId={seriesId} />
        <ContinuationSeriesAlbum seriesId={seriesId} />
      </div>
    </main>
  )
}

function waitLabel(action: ContinuationSeries['nextAction']) {
  return ({
    wait_private_choices: '다른 참가자의 비공개 선택 마감을 기다리고 있어요.',
    wait_private_payments: '참가비 확인이 끝나면 운영자가 일정을 정해요.',
    wait_schedule: '운영자가 겹치지 않는 한 일정을 확정하고 있어요.',
  } as Partial<Record<ContinuationSeries['nextAction'], string>>)[action] ?? '다음 상태를 준비하고 있어요.'
}

function activityLabel(kind: ContinuationSeries['source']['activityKind']) {
  return ({ board_game: '보드게임', walk: '산책', meal: '식사', bowling: '볼링', other: '첫 활동' } as const)[kind]
}
