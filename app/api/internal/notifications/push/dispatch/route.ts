import {isAuthorizedInternalRequest} from '@/lib/auth/internal-request'
import {commonPushConfig,classifyCommonPushFailure,type CommonPushClaim} from '@/lib/notifications/web-push-contract'
import {dispatchCommonPush} from '@/lib/notifications/web-push-dispatch'
import {sendCommonWebPush} from '@/lib/notifications/web-push-send.server'
import {pushJson} from '@/lib/notifications/web-push-http'
import {createPaymentServiceClient} from '@/lib/payments/deposit-server'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function POST(request:Request){
 if(!process.env.CRON_SECRET||process.env.CRON_SECRET.length<32)return pushJson({error:'push_unavailable'},503)
 if(!isAuthorizedInternalRequest(request.headers.get('authorization'),process.env.CRON_SECRET))return pushJson({error:'unauthorized'},401)
 const config=commonPushConfig(process.env),service=createPaymentServiceClient()
 if(!config.ready||!service)return pushJson({error:'push_unavailable'},503)
 try{
  const summary=await dispatchCommonPush({
   claim:async()=>{const r=await service.rpc('claim_common_web_push_deliveries',{p_limit:20});if(r.error||!Array.isArray(r.data))throw new Error('push_claim_failed');return r.data as CommonPushClaim[]},
   current:async claim=>{const r=await service.rpc('get_common_web_push_delivery',{p_delivery_id:claim.delivery_id,p_revision:claim.revision});if(r.error)throw new Error('push_current_failed');return r.data as CommonPushClaim|null},
   send:claim=>sendCommonWebPush(claim,config),failure:classifyCommonPushFailure,
   complete:async(claim,outcome,error)=>{const r=await service.rpc('complete_common_web_push_delivery',{p_delivery_id:claim.delivery_id,p_revision:claim.revision,p_outcome:outcome,p_error:error});if(r.error)throw new Error('push_completion_failed');return r.data===true},
  })
  return pushJson({...summary,phoneDeliveryVerified:false},summary.completionFailed?503:200)
 }catch{return pushJson({error:'push_dispatch_failed'},503)}
}
