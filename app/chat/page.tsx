'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronRight, Loader2, LockKeyhole, MessageCircle, RefreshCw } from 'lucide-react'
import ConversationList from '@/components/friends/ConversationList'

interface MatchRoom {
  match_id: string
  match_status: string
  matched_at: string
  scheduled_start: string | null
  venue_name: string | null
  opp_group_size: number
}

interface MeetupChatRoom {
  id: string
  title: string
  place_name: string
  scheduled_at: string
  joined: boolean
  is_host: boolean
}

export default function ChatHubPage() {
  const [matches, setMatches] = useState<MatchRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chatTab, setChatTab] = useState<'appointments' | 'friends'>('appointments')
  const [meetups, setMeetups] = useState<MeetupChatRoom[]>([])
  const [meetupsLoading, setMeetupsLoading] = useState(true)
  const [meetupsError, setMeetupsError] = useState<string | null>(null)

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

  const refreshMeetups = useCallback(async () => {
    setMeetupsLoading(true); setMeetupsError(null)
    try {
      const response = await fetch('/api/meetups?limit=50', { cache: 'no-store' })
      if (!response.ok) throw new Error('meetup_list_failed')
      const payload = await response.json() as { meetups?: MeetupChatRoom[]; availability?: string }
      if (payload.availability === 'auth_required') throw new Error('auth_required')
      setMeetups((payload.meetups ?? []).filter((meetup) => meetup.joined || meetup.is_host))
    } catch { setMeetupsError('참여한 모임 대화를 불러오지 못했어요.') }
    finally { setMeetupsLoading(false) }
  }, [])

  useEffect(() => {
    void refresh()
    void refreshMeetups()
  }, [refresh, refreshMeetups])

  return (
    <main className="min-h-screen booting-paper px-4 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-md">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black text-boot-primary">QUANTUM CHAT</p>
            <h1 className="mt-1 text-3xl font-black leading-tight">채팅</h1>
            <p className="mt-1 text-sm text-boot-muted">매칭·모임·수락한 친구의 대화를 구분해 확인해요.</p>
          </div>
          <button type="button" onClick={() => { void refresh(); void refreshMeetups() }} aria-label="약속 대화 새로고침" className="flex h-11 w-11 items-center justify-center rounded-lg border border-boot-hairline bg-white text-boot-primary">
            <RefreshCw size={18} />
          </button>
        </header>

        <nav aria-label="채팅 목록" className="mt-5 grid grid-cols-2 rounded-xl border border-[#E8D9C9] bg-[#FFF9F2] p-1">
          <button type="button" aria-pressed={chatTab === 'appointments'} onClick={() => setChatTab('appointments')} className={`${chatTab === 'appointments' ? 'bg-[#B94B3F] text-white shadow-sm' : 'text-[#9A4E30]'} min-h-11 rounded-lg text-sm font-black`}>약속 대화</button>
          <button type="button" aria-pressed={chatTab === 'friends'} onClick={() => setChatTab('friends')} className={`${chatTab === 'friends' ? 'bg-[#B94B3F] text-white shadow-sm' : 'text-[#9A4E30]'} min-h-11 rounded-lg text-sm font-black`}>친구 대화</button>
        </nav>

        {chatTab === 'friends' ? <div className="mt-6"><ConversationList /><Link href="/friends" className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-[#E8D9C9] bg-white text-xs font-black text-[#9A4E30]">친구 목록·요청 관리<ChevronRight size={15} /></Link></div> : <>
          <section className="mt-6 flex items-start gap-3 rounded-lg border border-boot-hairline bg-white p-4">
            <LockKeyhole className="mt-0.5 shrink-0 text-boot-primary" size={19} />
            <p className="text-sm leading-6 text-boot-body">약속 전에는 개인정보를 숨기고, 확정된 참가자에게만 앱 안의 대화방을 보여줘요.</p>
          </section>

          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-black">내 대화방</h2>
            {!loading && !error ? <span className="text-xs font-bold text-boot-muted">{matches.length}개</span> : null}
          </div>

          {error ? null : loading ? (
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

          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-black">최근 모집에서 찾은 참여 모임</h2>{!meetupsLoading && !meetupsError ? <span className="text-xs font-bold text-boot-muted">{meetups.length}개</span> : null}</div>
            <p className="mb-3 text-xs leading-5 text-boot-muted">최근 모집 목록 안에서 참여한 모임만 보여요. 일반 모임은 참여 직후 상세 화면에서 별칭으로 대화하며, 최근 메시지와 읽음 수는 여기서 추측하지 않아요.</p>
            {meetupsError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{meetupsError}<button type="button" onClick={() => void refreshMeetups()} className="ml-2 underline">다시 시도</button></div>
              : meetupsLoading ? <div className="flex min-h-20 items-center justify-center rounded-lg border border-boot-hairline bg-white"><Loader2 className="animate-spin text-boot-primary" /></div>
                : meetups.length === 0 ? <div className="rounded-lg border border-dashed border-boot-hairline bg-white/70 p-5 text-center"><p className="text-sm font-black">최근 모집 목록에서는 참여 모임을 찾지 못했어요</p><Link href="/meetups" className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-lg border border-boot-primary/25 px-4 text-xs font-black text-boot-primary">전체 모임에서 찾기<ChevronRight size={15} /></Link></div>
                  : <div className="space-y-2">{meetups.map((meetup) => <Link key={meetup.id} href={`/meetups/${encodeURIComponent(meetup.id)}#meetup-chat`} className="flex min-h-16 items-center gap-3 rounded-lg border border-boot-hairline bg-white px-4 py-3"><MessageCircle size={19} className="shrink-0 text-[#B94B3F]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{meetup.title}</span><span className="mt-1 block truncate text-xs text-boot-muted">{formatSchedule(meetup.scheduled_at)} · {meetup.place_name}</span></span><ChevronRight size={16} className="text-boot-muted" /></Link>)}</div>}
          </section>
        </>}
      </div>
    </main>
  )
}

function formatSchedule(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '시간 확인 중'
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}
