export function getNextSocialRailIndex(index: number, direction: -1 | 1, count: number): number {
  if (!Number.isInteger(count) || count < 1) return 0
  const current = Number.isInteger(index) && index >= 0 && index < count ? index : 0
  return (current + direction + count) % count
}

export function getSocialRailSwipeDirection(deltaX: number, deltaY: number): -1 | 0 | 1 {
  if (
    !Number.isFinite(deltaX)
    || !Number.isFinite(deltaY)
    || Math.abs(deltaX) < 44
    || Math.abs(deltaX) <= Math.abs(deltaY) * 1.3
  ) return 0
  return deltaX < 0 ? 1 : -1
}

export function getSocialRailScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? 'auto' : 'smooth'
}
