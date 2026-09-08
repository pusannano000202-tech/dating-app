import assert from 'node:assert/strict'
import test from 'node:test'

import { buildWeeklyAllocationPlan } from '../../lib/matching/weekly-allocation-core'
import type { WeeklyAllocationApplication } from '../../lib/matching/weekly-allocation-core'

const WINDOW_ID = '10000000-0000-4000-8000-000000000001'

function application(
  id: string,
  gender: 'male' | 'female',
  departments: string[],
): WeeklyAllocationApplication {
  return {
    applicationId: id,
    revision: 0,
    partySize: departments.length,
    acceptedMemberCount: departments.length,
    members: departments.map((departmentKey, index) => ({
      participantUserId: `${id}-person-${index}`,
      gender,
      schoolScopeKey: 'pnu_self_selected',
      departmentKey,
    })),
  }
}

function input(applications: WeeklyAllocationApplication[], capacity = 10) {
  return {
    window: {
      windowId: WINDOW_ID,
      revision: 3,
      schoolScopeKey: 'pnu_self_selected',
      capacity,
    },
    applications,
  }
}

test('weekly allocation forms an exact 3M2F room and keeps accepted parties atomic', () => {
  const result = buildWeeklyAllocationPlan(input([
    application('m-party', 'male', ['산업공학과', '산업공학과']),
    application('m-solo', 'male', ['기계공학과']),
    application('f-party', 'female', ['간호학과', '간호학과']),
  ]))

  assert.equal(result.status, 'ready')
  assert.equal(result.rooms.length, 1)
  assert.deepEqual(result.rooms[0].applicationIds, ['f-party', 'm-party', 'm-solo'])
  assert.deepEqual(result.rooms[0].genderBreakdown, { malePeople: 3, femalePeople: 2 })
})

test('weekly allocation rejects same-department people from different random applications', () => {
  const result = buildWeeklyAllocationPlan(input([
    application('m1', 'male', ['산업공학과']),
    application('m2', 'male', ['산업공학과']),
    application('m3', 'male', ['기계공학과']),
    application('f1', 'female', ['간호학과']),
    application('f2', 'female', ['화학과']),
  ]))

  assert.equal(result.status, 'no_assignments')
  assert.deepEqual(result.rooms, [])
})

test('weekly allocation fails closed for a partial party or missing canonical department', () => {
  const partial = application('party', 'female', ['간호학과', '간호학과'])
  partial.acceptedMemberCount = 1
  const malformed = application('solo', 'male', [''])
  const result = buildWeeklyAllocationPlan(input([partial, malformed]))

  assert.equal(result.status, 'invalid_input')
  assert.equal(result.issues.includes('partial_party'), true)
  assert.equal(result.issues.includes('invalid_department_identity'), true)
})

test('weekly allocation maximizes disjoint rooms deterministically within capacity', () => {
  const applications = [
    ...Array.from({ length: 6 }, (_, index) => application(`m${index}`, 'male', [`m-dept-${index}`])),
    ...Array.from({ length: 4 }, (_, index) => application(`f${index}`, 'female', [`f-dept-${index}`])),
  ]
  const first = buildWeeklyAllocationPlan(input(applications, 10))
  const second = buildWeeklyAllocationPlan(input([...applications].reverse(), 10))

  assert.equal(first.status, 'ready')
  assert.equal(first.rooms.length, 2)
  assert.deepEqual(second, first)
  assert.equal(new Set(first.rooms.flatMap((room) => room.applicationIds)).size, 10)
})
