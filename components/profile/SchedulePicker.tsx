'use client'

import { useEffect, useMemo, useState } from 'react'
import { Ban, CheckCircle2, Clock3 } from 'lucide-react'
import type { DayOfWeek, AvailableTimeslots } from '@/lib/types'

const DAYS: { key: DayOfWeek; label: string; fullLabel: string }[] = [
  { key: 'monday', label: '월', fullLabel: '월요일' },
  { key: 'tuesday', label: '화', fullLabel: '화요일' },
  { key: 'wednesday', label: '수', fullLabel: '수요일' },
  { key: 'thursday', label: '목', fullLabel: '목요일' },
  { key: 'friday', label: '금', fullLabel: '금요일' },
  { key: 'saturday', label: '토', fullLabel: '토요일' },
  { key: 'sunday', label: '일', fullLabel: '일요일' },
]

const TIME_BLOCKS = [
  { start: '18:00', end: '19:00', label: '18시' },
  { start: '19:00', end: '20:00', label: '19시' },
  { start: '20:00', end: '21:00', label: '20시' },
  { start: '21:00', end: '22:00', label: '21시' },
  { start: '22:00', end: '23:00', label: '22시' },
]

type BlockedState = Record<DayOfWeek, string[]>

interface Props {
  initialValue?: AvailableTimeslots
  onChange: (value: AvailableTimeslots) => void
}

function createEmptyBlocked(): BlockedState {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  }
}

function slotCoversBlock(slot: AvailableTimeslots['slots'][number], start: string, end: string) {
  return slot.start <= start && slot.end >= end
}

function buildInitialBlocked(initialValue?: AvailableTimeslots): BlockedState {
  if (!initialValue?.slots?.length) return createEmptyBlocked()

  const next = createEmptyBlocked()
  for (const day of DAYS) {
    const availableForDay = initialValue.slots.filter((slot) => slot.day === day.key)
    next[day.key] = TIME_BLOCKS
      .filter((block) => !availableForDay.some((slot) => slotCoversBlock(slot, block.start, block.end)))
      .map((block) => block.start)
  }
  return next
}

function toAvailableTimeslots(blocked: BlockedState): AvailableTimeslots {
  const slots: AvailableTimeslots['slots'] = []

  for (const day of DAYS) {
    let currentStart: string | null = null
    let currentEnd: string | null = null

    for (const block of TIME_BLOCKS) {
      const blockedHere = blocked[day.key].includes(block.start)
      if (blockedHere) {
        if (currentStart && currentEnd) {
          slots.push({ day: day.key, start: currentStart, end: currentEnd })
        }
        currentStart = null
        currentEnd = null
        continue
      }

      if (!currentStart) currentStart = block.start
      currentEnd = block.end
    }

    if (currentStart && currentEnd) {
      slots.push({ day: day.key, start: currentStart, end: currentEnd })
    }
  }

  return { slots }
}

function countBlocked(blocked: BlockedState) {
  return DAYS.reduce((sum, day) => sum + blocked[day.key].length, 0)
}

export default function SchedulePicker({ initialValue, onChange }: Props) {
  const [blocked, setBlocked] = useState<BlockedState>(() => buildInitialBlocked(initialValue))
  const [lastTouched, setLastTouched] = useState<{ day: DayOfWeek; start: string; end: string } | null>(null)

  const available = useMemo(() => toAvailableTimeslots(blocked), [blocked])
  const blockedCount = countBlocked(blocked)
  const totalBlocks = DAYS.length * TIME_BLOCKS.length
  const allBlocked = blockedCount === totalBlocks

  useEffect(() => {
    onChange(toAvailableTimeslots(blocked))
    // 최초 진입 시 기본값을 부모 상태에 맞추기 위한 1회 동기화.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function commit(next: BlockedState) {
    setBlocked(next)
    onChange(toAvailableTimeslots(next))
  }

  function toggleBlock(day: DayOfWeek, start: string, end: string) {
    const current = blocked[day]
    const nextForDay = current.includes(start)
      ? current.filter((item) => item !== start)
      : [...current, start]
    const next = { ...blocked, [day]: nextForDay }
    setLastTouched({ day, start, end })
    commit(next)
  }

  function toggleWholeDay(day: DayOfWeek) {
    const isFullBlocked = blocked[day].length === TIME_BLOCKS.length
    const next = {
      ...blocked,
      [day]: isFullBlocked ? [] : TIME_BLOCKS.map((block) => block.start),
    }
    setLastTouched({
      day,
      start: TIME_BLOCKS[0].start,
      end: TIME_BLOCKS[TIME_BLOCKS.length - 1].end,
    })
    commit(next)
  }

  function resetAll() {
    setLastTouched(null)
    commit(createEmptyBlocked())
  }

  const lastTouchedDay = lastTouched ? DAYS.find((day) => day.key === lastTouched.day) : null

  return (
    <div className="space-y-4">
      <section className="rounded-[30px] border border-boot-primary/20 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
            <Clock3 size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-boot-ink">안 되는 시간만 눌러주세요</p>
            <p className="mt-1 text-xs leading-5 text-boot-muted">
              대학생 일정은 대부분 저녁이 가능하다고 보고, 시험·알바·약속처럼 절대 안 되는 시간만 막는 방식이에요.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-boot-hairline bg-boot-soft px-3 py-3">
            <p className="text-[11px] font-black text-boot-primary">매칭 가능 시간</p>
            <p className="mt-0.5 text-lg font-black text-boot-ink">{available.slots.length}개 구간</p>
          </div>
          <div className="rounded-2xl border border-boot-hairline bg-white px-3 py-3">
            <p className="text-[11px] font-black text-boot-primary">막은 시간</p>
            <p className="mt-0.5 text-lg font-black text-boot-ink">{blockedCount}개</p>
          </div>
        </div>

        {lastTouched && lastTouchedDay && (
          <div className="mt-3 rounded-2xl border border-boot-primary/20 bg-boot-soft px-3 py-3">
            <p className="text-[11px] font-black text-boot-primary">방금 선택</p>
            <p className="mt-0.5 text-sm font-black text-boot-ink">
              {lastTouchedDay.fullLabel} 시작 {lastTouched.start} · {lastTouched.end}까지 안 됨
            </p>
          </div>
        )}
      </section>

      <div className="space-y-3">
        {DAYS.map((day) => {
          const blockedForDay = blocked[day.key]
          const isFullBlocked = blockedForDay.length === TIME_BLOCKS.length
          const isWeekend = day.key === 'saturday' || day.key === 'sunday'
          return (
            <section
              key={day.key}
              className={[
                'rounded-[26px] border bg-white p-3 shadow-sm',
                isFullBlocked ? 'border-rose-200' : 'border-boot-hairline',
              ].join(' ')}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      'flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black',
                      isFullBlocked
                        ? 'bg-rose-50 text-rose-600'
                        : isWeekend
                          ? 'bg-boot-soft text-boot-primary'
                          : 'bg-boot-soft text-boot-ink',
                    ].join(' ')}
                  >
                    {day.label}
                  </span>
                  <div>
                    <p className="text-sm font-black text-boot-ink">{day.fullLabel}</p>
                    <p className="text-[11px] text-boot-muted">
                      {isFullBlocked
                        ? '이날은 절대 안 됨'
                        : blockedForDay.length > 0
                          ? `${blockedForDay.length}개 시간만 안 됨`
                          : '저녁 전체 가능'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleWholeDay(day.key)}
                  className={[
                    'rounded-2xl border px-3 py-2 text-[11px] font-black',
                    isFullBlocked
                      ? 'border-boot-primary/20 bg-boot-soft text-boot-primary'
                      : 'border-rose-200 bg-rose-50 text-rose-600',
                  ].join(' ')}
                >
                  {isFullBlocked ? '다시 가능' : '이날 안 됨'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                {TIME_BLOCKS.map((block) => {
                  const selected = blockedForDay.includes(block.start)
                  return (
                    <button
                      key={block.start}
                      type="button"
                      onClick={() => toggleBlock(day.key, block.start, block.end)}
                      className={[
                        'min-h-[58px] rounded-2xl border px-1.5 py-2 text-center transition',
                        selected
                          ? 'border-rose-300 bg-rose-50 text-rose-600'
                          : 'border-boot-hairline bg-boot-soft text-boot-ink',
                      ].join(' ')}
                    >
                      <span className="block text-xs font-black">{block.label}</span>
                      <span className="mt-1 block text-[9px] font-bold opacity-75">
                        {selected ? '안 됨' : '가능'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 size={17} className="mt-0.5 flex-shrink-0 text-emerald-600" />
        <p className="text-xs leading-5 text-boot-muted">
          저장할 때는 안 되는 시간을 제외한 나머지 시간이 매칭 가능 시간으로 자동 변환돼요.
        </p>
      </div>

      {allBlocked && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <Ban size={17} className="mt-0.5 flex-shrink-0 text-rose-600" />
          <div>
            <p className="text-xs font-black text-rose-600">모든 시간이 막혀 있어요</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-boot-muted">
              매칭을 찾으려면 최소 한 구간은 가능해야 해요.
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={resetAll}
        className="w-full rounded-2xl border border-boot-hairline bg-white px-4 py-3 text-xs font-black text-boot-muted"
      >
        전체 저녁 가능으로 되돌리기
      </button>
    </div>
  )
}
