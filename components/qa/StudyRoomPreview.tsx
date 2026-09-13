'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import StudySessionPanel from '@/components/meetups/StudySessionPanel'
import { parseStudyRoomDetail, validateStudyRoomAction, type StudyRoomAction, type StudyRoomDetail, type StudyRoomSession } from '@/lib/meetups/study-room-contract'
import s from '@/components/meetups/study-room.module.css'

const fixtureId = (number: number) => `482d58d0-2b25-4c75-a0cf-${String(number).padStart(12, '0')}`

/** Deliberately disconnected from APIs and storage. Only the real panel is reused. */
export function createStudyRoomPreview(now: string, confirmed = false): StudyRoomDetail {
  const baseTime = Date.parse(now)
  const time = (days: number) => new Date(baseTime + days * 86400000).toISOString()
  const sessions: StudyRoomSession[] = Array.from({ length: 10 }, (_, index) => {
    const number = index + 1
    const past = number < 3
    const locked = number === 3 && confirmed
    return {
      session_number: number, status: past ? 'completed' : locked ? 'confirmed' : 'planning',
      my_attendance: past ? 'not_member' : locked ? 'attending' : 'undecided',
      attending_count: past ? 3 : number === 3 ? locked ? 4 : 3 : 0,
      completed_count: past ? 3 : 0, my_schedule_accepted: false, completion_confirmed: false,
      starts_at: past ? time(-14 + number * 3) : locked ? time(2) : null,
      place_name: past || locked ? '교내 스터디룸 · 예시 장소' : null,
      place_note: past || locked ? '실제 예약·운영 여부와 관계없는 화면 검수용 장소예요.' : null,
      is_sponsored: false,
      proposals: number === 3 ? [
        { id: fixtureId(21), starts_at: time(2), place_name: '교내 스터디룸 · 예시 장소', place_note: '실제 위치와 예약·이용 가능 여부는 확인되지 않았어요.', is_sponsored: false, proposer_alias: '구름냥 · 예시', votes: confirmed ? 3 : 1, confirmations: confirmed ? 3 : 0, my_vote: false, my_confirmation: false },
        { id: fixtureId(22), starts_at: time(3), place_name: '스터디카페 · 광고 표시 예시', place_note: '광고 태그 검수용 예시예요. 실제 제휴 업장이나 가격 정보가 아니에요.', is_sponsored: true, proposer_alias: '바다거북 · 예시', votes: confirmed ? 0 : 1, confirmations: 0, my_vote: false, my_confirmation: false },
      ] : [],
      recaps: past ? [{ id: fixtureId(30 + number), author_alias: '구름냥 · 예시', text: number === 1 ? '각자 헷갈린 개념 하나를 말하고 기호의 의미를 같이 정리했어요.' : '풀이를 비교하고 막힌 단계에 표시했어요. 다음에는 그 부분의 예제 한 문제씩 가져와요.', created_at: time(-13 + number * 3) }] : [],
    }
  })
  const room: StudyRoomDetail = {
    id: fixtureId(1), course_id: 'pnu:AN1500385', course_name: '공학수학 · 예시', level: 'beginner',
    department_label: '미래에너지전공 · 예시', room_number: 1, capacity: 5, member_count: 4,
    joined: true, current_session: 3, status: 'recruiting', membership_since: now, recommended_sessions: 10,
    members: ['반달곰', '구름냥', '바다거북', '별밤'].map((alias, index) => ({ member_id: fixtureId(10 + index), alias: `${alias} · 예시`, is_me: index === 0 })),
    sessions,
    messages: [
      { id: fixtureId(40), sender_alias: '구름냥 · 예시', message: '지난 회차에는 각자 막힌 풀이를 비교했어요. 위의 요약을 보고 오면 편해요.', created_at: time(-2), is_me: false },
      { id: fixtureId(41), sender_alias: '바다거북 · 예시', message: '이번 날짜와 장소는 투표로 정해요. 새로 오신 분도 가능한 후보를 올려주세요!', created_at: time(-1), is_me: false },
    ], has_older_messages: true,
  }
  const parsed = parseStudyRoomDetail(room)
  if (!parsed) throw new Error('Invalid local study preview fixture')
  return parsed
}

export default function StudyRoomPreview({ now }: { now: string }) {
  const [room, setRoom] = useState(() => createStudyRoomPreview(now))
  const [confirmedExample, setConfirmedExample] = useState(false)
  const [notice, setNotice] = useState('참여·쉬기·투표·안내·채팅을 내 화면에서만 시험할 수 있어요.')
  const [left, setLeft] = useState(false)
  const [version, setVersion] = useState(0)
  const sentKeys = useRef(new Set<string>())

  function reset(confirmed: boolean) {
    setRoom(createStudyRoomPreview(now, confirmed))
    setConfirmedExample(confirmed)
    setLeft(false)
    setVersion(value => value + 1)
    sentKeys.current.clear()
    setNotice(confirmed ? '확정된 약속에 새 멤버가 합류한 예시예요. 실제 투표 결과가 아니에요.' : '변경을 지우고 예시를 다시 시작했어요. 서버에 저장한 데이터는 없어요.')
  }

  async function onAction(action: StudyRoomAction): Promise<boolean> {
    if (left || !validateStudyRoomAction(action)) return false
    if (action.action === 'message') {
      if (sentKeys.current.has(action.idempotency_key)) return true
      sentKeys.current.add(action.idempotency_key)
      setRoom(current => ({ ...current, messages: [...current.messages, { id: crypto.randomUUID(), sender_alias: '반달곰 · 내 예시', message: action.message, created_at: new Date().toISOString(), is_me: true }] }))
      setNotice('내 화면에만 보이는 예시 메시지예요. 다른 사람에게 전송되지 않았어요.')
      return true
    }
    if (action.action === 'join') return false
    const session = room.sessions.find(item => item.session_number === action.session_number)
    if (!session) return false
    if (action.session_number !== room.current_session && action.action !== 'recap') return false
    if (action.action === 'propose_schedule' && (session.status !== 'planning' || session.my_attendance !== 'attending' || Date.parse(action.starts_at) <= Date.now() || session.proposals.length >= 8)) {
      setNotice('이번 회차 참여 후 앞으로 만날 약속을 제안해요. 후보는 최대 8개까지예요.')
      return false
    }
    if ((action.action === 'vote_schedule' || action.action === 'confirm_schedule') && (session.status !== 'planning' || session.my_attendance !== 'attending' || !session.proposals.some(item => item.id === action.proposal_id))) return false
    if (action.action === 'confirm_schedule' && !session.proposals.some(item => item.id === action.proposal_id && item.my_vote && !item.my_confirmation)) return false
    if (action.action === 'accept_schedule' && (session.status !== 'confirmed' || session.my_attendance !== 'attending')) return false
    if (action.action === 'complete_session' && (session.status !== 'confirmed' || !session.my_schedule_accepted || !session.starts_at || Date.parse(session.starts_at) > Date.now())) return false
    if (action.action === 'recap' && (session.my_attendance !== 'attending' || session.status === 'planning')) return false

    setRoom(current => ({ ...current, sessions: current.sessions.map(item => {
      if (item.session_number !== action.session_number) return item
      if (action.action === 'attendance') {
        const wasAttending = item.my_attendance === 'attending'
        return { ...item, my_attendance: action.attending ? 'attending' : 'skipping', attending_count: item.attending_count + Number(action.attending) - Number(wasAttending), my_schedule_accepted: action.attending && wasAttending ? item.my_schedule_accepted : false,
          proposals: item.status === 'planning' && !action.attending ? item.proposals.map(proposal => ({ ...proposal, votes: proposal.votes - Number(proposal.my_vote), confirmations: proposal.confirmations - Number(proposal.my_confirmation), my_vote: false, my_confirmation: false })) : item.proposals }
      }
      if (action.action === 'propose_schedule') return { ...item, proposals: [...item.proposals, { id: crypto.randomUUID(), starts_at: action.starts_at, place_name: action.place_name, place_note: action.place_note ?? '', is_sponsored: action.is_sponsored ?? false, proposer_alias: '반달곰 · 내 예시', votes: 0, confirmations: 0, my_vote: false, my_confirmation: false }] }
      if (action.action === 'vote_schedule') return { ...item, proposals: item.proposals.map(proposal => ({ ...proposal, votes: proposal.votes - Number(proposal.my_vote) + Number(proposal.id === action.proposal_id), confirmations: proposal.confirmations - Number(proposal.my_confirmation), my_vote: proposal.id === action.proposal_id, my_confirmation: false })) }
      if (action.action === 'confirm_schedule') return { ...item, proposals: item.proposals.map(proposal => proposal.id === action.proposal_id ? { ...proposal, confirmations: proposal.confirmations + 1, my_confirmation: true } : proposal) }
      if (action.action === 'accept_schedule') return { ...item, my_schedule_accepted: true }
      if (action.action === 'complete_session') return { ...item, completion_confirmed: true, completed_count: item.completed_count + Number(!item.completion_confirmed) }
      if (action.action === 'recap') return { ...item, recaps: [...item.recaps, { id: crypto.randomUUID(), author_alias: '반달곰 · 내 예시', text: action.text, created_at: new Date().toISOString() }] }
      return item
    }) }))
    setNotice(action.action === 'confirm_schedule' || action.action === 'complete_session'
      ? '내 확인만 반영한 예시예요. 다른 참여자의 확인을 자동으로 만들거나 약속을 확정하지 않아요.'
      : '예시 화면에만 반영했어요. 서버 저장과 실제 알림은 없어요.')
    return true
  }

  return <main className={s.page}><div className={s.container}>
    <Link className={s.back} href="/meetups/department/courses"><ArrowLeft size={17} />실제 과목 화면으로</Link>
    <section className={s.preview} aria-label="화면 검수 전용 안내">
      <strong>로컬 화면 검수 · 예시 인원 · 서버 저장 없음</strong>
      <p>실제 참여자나 실제 예약이 아니에요. 일반 앱에서는 연결되지 않는 개발 전용 화면이에요.</p>
      <div className={s.actions}><button type="button" className={confirmedExample ? s.secondary : s.primary} onClick={() => reset(false)}>약속 조율 예시</button><button type="button" className={confirmedExample ? s.primary : s.secondary} onClick={() => reset(true)}>확정 약속 예시</button></div>
      <p role="status" aria-live="polite">{notice}</p>
    </section>
    {left ? <section className={s.card}><h1>예시 모임에서 나왔어요</h1><p>실제 가입·탈퇴·신고는 처리하지 않았어요.</p><button className={s.primary} type="button" onClick={() => reset(false)}>예시 다시 시작</button></section> : <StudySessionPanel key={version} room={room} busy={false} onAction={onAction} onLeave={async reason => { setLeft(true); setNotice(reason ? '신고 내용을 서버나 다른 사람에게 보내거나 저장하지 않았어요. 예시 화면에서만 나왔어요.' : '예시 화면에서만 나왔어요. 실제 모임은 변경되지 않았어요.') }} onOlderMessages={async () => { setRoom(current => current.has_older_messages ? { ...current, has_older_messages: false, messages: [{ id: fixtureId(42), sender_alias: '별밤 · 예시', message: '이것은 합류 전에 나눈 대화 예시예요. 처음 만났을 때 각자 공부하고 싶은 단원을 이야기했어요.', created_at: new Date(Date.parse(now) - 15 * 86400000).toISOString(), is_me: false }, ...current.messages] } : current); setNotice('입장 전 대화를 보여주는 예시예요. 지난 회차의 내 참여 이력은 추가하지 않아요.') }} />}
  </div></main>
}
