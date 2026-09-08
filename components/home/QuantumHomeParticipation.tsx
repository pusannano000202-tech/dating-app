'use client'

import { RefreshCw } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import QuantumParticipationCommandCenter from '@/components/matching/QuantumParticipationCommandCenter'
import FiveMeetingHomeNextActionCard from '@/components/matching/FiveMeetingHomeNextActionCard'
import { parseContinuationSeries, type ContinuationSeries } from '@/lib/matching/five-meeting-state'
import { isQuantumEventLifecycle } from '@/lib/matching/quantum-event-lifecycle'
import {
  isQuantumEventParticipation,
  type QuantumEventParticipation,
} from '@/lib/matching/quantum-event-participation'
import {
  isQuantumEventApplicantStatsMap,
  type QuantumEventApplicantStatsMap,
} from '@/lib/matching/quantum-event-stats'

type Participation = QuantumEventParticipation | import('@/lib/matching/quantum-event-lifecycle').QuantumEventLifecycle
type HomeLookupStatus = 'loading' | 'ready' | 'error'
type HomeParticipationView = 'loading' | 'continuation' | 'continuation-partial' | 'participation' | 'fallback' | 'blocked' | 'error'

export function resolveHomeParticipationPayload(payload: unknown): {
  participation: Participation | null
  availability?: string
  status: Exclude<HomeLookupStatus, 'loading'>
} {
  if (!payload || typeof payload !== 'object') {
    return { participation: null, status: 'error' }
  }

  const candidate = payload as { participation?: unknown; availability?: unknown }
  const availability = typeof candidate.availability === 'string' ? candidate.availability : undefined
  if (availability === 'auth_required') {
    return { participation: null, availability, status: 'ready' }
  }
  if (availability !== 'ready') {
    return { participation: null, availability, status: 'error' }
  }
  if (candidate.participation === null) {
    return { participation: null, availability, status: 'ready' }
  }

  const participation = isQuantumEventLifecycle(candidate.participation)
    ? candidate.participation
    : isQuantumEventParticipation(candidate.participation)
      ? candidate.participation
      : null

  return {
    participation,
    availability,
    status: participation ? 'ready' : 'error',
  }
}

export function resolveHomeParticipationView({
  participationStatus,
  continuationStatus,
  hasParticipation,
  hasContinuation,
}: {
  participationStatus: HomeLookupStatus
  continuationStatus: HomeLookupStatus
  hasParticipation: boolean
  hasContinuation: boolean
}): HomeParticipationView {
  if (participationStatus === 'loading' || continuationStatus === 'loading') return 'loading'
  if (hasContinuation) return participationStatus === 'error' ? 'continuation-partial' : 'continuation'
  if (hasParticipation) return 'participation'
  if (participationStatus === 'error') return 'error'
  if (continuationStatus === 'error') return 'blocked'
  return 'fallback'
}

export default function QuantumHomeParticipation({ fallback }: { fallback: ReactNode }) {
  const [participation, setParticipation] = useState<Participation | null>(null)
  const [continuation, setContinuation] = useState<ContinuationSeries | null>(null)
  const [stats, setStats] = useState<QuantumEventApplicantStatsMap>({})
  const [participationStatus, setParticipationStatus] = useState<HomeLookupStatus>('loading')
  const [continuationStatus, setContinuationStatus] = useState<HomeLookupStatus>('loading')

  useEffect(() => {
    const controller = new AbortController()

    async function loadHomeState() {
      const [participationResult, statsResult, continuationResult] = await Promise.allSettled([
        fetch('/api/match/event-participation', { cache: 'no-store', signal: controller.signal }),
        fetch('/api/match/events/stats', { cache: 'no-store', signal: controller.signal }),
        fetch('/api/match/series/current', { cache: 'no-store', signal: controller.signal }),
      ])

      if (controller.signal.aborted) return

      let nextParticipation: Participation | null = null
      let nextParticipationStatus: HomeLookupStatus = 'error'
      let participationAvailability: string | undefined
      if (participationResult.status === 'fulfilled' && participationResult.value.ok) {
        const participationPayload = await participationResult.value.json().catch(() => undefined)
        const resolvedParticipation = resolveHomeParticipationPayload(participationPayload)
        nextParticipation = resolvedParticipation.participation
        nextParticipationStatus = resolvedParticipation.status
        participationAvailability = resolvedParticipation.availability
      }

      let nextContinuation: ContinuationSeries | null = null
      let nextContinuationStatus: HomeLookupStatus = 'error'
      if (continuationResult.status === 'fulfilled') {
        const continuationResponse = continuationResult.value
        if (continuationResponse.ok) {
          try {
            const continuationPayload = await continuationResponse.json()
            if (continuationPayload === null) {
              nextContinuationStatus = 'ready'
            } else {
              const parsedContinuation = parseContinuationSeries(continuationPayload)
              if (!parsedContinuation) throw new Error('continuation_payload_invalid')
              nextContinuation = parsedContinuation
              nextContinuationStatus = 'ready'
            }
          } catch {
            nextContinuationStatus = 'error'
          }
        } else if (continuationResponse.status === 404
          || (continuationResponse.status === 401 && participationAvailability === 'auth_required')) {
          nextContinuationStatus = 'ready'
        }
      }

      let nextStats: QuantumEventApplicantStatsMap | null = null
      if (statsResult.status === 'fulfilled' && statsResult.value.ok) {
        const payload = await statsResult.value.json().catch(() => undefined) as { stats?: unknown } | undefined
        if (isQuantumEventApplicantStatsMap(payload?.stats)) nextStats = payload.stats
      }

      if (controller.signal.aborted) return
      setParticipation(nextParticipation)
      setParticipationStatus(nextParticipationStatus)
      setContinuation(nextContinuation)
      setContinuationStatus(nextContinuationStatus)
      if (nextStats) setStats(nextStats)
    }

    void loadHomeState()
    return () => controller.abort()
  }, [])

  const status = resolveHomeParticipationView({
    participationStatus,
    continuationStatus,
    hasParticipation: participation !== null,
    hasContinuation: continuation !== null,
  })

  if (status === 'loading') {
    return <div className="min-h-[100px] animate-pulse rounded-xl bg-[#f1e3d9]" aria-label="현재 신청 확인 중" />
  }
  if (status === 'error') {
    return (
      <section className="rounded-lg border border-[#E65D4D]/25 bg-white p-5 shadow-[0_14px_36px_rgba(18,24,33,0.08)]" role="alert">
        <p className="text-xs font-black text-[#D84F40]">신청 상태를 불러오지 못했어요</p>
        <h2 className="mt-1 text-lg font-black text-boot-ink">저장된 약속을 임의로 숨기지 않았어요</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
          오늘·이번 주 신청이나 계속 만나기가 사라진 것은 아니에요. 연결을 다시 확인해 주세요.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-boot-primary px-4 text-sm font-black text-white"
        >
          <RefreshCw size={16} aria-hidden="true" /> 다시 확인
        </button>
      </section>
    )
  }
  if (status === 'blocked') {
    return (
      <section className="rounded-lg border border-[#E3A530]/30 bg-white p-5 shadow-[0_14px_36px_rgba(18,24,33,0.08)]" role="alert">
        <p className="text-xs font-black text-[#A96800]">계속 만나기 상태를 확인하지 못했어요</p>
        <h2 className="mt-1 text-lg font-black text-boot-ink">새 신청 추천을 열지 않았어요</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
          저장된 후속 약속이 있는지 확인할 수 없어 안전하게 멈췄어요. 연결을 다시 확인해 주세요.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-boot-primary px-4 text-sm font-black text-white"
        >
          <RefreshCw size={16} aria-hidden="true" /> 다시 확인
        </button>
      </section>
    )
  }
  if ((status === 'continuation' || status === 'continuation-partial') && continuation) {
    return <div className="space-y-3">
      <FiveMeetingHomeNextActionCard initialSeries={continuation} compact />
      {status === 'continuation-partial' ? <section role="status" className="rounded-xl border border-[#e8cfc4] bg-white px-4 py-3">
        <p className="text-sm font-bold">오늘·이번 주 신청 상태만 확인하지 못했어요</p>
        <p className="mt-1 text-xs leading-5 text-boot-muted">확인된 계속 만나기는 보여드려요. 다른 신청은 없다고 판단하거나 변경하지 않았어요.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[#a43f32]"><RefreshCw size={14} aria-hidden />신청 상태 다시 확인</button>
      </section> : null}
    </div>
  }
  if (status === 'fallback') return <>{fallback}</>

  return (
    <div className="space-y-3">
      {participation ? (
        <QuantumParticipationCommandCenter
          participation={participation}
          applicantStats={stats[participation.event_id]}
          placement="home"
        />
      ) : null}
      {continuationStatus === 'error' ? (
        <section className="rounded-lg border border-[#E3A530]/30 bg-[#FFF9EC] px-4 py-3" role="status">
          <p className="text-sm font-black text-boot-ink">기존 신청은 그대로 보여드려요</p>
          <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">
            계속 만나기 상태만 확인하지 못했어요. 새 신청으로 바꾸지 않고 현재 신청을 유지했어요.
          </p>
        </section>
      ) : null}
    </div>
  )
}
