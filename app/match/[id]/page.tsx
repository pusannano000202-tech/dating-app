'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, Loader2, LockKeyhole, MapPin, Navigation, Phone, Users } from 'lucide-react'
import { DEPOSIT_AMOUNT } from '@/lib/constants'

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

export default function MatchDetailPage() {
  const params = useParams<{ id: string }>()
  const matchId = params.id
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connections, setConnections] = useState<ConnectionRow[]>([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)
  const [attendance, setAttendance] = useState<AttendanceState | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsMessage, setGpsMessage] = useState<string | null>(null)
  const [cardText, setCardText] = useState('')
  const [cardSaving, setCardSaving] = useState(false)
  const [depositSaving, setDepositSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
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
      setCardText(data.match.my_card_content_text ?? '')
    } catch {
      setError('매칭 정보를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const refreshConnections = useCallback(async () => {
    setConnectionsLoading(true)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/connections`)
      if (res.ok) {
        const data = await res.json() as { connections: ConnectionRow[] }
        setConnections(data.connections ?? [])
      }
    } catch {
      // ignore - connections는 보조 정보
    } finally {
      setConnectionsLoading(false)
    }
  }, [matchId])

  useEffect(() => {
    if (match?.match_status === 'confirmed' || match?.match_status === 'completed') {
      refreshConnections()
    } else {
      setConnections([])
    }
  }, [match?.match_status, refreshConnections])

  const refreshAttendance = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/attendance-state`)
      if (res.ok) {
        const data = await res.json() as { state: AttendanceState | null }
        setAttendance(data.state)
      }
    } catch {
      // ignore
    }
  }, [matchId])

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
      setGpsMessage('이 브라우저는 GPS 를 지원하지 않아요.')
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
            setGpsMessage(`✅ 체크인 완료 (장소에서 ${d}m)`)
          } else {
            const d = Math.round(json.result?.distance_m ?? 0)
            setGpsMessage(`⚠️ 장소에서 ${d}m 떨어져 있어요. 더 가까이 가서 다시 시도해주세요.`)
          }
          await refreshAttendance()
        } finally {
          setGpsBusy(false)
        }
      },
      (err) => {
        setGpsBusy(false)
        if (err.code === err.PERMISSION_DENIED) setGpsMessage('위치 권한이 거부됐어요.')
        else if (err.code === err.POSITION_UNAVAILABLE) setGpsMessage('위치를 가져올 수 없어요.')
        else setGpsMessage('GPS 오류가 발생했어요.')
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  async function handleFinalize() {
    if (gpsBusy) return
    if (!window.confirm('노쇼 처리하기? 현재 출석 안 된 사람의 보증금이 forfeit 됩니다.')) return
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
        const pool = json.result?.total_forfeited_amount ?? 0
        if (ns === 0) {
          setGpsMessage(`✅ 모두 출석. 노쇼 없음 (출석자 ${at}명).`)
        } else {
          setGpsMessage(`🚨 노쇼 ${ns}명 forfeit. 출석자 ${at}명에게 ${pool.toLocaleString()}원 분배됨.`)
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
      case 'match_not_active':       return '활성 매칭이 아니에요.'
      case 'meeting_not_scheduled':  return '약속 시간/장소가 아직 배정되지 않았어요.'
      case 'too_early_to_checkin':   return '아직 체크인할 시간이 아니에요 (약속 30분 전부터).'
      case 'too_late_to_checkin':    return '체크인 가능 시간이 지났어요.'
      case 'too_early_to_finalize':  return '약속 시간 + 30분 후에만 처리 가능.'
      case 'caller_not_attendee':    return '출석자만 노쇼 처리할 수 있어요.'
      case 'not_match_participant':  return '본인이 참여한 매칭만 가능.'
      default:                         return code ?? '처리 실패'
    }
  }

  async function confirmMatch() {
    if (saving || !match?.my_group_ready) return
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
      setError('확정에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelMatch() {
    if (saving) return
    if (!window.confirm('매칭을 취소할까요?')) return
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
      setError('취소에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function saveCard() {
    if (cardSaving || !match) return
    const trimmed = cardText.trim()
    if (trimmed.length < 10 || trimmed.length > 500) {
      setError('카드는 10자 이상 500자 이하로 작성해주세요.')
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

  async function payDeposit() {
    if (depositSaving || !match) return
    setDepositSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: match.my_group_id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateMatchError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('보증금 결제에 실패했어요.')
    } finally {
      setDepositSaving(false)
    }
  }

  function translateMatchError(code?: string) {
    switch (code) {
      case 'not_match_leader':    return '리더만 확정/취소할 수 있어요.'
      case 'match_not_pending':   return '이미 처리된 매칭이에요.'
      case 'match_not_cancelable': return '취소할 수 없는 매칭이에요.'
      case 'match_card_incomplete': return '우리 그룹 전원이 카드를 작성해야 확정할 수 있어요.'
      case 'deposit_not_paid':    return '우리 그룹 전원이 보증금을 결제해야 확정할 수 있어요.'
      case 'invalid_card_content': return '카드는 10자 이상 500자 이하로 작성해주세요.'
      case 'deposit_already_exists': return '이미 결제한 보증금이 있어요.'
      case 'not_group_member':    return '그룹 멤버만 보증금을 결제할 수 있어요.'
      default:                     return '처리에 실패했어요. 잠시 후 다시 시도해주세요.'
    }
  }

  return (
    <main className="min-h-screen px-5 pb-10">
      <div className="max-w-md mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href="/match" className="p-2 glass rounded-xl">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-black">매칭 상세</h1>
            <p className="text-xs text-gray-500 mt-0.5">상대 그룹 정보 + 다음 단계 안내</p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            매칭 정보를 불러오는 중
          </section>
        ) : match ? (
          <>
            <section className="glass-card rounded-3xl p-5 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-violet-500/15 border border-violet-400/20 flex items-center justify-center">
                  <Users size={22} className="text-violet-200" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">상대 그룹</p>
                  <p className="text-lg font-black">
                    {match.opp_group_size}명 · {match.opp_group_gender === 'male' ? '남자' : '여자'}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <Row label="매칭 시각" value={formatDateTime(match.matched_at)} />
                <Row
                  label="내 측 확정"
                  value={match.my_confirmed_at ? formatDateTime(match.my_confirmed_at) : '대기'}
                  highlight={!!match.my_confirmed_at}
                />
                <Row
                  label="상대 측 확정"
                  value={match.opp_confirmed_at ? formatDateTime(match.opp_confirmed_at) : '대기'}
                  highlight={!!match.opp_confirmed_at}
                />
                {match.confirmed_at && (
                  <Row label="양측 확정 시각" value={formatDateTime(match.confirmed_at)} />
                )}
                {match.completed_at && (
                  <Row label="완료 시각" value={formatDateTime(match.completed_at)} />
                )}
                <Row label="상태" value={translateStatus(match.match_status)} highlight />
              </div>
            </section>

            <section className="glass rounded-3xl p-4 mb-4">
              {match.scheduled_start ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <CalendarClock size={18} className="text-rose-200 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500">약속 시간</p>
                      <p className="text-sm font-bold mt-0.5">
                        {formatDateTime(match.scheduled_start)}
                      </p>
                      {match.scheduled_end && (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          ~ {formatDateTime(match.scheduled_end)}
                        </p>
                      )}
                      <p className="text-[11px] text-rose-300 mt-1">
                        {formatCountdown(match.scheduled_start)}
                      </p>
                    </div>
                  </div>
                  {match.venue_name && (
                    <div className="flex items-start gap-3 pt-3 border-t border-white/10">
                      <MapPin size={18} className="text-violet-200 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500">장소</p>
                        <p className="text-sm font-bold mt-0.5 truncate">{match.venue_name}</p>
                        {match.venue_address && (
                          <p className="text-[11px] text-gray-500 mt-0.5 break-keep">
                            {match.venue_address}
                          </p>
                        )}
                        {match.venue_map_url && (
                          <a
                            href={match.venue_map_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-1 text-[11px] px-2 py-1 rounded-lg border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                          >
                            지도로 열기
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <CalendarClock size={18} className="text-rose-200" />
                  <div>
                    <p className="text-sm font-bold">만남 정보</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      시간·장소는 매칭 엔진이 자동 확정해요. 곧 알림으로 전달돼요.
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.06] px-4 py-3 flex items-start gap-3 mb-4">
              <LockKeyhole size={16} className="text-emerald-300 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-200">상대 사진은 만남 시점에 공개</p>
                <p className="mt-0.5 text-[11px] text-gray-500 leading-relaxed">
                  실제 만남 시점까지 상대 그룹 멤버의 이름·사진은 공개되지 않아요.
                </p>
              </div>
            </section>

            {match.match_status === 'pending' && (
              <section className="glass-card rounded-3xl p-5 mb-4">
                <div className="mb-4">
                  <p className="text-sm font-bold">가매칭 확정 준비</p>
                  <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                    먼저 각자 상대에게 공개될 카드를 작성하고, 그다음 보증금을 결제해요.
                    우리 그룹 전원이 완료하면 리더가 확정할 수 있어요.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <ProgressPill
                    label="우리 카드"
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

                <label className="block text-xs font-bold text-gray-300 mb-2">
                  내 카드
                </label>
                <textarea
                  value={cardText}
                  onChange={(event) => setCardText(event.target.value)}
                  maxLength={500}
                  rows={5}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-gray-100 outline-none focus:border-violet-400/40 resize-none"
                  placeholder="좋아하는 음식, 주말 취향, 대화 스타일처럼 익명으로 공개해도 되는 내용을 적어주세요."
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-gray-600">
                    {cardText.trim().length}/500
                    {match.my_card_submitted_at ? ` · 저장됨 ${formatDateTime(match.my_card_submitted_at)}` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={saveCard}
                    disabled={cardSaving || cardText.trim().length < 10}
                    className="px-3 py-2 rounded-xl text-xs font-bold border border-violet-400/30 bg-violet-500/10 text-violet-200 disabled:opacity-40"
                  >
                    {cardSaving ? '저장 중' : '카드 저장'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={payDeposit}
                  disabled={depositSaving || match.my_group_deposit_paid_count >= match.my_group_active_count}
                  className="mt-4 w-full py-3 rounded-2xl text-sm font-bold border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 disabled:opacity-40"
                >
                  {match.my_group_deposit_paid_count >= match.my_group_active_count
                    ? '우리 그룹 보증금 결제 완료'
                    : `보증금 ${DEPOSIT_AMOUNT.toLocaleString()}원 결제 (mock)`}
                </button>

                {!match.my_group_ready && (
                  <p className="mt-3 text-center text-xs text-amber-300/80">
                    우리 그룹 전원이 카드와 보증금을 완료하면 확정 버튼이 열려요.
                  </p>
                )}
              </section>
            )}

            {/* 매칭 액션: pending 일 때 confirm/cancel, confirmed 일 때 cancel 만 */}
            {match.match_status === 'pending' && !match.my_confirmed_at && (
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={confirmMatch}
                  disabled={saving || !match.my_group_ready}
                  className="btn-gradient flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-40"
                >
                  매칭 확정 (리더)
                </button>
                <button
                  type="button"
                  onClick={cancelMatch}
                  disabled={saving}
                  className="flex-1 py-3 rounded-2xl text-sm text-gray-300 border border-white/15 hover:border-white/25 disabled:opacity-40"
                >
                  거절
                </button>
              </div>
            )}
            {match.match_status === 'pending' && match.my_confirmed_at && !match.opp_confirmed_at && (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 mb-2">
                내 측은 확정 완료. 상대 그룹 리더의 확정을 기다리는 중이에요.
              </div>
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
                    <p className="text-sm font-bold text-rose-200">
                      {attendance.caller_is_no_show
                        ? '노쇼로 처리됐어요'
                        : '이번 매칭에 노쇼가 발생했어요'}
                    </p>
                    <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">
                      {attendance.caller_is_no_show
                        ? '약속 장소 GPS 체크인이 확인되지 않아 보증금이 forfeit 됐어요. 환불 / 이어가기 / 평가 흐름은 진입할 수 없어요.'
                        : '약속 장소에 안 나타난 사람의 보증금이 forfeit 되어 출석자에게 균등 분배됐어요. 만남이 정상적으로 이어지지 않아 환불 선택 / 평가는 생략돼요.'}
                    </p>
                    <p className="mt-2 text-[11px] text-gray-500">
                      자세한 내역은 알림에서 확인하세요.
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
                  이어갈지 선택하기
                </Link>
                <Link
                  href={`/match/${encodeURIComponent(matchId)}/review`}
                  className="w-full py-3 rounded-2xl text-sm border border-white/15 text-gray-300 hover:border-white/30 text-center"
                >
                  만남 평가 작성
                </Link>
              </div>
            ) : null}

            {/* GPS 체크인 + 노쇼 처리 패널 — confirmed/completed + 약속 시간 도달 후 */}
            {(match.match_status === 'confirmed' || match.match_status === 'completed')
              && attendance?.scheduled_start
              && new Date(attendance.scheduled_start).getTime() - 30 * 60_000 <= Date.now()
              && (
              <section className="glass-card rounded-3xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Navigation size={16} className="text-emerald-300" />
                  <h3 className="text-sm font-bold">출석 확인 (GPS)</h3>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div className="rounded-2xl border border-white/10 px-3 py-2">
                    <p className="text-gray-500">내 체크인</p>
                    <p className="mt-0.5 font-bold">
                      {attendance.my_checked_in
                        ? attendance.my_within_radius
                          ? <span className="text-emerald-300">✓ 출석 확인</span>
                          : <span className="text-amber-300">⚠️ 범위 밖</span>
                        : <span className="text-gray-400">미체크</span>}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 px-3 py-2">
                    <p className="text-gray-500">출석률</p>
                    <p className="mt-0.5 font-bold text-violet-200">
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
                    {attendance.my_checked_in ? '다시 체크인' : '약속 장소 도착 → 체크인'}
                  </button>

                  {attendance.finalize_available && (
                    <button
                      type="button"
                      onClick={handleFinalize}
                      disabled={gpsBusy}
                      className="py-3 rounded-2xl text-sm border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      <AlertTriangle size={14} />
                      🚨 안 나타난 사람 노쇼 처리
                    </button>
                  )}
                </div>

                {gpsMessage && (
                  <p className="mt-3 text-xs text-gray-300 leading-relaxed text-center">{gpsMessage}</p>
                )}

                <p className="mt-3 text-[10px] text-gray-600 leading-relaxed">
                  💡 양쪽 모두 출석 = 구걸 환불 흐름. 누군가 노쇼 = 노쇼 보증금 forfeit + 출석자 균등 분배.
                </p>
              </section>
            )}

            {/* 자동 핸드폰 공개 패널 — status=confirmed 부터 노출 */}
            {(match.match_status === 'confirmed' || match.match_status === 'completed') && (
              <section className="glass-card rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Phone size={16} className="text-emerald-300" />
                  <h3 className="text-sm font-bold">상대 핸드폰 (약속 시간 자동 공개)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                  배정된 약속 시간이 되면 상대 그룹 멤버의 핸드폰 번호가 자동으로 공개돼요.
                  당일 늦거나 못 찾을 때 바로 연락할 수 있어요.
                </p>

                {connectionsLoading && connections.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 size={14} className="animate-spin" />
                    불러오는 중
                  </div>
                ) : connections.length === 0 ? (
                  <p className="text-xs text-gray-600">상대 그룹 멤버 정보를 불러올 수 없어요.</p>
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
                              : 'border-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold truncate">
                                {c.target_display_name ?? '이름 미설정'}
                              </p>
                              {revealed && c.target_phone ? (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-200">
                                  <Phone size={12} />
                                  <a href={`tel:${c.target_phone}`} className="font-bold tracking-wider">
                                    {c.target_phone}
                                  </a>
                                </div>
                              ) : scheduledFuture ? (
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  {formatDateTime(c.scheduled_reveal_at!)} 자동 공개
                                </p>
                              ) : (
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  약속 시간 배정 전 (매칭 엔진 대기 중)
                                </p>
                              )}
                            </div>
                            {revealed && (
                              <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 flex-shrink-0">
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
            <p className="text-sm text-gray-300">매칭 정보가 없어요.</p>
          </section>
        )}
      </div>
    </main>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-violet-200' : 'text-gray-300'}`}>{value}</span>
    </div>
  )
}

function ProgressPill({ label, current, total }: { label: string; current: number; total: number }) {
  const done = total > 0 && current >= total
  return (
    <div className={`rounded-2xl border px-3 py-2 ${
      done
        ? 'border-emerald-400/25 bg-emerald-500/10'
        : 'border-white/10 bg-white/[0.03]'
    }`}>
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${done ? 'text-emerald-200' : 'text-gray-300'}`}>
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
      if (elapsedHours < 1) return '시작 시각 도달'
      if (elapsedHours < 24) return `${elapsedHours}시간 경과`
      return `${Math.floor(elapsedHours / 24)}일 경과`
    }
    const days = Math.floor(diffMs / 86_400_000)
    const hours = Math.floor((diffMs % 86_400_000) / 3_600_000)
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000)
    if (days >= 1) return `D-${days} (${hours}시간 후)`
    if (hours >= 1) return `${hours}시간 ${minutes}분 후`
    return `${minutes}분 후`
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

function translateStatus(status: string): string {
  switch (status) {
    case 'pending':   return '대기 중'
    case 'confirmed': return '확정'
    case 'completed': return '완료'
    case 'cancelled': return '취소됨'
    case 'no_show':   return '노쇼'
    default:           return status
  }
}
