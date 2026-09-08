export type DepartmentAllocationIdentity = {
  applicantId: string
  roundNamespace: string
  schoolScopeKey: string
  departmentKey: string
  acceptedCompanionApplicationId: string | null
}

export function canonicalDepartmentKey(value: unknown): string | null {
  return canonicalIdentityKey(value, 120)
}

export function canonicalSchoolScopeKey(value: unknown): string | null {
  return canonicalIdentityKey(value, 120)
}

/**
 * Returns true when an allocator must reject the proposed unit combination.
 * The only same-department exemption is a non-null, explicitly accepted
 * companion application inside the same allocation round.
 */
export function hasDepartmentAssignmentConflict(
  members: readonly DepartmentAllocationIdentity[],
): boolean {
  if (members.some((member) => !hasCanonicalIdentity(member))) return true

  const namespace = members[0]?.roundNamespace
  if (members.some((member) => member.roundNamespace !== namespace)) return true

  for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
      const left = members[leftIndex]
      const right = members[rightIndex]
      if (
        left.schoolScopeKey !== right.schoolScopeKey
        || left.departmentKey !== right.departmentKey
      ) continue

      const sameAcceptedCompanionApplication =
        left.acceptedCompanionApplicationId !== null
        && left.acceptedCompanionApplicationId === right.acceptedCompanionApplicationId
      if (!sameAcceptedCompanionApplication) return true
    }
  }

  return false
}

function canonicalIdentityKey(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  const canonical = trimmed.replace(/\s+/gu, '').toLocaleLowerCase('en-US')
  return canonical || null
}

function hasCanonicalIdentity(member: DepartmentAllocationIdentity): boolean {
  return Boolean(member.applicantId)
    && Boolean(member.roundNamespace)
    && canonicalSchoolScopeKey(member.schoolScopeKey) === member.schoolScopeKey
    && canonicalDepartmentKey(member.departmentKey) === member.departmentKey
}

