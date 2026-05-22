'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Users } from 'lucide-react'

interface MatchRow {
  match_id: string
  my_group_id: string
  opp_group_id: string
  opp_group_size: number
  opp_group_gender: 'male' | 'female'
  match_status: string
  matched_at: string
  confirmed_at: string | null
  scheduled_start: string | null
  venue_name: string | null
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/matches')
      if (res.status === 401) {
        setError('로그인이 필요해요.')
        return
      }
      if (!res.ok) {
        setError('매칭 정보를 불러오지 못했어요.')
        return
      }
      const data = await res.json() as { matches: MatchRow[] }
      setMatches(data.matches ?? [])
    } catch {
      setError('매칭 정보를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <main className="min-h-screen px-5 pb-10">
      <div className="max-w-md mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href="/group/create" className="p-2 glass rounded-xl">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black">매칭 결과</h1>
            <p className="text-xs text-gray-500 mt-0.5">토요일 14:00 이후에 결과가 도착해요.</p>
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
            매칭 정보를 확인하는 중
          </section>
        ) : matches.length === 0 ? (
          <section className="glass rounded-3xl p-5 text-center">
            <div className="h-12 w-12 rounded-2xl bg-white/[0.05] flex items-center justify-center mx-auto mb-3">
              <CalendarClock size={20} className="text-gray-500" />
            </div>
            <p className="text-sm text-gray-300">아직 매칭 결과가 없어요.</p>
            <p className="mt-1 text-xs text-gray-500">
              매칭 큐에 들어간 그룹은 토요일 14:00 자동 매칭을 받아요.
            </p>
            <Link
              href="/group/create"
              className="mt-4 inline-block px-4 py-2 rounded-xl text-xs font-bold border border-violet-400/30 bg-violet-400/10 text-violet-200"
            >
              그룹으로 돌아가기
            </Link>
          </section>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <Link
                key={m.match_id}
                href={`/match/${encodeURIComponent(m.match_id)}`}
                className="glass-card rounded-3xl px-4 py-4 flex items-center gap-3 border border-white/[0.06] hover:border-violet-500/30"
              >
                <div className="h-11 w-11 rounded-2xl bg-violet-500/10 border border-violet-400/20 flex items-center justify-center">
                  <Users size={20} className="text-violet-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">
                    상대 그룹 · {m.opp_group_size}명 · {m.opp_group_gender === 'male' ? '남자' : '여자'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatDate(m.matched_at)} · {translateStatus(m.match_status)}
                  </p>
                  {m.scheduled_start && (
                    <p className="mt-1 text-[11px] text-rose-300 truncate">
                      🕒 {formatDateTime(m.scheduled_start)}
                      {m.venue_name ? ` · ${m.venue_name}` : ''}
                    </p>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-600" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}`
  } catch {
    return iso
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    const mm = (d.getMonth() + 1).toString().padStart(2, '0')
    const dd = d.getDate().toString().padStart(2, '0')
    const hh = d.getHours().toString().padStart(2, '0')
    const mi = d.getMinutes().toString().padStart(2, '0')
    return `${mm}.${dd} ${hh}:${mi}`
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
