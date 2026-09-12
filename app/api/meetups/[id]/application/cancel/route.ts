import {admissionBody,admissionError,admissionRequest} from '@/lib/meetups/admission-http'
import {cancelAdmission} from '@/lib/meetups/admission-lifecycle'
import {meetupJson} from '@/lib/meetups/http'
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 try{const{id}=await context.params;const{client}=await admissionRequest(request,id)
  return meetupJson(await cancelAdmission(client,id,await admissionBody(request)))
 }catch(error){return admissionError(error)}
}
