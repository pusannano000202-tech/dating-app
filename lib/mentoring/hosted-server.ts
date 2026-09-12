import {requireRequestAccess,requestGuardErrorResponse} from '@/lib/auth/server-guards'
import {createSupabaseRequestClient} from '@/lib/supabase-request'
import {isCommunityFeatureEnabled} from '@/lib/community-feature'
import {meetupJson} from '@/lib/meetups/http'
import {readStudyRoomBody} from '@/lib/meetups/study-room-server'
import {hostedMentoringError,isHostedMentoringId,parseHostedMentoringCommand,parseHostedMentoringDetail,parseHostedMentoringList} from './hosted-contract'

/** Authenticated request client only. Actor/host/deposit state are never client RPC arguments. */
export async function hostedMentoringRequest(request:Request,mode:'list'|'create'|'status'|'action',roomId?:string) {
  try {
    const {userId}=await requireRequestAccess(request)
    if(!isCommunityFeatureEnabled())return meetupJson({error:'unavailable'},503)
    if((mode==='status'||mode==='action')&&!isHostedMentoringId(roomId))return meetupJson({error:'invalid'},400)
    let action:string=mode,args:Record<string,unknown>=mode==='status'?{session_id:roomId}:{}
    if(mode==='create'||mode==='action') {
      // The header is a stale-tab/account-switch fence, not an authorization claim.
      if(request.headers.get('x-quantum-owner')!==userId)return meetupJson({error:'account_changed'},409)
      const command=parseHostedMentoringCommand(await readStudyRoomBody(request))
      if(!command||(mode==='create'?command.action!=='create':command.action==='create'||command.args.session_id!==roomId))return meetupJson({error:'invalid'},400)
      action=command.action;args=command.args
    }
    const client=createSupabaseRequestClient(request)
    const {data,error}=await client.rpc('mentoring_hosted_action',{p_action:action,p_args:args})
    if(error){const problem=hostedMentoringError(error);return meetupJson({error:problem.error},problem.status)}
    const parsed=mode==='list'?parseHostedMentoringList(data):parseHostedMentoringDetail(data)
    if(!parsed||parsed.owner_id!==userId||('room'in parsed&&roomId!==undefined&&parsed.room.id!==roomId))return meetupJson({error:'unavailable'},503)
    return meetupJson({data:parsed})
  }catch(error){return requestGuardErrorResponse(error)}
}
