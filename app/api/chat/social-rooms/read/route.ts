import {assertTrustedMutationOrigin} from '@/lib/auth/trusted-origin'
import {readStrictJson} from '@/lib/server/tonight/api-contract'
import {meetupInputErrorResponse,meetupJson} from '@/lib/meetups/http'
import {isChatUuid,isSocialChatRoomKind,isChatObject} from '@/lib/chat/social-rooms-contract'
import {socialChatReadRpc} from '@/lib/chat/social-server'

export async function POST(request:Request){
 try{
  assertTrustedMutationOrigin(request)
  const body=await readStrictJson(request,['kind','room_id','message_ids'])
  if(!isChatObject(body)||!isSocialChatRoomKind(body.kind)||!isChatUuid(body.room_id)||!Array.isArray(body.message_ids)||body.message_ids.length<1||body.message_ids.length>100||!body.message_ids.every(isChatUuid))return meetupJson({error:'invalid_request'},400)
  return socialChatReadRpc(request,{p_kind:body.kind,p_room_id:body.room_id,p_message_ids:[...new Set(body.message_ids)]})
 }catch(error){return meetupInputErrorResponse(error)}
}
