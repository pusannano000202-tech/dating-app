'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, Clock3, Gift, Loader2, LockKeyhole, MapPin, MessageCircle, Navigation, Phone, Sparkles, Users } from 'lucide-react'
import DailyCardHintWizard from '@/components/matching/DailyCardHintWizard'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'
import {
  buildDailyCardSubmissionText,
  countCompletedDailyCardItems,
  createDailyCardDraftFromSubmissionText,
  createEmptyDailyCardDraft,
  decodeDailyCardDebateAnswers,
  encodeDailyCardDebateAnswers,
  type DailyCardDraft,
  type DailyCardFieldId,
} from '@/lib/matching/daily-card-authoring'
import { getDevMatchPreviewStatus } from '@/lib/matching/dev-match-preview'

interface MatchDetail {
  match_id: string
  my_group_id: string
  opp_group_id: string
  opp_group_size: number
  opp_group_gender: 'male' | 'female'
  match_status: string
  matched_at: string
  confirmed_at: string | null
  completed_at: string | null
  my_confirmed_at: string | null
  opp_confirmed_at: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  venue_name: string | null
  venue_address: string | null
  venue_map_url: string | null
  my_card_submitted_at: string | null
  my_card_content_text: string | null
  my_group_active_count: number
  my_group_card_submitted_count: number
  my_group_deposit_paid_count: number
  my_group_ready: boolean
  opp_group_active_count: number
  opp_group_card_submitted_count: number
  opp_group_deposit_paid_count: number
  opp_group_ready: boolean
}

interface ConnectionRow {
  target_user_id: string
  target_display_name: string | null
  contact_revealed_at: string | null
  scheduled_reveal_at: string | null
  target_phone: string | null
}

interface AttendanceState {
  my_checked_in: boolean
  my_within_radius: boolean
  total_participants: number
  attendee_count: number
  scheduled_start: string | null
  finalize_available: boolean
  no_show_finalized: boolean
  caller_is_no_show: boolean
}

interface DailyCard {
  id: string
  day_offset: number
  reveal_at: string
  reveal_window_start: string
  reveal_window_end: string
  revealed: boolean
  can_pick: boolean
  selected_at: string | null
  forfeited_at: string | null
  alias: string
  card_kind: string
  title: string
  content_text: string | null
  selected_slot?: number | null
}

type DailyCardVisualState = 'available' | 'picked' | 'missed' | 'locked'

const MINIMUM_DAILY_CARD_ITEMS_TO_SAVE = 4

function createDevMatchDetail(matchId: string): MatchDetail {
  const isPending = getDevMatchPreviewStatus(matchId) === 'pending'
  const start = new Date(Date.now() + 1000 * 60 * 60 * 26)
  const end = new Date(start.getTime() + 1000 * 60 * 90)

  return {
    match_id: matchId,
    my_group_id: 'dev-group-1',
    opp_group_id: 'dev-group-2',
    opp_group_size: 3,
    opp_group_gender: 'female',
    match_status: isPending ? 'pending' : 'confirmed',
    matched_at: new Date().toISOString(),
    confirmed_at: isPending ? null : new Date().toISOString(),
    completed_at: null,
    my_confirmed_at: isPending ? null : new Date().toISOString(),
    opp_confirmed_at: isPending ? null : new Date().toISOString(),
    scheduled_start: isPending ? null : start.toISOString(),
    scheduled_end: isPending ? null : end.toISOString(),
    venue_name: isPending ? null : 'PNU Station Cafe',
    venue_address: isPending ? null : 'Busan National University',
    venue_map_url: isPending ? null : 'https://map.naver.com',
    my_card_submitted_at: null,
    my_card_content_text: '첫 만남 전에 우리 그룹 분위기를 짧게 적어볼게요.',
    my_group_active_count: 3,
    my_group_card_submitted_count: 2,
    my_group_deposit_paid_count: 3,
    my_group_ready: !isPending,
    opp_group_active_count: 3,
    opp_group_card_submitted_count: 2,
    opp_group_deposit_paid_count: 3,
    opp_group_ready: !isPending,
  }
}

const DEV_CONNECTIONS: ConnectionRow[] = [
  {
    target_user_id: 'dev-opp-1',
    target_display_name: 'Preview A',
    contact_revealed_at: null,
    scheduled_reveal_at: new Date(Date.now() + 1000 * 60 * 60 * 26).toISOString(),
    target_phone: null,
  },
  {
    target_user_id: 'dev-opp-2',
    target_display_name: 'Preview B',
    contact_revealed_at: null,
    scheduled_reveal_at: new Date(Date.now() + 1000 * 60 * 60 * 26).toISOString(),
    target_phone: null,
  },
]

const DEV_ATTENDANCE: AttendanceState = {
  my_checked_in: false,
  my_within_radius: false,
  total_participants: 6,
  attendee_count: 0,
  scheduled_start: new Date(Date.now() + 1000 * 60 * 60 * 26).toISOString(),
  finalize_available: false,
  no_show_finalized: false,
  caller_is_no_show: false,
}

const DEV_DAILY_CARDS: DailyCard[] = [
  {
    id: 'dev-card-picked',
    day_offset: -3,
    reveal_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    reveal_window_start: new Date(Date.now() - 1000 * 60 * 60 * 52).toISOString(),
    reveal_window_end: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    revealed: true,
    can_pick: false,
    selected_at: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    forfeited_at: null,
    alias: 'A',
    card_kind: 'music',
    title: '첫 플레이리스트',
    content_text: '상대 그룹은 조용한 인디 음악보다 같이 따라 부를 수 있는 노래를 좋아해요.',
    selected_slot: 2,
  },
  {
    id: 'dev-card-today',
    day_offset: -1,
    reveal_at: new Date().toISOString(),
    reveal_window_start: new Date().toISOString(),
    reveal_window_end: new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString(),
    revealed: true,
    can_pick: true,
    selected_at: null,
    forfeited_at: null,
    alias: 'B',
    card_kind: 'pre_meeting_question',
    title: '만나기 전 질문',
    content_text: '상대는 처음 만나면 맛집 이야기보다 여행지 이야기로 분위기를 여는 편이에요.',
    selected_slot: null,
  },
  {
    id: 'dev-card-missed',
    day_offset: -2,
    reveal_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    reveal_window_start: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    reveal_window_end: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    revealed: false,
    can_pick: false,
    selected_at: null,
    forfeited_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    alias: 'C',
    card_kind: 'preference',
    title: '취향 힌트',
    content_text: null,
    selected_slot: null,
  },
  {
    id: 'dev-card-locked',
    day_offset: -1,
    reveal_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    reveal_window_start: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    reveal_window_end: new Date(Date.now() + 1000 * 60 * 60 * 28).toISOString(),
    revealed: false,
    can_pick: false,
    selected_at: null,
    forfeited_at: null,
    alias: 'D',
    card_kind: 'vibe',
    title: '분위기 카드',
    content_text: null,
    selected_slot: null,
  },
]

export default function MatchDetailPage() {
  const params = useParams<{ id: string }>()
  const matchId = params.id
  const isDevPreview = isDevPreviewClientSession() || matchId.startsWith('dev-match')
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connections, setConnections] = useState<ConnectionRow[]>([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)
  const [attendance, setAttendance] = useState<AttendanceState | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsMessage, setGpsMessage] = useState<string | null>(null)
  const [cardDraft, setCardDraft] = useState<DailyCardDraft>(() => createEmptyDailyCardDraft())
  const [cardSaving, setCardSaving] = useState(false)
  const [depositSaving, setDepositSaving] = useState(false)
  const [dailyCards, setDailyCards] = useState<DailyCard[]>([])
  const [dailyCardsLoading, setDailyCardsLoading] = useState(false)
  const [dailyCardPicking, setDailyCardPicking] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (isDevPreview) {
      const devMatch = createDevMatchDetail(matchId)
      setMatch(devMatch)
      setCardDraft(createDailyCardDraftFromSubmissionText(devMatch.my_card_content_text))
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}`)
      if (res.status === 401) {
        setError('로그인이 필요해요.')
        return
      }
      if (res.status === 404) {
        setError('매칭을 찾을 수 없어요.')
        return
      }
      if (!res.ok) {
        setError('매칭 정보를 불러오지 못했어요.')
        return
      }
      const data = await res.json() as { match: MatchDetail }
      setMatch(data.match)
      setCardDraft(createDailyCardDraftFromSubmissionText(data.match.my_card_content_text))
    } catch {
      setError('매칭 정보를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [isDevPreview, matchId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const refreshConnections = useCallback(async () => {
    setConnectionsLoading(true)
    if (isDevPreview) {
      setConnections(DEV_CONNECTIONS)
      setConnectionsLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/connections`)
      if (res.ok) {
        const data = await res.json() as { connections: ConnectionRow[] }
        setConnections(data.connections ?? [])
      }
    } catch {
      // ignore - contact reveal is a secondary layer
    } finally {
      setConnectionsLoading(false)
    }
  }, [isDevPreview, matchId])

  useEffect(() => {
    if (match?.match_status === 'confirmed' || match?.match_status === 'completed') {
      refreshConnections()
    } else {
      setConnections([])
    }
  }, [match?.match_status, refreshConnections])

  const refreshDailyCards = useCallback(async () => {
    setDailyCardsLoading(true)
    if (isDevPreview) {
      setDailyCards(DEV_DAILY_CARDS)
      setDailyCardsLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/daily-cards`)
      if (res.ok) {
        const data = await res.json() as { cards: DailyCard[] }
        setDailyCards(data.cards ?? [])
      }
    } catch {
      // ignore - cards are a progressive reveal layer
    } finally {
      setDailyCardsLoading(false)
    }
  }, [isDevPreview, matchId])

  useEffect(() => {
    if (match?.scheduled_start) {
      refreshDailyCards()
    } else {
      setDailyCards([])
    }
  }, [match?.scheduled_start, refreshDailyCards])

  const refreshAttendance = useCallback(async () => {
    if (isDevPreview) {
      setAttendance(DEV_ATTENDANCE)
      return
    }

    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/attendance-state`)
      if (res.ok) {
        const data = await res.json() as { state: AttendanceState | null }
        setAttendance(data.state)
      }
    } catch {
      // ignore
    }
  }, [isDevPreview, matchId])

  useEffect(() => {
    if (match?.match_status === 'confirmed' || match?.match_status === 'completed') {
      refreshAttendance()
      const id = setInterval(refreshAttendance, 60_000)
      return () => clearInterval(id)
    }
  }, [match?.match_status, refreshAttendance])

  async function handleCheckin() {
    if (gpsBusy) return
    if (!navigator.geolocation) {
      setGpsMessage('이 브라우저는 GPS를 지원하지 않아요.')
      return
    }
    setGpsBusy(true)
    setGpsMessage(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          })
          const json = await res.json().catch(() => ({})) as { result?: { within_radius?: boolean; distance_m?: number }; error?: string }
          if (!res.ok) {
            setGpsMessage(translateGpsError(json.error))
          } else if (json.result?.within_radius) {
            const d = Math.round(json.result.distance_m ?? 0)
            setGpsMessage(`체크인 완료. 장소에서 ${d}m 떨어져 있어요.`)
          } else {
            const d = Math.round(json.result?.distance_m ?? 0)
            setGpsMessage(`장소에서 ${d}m 떨어져 있어요. 더 가까이 가서 다시 시도해 주세요.`)
          }
          await refreshAttendance()
        } finally {
          setGpsBusy(false)
        }
      },
      (err) => {
        setGpsBusy(false)
        if (err.code === err.PERMISSION_DENIED) setGpsMessage('위치 권한이 거부됐어요.')
        else if (err.code === err.POSITION_UNAVAILABLE) setGpsMessage('현재 위치를 가져올 수 없어요.')
        else setGpsMessage('GPS 오류가 발생했어요.')
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  async function handleFinalize() {
    if (gpsBusy) return
    if (!window.confirm('미도착 처리를 할까요? 노쇼로 확정되면 보증금 환불이 제한될 수 있습니다.')) return
    setGpsBusy(true)
    setGpsMessage(null)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/finalize-no-show`, { method: 'POST' })
      const json = await res.json().catch(() => ({})) as { result?: { no_show_count?: number; attendee_count?: number; total_forfeited_amount?: number }; error?: string }
      if (!res.ok) {
        setGpsMessage(translateGpsError(json.error))
      } else {
        const ns = json.result?.no_show_count ?? 0
        const at = json.result?.attendee_count ?? 0
        if (ns === 0) {
          setGpsMessage(`모두 도착했어요. 미도착자는 없어요. 도착 인원 ${at}명.`)
        } else {
          setGpsMessage(`미도착 ${ns}명 기록 완료. 도착 인원 ${at}명.`)
        }
      }
      await refreshAttendance()
    } finally {
      setGpsBusy(false)
    }
  }

  function translateGpsError(code?: string): string {
    switch (code) {
      case 'gps_required':           return 'GPS 좌표가 필요해요.'
      case 'match_not_active':       return '진행 중인 매칭이 아니에요.'
      case 'meeting_not_scheduled':  return '약속 시간과 장소가 아직 정해지지 않았어요.'
      case 'too_early_to_checkin':   return '아직 체크인할 시간이 아니에요. 약속 30분 전부터 가능해요.'
      case 'too_late_to_checkin':    return '체크인 가능한 시간이 지났어요.'
      case 'too_early_to_finalize':  return '약속 시간 30분 뒤부터 미도착 처리가 가능해요.'
      case 'caller_not_attendee':    return '참석자로 등록된 사용자만 처리할 수 있어요.'
      case 'not_match_participant':  return '내가 참여한 매칭에서만 사용할 수 있어요.'
      default:                       return code ?? '처리에 실패했어요.'
    }
  }

  async function confirmMatch() {
    if (saving || !match?.my_group_ready) return

    if (isDevPreview) {
      const start = new Date(Date.now() + 1000 * 60 * 60 * 26)
      const end = new Date(start.getTime() + 1000 * 60 * 90)
      const now = new Date().toISOString()
      setMatch((current) => current
        ? {
            ...current,
            match_status: 'confirmed',
            confirmed_at: now,
            my_confirmed_at: now,
            opp_confirmed_at: now,
            scheduled_start: start.toISOString(),
            scheduled_end: end.toISOString(),
            venue_name: 'PNU Station Cafe',
            venue_address: 'Busan National University',
            venue_map_url: 'https://map.naver.com',
            my_group_ready: true,
            opp_group_ready: true,
          }
        : current)
      setError(null)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/confirm`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateMatchError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('매칭 확정에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelMatch() {
    if (saving) return
    if (!window.confirm('매칭을 취소할까요?')) return

    if (isDevPreview) {
      setMatch((current) => current ? { ...current, match_status: 'cancelled' } : current)
      setError(null)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateMatchError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('매칭 취소에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function saveCard() {
    if (cardSaving || !match) return
    const trimmed = buildDailyCardSubmissionText(cardDraft).trim()
    if (
      completedDailyCardItemCount < MINIMUM_DAILY_CARD_ITEMS_TO_SAVE
      || trimmed.length < 10
      || trimmed.length > 500
    ) {
      setError('사전 힌트는 4개 이상 작성하고, 전체 길이는 500자 이하로 맞춰주세요.')
      return
    }

    if (isDevPreview) {
      const now = new Date().toISOString()
      setMatch((current) => {
        if (!current) return current
        const nextCardCount = Math.max(current.my_group_card_submitted_count, current.my_group_active_count)
        const nextReady = nextCardCount >= current.my_group_active_count
          && current.my_group_deposit_paid_count >= current.my_group_active_count
        return {
          ...current,
          my_card_content_text: trimmed,
          my_card_submitted_at: now,
          my_group_card_submitted_count: nextCardCount,
          my_group_ready: nextReady,
        }
      })
      setError(null)
      return
    }

    setCardSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_text: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateMatchError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('카드 저장에 실패했어요.')
    } finally {
      setCardSaving(false)
    }
  }

  async function pickDailyCard(selectedSlot: number) {
    if (dailyCardPicking) return
    setDailyCardPicking(selectedSlot)
    setError(null)

    if (isDevPreview) {
      window.setTimeout(() => {
        setDailyCards((cards) => cards.map((card) => (
          card.can_pick
            ? {
                ...card,
                can_pick: false,
                revealed: true,
                selected_at: new Date().toISOString(),
                selected_slot: selectedSlot,
              }
            : card
        )))
        setDailyCardPicking(null)
      }, 220)
      return
    }

    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/daily-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_slot: selectedSlot }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateDailyCardError(data.error))
        return
      }
      await refreshDailyCards()
    } catch {
      setError('오늘 카드를 뽑지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setDailyCardPicking(null)
    }
  }

  async function payDeposit() {
    if (depositSaving || !match) return

    if (isDevPreview) {
      setMatch((current) => {
        if (!current) return current
        const nextDepositCount = Math.max(current.my_group_deposit_paid_count, current.my_group_active_count)
        const nextReady = current.my_group_card_submitted_count >= current.my_group_active_count
          && nextDepositCount >= current.my_group_active_count
        return {
          ...current,
          my_group_deposit_paid_count: nextDepositCount,
          my_group_ready: nextReady,
        }
      })
      setError(null)
      return
    }

    setDepositSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: match.my_group_id }),
      })
      if (res.status === 202) {
        const data = await res.json().catch(() => ({})) as { payment?: { checkoutUrl?: string | null } }
        if (data.payment?.checkoutUrl) {
          window.location.href = data.payment.checkoutUrl
          return
        }
        setError('결제창 주소를 만들지 못했어요. Toss 테스트 키와 결제 설정을 확인해 주세요.')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateMatchError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('보증금 결제 확인에 실패했어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setDepositSaving(false)
    }
  }

  function translateMatchError(code?: string) {
    switch (code) {
      case 'not_match_leader':    return '그룹 리더만 확정하거나 취소할 수 있어요.'
      case 'match_not_pending':   return '이미 처리된 매칭이에요.'
      case 'match_not_cancelable': return '지금은 취소할 수 없는 매칭이에요.'
      case 'match_card_incomplete': return '우리 그룹 카드 작성이 끝나야 확정할 수 있어요.'
      case 'deposit_not_paid':    return '우리 그룹의 보증금 결제가 끝나야 확정할 수 있어요.'
      case 'invalid_card_content': return '카드는 10자 이상 500자 이하로 작성해 주세요.'
      case 'deposit_already_exists': return '이미 보증금 결제가 확인됐어요.'
      case 'not_group_member':    return '그룹 멤버만 보증금 결제를 할 수 있어요.'
      case 'invalid_deposit_amount': return '보증금 금액이 올바르지 않아요.'
      case 'payment_provider_not_configured': return '결제 제공자 설정이 아직 연결되지 않았어요.'
      default:                     return '처리에 실패했어요. 잠시 뒤 다시 시도해 주세요.'
    }
  }

  function translateDailyCardError(code?: string) {
    if (code?.includes('no_draw_available')) return '지금 뽑을 수 있는 카드가 없어요. 오늘 16:00-20:00 사이에 다시 확인해 주세요.'
    if (code?.includes('not_match_participant')) return '내가 참여한 매칭의 카드만 뽑을 수 있어요.'
    if (code?.includes('match_not_found')) return '매칭을 찾을 수 없어요.'
    return '오늘 카드를 뽑지 못했어요.'
  }

  function getDailyCardVisualState(card: DailyCard): DailyCardVisualState {
    if (card.selected_at) return 'picked'
    if (card.forfeited_at) return 'missed'
    if (card.can_pick) return 'available'
    return 'locked'
  }

  function getDailyCardStatusLabel(state: DailyCardVisualState): string {
    switch (state) {
      case 'available': return '오늘 뽑기'
      case 'picked': return '공개 완료'
      case 'missed': return '기회 지나감'
      case 'locked': return '잠김'
    }
  }

  function updateDailyCardDraft(fieldId: DailyCardFieldId, value: string) {
    setCardDraft((current) => ({
      ...current,
      [fieldId]: value,
    }))
    setError(null)
  }

  function updateDailyCardDebateAnswer(promptId: string, value: string) {
    setCardDraft((current) => {
      const currentAnswers = decodeDailyCardDebateAnswers(current.debate)
      return {
        ...current,
        debate: encodeDailyCardDebateAnswers({
          ...currentAnswers,
          [promptId]: value,
        }),
      }
    })
    setError(null)
  }

  function getDailyCardShellClass(state: DailyCardVisualState): string {
    switch (state) {
      case 'available': return 'border-boot-primary/25 bg-boot-soft'
      case 'picked': return 'border-emerald-400/25 bg-emerald-500/[0.06]'
      case 'missed': return 'border-amber-400/25 bg-amber-500/[0.08]'
      case 'locked': return 'border-boot-hairline bg-white/80'
    }
  }

  function getDailyCardIconClass(state: DailyCardVisualState): string {
    switch (state) {
      case 'available': return 'border-boot-primary/25 bg-white text-boot-primary'
      case 'picked': return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700'
      case 'missed': return 'border-amber-400/30 bg-amber-500/10 text-amber-700'
      case 'locked': return 'border-boot-hairline bg-white text-boot-muted'
    }
  }

  function getDailyCardBadgeClass(state: DailyCardVisualState): string {
    switch (state) {
      case 'available': return 'border-boot-primary/25 bg-white text-boot-primary'
      case 'picked': return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700'
      case 'missed': return 'border-amber-400/30 bg-amber-500/10 text-amber-700'
      case 'locked': return 'border-boot-hairline bg-white/80 text-boot-muted'
    }
  }

  function getDailyCardSortRank(card: DailyCard): number {
    const state = getDailyCardVisualState(card)
    if (state === 'available') return 0
    if (state === 'picked') return 1
    if (state === 'locked') return 2
    return 3
  }

  const dailyCardSubmissionText = buildDailyCardSubmissionText(cardDraft)
  const completedDailyCardItemCount = countCompletedDailyCardItems(cardDraft)
  const dailyCardTooLong = dailyCardSubmissionText.length > 500
  const canSaveDailyCard =
    completedDailyCardItemCount >= MINIMUM_DAILY_CARD_ITEMS_TO_SAVE
    && dailyCardSubmissionText.trim().length >= 10
    && !dailyCardTooLong

  return (
    <main className="min-h-screen px-5 pb-28">
      <div className="max-w-md mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href="/match" className="p-2 glass rounded-xl">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-black">매칭 상세</h1>
            <p className="text-xs text-boot-muted mt-0.5">오늘 할 일과 공개 카드를 한 번에 확인해요</p>
          </div>
        </header>

        <section className="mb-4 rounded-2xl border border-boot-primary/25 bg-white/90 px-4 py-3">
          <p className="text-xs font-black text-boot-primary">지금 이 화면에서 할 수 있는 것</p>
          <p className="mt-1 text-xs text-boot-muted leading-relaxed">
            준비 중인 매칭은 카드 작성과 보증금 결제를 먼저 끝내고, 확정된 매칭은 오늘 공개 카드를 뽑아보면 돼요.
          </p>
          <p className="mt-1 text-[11px] text-boot-muted">
            아래 카드와 버튼은 실제 동선 검토용으로 바로 눌러볼 수 있게 정리했습니다.
          </p>
        </section>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-boot-muted">
            <Loader2 size={18} className="animate-spin" />
            매칭 정보를 불러오는 중
          </section>
        ) : match ? (
          <>
            <section className="glass-card rounded-3xl p-5 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-boot-soft border border-boot-hairline flex items-center justify-center">
                  <Users size={22} className="text-boot-primary" />
                </div>
                <div>
                  <p className="text-xs text-boot-muted">상대 그룹</p>
                  <p className="text-lg font-black">
                    {match.opp_group_size}명 · {match.opp_group_gender === 'male' ? '남자' : '여자'}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <Row label="매칭 생성" value={formatDateTime(match.matched_at)} />
                <Row
                  label="우리 그룹 확정"
                  value={match.my_confirmed_at ? formatDateTime(match.my_confirmed_at) : '미확인'}
                  highlight={!!match.my_confirmed_at}
                />
                <Row
                  label="상대 그룹 확정"
                  value={match.opp_confirmed_at ? formatDateTime(match.opp_confirmed_at) : '미확인'}
                  highlight={!!match.opp_confirmed_at}
                />
                {match.confirmed_at && (
                  <Row label="양쪽 확정" value={formatDateTime(match.confirmed_at)} />
                )}
                {match.completed_at && (
                  <Row label="완료 시간" value={formatDateTime(match.completed_at)} />
                )}
                <Row label="상태" value={translateStatus(match.match_status)} highlight />
              </div>
            </section>

            <section className="glass rounded-3xl p-4 mb-4">
              {match.scheduled_start ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <CalendarClock size={18} className="text-boot-coral mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-boot-muted">약속 시간</p>
                      <p className="text-sm font-bold mt-0.5">
                        {formatDateTime(match.scheduled_start)}
                      </p>
                      {match.scheduled_end && (
                        <p className="text-[11px] text-boot-muted mt-0.5">
                          ~ {formatDateTime(match.scheduled_end)}
                        </p>
                      )}
                      <p className="text-[11px] text-boot-coral mt-1">
                        {formatCountdown(match.scheduled_start)}
                      </p>
                    </div>
                  </div>
                  {match.venue_name && (
                    <div className="flex items-start gap-3 pt-3 border-t border-boot-hairline">
                      <MapPin size={18} className="text-boot-primary mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-boot-muted">장소</p>
                        <p className="text-sm font-bold mt-0.5 truncate">{match.venue_name}</p>
                        {match.venue_address && (
                          <p className="text-[11px] text-boot-muted mt-0.5 break-keep">
                            {match.venue_address}
                          </p>
                        )}
                        {match.venue_map_url && (
                          <a
                            href={match.venue_map_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-1 text-[11px] px-2 py-1 rounded-lg border border-boot-primary/25 bg-boot-soft text-boot-primary hover:bg-boot-soft"
                          >
                            지도 열기
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <CalendarClock size={18} className="text-boot-coral" />
                  <div>
                    <p className="text-sm font-bold">만남 정보</p>
                    <p className="text-xs text-boot-muted mt-0.5">
                      확정 전에는 시간과 장소가 아직 정해지지 않았어요. 준비를 마치면 다음 단계에서 확인할 수 있어요.
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.06] px-4 py-3 flex items-start gap-3 mb-4">
              <LockKeyhole size={16} className="text-emerald-700 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-black text-emerald-700">매칭 진행 가이드</p>
                <p className="mt-0.5 text-[11px] text-boot-muted leading-relaxed">
                  이 화면에서 카드 작성, 보증금 결제, 매칭 확정을 순서대로 눌러볼 수 있어요.
                </p>
              </div>
            </section>

            {match.match_status === 'pending' && (
              <section className="glass-card rounded-3xl p-5 mb-4">
                <div className="mb-4">
                  <p className="text-sm font-bold">매칭 준비하기</p>
                  <p className="mt-1 text-xs text-boot-muted leading-relaxed">
                    상대가 확정한 뒤에 누르는 흐름이 아니라, 지금부터 내 준비를 먼저 만들어요.
                    카드 입력과 보증금 결제가 모두 준비되어야 확정 버튼이 활성화돼요.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <ProgressPill
                    label="내 카드"
                    current={match.my_group_card_submitted_count}
                    total={match.my_group_active_count}
                  />
                  <ProgressPill
                    label="우리 보증금"
                    current={match.my_group_deposit_paid_count}
                    total={match.my_group_active_count}
                  />
                  <ProgressPill
                    label="상대 카드"
                    current={match.opp_group_card_submitted_count}
                    total={match.opp_group_active_count}
                  />
                  <ProgressPill
                    label="상대 보증금"
                    current={match.opp_group_deposit_paid_count}
                    total={match.opp_group_active_count}
                  />
                </div>

                <DailyCardHintWizard
                  draft={cardDraft}
                  completedCount={completedDailyCardItemCount}
                  minimumToSave={MINIMUM_DAILY_CARD_ITEMS_TO_SAVE}
                  totalCount={6}
                  submittedAt={match.my_card_submitted_at}
                  canSave={canSaveDailyCard}
                  tooLong={dailyCardTooLong}
                  saving={cardSaving}
                  onTextChange={updateDailyCardDraft}
                  onDebateAnswer={updateDailyCardDebateAnswer}
                  onSave={saveCard}
                  formatSubmittedAt={formatDateTime}
                />

                <div className="mt-3 rounded-2xl border border-boot-hairline bg-white/70 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black text-boot-primary">그룹 전체 카드 작성</p>
                    <p className="text-xs font-black text-boot-ink">
                      {match.my_group_card_submitted_count}/{match.my_group_active_count}명 완료
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-boot-muted">
                    지금 화면은 내 카드 항목을 채우는 곳이고, 그룹 전체 완료 여부는 멤버별로 따로 집계됩니다.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={payDeposit}
                  disabled={depositSaving || match.my_group_deposit_paid_count >= match.my_group_active_count}
                  className="mt-4 w-full py-3 rounded-2xl text-sm font-bold border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 disabled:opacity-40"
                >
                  {match.my_group_deposit_paid_count >= match.my_group_active_count
                    ? '우리 그룹 보증금 결제 완료'
                    : '보증금 결제하기'}
                </button>

                {!match.my_group_ready && (
                  <p className="mt-3 text-center text-xs text-amber-700/80">
                    준비가 끝나면 아래 확정 버튼을 누를 수 있어요.
                  </p>
                )}
              </section>
            )}

            {/* Match actions */}
            {match.match_status === 'pending' && !match.my_confirmed_at && (
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={confirmMatch}
                  disabled={saving || !match.my_group_ready}
                  className="btn-gradient flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-40"
                >
                  매칭 확정하기
                </button>
                <button
                  type="button"
                  onClick={cancelMatch}
                  disabled={saving}
                  className="flex-1 py-3 rounded-2xl text-sm text-boot-body border border-boot-hairline hover:border-boot-primary/30 disabled:opacity-40"
                >
                  나중에 하기
                </button>
              </div>
            )}
            {match.match_status === 'pending' && match.my_confirmed_at && !match.opp_confirmed_at && (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 mb-2">
                우리 그룹은 확정 완료. 상대 그룹 리더의 확인을 기다리는 중이에요.
              </div>
            )}
            {(match.match_status === 'confirmed' || match.match_status === 'completed') && (
              <Link
                href={`/match/${encodeURIComponent(matchId)}/chat`}
                className="mb-2 w-full py-3 rounded-2xl text-sm border border-boot-primary/25 bg-boot-soft text-boot-primary hover:bg-boot-soft flex items-center justify-center gap-2"
              >
                <MessageCircle size={16} />
                매칭 채팅방 보기
              </Link>
            )}
            {match.match_status === 'confirmed' && (
              <button
                type="button"
                onClick={cancelMatch}
                disabled={saving}
                className="w-full py-3 rounded-2xl text-sm text-red-300/80 border border-red-400/15 hover:border-red-400/30 hover:bg-red-500/5 disabled:opacity-40 mb-4"
              >
                매칭 취소
              </button>
            )}
            {match.match_status === 'completed' && attendance?.no_show_finalized ? (
              <section className="glass-card rounded-3xl p-5 mb-4 border border-rose-400/20 bg-rose-500/[0.04]">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-rose-400 mt-0.5 flex-shrink-0" />
                  <div>
                  <p className="text-sm font-bold text-boot-coral">
                    {attendance.caller_is_no_show
                        ? '내가 노쇼로 처리되면 다음 매칭으로 바로 이동돼요'
                        : '상대가 노쇼 처리하면 우리 그룹도 정산이 완료돼요'}
                    </p>
                    <p className="mt-1.5 text-xs text-boot-muted leading-relaxed">
                      {attendance.caller_is_no_show
                        ? '약속 장소 체크인이 확인되지 않았어요. 노쇼 확정 시 보증금 환불이 제한될 수 있어요.'
                        : '상대 쪽 미도착으로 만남이 정상 진행되지 않았어요. 노쇼 확정 시 상대 보증금이 몰수되고 우리 쪽 정산으로 이어져요.'}
                    </p>
                    <p className="mt-2 text-[11px] text-boot-muted">
                      자세한 내역은 알림에서 확인할 수 있어요.
                    </p>
                  </div>
                </div>
              </section>
            ) : match.match_status === 'completed' ? (
              <div className="flex flex-col gap-2 mb-4">
                <Link
                  href={`/match/${encodeURIComponent(matchId)}/continuation`}
                  className="btn-gradient w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                >
                  이어가기 선택하기
                </Link>
                <Link
                  href={`/match/${encodeURIComponent(matchId)}/review`}
                  className="w-full py-3 rounded-2xl text-sm border border-boot-hairline text-boot-body hover:border-boot-primary/40 text-center"
                >
                  만남 평가 작성
                </Link>
                <p className="text-center text-[11px] leading-5 text-boot-muted">
                  환불/정산은 이어가기 선택 결과에 따라 자동으로 안내돼요.
                </p>
              </div>
            ) : null}

            {match.scheduled_start && (
              <section className="glass-card rounded-3xl border border-boot-hairline p-5 mb-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-boot-primary/20 bg-boot-soft px-2.5 py-1 text-[11px] font-black text-boot-primary">
                      <Clock3 size={12} />
                      16:00-20:00
                    </div>
                    <h3 className="text-base font-black text-boot-ink">오늘의 공개 카드</h3>
                    <p className="mt-1 text-xs leading-relaxed text-boot-muted">
                      16시부터 20시 사이에 카드 하나를 고르면 상대 그룹의 작은 힌트가 열려요.
                    </p>
                  </div>
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-boot-primary/20 bg-white text-boot-primary shadow-sm">
                    <Gift size={19} />
                  </div>
                </div>

                {dailyCardsLoading && dailyCards.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-boot-muted">
                    <Loader2 size={14} className="animate-spin" />
                    카드 일정을 불러오는 중
                  </div>
                ) : dailyCards.length === 0 ? (
                  <p className="text-xs text-boot-muted">
                    약속 시간이 확정되면 데일리카드 일정이 자동으로 만들어져요.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {[...dailyCards].sort((a, b) => getDailyCardSortRank(a) - getDailyCardSortRank(b)).map((card) => {
                      const visualState = getDailyCardVisualState(card)
                      const picked = visualState === 'picked'
                      const missed = visualState === 'missed'
                      const locked = visualState === 'locked'
                      const available = visualState === 'available'
                      return (
                        <div
                          key={card.id}
                          className={`rounded-2xl border px-3 py-3 ${getDailyCardShellClass(visualState)}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border ${getDailyCardIconClass(visualState)}`}>
                              {picked ? <CheckCircle2 size={17} /> : locked ? <LockKeyhole size={16} /> : missed ? <AlertTriangle size={16} /> : <Sparkles size={17} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold text-boot-muted">
                                    {formatDailyCardDay(card.day_offset)}
                                  </p>
                                  <p className="mt-0.5 text-sm font-black text-boot-ink">
                                    {formatCardKind(card.card_kind)}
                                  </p>
                                </div>
                                <span className={`flex-shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${getDailyCardBadgeClass(visualState)}`}>
                                  {getDailyCardStatusLabel(visualState)}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-boot-muted">
                                {formatDateTime(card.reveal_window_start)} ~ {formatTime(card.reveal_window_end)}
                              </p>
                            </div>
                          </div>

              {available ? (
                            <div className="mt-4">
                              <div className="mb-2 flex items-start justify-between gap-2">
                                <p className="text-xs font-bold text-boot-body">지금 공개 카드 고르기</p>
                                <span className="text-[10px] text-boot-muted">한 번 누르면 오늘 카드가 고정돼요</span>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                {[1, 2, 3].map((slot) => (
                                  <button
                                    key={slot}
                                    type="button"
                                    aria-label={`오늘 카드 ${slot}번 뽑기`}
                                    onClick={() => pickDailyCard(slot)}
                                    disabled={!!dailyCardPicking}
                                    className="group relative aspect-[3/4] min-h-[126px] overflow-hidden rounded-2xl border border-boot-primary/20 bg-[radial-gradient(circle_at_24%_18%,rgba(255,90,111,0.18),transparent_28%),radial-gradient(circle_at_82%_68%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(145deg,#fff,#fff4f6)] text-xs font-black text-boot-primary shadow-sm transition hover:-translate-y-1 hover:border-boot-primary/50 hover:shadow-md disabled:translate-y-0 disabled:opacity-50"
                                  >
                                    <span className="absolute inset-x-3 top-3 h-1 rounded-full bg-white/80" />
                                    <span className="absolute -right-6 -top-6 h-16 w-16 rounded-full border border-boot-primary/10" />
                                    <span className="absolute -bottom-7 left-2 h-20 w-20 rounded-full border border-emerald-400/10" />
                                    <span className="relative flex h-full flex-col items-center justify-center gap-2 px-2">
                                      {dailyCardPicking === slot ? (
                                        <Loader2 size={17} className="animate-spin" />
                                      ) : (
                                        <Gift size={18} />
                                      )}
                                      <span className="text-[11px]">카드 {slot}</span>
                                      <span className="text-center text-[10px] leading-4 text-boot-muted">오늘 한 장 열기</span>
                                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-black text-boot-body/80">
                                        {slot === 1 ? 'A' : slot === 2 ? 'B' : 'C'}
                                      </span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : picked ? (
                            <div className="mt-4 rounded-2xl rounded-br-[4px] border border-boot-primary/20 bg-white px-4 py-3 shadow-sm">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-[11px] font-black text-boot-primary">
                                  {card.alias} · {card.title}
                                </p>
                                {card.selected_slot && (
                                  <span className="rounded-full bg-boot-soft px-2 py-1 text-[10px] font-black text-boot-primary">
                                    {card.selected_slot}번 카드
                                  </span>
                                )}
                              </div>
                              <p className="text-xs leading-relaxed text-boot-body whitespace-pre-wrap">
                                {card.content_text || '상대가 아직 카드를 작성하지 않았어요.'}
                              </p>
                            </div>
                          ) : missed ? (
                            <p className="mt-3 rounded-2xl border border-amber-400/20 bg-white/70 px-3 py-2 text-xs leading-relaxed text-amber-700">
                              공개 시간 안에 뽑지 못해 지나간 카드예요. 다음 공개 시간에 다시 뽑을 수 있어요.
                            </p>
                          ) : (
                            <p className="mt-3 rounded-2xl border border-boot-hairline bg-white/80 px-3 py-2 text-xs leading-relaxed text-boot-muted">
                              아직 공개 시간이 아니에요. 다음 16:00-20:00 창에 열립니다.
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {/* GPS check-in and no-show handling */}
            {(match.match_status === 'confirmed' || match.match_status === 'completed')
              && attendance?.scheduled_start
              && new Date(attendance.scheduled_start).getTime() - 30 * 60_000 <= Date.now()
              && (
              <section className="glass-card rounded-3xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Navigation size={16} className="text-emerald-700" />
                  <h3 className="text-sm font-bold">현장 체크인</h3>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div className="rounded-2xl border border-boot-hairline px-3 py-2">
                    <p className="text-boot-muted">내가 체크인했는지</p>
                    <p className="mt-0.5 font-bold">
                      {attendance.my_checked_in
                        ? attendance.my_within_radius
                          ? <span className="text-emerald-700">장소 안</span>
                          : <span className="text-amber-700">범위 밖</span>
                        : <span className="text-boot-muted">미확인</span>}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-boot-hairline px-3 py-2">
                    <p className="text-boot-muted">입장 인원</p>
                    <p className="mt-0.5 font-bold text-boot-primary">
                      {attendance.attendee_count} / {attendance.total_participants}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleCheckin}
                    disabled={gpsBusy}
                    className="btn-gradient py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {gpsBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {attendance.my_checked_in ? '내가 체크인됨' : '현장 체크인'}
                  </button>

                  {attendance.finalize_available && (
                    <button
                      type="button"
                      onClick={handleFinalize}
                      disabled={gpsBusy}
                      className="py-3 rounded-2xl text-sm border border-rose-400/30 bg-rose-500/10 text-boot-coral hover:bg-rose-500/20 flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      <AlertTriangle size={14} />
                      현장 미도착 처리
                    </button>
                  )}
                </div>

                {gpsMessage && (
                  <p className="mt-3 text-xs text-boot-body leading-relaxed text-center">{gpsMessage}</p>
                )}

                <p className="mt-3 text-[10px] text-boot-muted leading-relaxed">
                  양쪽이 모두 도착하면 만남 이후 선택으로 이어지고, 미도착자는 기록으로만 남겨요.
                </p>
              </section>
            )}

            {/* Contact reveal */}
            {(match.match_status === 'confirmed' || match.match_status === 'completed') && (
              <section className="glass-card rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Phone size={16} className="text-emerald-700" />
                  <h3 className="text-sm font-bold">상대 연락처</h3>
                </div>
                <p className="text-xs text-boot-muted mb-3 leading-relaxed">
                  약속 시간이 가까워지면 상대 그룹 연락처가 자동으로 공개돼요.
                  장소를 못 찾거나 늦을 때 바로 연락할 수 있어요.
                </p>

                {connectionsLoading && connections.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-boot-muted">
                    <Loader2 size={14} className="animate-spin" />
                    연락처를 불러오는 중
                  </div>
                ) : connections.length === 0 ? (
                  <p className="text-xs text-boot-muted">아직 공개된 상대 연락처가 없어요.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {connections.map((c) => {
                      const revealed = !!c.contact_revealed_at && !!c.target_phone
                      const scheduledFuture = !revealed && c.scheduled_reveal_at
                            return (
                            <div
                              key={c.target_user_id}
                              className={`rounded-2xl border px-3 py-3 ${
                                revealed
                              ? 'border-emerald-400/30 bg-emerald-500/5'
                              : 'border-boot-hairline'
                          }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold truncate">
                                    {c.target_display_name ?? '상대 멤버'}
                                  </p>
                              {revealed && c.target_phone ? (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                                  <Phone size={12} />
                                  <a href={`tel:${c.target_phone}`} className="font-bold tracking-wider">
                                    {c.target_phone}
                                  </a>
                                </div>
                              ) : scheduledFuture ? (
                                <p className="text-[11px] text-boot-muted mt-0.5">
                                  {formatDateTime(c.scheduled_reveal_at!)} 자동 공개
                                </p>
                              ) : (
                                <p className="text-[11px] text-boot-muted mt-0.5">
                                  약속 시간이 정해지면 공개 예정 시간이 표시돼요.
                                </p>
                              )}
                            </div>
                            {revealed && (
                              <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 border border-emerald-400/30 flex-shrink-0">
                                공개됨
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        ) : (
          <section className="glass rounded-3xl p-5">
            <p className="text-sm text-boot-body">매칭 정보가 없어요.</p>
          </section>
        )}
      </div>
    </main>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-boot-muted">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-boot-primary' : 'text-boot-body'}`}>{value}</span>
    </div>
  )
}

function ProgressPill({ label, current, total }: { label: string; current: number; total: number }) {
  const done = total > 0 && current >= total
  return (
    <div className={`rounded-2xl border px-3 py-2 ${
      done
        ? 'border-emerald-400/25 bg-emerald-500/10'
        : 'border-boot-hairline bg-white/80'
    }`}>
      <p className="text-[11px] text-boot-muted">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${done ? 'text-emerald-700' : 'text-boot-body'}`}>
        {current}/{total}
      </p>
    </div>
  )
}

function formatCountdown(iso: string): string {
  try {
    const target = new Date(iso).getTime()
    const now = Date.now()
    const diffMs = target - now
    if (diffMs <= 0) {
      const elapsedHours = Math.floor(-diffMs / 3_600_000)
      if (elapsedHours < 1) return '방금 전'
      if (elapsedHours < 24) return `${elapsedHours}시간 지남`
      return `${Math.floor(elapsedHours / 24)}일 지남`
    }
    const days = Math.floor(diffMs / 86_400_000)
    const hours = Math.floor((diffMs % 86_400_000) / 3_600_000)
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000)
    if (days >= 1) return `D-${days} (${hours}시간)`
    if (hours >= 1) return `${hours}시간 ${minutes}분`
    return `${minutes}분`
  } catch {
    return ''
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    const yyyy = d.getFullYear()
    const mm = (d.getMonth() + 1).toString().padStart(2, '0')
    const dd = d.getDate().toString().padStart(2, '0')
    const hh = d.getHours().toString().padStart(2, '0')
    const mi = d.getMinutes().toString().padStart(2, '0')
    return `${yyyy}.${mm}.${dd} ${hh}:${mi}`
  } catch {
    return iso
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const hh = d.getHours().toString().padStart(2, '0')
    const mi = d.getMinutes().toString().padStart(2, '0')
    return `${hh}:${mi}`
  } catch {
    return iso
  }
}

function formatDailyCardDay(dayOffset: number): string {
  if (dayOffset === -1) return '어제'
  if (dayOffset < -1) return `D-${Math.abs(dayOffset)}일 전`
  if (dayOffset === 0) return '오늘'
  return `오늘 +${dayOffset}일`
}

function formatCardKind(kind: string): string {
  switch (kind) {
    case 'mbti': return 'MBTI 카드'
    case 'music': return '음악 취향 카드'
    case 'pre_meeting_question': return '사전 질문 카드'
    case 'debate': return '논쟁 카드'
    case 'preference': return '선호도 카드'
    case 'group_preference': return '그룹 선호도 카드'
    case 'relationship_style': return '연애 스타일 카드'
    case 'intro': return '소개 카드'
    case 'vibe': return '분위기 카드'
    default: return kind
  }
}

function translateStatus(status: string): string {
  switch (status) {
    case 'pending':   return '대기'
    case 'confirmed': return '확정'
    case 'completed': return '완료'
    case 'cancelled': return '취소'
    case 'no_show':   return '노쇼'
    default:           return status
  }
}
