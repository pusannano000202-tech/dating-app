/** Operator dates are distinct from Tonight's ranked pool. No payment authority. */
export type CalendarAudience = 'single' | 'couple'
export type CalendarApplicationStatus = 'pending_partner' | 'payment_pending' | 'awaiting_consents' | 'active' | 'ready' | 'calendar_ready' | 'assigned' | 'cancelled' | 'expired' | 'matched' | 'completed'
export type CalendarDepositState = 'unavailable' | 'unpaid' | 'held' | 'refund_due' | 'refund_pending' | 'refunded'
export type CalendarPreparationResponse = {
  audience: CalendarAudience
  eventId: string
  entryId: string
  intentId: null
  status: CalendarApplicationStatus
  role: 'self' | 'leader' | 'partner'
  myConsent: boolean
  partnerAccepted: boolean | null
  depositAmountKrw: 10000
  depositPolicyStatus: 'not_connected' | 'connected'
  checkoutEnabled: boolean
  applicationFinalized: boolean
  myDepositState: CalendarDepositState
  partnerDepositReady: boolean | null
  orderId: string | null
  refundState: 'unavailable' | 'available' | 'requested' | 'processing' | 'failed' | 'completed'
}
export type CalendarEvent = {
  id: string
  audience: CalendarAudience
  title: string
  summary: string
  imageUrl: string | null
  startsAt: string
  endsAt: string
  applicationClosesAt: string
  locationName: string | null
  depositAmountKrw: 10000
  applicantCount: number | null
  status: 'recruiting' | 'closed' | 'assigned' | 'cancelled' | 'completed'
  myApplication: {id: string; status: CalendarApplicationStatus} | null
  /** Dates/partner preparation may work; payment and final admission are not wired. */
  checkoutEnabled: boolean
  depositPolicyStatus: 'not_connected' | 'connected'
}
export type EventCalendarResponse = {
  serverNow: string
  relationshipStatus: 'single' | 'in_relationship'
  events: CalendarEvent[]
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
export function parseCalendarQuery(url: string): {month: string; audience: CalendarAudience} | null {
  const query = new URL(url).searchParams
  if ([...query.keys()].some(key => !['month','audience'].includes(key)) || query.getAll('month').length !== 1 || query.getAll('audience').length !== 1) return null
  const month = query.get('month'), audience = query.get('audience')
  if (!month || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month) || !['single','couple'].includes(audience ?? '')) return null
  return {month, audience: audience as CalendarAudience}
}
export function parseEventCalendar(value: unknown, audience: CalendarAudience): EventCalendarResponse | null {
  if (!record(value) || !timestamp(value.serverNow) || !['single','in_relationship'].includes(String(value.relationshipStatus)) || !Array.isArray(value.events) || value.events.length > 500) return null
  const events: CalendarEvent[] = []
  const ids = new Set<string>()
  for (const event of value.events) {
    if (!record(event) || !uuid(event.id) || ids.has(event.id) || event.audience !== audience
      || typeof event.title !== 'string' || !event.title.trim() || event.title.length > 160
      || typeof event.summary !== 'string' || event.summary.length > 1200
      || !(event.imageUrl === null || typeof event.imageUrl === 'string' && /^\/images\/[a-zA-Z0-9/_-]+\.(?:png|webp|jpe?g)$/.test(event.imageUrl))
      || !timestamp(event.startsAt) || !timestamp(event.endsAt) || !timestamp(event.applicationClosesAt)
      || Date.parse(event.endsAt) <= Date.parse(event.startsAt) || Date.parse(event.applicationClosesAt) > Date.parse(event.startsAt)
      || !(event.locationName === null || typeof event.locationName === 'string' && event.locationName.trim().length > 0 && event.locationName.length <= 160)
      || event.depositAmountKrw !== 10000 || !(event.applicantCount === null || Number.isSafeInteger(event.applicantCount) && Number(event.applicantCount) >= 0)
      || !['recruiting','closed','assigned','cancelled','completed'].includes(String(event.status)) || typeof event.checkoutEnabled !== 'boolean' || !['not_connected','connected'].includes(String(event.depositPolicyStatus))) return null
    const mine = event.myApplication
    if (mine !== null && (!record(mine) || !uuid(mine.id) || !['pending_partner','payment_pending','awaiting_consents','active','ready','calendar_ready','assigned','cancelled','expired','matched','completed'].includes(String(mine.status)))) return null
    ids.add(event.id)
    // Pick only display fields. Never forward an unexpected RPC identity field.
    events.push({id:event.id,audience,title:event.title,summary:event.summary,imageUrl:event.imageUrl as string|null,
      startsAt:event.startsAt,endsAt:event.endsAt,applicationClosesAt:event.applicationClosesAt,locationName:event.locationName as string|null,
      depositAmountKrw:10000,applicantCount:event.applicantCount as number|null,status:event.status as CalendarEvent['status'],
      myApplication:mine === null ? null : {id:(mine as Record<string,unknown>).id as string,status:(mine as Record<string,unknown>).status as CalendarApplicationStatus},checkoutEnabled:event.checkoutEnabled,depositPolicyStatus:event.depositPolicyStatus as CalendarEvent['depositPolicyStatus']})
  }
  return {serverNow:value.serverNow,relationshipStatus:value.relationshipStatus as EventCalendarResponse['relationshipStatus'],events}
}

export function parseCalendarApplicationInput(value: unknown): {audience:CalendarAudience;partnerUserId:string|null;idempotencyKey:string;participationConsent:true} | null {
  if (!record(value) || Object.keys(value).some(key => !['audience','partnerUserId','idempotencyKey','participationConsent'].includes(key))
    || !['single','couple'].includes(String(value.audience)) || !uuid(value.idempotencyKey) || value.participationConsent !== true
    || (value.audience === 'couple' ? !uuid(value.partnerUserId) : value.partnerUserId !== undefined && value.partnerUserId !== null)) return null
  return {audience:value.audience as CalendarAudience,partnerUserId:value.audience==='couple'?value.partnerUserId as string:null,idempotencyKey:value.idempotencyKey,participationConsent:true}
}
export const isCalendarId=uuid
export function parseCalendarPreparation(value:unknown):CalendarPreparationResponse|null {
  if(!record(value)||!['single','couple'].includes(String(value.audience))||!uuid(value.entryId)||!uuid(value.eventId)||value.intentId!==null
    ||!['pending_partner','payment_pending','awaiting_consents','active','ready','calendar_ready','assigned','cancelled','expired','matched','completed'].includes(String(value.status))
    ||!['self','leader','partner'].includes(String(value.role))||typeof value.myConsent!=='boolean'||!(value.partnerAccepted===null||typeof value.partnerAccepted==='boolean')
    ||value.depositAmountKrw!==10000||!['not_connected','connected'].includes(String(value.depositPolicyStatus))||typeof value.checkoutEnabled!=='boolean'||typeof value.applicationFinalized!=='boolean'
    ||!['unavailable','unpaid','held','refund_due','refund_pending','refunded'].includes(String(value.myDepositState))||!(value.partnerDepositReady===null||typeof value.partnerDepositReady==='boolean')
    ||!(value.orderId===null||typeof value.orderId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(value.orderId))
    ||!['unavailable','available','requested','processing','failed','completed'].includes(String(value.refundState)))return null
  return {audience:value.audience as CalendarAudience,eventId:value.eventId,entryId:value.entryId,intentId:null,status:value.status as CalendarApplicationStatus,
    role:value.role as CalendarPreparationResponse['role'],myConsent:value.myConsent,partnerAccepted:value.partnerAccepted as boolean|null,depositAmountKrw:10000,
    depositPolicyStatus:value.depositPolicyStatus as CalendarPreparationResponse['depositPolicyStatus'],checkoutEnabled:value.checkoutEnabled,applicationFinalized:value.applicationFinalized,
    myDepositState:value.myDepositState as CalendarDepositState,partnerDepositReady:value.partnerDepositReady as boolean|null,
    orderId:value.orderId as string|null,refundState:value.refundState as CalendarPreparationResponse['refundState']}
}
