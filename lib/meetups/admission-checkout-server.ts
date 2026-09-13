import {AdmissionServerError,type AdmissionRpcClient} from './admission-server'
import {parseAdmissionStatus} from './admission-lifecycle'
import {parseNativeAdmissionStatus} from './native-admission-contract'
import {parseCheckoutOrder,type CheckoutOrder,type CheckoutRoom} from './admission-checkout-contract'

export function meetupCheckoutConfig(env:Readonly<Record<string,string|undefined>>){
 const clientKey=env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim()??'',secretKey=env.TOSS_SECRET_KEY?.trim()??''
 const clientMode=/^(test|live)_ck_/.exec(clientKey)?.[1],secretMode=/^(test|live)_sk_/.exec(secretKey)?.[1]
 // Activation is separate from source implementation and policy authoring. No
 // existing matching payment flag can accidentally enable this new money flow.
 const ready=env.QUANTUM_MEETUP_CHECKOUT_ENABLED==='true'&&Boolean(clientMode&&clientMode===secretMode)&&!(env.NODE_ENV==='production'&&clientMode==='test')
 const mode=clientMode==='test'?'test' as const:clientMode==='live'?'live' as const:null
 return {ready,clientKey,mode}
}
const codes:Record<string,number>={checkout_order_not_found:404,checkout_provider_changed:409,checkout_aborted:409,deposit_quote_expired:409,deposit_policy_changed:409,deposit_amount_policy_changed:409,checkout_evidence_mismatch:409,account_deletion_pending:403}
async function rpc(service:AdmissionRpcClient,name:string,args:Record<string,unknown>){
 let result:{data:unknown;error:unknown}
 try{result=await service.rpc(name,args)}catch{throw new AdmissionServerError('checkout_reconciliation_required',503)}
 if(result.error){const code=typeof result.error==='object'&&result.error&&'message'in result.error?String(result.error.message):'';throw new AdmissionServerError(Object.hasOwn(codes,code)?code:'checkout_reconciliation_required',codes[code]??503)}
 return result.data
}
export async function prepareCheckoutOrder(service:AdmissionRpcClient,owner:string,room:CheckoutRoom,intentId:string,mode:'test'|'live'){
 const order=parseCheckoutOrder(await rpc(service,'prepare_meetup_admission_checkout_for_service',{p_actor:owner,p_kind:room.kind,p_room_id:room.id,p_intent_id:intentId,p_provider_mode:mode}),owner,room)
 if(!order||order.intentId!==intentId||order.providerMode!==mode)throw new AdmissionServerError('checkout_response_invalid',503)
 return order
}
export async function resumeCheckoutOrder(service:AdmissionRpcClient,owner:string,room:CheckoutRoom,orderId:string,mode:'test'|'live'){
 const order=parseCheckoutOrder(await rpc(service,'get_meetup_admission_checkout_for_service',{p_actor:owner,p_kind:room.kind,p_room_id:room.id,p_order_id:orderId}),owner,room)
 if(!order||order.orderId!==orderId)throw new AdmissionServerError('checkout_order_not_found',404)
 return prepareCheckoutOrder(service,owner,room,order.intentId,mode)
}
export type CheckoutProvider={mode:'test'|'live';lookup:(orderId:string)=>Promise<unknown>;confirm:(input:{orderId:string;paymentKey:string;amount:number;idempotencyKey:string})=>Promise<unknown>}
function paymentIdentity(value:unknown,order:CheckoutOrder):value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const p=value as Record<string,unknown>
 return p.orderId===order.orderId&&p.totalAmount===order.amountKrw&&p.currency==='KRW'&&typeof p.paymentKey==='string'&&/^[\x21-\x7e]{1,200}$/.test(p.paymentKey)&&(!order.paymentKey||order.paymentKey===p.paymentKey)
}
export function verifiedAdmissionPayment(value:unknown,order:CheckoutOrder):boolean{
 if(!paymentIdentity(value,order))return false
 return value.status==='DONE'&&value.balanceAmount===order.amountKrw&&typeof value.approvedAt==='string'&&Number.isFinite(Date.parse(value.approvedAt))&&(!value.cancels||Array.isArray(value.cancels)&&value.cancels.length===0)
}
/** Never accepts a browser 'paid' flag or browser amount as financial authority.
 * The provider lookup binds the callback key to the saved server order BEFORE confirm.
 * A timeout keeps the same order, and retries first read provider state. */
export async function confirmCheckoutOrder(service:AdmissionRpcClient,provider:CheckoutProvider,owner:string,input:{room:CheckoutRoom;orderId:string;paymentKey:string|null;amount:number|null}){
 const args={p_actor:owner,p_kind:input.room.kind,p_room_id:input.room.id,p_order_id:input.orderId}
 const order=parseCheckoutOrder(await rpc(service,'get_meetup_admission_checkout_for_service',args),owner,input.room)
 if(!order||order.orderId!==input.orderId)throw new AdmissionServerError('checkout_order_not_found',404)
 if(order.providerMode!==provider.mode)throw new AdmissionServerError('checkout_provider_changed',409)
 if(input.amount!==null&&input.amount!==order.amountKrw)throw new AdmissionServerError('checkout_evidence_mismatch',409)
 if(order.state==='aborted')throw new AdmissionServerError('checkout_aborted',409)
 let payment:unknown
 try{payment=await provider.lookup(order.orderId)}catch(error){
  // Only the trusted lookup adapter's exact not-found response proves absence.
  // Network failures, arbitrary 404s and any previously started order remain unresolved.
  const absent=error&&typeof error==='object'&&'status'in error&&error.status===404&&'code'in error&&error.code==='NOT_FOUND_PAYMENT'
  if(absent&&order.state==='prepared'&&order.paymentKey===null){
   if(Date.parse(order.expiresAt)>Date.now())throw new AdmissionServerError('checkout_not_paid',409)
   const retired=parseCheckoutOrder(await rpc(service,'abort_expired_unstarted_meetup_checkout_for_service',{...args,p_provider_mode:provider.mode}),owner,input.room)
   if(retired?.orderId===order.orderId&&retired.state==='aborted')throw new AdmissionServerError('checkout_aborted',409)
  }
  throw new AdmissionServerError('checkout_reconciliation_required',503)
 }
 if(!paymentIdentity(payment,order)||(input.paymentKey!==null&&input.paymentKey!==payment.paymentKey))throw new AdmissionServerError('checkout_evidence_mismatch',409)
 const paymentKey=String(payment.paymentKey),recordArgs={...args,p_payment_key:paymentKey,p_amount_krw:order.amountKrw}
 if(!verifiedAdmissionPayment(payment,order)){
  if(['ABORTED','EXPIRED'].includes(String(payment.status))&&order.state!=='confirmed'){
   await rpc(service,'record_meetup_admission_checkout_for_service',{...recordArgs,p_state:'aborted'})
   throw new AdmissionServerError('checkout_aborted',409)
  }
  if(Date.parse(order.expiresAt)<=Date.now())throw new AdmissionServerError('deposit_quote_expired',409)
  if(payment.status!=='IN_PROGRESS')throw new AdmissionServerError('checkout_not_paid',409)
  // Recovery without an authenticated success callback never authorizes a new charge.
  if(!input.paymentKey)throw new AdmissionServerError('checkout_not_paid',409)
  // The DB rechecks state/expiry under canonical locks after lookup. A stale
  // callback must not resurrect a retired order or bypass an expiry race.
  const claimed=parseCheckoutOrder(await rpc(service,'record_meetup_admission_checkout_for_service',{...recordArgs,p_state:'confirming'}),owner,input.room)
  if(!claimed||claimed.orderId!==order.orderId||claimed.state!=='confirming'||claimed.paymentKey!==paymentKey)throw new AdmissionServerError('checkout_reconciliation_required',503)
  try{payment=await provider.confirm({orderId:order.orderId,paymentKey,amount:order.amountKrw,idempotencyKey:`admission_confirm_${order.orderId}`})}
  catch{try{await rpc(service,'record_meetup_admission_checkout_for_service',{...recordArgs,p_state:'reconciliation_required'})}catch{/* durable confirming still requires recovery */}throw new AdmissionServerError('checkout_reconciliation_required',503)}
 }
 if(!verifiedAdmissionPayment(payment,{...order,paymentKey})){
  await rpc(service,'record_meetup_admission_checkout_for_service',{...recordArgs,p_state:'reconciliation_required'})
  throw new AdmissionServerError('checkout_reconciliation_required',503)
 }
 const value=await rpc(service,'record_meetup_admission_checkout_for_service',{...recordArgs,p_state:'confirmed'})
 const application=input.room.kind==='custom_meetup'?parseAdmissionStatus(value,input.room.id):parseNativeAdmissionStatus(value,{kind:input.room.kind,id:input.room.id})
 if(!application)throw new AdmissionServerError('checkout_reconciliation_required',503)
 return application
}
