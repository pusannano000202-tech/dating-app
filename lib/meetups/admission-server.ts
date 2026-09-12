import { parseAdmissionApplicationInput, parseAdmissionDepositQuote, parseAdmissionRoomTarget } from './admission-contract'
import type { AdmissionDepositQuote, AdmissionRoomTarget } from './admission-contract'

export type AdmissionRpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }
export type AdmissionPolicy = { summary: string; conditions: string[] }
export type MeetupAdmissionContext = { room: AdmissionRoomTarget; quote: AdmissionDepositQuote | null; policy: AdmissionPolicy | null; checkoutEnabled: false; preparationOnly: true }
export type MeetupAdmissionPreparation = { applicationId: null; intentId: string; admission: 'draft'; payment: 'unpaid'; preparation: 'prepared'; checkoutEnabled: false; reused: boolean }
export class AdmissionServerError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number) { super(code); this.name = 'AdmissionServerError'; this.code = code; this.status = status }
}
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const onlyKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key))
const invalidResponse = () => new AdmissionServerError('admission_response_invalid', 503)
const statuses: Record<string, number> = {
  not_authenticated: 401, activity_room_forbidden: 403, account_deletion_pending: 403, profile_required: 403,
  meetup_not_found: 404, meetup_closed: 409, meetup_full: 409, meetup_already_joined: 409,
  meetup_gender_required: 403, meetup_gender_restricted: 403, deposit_policy_unavailable: 409,
  deposit_quote_mismatch: 409, deposit_quote_expired: 409, deposit_policy_changed: 409,
  admission_preparation_exists: 409, idempotency_key_reused: 409, deposit_payment_method_unavailable: 400,
  invalid_input: 400, unknown_field: 400, intro_required: 400, intro_too_long: 400, invalid_intro: 400,
  invalid_strength: 400, invalid_payment_method: 400, deposit_consent_required: 400,
  invalid_policy_version: 400, invalid_quote_id: 400, invalid_idempotency_key: 400,
}
function roomTarget(roomId: string): AdmissionRoomTarget {
  const room = parseAdmissionRoomTarget({ kind: 'custom_meetup', id: roomId })
  if (!room) throw new AdmissionServerError('invalid_room', 400)
  return room
}
async function rpc(client: AdmissionRpcClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  let result: { data: unknown; error: unknown }
  try { result = await client.rpc(name, args) } catch { throw new AdmissionServerError('admission_unavailable', 503) }
  if (result.error) {
    const error = record(result.error)
    const code = typeof error?.message === 'string' ? error.message : ''
    if (Object.hasOwn(statuses, code)) throw new AdmissionServerError(code, statuses[code])
    if (error?.code === 'PGRST202' || error?.code === '42883' || error?.code === '42P01') throw new AdmissionServerError('admission_schema_unavailable', 503)
    throw new AdmissionServerError('admission_unavailable', 503)
  }
  return result.data
}
function parsePolicy(value: unknown): AdmissionPolicy | null {
  const data = record(value)
  if (!data || !onlyKeys(data, ['summary', 'conditions']) || typeof data.summary !== 'string'
    || !data.summary.trim() || Array.from(data.summary).length > 1000 || !Array.isArray(data.conditions)
    || data.conditions.length < 1 || data.conditions.length > 12
    || !data.conditions.every(item => typeof item === 'string' && item.trim() && Array.from(item).length <= 1000)) return null
  return { summary: data.summary, conditions: [...data.conditions] }
}
/** Use the request's authenticated Supabase client. Never pass a service-role client. */
export async function getMeetupAdmissionContext(client: AdmissionRpcClient, roomId: string): Promise<MeetupAdmissionContext> {
  const room = roomTarget(roomId)
  const data = record(await rpc(client, 'get_activity_meetup_admission_context', { p_meetup_id: room.id }))
  const responseRoom = parseAdmissionRoomTarget(data?.room)
  if (!data || !onlyKeys(data, ['room', 'quote', 'policy', 'checkoutEnabled', 'preparationOnly'])
    || responseRoom?.kind !== room.kind || responseRoom.id !== room.id
    || data.checkoutEnabled !== false || data.preparationOnly !== true) throw invalidResponse()
  if (data.quote === null && data.policy === null) return { room, quote: null, policy: null, checkoutEnabled: false, preparationOnly: true }
  const quote = parseAdmissionDepositQuote(data.quote), policy = parsePolicy(data.policy)
  if (!quote || !policy || quote.room.kind !== room.kind || quote.room.id !== room.id
    || quote.paymentMethods.length !== 1 || quote.paymentMethods[0] !== 'new') throw invalidResponse()
  return { room, quote, policy, checkoutEnabled: false, preparationOnly: true }
}
/** Persists a private, unpaid draft only. There is deliberately no payment/finalize adapter. */
export async function prepareMeetupAdmission(client: AdmissionRpcClient, roomId: string, input: unknown): Promise<MeetupAdmissionPreparation> {
  const room = roomTarget(roomId), parsed = parseAdmissionApplicationInput(input)
  if (!parsed.ok) throw new AdmissionServerError(parsed.error, 400)
  if (parsed.value.paymentMethod !== 'new') throw new AdmissionServerError('deposit_payment_method_unavailable', 400)
  const data = record(await rpc(client, 'prepare_activity_meetup_admission', { p_meetup_id: room.id, p_input: parsed.value }))
  if (!data || !onlyKeys(data, ['applicationId', 'intentId', 'admission', 'payment', 'preparation', 'checkoutEnabled', 'reused'])
    || data.applicationId !== null || !parseAdmissionRoomTarget({ kind: 'custom_meetup', id: data.intentId })
    || data.admission !== 'draft' || data.payment !== 'unpaid' || data.preparation !== 'prepared'
    || data.checkoutEnabled !== false || typeof data.reused !== 'boolean') throw invalidResponse()
  return { applicationId: null, intentId: data.intentId as string, admission: 'draft', payment: 'unpaid', preparation: 'prepared', checkoutEnabled: false, reused: data.reused }
}
