import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('Day 1 through Day 5 expose real, consent-safe content controls', () => {
  const ui = fs.readFileSync(path.join(process.cwd(), 'components/matching/OccurrenceContentExperience.tsx'), 'utf8')
  const day1Ui = fs.readFileSync(path.join(process.cwd(), 'components/matching/Day1PrivateGameRuntime.tsx'), 'utf8')
  const day2Ui = fs.readFileSync(path.join(process.cwd(), 'components/matching/Day2ContinuationRuntime.tsx'), 'utf8')
  const day3Ui = fs.readFileSync(path.join(process.cwd(), 'components/matching/Day3BowlingRuntime.tsx'), 'utf8')
  const day4Ui = fs.readFileSync(path.join(process.cwd(), 'components/matching/Day4ContinuationRuntime.tsx'), 'utf8')
  const combinedUi = `${ui}\n${day1Ui}\n${day2Ui}\n${day3Ui}\n${day4Ui}`
  const day1 = fs.readFileSync(path.join(process.cwd(), 'lib/matching/day1-dalmuti-rules.ts'), 'utf8')
  const day2 = fs.readFileSync(path.join(process.cwd(), 'lib/matching/day2-conversation-roulette.ts'), 'utf8')
  const day4 = fs.readFileSync(path.join(process.cwd(), 'lib/matching/day4-same-answer-cards.ts'), 'utf8')
  assert.match(day1Ui, /DAY1_GAME_CHOICES/)
  assert.match(day1Ui, /DAY1_DALMUTI_RULES/)
  assert.match(day2Ui, /getDay2Question/)
  assert.match(day3Ui, /practiceScores/)
  assert.match(day3Ui, /bowling_team_plan/)
  assert.match(day3Ui, /서버가 확정한 팀/)
  assert.doesNotMatch(ui, /<select/)
  assert.match(day3Ui, /gameScores/)
  assert.match(day4Ui, /DAY4_SAME_ANSWER_CARDS/)
  assert.match(day4Ui, /어떤 답을 했는지는 저장하지 않아요/)
  assert.match(ui, /route_summary/)
  assert.match(ui, /weather_fallback/)
  assert.match(ui, /return_guidance/)
  assert.ok((day1.match(/title:/g) ?? []).length >= 10)
  assert.ok((day2.match(/^\s*'/gm) ?? []).length >= 6)
  assert.ok((day4.match(/prompt:/g) ?? []).length >= 10)
  assert.doesNotMatch(`${combinedUi}\n${day1}\n${day2}\n${day4}`, /숨은 미션|강제 음주|호감 공개/)
})

test('Day 2 uses three server-timed thirty-minute rounds with group-scoped prompt state', () => {
  const base = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql'), 'utf8')
  const migrationName = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'))
    .find((name) => /^\d{14}_continuation_content_runtime\.sql$/.test(name))
  assert.ok(migrationName)
  const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations', migrationName), 'utf8')
  assert.match(base, /target_program_day = 2[\s\S]*interval '120 minutes'/i)
  assert.match(migration, /day2_rotation_round_1[\s\S]*interval '45 minutes'/i)
  assert.match(migration, /day2_rotation_round_2[\s\S]*interval '75 minutes'/i)
  assert.match(migration, /day2_rotation_round_3[\s\S]*interval '105 minutes'/i)
  assert.match(migration, /primary key \(occurrence_id, round_no, group_key\)/i)
})

test('Day 3 stores server-authoritative team calculation and tied results', () => {
  const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql'), 'utf8')
  const ui = fs.readFileSync(path.join(process.cwd(), 'components/matching/Day3BowlingRuntime.tsx'), 'utf8')
  assert.match(migration, /bowling_team_plan/i)
  assert.match(migration, /p_payload -> 'teams' is distinct from v_new_state -> 'bowling_team_plan'/i)
  assert.match(migration, /between 0 and 60/i)
  assert.match(migration, /adjusted_average/i)
  assert.match(migration, /'tied'/i)
  assert.match(migration, /v_member_count in \(3, 4\)/i)
  assert.match(ui, /3~4명은 팀 순위 없이/i)
})

test('series and after-flow use the single verified continuation checkout boundary', () => {
  const series = fs.readFileSync(path.join(process.cwd(), 'components/matching/FiveMeetingSeriesExperience.tsx'), 'utf8')
  const after = fs.readFileSync(path.join(process.cwd(), 'components/matching/FiveMeetingPostFlow.tsx'), 'utf8')
  assert.match(series, /ContinuationFeeCheckout/)
  assert.match(series, /purpose="next_occurrence"/)
  assert.match(after, /purpose="friend_request"/)
  assert.match(after, /targetUserId=/)
  assert.doesNotMatch(`${series}\n${after}`, /샌드박스 주문 준비/)
})
