'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CalendarClock, ChevronLeft, Loader2, LockKeyhole, Users } from 'lucide-react'

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
}

export default function MatchDetailPage() {
  const params = useParams<{ id: string }>()
  const matchId = params.id
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
              <div className="flex items-center gap-3">
                <CalendarClock size={18} className="text-rose-200" />
                <div>
                  <p className="text-sm font-bold">만남 정보</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    시간·장소는 매칭 엔진이 자동 확정해요. 곧 알림으로 전달돼요.
                  </p>
                </div>
              </div>
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
                className="w-full py-3 rounded-2xl text-sm text-red-300/80 border border-red-400/15 hover:border-red-400/30 hover:bg-red-500/5 disabled:opacity-40"
              >
                매칭 취소
              </button>
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
