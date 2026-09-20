import { isCalendarId, parseCalendarPreparation } from '@/lib/matching/event-calendar'
import { calendarCheckoutEnabled, calendarClient, calendarError, calendarJson } from '@/lib/matching/event-calendar-http'
import { readStrictJson } from '@/lib/server/tonight/api-contract'

export async function POST(request:Request){
  try{
    const client=await calendarClient(request)
    const body=await readStrictJson(request,['party_id','partner_consent'])
    if(!isCalendarId(body.party_id)||body.partner_consent!==true)return calendarJson({error:'partner_consent_required'},400)
    // Dateless accept_quantum_couple_party could auto-assign Saturday without deposits.
    const {data,error}=await client.rpc('accept_calendar_couple_party',{p_party_id:body.party_id,p_partner_consent:true})
    if(error)throw error
    const party=parseCalendarPreparation(data)
    if(!party||party.audience!=='couple'||party.entryId!==body.party_id)return calendarJson({error:'calendar_unavailable'},503)
    return calendarJson({party:{...party,checkoutEnabled:party.checkoutEnabled&&calendarCheckoutEnabled()}})
  }catch(error){return calendarError(error)}
}
