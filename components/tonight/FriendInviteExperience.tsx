'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, ShieldCheck, UserRoundCheck, X } from 'lucide-react'

import ActivityRanker from './ActivityRanker'
import { PEACH_PANEL, PrimaryButton, TonightPageShell } from './TonightUi'
import type { TonightActivityCard } from './types'

type InviteDetails = {
  id: string
  round_id: string
  status: string
  expires_at: string
  service_date: string
  signup_close_at: string
  membership_ready: boolean
  profile_ready: boolean
  already_applied: boolean
  activities: Array<{
    id: string
    title: string
    description: string
    image_url: string
    duration_minutes: number
    kind: string
  }>
}

type ScreenState = 'loading' | 'unauthenticated' | 'access_required' | 'ready' | 'accepted' | 'declined' | 'error'

export const FRIEND_INVITE_SESSION_KEY = 'quantum:tonight-friend-invite:resume'
const SAFE_RESUME_PATH = '/tonight/invite/resume'

function idempotencyKey(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${suffix}`.slice(0, 120)
}

export default function FriendInviteExperience({ token }: { token: string }) {
  const [state, setState] = useState<ScreenState>('loading')
  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [rankedIds, setRankedIds] = useState<readonly string[]>([])
  const [matchingConsentAccepted, setMatchingConsentAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const acceptKeyRef = useRef<string | null>(null)
  const declineKeyRef = useRef<string | null>(null)

  const fetchInvite = useCallback(async () => {
    const response = await fetch(`/api/tonight/friend-invites/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    const payload = await response.json().catch(() => ({})) as { invite?: InviteDetails; error?: string }
    return { response, payload }
  }, [token])

  const load = useCallback(async () => {
    sessionStorage.setItem(FRIEND_INVITE_SESSION_KEY, token)
    setState('loading')
    setError(null)
    const { response, payload } = await fetchInvite()
    if (response.status === 401) {
      setState('unauthenticated')
      return
    }
    if (response.status === 403 && payload.error === 'forbidden') {
      setState('access_required')
      return
    }
    if (!response.ok || !payload.invite) {
      setError(payload.error === 'friend_invite_expired'
        ? '신청 마감이 지나 초대가 만료됐어요.'
        : '초대가 만료됐거나 이미 사용됐어요.')
      setState('error')
      return
    }
    if (payload.invite.status === 'accepted' && payload.invite.already_applied) {
      sessionStorage.removeItem(FRIEND_INVITE_SESSION_KEY)
      setInvite(payload.invite)
      setState('accepted')
      return
    }
    if (payload.invite.status === 'declined') {
      sessionStorage.removeItem(FRIEND_INVITE_SESSION_KEY)
      setInvite(payload.invite)
      setState('declined')
      return
    }
    if (payload.invite.status !== 'pending') {
      setError(payload.invite.status === 'expired'
        ? '신청 마감이 지나 초대가 만료됐어요.'
        : '이 초대는 이미 수락·거절·취소되어 다시 사용할 수 없어요.')
      setState('error')
      return
    }
    setInvite(payload.invite)
    setRankedIds(payload.invite.activities.map((activity) => activity.id))
    setState('ready')
  }, [fetchInvite, token])

  useEffect(() => {
    void load().catch(() => {
      setError('초대를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
      setState('error')
    })
  }, [load])

  async function acceptInvite() {
    if (!invite || rankedIds.length !== 3 || !matchingConsentAccepted || busy) return
    const rankedActivityIds = rankedIds as [string, string, string]
    setBusy(true)
    setError(null)
    try {
      acceptKeyRef.current ??= idempotencyKey('tonight_invite_accept')
      const response = await fetch(`/api/tonight/friend-invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ranked_activity_ids: rankedActivityIds,
          matching_consent_accepted: true,
          matching_consent_version: '2026-09-03',
          idempotency_key: acceptKeyRef.current,
        }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'accept_failed')
      acceptKeyRef.current = null
      sessionStorage.removeItem(FRIEND_INVITE_SESSION_KEY)
      setState('accepted')
    } catch (reason) {
      try {
        const latest = await fetchInvite()
        if (latest.response.ok && latest.payload.invite?.status === 'accepted'
          && latest.payload.invite.already_applied) {
          acceptKeyRef.current = null
          sessionStorage.removeItem(FRIEND_INVITE_SESSION_KEY)
          setState('accepted')
          return
        }
      } catch {
        // Retain the same key so retry replays the same accept operation.
      }
      const code = reason instanceof Error ? reason.message : ''
      setError(code === 'friend_invite_expired'
        ? '신청 마감이 지나 초대가 만료됐어요.'
        : code === 'profile_not_ready'
          ? '프로필·취향·사진 준비를 마친 뒤 받은 초대로 돌아와 다시 수락해 주세요.'
          : '초대를 수락하지 못했어요. 다른 사람이 먼저 사용했거나 동행 자리가 찼을 수 있어요.')
    } finally {
      setBusy(false)
    }
  }

  async function declineInvite() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      declineKeyRef.current ??= idempotencyKey('tonight_invite_decline')
      const response = await fetch(`/api/tonight/friend-invites/${encodeURIComponent(token)}/decline`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotency_key: declineKeyRef.current }),
      })
      if (!response.ok) throw new Error('decline_failed')
      declineKeyRef.current = null
      sessionStorage.removeItem(FRIEND_INVITE_SESSION_KEY)
      setState('declined')
    } catch {
      try {
        const latest = await fetchInvite()
        if (latest.response.ok && latest.payload.invite?.status === 'declined') {
          declineKeyRef.current = null
          sessionStorage.removeItem(FRIEND_INVITE_SESSION_KEY)
          setState('declined')
          return
        }
      } catch {
        // Retain the same key so retry replays the same decline operation.
      }
      setError('초대 거절을 처리하지 못했어요. 새로고침 후 다시 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const activities = invite?.activities.map((activity) => ({
    id: activity.id,
    title: activity.title,
    description: activity.description,
    imageUrl: activity.image_url,
    imageAlt: `${activity.title} 활동 사진`,
    durationMinutes: activity.duration_minutes,
    kind: activity.kind,
  })) as [TonightActivityCard, TonightActivityCard, TonightActivityCard] | undefined

  return (
    <TonightPageShell
      eyebrow="PNU TONIGHT · 친구 동행 초대"
      title="친구와 같은 팀으로 오늘밤에 참여해요"
      description="링크만 눌러서는 합류되지 않아요. 본인 계정과 활동 순위, 매칭 동의를 확인한 뒤 명시적으로 수락합니다."
    >
      {state === 'loading' && (
        <div className={`${PEACH_PANEL} flex min-h-[320px] items-center justify-center p-8 text-center`} role="status">
          <div><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-[#b94b3f]" aria-hidden /><p className="mt-4 font-black">초대 안전성을 확인하는 중이에요</p></div>
        </div>
      )}

      {state === 'unauthenticated' && (
        <section className={`${PEACH_PANEL} p-6 text-center sm:p-8`}>
          <ShieldCheck className="mx-auto h-10 w-10 text-[#b94b3f]" aria-hidden />
          <h2 className="mt-4 text-xl font-black">본인 계정 로그인이 먼저예요</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">로그인·회원가입을 마치면 지금 초대 주소로 그대로 돌아와요.</p>
          <Link href={`/login?redirect=${encodeURIComponent(SAFE_RESUME_PATH)}`} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#b94b3f] px-5 py-3 text-sm font-black text-white">로그인/회원가입 후 계속</Link>
        </section>
      )}

      {state === 'access_required' && (
        <section className={`${PEACH_PANEL} p-6 text-center sm:p-8`}>
          <ShieldCheck className="mx-auto h-10 w-10 text-[#b94b3f]" aria-hidden />
          <h2 className="mt-4 text-xl font-black">부산대 파일럿 참여 확인이 먼저예요</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">검토 요청을 보낸 뒤 최고관리자 승인을 받으면 같은 탭의 초대로 돌아올 수 있어요.</p>
          <Link href="/tonight/access-request" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#b94b3f] px-5 py-3 text-sm font-black text-white">부산대 인증 요청</Link>
        </section>
      )}

      {state === 'ready' && invite && !invite.membership_ready && (
        <section className={`${PEACH_PANEL} p-6 text-center sm:p-8`}>
          <ShieldCheck className="mx-auto h-10 w-10 text-[#b94b3f]" aria-hidden />
          <h2 className="mt-4 text-xl font-black">부산대 오늘밤 참여 인증이 필요해요</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">부산대 파일럿 참여 권한을 확인받은 뒤 이 초대 주소로 돌아와 새로고침해 주세요.</p>
          <button type="button" onClick={() => void load()} className="mt-5 min-h-12 rounded-2xl bg-[#b94b3f] px-5 py-3 text-sm font-black text-white">인증 후 다시 확인</button>
        </section>
      )}

      {state === 'ready' && invite?.membership_ready && !invite.profile_ready && (
        <section className={`${PEACH_PANEL} p-6 text-center sm:p-8`}>
          <UserRoundCheck className="mx-auto h-10 w-10 text-[#b94b3f]" aria-hidden />
          <h2 className="mt-4 text-xl font-black">남은 참가 준비를 이어가 주세요</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">기존 프로필·취향·사진 준비를 마친 뒤 ‘받은 초대로 돌아가기’에서 이어가요. 준비만으로 초대가 수락되지는 않아요.</p>
          <Link href={`/tonight/prepare?returnTo=${encodeURIComponent(SAFE_RESUME_PATH)}`} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#b94b3f] px-5 py-3 text-sm font-black text-white">참가 준비 이어가기</Link>
        </section>
      )}

      {state === 'ready' && invite?.already_applied && (
        <section className={`${PEACH_PANEL} p-6 text-center sm:p-8`}>
          <h2 className="text-xl font-black">이미 이 회차에 신청했어요</h2>
          <p className="mt-2 text-sm font-semibold text-[#665c58]">중복 합류로 기존 팀 묶음을 바꾸지 않았어요.</p>
          <Link href="/tonight" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#292321] px-5 py-3 text-sm font-black text-white">내 오늘밤 상태 보기</Link>
        </section>
      )}

      {state === 'ready' && invite?.membership_ready && invite.profile_ready && !invite.already_applied && activities?.length === 3 && (
        <div className="space-y-5">
          <section className={`${PEACH_PANEL} p-5 sm:p-6`}>
            <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">내 선택은 내가 제출해요</p>
            <h2 className="mt-1 text-2xl font-black">사진을 눌러 활동 1·2·3순위를 정해 주세요</h2>
            <div className="mt-5"><ActivityRanker activities={activities} rankedIds={rankedIds} onChange={setRankedIds} disabled={busy} /></div>
          </section>
          <section className={`${PEACH_PANEL} p-5 sm:p-6`}>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[#fff5f1] p-4 text-sm font-bold leading-6">
              <input type="checkbox" checked={matchingConsentAccepted} onChange={(event) => setMatchingConsentAccepted(event.target.checked)} className="mt-1 h-5 w-5 accent-[#b94b3f]" />
              <span>나이와 비공개 외모 점수를 팀 균형 편성에 사용하는 데 동의하며, 세 활동 모두 참여할 수 있어요.</span>
            </label>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => void declineInvite()} disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#ddcbc3] px-5 py-3 text-sm font-black"><X className="h-4 w-4" aria-hidden />초대 거절</button>
              <PrimaryButton onClick={() => void acceptInvite()} disabled={busy || !matchingConsentAccepted}>초대 수락</PrimaryButton>
            </div>
            {error && <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-800" role="alert">{error}</p>}
          </section>
        </div>
      )}

      {state === 'accepted' && (
        <section className={`${PEACH_PANEL} p-8 text-center`}><Check className="mx-auto h-10 w-10 text-emerald-600" aria-hidden /><h2 className="mt-4 text-2xl font-black">같은 동행 묶음에 합류했어요</h2><p className="mt-2 text-sm font-semibold text-[#665c58]">친구 관계나 채팅은 만들지 않았고, 오늘밤 팀 편성에서만 함께 이동해요.</p><Link href="/tonight" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#b94b3f] px-5 py-3 text-sm font-black text-white">내 오늘밤 상태 보기</Link></section>
      )}
      {state === 'declined' && (
        <section className={`${PEACH_PANEL} p-8 text-center`}><h2 className="text-2xl font-black">초대를 거절했어요</h2><p className="mt-2 text-sm font-semibold text-[#665c58]">이 링크로는 더 이상 합류되지 않아요.</p></section>
      )}
      {state === 'error' && (
        <section className={`${PEACH_PANEL} p-8 text-center`}><h2 className="text-xl font-black">초대를 사용할 수 없어요</h2><p className="mt-2 text-sm font-semibold text-[#665c58]">{error}</p><button type="button" onClick={() => void load()} className="mt-5 min-h-12 rounded-2xl bg-[#292321] px-5 py-3 text-sm font-black text-white">다시 확인</button></section>
      )}
    </TonightPageShell>
  )
}
