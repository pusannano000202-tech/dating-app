'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { socialChatHref } from '@/lib/chat/social-room-presentation'
import { ArrowLeft, ArrowRight, RefreshCw, UsersRound } from 'lucide-react'
import { createManualStudyCourse, getStudyCourse, getStudyCoursePhoto } from '@/lib/meetups/study-catalog'
import { getStudyGuide } from '@/lib/meetups/study-guide'
import { isStudyRoomLevel, parseStudyRoomDetail, parseStudyRoomHistory, parseStudyRoomList, studyRoomErrorMessage, STUDY_UUID, type StudyRoomAction, type StudyRoomDetail, type StudyRoomSummary } from '@/lib/meetups/study-room-contract'
import StudySessionPanel from './StudySessionPanel'
import HostedStudyLobby from './HostedStudyLobby'
import MeetupApplications from './MeetupApplications'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import { isStudyRoomAccessRevoked, mergeStudyRoomSnapshot } from '@/lib/meetups/study-room-client-state'
import s from './study-room.module.css'

function errorCode(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'community_unavailable'
  const error = (payload as { error?: unknown }).error
  return typeof error === 'string' ? error : error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : 'community_unavailable'
}

type StudyExperienceProps={fixedRoomId?:string;chatOnly?:boolean;readOnly?:boolean}
export default function StudyRoomExperience(props:StudyExperienceProps={}) {
 const params=useSearchParams(),account=useHistoryAccount()
 if(!props.fixedRoomId&&!params.get('room'))return <HostedStudyLobby key={`${account}:${params.toString()}`}/>
 return <ExistingStudyRoomExperience key={`${account}:${props.fixedRoomId??params.get('room')}`} {...props}/>
}
function ExistingStudyRoomExperience({ fixedRoomId, chatOnly = false, readOnly = false }: StudyExperienceProps) {
  const params = useSearchParams()
  const router = useRouter()
  const roomId = fixedRoomId ?? params.get('room')
  const courseId = params.get('course') ?? ''
  const course = getStudyCourse(courseId)
  const manual = courseId === 'custom' ? createManualStudyCourse(params.get('title') ?? '') : null
  const courseName = course?.title ?? manual?.title ?? ''
  const photo = getStudyCoursePhoto(courseName)
  const level = isStudyRoomLevel(params.get('level')) ? params.get('level') as 'beginner' | 'intermediate' | 'advanced' : 'beginner'
  const [rooms, setRooms] = useState<StudyRoomSummary[]>([])
  const [room, setRoom] = useState<StudyRoomDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [errorExit, setErrorExit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const pending = useRef(false)
  const historyLoaded = useRef(false)
  const epoch = useRef(0)
  const readController = useRef<AbortController | null>(null)
  const invalidateReads = useCallback(() => { ++epoch.current; readController.current?.abort() }, [])

  const listQuery = new URLSearchParams({ course_id: courseId, level, ...(manual ? { course_name: manual.title } : {}) }).toString()
  const valid = roomId ? STUDY_UUID.test(roomId) : Boolean(course || manual)

  const load = useCallback(async (quiet = false) => {
    if (!valid) return
    readController.current?.abort()
    const controller = new AbortController()
    readController.current = controller
    const ticket = ++epoch.current
    const timeout = setTimeout(() => controller.abort(), 12000)
    if (!quiet) { setStatus('loading'); setError('') }
    try {
      const response = await fetch(roomId ? `/api/meetups/study-rooms/${roomId}` : `/api/meetups/study-rooms?${listQuery}`, { cache: 'no-store', signal: controller.signal })
      const payload: unknown = await response.json()
      if (ticket !== epoch.current) return
      if (!response.ok) throw new Error(errorCode(payload))
      const data = payload && typeof payload === 'object' ? (payload as { data?: unknown }).data : null
      if (roomId) {
        const parsed = parseStudyRoomDetail(data)
        if (!parsed || parsed.id !== roomId) throw new Error('community_unavailable')
        setRoom(previous => mergeStudyRoomSnapshot(previous, parsed, historyLoaded.current))
      } else {
        const parsed = parseStudyRoomList(data)
        if (!parsed) throw new Error('community_unavailable')
        setRooms(parsed.rooms)
      }
      setStatus('ready'); setError('')
    } catch (problem) {
      if (ticket !== epoch.current) return
      if (controller.signal.aborted && readController.current !== controller) return
      const code = problem instanceof Error && problem.name !== 'AbortError' ? problem.message : 'community_unavailable'
      setError(code)
      if (isStudyRoomAccessRevoked(code)) { setRoom(null); setRooms([]); setStatus('error'); historyLoaded.current = false }
      if (!quiet) setStatus('error')
    } finally { clearTimeout(timeout) }
  }, [valid, roomId, listQuery])

  useEffect(() => {
    setRoom(null); setRooms([]); setNotice(''); setErrorExit(false); historyLoaded.current = false
    void load()
    const refreshIfVisible = () => { if (document.visibilityState === 'visible' && !pending.current) void load(true) }
    const interval = setInterval(refreshIfVisible, 15000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => { invalidateReads(); clearInterval(interval); document.removeEventListener('visibilitychange', refreshIfVisible) }
  }, [load, refresh, invalidateReads])

  async function mutate(url: string, method: string, body?: unknown): Promise<unknown | null> {
    if (pending.current) return null
    pending.current = true; setBusy(true); setError(''); const ticket = ++epoch.current; readController.current?.abort()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal })
      const payload = await response.json()
      if (ticket !== epoch.current) return null
      if (!response.ok) throw new Error(errorCode(payload))
      return payload.data
    } catch (problem) {
      if (ticket !== epoch.current) return null
      const code = problem instanceof Error && problem.name !== 'AbortError' ? problem.message : 'community_unavailable'
      setError(code)
      if (isStudyRoomAccessRevoked(code)) { setRoom(null); setRooms([]); setStatus('error'); historyLoaded.current = false }
      // A timeout is uncertain; never claim failure/success without re-reading the server.
      return null
    } finally { clearTimeout(timeout); pending.current = false; setBusy(false) }
  }

  async function join(target?: string) {
    const result = await mutate(target ? `/api/meetups/study-rooms/${target}` : '/api/meetups/study-rooms', target ? 'PATCH' : 'POST', target ? { action: 'join' } : { course_id: courseId, course_name: courseName, level })
    const parsed = parseStudyRoomDetail(result)
    if (parsed && (!target || parsed.id === target)) router.push((socialChatHref({kind: 'study_room', id: parsed.id}) ?? '/chat'))
    else if (result) setError('community_unavailable')
  }

  async function action(input: StudyRoomAction) {
    if (!roomId) return false
    const result = await mutate(`/api/meetups/study-rooms/${roomId}`, 'PATCH', input)
    if (result === null) return false
    const parsed = parseStudyRoomDetail(result)
    if (!parsed || parsed.id !== roomId) { setError('community_unavailable'); return false }
    setRoom(previous => mergeStudyRoomSnapshot(previous, parsed, historyLoaded.current)); setStatus('ready'); return true
  }

  async function leave(reason?: string) {
    if (!roomId) return
    const result = await mutate(`/api/meetups/study-rooms/${roomId}`, 'DELETE', reason ? { report_reason: reason } : {})
    if (!result || typeof result !== 'object' || (result as { left?: unknown }).left !== true) return
    const report = (result as { report_status?: unknown }).report_status
    setRoom(null)
    setNotice(report === 'failed' ? '모임에서는 나왔어요. 신고는 저장되지 않았어요. 운영자에게 별도로 알려 주세요.' : report === 'saved' ? '모임에서 나왔고, 신고를 비공개로 접수했어요.' : '모임에서 나왔어요. 원할 때 다른 모임에서 다시 만나요.')
  }

  async function older() {
    if (!room || busy || !room.messages.length) return
    const oldest = room.messages[0]
    const result = await mutate(`/api/meetups/study-rooms/${room.id}/messages?${new URLSearchParams({ before_at: oldest.created_at, before_id: oldest.id })}`, 'GET')
    if (!result || typeof result !== 'object') return
    const decoded = parseStudyRoomHistory(result)
    if (!decoded) { setError('community_unavailable'); return }
    const merged = new Map([...decoded.messages, ...room.messages].map(message => [message.id, message]))
    historyLoaded.current = true
    setRoom({ ...room, messages: [...merged.values()], has_older_messages: decoded.has_older_messages })
  }

  const guide = getStudyGuide({ kind: course?.guideKind ?? 'major-general', level, sessionNumber: 1 })
  const own = rooms.find(item => item.joined)
  if(chatOnly&&room&&room.id===roomId&&!notice)return <StudySessionPanel key={room.id} room={room} busy={busy} chatOnly readOnly={readOnly}
    readTrackingEnabled={status==='ready'&&!error} error={error?studyRoomErrorMessage(error):undefined} onRetry={()=>void load(true)}
    notice={room.admission_mode==='hosted'?<MeetupApplications meetupId={room.id} kind="study" noticesOnly/>:null}
    managementExtra={room.admission_mode==='hosted'&&room.is_host?<Link className={s.secondary} href={`/meetups/participation/study/${room.id}/applications`}>참가 신청 관리</Link>:null}
    onAction={action} onLeave={leave} onOlderMessages={older}/>
  const Container = chatOnly ? 'section' : 'main'
  return <Container className={chatOnly ? undefined : s.page}><div className={s.container}>
    {!chatOnly ? <Link href="/meetups/department/courses" className={s.back}><ArrowLeft size={18} />내 수업 같이 공부하기</Link> : null}
    {notice ? <section className={s.card}><h1 className={s.eyebrow}>내 선택을 반영했어요</h1><p role="status">{notice}</p><Link href="/meetups/department/courses" className={s.primary}>다른 모임 둘러보기<ArrowRight size={17} /></Link></section> : <>
      {!valid ? <section className={s.card}><h1>과목을 먼저 골라 주세요</h1><p>선택한 과목이 없거나 모임 주소를 확인할 수 없어요.</p><Link className={s.primary} href="/meetups/department/courses">과목 찾기</Link></section> : null}
      {valid && !roomId ? <header className={s.header}><p className={s.eyebrow}>우리 과끼리 · 전공 스터디</p><h1>{courseName}, 같이 풀어요</h1><p>같은 과에서 이 수업을 공부할 사람들과 만나요.<br />한 번 참여해 보고, 다음 회차는 다시 골라도 괜찮아요.</p><Image className={s.hero} src={photo.src} alt={photo.description} width={900} height={600} sizes="(min-width: 760px) 650px, 94vw" priority /><p>전공은 실력 구분 없이 함께 공부해요. 오늘 공부할 범위는 모임에서 함께 정해요.</p></header> : null}
      {valid && status === 'loading' ? <p role="status" className={s.note}>현재 모임과 빈자리를 확인하고 있어요…</p> : null}
      {error ? <section role="alert" className={s.error}><p>{studyRoomErrorMessage(error)}</p><div className={s.actions}>{error === 'Unauthorized' ? <Link className={s.secondary} href={`/login?redirect=${encodeURIComponent(`/meetups/study?${params.toString()}`)}`}>로그인하기</Link> : error === 'department_identity_required' || error === 'profile_required' ? <Link className={s.secondary} href="/profile/edit">학교·학과 입력하기</Link> : null}<button className={s.secondary} type="button" disabled={busy} onClick={() => void load(Boolean(room))}><RefreshCw size={15} />다시 확인</button></div></section> : null}
      {valid && !roomId && status === 'ready' ? <section aria-label="함께할 스터디방"><div className={s.row}><h2 className={s.grow}>함께할 모임방</h2><button type="button" className={s.quiet} aria-label="방 목록 새로고침" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18} /></button></div><p className={s.note}>현재 {rooms.length}개 방 · 한 방에 최대 5명</p>
        {rooms.map(item => <article className={s.card} key={item.id}><div className={s.row}><div className={s.grow}><h2>{item.room_number}번 방</h2><span className={s.badge}>{item.joined ? '내가 참여한 방' : item.status === 'completed' ? '10회 안내 마침' : item.member_count < 5 ? '함께할 사람을 기다려요' : '다섯 명이 모였어요'}</span></div><span className={s.count}>{item.member_count}<small> / 5명</small></span></div><p className={s.note}>{item.current_session}회차 · {item.department_label}</p>{item.joined ? <Link className={`${s.primary} ${s.wide}`} href={(socialChatHref({kind: 'study_room', id: item.id}) ?? '/chat')}>내 모임 이어가기<ArrowRight size={17} /></Link> : <button className={`${s.secondary} ${s.wide}`} type="button" disabled={busy || item.member_count >= 5 || item.status === 'completed' || Boolean(own)} onClick={() => void join(item.id)}>{own ? '이 과목의 내 방에서 먼저 나와 주세요' : item.member_count >= 5 ? '빈자리를 기다려 주세요' : '이 방에서 같이 공부하기'}</button>}</article>)}
        {!own && !rooms.some(item => item.member_count < 5 && item.status !== 'completed') ? <section className={s.card}><UsersRound color="#b64b3d" size={23} /><h2>{rooms.length ? '다음 다섯 명을 함께 모아요' : '이 과목의 첫 모임을 시작해요'}</h2><p>참여할 때 모집방이 생겨요. 이미 빈자리가 생긴 방이 있다면 그곳으로 이어져요.</p><button type="button" className={`${s.primary} ${s.wide}`} disabled={busy} onClick={() => void join()}>함께 공부할게요</button></section> : null}
      </section> : null}
      {roomId && !room && ['study_room_forbidden', 'department_identity_required'].includes(error) ? <section className={s.card}><p>대화가 제한되어도 모임에서 나갈 수 있어요.</p>{errorExit ? <><p className={s.note}>나가면 이 방의 대화와 다음 활동에 참여하지 않아요. 다른 사람의 약속과 기록은 유지돼요.</p><div className={s.actions}><button className={s.secondary} type="button" onClick={() => setErrorExit(false)}>취소</button><button className={s.primary} type="button" disabled={busy} onClick={() => void leave()}>확인하고 나가기</button></div></> : <button className={s.secondary} type="button" onClick={() => setErrorExit(true)}>이 방에서 나가기</button>}</section> : null}
      {room && room.id === roomId && !notice ? <>{room.admission_mode==='hosted'?<><MeetupApplications meetupId={room.id} kind="study" noticesOnly/>{room.is_host?<Link className={s.secondary} href={`/meetups/participation/study/${room.id}/applications`}>참가 신청 관리</Link>:null}</>:null}<StudySessionPanel key={`${room.id}:${room.current_session}`} room={room} busy={busy} chatOnly={chatOnly} readOnly={readOnly} readTrackingEnabled={status === 'ready' && !error} onAction={action} onLeave={leave} onOlderMessages={older} /></> : null}
      {!roomId && guide ? <details className={s.disclosure}><summary>만나면 무엇을 하나요?<ArrowRight size={16} /></summary><div className={s.inside}><h2>{guide.title}</h2><p className={s.note}>{guide.goal}</p>{guide.steps.map(step => <div className={s.guideStep} key={step.id}><h3>{step.title}<small>{step.minutes}분</small></h3><p>{step.body}</p></div>)}<p className={s.note}>권장 10회, 회차마다 자유 참여예요. 실제 강의 진도에 맞춰 같이 조정해요. 지금 안내를 보는 것만으로 참여 신청되지는 않아요.</p></div></details> : null}
    </>}
  </div></Container>
}
