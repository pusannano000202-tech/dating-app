import {Suspense} from 'react'
import {notFound} from 'next/navigation'
import SocialChatRoomPage from '@/components/chat/SocialChatRoomPage'
import {isChatUuid, isSocialChatRoomKind} from '@/lib/chat/social-rooms-contract'

export default async function Page({params}: {params: Promise<{kind: string; id: string}>}) {
  const {kind, id} = await params
  if (!isSocialChatRoomKind(kind) || kind === 'league_team' || !isChatUuid(id)) notFound()
  return <Suspense fallback={<p role="status">내 채팅을 확인하고 있어요…</p>}><SocialChatRoomPage kind={kind} id={id.toLowerCase()}/></Suspense>
}
