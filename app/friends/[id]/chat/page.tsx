'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import FriendChatRoom from '@/components/friends/FriendChatRoom'

export default function FriendChatPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <main className="min-h-screen booting-paper px-4 pb-24 pt-5 text-boot-ink">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-4 flex items-center gap-3">
          <Link href={`/friends/${encodeURIComponent(id)}`} aria-label="친구 상세로 돌아가기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-boot-hairline bg-white"><ArrowLeft size={20} /></Link>
          <MessageCircle className="shrink-0 text-boot-primary" />
          <div className="min-w-0"><h1 className="truncate text-lg font-black">친구 대화</h1><p className="text-xs text-boot-muted">수락한 친구끼리만 보여요</p></div>
        </header>
        <FriendChatRoom key={id} friendUserId={id} />
      </div>
    </main>
  )
}
