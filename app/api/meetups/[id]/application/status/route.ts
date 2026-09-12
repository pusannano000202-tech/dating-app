import {admissionError,admissionRequest} from '@/lib/meetups/admission-http'
import {getMyAdmissionStatus} from '@/lib/meetups/admission-lifecycle'
import {meetupJson} from '@/lib/meetups/http'
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 try{const{id}=await context.params;const{client,accountKey}=await admissionRequest(request,id)
  return meetupJson({accountKey,...await getMyAdmissionStatus(client,id)})
 }catch(error){return admissionError(error)}
}
