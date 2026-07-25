'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { CalendarCheck2, ChevronRight, Loader2, RotateCw, Search, Sparkles, UsersRound } from 'lucide-react'
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
import { DEV_PREVIEW_GROUP } from '@/lib/matching/dev-preview-group'
import {
  getMatchingFrontendLoadFailure,
  getMatchingFrontendLoadMessage,
  getMatchingFrontendPayloadFailure,
  type MatchingFrontendLoadFailure,
} from '@/lib/matching/frontend-load-state'
import { isGroupQueueActive } from '@/lib/matching/group-queue-state'
import { isActiveMatchStatus } from '@/lib/matching/match-view-state'

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
  match_pool_status: 'waiting' | 'rolled_over' | null
  members: unknown[]
  invites: unknown[]
  friends: unknown[]
  current_user_match_setup: MatchSetupStatus
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
  const [matchPoolStatus, setMatchPoolStatus] = useState<'waiting' | 'rolled_over' | null>(null)
  const [groupSize, setGroupSize] = useState(3)
  const [matchSetupStatus, setMatchSetupStatus] = useState<MatchSetupStatus>(EMPTY_MATCH_SETUP_STATUS)
  const [preMatchCardDone, setPreMatchCardDone] = useState(false)
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [soloStatus, setSoloStatus] = useState<DevPreviewSoloStatus>('idle')
  const [cancelingMatch, setCancelingMatch] = useState(false)
  const [loadFailure, setLoadFailure] = useState<MatchingFrontendLoadFailure | null>(null)

  const clearActionableState = useCallback(() => {
    setGroupStatus(null)
    setGroupId(null)
    setMatchPoolStatus(null)
    setGroupSize(3)
    setMatchSetupStatus(EMPTY_MATCH_SETUP_STATUS)
    setPreMatchCardDone(false)
    setMatches([])
    setSoloStatus('idle')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailure(null)
    if (isDevPreview) {
      setGroupSize(getDevPreviewGroupSizeFromClient(DEV_PREVIEW_GROUP.size))
      const previewGroupStatus = getDevPreviewGroupStatusFromClient()
      setGroupStatus(previewGroupStatus)
      setMatchPoolStatus(previewGroupStatus === 'in_pool' ? 'waiting' : null)
      setGroupId(DEV_PREVIEW_GROUP.id)
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

      const requiredFailure = getMatchingFrontendLoadFailure({
        groups: groupRes,
        matches: matchRes,
      })
      if (requiredFailure) {
        clearActionableState()
        setLoadFailure(requiredFailure)
        return
      }

      const [groupPayload, matchPayload] = await Promise.all([
        groupRes.json() as Promise<unknown>,
        matchRes.json() as Promise<unknown>,
      ])
      const payloadFailure = getMatchingFrontendPayloadFailure({
        groups: groupPayload,
        matches: matchPayload,
      })
      if (payloadFailure) {
        clearActionableState()
        setLoadFailure(payloadFailure)
        return
      }

      const groupData = groupPayload as GroupsResponse
      setGroupStatus(groupData.group?.status ?? null)
      setMatchPoolStatus(groupData.match_pool_status ?? null)
      setGroupId(groupData.group?.id ?? null)
      setGroupSize(groupData.group?.size ?? 3)
      setMatchSetupStatus(groupData.current_user_match_setup)

      const matchData = matchPayload as MatchesResponse
      const nextMatches = matchData.matches ?? []
      setMatches(nextMatches)
      setSoloStatus(
        nextMatches.some(
          (match) => match.match_mode === 'solo' && isActiveMatchStatus(match.match_status),
        )
          ? 'matched'
          : 'idle',
      )

      if (cardDraftRes.ok) {
        const data = await cardDraftRes.json() as PreMatchCardDraftResponse
        setPreMatchCardDone(Number(data.draft?.completed_items ?? 0) >= 4)
      } else {
        setPreMatchCardDone(hasPreMatchCardDraftCookie())
      }
    } catch {
      clearActionableState()
      setLoadFailure('network_unavailable')
    } finally {
      setLoading(false)
    }
  }, [clearActionableState, isDevPreview])

  useEffect(() => {
    load()
  }, [load])

  const handleCancelQueue = useCallback(async () => {
    if (cancelingQueue) return

    const isSoloQueue = soloStatus === 'in_pool'
    const isGroupQueue = isGroupQueueActive(matchPoolStatus)
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
        setDevPreviewGroupStatus('forming')
        setGroupStatus('forming')
        setMatchPoolStatus(null)
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
  }, [cancelingQueue, groupId, isDevPreview, load, matchPoolStatus, soloStatus])

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
      }
    }

    const setupStarted =
      matchSetupStatus.personality ||
      matchSetupStatus.schedule ||
      matchSetupStatus.preferences ||
      preMatchCardDone
    const setupCoreDone = matchSetupStatus.allDone && preMatchCardDone

    if (loadFailure) {
      return {
        eyebrow: '연결 확인',
        title: '현재 진행 상태를 확인하지 못했어요',
        description: getMatchingFrontendLoadMessage(loadFailure),
        href: loadFailure === 'unauthorized' ? '/login?next=%2F' : '/match',
        cta: loadFailure === 'unauthorized' ? '다시 로그인' : '다시 불러오기',
        Icon: RotateCw,
      }
    }

    if (pendingMatch) {
      return {
        eyebrow: '오늘 할 일',
        title: '사전 힌트를 입력해주세요',
        description: '상대에게 하루 한 장씩 공개될 익명 힌트 재료예요.',
        href: `/match/${encodeURIComponent(pendingMatch.match_id)}`,
        cta: '사전 힌트 작성',
        Icon: Sparkles,
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
      }
    }

    if (isGroupQueueActive(matchPoolStatus)) {
      return {
        eyebrow: '매칭 진행 중',
        title: '매칭 큐에 들어가 있어요',
        description: '현재 대기 상태와 큐 화면을 확인할 수 있어요.',
        href: '/group/create?from=home-queue',
        cta: '큐 상태 보기',
        Icon: Search,
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
      }
    }

    return {
      eyebrow: '매칭 시작',
      title: '매칭을 찾아주세요!',
      description: '내 설정을 끝낸 뒤 친구가 수락하고 준비까지 마치면 이번 주 큐에 들어갈 수 있어요.',
      href: '/match/start',
      cta: '매칭 찾기',
      Icon: Search,
    }
  }, [groupStatus, loadFailure, loading, matchPoolStatus, matchSetupStatus, matches, pendingMatch, preMatchCardDone, soloStatus])

  const Icon = task.Icon
  const isSoloQueue = soloStatus === 'in_pool'
  const isSoloMatched = soloStatus === 'matched'
  const isSoloFlow = isSoloQueue || isSoloMatched
  const isGroupQueue = isGroupQueueActive(matchPoolStatus)
  const progressValue = matchSetupStatus.allDone && preMatchCardDone
    ? 100
    : [
        matchSetupStatus.personality,
        matchSetupStatus.schedule,
        matchSetupStatus.preferences,
        preMatchCardDone,
      ].filter(Boolean).length * 25
  const progressDone = Math.round(progressValue / 25)
  const teamCardStatus = loading
    ? '확인 중'
    : isSoloMatched
      ? '가매칭 도착'
      : isSoloQueue
        ? '상대 탐색 중'
        : isGroupQueue
          ? '매칭 탐색 중'
          : groupStatus === 'ready'
            ? '큐 진입 가능'
            : '준비 중'
  const canCancelQueueFromHome = soloStatus === 'in_pool' || isGroupQueue
  const cancelQueueLabel = soloStatus === 'in_pool' ? '1:1 매칭 취소하기' : '매칭 취소하기'
  const canCancelActiveMatchFromHome = Boolean(pendingMatch) || soloStatus === 'matched'
  const cancelMatchLabel = soloStatus === 'matched' ? '1:1 매칭 취소하기' : '매칭 취소하기'
  return (
    <section className="mb-6">
      <div className="overflow-hidden rounded-lg border border-boot-hairline bg-white shadow-[0_12px_30px_rgba(24,35,31,0.08)]">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-boot-soft">
          <Image
            src="/images/quantum-campus-group.webp"
            alt="캠퍼스 라운지에서 과팅을 준비하며 대화하는 대학생 네 명"
            fill
            sizes="(max-width: 480px) calc(100vw - 32px), 448px"
            className="object-cover"
            priority
          />
          <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-black text-boot-primary shadow-sm">
            {task.eyebrow}
          </span>
        </div>
        <div className="px-5 py-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-boot-hairline pb-3 text-xs font-black">
          <span className="text-boot-primary">{isSoloFlow ? '1:1' : `${groupSize}:${groupSize}`} · {teamCardStatus}</span>
          <span className="text-boot-muted">준비 {progressDone}/4</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-black leading-tight text-boot-ink">{task.title}</h2>
            <p className="mt-2 text-sm leading-6 text-boot-muted">{task.description}</p>
          </div>
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-boot-soft text-boot-primary">
            {loading ? <Loader2 size={19} className="animate-spin" /> : <Icon size={22} />}
          </div>
        </div>

        <div className={canCancelQueueFromHome || canCancelActiveMatchFromHome ? 'mt-6 grid grid-cols-1 gap-2' : 'mt-6'}>
          {loadFailure && loadFailure !== 'unauthorized' ? (
            <button
              type="button"
              onClick={load}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-md bg-boot-primary px-4 text-base font-black text-white transition-colors hover:bg-[#174d76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-boot-primary focus-visible:ring-offset-2"
            >
              다시 불러오기
              <RotateCw size={18} />
            </button>
          ) : (
            <Link
              href={task.href}
              className="flex h-14 items-center justify-center gap-2 rounded-md bg-boot-primary px-4 text-base font-black text-white transition-colors hover:bg-[#174d76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-boot-primary focus-visible:ring-offset-2"
            >
              {task.cta}
              <ChevronRight size={18} />
            </Link>
          )}
          {canCancelQueueFromHome && (
            <button
              type="button"
              onClick={handleCancelQueue}
              disabled={cancelingQueue}
              className="flex h-12 items-center justify-center rounded-md border border-boot-primary/25 bg-white px-4 text-sm font-black text-boot-primary transition hover:bg-boot-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelingQueue ? '취소하는 중...' : cancelQueueLabel}
            </button>
          )}
          {canCancelActiveMatchFromHome && (
            <button
              type="button"
              onClick={handleCancelActiveMatch}
              disabled={cancelingMatch}
              className="flex h-12 items-center justify-center rounded-md border border-boot-primary/25 bg-white px-4 text-sm font-black text-boot-primary transition hover:bg-boot-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelingMatch ? '취소하는 중...' : cancelMatchLabel}
            </button>
          )}
        </div>

        </div>
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
