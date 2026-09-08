export const day4SameAnswer = {
  day: 4 as const,
  title: '같은 답 카드',
  summary: '식사와 자율 음료로 진행하며 무알코올도 똑같이 참여해요.',
  minimumParticipants: 3,
  actions: ['draw_card', 'take_break', 'finish_occurrence'] as const,
}
