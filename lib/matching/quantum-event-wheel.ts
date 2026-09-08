export type EventWheelDirection = -1 | 1

export function normalizeEventIndex(index: number, count: number): number {
  if (!Number.isInteger(count) || count <= 0) return 0
  return ((index % count) + count) % count
}

export function getNextEventIndex(
  activeIndex: number,
  direction: EventWheelDirection,
  count: number,
): number {
  return normalizeEventIndex(activeIndex + direction, count)
}

export function getEventWheelOffset(
  index: number,
  activeIndex: number,
  count: number,
): number | null {
  if (!Number.isInteger(count) || count <= 0) return null

  const normalizedIndex = normalizeEventIndex(index, count)
  const normalizedActive = normalizeEventIndex(activeIndex, count)
  let offset = normalizedIndex - normalizedActive

  if (offset > count / 2) offset -= count
  if (offset < -count / 2) offset += count

  return Math.abs(offset) <= 2 ? offset : null
}
