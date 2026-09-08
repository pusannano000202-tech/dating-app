export function sceneIndex(index: number, direction: -1 | 1, length: number): number {
  if (!Number.isInteger(length) || length < 1) return 0
  const current = Number.isInteger(index) && index >= 0 && index < length ? index : 0
  return (current + direction + length) % length
}

export function sceneSwipe(deltaX: number, deltaY: number): -1 | 0 | 1 {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || Math.abs(deltaX) < 44 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.3) return 0
  return deltaX < 0 ? 1 : -1
}
