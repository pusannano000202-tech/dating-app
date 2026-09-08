import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createContinuationSource,
  getContinuationMeetingPlan,
  getContinuationTarget,
} from '../../lib/matching/continuation-source'

const roster = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
]

test('today and scheduled sources require exactly one immutable source reference', () => {
  const valid = createContinuationSource({
    sourceKind: 'tonight_team',
    tonightTeamId: '20000000-0000-4000-8000-000000000001',
    scheduledEventOccurrenceId: null,
    activityKind: 'board_game',
    activitySnapshot: { title: '달무티' },
    rosterUserIds: roster,
    rosterRevision: 4,
    attendanceRevision: 2,
    completedAt: '2026-09-05T13:00:00.000Z',
  })
  assert.equal(valid.ok, true)

  assert.deepEqual(createContinuationSource({
    sourceKind: 'scheduled_event_occurrence',
    tonightTeamId: '20000000-0000-4000-8000-000000000001',
    scheduledEventOccurrenceId: '30000000-0000-4000-8000-000000000001',
    activityKind: 'walk',
    activitySnapshot: {},
    rosterUserIds: roster,
    rosterRevision: 1,
    attendanceRevision: 1,
    completedAt: '2026-09-05T13:00:00.000Z',
  }), { ok: false, error: 'invalid_source_reference' })
})

test('board sources continue at Day 2 while non-board sources retain all five program days', () => {
  assert.deepEqual(getContinuationMeetingPlan('board_game'), {
    sourceProgramDay: 1,
    startProgramDay: 2,
    maximumPhysicalMeetingNo: 5,
  })
  assert.deepEqual(getContinuationMeetingPlan('walk'), {
    sourceProgramDay: null,
    startProgramDay: 1,
    maximumPhysicalMeetingNo: 6,
  })

  assert.deepEqual(getContinuationTarget('board_game', 0), {
    transitionIndex: 0,
    programDay: 2,
    physicalMeetingNo: 2,
    finalProgramDay: false,
  })
  assert.deepEqual(getContinuationTarget('walk', 0), {
    transitionIndex: 0,
    programDay: 1,
    physicalMeetingNo: 2,
    finalProgramDay: false,
  })
  assert.deepEqual(getContinuationTarget('walk', 4), {
    transitionIndex: 4,
    programDay: 5,
    physicalMeetingNo: 6,
    finalProgramDay: true,
  })
  assert.equal(getContinuationTarget('board_game', 4), null)
})
