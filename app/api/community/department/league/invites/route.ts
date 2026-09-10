import {assertTrustedMutationOrigin} from '@/lib/auth/trusted-origin'
import {meetupInputErrorResponse,meetupJson} from '@/lib/meetups/http'
import {runLeagueInvites} from '@/lib/meetups/league-invites-server'
import {readStrictJson} from '@/lib/server/tonight/api-contract'

export async function GET(request:Request){
 const params=new URL(request.url).searchParams
 if([...params.keys()].some(key=>!['sport','challenge_id'].includes(key)||params.getAll(key).length!==1))return meetupJson({error:'invalid_invite_action'},400)
 return runLeagueInvites(request,'overview',{sport:params.get('sport'),challenge_id:params.get('challenge_id')})
}
export async function POST(request:Request){
 try{
  assertTrustedMutationOrigin(request)
  const body=await readStrictJson(request,['action','args'])
  if(!['invite','accept','decline','cancel'].includes(String(body.action)))return meetupJson({error:'invalid_invite_action'},400)
  return runLeagueInvites(request,body.action,body.args)
 }catch(error){return meetupInputErrorResponse(error)}
}
