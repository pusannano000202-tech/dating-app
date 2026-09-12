export type StudyLevel = 'beginner' | 'intermediate' | 'advanced'
export type StudyGuideKind = 'major-math' | 'major-physics' | 'major-general' | 'language-speaking' | 'mentoring' | 'department-social'
export type StudyGuideStep = Readonly<{ id: string; title: string; minutes: number; body: string }>
export type StudySessionGuide = Readonly<{ kind: StudyGuideKind; level: StudyLevel; sessionNumber: number; totalSessions: 10; title: string; goal: string; preparation: readonly string[]; steps: readonly StudyGuideStep[]; prompts: readonly string[]; recap: readonly string[]; nextTask: string; participationNote: string; skillDisclaimer: string; estimatedMinutes: number }>
export const STUDY_GUIDE_KINDS: readonly StudyGuideKind[] = Object.freeze(['major-math', 'major-physics', 'major-general', 'language-speaking', 'mentoring', 'department-social'])
export const STUDY_LEVELS: readonly StudyLevel[] = Object.freeze(['beginner', 'intermediate', 'advanced'])
export const STUDY_PARTICIPATION_NOTE = '권장 10회 · 회차마다 자유 참여. 이번엔 쉬어도 방은 유지되고, 원할 때 나갈 수 있어요.'

type Topic = readonly [title: string, task: string, question: string]
const topics: Readonly<Record<StudyGuideKind, readonly Topic[]>> = {
  'major-math': [
    ['우리 수업의 출발점 맞추기', '각자 이번 수업 범위에서 어려운 개념 하나를 적고, 함께 다룰 예제 한 개를 골라요.', '같은 기호라도 서로 다르게 이해하고 있던 부분이 있나요?'],
    ['기호를 우리말로 바꾸기', '선택한 식에 등장하는 기호의 뜻과 조건을 설명하고, 가능한 값과 불가능한 값을 나눠요.', '이 식이 성립하려면 어떤 조건이 먼저 필요할까요?'],
    ['그래프로 설명해 보기', '이번 단원의 함수나 해를 그래프로 나타내고, 계산 결과와 그림이 맞는지 서로 확인해요.', '그래프 모양만 보고 예상할 수 있는 성질은 무엇인가요?'],
    ['풀이를 한 줄씩 연결하기', '예제의 중간 풀이를 한 줄씩 나눠 맡고, 앞 단계에서 다음 단계로 넘어가는 이유를 설명해요.', '여기서 이 계산이나 정리를 써도 되는 이유는 무엇인가요?'],
    ['같은 문제를 두 방법으로', '수업에서 배운 풀이 두 가지를 같은 예제에 적용하고, 쉬운 방법과 주의할 조건을 비교해요.', '두 풀이가 같은 답을 내는데도 쓰기 편한 상황이 다른가요?'],
    ['자주 틀리는 지점 찾기', '자신의 연습 풀이에서 부호·조건·계산 실수 하나씩을 골라, 다시 확인할 체크리스트를 만들어요.', '답을 보기 전에 이 실수를 알아차릴 방법이 있나요?'],
    ['조건을 바꾸면 어떻게 될까', '풀었던 예제의 조건이나 수 하나를 바꾸고, 답이나 풀이 방법이 어떻게 달라지는지 확인해요.', '조건을 바꿔도 그대로 유지되는 부분은 무엇인가요?'],
    ['실제 상황을 식으로 표현하기', '수업 범위 안의 간단한 상황을 정하고, 필요한 변수와 가정을 적어 수식으로 옮겨요.', '상황을 단순화하면서 무엇을 생략했나요?'],
    ['섞인 문제에서 전략 고르기', '각자 준비한 연습 문제를 섞어, 계산 전에 쓸 개념과 선택 이유부터 서로 설명해요.', '문제의 어떤 단서가 풀이 전략을 결정했나요?'],
    ['우리의 풀이 노트 완성하기', '함께 풀었던 대표 문제와 실수 방지 팁을 추려, 다음에 혼자 다시 볼 한 장 노트를 만들어요.', '처음보다 혼자 설명할 수 있게 된 부분은 무엇인가요?'],
  ],
  'major-physics': [
    ['현상과 질문부터 정하기', '이번 수업 범위에서 궁금한 현상을 하나 고르고, 알고 있는 것과 확인할 것을 구분해요.', '이 현상에서 실제로 구하려는 물리량은 무엇인가요?'],
    ['단위와 크기 감각 잡기', '예제의 물리량을 단위와 함께 적고, 계산하기 전에 결과의 크기를 어림해요.', '이 결과의 단위와 크기가 현실적으로 가능한가요?'],
    ['상황을 그림으로 바꾸기', '수업 문제의 계와 상호작용을 그림으로 표시하고, 각자 그린 그림을 비교해요.', '계의 경계를 어디에 두었고 어떤 영향을 포함했나요?'],
    ['법칙과 가정 짝 맞추기', '이번 단원의 핵심 법칙을 골라, 적용 조건을 먼저 말한 뒤 예제에 사용해요.', '이 법칙을 바로 적용할 수 없는 상황은 언제인가요?'],
    ['변화를 그래프로 읽기', '시간이나 위치에 따라 변하는 물리량을 그려 보고, 기울기·면적의 의미가 있다면 설명해요.', '이 그래프의 변화가 실제 현상에서 무엇을 뜻하나요?'],
    ['서로 다른 풀이 검산하기', '같은 문제의 두 풀이를 비교하고, 부호·방향·경계조건을 다시 확인해요.', '답은 같지만 가정이 다른 부분이 있나요?'],
    ['극단적인 경우로 확인하기', '예제의 변수 하나를 아주 작거나 크게 바꿔 생각하며, 식이 예상한 방향으로 변하는지 살펴봐요.', '간단해진 극한 상황에서 답을 설명할 수 있나요?'],
    ['측정 자료로 이야기하기', '공개된 수업 예시 자료나 안전한 관찰 기록을 바탕으로 그래프와 오차 원인을 정리해요.', '측정값과 모델이 다르면 무엇부터 확인해야 할까요?'],
    ['새 문제에 모델 적용하기', '아직 함께 풀지 않은 수업 연습 문제를 골라, 모델 선택과 가정을 말로 설명한 뒤 계산해요.', '전에 풀었던 문제와 비슷한 점과 다른 점은 무엇인가요?'],
    ['현상을 설명하는 한 장', '대표 현상·그림·핵심 법칙·주의할 가정을 한 장에 모아 서로에게 설명해요.', '공식을 가려도 현상을 설명할 수 있나요?'],
  ],
  'major-general': [
    ['함께 공부할 범위 정하기', '각자의 강의계획서와 이번 진도를 비교하고, 이번 모임에서 다룰 범위를 한 가지로 정해요.', '오늘 끝나면 무엇을 설명할 수 있으면 좋을까요?'],
    ['핵심 용어 연결하기', '선택한 단원의 용어 다섯 개를 골라, 정의와 서로 연결되는 관계를 정리해요.', '이 두 용어는 비슷해 보여도 어떻게 다른가요?'],
    ['한 개념을 서로 가르치기', '개념 하나씩 맡아 짧게 설명하고, 나머지는 예시나 질문을 하나씩 더해요.', '처음 듣는 사람에게 어떤 예시를 들면 쉬울까요?'],
    ['수업 예제 함께 풀기', '공유 가능한 수업 예제를 골라 각자 먼저 시도하고, 접근 방법을 비교해요.', '첫 단계에서 왜 그 방법을 선택했나요?'],
    ['질문 모아 빈틈 찾기', '이해가 안 된 부분을 질문으로 적고, 해결한 질문과 수업에서 확인할 질문을 나눠요.', '어디까지는 알고 있고 어느 지점에서 막혔나요?'],
    ['비교표로 구분하기', '헷갈리는 개념이나 방법 두 가지를 골라, 적용 조건·장점·한계를 표로 정리해요.', '어떤 조건이 바뀌면 다른 방법을 써야 하나요?'],
    ['짧은 적용 과제 해보기', '학습 범위에서 작은 응용 예제나 설명 과제를 정하고, 각자 결과를 비교해요.', '배운 내용을 새 상황에 적용할 때 추가로 확인할 것은 무엇인가요?'],
    ['설명 없이 스스로 확인하기', '서로 만든 짧은 복습 질문에 답하고, 정답보다 답을 고른 근거를 함께 확인해요.', '틀린 답도 그럴듯해 보이는 이유가 있나요?'],
    ['누적 복습과 약점 보완', '이전 요약에서 아직 헷갈리는 부분을 하나씩 골라, 새로운 예시로 다시 설명해요.', '같은 실수를 줄이려면 어떤 확인 순서가 좋을까요?'],
    ['우리 과목 복습 지도', '공부한 단원의 연결 관계와 남은 질문을 한 장으로 정리하고, 이후 학습 계획을 각자 정해요.', '다음에 혼자 공부할 때 무엇부터 찾아보면 될까요?'],
  ],
  'language-speaking': [
    ['부담 없이 첫 이야기', '영어로 이름 대신 오늘의 별명과 관심사 두 가지를 소개하고, 상대에게 쉬운 질문을 해요.', 'What do you like to do after class?'],
    ['학교에서 자주 가는 곳', '학교 안 장소 하나를 영어로 설명하고, 상대가 장소와 가는 길을 질문해요.', 'Where do you usually study, and why do you like it?'],
    ['나의 하루와 습관', '평소 하루를 순서대로 말하고, 상대와 비슷한 점이나 다른 점을 찾아요.', 'What is one thing you do almost every day?'],
    ['기억에 남는 경험', '최근 있었던 일을 시작·중간·마무리로 나눠 말하고, 상대가 후속 질문을 하나 해요.', 'What happened, and how did you feel about it?'],
    ['둘 중 하나 고르고 이유 말하기', '카페 공부와 도서관 공부처럼 가벼운 두 선택지를 비교하고, 선택한 이유를 말해요.', 'Which would you choose, and what matters most to you?'],
    ['약속 잡는 역할극', '만날 날짜·장소·할 일을 서로 제안하며 조율하고, 조건을 한 번 바꿔 다시 대화해요.', 'Would another time or place work for you?'],
    ['문제가 생겼을 때 설명하기', '예약 착오나 길을 잃은 상황처럼 일상 문제를 설명하고, 가능한 해결 방법을 요청해요.', 'Could you help me find another option?'],
    ['의견을 부드럽게 나누기', '학교생활 관련 가벼운 주제를 골라, 동의·다른 의견·이유를 존중하는 표현으로 말해요.', 'I see your point. Could we also consider another option?'],
    ['예상하지 못한 질문 이어가기', '이전 주제를 섞어 질문하고, 모르는 표현은 다른 말로 설명하며 대화를 이어가요.', 'Can you explain that in another way or give an example?'],
    ['나만의 대화 표현 모음', '가장 편해진 주제로 다시 대화하고, 다음에도 쓸 표현 세 개와 연습할 점 하나를 적어요.', 'What feels easier now, and what would you like to practice next?'],
  ],
  mentoring: [
    ['기대와 경계 맞추기', '멘토와 멘티가 듣고 싶은 주제와 답하기 어려운 주제를 나누고, 이번 대화 목표 하나를 정해요.', '오늘 어떤 도움을 받으면 가장 유용할까요?'],
    ['학교생활 지도 만들기', '수업·학습 공간·학교 지원 제도 중 궁금한 항목을 고르고, 확인 가능한 정보와 개인 경험을 구분해요.', '내 경험과 학교가 공식 안내한 사실을 구분해서 말할 수 있나요?'],
    ['수업과 공부 습관 나누기', '현재 어려운 공부 상황을 듣고, 시도해 본 방법과 다음에 작게 바꿀 방법을 함께 찾아요.', '이미 해본 방법 중 조금이라도 도움이 된 것은 무엇인가요?'],
    ['관심 분야 탐색하기', '흥미 있는 전공·활동 분야를 말하고, 부담 없이 알아볼 자료나 경험 한 가지를 정해요.', '아직 선택하지 않아도 알아볼 수 있는 작은 방법은 무엇일까요?'],
    ['질문을 구체적으로 만들기', '막연한 고민 하나를 상황·시도·궁금한 점으로 나눠, 도움을 요청하기 쉬운 질문으로 바꿔요.', '상대가 어떤 정보를 알면 더 정확히 도와줄 수 있나요?'],
    ['작은 계획 함께 점검하기', '지난번 스스로 정한 작은 행동을 돌아보고, 계속할 점과 부담을 줄일 점을 골라요.', '하지 못했다면 의지 말고 환경에서 바꿀 것은 무엇일까요?'],
    ['경험을 사실대로 전하기', '프로젝트나 학교 활동 경험 하나를 과정·배운 점·한계로 나눠 이야기하고 질문을 받아요.', '같은 방법이 다른 사람에게도 맞는다고 단정하고 있지 않나요?'],
    ['필요한 도움 연결하기', '혼자 해결하기 어려운 학업·진로 질문을 골라, 학교 공식 창구나 공개 자료를 함께 찾아요.', '이 질문은 또래 경험보다 공식 담당자의 확인이 필요한가요?'],
    ['서로의 변화 돌아보기', '처음 적었던 목표를 다시 보고, 나아진 점과 아직 남은 질문을 편하게 나눠요.', '상대가 스스로 선택할 수 있도록 어떤 도움을 더 줄 수 있나요?'],
    ['다음은 각자의 속도로', '고마웠던 도움과 앞으로 시도할 일을 정리하고, 연락·다음 만남은 양쪽이 원할 때만 정해요.', '여기서 마쳐도 부담 없도록 어떤 인사를 하면 좋을까요?'],
  ],
  'department-social': [
    ['오늘의 별명으로 인사', '오늘의 별명과 좋아하는 쉬는 방법을 소개하고, 말하고 싶지 않은 질문은 편하게 넘겨요.', '수업이 끝나고 한 시간 비면 무엇을 하고 싶나요?'],
    ['우리 과 소소한 공감 찾기', '개인이나 교수 평가 대신 학교생활의 사소한 공감대를 나누고, 비슷한 경험을 찾아요.', '처음 학교에 왔을 때 지금 생각하면 웃긴 경험이 있나요?'],
    ['쉬는 시간 취향 지도', '카페·산책·게임·독서 중 좋아하는 활동을 고르고, 부담 없이 함께 해볼 일을 정해요.', '돈이나 준비가 많이 들지 않는 활동은 무엇일까요?'],
    ['가벼운 선택 게임', '낮 산책과 밤 산책 같은 가벼운 질문을 번갈아 내고, 선택 이유를 짧게 들어봐요.', '같은 답을 골랐는데 이유는 다른 사람이 있나요?'],
    ['학교 주변 한 바퀴', '모두가 괜찮다고 한 공개된 동선으로 가볍게 걷거나, 이동이 어려우면 앉아서 장소 이야기를 나눠요.', '처음 오는 사람에게 소개하고 싶은 공개 장소는 어디인가요?'],
    ['취미를 3분만 소개하기', '준비하고 싶은 사람만 취미 하나를 짧게 소개하고, 나머지는 궁금한 점을 물어봐요.', '시작할 때 가장 쉬운 첫 단계는 무엇인가요?'],
    ['우리끼리 추천 교환', '무료 콘텐츠·음악·책·학교 행사를 하나씩 추천하고, 관심 없는 추천은 편하게 넘겨요.', '어떤 기분일 때 이걸 추천하고 싶나요?'],
    ['작은 협동 활동', '함께 풀 짧은 퀴즈나 그림 이어 그리기를 고르고, 승패보다 모두가 한 번씩 참여하도록 해요.', '말이 적은 사람도 편하게 참여할 다른 방법이 있을까요?'],
    ['다음에 해볼 일 골라보기', '다시 만나고 싶은 사람끼리만 가능한 활동을 제안하고, 날짜·비용은 별도 투표로 정해요.', '꼭 다시 만나야 한다는 부담 없이 어떤 선택을 열어둘까요?'],
    ['좋았던 순간으로 마무리', '기억에 남는 순간을 하나씩 나누고, 계속 만날지 마칠지는 각자의 선택으로 남겨요.', '오늘까지 함께한 사람에게 어떤 한마디를 전하고 싶나요?'],
  ],
}

type Assistance = Readonly<{ label: string; description: string; task: string; exchange: string }>
const academicHelp: Readonly<Record<StudyLevel, Assistance>> = {
  beginner: { label: '초보', description: '개념과 예제부터 천천히', task: '용어를 먼저 함께 확인하고, 풀이 예제 한 개를 보며 빈 단계부터 채워요. 모르는 부분은 질문 표시만 해도 괜찮아요.', exchange: '설명은 한 단계씩 하고, 상대가 자기 말로 다시 말할 시간을 주세요. 정답보다 막힌 지점을 먼저 확인해요.' },
  intermediate: { label: '중수', description: '혼자 시도한 뒤 풀이 비교', task: '자료를 바로 보지 않고 먼저 풀거나 설명해 본 뒤, 막힌 단계만 표시해요. 이후 수업 자료로 근거를 확인해요.', exchange: '각자 접근한 순서를 비교하고, 다른 풀이 하나를 서로 따라 해봐요. 결론이 다르면 적용 조건부터 다시 봐요.' },
  advanced: { label: '고수', description: '조건을 바꾸고 근거까지 설명', task: '기본 예제를 확인한 뒤 조건 하나를 바꾸거나 반례를 찾아요. 적용할 수 있는 범위와 한계를 함께 적어요.', exchange: '상대의 결론에 새 조건이나 반례를 질문해요. 빠른 계산이나 어려운 용어보다 근거가 연결되는지 확인해요.' },
}
const speakingHelp: Readonly<Record<StudyLevel, Assistance>> = {
  beginner: { label: '초보', description: '메모와 쉬운 문장으로 시작', task: '키워드 세 개를 메모하고 짧은 문장 두세 개로 말해요. 모르는 말은 한국어로 확인한 뒤 다시 짧게 말해봐요.', exchange: '상대가 끝까지 말하도록 기다리고, 이해한 내용을 쉬운 영어 한 문장으로 확인해요. 교정은 원할 때 한 가지만 해요.' },
  intermediate: { label: '중수', description: '이유와 경험까지 이어 말하기', task: '핵심 키워드만 보고 1분 정도 말해요. 이유 또는 구체적인 경험을 하나 덧붙이고, 끊기면 다른 표현으로 이어가요.', exchange: '준비하지 않은 후속 질문을 하나씩 해요. 이해를 막은 표현만 메모하고 대화가 끝난 뒤 함께 바꿔봐요.' },
  advanced: { label: '고수', description: '즉흥 질문과 관점 전환', task: '문장을 외우지 않고 상황을 듣자마자 대화해요. 중간에 조건이나 관점을 바꾸어도 설명을 이어가요.', exchange: '다른 관점의 질문을 더하고, 상대가 한 말을 요약한 뒤 자신의 의견을 덧붙여요. 자연스러운 연결 표현을 한 개씩 제안해요.' },
}
const conversationHelp: Readonly<Record<StudyLevel, Assistance>> = {
  beginner: { label: '천천히 시작', description: '짧게 말하거나 듣기부터', task: '질문 하나를 고르고 한 문장만 말해도 좋아요. 오늘은 듣기만 하거나 답하기 어려운 질문을 넘길 수 있어요.', exchange: '대답을 재촉하지 말고, 원하면 채팅으로 대신 적도록 해요. 듣고 싶은 조언이 있는지 먼저 물어요.' },
  intermediate: { label: '편하게 이야기', description: '경험과 질문을 한 가지씩', task: '직접 겪은 경험 한 가지와 궁금한 질문 한 가지를 나눠요. 답을 정해주기보다 상대의 상황을 먼저 들어요.', exchange: '각자 말할 기회를 한 번씩 갖고, 말하고 싶은 사람이 더 이어가요. 경험담을 모두에게 맞는 정답으로 말하지 않아요.' },
  advanced: { label: '서로 더 알아가기', description: '관점은 넓히고 선택은 존중', task: '같은 주제를 다른 관점에서 생각해 보고, 상대가 편하면 더 깊은 질문을 해요. 개인 정보나 사적인 답변은 요구하지 않아요.', exchange: '서로 다른 선택이 나온 이유를 듣고 공통점을 찾아요. 더 이야기하거나 여기서 마칠 자유를 함께 확인해요.' },
}

function assistanceFor(kind: StudyGuideKind): Readonly<Record<StudyLevel, Assistance>> {
  if (kind === 'language-speaking') return speakingHelp
  if (kind === 'mentoring' || kind === 'department-social') return conversationHelp
  return academicHelp
}

export function getStudyLevelOptions(kind: StudyGuideKind): readonly Readonly<{ id: StudyLevel; label: string; description: string }>[] {
  if (!STUDY_GUIDE_KINDS.includes(kind)) return []
  const help = assistanceFor(kind)
  return STUDY_LEVELS.map(id => ({ id, label: help[id].label, description: help[id].description }))
}

export function getStudyGuideOutline(kind: StudyGuideKind): readonly Readonly<{ sessionNumber: number; title: string }>[] {
  if (!STUDY_GUIDE_KINDS.includes(kind)) return []
  return topics[kind].map((topic, index) => ({ sessionNumber: index + 1, title: topic[0] }))
}

function preparationFor(kind: StudyGuideKind): string {
  if (kind === 'language-speaking') return '오늘 주제로 말해볼 경험이나 키워드를 준비해요. 문장 암기나 유료 교재는 필요 없어요.'
  if (kind === 'mentoring') return '묻고 싶은 질문 하나를 준비해요. 학번·전화번호·개인 성적표를 공개할 필요는 없어요.'
  if (kind === 'department-social') return '준비물 없이 편하게 와요. 비용이 들거나 이동하는 활동은 모두가 먼저 확인해요.'
  return '직접 수강하는 과목의 현재 진도와 공유 가능한 연습 자료를 준비해요. 시험 유출 자료·타인의 과제 답안은 올리지 않아요.'
}

function disclaimerFor(kind: StudyGuideKind): string {
  if (kind === 'language-speaking') return '또래 영어 대화 연습이며 공인 OPIc 등급이나 말하기 실력 인증이 아니에요. 짧은 문항 결과로 실력을 확정하지 않아요.'
  if (kind === 'mentoring') return '대화 방식은 멘토의 자격이나 전문성을 인증하지 않아요. 공식 학사·진로 정보는 학교 담당 창구에서 다시 확인해요.'
  if (kind === 'department-social') return '친목에는 실력 등급이나 시험이 없어요. 대화 방식은 편한 속도를 고르는 안내일 뿐이에요.'
  return '공식 강의계획서나 성적·수강 인증이 아닌 공동 학습 가이드예요. 실제 수업 진도와 난도에 맞게 범위를 함께 조정해요.'
}

/** Guidance is not shared session progress; completing a card never advances a room. */
export function getStudyGuide(input: Readonly<{ kind: StudyGuideKind; level: StudyLevel; sessionNumber: number }>): StudySessionGuide | null {
  if (!STUDY_GUIDE_KINDS.includes(input.kind) || !STUDY_LEVELS.includes(input.level)
    || !Number.isInteger(input.sessionNumber) || input.sessionNumber < 1 || input.sessionNumber > 10) return null
  const { kind, level, sessionNumber } = input
  const [title, task, question] = topics[kind][sessionNumber - 1]
  const help = assistanceFor(kind)[level]
  const conversation = kind === 'mentoring' || kind === 'department-social'
  const steps: readonly StudyGuideStep[] = [
    { id: 'welcome', title: '오늘의 속도 맞추기', minutes: 5, body: '새로 온 사람이 있으면 이전 요약을 먼저 함께 봐요. 말할 순서와 쉬는 시간을 확인하고, 이번에 가능한 범위를 한 가지로 정해요.' },
    { id: 'topic', title, minutes: conversation ? 10 : 8, body: task },
    { id: 'try', title: conversation ? '각자의 속도로 나누기' : '먼저 직접 해보기', minutes: conversation ? 8 : 15, body: help.task },
    { id: 'exchange', title: conversation ? '서로 듣고 질문하기' : '설명하고 비교하기', minutes: 15, body: help.exchange },
    { id: 'recap', title: '오늘 한 일 남기기', minutes: 7, body: '함께 다룬 내용과 다음 사람이 알아야 할 점을 짧게 정리해요. 개인 고민·연락처는 요약에 남기지 않고, 공유할 문장은 당사자에게 확인해요.' },
    { id: 'next', title: '다음 참여는 자유롭게', minutes: 5, body: '다음 회차에 참여할지, 이번엔 쉴지 각자 선택해요. 날짜·장소 후보는 누구나 제안하고 투표해요. 확정된 약속은 새 참가자가 와도 임의로 바꾸지 않아요.' },
  ]
  return {
    kind, level, sessionNumber, totalSessions: 10, title,
    goal: `${task} 마칠 때 오늘 확인한 점 한 가지를 자기 말로 정리해요.`,
    preparation: [preparationFor(kind), `오늘 확인할 질문: ${question}`],
    steps,
    prompts: [question, conversation ? '오늘 듣고 싶은 이야기와 넘기고 싶은 주제가 있나요?' : '답이나 설명의 근거를 어디에서 확인할 수 있나요?'],
    recap: [conversation ? '함께 공개해도 괜찮다고 확인한 이야기 한 가지' : '오늘 다룬 범위와 해결한 질문 한 가지', '다음 참가자가 미리 확인하면 좋은 자료나 남은 질문 한 가지'],
    nextTask: sessionNumber < 10 ? `다음은 ‘${topics[kind][sessionNumber][0]}’예요. 이어 참여하고 싶다면 질문 한 가지를 준비해요.` : '10회 안내를 마쳤어요. 남은 질문을 정리하고, 더 이어갈지 마칠지는 각자 선택해요. 자동 연장이나 자동 참석은 없어요.',
    participationNote: STUDY_PARTICIPATION_NOTE,
    skillDisclaimer: disclaimerFor(kind),
    estimatedMinutes: steps.reduce((sum, step) => sum + step.minutes, 0),
  }
}
