'use client'

import { ArrowLeft, CalendarDays, Loader2, MapPin, MessageCircle, RotateCw, ShieldCheck, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSocialChatRead } from '@/lib/chat/useSocialChatRead'
import { socialChatHref } from '@/lib/chat/social-room-presentation'

import PlaceLinks from '@/components/places/PlaceLinks'
import ActivityRoomPolls from '@/components/chat-polls/ActivityRoomPolls'
import ChatComposerActions from '@/components/chat-polls/ChatComposerActions'
import { getMeetupCategoryLabel } from '@/lib/community/catalog'
import type { MeetupCategory } from '@/lib/community/contracts'
import { MEETUP_GENDER_LABELS, type MeetupGenderMode } from '@/lib/community/meetup-gender'
import { projectLegacyMeetupPlace } from '@/lib/community/meetup-place'
import type { ActiveMeetupGuideSceneId, MeetupGuideActionKind } from '@/lib/meetups/guide-contract'
import LiveActivityGuide, { type LiveMeetupGuideDto } from './LiveActivityGuide'
import MeetupApplications from './MeetupApplications'

type MeetupDetail = {
  id: string
  category: MeetupCategory
  activity_key: string | null
  title: string
  description: string
  place_name: string | null
  scheduled_at: string | null
  schedule_status?: 'confirmed' | 'schedule_pending'
  ends_at: string | null
  capacity: number
  member_count: number
  status: 'open' | 'full' | 'completed' | 'cancelled'
  gender_mode: MeetupGenderMode
  scope_type: 'school' | 'department'
  department_label: string | null
  revision: number
  joined: boolean
  is_host: boolean
  scope_eligibility: string
  members: Array<{ alias: string; role: 'host' | 'member' }>
  events: Array<{ action: string; created_at: string; resulting_revision: number }>
}

type MeetupChat = {
  phase: 'send' | 'read_only' | 'hidden'
  messages: Array<{ id: string; sender_alias: string; message: string; created_at: string }>
}

export default function MeetupDetailExperience({ meetupId, chatOnly = false, readOnly = false }: { meetupId: string; chatOnly?: boolean; readOnly?: boolean }) {
  const router = useRouter()
  const mounted = useRef(true)
  const generation = useRef(0)
  const readController = useRef<AbortController | null>(null)
  const scheduleRevision = useRef<number | null>(null)
  const invalidateRead = useCallback(() => {++generation.current; readController.current?.abort()}, [])
  const [meetup, setMeetup] = useState<MeetupDetail | null>(null)
  const [chat, setChat] = useState<MeetupChat | null>(null)
  const [guide, setGuide] = useState<LiveMeetupGuideDto | null>(null)
  const [message, setMessage] = useState('')
  const [pollComposerRequest, setPollComposerRequest] = useState(0)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [scheduleStart, setScheduleStart] = useState('')
  const [scheduleEnd, setScheduleEnd] = useState('')
  const [schedulePlace, setSchedulePlace] = useState('')
  const chatReadRoot=useRef<HTMLDivElement>(null)
  useSocialChatRead('meetup',meetupId,chat?.messages??[],{root:chatReadRoot,enabled:chatOnly&&!!meetup?.joined&&!!chat})

  const load = useCallback(async (quiet = false) => {
    readController.current?.abort()
    const controller = new AbortController(), ticket = ++generation.current
    readController.current = controller
    const timeout = setTimeout(() => controller.abort(), 12000)
    if (!quiet) setLoading(true)
    try {
      const response = await fetch(`/api/meetups/${encodeURIComponent(meetupId)}`, { cache: 'no-store', signal: controller.signal })
      const payload = await response.json().catch(() => null) as { meetup?: MeetupDetail; error?: string } | null
      if (!mounted.current || ticket !== generation.current) return
      if (!response.ok || !payload?.meetup || payload.meetup.id !== meetupId) throw new Error(payload?.error ?? 'load_failed')
      const detail = payload.meetup
      setMeetup(detail)
      if (!quiet) {
        scheduleRevision.current = detail.revision
        setScheduleStart(toLocalInput(detail.scheduled_at))
        setScheduleEnd(detail.ends_at ? toLocalInput(detail.ends_at) : '')
        setSchedulePlace(detail.place_name ?? '')
      }
      if (!detail.joined) {
        setChat(null)
        setGuide(null)
        return
      }
      const [chatResponse, guideResponse] = await Promise.all([
        fetch(`/api/meetups/${encodeURIComponent(meetupId)}/chat`, { cache: 'no-store', signal: controller.signal }),
        fetch(`/api/meetups/${encodeURIComponent(meetupId)}/guide`, { cache: 'no-store', signal: controller.signal }),
      ])
      const chatPayload = await chatResponse.json().catch(() => null) as { chat?: MeetupChat } | null
      const guidePayload = await guideResponse.json().catch(() => null) as { guide?: LiveMeetupGuideDto } | null
      if (!mounted.current || ticket !== generation.current) return
      setChat(chatResponse.ok && chatPayload?.chat ? chatPayload.chat : null)
      setGuide(guideResponse.ok && guidePayload?.guide ? guidePayload.guide : null)
    } catch (error) {
      if (!mounted.current || ticket !== generation.current) return
      setMeetup(null); setChat(null); setGuide(null)
      setNotice(error instanceof Error && error.message === 'Unauthorized'
        ? '로그인한 뒤 모임을 확인해 주세요.'
        : '모임 상세를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.')
    } finally {
      clearTimeout(timeout)
      if (mounted.current && ticket === generation.current) { setLoading(false); readController.current = null }
    }
  }, [meetupId])

  useEffect(() => {
    mounted.current = true
    void load()
    const refresh = () => { if (document.visibilityState === 'visible' && !readController.current) void load(true) }
    const timer = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    return () => {mounted.current = false; invalidateRead(); window.clearInterval(timer); window.removeEventListener('focus', refresh)}
  }, [load, invalidateRead])

  const place = useMemo(() => meetup?.place_name ? projectLegacyMeetupPlace({ meetupId: meetup.id, placeName: meetup.place_name, category: meetup.category }) : null, [meetup])

  async function request(path: string, init: RequestInit) {
    if (busy) return false
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(path, init)
      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!mounted.current) return false
      if (!response.ok) throw new Error(payload?.error ?? 'request_failed')
      await load()
      return true
    } catch (error) {
      if (!mounted.current) return false
      setNotice(toActionError(error))
      await load()
      return false
    } finally {
      setBusy(false)
    }
  }

  async function toggleMembership() {
    if (!meetup?.joined) return
    if (!window.confirm('개인 나가기를 하면 새 채팅을 보낼 수 없어요. 모임 전체는 취소되지 않습니다.')) return
    if (await request(`/api/meetups/${encodeURIComponent(meetup.id)}/join`, { method: 'DELETE' })) {
      if (chatOnly) router.replace('/chat')
    }
  }

  async function updateSchedule() {
    if (!meetup || !scheduleStart || !scheduleEnd || !schedulePlace.trim()) return
    await request(`/api/meetups/${encodeURIComponent(meetup.id)}/schedule`, jsonPost({
      scheduled_at: new Date(scheduleStart).toISOString(),
      ends_at: new Date(scheduleEnd).toISOString(),
      place_name: schedulePlace,
      expected_revision: scheduleRevision.current ?? meetup.revision,
      idempotency_key: crypto.randomUUID(),
    }))
  }

  async function cancelMeetup() {
    if (!meetup) return
    const reason = window.prompt('모임 전체 취소 이유를 참가자에게 알려주세요.')?.trim()
    if (!reason || !window.confirm('모임 전체를 취소할까요? 참가자들의 개인 나가기와 다른 동작입니다.')) return
    await request(`/api/meetups/${encodeURIComponent(meetup.id)}/cancel`, jsonPost({ reason, expected_revision: meetup.revision, idempotency_key: crypto.randomUUID() }))
  }

  async function completeMeetup() {
    if (!meetup || !window.confirm('모임 전체를 종료할까요? 참가자들의 개인 확인 상태는 그대로 보존됩니다.')) return
    await request(`/api/meetups/${encodeURIComponent(meetup.id)}/complete`, jsonPost({ expected_revision: meetup.revision, idempotency_key: crypto.randomUUID() }))
  }

  async function sendMessage() {
    if (!meetup || !message.trim() || readOnly) return
    const sent = await request(`/api/meetups/${encodeURIComponent(meetup.id)}/chat`, jsonPost({ message: message.trim(), idempotency_key: crypto.randomUUID() }))
    if (sent) setMessage('')
  }

  async function guideAction(action: MeetupGuideActionKind | 'advance_shared', sceneId: ActiveMeetupGuideSceneId) {
    if (!meetup || !guide) return
    if (action === 'open_chat') {
      if (!chatOnly) { router.push((socialChatHref({kind: 'meetup', id: meetup.id}) ?? '/chat')); return }
      document.getElementById('meetup-chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (action === 'open_map') {
      document.getElementById('meetup-place')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (action === 'acknowledge' || action === 'open_activity' || action === 'advance_shared') {
      await request(`/api/meetups/${encodeURIComponent(meetup.id)}/guide`, jsonPost({
        action: action === 'advance_shared' ? 'advance_shared' : 'acknowledge',
        scene_id: sceneId,
        expected_revision: action === 'advance_shared' ? meetup.revision : guide.personal_revision,
        idempotency_key: crypto.randomUUID(),
      }))
      return
    }
    await request(`/api/meetups/${encodeURIComponent(meetup.id)}/help`, jsonPost({ action, note: '', idempotency_key: crypto.randomUUID() }))
  }

  if (loading && !meetup) return <main className="min-h-screen bg-boot-canvas p-8 text-center"><Loader2 className="mx-auto animate-spin text-boot-primary" /><p className="mt-3 text-sm font-bold text-boot-muted">모임을 불러오는 중이에요.</p></main>
  if (!meetup) return <main className="min-h-screen bg-boot-canvas px-4 py-8"><div className="mx-auto max-w-xl rounded-[12px] border border-boot-hairline bg-white p-6 text-center"><p className="font-black">{notice || '모임을 찾지 못했어요.'}</p><button type="button" onClick={() => void load()} className="mt-4 min-h-11 rounded-[8px] bg-boot-primary px-4 text-sm font-black text-white"><RotateCw className="mr-1 inline" size={16} />다시 확인</button></div></main>

  const active = meetup.status === 'open' || meetup.status === 'full'
  const conversation = meetup.joined ? <section id="meetup-chat" className="scroll-mt-4 rounded-[12px] border border-boot-hairline bg-white p-5"><div className="flex items-center gap-2"><MessageCircle size={18} className="text-boot-primary" /><h2 className="font-black">참가자 대화</h2></div><p className="mt-1 text-xs font-bold leading-5 text-boot-muted">참가 중에는 별칭으로 대화하고, 나가기·취소·종료 뒤에는 새 메시지를 보낼 수 없어요. 연락처 공유는 차단돼요.</p><div ref={chatReadRoot} className="mt-4 max-h-72 space-y-2 overflow-y-auto">{chat?.messages.length ? chat.messages.map((item) => <p key={item.id} data-social-message-id={item.id} className="rounded-[8px] bg-boot-soft px-3 py-2 text-sm"><b className="mr-2 text-boot-primary">{item.sender_alias}</b>{item.message}</p>) : <p className="text-sm font-bold text-boot-muted">아직 메시지가 없어요.</p>}</div>{active && !readOnly ? <ActivityRoomPolls roomId={meetup.id} roomKind="meetups" composerRequest={pollComposerRequest} /> : null}{chat?.phase === 'send' && !readOnly ? <div className="mt-4 flex items-end gap-2"><ChatComposerActions onCreatePoll={() => setPollComposerRequest(value => value + 1)} disabled={busy} /><input aria-label="참가자 대화 메시지" maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} className={`${inputClass} min-w-0 flex-1`} /><button type="button" disabled={busy || !message.trim()} onClick={() => void sendMessage()} className={`${primaryButton} px-4`}>전송</button></div> : <p className="mt-3 text-xs font-black text-boot-muted">현재 대화는 읽기 전용이에요.</p>}</section> : null
  const Container = chatOnly ? 'section' : 'main'
  const Activities = chatOnly ? 'details' : 'div'
  return (
    <Container className={chatOnly ? 'text-boot-ink' : 'min-h-screen bg-boot-canvas px-4 pb-28 pt-5 text-boot-ink'}>
      <div className="mx-auto w-full max-w-3xl space-y-5">
        {chatOnly && meetup.joined ? <MeetupApplications meetupId={meetupId} noticesOnly/> : null}
        {chatOnly ? conversation : <Link href="/meetups" className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-boot-primary"><ArrowLeft size={17} />모임 목록</Link>}
        {meetup.is_host && !chatOnly ? <Link href={`/meetups/${meetup.id}/applications`} className="flex min-h-12 items-center justify-between rounded-2xl border border-[#dbe3d4] bg-[#eff3e8] px-5 py-4 font-bold text-[#3d5e43]"><span>함께할 사람 · 참가 신청 확인</span><UsersRound size={20}/></Link> : null}
        <Activities className="space-y-5">
        {chatOnly ? <summary className="cursor-pointer rounded-[8px] border border-boot-hairline bg-white p-4 font-black">모임·일정·참가자 관리</summary> : null}
        <section className="rounded-[12px] border border-boot-hairline bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-boot-primary">{getMeetupCategoryLabel(meetup.category)} · {meetup.scope_type === 'department' ? `${meetup.department_label ?? '학과'} 전용` : '학교 전체'}</p><h1 className="mt-1 text-2xl font-black">{meetup.title}</h1></div><span className="rounded-[6px] bg-boot-soft px-2 py-1 text-xs font-black text-boot-primary">{statusLabel(meetup.status)}</span></div>
          {meetup.description ? <p className="mt-3 text-sm font-bold leading-6 text-boot-muted">{meetup.description}</p> : null}
          <dl className="mt-4 grid gap-2 text-sm font-bold text-boot-muted sm:grid-cols-3">
            <div className="flex gap-2"><CalendarDays size={17} /><span>{formatDate(meetup.scheduled_at)}{meetup.ends_at ? ` ~ ${formatTime(meetup.ends_at)}` : ''}</span></div>
            <div id="meetup-place" className="flex gap-2"><MapPin size={17} /><span>{meetup.place_name??'채팅에서 함께 정하기'}</span></div>
            <div className="flex gap-2"><UsersRound size={17} /><span>{meetup.member_count}/{meetup.capacity}명</span></div>
          </dl>
          <p className="mt-3 text-xs font-bold text-boot-muted">참여 조건 · {MEETUP_GENDER_LABELS[meetup.gender_mode]}</p>
          {place ? <PlaceLinks place={place} className="mt-3" /> : null}
          {meetup.joined && !chatOnly ? <Link className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-[8px] bg-boot-primary px-4 text-sm font-black text-white" href={(socialChatHref({kind: 'meetup', id: meetup.id}) ?? '/chat')}><MessageCircle size={18}/>참가자 채팅으로</Link> : null}
          {active && !meetup.is_host && meetup.joined ? <button type="button" disabled={busy} onClick={() => void toggleMembership()} className="mt-4 min-h-12 w-full rounded-[8px] border border-boot-hairline px-4 text-sm font-black disabled:opacity-45">개인 나가기</button> : null}
          {active && !meetup.is_host && !meetup.joined ? meetup.status === 'full' ? <p className="mt-4 rounded-xl bg-boot-soft p-4 text-center text-sm font-bold">지금은 정원이 찼어요.</p> : <div className="mt-4 rounded-2xl bg-boot-soft p-4"><p className="mb-3 flex items-center gap-2 text-sm font-bold text-boot-muted"><ShieldCheck size={18} />참가 신청에는 보증금 확인이 필요해요.</p><Link href={`/meetups/${encodeURIComponent(meetup.id)}/apply`} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-boot-primary px-4 text-sm font-black text-white">보증금 확인하고 참가 신청</Link><p className="mt-2 text-xs leading-5 text-boot-muted">금액과 반환 조건을 확인하고 신청해요. 개설자 수락 후 채팅에 참여해요.</p></div> : null}
        </section>

        {meetup.is_host && active ? <section className="rounded-[12px] border border-boot-hairline bg-white p-5"><h2 className="font-black">주최자 일정 관리</h2><p className="mt-1 text-xs font-bold text-boot-muted">일정 변경은 참가자 상세의 변경 기록에 남고 최신 revision으로만 저장돼요.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><input aria-label="새 시작 시간" type="datetime-local" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} className={inputClass} /><input aria-label="새 종료 시간" type="datetime-local" value={scheduleEnd} onChange={(event) => setScheduleEnd(event.target.value)} className={inputClass} /><input aria-label="새 장소" value={schedulePlace} onChange={(event) => setSchedulePlace(event.target.value)} className={`${inputClass} sm:col-span-2`} /></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><button type="button" disabled={busy} onClick={() => void updateSchedule()} className={primaryButton}>{meetup.schedule_status==='schedule_pending'?'함께 정한 일정 확정':'일정 변경 저장'}</button><button type="button" disabled={busy||meetup.schedule_status==='schedule_pending'} onClick={() => void completeMeetup()} className={secondaryButton}>모임 전체 종료</button><button type="button" disabled={busy} onClick={() => void cancelMeetup()} className="min-h-11 rounded-[8px] border border-boot-coral/30 bg-white px-3 text-sm font-black text-boot-coral">모임 전체 취소</button></div></section> : null}

        {meetup.joined && guide ? <LiveActivityGuide guide={guide} busy={busy} onAction={(action, sceneId) => { void guideAction(action, sceneId) }} /> : null}


        {meetup.joined ? <section className="rounded-[12px] border border-boot-hairline bg-white p-5"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-[#147A70]" /><h2 className="font-black">참가자</h2></div><p className="mt-1 text-xs font-bold text-boot-muted">이 방 안에서 필요한 최소 별칭만 보여요. 참여만으로 친구 관계가 생기지 않아요.</p><ul className="mt-3 flex flex-wrap gap-2">{meetup.members.map((member) => <li key={`${member.role}-${member.alias}`} className="rounded-full bg-boot-soft px-3 py-2 text-xs font-black text-boot-primary">{member.alias}{member.role === 'host' ? ' · 주최자' : ''}</li>)}</ul></section> : null}

        </Activities>
        {notice ? <p role="status" className="rounded-[8px] bg-white px-4 py-3 text-sm font-black text-boot-coral">{notice}</p> : null}
      </div>
    </Container>
  )
}

const inputClass = 'min-h-11 rounded-[8px] border border-boot-hairline bg-white px-3 text-sm font-bold outline-none focus:border-boot-primary'
const primaryButton = 'min-h-11 rounded-[8px] bg-boot-primary px-3 text-sm font-black text-white disabled:opacity-45'
const secondaryButton = 'min-h-11 rounded-[8px] border border-boot-primary/25 bg-white px-3 text-sm font-black text-boot-primary disabled:opacity-45'

function jsonPost(body: Record<string, unknown>): RequestInit { return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } }
function toLocalInput(value: string | null) { if(!value)return ''; const date = new Date(value); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16) }
function formatDate(value: string | null) { if(!value)return '채팅에서 함께 정하기'; return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatTime(value: string) { return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function statusLabel(status: MeetupDetail['status']) { return ({ open: '모집중', full: '마감', completed: '종료', cancelled: '취소' } as const)[status] }
function toActionError(error: unknown) { const message = error instanceof Error ? error.message : ''; if (message === 'stale_revision') return '다른 변경이 먼저 저장됐어요. 최신 상태를 다시 불러왔습니다.'; if (message.includes('department')) return '현재 학과 정보로는 이 모임에 참여할 수 없어요.'; if (message.includes('full')) return '방금 정원이 마감됐어요.'; return '요청을 저장하지 못했어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.' }
