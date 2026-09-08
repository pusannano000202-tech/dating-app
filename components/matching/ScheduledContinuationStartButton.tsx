'use client'

import { ArrowRight, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'

import {
  ContinuationJourneyError,
  openContinuationSeries,
  resolveContinuationAttempt,
  type ContinuationAttempt,
} from '@/lib/matching/continuation-journey-client'

export default function ScheduledContinuationStartButton({ occurrenceId }: { occurrenceId: string }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const attempt = useRef<ContinuationAttempt | null>(null)

  async function start() {
    if (busy) return
    setBusy(true)
    setNotice('')
    attempt.current = resolveContinuationAttempt(attempt.current, `scheduled:${occurrenceId}`)
    try {
      const result = await openContinuationSeries({
        source: { kind: 'scheduled', occurrenceId },
        attempt: attempt.current,
      })
      window.location.assign(`/match/series/${encodeURIComponent(result.seriesId)}`)
    } catch (caught) {
      const error = caught instanceof ContinuationJourneyError ? caught : null
      setNotice(error?.stage === 'source' && error.code === 'not_ready'
        ? '실제 출석이 확정된 뒤 계속 만나기를 시작할 수 있어요.'
        : '계속 만나기 화면을 열지 못했어요. 잠시 후 다시 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return <div><button type="button" onClick={() => void start()} disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#147A70] px-4 text-sm font-black text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={17} /> : <ArrowRight size={17} />}{busy ? '여는 중…' : '계속 만나기 시작'}</button>{notice ? <p role="status" className="mt-2 text-xs font-bold leading-5 text-boot-muted">{notice}</p> : null}</div>
}
