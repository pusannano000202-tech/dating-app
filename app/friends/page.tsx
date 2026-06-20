'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ChevronLeft,
  Clock3,
  Loader2,
  Phone,
  Send,
  UserCheck,
  UserPlus,
  UserRoundPlus,
  UserX,
  UsersRound,
} from 'lucide-react'

interface FriendRequestRow {
  id: string
  sender_user_id: string
  receiver_user_id: string | null
  receiver_phone: string | null
  token: string
  status: string
  message: string | null
  expires_at: string
  responded_at: string | null
  created_at: string
  sender_display_name?: string | null
  receiver_display_name?: string | null
}

interface FriendSummary {
  user_id: string
  display_name: string | null
  status: string
}

interface FriendsState {
  sent: FriendRequestRow[]
  received: FriendRequestRow[]
  friends: FriendSummary[]
  current_user_id?: string
}

const EMPTY: FriendsState = { sent: [], received: [], friends: [] }

export default function FriendsPage() {
  const [state, setState] = useState<FriendsState>(EMPTY)
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/friend-requests')
      if (res.status === 401) {
        setError('로그인이 필요해요.')
        return
      }
      if (!res.ok) {
        setError('친구 정보를 불러오지 못했어요.')
        return
      }
      const data = await res.json() as FriendsState
      setState(data)
    } catch {
      setError('친구 정보를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function sendRequest() {
    const trimmed = phone.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/friend-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_phone: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }

      const data = await res.json() as { duplicate?: boolean }
      setSuccess(data.duplicate ? '이미 보낸 요청이 있어요.' : '친구 요청을 보냈어요.')
      setPhone('')
      window.setTimeout(() => setSuccess(null), 2500)
      await refresh()
    } catch {
      setError('요청을 보내지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function acceptRequest(id: string) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/friend-requests/${encodeURIComponent(id)}/accept`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('수락에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function declineRequest(id: string) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/friend-requests/${encodeURIComponent(id)}/decline`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('거절에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelRequest(id: string) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/friend-requests/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('취소에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  const pendingReceived = useMemo(
    () => state.received.filter((request) => request.status === 'pending'),
    [state.received]
  )
  const pendingSent = useMemo(
    () => state.sent.filter((request) => request.status === 'pending'),
    [state.sent]
  )

  return (
    <main className="min-h-screen booting-band px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <header className="mb-6 flex items-center gap-3">
          <Link
            href="/group/create"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-boot-hairline bg-white/90 text-boot-body shadow-sm"
            aria-label="그룹으로 돌아가기"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-boot-primary">Invite</p>
            <h1 className="text-2xl font-black">친구 초대</h1>
            <p className="mt-0.5 text-xs leading-5 text-boot-muted">
              이메일 로그인 기준에서는 링크 초대가 가장 빠릅니다.
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <section className="glass-card mb-5 rounded-3xl border border-boot-primary/20 bg-white/95 p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <UsersRound size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black leading-tight">그룹 초대 링크로 바로 모으기</h2>
              <p className="mt-1 text-sm leading-6 text-boot-muted">
                친구가 앱에 가입하지 않았어도 링크를 먼저 보내면 됩니다. 친구는 로그인 후 그 링크에서 바로 그룹에 들어옵니다.
              </p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2">
            <MiniStep number="1" label="그룹 만들기" />
            <MiniStep number="2" label="링크 보내기" />
            <MiniStep number="3" label="친구 수락" />
          </div>

          <Link
            href="/group/create"
            className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black"
          >
            그룹 초대 링크 만들기
            <ArrowRight size={17} />
          </Link>
          <p className="mt-3 text-center text-[11px] leading-5 text-boot-muted">
            그룹 화면에서 `초대 링크 복사`를 누르면 카카오톡이나 메시지로 바로 보낼 수 있어요.
          </p>
        </section>

        <section className="mb-5 rounded-3xl border border-boot-hairline bg-white/90 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">전화번호로 친구 요청</h2>
              <p className="mt-0.5 text-xs leading-5 text-boot-muted">
                이미 서로 번호를 알고 있을 때만 보조로 사용합니다.
              </p>
            </div>
            <Phone size={18} className="text-boot-primary" />
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={saving}
              className="min-w-0 flex-1 rounded-2xl border border-boot-hairline bg-white px-4 py-3 text-sm text-boot-ink placeholder-boot-muted focus:border-boot-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={sendRequest}
              disabled={saving || !phone.trim()}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-boot-primary/20 bg-boot-soft text-boot-primary disabled:opacity-40"
              aria-label="친구 요청 보내기"
            >
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            </button>
          </div>
        </section>

        {loading ? (
          <section className="glass-card flex items-center gap-3 rounded-3xl border border-boot-hairline bg-white/85 p-5 text-sm text-boot-muted">
            <Loader2 size={18} className="animate-spin" />
            친구 정보를 불러오는 중
          </section>
        ) : (
          <>
            {pendingReceived.length > 0 && (
              <section className="mb-5">
                <SectionTitle title="받은 요청" count={pendingReceived.length} />
                <div className="space-y-2">
                  {pendingReceived.map((request) => {
                    const senderName = request.sender_display_name ?? `친구 ${request.sender_user_id.slice(0, 8)}`
                    return (
                      <div key={request.id} className="glass-card flex items-center gap-3 rounded-2xl border border-boot-hairline bg-white/90 px-4 py-3 shadow-sm">
                        <InitialBadge value={senderName} tone="primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black">{senderName}</p>
                          {request.message ? (
                            <p className="mt-0.5 truncate text-xs text-boot-muted">{request.message}</p>
                          ) : (
                            <p className="mt-0.5 text-xs text-boot-muted">친구 요청을 보냈어요.</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => acceptRequest(request.id)}
                          disabled={saving}
                          className="rounded-xl border border-boot-primary/25 bg-boot-soft px-3 py-2 text-xs font-bold text-boot-primary disabled:opacity-40"
                        >
                          수락
                        </button>
                        <button
                          type="button"
                          onClick={() => declineRequest(request.id)}
                          disabled={saving}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-boot-hairline text-boot-muted disabled:opacity-40"
                          aria-label="거절"
                        >
                          <UserX size={15} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            <section className="mb-5">
              <SectionTitle title="친구 목록" count={state.friends.length} />
              {state.friends.length === 0 ? (
                <EmptyFriends />
              ) : (
                <div className="space-y-2">
                  {state.friends.map((friend) => (
                    <div key={friend.user_id} className="glass-card flex items-center gap-3 rounded-2xl border border-boot-hairline bg-white/90 px-4 py-3 shadow-sm">
                      <InitialBadge value={friend.display_name ?? friend.user_id} tone="soft" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">
                          {friend.display_name ?? `친구 ${friend.user_id.slice(0, 8)}`}
                        </p>
                        <p className="mt-0.5 text-[11px] text-boot-muted">친구 등록 완료</p>
                      </div>
                      <UserCheck size={17} className="text-emerald-600" />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {pendingSent.length > 0 && (
              <section className="mb-5">
                <SectionTitle title="보낸 요청" count={pendingSent.length} />
                <div className="space-y-2">
                  {pendingSent.map((request) => {
                    const receiverName = request.receiver_display_name
                      ?? (request.receiver_user_id ? `친구 ${request.receiver_user_id.slice(0, 8)}` : request.receiver_phone ?? '대상 없음')
                    return (
                      <div key={request.id} className="glass-card flex items-center gap-3 rounded-2xl border border-boot-hairline bg-white/90 px-4 py-3 shadow-sm">
                        <InitialBadge value={receiverName} tone="amber" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black">{receiverName}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700">
                            <Clock3 size={12} />
                            수락 대기
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => cancelRequest(request.id)}
                          disabled={saving}
                          className="rounded-xl border border-boot-hairline px-3 py-2 text-xs font-bold text-boot-muted disabled:opacity-40"
                        >
                          취소
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function MiniStep({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-2xl border border-boot-hairline bg-boot-soft/70 px-2 py-3 text-center">
      <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-black text-boot-primary shadow-sm">
        {number}
      </span>
      <span className="mt-2 block text-[10px] font-black text-boot-body">{label}</span>
    </div>
  )
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <h2 className="text-sm font-black">{title}</h2>
      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-boot-muted">
        {count}개
      </span>
    </div>
  )
}

function InitialBadge({ value, tone }: { value: string; tone: 'primary' | 'soft' | 'amber' }) {
  const classes = {
    primary: 'border-boot-primary/20 bg-boot-soft text-boot-primary',
    soft: 'border-boot-hairline bg-white text-boot-body',
    amber: 'border-amber-300/25 bg-amber-500/10 text-amber-700',
  }

  return (
    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border text-sm font-black ${classes[tone]}`}>
      {value.slice(0, 1).toUpperCase()}
    </div>
  )
}

function EmptyFriends() {
  return (
    <div className="rounded-3xl border border-dashed border-boot-primary/25 bg-white/80 px-4 py-5 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
        <UserRoundPlus size={20} />
      </div>
      <p className="mt-3 text-sm font-black">아직 등록된 친구가 없어요</p>
      <p className="mt-1 text-xs leading-5 text-boot-muted">
        괜찮아요. 지금은 친구 등록보다 그룹 초대 링크로 바로 초대하는 흐름이 더 빠릅니다.
      </p>
      <Link
        href="/group/create"
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-boot-primary/25 bg-boot-soft px-4 py-2 text-xs font-bold text-boot-primary"
      >
        그룹 초대하러 가기
        <ArrowRight size={14} />
      </Link>
    </div>
  )
}

function translateError(code?: string) {
  switch (code) {
    case 'cannot_send_to_self': return '자기 자신에게는 보낼 수 없어요.'
    case 'receiver_required':   return '전화번호를 입력해주세요.'
    case 'not_receiver':        return '본인에게 온 요청만 처리할 수 있어요.'
    case 'not_sender':          return '본인이 보낸 요청만 취소할 수 있어요.'
    case 'request_not_pending': return '이미 처리된 요청이에요.'
    case 'request_expired':     return '만료된 요청이에요.'
    case 'request_not_found':   return '요청을 찾을 수 없어요.'
    default:                    return '처리에 실패했어요. 잠시 후 다시 시도해주세요.'
  }
}
