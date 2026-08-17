import Link from 'next/link'
import { notFound } from 'next/navigation'

import { QuantumEventSavedStage } from '@/components/matching/QuantumEventApplicationStatus'
import type { QuantumEventLifecycle, QuantumEventLifecycleStage } from '@/lib/matching/quantum-event-lifecycle'

const STAGES = ['confirmed', 'chat_open', 'in_progress', 'completed'] as const
type PreviewStage = typeof STAGES[number]

export default async function EventPrivacyPreviewPage(
  props: {
    searchParams: Promise<{ stage?: string }>
  }
) {
  const searchParams = await props.searchParams;
  if (process.env.NODE_ENV === 'production') notFound()

  const stage: PreviewStage = STAGES.includes(searchParams.stage as PreviewStage)
    ? searchParams.stage as PreviewStage
    : 'confirmed'
  const lifecycle = createLifecycle(stage)

  return (
    <main className="min-h-screen bg-[#EAF7F5] px-4 py-6 text-boot-ink">
      <div className="mx-auto w-full max-w-xl">
        <p className="text-xs font-black text-[#E65D4D]">개발 미리보기 · 실제 저장 안 됨</p>
        <h1 className="mt-1 text-2xl font-black">만남 전후 프로필 공개 경계</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
          만남 전에는 사진 없이 행사 가명만 사용하고, 종료 처리와 자동 친구 연결이 끝난 뒤에만 친구 프로필 버튼이 열립니다.
        </p>
        <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="미리 볼 단계">
          {STAGES.map((item) => (
            <Link
              key={item}
              href={`/dev/event-privacy-preview?stage=${item}`}
              className={`flex min-h-11 items-center justify-center rounded-md px-3 text-xs font-black ${stage === item ? 'bg-[#147A70] text-white' : 'border border-[#c9dcda] bg-white text-[#315F5B]'}`}
            >
              {stageLabel(item)}
            </Link>
          ))}
        </nav>
        <QuantumEventSavedStage lifecycle={lifecycle} stage={stage} devPreview />
      </div>
    </main>
  )
}

function createLifecycle(stage: PreviewStage): QuantumEventLifecycle {
  const now = new Date('2026-08-13T20:00:00+09:00')
  const startsAt = new Date('2026-08-13T19:30:00+09:00')
  const endsAt = new Date('2026-08-13T21:00:00+09:00')

  return {
    occurrence_id: '11111111-1111-4111-8111-111111111111',
    room_number: 1,
    room_label: '1팀',
    room_code: 'A7RUN1',
    event_id: 'tonight-onsenjjang-run',
    event_mode: 'tonight',
    party_type: 'solo',
    group_id: null,
    status: stage === 'completed' ? 'completed' : 'confirmed',
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    chat_opens_at: new Date(startsAt.getTime() - 20 * 60_000).toISOString(),
    server_now: now.toISOString(),
    match_id: '22222222-2222-4222-8222-222222222222',
    location_name: '온천장역 1번 출구',
    cancel_reason: null,
    participant_counts: { total: 5, male: 3, female: 2, required_total: 5 },
    party_members: [{
      user_id: '33333333-3333-4333-8333-333333333333',
      display_name: '나',
      avatar_url: null,
    }],
    review_required: stage === 'completed',
    updated_at: now.toISOString(),
  }
}

function stageLabel(stage: Exclude<QuantumEventLifecycleStage, 'recruiting' | 'cancelled'>) {
  if (stage === 'confirmed') return '확정'
  if (stage === 'chat_open') return '채팅 오픈'
  if (stage === 'in_progress') return '진행 중'
  return '만남 완료'
}
