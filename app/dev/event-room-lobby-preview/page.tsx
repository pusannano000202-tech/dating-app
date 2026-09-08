import { notFound } from 'next/navigation'
import Link from 'next/link'

import QuantumEventRoomLobby from '@/components/matching/QuantumEventRoomLobby'
import QuantumRoleGuessing from '@/components/matching/QuantumRoleGuessing'
import QuantumSecretRoleCard from '@/components/matching/QuantumSecretRoleCard'
import type { QuantumMySecretRole, QuantumRoleGuessState } from '@/lib/matching/quantum-secret-roles'

const previewRole = {
  role: 'bridge',
  occurrenceId: '11111111-1111-4111-8111-111111111111',
  label: '대화의 다리',
  safetyCopy: '사생활·연락처·외모를 묻거나 평가하지 않고, 답변과 행동을 강요하지 않아요.',
  mission: '속도가 다른 참가자가 원할 때 자연스럽게 대화에 연결해요.',
  eventKey: 'tonight-onsenjjang-run',
  canChange: false,
  roleConfirmed: true,
  applicationConfirmed: true,
  startsAt: '2026-08-15T10:30:00Z',
} satisfies QuantumMySecretRole

const previewGuessState = {
  status: 'revealed',
  revealAt: '2026-08-15T14:00:00Z',
  submitted: true,
  revealAvailable: true,
  targets: [
    { seatLabel: '참가자 A', guessedRole: 'explorer', answerRole: 'explorer', correct: true },
    { seatLabel: '참가자 B', guessedRole: 'reactor', answerRole: 'observer', correct: false },
    { seatLabel: '참가자 C', guessedRole: 'pace_maker', answerRole: 'pace_maker', correct: true },
    { seatLabel: '참가자 D', guessedRole: 'observer', answerRole: 'reactor', correct: false },
  ],
} satisfies QuantumRoleGuessState

export default async function EventRoomLobbyPreviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ phase?: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const phase = (await searchParams)?.phase
  const showAfterMeeting = phase === 'after'

  return (
    <main className="min-h-screen bg-[#FFF8F5] px-4 py-6 text-boot-ink">
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-xs font-black text-[#E65D4D]">개발 미리보기 · 실제 저장 안 됨</p>
        <h1 className="mt-1 text-2xl font-black">자동 편성 방과 친구 초대</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
          첫 참가자는 1팀에 들어가고, 팀이 차면 2팀과 3팀이 순서대로 열려요. 친구 초대는 내 팀의 같은 성별 자리 하나를 15분 동안 잡아둡니다.
        </p>
        <p className="mt-3 border-l-2 border-boot-coral bg-white px-4 py-3 text-xs font-bold leading-5 text-boot-muted">
          아래 팝업은 실제 API와 같은 취향 카드 항목만 보여줘요. 사진·실명·학과·연락처·외모점수는 포함하지 않은 안전한 예시입니다.
        </p>

        <nav aria-label="역할 화면 상태" className="mt-5 grid grid-cols-2 gap-2 rounded-lg border border-[#E7CFC9] bg-white p-2">
          <Link
            href="/dev/event-room-lobby-preview?phase=before"
            aria-current={!showAfterMeeting ? 'page' : undefined}
            className={`flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-black ${!showAfterMeeting ? 'bg-boot-coral text-white' : 'text-boot-muted'}`}
          >
            만남 전
          </Link>
          <Link
            href="/dev/event-room-lobby-preview?phase=after"
            aria-current={showAfterMeeting ? 'page' : undefined}
            className={`flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-black ${showAfterMeeting ? 'bg-boot-coral text-white' : 'text-boot-muted'}`}
          >
            만남 후
          </Link>
        </nav>

        <QuantumEventRoomLobby
          eventId="tonight-onsenjjang-run"
          eventMode="tonight"
          roomLabel="A방"
          roomCode="A7RUN1"
          myPartySize={2}
          preview
          initialCardOpen
        />

        <div className="mt-6 space-y-5">
          <QuantumSecretRoleCard
            occurrenceId={previewRole.occurrenceId}
            initialRole={previewRole}
          />
          <QuantumRoleGuessing
            matchId="22222222-2222-4222-8222-222222222222"
            meetingCompleted={showAfterMeeting}
            initialState={showAfterMeeting ? previewGuessState : null}
          />
        </div>
      </div>
    </main>
  )
}
