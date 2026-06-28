export const ANIMAL_ALIAS_POOL = [
  '오소리',
  '꿀벌',
  '개구리',
  '고래',
  '다람쥐',
  '여우',
] as const

export type AliasTheme = 'animals'

export interface MemberAlias {
  userId: string
  alias: (typeof ANIMAL_ALIAS_POOL)[number]
  aliasTheme: AliasTheme
  sortOrder: number
}

export function assignMemberAliases(userIds: string[]): MemberAlias[] {
  const uniqueSortedUserIds = [...new Set(userIds)].sort()

  if (uniqueSortedUserIds.length > ANIMAL_ALIAS_POOL.length) {
    throw new Error('alias_pool_exhausted')
  }

  return uniqueSortedUserIds.map((userId, index) => ({
    userId,
    alias: ANIMAL_ALIAS_POOL[index],
    aliasTheme: 'animals',
    sortOrder: index,
  }))
}
