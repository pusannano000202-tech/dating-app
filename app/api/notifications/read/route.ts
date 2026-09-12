import {NextRequest,NextResponse} from 'next/server'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {assertTrustedMutationOrigin,TrustedOriginError} from '@/lib/auth/trusted-origin'
import {parseReadRequest} from '@/lib/notifications/common-contract'

const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
/** Reading is acknowledgement, not approval of an application. Explicit target only. */
export async function POST(req:NextRequest){
 try {
  assertTrustedMutationOrigin(req)
  const body=parseReadRequest(await req.json().catch(()=>null))
  if(!body)return reply({error:'invalid_read_request'},400)
  const supabase=createSupabaseRequestClient(req)
  const {data:{user},error:authError}=await supabase.auth.getUser()
  if(authError||!user)return reply({error:'auth_required'},401)
  const {data,error}='notification_id' in body
   ?await supabase.rpc('mark_notification_read',{p_notification_id:body.notification_id})
   :await supabase.rpc('mark_all_notifications_read')
  if(error)return reply({error:'notification_read_unavailable'},503)
  if('notification_id' in body&&data!==true)return reply({error:'notification_not_found'},404)
  return reply({ok:true,...('all' in body?{updated:data}:{})})
 }catch(error){return reply({error:error instanceof TrustedOriginError?'request_not_allowed':'notification_read_unavailable'},error instanceof TrustedOriginError?error.status:503)}
}
