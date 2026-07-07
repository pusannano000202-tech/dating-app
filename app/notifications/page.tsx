'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Gift,
  Heart,
  Loader2,
  MessageSquareText,
  PartyPopper,
  Phone,
  Users,
} from 'lucide-react'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'
import MascotCoachCard from '@/components/theme/MascotCoachCard'
import UniversityMascot from '@/components/theme/UniversityMascot'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'
import { getUniversityLocalDesignProfile } from '@/lib/university-theme'

interface NotificationRow {
  id: string
  kind: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

const DEV_NOTIFICATIONS: NotificationRow[] = [
  {
    id: 'dev-notification-match-delayed',
    kind: 'match_delayed',
    payload: {
      match_mode: 'group',
      group_size: 3,
      queue_minutes: 45,
    },
    read_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
  {
    id: 'dev-notification-solo-match-created',
    kind: 'match_created',
    payload: {
      match_id: 'dev-solo-match-pending',
      match_mode: 'solo',
      opp_group_size: 1,
      opp_group_gender: 'female',
    },
    read_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: 'dev-notification-match-created',
    kind: 'match_created',
    payload: {
      match_id: 'dev-match-pending',
      match_mode: 'group',
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
      match_mode: 'group',
      opp_group_size: 2,
      opp_group_gender: 'male',
      opp_school: '부산대학교',
      opp_department: '기계공학부',
    },
    read_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'dev-notification-daily-card',
    kind: 'daily_card_available',
    payload: {
      match_id: 'dev-match-1',
      reveal_window: '16:00-20:00',
    },
    read_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
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
  const { theme } = useUniversityTheme()
  const localDesign = getUniversityLocalDesignProfile(theme)
  const isDevPreview = isDevPreviewClientSession()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const delayedMatchNotice = items.find((n) => n.kind === 'match_delayed')

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
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
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
      // 알림 읽음 실패는 화면 진행을 막지 않는다.
    }
  }

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 text-boot-ink">
      <div className="max-w-md mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href="/" className="p-2 glass rounded-xl border border-boot-hairline bg-white/80">
            <ChevronLeft size={18} />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-black">알림</h1>
            <p className="text-xs text-gray-500 mt-0.5">{localDesign.notificationTone}</p>
          </div>
          <UniversityMascot kind="avatar" size="sm" className="h-11 w-11 rounded-2xl" />
          {items.some((n) => !n.read_at) && (
            <button
              type="button"
              onClick={markAll}
              disabled={busy}
              className="text-[11px] px-3 py-2 rounded-xl border border-boot-hairline bg-white/80 hover:border-boot-primary/25 text-boot-muted flex items-center gap-1 disabled:opacity-40"
            >
              <CheckCheck size={12} />
              모두 읽음
            </button>
          )}
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {!loading && delayedMatchNotice && (
          <MascotCoachCard
            className="mb-4"
            kind="waiting"
            eyebrow={`${theme.shortName} Matching Update`}
            title="아직 매칭이 안 잡혔어요"
            body={`${localDesign.matchChips.join(' · ')} 생활권을 참고해 조건이 맞는 팀을 계속 찾는 중이에요. 가매칭 전까지 상대 정보와 케미 점수는 열지 않아요.`}
            placeChips={localDesign.matchChips}
          />
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-boot-muted">
            <Loader2 size={18} className="animate-spin" />
            알림 불러오는 중
          </section>
        ) : items.length === 0 ? (
          <section className="glass rounded-3xl p-5 text-center">
            <div className="h-12 w-12 rounded-2xl bg-boot-soft flex items-center justify-center mx-auto mb-3">
              <Bell size={20} className="text-boot-primary" />
            </div>
            <p className="text-sm text-boot-muted">아직 받은 알림이 없어요.</p>
          </section>
        ) : (
          <div className="space-y-3">
            {items.map((n) => {
              const unread = !n.read_at
              const matchId = typeof n.payload?.match_id === 'string' ? n.payload.match_id : null
              return (
                <MatchNotificationCard
                  key={n.id}
                  notification={n}
                  href={getNotificationHref(n.kind, matchId)}
                  unread={unread}
                  onClick={() => unread && markOne(n.id)}
                />
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

function MatchNotificationCard({
  notification,
  href,
  unread,
  onClick,
}: {
  notification: NotificationRow
  href: string
  unread: boolean
  onClick: () => void
}) {
  const isMatchArrival = notification.kind === 'match_created'
  const isSolo = isSoloMatchNotification(notification.payload)

  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        'block rounded-[28px] border px-4 py-4 shadow-[0_14px_34px_rgba(23,20,18,0.07)] transition-colors',
        unread
          ? 'border-boot-primary/20 bg-white hover:border-boot-primary/45'
          : 'border-boot-hairline bg-white/80 hover:border-boot-primary/30',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className={[
          'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl',
          unread ? 'bg-boot-soft text-boot-primary' : 'bg-white text-boot-muted',
        ].join(' ')}>
          <KindIcon kind={notification.kind} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-black">{kindLabel(notification.kind, isSolo)}</p>
            {unread && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-boot-primary" />}
          </div>
          <p className="mt-1 text-xs leading-5 text-boot-muted">{kindSummary(notification.kind, notification.payload)}</p>

          {isMatchArrival && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <CardChip label="상태" value="가매칭 도착" />
              <CardChip label={isSolo ? '상대' : '상대 정보'} value="상세는 확정 후 공개" />
              <CardChip label="내가 할 일" value="사전 카드 작성" />
              <CardChip label="다음 단계" value="보증금 결제 후 확정" />
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-bold text-boot-muted">
            <span>{formatRelative(notification.created_at)}</span>
            <span className="inline-flex items-center gap-1 text-boot-primary">
              확인하기
              <ChevronRight size={13} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function CardChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-boot-hairline bg-boot-soft/55 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-normal text-boot-primary">{label}</p>
      <p className="mt-0.5 break-keep text-xs font-bold leading-5 text-boot-ink">{value}</p>
    </div>
  )
}

function isSoloMatchNotification(payload: Record<string, unknown>): boolean {
  if (payload?.match_mode === 'solo') return true
  if (payload?.opp_group_size === 1) return true
  if (payload?.opponent_group_size === 1) return true
  if (payload?.group_size === 1) return true
  return false
}

function KindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'match_delayed': return <Loader2 size={18} className="animate-spin" />
    case 'match_created': return <Users size={18} />
    case 'match_confirmed': return <PartyPopper size={18} />
    case 'daily_card_available': return <Gift size={18} />
    case 'match_completed': return <CheckCheck size={18} />
    case 'phone_revealed': return <Phone size={18} />
    case 'review_request': return <MessageSquareText size={18} />
    case 'friend_request_received': return <Heart size={18} />
    case 'meeting_reminder': return <Bell size={18} />
    default: return <Bell size={18} />
  }
}

function kindLabel(kind: string, isSolo = false): string {
  if (kind === 'daily_card_available') return '오늘의 데일리카드를 열어보세요!'
  switch (kind) {
    case 'match_delayed': return '아직 매칭이 안 잡혔어요'
    case 'match_created': return isSolo ? '1:1 가매칭이 도착했어요!' : '새 가매칭이 도착했어요!'
    case 'match_confirmed': return '매칭이 확정되었습니다. 축하합니다!'
    case 'match_completed': return '만남이 완료되었어요'
    case 'phone_revealed': return '상대 연락처가 공개됐어요'
    case 'review_request': return '평가를 작성해주세요'
    case 'friend_request_received': return '친구 요청이 도착했어요'
    case 'meeting_reminder': return '약속이 다가오고 있어요'
    case 'continuation_choice_request': return '이 만남, 이어갈래요?'
    case 'both_continue': return '양쪽 모두 이어가기 선택'
    case 'partner_paid_zero': return '보증금 정산'
    case 'refund_processed': return '환불 완료'
    case 'attendance_confirmed': return '출석 확인됨'
    case 'no_show_confirmed': return '노쇼 확정'
    default: return '알림'
  }
}

function kindSummary(kind: string, payload: Record<string, unknown>): string {
  if (kind === 'daily_card_available') {
    return '16시부터 20시 사이에 하루 한 장을 직접 열 수 있어요. 내가 열어야 상대 힌트가 보여요.'
  }

  switch (kind) {
    case 'match_delayed':
      return '조건이 맞는 상대를 계속 찾는 중이에요. 잡히면 사전 카드와 보증금 단계로 바로 안내할게요.'
    case 'match_created':
      return '상대 상세는 확정 후 열려요. 먼저 사전 카드와 보증금을 확인해주세요.'
    case 'match_confirmed':
      return '약속 정보와 오늘의 카드를 확인하세요.'
    case 'match_completed':
      return '평가 작성과 환불 정산으로 이어져요.'
    case 'phone_revealed':
      return '약속 시간이 가까워져 상대 연락처가 공개됐어요.'
    case 'review_request':
      return '5점 별점과 한 줄 후기를 남겨주세요.'
    case 'friend_request_received':
      return '받은 요청을 친구 목록에서 확인하세요.'
    case 'meeting_reminder':
      return '오늘 만남 시간과 장소를 다시 확인해주세요.'
    case 'continuation_choice_request':
      return '이어갈지 선택해주세요. 둘 다 이어가면 정산 화면이 열려요.'
    case 'both_continue':
      return '양쪽 모두 이어가기를 선택했어요. 환불/정산을 진행해주세요.'
    case 'partner_paid_zero': {
      const reasons = Array.isArray(payload?.reasons) ? payload.reasons.join(', ') : ''
      return reasons ? `사유: ${reasons}` : '상대가 앱 기여금을 0원으로 선택했어요.'
    }
    case 'refund_processed': {
      const amt = typeof payload?.refund_amount === 'number' ? payload.refund_amount : 0
      return amt > 0 ? `${amt.toLocaleString()}원 환불 완료.` : '환불 없이 보증금 정산이 완료됐어요.'
    }
    case 'attendance_confirmed': {
      const pool = typeof payload?.forfeited_pool === 'number' ? payload.forfeited_pool : 0
      const ns = typeof payload?.no_show_count === 'number' ? payload.no_show_count : 0
      return ns > 0
        ? `노쇼 ${ns}명, ${pool.toLocaleString()}원 분배 받음.`
        : '양쪽 모두 출석 확인.'
    }
    case 'no_show_confirmed':
      return '약속 장소에 오지 않은 기록이 남았어요. 보증금 환불이 제한될 수 있어요.'
    default:
      return ''
  }
}

function getNotificationHref(kind: string, matchId: string | null) {
  if (!matchId) return '/match'
  if (kind === 'review_request') return `/match/${encodeURIComponent(matchId)}/review`
  if (kind === 'continuation_choice_request') return `/match/${encodeURIComponent(matchId)}/continuation`
  return `/match/${encodeURIComponent(matchId)}`
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
