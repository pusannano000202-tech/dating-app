import { isCalendarId } from '@/lib/matching/event-calendar'
import { calendarApplication, calendarAudience, calendarClient, calendarError, calendarJson } from '@/lib/matching/event-calendar-http'
import { readStrictJson } from '@/lib/server/tonight/api-contract'
type Context={params:Promise<{eventId:string}>}
export async function GET(request:Request,context:Context){
  try{
    const client=await calendarClient(request),{eventId}=await context.params,audience=calendarAudience(request)
    if(!isCalendarId(eventId)||!audience)return calendarJson({error:'invalid_calendar_query'},400)
    return calendarJson({application:await calendarApplication(client,audience,eventId)})
  }catch(error){return calendarError(error)}
}
export async function DELETE(request:Request,context:Context){
  try{
    const client=await calendarClient(request),{eventId}=await context.params
    const input=await readStrictJson(request,['audience','entryId'])
    if(!isCalendarId(eventId)||!isCalendarId(input.entryId)||(input.audience!=='single'&&input.audience!=='couple'))return calendarJson({error:'invalid_calendar_application'},400)
    const mine=await calendarApplication(client,input.audience,eventId)
    if(!mine||mine.entryId!==input.entryId)return calendarJson({error:'calendar_application_not_found'},404)
    const {data,error}=await client.rpc(input.audience==='couple'?'cancel_calendar_couple_party':'cancel_calendar_single_application',input.audience==='couple'?{p_party_id:input.entryId}:{p_entry_id:input.entryId})
    if(error)throw error
    if(!data||data.cancelled!==true)return calendarJson({error:'calendar_unavailable'},503)
    return calendarJson({cancelled:true,applicationFinalized:false,providerPaymentChanged:false})
  }catch(error){return calendarError(error)}
}
