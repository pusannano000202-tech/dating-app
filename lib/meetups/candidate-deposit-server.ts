import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {isCommunityFeatureEnabled} from '@/lib/community-feature'
import {meetupJson} from './http'
import {parseCandidateScope} from './candidate-board-contract'
import {parseCandidateDepositContext} from './candidate-deposit-contract'

const errors:Record<string,number>={
 not_authenticated:401,candidate_account_unavailable:403,department_identity_required:409,
 invalid_candidate_scope:400,candidate_deposit_unavailable:503,
}

/** Uses current request identity; payment/provider/owner claims are never accepted. */
export async function candidateDepositRequest(request:Request):Promise<Response> {
 try {
  const{userId}=await requireRequestAccess(request)
  if(!isCommunityFeatureEnabled())return meetupJson({error:'candidate_deposit_unavailable'},503)
  if(request.method!=='GET')return meetupJson({error:'method_not_allowed'},405)
  const params=new URL(request.url).searchParams
  if([...params.keys()].some(key=>!['scope_kind','scope_key'].includes(key)||params.getAll(key).length!==1))return meetupJson({error:'invalid_request'},400)
  const scope=parseCandidateScope({kind:params.get('scope_kind'),key:params.get('scope_key')})
  if(!scope)return meetupJson({error:'invalid_request'},400)
  const client=createSupabaseRequestClient(request)
  const{data,error}=await client.rpc('get_meetup_candidate_deposit_context',{p_scope_kind:scope.kind,p_scope_key:scope.key})
  if(error){const message=typeof error.message==='string'?error.message:'';return meetupJson({error:Object.hasOwn(errors,message)?message:'candidate_deposit_unavailable'},errors[message]??503)}
  if(JSON.stringify(data)?.length>4096)return meetupJson({error:'candidate_deposit_unavailable'},503)
  const context=parseCandidateDepositContext(data)
  if(!context||context.owner_id!==userId||context.scope.kind!==scope.kind||context.scope.key!==scope.key)return meetupJson({error:'candidate_deposit_unavailable'},503)
  return meetupJson({data:context})
 }catch(error){return requestGuardErrorResponse(error)}
}
