import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {createPaymentServiceClient} from '@/lib/payments/deposit-server'
import {getPublicAppOrigin} from '@/lib/utils'
import {nativeAdmissionBody} from '@/lib/meetups/native-admission-http'
import {checkoutRoom,checkoutOrderId} from '@/lib/meetups/admission-checkout-contract'
import {meetupCheckoutConfig,prepareCheckoutOrder,resumeCheckoutOrder} from '@/lib/meetups/admission-checkout-server'
import {AdmissionServerError,prepareMeetupAdmission} from '@/lib/meetups/admission-server'
import {prepareNativeAdmission} from '@/lib/meetups/native-admission-server'
import {meetupJson} from '@/lib/meetups/http'

export async function GET(request:Request){
 try{const {userId}=await requireRequestAccess(request),config=meetupCheckoutConfig(process.env),query=new URL(request.url).searchParams
  const room=checkoutRoom({kind:query.get('kind'),id:query.get('room')})
  if(!room||[...query.keys()].some(k=>!['kind','room'].includes(k)||query.getAll(k).length!==1))return meetupJson({error:'invalid_room'},400)
  const {data,error}=await createSupabaseRequestClient(request).rpc('get_my_pending_meetup_admission_checkout',{p_kind:room.kind,p_room_id:room.id})
  if(error||!data||data.accountKey!==userId)return meetupJson({accountKey:userId,checkoutEnabled:false,pendingOrder:null,providerMode:config.mode})
  return meetupJson({accountKey:userId,checkoutEnabled:Boolean(config.ready&&getPublicAppOrigin()&&createPaymentServiceClient()),pendingOrder:data.order,providerMode:config.mode})
 }catch(error){return requestGuardErrorResponse(error)}
}
export async function POST(request:Request){
 try{
  const {userId}=await requireRequestAccess(request)
  if(request.headers.get('x-quantum-owner')!==userId)return meetupJson({error:'account_changed'},409)
  const config=meetupCheckoutConfig(process.env),origin=getPublicAppOrigin(),service=createPaymentServiceClient()
  if(!config.ready||!config.mode||!origin||!service)return meetupJson({error:'checkout_unavailable'},503)
  const body=await nativeAdmissionBody(request)
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['room','input','resumeOrderId'].includes(k)))return meetupJson({error:'invalid_request'},400)
  const value=body as Record<string,unknown>,room=checkoutRoom(value.room)
  if(!room)return meetupJson({error:'invalid_room'},400)
  if(('resumeOrderId'in value)===('input'in value)||('resumeOrderId'in value&&!checkoutOrderId(value.resumeOrderId)))return meetupJson({error:'invalid_request'},400)
  const client=createSupabaseRequestClient(request)
  const order='resumeOrderId'in value?await resumeCheckoutOrder(service,userId,room,String(value.resumeOrderId),config.mode):await prepareCheckoutOrder(service,userId,room,(room.kind==='custom_meetup'?await prepareMeetupAdmission(client,room.id,value.input):await prepareNativeAdmission(client,{kind:room.kind,id:room.id},value.input)).intentId,config.mode)
  const success=new URL('/meetups/payment-return',origin),failure=new URL('/meetups/payment-return',origin)
  for(const url of[success,failure]){url.searchParams.set('kind',room.kind);url.searchParams.set('room',room.id);url.searchParams.set('order',order.orderId)}
  success.searchParams.set('checkout','success');failure.searchParams.set('checkout','failed')
  return meetupJson({accountKey:userId,room,orderId:order.orderId,state:order.state,checkout:order.state==='prepared'?{
   provider:'toss',clientKey:config.clientKey,method:'CARD',amount:order.amountKrw,orderId:order.orderId,orderName:'Quantum 참가 보증금',successUrl:success.href,failUrl:failure.href,customerKey:userId
  }:null})
 }catch(error){if(error instanceof AdmissionServerError)return meetupJson({error:error.code},error.status);return requestGuardErrorResponse(error)}
}
