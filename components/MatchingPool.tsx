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
        male: row2.male,
        female: row2.female,
        active: !empty && (row2.male > 0 || row2.female > 0),
      },
      {
        label: '3:3 그룹',
        male: row3.male,
        female: row3.female,
        active: !empty && (row3.male > 0 || row3.female > 0),
      },
    ]
  }, [target.bySize])

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-black text-boot-primary tracking-[0.18em] uppercase">Weekly Queue</p>
          <h2 className="mt-2 text-xl font-black text-boot-ink">주간 매칭 큐</h2>
          <p className="mt-1 text-xs text-boot-muted">토요일 14:00에 조건 맞는 그룹끼리 자동 배치돼.</p>
        </div>
        <div className="h-11 w-11 rounded-2xl bg-boot-soft border border-boot-hairline flex items-center justify-center text-boot-primary">
          <CalendarClock size={20} />
        </div>
      </div>

      <div className="rounded-3xl border border-boot-hairline bg-white p-4 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-boot-muted" />
            <span className="text-sm font-black text-boot-ink">이번 주 대기 그룹</span>
          </div>
          <span className="text-2xl font-black text-boot-primary">{totalGroups}</span>
        </div>

        <div className="space-y-2.5">
          {queueRows.map((row) => {
            const maleWidth = Math.max(18, Math.min(70, row.male * 13))
            const femaleWidth = Math.max(18, Math.min(70, row.female * 11))
            return (
              <div key={row.label} className="grid grid-cols-[76px_1fr] items-center gap-3">
                <span className="text-[11px] font-bold text-boot-muted">{row.label}</span>
                <div className="h-10 rounded-2xl bg-boot-soft border border-boot-hairline px-2 flex items-center gap-2 overflow-hidden">
                  <div
                    className={`h-6 rounded-xl bg-sky-300/60 border border-sky-200 transition-all duration-700 ${
                      row.active ? 'shadow-[0_0_18px_rgba(125,211,252,0.26)]' : ''
                    }`}
                    style={{ width: `${maleWidth}%` }}
                  />
                  <div className="h-px flex-1 bg-boot-hairline" />
                  <div
                    className={`h-6 rounded-xl bg-boot-primary/45 border border-rose-200 transition-all duration-700 ${
                      row.active ? 'shadow-[0_0_18px_rgba(255,90,111,0.24)]' : ''
                    }`}
                    style={{ width: `${femaleWidth}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-2xl bg-white border border-boot-hairline px-3 py-3">
          <p className="text-lg font-black text-sky-600">{displayed.male}</p>
          <p className="mt-1 text-[10px] text-boot-muted leading-snug">남자 그룹</p>
        </div>
        <div className="rounded-2xl bg-white border border-boot-hairline px-3 py-3">
          <p className="text-lg font-black text-boot-primary">{displayed.female}</p>
          <p className="mt-1 text-[10px] text-boot-muted leading-snug">여자 그룹</p>
        </div>
        <div className="rounded-2xl bg-white border border-boot-hairline px-3 py-3">
          <p className="text-lg font-black text-amber-600">2~3</p>
          <p className="mt-1 text-[10px] text-boot-muted leading-snug">그룹 인원</p>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
        <ShieldCheck size={17} className="text-emerald-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-black text-emerald-700">상대 정보는 잠금 상태</p>
          <p className="mt-0.5 text-[11px] text-boot-muted leading-relaxed">
            그룹 인원, 시간대, 학과 제외, 선호 벡터가 맞을 때만 매칭 결과로 공개돼.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-boot-muted">
        <LockKeyhole size={12} />
        대기 숫자는 그룹 단위 기준이야.
      </div>
    </div>
  )
}
