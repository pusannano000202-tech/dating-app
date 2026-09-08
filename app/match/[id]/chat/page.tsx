'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, MessageCircleMore, SendHorizontal } from 'lucide-react'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'

interface MatchChatMessage {
  id: string
  is_mine: boolean
  alias: string | null
  message: string
  created_at: string
}

const DEV_CHAT_MESSAGES: MatchChatMessage[] = [
  {
    id: 'dev-chat-1',
    is_mine: false,
    alias: '참가자 A',
    message: '안녕하세요! 매칭 고생해서 만났어요. 천천히 얘기 시작해볼까요?',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'dev-chat-2',
    is_mine: true,
    alias: '나',
    message: '좋아요! 오늘은 편하게 말해요. 첫 만남 전에 어떤 분위기로 가고 싶은지도 미리 정하면 좋을 것 같아요.',
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
]

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const hh = d.getHours().toString().padStart(2, '0')
    const mm = d.getMinutes().toString().padStart(2, '0')
    return `${hh}:${mm}`
  } catch {
    return ''
  }
}

function formatChatOpenTime(iso?: string): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '약속 20분 전'
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

function formatError(code?: string, opensAt?: string) {
  switch (code) {
    case 'not_authenticated':
    case 'unauthorized':
      return '로그인 후 이용할 수 있습니다.'
    case 'access_denied':
      return '현재 매칭에서 채팅을 사용할 수 없는 상태입니다.'
    case 'invalid_message':
      return '메시지를 1자 이상 1000자 이하로 입력해 주세요.'
    case 'chat_not_open':
      return `팀 채팅은 약속 20분 전인 ${formatChatOpenTime(opensAt)}에 열려요.`
    case 'chat_schedule_unavailable':
      return '약속 시간이 확정되면 채팅 개방 시각을 알려드릴게요.'
    case 'chat_message_forbidden':
    default:
      return '채팅을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

export default function MatchChatPage() {
  const params = useParams<{ id: string }>()
  const matchId = params.id
  const isDevPreview = isDevPreviewClientSession()
  const [messages, setMessages] = useState<MatchChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatOpensAt, setChatOpensAt] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (isDevPreview) {
      setMessages(DEV_CHAT_MESSAGES)
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/chat`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string; opens_at?: string }))
        setChatOpensAt(data?.error === 'chat_not_open' ? data.opens_at ?? null : null)
        setError(formatError(data?.error, data?.opens_at))
        setLoading(false)
        return
      }

      const data = await res.json() as { messages: MatchChatMessage[] }
      setMessages(data.messages ?? [])
      setChatOpensAt(null)
      setError(null)
    } catch {
      setError('채팅을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [isDevPreview, matchId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (isDevPreview) return

    const poller = setInterval(() => {
      refresh()
    }, 12000)

    return () => clearInterval(poller)
  }, [refresh, isDevPreview])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!message.trim() || sending) return

    if (isDevPreview) {
      setMessages((prev) => [
        ...prev,
        {
          id: `dev-${Date.now()}`,
          is_mine: true,
          alias: '나',
          message: message.trim(),
          created_at: new Date().toISOString(),
        },
      ])
      setMessage('')
      return
    }

    setSending(true)
    setError(null)

    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      })

      const data = await res.json().catch(() => ({} as { error?: string; opens_at?: string; message?: MatchChatMessage | null }))
      if (!res.ok) {
        setChatOpensAt(data.error === 'chat_not_open' ? data.opens_at ?? null : null)
        setError(formatError(data.error, data.opens_at))
        return
      }

      if (data.message) {
        setMessages((prev) => [...prev, data.message!])
      } else {
        await refresh()
      }
      setMessage('')
    } catch {
      setError('메시지 전송에 실패했어요.')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="min-h-screen px-5 pb-10">
      <div className="mx-auto max-w-md pt-6">
        <header className="mb-4 flex items-center gap-3">
          <Link href={`/match/${encodeURIComponent(matchId)}`} className="p-2 glass rounded-xl">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-boot-muted">매칭 채팅</p>
            <h1 className="text-xl font-black">매칭 채팅방</h1>
          </div>
          <MessageCircleMore size={20} className="text-boot-primary" />
        </header>

        {error && <p className="mb-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <section className="glass-card rounded-3xl p-4 min-h-[60vh] flex flex-col gap-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-boot-muted">
              <Loader2 size={16} className="animate-spin" />
              채팅을 불러오는 중입니다.
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-2xl border border-boot-hairline px-4 py-8 text-center text-xs text-boot-muted">
              아직 대화가 없습니다. 첫 메시지를 보내보세요.
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto" ref={listRef}>
              {messages.map((item) => {
                const isMe = item.is_mine
                return (
                  <div key={item.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        isMe ? 'bg-boot-soft' : 'border border-boot-hairline bg-white/85'
                      }`}
                    >
                      <p className="text-[11px] text-boot-muted">{isMe ? '나' : item.alias ?? '상대'} </p>
                      <p className="mt-1 text-boot-body">{item.message}</p>
                      <p className="mt-1 text-[10px] text-boot-muted text-right">{formatTime(item.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <form onSubmit={sendMessage} className="mt-3 flex gap-2">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={Boolean(chatOpensAt)}
            className="glass-card flex-1 border border-boot-hairline rounded-2xl px-3 py-3 text-sm outline-none"
            placeholder={chatOpensAt ? `${formatChatOpenTime(chatOpensAt)}에 열려요` : '메시지 입력'}
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={Boolean(chatOpensAt) || sending || message.trim().length === 0}
            className="btn-gradient rounded-2xl px-3 text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-40"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <SendHorizontal size={16} />}
            보내기
          </button>
        </form>
      </div>
    </main>
  )
}
