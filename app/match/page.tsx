'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Sparkles, Users } from 'lucide-react'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'
import NotificationBell from '@/components/NotificationBell'

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

const DEV_MATCHES: MatchRow[] = [
  {
    match_id: 'dev-match-pending',
    my_group_id: 'dev-group-1',
    opp_group_id: 'dev-group-2',
    opp_group_size: 3,
    opp_group_gender: 'female',
    match_status: 'pending',
    matched_at: new Date().toISOString(),
    confirmed_at: null,
    scheduled_start: null,
    venue_name: null,
  },
  {
    match_id: 'dev-match-1',
    my_group_id: 'dev-group-1',
    opp_group_id: 'dev-group-2',
    opp_group_size: 3,
    opp_group_gender: 'female',
    match_status: 'confirmed',
    matched_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
    scheduled_start: new Date(Date.now() + 1000 * 60 * 60 * 26).toISOString(),
    venue_name: 'PNU Station Cafe',
  },
]

export default function MatchesPage() {
  const isDevPreview = isDevPreviewClientSession()
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (isDevPreview) {
      setMatches(DEV_MATCHES)
      setLoading(false)
      return
    }

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
  }, [isDevPreview])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <main className="min-h-screen booting-band px-5 pb-28 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] pt-6 sm:max-w-md">
        <header className="mb-5 flex items-center gap-3">
          <Link href="/" className="glass rounded-xl border border-boot-hairline p-2 text-boot-body hover:text-boot-primary" aria-label="홈으로 돌아가기">
            <ChevronLeft size={18} />
          </Link>
          <div className="flex-1">
            <p className="text-xs font-black text-boot-primary">매칭 허브</p>
            <h1 className="text-2xl font-black">진행 중인 매칭</h1>
            <p className="mt-0.5 text-xs text-boot-muted">
              준비 중인 매칭과 확정된 만남을 여기서 바로 이어갈 수 있어요.
            </p>
          </div>
          <NotificationBell />
        </header>

        <section className="mb-4 rounded-3xl border border-boot-primary/20 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <Sparkles size={19} />
            </div>
            <div>
              <p className="text-sm font-black text-boot-ink">카드를 눌러 다음 할 일을 확인하세요</p>
              <p className="mt-1 text-xs leading-relaxed text-boot-muted">
                대기 상태면 준비를 이어가고, 확정 상태면 오늘 공개 카드와 약속 정보를 확인합니다.
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <section className="glass flex items-center gap-3 rounded-3xl p-5 text-sm text-boot-muted">
            <Loader2 size={18} className="animate-spin" />
            매칭 정보를 확인하는 중
          </section>
        ) : matches.length === 0 ? (
          <section className="glass rounded-3xl p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-boot-primary/15 bg-boot-soft">
              <CalendarClock size={20} className="text-boot-primary" />
            </div>
            <p className="text-sm font-bold text-boot-body">아직 진행 중인 매칭이 없어요</p>
            <p className="mt-1 text-xs text-boot-muted">
              그룹을 만들고 매칭 큐에 들어가면 이곳에 카드가 생겨요.
            </p>
            <Link
              href="/match/start"
              className="mt-4 inline-block rounded-xl border border-boot-primary/25 bg-boot-soft px-4 py-2 text-xs font-bold text-boot-primary"
            >
              매칭 찾기 시작
            </Link>
          </section>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <Link
                key={m.match_id}
                href={`/match/${encodeURIComponent(m.match_id)}`}
                className="group block rounded-3xl border border-boot-hairline bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-boot-primary/40 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-boot-primary/20 bg-boot-soft">
                    {m.match_status === 'pending' ? <Sparkles size={20} className="text-boot-primary" /> : <Users size={21} className="text-boot-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-boot-ink">
                          상대 그룹 {m.opp_group_size}명 · {m.opp_group_gender === 'male' ? '남자' : '여자'}
                        </p>
                        <p className="mt-0.5 text-xs text-boot-muted">
                          {formatDate(m.matched_at)} · {translateStatus(m.match_status)}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${getMatchBadgeClass(m.match_status)}`}>
                        {getMatchActionLabel(m.match_status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-boot-muted">
                      {getMatchActionDescription(m)}
                    </p>
                    {m.scheduled_start && (
                      <p className="mt-2 truncate rounded-xl bg-boot-soft px-3 py-2 text-[11px] font-bold text-boot-primary">
                        약속 {formatDateTime(m.scheduled_start)}
                        {m.venue_name ? ` · ${m.venue_name}` : ''}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={16} className="mt-4 flex-shrink-0 text-boot-muted transition group-hover:translate-x-0.5" />
                </div>
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
    case 'pending': return '준비 중'
    case 'confirmed': return '확정'
    case 'completed': return '완료'
    case 'cancelled': return '취소'
    case 'no_show': return '노쇼'
    default: return status
  }
}

function getMatchActionLabel(status: string): string {
  switch (status) {
    case 'pending': return '준비 이어가기'
    case 'confirmed': return '오늘 카드 확인'
    case 'completed': return '기록 보기'
    case 'cancelled': return '취소됨'
    default: return '확인'
  }
}

function getMatchActionDescription(match: MatchRow): string {
  switch (match.match_status) {
    case 'pending':
      return '카드 작성과 무료 참여 확인을 마치면 매칭 확정 단계로 넘어갈 수 있어요.'
    case 'confirmed':
      return '매칭이 확정됐어요. 오늘 공개 카드, 약속 시간, 장소를 확인해 보세요.'
    case 'completed':
      return '지난 매칭 기록과 후속 선택을 확인할 수 있어요.'
    default:
      return '매칭 상세에서 다음 단계를 확인해 보세요.'
  }
}

function getMatchBadgeClass(status: string): string {
  switch (status) {
    case 'pending': return 'bg-boot-soft text-boot-primary'
    case 'confirmed': return 'bg-emerald-500/10 text-emerald-700'
    case 'completed': return 'bg-white text-boot-muted'
    case 'cancelled': return 'bg-red-50 text-red-600'
    default: return 'bg-white text-boot-muted'
  }
}
