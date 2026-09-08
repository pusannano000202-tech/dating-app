export const day1BoardGame = {
  day: 1 as const,
  title: '달무티로 시작하는 보드게임 데이',
  summary: '게임을 함께 고르고 시작·종료를 실제 회차에 저장해요.',
  minimumParticipants: 5,
  actions: ['select_game', 'start_game', 'finish_game', 'finish_occurrence'] as const,
}
