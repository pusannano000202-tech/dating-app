'use client'

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import Image from 'next/image'
import { BookOpen, CalendarDays, ChevronDown, MapPin, MessageCircle, Send, UsersRound } from 'lucide-react'
import { getStudyCourse, getStudyCoursePhoto } from '@/lib/meetups/study-catalog'
import { getStudyGuide } from '@/lib/meetups/study-guide'
import { STUDY_VENUE_SOURCE, STUDY_VENUE_SUGGESTIONS } from '@/lib/meetups/study-venues'
import { clearAcknowledgedDraft, formatStudyTime } from '@/lib/meetups/study-room-client-state'
import SocialMessenger, {SocialChatComposer} from '@/components/chat/SocialMessenger'
import ActivityRoomPolls from '@/components/chat-polls/ActivityRoomPolls'
import {PendingChatSends} from '@/lib/chat/social-messenger-state'
import { useSocialChatRead } from '@/lib/chat/useSocialChatRead'
import type { StudyRoomAction, StudyRoomDetail } from '@/lib/meetups/study-room-contract'
import s from './study-room.module.css'

export function displayStudyTime(value: string): string {
  return formatStudyTime(value)
}

export default function StudySessionPanel({ room, busy, onAction, onLeave, onOlderMessages, chatOnly = false, readOnly = false, readTrackingEnabled = false, error, onRetry, notice, managementExtra }: {
  room: StudyRoomDetail; busy: boolean;
  chatOnly?: boolean; readOnly?: boolean; readTrackingEnabled?: boolean;
  error?:string; onRetry?:()=>void; notice?:ReactNode; managementExtra?:ReactNode;
  onAction: (action: StudyRoomAction) => Promise<boolean>;
  onLeave: (reason?: string) => Promise<void>;
  onOlderMessages: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(room.current_session)
  const [showGuide, setShowGuide] = useState(false)
  const [exit, setExit] = useState<'leave' | 'report' | null>(null)
  const [reason, setReason] = useState('')
  const [draft, setDraft] = useState('')
  const [pollRequest,setPollRequest]=useState(0)
  const pendingMessage = useRef(new PendingChatSends())
  const chatReadRoot = useRef<HTMLDivElement>(null)
  useSocialChatRead('study_room', room.id, room.messages, { root: chatReadRoot, enabled: readTrackingEnabled })
  const [recap, setRecap] = useState('')
  const [formError, setFormError] = useState('')
  const [placeDraft, setPlaceDraft] = useState('')
  const session = room.sessions.find(item => item.session_number === selected) ?? room.sessions[0]
  const current = session.session_number === room.current_session && room.status !== 'completed'
  const guide = getStudyGuide({ kind: getStudyCourse(room.course_id)?.guideKind ?? 'major-general', level: room.level, sessionNumber: session.session_number })
  const photo = getStudyCoursePhoto(room.course_name)
  const attending = session.my_attendance === 'attending'
  const canPlan = current && session.status === 'planning' && attending
  const pastRecaps = room.sessions.filter(item => item.session_number < room.current_session && item.recaps.length > 0)

  async function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const date = String(data.get('date') ?? '')
    const time = String(data.get('time') ?? '')
    const startsAt = new Date(`${date}T${time}:00+09:00`)
    if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) { setFormError('앞으로 만날 날짜와 시간을 골라 주세요.'); return }
    setFormError('')
    if (await onAction({ action: 'propose_schedule', session_number: selected, starts_at: startsAt.toISOString(), place_name: String(data.get('place') ?? '').trim(), place_note: String(data.get('note') ?? '').trim(), is_sponsored: data.get('sponsored') === 'on' })) { form.reset(); setPlaceDraft('') }
  }

  async function sendMessage() {
    if (!draft.trim() || busy || readOnly || error) return
    const text = draft.trim()
    const key=pendingMessage.current.key(text,()=>crypto.randomUUID())
    if (await onAction({ action: 'message', message: text, idempotency_key: key })) { setDraft(current => clearAcknowledgedDraft(current, text)); pendingMessage.current.acknowledge(text) }
  }

  const management=<div className={s.workspace}>
    {managementExtra}
    <header className={s.header}>
      <p className={s.eyebrow}>{room.course_name} · {room.room_number}번 방</p>
      <h1>{room.status === 'completed' ? '함께한 10회, 수고했어요' : `${room.current_session}회차를 준비하고 있어요`}</h1>
      <span className={s.badge}>권장 10회 · 회차마다 자유 참여</span>
      <Image className={s.hero} src={photo.src} width={900} height={600} sizes="(min-width: 760px) 650px, 94vw" alt={photo.description} priority />
      <p>{room.members.map(member => `${member.alias}${member.is_me ? ' (나)' : ''}`).join(' · ')}<br />{room.member_count}/5명 · 가입 정보 기준 같은 학과 모임</p>
    </header>

    <nav className={s.progress} aria-label="스터디 회차 살펴보기">
      {room.sessions.map(item => <button key={item.session_number} type="button" aria-pressed={selected === item.session_number} onClick={() => { setSelected(item.session_number); setShowGuide(false) }}>{item.session_number}회차{item.status === 'completed' ? ' ✓' : ''}</button>)}
    </nav>
    {!current ? <p className={s.note}>{selected < room.current_session ? '지난 회차 기록이에요. 중간에 들어온 사람의 참여 이력으로 추가되지 않아요.' : room.status === 'completed' ? '모임 기록과 대화는 여기서 이어 볼 수 있어요.' : '앞으로 함께할 안내를 미리 보는 중이에요. 참여·약속은 현재 회차에서 정해요.'}</p> : null}

    {current ? <section className={s.card} aria-label="이번 회차 참여 선택">
      <div className={s.row}><UsersRound size={23} color="#b64b3d" /><div className={s.grow}><h3>이번 회차 참여할까요?</h3><p>{session.my_attendance === 'skipping' ? '이번엔 쉬어요. 모임과 대화는 그대로예요.' : attending ? `${session.attending_count}명이 이번 회차에 참여해요.` : '부담 없이, 이번만 골라도 괜찮아요.'}</p></div></div>
      <div className={s.actions}>
        <button type="button" className={attending ? s.primary : s.secondary} aria-pressed={attending} disabled={busy} onClick={() => void onAction({ action: 'attendance', session_number: selected, attending: true })}>참여</button>
        <button type="button" className={session.my_attendance === 'skipping' ? s.primary : s.secondary} aria-pressed={session.my_attendance === 'skipping'} disabled={busy} onClick={() => void onAction({ action: 'attendance', session_number: selected, attending: false })}>이번엔 쉬기</button>
      </div>
    </section> : null}

    {session.status !== 'planning' && session.starts_at ? <section className={s.card} aria-label="확정 약속">
      <span className={s.badge}>{session.status === 'completed' ? '함께한 약속' : '확정된 약속'}</span>
      <h2 style={{ marginTop: 12 }}>{displayStudyTime(session.starts_at)}</h2>
      <p><MapPin size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> {session.place_name} {session.is_sponsored ? <span className={s.badge}>광고·제휴 제안</span> : null}</p>
      {session.place_note ? <p>{session.place_note}</p> : null}
      <p>약속 확정은 장소 예약 완료가 아니에요. 이용 가능 여부와 비용을 함께 확인해 주세요.</p>
      {current && attending && !session.my_schedule_accepted ? <button type="button" className={`${s.primary} ${s.wide}`} disabled={busy} onClick={() => void onAction({ action: 'accept_schedule', session_number: selected })}>이 시간·장소 확인했어요</button> : null}
      {current && attending && session.my_schedule_accepted ? <p className={s.status}>확정된 약속을 확인했어요.</p> : null}
    </section> : null}

    <details className={s.disclosure}>
      <summary><CalendarDays size={20} />날짜·장소 투표<ChevronDown size={17} /></summary>
      <div className={s.inside}>
        <p className={s.muted}>참여자가 직접 약속 후보를 올려요. 이번 회차에 참여한 사람들이 같은 후보를 고르고 모두 확인하면 확정돼요.</p>
        {session.proposals.length === 0 ? <p className={s.note}>아직 약속 후보가 없어요. 가능한 날짜와 장소를 함께 제안해 주세요.</p> : null}
        {session.proposals.map(proposal => <article key={proposal.id} className={`${s.proposal} ${proposal.my_vote ? s.selected : ''}`}>
          <strong>{displayStudyTime(proposal.starts_at)}</strong>
          <p>{proposal.place_name} {proposal.is_sponsored ? <span className={s.badge}>광고·제휴 제안</span> : null}</p>
          {proposal.place_note ? <p>{proposal.place_note}</p> : null}
          <p>{proposal.proposer_alias} 제안 · {proposal.votes}명 선택 · {proposal.confirmations}명 확인</p>
          {canPlan ? <div className={s.actions}>
            <button className={proposal.my_vote ? s.primary : s.secondary} type="button" disabled={busy} aria-pressed={proposal.my_vote} onClick={() => void onAction({ action: 'vote_schedule', session_number: selected, proposal_id: proposal.id })}>{proposal.my_vote ? '선택했어요' : '이 약속 선택'}</button>
            {proposal.my_vote ? <button className={s.secondary} type="button" disabled={busy || proposal.my_confirmation} onClick={() => void onAction({ action: 'confirm_schedule', session_number: selected, proposal_id: proposal.id })}>{proposal.my_confirmation ? '확인 완료' : '참석 가능 확인'}</button> : null}
          </div> : null}
        </article>)}
        {canPlan ? <details className={s.disclosure}><summary>내 약속 후보 올리기<ChevronDown size={16} /></summary><form className={s.inside} onSubmit={event => void propose(event)}><fieldset disabled={busy}>
          <label className={s.field}>날짜 (한국 시간)<input name="date" type="date" required /></label>
          <label className={s.field}>시간<input name="time" type="time" required /></label>
          <label className={s.field}>만날 장소<input name="place" required maxLength={120} value={placeDraft} onChange={event => setPlaceDraft(event.target.value)} placeholder="예: 교내 스터디룸 · 예약 여부도 확인해요" /></label>
          <details className={s.disclosure}><summary><MapPin size={17} />어디서 공부할지 고민된다면<ChevronDown size={16} /></summary><div className={s.inside}><p className={s.muted}>{STUDY_VENUE_SOURCE.note}</p>{STUDY_VENUE_SUGGESTIONS.map(venue => <button key={venue.id} className={`${s.secondary} ${s.wide}`} style={{ marginTop: 8 }} type="button" onClick={() => setPlaceDraft(venue.name)}>{venue.name}</button>)}<a className={s.quiet} href={STUDY_VENUE_SOURCE.url} target="_blank" rel="noopener noreferrer">도서관 공식 이용·예약 안내 열기</a></div></details>
          <label className={s.field}>위치·비용·예약 안내<textarea name="note" maxLength={500} placeholder="정확한 만날 지점, 예상 비용, 예약 필요 여부를 알려주세요." /></label>
          <label className={s.field}><input name="sponsored" type="checkbox" />광고·제휴 또는 대가를 받고 제안하는 장소예요</label>
          <p className={s.note}>교내 공간이나 부담 없는 장소도 함께 후보로 올려요. 지도에서 확인한 정확한 장소명과 만날 지점을 적어 주세요. 지도 링크를 직접 보내는 기능은 아직 연결되지 않았어요.</p>
          {formError ? <p role="alert" className={s.error}>{formError}</p> : null}
          <button className={`${s.primary} ${s.wide}`} type="submit" disabled={busy}>투표 후보 올리기</button>
        </fieldset></form></details> : session.status === 'planning' && current ? <p className={s.note}>‘참여’를 선택하면 약속 후보를 올리고 투표할 수 있어요.</p> : null}
      </div>
    </details>

    <details className={s.disclosure}>
      <summary><BookOpen size={20} />지난 회차 요약 보기<ChevronDown size={17} /></summary>
      <div className={s.inside}>{pastRecaps.length === 0 ? <p className={s.muted}>아직 남긴 요약이 없어요. 아래 채팅에서 이전 약속과 대화를 확인할 수 있어요.</p> : pastRecaps.map(item => <section className={s.guideStep} key={item.session_number}><h3>{item.session_number}회차 기록</h3>{item.recaps.map(note => <p key={note.id}><strong>{note.author_alias}</strong> · {note.text}</p>)}</section>)}<p className={s.note}>중간 합류라면 지난 기록을 보고, 현재 회차부터 편하게 참여해요.</p></div>
    </details>

    <button type="button" className={`${s.primary} ${s.wide}`} aria-expanded={showGuide} aria-controls="study-guide" onClick={() => setShowGuide(value => !value)}>{showGuide ? '활동 안내 접기' : `${selected}회차 준비하기`}</button>
    {showGuide && guide ? <section id="study-guide" className={s.card}>
      <span className={s.badge}>Quantum 진행 안내 · 약 {guide.estimatedMinutes}분</span><h2 style={{ marginTop: 13 }}>{guide.title}</h2><p>{guide.goal}</p>
      <div className={s.guideStep}><h3>만나기 전에 준비해요</h3><ul>{guide.preparation.map(text => <li key={text}>{text}</li>)}</ul></div>
      {guide.steps.map((step, index) => <div key={step.id} className={s.guideStep}><h3>{index + 1}. {step.title}<small>{step.minutes}분</small></h3><p>{step.body}</p></div>)}
      <div className={s.guideStep}><h3>대화가 막히면 이 질문부터</h3>{guide.prompts.map(text => <p key={text}>{text}</p>)}</div>
      <div className={s.guideStep}><h3>다음에는 이렇게 준비해요</h3><p>{guide.nextTask}</p></div><p className={s.note}>{guide.skillDisclaimer} 안내를 읽는 것만으로 참여나 회차 완료가 처리되지는 않아요.</p>
    </section> : null}

    {attending && (session.status === 'confirmed' || session.status === 'completed') ? <details className={s.disclosure}><summary><BookOpen size={20} />이번 회차 기록 남기기<ChevronDown size={17} /></summary><div className={s.inside}>
      <p className={s.muted}>{guide?.recap.join(' ')}</p>
      {session.recaps.map(note => <div className={s.proposal} key={note.id}><p><strong>{note.author_alias}</strong> · {note.text}</p></div>)}
      <form onSubmit={async event => { event.preventDefault(); const sent = recap.trim(); if (await onAction({ action: 'recap', session_number: selected, text: sent })) setRecap(current => clearAcknowledgedDraft(current, sent)) }}><label className={s.field}>같이 본 내용과 다음 준비<textarea value={recap} onChange={event => setRecap(event.target.value)} required maxLength={1500} /></label><button type="submit" className={s.secondary} disabled={busy || !recap.trim()}>요약 남기기</button></form>
      {current && session.status === 'confirmed' ? <><p className={s.note}>약속 시간이 지난 뒤 참여자들이 마무리를 확인하면 다음 회차로 넘어가요. 다음 회차 참여는 다시 선택해요.</p><button className={`${s.primary} ${s.wide}`} type="button" disabled={busy || session.completion_confirmed || !session.my_schedule_accepted || !session.starts_at || Date.parse(session.starts_at) > Date.now()} onClick={() => void onAction({ action: 'complete_session', session_number: selected })}>{session.completion_confirmed ? `마무리 확인했어요 · ${session.completed_count}/${session.attending_count}명` : '이번 회차 마무리 확인'}</button></> : null}
    </div></details> : null}


    <section className={s.exit}>
      <div className={s.exitButtons}><button type="button" onClick={() => setExit(exit === 'leave' ? null : 'leave')} aria-expanded={exit === 'leave'}>모임 나가기</button><button type="button" onClick={() => setExit(exit === 'report' ? null : 'report')} aria-expanded={exit === 'report'}>신고하고 나가기</button></div>
      {exit ? <div className={s.exitPanel}><h2>{exit === 'report' ? '운영자에게만 알려주세요' : '이 모임에서 나갈까요?'}</h2><p>나가면 이 방의 다음 회차와 채팅에 참여하지 않아요. 다른 사람의 약속과 기존 대화는 유지돼요. 한 회만 쉬고 싶다면 위의 ‘이번엔 쉬기’를 선택해 주세요.</p>
        {exit === 'report' ? <label className={s.field}>신고 내용<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} placeholder="문제가 된 별명·상황을 적어 주세요. 방 멤버와 업장에는 공개되지 않아요." /></label> : null}
        <div className={s.actions}><button className={s.secondary} type="button" disabled={busy} onClick={() => setExit(null)}>계속 함께하기</button><button className={s.primary} type="button" disabled={busy || (exit === 'report' && !reason.trim())} onClick={() => void onLeave(exit === 'report' ? reason.trim() : undefined)}>{exit === 'report' ? '신고하고 나가기' : '모임 나가기'}</button></div>
      </div> : null}
      <p className={s.note}>신고 내용과 신고한 사람은 다른 참여자에게 보이지 않아요. 신고 저장에 문제가 생겨도 나갈 수 있어요.</p>
    </section>
  </div>
  const conversation=<SocialMessenger scope={room.id} root={chatReadRoot}
    messages={room.messages.map(message=>({id:message.id,alias:message.sender_alias,text:message.message,createdAt:message.created_at,isMe:message.is_me}))}
    empty="이 방의 별명으로 먼저 인사해 볼까요?" readOnly={readOnly} management={chatOnly?management:undefined} error={error} onRetry={onRetry} notice={notice}
    tools={readTrackingEnabled?<ActivityRoomPolls roomKind="study-rooms" roomId={room.id} composerRequest={pollRequest} readOnly={readOnly||room.status==='completed'||!!error}/>:null}
    beforeMessages={room.has_older_messages?<button type="button" className={s.quiet} disabled={busy} onClick={()=>void onOlderMessages()}>이전 대화 더 보기</button>:null}
    composer={<SocialChatComposer value={draft} onChange={setDraft} onSend={()=>void sendMessage()} busy={busy} disabled={readOnly||!!error} onCreatePoll={readTrackingEnabled&&room.status!=='completed'?()=>setPollRequest(value=>value+1):undefined} label="메시지"/>}/>
  return chatOnly?conversation:<div className={s.workspace}>{management}<div style={{height:520}}>{conversation}</div></div>
}
