export type VoicePromptContext = { topic?: string | null; scope?: string | null; adviceRole?: string | null }
export type VoicePromptPack = { label: string; cards: readonly string[]; nextHref: string; nextLabel: string }

/** Optional editorial material: never signals attendance, friendship, clinical advice or a new match. */
export function voiceConversationPrompts(context: VoicePromptContext): VoicePromptPack {
  if (context.topic === 'worries') return {
    label: context.adviceRole === 'listener' ? '오늘은 귀 기울이는 쪽' : '내 속도로 꺼내는 이야기',
    cards: context.adviceRole === 'listener'
      ? ['지금은 들어주면 좋을까요, 함께 방법을 생각하면 좋을까요?', '그때 어떤 마음이 가장 컸는지, 말해줄 수 있나요?', '더 이야기하고 싶으면 천천히 들어볼게요. 조언은 원할 때만 나눠요.', '이 대화에서 조금이라도 편해진 부분이 있었나요?']
      : ['오늘 마음에 남은 일을 한 가지만 꺼내볼까요?', '지금은 들어줬으면 하는지, 의견도 듣고 싶은지 먼저 말해요.', '자세한 신상 대신 내가 느낀 마음부터 이야기해도 좋아요.', '오늘은 여기까지 이야기하고 싶다고 말해도 괜찮아요.'],
    nextHref: '/community/voice', nextLabel: '다른 대화 주제 둘러보기',
  }
  if (['lck', 'baseball', 'kbo', 'soccer', 'football'].includes(context.topic ?? '')) return {
    label: '같이 보는 재미, 한마디부터',
    cards: ['오늘 응원하는 팀과 가장 기대하는 장면은?', '방금 장면, 다들 어떻게 봤어요? 화면 시차가 있다면 스포일러를 조심해요.', '쉬는 시간! 이 팀을 응원하게 된 계기가 있나요?', '오늘 가장 기억에 남은 순간 하나씩 골라볼까요?'],
    nextHref: context.topic === 'lck' ? '/meetups?category=gaming' : '/meetups',
    nextLabel: context.topic === 'lck' ? '경기 뒤 같이 할 게임 모임 보기' : '다음에 함께할 모임 보기',
  }
  if (context.scope === 'department') return {
    label: '우리 과, 조금 더 가깝게',
    cards: ['이번 학기에 듣는 수업 중 이야기하고 싶은 것은?', '공강에는 주로 어디에서 시간을 보내나요?', '학과 친구들과 같이 해보고 싶은 활동은?', '한 팀을 만든다면 어떤 게임이나 운동이 좋을까요?'],
    nextHref: '/community/department', nextLabel: '우리 과 활동 둘러보기',
  }
  return {
    label: '가볍게 시작하는 한마디',
    cards: ['오늘 있었던 작지만 괜찮았던 일은?', '요즘 나도 모르게 계속 찾아보는 것은?', '공강이 두 시간 생긴다면 뭘 하고 싶어요?', '오늘의 별명으로 한 줄 자기소개를 해볼까요?'],
    nextHref: '/community/content', nextLabel: '우리 학교 취향 콘텐츠 보기',
  }
}
