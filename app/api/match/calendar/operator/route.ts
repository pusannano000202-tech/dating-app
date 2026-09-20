import { requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { calendarError, calendarJson } from '@/lib/matching/event-calendar-http'
import { isCalendarId } from '@/lib/matching/event-calendar'
import { asInteger, asIsoTimestamp, asOptionalString, asRequiredString, asUuid, readStrictJson, TonightApiInputError } from '@/lib/server/tonight/api-contract'

/** Existing super-admin MFA/recent-auth/Origin boundary; never a service-key route. */
export async function POST(request:Request){
  try{
    await requireRequestAccess(request,{allowedRoles:['super_admin'],requireRecentAuth:true,checkMutationOrigin:true})
    const body=await readStrictJson(request,['action','eventId','schoolScopeKey','title','summary','imagePath','startsAt','endsAt','applicationClosesAt','locationName','depositAmountKrw'])
    const eventId=asUuid(body.eventId,'eventId'),client=createSupabaseRequestClient(request)
    let result
    if(body.action==='create'){
      result=await client.rpc('admin_create_couple_calendar_event',{
        p_event_id:eventId,
        p_school_scope_key:asRequiredString(body.schoolScopeKey,'schoolScopeKey',{maxLength:120}),
        p_title:asRequiredString(body.title,'title',{maxLength:80}),
        p_summary:asRequiredString(body.summary,'summary',{maxLength:280}),
        p_image_path:asOptionalString(body.imagePath,'imagePath',{maxLength:200,pattern:/^\/images\/[a-zA-Z0-9/_-]+\.(png|webp|jpg|jpeg)$/}),
        p_starts_at:asIsoTimestamp(body.startsAt,'startsAt'),p_ends_at:asIsoTimestamp(body.endsAt,'endsAt'),
        p_application_closes_at:asIsoTimestamp(body.applicationClosesAt,'applicationClosesAt'),
        p_location_name:asRequiredString(body.locationName,'locationName',{maxLength:160}),
        p_deposit_amount_krw:asInteger(body.depositAmountKrw,'depositAmountKrw',{min:10000,max:10000}),
      })
    }else if(body.action==='publish'){
      if(Object.keys(body).some(key=>!['action','eventId'].includes(key)))throw new TonightApiInputError('unexpected_field')
      result=await client.rpc('admin_publish_couple_calendar_event',{p_event_id:eventId})
    }else throw new TonightApiInputError('invalid_field','action')
    if(result.error)throw result.error
    const data:unknown=result.data
    if(!data||typeof data!=='object'||!('eventId'in data)||!isCalendarId(data.eventId)||data.eventId!==eventId
      ||!('status'in data)||!['draft','recruiting','closed','cancelled','completed'].includes(String(data.status))
      ||!('depositAmountKrw'in data)||data.depositAmountKrw!==10000)return calendarJson({error:'calendar_unavailable'},503)
    return calendarJson({event:{eventId:data.eventId,status:data.status,depositAmountKrw:10000}},body.action==='create'?201:200)
  }catch(error){return calendarError(error)}
}
