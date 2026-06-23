export type MatchGroupSize = 2 | 3

export const DEFAULT_MATCH_GROUP_SIZE: MatchGroupSize = 3

export function normalizeGroupSize(value: unknown): MatchGroupSize {
  if (value === 2 || value === '2') return 2
  if (value === 3 || value === '3') return 3
  return DEFAULT_MATCH_GROUP_SIZE
}
