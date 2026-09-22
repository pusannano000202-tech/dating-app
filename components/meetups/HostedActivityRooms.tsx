'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, MapPin, UsersRound } from 'lucide-react'
import type { MeetupCategory } from '@/lib/community/contracts'
import type { MeetupGenderMode } from '@/lib/community/meetup-gender'
import { createdMeetupHref } from '@/lib/meetups/create-flow'
import { parseMeetupPagination } from '@/lib/meetups/list-page'
import styles from './activity-rooms.module.css'

type HostedRoom = {
  id: string; title: string; category: MeetupCategory; activity_key: string
  member_count: number; capacity: number; joined: boolean; is_host: boolean
  status: 'open' | 'full'; schedule_status: 'confirmed' | 'schedule_pending'
  scheduled_at: string | null; place_name: string | null
}

function validRoom(value: unknown, activityKey: string, category: MeetupCategory): value is HostedRoom {
  if (!value || typeof value !== 'object') return false
  const room = value as HostedRoom
  return !!createdMeetupHref({ meetup: room }) && typeof room.title === 'string' && room.title.trim().length > 0
    && room.activity_key === activityKey && room.category === category
    && Number.isInteger(room.member_count) && Number.isInteger(room.capacity)
    && room.capacity >= 2 && room.member_count >= 0 && room.member_count <= room.capacity
    && typeof room.joined === 'boolean' && typeof room.is_host === 'boolean'
    && (room.status === 'open' || room.status === 'full')
    && (room.schedule_status === 'schedule_pending'
      ? room.scheduled_at === null && room.place_name === null
      : room.schedule_status === 'confirmed' && typeof room.scheduled_at === 'string' && Number.isFinite(Date.parse(room.scheduled_at)) && typeof room.place_name === 'string')
}

const scheduleFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** Hosted rooms keep their application/deposit path; this list only links to details. */
export default function HostedActivityRooms({ activityKey, category, genderMode, refreshVersion = 0 }: {
  activityKey: string; category: MeetupCategory; genderMode: MeetupGenderMode; refreshVersion?: number
}) {
  const [items, setItems] = useState<HostedRoom[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'auth'>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageError, setPageError] = useState(false)
  const cursor = useRef<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const busy = useRef(false)

  const load = useCallback(async (more = false) => {
    if (more && (busy.current || !cursor.current)) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const version = ++generation.current
    busy.current = true
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    setPageError(false)
    setLoadingMore(more)
    if (!more) { cursor.current = null; setItems([]); setHasMore(false); setState('loading') }
    try {
      const params = new URLSearchParams({ activity_key: activityKey, category, scope_type: 'school', gender_mode: genderMode, limit: '4' })
      if (more && cursor.current) params.set('cursor', cursor.current)
      const response = await fetch('/api/meetups?' + params, { cache: 'no-store', signal: controller.signal })
      const payload = await response.json()
      if (response.status === 401 || payload?.availability === 'auth_required') throw new Error('auth')
      const pagination = parseMeetupPagination(payload)
      if (!response.ok || payload?.availability !== 'ready' || !Array.isArray(payload.meetups) || !pagination
        || !payload.meetups.every((item: unknown) => validRoom(item, activityKey, category))) throw new Error('unavailable')
      if (version !== generation.current || controller.signal.aborted) return
      const rows = payload.meetups as HostedRoom[]
      cursor.current = pagination.nextCursor
      setItems(previous => Array.from(new Map([...(more ? previous : []), ...rows].map(item => [item.id, item])).values()))
      setHasMore(pagination.hasMore)
      setState('ready')
    } catch (failure) {
      if (version !== generation.current) return
      if (failure instanceof Error && failure.message === 'auth') { setItems([]); setHasMore(false); setState('auth') }
      else if (more) setPageError(true)
      else setState('error')
    } finally {
      window.clearTimeout(timeout)
      if (version === generation.current) { busy.current = false; setLoadingMore(false) }
    }
  }, [activityKey, category, genderMode])

  useEffect(() => {
    void load()
    return () => { ++generation.current; request.current?.abort(); busy.current = false }
  }, [load, refreshVersion])

  const lobbyHref = `/meetups/activities/${encodeURIComponent(activityKey)}/rooms?${new URLSearchParams({ gender_mode: genderMode })}`
  return <section className={styles.hostedRooms} aria-labelledby="hosted-activity-room-title">
    <h3 id="hosted-activity-room-title" className={styles.roomGroupTitle}>친구가 직접 연 방</h3>
    {state === 'loading' ? <p className={styles.compactStatus} role="status">직접 연 방을 확인하고 있어요.</p> : null}
    {state === 'error' ? <div className={styles.compactError} role="status"><p>직접 연 방을 불러오지 못했어요.</p><button type="button" onClick={() => void load()}>다시 확인</button></div> : null}
    {state === 'auth' ? <p className={styles.compactStatus}><Link href={'/login?redirect=' + encodeURIComponent(lobbyHref)}>로그인하고 직접 연 방 보기<ArrowRight size={15} aria-hidden="true" /></Link></p> : null}
    {state === 'ready' && items.length === 0 ? <p className={styles.compactStatus}>아직 직접 연 방은 없어요. 위에서 이 활동의 모임방을 만들 수 있어요.</p> : null}
    {state === 'ready' && items.length > 0 ? <div className={styles.rooms}>{items.map(room => <article key={room.id} className={`${styles.room} ${styles.hostedRoom}`}>
      <div className={styles.roomTop}><h4>{room.title}</h4><span className={room.is_host || room.joined ? styles.mine : room.status === 'full' ? styles.full : styles.open}>{room.is_host ? '내가 만든 방' : room.joined ? '참여 중' : room.status === 'full' ? '모집 마감' : '모집 중'}</span></div>
      <div className={styles.roomMeta}>
        <span><UsersRound size={14} aria-hidden="true" />{room.member_count} / {room.capacity}명</span>
        <span><CalendarDays size={14} aria-hidden="true" />{room.schedule_status === 'schedule_pending' ? '시간·장소 함께 정하기' : scheduleFormatter.format(new Date(room.scheduled_at!))}</span>
        {room.schedule_status === 'confirmed' && room.place_name ? <span><MapPin size={14} aria-hidden="true" />{room.place_name}</span> : null}
      </div>
      <div className={styles.hostedRoomFooter}><span>{room.is_host ? '방장 · 참가 신청 관리' : room.joined ? '내 모임 이어가기' : '신청 후 방장 수락'}</span><Link href={`/meetups/${room.id}`} className={styles.roomDetailLink}>{room.is_host || room.joined ? '내 모임 보기' : '모임방 보기'}<ArrowRight size={16} aria-hidden="true" /></Link></div>
    </article>)}</div> : null}
    {pageError ? <p className={styles.compactStatus} role="status">다음 방을 불러오지 못했어요. 더 보기로 다시 확인해 주세요.</p> : null}
    {state === 'ready' && hasMore ? <button type="button" disabled={loadingMore} className={styles.moreRooms} onClick={() => void load(true)}>{loadingMore ? '방을 불러오는 중…' : '모임방 더 보기'}</button> : null}
  </section>
}
