import {assertTrustedMutationOrigin} from '@/lib/auth/trusted-origin'
import {meetupInputErrorResponse,meetupJson} from '@/lib/meetups/http'
import {runLeagueRecruitment} from '@/lib/meetups/league-recruitment-server'
import {readStrictJson} from '@/lib/server/tonight/api-contract'

export async function GET(request:Request){
 const params=new URL(request.url).searchParams,action=params.get('action')??'browse'
 if(!['browse','detail','notices'].includes(action))return meetupJson({error:'invalid_recruitment_action'},400)
 const allowed=action==='detail'?['action','sport','challenge_id']:['action','sport','cursor']
 if([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1))return meetupJson({error:'invalid_recruitment_action'},400)
 return runLeagueRecruitment(request,action,action==='detail'?{sport:params.get('sport'),challenge_id:params.get('challenge_id')}:{sport:params.get('sport'),cursor:params.get('cursor')})
}
export async function POST(request:Request){
 try{
  assertTrustedMutationOrigin(request)
  const body=await readStrictJson(request,['action','args'])
  if(!['publish','close','reject'].includes(String(body.action)))return meetupJson({error:'invalid_recruitment_action'},400)
  return runLeagueRecruitment(request,body.action,body.args)
 }catch(error){return meetupInputErrorResponse(error)}
}
