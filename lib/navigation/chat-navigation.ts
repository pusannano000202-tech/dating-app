export type ChatTab = 'social' | 'matching' | 'friends'
export function parseChatTab(value: string | null | undefined): ChatTab {
  return value === 'matching' || value === 'friends' ? value : 'social'
}
export function chatListHref(tab: ChatTab): string {
  return '/chat?tab=' + tab
}
