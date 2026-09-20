/** Calendar deposits are owned by one event application and one person. */
export const CALENDAR_DEPOSIT_KRW = 10000 as const
export type CalendarProviderMode = 'test' | 'live'
export type CalendarAudience = 'single' | 'couple'
export type CalendarPaymentState = 'prepared' | 'confirming' | 'reconciliation_required' | 'confirmed' | 'aborted'
export type CalendarDepositState = 'unpaid' | 'held' | 'refund_due' | 'refunded'
export type CalendarOrder = {
  orderId: string; intentId: string; eventId: string; applicationId: string; ownerId: string; audience: CalendarAudience
  providerMode: CalendarProviderMode; amountKrw: 10000; state: CalendarPaymentState
  paymentKey: string | null; expiresAt: string; eventStartsAt:string; depositState: CalendarDepositState
}
export type CalendarRpc = {rpc(name: string, args: Record<string, unknown>): PromiseLike<{data: unknown; error: unknown}>}
export const calendarRecord = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
export const calendarUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export const calendarPaymentKey = (v: unknown): v is string => typeof v === 'string' && /^[\x21-\x7e]{1,200}$/.test(v)
export const calendarOrderId = (v: unknown): v is string => typeof v === 'string' && /^calendar_[0-9a-f]{32}$/.test(v)
export const calendarTimestamp = (v: unknown): v is string => typeof v === 'string' && v.length <= 64 && Number.isFinite(Date.parse(v))
export function calendarEventMonth(eventStartsAt:string) {
  if (!calendarTimestamp(eventStartsAt)) throw new Error('calendar_response_invalid')
  return new Date(Date.parse(eventStartsAt)+9*60*60*1000).toISOString().slice(0,7)
}

export function parseCalendarOrder(value: unknown, ownerId: string, eventId: string): CalendarOrder | null {
  const v = calendarRecord(value)
  if (!v || !['intentId','eventId','applicationId','ownerId'].every(k => calendarUuid(v[k]))
    || v.ownerId !== ownerId || v.eventId !== eventId || v.amountKrw !== CALENDAR_DEPOSIT_KRW
    || !calendarOrderId(v.orderId) || v.orderId !== `calendar_${String(v.intentId).replaceAll('-', '').toLowerCase()}`
    || !['test','live'].includes(String(v.providerMode))
    || !['single','couple'].includes(String(v.audience))
    || !['prepared','confirming','reconciliation_required','confirmed','aborted'].includes(String(v.state))
    || !['unpaid','held','refund_due','refunded'].includes(String(v.depositState))
    || !(v.paymentKey === null || calendarPaymentKey(v.paymentKey)) || !calendarTimestamp(v.expiresAt) || !calendarTimestamp(v.eventStartsAt)) return null
  return {orderId:v.orderId, intentId:String(v.intentId), eventId, applicationId:String(v.applicationId), ownerId, audience:v.audience as CalendarAudience,
    providerMode:v.providerMode as CalendarProviderMode, amountKrw:CALENDAR_DEPOSIT_KRW,
    state:v.state as CalendarPaymentState, paymentKey:v.paymentKey as string|null,
    expiresAt:v.expiresAt,eventStartsAt:v.eventStartsAt, depositState:v.depositState as CalendarDepositState}
}

/** Never send provider receipt keys, owner metadata or arbitrary RPC fields to a browser. */
export function publicCalendarOrder(order: CalendarOrder) {
  return {orderId:order.orderId, intentId:order.intentId, eventId:order.eventId, applicationId:order.applicationId, audience:order.audience,
    amountKrw:order.amountKrw, providerMode:order.providerMode, state:order.state,
    expiresAt:order.expiresAt,eventStartsAt:order.eventStartsAt, depositState:order.depositState}
}

export class CalendarPaymentError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status = 503) {super(code); this.name = 'CalendarPaymentError'; this.code = code; this.status = status}
}
const errors: Record<string, number> = {
  calendar_order_not_found:404, calendar_application_not_found:404, calendar_payment_not_ready:409,
  calendar_event_closed:409, calendar_partner_pending:409, calendar_payment_expired:409,
  calendar_payment_aborted:409, calendar_payment_conflict:409, calendar_payment_evidence_mismatch:409,
  calendar_provider_changed:409, calendar_refund_not_available:409, calendar_refund_busy:409,
  calendar_invalid_input:400, calendar_idempotency_conflict:409, account_deletion_pending:403,
  forbidden:403, not_authenticated:401, matching_features_not_ready:409,
}
export async function calendarRpc(client: CalendarRpc, name: string, args: Record<string, unknown>): Promise<unknown> {
  let result: {data: unknown; error: unknown}
  try {result = await client.rpc(name,args)} catch {throw new CalendarPaymentError('calendar_reconciliation_required')}
  if (result.error) {
    const code = calendarRecord(result.error)?.message
    if (typeof code === 'string' && Object.hasOwn(errors,code)) throw new CalendarPaymentError(code,errors[code])
    throw new CalendarPaymentError('calendar_reconciliation_required')
  }
  return result.data
}
