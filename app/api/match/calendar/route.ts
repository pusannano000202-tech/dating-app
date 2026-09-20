import { parseCalendarQuery, parseEventCalendar } from '@/lib/matching/event-calendar'
import { calendarCheckoutEnabled, calendarClient, calendarError, calendarJson } from '@/lib/matching/event-calendar-http'
export async function GET(request:Request){
  try{
    const client=await calendarClient(request),query=parseCalendarQuery(request.url)
    if(!query)return calendarJson({error:'invalid_calendar_query'},400)
    const {data,error}=await client.rpc('get_my_event_calendar',{p_month:`${query.month}-01`,p_audience:query.audience})
    if(error)throw error
    const parsed=parseEventCalendar(data,query.audience)
    if(!parsed)return calendarJson({error:'calendar_unavailable'},503)
    const enabled=calendarCheckoutEnabled()
    return calendarJson({...parsed,events:parsed.events.map(event=>({...event,checkoutEnabled:event.checkoutEnabled&&enabled}))})
  }catch(error){return calendarError(error)}
}
