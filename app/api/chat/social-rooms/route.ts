import {isChatUuid, isSocialChatRoomKind, isSocialRoomsCursor} from '@/lib/chat/social-rooms-contract'
import {socialChatRpc} from '@/lib/chat/social-server'
import {meetupJson} from '@/lib/meetups/http'

export async function GET(request: Request) {
 const p = new URL(request.url).searchParams
 if ([...p.keys()].some(k => !['cursor','kind','id'].includes(k) || p.getAll(k).length !== 1)) return meetupJson({error: 'invalid_request'}, 400)
 const kind = p.get('kind'), id = p.get('id'), cursor = p.get('cursor')
 if (kind !== null || id !== null) {
  if (cursor !== null || !isSocialChatRoomKind(kind) || !isChatUuid(id)) return meetupJson({error: 'invalid_request'}, 400)
  return socialChatRpc(request, 'social_chat_rooms', {kind, id, cursor: null})
 }
 if (cursor !== null && !isSocialRoomsCursor(cursor)) return meetupJson({error: 'invalid_cursor'}, 400)
 return socialChatRpc(request, 'social_chat_rooms', {kind: null, id: null, cursor})
}
