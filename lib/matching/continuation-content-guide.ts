export type ContinuationGuideDay = 1 | 2 | 3 | 4 | 5
export type ContinuationGuideMode = 'preview' | 'occurrence'
export type ContinuationGuideGameKey = 'dalmuti' | 'halligalli' | 'one-card'
export type OriginalContinuationGuideGameKey = 'dalmuti' | 'halli_galli' | 'one_card'

export type ContinuationGuideArtwork = {
  readonly src: string
  readonly alt: string
}

export type ContinuationContentGuideScene = {
  readonly id: string
  readonly day: ContinuationGuideDay
  readonly offsetMinutes: number
  readonly durationMinutes: number
  readonly title: string
  readonly body: string
  readonly nextAction: string
  readonly speech: readonly string[]
  readonly artwork: ContinuationGuideArtwork
  readonly gameKeyMap?: Readonly<Record<OriginalContinuationGuideGameKey, ContinuationGuideGameKey>>
  readonly selectedGameArtwork?: Readonly<Partial<Record<ContinuationGuideGameKey, ContinuationGuideArtwork>>>
}

const sceneArtwork = (file: string, alt: string): ContinuationGuideArtwork => ({
  src: `/images/match/five-meeting/scene-guides/${file}.webp`,
  alt,
})

const unifiedArtwork = (file: string, alt: string): ContinuationGuideArtwork => ({
  src: `/images/match/five-meeting/unified-scenes/${file}.webp`,
  alt,
})

const DAY1_SELECTED_GAME_ARTWORK = {
  dalmuti: sceneArtwork('day1-selected-dalmuti', '카드 묶음을 정리하며 달무티를 준비하는 대학생 다섯 명'),
  halligalli: sceneArtwork('day1-selected-halli-galli', '중앙 종과 과일 카드를 준비하는 대학생 다섯 명'),
  'one-card': sceneArtwork('day1-selected-one-card', '중앙 카드 더미를 준비하는 대학생 다섯 명'),
} as const satisfies Readonly<Record<ContinuationGuideGameKey, ContinuationGuideArtwork>>

export const CONTINUATION_CONTENT_GUIDE_ASSET_ALLOWLIST = [
  'scene-guides/day1-introduction.webp',
  'scene-guides/day1-rules-overview.webp',
  'scene-guides/day1-dalmuti-play.webp',
  'scene-guides/day1-game-vote.webp',
  'scene-guides/day1-selected-dalmuti.webp',
  'scene-guides/day1-selected-halli-galli.webp',
  'scene-guides/day1-selected-one-card.webp',
  'scene-guides/day1-department-guess.webp',
  'scene-guides/day1-one-line-impression.webp',
  'scene-guides/day1-photo-end.webp',
  'unified-scenes/day2-oncheoncheon.webp',
  'scene-guides/day2-rotation-round-1.webp',
  'scene-guides/day2-rotation-round-2.webp',
  'scene-guides/day2-rotation-round-3.webp',
  'scene-guides/day2-rotation-five-person.webp',
  'scene-guides/day2-phase-common-point-v2.webp',
  'scene-guides/day2-phase-common-point-trio-v1.webp',
  'scene-guides/day2-phase-roulette-v2.webp',
  'scene-guides/day2-phase-roulette-trio-v1.webp',
  'scene-guides/day2-wrap-end.webp',
  'scene-guides/day3-arrival.webp',
  'scene-guides/day3-dinner.webp',
  'scene-guides/day3-walk-to-bowling.webp',
  'scene-guides/day3-bowling-practice.webp',
  'unified-scenes/day3-bowling.webp',
  'scene-guides/day3-bowling-result.webp',
  'scene-guides/day3-photo-end.webp',
  'scene-guides/day4-arrival-order.webp',
  'unified-scenes/day4-table.webp',
  'scene-guides/day4-free-conversation.webp',
  'scene-guides/day4-photo-end.webp',
  'scene-guides/day5-arrival-night-v2.webp',
  'scene-guides/day5-night-walk.webp',
  'scene-guides/day5-shared-finale-night-v4.webp',
  'scene-guides/day5-indoor-rest-v2.webp',
  'scene-guides/day5-one-line-memory-v2.webp',
  'scene-guides/day5-photo-safe-return-v2.webp',
] as const

// This is an explanatory catalog only. It is intentionally separate from the
// server-owned occurrence state, commands, attendance, roster, and revisions.
const CONTINUATION_CONTENT_GUIDE_DRAFT = [
  {
    id: 'day1_introduction', day: 1, title: '행사 별칭으로 한 문장 소개하기',
    body: '처음에는 행사 별칭과 한 문장만 가볍게 나눠요. 실제 출석·참가자 정보는 이 안내에서 확인하거나 바꾸지 않아요.',
    nextAction: '말하고 싶은 만큼만 한 문장으로 인사하기',
    speech: ['행사 별칭부터, 한 문장만 나눠요.', '듣는 사람은 편하게 고개로 인사해요.'],
    artwork: sceneArtwork('day1-introduction', '한 참가자가 한 문장으로 소개하고 다른 참가자들이 듣는 장면'),
  },
  {
    id: 'day1_dalmuti_rules', day: 1, title: '달무티 규칙 14개를 함께 보기',
    body: '게임 전에 14개 장면으로 규칙을 차례로 확인해요. 이해가 어려우면 진행 화면의 규칙을 다시 보고, 이 안내는 게임 시작을 기록하지 않아요.',
    nextAction: '모두가 이해한 규칙부터 한 가지씩 확인하기',
    speech: ['휴대폰으로 14장면을 함께 봐요.'],
    artwork: sceneArtwork('day1-rules-overview', '참가자들이 휴대폰과 중앙 카드 더미를 보며 달무티 규칙을 확인하는 장면'),
  },
  {
    id: 'day1_dalmuti_play', day: 1, title: '달무티를 한 판 진행하기',
    body: '같은 장수의 카드 흐름을 따라 천천히 한 판을 진행해요. 막히면 규칙으로 돌아갈 수 있고, 결과나 순위는 이 안내가 저장하지 않아요.',
    nextAction: '막히면 규칙을 다시 보고 다음 차례로 넘기기',
    speech: ['같은 장수로 더 강하게 이어가요.', '막히면 규칙을 다시 보면 돼요.'],
    artwork: sceneArtwork('day1-dalmuti-play', '참가자들이 같은 장수의 카드를 내며 달무티를 진행하는 장면'),
  },
  {
    id: 'day1_game_vote', day: 1, title: '다음 게임을 함께 고르는 시간',
    body: '개인 선택이 끝났거나 비공개 투표가 완료됐다고 가정하지 않아요. 실제 진행 화면이 열렸을 때에만 한 게임을 고릅니다.',
    nextAction: '진행 화면에서 함께 고를 게임을 확인하기',
    speech: ['각자 화면에서 조용히 골라요.'],
    artwork: sceneArtwork('day1-game-vote', '참가자들이 서로의 화면을 보지 않고 다음 게임을 선택하는 장면'),
  },
  {
    id: 'day1_selected_game', day: 1, title: '확정된 게임 하나로 이어가기',
    body: '실제 저장된 선택 결과가 있을 때만 그 게임을 따라가요. 이 안내는 선택 결과를 만들거나 바꾸지 않으며, 값이 없으면 일반 안내 그림을 보여줘요.',
    nextAction: '실제 진행 화면의 선택 결과를 확인한 뒤 게임 이어가기',
    speech: ['확정된 게임 하나로 이어가요.'],
    artwork: sceneArtwork('day1-game-vote', '참가자들이 다음 게임을 고르는 장면'),
    gameKeyMap: { dalmuti: 'dalmuti', halli_galli: 'halligalli', one_card: 'one-card' },
    selectedGameArtwork: DAY1_SELECTED_GAME_ARTWORK,
  },
  {
    id: 'day1_department_guess', day: 1, title: '학과를 가볍게 추측해 보기',
    body: '실제 학과를 공개하거나 맞혔는지 저장하지 않아요. 말하고 싶을 때만 중립적인 단서를 두고 가볍게 추측한 뒤 바로 넘어가요.',
    nextAction: '원하면 중립적인 단서 하나만 말하고 편하게 넘어가기',
    speech: ['별칭을 보고 가볍게 추측해 볼게요.', '틀려도 웃고 바로 넘어가요.'],
    artwork: sceneArtwork('day1-department-guess', '참가자가 중립적인 전공 상징을 떠올리며 가볍게 추측하는 장면'),
  },
  {
    id: 'day1_one_line_impression', day: 1, title: '저장하지 않는 한 문장 인상',
    body: '다른 사람을 평가하지 않고 내 느낌을 한 문장으로만 나눠요. 말하기와 패스 모두 가능하며, 내용은 앱에 저장하지 않아요.',
    nextAction: '원하면 한 문장만 말하고, 아니면 패스하기',
    speech: ['한 문장만 말해 볼게요.', '말하고 싶지 않으면 지나가도 괜찮아요.'],
    artwork: sceneArtwork('day1-one-line-impression', '한 참가자가 한 문장으로 말하고 다른 참가자들이 듣는 장면'),
  },
  {
    id: 'day1_photo_and_end', day: 1, title: '자율 사진과 첫날 마무리',
    body: '사진은 선택이고 함께하지 않아도 괜찮아요. 이 안내는 사진 업로드·참석·다음 만남을 확정하지 않아요.',
    nextAction: '사진 여부를 서로 묻고 각자 편한 방식으로 마무리하기',
    speech: ['찍기 전에 먼저 물어볼게요.', '사진 밖에 있어도 자연스러워요.'],
    artwork: sceneArtwork('day1-photo-end', '사진 전에 동의를 묻고 참여 여부를 편하게 정하는 참가자들'),
  },
  {
    id: 'day2_arrival', day: 2, title: '도착과 세 라운드 안내',
    body: '최신 일정에 나온 공개 집결 안내를 먼저 확인해요. 이 화면은 실제 도착·출석·조합을 확인하지 않는 학습용 안내예요.',
    nextAction: '최신 일정과 안전 안내를 확인하기',
    speech: ['오늘은 천천히 걸으며 시작해요.'],
    artwork: unifiedArtwork('day2-oncheoncheon', '공개 산책로 집결 지점에서 일정 화면을 함께 확인하는 참가자들'),
  },
  {
    id: 'day2_rotation_round_1', day: 2, title: '1라운드 · 짝 확인과 공통점 하나',
    body: '30분 동안 짝 확인, 공통점 하나, 자유 대화 순서예요. 6명은 세 쌍, 5명은 한 쌍과 세 명 조로 누구도 혼자 두지 않으며, 실제 내 조는 아래 서버 진행 영역에서 확인해요.',
    nextAction: '공통점 하나를 찾은 뒤 자유롭게 대화하기',
    speech: ['우리 조의 공통점 하나부터 찾아볼까요?', '사진은 모두 원할 때만요.'],
    artwork: sceneArtwork('day2-rotation-round-1', '산책로에서 세 쌍으로 첫 번째 라운드 대화를 시작하는 참가자들'),
  },
  {
    id: 'day2_rotation_round_2', day: 2, title: '2라운드 · 천천히 대화 이어가기',
    body: '두 번째 30분도 짝 확인, 공통점 하나, 자유 대화 순서예요. 대화가 막힐 때만 질문을 함께 보고, 이 안내는 실제 라운드 시작이나 조합 변경을 기록하지 않아요.',
    nextAction: '필요할 때만 질문을 열고 대화 이어가기',
    speech: ['두 번째 걸음도 편하게 이어가요.', '막히면 우리끼리 룰렛을 열어요.'],
    artwork: sceneArtwork('day2-rotation-round-2', '산책로에서 세 쌍으로 두 번째 라운드 대화를 이어가는 참가자들'),
  },
  {
    id: 'day2_rotation_round_3', day: 2, title: '3라운드 · 마지막 산책 대화',
    body: '마지막 30분에도 말하고 싶은 만큼만 나누고 원치 않는 질문은 건너뛸 수 있어요. 이 안내 그림과 별개로 실제 내 조와 동기화 질문은 아래 서버 진행 영역에서 확인해요.',
    nextAction: '편한 만큼 대화하고 원치 않는 질문은 건너뛰기',
    speech: ['마지막 산책도 천천히 가요.', '말하고 싶은 만큼만 나눠요.'],
    artwork: sceneArtwork('day2-rotation-round-3', '산책로에서 세 쌍으로 마지막 라운드 대화를 이어가는 참가자들'),
  },
  {
    id: 'day2_wrap_and_end', day: 2, title: '다시 모여 자율 사진과 마무리',
    body: '세 라운드 뒤에는 함께 다시 모여요. 서로를 평가하거나 선택 결과를 공개하지 않고, 사진은 각자 선택하며 이 안내는 완료를 만들지 않아요.',
    nextAction: '사진 여부를 확인하고 각자 안전하게 마무리하기',
    speech: ['이제 모두 함께 다시 모여요.'],
    artwork: sceneArtwork('day2-wrap-end', '순환 대화를 마친 참가자들이 한 그룹으로 다시 모이는 장면'),
  },
  {
    id: 'day3_arrival', day: 3, title: '저녁과 볼링 전 도착 안내',
    body: '운영자가 확정한 공개 장소와 시간은 최신 일정만 따릅니다. 이 안내는 출석이나 실제 장소를 고정하지 않아요.',
    nextAction: '최신 일정의 장소와 시간 확인하기',
    speech: ['저녁을 먹고 볼링장으로 함께 이동해요.'],
    artwork: sceneArtwork('day3-arrival', '밝은 식당 입구에서 장소를 확인하고 함께 입장하는 참가자들'),
  },
  {
    id: 'day3_dinner', day: 3, title: '저녁 식사 시간',
    body: '앱은 메뉴·주문·현장 결제를 다루지 않아요. 각자 편한 만큼 식사와 대화를 즐기고, 음주를 요구하거나 기록하지 않아요.',
    nextAction: '각자 편한 식사와 대화 속도 정하기',
    speech: ['식사는 각자 편한 만큼 즐겨요.'],
    artwork: sceneArtwork('day3-dinner', '식당에서 각자 고른 음식과 음료를 두고 대화하는 참가자들'),
  },
  {
    id: 'day3_walk_to_bowling', day: 3, title: '볼링장으로 함께 이동하기',
    body: '이동 동선은 최신 운영 안내를 따르고, 혼자 걷거나 동행을 강요하지 않아요. 위치 공유는 이 안내의 기능이 아니에요.',
    nextAction: '운영 안내의 안전한 이동 동선 확인하기',
    speech: ['이동은 한 번, 일행과 같이 가요.'],
    artwork: sceneArtwork('day3-walk-to-bowling', '저녁 식사 뒤 조명 있는 거리에서 볼링장으로 걷는 참가자들'),
  },
  {
    id: 'day3_bowling_practice', day: 3, title: '가볍게 연습하기',
    body: '본게임 전에 가볍게 자세와 흐름을 익혀요. 점수보다 서로의 편안함을 먼저 보고, 이 안내는 점수나 팀을 저장하지 않아요.',
    nextAction: '편한 방식으로 한두 번 연습해 보기',
    speech: ['가볍게 몸부터 풀어볼까요?', '점수보다 응원이 먼저예요.'],
    artwork: sceneArtwork('day3-bowling-practice', '한 참가자가 가볍게 연습 투구하고 다른 참가자들이 지켜보는 장면'),
  },
  {
    id: 'day3_bowling_main', day: 3, title: '볼링 본게임 안내',
    body: '실제 팀과 점수는 진행 화면의 서버 정보가 있을 때만 따릅니다. 이 학습용 안내는 팀 배정·결과·보상을 만들지 않아요.',
    nextAction: '실제 진행 화면의 팀과 차례를 확인하기',
    speech: ['이번엔 우리 팀 차례예요!', '좋아요, 서로 응원해요.'],
    artwork: unifiedArtwork('day3-bowling', '볼링장에서 차례를 지키며 본게임을 진행하는 참가자들'),
  },
  {
    id: 'day3_bowling_result', day: 3, title: '결과를 함께 확인하는 시간',
    body: '실제 결과가 있을 때만 진행 화면에서 확인해요. 개인 선택 공개나 다음 만남 보상은 이 안내에서 만들지 않아요.',
    nextAction: '결과가 있으면 서로 응원하고 다음 안내 보기',
    speech: ['팀 결과를 함께 축하해요.'],
    artwork: sceneArtwork('day3-bowling-result', '같은 크기의 결과 칸을 함께 보고 박수치는 참가자들'),
  },
  {
    id: 'day3_photo_and_end', day: 3, title: '자율 사진과 마무리',
    body: '사진은 동의한 사람만 참여해요. 사진을 남기지 않아도 불이익이 없고, 이 안내는 업로드나 참석을 기록하지 않아요.',
    nextAction: '사진 여부를 먼저 묻고 편하게 마무리하기',
    speech: ['원할 때만 사진으로 남겨요.'],
    artwork: sceneArtwork('day3-photo-end', '사진 참여 의사를 묻고 마무리하는 참가자들'),
  },
  {
    id: 'day4_arrival_and_order', day: 4, title: '도착 뒤 각자 편한 방식으로 시작하기',
    body: '최신 일정의 공개 장소만 따르고, 앱은 메뉴·음료·수량·주문·현장 결제를 기록하지 않아요. 음주나 대답을 강요하지 않아요.',
    nextAction: '각자 편한 방식으로 자리를 정하고 대화 시작하기',
    speech: ['오늘은 화면보다 대화에 집중해요.'],
    artwork: sceneArtwork('day4-arrival-order', '공개된 식당 테이블에서 각자 메뉴를 보는 참가자들'),
  },
  {
    id: 'day4_same_answer_game', day: 4, title: '공용폰으로 같은 답 10카드',
    body: '시작 뒤 공용폰 한 대로 같은 답 카드 10개를 함께 해봐요. 누가 마셨는지·패스했는지·횟수는 저장하지 않아요.',
    nextAction: '한 카드씩 동시에 답하고 가볍게 넘어가기',
    speech: ['휴대폰 한 대로 같은 답에 도전!', '맞히면 다 같이 웃는 거예요.'],
    artwork: unifiedArtwork('day4-table', '식탁 가운데 공용 휴대폰 한 대를 두고 같은 답을 표현하는 참가자들'),
  },
  {
    id: 'day4_free_conversation', day: 4, title: '자유 대화로 이어가기',
    body: '카드 뒤에는 휴대폰을 내려놓고 자유롭게 대화해요. 원치 않는 대화는 쉬거나 바꿀 수 있고, 대화 내용은 이 안내가 저장하지 않아요.',
    nextAction: '원하는 주제로 자유롭게 대화하기',
    speech: ['이제 휴대폰을 내려놓아도 괜찮아요.'],
    artwork: sceneArtwork('day4-free-conversation', '휴대폰을 테이블 가장자리로 내려놓고 자유롭게 이야기하는 참가자들'),
  },
  {
    id: 'day4_photo_and_end', day: 4, title: '자율 사진과 안전한 마무리',
    body: '사진 여부는 각자 정하고, 동행·접촉·다음 행동을 강요하지 않아요. 이 안내는 종료나 참석을 확정하지 않아요.',
    nextAction: '사진 여부를 확인하고 각자 안전하게 귀가 준비하기',
    speech: ['마지막까지 편안하고 안전하게.'],
    artwork: sceneArtwork('day4-photo-end', '사진 동의를 확인한 뒤 밝은 출구로 이동하는 참가자들'),
  },
  {
    id: 'day5_arrival', day: 5, title: '밝은 공개 집결 안내',
    body: '정확한 집결 지점과 변경 번호는 최신 일정에서만 확인해요. 이 안내는 실제 출석이나 장소 확정을 만들지 않아요.',
    nextAction: '최신 일정과 안전 안내를 한 번 더 확인하기',
    speech: ['밝은 집결 장소와 일정을 먼저 확인해요.'],
    artwork: sceneArtwork('day5-arrival-night-v2', '밝은 공개 집결 장소에서 최신 일정을 확인하는 참가자들'),
  },
  {
    id: 'day5_night_walk', day: 5, title: '밤 산책 안내',
    body: '밝은 공개 동선을 따라 천천히 걸어요. 위치 공유·신체 접촉·동행은 필수가 아니며, 이 안내는 실제 이동을 기록하지 않아요.',
    nextAction: '최신 안전 동선을 확인하고 편한 속도로 걷기',
    speech: ['우리 그룹과 천천히 같이 걸어요.'],
    artwork: sceneArtwork('day5-night-walk', '밝은 산책로에서 한 그룹으로 천천히 걷는 참가자들'),
  },
  {
    id: 'day5_shared_finale', day: 5, title: '순위 없는 공동 한 문장',
    body: '앞 문장에 한 문장씩 이어 보되, 순위·호감·선택 결과는 만들거나 공개하지 않아요. 말하기를 원치 않으면 쉬어갈 수 있어요.',
    nextAction: '원하면 앞 문장에 한 문장만 이어 보기',
    speech: ['앞 문장에 한 문장만 이어볼게요.', '순위 없이 우리 이야기로 만들어요.'],
    artwork: sceneArtwork('day5-shared-finale-night-v4', '밤의 공개 장소에서 한 문장 릴레이를 이어가는 참가자들'),
  },
  {
    id: 'day5_indoor_rest', day: 5, title: '밝은 실내에서 잠깐 쉬기',
    body: '실내 휴식 장소는 최신 운영 안내를 따르고, 앱은 메뉴·주문·현장 결제를 다루지 않아요. 각자 원할 때 쉬어갈 수 있어요.',
    nextAction: '운영 안내의 휴식 장소와 귀가 준비 확인하기',
    speech: ['확정된 밝은 장소에서 잠깐 쉬어요.'],
    artwork: sceneArtwork('day5-indoor-rest-v2', '밝은 실내 휴식 장소에서 쉬는 참가자들'),
  },
  {
    id: 'day5_one_line_memory', day: 5, title: '기억 한 문장 나누기',
    body: '다른 사람을 평가하지 않고 내 기억을 한 문장으로만 나눠요. 말하거나 패스한 내용은 저장하지 않아요.',
    nextAction: '원하면 기억나는 순간 하나를 말하고, 아니면 패스하기',
    speech: ['내가 기억하는 순간 하나만 말할게요.', '지나가고 싶으면 편하게 패스해요.'],
    artwork: sceneArtwork('day5-one-line-memory-v2', '한 참가자가 기억 한 문장을 말하는 장면'),
  },
  {
    id: 'day5_photo_and_safe_return', day: 5, title: '자율 사진과 안전 귀가',
    body: '사진은 각자 선택하고, 안전한 귀가 수단을 확인해요. 사진 누락을 노쇼·보증금·친구 선택과 자동으로 연결하지 않으며 별도 다음 회차를 만들지 않아요.',
    nextAction: '사진 여부를 묻고 각자 안전한 귀가 수단 확인하기',
    speech: ['사진에 함께할지 먼저 물어볼게요.', '마친 뒤에는 밝은 길로 이동해요.'],
    artwork: sceneArtwork('day5-photo-safe-return-v2', '자율 사진 여부를 확인하고 밝은 귀가 동선으로 이동하는 참가자들'),
  },
] as const satisfies readonly Omit<ContinuationContentGuideScene, 'offsetMinutes' | 'durationMinutes'>[]

type ContinuationGuideSceneId = (typeof CONTINUATION_CONTENT_GUIDE_DRAFT)[number]['id']

const CONTINUATION_GUIDE_TIMINGS: Readonly<Record<ContinuationGuideSceneId, Pick<ContinuationContentGuideScene, 'offsetMinutes' | 'durationMinutes'>>> = {
  day1_introduction: { offsetMinutes: 0, durationMinutes: 15 },
  day1_dalmuti_rules: { offsetMinutes: 15, durationMinutes: 10 },
  day1_dalmuti_play: { offsetMinutes: 25, durationMinutes: 55 },
  day1_game_vote: { offsetMinutes: 80, durationMinutes: 5 },
  day1_selected_game: { offsetMinutes: 85, durationMinutes: 45 },
  day1_department_guess: { offsetMinutes: 130, durationMinutes: 5 },
  day1_one_line_impression: { offsetMinutes: 135, durationMinutes: 10 },
  day1_photo_and_end: { offsetMinutes: 145, durationMinutes: 5 },
  day2_arrival: { offsetMinutes: 0, durationMinutes: 15 },
  day2_rotation_round_1: { offsetMinutes: 15, durationMinutes: 30 },
  day2_rotation_round_2: { offsetMinutes: 45, durationMinutes: 30 },
  day2_rotation_round_3: { offsetMinutes: 75, durationMinutes: 30 },
  day2_wrap_and_end: { offsetMinutes: 105, durationMinutes: 15 },
  day3_arrival: { offsetMinutes: 0, durationMinutes: 15 },
  day3_dinner: { offsetMinutes: 15, durationMinutes: 55 },
  day3_walk_to_bowling: { offsetMinutes: 70, durationMinutes: 10 },
  day3_bowling_practice: { offsetMinutes: 80, durationMinutes: 20 },
  day3_bowling_main: { offsetMinutes: 100, durationMinutes: 65 },
  day3_bowling_result: { offsetMinutes: 165, durationMinutes: 5 },
  day3_photo_and_end: { offsetMinutes: 170, durationMinutes: 10 },
  day4_arrival_and_order: { offsetMinutes: 0, durationMinutes: 30 },
  day4_same_answer_game: { offsetMinutes: 30, durationMinutes: 20 },
  day4_free_conversation: { offsetMinutes: 50, durationMinutes: 55 },
  day4_photo_and_end: { offsetMinutes: 105, durationMinutes: 15 },
  day5_arrival: { offsetMinutes: 0, durationMinutes: 15 },
  day5_night_walk: { offsetMinutes: 15, durationMinutes: 20 },
  day5_shared_finale: { offsetMinutes: 35, durationMinutes: 25 },
  day5_indoor_rest: { offsetMinutes: 60, durationMinutes: 20 },
  day5_one_line_memory: { offsetMinutes: 80, durationMinutes: 25 },
  day5_photo_and_safe_return: { offsetMinutes: 105, durationMinutes: 15 },
}

export const CONTINUATION_CONTENT_GUIDE: readonly ContinuationContentGuideScene[] = CONTINUATION_CONTENT_GUIDE_DRAFT.map((scene) => ({
  ...scene,
  ...CONTINUATION_GUIDE_TIMINGS[scene.id],
}))

const DAY2_PREVIEW_ARTWORK = unifiedArtwork('day2-oncheoncheon', '참가 인원에 따라 실제 조 편성이 달라지는 Day 2 산책 안내 장면')
const DAY2_FIVE_PERSON_PAIRING_ARTWORK = sceneArtwork('day2-rotation-five-person', '다섯 명이 한 쌍과 세 명 조로 나뉘어 누구도 혼자 남지 않게 대화를 준비하는 장면')
const DAY2_FIVE_PERSON_COMMON_POINT_ARTWORK = [
  sceneArtwork('day2-phase-common-point-v2', '두 참가자가 공통점 하나를 이야기하는 장면'),
  sceneArtwork('day2-phase-common-point-trio-v1', '세 참가자가 누구도 빠뜨리지 않고 공통점 하나를 이야기하는 장면'),
] as const
const DAY2_FIVE_PERSON_CONVERSATION_ARTWORK = [
  sceneArtwork('day2-phase-roulette-v2', '두 참가자가 같은 대화 질문을 함께 확인하는 장면'),
  sceneArtwork('day2-phase-roulette-trio-v1', '세 참가자가 같은 대화 질문을 함께 확인하는 장면'),
] as const

export function getContinuationContentGuideForDay(programDay: number): readonly ContinuationContentGuideScene[] {
  return CONTINUATION_CONTENT_GUIDE.filter((scene) => scene.day === programDay)
}

export function getContinuationGuideDayDuration(programDay: number): number {
  return getContinuationContentGuideForDay(programDay).reduce((latestEnd, scene) => Math.max(latestEnd, scene.offsetMinutes + scene.durationMinutes), 0)
}

export function resolveContinuationGuideArtwork(
  scene: ContinuationContentGuideScene,
  selectedGame?: string,
): ContinuationGuideArtwork {
  if (!scene.selectedGameArtwork) return scene.artwork
  return selectedGame === 'dalmuti' || selectedGame === 'halligalli' || selectedGame === 'one-card'
    ? scene.selectedGameArtwork[selectedGame] ?? scene.artwork
    : scene.artwork
}

export function resolveContinuationGuideArtworks(
  scene: ContinuationContentGuideScene,
  options: { selectedGame?: string; rosterSize?: number; mode?: ContinuationGuideMode } = {},
): readonly ContinuationGuideArtwork[] {
  const selectedArtwork = resolveContinuationGuideArtwork(scene, options.selectedGame)
  if (!scene.id.startsWith('day2_rotation_')) return [selectedArtwork]
  if (options.mode === 'preview') return [{ ...selectedArtwork, alt: `6명 구성 예시 · ${selectedArtwork.alt}` }]
  if (options.rosterSize !== 5 && options.rosterSize !== 6) return [DAY2_PREVIEW_ARTWORK]
  if (options.rosterSize === 6) return [selectedArtwork]
  if (scene.id === 'day2_rotation_round_1') return [DAY2_FIVE_PERSON_PAIRING_ARTWORK]
  if (scene.id === 'day2_rotation_round_2') return DAY2_FIVE_PERSON_COMMON_POINT_ARTWORK
  return DAY2_FIVE_PERSON_CONVERSATION_ARTWORK
}

export function getContinuationGuideRosterNote(
  scene: ContinuationContentGuideScene,
  rosterSize: number | undefined,
  mode: ContinuationGuideMode,
): string | null {
  if (!scene.id.startsWith('day2_rotation_')) return null
  if (mode === 'preview') {
    return '그림은 6명 구성의 예시예요. 5명은 한 쌍과 세 명 조, 6명은 세 쌍으로 진행하며 실제 내 조는 회차 진행 화면에서 확인해요.'
  }
  if (rosterSize !== 5 && rosterSize !== 6) {
    return '참가 인원은 아직 안전하게 확인되지 않았어요. 5명은 한 쌍과 세 명 조, 6명은 세 쌍이며 실제 내 조는 서버 확인 뒤 아래 진행 영역에 표시돼요.'
  }
  return rosterSize === 5
    ? '현재 출석 기준 5명이라 한 쌍과 세 명 조로 진행해요. 실제 내 조는 아래 서버 진행 영역에서 확인해요.'
    : '현재 출석 기준 6명이라 세 쌍으로 진행해요. 실제 내 조는 아래 서버 진행 영역에서 확인해요.'
}
