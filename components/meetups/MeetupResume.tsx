'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, MessageCircle, RefreshCw } from 'lucide-react'
import { myMeetupHref, parseMyMeetups, type MyMeetups } from '@/lib/home/my-meetups'
import { getActivityRoomDefinition } from '@/lib/meetups/activity-room-contract'
import StudyMeetupResume from './StudyMeetupResume'

type LoadState = 'loading' | 'ready' | 'unauthorized' | 'error'

/** Only the authenticated membership API can populate this resume area. */
export default function MeetupResume() {
  const [state, setState] = useState<LoadState>('loading')
  const [meetups, setMeetups] = useState<MyMeetups | null>(null)
  const [version, setVersion] = useState(0)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setState('loading')
    setMeetups(null)
    void (async () => {
      try {
        const response = await fetch('/api/meetups/mine', { cache: 'no-store', signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 401) { setState('unauthorized'); return }
        if (!response.ok) throw new Error('unavailable')
        const payload = await response.json()
        const parsed = parseMyMeetups(payload.data)
        if (!parsed) throw new Error('invalid_response')
        if (!controller.signal.aborted) { setMeetups(parsed); setState('ready') }
      } catch {
        if (!controller.signal.aborted) setState('error')
      }
    })()
    return () => controller.abort()
  }, [version])

  return <section id="my-meetups" aria-label="내가 참여한 모임" className="scroll-mt-6 border-b border-[#efdfd6] px-5 py-3 text-[#382c28] sm:px-7">
    <StudyMeetupResume showUnavailableHint={state === 'ready'} />
    {state === 'loading' ? <p role="status" className="text-xs leading-6 text-[#807169]">참여 중인 모임 확인 중…</p> : null}
    {state === 'unauthorized' ? <Link href="/login?redirect=%2Fmeetups%23my-meetups" className="flex min-h-11 items-center gap-2 text-sm font-semibold"><MessageCircle size={17} />내 모임 이어가기<span className="ml-auto text-xs font-normal text-[#807169]">로그인 후 확인</span><ArrowRight size={16} /></Link> : null}
    {state === 'error' ? <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><p className="text-xs leading-5 text-[#807169]">내 모임은 잠시 연결을 확인 중이에요.</p><button type="button" onClick={() => setVersion(value => value + 1)} className="flex min-h-11 items-center gap-1 text-xs font-semibold text-[#a33f33]"><RefreshCw size={14} />다시 확인</button></div> : null}
    {state === 'ready' && meetups ? <>
      {meetups.items.length === 0 ? <p className="text-xs leading-6 text-[#807169]">모임에 참여하면 여기서 대화를 이어갈 수 있어요.</p> : <div className="space-y-2">
        {(expanded ? meetups.items : meetups.items.slice(0, 1)).map(room => <Link key={`${room.kind}:${room.id}`} href={myMeetupHref(room)} className="flex min-h-16 items-center gap-3 rounded-2xl bg-[#f7ebe3] px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b84b3f]">
          <MessageCircle size={21} className="shrink-0 text-[#b84b3f]" />
          <span className="min-w-0 flex-1"><span className="block text-[11px] text-[#a33f33]">내 모임 · 참여 중</span><strong className="mt-1 block break-words text-sm">{room.title || (room.activity_key ? getActivityRoomDefinition(room.activity_key)?.title : null) || '참여한 모임'}</strong><span className="mt-1 block text-xs leading-5 text-[#807169]">{room.member_count}/{room.capacity}명 · {room.kind === 'activity_room' ? `${room.room_number}번 방` : '일정 있는 모임'} · 채팅 이어가기</span></span><ArrowRight size={17} className="shrink-0" />
        </Link>)}
        {meetups.items.length > 1 ? <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="min-h-11 w-full text-xs font-semibold text-[#a33f33]">{expanded ? '접기' : `참여한 모임 ${meetups.items.length}개 보기`}</button> : null}
        {meetups.has_more ? <p className="text-xs leading-5 text-[#807169]">최대 100개까지 불러왔어요. 이전 방은 해당 활동에서 확인해 주세요.</p> : null}
      </div>}
    </> : null}
  </section>
}
