'use client'

import { useState } from 'react'
import type { DayOfWeek, AvailableTimeslots } from '@/lib/types'

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: 'monday',    label: '월' },
  { key: 'tuesday',   label: '화' },
  { key: 'wednesday', label: '수' },
  { key: 'thursday',  label: '목' },
  { key: 'friday',    label: '금' },
  { key: 'saturday',  label: '토' },
  { key: 'sunday',    label: '일' },
]

// 18:00 ~ 23:00, 30분 단위
const TIME_OPTIONS = Array.from({ length: 11 }, (_, i) => {
  const totalMins = 18 * 60 + i * 30
  const h = String(Math.floor(totalMins / 60)).padStart(2, '0')
  const m = String(totalMins % 60).padStart(2, '0')
  return `${h}:${m}`
})

interface DaySlot {
  enabled: boolean
  start: string
  end: string
}

const DEFAULT_SLOT: DaySlot = { enabled: false, start: '18:00', end: '22:00' }

interface Props {
  initialValue?: AvailableTimeslots
  onChange: (value: AvailableTimeslots) => void
}

export default function SchedulePicker({ initialValue, onChange }: Props) {
  const [slots, setSlots] = useState<Record<DayOfWeek, DaySlot>>(() => {
    const base = Object.fromEntries(DAYS.map(({ key }) => [key, { ...DEFAULT_SLOT }])) as Record<DayOfWeek, DaySlot>
    if (initialValue) {
      for (const s of initialValue.slots) {
        base[s.day] = { enabled: true, start: s.start, end: s.end }
      }
    }
    return base
  })

  function update(day: DayOfWeek, patch: Partial<DaySlot>) {
    setSlots((prev) => {
      const next = { ...prev, [day]: { ...prev[day], ...patch } }
      const value: AvailableTimeslots = {
        slots: DAYS.filter(({ key }) => next[key].enabled).map(({ key }) => ({
          day: key,
          start: next[key].start,
          end: next[key].end,
        })),
      }
      onChange(value)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {DAYS.map(({ key, label }) => {
        const slot = slots[key]
        const isWeekend = key === 'saturday' || key === 'sunday'
        return (
          <div
            key={key}
            className={`rounded-2xl transition-all duration-200 overflow-hidden border ${
              slot.enabled
                ? 'glass border-violet-500/30'
                : 'bg-white/[0.03] border-white/5'
            }`}
          >
            <button
              type="button"
              onClick={() => update(key, { enabled: !slot.enabled })}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-colors ${
                    slot.enabled
                      ? 'gradient-brand text-white'
                      : isWeekend
                      ? 'bg-white/10 text-rose-400'
                      : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {label}
                </span>
                <span className={`text-sm font-medium transition-colors ${slot.enabled ? 'text-white' : 'text-gray-600'}`}>
                  {slot.enabled ? `${slot.start} ~ ${slot.end}` : '선택 안 함'}
                </span>
              </div>
              <div
                className={`w-11 h-6 rounded-full transition-colors duration-300 relative flex-shrink-0 ${
                  slot.enabled ? 'bg-violet-600' : 'bg-white/10'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${
                    slot.enabled ? 'left-6' : 'left-1'
                  }`}
                />
              </div>
            </button>

            {slot.enabled && (
              <div className="px-4 pb-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-1.5">시작</p>
                  <select
                    value={slot.start}
                    onChange={(e) => update(key, { start: e.target.value })}
                    className="w-full glass text-white text-sm rounded-xl px-3 py-2.5 appearance-none border border-white/10 focus:outline-none focus:border-violet-500"
                  >
                    {TIME_OPTIONS.slice(0, -1).map((t) => (
                      <option key={t} value={t} className="bg-[#0a0a14]">{t}</option>
                    ))}
                  </select>
                </div>
                <span className="text-gray-600 mt-5 text-sm">~</span>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-1.5">종료</p>
                  <select
                    value={slot.end}
                    onChange={(e) => update(key, { end: e.target.value })}
                    className="w-full glass text-white text-sm rounded-xl px-3 py-2.5 appearance-none border border-white/10 focus:outline-none focus:border-violet-500"
                  >
                    {TIME_OPTIONS.filter((t) => t > slot.start).map((t) => (
                      <option key={t} value={t} className="bg-[#0a0a14]">{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
