'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronLeft, ChevronRight, Heart, Loader2, LockKeyhole, Search, Sparkles, UserPlus, Users } from 'lucide-react'
import {
  getDevPreviewGroupSizeFromClient,
  getDevPreviewGroupStatusFromClient,
  getDevPreviewSoloStatusFromClient,
  isDevPreviewClientSession,
  setDevPreviewGroupStatus,
  setDevPreviewSoloStatus,
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

type MatchMode = 'group' | 'solo'
type MatchScope = 'same_school' | 'cross_school'

interface MatchRow {
  match_id: string
  match_mode?: MatchMode
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
  group: { id?: string | null; size?: number | null; status?: string | null } | null
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
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [poolStats, setPoolStats] = useState<PoolStats>(EMPTY_POOL)
  const [groupSummary, setGroupSummary] = useState<GroupSummary>(EMPTY_GROUP_SUMMARY)
  const [matchMode, setMatchMode] = useState<MatchMode>('group')
  const [matchScope, setMatchScope] = useState<MatchScope>('same_school')
  const [soloQueueActive, setSoloQueueActive] = useState(false)
  const [cancelingQueue, setCancelingQueue] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    const isDevPreview = isDevPreviewClientSession()

    if (isDevPreview) {
      const params = new URLSearchParams(window.location.search)
      const storedSoloStatus = getDevPreviewSoloStatusFromClient()
      const devRequestedSoloStatus = params.get('sampleMatches') === '1'
        ? 'matched'
        : params.get('soloStatus') === 'in_pool'
          ? 'in_pool'
          : storedSoloStatus
      const requestedMode: MatchMode = params.get('mode') === 'solo' || (params.get('mode') == null && devRequestedSoloStatus !== 'idle')
        ? 'solo'
        : 'group'
      const previewGroupSize = getDevPreviewGroupSizeFromClient(DEV_PREVIEW_GROUP.size)
      const previewGroupStatus = getDevPreviewGroupStatusFromClient()
      const explicitSoloPreview =
        requestedMode === 'solo'
        && devRequestedSoloStatus !== 'idle'
      const nextMode = requestedMode === 'solo' && previewGroupStatus === 'in_pool' && !explicitSoloPreview
        ? 'group'
        : requestedMode
      if (nextMode === 'solo') {
        setDevPreviewSoloStatus(devRequestedSoloStatus)
      }
      setMatchMode(nextMode)
      setSoloQueueActive(nextMode === 'solo' && devRequestedSoloStatus === 'in_pool')
      setMatches(devRequestedSoloStatus === 'matched'
        ? nextMode === 'solo' ? DEV_SOLO_MATCHES : DEV_MATCHES
        : [])
      setPoolStats(DEV_POOL)
      setGroupSummary({
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
      const params = new URLSearchParams(window.location.search)
      const requestedMode: MatchMode = params.get('mode') === 'solo' ? 'solo' : 'group'
      setMatchMode(requestedMode)
      setSoloQueueActive(false)

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
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCancelGroupQueue = useCallback(async () => {
    if (cancelingQueue || !groupSummary.group) return

    const confirmed = confirmAction('매칭 찾기를 취소할까요? 그룹은 준비 상태로 돌아가고 다시 큐에 들어갈 수 있어요.')
    if (!confirmed) return

    setCancelingQueue(true)
    setError(null)

    if (isDevPreviewClientSession()) {
      setDevPreviewGroupStatus('ready')
      setGroupSummary((current) => ({
        ...current,
        group: current.group ? { ...current.group, status: 'ready' } : current.group,
      }))
      setCancelingQueue(false)
      return
    }

    try {
      const groupId = groupSummary.group.id
      if (!groupId) {
        setError('그룹 정보를 찾지 못했어요. 잠시 후 다시 시도해 주세요.')
        return
      }

      const res = await fetch('/api/match-pool/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: unknown }
        setError(getQueueCancelErrorMessage(data.error))
        return
      }

      await refresh()
    } catch {
      setError('매칭 취소에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setCancelingQueue(false)
    }
  }, [cancelingQueue, groupSummary.group, refresh])

  const handleCancelSoloQueue = useCallback(() => {
    if (cancelingQueue || !soloQueueActive) return

    const confirmed = confirmAction('1:1 매칭 찾기를 취소할까요? 취소해도 다시 시작할 수 있어요.')
    if (!confirmed) return

    setCancelingQueue(true)
    setError(null)
    setDevPreviewSoloStatus('idle')
    setSoloQueueActive(false)
    setMatches([])
    setMatchMode('solo')
    window.history.replaceState(null, '', '/match?mode=solo')
    setCancelingQueue(false)
  }, [cancelingQueue, soloQueueActive])

  const handleCancelMatchResult = useCallback(async (match: MatchRow | undefined) => {
    if (cancelingQueue || !match) return

    const isSoloMatch = match.match_mode === 'solo'
    const confirmed = confirmAction(
      isSoloMatch
        ? '1:1 가매칭을 취소할까요? 취소하면 다시 매칭을 찾을 수 있어요.'
        : '가매칭을 취소할까요? 취소하면 그룹은 다시 준비 상태로 돌아가요.',
    )
    if (!confirmed) return

    setCancelingQueue(true)
    setError(null)

    if (isDevPreviewClientSession()) {
      if (isSoloMatch) {
        setDevPreviewSoloStatus('idle')
        setSoloQueueActive(false)
        setMatchMode('solo')
        window.history.replaceState(null, '', '/match?mode=solo')
      } else {
        setDevPreviewGroupStatus('ready')
        setGroupSummary((current) => ({
          ...current,
          group: current.group ? { ...current.group, status: 'ready' } : current.group,
        }))
        setMatchMode('group')
        window.history.replaceState(null, '', '/match')
      }
      setMatches([])
      setCancelingQueue(false)
      return
    }

    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(match.match_id)}/cancel`, {
        method: 'POST',
      })

      if (!res.ok) {
        setError('매칭 취소에 실패했어요. 잠시 후 다시 시도해 주세요.')
        return
      }

      await refresh()
    } catch {
      setError('매칭 취소에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setCancelingQueue(false)
    }
  }, [cancelingQueue, refresh])

  const groupMatchResults = matches.some((match) => (match.match_mode ?? 'group') === 'group')
  const soloMatchResults = matches.some((match) => match.match_mode === 'solo')
  const rawSoloFlowActive = soloQueueActive || soloMatchResults
  const groupFlowActive = groupSummary.group?.status === 'in_pool' || groupMatchResults
  const soloBlockedByGroupFlow = groupFlowActive && !rawSoloFlowActive
  const effectiveMatchMode: MatchMode = soloBlockedByGroupFlow ? 'group' : matchMode
  const isSoloMode = effectiveMatchMode === 'solo'
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
  const visibleMatches = isSoloMode
    ? matches.filter((match) => match.match_mode === 'solo')
    : matches.filter((match) => (match.match_mode ?? 'group') === 'group')
  const currentMatchResult = visibleMatches[0]
  const pendingGroupQueue = groupSummary.group?.status === 'in_pool' && !groupMatchResults
  const isGroupQueueActive = !isSoloMode && pendingGroupQueue
  const soloFlowActive = isSoloMode && rawSoloFlowActive
  const hasMatchResults = visibleMatches.length > 0
  const hasStartedMatching = isSoloMode
    ? rawSoloFlowActive
    : groupFlowActive
  const hasAnyStartedMatching = groupFlowActive || rawSoloFlowActive
  const soloResultHref = isSoloMode
    ? visibleMatches.find((match) => match.match_mode === 'solo')?.match_id
    : undefined
  const shouldShowMatchingPool = !loading && !hasAnyStartedMatching && !hasMatchResults
  const canCancelActiveQueue = !loading
    && !hasMatchResults
    && hasAnyStartedMatching
  const canCancelCurrentMatch = !loading
    && currentMatchResult?.match_status === 'pending'
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
    : isSoloMode && soloMatchResults
      ? '가매칭 도착'
    : isSoloMode && hasStartedMatching
      ? '상대 탐색 중'
    : isSoloMode
      ? '소개팅 준비'
    : isGroupQueueActive
      ? '큐 진입 완료 · 상대팀 탐색 중'
    : '매칭 준비'
  const progressLabel = loading
    ? '매칭 상태를 확인하는 중이에요'
    : isSoloMode
    ? soloMatchResults
      ? '1:1 가매칭 도착 - 보증금과 사전 카드를 준비해요'
      : '내 소개팅 준비 완료 - 조건이 맞는 한 명을 찾는 중'
    : isGroupQueueActive
      ? `매칭대기중 · ${groupCapacity}:${groupCapacity} 상대팀을 찾는 중`
      : `팀 준비 ${Math.min(groupSummary.members.length, groupCapacity)}/${groupCapacity}명 - 조건을 맞추는 중`
  const activeGroupSize = groupCapacity === 2 ? 2 : 3

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
          showOpenSlot={!loading && !isGroupQueueActive && groupMemberNames.length < groupCapacity}
          action={canCancelCurrentMatch
            ? {
                label: isSoloMode ? '1:1 가매칭 취소하기' : '가매칭 취소하기',
                onClick: () => handleCancelMatchResult(currentMatchResult),
                disabled: cancelingQueue,
              }
            : canCancelActiveQueue
              ? {
                  label: isSoloMode ? '1:1 매칭 취소하기' : '과팅 매칭 취소하기',
                  onClick: isSoloMode ? handleCancelSoloQueue : handleCancelGroupQueue,
                  disabled: cancelingQueue,
                }
              : undefined}
        />

        {(canCancelActiveQueue || canCancelCurrentMatch) && (
          <QueueControlStrip
            mode={effectiveMatchMode}
            label={canCancelCurrentMatch ? (isSoloMode ? '1:1 가매칭 취소하기' : '가매칭 취소하기') : undefined}
            description={canCancelCurrentMatch
              ? '상대가 잡힌 뒤에도 확정 전이면 취소할 수 있어요. 취소하면 다시 매칭 찾기 전 상태로 돌아가요.'
              : undefined}
            canceling={cancelingQueue}
            onCancel={canCancelCurrentMatch
              ? () => handleCancelMatchResult(currentMatchResult)
              : isSoloMode ? handleCancelSoloQueue : handleCancelGroupQueue}
          />
        )}

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
          <>
            <LockedOpponentCard
              className="mb-5"
              eyebrow={isSoloMode ? '추천 상대' : '추천 상대팀'}
              title={isSoloMode ? '소개팅 상대 후보' : '가매칭 후보'}
              chemi={isSoloMode ? 88 : 92}
              chips={isSoloMode ? ['1:1', '조용한 대화', '저녁 가능'] : ['차분한', '카페파', '수요일']}
              description={isSoloMode
                ? '보증금과 사전 카드가 끝나면 상대의 카드와 약속 정보가 단계적으로 열려요'
                : '보증금과 사전 카드가 끝나면 상대 정보가 단계적으로 열려요'}
            />
            <PostMatchFlowCard
              match={currentMatchResult}
              cancelAction={canCancelCurrentMatch ? {
                label: isSoloMode ? '1:1 가매칭 취소하기' : '가매칭 취소하기',
                onClick: () => handleCancelMatchResult(currentMatchResult),
                disabled: cancelingQueue,
              } : undefined}
            />
          </>
        ) : isGroupQueueActive ? (
          <ActiveGroupQueuePanel
            capacity={activeGroupSize}
            membersCount={groupSummary.members.length}
            stats={poolStats}
            canceling={cancelingQueue}
            onCancel={handleCancelGroupQueue}
          />
        ) : hasStartedMatching && !hasMatchResults ? (
          <MatchSearchingPrivacyCard
            mode={effectiveMatchMode}
            canceling={cancelingQueue}
            onCancel={isSoloMode ? handleCancelSoloQueue : handleCancelGroupQueue}
          />
        ) : null}

        {!loading && !hasAnyStartedMatching && (
          <section className="mb-5 rounded-[30px] bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
                <Search size={21} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black leading-tight text-boot-ink">어떤 방식으로 만날까요?</p>
                <p className="mt-1 text-xs leading-relaxed text-boot-muted">
                  기본은 친구와 함께하는 과팅이에요. 혼자 신청하는 소개팅은 따로 선택할 때만 열립니다.
                </p>
              </div>
            </div>
            <MatchModeSelector
              mode={matchMode}
              setMatchMode={setMatchMode}
              soloBlockedByGroupFlow={soloBlockedByGroupFlow}
            />
            <MatchScopeSelector scope={matchScope} setScope={setMatchScope} />
            <MatchModeBody
              mode={matchMode}
              groupSummary={groupSummary}
              soloBlockedByGroupFlow={soloBlockedByGroupFlow}
            />
          </section>
        )}

        {shouldShowMatchingPool && (
        <section className="mb-5">
          <MatchingPool
            stats={poolStats}
            mode={matchMode}
            soloDisabled={soloBlockedByGroupFlow}
            soloQueueActive={soloFlowActive}
            soloCanceling={cancelingQueue}
            onCancelSoloQueue={handleCancelSoloQueue}
            soloResultHref={soloResultHref ? `/match/${encodeURIComponent(soloResultHref)}` : undefined}
            groupQueueActive={isGroupQueueActive}
            activeGroupSize={activeGroupSize}
          />
        </section>
        )}

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
        ) : visibleMatches.length === 0 && !hasStartedMatching ? (
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
        ) : visibleMatches.length === 0 && hasStartedMatching && !isGroupQueueActive && !soloFlowActive ? (
          <section className="glass rounded-3xl p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-boot-primary/15 bg-boot-soft">
              <Loader2 size={20} className="animate-spin text-boot-primary" />
            </div>
            <p className="text-sm font-bold text-boot-body">
              {isSoloMode ? '매칭 큐에서 1:1 상대를 찾는 중이에요' : '매칭 큐에서 상대팀을 찾는 중이에요'}
            </p>
            <p className="mt-1 text-xs leading-5 text-boot-muted">
              {isSoloMode
                ? '이미 소개팅 찾기를 시작했어요. 조건이 맞는 상대가 잡히면 이 화면에서 상대 카드와 다음 행동이 열립니다.'
                : '이미 매칭 찾기를 시작했어요. 조건이 맞는 팀이 잡히면 이 화면에서 상대 카드와 다음 행동이 열립니다.'}
            </p>
          </section>
        ) : null}
      </div>
    </main>
  )
}

function confirmAction(message: string): boolean {
  if (typeof window.confirm !== 'function') return true
  return window.confirm(message)
}

function PostMatchFlowCard({
  match,
  cancelAction,
}: {
  match: MatchRow
  cancelAction?: {
    label: string
    onClick: () => void
    disabled?: boolean
  }
}) {
  const isSolo = match.match_mode === 'solo'
  const isPending = match.match_status === 'pending'
  const detailHref = `/match/${encodeURIComponent(match.match_id)}`
  const steps = isPending
    ? [
        { label: '1', title: '가매칭 확인', description: isSolo ? '1:1 상대는 아직 이름과 상세가 잠겨 있어요.' : '상대팀 상세는 아직 잠겨 있어요.' },
        { label: '2', title: '사전 카드 작성', description: '내가 쓴 카드가 있어야 상대 카드도 단계별로 열려요.' },
        { label: '3', title: '보증금 납부', description: '매칭이 잡힌 뒤에만 보증금을 걸고 확정해요.' },
        { label: '4', title: '확정 후 오늘의 카드', description: '확정되면 16-20시에 하루 한 장씩 직접 열어요.' },
      ]
    : [
        { label: '1', title: '약속 정보 확인', description: '시간과 장소를 먼저 확인해요.' },
        { label: '2', title: '오늘의 카드', description: '16-20시에 하루 한 장씩 직접 열어봐요.' },
        { label: '3', title: '채팅/연락처', description: '약속 조건에 맞춰 순서대로 열려요.' },
      ]

  return (
    <section className="mb-5 rounded-[30px] border border-boot-primary/15 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
          <Sparkles size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-boot-primary">
            {isPending ? 'NEXT STEP' : 'DAILY FLOW'}
          </p>
          <h2 className="mt-2 text-xl font-black leading-tight text-boot-ink">
            {isPending ? '이제 확정 준비를 이어가요' : '오늘 한 장의 카드가 열려요'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-boot-muted">
            {isPending
              ? '매칭 찾기 이후에만 보증금과 사전 카드가 나와요. 상세 화면에서 준비를 끝내면 확정 후 데일리카드와 약속 정보가 열립니다.'
              : '확정 후에는 약속 정보, 데일리카드, 채팅과 연락처가 한 줄 흐름으로 열립니다.'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {steps.map((step) => (
          <div key={step.label} className="flex items-start gap-3 rounded-2xl border border-boot-hairline bg-boot-soft/55 px-3 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-boot-primary">
              {step.label}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-boot-ink">{step.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-boot-muted">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      <DailyCardFlowPreview confirmed={!isPending} />

      <Link
        href={detailHref}
        className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-boot-ink px-4 text-sm font-black text-white shadow-[0_14px_28px_rgba(23,20,18,0.18)]"
      >
        {isPending ? '가매칭 준비 이어가기' : '오늘의 카드 확인하기'}
        <ChevronRight size={16} />
      </Link>
      {cancelAction && (
        <button
          type="button"
          onClick={cancelAction.onClick}
          disabled={cancelAction.disabled}
          className="mt-2 flex h-11 w-full items-center justify-center rounded-full border border-boot-primary/25 bg-white px-4 text-xs font-black text-boot-primary shadow-sm transition hover:bg-boot-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cancelAction.disabled ? '취소하는 중...' : cancelAction.label}
        </button>
      )}
    </section>
  )
}

function DailyCardFlowPreview({ confirmed }: { confirmed: boolean }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[26px] border border-boot-primary/15 bg-gradient-to-br from-rose-50 via-white to-orange-50 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-boot-primary">
            Daily Card
          </p>
          <h3 className="mt-1 text-base font-black text-boot-ink">
            {confirmed ? '오늘 한 장을 직접 열어요' : '확정 후 하루 한 장씩 열려요'}
          </h3>
          <p className="mt-1 text-xs leading-5 text-boot-muted">
            {confirmed
              ? '16시부터 20시 사이에 오늘의 카드를 직접 뽑고, 내가 써야 상대 힌트가 열려요.'
              : '가매칭 준비와 보증금이 끝나면 약속일까지 매일 한 장씩 서로의 힌트를 확인해요.'}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-1.5">
          {['오늘', '내일', '만남'].map((label, index) => (
            <span
              key={label}
              className={[
                'flex h-12 w-9 items-center justify-center rounded-2xl border text-[10px] font-black',
                index === 0
                  ? 'border-boot-primary/30 bg-white text-boot-primary shadow-sm'
                  : 'border-boot-hairline bg-boot-soft text-boot-muted',
              ].join(' ')}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function QueueControlStrip({
  mode,
  label,
  description,
  canceling,
  onCancel,
}: {
  mode: 'group' | 'solo'
  label?: string
  description?: string
  canceling: boolean
  onCancel: () => void
}) {
  const actionLabel = label ?? (mode === 'solo' ? '1:1 매칭 취소하기' : '과팅 매칭 취소하기')

  return (
    <section className="mb-4 rounded-[26px] border border-boot-primary/20 bg-white px-4 py-4 shadow-[0_16px_34px_rgba(23,20,18,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-[0.2em] text-boot-primary">MATCHING ACTIVE</p>
          <p className="mt-1 text-sm font-bold text-boot-body">
            {description ?? '지금 조건이 맞는 상대를 찾는 중이에요. 원하면 바로 취소하고 다시 준비할 수 있어요.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={canceling}
            className="flex h-11 items-center justify-center rounded-full border border-boot-primary/25 bg-boot-soft px-4 text-xs font-black text-boot-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {canceling ? '취소하는 중...' : actionLabel}
          </button>
          <Link
            href="/"
            className="flex h-11 items-center justify-center rounded-full bg-boot-ink px-4 text-xs font-black text-white"
          >
            홈으로
          </Link>
        </div>
      </div>
    </section>
  )
}

function MatchModeSelector({
  mode,
  setMatchMode,
  soloBlockedByGroupFlow,
}: {
  mode: MatchMode
  setMatchMode: (mode: MatchMode) => void
  soloBlockedByGroupFlow: boolean
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 rounded-[26px] bg-boot-soft p-1.5">
      <button
        type="button"
        aria-pressed={mode === 'group'}
        onClick={() => setMatchMode('group')}
        className={[
          'min-h-[96px] rounded-[22px] px-4 py-4 text-left transition',
          mode === 'group'
            ? 'bg-boot-ink text-white shadow-[0_18px_34px_rgba(23,20,18,0.18)]'
            : 'bg-white text-boot-ink hover:bg-white/80',
        ].join(' ')}
      >
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-current">
          <Users size={19} />
        </span>
        <span className="block text-xs font-black uppercase tracking-[0.16em] text-boot-primary">
          과팅하기
        </span>
        <span className="mt-1 block text-lg font-black leading-tight">친구와 팀 매칭</span>
        <span className={`mt-1 block text-[11px] leading-4 ${mode === 'group' ? 'text-white/70' : 'text-boot-muted'}`}>
          2:2, 3:3으로 같이 신청해요.
        </span>
      </button>

      <button
        type="button"
        aria-pressed={mode === 'solo'}
        disabled={soloBlockedByGroupFlow}
        onClick={() => setMatchMode('solo')}
        className={[
          'min-h-[96px] rounded-[22px] px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
          mode === 'solo'
            ? 'bg-white text-boot-ink shadow-[0_14px_28px_rgba(255,79,105,0.16)] ring-1 ring-boot-primary/25'
            : 'bg-white/70 text-boot-ink hover:bg-white',
        ].join(' ')}
      >
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-boot-primary text-white">
          <Heart size={18} fill="currentColor" />
        </span>
        <span className="block text-xs font-black uppercase tracking-[0.16em] text-boot-primary">
          소개팅하기
        </span>
        <span className="mt-1 block text-lg font-black leading-tight">혼자 1:1 매칭</span>
        <span className="mt-1 block text-[11px] leading-4 text-boot-muted">
          친구 없이 한 명을 찾아요.
        </span>
      </button>
    </div>
  )
}

function MatchScopeSelector({
  scope,
  setScope,
}: {
  scope: MatchScope
  setScope: (scope: MatchScope) => void
}) {
  const options: Array<{
    value: MatchScope
    title: string
    desc: string
    badge: string
  }> = [
    {
      value: 'same_school',
      title: '우리 학교끼리',
      desc: '부산대 안에서 먼저 조건이 맞는 팀을 찾아요.',
      badge: 'PNU',
    },
    {
      value: 'cross_school',
      title: '다른 학교도 허용',
      desc: '서로 허용한 학교끼리만 확장 매칭해요.',
      badge: '확장',
    },
  ]

  return (
    <section className="mb-4 rounded-[26px] border border-boot-primary/15 bg-white px-4 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-boot-primary">
            Campus Range
          </p>
          <h2 className="mt-1 text-base font-black text-boot-ink">어느 학교까지 열어둘까요?</h2>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-600">
          부산대 mock
        </span>
      </div>
      <div className="grid gap-2">
        {options.map((option) => {
          const active = scope === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setScope(option.value)}
              className={[
                'flex min-h-[74px] items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition',
                active
                  ? 'border-boot-primary/35 bg-boot-soft text-boot-ink shadow-[0_12px_26px_rgba(255,79,105,0.12)]'
                  : 'border-boot-hairline bg-white text-boot-ink hover:bg-boot-soft/60',
              ].join(' ')}
            >
              <span className={[
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-black',
                active ? 'bg-boot-primary text-white' : 'bg-boot-soft text-boot-primary',
              ].join(' ')}>
                {option.badge}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">{option.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-boot-muted">{option.desc}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-boot-muted">
        지금은 프론트 검토용 선택 UI입니다. 실제 학교 간 매칭 허용 여부는 다음 단계에서 DB 필터와 큐 API에 연결해야 합니다.
      </p>
    </section>
  )
}

function MatchModeBody({
  mode,
  groupSummary,
  soloBlockedByGroupFlow,
}: {
  mode: MatchMode
  groupSummary: GroupSummary
  soloBlockedByGroupFlow: boolean
}) {
  return mode === 'group' ? (
    <GroupMatchStartPanel groupSummary={groupSummary} />
  ) : (
    <SoloMatchStartPanel soloBlockedByGroupFlow={soloBlockedByGroupFlow} />
  )
}

function GroupMatchStartPanel({ groupSummary }: { groupSummary: GroupSummary }) {
  return (
    <div className="rounded-[26px] border border-boot-primary/15 bg-white px-4 py-4">
      <div className="mb-3">
        <p className="text-[11px] font-black tracking-[0.18em] text-boot-primary">과팅하기</p>
        <h2 className="mt-1 text-xl font-black leading-tight text-boot-ink">과팅 시작하기</h2>
        <p className="mt-1 text-xs leading-5 text-boot-muted">
          친구와 팀을 만들고, 팀원별 성향과 시간, 비중을 맞추면 과팅 큐에 들어가요.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/group/create?size=2"
          className="flex h-14 items-center justify-center gap-2 rounded-[24px] bg-boot-ink px-4 text-sm font-black text-white shadow-[0_16px_34px_rgba(23,20,18,0.22)]"
        >
          2:2 과팅
          <ChevronRight size={16} />
        </Link>
        <Link
          href="/group/create?size=3"
          className="flex h-14 items-center justify-center gap-2 rounded-[24px] border border-boot-primary/20 bg-boot-soft px-4 text-sm font-black text-boot-primary"
        >
          3:3 과팅
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
    </div>
  )
}

function SoloMatchStartPanel({ soloBlockedByGroupFlow }: { soloBlockedByGroupFlow: boolean }) {
  if (soloBlockedByGroupFlow) {
    return (
      <div className="rounded-[26px] border border-boot-primary/20 bg-boot-soft px-4 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-boot-primary">Solo Match</p>
        <h2 className="mt-1 text-xl font-black leading-tight text-boot-ink">소개팅은 잠시 막아둘게요</h2>
        <p className="mt-2 text-sm leading-6 text-boot-muted">
          과팅 진행 중에는 소개팅을 잠시 막아둘게요. 먼저 진행 중인 과팅을 마무리해 주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[26px] border border-boot-primary/15 bg-gradient-to-br from-white via-boot-soft to-rose-50 px-4 py-4">
      <div className="mb-4 flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-boot-primary text-white shadow-[0_14px_28px_rgba(255,79,105,0.24)]">
          <Heart size={22} fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-boot-primary">1:1 소개팅</p>
          <h2 className="mt-1 text-xl font-black leading-tight text-boot-ink">1:1 소개팅 매치</h2>
          <p className="mt-1 text-xs leading-5 text-boot-muted">
            친구 초대 없이 내 설정만 끝내고 조건이 맞는 한 명을 찾아요.
          </p>
        </div>
      </div>
      <Link
        href="/match/start?mode=solo"
        className="flex h-14 items-center justify-center gap-2 rounded-[24px] bg-boot-ink px-4 text-sm font-black text-white shadow-[0_16px_34px_rgba(23,20,18,0.22)]"
      >
        1:1 시작하기
        <ChevronRight size={16} />
      </Link>
    </div>
  )
}

function MatchSearchingPrivacyCard({
  mode,
  canceling,
  onCancel,
}: {
  mode: 'group' | 'solo'
  canceling: boolean
  onCancel: () => void
}) {
  const isSolo = mode === 'solo'
  const targetLabel = isSolo ? '상대' : '상대팀'

  return (
    <section className="mb-5 rounded-[30px] border border-boot-primary/15 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
          <LockKeyhole size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-boot-primary">비공개 탐색 중</p>
          <h2 className="mt-2 text-xl font-black leading-tight text-boot-ink">
            지금은 {targetLabel}를 찾는 중이에요
          </h2>
          <p className="mt-2 text-sm leading-6 text-boot-muted">
            {isSolo
              ? '1:1 소개팅 찾기를 시작했으니 조건이 맞는 한 명을 기다리는 단계예요. 가매칭이 도착하기 전까지는 '
              : '매칭 찾기를 시작했으니 이제 조건이 맞는 팀을 기다리는 단계예요. 가매칭이 도착하기 전까지는 '}
            점수와 상세 정보가 공개되지 않습니다.
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
      <div className="mt-3 rounded-2xl border border-boot-primary/15 bg-gradient-to-r from-rose-50 to-orange-50 px-4 py-3">
        <p className="text-xs font-black text-boot-primary">가매칭이 도착하면 열리는 것</p>
        <p className="mt-1 text-[11px] leading-5 text-boot-muted">
          {targetLabel}가 잡히면 사전 카드와 보증금 단계로 넘어가고, 확정 후 16-20시에 하루 한 장씩 데일리카드를 직접 열게 됩니다.
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={canceling}
        className="mt-4 flex h-12 w-full items-center justify-center rounded-full border border-boot-primary/25 bg-white px-4 text-sm font-black text-boot-primary shadow-sm transition hover:bg-boot-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {canceling ? '취소하는 중...' : isSolo ? '1:1 매칭 취소하기' : '과팅 매칭 취소하기'}
      </button>
    </section>
  )
}

function ActiveGroupQueuePanel({
  capacity,
  membersCount,
  stats,
  canceling,
  onCancel,
}: {
  capacity: 2 | 3
  membersCount: number
  stats: PoolStats
  canceling: boolean
  onCancel: () => void
}) {
  const sizeStats = stats.bySize?.[capacity.toString() as '2' | '3'] ?? { female: 0, male: 0, mixed: 0 }
  const totalTeams = sizeStats.male + sizeStats.female + sizeStats.mixed
  const totalPeople = totalTeams * capacity

  return (
    <section aria-live="polite" className="mb-5 rounded-[30px] border border-boot-primary/15 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
          <Loader2 size={21} className="animate-spin" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black tracking-[0.18em] text-boot-primary">큐 진입 완료</p>
          <h2 className="mt-2 text-xl font-black leading-tight text-boot-ink">지금 {capacity}:{capacity} 상대팀을 찾는 중이에요</h2>
          <p className="mt-2 text-sm leading-6 text-boot-muted">
            {capacity}:{capacity} 과팅 큐에 들어갔어요. 상대팀이 잡히기 전까지는 점수와 상세 카드가 공개되지 않아요.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <QueueMiniStat label="내 그룹" value={`${membersCount}/${capacity}명`} />
        <QueueMiniStat label="대기 팀" value={`${totalTeams}팀`} />
        <QueueMiniStat label="참가자" value={`${totalPeople}명`} />
      </div>

      <div className="mt-4 rounded-2xl border border-boot-hairline bg-boot-soft px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-xs font-black text-boot-body">
          <span>현재 {capacity}:{capacity} 큐 구성</span>
          <span className="text-boot-primary">큐 진입 완료</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <QueueComposition label="남자팀" value={sizeStats.male} />
          <QueueComposition label="혼성팀" value={sizeStats.mixed} />
          <QueueComposition label="여자팀" value={sizeStats.female} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-boot-primary/15 bg-white px-4 py-4">
        <p className="text-[11px] font-black tracking-[0.16em] text-boot-primary">NEXT AFTER MATCH</p>
        <h3 className="mt-2 text-base font-black text-boot-ink">가매칭이 잡히면 데일리카드까지 이어져요</h3>
        <p className="mt-2 text-xs leading-5 text-boot-muted">
          상대팀이 잡히면 사전 카드와 보증금 단계로 넘어가고, 확정 후 16-20시에 하루 한 장씩 직접 열어요.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-black text-boot-body">
          <span className="rounded-full bg-boot-soft px-2 py-2">가매칭</span>
          <span className="rounded-full bg-boot-soft px-2 py-2">보증금</span>
          <span className="rounded-full bg-boot-soft px-2 py-2">데일리카드</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={canceling}
        className="mt-4 flex h-12 w-full items-center justify-center rounded-full border border-boot-primary/25 bg-white px-4 text-sm font-black text-boot-primary shadow-sm transition hover:bg-boot-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {canceling ? '취소하는 중...' : '과팅 매칭 취소하기'}
      </button>
    </section>
  )
}

function QueueMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-boot-hairline bg-boot-soft px-3 py-3 text-center">
      <p className="text-lg font-black text-boot-ink">{value}</p>
      <p className="mt-1 text-[10px] font-bold text-boot-muted">{label}</p>
    </div>
  )
}

function QueueComposition({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white px-2 py-2">
      <p className="text-base font-black text-boot-primary">{value}</p>
      <p className="text-[10px] font-bold text-boot-muted">{label}</p>
    </div>
  )
}

function getQueueCancelErrorMessage(error: unknown): string {
  const message = typeof error === 'string' ? error : ''

  if (message.includes('not_group_leader')) {
    return '팀장만 매칭 찾기를 취소할 수 있어요.'
  }
  if (message.includes('not_in_queue')) {
    return '이미 매칭이 취소됐어요. 화면을 새로고침해 주세요.'
  }
  if (message.includes('Unauthorized')) {
    return '로그인이 필요해요.'
  }

  return '매칭 취소에 실패했어요. 잠시 후 다시 시도해 주세요.'
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
