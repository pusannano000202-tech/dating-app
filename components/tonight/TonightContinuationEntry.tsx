'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

import {
  ContinuationJourneyError,
  openContinuationSeries,
  resolveContinuationAttempt,
  type ContinuationAttempt,
} from '@/lib/matching/continuation-journey-client'

export default function TonightContinuationEntry({ teamId, isOwnerCurrent }: { teamId: string; isOwnerCurrent?: () => boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef<ContinuationAttempt | null>(null)
  const inFlight = useRef(false)
  async function openContinuation() {
    if (inFlight.current || isOwnerCurrent?.() === false) return
    inFlight.current = true
    setBusy(true)
    setError('')
    attempt.current = resolveContinuationAttempt(attempt.current, `tonight:${teamId}`)
    try {
      const result = await openContinuationSeries({
        source: { kind: 'tonight', teamId },
        attempt: attempt.current,
        canContinue: () => isOwnerCurrent?.() !== false,
      })
      if (isOwnerCurrent?.() === false) return
      router.push(`/match/series/${encodeURIComponent(result.seriesId)}`)
    } catch (caught) {
      if (isOwnerCurrent?.() === false) return
      const error = caught instanceof ContinuationJourneyError ? caught : null
      setError(error?.stage === 'source' && error.code === 'source_not_ready'
        ? '모임의 출석·업장 확인이 모두 끝나야 이어갈 수 있어요. 확인 후 다시 눌러주세요.'
        : '계속 만나기 화면을 열지 못했어요. 다시 눌러도 같은 요청으로 안전하게 확인합니다.')
    }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <section className="mt-5 rounded-[24px] border border-[#e7c9c2] bg-[#fff5ef] p-5">
    <p className="text-xs font-bold text-[#B94B3F]">계속 만나기 · 오늘의 팀</p>
    <h2 className="mt-2 text-xl font-black text-[#292321]">이 사람들과 다음 만남을 시작할까요?</h2>
    <p className="mt-3 text-sm leading-6 text-[#77645b]">같은 사람들과 더 만나고 싶은지 편하게 선택해 주세요. 내 선택은 다른 사람에게 공개되지 않습니다. 다음 약속의 비용과 안전 안내는 참가를 확정하기 전에 확인할 수 있어요.</p>
    {error ? <p role="status" className="mt-3 text-sm leading-6 text-[#9e3e34]">{error}</p> : null}
    <button type="button" onClick={() => void openContinuation()} disabled={busy} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#B94B3F] px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? '계속 만나기 여는 중' : '계속 만나기 시작'} <ArrowRight size={17} /></button>
  </section>
}
