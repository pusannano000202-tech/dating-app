import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {isSupabaseConfigured} from '@/lib/utils'
import {isCommunityFeatureEnabled} from '@/lib/community-feature'
import {meetupJson, meetupRpcErrorResponse} from '@/lib/meetups/http'
import {isChatObject, parseSocialRoomsResponse} from './social-rooms-contract'
import {parseLeagueTeamChatResponse, parseLeagueTeamMessageResponse} from './league-team-contract'
import {getActivityRoomDefinition} from '@/lib/meetups/activity-room-contract'

export async function socialChatReadRpc(request:Request,args:Record<string,unknown>){
 if(!isCommunityFeatureEnabled()||!isSupabaseConfigured())return meetupJson({error:'community_schema_unavailable'},503)
 try{
  const client=createSupabaseRequestClient(request)
  const {data:{user},error:authError}=await client.auth.getUser()
  if(authError&&! [400,401,403].includes(authError.status??0))return meetupJson({error:'auth_unavailable'},503)
  if(authError||!user||request.headers.get('X-Expected-Account')!==user.id)return meetupJson({error:'Unauthorized'},401)
  const {data,error}=await client.rpc('mark_social_chat_read',args)
  if(error)return meetupRpcErrorResponse(error)
  if(!isChatObject(data)||data.owner_id!==user.id||data.ok!==true)return meetupJson({error:'invalid_chat_response'},503)
  return meetupJson(data)
 }catch{return meetupJson({error:'chat_unavailable'},503)}
}

function normalizeSocialRoomNames(value: unknown): unknown {
 if (!isChatObject(value) || !Array.isArray(value.rooms)) return value
 return {...value, rooms: value.rooms.map(room => {
  if (!isChatObject(room) || room.kind !== 'activity_room') return room
  if (typeof room.activity_key !== 'string' || !Number.isSafeInteger(room.room_number) || (room.room_number as number) < 1) return null
  const title = getActivityRoomDefinition(room.activity_key)?.title ?? '활동 모임'
  const {activity_key: _key, room_number: _number, ...publicRoom} = room
  return {...publicRoom, title: `${title} · ${room.room_number}번 방`, affiliation: title}
 })}
}

/** Request-scoped session only. The RPC derives the actor again and returns it. */
export async function socialChatRpc(request: Request, rpc: 'social_chat_rooms' | 'league_team_chat', args: Record<string, unknown>, action?: 'read' | 'send') {
 if (!isCommunityFeatureEnabled() || !isSupabaseConfigured()) return meetupJson({error: 'community_schema_unavailable'}, 503)
 try {
  const client = createSupabaseRequestClient(request)
  const {data: {user}, error: authError} = await client.auth.getUser()
  if (authError && ![400,401,403].includes(authError.status ?? 0)) return meetupJson({error: 'auth_unavailable'}, 503)
  if (authError || !user) return meetupJson({error: 'Unauthorized'}, 401)
  const {data, error} = await client.rpc(rpc, rpc === 'social_chat_rooms' ? {p_args: args} : {p_action: action, p_args: args})
  if (error) {
   if (/rate_limited/.test(error.message ?? '')) return meetupJson({error: 'rate_limited'}, 429)
   if (/account_deletion_pending/.test(error.message ?? '')) return meetupJson({error: 'account_deletion_pending'}, 403)
   return meetupRpcErrorResponse(error)
  }
  const parsed = rpc === 'social_chat_rooms' ? parseSocialRoomsResponse(normalizeSocialRoomNames(data), user.id) : action === 'read' ? parseLeagueTeamChatResponse(data, user.id, String(args.team_id)) : parseLeagueTeamMessageResponse(data, user.id)
  if (!parsed) return meetupJson({error: 'invalid_chat_response'}, 503)
  return meetupJson(parsed)
 } catch { return meetupJson({error: 'chat_unavailable'}, 503) }
}
