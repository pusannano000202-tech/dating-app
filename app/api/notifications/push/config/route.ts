import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {commonPushConfig,commonPushReadiness,COMMON_PUSH_CONSENT_VERSION} from '@/lib/notifications/web-push-contract'
import {pushJson} from '@/lib/notifications/web-push-http'
import {getSupabaseAdminKeyStatus} from '@/lib/supabase-admin'
export async function GET(request:Request){
 try{
  const {userId}=await requireRequestAccess(request)
  const config=commonPushConfig(process.env),readiness=commonPushReadiness(process.env,getSupabaseAdminKeyStatus().ok)
  return pushJson({owner_id:userId,...readiness,publicKey:readiness.available?config.publicKey:null,consentVersion:COMMON_PUSH_CONSENT_VERSION})
 }catch(error){return requestGuardErrorResponse(error)}
}
