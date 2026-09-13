export const STORY_PROMPTS = [
  { id: 'first-hello', category: 'relationship-advice', title: '처음 만났을 때, 어떤 한마디가 편했나요?', body: '내가 편했던 첫인사나 대화 시작 방법을 나눠요.\n\n상대의 이름·학번·연락처 대신 상황만 적어 주세요.\n\n나의 이야기: ', tag: '말문 열기' },
  { id: 'cafe-or-walk', category: 'relationship-advice', title: '친해질 때 카페 vs 산책, 어느 쪽이 좋아요?', body: '마주 보고 천천히 이야기하기, 나란히 걸으면서 이야기하기.\n\n나는 어떤 쪽이 편하고, 그 이유는 무엇인가요?\n\n나의 선택: ', tag: '우리의 취향' },
  { id: 'campus-idea', category: 'feedback', title: '우리 학교에 이런 모임이 있으면 좋겠어요', body: '함께하고 싶은 활동과 부담 없이 참가할 방법을 제안해 주세요.\n\n하고 싶은 활동: \n참가하기 편한 방식: ', tag: '함께 만드는 Quantum' },
] as const

export function storyDraft(category: string, id: unknown): { title: string; body: string } | null {
  const prompt = STORY_PROMPTS.find(item => item.category === category && item.id === id)
  return prompt ? { title: prompt.title, body: prompt.body } : null
}
