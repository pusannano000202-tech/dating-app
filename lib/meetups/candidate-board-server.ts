import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {isCommunityFeatureEnabled} from '@/lib/community-feature'
import {meetupJson} from './http'
import {parseCandidateBoard,parseCandidateBoardArgs} from './candidate-board-contract'

class CandidateInputError extends Error {
 constructor(readonly status:number,readonly code:string){super(code)}
}
const actions=new Set(['register','cancel','invite','accept','decline','release'])
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const errors:Record<string,number>={
 not_authenticated:401,forbidden:403,candidate_forbidden:403,account_deletion_pending:403,
 candidate_not_found:404,candidate_invite_not_found:404,candidate_invalid:400,
 candidate_conflict:409,candidate_closed:409,candidate_expired:409,candidate_already_joined:409,
 candidate_stale_revision:409,candidate_full:409,candidate_rate_limited:429,
 candidate_account_unavailable:403,candidate_host_required:403,department_identity_required:409,
 invalid_candidate_scope:400,invalid_candidate_action:400,invalid_candidate_filter:400,invalid_cursor:400,
 invalid_idempotency_key:400,invalid_candidate_positions:400,invalid_candidate_tier:400,invalid_candidate_registration:400,invalid_candidate_slot:400,
 stale_revision:409,idempotency_key_reused:409,candidate_joining:409,candidate_not_available:409,
 candidate_slot_unavailable:409,candidate_already_invited:409,candidate_invite_unavailable:409,
 candidate_deposit_unavailable:503,
}
async function readBody(request:Request):Promise<Record<string,unknown>> {
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))throw new CandidateInputError(400,'invalid_request')
 const announced=Number(request.headers.get('content-length')??0)
 if(!Number.isSafeInteger(announced)||announced<0)throw new CandidateInputError(400,'invalid_request')
 if(announced>4096)throw new CandidateInputError(413,'request_too_large')
 const reader=request.body?.getReader();if(!reader)throw new CandidateInputError(400,'invalid_request')
 const decoder=new TextDecoder('utf-8',{fatal:true});let raw='',bytes=0
 try {
  while(true){const{done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel().catch(()=>{});throw new CandidateInputError(413,'request_too_large')}raw+=decoder.decode(value,{stream:true})}
  raw+=decoder.decode();const body:unknown=JSON.parse(raw)
  if(!object(body)||Object.keys(body).length!==2||!Object.hasOwn(body,'action')||!Object.hasOwn(body,'args'))throw new CandidateInputError(400,'invalid_request')
  return body
 }catch(error){if(error instanceof CandidateInputError)throw error;throw new CandidateInputError(400,'invalid_request')}
 finally{reader.releaseLock()}
}

/** Authenticated, current-account scoped RPC only; public consent is not a friend bypass. */
export async function candidateBoardRequest(request:Request):Promise<Response> {
 try {
  const{userId}=await requireRequestAccess(request)
  if(!isCommunityFeatureEnabled())return meetupJson({error:'candidate_unavailable'},503)
  let action:string,args:Record<string,unknown>|null
  if(request.method==='GET') {
   const params=new URL(request.url).searchParams
   if([...params.keys()].some(k=>!['scope_kind','scope_key','filter','cursor'].includes(k)||params.getAll(k).length!==1))return meetupJson({error:'invalid_request'},400)
   action='overview';args=parseCandidateBoardArgs(action,{scope_kind:params.get('scope_kind'),scope_key:params.get('scope_key'),filter:params.get('filter')??'all',cursor:params.get('cursor')??null})
  }else if(request.method==='POST') {
   if(request.headers.get('x-quantum-owner')!==userId)return meetupJson({error:'account_changed'},409)
   const body=await readBody(request)
   if(typeof body.action!=='string'||!actions.has(body.action))return meetupJson({error:'invalid_request'},400)
   action=body.action;args=parseCandidateBoardArgs(action,body.args)
  }else{return meetupJson({error:'method_not_allowed'},405)}
  if(!args)return meetupJson({error:'invalid_request'},400)
  const client=createSupabaseRequestClient(request)
  const{data,error}=await client.rpc('meetup_candidate_board',{p_action:action,p_args:args})
  if(error){const message=typeof error.message==='string'?error.message:'';return meetupJson({error:Object.hasOwn(errors,message)?message:'candidate_unavailable'},errors[message]??503)}
  // Bound the protocol before parsing; never publish arbitrary SQL responses.
  if(JSON.stringify(data)?.length>200000)return meetupJson({error:'candidate_unavailable'},503)
  const board=parseCandidateBoard(data)
  if(!board||board.owner_id!==userId||board.scope.kind!==args.scope_kind||board.scope.key!==args.scope_key)return meetupJson({error:'candidate_unavailable'},503)
  return meetupJson({data:board})
 }catch(error){return error instanceof CandidateInputError?meetupJson({error:error.code},error.status):requestGuardErrorResponse(error)}
}
