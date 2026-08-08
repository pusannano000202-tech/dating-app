export type TonightEventKind = 'dinner' | 'jogging' | 'board-game' | 'drinks';

export type TonightEvent = {
  id: string;
  kind: TonightEventKind;
  scheduleType: 'tonight' | 'scheduled';
  eyebrow: string;
  title: string;
  description: string;
  venue: string;
  meetingTime: string;
  capacity: 5;
  remaining: number;
  imageKey: TonightEventKind;
};

export const tonightEvents: readonly TonightEvent[] = [
  {
    id: 'tonight-dinner-oncheonjang',
    kind: 'dinner',
    scheduleType: 'tonight',
    eyebrow: '가볍게 시작하기',
    title: '온천장에서 저녁 먹기',
    description: '메뉴와 자리는 Quantum이 정해요. 다섯 명이 편하게 식사부터 시작해요.',
    venue: '온천장역 도보 5분',
    meetingTime: '오늘 19:30',
    capacity: 5,
    remaining: 2,
    imageKey: 'dinner',
  },
  {
    id: 'tonight-jogging-oncheoncheon',
    kind: 'jogging',
    scheduleType: 'tonight',
    eyebrow: '운동으로 만나기',
    title: '온천천 밤 조깅',
    description: '무리하지 않는 속도로 달리고 편의점 음료로 마무리하는 짧은 만남이에요.',
    venue: '온천천 산책로',
    meetingTime: '오늘 20:30',
    capacity: 5,
    remaining: 3,
    imageKey: 'jogging',
  },
  {
    id: 'tonight-boardgame-jangjeon',
    kind: 'board-game',
    scheduleType: 'tonight',
    eyebrow: '말문이 쉽게 트이는 밤',
    title: '장전동 보드게임',
    description: '규칙이 쉬운 게임만 골라요. 처음 만난 사람과도 자연스럽게 이야기할 수 있어요.',
    venue: '부산대 정문 앞',
    meetingTime: '오늘 20:00',
    capacity: 5,
    remaining: 1,
    imageKey: 'board-game',
  },
  {
    id: 'tonight-drinks-geumjeong',
    kind: 'drinks',
    scheduleType: 'tonight',
    eyebrow: '늦은 저녁 한 잔',
    title: '금강로 가벼운 술자리',
    description: '과음 없이 한 자리에서 대화해요. 장소와 종료 시간은 Quantum이 미리 정해요.',
    venue: '금강로 핵심 상권',
    meetingTime: '오늘 21:00',
    capacity: 5,
    remaining: 2,
    imageKey: 'drinks',
  },
] as const;

export const scheduledEvents: readonly TonightEvent[] = [
  {
    id: 'scheduled-boardgame-0813',
    kind: 'board-game',
    scheduleType: 'scheduled',
    eyebrow: '목요일 저녁 약속',
    title: '초보 보드게임 다섯 명',
    description: '설명하기 쉬운 게임부터 시작해요. 혼자 참여하거나 같은 성별 친구와 함께 신청할 수 있어요.',
    venue: '부산대 정문 앞',
    meetingTime: '8월 13일 목요일 · 19:30',
    capacity: 5,
    remaining: 3,
    imageKey: 'board-game',
  },
  {
    id: 'scheduled-jogging-0814',
    kind: 'jogging',
    scheduleType: 'scheduled',
    eyebrow: '금요일 밤 운동',
    title: '온천천 천천히 달리기',
    description: '대화할 수 있는 속도로 달리고 함께 음료를 마셔요. 운동 경험이 없어도 참여할 수 있어요.',
    venue: '온천천 산책로',
    meetingTime: '8월 14일 금요일 · 20:00',
    capacity: 5,
    remaining: 2,
    imageKey: 'jogging',
  },
  {
    id: 'scheduled-dinner-0815',
    kind: 'dinner',
    scheduleType: 'scheduled',
    eyebrow: '토요일 저녁 식사',
    title: '온천장에서 같이 저녁 먹기',
    description: '메뉴와 식당은 Quantum이 정하고 예약해요. 정해진 시간에 바로 만나면 됩니다.',
    venue: '온천장역 생활권',
    meetingTime: '8월 15일 토요일 · 18:30',
    capacity: 5,
    remaining: 1,
    imageKey: 'dinner',
  },
  {
    id: 'scheduled-drinks-0819',
    kind: 'drinks',
    scheduleType: 'scheduled',
    eyebrow: '다음 주 수요일',
    title: '금강로 가벼운 한 잔',
    description: '종료 시간을 먼저 정한 짧은 술자리예요. 과음 없이 대화를 중심으로 진행합니다.',
    venue: '금강로 핵심 상권',
    meetingTime: '8월 19일 수요일 · 20:00',
    capacity: 5,
    remaining: 2,
    imageKey: 'drinks',
  },
] as const;
