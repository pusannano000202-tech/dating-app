export type MeetingGuideScene = Readonly<{
  stepNumber: number;
  title: string;
  description: string;
  details: readonly string[];
  dialogue: readonly MeetingGuideDialogueBubble[];
  imageCell: Readonly<{
    row: number;
    column: number;
  }>;
}>;

export type MeetingGuideDialogueTone = 'participant' | 'quantum' | 'warning';

export type MeetingGuideDialogueBubble = Readonly<{
  id: string;
  speaker: '참가자' | '팀원' | 'Quantum';
  text: string;
  tone: MeetingGuideDialogueTone;
  side: 'left' | 'right';
}>;

export type MeetingGuideGrid = Readonly<{
  columns: number;
  rows: number;
}>;

export type MeetingGuideImageLayout = Readonly<{
  posterWidth: number;
  posterHeight: number;
  cellWidth: number;
  cellHeight: number;
}>;

export const MEETING_GUIDE_GRID: MeetingGuideGrid = {
  columns: 2,
  rows: 3,
} as const;

export const GUIDE_POSTER_ASPECT_RATIO = 1821 / 864;

export const MEETING_GUIDE_VOLUNTARY_SUPPORT_OPTIONS = ['0원', '1,000원', '2,000원', '3,000원', '직접입력'] as const;

export const MEETING_GUIDE_MIN_TOUCH_TARGET = 44;

export const GUIDE_NAVIGATION_LABELS = {
  previous: '이전',
  next: '다음',
  finish: '완료',
} as const;

const ORIGINAL_MEETING_GUIDE_SCENES: readonly MeetingGuideScene[] = [
  {
    stepNumber: 1,
    title: '1. 행사 전용 가명',
    description:
      '행사에서는 행사 전용 가명을 사용합니다. 앱이 제시한 가명을 쓰거나, 본인이 직접 고른 가명을 사용할 수 있습니다.',
    details: ['본명 대신 가명을 사용해도 됩니다.', '첫 만남은 공개장소에서 진행되는 규칙을 지켜주세요.'],
    dialogue: [
      {
        id: 'alias-participant',
        speaker: '참가자',
        text: '오늘은 본명 말고 "별빛"이라고 불러줘.',
        tone: 'participant',
        side: 'left',
      },
      {
        id: 'alias-quantum',
        speaker: 'Quantum',
        text: '좋아요. 행사 전용 가명만 사용하고 첫 만남은 공개장소에서 진행해요.',
        tone: 'quantum',
        side: 'right',
      },
    ],
    imageCell: { row: 0, column: 0 },
  },
  {
    stepNumber: 2,
    title: '2. 시작 20분 전 팀 채팅 오픈',
    description:
      '행사 시작 20분 전, 전체 팀 채팅방이 열리고 당일 진행을 함께 준비합니다.',
    details: ['팀 전체 채팅에서 일정/도착 정보를 공유하세요.', '개별 대화보다 팀 채팅으로 움직임을 맞춰 주세요.'],
    dialogue: [
      {
        id: 'chat-arrived',
        speaker: '팀원',
        text: '정문 시계탑 앞에 도착했어요!',
        tone: 'participant',
        side: 'left',
      },
      {
        id: 'chat-following',
        speaker: '참가자',
        text: '저는 5분 뒤 도착해요.',
        tone: 'participant',
        side: 'right',
      },
      {
        id: 'chat-quantum',
        speaker: 'Quantum',
        text: '시작 20분 전 열린 팀 채팅에서 도착 정보를 함께 나눠요.',
        tone: 'quantum',
        side: 'left',
      },
    ],
    imageCell: { row: 0, column: 1 },
  },
  {
    stepNumber: 3,
    title: '3. 본명/전화번호/카카오톡/인스타그램 요청 금지',
    description:
      '만남 중 본명, 전화번호, 카카오톡, 인스타그램 ID를 요구하는 메시지는 보내지 않습니다.',
    details: ['개인 정보 과다 요청은 이벤트 진행 규칙 위반입니다.', '불편하면 앱 내 신고 기능으로 바로 처리해 주세요.'],
    dialogue: [
      {
        id: 'contact-request',
        speaker: '참가자',
        text: '인스타 아이디나 전화번호 알려줄래요?',
        tone: 'participant',
        side: 'left',
      },
      {
        id: 'contact-boundary',
        speaker: '팀원',
        text: '저는 앱 안에서만 연락하고 싶어요.',
        tone: 'participant',
        side: 'right',
      },
      {
        id: 'contact-quantum',
        speaker: 'Quantum',
        text: '외부 연락처 요구는 금지됩니다. 불편하면 앱에서 바로 신고하세요.',
        tone: 'warning',
        side: 'left',
      },
    ],
    imageCell: { row: 1, column: 0 },
  },
  {
    stepNumber: 4,
    title: '4. 시작 후 90~150분, 안전하게 귀가 마무리',
    description:
      '공식 만남은 시작 후 90~150분 안쪽에서 마무리하고, 2차나 외부 연락처 전달 없이 편안하게 귀가할 수 있게 흐름을 정리합니다.',
    details: ['공식 구간 종료 후 귀가 상태를 점검하고, 이동 동선은 공개/안전한 길만 사용합니다.', '2차 만남/외부 연락처 공유는 원칙적으로 요구하지 않습니다.'],
    dialogue: [
      {
        id: 'return-participant',
        speaker: '참가자',
        text: '안내 활동이 끝났어요. 이제 편하게 귀가할게요.',
        tone: 'participant',
        side: 'left',
      },
      {
        id: 'return-quantum',
        speaker: 'Quantum',
        text: '좋아요. 공식 만남은 90~150분 안에 마무리하고 2차를 강요하지 않아요.',
        tone: 'quantum',
        side: 'right',
      },
    ],
    imageCell: { row: 1, column: 1 },
  },
  {
    stepNumber: 5,
    title: '5. 시작 10분 후 노쇼 확인',
    description:
      '행사 시작 10분 후 노쇼·지각을 확인해요. 단체사진은 출석/분쟁 증빙 전용입니다.',
    details: ['노쇼 확인은 앱 내 신고 기능으로 처리하고 동시 기록합니다.', '단체사진은 출석/분쟁 증빙 외에는 프로필/홍보/외모분석 용도로 사용하지 않습니다.'],
    dialogue: [
      {
        id: 'attendance-missing',
        speaker: '팀원',
        text: '한 명이 아직 안 왔어요.',
        tone: 'participant',
        side: 'left',
      },
      {
        id: 'attendance-arrived',
        speaker: '참가자',
        text: '우리 네 명은 약속 장소에 도착했어요.',
        tone: 'participant',
        side: 'right',
      },
      {
        id: 'attendance-quantum',
        speaker: 'Quantum',
        text: '시작 10분 후 노쇼를 신고할 수 있어요. 단체사진은 출석·분쟁 증빙에만 쓰고 프로필에는 공개하지 않아요.',
        tone: 'warning',
        side: 'left',
      },
    ],
    imageCell: { row: 2, column: 0 },
  },
  {
    stepNumber: 6,
    title: '6. 애프터 정산은 보증금 분리 + 자율후원 선택',
    description:
      '보증금(1만원)은 행사 종료 후 전액 반환되거나 다음 매칭으로 이월됩니다. 안내 동의는 안내 조건을 확인했다는 표시일 뿐입니다.',
    details: [
      '자율후원은 별도 항목으로 관리되며, 스스로 0원/1,000원/2,000원/3,000원/직접입력 중 하나를 고르는 방식입니다.',
      '보증금 처리와 자율후원은 별도 운영이므로 하나로 중첩 결제되지 않습니다.',
    ],
    dialogue: [
      {
        id: 'deposit-participant',
        speaker: '참가자',
        text: '보증금은 돌려받을까, 다음 매칭에 그대로 둘까?',
        tone: 'participant',
        side: 'left',
      },
      {
        id: 'deposit-quantum',
        speaker: 'Quantum',
        text: '1만원은 전액 반환 또는 이월할 수 있어요. 후원은 0원부터 직접 입력까지 별도로 선택합니다.',
        tone: 'quantum',
        side: 'right',
      },
    ],
    imageCell: { row: 2, column: 1 },
  },
] as const;

const TRUST_FIRST_GUIDE_ORDER = [1, 2, 3, 4, 5, 0] as const;

export const MEETING_GUIDE_SCENES: readonly MeetingGuideScene[] = TRUST_FIRST_GUIDE_ORDER.map(
  (sourceIndex, index) => {
    const sourceScene = ORIGINAL_MEETING_GUIDE_SCENES[sourceIndex];
    if (!sourceScene) throw new Error('Meeting guide source scene not found');

    return {
      ...sourceScene,
      stepNumber: index + 1,
      title: `${index + 1}.${sourceScene.title.replace(/^\d+\./, '')}`,
    };
  },
);

export function getGuideSceneByIndex(index: number): MeetingGuideScene {
  if (!Number.isInteger(index) || index < 0 || index >= MEETING_GUIDE_SCENES.length) {
    throw new Error('Invalid guide scene index');
  }
  const scene = MEETING_GUIDE_SCENES[index];
  if (!scene) {
    throw new Error('Guide scene not found');
  }
  return scene;
}

export function getGuideSceneImageCell(index: number) {
  return getGuideSceneByIndex(index).imageCell;
}

export function getGuideProgressLabel(index: number): string {
  const scene = getGuideSceneByIndex(index);
  return `${scene.stepNumber}/${MEETING_GUIDE_SCENES.length}`;
}

export function getGuidePosterLayout(containerWidth: number): MeetingGuideImageLayout {
  const cellWidth = containerWidth;
  const posterWidth = containerWidth * MEETING_GUIDE_GRID.columns;
  const posterHeight = posterWidth * GUIDE_POSTER_ASPECT_RATIO;
  const cellHeight = posterHeight / MEETING_GUIDE_GRID.rows;

  return {
    posterWidth,
    posterHeight,
    cellWidth,
    cellHeight,
  };
}
