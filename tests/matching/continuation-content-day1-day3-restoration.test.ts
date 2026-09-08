import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const helperPath = path.join(root, 'lib/matching/continuation-day1-day3-runtime.ts')

type RuntimeHelper = {
  parseDay1PrivateGameRuntime: (value: unknown) => {
    kind: 'day1'
    voteOpen: boolean
    canVote: boolean
    resultAvailable: boolean
    myVote: 'dalmuti' | 'halligalli' | 'one-card' | null
    selectedGame: 'dalmuti' | 'halligalli' | 'one-card' | null
    canFinish: boolean
  } | null
  parseDay3TiebreakRuntime: (value: unknown) => {
    kind: 'day3'
    phase: 'none' | 'needs_last_frame' | 'needs_one_ball' | 'resolved'
    tiedTeams: Array<'A' | 'B' | 'C'>
  } | null
  buildDay3LastFramePayload: (
    aliases: readonly string[],
    values: Readonly<Record<string, string>>,
  ) => { scores: Array<{ alias: string; score: number }> } | null
  buildDay3OneBallPayload: (
    teams: readonly ('A' | 'B' | 'C')[],
    values: Readonly<Partial<Record<'A' | 'B' | 'C', string>>>,
  ) => { team_scores: Array<{ team: 'A' | 'B' | 'C'; score: number }> } | null
}

function runtimeHelper(): RuntimeHelper {
  assert.equal(fs.existsSync(helperPath), true, 'the focused Day 1/Day 3 runtime helper must exist')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../lib/matching/continuation-day1-day3-runtime') as RuntimeHelper
}

test('Day 1 parser exposes only the caller vote and post-deadline winner contract', () => {
  const { parseDay1PrivateGameRuntime } = runtimeHelper()
  assert.deepEqual(parseDay1PrivateGameRuntime({
    kind: 'day1',
    vote_open: true,
    can_vote: true,
    result_available: false,
    my_vote: 'halligalli',
    selected_game: null,
    can_finish: false,
  }), {
    kind: 'day1',
    voteOpen: true,
    canVote: true,
    resultAvailable: false,
    myVote: 'halligalli',
    selectedGame: null,
    canFinish: false,
  })
  assert.equal(parseDay1PrivateGameRuntime({
    kind: 'day1', vote_open: true, can_vote: true, result_available: false,
    my_vote: null, selected_game: 'dalmuti', can_finish: false,
  }), null, 'a winner must never be exposed before the deadline')
  assert.deepEqual(parseDay1PrivateGameRuntime({
    kind: 'day1', vote_open: true, can_vote: false, result_available: false,
    my_vote: null, selected_game: null, can_finish: false,
  })?.canVote, false, 'the time window may be visible while an ineligible attendee remains blocked')
  assert.equal(parseDay1PrivateGameRuntime({
    kind: 'day1', vote_open: false, can_vote: false, result_available: true,
    my_vote: null, selected_game: 'one-card', can_finish: true, vote_counts: { 'one-card': 2 },
  }), null, 'unexpected vote-count/private projection fields fail closed')
})

test('Day 3 parser preserves the explicit last-frame then one-ball phases', () => {
  const { parseDay3TiebreakRuntime } = runtimeHelper()
  assert.deepEqual(parseDay3TiebreakRuntime({
    kind: 'day3', tie_break_phase: 'needs_last_frame', tied_teams: ['A', 'B'],
  }), { kind: 'day3', phase: 'needs_last_frame', tiedTeams: ['A', 'B'] })
  assert.deepEqual(parseDay3TiebreakRuntime({
    kind: 'day3', tie_break_phase: 'needs_one_ball', tied_teams: ['A', 'B', 'C'],
  }), { kind: 'day3', phase: 'needs_one_ball', tiedTeams: ['A', 'B', 'C'] })
  assert.equal(parseDay3TiebreakRuntime({
    kind: 'day3', tie_break_phase: 'needs_one_ball', tied_teams: ['A', 'A'],
  }), null)
})

test('Day 3 payload builders require every exact roster alias or tied team', () => {
  const { buildDay3LastFramePayload, buildDay3OneBallPayload } = runtimeHelper()
  assert.deepEqual(buildDay3LastFramePayload(
    ['참가자 1', '참가자 2'],
    { '참가자 1': ' 30 ', '참가자 2': '0' },
  ), { scores: [{ alias: '참가자 1', score: 30 }, { alias: '참가자 2', score: 0 }] })
  assert.equal(buildDay3LastFramePayload(['참가자 1', '참가자 2'], { '참가자 1': '10' }), null)
  assert.equal(buildDay3LastFramePayload(['참가자 1'], { '참가자 1': '31' }), null)
  assert.deepEqual(buildDay3OneBallPayload(['A', 'C'], { A: '10', C: ' 4 ' }), {
    team_scores: [{ team: 'A', score: 10 }, { team: 'C', score: 4 }],
  })
  assert.equal(buildDay3OneBallPayload(['A', 'C'], { A: '3' }), null)
  assert.equal(buildDay3OneBallPayload(['A', 'A'], { A: '3' }), null)
  assert.equal(buildDay3OneBallPayload(['A'], { A: '11' }), null)
})

test('the forward migration keeps private votes private and closes legacy action bypasses', () => {
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
    .filter((name) => /^\d{14}_continuation_day1_vote_day3_tiebreak\.sql$/.test(name))
  assert.equal(migrations.length, 1, 'one forward-only Day 1/Day 3 restoration migration is required')
  assert.ok(migrations[0] > '20260906120204_continuation_series_album.sql')
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', migrations[0]), 'utf8')

  assert.match(sql, /quantum_continuation_day1_game_votes/i)
  assert.match(sql, /primary key \(occurrence_id, participant_user_id\)/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all on table public\.quantum_continuation_day1_game_votes[\s\S]*public, anon, authenticated, service_role/i)
  assert.match(sql, /interval '80 minutes'/i)
  assert.match(sql, /interval '85 minutes'/i)
  assert.match(sql, /count\(\*\) filter \(where grouped\.vote_count = v_top_vote_count\) > 1 then 'dalmuti'/i)
  assert.match(sql, /v_selected_game := coalesce\(v_selected_game, 'dalmuti'\)/i)
  assert.match(sql, /my_vote/i)
  assert.doesNotMatch(sql, /vote_counts|voter_alias|voter_user/i)
  assert.match(sql, /content_state[\s\S]*- 'selected_game'/i)
  assert.match(sql, /last_action' = 'select_game'[\s\S]*- 'last_payload'/i)
  assert.match(sql, /where command\.value ->> 'action' <> 'select_game'/i)

  assert.match(sql, /alter function public\.apply_my_continuation_content_action[\s\S]*rename to/i)
  assert.match(sql, /revoke all on function public\.apply_my_continuation_content_action_legacy_/i)
  assert.match(sql, /content_runtime_action_replaced_not_allowed/i)
  assert.match(sql, /v_action = 'select_game'/i)
  assert.match(sql, /v_action = 'start_game'[\s\S]*'selected_game', 'dalmuti'/i)
  assert.match(sql, /v_action = 'finish_occurrence'[\s\S]*ends_at - interval '5 minutes'/i)

  assert.match(sql, /save_bowling_last_frame_scores/i)
  assert.match(sql, /save_bowling_one_ball_scores/i)
  assert.match(sql, /needs_last_frame/i)
  assert.match(sql, /needs_one_ball/i)
  assert.match(sql, /day3_tiebreak_phase' is distinct from 'needs_last_frame'/i)
  assert.match(sql, /day3_tiebreak_phase' is distinct from 'needs_one_ball'/i)
  assert.match(sql, /save_bowling_last_frame_scores[\s\S]*starts_at - interval '15 minutes'[\s\S]*ends_at \+ interval '6 hours'/i)
  assert.match(sql, /save_bowling_one_ball_scores[\s\S]*starts_at - interval '15 minutes'[\s\S]*ends_at \+ interval '6 hours'/i)
  assert.match(sql, /program_day = 3 and v_action = 'finish_occurrence'[\s\S]*for update[\s\S]*stale_content_revision[\s\S]*needs_one_ball/i)
  assert.match(sql, /last_frame_score/i)
  assert.match(sql, /between 0 and 30/i)
  assert.match(sql, /between 0 and 10/i)
  assert.match(sql, /stale_content_revision/i)
  assert.match(sql, /quantum_continuation_content_runtime_commands[\s\S]*p_payload/i)
  assert.doesNotMatch(sql, /favorite|preference|reward|private_choice|friend_request/i)
  assert.doesNotMatch(sql, /execute\s+(format|pg_catalog\.format)|execute\s+'|execute\s+"/i)
})

test('focused controls explain private voting, staged tiebreaks, and shared Day 5 gathering state', () => {
  const occurrence = fs.readFileSync(path.join(root, 'components/matching/OccurrenceContentExperience.tsx'), 'utf8')
  const day1Path = path.join(root, 'components/matching/Day1PrivateGameRuntime.tsx')
  const day3Path = path.join(root, 'components/matching/Day3BowlingRuntime.tsx')
  assert.equal(fs.existsSync(day1Path), true)
  assert.equal(fs.existsSync(day3Path), true)
  const day1 = fs.readFileSync(day1Path, 'utf8')
  const day3 = fs.readFileSync(day3Path, 'utf8')
  assert.match(occurrence, /Day1PrivateGameRuntime/)
  assert.match(occurrence, /Day3BowlingRuntime/)
  assert.match(day1, /달무티 먼저 시작/)
  assert.match(day1, /내 투표만/)
  assert.match(day1, /draftChoice \?\? parsed\.myVote \?\? 'dalmuti'/)
  assert.match(day1, /focus-within:ring-2/)
  assert.match(day1, /vote_day1_game/)
  assert.match(day1, /종료 5분 전/)
  assert.match(day3, /마지막 프레임/)
  assert.match(day3, /팀 한 볼/)
  assert.match(day3, /save_bowling_last_frame_scores/)
  assert.match(day3, /save_bowling_one_ball_scores/)
  assert.match(occurrence, /개인 출석이 아닌 모임 진행 확인/)
  assert.match(occurrence, /출석은 운영자 판정/)
})

test('Day 3 result explains stored tiebreak evidence and hydrates saved score fields', () => {
  const day3 = fs.readFileSync(path.join(root, 'components/matching/Day3BowlingRuntime.tsx'), 'utf8')
  assert.match(day3, /원점수 합계 → 마지막 프레임 합계 → 팀 한 볼/)
  assert.match(day3, /이번 결과에는 팀 한 볼 점수가 반영됐어요/)
  assert.match(day3, /parseBowlingOneBallScores\(contentState\.bowling_one_ball_scores, result\)/)
  assert.match(day3, /Object\.keys\(row\)[\s\S]*team[\s\S]*score/)
  assert.match(day3, /Number\.isInteger\(row\.score\)[\s\S]*row\.score < 0[\s\S]*row\.score > 10/)
  assert.match(day3, /parseStoredBowlingScores\(contentState\.practice_scores, aliases, 60\)/)
  assert.match(day3, /parseStoredBowlingScores\(contentState\.game_scores, aliases, 300\)/)
  assert.match(day3, /last_frame_score/)
})

test('Day 1 closed vote gives a clear next activity without adding a stored action', () => {
  const day1 = fs.readFileSync(path.join(root, 'components/matching/Day1PrivateGameRuntime.tsx'), 'utf8')
  assert.match(day1, /이제 함께.*게임을 플레이하세요/)
  assert.match(day1, /다음 순서는 활동 안내에서 확인할 수 있어요/)
})

test('the occurrence page loads after-flow only after the authoritative content state is completed', () => {
  const occurrence = fs.readFileSync(path.join(root, 'components/matching/OccurrenceContentExperience.tsx'), 'utf8')
  const page = fs.readFileSync(path.join(root, 'app/match/occurrences/[occurrenceId]/page.tsx'), 'utf8')
  assert.match(occurrence, /content\.status === 'completed'[\s\S]*<FiveMeetingPostFlow occurrenceId=\{occurrenceId\}/)
  assert.match(occurrence, /만남이 완료되고 실제 출석이 확정되면/)
  assert.doesNotMatch(page, /FiveMeetingPostFlow/)
})
