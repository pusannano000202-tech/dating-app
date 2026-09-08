export type VoiceCategoryId = 'cheer' | 'conversation' | 'department'

export const VOICE_CATEGORIES: readonly {
  id: VoiceCategoryId
  label: string
  summary: string
  sceneIds: readonly string[]
  officialTopics: readonly string[]
}[] = [
  { id: 'cheer', label: '응원하기', summary: 'LCK · KBO · 축구', sceneIds: ['lck', 'kbo', 'football'], officialTopics: ['baseball'] },
  { id: 'conversation', label: '이야기 나누기', summary: '연애 · 취업 · 수다', sceneIds: ['romance', 'career', 'social'], officialTopics: ['worries', 'social'] },
  { id: 'department', label: '우리 학과', summary: '같은 과 친구들과', sceneIds: ['department'], officialTopics: ['department'] },
]

export function getVoiceCategoryScenes<T extends { id: string }>(scenes: readonly T[], category: VoiceCategoryId): T[] {
  const selected = VOICE_CATEGORIES.find(item => item.id === category)
  return scenes.filter(scene => selected?.sceneIds.includes(scene.id))
}
