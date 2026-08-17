export type LegacyGroupStatus =
  | 'forming'
  | 'ready'
  | 'in_pool'
  | 'matched'
  | 'completed'
  | 'disbanded'

const CONTINUABLE_LEGACY_GROUP_STATUSES = new Set<LegacyGroupStatus>([
  'forming',
  'ready',
  'in_pool',
  'matched',
])

export function getLegacyGroupScope(
  group: { status: LegacyGroupStatus } | null | undefined,
): 'continue' | 'redirect_to_match' {
  if (!group) return 'redirect_to_match'
  return CONTINUABLE_LEGACY_GROUP_STATUSES.has(group.status)
    ? 'continue'
    : 'redirect_to_match'
}
