import { TraitKey } from "@/types/matching";

export type QuizChoice = {
  text: string;
  score: number;
};

export type QuizQuestion = {
  id: number;
  trait: TraitKey;
  situation: string;
  choices: QuizChoice[];
};

export const questions: QuizQuestion[] = [
  {
    id: 1,
    trait: "atmosphereCoordination",
    situation: "과팅 자리에서 대화가 갑자기 끊겼어. 어떻게 해?",
    choices: [
      { text: "바로 새 화제를 꺼낸다", score: 5 },
      { text: "잠깐 기다렸다가 말을 꺼낸다", score: 4 },
      { text: "누군가 먼저 말하겠지", score: 2 },
      { text: "폰 만지며 버틴다", score: 1 },
    ],
  },
  {
    id: 2,
    trait: "atmosphereCoordination",
    situation: "분위기가 예상보다 많이 가라앉아 있어. 어떻게 해?",
    choices: [
      { text: "게임이나 공통 화제를 제안한다", score: 5 },
      { text: "옆 사람한테 살짝 말을 건다", score: 4 },
      { text: "분위기가 풀릴 때까지 기다린다", score: 2 },
      { text: "그냥 빨리 끝나길 바란다", score: 1 },
    ],
  },
  {
    id: 3,
    trait: "consideration",
    situation: "말수가 거의 없는 사람이 한 명 있어. 어떻게 해?",
    choices: [
      { text: "자연스럽게 그 사람에게 질문을 돌린다", score: 5 },
      { text: "눈을 마주쳐서 참여를 유도한다", score: 4 },
      { text: "본인이 말하고 싶으면 하겠지", score: 2 },
      { text: "신경 쓰지 않는다", score: 1 },
    ],
  },
  {
    id: 4,
    trait: "consideration",
    situation: "옆 사람이 불편해 보이는 상황이야. 어떻게 해?",
    choices: [
      { text: "조용히 괜찮냐고 물어본다", score: 5 },
      { text: "화제를 바꿔서 분위기를 돌린다", score: 4 },
      { text: "내 일에 집중한다", score: 2 },
      { text: "못 본 척한다", score: 1 },
    ],
  },
  {
    id: 5,
    trait: "participation",
    situation: "누군가 게임 제안을 했어. 어떻게 해?",
    choices: [
      { text: "바로 '오 좋아!' 하고 참여한다", score: 5 },
      { text: "다수가 원하면 따른다", score: 4 },
      { text: "지켜보다가 분위기 보고 한다", score: 2 },
      { text: "별로지만 억지로 참여한다", score: 1 },
    ],
  },
  {
    id: 6,
    trait: "participation",
    situation: "자기소개 순서가 돌아왔어. 어떻게 해?",
    choices: [
      { text: "재미있는 에피소드 하나 섞어서 자연스럽게 한다", score: 5 },
      { text: "준비한 말을 짧고 깔끔하게 한다", score: 4 },
      { text: "최대한 짧게 끝낸다", score: 2 },
      { text: "긴장해서 말이 잘 안 나온다", score: 1 },
    ],
  },
  {
    id: 7,
    trait: "respectfulness",
    situation: "상대가 대답하기 싫어하는 것 같은 질문을 받았어. 어떻게 해?",
    choices: [
      { text: "답하기 불편할 수 있다고 먼저 양해를 구한다", score: 5 },
      { text: "질문을 살짝 바꿔서 물어본다", score: 4 },
      { text: "일단 물어보고 반응 보다가 사과한다", score: 2 },
      { text: "솔직한 게 좋으니 그냥 계속 묻는다", score: 1 },
    ],
  },
  {
    id: 8,
    trait: "respectfulness",
    situation: "자리가 생각보다 가깝고 신체 접촉이 생길 것 같아. 어떻게 해?",
    choices: [
      { text: "자연스럽게 거리를 만들어주거나 양해를 구한다", score: 5 },
      { text: "상대 표정 보고 불편하면 조심한다", score: 4 },
      { text: "어색해서 그냥 있는다", score: 2 },
      { text: "의식 안 하고 편하게 있는다", score: 1 },
    ],
  },
  {
    id: 9,
    trait: "communicationBalance",
    situation: "한 사람이 대화를 혼자 독점하고 있어. 어떻게 해?",
    choices: [
      { text: "다른 사람에게 질문을 넘겨서 균형을 맞춘다", score: 5 },
      { text: "자연스럽게 끼어들어 화제를 바꾼다", score: 4 },
      { text: "나도 같이 참여하며 지켜본다", score: 2 },
      { text: "그 사람이 지칠 때까지 기다린다", score: 1 },
    ],
  },
  {
    id: 10,
    trait: "communicationBalance",
    situation: "짝 대화에서 내 파트너가 많이 조용해. 어떻게 해?",
    choices: [
      { text: "가볍게 물어보면서 대화를 이끌어 본다", score: 5 },
      { text: "관심사를 물어보며 편하게 해준다", score: 4 },
      { text: "나도 조용히 있는다", score: 2 },
      { text: "불편해서 다른 대화에 끼려고 한다", score: 1 },
    ],
  },
];
