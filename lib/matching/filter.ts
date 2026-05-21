import type { MatchingConfig } from './config'
import { hasTimeslotOverlap } from './time'
import type { GroupSummary, MatchableResult } from './types'

export function isMatchable(
  a: GroupSummary,
  b: GroupSummary,
  config: MatchingConfig,
): MatchableResult {
  if (a.gender === b.gender) return { ok: false, reason: 'same_gender' }
  if (a.size !== b.size) return { ok: false, reason: 'size_mismatch' }
  if (sharesDepartment(a, b)) return { ok: false, reason: 'department_blocked' }
  if (a.excludedGroupIds.includes(b.groupId) || b.excludedGroupIds.includes(a.groupId)) {
    return { ok: false, reason: 'excluded_pair' }
  }
  if (!hasRequiredProfileData(a) || !hasRequiredProfileData(b)) {
    return { ok: false, reason: 'missing_required_profile_data' }
  }
  if (!hasTimeslotOverlap(a.availability, b.availability)) {
    return { ok: false, reason: 'no_time_overlap' }
  }

  const scoreGap = Math.abs(a.avgSelfAppearanceScore - b.avgSelfAppearanceScore)
  if (scoreGap > config.hardFilter.SCORE_BAND_WIDTH) {
    return { ok: false, reason: 'score_band_mismatch' }
  }

  return { ok: true }
}

function sharesDepartment(a: GroupSummary, b: GroupSummary): boolean {
  const bDepartments = new Set(b.departmentCodes)
  return a.departmentCodes.some((department) => bDepartments.has(department))
}

function hasRequiredProfileData(group: GroupSummary): group is GroupSummary & {
  avgSelfAppearanceScore: number
} {
  return (
    typeof group.avgSelfAppearanceScore === 'number' &&
    group.avgAppearanceVector != null &&
    group.avgPreferredAxisZVector != null &&
    group.avgBig5 != null &&
    group.preferredBig5 != null
  )
}
