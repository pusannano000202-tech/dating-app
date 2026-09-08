'use client'

import Link from 'next/link'
import { ArrowRight, CheckCircle2, Clock3, Loader2, LogIn, MessageCircleMore, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { parseQuantumEventRoomInvites, type QuantumEventRoomInvite } from '@/lib/matching/quantum-event-rooms'

type State = 'loading' | 'ready' | 'auth_required' | 'missing' | 'expired' | 'needs_card' | 'accepted' | 'declined' | 'error'

export default function QuantumEventRoomInviteAccept({ token, preview = false }: { token: string; preview?: boolean }) {
  const [state, setState] = useState<State>(preview ? 'ready' : 'loading')
  const [invite, setInvite] = useState<QuantumEventRoomInvite | null>(preview ? PREVIEW_INVITE : null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    void fetch('/api/match/event-room-invites', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setState('auth_required')
          return null
        }
        if (!response.ok) throw new Error('invite_lookup_failed')
        return response.json() as Promise<{ invites?: unknown }>
      })
      .then((payload) => {
        if (!payload) return
        const parsed = parseQuantumEventRoomInvites(payload.invites)
        const found = parsed?.find((candidate) => candidate.token === token && candidate.role === 'invitee') ?? null
        if (!found) {
          setState('missing')
          return
        }
        setInvite(found)
        setState(found.status === 'accepted' ? 'accepted' : new Date(found.expires_at).getTime() <= Date.now() ? 'expired' : 'ready')
      })
      .catch((error) => {
        if ((error as { name?: string }).name !== 'AbortError') setState('error')
      })
    return () => controller.abort()
  }, [preview, token])

  const remainingMinutes = useMemo(() => {
    if (!invite) return null
    return Math.max(0, Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / 60_000))
  }, [invite])

  async function acceptInvite() {
    if (busy) return
    if (preview) {
      setNotice('미리보기에서는 저장하지 않아요. 실제 수락 시 같은 방 현황으로 이동해요.')
      return
    }
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/match/event-room-invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        if (payload.error === 'invite_expired') setState('expired')
        if (payload.error === 'pre_match_card_required') setState('needs_card')
        setNotice(mapAcceptError(payload.error))
        return
      }
      setState('accepted')
    } catch {
      setNotice('초대를 수락하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function declineInvite() {
    if (busy) return
    if (preview) {
      setNotice('미리보기에서는 저장하지 않아요. 실제 거절 시 예약 자리가 즉시 열려요.')
      return
    }
    setBusy(true)
    setNotice('초대를 거절하고 있어요...')
    try {
      const response = await fetch('/api/match/event-room-invites/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setNotice(payload.error === 'event_state_locked'
          ? '이미 참여한 초대는 거절할 수 없어요.'
          : '초대를 거절하지 못했어요. 잠시 후 다시 시도해 주세요.')
        return
      }
      setState('declined')
      setNotice('')
    } catch {
      setNotice('초대를 거절하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return <CenteredStatus icon={Loader2} text="친구 초대를 확인하고 있어요." spin />
  if (state === 'auth_required') {
    const redirect = encodeURIComponent(`/match/invite/${token}`)
    return (
      <CenteredStatus icon={LogIn} text="초대받은 계정으로 로그인해야 같은 방에 들어갈 수 있어요.">
        <Link href={`/login?redirect=${redirect}`} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-md bg-boot-primary px-5 text-sm font-black text-white">로그인 <ArrowRight size={16} /></Link>
      </CenteredStatus>
    )
  }
  if (state === 'missing' || state === 'expired') {
    return <CenteredStatus icon={Clock3} text={state === 'expired' ? '15분 예약 시간이 끝났어요. 친구에게 다시 초대해 달라고 해주세요.' : '내 계정으로 받은 초대를 찾지 못했어요.'} />
  }
  if (state === 'needs_card') {
    const redirect = encodeURIComponent(`/match/invite/${token}`)
    return (
      <CenteredStatus icon={MessageCircleMore} text="사전 카드를 완성하면 이 초대로 바로 돌아와 같은 방에 참여할 수 있어요.">
        <Link href={`/profile/match-card?redirect=${redirect}`} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-md bg-boot-primary px-5 text-sm font-black text-white">사전 카드 작성 <ArrowRight size={16} /></Link>
      </CenteredStatus>
    )
  }
  if (state === 'error') return <CenteredStatus icon={Clock3} text="초대를 불러오지 못했어요. 잠시 후 다시 열어주세요." />
  if (state === 'accepted') {
    return (
      <CenteredStatus icon={CheckCircle2} text={`${invite?.room_label ?? '같은 방'} 참여가 완료됐어요.`}>
        <Link href={invite ? `/match/events/${invite.event_id}?party=solo` : '/match'} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-md bg-boot-primary px-5 text-sm font-black text-white">내 방 현황 보기 <ArrowRight size={16} /></Link>
      </CenteredStatus>
    )
  }
  if (state === 'declined') {
    return (
      <CenteredStatus icon={CheckCircle2} text="초대를 거절했어요. 예약된 자리는 즉시 다시 열렸어요.">
        <Link href="/match" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-md bg-boot-primary px-5 text-sm font-black text-white">매칭으로 돌아가기 <ArrowRight size={16} /></Link>
      </CenteredStatus>
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border border-[#E7CFC9] bg-[#FFFDFB] text-boot-ink shadow-[0_18px_40px_rgba(93,57,48,0.14)]">
      <div className="px-5 py-6 text-center sm:px-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF0ED] text-boot-coral"><UsersRound size={25} /></span>
        <p className="mt-4 text-[11px] font-black text-boot-coral">같은 방으로 바로 참여</p>
        <h1 className="mt-1 text-2xl font-black">{invite?.room_label} 초대가 왔어요</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-boot-muted">{invite?.counterpart_display_name}님이 같은 방 자리를 잡아뒀어요. 다른 방을 고를 필요 없이 수락하면 바로 합류해요.</p>
        <div className="mt-5 flex items-center justify-center gap-3 border-y border-boot-hairline bg-[#FFF8F5] py-4 text-sm font-black">
          <span className="text-boot-coral">{invite?.room_label}</span>
          <span className="text-[#CDB8B1]">·</span>
          <span className="text-[#B47A16]">약 {remainingMinutes}분 남음</span>
        </div>
        {notice ? <p className="mt-4 text-xs font-black text-[#FF9A89]" role="status">{notice}</p> : null}
        <button type="button" disabled={busy} onClick={() => void acceptInvite()} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-boot-coral px-5 text-base font-black text-white disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} 같은 방 참여하기
        </button>
        <button type="button" disabled={busy} onClick={() => void declineInvite()} className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-md border border-[#D8C7C2] bg-white px-5 text-sm font-black text-boot-muted disabled:opacity-50">
          이번 초대 거절
        </button>
      </div>
    </section>
  )
}

const PREVIEW_INVITE: QuantumEventRoomInvite = {
  token: '11111111111111111111111111111111',
  role: 'invitee',
  counterpart_user_id: '77777777-7777-4777-8777-777777777777',
  counterpart_display_name: '민지',
  event_id: 'tonight-onsenjjang-run',
  event_mode: 'tonight',
  room_number: 1,
  room_label: '1팀',
  room_code: 'A7RUN1',
  status: 'pending',
  expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
}

function CenteredStatus({ icon: Icon, text, spin = false, children }: { icon: typeof Clock3; text: string; spin?: boolean; children?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-boot-hairline bg-white px-5 py-10 text-center shadow-sm">
      <Icon size={28} className={`mx-auto text-boot-primary ${spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      <p className="mx-auto mt-4 max-w-md text-sm font-black leading-6 text-boot-body">{text}</p>
      {children}
    </section>
  )
}

function mapAcceptError(error?: string) {
  if (error === 'pre_match_card_required') return '사전 카드를 먼저 완성해 주세요.'
  if (error === 'invite_expired') return '15분 예약 시간이 끝났어요.'
  if (error === 'active_event_conflict') return '이미 참여 중인 다른 약속을 먼저 취소해 주세요.'
  if (error === 'friend_room_full') return '예약 상태가 바뀌어 같은 방 자리가 찼어요.'
  if (error === 'active_friendship_required') return '현재 친구 관계를 다시 확인해 주세요.'
  return '초대를 수락하지 못했어요. 잠시 후 다시 시도해 주세요.'
}
