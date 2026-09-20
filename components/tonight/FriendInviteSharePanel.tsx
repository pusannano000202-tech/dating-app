'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Link2, MessageCircle, Trash2, Users } from 'lucide-react'

import { shareGroupInviteOnKakao as shareKakaoDefault } from '@/lib/kakao-share'

import { PEACH_PANEL } from './TonightUi'
import type { TonightUiMode } from './types'

type InviteRow = {
  id: string
  status: string
  target_fixed: boolean
  expires_at: string
  created_at: string
}

type ShareResult = 'kakao' | 'native' | 'copy'

function idempotencyKey(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${suffix}`.slice(0, 120)
}

function inviteError(code: unknown): string {
  return ({
    applications_closed: '오늘 신청이 마감되어 새 초대를 만들 수 없어요.',
    friend_invite_conflict: '동행 자리는 최대 2명이며, 사용 중인 초대 링크도 자리로 계산돼요.',
    invite_link_not_recoverable: '이 요청의 링크는 이미 한 번 발급됐어요. 기존 초대를 취소하고 새로 만들어 주세요.',
    forbidden: '부산대 오늘밤 참여 권한을 확인해 주세요.',
  } as Record<string, string>)[String(code)] ?? '초대를 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
}

export default function FriendInviteSharePanel({
  roundId,
  memberCount,
  mode = 'live',
  disabled = false,
}: {
  roundId: string
  memberCount: number
  mode?: TonightUiMode
  disabled?: boolean
}) {
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [initialInvitesLoaded, setInitialInvitesLoaded] = useState(mode === 'rehearsal')
  const [loadedRoundId, setLoadedRoundId] = useState<string | null>(
    mode === 'rehearsal' ? roundId : null,
  )
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [readAttempt, setReadAttempt] = useState(0)
  const createKeysRef = useRef(new Map<string, string>())
  const cancelKeysRef = useRef(new Map<string, string>())
  const currentRoundIdRef = useRef(roundId)

  const load = useCallback(async () => {
    if (mode === 'rehearsal') return [] as InviteRow[]
    const response = await fetch(`/api/tonight/friend-invites?round_id=${encodeURIComponent(roundId)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    const payload = await response.json().catch(() => ({})) as { invites?: InviteRow[]; error?: string }
    if (!response.ok) throw new Error(inviteError(payload.error))
    const nextInvites = Array.isArray(payload.invites) ? payload.invites : []
    return nextInvites
  }, [mode, roundId])

  useEffect(() => {
    let active = true
    const roundChanged = currentRoundIdRef.current !== roundId
    currentRoundIdRef.current = roundId
    setInvites([])
    setInitialInvitesLoaded(mode === 'rehearsal')
    setLoadedRoundId(mode === 'rehearsal' ? roundId : null)
    setReadError(null)
    if (roundChanged) {
      setNotice(null)
      setError(null)
      cancelKeysRef.current.clear()
    }
    void load()
      .then((nextInvites) => {
        if (!active || currentRoundIdRef.current !== roundId) return
        setInvites(nextInvites)
        setInitialInvitesLoaded(true)
        setLoadedRoundId(roundId)
      })
      .catch((reason: unknown) => {
        if (active && currentRoundIdRef.current === roundId) {
          setReadError(reason instanceof Error ? reason.message : inviteError(null))
        }
      })
    return () => {
      active = false
    }
  }, [load, mode, roundId, memberCount, readAttempt])

  const roundReady = initialInvitesLoaded && loadedRoundId === roundId

  function noticeForCurrentRound(message: string) {
    if (currentRoundIdRef.current === roundId) setNotice(message)
  }

  async function shareInvite() {
    if (busy || disabled || !roundReady) return
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      if (mode === 'rehearsal') {
        const createdAt = new Date().toISOString()
        setInvites((current) => [...current, {
          id: `rehearsal-${roundId}-${current.length + 1}`,
          status: 'pending',
          target_fixed: false,
          created_at: createdAt,
          expires_at: createdAt,
        }])
        noticeForCurrentRound('체험 초대 링크를 만들었어요. 실제 카카오톡이나 클립보드는 열지 않았어요.')
        return
      }
      const createScope = `${roundId}:open`
      const createKey = createKeysRef.current.get(createScope)
        ?? idempotencyKey('tonight_invite_create')
      createKeysRef.current.set(createScope, createKey)
      const response = await fetch('/api/tonight/friend-invites', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          round_id: roundId,
          invited_user_id: null,
          idempotency_key: createKey,
        }),
      })
      const payload = await response.json().catch(() => ({})) as {
        invite_path?: string
        invite_id?: string | null
        error?: string
      }
      if (
        !response.ok
        && payload.error === 'invite_link_not_recoverable'
        && typeof payload.invite_id === 'string'
      ) {
        const refreshed = await load()
        if (currentRoundIdRef.current === roundId) setInvites(refreshed)
        const committedInvite = refreshed.find((invite) => invite.id === payload.invite_id)
        if (committedInvite) {
          createKeysRef.current.delete(createScope)
          noticeForCurrentRound('초대 생성은 확인됐지만 응답이 끊겨 같은 링크를 다시 표시할 수 없어요. 해당 대기 초대를 취소한 뒤 새 링크를 만들어 주세요.')
          return
        }
      }
      if (!response.ok || !payload.invite_path) throw new Error(inviteError(payload.error))

      createKeysRef.current.delete(createScope)
      const inviteUrl = new URL(payload.invite_path, window.location.origin).toString()
      const result = await shareWithFallback(inviteUrl)
      noticeForCurrentRound(result === 'kakao'
        ? '카카오톡 공유창을 열었어요.'
        : result === 'native'
          ? '기본 공유창을 열었어요.'
          : '초대 링크를 복사했어요.')
      const refreshed = await load()
      if (currentRoundIdRef.current === roundId) setInvites(refreshed)
    } catch (reason) {
      try {
        const refreshed = await load()
        if (currentRoundIdRef.current === roundId) setInvites(refreshed)
      } catch {
        // Keep the same key so a later retry cannot consume another invite seat.
      }
      if (currentRoundIdRef.current === roundId) {
        setError(reason instanceof Error ? reason.message : inviteError(null))
      }
    } finally {
      setBusy(false)
    }
  }

  async function shareWithFallback(inviteUrl: string): Promise<ShareResult> {
    const payload = {
      title: 'Quantum 오늘밤 친구 동행 초대',
      description: '각자 활동 1·2·3순위와 매칭 동의를 제출하면 같은 팀 묶음으로 참여해요.',
      url: inviteUrl,
      buttonTitle: '초대 확인하기',
    }
    try {
      await shareKakaoDefault(payload)
      return 'kakao'
    } catch {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: payload.title, text: payload.description, url: inviteUrl })
          return 'native'
        } catch (reason) {
          if (reason instanceof DOMException && reason.name === 'AbortError') return 'native'
        }
      }
      await navigator.clipboard.writeText(inviteUrl)
      return 'copy'
    }
  }

  async function cancelInvite(inviteId: string) {
    if (busy || !roundReady) return
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      if (mode === 'rehearsal') {
        setInvites((current) => current.filter((invite) => invite.id !== inviteId))
        noticeForCurrentRound('체험 초대를 취소했어요.')
        return
      }
      const existingKey = cancelKeysRef.current.get(inviteId)
        ?? idempotencyKey('tonight_invite_cancel')
      cancelKeysRef.current.set(inviteId, existingKey)
      const response = await fetch(`/api/tonight/friend-invites/by-id/${encodeURIComponent(inviteId)}/cancel`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotency_key: existingKey }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(inviteError(payload.error))
      cancelKeysRef.current.delete(inviteId)
      noticeForCurrentRound('초대 취소가 완료됐어요. 해당 링크는 더 이상 사용할 수 없어요.')
      const refreshed = await load()
      if (currentRoundIdRef.current === roundId) setInvites(refreshed)
    } catch (reason) {
      try {
        const refreshed = await load()
        if (currentRoundIdRef.current === roundId) setInvites(refreshed)
        const current = refreshed.find((invite) => invite.id === inviteId)
        if (!current || current.status !== 'pending') {
          cancelKeysRef.current.delete(inviteId)
          noticeForCurrentRound('초대가 더 이상 대기 중이 아닌 것을 확인했어요.')
          return
        }
      } catch {
        // Keep the same per-invite key for a safe retry after an uncertain response.
      }
      if (currentRoundIdRef.current === roundId) {
        setError(reason instanceof Error ? reason.message : inviteError(null))
      }
    } finally {
      setBusy(false)
    }
  }

  const pending = roundReady ? invites.filter((invite) => invite.status === 'pending') : []
  const remainingSeats = Math.max(0, 3 - memberCount - pending.length)

  return (
    <section className={`${PEACH_PANEL} p-5 sm:p-6`} aria-labelledby="tonight-friend-invite-title">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fce9e4] text-[#b94b3f]">
          <Users className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="tonight-friend-invite-title" className="font-black">친구와 같은 팀으로 참여하기</h2>
          <p className="mt-1 text-sm font-semibold leading-5 text-[#8b7e78]">
            링크 한 개는 한 명만 수락할 수 있고 신청 마감에 만료돼요. 친구 관계·연락처·채팅은 자동으로 만들지 않아요.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void shareInvite()}
        disabled={disabled || busy || !roundReady || remainingSeats === 0}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#fee500] px-5 py-3 text-sm font-black text-[#241f17] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <MessageCircle className="h-5 w-5" aria-hidden />
        {!roundReady ? readError ? '기존 초대를 확인해 주세요' : '기존 초대 확인 중…' : busy ? '초대 준비 중…' : '카카오톡으로 초대'}
      </button>
      <p className="mt-2 text-center text-xs font-bold text-[#8b7e78]">
        카카오 공유가 안 되면 휴대폰 공유창, 링크 복사 순서로 자동 전환돼요.
      </p>

      {pending.length > 0 && (
        <ul className="mt-4 space-y-2">
          {pending.map((invite, index) => (
            <li key={invite.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#ead9d2] bg-[#fffaf7] px-4 py-3">
              <span className="inline-flex min-w-0 items-center gap-2 text-sm font-black">
                <Link2 className="h-4 w-4 shrink-0 text-[#b94b3f]" aria-hidden />
                동행 초대 {index + 1} · 수락 대기
              </span>
              <button
                type="button"
                onClick={() => void cancelInvite(invite.id)}
                disabled={busy || !roundReady}
                className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                초대 취소
              </button>
            </li>
          ))}
        </ul>
      )}

      {roundReady && notice && <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800" role="status">{notice}</p>}
      {roundReady && error && <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-800" role="alert">{error}</p>}
      {readError && (
        <div className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-800" role="alert">
          <p>{readError}</p>
          <button type="button" onClick={() => setReadAttempt((value) => value + 1)} disabled={busy}
            className="mt-2 min-h-11 rounded-xl border border-rose-200 bg-white px-4 disabled:opacity-40">
            기존 초대 다시 확인
          </button>
        </div>
      )}
      {remainingSeats === 0 && (
        <p className="mt-4 inline-flex items-center gap-2 text-xs font-black text-[#8b7e78]"><Copy className="h-4 w-4" aria-hidden />동행 자리 2개가 모두 사용 중이거나 합류 완료됐어요.</p>
      )}
    </section>
  )
}
