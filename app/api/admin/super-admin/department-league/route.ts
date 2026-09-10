import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {validateLeagueAction} from '@/lib/meetups/challenge-league'
import {meetupJson,meetupInputErrorResponse,meetupRpcErrorResponse} from '@/lib/meetups/http'
import {readStrictJson} from '@/lib/server/tonight/api-contract'
import {createSupabaseRequestClient} from '@/lib/supabase-request'

export async function GET(request:Request){return run(request,'list',{})}
export async function POST(request:Request){
  try{
    await requireRequestAccess(request,{allowedRoles:['super_admin'],requireRecentAuth:true,checkMutationOrigin:true})
  }catch(error){return requestGuardErrorResponse(error)}
  try{const body=await readStrictJson(request,['action','args']);return run(request,body.action,body.args)}catch(error){return meetupInputErrorResponse(error)}
}
async function run(request:Request,action:unknown,args:unknown){
  try{await requireRequestAccess(request,{allowedRoles:['super_admin'],requireRecentAuth:true,checkMutationOrigin:request.method!=='GET'})}catch(error){return requestGuardErrorResponse(error)}
  let parsed:Record<string,unknown>
  try{parsed=validateLeagueAction(action,args,true)}catch{return meetupJson({error:'invalid_moderation_action'},400)}
  const client=createSupabaseRequestClient(request)
  const{data,error}=await client.rpc('department_league_moderate',{p_action:action,p_args:parsed})
  if(error)return meetupRpcErrorResponse(error)
  return meetupJson({review:data})
}
