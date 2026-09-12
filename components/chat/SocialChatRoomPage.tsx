'use client'

import Link from 'next/link'
import {useCallback, useEffect, useRef, useState} from 'react'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import {ChatAffiliationHeader} from '@/components/chat/ChatAffiliationHeader'
import MeetupDetailExperience from '@/components/meetups/MeetupDetailExperience'
import ActivityRoomChat from '@/components/meetups/ActivityRoomChat'
import StudyRoomExperience from '@/components/meetups/StudyRoomExperience'
import MentoringExperience from '@/components/meetups/MentoringExperience'
import HostedMentoringRoom from '@/components/meetups/HostedMentoringRoom'
import LeagueMatchChat from '@/components/community/department/LeagueMatchChat'
import DepartmentLeagueJourney from '@/components/community/department/DepartmentLeagueJourney'
import {isChatUuid, parseSocialRoomsResponse, type SocialChatRoom, type SocialChatRoomKind} from '@/lib/chat/social-rooms-contract'
import {socialRoomDetailHref} from '@/lib/chat/social-room-presentation'
import s from './chat-belonging.module.css'

type ExistingRoomKind = Exclude<SocialChatRoomKind, 'league_team'>
type RoomState = {owner: string; kind: ExistingRoomKind; id: string; room: SocialChatRoom | null; error: boolean}

export default function SocialChatRoomPage({kind, id}: {kind: ExistingRoomKind; id: string}) {
  const account = useHistoryAccount()
  const accountRef = useRef(account)
  accountRef.current = account
  const scope = `${kind}:${id}`
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const epoch = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const [state, setState] = useState<RoomState | null>(null)
  const invalidate = useCallback(() => {++epoch.current; controller.current?.abort(); controller.current = null}, [])
  const load = useCallback(async (quiet = false) => {
    if (!isChatUuid(account) || !isChatUuid(id)) return
    if (quiet && controller.current) return
    controller.current?.abort()
    const abort = new AbortController(), ticket = ++epoch.current
    controller.current = abort
    const timeout = setTimeout(() => abort.abort(), 12000)
    const current = () => ticket === epoch.current && accountRef.current === account && scopeRef.current === scope
    try {
      const response = await fetch(`/api/chat/social-rooms?${new URLSearchParams({kind, id})}`, {cache: 'no-store', signal: abort.signal})
      const payload: unknown = await response.json()
      if (!current()) return
      const parsed = response.ok ? parseSocialRoomsResponse(payload, account) : null
      const room = parsed?.rooms.length === 1 && !parsed.has_more && parsed.next_cursor === null && parsed.rooms[0].kind === kind && parsed.rooms[0].id === id ? parsed.rooms[0] : null
      setState({owner: account, kind, id, room, error: !room})
    } catch {
      if (current()) setState({owner: account, kind, id, room: null, error: true})
    } finally {
      clearTimeout(timeout)
      if (ticket === epoch.current) controller.current = null
    }
  }, [account, id, kind, scope])

  useEffect(() => {
    void load()
    const refresh = () => {if (document.visibilityState === 'visible') void load(true)}
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => {invalidate(); window.clearInterval(timer); window.removeEventListener('focus', refresh)}
  }, [load, invalidate])
  const refreshRoom = useCallback(() => load(true), [load])

  // Render fence precedes effect cleanup: an account or URL change never retains old children.
  const current = state && state.owner === account && state.kind === kind && state.id === id ? state : null
  const room = isChatUuid(account) ? current?.room : null
  if (!room) return <main className={s.roomShell}><section className={s.roomGate} role="status">
    <Link href="/chat">채팅 목록</Link>
    <h1>{account === null ? '로그인이 필요해요' : account === 'unavailable' || current?.error ? '이 대화에 입장할 수 없어요' : '내가 참여한 방을 확인하고 있어요'}</h1>
    {account === null ? <Link href={`/login?redirect=${encodeURIComponent(`/chat/rooms/${kind}/${id}`)}`}>로그인하기</Link> : account === 'unavailable' || current?.error ? <><p>참여가 종료되었거나 연결을 확인하지 못했어요. 다른 방으로 자동 이동하지 않아요.</p><button type="button" onClick={() => void load()}>다시 확인</button></> : null}
    {isChatUuid(account)&&isChatUuid(id)&&current?.error&&(kind==='study_room'||kind==='mentoring')?<><p>대화가 제한되어도 본인의 참여 정리·신고는 별도로 확인할 수 있어요.</p><Link href={kind==='study_room'?`/meetups/study?room=${id}`:`/meetups/mentoring-rooms/${id}`}>이 모임 참여 관리·나가기</Link>{kind==='mentoring'?<Link href={`/meetups/department/mentoring?session=${id}`}>이전 방식 멘토링 참여 관리</Link>:null}</>:null}
  </section></main>

  const detailHref = socialRoomDetailHref(room)
  return <main className={s.roomShell}>
    <ChatAffiliationHeader kind={kind} title={room.title} affiliation={room.affiliation} memberCount={room.member_count} detailHref={detailHref}/>
    <div className={s.roomContent} key={`${account}:${kind}:${id}`}>
      {!room.writable ? <p role="status">현재 이 방은 읽기 전용이에요.</p> : null}
      {kind === 'meetup' ? <MeetupDetailExperience meetupId={id} chatOnly readOnly={!room.writable}/> : null}
      {kind === 'activity_room' ? <ActivityRoomChat roomId={id} embedded readOnly={!room.writable}/> : null}
      {kind === 'study_room' ? <StudyRoomExperience fixedRoomId={id} chatOnly readOnly={!room.writable}/> : null}
      {kind === 'mentoring' ? room.recruitment_mode==='hosted'?<HostedMentoringRoom id={id} chatOnly readOnly={!room.writable}/>:<MentoringExperience fixedSessionId={id} chatOnly readOnly={!room.writable}/> : null}
      {kind === 'league_match' ? <LeagueMatchChat challengeId={id} demo={false} onRefresh={refreshRoom} schedule={room.sport?<DepartmentLeagueJourney initialSport={room.sport} initialChallengeId={id} coordinationOnly/>:<Link href={detailHref ?? '/meetups/league'}>경기 정보에서 날짜·장소 확인</Link>}/> : null}
    </div>
  </main>
}
