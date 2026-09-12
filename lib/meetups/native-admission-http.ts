import {admissionError,admissionRequest} from './admission-http'
import {AdmissionServerError} from './admission-server'
import {parseNativeAdmissionTarget} from './native-admission-contract'
export {admissionError}
export type NativeAdmissionRouteContext={params:Promise<{kind:string;id:string}>}
export async function nativeAdmissionRequest(request:Request,context:NativeAdmissionRouteContext){
 const {kind,id}=await context.params,room=parseNativeAdmissionTarget(kind,id)
 if(!room)throw new AdmissionServerError('invalid_room',400)
 const result=await admissionRequest(request,room.id)
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('x-quantum-owner')!==result.accountKey)throw new AdmissionServerError('account_changed',409)
 return{...result,room}
}
export async function nativeAdmissionBody(request:Request):Promise<unknown>{
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new AdmissionServerError('invalid_request',400)
 const announced=Number(request.headers.get('content-length')??0)
 if(!Number.isFinite(announced)||announced>2048)throw new AdmissionServerError('request_too_large',413)
 const reader=request.body?.getReader();if(!reader)throw new AdmissionServerError('invalid_request',400)
 const decoder=new TextDecoder();let bytes=0,raw=''
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2048){await reader.cancel();throw new AdmissionServerError('request_too_large',413)}raw+=decoder.decode(value,{stream:true})}raw+=decoder.decode();try{return JSON.parse(raw)}catch{throw new AdmissionServerError('invalid_request',400)}}finally{reader.releaseLock()}
}
