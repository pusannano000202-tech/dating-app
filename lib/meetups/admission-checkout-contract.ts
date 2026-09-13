import {parseAdmissionRoomTarget,type AdmissionRoomTarget} from './admission-contract'
export type CheckoutRoom=AdmissionRoomTarget&{kind:'custom_meetup'|'study'|'mentoring'}
export type CheckoutOrder={orderId:string;intentId:string;ownerId:string;room:CheckoutRoom;amountKrw:number;currency:'KRW';policyVersion:string;providerMode:'test'|'live';metadata:Record<string,unknown>;expiresAt:string;state:'prepared'|'confirming'|'reconciliation_required'|'confirmed'|'aborted';paymentKey:string|null}
export const checkoutOrderId=(v:unknown):v is string=>typeof v==='string'&&/^meetup_[0-9a-f]{32}$/.test(v)
export function checkoutRoom(v:unknown):CheckoutRoom|null{const room=parseAdmissionRoomTarget(v);return room&&['custom_meetup','study','mentoring'].includes(room.kind)?room as CheckoutRoom:null}
export function parseCheckoutOrder(value:unknown,owner:string,room:CheckoutRoom):CheckoutOrder|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null
 const v=value as Record<string,unknown>,target=checkoutRoom(v.room)
 if(!checkoutOrderId(v.orderId)||typeof v.intentId!=='string'||v.orderId!==`meetup_${v.intentId.replace(/-/g,'')}`||v.ownerId!==owner||target?.kind!==room.kind||target.id!==room.id||!Number.isSafeInteger(v.amountKrw)||Number(v.amountKrw)<=0||v.currency!=='KRW'||typeof v.policyVersion!=='string'||!v.policyVersion.trim()||!v.metadata||typeof v.metadata!=='object'||Array.isArray(v.metadata)||!['prepared','confirming','reconciliation_required','confirmed','aborted'].includes(String(v.state))||(v.paymentKey!==null&&(typeof v.paymentKey!=='string'||v.paymentKey.length<1||v.paymentKey.length>200)))return null
 if(!['test','live'].includes(String(v.providerMode))||typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt)))return null
 return value as CheckoutOrder
}
export function checkoutReturnPath(room:CheckoutRoom){return room.kind==='custom_meetup'?`/meetups/${room.id}/apply`:`/meetups/participation/${room.kind}/${room.id}/apply`}
export function checkoutRecoveryUrl(room:CheckoutRoom,orderId:string){
 const query=new URLSearchParams({kind:room.kind,room:room.id,order:orderId,checkout:'recover'})
 return `/meetups/payment-return?${query}`
}
export function parseCheckoutConfirmation(value:unknown):{room:CheckoutRoom;orderId:string;paymentKey:string|null;amount:number|null}|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null
 const v=value as Record<string,unknown>,room=checkoutRoom(v.room)
 if(!room||Object.keys(v).some(k=>!['room','orderId','paymentKey','amount'].includes(k))||!checkoutOrderId(v.orderId)||(v.paymentKey!==null&&(typeof v.paymentKey!=='string'||!/^[\x21-\x7e]{1,200}$/.test(v.paymentKey)))||(v.amount!==null&&(!Number.isSafeInteger(v.amount)||Number(v.amount)<=0)))return null
 return {room,orderId:v.orderId,paymentKey:v.paymentKey as string|null,amount:v.amount as number|null}
}
