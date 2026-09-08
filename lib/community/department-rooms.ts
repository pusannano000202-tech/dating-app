export const MEETUP_SCOPES = ['school', 'department'] as const

export type MeetupScope = (typeof MEETUP_SCOPES)[number]
export type MeetupScopeAccess =
  | 'eligible'
  | 'wrong_school'
  | 'department_identity_required'
  | 'department_restricted'

export function parseMeetupScope(value: unknown): MeetupScope | null {
  return typeof value === 'string' && (MEETUP_SCOPES as readonly string[]).includes(value)
    ? value as MeetupScope
    : null
}

export function assessMeetupScopeAccess({
  sameSchool,
  scopeType,
  roomDepartmentKey,
  actorDepartmentKey,
}: {
  sameSchool: boolean
  scopeType: MeetupScope
  roomDepartmentKey: string | null
  actorDepartmentKey: string | null
}): MeetupScopeAccess {
  if (!sameSchool) return 'wrong_school'
  if (scopeType === 'school') return 'eligible'
  if (!roomDepartmentKey || !actorDepartmentKey) return 'department_identity_required'
  return roomDepartmentKey === actorDepartmentKey ? 'eligible' : 'department_restricted'
}

