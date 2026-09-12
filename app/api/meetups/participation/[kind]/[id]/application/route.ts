import {admissionError,nativeAdmissionBody,nativeAdmissionRequest} from '@/lib/meetups/native-admission-http'
import type {NativeAdmissionRouteContext} from '@/lib/meetups/native-admission-http'
import {getNativeAdmissionContext,prepareNativeAdmission} from '@/lib/meetups/native-admission-server'
import {meetupJson} from '@/lib/meetups/http'
export async function GET(request:Request,context:NativeAdmissionRouteContext){
 try{const {client,accountKey,room}=await nativeAdmissionRequest(request,context),query=new URL(request.url).searchParams
  if([...query.keys()].some(k=>k!=='role')||query.getAll('role').length>1||(room.kind==='study'&&query.has('role')))return meetupJson({error:'invalid_admission_metadata'},400)
  return meetupJson({accountKey,...await getNativeAdmissionContext(client,room,room.kind==='study'?{}:{role:query.get('role')})})
 }catch(error){return admissionError(error)}
}
export async function POST(request:Request,context:NativeAdmissionRouteContext){
 try{const {client,room}=await nativeAdmissionRequest(request,context);return meetupJson(await prepareNativeAdmission(client,room,await nativeAdmissionBody(request)))}catch(error){return admissionError(error)}
}
