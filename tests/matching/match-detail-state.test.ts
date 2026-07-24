import test from 'node:test'
import assert from 'node:assert/strict'
import { isMatchDetailPayload } from '../../lib/matching/match-detail-state'

const validPayload = {
  match: {
    match_id: 'match-1',
    match_mode: 'group' as const,
    my_group_id: 'group-1',
    opp_group_id: 'group-2',
    opp_group_size: 2,
    opp_group_gender: 'female' as const,
    match_status: 'pending',
    matched_at: '2026-07-23T00:00:00.000Z',
    confirmed_at: null,
    completed_at: null,
    my_confirmed_at: null,
    opp_confirmed_at: null,
    scheduled_start: null,
    scheduled_end: null,
    venue_name: null,
    venue_address: null,
    venue_map_url: null,
    my_card_submitted_at: null,
    my_card_content_text: null,
    my_group_active_count: 2,
    my_group_card_submitted_count: 0,
    my_group_deposit_paid_count: 0,
    my_group_ready: false,
    opp_group_active_count: 2,
    opp_group_card_submitted_count: 0,
    opp_group_deposit_paid_count: 0,
    opp_group_ready: false,
  },
}

test('match detail validator accepts the complete response contract', () => {
  assert.equal(isMatchDetailPayload(validPayload), true)
})

test('match detail validator rejects missing and malformed nested fields', () => {
  assert.equal(isMatchDetailPayload({}), false)
  assert.equal(isMatchDetailPayload({ match: null }), false)
  assert.equal(isMatchDetailPayload({
    match: {
      ...validPayload.match,
      my_group_ready: 'false',
    },
  }), false)
  assert.equal(isMatchDetailPayload({
    match: {
      ...validPayload.match,
      opp_group_size: 4,
    },
  }), false)
  assert.equal(isMatchDetailPayload({
    match: {
      ...validPayload.match,
      my_group_active_count: -1,
    },
  }), false)
})
