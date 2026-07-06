'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck2, ChevronRight, Loader2, Search, Sparkles, UsersRound } from 'lucide-react'
import {
  getDevMatchSetupStatusFromClient,
  getDevPreviewGroupSizeFromClient,
  getDevPreviewGroupStatusFromClient,
  getDevPreviewSoloStatusFromClient,
  isDevPreviewClientSession,
  setDevPreviewGroupStatus,
  setDevPreviewSoloStatus,
  type DevPreviewSoloStatus,
} from '@/lib/dev-match-setup'
import {
  EMPTY_MATCH_SETUP_STATUS,
  type MatchSetupStatus,
} from '@/lib/matching/match-setup-status'
import {
  PRE_MATCH_CARD_DRAFT_COOKIE,
  isPreMatchCardDraftCookieDone,
} from '@/lib/matching/pre-match-card-draft'
import {
  DEV_PREVIEW_CURRENT_USER_ID,
  DEV_PREVIEW_GROUP,
  DEV_PREVIEW_GROUP_MEMBERS,
} from '@/lib/matching/dev-preview-group'
import CurrentGroupPreview, { type CurrentGroupMember } from '@/components/matching/CurrentGroupPreview'
import DarkTeamProgressCard from '@/components/matching/DarkTeamProgressCard'

type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'

interface MatchRow {
  match_id: string
  match_mode?: 'group' | 'solo'
  match_status: string
  scheduled_start: string | null
  venue_name: string | null
}

interface GroupsResponse {
  group: { id?: string | null; status: GroupStatus; size?: number | null } | null
  members?: CurrentGroupMember[]
  current_user_id?: string | null
  current_user_match_setup?: MatchSetupStatus
}

interface MatchesResponse {
  matches: MatchRow[]
}

interface PreMatchCardDraftResponse {
  draft?: { completed_items?: number | null } | null
}

export default function HomeTodayTaskCard() {
  const isDevPreview = isDevPreviewClientSession()
  const [loading, setLoading] = useState(true)
  const [cancelingQueue, setCancelingQueue] = useState(false)
  const [groupStatus, setGroupStatus] = useState<GroupStatus | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [groupSize, setGroupSize] = useState(3)
  const [groupMembers, setGroupMembers] = useState<CurrentGroupMember[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [matchSetupStatus, setMatchSetupStatus] = useState<MatchSetupStatus>(EMPTY_MATCH_SETUP_STATUS)
  const [preMatchCardDone, setPreMatchCardDone] = useState(false)
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [soloStatus, setSoloStatus] = useState<DevPreviewSoloStatus>('idle')
  const [cancelingMatch, setCancelingMatch] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    if (isDevPreview) {
      const previewGroupSize = getDevPreviewGroupSizeFromClient(DEV_PREVIEW_GROUP.size)
      setGroupStatus(getDevPreviewGroupStatusFromClient())
      setGroupId(DEV_PREVIEW_GROUP.id)
      setGroupSize(previewGroupSize)
      setGroupMembers(DEV_PREVIEW_GROUP_MEMBERS.slice(0, previewGroupSize))
      setCurrentUserId(DEV_PREVIEW_CURRENT_USER_ID)
      setMatchSetupStatus(getDevMatchSetupStatusFromClient())
      setPreMatchCardDone(hasPreMatchCardDraftCookie())
      setSoloStatus(getDevPreviewSoloStatusFromClient())
      setMatches([])
      setLoading(false)
      return
    }

    try {
      const [groupRes, matchRes, cardDraftRes] = await Promise.all([
        fetch('/api/groups'),
        fetch('/api/matches'),
        fetch('/api/profile/match-card-draft'),
      ])

      if (groupRes.ok) {
        const data = await groupRes.json() as GroupsResponse
        setGroupStatus(data.group?.status ?? null)
        setGroupId(data.group?.id ?? null)
        setGroupSize(data.group?.size ?? 3)
        setGroupMembers(data.members ?? [])
        setCurrentUserId(data.current_user_id ?? null)
        setMatchSetupStatus(data.current_user_match_setup ?? EMPTY_MATCH_SETUP_STATUS)
      }
      if (matchRes.ok) {
        const data = await matchRes.json() as MatchesResponse
        const nextMatches = data.matches ?? []
        setMatches(nextMatches)
        setSoloStatus(nextMatches.some((match) => match.match_mode === 'solo') ? 'matched' : 'idle')
      }
      if (cardDraftRes.ok) {
        const data = await cardDraftRes.json() as PreMatchCardDraftResponse
        setPreMatchCardDone(Number(data.draft?.completed_items ?? 0) >= 4)
      } else {
        setPreMatchCardDone(hasPreMatchCardDraftCookie())
      }
    } catch {
      // 홈의 오늘 할 일 카드는 실패해도 기본 CTA를 보여준다.
    } finally {
      setLoading(false)
    }
  }, [isDevPreview])

  useEffect(() => {
    load()
  }, [load])

  const handleCancelQueue = useCallback(async () => {
    if (cancelingQueue) return

    const isSoloQueue = soloStatus === 'in_pool'
    const isGroupQueue = groupStatus === 'in_pool'
    if (!isSoloQueue && !isGroupQueue) return

    const message = isSoloQueue
      ? '1:1 매칭 찾기를 취소할까요? 취소해도 다시 시작할 수 있어요.'
      : '과팅 매칭 찾기를 취소할까요? 그룹은 준비 상태로 돌아가고 다시 큐에 들어갈 수 있어요.'
    if (typeof window.confirm === 'function' && !window.confirm(message)) return

    setCancelingQueue(true)
    try {
      if (isSoloQueue) {
        setDevPreviewSoloStatus('idle')
        setSoloStatus('idle')
        return
      }

      if (isDevPreview) {
        setDevPreviewGroupStatus('ready')
        setGroupStatus('ready')
        return
      }

      if (!groupId) return
      const res = await fetch('/api/match-pool/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      })
      if (res.ok) {
        await load()
      }
    } finally {
      setCancelingQueue(false)
    }
  }, [cancelingQueue, groupId, groupStatus, isDevPreview, load, soloStatus])

  const pendingMatch = useMemo(
    () => matches.find((match) => match.match_status === 'pending') ?? null,
    [matches],
  )

  const handleCancelActiveMatch = useCallback(async () => {
    if (cancelingMatch) return

    if (typeof window.confirm === 'function') {
      const confirmed = window.confirm('진행 중인 가매칭을 취소할까요? 취소해도 다시 매칭을 찾을 수 있어요.')
      if (!confirmed) return
    }

    setCancelingMatch(true)
    try {
      if (isDevPreview && soloStatus === 'matched') {
        setDevPreviewSoloStatus('idle')
        setSoloStatus('idle')
        setMatches([])
        return
      }

      if (!pendingMatch?.match_id) return

      const res = await fetch(`/api/matches/${encodeURIComponent(pendingMatch.match_id)}/cancel`, {
        method: 'POST',
      })

      if (!res.ok) {
        window.alert?.('매칭 취소에 실패했어요. 잠시 후 다시 시도해 주세요.')
        return
      }

      await load()
    } catch {
      window.alert?.('매칭 취소에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setCancelingMatch(false)
    }
  }, [cancelingMatch, isDevPreview, load, pendingMatch, soloStatus])

  const task = useMemo(() => {
    if (loading) {
      return {
        eyebrow: '상태 확인',
        title: '지금 진행 상태를 확인하고 있어요',
        description: '매칭 준비, 그룹, 큐 상태를 불러온 뒤 다음 행동을 정확히 보여줄게요.',
        href: '/match',
        cta: '매칭 화면 보기',
        Icon: Search,
        tone: 'neutral' as const,
        secondaryHref: null,
        secondaryCta: null,
      }
    }

    const setupStarted =
      matchSetupStatus.personality ||
      matchSetupStatus.schedule ||
      matchSetupStatus.preferences ||
      preMatchCardDone
    const setupCoreDone = matchSetupStatus.allDone && preMatchCardDone

    if (pendingMatch) {
      return {
        eyebrow: '오늘 할 일',
        title: '사전 힌트를 입력해주세요',
        description: '상대에게 하루 한 장씩 공개될 익명 힌트 재료예요.',
        href: `/match/${encodeURIComponent(pendingMatch.match_id)}`,
        cta: '사전 힌트 작성',
        Icon: Sparkles,
        tone: 'primary' as const,
        secondaryHref: null,
        secondaryCta: null,
      }
    }

    const confirmed = matches.find((match) => match.match_status === 'confirmed')
    if (confirmed) {
      return {
        eyebrow: '매칭 확정',
        title: '매칭이 확정되었습니다. 축하합니다!',
        description: confirmed.scheduled_start
          ? `${formatDateTime(confirmed.scheduled_start)}${confirmed.venue_name ? ` · ${confirmed.venue_name}` : ''}`
          : '약속 정보와 오늘의 카드를 확인하세요.',
        href: `/match/${encodeURIComponent(confirmed.match_id)}`,
        cta: '매칭 확인',
        Icon: CalendarCheck2,
        tone: 'success' as const,
        secondaryHref: null,
        secondaryCta: null,
      }
    }

    if (soloStatus === 'in_pool') {
      return {
        eyebrow: '1:1 탐색 중',
        title: '1:1 상대를 찾고 있어요',
        description: '조건이 맞는 상대가 잡히면 알림으로 알려드려요. 가매칭 전에는 상대 카드와 케미 점수를 공개하지 않아요.',
        href: '/match?mode=solo&soloStatus=in_pool',
        cta: '1:1 대기 현황 보기',
        Icon: Search,
        tone: 'primary' as const,
        secondaryHref: '/notifications',
        secondaryCta: '알림 확인',
      }
    }

    if (soloStatus === 'matched') {
      return {
        eyebrow: '1:1 가매칭',
        title: '1:1 가매칭을 확인해보세요',
        description: '보증금과 내 사전 카드를 끝내면 확정 단계에서 약속 정보와 오늘의 카드가 열려요.',
        href: '/match?mode=solo&sampleMatches=1',
        cta: '가매칭 확인',
        Icon: Sparkles,
        tone: 'primary' as const,
        secondaryHref: '/notifications',
        secondaryCta: '알림 보기',
      }
    }

    if (groupStatus === 'in_pool') {
      return {
        eyebrow: '매칭 진행 중',
        title: '매칭 큐에 들어가 있어요',
        description: '현재 대기 상태와 큐 화면을 확인할 수 있어요.',
        href: '/group/create?from=home-queue',
        cta: '큐 상태 보기',
        Icon: Search,
        tone: 'primary' as const,
        secondaryHref: null,
        secondaryCta: null,
      }
    }

    if (groupStatus === 'ready') {
      return {
        eyebrow: '큐 진입 준비 완료',
        title: '이번 주 매칭을 시작할 수 있어요',
        description: '그룹과 내 준비가 끝났어요. 큐에 들어가면 조건이 맞는 상대팀을 찾기 시작해요.',
        href: '/group/create',
        cta: '큐 진입하기',
        Icon: Search,
        tone: 'primary' as const,
        secondaryHref: null,
        secondaryCta: null,
      }
    }

    if (groupStatus === 'forming') {
      return {
        eyebrow: '그룹 준비',
        title: '친구와 준비를 끝내면 매칭 가능',
        description: '그룹 정원이 차고 각자 성향, 시간, 비중을 끝내야 큐에 들어갈 수 있어요.',
        href: '/group/create',
        cta: '그룹 준비 보기',
        Icon: UsersRound,
        tone: 'neutral' as const,
        secondaryHref: '/friends',
        secondaryCta: '친구 초대',
      }
    }

    if (setupCoreDone) {
      return {
        eyebrow: '그룹 준비',
        title: '그룹을 만들고 친구를 초대해요',
        description: '내 매칭 준비는 끝났어요. 이제 같이 과팅할 친구를 모으면 큐에 들어갈 수 있어요.',
        href: '/group/create',
        cta: '그룹 만들기',
        Icon: UsersRound,
        tone: 'neutral' as const,
        secondaryHref: '/friends',
        secondaryCta: '친구 초대',
      }
    }

    if (setupStarted) {
      return {
        eyebrow: '매칭 준비',
        title: '매칭 준비를 이어가요',
        description: '성향, 안 되는 시간, 비중, 사전 카드 중 남은 것만 끝내면 다음 단계로 넘어가요.',
        href: '/match/start',
        cta: '준비 이어가기',
        Icon: Search,
        tone: 'primary' as const,
        secondaryHref: '/friends',
        secondaryCta: '친구 초대',
      }
    }

    return {
      eyebrow: '매칭 시작',
      title: '매칭을 찾아주세요!',
      description: '내 설정을 끝낸 뒤 친구가 수락하고 준비까지 마치면 이번 주 큐에 들어갈 수 있어요.',
      href: '/match/start',
      cta: '매칭 찾기',
      Icon: Search,
      tone: 'primary' as const,
      secondaryHref: '/friends',
      secondaryCta: '친구 초대',
    }
  }, [groupStatus, loading, matchSetupStatus, matches, pendingMatch, preMatchCardDone, soloStatus])

  const Icon = task.Icon
  const isSoloQueue = soloStatus === 'in_pool'
  const isSoloMatched = soloStatus === 'matched'
  const isSoloFlow = isSoloQueue || isSoloMatched
  const showGroupPreview = !isSoloFlow && (task.href === '/match/start' || task.href === '/group/create')
  const hasGroup = !isSoloFlow && (groupStatus != null || groupMembers.length > 0)
  const progressValue = matchSetupStatus.allDone && preMatchCardDone
    ? 100
    : [
        matchSetupStatus.personality,
        matchSetupStatus.schedule,
        matchSetupStatus.preferences,
        preMatchCardDone,
      ].filter(Boolean).length * 25
  const progressDone = Math.round(progressValue / 25)
  const memberNames = isSoloFlow
    ? ['나']
    : groupMembers.length > 0
    ? groupMembers.map((member) => member.user_id === currentUserId ? '나' : member.display_name || '친구')
    : ['나']
  const teamCardName = isSoloFlow
    ? '1:1 소개팅'
    : hasGroup
      ? '내 과팅 팀'
      : '팀을 만들어주세요'
  const teamCardStatus = loading
    ? '확인 중'
    : isSoloMatched
      ? '가매칭 도착'
      : isSoloQueue
        ? '상대 탐색 중'
        : groupStatus === 'in_pool'
          ? '매칭 탐색 중'
          : groupStatus === 'ready'
            ? '큐 진입 가능'
            : '준비 중'
  const teamProgressLabel = isSoloMatched
    ? '1:1 가매칭 도착 - 보증금과 사전 카드를 준비해요'
    : isSoloQueue
      ? '1:1 매칭대기중 - 조건이 맞는 상대를 찾는 중'
      : `팀 성향 분석 ${progressDone}/4 완료${progressDone < 4 ? ' - 한 명만 더!' : ''}`
  const canCancelQueueFromHome = soloStatus === 'in_pool' || groupStatus === 'in_pool'
  const cancelQueueLabel = soloStatus === 'in_pool' ? '1:1 매칭 취소하기' : '매칭 취소하기'
  const canCancelActiveMatchFromHome = Boolean(pendingMatch) || soloStatus === 'matched'
  const cancelMatchLabel = soloStatus === 'matched' ? '1:1 매칭 취소하기' : '매칭 취소하기'
  const teamCardAction = canCancelQueueFromHome
    ? {
        label: cancelQueueLabel,
        onClick: handleCancelQueue,
        disabled: cancelingQueue,
      }
    : canCancelActiveMatchFromHome
      ? {
          label: cancelMatchLabel,
          onClick: handleCancelActiveMatch,
          disabled: cancelingMatch,
        }
      : undefined

  return (
    <section className="mb-6">
      <DarkTeamProgressCard
        groupName={teamCardName}
        members={memberNames}
        progressValue={progressValue}
        progressLabel={teamProgressLabel}
        status={teamCardStatus}
        action={teamCardAction}
      />

      <div className="mt-4 rounded-[30px] bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-boot-primary">{task.eyebrow}</p>
            <h2 className="mt-3 text-2xl font-black leading-tight text-boot-ink">{task.title}</h2>
            <p className="mt-2 text-sm leading-6 text-boot-muted">{task.description}</p>
          </div>
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[24px] bg-boot-soft text-boot-primary shadow-sm">
            {loading ? <Loader2 size={19} className="animate-spin" /> : <Icon size={22} />}
          </div>
        </div>

        <div className={task.secondaryHref || canCancelQueueFromHome || canCancelActiveMatchFromHome ? 'mt-6 grid grid-cols-1 gap-2' : 'mt-6'}>
          <Link
            href={task.href}
            className="flex h-14 items-center justify-center gap-2 rounded-[24px] bg-boot-ink px-4 text-base font-black text-white shadow-[0_16px_34px_rgba(23,20,18,0.22)] transition hover:opacity-95"
          >
            {task.cta}
            <ChevronRight size={18} />
          </Link>
          {task.secondaryHref && task.secondaryCta && (
            <Link
              href={task.secondaryHref}
              className="flex h-14 items-center justify-center rounded-[24px] border border-boot-primary/20 bg-boot-soft px-4 text-sm font-black text-boot-primary"
            >
              {task.secondaryCta}
            </Link>
          )}
          {canCancelQueueFromHome && (
            <button
              type="button"
              onClick={handleCancelQueue}
              disabled={cancelingQueue}
              className="flex h-12 items-center justify-center rounded-[22px] border border-boot-primary/25 bg-white px-4 text-sm font-black text-boot-primary shadow-sm transition hover:bg-boot-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelingQueue ? '취소하는 중...' : cancelQueueLabel}
            </button>
          )}
          {canCancelActiveMatchFromHome && (
            <button
              type="button"
              onClick={handleCancelActiveMatch}
              disabled={cancelingMatch}
              className="flex h-12 items-center justify-center rounded-[22px] border border-boot-primary/25 bg-white px-4 text-sm font-black text-boot-primary shadow-sm transition hover:bg-boot-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelingMatch ? '취소하는 중...' : cancelMatchLabel}
            </button>
          )}
        </div>

        {showGroupPreview && (
          <CurrentGroupPreview
            className="mt-4"
            members={groupMembers}
            capacity={groupSize}
            currentUserId={currentUserId}
            hasGroup={hasGroup}
          />
        )}
      </div>
    </section>
  )
}

function hasPreMatchCardDraftCookie(): boolean {
  if (typeof document === 'undefined') return false
  const value = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${PRE_MATCH_CARD_DRAFT_COOKIE}=`))
    ?.split('=')[1]
  return isPreMatchCardDraftCookieDone(value)
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
