export type ContinuationRuntimeWindow = {
  scene: string
  round: number | null
  openedAt: string
  closesAt: string
  previousScene: string | null
  previousAvailableUntil: string | null
}

export type ContinuationDay2Rotation = {
  mode: 'pair_and_trio' | 'three_pairs'
  rounds: string[][][]
}

const MINUTE_MS = 60_000

export function buildContinuationDay2Rotation(
  men: readonly string[],
  women: readonly string[],
): ContinuationDay2Rotation | null {
  if (!hasUniqueNonEmptyAliases(men, women)
      || !((men.length === 3 && [2, 3].includes(women.length)) || (men.length === 2 && women.length === 3))) {
    return null
  }

  const [m1, m2, m3] = men
  const [f1, f2, f3] = women
  if (men.length === 2) {
    return {
      mode: 'pair_and_trio',
      rounds: [
        [[m1, f1], [m2, f2, f3]],
        [[m2, f1], [m1, f2, f3]],
        [[m1, f2], [m2, f1, f3]],
      ],
    }
  }
  if (women.length === 2) {
    return {
      mode: 'pair_and_trio',
      rounds: [
        [[m1, f1], [m2, m3, f2]],
        [[m1, f2], [m2, m3, f1]],
        [[m2, f1], [m1, m3, f2]],
      ],
    }
  }

  return {
    mode: 'three_pairs',
    rounds: [
      [[m1, f1], [m2, f2], [m3, f3]],
      [[m1, f2], [m2, f3], [m3, f1]],
      [[m1, f3], [m2, f1], [m3, f2]],
    ],
  }
}

export function deriveContinuationRuntimeWindow(input: {
  programDay: 2 | 4
  startsAt: string
  endsAt: string
  serverNow: string
}): ContinuationRuntimeWindow | null {
  const startsAt = Date.parse(input.startsAt)
  const endsAt = Date.parse(input.endsAt)
  const serverNow = Date.parse(input.serverNow)
  if (![startsAt, endsAt, serverNow].every(Number.isFinite) || endsAt <= startsAt) return null

  const windows = input.programDay === 2
    ? buildDay2Windows(startsAt, endsAt)
    : buildDay4Windows(startsAt, endsAt)
  const selectedIndex = windows.findIndex((window) => serverNow >= window.openedAt && serverNow < window.closesAt)
  if (selectedIndex < 0) return null

  const selected = windows[selectedIndex]
  const previous = selectedIndex > 0 ? windows[selectedIndex - 1] : null
  const previousAvailableUntil = previous
    ? Math.min(selected.openedAt + 10 * MINUTE_MS, selected.closesAt)
    : null
  const previousIsAvailable = previous !== null
    && previousAvailableUntil !== null
    && serverNow <= previousAvailableUntil

  return {
    scene: selected.scene,
    round: selected.round,
    openedAt: new Date(selected.openedAt).toISOString(),
    closesAt: new Date(selected.closesAt).toISOString(),
    previousScene: previousIsAvailable ? previous.scene : null,
    previousAvailableUntil: previousIsAvailable
      ? new Date(previousAvailableUntil).toISOString()
      : null,
  }
}

function buildDay2Windows(startsAt: number, endsAt: number) {
  return [
    runtimeWindow('day2_arrival', null, startsAt, Math.min(endsAt, startsAt + 15 * MINUTE_MS)),
    runtimeWindow('day2_rotation_round_1', 1, startsAt + 15 * MINUTE_MS, Math.min(endsAt, startsAt + 45 * MINUTE_MS)),
    runtimeWindow('day2_rotation_round_2', 2, startsAt + 45 * MINUTE_MS, Math.min(endsAt, startsAt + 75 * MINUTE_MS)),
    runtimeWindow('day2_rotation_round_3', 3, startsAt + 75 * MINUTE_MS, Math.min(endsAt, startsAt + 105 * MINUTE_MS)),
    runtimeWindow('day2_wrap_and_end', null, startsAt + 105 * MINUTE_MS, endsAt + 6 * 60 * MINUTE_MS),
  ].filter((window) => window.closesAt > window.openedAt)
}

function buildDay4Windows(startsAt: number, endsAt: number) {
  return [
    runtimeWindow('day4_arrival_and_order', null, startsAt, Math.min(endsAt, startsAt + 30 * MINUTE_MS)),
    runtimeWindow('day4_same_answer_game', null, startsAt + 30 * MINUTE_MS, Math.min(endsAt, startsAt + 50 * MINUTE_MS)),
    runtimeWindow('day4_free_conversation', null, startsAt + 50 * MINUTE_MS, Math.min(endsAt, startsAt + 105 * MINUTE_MS)),
    runtimeWindow('day4_photo_and_end', null, startsAt + 105 * MINUTE_MS, endsAt),
    runtimeWindow('day4_card_recovery', null, endsAt, endsAt + 6 * 60 * MINUTE_MS),
  ].filter((window) => window.closesAt > window.openedAt)
}

function runtimeWindow(scene: string, round: number | null, openedAt: number, closesAt: number) {
  return { scene, round, openedAt, closesAt }
}

function hasUniqueNonEmptyAliases(men: readonly string[], women: readonly string[]) {
  const aliases = [...men, ...women]
  return aliases.every((alias) => typeof alias === 'string' && alias.trim() === alias && alias.length > 0)
    && new Set(aliases).size === aliases.length
}
