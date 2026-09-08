import assert from 'node:assert/strict'
import test from 'node:test'
import { validateMeetupCreateInput } from '../../lib/community/contracts'
import { mapCommunityApiError } from '../../lib/community/api-errors'

const now = new Date('2026-09-06T00:00:00Z')
const input = {
  category: 'running', title: '같이 뛰는 저녁 러닝', description: '',
  place_name: '부산대 정문', scheduled_at: '2026-09-07T10:00:00Z', capacity: 4,
}

test('existing meetup clients default to unrestricted without changing activity rules', () => {
  const result = validateMeetupCreateInput(input, now)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(Reflect.get(result.value, 'genderMode'), 'all')
})

test('meetup creation accepts the three approved gender modes only', () => {
  for (const mode of ['all', 'male_only', 'female_only']) {
    const result = validateMeetupCreateInput({ ...input, gender_mode: mode }, now)
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(Reflect.get(result.value, 'genderMode'), mode)
  }
  for (const mode of [null, '', 'male', 'mixed', 'ALL', [], {}, 1, true]) {
    assert.deepEqual(validateMeetupCreateInput({ ...input, gender_mode: mode }, now), {
      ok: false, error: 'invalid_gender_mode',
    })
  }
})

test('gender restriction failures retain actionable API status without exposing gender', () => {
  assert.deepEqual(mapCommunityApiError({ code: 'P0001', message: 'meetup_gender_required' }), {
    error: 'meetup_gender_required', status: 409,
  })
  assert.deepEqual(mapCommunityApiError({ code: 'P0001', message: 'meetup_gender_restricted' }), {
    error: 'meetup_gender_restricted', status: 403,
  })
})
