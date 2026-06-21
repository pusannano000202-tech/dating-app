'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, LockKeyhole, ShieldCheck, Users } from 'lucide-react'

export interface PoolStats {
  female: number
  male: number
  bySize?: {
    '2': { female: number; male: number }
    '3': { female: number; male: number }
  }
}

interface Props {
  stats?: PoolStats
  className?: string
}

const FALLBACK_STATS: PoolStats = { female: 0, male: 0 }

export default function MatchingPool({ stats, className = '' }: Props) {
  const target = stats ?? FALLBACK_STATS
  const [displayed, setDisplayed] = useState({ female: 0, male: 0 })

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
      })
      if (step >= steps) window.clearInterval(timer)
    }, interval)
    return () => window.clearInterval(timer)
  }, [target.female, target.male])

  const totalGroups = displayed.female + displayed.male

  const queueRows = useMemo(() => {
    const bySize = target.bySize
    const empty = bySize == null
    const row2 = bySize?.['2'] ?? { female: 0, male: 0 }
    const row3 = bySize?.['3'] ?? { female: 0, male: 0 }
    return [
      {
        label: '2:2 그룹',
        size: 2,
        male: row2.male,
        female: row2.female,
        active: !empty && (row2.male > 0 || row2.female > 0),
      },
      {
        label: '3:3 그룹',
        size: 3,
        male: row3.male,
        female: row3.female,
        active: !empty && (row3.male > 0 || row3.female > 0),
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
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-boot-hairline bg-boot-soft text-boot-primary">
          <CalendarClock size={20} />
        </div>
      </div>

      <div className="mb-4 rounded-3xl border border-boot-hairline bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-boot-muted" />
            <span className="text-sm font-black text-boot-ink">현재 대기 그룹</span>
          </div>
          <span className="text-2xl font-black text-boot-primary">{totalGroups}</span>
        </div>

        <div className="space-y-3">
          {queueRows.map((row) => {
            const totalTeams = row.male + row.female
            const totalPeople = totalTeams * row.size
            const malePeople = row.male * row.size
            const femalePeople = row.female * row.size
            const maleWidth = row.male > 0 ? Math.max(12, Math.min(72, row.male * 12)) : 0
            const femaleWidth = row.female > 0 ? Math.max(12, Math.min(72, row.female * 12)) : 0
            return (
              <div key={row.label} className="rounded-2xl border border-boot-hairline bg-boot-soft/60 px-3 py-3">
                <div className="mb-2 flex items-start justify-between gap-3">
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

                <div className="mb-2 flex h-9 items-center gap-2 overflow-hidden rounded-2xl border border-boot-hairline bg-white px-2">
                  <div
                    className={`h-5 rounded-xl border border-sky-200 bg-sky-300/70 transition-all duration-700 ${
                      row.active ? 'shadow-[0_0_18px_rgba(125,211,252,0.26)]' : ''
                    }`}
                    style={{ width: `${maleWidth}%` }}
                  />
                  <div className="h-px flex-1 bg-boot-hairline" />
                  <div
                    className={`h-5 rounded-xl border border-rose-200 bg-boot-primary/50 transition-all duration-700 ${
                      row.active ? 'shadow-[0_0_18px_rgba(255,90,111,0.24)]' : ''
                    }`}
                    style={{ width: `${femaleWidth}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <QueuePill label="남자 대표" teams={row.male} people={malePeople} tone="sky" />
                  <QueuePill label="여자 대표" teams={row.female} people={femalePeople} tone="rose" />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatBox value={displayed.male} label="남자 그룹" tone="text-sky-600" />
        <StatBox value={displayed.female} label="여자 그룹" tone="text-boot-primary" />
        <StatBox value="2~3" label="그룹 인원" tone="text-amber-600" />
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <ShieldCheck size={17} className="mt-0.5 flex-shrink-0 text-emerald-600" />
        <div>
          <p className="text-xs font-black text-emerald-700">혼성 그룹도 가능해요</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-boot-muted">
            친구 성별이 섞인 그룹도 만들 수 있어요. 위 남자/여자 숫자는 매칭 계산에 쓰는 대표 성별 기준입니다.
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

function QueuePill({
  label,
  teams,
  people,
  tone,
}: {
  label: string
  teams: number
  people: number
  tone: 'sky' | 'rose'
}) {
  const toneClass = tone === 'sky' ? 'text-sky-600 bg-sky-50 border-sky-100' : 'text-boot-primary bg-white border-rose-100'

  return (
    <div className={`rounded-2xl border px-2.5 py-2 ${toneClass}`}>
      <p className="text-xs font-black">{teams}팀</p>
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
