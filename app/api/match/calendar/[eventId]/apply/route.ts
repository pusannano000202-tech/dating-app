import { isCalendarId, parseCalendarApplicationInput, parseCalendarPreparation } from '@/lib/matching/event-calendar'
import { calendarCheckoutEnabled, calendarClient, calendarError, calendarJson } from '@/lib/matching/event-calendar-http'
import { readStrictJson } from '@/lib/server/tonight/api-contract'
export async function POST(request:Request,context:{params:Promise<{eventId:string}>}){
  try{
    const client=await calendarClient(request),{eventId}=await context.params
    const expectedOwner=request.headers.get('X-Quantum-Owner')
    if(expectedOwner!==null){
      const {data:{user},error:authError}=await client.auth.getUser()
      if(authError||!user)return calendarJson({error:'not_authenticated'},401)
      if(user.id!==expectedOwner)return calendarJson({error:'account_changed'},409)
    }
    const input=parseCalendarApplicationInput(await readStrictJson(request,['audience','partnerUserId','idempotencyKey','participationConsent']))
    if(!isCalendarId(eventId)||!input)return calendarJson({error:'invalid_calendar_application'},400)
    const args=input.audience==='couple'
      ?{p_event_id:eventId,p_partner_user_id:input.partnerUserId,p_idempotency_key:input.idempotencyKey,p_invitation_consent:true}
      :{p_event_id:eventId,p_idempotency_key:input.idempotencyKey,p_participation_consent:true}
    const {data,error}=await client.rpc(input.audience==='couple'?'prepare_calendar_couple_party':'prepare_calendar_single_application',args)
    if(error)throw error
    const application=parseCalendarPreparation(data)
    if(!application||application.eventId!==eventId||application.audience!==input.audience)return calendarJson({error:'calendar_unavailable'},503)
    return calendarJson({application:{...application,checkoutEnabled:application.checkoutEnabled&&calendarCheckoutEnabled()}},201)
  }catch(error){return calendarError(error)}
}
