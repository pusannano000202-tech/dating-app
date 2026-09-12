import {admissionError,nativeAdmissionRequest} from '@/lib/meetups/native-admission-http'
import type {NativeAdmissionRouteContext} from '@/lib/meetups/native-admission-http'
import {getMyNativeAdmissionStatus} from '@/lib/meetups/native-admission-server'
import {meetupJson} from '@/lib/meetups/http'
export async function GET(request:Request,context:NativeAdmissionRouteContext){
 try{const {client,accountKey,room}=await nativeAdmissionRequest(request,context);return meetupJson({accountKey,...await getMyNativeAdmissionStatus(client,room)})}catch(error){return admissionError(error)}
}
