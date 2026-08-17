import {
  toGroupMemberSummary,
  type DatabaseMatchingProfile,
  type PrivateMatchingAppearance,
} from './profile-adapter'
import type { GroupMemberSummary } from './types'
import type { Gender, GroupSummaryInput } from './types'

export interface MatchingProfileRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}

export type LoadPrivateMatchingMembersResult =
  | {
      ok: true
      membersByGroupId: Map<string, GroupMemberSummary[]>
      groupsById: Map<string, GroupSummaryInput>
    }
  | {
      ok: false
      reason: 'invalid_group_ids' | 'query_failed' | 'invalid_response' | 'incomplete_groups'
    }

export async function loadPrivateMatchingMembers(
  client: MatchingProfileRpcClient,
  groupIds: string[],
): Promise<LoadPrivateMatchingMembersResult> {
  const requestedGroupIds = new Set(groupIds)
  if (
    groupIds.length === 0 ||
    requestedGroupIds.size !== groupIds.length ||
    groupIds.some((groupId) => !isNonEmptyString(groupId))
  ) {
    return { ok: false, reason: 'invalid_group_ids' }
  }

  const { data, error } = await client.rpc('get_private_matching_profiles', {
    p_group_ids: groupIds,
  })
  if (error) return { ok: false, reason: 'query_failed' }
  if (!Array.isArray(data)) return { ok: false, reason: 'invalid_response' }

  const membersByGroupId = new Map<string, GroupMemberSummary[]>()
  const groupMetadataById = new Map<string, PrivateGroupMetadata>()
  const memberIdsByGroupId = new Map<string, Set<string>>()
  for (const row of data) {
    if (
      !isRecord(row) ||
      !isNonEmptyString(row.group_id) ||
      !requestedGroupIds.has(row.group_id)
    ) {
      return { ok: false, reason: 'invalid_response' }
    }

    const metadata = toPrivateGroupMetadata(row)
    if (!metadata) return { ok: false, reason: 'invalid_response' }

    const existingMetadata = groupMetadataById.get(row.group_id)
    if (existingMetadata && !hasSameStableMetadata(existingMetadata, metadata)) {
      return { ok: false, reason: 'invalid_response' }
    }

    const memberIds = memberIdsByGroupId.get(row.group_id) ?? new Set<string>()
    if (!isNonEmptyString(row.user_id) || memberIds.has(row.user_id)) {
      return { ok: false, reason: 'invalid_response' }
    }
    memberIds.add(row.user_id)
    memberIdsByGroupId.set(row.group_id, memberIds)

    if (existingMetadata) {
      existingMetadata.departmentCodes.add(metadata.department)
    } else {
      groupMetadataById.set(row.group_id, metadata)
    }

    const member = toGroupMemberSummary(
      row as DatabaseMatchingProfile,
      {
        score_normalized: row.score_normalized,
        appearance_type: row.appearance_type,
      } as PrivateMatchingAppearance,
    )
    if (!member) return { ok: false, reason: 'invalid_response' }

    const groupMembers = membersByGroupId.get(row.group_id) ?? []
    groupMembers.push(member)
    membersByGroupId.set(row.group_id, groupMembers)
  }

  if (groupIds.some((groupId) => !membersByGroupId.has(groupId))) {
    return { ok: false, reason: 'incomplete_groups' }
  }

  const groupsById = new Map<string, GroupSummaryInput>()
  for (const groupId of groupIds) {
    const members = membersByGroupId.get(groupId)
    const metadata = groupMetadataById.get(groupId)
    if (!members || !metadata || members.length !== metadata.size) {
      return { ok: false, reason: 'incomplete_groups' }
    }

    groupsById.set(groupId, {
      groupId,
      gender: metadata.gender,
      size: metadata.size,
      departmentCodes: [...metadata.departmentCodes].sort(),
      excludedGroupIds: metadata.excludedGroupIds,
      members,
    })
  }

  return { ok: true, membersByGroupId, groupsById }
}

interface PrivateGroupMetadata {
  gender: Extract<Gender, 'male' | 'female'>
  size: number
  department: string
  departmentCodes: Set<string>
  excludedGroupIds: string[]
}

function toPrivateGroupMetadata(row: Record<string, unknown>): PrivateGroupMetadata | null {
  if (
    (row.group_gender !== 'male' && row.group_gender !== 'female') ||
    !Number.isInteger(row.group_size) ||
    (row.group_size as number) < 2 ||
    (row.group_size as number) > 3 ||
    !isNonEmptyString(row.department) ||
    !Array.isArray(row.excluded_group_ids) ||
    row.excluded_group_ids.some((groupId) => !isNonEmptyString(groupId))
  ) {
    return null
  }

  const department = normalizeDepartment(row.department)
  const excludedGroupIds = [...new Set(row.excluded_group_ids as string[])].sort()
  return {
    gender: row.group_gender,
    size: row.group_size as number,
    department,
    departmentCodes: new Set([department]),
    excludedGroupIds,
  }
}

function hasSameStableMetadata(a: PrivateGroupMetadata, b: PrivateGroupMetadata): boolean {
  return (
    a.gender === b.gender &&
    a.size === b.size &&
    a.excludedGroupIds.length === b.excludedGroupIds.length &&
    a.excludedGroupIds.every((groupId, index) => groupId === b.excludedGroupIds[index])
  )
}

function normalizeDepartment(value: string): string {
  return value.trim().toLowerCase()
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
