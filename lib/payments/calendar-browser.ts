'use client'
import {calendarEventMonth,calendarOrderId,calendarRecord,calendarTimestamp,calendarUuid,type CalendarAudience} from './calendar-contract'
import {requestTossPaymentWindow,type TossBrowserPaymentRequest} from './toss-browser'

export type CalendarBrowserTarget = {audience:CalendarAudience;eventId:string;ownerId:string}
const orderFields = ['orderId','eventId','applicationId','audience','state','depositState','amountKrw']
function checkedOrder(value: unknown,target: CalendarBrowserTarget) {
  const v = calendarRecord(value)
  if (!v || !orderFields.every(k => k in v) || !calendarOrderId(v.orderId) || v.eventId !== target.eventId || v.audience !== target.audience
    || !calendarUuid(v.applicationId) || !calendarTimestamp(v.eventStartsAt) || v.amountKrw !== 10000 || !['unpaid','held','refund_due','refunded'].includes(String(v.depositState))) throw new Error('calendar_response_invalid')
  return {orderId:v.orderId,applicationId:v.applicationId,eventId:target.eventId,audience:target.audience,
    state:String(v.state),depositState:String(v.depositState),eventStartsAt:v.eventStartsAt,amountKrw:10000 as const}
}
async function post(path: string,body: unknown,ownerId: string) {
  const response = await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Quantum-Owner':ownerId},body:JSON.stringify(body)})
  const data = calendarRecord(await response.json())
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'calendar_unavailable')
  if (!data || data.accountKey !== ownerId) throw new Error('account_changed')
  return data
}
export function calendarRecoveryPath(target: {audience:CalendarAudience;eventId:string;orderId:string;month?:string|null}) {
  const query = new URLSearchParams({audience:target.audience,event:target.eventId,order:target.orderId})
  if (target.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(target.month)) query.set('month',target.month)
  return `/match/calendar/payment?${query}`
}
export async function requestCalendarCheckout(input: CalendarBrowserTarget & {entryId:string}) {
  const key = `quantum-calendar-order:${input.ownerId}:${input.audience}:${input.eventId}:${input.entryId}`
  let intent = sessionStorage.getItem(key)
  if (!calendarUuid(intent)) {intent = crypto.randomUUID();sessionStorage.setItem(key,intent)}
  const data = await post('/api/payments/calendar/prepare',{audience:input.audience,eventId:input.eventId,entryId:input.entryId,idempotencyKey:intent},input.ownerId)
  const order = checkedOrder(data.order,input)
  if (order.applicationId !== input.entryId) throw new Error('calendar_response_invalid')
  if (order.state === 'aborted') {sessionStorage.removeItem(key);throw new Error('calendar_payment_aborted')}
  const checkout = calendarRecord(data.checkout)
  if (!checkout) {window.location.assign(calendarRecoveryPath({...input,orderId:order.orderId,month:calendarEventMonth(order.eventStartsAt)}));return order}
  if (order.state !== 'prepared' || checkout.orderId !== order.orderId || checkout.amount !== 10000 || checkout.provider !== 'toss'
    || checkout.method !== 'CARD' || checkout.customerKey !== input.ownerId || typeof checkout.clientKey !== 'string') throw new Error('calendar_response_invalid')
  for (const field of ['successUrl','failUrl']) {
    if (typeof checkout[field] !== 'string') throw new Error('calendar_response_invalid')
    const url = new URL(checkout[field])
    if (url.origin !== window.location.origin || url.pathname !== '/match/calendar/payment' || url.searchParams.get('event') !== input.eventId
      || url.searchParams.get('audience') !== input.audience || url.searchParams.get('order') !== order.orderId) throw new Error('calendar_response_invalid')
  }
  await requestTossPaymentWindow(checkout as unknown as TossBrowserPaymentRequest)
  return order
}
export async function requestCalendarRefund(input: CalendarBrowserTarget & {orderId:string}) {
  const data = await post('/api/payments/calendar/refund',{audience:input.audience,eventId:input.eventId,orderId:input.orderId},input.ownerId)
  const order = checkedOrder(data.order,input)
  if (order.orderId !== input.orderId || order.depositState !== 'refunded') throw new Error('calendar_refund_pending')
  return order
}
