import { getContinuationContentGuideForDay, type ContinuationContentGuideScene } from './continuation-content-guide'
import { parseDay1PrivateGameRuntime } from './continuation-day1-day3-runtime'

/** Display adapter only. Existing server runtime selects the scene; catalog
 * example offsets never start a game, authorize an action or choose a live scene. */
export function resolveScheduledComicScene(input: {
  programDay: number; status: string; startsAt: string; endsAt: string; serverNow: string
  elapsedMs: number; verified: boolean; runtime: unknown; contentState?: unknown
}): ContinuationContentGuideScene | null {
  if (!input.verified || ![1, 2, 4].includes(input.programDay)
    || !['confirmed', 'in_progress'].includes(input.status)
    || !Number.isFinite(input.elapsedMs) || input.elapsedMs < 0 || input.elapsedMs >= 75_000) return null
  const start = Date.parse(input.startsAt), end = Date.parse(input.endsAt), now = Date.parse(input.serverNow)
  if (![start, end, now].every(Number.isFinite) || end <= start || now < start || now + input.elapsedMs >= end) return null
  if (input.programDay === 1) return resolveDay1Scene(input.runtime, input.contentState, start, end, now, input.elapsedMs)
  if (!input.runtime || typeof input.runtime !== 'object' || Array.isArray(input.runtime)) return null
  const runtime = input.runtime as Record<string, unknown>
  if (runtime.kind !== `day${input.programDay}` || runtime.ready !== true || typeof runtime.scene !== 'string') return null
  if (input.programDay === 2 && runtime.scene.startsWith('day2_rotation_round_')
    && (runtime.round_opened_at !== undefined || runtime.round_closes_at !== undefined)) {
    if (typeof runtime.round_opened_at !== 'string' || typeof runtime.round_closes_at !== 'string') return null
    const openedAt = Date.parse(runtime.round_opened_at), closesAt = Date.parse(runtime.round_closes_at)
    if (![openedAt, closesAt].every(Number.isFinite) || closesAt <= openedAt
      || now < openedAt || now + input.elapsedMs >= closesAt) return null
  }
  return getContinuationContentGuideForDay(input.programDay).find(scene => scene.id === runtime.scene) ?? null
}

function resolveDay1Scene(
  runtime: unknown, contentState: unknown, start: number, end: number, now: number, elapsedMs: number,
): ContinuationContentGuideScene | null {
  const parsed = parseDay1PrivateGameRuntime(runtime)
  if (!parsed || !isPlainRecord(contentState)) return null
  for (const key of ['game_started', 'game_finished']) {
    if (key in contentState && typeof contentState[key] !== 'boolean') return null
  }
  const gameStarted = contentState.game_started === true
  const gameFinished = contentState.game_finished === true
  if ((gameFinished && !gameStarted) || (parsed.canVote && !parsed.voteOpen)
    || (parsed.voteOpen && parsed.resultAvailable)) return null

  // Existing server contract: 20260906130854_continuation_day1_vote_day3_tiebreak.sql.
  // These bounds only reject contradictory/expired snapshots. They never open
  // voting, choose a result or promote a scene using a local clock.
  const voteOpensAt = start + 80 * 60_000, voteClosesAt = start + 85 * 60_000
  if (parsed.voteOpen !== (now >= voteOpensAt && now < voteClosesAt)
    || parsed.resultAvailable !== (now >= voteClosesAt)
    || (now < voteOpensAt && now + elapsedMs >= voteOpensAt)
    || (parsed.voteOpen && now + elapsedMs >= voteClosesAt)
    || (parsed.canFinish && (!gameFinished || now < end - 5 * 60_000))) return null

  const scenes = getContinuationContentGuideForDay(1)
  const find = (id: string) => scenes.find(scene => scene.id === id) ?? null
  if (parsed.canFinish) return find('day1_photo_and_end')
  if (parsed.voteOpen) return find('day1_game_vote')
  if (parsed.resultAvailable) return parsed.selectedGame ? find('day1_selected_game') : null
  if (gameFinished) {
    const waiting = find('day1_game_vote')
    return waiting ? {
      ...waiting,
      title: '다음 게임 안내를 기다려요',
      body: '달무티를 마친 상태예요. 다음 게임 투표가 열리면 진행 화면에서 확인할 수 있어요.',
      nextAction: '잠시 쉬며 다음 안내 기다리기',
      speech: ['한 판을 마쳤어요.', '편하게 쉬며 다음 안내를 기다려요.'],
    } : null
  }
  return find(gameStarted ? 'day1_dalmuti_play' : 'day1_introduction')
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
