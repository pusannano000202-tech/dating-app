export const day3Bowling = {
  day: 3 as const,
  title: '저녁과 볼링',
  summary: '연습 점수, 팀, 본게임 점수와 동점 결과를 서버에 남겨요.',
  minimumParticipants: 3,
  actions: ['save_practice_scores', 'set_teams', 'save_game_scores', 'finish_occurrence'] as const,
}
