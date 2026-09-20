import {CALENDAR_DEPOSIT_KRW, CalendarPaymentError, calendarPaymentKey, calendarRecord, calendarTimestamp,
  type CalendarOrder, type CalendarProviderMode} from './calendar-contract'

export type CalendarPaymentProvider = {
  mode: CalendarProviderMode
  lookup(orderId: string): Promise<unknown>
  confirm(input: {orderId:string;paymentKey:string;amount:number;idempotencyKey:string}): Promise<unknown>
  cancel(input: {paymentKey:string;cancelAmount:number;cancelReason:string;idempotencyKey:string}): Promise<unknown>
}

export function calendarPaymentConfig(env: Readonly<Record<string,string|undefined>>): {
  mode: CalendarProviderMode|null; clientKey:string; ready:boolean; recoveryReady:boolean
} {
  const clientKey = env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? ''
  const clientMode = /^(test|live)_ck_[A-Za-z0-9]+$/.exec(clientKey)?.[1]
  const secretMode = /^(test|live)_sk_[A-Za-z0-9]+$/.exec(env.TOSS_SECRET_KEY?.trim() ?? '')?.[1]
  const mode = secretMode === 'test' || secretMode === 'live' ? secretMode : null
  const providerReady = !!mode && clientMode === mode && !(env.NODE_ENV === 'production' && mode === 'test')
  // A dedicated activation flag prevents an unrelated deposit flag opening this flow.
  return {mode, clientKey, ready:env.QUANTUM_CALENDAR_PAYMENTS_ENABLED === 'true' && providerReady,
    recoveryReady:!!mode && !(env.NODE_ENV === 'production' && mode === 'test')}
}

export function calendarPaymentIdentity(value: unknown, order: CalendarOrder): Record<string,unknown> | null {
  const p = calendarRecord(value)
  return p && p.orderId === order.orderId && p.currency === 'KRW' && p.totalAmount === CALENDAR_DEPOSIT_KRW
    && calendarPaymentKey(p.paymentKey) && (order.paymentKey === null || order.paymentKey === p.paymentKey) ? p : null
}
export function verifiedCalendarPaid(value: unknown, order: CalendarOrder): boolean {
  const p = calendarPaymentIdentity(value,order)
  return !!p && p.status === 'DONE' && p.balanceAmount === CALENDAR_DEPOSIT_KRW
    && calendarTimestamp(p.approvedAt) && (p.cancels == null || Array.isArray(p.cancels) && p.cancels.length === 0)
}

/** Original payment only. A provider cancel is not booked until its full proof verifies. */
export function verifiedCalendarRefund(value: unknown, order: CalendarOrder): string {
  const p = calendarPaymentIdentity(value,order)
  if (!p || p.status !== 'CANCELED' || p.balanceAmount !== 0 || !calendarPaymentKey(p.lastTransactionKey)
    || !Array.isArray(p.cancels) || p.cancels.length === 0) throw new CalendarPaymentError('calendar_refund_proof_mismatch')
  let total = 0
  const transactions = new Set<string>()
  for (const raw of p.cancels) {
    const c = calendarRecord(raw)
    if (!c || c.cancelStatus !== 'DONE' || !calendarPaymentKey(c.transactionKey) || transactions.has(c.transactionKey)
      || !Number.isSafeInteger(c.cancelAmount) || Number(c.cancelAmount) <= 0 || !calendarTimestamp(c.canceledAt)) {
      throw new CalendarPaymentError('calendar_refund_proof_mismatch')
    }
    transactions.add(c.transactionKey); total += Number(c.cancelAmount)
  }
  if (total !== CALENDAR_DEPOSIT_KRW || !transactions.has(p.lastTransactionKey)) throw new CalendarPaymentError('calendar_refund_proof_mismatch')
  return p.lastTransactionKey
}
