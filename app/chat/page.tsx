'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronRight, Loader2, LockKeyhole, MessageCircle, RefreshCw } from 'lucide-react'

interface MatchRoom {
  match_id: string
  match_status: string
  matched_at: string
  scheduled_start: string | null
  venue_name: string | null
  opp_group_size: number
}

export default function ChatHubPage() {
  const [matches, setMatches] = useState<MatchRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/matches', { cache: 'no-store' })
      if (response.status === 401) {
        setError('로그인한 뒤 채팅방을 확인할 수 있어요.')
        return
      }
      if (!response.ok) throw new Error('list_failed')
      const payload = await response.json() as { matches?: MatchRoom[] }
      setMatches((payload.matches ?? []).filter((match) => ['confirmed', 'completed'].includes(match.match_status)))
    } catch {
      setError('채팅방 목록을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <main className="min-h-screen booting-paper px-4 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-md">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black text-boot-primary">QUANTUM CHAT</p>
            <h1 className="mt-1 text-3xl font-black leading-tight">채팅</h1>
            <p className="mt-1 text-sm text-boot-muted">확정된 약속의 참가자끼리만 열려요.</p>
          </div>
          <button type="button" onClick={() => void refresh()} aria-label="채팅방 새로고침" className="flex h-11 w-11 items-center justify-center rounded-lg border border-boot-hairline bg-white text-boot-primary">
            <RefreshCw size={18} />
          </button>
        </header>

        <section className="mt-6 flex items-start gap-3 rounded-lg border border-boot-hairline bg-white p-4">
          <LockKeyhole className="mt-0.5 shrink-0 text-boot-primary" size={19} />
          <p className="text-sm leading-6 text-boot-body">약속 전에는 개인정보를 숨기고, 확정된 참가자에게만 앱 안의 대화방을 보여줘요.</p>
        </section>

        {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-black">내 대화방</h2>
            <span className="text-xs font-bold text-boot-muted">{matches.length}개</span>
          </div>

          {loading ? (
            <div className="flex min-h-32 items-center justify-center rounded-lg border border-boot-hairline bg-white"><Loader2 className="animate-spin text-boot-primary" /></div>
          ) : matches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-boot-hairline bg-white/70 p-7 text-center">
              <MessageCircle className="mx-auto text-boot-primary" size={28} />
              <p className="mt-3 text-sm font-black">아직 열린 대화방이 없어요</p>
              <p className="mt-1 text-xs leading-5 text-boot-muted">오늘 밤 만나기나 약속 잡기에서 참가가 확정되면 이곳에 나타나요.</p>
              <Link href="/match" className="mt-4 inline-flex h-10 items-center gap-1 rounded-lg bg-boot-ink px-4 text-xs font-black text-white">만남 둘러보기<ChevronRight size={15} /></Link>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <Link key={match.match_id} href={`/match/${encodeURIComponent(match.match_id)}/chat`} className="flex items-center gap-3 rounded-lg border border-boot-hairline bg-white p-4 shadow-sm transition-colors hover:border-boot-primary/30">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-boot-soft text-boot-primary"><MessageCircle size={21} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">Quantum 만남 대화방</p>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-boot-muted"><CalendarClock size={13} />{match.scheduled_start ? formatSchedule(match.scheduled_start) : '시간 확정 대기'} · {match.venue_name || '장소 확정 대기'}</p>
                  </div>
                  <ChevronRight size={17} className="shrink-0 text-boot-muted" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function formatSchedule(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '시간 확인 중'
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}
