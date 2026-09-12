import {parseAdmissionRoomTarget} from './admission-contract'
import {AdmissionServerError} from './admission-server'
import type {AdmissionRpcClient} from './admission-server'

export type AdmissionState = 'pending'|'accepted'|'declined'|'cancelled'
export type AdmissionPaymentState = 'held'|'refund_due'|'refunded'
export interface AdmissionStatus {id:string;admission:AdmissionState;payment:AdmissionPaymentState;amountKrw:number;revision:number;chatHref:string|null}
export interface AdmissionReviewItem {id:string;alias:string;intro:string;strength:string;admission:AdmissionState;payment:AdmissionPaymentState;revision:number;createdAt:string}
export interface AdmissionNotice {id:string;kind:'application_received'|'application_accepted'|'application_closed';text:string;createdAt:string}
export interface AdmissionManagement {room:{id:string;title:string;memberCount:number;capacity:number};isHost:boolean;pendingCount:number;applications:AdmissionReviewItem[];notices:AdmissionNotice[];hasMore:boolean;nextCursor:string|null}
export interface AdmissionDecisionInput {applicationId:string;action:'approve'|'decline';revision:number}
export interface AdmissionCancelInput {applicationId:string;revision:number}
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)
const only=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).every(key=>keys.includes(key))
const uuid=(value:unknown):value is string=>Boolean(parseAdmissionRoomTarget({kind:'custom_meetup',id:value}))
const integer=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&Array.from(value).length<=max
const date=(value:unknown):value is string=>typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value))
const admission=(value:unknown):value is AdmissionState=>['pending','accepted','declined','cancelled'].includes(String(value))
const payment=(value:unknown):value is AdmissionPaymentState=>['held','refund_due','refunded'].includes(String(value))
const invalid=()=>new AdmissionServerError('admission_response_invalid',503)
export function parseAdmissionDecisionInput(value:unknown):AdmissionDecisionInput|null {
 if(!record(value)||!only(value,['applicationId','action','revision'])||!uuid(value.applicationId)||!integer(value.revision)||(value.action!=='approve'&&value.action!=='decline'))return null
 return{applicationId:value.applicationId,action:value.action,revision:value.revision}
}
export function parseAdmissionCancelInput(value:unknown):AdmissionCancelInput|null {
 if(!record(value)||!only(value,['applicationId','revision'])||!uuid(value.applicationId)||!integer(value.revision))return null
 return{applicationId:value.applicationId,revision:value.revision}
}
export function parseAdmissionStatus(value:unknown,roomId:string):AdmissionStatus|null {
 if(!record(value)||!only(value,['id','admission','payment','amountKrw','revision','chatHref'])||!uuid(value.id)||!admission(value.admission)||!payment(value.payment)||!integer(value.revision)||!integer(value.amountKrw)||value.amountKrw===0)return null
 if(value.chatHref!==null&&(value.admission!=='accepted'||value.payment!=='held'||value.chatHref!==`/chat/rooms/meetup/${roomId}`))return null
 if(value.admission==='pending'&&value.payment!=='held')return null
 if(['declined','cancelled'].includes(value.admission)&&value.payment==='held')return null
 return value as unknown as AdmissionStatus
}
export function parseAdmissionManagement(value:unknown,roomId:string):AdmissionManagement|null {
 if(!record(value)||!only(value,['room','isHost','pendingCount','applications','notices','hasMore','nextCursor'])||!record(value.room)||!only(value.room,['id','title','memberCount','capacity'])||value.room.id!==roomId||!text(value.room.title,60)||!integer(value.room.memberCount)||!integer(value.room.capacity)||value.room.capacity<2||value.room.capacity>20||typeof value.isHost!=='boolean'||!integer(value.pendingCount)||!Array.isArray(value.applications)||value.applications.length>50||!Array.isArray(value.notices)||value.notices.length>50||typeof value.hasMore!=='boolean'||(value.hasMore?!uuid(value.nextCursor):value.nextCursor!==null))return null
 if(!value.isHost&&(value.applications.length>0||value.hasMore))return null
 if(!value.applications.every(a=>record(a)&&only(a,['id','alias','intro','strength','admission','payment','revision','createdAt'])&&uuid(a.id)&&text(a.alias,80)&&text(a.intro,80)&&text(a.strength,120)&&admission(a.admission)&&payment(a.payment)&&integer(a.revision)&&date(a.createdAt)))return null
 if(!value.notices.every(n=>record(n)&&only(n,['id','kind','text','createdAt'])&&uuid(n.id)&&['application_received','application_accepted','application_closed'].includes(String(n.kind))&&text(n.text,300)&&date(n.createdAt)))return null
 return value as unknown as AdmissionManagement
}
const errors:Record<string,number>={not_authenticated:401,activity_room_forbidden:403,account_deletion_pending:403,profile_required:403,meetup_not_found:404,admission_not_found:404,admission_host_required:403,invalid_admission_cursor:400,invalid_admission_action:400,admission_state_conflict:409,admission_already_accepted:409,deposit_not_held:409,meetup_closed:409,meetup_full:409,meetup_already_joined:409,meetup_gender_required:403,meetup_gender_restricted:403,admission_pair_blocked:403}
async function rpc(client:AdmissionRpcClient,name:string,args:Record<string,unknown>){
 let result:{data:unknown;error:unknown}
 try{result=await client.rpc(name,args)}catch{throw new AdmissionServerError('admission_unavailable',503)}
 if(result.error){const error=record(result.error)?result.error:{};const code=typeof error.message==='string'?error.message:'';throw new AdmissionServerError(Object.hasOwn(errors,code)?code:'admission_unavailable',errors[code]??503)}
 return result.data
}
const room=(id:string)=>{if(!uuid(id))throw new AdmissionServerError('invalid_room',400);return id}
export async function getAdmissionManagement(client:AdmissionRpcClient,roomId:string,before:string|null=null):Promise<AdmissionManagement>{
 if(before!==null&&!uuid(before))throw new AdmissionServerError('invalid_admission_cursor',400)
 const result=parseAdmissionManagement(await rpc(client,'get_activity_meetup_admissions',{p_meetup_id:room(roomId),p_before:before}),roomId)
 if(!result)throw invalid();return result
}
export async function getMyAdmissionStatus(client:AdmissionRpcClient,roomId:string):Promise<{application:AdmissionStatus|null}>{
 const data=await rpc(client,'get_my_activity_meetup_admission',{p_meetup_id:room(roomId)})
 if(!record(data)||!only(data,['application']))throw invalid()
 if(data.application===null)return{application:null}
 const result=parseAdmissionStatus(data.application,roomId);if(!result)throw invalid();return{application:result}
}
export async function decideAdmission(client:AdmissionRpcClient,roomId:string,input:unknown):Promise<AdmissionStatus>{
 const parsed=parseAdmissionDecisionInput(input);if(!parsed)throw new AdmissionServerError('invalid_admission_action',400)
 const result=parseAdmissionStatus(await rpc(client,'decide_activity_meetup_admission',{p_meetup_id:room(roomId),p_application_id:parsed.applicationId,p_action:parsed.action,p_revision:parsed.revision}),roomId)
 if(!result||result.id!==parsed.applicationId)throw invalid();return result
}
export async function cancelAdmission(client:AdmissionRpcClient,roomId:string,input:unknown):Promise<AdmissionStatus>{
 const parsed=parseAdmissionCancelInput(input);if(!parsed)throw new AdmissionServerError('invalid_admission_action',400)
 const result=parseAdmissionStatus(await rpc(client,'cancel_my_activity_meetup_admission',{p_meetup_id:room(roomId),p_application_id:parsed.applicationId,p_revision:parsed.revision}),roomId)
 if(!result||result.id!==parsed.applicationId)throw invalid();return result
}
