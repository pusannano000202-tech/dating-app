import {requireRequestAccess} from '@/lib/auth/server-guards'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {createPaymentServiceClient} from '@/lib/payments/deposit-server'
import {calendarRpc,publicCalendarOrder} from '@/lib/payments/calendar-contract'
import {calendarPaymentConfig} from '@/lib/payments/calendar-provider'
import {confirmCalendarPayment,getCalendarPayment} from '@/lib/payments/calendar-server'
import {calendarBody,calendarConfirmation,calendarError,calendarJson,calendarProvider} from '@/lib/payments/calendar-http'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    const {userId} = await requireRequestAccess(request,{allowedRoles:['user']})
    if (request.headers.get('x-quantum-owner') !== userId) return calendarJson({error:'account_changed'},409)
    const input = calendarConfirmation(await calendarBody(request,['audience','eventId','orderId','paymentKey','amount']))
    const config = calendarPaymentConfig(process.env),service = createPaymentServiceClient()
    if (!config.recoveryReady || !config.mode || !service) return calendarJson({error:'calendar_checkout_unavailable'},503)
    let order = await confirmCalendarPayment(service,calendarProvider(config.mode),userId,input,config.ready)
    let application: unknown = null
    if (order.depositState === 'held') {
      application = await calendarRpc(createSupabaseRequestClient(request),'finalize_calendar_payment_application',{
        p_audience:input.audience,p_event_id:input.eventId,p_application_id:order.applicationId,
      })
      order = await getCalendarPayment(service,userId,input)
    }
    return calendarJson({accountKey:userId,order:publicCalendarOrder(order),application})
  } catch (error) {return calendarError(error)}
}
