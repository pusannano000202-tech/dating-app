import {assertTrustedMutationOrigin} from '@/lib/auth/trusted-origin'
import {meetupInputErrorResponse,meetupJson} from '@/lib/meetups/http'
import {runLeagueLobby} from '@/lib/meetups/league-lobby-server'
import {readStrictJson} from '@/lib/server/tonight/api-contract'

export async function GET(request:Request){
 const params=new URL(request.url).searchParams
 if([...params.keys()].some(key=>!['challenge_id','before'].includes(key))||[...params.keys()].some(key=>params.getAll(key).length!==1))return meetupJson({error:'invalid_lobby_action'},400)
 return runLeagueLobby(request,'chat_read',{challenge_id:params.get('challenge_id'),before:params.get('before')},'chat')
}
export async function POST(request:Request){
 try{assertTrustedMutationOrigin(request);const body=await readStrictJson(request,['challenge_id','body','idempotency_key']);return runLeagueLobby(request,'chat_send',body,'message')}catch(error){return meetupInputErrorResponse(error)}
}
