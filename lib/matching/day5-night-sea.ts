export const day5NightSea = {
  day: 5 as const,
  title: '광안리 밤바다 피날레',
  summary: '확인된 집결지와 동선, 휴식, 귀가 안내까지 마치면 프로그램이 끝나요.',
  minimumParticipants: 3,
  actions: ['check_in', 'confirm_route', 'take_break', 'finish_occurrence'] as const,
}
