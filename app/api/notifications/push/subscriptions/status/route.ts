import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {pushBodyArgs,pushJson,readPushBody} from '@/lib/notifications/web-push-http'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
// Endpoint capability stays in the protected body, not a URL/access log.
export async function POST(request:Request){
 try{
  const {userId}=await requireRequestAccess(request)
  if(request.headers.get('x-quantum-owner')!==userId)return pushJson({error:'account_changed'},409)
  const args=pushBodyArgs(await readPushBody(request),'status');if(!args)return pushJson({error:'invalid_push_subscription'},400)
  const {data,error}=await createSupabaseRequestClient(request).rpc('get_my_common_push_subscription',args)
  if(error||!data||data.owner_id!==userId||typeof data.registered!=='boolean')return pushJson({error:'push_unavailable'},503)
  return pushJson(data)
 }catch(error){return requestGuardErrorResponse(error)}
}
