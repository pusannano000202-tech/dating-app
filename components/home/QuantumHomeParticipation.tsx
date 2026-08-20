'use client'

import { RefreshCw } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import QuantumParticipationCommandCenter from '@/components/matching/QuantumParticipationCommandCenter'
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
type HomeState = 'loading' | 'ready' | 'error'

export default function QuantumHomeParticipation({ fallback }: { fallback: ReactNode }) {
  const [participation, setParticipation] = useState<Participation | null>(null)
  const [stats, setStats] = useState<QuantumEventApplicantStatsMap>({})
  const [status, setStatus] = useState<HomeState>('loading')

  useEffect(() => {
    const controller = new AbortController()

    async function loadHomeState() {
      try {
        const [participationResponse, statsResponse] = await Promise.all([
          fetch('/api/match/event-participation', { cache: 'no-store', signal: controller.signal }),
          fetch('/api/match/events/stats', { cache: 'no-store', signal: controller.signal }),
        ])

        if (!participationResponse.ok) throw new Error('participation_lookup_failed')

        const payload = await participationResponse.json() as { participation?: unknown; availability?: string }
        const parsed = isQuantumEventLifecycle(payload.participation)
          ? payload.participation
          : isQuantumEventParticipation(payload.participation)
            ? payload.participation
            : null
        if (payload.availability === 'ready') {
          setParticipation(parsed)
          setStatus('ready')
        } else if (payload.availability === 'auth_required') {
          setParticipation(null)
          setStatus('ready')
        } else {
          throw new Error('participation_state_unavailable')
        }

        if (statsResponse.ok) {
          const payload = await statsResponse.json() as { stats?: unknown }
          if (isQuantumEventApplicantStatsMap(payload.stats)) setStats(payload.stats)
        }
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError') {
          setParticipation(null)
          setStatus('error')
        }
      }
    }

    void loadHomeState()
    return () => controller.abort()
  }, [])

  if (status === 'loading') {
    return <div className="min-h-[260px] animate-pulse rounded-lg bg-white/70" aria-label="현재 신청 확인 중" />
  }
  if (status === 'error') {
    return (
      <section className="rounded-lg border border-[#E65D4D]/25 bg-white p-5 shadow-[0_14px_36px_rgba(18,24,33,0.08)]" role="alert">
        <p className="text-xs font-black text-[#D84F40]">신청 상태를 불러오지 못했어요</p>
        <h2 className="mt-1 text-lg font-black text-boot-ink">참여 전 화면으로 되돌리지 않았어요</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
          저장된 신청이 사라진 것은 아니에요. 연결을 다시 확인해 주세요.
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
  if (!participation) return <>{fallback}</>

  return (
    <QuantumParticipationCommandCenter
      participation={participation}
      applicantStats={stats[participation.event_id]}
      placement="home"
    />
  )
}
