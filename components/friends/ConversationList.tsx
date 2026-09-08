'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import { parseConversationList, type FriendConversation } from '@/lib/friends/conversation-state'
import { isFriendConversationInvalidation } from '@/lib/friends/realtime-invalidation'
import { createClient } from '@/lib/supabase'

export default function ConversationList() {
  const [rows, setRows] = useState<FriendConversation[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadInFlight = useRef(false)

  const load = useCallback(async (before?: string) => {
    if (loadInFlight.current) return
    loadInFlight.current = true
    setLoading(true); setError('')
    try {
      const url = new URL('/api/friends/conversations', window.location.origin)
      url.searchParams.set('limit', '30')
      if (before) url.searchParams.set('before', before)
      const response = await fetch(`${url.pathname}${url.search}`, { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      const parsed = response.ok ? parseConversationList(body) : null
      if (!parsed) throw new Error('invalid_response')
      setRows((current) => before ? [...current, ...parsed.conversations.filter((row) => !current.some((old) => old.friend.userId === row.friend.userId))] : parsed.conversations)
      setCursor(parsed.nextCursor)
    } catch { setError('대화 목록을 불러오지 못했어요.') }
    finally { loadInFlight.current = false; setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const wake = () => { if (document.visibilityState === 'visible') void load() }
    const timer = window.setInterval(wake, 8000)
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('pageshow', wake)

    let unsubscribe: (() => void) | undefined
    try {
      const supabase = createClient()
      const channel = supabase
        .channel(`friend-list-invalidation:${crypto.randomUUID()}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'friend_conversation_revisions',
        }, (payload) => {
          if (document.visibilityState === 'visible'
            && isFriendConversationInvalidation(payload.new)) void load()
        })
        .subscribe()
      unsubscribe = () => { void channel.unsubscribe() }
    } catch {
      // The visibility, online, pageshow, and polling fallback remains active.
    }
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener('pageshow', wake)
      unsubscribe?.()
    }
  }, [load])

  return <section className="mb-5" aria-labelledby="conversation-list-title">
    <div className="mb-2 flex items-center justify-between px-1"><h2 id="conversation-list-title" className="text-sm font-black">친구 메시지</h2>{!loading && !error ? <span className="text-[11px] font-bold text-boot-muted">{rows.reduce((sum, row) => sum + row.unreadCount, 0)}개 안 읽음</span> : null}</div>
    {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}<button type="button" onClick={() => void load()} className="ml-2 underline">다시 시도</button></div>
      : loading && rows.length === 0 ? <div className="grid min-h-20 place-items-center rounded-xl bg-white"><Loader2 className="animate-spin text-boot-primary" /></div>
        : rows.length === 0 ? <div className="rounded-xl border border-dashed border-boot-hairline bg-white/80 p-4 text-center text-xs text-boot-muted">수락한 친구와 첫 메시지를 시작해 보세요.</div>
          : <div className="space-y-2">{rows.map((row) => { const name = row.friend.friendRecognitionName ?? row.friend.displayName; return <Link key={row.friend.userId} href={`/friends/${encodeURIComponent(row.friend.userId)}/chat`} className="flex min-h-16 items-center gap-3 rounded-xl border border-boot-hairline bg-white px-4 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-boot-soft font-black text-boot-primary">{name.slice(0,1)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{name}</span><span className="mt-0.5 block truncate text-xs text-boot-muted">{row.lastMessage?.body ?? '대화를 시작해 보세요'}</span></span>{row.unreadCount > 0 ? <span className="min-w-6 rounded-full bg-boot-primary px-2 py-1 text-center text-[11px] font-black text-white">{Math.min(row.unreadCount,99)}</span> : <MessageCircle size={17} className="text-boot-muted" />}
          </Link>})}{cursor ? <button type="button" disabled={loading} onClick={() => void load(cursor)} className="min-h-11 w-full rounded-xl border border-boot-hairline bg-white text-xs font-black">{loading ? '불러오는 중...' : '대화 더 보기'}</button> : null}</div>}
  </section>
}
