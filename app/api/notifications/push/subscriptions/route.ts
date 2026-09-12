import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {commonPushConfig} from '@/lib/notifications/web-push-contract'
import {pushBodyArgs,pushJson,readPushBody} from '@/lib/notifications/web-push-http'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
export async function POST(request:Request){return mutate(request,'subscribe')}
export async function DELETE(request:Request){return mutate(request,'delete')}
async function mutate(request:Request,operation:'subscribe'|'delete'){
 try{
  const {userId}=await requireRequestAccess(request)
  if(request.headers.get('x-quantum-owner')!==userId)return pushJson({error:'account_changed'},409)
  if(operation==='subscribe'&&!commonPushConfig(process.env).ready)return pushJson({error:'push_unavailable'},503)
  const args=pushBodyArgs(await readPushBody(request),operation)
  if(!args)return pushJson({error:'invalid_push_subscription'},400)
  const {data,error}=await createSupabaseRequestClient(request).rpc(operation==='subscribe'?'upsert_my_common_push_subscription':'delete_my_common_push_subscription',args)
  if(error){
   if(/subscription_owned_by_another_user|push_subscription_limit_reached/.test(error.message))return pushJson({error:'push_subscription_conflict'},409)
   if(error.message==='invalid_push_subscription')return pushJson({error:'invalid_push_subscription'},400)
   return pushJson({error:'push_unavailable'},503)
  }
  if(operation==='subscribe'&&typeof data!=='string'||operation==='delete'&&typeof data!=='boolean')return pushJson({error:'push_unavailable'},503)
  return pushJson({owner_id:userId,registered:operation==='subscribe',...(operation==='delete'?{removed:data}:{})},operation==='subscribe'?201:200)
 }catch(error){return requestGuardErrorResponse(error)}
}
