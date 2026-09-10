import {validateLeagueLobbyAction} from '@/lib/meetups/league-lobby'
import {meetupJson,meetupRpcErrorResponse} from '@/lib/meetups/http'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {isSupabaseConfigured} from '@/lib/utils'

export async function runLeagueLobby(request:Request,action:unknown,args:unknown,envelope='lobby'){
 let parsed:Record<string,unknown>
 try{parsed=validateLeagueLobbyAction(action,args)}catch{return meetupJson({error:'invalid_lobby_action'},400)}
 if(!isSupabaseConfigured())return meetupJson({error:'community_schema_unavailable'},503)
 const client=createSupabaseRequestClient(request),{data:{user},error:authError}=await client.auth.getUser()
 if(authError)return meetupJson({error:'auth_unavailable'},503)
 if(!user)return meetupJson({error:'Unauthorized'},401)
 const{data,error}=await client.rpc('department_league_lobby',{p_action:action,p_args:parsed})
 if(error)return meetupRpcErrorResponse(error)
 return meetupJson({[envelope]:data})
}
