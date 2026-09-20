export type MeetingCoachingCardId = 'introduce' | 'begin' | 'conversation' | 'wrap'
export type MeetingCoachingCard = Readonly<{ id: MeetingCoachingCardId; title: string; action: string; example: string; note: string; illustration: string }>
export type MeetingCoachingCue = Readonly<{ cardId: string; label: string }>
/** A display mode only. The caller must verify its own meeting authorization/time. */
export function resolveMeetingCoachingMode(input: { preview?: boolean; unlocked?: boolean }): 'preview' | 'unlocked' {
  return input.preview === false && input.unlocked === true ? 'unlocked' : 'preview'
}

export function getMeetingCoachingCards(audience: 'singles' | 'couples' = 'singles', activityKind?: string): readonly MeetingCoachingCard[] {
  const game = activityKind === 'board_game' || activityKind === 'game'
  const introductionIllustration = audience === 'couples'
    ? '/images/match/couple-comic-20260915.webp'
    : '/images/match/five-meeting/scene-guides/day1-introduction.webp'
  return [
    {
      id: 'introduce', title: '별명으로 가볍게 소개해요',
      action: audience === 'couples'
        ? '각자 불리고 싶은 이름과 취향 하나씩.'
        : '불리고 싶은 이름과 좋아하는 것 하나씩.',
      example: '“저는 구름이에요. 빵집 구경을 좋아해요.”',
      note: '실명 대신 별명으로 소개해도 괜찮아요. 학과·연락처 등 개인 정보는 말하고 싶을 때만. 소개를 쉬어가도 괜찮아요.',
      illustration: introductionIllustration,
    },
    {
      id: 'begin', title: game ? '한 번 연습하고 시작해요' : '오늘의 활동을 같이 확인해요',
      action: game
        ? '규칙을 함께 읽고 모르는 건 물어봐요.'
        : '활동 순서와 필요한 배려를 함께 확인해요.',
      example: game ? '“처음이면 같이 한 번 연습해 볼까요?”' : '“이 순서로 시작해도 다들 괜찮아요?”',
      note: '활동은 실제로 선택한 내용을 따라가요. 모두가 편하게 참여하는 게 먼저예요. 불편한 활동은 쉬거나 넘어가도 괜찮아요.',
      illustration: introductionIllustration,
    },
    {
      id: 'conversation', title: '첫인상 한마디, 원한다면',
      action: '대화에서 고마웠던 행동을 짧게 나눠요.',
      example: '“제 말을 끝까지 들어줘서 편했어요.”',
      note: '말하는 사람도 듣는 사람도 원할 때만 해요. 외모 평가·점수·순위·누군가를 고르는 활동은 하지 않아요. 한마디를 말하지 않고 넘어가도 괜찮아요. 이 화면은 답변을 입력받거나 저장하지 않아요.',
      illustration: audience === 'couples' ? introductionIllustration : '/images/match/five-meeting/scene-guides/day1-one-line-impression.webp',
    },
    {
      id: 'wrap', title: '좋았던 순간으로 마무리해요',
      action: '즐거웠던 순간을 나누고 귀가를 확인해요.',
      example: '“같이 웃어서 좋았어요. 조심히 가요!”',
      note: '사진은 모두가 동의할 때만. 다음 만남은 실제 진행 화면에서 각자의 의사를 따로 확인해요.',
      illustration: introductionIllustration,
    },
  ]
}

export function moveMeetingCoachingCard(index: number, direction: -1 | 1, count: number): number {
  const last = Number.isFinite(count) ? Math.max(0, Math.trunc(count) - 1) : 0
  const current = Math.min(last, Math.max(0, Number.isFinite(index) ? Math.trunc(index) : 0))
  return Math.min(last, Math.max(0, current + direction))
}

/** The caller owns schedule and participation checks; this helper only accepts a display cue. */
export function resolveMeetingCoachingCue(
  cards: readonly MeetingCoachingCard[],
  mode: ReturnType<typeof resolveMeetingCoachingMode>,
  cue?: MeetingCoachingCue,
): Readonly<{ index: number; label: string }> | null {
  if (mode !== 'unlocked' || !cue || typeof cue.cardId !== 'string' || typeof cue.label !== 'string') return null
  const label = cue.label.trim()
  const index = cards.findIndex(card => card.id === cue.cardId)
  return index < 0 || !label ? null : { index, label }
}

/** Horizontal intent must be clear; vertical scrolling must never turn a scene. */
export function meetingCoachingSwipeDirection(deltaX: number, deltaY: number): -1 | 1 | null {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return null
  if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.35) return null
  return deltaX < 0 ? 1 : -1
}
