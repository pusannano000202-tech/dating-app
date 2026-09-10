import {parseLeagueInviteState,validateLeagueInviteCommand} from '@/lib/meetups/league-invites'
import {meetupJson,meetupRpcErrorResponse} from '@/lib/meetups/http'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {isSupabaseConfigured} from '@/lib/utils'

export async function runLeagueInvites(request:Request,action:unknown,args:unknown){
 let parsed:Record<string,unknown>
 try{parsed=validateLeagueInviteCommand(action,args)}catch{return meetupJson({error:'invalid_invite_action'},400)}
 if(!isSupabaseConfigured())return meetupJson({error:'community_schema_unavailable'},503)
 const client=createSupabaseRequestClient(request),{data:{user},error:authError}=await client.auth.getUser()
 if(authError)return meetupJson({error:'auth_unavailable'},503)
 if(!user)return meetupJson({error:'Unauthorized'},401)
 const{data,error}=await client.rpc('department_league_invites',{p_action:action,p_args:parsed})
 if(error)return meetupRpcErrorResponse(error)
 if(action==='overview'){
  const state=parseLeagueInviteState(data)
  return state?meetupJson({invites:state}):meetupJson({error:'community_request_failed'},503)
 }
 return meetupJson({invite:data})
}
