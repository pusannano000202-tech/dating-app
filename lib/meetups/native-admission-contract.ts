import {parseAdmissionApplicationInput,parseAdmissionDepositQuote,parseAdmissionRoomTarget} from './admission-contract'
import type {AdmissionApplicationInput,AdmissionDepositQuote} from './admission-contract'
import {parseAdmissionManagement,parseAdmissionStatus} from './admission-lifecycle'
import type {AdmissionManagement,AdmissionReviewItem,AdmissionStatus} from './admission-lifecycle'
import type {AdmissionPolicy,MeetupAdmissionPreparation} from './admission-server'

export type NativeAdmissionKind='study'|'mentoring'
export type NativeAdmissionTarget={kind:NativeAdmissionKind;id:string}
export type NativeAdmissionMetadata=Record<string,never>|{role:'mentor'|'mentee'}
export type NativeAdmissionContext={room:NativeAdmissionTarget;metadata:NativeAdmissionMetadata;roomDetails:{title:string;memberCount:number;capacity:number};quote:AdmissionDepositQuote|null;policy:AdmissionPolicy|null;checkoutEnabled:false;preparationOnly:true}
export type NativeAdmissionManagement=Omit<AdmissionManagement,'applications'>&{applications:(AdmissionReviewItem&{metadata:NativeAdmissionMetadata})[]}
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const only=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k))
export function parseNativeAdmissionTarget(kind:unknown,id:unknown):NativeAdmissionTarget|null {
 const room=parseAdmissionRoomTarget({kind,id});return room&&(room.kind==='study'||room.kind==='mentoring')?room as NativeAdmissionTarget:null
}
export function parseNativeAdmissionMetadata(kind:NativeAdmissionKind,value:unknown):NativeAdmissionMetadata|null {
 if(!record(value))return null
 if(kind==='study')return Object.keys(value).length===0?{}:null
 return only(value,['role'])&&(value.role==='mentor'||value.role==='mentee')?{role:value.role}:null
}
export function parseNativeAdmissionInput(kind:NativeAdmissionKind,value:unknown):{ok:true;value:AdmissionApplicationInput&{metadata:NativeAdmissionMetadata}}|{ok:false;error:string}{
 if(!record(value))return{ok:false,error:'invalid_input'}
 const {metadata,...input}=value,parsedMetadata=parseNativeAdmissionMetadata(kind,metadata)
 if(!parsedMetadata)return{ok:false,error:'invalid_admission_metadata'}
 const parsed=parseAdmissionApplicationInput(input);return parsed.ok?{ok:true,value:{...parsed.value,metadata:parsedMetadata}}:{ok:false,error:parsed.error}
}
export const nativeAdmissionChatHref=(room:NativeAdmissionTarget)=>`/chat/rooms/${room.kind==='study'?'study_room':'mentoring'}/${room.id}`
export function parseNativeAdmissionStatus(value:unknown,room:NativeAdmissionTarget):AdmissionStatus|null{
 if(!record(value)||value.chatHref!==null&&value.chatHref!==nativeAdmissionChatHref(room))return null
 const normalized={...value,chatHref:value.chatHref===null?null:`/chat/rooms/meetup/${room.id}`}
 return parseAdmissionStatus(normalized,room.id)?value as unknown as AdmissionStatus:null
}
export function parseNativeAdmissionManagement(value:unknown,room:NativeAdmissionTarget):NativeAdmissionManagement|null{
 if(!record(value)||!Array.isArray(value.applications))return null
 const rows:NativeAdmissionManagement['applications']=[]
 for(const item of value.applications){if(!record(item))return null;const {metadata,...rest}=item,m=parseNativeAdmissionMetadata(room.kind,metadata);if(!m)return null;rows.push({...rest,metadata:m}as AdmissionReviewItem&{metadata:NativeAdmissionMetadata})}
 const base=parseAdmissionManagement({...value,applications:rows.map(({metadata:_,...rest})=>rest)},room.id)
 if(!base||base.room.memberCount>base.room.capacity||(room.kind==='study'?base.room.capacity!==5:![4,6].includes(base.room.capacity)))return null
 return{...base,applications:rows}
}
export function parseNativeAdmissionContext(value:unknown,room:NativeAdmissionTarget,expected:NativeAdmissionMetadata):NativeAdmissionContext|null{
 if(!record(value)||!only(value,['room','metadata','roomDetails','quote','policy','checkoutEnabled','preparationOnly'])||value.checkoutEnabled!==false||value.preparationOnly!==true)return null
 const target=record(value.room)?parseNativeAdmissionTarget(value.room.kind,value.room.id):null,m=parseNativeAdmissionMetadata(room.kind,value.metadata),d=value.roomDetails
 if(!target||!only(value.room as Record<string,unknown>,['kind','id'])||target.kind!==room.kind||target.id!==room.id||!m||JSON.stringify(m)!==JSON.stringify(expected)||!record(d)||!only(d,['title','memberCount','capacity'])||typeof d.title!=='string'||!d.title.trim()||Array.from(d.title).length>60||!Number.isSafeInteger(d.memberCount)||Number(d.memberCount)<0||!Number.isSafeInteger(d.capacity)||Number(d.memberCount)>Number(d.capacity)||(room.kind==='study'?d.capacity!==5:![4,6].includes(Number(d.capacity))))return null
 const details=d as NativeAdmissionContext['roomDetails']
 if(value.quote===null&&value.policy===null)return{room,metadata:m,roomDetails:details,quote:null,policy:null,checkoutEnabled:false,preparationOnly:true}
 const quote=parseAdmissionDepositQuote(value.quote),p=value.policy
 if(!quote||quote.room.kind!==room.kind||quote.room.id!==room.id||quote.paymentMethods.length!==1||quote.paymentMethods[0]!=='new'||!record(p)||!only(p,['summary','conditions'])||typeof p.summary!=='string'||!p.summary.trim()||Array.from(p.summary).length>1000||!Array.isArray(p.conditions)||p.conditions.length<1||p.conditions.length>12||!p.conditions.every(x=>typeof x==='string'&&x.trim()&&Array.from(x).length<=1000))return null
 return{room,metadata:m,roomDetails:details,quote,policy:{summary:p.summary,conditions:p.conditions as string[]},checkoutEnabled:false,preparationOnly:true}
}
export function parseNativeAdmissionPreparation(value:unknown):MeetupAdmissionPreparation|null{
 if(!record(value)||!only(value,['applicationId','intentId','admission','payment','preparation','checkoutEnabled','reused'])||value.applicationId!==null||!parseNativeAdmissionTarget('study',value.intentId)||value.admission!=='draft'||value.payment!=='unpaid'||value.preparation!=='prepared'||value.checkoutEnabled!==false||typeof value.reused!=='boolean')return null
 return value as unknown as MeetupAdmissionPreparation
}
