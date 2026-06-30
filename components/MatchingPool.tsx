'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Heart, LockKeyhole, ShieldCheck, UserRound, Users } from 'lucide-react'

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
  size: 2 | 3
  male: number
  female: number
  mixed: number
  active: boolean
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
    const bySize = target.bySize
    const empty = bySize == null
    const row2 = bySize?.['2'] ?? { female: 0, male: 0, mixed: 0 }
    const row3 = bySize?.['3'] ?? { female: 0, male: 0, mixed: 0 }

    return [
      {
        label: '2:2 매칭찾기',
        size: 2,
        male: row2.male,
        female: row2.female,
        mixed: row2.mixed,
        active: !empty && (row2.male > 0 || row2.female > 0 || row2.mixed > 0),
      },
      {
        label: '3:3 매칭찾기',
        size: 3,
        male: row3.male,
        female: row3.female,
        mixed: row3.mixed,
        active: !empty && (row3.male > 0 || row3.female > 0 || row3.mixed > 0),
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
            토요일 14:00에 조건이 맞는 그룹끼리 자동 배정돼요.
          </p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-boot-hairline bg-boot-soft text-boot-primary">
          <CalendarClock size={20} />
        </div>
      </div>

      <SoloIntroCard female={soloStats.female} male={soloStats.male} total={totalSoloUsers} />

      <div className="mb-4 rounded-[30px] border border-boot-hairline bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-boot-muted" />
            <span className="text-sm font-black text-boot-ink">현재 대기 그룹</span>
          </div>
          <span className="text-2xl font-black text-boot-primary">{totalGroups}</span>
        </div>

        <div className="grid gap-3">
          {queueRows.map((row) => (
            <QueueCircleCard key={row.label} row={row} />
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        <StatBox value={displayed.male} label="남자 그룹" tone="text-sky-600" />
        <StatBox value={displayed.female} label="여자 그룹" tone="text-boot-primary" />
        <StatBox value={displayed.mixed} label="혼성 그룹" tone="text-amber-600" />
        <StatBox value="2~3" label="그룹 인원" tone="text-amber-600" />
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <ShieldCheck size={17} className="mt-0.5 flex-shrink-0 text-emerald-600" />
        <div>
          <p className="text-xs font-black text-emerald-700">혼성 그룹도 가능해요</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-boot-muted">
            친구 성별이 섞인 그룹도 만들 수 있어요. 혼성 대기자는 별도로 표시하고,
            2:2와 3:3은 같은 인원 규모끼리 매칭돼요.
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
        <div className="relative flex items-start gap-4">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full p-[9px] shadow-[0_16px_30px_rgba(255,79,105,0.18)]"
            style={{
              background: total > 0
                ? `conic-gradient(#93d8f2 0deg ${maleEnd}deg, #ff8fa2 ${maleEnd}deg 360deg)`
                : 'conic-gradient(#f8f1ec 0deg 360deg)',
            }}
          >
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
              <Heart size={17} className="text-boot-primary" fill="currentColor" />
              <span className="mt-1 text-2xl font-black tabular-nums text-boot-ink">{total}</span>
              <span className="text-[10px] font-bold text-boot-muted">대기자</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-boot-primary">
              Solo Match
            </p>
            <h3 className="mt-1 text-xl font-black leading-tight text-boot-ink">1:1 소개팅 매치</h3>
            <p className="mt-1 text-xs leading-5 text-boot-muted">
              친구를 모으지 않아도 혼자 신청할 수 있어요. 내 성향, 시간, 비중, 사전 카드만 준비하면 조건이 맞는 한 명을 찾아요.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <SoloStat label="남자 대기자" value={male} tone="sky" />
              <SoloStat label="여자 대기자" value={female} tone="rose" />
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

function SoloStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'sky' | 'rose'
}) {
  const toneClass = tone === 'sky'
    ? 'border-sky-100 bg-sky-50 text-sky-600'
    : 'border-rose-100 bg-rose-50 text-boot-primary'

  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneClass}`}>
      <p className="text-lg font-black tabular-nums">{value}명</p>
      <p className="mt-0.5 text-[10px] font-bold opacity-75">{label}</p>
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
    <div className="rounded-[28px] border border-boot-hairline bg-boot-soft/60 px-3 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-boot-ink">{row.label}</p>
          <p className="mt-0.5 text-[11px] text-boot-muted">
            총 {totalTeams}팀 · 참가 {totalPeople}명
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-boot-primary">
          {totalTeams}팀
        </span>
      </div>

      <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
        <div
          className={[
            'relative h-32 w-32 rounded-full p-[10px] shadow-[0_16px_28px_rgba(23,20,18,0.08)]',
            row.active ? 'animate-[pulse_2.6s_ease-in-out_infinite]' : '',
          ].join(' ')}
          style={{ background: buildRingGradient(row) }}
          aria-label={`${row.label} ${totalTeams}팀`}
        >
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-boot-hairline bg-white text-center">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-boot-muted">
              {row.size}:{row.size}
            </span>
            <span className="mt-0.5 text-3xl font-black tabular-nums text-boot-ink">
              {totalTeams}
            </span>
            <span className="text-[10px] font-bold text-boot-muted">대기 팀</span>
          </div>
          <QueueDotCluster row={row} />
        </div>

        <div className="grid gap-2">
          <QueuePill label="남자팀" teams={row.male} people={malePeople} tone="sky" />
          <QueuePill label="혼성팀" teams={row.mixed} people={mixedPeople} tone="amber" />
          <QueuePill label="여자팀" teams={row.female} people={femalePeople} tone="rose" />
        </div>
      </div>

      <Link
        href={`/group/create?size=${row.size}`}
        className="mt-3 flex h-11 items-center justify-center rounded-full bg-boot-ink text-xs font-black text-white shadow-[0_12px_24px_rgba(23,20,18,0.16)]"
      >
        {row.size}:{row.size} 그룹으로 시작하기
      </Link>
    </div>
  )
}

function QueueDotCluster({ row }: { row: QueueRow }) {
  const total = row.male + row.female + row.mixed
  const count = Math.min(total, 12)

  if (count === 0) {
    return (
      <span className="absolute right-2 top-2 h-3 w-3 rounded-full border border-boot-hairline bg-white" />
    )
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from({ length: count }).map((_, index) => {
        const angle = (index / count) * Math.PI * 2 - Math.PI / 2
        const radius = 57
        const x = 66 + Math.cos(angle) * radius
        const y = 66 + Math.sin(angle) * radius
        return (
          <span
            key={index}
            className={`absolute h-1.5 w-1.5 rounded-full border border-white/95 shadow-[0_2px_6px_rgba(23,20,18,0.14)] ${getQueueDotTone(index, row, count)}`}
            style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
          />
        )
      })}
    </div>
  )
}

function getQueueDotTone(index: number, row: QueueRow, count: number): string {
  const total = row.male + row.female + row.mixed
  if (total <= 0) return 'bg-white'

  const emphasis = count <= 8 || index % 2 === 0
  return emphasis ? 'bg-white/95' : 'bg-stone-100/90'
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

function QueuePill({
  label,
  teams,
  people,
  tone,
}: {
  label: string
  teams: number
  people: number
  tone: QueueTone
}) {
  const toneClass =
    tone === 'sky'
      ? 'text-sky-600 bg-sky-50 border-sky-100'
      : tone === 'amber'
        ? 'text-amber-700 bg-amber-50 border-amber-100'
        : 'text-boot-primary bg-white border-rose-100'

  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneClass}`}>
      <p className="text-sm font-black">{teams}팀</p>
      <p className="mt-0.5 text-[10px] font-bold opacity-75">{label} · {people}명</p>
    </div>
  )
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
