import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {nativeAdmissionBody} from '@/lib/meetups/native-admission-http'
import {parseCheckoutConfirmation} from '@/lib/meetups/admission-checkout-contract'
import {confirmCheckoutOrder,meetupCheckoutConfig} from '@/lib/meetups/admission-checkout-server'
import {AdmissionServerError} from '@/lib/meetups/admission-server'
import {createPaymentServiceClient} from '@/lib/payments/deposit-server'
import {confirmTossPayment,getTossPaymentByOrderId} from '@/lib/payments/toss'
import {meetupJson} from '@/lib/meetups/http'
export async function POST(request:Request){
 try{
  const {userId}=await requireRequestAccess(request)
  if(request.headers.get('x-quantum-owner')!==userId)return meetupJson({error:'account_changed'},409)
  const service=createPaymentServiceClient(),config=meetupCheckoutConfig(process.env)
  if(!config.ready||!config.mode||!service)return meetupJson({error:'checkout_unavailable'},503)
  const input=parseCheckoutConfirmation(await nativeAdmissionBody(request))
  if(!input)return meetupJson({error:'invalid_request'},400)
  const application=await confirmCheckoutOrder(service,{mode:config.mode,lookup:getTossPaymentByOrderId,confirm:confirmTossPayment},userId,input)
  return meetupJson({accountKey:userId,application})
 }catch(error){if(error instanceof AdmissionServerError)return meetupJson({error:error.code},error.status);return requestGuardErrorResponse(error)}
}
