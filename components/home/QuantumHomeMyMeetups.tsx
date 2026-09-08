'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, Coffee, RefreshCw } from 'lucide-react'
import { myMeetupHref, parseMyMeetups, type MyMeetups } from '@/lib/home/my-meetups'
import { getActivityRoomDefinition } from '@/lib/meetups/activity-room-contract'

export default function QuantumHomeMyMeetups() {
  const [state, setState] = useState<MyMeetups | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    setState(null)
    void (async () => {
      try {
        const response = await fetch('/api/meetups/mine', { cache: 'no-store', signal: controller.signal })
        const payload = await response.json()
        const parsed = response.ok ? parseMyMeetups(payload.data) : null
        if (!parsed) throw new Error(response.status === 401 ? '로그인 상태를 다시 확인해 주세요.' : '참여한 모임을 불러오지 못했어요.')
        if (!controller.signal.aborted) setState(parsed)
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '모임 연결을 확인해 주세요.')
      }
    })()
    return () => controller.abort()
  }, [version])
  if (error) return <section role="status" className="rounded-xl border border-[#e8cfc4] bg-white px-4 py-3">
    <p className="text-sm font-bold">내 모임 · 연결 확인 필요</p>
    <p className="mt-1 text-xs leading-5 text-[#807169]">{error} 저장된 참여를 취소하거나 바꾸지는 않았어요.</p>
    <div className="mt-2 flex gap-4"><button onClick={() => setVersion(v => v + 1)} className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-[#a43f32]"><RefreshCw size={14} />다시 확인</button><Link href="/meetups" className="inline-flex min-h-11 items-center text-xs font-bold text-[#807169]">모임으로 이동</Link></div>
  </section>
  if (!state) return <div role="status" aria-label="내 모임 확인 중" className="h-28 animate-pulse rounded-xl bg-[#f1e3d9]" />
  if (!state.items.length) return <Link href="/meetups" className="flex min-h-20 items-center gap-3 rounded-xl bg-[#f2e6de] px-4 py-3"><Coffee size={24} className="shrink-0 text-[#a43f32]" /><span className="min-w-0 flex-1"><strong className="block text-sm">오늘의 첫 모임, 골라볼까요?</strong><span className="mt-1 block text-xs text-[#807169]">참여하면 이곳에서 대화를 이어가요.</span></span><ArrowRight size={18} /></Link>
  return <section aria-label="내가 참여한 모임" className="space-y-2">
    {(expanded ? state.items : state.items.slice(0, 1)).map(room => {
      const definition = room.activity_key ? getActivityRoomDefinition(room.activity_key) : null
      const title = room.title || definition?.title || '참여한 모임'
      const detail = room.kind === 'activity_room'
        ? `${room.room_number}번 방 · 시간·장소는 채팅에서 확인`
        : `${new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(room.scheduled_at!))} · ${room.place_name || '장소 확인'}`
      return <Link key={room.kind + room.id} href={myMeetupHref(room)} className="block rounded-xl bg-[#b34c3e] px-4 py-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#292320]">
        <p className="text-[11px] font-bold text-white/90">내 약속 · 참여 중</p>
        <div className="mt-2 flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/95 text-[#a43f32]"><Coffee size={23} /></span><span className="min-w-0 flex-1"><strong className="block text-lg leading-tight">{title}</strong><span className="mt-1 block text-xs leading-5 text-white/95">{room.member_count}/{room.capacity}명 · {detail}</span></span></div>
        <span className="mt-3 flex min-h-11 items-center justify-end gap-2 border-t border-white/20 pt-2 text-sm font-bold">내 방 채팅으로 <ArrowRight size={17} /></span>
      </Link>
    })}
    {state.items.length > 1 ? <button onClick={() => setExpanded(v => !v)} className="flex min-h-11 w-full items-center justify-center text-xs font-bold text-[#a43f32]">{expanded ? '모임 접기' : `다른 참여 모임 ${state.items.length - 1}개 보기`}</button> : null}
    {state.has_more ? <p className="text-xs leading-5 text-[#807169]">진행 중 모임 100개까지 보여요. 더 오래된 방은 해당 활동의 방 목록에서 확인해 주세요.</p> : null}
  </section>
}
