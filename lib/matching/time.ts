import { WEEKDAYS, type TimeWindow, type WeekdayAvailability } from './types'

export function emptyAvailability(): WeekdayAvailability {
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

export function intersectWeekdaySlots(
  a: WeekdayAvailability,
  b: WeekdayAvailability,
): WeekdayAvailability {
  const out = emptyAvailability()

  for (const day of WEEKDAYS) {
    for (const left of a[day] ?? []) {
      for (const right of b[day] ?? []) {
        const start = Math.max(toMinutes(left.start), toMinutes(right.start))
        const end = Math.min(toMinutes(left.end), toMinutes(right.end))
        if (start < end) {
          out[day].push({ start: fromMinutes(start), end: fromMinutes(end) })
        }
      }
    }
  }

  return out
}

export function hasTimeslotOverlap(
  a: WeekdayAvailability,
  b: WeekdayAvailability,
): boolean {
  return countOverlapDays(intersectWeekdaySlots(a, b)) > 0
}

export function countOverlapDays(availability: WeekdayAvailability): number {
  return WEEKDAYS.filter((day) => availability[day].length > 0).length
}

function toMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function fromMinutes(value: number): string {
  const hour = Math.floor(value / 60)
  const minute = value % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
