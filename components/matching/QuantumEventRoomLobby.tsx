'use client'

import { CalendarDays, Clock3, Copy, Headphones, Loader2, MapPin, RefreshCw, Send, Share2, ShieldCheck, Sparkles, UserRound, UserRoundCheck, UsersRound, X } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getQuantumEventById, quantumEventPhotos, type QuantumEventMode } from '@/lib/matching/quantum-event-catalog'
import { QUANTUM_DEBATE_QUESTION_DEFINITIONS } from '@/lib/matching/quantum-profile-preferences'
import {
  isCreatedQuantumEventRoomInvite,
  parseQuantumEventRoomInviteCandidates,
  parseQuantumEventRoomInvites,
  parseQuantumEventRoomParticipants,
  parseQuantumEventRooms,
  type CreatedQuantumEventRoomInvite,
  type QuantumEventRoom,
  type QuantumEventRoomInvite,
  type QuantumEventRoomInviteCandidate,
  type QuantumEventRoomParticipant,
} from '@/lib/matching/quantum-event-rooms'

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error'

export default function QuantumEventRoomLobby({
  eventId,
  eventMode,
  roomLabel,
  roomCode,
  myPartySize = 1,
  preview = false,
  initialCardOpen = false,
}: {
  eventId: string
  eventMode: QuantumEventMode
  roomLabel: string
  roomCode: string
  myPartySize?: number
  preview?: boolean
  initialCardOpen?: boolean
}) {
  const [state, setState] = useState<LoadState>('loading')
  const [rooms, setRooms] = useState<QuantumEventRoom[]>([])
  const [candidates, setCandidates] = useState<QuantumEventRoomInviteCandidate[]>([])
  const [invites, setInvites] = useState<QuantumEventRoomInvite[]>([])
  const [selectedFriendId, setSelectedFriendId] = useState('')
  const [createdInvite, setCreatedInvite] = useState<CreatedQuantumEventRoomInvite | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectedSeat, setSelectedSeat] = useState<AnonymousSeatModel | null>(null)
  const [participants, setParticipants] = useState<QuantumEventRoomParticipant[]>([])
  const initialCardOpenedRef = useRef(false)

  const loadLobby = useCallback(async (signal?: AbortSignal) => {
    if (preview) {
      setRooms(PREVIEW_ROOMS)
      setCandidates(PREVIEW_CANDIDATES)
      setInvites([])
      setParticipants(PREVIEW_PARTICIPANTS)
      setSelectedFriendId(PREVIEW_CANDIDATES[0]?.user_id ?? '')
      if (initialCardOpen && !initialCardOpenedRef.current) {
        const participant = PREVIEW_PARTICIPANTS[0]
        initialCardOpenedRef.current = true
        setSelectedSeat({
          id: 'participant-1',
          kind: 'participant',
          label: participant.alias,
          detail: '카드 보기',
          gender: participant.gender === 'male' ? '남성' : '여성',
          card: toSafeParticipantCard(participant),
        })
      }
      setState('ready')
      return
    }

    try {
      const [roomsResponse, invitesResponse, participantsResponse] = await Promise.all([
        fetch(`/api/match/events/rooms?event_id=${encodeURIComponent(eventId)}&event_mode=${eventMode}`, {
          cache: 'no-store',
          signal,
        }),
        fetch('/api/match/event-room-invites', { cache: 'no-store', signal }),
        fetch('/api/match/event-room-participants', { cache: 'no-store', signal }),
      ])
      if (
        roomsResponse.status === 503
        || invitesResponse.status === 503
        || participantsResponse.status === 503
      ) {
        setState('unavailable')
        return
      }
      if (!roomsResponse.ok || !invitesResponse.ok || !participantsResponse.ok) {
        throw new Error('room_lobby_lookup_failed')
      }

      const roomsPayload = await roomsResponse.json() as { rooms?: unknown }
      const invitesPayload = await invitesResponse.json() as {
        candidates?: unknown
        invites?: unknown
      }
      const participantsPayload = await participantsResponse.json() as { participants?: unknown }
      const parsedRooms = parseQuantumEventRooms(roomsPayload.rooms)
      const parsedCandidates = parseQuantumEventRoomInviteCandidates(invitesPayload.candidates)
      const parsedInvites = parseQuantumEventRoomInvites(invitesPayload.invites)
      const parsedParticipants = parseQuantumEventRoomParticipants(participantsPayload.participants)
      if (!parsedRooms || !parsedCandidates || !parsedInvites) throw new Error('room_lobby_response_invalid')

      setRooms(parsedRooms)
      setCandidates(parsedCandidates)
      setInvites(parsedInvites)
      setParticipants(parsedParticipants ?? [])
      setSelectedFriendId((current) => (
        parsedCandidates.some((candidate) => candidate.user_id === current)
          ? current
          : parsedCandidates[0]?.user_id ?? ''
      ))
      setState('ready')
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return
      setState('error')
    }
  }, [eventId, eventMode, initialCardOpen, preview])

  useEffect(() => {
    const controller = new AbortController()
    void loadLobby(controller.signal)
    const timer = window.setInterval(() => void loadLobby(), 5_000)
    const refreshOnFocus = () => void loadLobby()
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [loadLobby])

  const myRoom = useMemo(
    () => rooms.find((room) => room.is_my_room) ?? null,
    [rooms],
  )
  const currentRoomInvites = useMemo(() => invites.filter((invite) => (
    invite.event_id === eventId
    && invite.event_mode === eventMode
    && (!myRoom || invite.room_number === myRoom.room_number)
  )), [eventId, eventMode, invites, myRoom])
  const activeInvitation = useMemo(
    () => currentRoomInvites.find((invite) => invite.role === 'inviter' && invite.status === 'pending') ?? null,
    [currentRoomInvites],
  )
  const myAcceptedFriendCount = useMemo(() => new Set(
    currentRoomInvites
      .filter((invite) => invite.status === 'accepted')
      .map((invite) => invite.counterpart_user_id),
  ).size, [currentRoomInvites])
  const myReservedFriendCount = useMemo(() => new Set(
    currentRoomInvites
      .filter((invite) => invite.role === 'inviter' && invite.status === 'pending')
      .map((invite) => invite.counterpart_user_id),
  ).size, [currentRoomInvites])
  const pendingCreatedInvite = createdInvite && currentRoomInvites.some((invite) => (
    invite.token === createdInvite.token && invite.status === 'pending'
  )) ? createdInvite : null
  const event = getQuantumEventById(eventId)
  const eventPhoto = event ? quantumEventPhotos[event.kind] : null
  const anonymousSeats = myRoom
    ? buildAnonymousSeats(
      myRoom,
      Math.max(0, myPartySize - 1, myAcceptedFriendCount),
      myReservedFriendCount,
      preview,
      participants,
    )
    : []
  const remainingSeats = myRoom
    ? Math.max(0, myRoom.required_total - myRoom.total - myRoom.reserved_total)
    : 0
  const closeSelectedSeat = useCallback(() => setSelectedSeat(null), [])

  useEffect(() => {
    if (!createdInvite) return
    const latest = currentRoomInvites.find((invite) => invite.token === createdInvite.token)
    if (latest?.status !== 'accepted') return
    setCreatedInvite(null)
    setNotice(`${latest.counterpart_display_name} 친구가 같은 팀에 합류했어요.`)
  }, [createdInvite, currentRoomInvites])

  async function inviteFriend() {
    if (!selectedFriendId || busy) return
    setBusy(true)
    setNotice('')
    if (preview) {
      const candidate = candidates.find((item) => item.user_id === selectedFriendId)
      setNotice(`${candidate?.display_name ?? '친구'}의 자리를 A방에 15분 동안 예약했어요. 이 화면은 저장되지 않는 미리보기예요.`)
      setBusy(false)
      return
    }

    try {
      const response = await fetch('/api/match/event-room-invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': createIdempotencyKey(selectedFriendId),
        },
        body: JSON.stringify({ invited_user_id: selectedFriendId }),
      })
      const payload = await response.json().catch(() => ({})) as {
        invite?: unknown
        error?: string
      }
      if (!response.ok || !isCreatedQuantumEventRoomInvite(payload.invite)) {
        setNotice(mapInviteError(payload.error))
        return
      }
      setCreatedInvite(payload.invite)
      setNotice(`${payload.invite.room_label}에 친구 자리 1개를 15분 동안 예약했어요.`)
      await loadLobby()
    } catch {
      setNotice('친구 초대를 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function shareInvite() {
    const token = pendingCreatedInvite?.token ?? activeInvitation?.token
    if (!token) return
    const inviteUrl = `${window.location.origin}/match/invite/${token}`
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Quantum ${roomLabel} 초대`,
          text: `${roomLabel}에 같이 참여해요. 자리는 15분 동안 예약돼요.`,
          url: inviteUrl,
        })
      } else {
        await navigator.clipboard.writeText(inviteUrl)
        setNotice('초대 링크를 복사했어요.')
      }
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') {
        setNotice('초대 링크를 공유하지 못했어요.')
      }
    }
  }

  if (state === 'loading') {
    return <LobbyStatus icon={Loader2} message="방 인원을 확인하고 있어요." spin />
  }
  if (state === 'unavailable') {
    return <LobbyStatus icon={Clock3} message="방 자동편성 DB를 적용한 뒤 A방 현황이 열려요." />
  }
  if (state === 'error') {
    return (
      <div className="border-y border-boot-hairline py-5">
        <p className="text-sm font-bold text-boot-muted">방 현황을 불러오지 못했어요.</p>
        <button type="button" onClick={() => void loadLobby()} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-black text-boot-primary">
          <RefreshCw size={16} aria-hidden="true" /> 다시 확인
        </button>
      </div>
    )
  }

  return (
    <>
    <div className="mt-6 overflow-hidden rounded-lg border border-[#E7CFC9] bg-[#FFFDFB] text-boot-ink shadow-[0_18px_48px_rgba(93,57,48,0.12)]">
      {eventPhoto ? (
        <header className="relative aspect-[16/9] min-h-52 overflow-hidden">
          <Image src={eventPhoto.src} alt={eventPhoto.alt} fill sizes="(max-width: 768px) 100vw, 720px" className="object-cover" priority />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,21,20,0.05)_20%,rgba(5,21,20,0.86)_100%)]" />
          <span className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur-sm">활동 예시 · 실제 참가자 사진 아님</span>
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5 text-white">
            {preview ? <p className="mb-2 text-[10px] font-black text-[#ffd27a]">디자인 미리보기 · 저장되지 않음</p> : null}
            <p className="text-[11px] font-black text-[#FFD0C7]">내가 참여 중인 활동</p>
            <h2 className="mt-1 text-2xl font-black">{event?.title ?? 'Quantum 활동'}</h2>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-white/90">
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true" />{event?.schedule ?? '시간 확인 중'}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" />{event?.location ?? '장소 확인 중'}</span>
            </div>
          </div>
        </header>
      ) : null}

      <div className="px-4 py-5 sm:px-5">
        <section aria-labelledby="my-room-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-black text-boot-coral">내 편성 상태</p>
              <h3 id="my-room-title" className="mt-1 text-xl font-black">{myRoom?.room_number ?? 1}팀 · 멤버 모집 중</h3>
              <p className="mt-1 text-xs font-bold text-boot-muted">방 번호 {myRoom?.room_code ?? roomCode}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-black text-[#d88918]">{(myRoom?.total ?? 0) + (myRoom?.reserved_total ?? 0)}/{myRoom?.required_total ?? 5}</p>
              <p className="text-[11px] font-black text-boot-muted">{remainingSeats > 0 ? `${remainingSeats}자리 남음` : '편성 인원 완료'}</p>
            </div>
          </div>

          <p className="mt-4 text-sm font-black text-[#7A4C43]">
            현재 {myRoom?.total ?? 0}명 · 남 {myRoom?.male ?? 0} · 여 {myRoom?.female ?? 0}
            {myReservedFriendCount > 0 ? ` · 내 친구 자리 ${myReservedFriendCount}개 예약` : ''}
          </p>

          <p className="mt-3 text-xs font-bold leading-5 text-boot-muted">
            참가자를 누르면 얼굴 대신 사전 카드를 볼 수 있어요
          </p>

          <div className="mt-3 grid grid-cols-5 gap-2" aria-label="내 방 익명 좌석 5개">
            {anonymousSeats.map((seat) => (
              <AnonymousSeat
                key={seat.id}
                {...seat}
                onSelect={seat.kind === 'participant' ? () => setSelectedSeat(seat) : undefined}
              />
            ))}
          </div>

          <div className="mt-4 flex items-start gap-2 border-l-2 border-boot-coral bg-[#FFF7F3] px-3 py-3">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-boot-coral" aria-hidden="true" />
            <p className="text-xs font-bold leading-5 text-[#7A5C55]">상대 참가자의 이름과 사진은 아직 공개하지 않아요. 프로필은 만남 종료 후 친구 연결이 완료되면 열려요.</p>
          </div>
        </section>

        <section className="mt-6 border-t border-boot-hairline pt-5" aria-labelledby="other-rooms-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black text-boot-coral">다른 팀 현황</p>
              <h3 id="other-rooms-title" className="mt-1 text-base font-black">같은 활동의 모집 상황</h3>
            </div>
            <p className="text-[11px] font-bold text-boot-muted">프로필 비공개</p>
          </div>
          <div className="mt-3 border-y border-boot-hairline bg-white sm:grid sm:grid-cols-2" aria-label="다른 팀의 익명 인원 현황">
            {rooms.filter((room) => !room.is_my_room).map((room) => (
              <div key={room.occurrence_id} className="flex min-h-16 items-center justify-between gap-3 border-b border-boot-hairline px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                <div>
                  <p className="text-sm font-black">{room.room_number}팀</p>
                  <p className="mt-1 text-[11px] font-bold text-boot-muted">남 {room.male} · 여 {room.female}</p>
                </div>
                <p className="text-lg font-black text-boot-coral">{room.total + room.reserved_total}/{room.required_total}명</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 border-t border-boot-hairline pt-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF0ED] text-boot-coral">
              <UsersRound size={19} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-base font-black">내 팀에 친구 초대</h3>
              <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">친구 관리에서 이미 연결된 같은 성별 친구만 보여요. 자리는 15분 동안 예약됩니다.</p>
            </div>
          </div>

          {candidates.length > 0 ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="sr-only" htmlFor="room-friend">초대할 친구</label>
              <select
                id="room-friend"
                value={selectedFriendId}
                onChange={(event) => setSelectedFriendId(event.target.value)}
                className="min-h-12 w-full rounded-md border border-[#E7CFC9] bg-white px-3 text-sm font-black text-boot-ink outline-none focus:border-boot-coral"
              >
                {candidates.map((candidate) => (
                  <option key={candidate.user_id} value={candidate.user_id}>{candidate.display_name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !selectedFriendId}
                onClick={() => void inviteFriend()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-boot-coral px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
                친구 초대
              </button>
            </div>
          ) : (
            <p className="mt-4 border-l-2 border-[#D9A69B] bg-[#FFF7F3] px-4 py-3 text-xs font-bold leading-5 text-boot-muted">
              지금 초대할 수 있는 같은 성별 친구가 없어요. 이미 다른 방을 찾는 친구는 제외돼요.
            </p>
          )}

          {pendingCreatedInvite || activeInvitation ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void shareInvite()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#D9A69B] bg-[#FFF7F3] px-4 text-sm font-black text-[#A85F50]"
              >
                {navigatorShareAvailable() ? <Share2 size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                초대 링크 보내기
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancelInvite(pendingCreatedInvite?.token ?? activeInvitation?.token ?? '')}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[#D8C7C2] bg-white px-4 text-sm font-black text-boot-muted disabled:opacity-50"
              >
                친구 자리 취소
              </button>
            </div>
          ) : null}
          {notice ? <p className="mt-3 text-xs font-black leading-5 text-boot-coral" role="status">{notice}</p> : null}
        </div>
      </div>
    </div>
    {selectedSeat ? (
      <ParticipantCardDialog seat={selectedSeat} preview={preview} onClose={closeSelectedSeat} />
    ) : null}
    </>
  )

  async function cancelInvite(token: string) {
    if (!token || busy) return
    setBusy(true)
    setNotice('친구 자리 예약을 취소하고 있어요...')
    try {
      const response = await fetch('/api/match/event-room-invites/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setNotice(payload.error === 'event_state_locked'
          ? '이미 수락된 초대는 여기서 취소할 수 없어요.'
          : '친구 자리 예약을 취소하지 못했어요.')
        return
      }
      setCreatedInvite(null)
      setNotice('친구 자리 예약을 취소했어요.')
      await loadLobby()
    } catch {
      setNotice('친구 자리 예약을 취소하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }
}

type SafeParticipantCard = {
  intro: string | null
  mbti: string | null
  conversationEnergy: string | null
  planStyle: string | null
  interests: string[]
  music: string | null
  debateAnswers: Array<{ question: string; choice: string }>
  meetingMoment: {
    mood: string
    expectation: string
    activityChoice: string
  } | null
}

type SeatGender = '남성' | '여성' | '성별 확인 중'

type AnonymousSeatModel = {
  id: string
  kind: 'me' | 'friend' | 'participant' | 'empty'
  label: string
  detail: string
  gender: SeatGender | null
  card: SafeParticipantCard | null
}

function buildAnonymousSeats(
  room: QuantumEventRoom,
  myAcceptedFriendCount: number,
  myReservedFriendCount: number,
  preview: boolean,
  participants: QuantumEventRoomParticipant[],
): AnonymousSeatModel[] {
  const confirmedFriendCount = Math.min(room.required_total - 1, Math.max(0, myAcceptedFriendCount))
  const reservedFriendCount = Math.min(
    room.required_total - 1 - confirmedFriendCount,
    Math.max(0, myReservedFriendCount),
  )
  const friendCount = confirmedFriendCount + reservedFriendCount
  const participantCount = Math.max(0, room.total - 1 - confirmedFriendCount)
  const seats: AnonymousSeatModel[] = [{
    id: 'me',
    kind: 'me',
    label: '나',
    detail: '참여 완료',
    gender: null,
    card: null,
  }]

  for (let index = 0; index < friendCount; index += 1) {
    const isReserved = index >= confirmedFriendCount
    seats.push({
      id: `friend-${index + 1}`,
      kind: 'friend',
      label: '내 친구',
      detail: isReserved ? '초대 대기' : '참여 완료',
      gender: null,
      card: null,
    })
  }
  for (let index = 0; index < participantCount; index += 1) {
    const participant = participants[index]
    seats.push({
      id: `participant-${index + 1}`,
      kind: 'participant',
      label: participant?.alias ?? `참여자 ${index + 1}`,
      detail: '카드 보기',
      gender: participant
        ? participant.gender === 'male' ? '남성' : '여성'
        : '성별 확인 중',
      card: participant
        ? toSafeParticipantCard(participant)
        : preview ? PREVIEW_PARTICIPANT_CARDS[index % PREVIEW_PARTICIPANT_CARDS.length] : null,
    })
  }
  while (seats.length < room.required_total) {
    seats.push({
      id: `empty-${seats.length + 1}`,
      kind: 'empty',
      label: '빈자리',
      detail: '모집 중',
      gender: null,
      card: null,
    })
  }
  return seats.slice(0, room.required_total)
}

function AnonymousSeat({ kind, label, detail, gender, onSelect }: AnonymousSeatModel & {
  onSelect?: () => void
}) {
  const occupied = kind !== 'empty'
  const mine = kind === 'me' || kind === 'friend'
  const content = (
    <>
      <span className={`relative mx-auto flex aspect-square w-full max-w-14 items-center justify-center rounded-full border ${mine ? 'border-[#D98A78] bg-[#FFF0ED] text-[#B85F50]' : occupied ? 'border-[#D9A69B] bg-white text-[#A85F50]' : 'border-dashed border-[#D8C7C2] bg-[#F7F3F1] text-[#A99B97]'}`}>
        {mine ? <UserRoundCheck size={21} aria-hidden="true" /> : <UserRound size={21} aria-hidden="true" />}
        {gender && kind === 'participant' ? (
          <span className="absolute -bottom-1 left-1/2 min-w-7 -translate-x-1/2 rounded-full border border-white bg-[#4F4542] px-1 py-0.5 text-[8px] font-black leading-none text-white shadow-sm">
            {gender === '남성' ? '남' : gender === '여성' ? '여' : '?'}
          </span>
        ) : null}
      </span>
      <p className="mt-2.5 truncate text-[11px] font-black text-boot-ink">{label}</p>
      <p className="mt-0.5 min-h-7 text-[9px] font-bold leading-3.5 text-boot-muted">
        {kind === 'participant' ? <><span className="block">{gender}</span><span className="block text-boot-coral">{detail}</span></> : detail}
      </p>
    </>
  )

  if (!onSelect) return <div className="min-w-0 text-center">{content}</div>

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${label} ${gender ?? ''} 사전 카드 보기`}
      className="min-w-0 text-center outline-none focus-visible:ring-2 focus-visible:ring-boot-coral focus-visible:ring-offset-2"
    >
      {content}
    </button>
  )
}

function ParticipantCardDialog({
  seat,
  preview,
  onClose,
}: {
  seat: AnonymousSeatModel
  preview: boolean
  onClose: () => void
}) {
  const historyEntryActive = useRef(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const requestClose = useCallback(() => {
    if (historyEntryActive.current) {
      historyEntryActive.current = false
      window.history.back()
      closeRef.current()
      return
    }
    closeRef.current()
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.history.pushState({ ...window.history.state, quantumParticipantCard: true }, '')
    historyEntryActive.current = true

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') requestClose()
    }
    function closeOnBrowserBack() {
      if (!historyEntryActive.current) return
      historyEntryActive.current = false
      closeRef.current()
    }

    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('popstate', closeOnBrowserBack)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('popstate', closeOnBrowserBack)
      if (historyEntryActive.current && window.history.state?.quantumParticipantCard) {
        const { quantumParticipantCard: _removed, ...rest } = window.history.state
        window.history.replaceState(rest, '')
      }
      document.body.style.overflow = previousOverflow
    }
  }, [requestClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center sm:justify-center sm:px-5">
      <button type="button" aria-label="사전 카드 닫기" onClick={requestClose} className="absolute inset-0 bg-[#2F2522]/55 backdrop-blur-[2px]" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="participant-card-title"
        data-testid="quantum-precard-b"
        className="relative z-10 max-h-[90dvh] w-full overflow-y-auto rounded-t-lg bg-[#FFFDFB] shadow-[0_-18px_48px_rgba(56,35,30,0.24)] sm:max-w-md sm:rounded-lg sm:border sm:border-[#E7CFC9] sm:shadow-[0_24px_70px_rgba(56,35,30,0.24)]"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#D8C7C2] sm:hidden" aria-hidden="true" />
        <header className="flex items-start justify-between gap-4 border-b border-boot-hairline bg-[#FFF8F5] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-boot-coral">취향으로 먼저 인사해요</p>
            <h3 id="participant-card-title" className="mt-1 break-words text-xl font-black">
              {seat.label} · {seat.gender ?? '성별 확인 중'}
            </h3>
            <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">사진 없이도 대화의 첫 실마리를 찾는 취향 카드</p>
          </div>
          <button type="button" onClick={requestClose} autoFocus aria-label="사전 카드 닫기" className="flex h-11 w-11 shrink-0 items-center justify-center text-boot-muted hover:text-boot-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-boot-coral">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 pb-5 pt-4">
          {seat.card ? (
            <>
              {preview ? <p className="mb-3 text-[10px] font-black text-[#A85F50]">미리보기 샘플 · 실제 참가자 정보 아님</p> : null}
              <div className="border-y border-boot-hairline py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black text-[#A85F50]">평소 취향</p>
                  {seat.card.mbti ? (
                    <span className="border-b border-[#D9A69B] pb-0.5 text-[11px] font-black text-[#754B43]">MBTI {seat.card.mbti}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-lg font-black leading-7 text-boot-ink">
                  {seat.card.intro ? `“${seat.card.intro}”` : '사진 대신 대화 취향부터 가볍게 확인해요.'}
                </p>
              </div>

              <section data-testid="precard-music-strip" className="-mx-5 bg-[#2F2522] px-5 py-5 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F5B8AA] text-[#402925]">
                    <Headphones size={21} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-[#F5B8AA]">요즘 음악 · 말보다 먼저 듣는 플레이리스트</p>
                    <p className="mt-1 whitespace-normal [overflow-wrap:anywhere] text-base font-black leading-6">{seat.card.music ?? '아직 적지 않았어요'}</p>
                  </div>
                </div>
                <div className="mt-4 flex h-7 items-end gap-1" aria-hidden="true">
                  {[8, 15, 22, 12, 26, 18, 10, 24, 16, 27, 13, 20, 9, 17, 25, 12, 21, 15].map((height, index) => (
                    <span key={`${height}-${index}`} className="min-w-0 flex-1 rounded-t-sm bg-[#F6C15A]" style={{ height }} />
                  ))}
                </div>
              </section>

              <div className="divide-y divide-boot-hairline border-b border-boot-hairline">
                {seat.card.conversationEnergy ? (
                  <ConversationSpectrum
                    testId="precard-conversation-spectrum"
                    label="대화의 온도"
                    value={seat.card.conversationEnergy}
                    start="차분히 들어요"
                    end="먼저 말해요"
                    position={getConversationPosition(seat.card.conversationEnergy)}
                  />
                ) : null}
                {seat.card.planStyle ? (
                  <ConversationSpectrum
                    testId="precard-plan-spectrum"
                    label="약속의 리듬"
                    value={seat.card.planStyle}
                    start="계획대로"
                    end="그날 느낌대로"
                    position={getPlanPosition(seat.card.planStyle)}
                  />
                ) : null}
              </div>

              <section className="border-b border-boot-hairline py-4">
                <p className="flex items-center gap-2 text-[11px] font-black text-[#A85F50]"><Sparkles size={15} /> 같이 꺼내기 좋은 이야기</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {seat.card.interests.length > 0
                    ? seat.card.interests.map((interest) => <SafeCardChip key={interest} value={interest} />)
                    : <p className="text-xs font-bold text-boot-muted">아직 적지 않았어요</p>}
                </div>
              </section>

              <section className="border-b border-boot-hairline py-4" aria-label="공개한 밸런스">
                <p className="text-[11px] font-black text-[#A85F50]">공개한 밸런스</p>
                {seat.card.debateAnswers.length > 0 ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {seat.card.debateAnswers.map((answer) => (
                      <div key={`${answer.question}-${answer.choice}`} className="border-l-2 border-[#D9A69B] bg-[#FFF7F3] px-3 py-2">
                        <p className="text-[10px] font-black text-boot-muted">{answer.question}</p>
                        <p className="mt-1 text-sm font-black text-boot-ink">{answer.choice}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-2 text-xs font-bold text-boot-muted">공개한 답변이 아직 없어요.</p>}
              </section>

              <section className="border-b border-[#E7CFC9] bg-[#FFF3ED] px-4 py-4" aria-label="오늘 카드">
                <p className="text-[11px] font-black text-[#A85F50]">오늘 카드</p>
                {seat.card.meetingMoment ? (
                  <div className="mt-2 grid gap-2 text-sm font-black text-boot-ink sm:grid-cols-3">
                    <p>{seat.card.meetingMoment.mood}</p>
                    <p>{seat.card.meetingMoment.expectation}</p>
                    <p>{seat.card.meetingMoment.activityChoice}</p>
                  </div>
                ) : <p className="mt-2 text-xs font-bold text-boot-muted">이번 만남 카드를 아직 준비하지 않았어요.</p>}
              </section>
            </>
          ) : (
            <div className="border-y border-[#E7CFC9] bg-[#FFF7F3] px-4 py-6 text-center" role="status">
              <Loader2 size={22} className="mx-auto text-boot-coral" aria-hidden="true" />
              <p className="mt-3 text-sm font-black">사전 카드 연결 준비 중</p>
              <p className="mt-2 text-xs font-bold leading-5 text-boot-muted">
                이 참가자는 아직 사전 카드를 작성하지 않았어요. 아직 적지 않았어요 상태를 임의의 답변으로 채우지 않아요.
              </p>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 text-xs font-bold leading-5 text-boot-muted">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-boot-coral" aria-hidden="true" />
            <p>사진·실명·학과·연락처·외모점수 없이, 대화를 시작할 취향만 보여줘요.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function SafeCardChip({ value }: { value: string }) {
  return <span className="inline-flex min-h-8 items-center rounded-full border border-[#E3C9C2] bg-[#FFF6F2] px-3 text-xs font-black text-[#754B43]">{value}</span>
}

function ConversationSpectrum({
  testId,
  label,
  value,
  start,
  end,
  position,
}: {
  testId: string
  label: string
  value: string
  start: string
  end: string
  position: number
}) {
  return (
    <div data-testid={testId} className="py-4">
      <span className="sr-only">{label === '대화의 온도' ? '대화 에너지' : '약속 스타일'}</span>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black text-[#A85F50]">{label}</p>
        <p className="text-sm font-black text-boot-ink">{value}</p>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-[#EEE2DE]" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-full bg-[#D98271]" style={{ width: `${position}%` }} />
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#C44F42] shadow-sm" style={{ left: `${position}%` }} />
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[9px] font-bold text-boot-muted">
        <span>{start}</span>
        <span className="text-right">{end}</span>
      </div>
    </div>
  )
}

function getConversationPosition(value: string) {
  if (value === '잘 들어요') return 22
  if (value === '먼저 말해요') return 78
  return 50
}

function getPlanPosition(value: string) {
  if (value === '계획형') return 22
  if (value === '즉흥형') return 78
  return 50
}

function LobbyStatus({
  icon: Icon,
  message,
  spin = false,
}: {
  icon: typeof Clock3
  message: string
  spin?: boolean
}) {
  return (
    <div className="mt-6 flex items-center gap-3 border-y border-boot-hairline py-5">
      <Icon size={18} className={`text-boot-primary ${spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      <p className="text-sm font-bold text-boot-muted">{message}</p>
    </div>
  )
}

function navigatorShareAvailable() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

function mapInviteError(error?: string) {
  if (error === 'friend_room_full') return '이 방의 같은 성별 자리가 이미 찼어요.'
  if (error === 'friend_already_participating') return '친구가 이미 다른 약속에 참여 중이에요.'
  if (error === 'friend_invite_pending') return '친구에게 이미 다른 방 초대가 도착해 있어요.'
  if (error === 'friend_gender_mismatch') return '오늘 밤 친구 참여는 같은 성별 친구만 가능해요.'
  if (error === 'active_friendship_required') return '친구 관리에서 연결된 친구만 초대할 수 있어요.'
  return '친구 초대를 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function toSafeParticipantCard(participant: QuantumEventRoomParticipant): SafeParticipantCard {
  const profile = participant.profile_preference
  const meetingMoment = participant.meeting_moment

  return {
    intro: participant.preference_card.intro ?? null,
    mbti: profile?.mbti ?? participant.preference_card.mbti ?? null,
    conversationEnergy: mapConversationEnergy(
      profile?.conversation_energy ?? participant.preference_card.conversation_energy,
    ),
    planStyle: mapPlanStyle(profile?.plan_style ?? participant.preference_card.plan_style),
    interests: profile ? [...profile.interests] : [...participant.preference_card.interests],
    music: profile?.favorite_music ?? participant.preference_card.music ?? null,
    debateAnswers: (profile?.debate_answers ?? []).map((answer) => ({
      question: getDebateQuestionLabel(answer.question_id),
      choice: getDebateChoiceLabel(answer.question_id, answer.choice),
    })),
    meetingMoment: meetingMoment ? {
      mood: mapMeetingMood(meetingMoment.mood),
      expectation: mapMeetingExpectation(meetingMoment.expectation),
      activityChoice: meetingMoment.activity_choice,
    } : null,
  }
}

function mapConversationEnergy(value: unknown): string | null {
  if (value === 'listener') return '잘 들어요'
  if (value === 'balanced') return '대화 균형형'
  if (value === 'talker' || value === 'speaker') return '먼저 말해요'
  return null
}

function mapPlanStyle(value: unknown): string | null {
  if (value === 'planned' || value === 'planner') return '계획형'
  if (value === 'balanced') return '계획·즉흥 균형형'
  if (value === 'spontaneous') return '즉흥형'
  return null
}

function getDebateQuestionLabel(questionId: string) {
  return QUANTUM_DEBATE_QUESTION_DEFINITIONS.find((question) => question.id === questionId)?.title
    ?? '가벼운 밸런스'
}

function getDebateChoiceLabel(questionId: string, choice: 'A' | 'B' | 'SKIP') {
  const question = QUANTUM_DEBATE_QUESTION_DEFINITIONS.find((item) => item.id === questionId)
  if (choice === 'SKIP') return '건너뛰기'
  if (!question) return choice
  return choice === 'A' ? question.optionA : question.optionB
}

function mapMeetingMood(value: string) {
  if (value === 'calm') return '차분한 기분'
  if (value === 'bright') return '기분 좋은 상태'
  if (value === 'curious') return '새로운 이야기가 궁금해요'
  return '같이 움직이고 싶어요'
}

function mapMeetingExpectation(value: string) {
  if (value === 'conversation') return '편한 대화'
  if (value === 'activity') return '활동에 몰입'
  if (value === 'new_people') return '새로운 사람'
  return '부담 없는 동행'
}

function createIdempotencyKey(friendId: string) {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `room-invite:${friendId.slice(0, 8)}:${random}`
}

const PREVIEW_PARTICIPANT_CARDS: SafeParticipantCard[] = [
  {
    intro: '처음에는 조용하지만 공통점을 찾으면 말이 많아져요.',
    mbti: 'INFP',
    conversationEnergy: '대화 균형형',
    planStyle: '계획·즉흥 균형형',
    interests: ['러닝', '맛집', '음악'],
    music: '인디 팝 · 산책할 때 듣는 노래',
    debateAnswers: [
      { question: '민트초코', choice: '민초 가능' },
      { question: '냉면', choice: '물냉' },
    ],
    meetingMoment: {
      mood: '새로운 이야기가 궁금해요',
      expectation: '새로운 사람',
      activityChoice: '편한 속도로 함께 달리기',
    },
  },
  {
    intro: '낯을 조금 가리지만 같이 움직이면 금방 편해져요.',
    mbti: 'ENFJ',
    conversationEnergy: '먼저 말해요',
    planStyle: '즉흥형',
    interests: ['보드게임', '카페', '영화'],
    music: 'R&B · 잔잔한 새벽 플레이리스트',
    debateAnswers: [
      { question: '민트초코', choice: '반민초' },
      { question: '냉면', choice: '비냉' },
    ],
    meetingMoment: {
      mood: '기분 좋은 상태',
      expectation: '편한 대화',
      activityChoice: '중간에 쉬며 대화하기',
    },
  },
]

const PREVIEW_PARTICIPANTS: QuantumEventRoomParticipant[] = [
  {
    alias: '참여자 1',
    gender: 'male',
    seat_label: '참여자 1',
    ready: true,
    profile_preference: {
      mbti: 'INFP',
      conversation_energy: 'balanced',
      plan_style: 'balanced',
      interests: ['러닝', '맛집', '음악'],
      favorite_music: '인디 팝 · 산책할 때 듣는 노래',
      debate_answers: [
        { question_id: 'mint-chocolate', choice: 'A' },
        { question_id: 'naengmyeon', choice: 'A' },
      ],
    },
    meeting_moment: {
      mood: 'curious',
      expectation: 'new_people',
      activity_choice: '편한 속도로 함께 달리기',
    },
    preference_card: {
      intro: '처음에는 조용하지만 공통점을 찾으면 말이 많아져요.',
      mbti: 'INFP',
      conversation_energy: 'balanced',
      plan_style: 'balanced',
      interests: ['러닝', '맛집', '음악'],
      music: '인디 팝 · 산책할 때 듣는 노래',
      mint_chocolate: 'A',
      naengmyeon: 'A',
    },
  },
]

const PREVIEW_ROOMS: QuantumEventRoom[] = [
  {
    occurrence_id: '11111111-1111-4111-8111-111111111111',
    room_number: 1,
    room_label: 'A방',
    room_code: 'A7RUN1',
    total: 3,
    male: 2,
    female: 1,
    reserved_total: 1,
    reserved_male: 0,
    reserved_female: 1,
    required_total: 5,
    male_capacity: 3,
    female_capacity: 2,
    is_my_room: true,
  },
  {
    occurrence_id: '22222222-2222-4222-8222-222222222222',
    room_number: 2,
    room_label: 'B방',
    room_code: 'B9RUN2',
    total: 2,
    male: 1,
    female: 1,
    reserved_total: 0,
    reserved_male: 0,
    reserved_female: 0,
    required_total: 5,
    male_capacity: 3,
    female_capacity: 2,
    is_my_room: false,
  },
  {
    occurrence_id: '33333333-3333-4333-8333-333333333333',
    room_number: 3,
    room_label: 'C방',
    room_code: 'C2RUN3',
    total: 1,
    male: 1,
    female: 0,
    reserved_total: 0,
    reserved_male: 0,
    reserved_female: 0,
    required_total: 5,
    male_capacity: 3,
    female_capacity: 2,
    is_my_room: false,
  },
]

const PREVIEW_CANDIDATES: QuantumEventRoomInviteCandidate[] = [
  {
    user_id: '44444444-4444-4444-8444-444444444444',
    display_name: '민지',
    avatar_url: null,
  },
  {
    user_id: '55555555-5555-4555-8555-555555555555',
    display_name: '서연',
    avatar_url: null,
  },
]
