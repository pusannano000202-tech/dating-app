import {requestGuardErrorResponse} from '../auth/server-guards'
import {CalendarPaymentError,calendarOrderId,calendarPaymentKey,calendarRecord,calendarUuid,type CalendarAudience} from './calendar-contract'
import {confirmTossPayment,cancelTossPayment,getTossPaymentByOrderId} from './toss'
import type {CalendarPaymentProvider} from './calendar-provider'

export const calendarJson = (value: unknown,status = 200) => Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}})
export function calendarError(error: unknown) {
  return error instanceof CalendarPaymentError ? calendarJson({error:error.code},error.status) : requestGuardErrorResponse(error)
}
export async function calendarBody(request: Request, fields: string[]) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CalendarPaymentError('calendar_invalid_input',415)
  const reader = request.body?.getReader()
  if (!reader) throw new CalendarPaymentError('calendar_invalid_input',400)
  const chunks: Uint8Array[] = []; let length = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    length += next.value.length
    if (length > 8192) {await reader.cancel(); throw new CalendarPaymentError('calendar_invalid_input',413)}
    chunks.push(next.value)
  }
  let raw: unknown
  try {raw = JSON.parse(Buffer.concat(chunks).toString('utf8'))} catch {throw new CalendarPaymentError('calendar_invalid_input',400)}
  const body = calendarRecord(raw)
  if (!body || Object.keys(body).some(k => !fields.includes(k))) throw new CalendarPaymentError('calendar_invalid_input',400)
  return body
}
export function calendarTarget(body: Record<string,unknown>): {audience:CalendarAudience;eventId:string} {
  if (!['single','couple'].includes(String(body.audience)) || !calendarUuid(body.eventId)) throw new CalendarPaymentError('calendar_invalid_input',400)
  return {audience:body.audience as CalendarAudience,eventId:body.eventId.toLowerCase()}
}
export function calendarOrderTarget(body: Record<string,unknown>) {
  const target = calendarTarget(body)
  if (!calendarOrderId(body.orderId)) throw new CalendarPaymentError('calendar_invalid_input',400)
  return {...target,orderId:body.orderId}
}
export function calendarConfirmation(body: Record<string,unknown>) {
  const target = calendarOrderTarget(body)
  if (!(body.paymentKey === null && body.amount === null || calendarPaymentKey(body.paymentKey) && body.amount === 10000)) {
    throw new CalendarPaymentError('calendar_invalid_input',400)
  }
  return {...target,paymentKey:body.paymentKey as string|null,amount:body.amount as number|null}
}
export function calendarProvider(mode: 'test'|'live'): CalendarPaymentProvider {
  return {mode,lookup:getTossPaymentByOrderId,confirm:confirmTossPayment,cancel:cancelTossPayment}
}
