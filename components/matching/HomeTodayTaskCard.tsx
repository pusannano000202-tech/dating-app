'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck2, ChevronRight, Loader2, Search, Sparkles, UserPlus, UsersRound } from 'lucide-react'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'

type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'

interface MatchRow {
  match_id: string
  match_status: string
  scheduled_start: string | null
  venue_name: string | null
}

interface GroupsResponse {
  group: { status: GroupStatus } | null
}

interface MatchesResponse {
  matches: MatchRow[]
}

const DEV_MATCHES: MatchRow[] = [
  {
    match_id: 'dev-match-pending',
    match_status: 'pending',
    scheduled_start: null,
    venue_name: null,
  },
  {
    match_id: 'dev-match-1',
    match_status: 'confirmed',
    scheduled_start: new Date(Date.now() + 1000 * 60 * 60 * 26).toISOString(),
    venue_name: 'PNU Station Cafe',
  },
]

export default function HomeTodayTaskCard() {
  const isDevPreview = isDevPreviewClientSession()
  const [loading, setLoading] = useState(true)
  const [groupStatus, setGroupStatus] = useState<GroupStatus | null>(null)
  const [matches, setMatches] = useState<MatchRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    if (isDevPreview) {
      setGroupStatus('in_pool')
      setMatches(DEV_MATCHES)
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
      }
    }

    if (groupStatus === 'forming') {
      return {
        eyebrow: '그룹 준비',
        title: '친구 초대를 마무리해요',
        description: '친구가 준비를 끝내면 매칭 큐에 들어갈 수 있어요.',
        href: '/group/create',
        cta: '내 그룹 보기',
        Icon: UsersRound,
        tone: 'neutral' as const,
      }
    }

    return {
      eyebrow: '시작하기',
      title: '친구와 그룹을 만들어볼까요?',
      description: '같이 과팅할 친구를 먼저 모으고 매칭을 시작해요.',
      href: '/friends',
      cta: '친구 추가',
      Icon: UserPlus,
      tone: 'neutral' as const,
    }
  }, [groupStatus, matches])

  const Icon = task.Icon

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

      <Link
        href={task.href}
        className="mt-5 flex h-12 items-center justify-center gap-2 rounded-2xl bg-boot-ink px-4 text-sm font-black text-white shadow-sm transition hover:opacity-95"
      >
        {task.cta}
        <ChevronRight size={16} />
      </Link>
    </section>
  )
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
