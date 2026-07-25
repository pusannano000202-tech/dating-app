export type CampusSevenGuideTone = 'notice' | 'action' | 'reveal' | 'closing'

export type CampusSevenGuideMessage = {
  id: string
  at: string
  tone: CampusSevenGuideTone
  title: string
  body: string
  actionLabel: string | null
}

export type CampusSevenLiveGuide = {
  phase: 'before' | 'live' | 'complete'
  isLive: boolean
  dayLabel: string
  progressPercent: number
  currentMessage: CampusSevenGuideMessage | null
  messages: CampusSevenGuideMessage[]
  nextUnlockAt: string | null
}

export type CampusSevenLiveGuideInput = {
  dayNumber: number
  startsAt: string
  endsAt: string
  now?: string
  venueName?: string | null
  meetingPointName?: string | null
}

export function getCampusSevenRefreshDelay(input: {
  nextUnlockAt: string | null
  now?: string
}): number | null {
  if (!input.nextUnlockAt) return null
  const unlockMs = parseTime(input.nextUnlockAt, 'next_unlock')
  const nowMs = parseTime(input.now ?? new Date().toISOString(), 'now')
  return Math.max(250, unlockMs - nowMs + 250)
}

type GuideCue = Omit<CampusSevenGuideMessage, 'at' | 'id'> & {
  offsetMinutes: number
  key: string
}

const DAY_CUES: Record<number, readonly GuideCue[]> = {
  1: [
    cue(-20, 'arrival', 'notice', '첫 장면까지 20분', '집결지에 도착하면 앱에서 오늘의 장소를 다시 확인해 주세요.', '도착 준비'),
    cue(0, 'opening', 'reveal', '첫 장면이 시작됐어요', '휴대폰은 잠시 내려두고 닉네임으로 천천히 인사해 주세요.'),
    cue(55, 'move', 'action', '자리를 바꿀 시간이에요', '안내된 순서대로 한 자리씩 이동해 새로운 사람과 이야기해 주세요.'),
    cue(110, 'focus', 'notice', '한 사람에게 더 집중해 보세요', '남은 시간에는 궁금했던 이야기를 하나 먼저 건네보세요.'),
    cue(155, 'heart', 'closing', '오늘의 마음 기록이 열렸어요', '다른 사람에게는 보이지 않아요. 지금 마음을 솔직하게 남겨주세요.', '비공개로 기록하기'),
  ],
  2: [
    cue(-20, 'arrival', 'notice', '오늘의 장소가 열렸어요', '표시된 장소로 바로 이동하고 혼자 불편하면 안전 버튼을 눌러주세요.', '장소 확인'),
    cue(0, 'opening', 'reveal', '새로운 장면이 시작됐어요', '오늘 함께할 팀을 확인하고 서로의 닉네임부터 불러주세요.', '내 팀 확인'),
    cue(50, 'question', 'action', '첫 번째 질문이 도착했어요', '최근 가장 기대되는 일을 한 사람씩 이야기해 보세요.'),
    cue(105, 'switch', 'notice', '대화의 방향을 바꿔볼까요', '취향보다 서로 편해지는 방식에 대해 물어보세요.'),
    cue(155, 'closing', 'closing', '오늘 장면을 마무리할게요', '안전하게 귀가한 뒤 다음 안내가 올 때까지 오늘의 대화를 그대로 간직해 주세요.'),
  ],
  3: [
    cue(-20, 'arrival', 'notice', '집결 안내가 도착했어요', '오늘의 집결지에 도착한 뒤 일행과 함께 이동해 주세요.', '집결지 확인'),
    cue(0, 'opening', 'reveal', '여덟 명의 저녁이 시작됐어요', '가장 가까운 사람부터 가볍게 오늘 하루를 나눠주세요.'),
    cue(60, 'move', 'action', '다음 자리로 이동해 주세요', '앱에 표시된 방향으로 이동하고 새로운 대화를 시작해 주세요.'),
    cue(120, 'focus', 'notice', '표정과 말투에 집중해 보세요', '결론을 내리기보다 상대가 편하게 말할 시간을 만들어 주세요.'),
    cue(155, 'heart', 'closing', '오늘의 마음 기록이 열렸어요', '오늘 더 알아가고 싶었던 한 사람과 그 이유를 비공개로 남겨주세요.', '비공개로 기록하기'),
  ],
  4: [
    cue(-20, 'arrival', 'notice', '게임 장소가 열렸어요', '집결지에서 모두 만난 뒤 안내된 장소로 함께 이동해 주세요.', '장소 확인'),
    cue(0, 'opening', 'reveal', '오늘의 팀이 공개됐어요', '팀원을 확인하고 첫 게임 준비를 시작해 주세요.', '내 팀 확인'),
    cue(45, 'round-two', 'action', '다음 게임을 시작해 주세요', '점수보다 팀원이 편하게 참여하는지 먼저 살펴주세요.'),
    cue(100, 'round-three', 'action', '마지막 승부가 열렸어요', '서로 응원하면서 남은 게임을 마무리해 주세요.'),
    cue(155, 'rank', 'closing', '결과를 기록할 시간이에요', '화면에 표시된 순위를 확인하고 팀 대표가 제출해 주세요.', '순위 기록하기'),
  ],
  5: [
    cue(-20, 'arrival', 'notice', '오늘의 목적지가 열렸어요', '표시된 장소로 바로 이동해 주세요. 이동이 불편하면 안전 이탈을 사용할 수 있어요.', '목적지 확인'),
    cue(0, 'opening', 'reveal', '오늘은 조금 더 솔직해지는 날이에요', '공개된 이름을 천천히 불러보고 지금까지 궁금했던 점을 물어보세요.'),
    cue(55, 'mission', 'action', '오늘의 대화 미션이 도착했어요', '서로의 평범한 하루에서 닮은 점 하나를 찾아보세요.'),
    cue(110, 'focus', 'notice', '마지막 대화를 시작해 주세요', '부담 없는 속도로 상대의 생각을 끝까지 들어주세요.'),
    cue(155, 'heart', 'closing', '오늘의 마음 기록이 열렸어요', '지금 더 알아가고 싶은 사람을 비공개로 남겨주세요.', '비공개로 기록하기'),
  ],
  6: [
    cue(-420, 'date-choice-open', 'action', '특별 데이트 선택이 열렸어요', '사진을 보고 함께할 한 사람에게 비공개 요청을 보내세요.', '상대 선택하기'),
    cue(-240, 'date-choice-close', 'closing', '특별 데이트 요청이 마감됐어요', '도착한 요청은 오후 5시까지 수락하거나 거절할 수 있어요.'),
    cue(-120, 'date-response-close', 'notice', '응답 마감까지 2시간', '아직 답하지 않은 요청이 있다면 내 마음과 안전을 먼저 생각해 선택해 주세요.', '요청 확인하기'),
    cue(-20, 'arrival', 'notice', '약속 장소가 열렸어요', '선택에 동의한 두 사람에게만 오늘 장소가 표시됩니다.', '장소 확인'),
    cue(0, 'opening', 'reveal', '둘만의 장면이 시작됐어요', '오늘은 정답을 찾기보다 서로에게 편한 속도를 확인해 보세요.'),
    cue(55, 'question', 'action', '한 가지 질문을 건네볼까요', '이 프로그램이 끝난 뒤 함께 해보고 싶은 평범한 일을 물어보세요.'),
    cue(110, 'check', 'notice', '서로의 상태를 확인해 주세요', '불편하거나 피곤하면 언제든 먼저 마무리해도 괜찮아요.'),
    cue(155, 'closing', 'closing', '오늘의 장면이 끝났어요', '안전하게 귀가한 뒤 마지막 안내를 기다려 주세요.'),
  ],
  7: [
    cue(-20, 'arrival', 'notice', '마지막 집결지가 열렸어요', '모두 만난 뒤 함께 이동해 주세요. 오늘도 안전 이탈은 항상 가능합니다.', '집결지 확인'),
    cue(0, 'opening', 'reveal', '마지막 저녁이 시작됐어요', '지금까지의 시간을 떠올리며 한 사람씩 편하게 인사해 주세요.'),
    cue(60, 'move', 'action', '다음 사람과 이야기해 주세요', '화면에 표시된 순서대로 자리를 바꿔주세요.'),
    cue(150, 'focus', 'notice', '마지막 대화를 시작해 주세요', '결과를 예상하기보다 지금 전하고 싶은 말을 남겨주세요.'),
    cue(240, 'final', 'closing', '최종 선택이 열렸어요', '거절과 선택은 모두 비공개입니다. 누구의 선택도 강요되지 않아요.', '최종 선택하기'),
  ],
}

export function getCampusSevenGuideCueSchedule(): Array<{
  dayNumber: number
  key: string
  offsetMinutes: number
}> {
  return Object.entries(DAY_CUES).flatMap(([dayNumber, cues]) => (
    cues.map((item) => ({
      dayNumber: Number(dayNumber),
      key: item.key,
      offsetMinutes: item.offsetMinutes,
    }))
  ))
}

export function getCampusSevenLiveGuide(input: CampusSevenLiveGuideInput): CampusSevenLiveGuide {
  const startMs = parseTime(input.startsAt, 'startsAt')
  const endMs = parseTime(input.endsAt, 'endsAt')
  const nowMs = parseTime(input.now ?? new Date().toISOString(), 'now')
  if (endMs <= startMs) throw new Error('campus_seven_invalid_schedule')

  const cues = DAY_CUES[input.dayNumber]
  if (!cues) throw new Error('campus_seven_invalid_day')

  const messages = cues
    .map((item) => toMessage(input.dayNumber, startMs, item, input))
    .filter((message) => Date.parse(message.at) <= Math.min(nowMs, endMs))
  const nextMessage = nowMs < endMs
    ? cues
        .map((item) => toMessage(input.dayNumber, startMs, item, input))
        .find((message) => Date.parse(message.at) > nowMs && Date.parse(message.at) <= endMs) ?? null
    : null
  const phase = nowMs < startMs ? 'before' : nowMs >= endMs ? 'complete' : 'live'
  const elapsedRatio = (nowMs - startMs) / (endMs - startMs)

  return {
    phase,
    isLive: phase === 'live',
    dayLabel: `DAY ${input.dayNumber}`,
    progressPercent: phase === 'before' ? 0 : phase === 'complete' ? 100 : Math.round(clamp(elapsedRatio, 0, 1) * 100),
    currentMessage: messages[messages.length - 1] ?? null,
    messages,
    nextUnlockAt: nextMessage?.at ?? null,
  }
}

function cue(
  offsetMinutes: number,
  key: string,
  tone: CampusSevenGuideTone,
  title: string,
  body: string,
  actionLabel: string | null = null,
): GuideCue {
  return { offsetMinutes, key, tone, title, body, actionLabel }
}

function toMessage(
  dayNumber: number,
  startMs: number,
  item: GuideCue,
  input: CampusSevenLiveGuideInput,
): CampusSevenGuideMessage {
  const location = input.meetingPointName ?? input.venueName
  const body = item.key === 'arrival' && location
    ? `${location}에서 만나요. ${item.body}`
    : item.body

  return {
    id: `day-${dayNumber}-${item.key}`,
    at: new Date(startMs + item.offsetMinutes * 60_000).toISOString(),
    tone: item.tone,
    title: item.title,
    body,
    actionLabel: item.actionLabel,
  }
}

function parseTime(value: string, field: string): number {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) throw new Error(`campus_seven_invalid_${field}`)
  return parsed
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
