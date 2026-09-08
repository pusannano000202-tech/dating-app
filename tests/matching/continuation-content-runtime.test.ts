import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const helperPath = path.join(root, 'lib/matching/continuation-content-runtime.ts')

function loadRuntimeHelper() {
  assert.equal(fs.existsSync(helperPath), true, 'the continuation runtime helper must exist')
  // Keep the RED phase executable before the wished-for helper exists.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../lib/matching/continuation-content-runtime') as {
    buildContinuationDay2Rotation: (men: readonly string[], women: readonly string[]) => unknown
    deriveContinuationRuntimeWindow: (input: {
      programDay: 2 | 4
      startsAt: string
      endsAt: string
      serverNow: string
    }) => Record<string, unknown> | null
  }
}

test('Day 2 produces the approved three rounds for the current 3M2F roster', () => {
  const { buildContinuationDay2Rotation } = loadRuntimeHelper()
  assert.deepEqual(
    buildContinuationDay2Rotation(['참가자 1', '참가자 2', '참가자 3'], ['참가자 4', '참가자 5']),
    {
      mode: 'pair_and_trio',
      rounds: [
        [['참가자 1', '참가자 4'], ['참가자 2', '참가자 3', '참가자 5']],
        [['참가자 1', '참가자 5'], ['참가자 2', '참가자 3', '참가자 4']],
        [['참가자 2', '참가자 4'], ['참가자 1', '참가자 3', '참가자 5']],
      ],
    },
  )
})

test('Day 2 produces three mixed pairs per round for 3M3F', () => {
  const { buildContinuationDay2Rotation } = loadRuntimeHelper()
  assert.deepEqual(
    buildContinuationDay2Rotation(
      ['참가자 1', '참가자 2', '참가자 3'],
      ['참가자 4', '참가자 5', '참가자 6'],
    ),
    {
      mode: 'three_pairs',
      rounds: [
        [['참가자 1', '참가자 4'], ['참가자 2', '참가자 5'], ['참가자 3', '참가자 6']],
        [['참가자 1', '참가자 5'], ['참가자 2', '참가자 6'], ['참가자 3', '참가자 4']],
        [['참가자 1', '참가자 6'], ['참가자 2', '참가자 4'], ['참가자 3', '참가자 5']],
      ],
    },
  )
})

test('Day 2 preserves the current 2M3F pair-and-trio roster symmetrically', () => {
  const { buildContinuationDay2Rotation } = loadRuntimeHelper()
  assert.deepEqual(
    buildContinuationDay2Rotation(['참가자 1', '참가자 2'], ['참가자 3', '참가자 4', '참가자 5']),
    {
      mode: 'pair_and_trio',
      rounds: [
        [['참가자 1', '참가자 3'], ['참가자 2', '참가자 4', '참가자 5']],
        [['참가자 2', '참가자 3'], ['참가자 1', '참가자 4', '참가자 5']],
        [['참가자 1', '참가자 4'], ['참가자 2', '참가자 3', '참가자 5']],
      ],
    },
  )
})

test('Day 2 runtime follows server time and keeps the previous scene for ten minutes', () => {
  const { deriveContinuationRuntimeWindow } = loadRuntimeHelper()
  const base = {
    programDay: 2 as const,
    startsAt: '2026-09-06T10:00:00.000Z',
    endsAt: '2026-09-06T12:00:00.000Z',
  }
  assert.deepEqual(deriveContinuationRuntimeWindow({ ...base, serverNow: '2026-09-06T10:14:59.000Z' }), {
    scene: 'day2_arrival', round: null, openedAt: base.startsAt, closesAt: '2026-09-06T10:15:00.000Z', previousScene: null, previousAvailableUntil: null,
  })
  assert.deepEqual(deriveContinuationRuntimeWindow({ ...base, serverNow: '2026-09-06T10:45:00.000Z' }), {
    scene: 'day2_rotation_round_2', round: 2, openedAt: '2026-09-06T10:45:00.000Z', closesAt: '2026-09-06T11:15:00.000Z', previousScene: 'day2_rotation_round_1', previousAvailableUntil: '2026-09-06T10:55:00.000Z',
  })
  assert.equal(
    deriveContinuationRuntimeWindow({ ...base, serverNow: '2026-09-06T10:55:00.001Z' })?.previousScene,
    null,
  )
})

test('Day 4 marks 30 to 50 minutes as recommended but keeps recovery after 50 minutes', () => {
  const { deriveContinuationRuntimeWindow } = loadRuntimeHelper()
  const base = {
    programDay: 4 as const,
    startsAt: '2026-09-06T10:00:00.000Z',
    endsAt: '2026-09-06T12:00:00.000Z',
  }
  assert.equal(deriveContinuationRuntimeWindow({ ...base, serverNow: '2026-09-06T10:29:59.000Z' })?.scene, 'day4_arrival_and_order')
  assert.equal(deriveContinuationRuntimeWindow({ ...base, serverNow: '2026-09-06T10:30:00.000Z' })?.scene, 'day4_same_answer_game')
  assert.equal(deriveContinuationRuntimeWindow({ ...base, serverNow: '2026-09-06T10:50:00.000Z' })?.scene, 'day4_free_conversation')
  assert.equal(deriveContinuationRuntimeWindow({ ...base, serverNow: '2026-09-06T12:05:00.000Z' })?.scene, 'day4_card_recovery')
})

test('the additive migration closes legacy RPC bypasses and stores no private answers', () => {
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
    .filter((name) => /^\d{14}_continuation_content_runtime\.sql$/.test(name))
  assert.equal(migrations.length, 1, 'one forward-only continuation runtime migration is required')
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', migrations[0]), 'utf8')
  assert.match(sql, /alter function public\.apply_my_continuation_content_action[\s\S]*rename to/i)
  assert.match(sql, /revoke all on function public\.apply_my_continuation_content_action_legacy_/i)
  assert.match(sql, /quantum_continuation_day2_prompt_states/i)
  assert.match(sql, /quantum_continuation_day4_shared_phone/i)
  assert.match(sql, /pg_advisory_xact_lock/i)
  assert.match(sql, /attendance_status in \('confirmed', 'present'\)/i)
  assert.match(sql, /v_member_count = 5[\s\S]*v_male_count = 3[\s\S]*v_female_count = 2[\s\S]*v_male_count = 2[\s\S]*v_female_count = 3/i)
  assert.match(sql, /card_index[\s\S]*between 0 and 10/i)
  assert.match(sql, /content_runtime_action_replaced/i)
  assert.match(sql, /get_my_continuation_occurrence_content_legacy_\d{14}/i)
  assert.match(sql, /apply_my_continuation_content_action_legacy_\d{14}/i)
  assert.doesNotMatch(sql, /execute\s+(format|pg_catalog\.format)|execute\s+'|execute\s+\"/i)
  assert.doesNotMatch(sql, /answer_text|answer_value|drank|alcohol_count|pass_count/i)
})

test('the occurrence UI delegates Day 2 and Day 4 to focused fail-closed runtime controls', () => {
  const occurrence = fs.readFileSync(path.join(root, 'components/matching/OccurrenceContentExperience.tsx'), 'utf8')
  const day2Path = path.join(root, 'components/matching/Day2ContinuationRuntime.tsx')
  const day4Path = path.join(root, 'components/matching/Day4ContinuationRuntime.tsx')
  assert.equal(fs.existsSync(day2Path), true)
  assert.equal(fs.existsSync(day4Path), true)
  assert.match(occurrence, /Day2ContinuationRuntime/)
  assert.match(occurrence, /Day4ContinuationRuntime/)
  assert.doesNotMatch(occurrence, /현재는 이 만남 전체가 같은 질문을 공유해요/)
  assert.match(fs.readFileSync(day2Path, 'utf8'), /advance_group_prompt/)
  assert.match(fs.readFileSync(day4Path, 'utf8'), /claim_shared_phone/)
  assert.match(fs.readFileSync(day4Path, 'utf8'), /heartbeat_shared_phone/)
  assert.match(fs.readFileSync(day4Path, 'utf8'), /남은 카드 이어보기/)
})
