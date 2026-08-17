import Link from 'next/link'
import { notFound } from 'next/navigation'

import QuantumParticipationCommandCenter from '@/components/matching/QuantumParticipationCommandCenter'
import type {
  QuantumEventLifecycle,
  QuantumEventStoredStatus,
} from '@/lib/matching/quantum-event-lifecycle'

const states = [
  'recruiting',
  'confirmed',
  'chat_open',
  'in_progress',
  'cancelled',
  'completed',
] as const

type PreviewState = (typeof states)[number]

export default async function EventLifecyclePreviewPage(
  props: {
    searchParams?: Promise<{ state?: string }>
  }
) {
  const searchParams = await props.searchParams;
  if (process.env.NODE_ENV === 'production') notFound()

  const selected = states.includes(searchParams?.state as PreviewState)
    ? searchParams?.state as PreviewState
    : 'recruiting'
  const fixture = buildFixture(selected)

  return (
    <main className="min-h-screen bg-[#EAF7F5] px-4 py-6 text-boot-ink">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs font-black text-[#E65D4D]">개발 미리보기 · 실제 저장 안 됨</p>
        <h1 className="mt-1 text-2xl font-black">참여 이후 화면 상태</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
          같은 디자인이 모집, 확정, 채팅, 진행, 취소, 후기 단계에 맞춰 바뀌는지 비교합니다.
        </p>

        <nav aria-label="미리보기 상태" className="mt-4 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {states.map((state) => (
            <Link
              key={state}
              href={`/dev/event-lifecycle-preview?state=${state}`}
              aria-current={state === selected ? 'page' : undefined}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${state === selected ? 'bg-boot-primary text-white' : 'border border-boot-hairline bg-white text-boot-body'}`}
            >
              {labelState(state)}
            </Link>
          ))}
        </nav>

        <div className="mt-4">
          <QuantumParticipationCommandCenter participation={fixture} placement="preview" />
        </div>
      </div>
    </main>
  )
}

function buildFixture(state: PreviewState): QuantumEventLifecycle {
  const status: QuantumEventStoredStatus = state === 'cancelled'
    ? 'cancelled'
    : state === 'completed'
      ? 'completed'
      : state === 'recruiting'
        ? 'recruiting'
        : 'confirmed'
  const nowByState: Record<PreviewState, string> = {
    recruiting: '2026-08-11T09:00:00.000Z',
    confirmed: '2026-08-11T11:20:00.000Z',
    chat_open: '2026-08-11T11:45:00.000Z',
    in_progress: '2026-08-11T12:20:00.000Z',
    cancelled: '2026-08-11T10:00:00.000Z',
    completed: '2026-08-11T14:20:00.000Z',
  }

  return {
  occurrence_id: '83a1a5ce-1b3d-4a0e-9d50-d3a3e620398a',
  room_number: 1,
  room_label: 'A방',
  room_code: 'A1B2C3',
    event_id: 'tonight-onsenjjang-run',
    event_mode: 'tonight',
    party_type: 'friends',
    group_id: '31a4bd93-63ec-4437-a22d-5a939617c402',
    status,
    starts_at: '2026-08-11T12:00:00.000Z',
    ends_at: '2026-08-11T14:00:00.000Z',
    chat_opens_at: '2026-08-11T11:40:00.000Z',
    server_now: nowByState[state],
    match_id: state === 'recruiting' || state === 'cancelled'
      ? null
      : '0c9da21c-529f-42ba-ad93-0b0d5223b88d',
    location_name: state === 'recruiting' ? null : '온천장역 3번 출구',
    cancel_reason: state === 'cancelled' ? 'minimum_participants_not_met' : null,
    participant_counts: {
      total: state === 'recruiting' ? 3 : 5,
      male: state === 'recruiting' ? 2 : 3,
      female: state === 'recruiting' ? 1 : 2,
      required_total: 5,
    },
    party_members: [
      { user_id: '9dcbf872-749d-4f05-b0dc-d317554b28a5', display_name: '나', avatar_url: null },
      { user_id: '10fb4f91-b03a-4a49-a689-82fa66fc9ff8', display_name: '민지', avatar_url: null },
    ],
    review_required: state === 'completed',
    updated_at: '2026-08-11T08:55:00.000Z',
  }
}

function labelState(state: PreviewState) {
  return {
    recruiting: '모집 중',
    confirmed: '확정',
    chat_open: '채팅 열림',
    in_progress: '진행 중',
    cancelled: '취소',
    completed: '후기',
  }[state]
}
