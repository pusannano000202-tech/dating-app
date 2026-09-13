import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {isChatUuid} from '@/lib/chat/social-rooms-contract'
import {parseLeagueRoomNotices} from '@/lib/notifications/league-room-notices'
import {meetupJson,meetupRpcErrorResponse} from '@/lib/meetups/http'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
export async function GET(request:Request){
 try{
  const query=new URL(request.url).searchParams,team=query.get('team_id')
  if(!isChatUuid(team)||[...query.keys()].some(k=>k!=='team_id')||query.getAll('team_id').length!==1)return meetupJson({error:'invalid_request'},400)
  const {userId}=await requireRequestAccess(request)
  if(request.headers.get('x-quantum-owner')!==userId)return meetupJson({error:'account_changed'},409)
  const {data,error}=await createSupabaseRequestClient(request).rpc('get_my_league_recruitment_notices',{p_team_id:team})
  if(error)return meetupRpcErrorResponse(error)
  const notices=parseLeagueRoomNotices(data,userId,team)
  return notices?meetupJson({owner_id:userId,team_id:team,notices}):meetupJson({error:'invalid_notice_response'},503)
 }catch(error){return requestGuardErrorResponse(error)}
}
