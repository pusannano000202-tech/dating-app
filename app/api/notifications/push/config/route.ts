import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {commonPushConfig,COMMON_PUSH_CONSENT_VERSION} from '@/lib/notifications/web-push-contract'
import {pushJson} from '@/lib/notifications/web-push-http'
export async function GET(request:Request){
 try{
  const {userId}=await requireRequestAccess(request)
  const config=commonPushConfig(process.env)
  return pushJson({owner_id:userId,available:config.ready,publicKey:config.ready?config.publicKey:null,consentVersion:COMMON_PUSH_CONSENT_VERSION})
 }catch(error){return requestGuardErrorResponse(error)}
}
