export type CampusEatsBattleGuideScene = {
  stepNumber: number
  eyebrow: string
  title: string
  description: string
  dialogue: readonly string[]
  imagePosition: 'top' | 'center' | 'bottom'
}

export const CAMPUS_EATS_BATTLE_GUIDE_SCENES: readonly CampusEatsBattleGuideScene[] = [
  {
    stepNumber: 1,
    eyebrow: '먼저 참가 매장 선택',
    title: '먹어본 곳을 먼저 모아요',
    description: '실제로 먹어본 곳을 모두 고르면, 선택한 곳만으로 내 월드컵 대진이 만들어져요.',
    dialogue: ['내가 먹어본 곳만', '월드컵에 넣어요.'],
    imagePosition: 'top',
  },
  {
    stepNumber: 2,
    eyebrow: '대진마다 승자 선택',
    title: '승자를 다음 라운드로',
    description: '둘 중 더 맛있었던 곳을 고르면 승자가 다음 라운드로 진출하고 Elo 점수도 반영돼요.',
    dialogue: ['더 맛있었던 곳을', '다음 라운드로!'],
    imagePosition: 'center',
  },
  {
    stepNumber: 3,
    eyebrow: '결승에서 1등 확정',
    title: '마지막 한 곳이 내 챔피언',
    description: '7곳이면 6번의 승부를 거쳐 결승 승자 한 곳이 이번 월드컵 1등이 돼요.',
    dialogue: ['결승 승자가', '이번 내 1등!'],
    imagePosition: 'bottom',
  },
] as const
