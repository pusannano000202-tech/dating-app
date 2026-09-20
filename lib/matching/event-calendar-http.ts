import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { TonightApiInputError } from '@/lib/server/tonight/api-contract'
import { parseCalendarPreparation, type CalendarAudience } from './event-calendar'
import { calendarPaymentConfig } from '@/lib/payments/calendar-provider'
import { getSupabaseAdminKeyStatus } from '@/lib/supabase-admin'
import { getPublicAppOrigin } from '@/lib/utils'

export const calendarJson = (body:unknown,status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie, Authorization'}})
export function calendarCheckoutEnabled():boolean {
  try{return calendarPaymentConfig(process.env).ready&&getSupabaseAdminKeyStatus().ok&&!!getPublicAppOrigin()}
  catch{return false}
}
export async function calendarClient(request:Request){
  await requireRequestAccess(request,{allowedRoles:['user']})
  return createSupabaseRequestClient(request)
}
export function calendarError(error:unknown):Response {
  if(error instanceof RequestGuardError)return requestGuardErrorResponse(error)
  if(error instanceof TonightApiInputError)return calendarJson({error:'invalid_calendar_request'},400)
  const message=error && typeof error==='object' && 'message' in error && typeof error.message==='string'?error.message:''
  const codes:Record<string,number>={not_authenticated:401,calendar_forbidden:403,minimum_signup_required:403,
    calendar_event_not_found:404,calendar_party_not_found:404,calendar_application_not_found:404,
    calendar_event_closed:409,calendar_partner_unavailable:409,calendar_audience_unavailable:409,
    active_couple_party_exists:409,calendar_application_exists:409,calendar_existing_weekly_application:409,
    calendar_idempotency_conflict:409,couple_match_locked:409,partner_consent_required:400,
    invalid_calendar_application:400,invalid_calendar_query:400,calendar_payment_unavailable:503,
    assigned_application_cannot_cancel:409,weekly_application_not_open:409,stale_revision:409,
    super_admin_required:403,admin_required:403,mfa_required:403,reauthentication_required:403,
    invalid_calendar_event:400,calendar_event_metadata_locked:409,matching_features_not_ready:409}
  return Object.hasOwn(codes,message)?calendarJson({error:message},codes[message]):calendarJson({error:'calendar_unavailable'},503)
}
export function calendarAudience(request:Request):CalendarAudience|null {
  const params=new URL(request.url).searchParams
  return params.getAll('audience').length===1 && (params.get('audience')==='single'||params.get('audience')==='couple')
    ? params.get('audience') as CalendarAudience:null
}
export async function calendarApplication(client:ReturnType<typeof createSupabaseRequestClient>,audience:CalendarAudience,eventId:string){
  const {data,error}=await client.rpc(audience==='couple'?'get_my_calendar_couple_party':'get_my_calendar_single_application',{p_event_id:eventId})
  if(error)throw error
  if(data===null)return null
  const parsed=parseCalendarPreparation(data)
  if(!parsed||parsed.audience!==audience||parsed.eventId!==eventId)throw Error('calendar_response_invalid')
  return {...parsed,checkoutEnabled:parsed.checkoutEnabled&&calendarCheckoutEnabled()}
}
