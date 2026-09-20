import {randomUUID} from 'node:crypto'
import {requireRequestAccess} from '@/lib/auth/server-guards'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {createPaymentServiceClient} from '@/lib/payments/deposit-server'
import {calendarRpc,publicCalendarOrder} from '@/lib/payments/calendar-contract'
import {calendarPaymentConfig} from '@/lib/payments/calendar-provider'
import {processCalendarRefund} from '@/lib/payments/calendar-server'
import {calendarBody,calendarError,calendarJson,calendarOrderTarget,calendarProvider} from '@/lib/payments/calendar-http'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    const {userId} = await requireRequestAccess(request,{allowedRoles:['user']})
    if (request.headers.get('x-quantum-owner') !== userId) return calendarJson({error:'account_changed'},409)
    const input = calendarOrderTarget(await calendarBody(request,['audience','eventId','orderId']))
    // Durable owner consent is recorded even if the provider is temporarily unavailable.
    await calendarRpc(createSupabaseRequestClient(request),'request_my_calendar_refund',{
      p_audience:input.audience,p_event_id:input.eventId,p_order_id:input.orderId,
    })
    const config = calendarPaymentConfig(process.env),service = createPaymentServiceClient()
    if (!config.recoveryReady || !config.mode || !service) return calendarJson({error:'calendar_refund_pending'},503)
    const order = await processCalendarRefund(service,calendarProvider(config.mode),userId,input,randomUUID())
    return calendarJson({accountKey:userId,order:publicCalendarOrder(order)})
  } catch (error) {return calendarError(error)}
}
