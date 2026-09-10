import {assertTrustedMutationOrigin} from '@/lib/auth/trusted-origin'
import {meetupInputErrorResponse,meetupJson} from '@/lib/meetups/http'
import {runLeagueLobby} from '@/lib/meetups/league-lobby-server'
import {readStrictJson} from '@/lib/server/tonight/api-contract'

export async function GET(request:Request){
 const params=new URL(request.url).searchParams
 if([...params.keys()].some(key=>!['sport','team_id','cursor'].includes(key))||[...params.keys()].some(key=>params.getAll(key).length!==1))return meetupJson({error:'invalid_lobby_action'},400)
 return runLeagueLobby(request,'overview',{sport:params.get('sport'),team_id:params.get('team_id'),cursor:params.get('cursor')})
}
export async function POST(request:Request){
 try{
  assertTrustedMutationOrigin(request)
  const body=await readStrictJson(request,['action','args'])
  if(!['propose','accept','proposal_cancel','proposal_decline','transfer_propose','transfer_respond','transfer_cancel'].includes(String(body.action)))return meetupJson({error:'invalid_lobby_action'},400)
  return runLeagueLobby(request,body.action,body.args)
 }catch(error){return meetupInputErrorResponse(error)}
}
