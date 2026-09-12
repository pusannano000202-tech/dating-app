import {AdmissionServerError} from './admission-server'
import type {AdmissionRpcClient} from './admission-server'
import {parseAdmissionCancelInput,parseAdmissionDecisionInput} from './admission-lifecycle'
import {parseNativeAdmissionContext,parseNativeAdmissionInput,parseNativeAdmissionManagement,parseNativeAdmissionMetadata,parseNativeAdmissionPreparation,parseNativeAdmissionStatus,parseNativeAdmissionTarget} from './native-admission-contract'
import type {NativeAdmissionTarget} from './native-admission-contract'

const errors:Record<string,number>={not_authenticated:401,activity_room_forbidden:403,account_deletion_pending:403,profile_required:403,department_identity_required:403,admission_host_required:403,admission_pair_blocked:403,study_room_not_found:404,mentoring_not_found:404,mentoring_forbidden:403,mentoring_closed:409,mentoring_already_active:409,mentoring_conflict:409,mentoring_full:409,mentoring_role_full:409,study_room_already_joined:409,study_room_closed:409,meetup_already_joined:409,meetup_closed:409,meetup_full:409,admission_not_found:404,admission_state_conflict:409,admission_already_accepted:409,deposit_not_held:409,deposit_policy_unavailable:409,deposit_quote_mismatch:409,deposit_quote_expired:409,deposit_policy_changed:409,admission_preparation_exists:409,idempotency_key_reused:409,invalid_admission_metadata:400,invalid_room_kind:400,invalid_admission_cursor:400,invalid_admission_action:400,deposit_payment_method_unavailable:400}
const invalid=()=>new AdmissionServerError('admission_response_invalid',503)
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
async function rpc(client:AdmissionRpcClient,name:string,args:Record<string,unknown>){
 let result:{data:unknown;error:unknown}
 try{result=await client.rpc(name,args)}catch{throw new AdmissionServerError('admission_unavailable',503)}
 if(result.error){const message=object(result.error)&&typeof result.error.message==='string'?result.error.message:'';throw new AdmissionServerError(Object.hasOwn(errors,message)?message:'admission_unavailable',errors[message]??503)}
 return result.data
}
function args(room:NativeAdmissionTarget){if(!parseNativeAdmissionTarget(room.kind,room.id))throw new AdmissionServerError('invalid_room',400);return{p_kind:room.kind,p_room_id:room.id}}
export async function getNativeAdmissionContext(client:AdmissionRpcClient,room:NativeAdmissionTarget,metadata:unknown){
 const m=parseNativeAdmissionMetadata(room.kind,metadata);if(!m)throw new AdmissionServerError('invalid_admission_metadata',400)
 const result=parseNativeAdmissionContext(await rpc(client,'get_native_meetup_admission_context',{...args(room),p_metadata:m}),room,m)
 if(!result)throw invalid();return result
}
export async function prepareNativeAdmission(client:AdmissionRpcClient,room:NativeAdmissionTarget,input:unknown){
 const parsed=parseNativeAdmissionInput(room.kind,input);if(!parsed.ok)throw new AdmissionServerError(parsed.error,400)
 if(parsed.value.paymentMethod!=='new')throw new AdmissionServerError('deposit_payment_method_unavailable',400)
 const result=parseNativeAdmissionPreparation(await rpc(client,'prepare_native_meetup_admission',{...args(room),p_input:parsed.value}))
 if(!result)throw invalid();return result
}
export async function getNativeAdmissionManagement(client:AdmissionRpcClient,room:NativeAdmissionTarget,before:string|null=null){
 if(before!==null&&!parseNativeAdmissionTarget(room.kind,before))throw new AdmissionServerError('invalid_admission_cursor',400)
 const result=parseNativeAdmissionManagement(await rpc(client,'get_native_meetup_admissions',{...args(room),p_before:before}),room)
 if(!result)throw invalid();return result
}
export async function getMyNativeAdmissionStatus(client:AdmissionRpcClient,room:NativeAdmissionTarget){
 const data=await rpc(client,'get_my_native_meetup_admission',args(room))
 if(!object(data)||Object.keys(data).some(k=>k!=='application'))throw invalid()
 if(data.application===null)return{application:null}
 const application=parseNativeAdmissionStatus(data.application,room);if(!application)throw invalid();return{application}
}
export async function decideNativeAdmission(client:AdmissionRpcClient,room:NativeAdmissionTarget,input:unknown){
 const parsed=parseAdmissionDecisionInput(input);if(!parsed)throw new AdmissionServerError('invalid_admission_action',400)
 const result=parseNativeAdmissionStatus(await rpc(client,'decide_native_meetup_admission',{...args(room),p_application_id:parsed.applicationId,p_action:parsed.action,p_revision:parsed.revision}),room)
 if(!result||result.id!==parsed.applicationId)throw invalid();return result
}
export async function cancelNativeAdmission(client:AdmissionRpcClient,room:NativeAdmissionTarget,input:unknown){
 const parsed=parseAdmissionCancelInput(input);if(!parsed)throw new AdmissionServerError('invalid_admission_action',400)
 const result=parseNativeAdmissionStatus(await rpc(client,'cancel_my_native_meetup_admission',{...args(room),p_application_id:parsed.applicationId,p_revision:parsed.revision}),room)
 if(!result||result.id!==parsed.applicationId)throw invalid();return result
}
