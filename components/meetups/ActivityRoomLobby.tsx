'use client'

import { socialChatHref } from '@/lib/chat/social-room-presentation'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2, MessageCircle, Plus, RefreshCw, UsersRound } from 'lucide-react'
import { MEETUP_GENDER_LABELS, type MeetupGenderMode } from '@/lib/community/meetup-gender'
import { activityRoomErrorMessage, getActivityRoomDefinition, isActivityRoomId, parseActivityRoomLobby, type ActivityRoomLobby as Lobby } from '@/lib/meetups/activity-room-contract'
import styles from './activity-rooms.module.css'
import { fetchActivityRoom } from '@/lib/meetups/activity-room-client'
import { buildMeetupDiscoveryReturnHref } from '@/lib/meetups/discovery-navigation'
import { buildContextualMeetupCreateHref } from '@/lib/meetups/create-context'
import HostedActivityRooms from './HostedActivityRooms'

export default function ActivityRoomLobby({ activityKey, genderMode }: { activityKey: string; genderMode: MeetupGenderMode }) {
  const router = useRouter()
  const definition = getActivityRoomDefinition(activityKey)!
  const createHref = buildContextualMeetupCreateHref({ activityKey, genderMode })
  const endpoint = `/api/meetups/activities/${encodeURIComponent(activityKey)}/rooms?gender_mode=${genderMode}`
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyRoom, setBusyRoom] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const sequence = useRef(0)
  const inFlightJoin = useRef(false)
  const readInFlight = useRef(false)
  const invalidateRead = useCallback(() => { ++sequence.current; readInFlight.current = false }, [])

  const load = useCallback(async (ensure = false, quiet = false) => {
    if (quiet && readInFlight.current) return
    readInFlight.current = true
    const request = ++sequence.current
    if (!quiet) setLoading(true)
    try {
      const { ok, payload } = await fetchActivityRoom(endpoint, { method: ensure ? 'POST' : 'GET' })
      const next = parseActivityRoomLobby(payload?.data)
      if (!ok || !next || next.activity_key !== activityKey || next.gender_mode !== genderMode) throw new Error(payload?.error ?? 'invalid_response')
      if (request === sequence.current) { setLobby(next); setError('') }
    } catch (failure) {
      if (request === sequence.current) { setLobby(null); setError(failure instanceof Error ? failure.message : 'unavailable') }
    } finally { if (request === sequence.current) { readInFlight.current = false; setLoading(false) } }
  }, [endpoint, activityKey, genderMode])

  useEffect(() => {
    setLobby(null)
    setError('')
    // The activity click opens a pool. Only POST may prepare its first room;
    // polling/GET never creates rooms or joins a participant.
    void load(true)
    const refresh = () => { if (document.visibilityState === 'visible' && !inFlightJoin.current) void load(false, true) }
    const timer = window.setInterval(refresh, 8000)
    window.addEventListener('focus', refresh)
    return () => { invalidateRead(); window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [load, invalidateRead])

  async function join(roomId: string) {
    if (inFlightJoin.current) return
    inFlightJoin.current = true
    setBusyRoom(roomId)
    setError('')
    ++sequence.current
    try {
      const { ok, payload } = await fetchActivityRoom(`/api/meetups/rooms/${roomId}/join`, { method: 'POST' })
      if (!ok || !isActivityRoomId(payload?.data?.room_id) || payload.data.room_id !== roomId) throw new Error(payload?.error ?? 'invalid_response')
      router.push((socialChatHref({kind: 'activity_room', id: payload.data.room_id}) ?? '/chat'))
    } catch (failure) {
      await load(false)
      setError(failure instanceof Error ? failure.message : 'unavailable')
    } finally { inFlightJoin.current = false; setBusyRoom(null) }
  }

  const alreadyInRoom = lobby?.rooms.some(room => room.joined) ?? false
  return <main className={styles.page}>
    <div className={styles.shell}>
      <Link href={buildMeetupDiscoveryReturnHref(activityKey, genderMode)} className={styles.back}><ArrowLeft size={18} />활동 고르기</Link>
      <section className={styles.hero}>
        <div className={styles.photo}><Image src={definition.imageSrc} alt={definition.imageAlt} fill sizes="(max-width: 700px) 100vw, 720px" className="object-contain" priority /></div>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>학교 친구들과 · {MEETUP_GENDER_LABELS[genderMode]}</p>
          <h1>{definition.title}</h1>
          <p>같은 활동을 하고 싶은 친구들의 방이에요.<br />마음에 드는 방을 고르거나, 내 모임을 열어보세요.</p>
        </div>
      </section>
      <section aria-labelledby="activity-room-list-title">
        <div className={styles.sectionHeading}><div><h2 id="activity-room-list-title">함께할 모임방</h2><p>방마다 시간과 참여 방법을 확인해요.</p></div>
          <button className={styles.iconButton} onClick={() => { void load(true); setRefreshVersion(value => value + 1) }} disabled={loading || !!busyRoom} aria-label="방 목록 새로고침"><RefreshCw size={19} className={loading ? styles.spin : ''} /></button>
        </div>
        {createHref ? <div className={styles.createRoom}><Link href={createHref} className={styles.createRoomLink}><Plus size={18} aria-hidden="true" />모임방 만들기<ArrowRight size={17} aria-hidden="true" /></Link><p>이 활동으로 직접 여는 모임이에요.</p></div> : null}
        <h3 className={styles.roomGroupTitle}>바로 함께할 방 <span>참여하면 채팅이 열려요</span></h3>
        {loading && !lobby && !error ? <div className={styles.status} role="status"><Loader2 size={22} className={styles.spin} />방을 확인하고 있어요</div> : null}
        {error ? <div className={styles.error} role="alert"><strong>{lobby ? '참여 상태를 확인해 주세요' : '방 현황을 확인하지 못했어요'}</strong><p>{activityRoomErrorMessage(error)}</p>
          {error === 'Unauthorized' ? <Link className={styles.primary} href={`/login?redirect=${encodeURIComponent('/meetups/activities/' + activityKey + '/rooms?gender_mode=' + genderMode)}`}>로그인하기</Link> : /profile_required|gender_required/.test(error) ? <Link className={styles.primary} href="/profile/edit">프로필 확인하기</Link> : <button onClick={() => void load(true)} className={styles.secondary} disabled={loading}>다시 확인</button>}
        </div> : null}
        {lobby ? <div className={styles.rooms}>{lobby.rooms.map(room => <article className={styles.room} key={room.id}>
          <div className={styles.roomTop}><span className={styles.roomNumber}>{room.room_number}번 방</span><span className={room.joined ? styles.mine : room.status === 'full' || !room.joinable ? styles.full : styles.open}>{room.joined ? '내가 참여한 방' : room.status === 'full' ? '정원 마감' : room.joinable ? '모집 중' : alreadyInRoom ? '다른 방 참여 중' : '참여 불가'}</span></div>
          <div className={styles.roomMeta}><span><UsersRound size={14} aria-hidden="true" />{room.member_count} / {room.capacity}명</span><span>함께 시간과 장소를 정해요</span></div>
          <p className={styles.roomNote}>{room.joined ? '시간과 장소는 방에서 함께 정해요.' : room.status === 'full' ? '모집이 완료됐어요. 다음 방에서 함께해요.' : !room.joinable ? alreadyInRoom ? '한 번에 한 방만 참여해요. 내 방에서 먼저 나와 주세요.' : '현재 참여 조건으로는 이 방에 들어갈 수 없어요.' : room.member_count === 0 ? '첫 친구를 기다리는 방이에요.' : `한 팀까지 ${room.capacity - room.member_count}명 남았어요.`}</p>
          {room.joined ? <Link href={(socialChatHref({kind: 'activity_room', id: room.id}) ?? '/chat')} className={styles.primary}>내 방 채팅으로 <ArrowRight size={18} /></Link> : <button className={styles.primary} disabled={!!busyRoom || !room.joinable || !!error} onClick={() => void join(room.id)}>{busyRoom === room.id ? '참여 확인 중…' : room.status === 'full' ? '모집 완료' : !room.joinable ? alreadyInRoom ? '이미 참여 중인 방이 있어요' : '참여할 수 없는 방' : '이 방에 참여하기'}<ArrowRight size={18} /></button>}
        </article>)}
          {lobby.rooms.length === 0 ? <div className={styles.status}>모집방을 아직 준비하지 못했어요. 새로고침으로 다시 확인해 주세요.</div> : null}
        </div> : null}
        <HostedActivityRooms key={`${activityKey}-${genderMode}`} activityKey={activityKey} category={definition.category} genderMode={genderMode} refreshVersion={refreshVersion} />
      </section>
      <details className={styles.roomHelp}><summary><MessageCircle size={16} aria-hidden="true" />방 참여 방법</summary><p>바로 함께할 방은 참여 즉시 채팅이 열려요. 친구가 직접 연 방은 상세에서 보증금과 참가 조건을 확인하고 신청해요. 방장이 수락하면 채팅에 참여해요.</p></details>
    </div>
  </main>
}
