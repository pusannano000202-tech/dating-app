import {parseLeagueRecruitmentBrowse,parseLeagueRecruitmentDetail,parseLeagueRecruitmentNotices,parseLeagueRecruitmentResult,validateLeagueRecruitmentCommand} from '@/lib/meetups/league-recruitment'
import {meetupJson,meetupRpcErrorResponse} from '@/lib/meetups/http'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {isSupabaseConfigured} from '@/lib/utils'

export async function runLeagueRecruitment(request:Request,action:unknown,args:unknown){
 let parsed:Record<string,unknown>
 try{parsed=validateLeagueRecruitmentCommand(action,args)}catch{return meetupJson({error:'invalid_recruitment_action'},400)}
 if(!isSupabaseConfigured())return meetupJson({error:'community_schema_unavailable'},503)
 const client=createSupabaseRequestClient(request),{data:{user},error:authError}=await client.auth.getUser()
 if(authError)return meetupJson({error:'auth_unavailable'},503)
 if(!user)return meetupJson({error:'Unauthorized'},401)
 const{data,error}=await client.rpc('department_league_recruitment',{p_action:action,p_args:parsed})
 if(error)return meetupRpcErrorResponse(error)
 const state=action==='browse'?parseLeagueRecruitmentBrowse(data):action==='detail'?parseLeagueRecruitmentDetail(data):action==='notices'?parseLeagueRecruitmentNotices(data):parseLeagueRecruitmentResult(data,parsed.sport)
 return state?meetupJson({recruitment:state}):meetupJson({error:'community_request_failed'},503)
}
