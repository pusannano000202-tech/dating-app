'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2, Send, UserCheck, UserPlus, UserX } from 'lucide-react'

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

  const pendingReceived = state.received.filter((r) => r.status === 'pending')
  const pendingSent = state.sent.filter((r) => r.status === 'pending')

  return (
    <main className="min-h-screen px-5 pb-10">
      <div className="max-w-md mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href="/group/create" className="p-2 glass rounded-xl">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black">친구</h1>
            <p className="text-xs text-gray-500 mt-0.5">친구를 만들어야 그룹을 꾸릴 수 있어요.</p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {success}
          </div>
        )}

        <section className="glass-card rounded-3xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-black">전화번호로 친구 추가</h2>
              <p className="text-xs text-gray-600 mt-0.5">상대방이 가입하면 자동으로 매칭돼요.</p>
            </div>
            <UserPlus size={18} className="text-violet-300" />
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
              className="flex-1 min-w-0 glass rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 border border-white/10 focus:outline-none focus:border-violet-500"
            />
            <button
              type="button"
              onClick={sendRequest}
              disabled={saving || !phone.trim()}
              className="h-12 w-12 rounded-2xl btn-gradient flex items-center justify-center disabled:opacity-40"
              aria-label="친구 요청 보내기"
            >
              <Send size={17} />
            </button>
          </div>
        </section>

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            친구 정보를 불러오는 중
          </section>
        ) : (
          <>
            {pendingReceived.length > 0 && (
              <section className="mb-5">
                <h2 className="text-sm font-black mb-2 px-1">받은 요청 {pendingReceived.length}</h2>
                <div className="space-y-2">
                  {pendingReceived.map((req) => (
                    <div key={req.id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-violet-500/10 flex items-center justify-center text-sm font-black text-violet-200">
                        {req.sender_user_id.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">친구 {req.sender_user_id.slice(0, 8)}</p>
                        {req.message && (
                          <p className="text-xs text-gray-500 truncate mt-0.5">{req.message}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => acceptRequest(req.id)}
                        disabled={saving}
                        className="px-3 py-2 rounded-xl text-xs font-bold border border-violet-400/30 text-violet-200 bg-violet-400/10 disabled:opacity-40"
                      >
                        수락
                      </button>
                      <button
                        type="button"
                        onClick={() => declineRequest(req.id)}
                        disabled={saving}
                        className="p-2 rounded-xl text-gray-500 hover:text-gray-300 disabled:opacity-40"
                        aria-label="거절"
                      >
                        <UserX size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mb-5">
              <div className="flex items-center justify-between px-1 mb-2">
                <h2 className="text-sm font-black">친구 목록</h2>
                <span className="text-xs text-gray-600">{state.friends.length}명</span>
              </div>
              {state.friends.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-gray-500">
                  아직 친구가 없어요. 전화번호로 친구를 초대해보세요.
                </div>
              ) : (
                <div className="space-y-2">
                  {state.friends.map((friend) => (
                    <div key={friend.user_id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-white/[0.08] flex items-center justify-center text-sm font-black">
                        {(friend.display_name ?? friend.user_id).slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">
                          {friend.display_name ?? `친구 ${friend.user_id.slice(0, 8)}`}
                        </p>
                        <p className="text-[10px] text-gray-600">{friend.status}</p>
                      </div>
                      <UserCheck size={16} className="text-emerald-300" />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {pendingSent.length > 0 && (
              <section className="mb-5">
                <h2 className="text-sm font-black mb-2 px-1">보낸 요청 {pendingSent.length}</h2>
                <div className="space-y-2">
                  {pendingSent.map((req) => (
                    <div key={req.id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-amber-400/10 flex items-center justify-center text-sm font-black text-amber-200">
                        ?
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">
                          {req.receiver_user_id
                            ? `친구 ${req.receiver_user_id.slice(0, 8)}`
                            : req.receiver_phone ?? '대상 없음'}
                        </p>
                        <p className="text-[10px] text-amber-300">수락 대기</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => cancelRequest(req.id)}
                        disabled={saving}
                        className="px-3 py-2 rounded-xl text-xs text-gray-400 border border-white/15 hover:border-white/25 disabled:opacity-40"
                      >
                        취소
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
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
