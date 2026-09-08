import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canonicalDepartmentKey,
  canonicalSchoolScopeKey,
  hasDepartmentAssignmentConflict,
  type DepartmentAllocationIdentity,
} from '../../lib/matching/department-identity'
import { isTonightPartialTeamFeasible } from '../../lib/matching/tonight-ranked/team-objective'
import type { TonightAllocationApplicant } from '../../lib/matching/tonight-ranked/contracts'

function identity(
  applicantId: string,
  overrides: Partial<DepartmentAllocationIdentity> = {},
): DepartmentAllocationIdentity {
  return {
    applicantId,
    roundNamespace: 'tonight:round-1',
    schoolScopeKey: 'pnu_self_selected',
    departmentKey: '산업공학과',
    acceptedCompanionApplicationId: null,
    ...overrides,
  }
}

test('canonical department and school keys ignore case and all whitespace', () => {
  assert.equal(canonicalDepartmentKey('  산업\t공학과  '), '산업공학과')
  assert.equal(canonicalDepartmentKey('Computer  SCIENCE'), 'computerscience')
  assert.equal(canonicalSchoolScopeKey(' PNU_SELF_SELECTED '), 'pnu_self_selected')
  assert.equal(canonicalDepartmentKey('   '), null)
  assert.equal(canonicalDepartmentKey('x'.repeat(121)), null)
})

test('same department across random units is rejected', () => {
  assert.equal(hasDepartmentAssignmentConflict([
    identity('one'),
    identity('two'),
  ]), true)
})

test('the same accepted companion application in the same round is the only exemption', () => {
  assert.equal(hasDepartmentAssignmentConflict([
    identity('one', { acceptedCompanionApplicationId: 'accepted-party-1' }),
    identity('two', { acceptedCompanionApplicationId: 'accepted-party-1' }),
  ]), false)

  assert.equal(hasDepartmentAssignmentConflict([
    identity('one', { acceptedCompanionApplicationId: 'accepted-party-1' }),
    identity('two', {
      roundNamespace: 'tonight:round-2',
      acceptedCompanionApplicationId: 'accepted-party-1',
    }),
  ]), true)
})

test('same bundle does not exempt a third random unit with the same department', () => {
  assert.equal(hasDepartmentAssignmentConflict([
    identity('friend-one', { acceptedCompanionApplicationId: 'accepted-party-1' }),
    identity('friend-two', { acceptedCompanionApplicationId: 'accepted-party-1' }),
    identity('random-third'),
  ]), true)
})

test('Tonight feasibility rejects same-department people from different random units', () => {
  const members = [
    tonightApplicant('one', 'male', null),
    tonightApplicant('two', 'female', null),
  ]

  assert.equal(isTonightPartialTeamFeasible(members), false)
})

test('Tonight feasibility permits same-department members of one accepted companion application', () => {
  const members = [
    tonightApplicant('one', 'male', 'accepted-party-1'),
    tonightApplicant('two', 'female', 'accepted-party-1'),
  ]

  assert.equal(isTonightPartialTeamFeasible(members), true)
})

function tonightApplicant(
  applicantId: string,
  sex: 'male' | 'female',
  acceptedCompanionApplicationId: string | null,
): TonightAllocationApplicant {
  return {
    applicantId,
    sex,
    age: sex === 'male' ? 23 : 21,
    appearanceScoreBp: 8_000,
    activityRanking: ['board-game', 'walk', 'meal'],
    friendBundleId: acceptedCompanionApplicationId,
    roundNamespace: 'tonight:round-1',
    schoolScopeKey: 'pnu_self_selected',
    departmentKey: '산업공학과',
    acceptedCompanionApplicationId,
  }
}
