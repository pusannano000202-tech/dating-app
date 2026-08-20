export function getNextMeetupIdeaIndex(activeIndex: number, direction: -1 | 1, count: number): number {
  if (count <= 0) return 0
  return (activeIndex + direction + count) % count
}

export function getMeetupCylinderOffset(index: number, activeIndex: number, count: number): number | null {
  if (count <= 0) return null
  if (index === activeIndex) return 0
  if (index === getNextMeetupIdeaIndex(activeIndex, -1, count)) return -1
  if (index === getNextMeetupIdeaIndex(activeIndex, 1, count)) return 1
  return null
}
