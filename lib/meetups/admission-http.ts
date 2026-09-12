import {assertTrustedMutationOrigin} from '@/lib/auth/trusted-origin'
import {parseAdmissionRoomTarget} from './admission-contract'
import {AdmissionServerError} from './admission-server'
import {meetupInputErrorResponse,meetupJson} from './http'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {isSupabaseConfigured} from '@/lib/utils'
export async function admissionRequest(request:Request,id:string){
 assertTrustedMutationOrigin(request)
 if(!parseAdmissionRoomTarget({kind:'custom_meetup',id}))throw new AdmissionServerError('invalid_meetup_id',400)
 if(!isSupabaseConfigured())throw new AdmissionServerError('admission_unavailable',503)
 const client=createSupabaseRequestClient(request)
 const {data:{user},error}=await client.auth.getUser()
 if(error)throw new AdmissionServerError('admission_unavailable',503)
 if(!user)throw new AdmissionServerError('not_authenticated',401)
 return{client,accountKey:user.id}
}
export async function admissionBody(request:Request):Promise<unknown>{
 if(Number(request.headers.get('content-length')??0)>1024)throw new AdmissionServerError('request_too_large',413)
 const raw=await request.text();if(new TextEncoder().encode(raw).length>1024)throw new AdmissionServerError('request_too_large',413)
 try{return JSON.parse(raw)}catch{throw new AdmissionServerError('invalid_request',400)}
}
export function admissionError(error:unknown){
 if(error instanceof AdmissionServerError)return meetupJson({error:error.code},error.status)
 if(error instanceof TypeError)return meetupJson({error:'admission_unavailable'},503)
 return meetupInputErrorResponse(error)
}
