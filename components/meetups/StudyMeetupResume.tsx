'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { socialChatHref } from '@/lib/chat/social-room-presentation'
import { ArrowRight, CalendarDays, RefreshCw } from 'lucide-react'
import { parseStudyRoomList, type StudyRoomSummary } from '@/lib/meetups/study-room-contract'

/** Only actual authenticated memberships become resume cards; never use catalog examples. */
export default function StudyMeetupResume({ showUnavailableHint = true }: { showUnavailableHint?: boolean }) {
  const [items, setItems] = useState<StudyRoomSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'unauthorized'>('loading')
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    const timeout = setTimeout(() => controller.abort(), 12000)
    setStatus('loading')
    void (async () => {
      try {
        const response = await fetch('/api/meetups/study-rooms?mine=true', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401) { setItems([]); setStatus('unauthorized'); return }
        if (!response.ok) throw new Error('unavailable')
        const payload = await response.json()
        const parsed = parseStudyRoomList(payload.data)
        if (!parsed || parsed.rooms.some(item => !item.joined)) throw new Error('invalid')
        if (!controller.signal.aborted) { setItems(parsed.rooms); setStatus('ready') }
      } catch { if (!disposed) setStatus('unavailable') }
      finally { clearTimeout(timeout) }
    })()
    return () => { disposed = true; clearTimeout(timeout); controller.abort() }
  }, [retry])
  if (status === 'unauthorized' || status === 'ready' && items.length === 0) return null
  if ((status === 'unavailable' || status === 'loading') && !showUnavailableHint) return null
  return <section aria-label="진행 중인 스터디" className="my-2 text-[#392d27]">
    {status === 'loading' ? <p className="py-2 text-xs text-[#807169]" role="status">내 스터디 확인 중…</p> : status === 'unavailable' ? <div className="flex items-center justify-between gap-2 text-xs text-[#807169]"><p>스터디 연결을 확인하지 못했어요.</p><button className="flex min-h-11 items-center gap-1 text-[#a33f33]" type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={13} />다시 확인</button></div> : <>
      {(expanded ? items : items.slice(0, 1)).map(item => <Link className="my-2 flex min-h-20 items-center gap-3 rounded-2xl border border-[#eadbd3] bg-white px-4 py-3 focus-visible:outline-2 focus-visible:outline-[#b64b3d]" key={item.id} href={socialChatHref({kind: 'study_room', id: item.id}) ?? '/chat'}>
        <div className="min-w-0 flex-1"><span className="rounded-md bg-[#f7e5df] px-2 py-1 text-[11px] font-semibold text-[#a54739]">내 모임</span><strong className="mt-2 block break-words text-base">{item.course_name} · {item.status === 'completed' ? '함께한 기록' : `${item.current_session}회차 준비`}</strong><span className="mt-1 block text-xs text-[#807169]">{item.member_count}/5명 · 함께 풀면 더 멀리 갈 수 있어요.</span></div><span className="flex shrink-0 items-center gap-1 rounded-xl bg-[#b64b3d] px-3 py-3 text-xs font-semibold text-white"><CalendarDays size={16} /><span>이어가기</span><ArrowRight size={14} /></span>
      </Link>)}
      {items.length > 1 ? <button className="min-h-11 w-full text-xs font-semibold text-[#a54739]" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '접기' : `내 스터디 ${items.length}개 보기`}</button> : null}
    </>}
  </section>
}
