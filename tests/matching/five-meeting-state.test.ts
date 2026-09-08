import test from 'node:test'
import assert from 'node:assert/strict'

import {
  parseContinuationSeries,
  type ContinuationSeries,
} from '../../lib/matching/five-meeting-state'
import { getContinuationDayDefinition } from '../../lib/matching/five-meeting-content'

const series: ContinuationSeries = {
  serverNow: '2026-09-05T09:00:00.000Z',
  seriesId: '10000000-0000-4000-8000-000000000001',
  sourceId: '20000000-0000-4000-8000-000000000001',
  source: {
    sourceKind: 'tonight_team', activityKind: 'walk', activity: { title: '산책' },
    sourceCompletedAt: '2026-09-04T12:00:00.000Z', rosterRevision: 3,
  },
  startProgramDay: 1,
  maximumPhysicalMeetingNo: 6,
  status: 'active',
  revision: 0,
  nextAction: 'choose',
  latestOccurrenceId: null,
  transitions: [{
    transitionId: '30000000-0000-4000-8000-000000000001', transitionIndex: 0,
    targetProgramDay: 1, physicalMeetingNo: 2, state: 'awaiting_choices',
    closesAt: '2026-09-06T08:00:00.000Z', rosterRevision: 3,
    ownChoice: null, ownFee: null,
  }],
  occurrences: [],
}

test('continuation parser keeps program day separate from the physical meeting number', () => {
  const parsed = parseContinuationSeries({
    server_now: series.serverNow,
    series_id: series.seriesId,
    source_id: series.sourceId,
    source: {
      source_kind: series.source.sourceKind,
      activity_kind: series.source.activityKind,
      activity: series.source.activity,
      source_completed_at: series.source.sourceCompletedAt,
      roster_revision: series.source.rosterRevision,
    },
    start_program_day: 1,
    maximum_physical_meeting_no: 6,
    status: 'active', revision: 0, next_action: 'choose', latest_occurrence_id: null,
    transitions: [{
      transition_id: series.transitions[0].transitionId, transition_index: 0,
      target_program_day: 1, physical_meeting_no: 2, state: 'awaiting_choices',
      closes_at: series.transitions[0].closesAt, roster_revision: 3,
      own_choice: null, own_fee: null,
    }],
    occurrences: [],
  })
  assert.deepEqual(parsed, series)
})

test('continuation parser rejects leaked group choice fields', () => {
  assert.equal(parseContinuationSeries({
    ...series,
    decline_count: 1,
  }), null)
})

test('all five day definitions have server action contracts without hidden missions or alcohol requirements', () => {
  const definitions = [1, 2, 3, 4, 5].map((day) => getContinuationDayDefinition(day))
  assert.equal(definitions.every(Boolean), true)
  assert.deepEqual(definitions.map((item) => item?.minimumParticipants), [5, 5, 3, 3, 3])
  assert.match(definitions[1]?.summary ?? '', /30분|3라운드/)
  assert.match(definitions[3]?.summary ?? '', /무알코올/)
  assert.doesNotMatch(JSON.stringify(definitions), /숨은 미션|역할극|음주 필수|호감 공개/)
})
