'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck2, ChevronRight, Loader2, Search, Sparkles, UsersRound } from 'lucide-react'
import { getDevMatchSetupStatusFromClient, isDevPreviewClientSession } from '@/lib/dev-match-setup'
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

type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'

interface MatchRow {
  match_id: string
  match_status: string
  scheduled_start: string | null
  venue_name: string | null
}

interface GroupsResponse {
  group: { status: GroupStatus; size?: number | null } | null
  members?: CurrentGroupMember[]
  current_user_id?: string | null
  current_user_match_setup?: MatchSetupStatus
}

interface MatchesResponse {
  matches: MatchRow[]
}

export default function HomeTodayTaskCard() {
  const isDevPreview = isDevPreviewClientSession()
  const [loading, setLoading] = useState(true)
  const [groupStatus, setGroupStatus] = useState<GroupStatus | null>(null)
  const [groupSize, setGroupSize] = useState(3)
  const [groupMembers, setGroupMembers] = useState<CurrentGroupMember[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [matchSetupStatus, setMatchSetupStatus] = useState<MatchSetupStatus>(EMPTY_MATCH_SETUP_STATUS)
  const [preMatchCardDone, setPreMatchCardDone] = useState(false)
  const [matches, setMatches] = useState<MatchRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    if (isDevPreview) {
      setGroupStatus(null)
      setGroupSize(DEV_PREVIEW_GROUP.size)
      setGroupMembers(DEV_PREVIEW_GROUP_MEMBERS)
      setCurrentUserId(DEV_PREVIEW_CURRENT_USER_ID)
      setMatchSetupStatus(getDevMatchSetupStatusFromClient())
      setPreMatchCardDone(hasPreMatchCardDraftCookie())
      setMatches([])
      setLoading(false)
      return
    }

    try {
      const [groupRes, matchRes] = await Promise.all([
        fetch('/api/groups'),
        fetch('/api/matches'),
      ])

      if (groupRes.ok) {
        const data = await groupRes.json() as GroupsResponse
        setGroupStatus(data.group?.status ?? null)
        setGroupSize(data.group?.size ?? 3)
        setGroupMembers(data.members ?? [])
        setCurrentUserId(data.current_user_id ?? null)
        setMatchSetupStatus(data.current_user_match_setup ?? EMPTY_MATCH_SETUP_STATUS)
        setPreMatchCardDone(hasPreMatchCardDraftCookie())
      }
      if (matchRes.ok) {
        const data = await matchRes.json() as MatchesResponse
        setMatches(data.matches ?? [])
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

  const task = useMemo(() => {
    const setupStarted =
      matchSetupStatus.personality ||
      matchSetupStatus.schedule ||
      matchSetupStatus.preferences ||
      preMatchCardDone
    const setupCoreDone = matchSetupStatus.allDone && preMatchCardDone

    const pending = matches.find((match) => match.match_status === 'pending')
    if (pending) {
      return {
        eyebrow: '오늘 할 일',
        title: '사전 힌트를 입력해주세요',
        description: '상대에게 하루 한 장씩 공개될 익명 힌트 재료예요.',
        href: `/match/${encodeURIComponent(pending.match_id)}`,
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

    if (groupStatus === 'ready' || groupStatus === 'in_pool') {
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
  }, [groupStatus, matchSetupStatus, matches, preMatchCardDone])

  const Icon = task.Icon
  const showGroupPreview = task.href === '/match/start' || task.href === '/group/create'
  const hasGroup = groupStatus != null || groupMembers.length > 0

  return (
    <section className={[
      'mb-5 overflow-hidden rounded-[30px] border p-5 shadow-sm',
      task.tone === 'success'
        ? 'border-emerald-400/25 bg-emerald-50'
        : task.tone === 'primary'
          ? 'border-boot-primary/18 bg-boot-soft'
          : 'border-boot-hairline bg-white/90',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-normal text-boot-primary">{task.eyebrow}</p>
          <h2 className="mt-2 text-xl font-black leading-tight text-boot-ink">{task.title}</h2>
          <p className="mt-2 text-xs leading-5 text-boot-muted">{task.description}</p>
        </div>
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white text-boot-primary shadow-sm">
          {loading ? <Loader2 size={19} className="animate-spin" /> : <Icon size={20} />}
        </div>
      </div>

      <div className={task.secondaryHref ? 'mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]' : 'mt-5'}>
        <Link
          href={task.href}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-boot-ink px-4 text-sm font-black text-white shadow-sm transition hover:opacity-95"
        >
          {task.cta}
          <ChevronRight size={16} />
        </Link>
        {task.secondaryHref && task.secondaryCta && (
          <Link
            href={task.secondaryHref}
            className="flex h-12 items-center justify-center rounded-2xl border border-boot-primary/20 bg-white px-4 text-xs font-black text-boot-primary shadow-sm"
          >
            {task.secondaryCta}
          </Link>
        )}
      </div>

      {showGroupPreview && (
        <CurrentGroupPreview
          className="mt-3"
          members={groupMembers}
          capacity={groupSize}
          currentUserId={currentUserId}
          hasGroup={hasGroup}
        />
      )}
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
