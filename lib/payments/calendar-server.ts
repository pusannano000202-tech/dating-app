import {CalendarPaymentError, calendarRecord, calendarRpc, calendarUuid, parseCalendarOrder,
  type CalendarAudience, type CalendarOrder, type CalendarProviderMode, type CalendarRpc} from './calendar-contract'
import {calendarPaymentIdentity, verifiedCalendarPaid, verifiedCalendarRefund, type CalendarPaymentProvider} from './calendar-provider'

type Target = {eventId:string;audience:CalendarAudience}
function requireOrder(value: unknown, owner: string, target: Target, orderId?: string) {
  const order = parseCalendarOrder(value,owner,target.eventId)
  if (!order || order.audience !== target.audience || orderId && order.orderId !== orderId) throw new CalendarPaymentError('calendar_order_not_found',404)
  return order
}
const scope = (owner: string, target: Target) => ({p_actor:owner,p_event_id:target.eventId,p_audience:target.audience})
export async function prepareCalendarPayment(service: CalendarRpc, owner: string,
  input: Target & {applicationId:string;intentId:string}, mode: CalendarProviderMode) {
  const order = requireOrder(await calendarRpc(service,'prepare_calendar_payment_for_service',{
    ...scope(owner,input),p_application_id:input.applicationId,p_intent_id:input.intentId,p_provider_mode:mode,
  }),owner,input)
  if (order.applicationId !== input.applicationId || order.providerMode !== mode) throw new CalendarPaymentError('calendar_payment_conflict',409)
  return order
}

export async function getCalendarPayment(service: CalendarRpc, owner: string, input: Target & {orderId:string}) {
  return requireOrder(await calendarRpc(service,'get_calendar_payment_for_service',{
    ...scope(owner,input),p_order_id:input.orderId,
  }),owner,input,input.orderId)
}

/** Browser parameters never establish payment. Recover by the saved order first. */
export async function confirmCalendarPayment(service: CalendarRpc, provider: CalendarPaymentProvider, owner: string,
  input: Target & {orderId:string;paymentKey:string|null;amount:number|null}, allowNewCharge = true): Promise<CalendarOrder> {
  const order = await getCalendarPayment(service,owner,input)
  if (order.providerMode !== provider.mode) throw new CalendarPaymentError('calendar_provider_changed',409)
  // A completed refund is already backed by verified provider cancellation proof.
  // Do not turn a successful recovery into an error because that order is CANCELED.
  if (order.depositState === 'refunded') return order
  if (input.amount !== null && input.amount !== order.amountKrw) throw new CalendarPaymentError('calendar_payment_evidence_mismatch',409)
  const args = {...scope(owner,input),p_order_id:order.orderId}
  let payment: unknown
  try {payment = await provider.lookup(order.orderId)} catch (error) {
    const absent = calendarRecord(error)
    if (absent?.status === 404 && absent.code === 'NOT_FOUND_PAYMENT' && order.state === 'prepared' && order.paymentKey === null
      && Date.parse(order.expiresAt) <= Date.now()) {
      await calendarRpc(service,'abort_calendar_payment_for_service',{...args,p_provider_mode:provider.mode})
      throw new CalendarPaymentError('calendar_payment_aborted',409)
    }
    throw new CalendarPaymentError('calendar_reconciliation_required')
  }
  const identity = calendarPaymentIdentity(payment,order)
  if (!identity || input.paymentKey !== null && identity.paymentKey !== input.paymentKey) throw new CalendarPaymentError('calendar_payment_evidence_mismatch',409)
  const paymentKey = String(identity.paymentKey), recordedArgs = {...args,p_payment_key:paymentKey,p_amount_krw:10000}
  if (!verifiedCalendarPaid(payment,order)) {
    if (!allowNewCharge || !input.paymentKey || order.state === 'aborted' || identity.status !== 'IN_PROGRESS') {
      throw new CalendarPaymentError('calendar_payment_not_ready',409)
    }
    // Rechecks consent, owner, date, expiry and cancellation under the event's locks.
    const claimed = requireOrder(await calendarRpc(service,'record_calendar_payment_for_service',{
      ...recordedArgs,p_state:'confirming',
    }),owner,input,order.orderId)
    if (claimed.state !== 'confirming' || claimed.paymentKey !== paymentKey) throw new CalendarPaymentError('calendar_reconciliation_required')
    try {payment = await provider.confirm({orderId:order.orderId,paymentKey,amount:10000,idempotencyKey:`calendar-confirm-${order.orderId}`})}
    catch {
      try {payment = await provider.lookup(order.orderId)} catch {payment = null}
    }
  }
  if (!verifiedCalendarPaid(payment,{...order,paymentKey})) {
    await calendarRpc(service,'record_calendar_payment_for_service',{...recordedArgs,p_state:'reconciliation_required'})
    throw new CalendarPaymentError('calendar_reconciliation_required')
  }
  // Late provider approval is recorded as refund_due; it never reopens a cancelled date.
  return requireOrder(await calendarRpc(service,'record_calendar_payment_for_service',{
    ...recordedArgs,p_state:'confirmed',
  }),owner,input,order.orderId)
}

/** Only an owner-requested, DB-claimed refund can reach the original Toss cancellation. */
export async function processCalendarRefund(service: CalendarRpc, provider: CalendarPaymentProvider, owner: string,
  input: Target & {orderId:string}, leaseId: string): Promise<CalendarOrder> {
  const args = {...scope(owner,input),p_order_id:input.orderId,p_lease_id:leaseId,p_provider_mode:provider.mode}
  const raw = calendarRecord(await calendarRpc(service,'claim_calendar_refund_for_service',args))
  const order = requireOrder(raw?.order,owner,input,input.orderId)
  if (order.providerMode !== provider.mode) throw new CalendarPaymentError('calendar_provider_changed',409)
  if (order.depositState === 'refunded') return order
  if (!raw || !calendarUuid(raw.requestId) || raw.leaseId !== leaseId || !order.paymentKey || order.depositState !== 'refund_due') {
    throw new CalendarPaymentError('calendar_reconciliation_required')
  }
  const claim = {...args,p_request_id:raw.requestId}
  try {
    let payment = await provider.lookup(order.orderId)
    const identity = calendarPaymentIdentity(payment,order)
    if (!identity) throw new CalendarPaymentError('calendar_refund_proof_mismatch')
    if (identity.status !== 'CANCELED') {
      if (!verifiedCalendarPaid(payment,order)) throw new CalendarPaymentError('calendar_refund_proof_mismatch')
      payment = await provider.cancel({paymentKey:order.paymentKey,cancelAmount:10000,
        cancelReason:'Quantum 캘린더 보증금 본인 반환 신청',idempotencyKey:`calendar-refund-${raw.requestId}`})
    }
    const transactionKey = verifiedCalendarRefund(payment,order)
    return requireOrder(await calendarRpc(service,'finalize_calendar_refund_for_service',{
      ...claim,p_payment_key:order.paymentKey,p_transaction_key:transactionKey,p_amount_krw:10000,
    }),owner,input,input.orderId)
  } catch {
    // Retain the durable request. Retry first re-queries the original order, recovering
    // a successful cancellation even when its response or DB acknowledgement was lost.
    await calendarRpc(service,'release_calendar_refund_for_service',claim)
    throw new CalendarPaymentError('calendar_reconciliation_required')
  }
}
