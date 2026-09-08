export const day2Conversation = {
  day: 2 as const,
  title: '온천천 30분 대화',
  summary: '5명이나 6명 모두 빠짐없이 참여하는 3라운드 대화예요.',
  minimumParticipants: 5,
  actions: ['start_round', 'advance_prompt', 'finish_round', 'finish_occurrence'] as const,
}
