export type RelationshipStatus = 'single' | 'in_relationship'
export interface RelationshipState {
  status: RelationshipStatus
  changed_at: string | null
  next_change_at: string | null
  can_change: boolean
  server_now: string
}
export function isRelationshipStatus(value: unknown): value is RelationshipStatus {
  return value === 'single' || value === 'in_relationship'
}
export function parseRelationshipState(value: unknown): RelationshipState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some(key => !['status','changed_at','next_change_at','can_change','server_now'].includes(key))
    || !isRelationshipStatus(v.status) || typeof v.can_change !== 'boolean' || !timestamp(v.server_now)) return null
  if (v.changed_at === null && v.next_change_at === null) {
    return v.status === 'single' && v.can_change ? v as unknown as RelationshipState : null
  }
  if (!timestamp(v.changed_at) || !timestamp(v.next_change_at)) return null
  if (Date.parse(v.next_change_at) - Date.parse(v.changed_at) !== 30 * 24 * 3600 * 1000
    || v.can_change !== (Date.parse(v.server_now) >= Date.parse(v.next_change_at))) return null
  return v as unknown as RelationshipState
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}
export function classifyRelationshipError(error: unknown): {error: string; status: number} {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : ''
  if (/relationship_not_authenticated/.test(message)) return {error:'relationship_not_authenticated',status:401}
  if (/relationship_forbidden/.test(message)) return {error:'relationship_forbidden',status:403}
  if (/relationship_change_locked/.test(message)) return {error:'relationship_change_locked',status:409}
  if (/invalid_relationship_status/.test(message)) return {error:'invalid_relationship_status',status:400}
  if (/dating_participation_unavailable/.test(message)) return {error:'dating_participation_unavailable',status:409}
  return {error:'relationship_unavailable',status:503}
}

/** API preflight is fail-closed before migration; DB triggers remain authoritative. */
export async function datingAdmissionFailure(client: {
  rpc(name: string): PromiseLike<{data: unknown; error: unknown}>
}): Promise<{error:string;status:number} | null> {
  try {
    const {data,error} = await client.rpc('get_my_relationship_state')
    if (error) return classifyRelationshipError(error)
    const state = parseRelationshipState(data)
    if (!state) return {error:'relationship_unavailable',status:503}
    return state.status === 'single' ? null : {error:'dating_participation_unavailable',status:409}
  } catch { return {error:'relationship_unavailable',status:503} }
}
