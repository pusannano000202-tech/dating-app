import {NextRequest,NextResponse} from 'next/server'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export async function GET(req:NextRequest){
 try {
  const supabase=createSupabaseRequestClient(req)
  const {data:{user},error:authError}=await supabase.auth.getUser()
  if(authError||!user)return reply({error:'auth_required'},401)
  const {data,error}=await supabase.rpc('count_unread_notifications')
  if(error||typeof data!=='number'||!Number.isSafeInteger(data)||data<0)return reply({error:'notification_count_unavailable'},503)
  return reply({count:data,owner_id:user.id})
 }catch{return reply({error:'notification_count_unavailable'},503)}
}
