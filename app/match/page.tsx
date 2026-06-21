'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Search, Sparkles, UserPlus, Users } from 'lucide-react'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'
import {
  DEV_PREVIEW_CURRENT_USER_ID,
  DEV_PREVIEW_GROUP,
  DEV_PREVIEW_GROUP_MEMBERS,
} from '@/lib/matching/dev-preview-group'
import MatchingPool, { type PoolStats } from '@/components/MatchingPool'
import CurrentGroupPreview, { type CurrentGroupMember } from '@/components/matching/CurrentGroupPreview'
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

interface GroupSummary {
  group: { size?: number | null; status?: string | null } | null
  members: CurrentGroupMember[]
  current_user_id: string | null
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

const EMPTY_POOL: PoolStats = {
  female: 0,
  male: 0,
  bySize: { '2': { female: 0, male: 0 }, '3': { female: 0, male: 0 } },
}

const DEV_POOL: PoolStats = {
  female: 6,
  male: 8,
  bySize: {
    '2': { female: 3, male: 5 },
    '3': { female: 3, male: 3 },
  },
}

const EMPTY_GROUP_SUMMARY: GroupSummary = {
  group: null,
  members: [],
  current_user_id: null,
}

const DEV_GROUP_SUMMARY: GroupSummary = {
  group: DEV_PREVIEW_GROUP,
  members: DEV_PREVIEW_GROUP_MEMBERS,
  current_user_id: DEV_PREVIEW_CURRENT_USER_ID,
}

export default function MatchesPage() {
  const isDevPreview = isDevPreviewClientSession()
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [poolStats, setPoolStats] = useState<PoolStats>(EMPTY_POOL)
  const [groupSummary, setGroupSummary] = useState<GroupSummary>(EMPTY_GROUP_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (isDevPreview) {
      const params = new URLSearchParams(window.location.search)
      setMatches(params.get('sampleMatches') === '1' ? DEV_MATCHES : [])
      setPoolStats(DEV_POOL)
      setGroupSummary(DEV_GROUP_SUMMARY)
      setLoading(false)
      return
    }

    try {
      const [matchRes, poolRes, groupRes] = await Promise.all([
        fetch('/api/matches'),
        fetch('/api/match-pool/stats'),
        fetch('/api/groups'),
      ])

      if (poolRes.ok) {
        const stats = await poolRes.json() as PoolStats
        setPoolStats(stats)
      }
      if (groupRes.ok) {
        const groupData = await groupRes.json() as GroupSummary
        setGroupSummary({
          group: groupData.group ?? null,
          members: groupData.members ?? [],
          current_user_id: groupData.current_user_id ?? null,
        })
      }

      if (matchRes.status === 401) {
        setError('로그인이 필요해요.')
        return
      }
      if (!matchRes.ok) {
        setError('매칭 정보를 불러오지 못했어요.')
        return
      }
      const data = await matchRes.json() as { matches: MatchRow[] }
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
            <h1 className="text-2xl font-black">매칭 현황</h1>
            <p className="mt-0.5 text-xs text-boot-muted">
              지금 큐에 몇 팀이 있는지 보고, 바로 매칭을 시작할 수 있어요.
            </p>
          </div>
          <NotificationBell />
        </header>

        <section className="mb-5 rounded-3xl border border-boot-primary/20 bg-white px-4 py-4 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <Search size={21} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black leading-tight text-boot-ink">매칭을 찾아주세요!</p>
              <p className="mt-1 text-xs leading-relaxed text-boot-muted">
                친구를 초대하고 성향, 시간, 비중을 끝내면 이번 주 매칭 큐에 들어갈 수 있어요.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <Link
              href="/match/start"
              className="btn-gradient flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
            >
              매칭 찾기
              <ChevronRight size={16} />
            </Link>
            <Link
              href="/friends"
              className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-boot-primary/20 bg-boot-soft px-3 text-xs font-black text-boot-primary"
            >
              <UserPlus size={15} />
              친구 초대
            </Link>
          </div>
          <CurrentGroupPreview
            className="mt-3"
            members={groupSummary.members}
            capacity={groupSummary.group?.size ?? 3}
            currentUserId={groupSummary.current_user_id}
            hasGroup={groupSummary.group != null || groupSummary.members.length > 0}
          />
        </section>

        <section className="mb-5">
          <MatchingPool stats={poolStats} />
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
              먼저 매칭 찾기를 눌러 큐에 들어가면, 사전 힌트 작성과 매칭 카드가 이곳에 생겨요.
            </p>
            <Link
              href="/match/start"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-boot-primary/25 bg-boot-soft px-4 py-2 text-xs font-bold text-boot-primary"
            >
              매칭 찾기 시작
              <ChevronRight size={14} />
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
                          {getMatchCardTitle(m)}
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
      return '카드 작성과 보증금 결제를 마치면 상대팀 상세와 약속 정보가 단계적으로 열려요.'
    case 'confirmed':
      return '매칭이 확정됐어요. 오늘 공개 카드, 약속 시간, 장소를 확인해 보세요.'
    case 'completed':
      return '지난 매칭 기록과 후속 선택을 확인할 수 있어요.'
    default:
      return '매칭 상세에서 다음 단계를 확인해 보세요.'
  }
}

function getMatchCardTitle(match: MatchRow): string {
  if (match.match_status === 'pending') {
    return '가매칭 후보가 도착했어요'
  }

  return `상대 그룹 ${match.opp_group_size}명 · ${match.opp_group_gender === 'male' ? '남자' : '여자'}`
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
