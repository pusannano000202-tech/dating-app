'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronLeft, ChevronRight, Heart, Loader2, LockKeyhole, Search, Sparkles, UserPlus, Users } from 'lucide-react'
import {
  getDevPreviewGroupSizeFromClient,
  getDevPreviewGroupStatusFromClient,
  isDevPreviewClientSession,
} from '@/lib/dev-match-setup'
import {
  DEV_PREVIEW_CURRENT_USER_ID,
  DEV_PREVIEW_GROUP,
  DEV_PREVIEW_GROUP_MEMBERS,
} from '@/lib/matching/dev-preview-group'
import MatchingPool, { type PoolStats } from '@/components/MatchingPool'
import CurrentGroupPreview, { type CurrentGroupMember } from '@/components/matching/CurrentGroupPreview'
import NotificationBell from '@/components/NotificationBell'
import DarkTeamProgressCard from '@/components/matching/DarkTeamProgressCard'
import LockedOpponentCard from '@/components/matching/LockedOpponentCard'

interface MatchRow {
  match_id: string
  match_mode?: 'group' | 'solo'
  my_group_id: string
  opp_group_id: string
  opp_group_size: number
  opp_group_gender: 'male' | 'female' | 'mixed'
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

const DEV_SOLO_MATCHES: MatchRow[] = [
  {
    match_id: 'dev-solo-match-pending',
    match_mode: 'solo',
    my_group_id: 'dev-solo-user',
    opp_group_id: 'dev-solo-opponent',
    opp_group_size: 1,
    opp_group_gender: 'female',
    match_status: 'pending',
    matched_at: new Date().toISOString(),
    confirmed_at: null,
    scheduled_start: null,
    venue_name: null,
  },
]

const EMPTY_POOL: PoolStats = {
  female: 0,
  male: 0,
  mixed: 0,
  solo: {
    female: 0,
    male: 0,
  },
  bySize: {
    '2': { female: 0, male: 0, mixed: 0 },
    '3': { female: 0, male: 0, mixed: 0 },
  },
}

const DEV_POOL: PoolStats = {
  female: 6,
  male: 8,
  mixed: 3,
  solo: {
    female: 21,
    male: 18,
  },
  bySize: {
    '2': { female: 3, male: 5, mixed: 1 },
    '3': { female: 3, male: 3, mixed: 2 },
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
  const [matchMode, setMatchMode] = useState<'group' | 'solo'>('group')
  const [soloQueueActive, setSoloQueueActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (isDevPreview) {
      const params = new URLSearchParams(window.location.search)
      const isSoloPreview = params.get('mode') === 'solo'
      const previewGroupSize = getDevPreviewGroupSizeFromClient(DEV_PREVIEW_GROUP.size)
      const previewGroupStatus = getDevPreviewGroupStatusFromClient()
      setMatchMode(isSoloPreview ? 'solo' : 'group')
      setSoloQueueActive(isSoloPreview && params.get('soloStatus') === 'in_pool')
      setMatches(params.get('sampleMatches') === '1'
        ? isSoloPreview ? DEV_SOLO_MATCHES : DEV_MATCHES
        : [])
      setPoolStats(DEV_POOL)
      setGroupSummary(isSoloPreview
        ? EMPTY_GROUP_SUMMARY
        : {
            group: {
              ...DEV_PREVIEW_GROUP,
              size: previewGroupSize,
              status: previewGroupStatus,
            },
            members: DEV_PREVIEW_GROUP_MEMBERS.slice(0, previewGroupSize),
            current_user_id: DEV_PREVIEW_CURRENT_USER_ID,
          })
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

  const isSoloMode = matchMode === 'solo'
  const groupMemberNames = isSoloMode
    ? ['나']
    : groupSummary.members.length > 0
    ? groupSummary.members.map((member) => member.user_id === groupSummary.current_user_id ? '나' : member.display_name || '친구')
    : ['나']
  const readyCount = isSoloMode ? 1 : groupSummary.members.filter((member) => member.match_setup_ready || member.role === 'leader').length
  const groupCapacity = isSoloMode ? 1 : groupSummary.group?.size ?? 3
  const progressValue = isSoloMode
    ? 100
    : groupSummary.members.length > 0
    ? Math.min(100, Math.round((Math.max(readyCount, 1) / Math.max(groupCapacity, 1)) * 100))
    : 25
  const hasMatchResults = matches.length > 0
  const hasStartedMatching = isSoloMode
    ? soloQueueActive || hasMatchResults
    : groupSummary.group?.status === 'in_pool' || hasMatchResults
  const teamCardName = loading
    ? '매칭 상태 확인 중'
    : isSoloMode
      ? '1:1 소개팅'
    : groupSummary.group
      ? '내 과팅 팀'
      : '팀을 먼저 만들어요'
  const teamCardMembers = loading ? ['확인 중'] : groupMemberNames
  const teamCardStatus = loading
    ? '불러오는 중'
    : isSoloMode && hasStartedMatching
      ? '상대 탐색 중'
    : isSoloMode
      ? '소개팅 준비'
    : groupSummary.group?.status === 'in_pool'
      ? '매칭 탐색 중'
      : '매칭 준비'
  const progressLabel = isSoloMode
    ? '내 소개팅 준비 완료 - 조건이 맞는 한 명을 찾는 중'
    : `팀 준비 ${Math.min(groupSummary.members.length, groupCapacity)}/${groupCapacity}명 - 조건을 맞추는 중`

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] pt-6 sm:max-w-md">
        <header className="mb-5 flex items-center gap-3">
          <Link href="/" className="glass rounded-xl border border-boot-hairline p-2 text-boot-body hover:text-boot-primary" aria-label="홈으로 돌아가기">
            <ChevronLeft size={18} />
          </Link>
          <div className="flex-1">
            <p className="text-sm font-bold text-boot-muted">매칭 허브</p>
            <h1 className="text-3xl font-black leading-tight">오늘의 매칭</h1>
          </div>
          <NotificationBell />
        </header>

        <DarkTeamProgressCard
          className="mb-4"
          groupName={teamCardName}
          members={teamCardMembers}
          progressValue={progressValue}
          progressLabel={progressLabel}
          status={teamCardStatus}
        />

        {loading ? (
          <section className="mb-5 rounded-[30px] bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
                <Search size={21} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black leading-tight text-boot-ink">매칭 상태를 확인하고 있어요</p>
                <p className="mt-1 text-xs leading-relaxed text-boot-muted">
                  그룹과 큐 상태를 불러온 뒤 필요한 행동만 보여드릴게요.
                </p>
              </div>
            </div>
          </section>
        ) : hasMatchResults ? (
          <LockedOpponentCard
            className="mb-5"
            title={isSoloMode ? '소개팅 상대 후보' : '가매칭 후보'}
            chemi={isSoloMode ? 88 : 92}
            chips={isSoloMode ? ['1:1', '조용한 대화', '저녁 가능'] : ['차분한', '카페파', '수요일']}
            description={isSoloMode
              ? '보증금과 사전 카드가 끝나면 상대의 카드와 약속 정보가 단계적으로 열려요'
              : '보증금과 사전 카드가 끝나면 상대 정보가 단계적으로 열려요'}
          />
        ) : hasStartedMatching && !hasMatchResults ? (
          <MatchSearchingPrivacyCard mode={matchMode} />
        ) : null}

        {!loading && !hasStartedMatching && (
          <section className="mb-5 rounded-[30px] bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
                <Search size={21} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black leading-tight text-boot-ink">매칭을 찾아주세요!</p>
                <p className="mt-1 text-xs leading-relaxed text-boot-muted">
                  혼자 소개팅을 시작하거나, 친구를 초대해 2:2와 3:3 과팅 큐에 들어갈 수 있어요.
                </p>
              </div>
            </div>
            <Link
              href="/match/start?mode=solo"
              className="mb-3 flex min-h-[96px] items-center gap-4 rounded-[28px] border border-boot-primary/20 bg-gradient-to-br from-white via-boot-soft to-rose-50 px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-boot-primary/40 hover:shadow-md"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-boot-primary text-white shadow-[0_14px_28px_rgba(255,79,105,0.24)]">
                <Heart size={22} fill="currentColor" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-boot-primary">1:1 소개팅</p>
                <p className="mt-1 text-lg font-black leading-tight text-boot-ink">혼자 바로 매칭받기</p>
                <p className="mt-1 text-[11px] leading-5 text-boot-muted">
                  친구 초대 없이 내 설정만 끝내고 조건이 맞는 한 명을 찾아요.
                </p>
              </div>
              <ChevronRight size={17} className="shrink-0 text-boot-primary" />
            </Link>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/group/create?size=2"
                className="flex h-14 items-center justify-center gap-2 rounded-[24px] bg-boot-ink px-4 text-sm font-black text-white shadow-[0_16px_34px_rgba(23,20,18,0.22)]"
              >
                2:2 매칭찾기
                <ChevronRight size={16} />
              </Link>
              <Link
                href="/group/create?size=3"
                className="flex h-14 items-center justify-center gap-2 rounded-[24px] border border-boot-primary/20 bg-boot-soft px-4 text-sm font-black text-boot-primary"
              >
                3:3 매칭찾기
                <ChevronRight size={16} />
              </Link>
              <Link
                href="/friends"
                className="col-span-2 flex h-12 items-center justify-center gap-1.5 rounded-[22px] border border-boot-primary/15 bg-white px-3 text-xs font-black text-boot-primary"
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
        )}

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
        ) : matches.length === 0 && !hasStartedMatching ? (
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
        ) : matches.length === 0 && hasStartedMatching ? (
          <section className="glass rounded-3xl p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-boot-primary/15 bg-boot-soft">
              <Loader2 size={20} className="animate-spin text-boot-primary" />
            </div>
            <p className="text-sm font-bold text-boot-body">매칭 큐에서 상대팀을 찾는 중이에요</p>
            <p className="mt-1 text-xs leading-5 text-boot-muted">
              이미 매칭 찾기를 시작했어요. 조건이 맞는 팀이 잡히면 이 화면에서 상대 카드와 다음 행동이 열립니다.
            </p>
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

function MatchSearchingPrivacyCard({ mode }: { mode: 'group' | 'solo' }) {
  const isSolo = mode === 'solo'

  return (
    <section className="mb-5 rounded-[30px] border border-boot-primary/15 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
          <LockKeyhole size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-boot-primary">Searching privately</p>
          <h2 className="mt-2 text-xl font-black leading-tight text-boot-ink">상대 카드는 매칭 후에 열려요</h2>
          <p className="mt-2 text-sm leading-6 text-boot-muted">
            {isSolo
              ? '1:1 소개팅 찾기를 시작했으니 조건이 맞는 한 명을 기다리는 단계예요. 상대가 잡히기 전까지는'
              : '매칭 찾기를 시작했으니 이제 조건이 맞는 팀을 기다리는 단계예요. 상대팀이 잡히기 전까지는'}
            케미 점수와 상세 정보가 공개되지 않습니다.
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {['큐 진입', '상대 탐색', '가매칭 공개'].map((step, index) => (
          <div key={step} className="rounded-2xl border border-boot-hairline bg-boot-soft px-2 py-3 text-center">
            <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-black text-boot-primary">
              {index + 1}
            </span>
            <span className="mt-2 block text-[11px] font-black text-boot-body">{step}</span>
          </div>
        ))}
      </div>
    </section>
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
  if (match.match_mode === 'solo') {
    switch (match.match_status) {
      case 'pending':
        return '1:1 가매칭이 도착했어요. 보증금과 사전 카드가 끝나면 상대 정보가 단계적으로 열립니다.'
      case 'confirmed':
        return '1:1 소개팅이 확정됐어요. 오늘 공개 카드, 약속 시간, 장소를 확인해 보세요.'
      default:
        return '소개팅 상세에서 다음 단계를 확인해 보세요.'
    }
  }

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
  if (match.match_mode === 'solo') {
    return match.match_status === 'pending'
      ? '1:1 소개팅 상대가 도착했어요'
      : '소개팅 상대'
  }

  if (match.match_status === 'pending') {
    return '가매칭 후보가 도착했어요'
  }

  return `상대 그룹 ${match.opp_group_size}명 · ${formatGroupGender(match.opp_group_gender)}`
}

function formatGroupGender(gender: MatchRow['opp_group_gender']): string {
  switch (gender) {
    case 'male': return '남자'
    case 'female': return '여자'
    case 'mixed': return '혼성'
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
