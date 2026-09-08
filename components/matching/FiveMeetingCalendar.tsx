'use client'

import { CalendarDays, Loader2, MapPin, RotateCw } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { parseContinuationSeries, type ContinuationSeries } from '@/lib/matching/five-meeting-state'

type CalendarState = 'loading' | 'ready' | 'error'

export default function FiveMeetingCalendar({ seriesId }: { seriesId?: string }) {
  const [series, setSeries] = useState<ContinuationSeries | null>(null)
  const [state, setState] = useState<CalendarState>('loading')

  const load = useCallback(async (signal?: AbortSignal) => {
    setState('loading')
    try {
      const response = await fetch(seriesId
        ? `/api/match/series/${encodeURIComponent(seriesId)}`
        : '/api/match/series/current', { cache: 'no-store', signal })
      const payload = await response.json().catch(() => undefined)
      if (!response.ok) throw new Error('load_failed')
      if (payload === null) {
        setSeries(null)
        setState('ready')
        return
      }
      const parsed = parseContinuationSeries(payload)
      if (!parsed) throw new Error('invalid_payload')
      setSeries(parsed)
      setState('ready')
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') {
        setSeries(null)
        setState('error')
      }
    }
  }, [seriesId])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <section className="rounded-3xl border border-boot-hairline bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary"><CalendarDays /></span>
        <div><p className="text-[11px] font-black tracking-[0.18em] text-boot-primary">계속 만나기 · 전체 일정</p><h2 className="text-xl font-black">프로그램 캘린더</h2></div>
      </div>

      <div className="mt-5 space-y-3">
        {state === 'loading' ? (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-2xl bg-boot-soft text-center"><Loader2 className="animate-spin text-boot-primary" /><p className="mt-2 text-sm font-bold text-boot-muted">일정을 불러오는 중이에요.</p></div>
        ) : null}

        {state === 'error' ? (
          <div className="rounded-2xl border border-[#E65D4D]/20 bg-[#FFF5F2] p-4 text-center" role="alert">
            <RotateCw className="mx-auto text-[#D84F40]" />
            <p className="mt-2 text-sm font-black text-boot-ink">일정을 불러오지 못했어요</p>
            <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">빈 일정으로 표시하지 않았어요. 연결을 확인한 뒤 다시 시도해 주세요.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl bg-boot-primary px-4 text-xs font-black text-white">다시 불러오기</button>
              <Link href="/match" className="flex min-h-11 items-center justify-center rounded-xl border border-boot-hairline bg-white px-4 text-xs font-black text-boot-primary">매칭으로 돌아가기</Link>
            </div>
          </div>
        ) : null}

        {state === 'ready' && series?.occurrences.map((occurrence) => (
          <Link key={occurrence.occurrenceId} href={`/match/occurrences/${occurrence.occurrenceId}`} className="flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-boot-hairline px-4 py-3 transition hover:border-boot-primary/30">
            <span><span className="block text-sm font-black text-boot-ink">프로그램 Day {occurrence.programDay} · 실제 {occurrence.physicalMeetingNo}번째 만남</span><span className="mt-1 flex items-center gap-1 text-xs font-bold text-boot-muted"><MapPin size={13} />{locationLabel(occurrence.location)}</span></span>
            <time className="shrink-0 text-right text-xs font-black text-boot-primary">{formatDate(occurrence.startsAt)}</time>
          </Link>
        ))}

        {state === 'ready' && (!series || series.occurrences.length === 0) ? (
          <p className="rounded-2xl bg-boot-soft px-4 py-5 text-sm font-bold leading-6 text-boot-muted">아직 확정된 다음 일정이 없어요. 홈의 ‘지금 할 일’에서 선택이나 일정 준비 상태를 확인해 주세요.</p>
        ) : null}
      </div>
    </section>
  )
}

function locationLabel(location: Record<string, unknown>) {
  return typeof location.name === 'string' ? location.name : '확정 장소'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
