'use client'

import { ArrowRight, CalendarDays, Loader2, RotateCw, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { parseContinuationSeries, type ContinuationSeries } from '@/lib/matching/five-meeting-state'

export default function FiveMeetingHomeNextActionCard({ initialSeries, compact = false }: { initialSeries?: ContinuationSeries; compact?: boolean }) {
  const [series, setSeries] = useState<ContinuationSeries | null>(initialSeries ?? null)
  const [loading, setLoading] = useState(!initialSeries)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const response = await fetch('/api/match/series/current', { cache: 'no-store' })
      const payload = await response.json().catch(() => undefined)
      if (!response.ok) throw new Error('load_failed')
      if (payload === null) {
        setSeries(null)
        return
      }
      const parsed = parseContinuationSeries(payload)
      if (!parsed) throw new Error('invalid_payload')
      setSeries(parsed)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialSeries) {
      setSeries(initialSeries)
      setLoading(false)
      setFailed(false)
      return
    }
    void load()
  }, [initialSeries, load])

  if (loading) return <Card icon={<Loader2 className="animate-spin" />} title="계속 만나기 상태를 확인하는 중이에요" />
  if (failed) return <Card icon={<RotateCw />} title="다음 행동을 불러오지 못했어요" action={() => void load()} />
  if (!series) return null

  const occurrence = series.occurrences.find((item) => item.occurrenceId === series.latestOccurrenceId)
  const transition = series.transitions.at(-1)
  const href = series.nextAction === 'open_occurrence' && occurrence
    ? `/match/occurrences/${occurrence.occurrenceId}`
    : `/match/series/${series.seriesId}`
  const actionLabel = nextActionLabel(series.nextAction, occurrence?.programDay)
  const journeyPosition = occurrence && series.nextAction === 'open_occurrence'
    ? `프로그램 Day ${occurrence.programDay} · 실제 ${occurrence.physicalMeetingNo}번째 만남`
    : transition
      ? `다음 프로그램 Day ${transition.targetProgramDay} · 실제 ${transition.physicalMeetingNo}번째 만남`
      : `다음 프로그램 Day ${series.startProgramDay} · 실제 2번째 만남`

  if (compact) return <section className="rounded-xl border border-[#e8cfc4] bg-white px-4 py-3" aria-label="계속 만나기 · 지금 할 일">
    <p className="text-[11px] font-bold text-[#a43f32]">계속 만나기 · 나의 다음 단계</p>
    <h2 className="mt-1 text-base font-black">{nextLabel(series.nextAction)}</h2>
    <p className="mt-1 text-xs leading-5 text-[#807169]">내 선택과 결제는 나에게만 보여요.</p>
    <Link href={href} className="mt-2 flex min-h-11 items-center justify-between gap-2 text-sm font-bold text-[#a43f32]">{actionLabel}<ArrowRight size={17} /></Link>
    <Link href="/calendar" className="flex min-h-11 items-center gap-2 border-t border-[#edddd4] text-xs font-bold text-[#807169]"><CalendarDays size={15} />확정된 일정 보기</Link>
  </section>

  return (
    <section className="overflow-hidden rounded-3xl border border-boot-primary/15 bg-white shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
      <header className="bg-gradient-to-br from-[#13211f] to-[#21443e] px-5 py-5 text-white sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#F3B95F]"><ShieldCheck /></span>
          <div>
            <p className="text-[11px] font-black tracking-[0.18em] text-[#F3B95F]">계속 만나기 · 지금 할 일</p>
            <h2 className="mt-1 text-xl font-black sm:text-2xl">{nextLabel(series.nextAction)}</h2>
            <p className="mt-2 text-xs font-bold text-white/70">{journeyPosition}</p>
          </div>
        </div>
      </header>
      <div className="p-5 sm:p-6">
        <p className="text-sm font-bold leading-6 text-boot-muted">내 선택과 내 결제만 보여요. 다른 사람의 선택·결제·연락처는 공개하지 않습니다.</p>
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-boot-soft px-4 py-3 text-xs font-bold text-boot-body"><CalendarDays size={16} />확정된 일정 {series.occurrences.length}개</div>
        <Link href={href} className="mt-4 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-boot-primary px-4 text-sm font-black text-white shadow-[0_12px_24px_rgba(255,79,105,0.2)]">{actionLabel} <ArrowRight size={17} /></Link>
        <Link href="/calendar" className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-boot-hairline bg-white px-4 text-sm font-black text-boot-primary"><CalendarDays size={16} />전체 일정 보기</Link>
      </div>
    </section>
  )
}

function Card({ icon, title, action }: { icon: React.ReactNode; title: string; action?: () => void }) {
  return <div className="rounded-3xl border border-boot-hairline bg-white p-5"><span className="text-boot-primary">{icon}</span><p className="mt-3 text-sm font-black text-boot-ink">{title}</p>{action ? <button type="button" onClick={action} className="mt-3 min-h-10 rounded-xl bg-boot-soft px-4 text-xs font-black text-boot-primary">다시 확인</button> : null}</div>
}

function nextLabel(action: ContinuationSeries['nextAction']) {
  return ({
    open_transition: '다음 만남을 함께 열어 주세요',
    choose: '계속 만날지 선택해 주세요',
    wait_private_choices: '비공개 선택을 기다리고 있어요',
    pay_fee: '내 참가비를 확인해 주세요',
    wait_private_payments: '참가비 확인을 기다리고 있어요',
    wait_schedule: '새 일정을 정하고 있어요',
    open_occurrence: '확정된 다음 만남이 있어요',
    completed: '연속 만남이 끝났어요',
  } as const)[action]
}

function nextActionLabel(action: ContinuationSeries['nextAction'], programDay?: number) {
  return ({
    open_transition: '다음 회차 선택 열기',
    choose: '계속 만날지 선택하기',
    wait_private_choices: '선택 진행 상황 확인',
    pay_fee: '내 참가비 확인하기',
    wait_private_payments: '참가비 진행 상황 확인',
    wait_schedule: '일정 준비 상황 확인',
    open_occurrence: programDay ? `Day ${programDay} 만남 열기` : '확정된 만남 열기',
    completed: '완료 기록 보기',
  } as const)[action]
}
