import {requireRequestAccess} from '@/lib/auth/server-guards'
import {createPaymentServiceClient} from '@/lib/payments/deposit-server'
import {CalendarPaymentError,calendarEventMonth,calendarUuid,publicCalendarOrder} from '@/lib/payments/calendar-contract'
import {calendarPaymentConfig} from '@/lib/payments/calendar-provider'
import {prepareCalendarPayment} from '@/lib/payments/calendar-server'
import {calendarBody,calendarError,calendarJson,calendarTarget} from '@/lib/payments/calendar-http'
import {getPublicAppOrigin} from '@/lib/utils'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    const {userId} = await requireRequestAccess(request,{allowedRoles:['user']})
    if (request.headers.get('x-quantum-owner') !== userId) return calendarJson({error:'account_changed'},409)
    const body = await calendarBody(request,['audience','eventId','entryId','idempotencyKey']),target = calendarTarget(body)
    if (!calendarUuid(body.entryId) || !calendarUuid(body.idempotencyKey)) throw new CalendarPaymentError('calendar_invalid_input',400)
    const config = calendarPaymentConfig(process.env),service = createPaymentServiceClient(),origin = getPublicAppOrigin()
    if (!config.ready || !config.mode || !service || !origin) return calendarJson({error:'calendar_checkout_unavailable'},503)
    const order = await prepareCalendarPayment(service,userId,{...target,applicationId:body.entryId,intentId:body.idempotencyKey},config.mode)
    const success = new URL('/match/calendar/payment',origin),failure = new URL('/match/calendar/payment',origin)
    for (const url of [success,failure]) {url.searchParams.set('audience',target.audience);url.searchParams.set('event',target.eventId);url.searchParams.set('order',order.orderId);url.searchParams.set('month',calendarEventMonth(order.eventStartsAt))}
    success.searchParams.set('checkout','success');failure.searchParams.set('checkout','failed')
    return calendarJson({accountKey:userId,order:publicCalendarOrder(order),checkout:order.state==='prepared' && Date.parse(order.expiresAt)>Date.now()?{
      provider:'toss',clientKey:config.clientKey,method:'CARD',amount:10000,orderId:order.orderId,
      orderName:'Quantum 캘린더 참가 보증금',successUrl:success.href,failUrl:failure.href,customerKey:userId,
    }:null})
  } catch (error) {return calendarError(error)}
}
