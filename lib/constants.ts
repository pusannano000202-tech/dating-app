import type { AppearanceType } from './types'

// imagePath: public/appearance-types/{type}.jpg 에 AI 생성 사진 저장
// 사진 없을 때는 gradient 배경 + emoji 폴백으로 표시
export const APPEARANCE_TYPE_INFO: Record<
  AppearanceType,
  {
    label: string
    emoji: string
    keywords: string[]
    description: string
    gradient: string
    imagePath: string
  }
> = {
  cute: {
    label: '귀여운',
    emoji: '🌸',
    keywords: ['동그란 눈', '애교', '사랑스러운'],
    description: '보는 것만으로도 기분 좋아지는 발랄하고 사랑스러운 분위기',
    gradient: 'from-pink-400 to-rose-300',
    imagePath: '/appearance-types/cute.jpg',
  },
  pure: {
    label: '청순한',
    emoji: '🌿',
    keywords: ['단아한', '자연스러운', '깨끗한'],
    description: '꾸민 듯 안 꾼 듯 맑고 투명한 자연스러운 분위기',
    gradient: 'from-green-300 to-teal-300',
    imagePath: '/appearance-types/pure.jpg',
  },
  chic: {
    label: '시크한',
    emoji: '🖤',
    keywords: ['도도한', '세련된', '날카로운'],
    description: '가까이 하기엔 너무 멀게 느껴지는 차갑고 세련된 분위기',
    gradient: 'from-gray-600 to-slate-500',
    imagePath: '/appearance-types/chic.jpg',
  },
  warm: {
    label: '따뜻한',
    emoji: '☀️',
    keywords: ['친근한', '웃는 눈', '편안한'],
    description: '옆에 있으면 저절로 마음이 풀어지는 따뜻하고 친근한 분위기',
    gradient: 'from-amber-400 to-orange-300',
    imagePath: '/appearance-types/warm.jpg',
  },
  stylish: {
    label: '스타일리시',
    emoji: '✨',
    keywords: ['트렌디', '개성있는', '패셔니스타'],
    description: '어디서든 눈길을 사로잡는 독보적인 스타일과 개성',
    gradient: 'from-purple-500 to-violet-400',
    imagePath: '/appearance-types/stylish.jpg',
  },
  healthy: {
    label: '건강미',
    emoji: '💪',
    keywords: ['활기찬', '운동', '생기있는'],
    description: '생동감 넘치는 건강한 활력이 느껴지는 에너지 넘치는 분위기',
    gradient: 'from-blue-400 to-cyan-300',
    imagePath: '/appearance-types/healthy.jpg',
  },
}

// 월드컵 대진표 (8강 → 4강 → 결승, 6개 타입 + 2 부전승)
// 인덱스: 0=cute, 1=pure, 2=chic, 3=warm, 4=stylish, 5=healthy
// [4], [5]가 8강에서 부전승
export const WORLDCUP_BRACKET: [number, number][][] = [
  // 8강 (4경기, 이 중 2경기는 실제 유저 선택)
  [[0, 1], [2, 3]], // 유저가 고름
  // 4강 (2경기)
  // 결승 (1경기)
]

export const DEPOSIT_AMOUNT = 5000 // 원
