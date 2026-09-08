export type FriendSceneKind = 'acquaintance' | 'app_met' | 'unclassified'
export type FriendSceneEvidence = 'direct_invite' | 'matching' | 'meetup' | 'unknown'

export type FriendSceneSummary = Readonly<{
  friendUserId: string
  kind: FriendSceneKind
  evidence: FriendSceneEvidence
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KINDS = new Set<FriendSceneKind>(['acquaintance', 'app_met', 'unclassified'])
const EVIDENCE = new Set<FriendSceneEvidence>(['direct_invite', 'matching', 'meetup', 'unknown'])

export function parseFriendSceneList(value: unknown): FriendSceneSummary[] | null {
  if (!exactRecord(value, ['friends']) || !Array.isArray(value.friends) || value.friends.length > 100) return null
  const rows: FriendSceneSummary[] = []
  const seen = new Set<string>()
  for (const row of value.friends) {
    if (!exactRecord(row, ['friend_user_id', 'scene_kind', 'evidence_kind'])
        || typeof row.friend_user_id !== 'string' || !UUID.test(row.friend_user_id)
        || !KINDS.has(row.scene_kind as FriendSceneKind)
        || !EVIDENCE.has(row.evidence_kind as FriendSceneEvidence)
        || seen.has(row.friend_user_id)) return null
    const kind = row.scene_kind as FriendSceneKind
    const evidence = row.evidence_kind as FriendSceneEvidence
    if (!validPair(kind, evidence)) return null
    seen.add(row.friend_user_id)
    rows.push({ friendUserId: row.friend_user_id, kind, evidence })
  }
  return rows
}

export function friendSceneLabel(kind: string, evidence: string): string {
  if (kind === 'acquaintance' && evidence === 'direct_invite') return '기존 지인'
  if (kind === 'app_met' && (evidence === 'matching' || evidence === 'meetup')) return '앱에서 만난 친구'
  if (kind === 'unclassified' && evidence === 'unknown') return '출처 미분류'
  return '출처 확인 불가'
}

function validPair(kind: FriendSceneKind, evidence: FriendSceneEvidence) {
  return (kind === 'acquaintance' && evidence === 'direct_invite')
    || (kind === 'app_met' && (evidence === 'matching' || evidence === 'meetup'))
    || (kind === 'unclassified' && evidence === 'unknown')
}

function exactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}
