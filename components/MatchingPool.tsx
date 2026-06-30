'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  ChevronRight,
  Heart,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

export interface PoolStats {
  female: number
  male: number
  mixed: number
  solo?: {
    female: number
    male: number
  }
  bySize?: {
    '2': { female: number; male: number; mixed: number }
    '3': { female: number; male: number; mixed: number }
  }
}

interface Props {
  stats?: PoolStats
  className?: string
}

type QueueTone = 'sky' | 'rose' | 'amber'

type QueueRow = {
  label: string
  title: string
  size: 2 | 3
  male: number
  female: number
  mixed: number
  description: string
}

const FALLBACK_STATS: PoolStats = {
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

export default function MatchingPool({ stats, className = '' }: Props) {
  const target = stats ?? FALLBACK_STATS
  const [displayed, setDisplayed] = useState({ female: 0, male: 0, mixed: 0 })

  useEffect(() => {
    const duration = 900
    const steps = 30
    const interval = duration / steps
    let step = 0
    const timer = window.setInterval(() => {
      step += 1
      const progress = step / steps
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplayed({
        female: Math.round(target.female * ease),
        male: Math.round(target.male * ease),
        mixed: Math.round(target.mixed * ease),
      })
      if (step >= steps) window.clearInterval(timer)
    }, interval)
    return () => window.clearInterval(timer)
  }, [target.female, target.male, target.mixed])

  const totalGroups = displayed.female + displayed.male + displayed.mixed
  const soloStats = target.solo ?? { female: 0, male: 0 }
  const totalSoloUsers = soloStats.female + soloStats.male

  const queueRows = useMemo<QueueRow[]>(() => {
    const row2 = target.bySize?.['2'] ?? { female: 0, male: 0, mixed: 0 }
    const row3 = target.bySize?.['3'] ?? { female: 0, male: 0, mixed: 0 }

    return [
      {
        label: '2:2 매칭찾기',
        title: '2:2 그룹 매치',
        size: 2,
        male: row2.male,
        female: row2.female,
        mixed: row2.mixed,
        description:
          '친구 한 명과 같이 신청해요. 남자팀, 여자팀, 혼성팀 대기 상황을 보고 같은 규모끼리 매칭돼요.',
      },
      {
        label: '3:3 매칭찾기',
        title: '3:3 그룹 매치',
        size: 3,
        male: row3.male,
        female: row3.female,
        mixed: row3.mixed,
        description:
          '세 명이 한 팀으로 들어가요. 팀 분위기와 시간, 비중이 맞는 다른 3명 팀을 찾아요.',
      },
    ]
  }, [target.bySize])

  return (
    <div className={`w-full ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-boot-primary">
            Weekly Queue
          </p>
          <h2 className="mt-2 text-xl font-black text-boot-ink">이번 주 매칭 대기</h2>
          <p className="mt-1 text-xs text-boot-muted">
            토요일 14:00에 조건이 맞는 사람끼리 자동 배정돼요.
          </p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-boot-hairline bg-boot-soft text-boot-primary">
          <CalendarClock size={20} />
        </div>
      </div>

      <SoloIntroCard female={soloStats.female} male={soloStats.male} total={totalSoloUsers} />

      <div className="grid gap-4">
        {queueRows.map((row) => (
          <QueueCircleCard key={row.label} row={row} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <StatBox value={displayed.male} label="남자 그룹" tone="text-sky-600" />
        <StatBox value={displayed.female} label="여자 그룹" tone="text-boot-primary" />
        <StatBox value={displayed.mixed} label="혼성 그룹" tone="text-amber-600" />
        <StatBox value="2~3" label="그룹 인원" tone="text-amber-600" />
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <ShieldCheck size={17} className="mt-0.5 flex-shrink-0 text-emerald-600" />
        <div>
          <p className="text-xs font-black text-emerald-700">혼성 그룹도 가능해요</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-boot-muted">
            친구 성별이 섞인 그룹도 만들 수 있어요. 대기 통계는 남자팀, 여자팀,
            혼성팀으로 나누고 2:2와 3:3은 같은 인원 규모끼리 매칭돼요.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-boot-muted">
        <LockKeyhole size={12} />
        대기 숫자는 그룹 단위 기준입니다.
      </div>
    </div>
  )
}

function SoloIntroCard({
  female,
  male,
  total,
}: {
  female: number
  male: number
  total: number
}) {
  const maleEnd = total > 0 ? (male / total) * 360 : 0

  return (
    <div className="mb-4 overflow-hidden rounded-[30px] border border-boot-primary/20 bg-white shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
      <div className="relative p-4">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-boot-primary/12 blur-2xl" />
        <div className="relative grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4">
          <QueueRing
            total={total}
            background={
              total > 0
                ? `conic-gradient(#93d8f2 0deg ${maleEnd}deg, #ff8fa2 ${maleEnd}deg 360deg)`
                : 'conic-gradient(#f8f1ec 0deg 360deg)'
            }
            label="대기자"
            badge={<Heart size={17} className="text-boot-primary" fill="currentColor" />}
          />
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-boot-primary">
              Solo Match
            </p>
            <h3 className="mt-1 text-xl font-black leading-tight text-boot-ink">
              1:1 소개팅 매치
            </h3>
            <p className="mt-1 text-xs leading-5 text-boot-muted">
              친구를 모으지 않아도 혼자 신청할 수 있어요. 내 성향, 시간, 비중,
              사전 카드만 준비하면 조건이 맞는 한 명을 찾아요.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <QueueStat label="남자 대기자" value={`${male}명`} tone="sky" />
              <QueueStat label="여자 대기자" value={`${female}명`} tone="rose" />
            </div>
          </div>
        </div>
        <Link
          href="/match/start?mode=solo"
          className="relative mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-boot-ink text-sm font-black text-white shadow-[0_12px_24px_rgba(23,20,18,0.16)]"
        >
          1:1 소개팅 시작하기
          <UserRound size={16} />
        </Link>
      </div>
    </div>
  )
}

function QueueCircleCard({ row }: { row: QueueRow }) {
  const totalTeams = row.male + row.female + row.mixed
  const totalPeople = totalTeams * row.size
  const malePeople = row.male * row.size
  const femalePeople = row.female * row.size
  const mixedPeople = row.mixed * row.size

  return (
    <div className="overflow-hidden rounded-[30px] border border-boot-primary/20 bg-white shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
      <div className="relative p-4">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-100/40 blur-2xl" />
        <div className="relative grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4">
          <QueueRing
            total={totalTeams}
            background={buildRingGradient(row)}
            label="대기 팀"
            badge={
              <span className="text-[15px] font-black text-boot-primary">
                {row.size}:{row.size}
              </span>
            }
          />

          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-boot-primary">
              Group Match
            </p>
            <div className="mt-1 flex items-start justify-between gap-2">
              <h3 className="min-w-0 text-xl font-black leading-tight text-boot-ink">
                {row.title}
              </h3>
              <span className="shrink-0 rounded-full bg-boot-primary/10 px-2.5 py-1 text-[11px] font-black text-boot-primary">
                {totalTeams}팀
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-boot-muted">{row.description}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <QueueStat label={`남자팀 · ${malePeople}명`} value={`${row.male}팀`} tone="sky" />
              <QueueStat label={`혼성팀 · ${mixedPeople}명`} value={`${row.mixed}팀`} tone="amber" />
              <QueueStat label={`여자팀 · ${femalePeople}명`} value={`${row.female}팀`} tone="rose" />
            </div>
          </div>
        </div>

        <Link
          href={`/group/create?size=${row.size}`}
          className="relative mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-boot-ink text-sm font-black text-white shadow-[0_12px_24px_rgba(23,20,18,0.16)]"
        >
          {row.size}:{row.size} 그룹으로 시작하기
          <ChevronRight size={17} />
        </Link>

        <p className="mt-2 text-center text-[10px] font-bold text-boot-muted">
          총 {totalPeople}명이 같은 규모 매칭을 기다리는 중이에요.
        </p>
      </div>
    </div>
  )
}

function QueueRing({
  total,
  background,
  label,
  badge,
}: {
  total: number
  background: string
  label: string
  badge: ReactNode
}) {
  return (
    <div
      className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full p-[9px] shadow-[0_16px_30px_rgba(255,79,105,0.16)]"
      style={{ background }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
        {badge}
        <span className="mt-1 text-3xl font-black tabular-nums text-boot-ink">{total}</span>
        <span className="text-[10px] font-bold text-boot-muted">{label}</span>
      </div>
    </div>
  )
}

function QueueStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: QueueTone
}) {
  const toneClass =
    tone === 'sky'
      ? 'border-sky-100 bg-sky-50 text-sky-600'
      : tone === 'amber'
        ? 'border-amber-100 bg-amber-50 text-amber-700'
        : 'border-rose-100 bg-rose-50 text-boot-primary'

  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneClass}`}>
      <p className="text-lg font-black tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] font-bold leading-tight opacity-75">{label}</p>
    </div>
  )
}

function buildRingGradient(row: QueueRow): string {
  const total = row.male + row.female + row.mixed
  if (total <= 0) return 'conic-gradient(#f8f1ec 0deg 360deg)'

  const maleEnd = (row.male / total) * 360
  const mixedEnd = maleEnd + (row.mixed / total) * 360

  return [
    'conic-gradient(',
    `#93d8f2 0deg ${maleEnd}deg, `,
    `#f6d86f ${maleEnd}deg ${mixedEnd}deg, `,
    `#ff8fa2 ${mixedEnd}deg 360deg`,
    ')',
  ].join('')
}

function StatBox({
  value,
  label,
  tone,
}: {
  value: number | string
  label: string
  tone: string
}) {
  return (
    <div className="rounded-2xl border border-boot-hairline bg-white px-3 py-3">
      <p className={`text-lg font-black ${tone}`}>{value}</p>
      <p className="mt-1 text-[10px] leading-snug text-boot-muted">{label}</p>
    </div>
  )
}
