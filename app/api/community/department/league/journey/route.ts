import {assertTrustedMutationOrigin} from '@/lib/auth/trusted-origin'
import {parseJourneyState,validateJourneyCommand} from '@/lib/meetups/challenge-journey'
import {meetupJson,meetupInputErrorResponse,meetupRpcErrorResponse} from '@/lib/meetups/http'
import {readStrictJson} from '@/lib/server/tonight/api-contract'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {isSupabaseConfigured} from '@/lib/utils'

export async function GET(request:Request){
 const url=new URL(request.url),action=url.searchParams.get('action')??'overview'
 if(!['overview','report_targets'].includes(action)||Array.from(url.searchParams.keys()).some(key=>url.searchParams.getAll(key).length!==1))return meetupJson({error:'invalid_journey_action'},400)
 const args:Record<string,unknown>={};for(const[key,value]of url.searchParams)if(key!=='action')args[key]=value
 return run(request,action,args)
}
export async function POST(request:Request){
 try{assertTrustedMutationOrigin(request);const body=await readStrictJson(request,['action','args']);if(['overview','report_targets'].includes(String(body.action)))return meetupJson({error:'invalid_journey_action'},400);return run(request,body.action,body.args)}catch(error){return meetupInputErrorResponse(error)}
}
async function run(request:Request,action:unknown,args:unknown){
 let parsed:Record<string,unknown>;try{parsed=validateJourneyCommand(action,args)}catch{return meetupJson({error:'invalid_journey_action'},400)}
 if(!isSupabaseConfigured())return meetupJson({error:'community_schema_unavailable'},503)
 const client=createSupabaseRequestClient(request),{data:{user},error:authError}=await client.auth.getUser()
 if(authError)return meetupJson({error:'auth_unavailable'},503)
 if(!user)return meetupJson({error:'Unauthorized'},401)
 const{data,error}=await client.rpc('department_league_journey',{p_action:action,p_args:parsed})
 if(error)return meetupRpcErrorResponse(error)
 if(action==='overview'&&!parseJourneyState(data))return meetupJson({error:'community_request_failed'},503)
 return meetupJson({journey:data})
}
