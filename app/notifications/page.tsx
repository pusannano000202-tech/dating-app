'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, ChevronLeft, Heart, Loader2, MessageSquareText, PartyPopper, Phone, Users } from 'lucide-react'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'

interface NotificationRow {
  id: string
  kind: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

const DEV_NOTIFICATIONS: NotificationRow[] = [
  {
    id: 'dev-notification-match-created',
    kind: 'match_created',
    payload: {
      match_id: 'dev-match-pending',
      opp_group_size: 3,
      opp_group_gender: 'female',
    },
    read_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: 'dev-notification-match-confirmed',
    kind: 'match_confirmed',
    payload: {
      match_id: 'dev-match-1',
    },
    read_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'dev-notification-meeting-reminder',
    kind: 'meeting_reminder',
    payload: {
      match_id: 'dev-match-1',
    },
    read_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
]

export default function NotificationsPage() {
  const isDevPreview = isDevPreviewClientSession()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (isDevPreview) {
      setItems(DEV_NOTIFICATIONS)
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/notifications?limit=100')
      if (res.status === 401) {
        setError('로그인이 필요해요.')
        return
      }
      if (!res.ok) {
        setError('알림을 불러오지 못했어요.')
        return
      }
      const data = await res.json() as { notifications: NotificationRow[] }
      setItems(data.notifications ?? [])
    } catch {
      setError('알림을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [isDevPreview])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function markAll() {
    if (busy) return
    setBusy(true)
    try {
      if (isDevPreview) {
        const now = new Date().toISOString()
        setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })))
        return
      }
      await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function markOne(id: string) {
    try {
      if (isDevPreview) {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)))
        return
      }
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: id }),
      })
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)))
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen px-5 pb-28">
      <div className="max-w-md mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href="/" className="p-2 glass rounded-xl">
            <ChevronLeft size={18} />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-black">알림</h1>
            <p className="text-xs text-gray-500 mt-0.5">매칭 진행 상황을 한눈에.</p>
          </div>
          {items.some((n) => !n.read_at) && (
            <button
              type="button"
              onClick={markAll}
              disabled={busy}
              className="text-[11px] px-3 py-2 rounded-xl border border-white/10 hover:border-white/25 text-gray-300 flex items-center gap-1 disabled:opacity-40"
            >
              <CheckCheck size={12} />
              모두 읽음
            </button>
          )}
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            알림 불러오는 중
          </section>
        ) : items.length === 0 ? (
          <section className="glass rounded-3xl p-5 text-center">
            <div className="h-12 w-12 rounded-2xl bg-white/[0.05] flex items-center justify-center mx-auto mb-3">
              <Bell size={20} className="text-gray-500" />
            </div>
            <p className="text-sm text-gray-300">아직 받은 알림이 없어요.</p>
          </section>
        ) : (
          <div className="space-y-2">
            {items.map((n) => {
              const unread = !n.read_at
              const matchId = typeof n.payload?.match_id === 'string' ? n.payload.match_id : null
              const href = matchId
                ? n.kind === 'review_request'
                  ? `/match/${encodeURIComponent(matchId)}/review`
                  : n.kind === 'continuation_choice_request'
                    ? `/match/${encodeURIComponent(matchId)}/continuation`
                    : n.kind === 'refund_processed' || n.kind === 'partner_paid_zero'
                      ? `/match/${encodeURIComponent(matchId)}`
                      : `/match/${encodeURIComponent(matchId)}`
                : '/match'
              return (
                <Link
                  key={n.id}
                  href={href}
                  onClick={() => unread && markOne(n.id)}
                  className={`block rounded-2xl px-4 py-3 border ${
                    unread
                      ? 'border-violet-400/30 bg-violet-500/5'
                      : 'border-white/10 bg-white/[0.02]'
                  } hover:border-violet-400/50`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      unread ? 'bg-violet-500/15 text-violet-200' : 'bg-white/[0.04] text-gray-500'
                    }`}>
                      <KindIcon kind={n.kind} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold truncate">{kindLabel(n.kind)}</p>
                        {unread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{kindSummary(n.kind, n.payload)}</p>
                      <p className="text-[10px] text-gray-600 mt-1">{formatRelative(n.created_at)}</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

function KindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'match_created':   return <Users size={18} />
    case 'match_confirmed': return <PartyPopper size={18} />
    case 'match_completed': return <CheckCheck size={18} />
    case 'phone_revealed':  return <Phone size={18} />
    case 'review_request':  return <MessageSquareText size={18} />
    case 'friend_request_received': return <Heart size={18} />
    case 'meeting_reminder': return <Bell size={18} />
    default:                  return <Bell size={18} />
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'match_created':   return '새 가매칭이 도착했어요'
    case 'match_confirmed': return '매칭이 확정되었습니다. 축하합니다!'
    case 'match_completed': return '만남이 완료됐어요'
    case 'phone_revealed':  return '상대 핸드폰이 공개됐어요'
    case 'review_request':  return '평가를 작성해주세요'
    case 'friend_request_received': return '친구 요청이 도착했어요'
    case 'meeting_reminder': return '약속이 다가오고 있어요'
    case 'continuation_choice_request': return '이 만남, 이어가실래요?'
    case 'both_continue':   return '💜 양쪽 모두 이어가기 선택'
    case 'partner_paid_zero': return '무료 베타 정산 없음'
    case 'refund_processed': return '무료 베타 정산 완료'
    case 'attendance_confirmed': return '✅ 출석 확인됨'
    case 'no_show_confirmed': return '🚨 노쇼 확정'
    default:                  return '알림'
  }
}

function kindSummary(kind: string, payload: Record<string, unknown>): string {
  const size = typeof payload?.opp_group_size === 'number' ? payload.opp_group_size : null
  const gender = payload?.opp_group_gender === 'male' ? '남자' : payload?.opp_group_gender === 'female' ? '여자' : null
  switch (kind) {
    case 'match_created':
      if (size && gender) return `상대 그룹 ${size}명 · ${gender}. 사전 힌트를 작성하고 참여를 확인해주세요.`
      return '사전 힌트를 작성하고 참여를 확인해주세요.'
    case 'match_confirmed': return '약속 정보와 오늘의 카드를 확인하세요.'
    case 'match_completed': return '평가 작성 + 핸드폰 자동 공개.'
    case 'phone_revealed':  return '약속 시간이 되어 상대 핸드폰이 공개됐어요.'
    case 'review_request':  return '5점 별점 + 이슈 chip + 코멘트.'
    case 'friend_request_received': return '받은 요청을 친구 목록에서 확인하세요.'
    case 'meeting_reminder': return '오늘 만남 시간과 장소를 다시 확인해주세요.'
    case 'continuation_choice_request': return '무료 베타 기간에는 이어가기 선택만 기록돼요.'
    case 'both_continue': return '양쪽 모두 이어가기를 선택했어요. 정산 절차는 없어요.'
    case 'partner_paid_zero': {
      const reasons = Array.isArray(payload?.reasons) ? payload.reasons.join(', ') : ''
      return reasons ? `사유: ${reasons}` : '무료 베타라 상대에게 결제 금액 알림을 보내지 않아요.'
    }
    case 'refund_processed': {
      const amt = typeof payload?.refund_amount === 'number' ? payload.refund_amount : 0
      return amt > 0 ? `${amt.toLocaleString()}원 환불 완료.` : '무료 베타라 환불할 금액이 없어요.'
    }
    case 'attendance_confirmed': {
      const pool = typeof payload?.forfeited_pool === 'number' ? payload.forfeited_pool : 0
      const ns = typeof payload?.no_show_count === 'number' ? payload.no_show_count : 0
      return ns > 0
        ? `노쇼 ${ns}명. ${pool.toLocaleString()}원 분배 받음.`
        : '양쪽 모두 출석 확인.'
    }
    case 'no_show_confirmed':
      return '약속 장소에 안 나타난 기록이 남았어요. 무료 베타 기간에는 결제 차감은 없어요.'
    default:                  return ''
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso).getTime()
    const diff = Date.now() - d
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return '방금'
    if (minutes < 60) return `${minutes}분 전`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}일 전`
    return new Date(iso).toLocaleDateString('ko-KR')
  } catch {
    return iso
  }
}
