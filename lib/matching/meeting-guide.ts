export type MeetingGuideDialogue = Readonly<{
  speaker: string
  text: string
  lines: readonly string[]
  side: 'left' | 'right'
  tone: 'participant' | 'quantum' | 'warning'
}>

export type MeetingGuideScene = Readonly<{
  stepNumber: number
  eyebrow: string
  title: string
  description: string
  dialogue: readonly MeetingGuideDialogue[]
  imageCell: Readonly<{ row: number; column: number }>
}>

export const MEETING_GUIDE_SCENES: readonly MeetingGuideScene[] = [
  {
    stepNumber: 1,
    eyebrow: '만나기 20분 전',
    title: '팀 채팅에서 도착 위치를 나눠요',
    description: '확정된 참가자끼리만 채팅방이 열려요. 길을 헤매거나 조금 늦을 때 먼저 알려주세요.',
    dialogue: [
      { speaker: '참가자', text: '온천장역 3번 출구에 도착했어요.', lines: ['온천장역 3번 출구에', '도착했어요.'], side: 'left', tone: 'participant' },
      { speaker: 'Quantum', text: '약속 20분 전부터 팀 채팅이 열려요.', lines: ['약속 20분 전부터', '팀 채팅이 열려요.'], side: 'right', tone: 'quantum' },
    ],
    imageCell: { row: 0, column: 0 },
  },
  {
    stepNumber: 2,
    eyebrow: '서로 편한 만남',
    title: '외부 연락처는 요구하지 않아요',
    description: '전화번호, 카카오톡, 인스타그램을 요구하거나 압박하지 않아요. 다시 보고 싶다면 Quantum 안에서 연락해요.',
    dialogue: [
      { speaker: '참가자', text: '연락은 Quantum 안에서만 해도 괜찮아요.', lines: ['연락은 Quantum', '안에서만 해도 괜찮아요.'], side: 'left', tone: 'participant' },
      { speaker: 'Quantum', text: '불편한 연락처 요구는 바로 신고할 수 있어요.', lines: ['불편한 연락처 요구는', '바로 신고할 수 있어요.'], side: 'right', tone: 'warning' },
    ],
    imageCell: { row: 0, column: 1 },
  },
  {
    stepNumber: 3,
    eyebrow: '90~150분 콘텐츠',
    title: '준비된 활동이 끝나면 편하게 귀가해요',
    description: 'Quantum이 준비한 미션을 함께 즐겨요. 이후 2차나 추가 만남을 원하지 않는 사람에게 계속 권하지 않아요.',
    dialogue: [
      { speaker: '참가자', text: '오늘 미션까지 즐거웠어요. 저는 먼저 갈게요.', lines: ['오늘 미션까지 즐거웠어요.', '저는 먼저 갈게요.'], side: 'left', tone: 'participant' },
      { speaker: 'Quantum', text: '좋아요. 편하게 마쳐요.', lines: ['좋아요.', '편하게 마쳐요.'], side: 'right', tone: 'quantum' },
    ],
    imageCell: { row: 1, column: 0 },
  },
  {
    stepNumber: 4,
    eyebrow: '참석 확인',
    title: '함께 찍은 사진으로 만남을 남겨요',
    description: '참가자 단체 사진은 참석 확인 자료로 사용해요. 만남 사진첩 자동 저장은 서버 연결 뒤 제공됩니다.',
    dialogue: [
      { speaker: '참가자', text: '다 같이 한 장 찍고 오늘 만남을 남겨요.', lines: ['다 같이 한 장 찍고', '오늘 만남을 남겨요.'], side: 'left', tone: 'participant' },
      { speaker: 'Quantum', text: '사진첩 연결 전에는 참석 자료로만 보관해요.', lines: ['사진첩 연결 전에는', '참석 자료로만 보관해요.'], side: 'right', tone: 'quantum' },
    ],
    imageCell: { row: 1, column: 1 },
  },
  {
    stepNumber: 5,
    eyebrow: '보증금과 정산',
    title: '1만원은 돌려받거나 다음 만남에 이어 써요',
    description: '정상 참여 후 보증금 전액 반환 또는 다음 매칭 이월을 선택해요. Quantum 후원은 보증금과 별도예요.',
    dialogue: [
      { speaker: 'Quantum', text: '보증금은 반환하거나 다음 만남에 이월해요.', lines: ['보증금은 반환하거나', '다음 만남에 이월해요.'], side: 'right', tone: 'quantum' },
    ],
    imageCell: { row: 2, column: 0 },
  },
  {
    stepNumber: 6,
    eyebrow: '마지막 약속',
    title: '행사 전용 가명으로 가볍게 인사해요',
    description: '처음 만나는 자리에서는 본명 대신 프로필에서 정한 가명을 사용해요. 신뢰 확인은 Quantum이 맡아요.',
    dialogue: [
      { speaker: '참가자', text: '오늘은 별빛으로 불러주세요.', lines: ['오늘은 별빛으로', '불러주세요.'], side: 'left', tone: 'participant' },
      { speaker: 'Quantum', text: '좋아요. 편하게 만나러 가요.', lines: ['좋아요.', '편하게 만나러 가요.'], side: 'right', tone: 'quantum' },
    ],
    imageCell: { row: 2, column: 1 },
  },
] as const
