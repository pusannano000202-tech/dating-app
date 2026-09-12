import {admissionError,nativeAdmissionBody,nativeAdmissionRequest} from '@/lib/meetups/native-admission-http'
import type {NativeAdmissionRouteContext} from '@/lib/meetups/native-admission-http'
import {cancelNativeAdmission} from '@/lib/meetups/native-admission-server'
import {meetupJson} from '@/lib/meetups/http'
export async function POST(request:Request,context:NativeAdmissionRouteContext){
 try{const {client,room}=await nativeAdmissionRequest(request,context);return meetupJson(await cancelNativeAdmission(client,room,await nativeAdmissionBody(request)))}catch(error){return admissionError(error)}
}
