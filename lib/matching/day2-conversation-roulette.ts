export const DAY2_CONVERSATION_ROULETTE_QUESTIONS = [
  '최근에 있었던 일 중 가장 웃겼던 순간은?',
  '지금 걷기에 어울리는 한 곡은?',
  '쉬는 날에는 집과 밖 중 어디를 더 선호해요?',
  '바쁜 날 잠깐 숨을 돌리는 나만의 방법은?',
  '어릴 때 좋아했던 캐릭터나 간식은?',
  '최근 스스로 잘했다고 생각한 작은 일은?',
] as const

export function getDay2Question(index: number) {
  if (!Number.isInteger(index) || index < 0) return DAY2_CONVERSATION_ROULETTE_QUESTIONS[0]
  return DAY2_CONVERSATION_ROULETTE_QUESTIONS[index % DAY2_CONVERSATION_ROULETTE_QUESTIONS.length]
}
