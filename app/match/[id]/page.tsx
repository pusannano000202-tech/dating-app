'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CalendarClock, ChevronLeft, Loader2, LockKeyhole, MapPin, Phone, Users } from 'lucide-react'

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
}

interface ConnectionRow {
  target_user_id: string
  target_display_name: string | null
  contact_revealed_at: string | null
  scheduled_reveal_at: string | null
  target_phone: string | null
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

  async function confirmMatch() {
    if (saving) return
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

  function translateMatchError(code?: string) {
    switch (code) {
      case 'not_match_leader':    return '리더만 확정/취소할 수 있어요.'
      case 'match_not_pending':   return '이미 처리된 매칭이에요.'
      case 'match_not_cancelable': return '취소할 수 없는 매칭이에요.'
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

            {/* 매칭 액션: pending 일 때 confirm/cancel, confirmed 일 때 cancel 만 */}
            {match.match_status === 'pending' && !match.my_confirmed_at && (
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={confirmMatch}
                  disabled={saving}
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
            {match.match_status === 'completed' && (
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
