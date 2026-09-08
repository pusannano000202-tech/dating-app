import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHALLENGE_CATEGORIES,
  assessChallengeRosterAcceptance,
  parseDepartmentChallengeInviteState,
  resolveBilateralChallengeResult,
} from '../../lib/community/challenges'
import { assessMeetupScopeAccess, parseMeetupScope } from '../../lib/community/department-rooms'

test('department rooms keep school-wide access independent from department identity', () => {
  assert.equal(parseMeetupScope('school'), 'school')
  assert.equal(parseMeetupScope('department'), 'department')
  assert.equal(parseMeetupScope('voice'), null)

  assert.equal(assessMeetupScopeAccess({
    sameSchool: true,
    scopeType: 'school',
    roomDepartmentKey: null,
    actorDepartmentKey: null,
  }), 'eligible')
  assert.equal(assessMeetupScopeAccess({
    sameSchool: false,
    scopeType: 'school',
    roomDepartmentKey: null,
    actorDepartmentKey: null,
  }), 'wrong_school')
})

test('department rooms fail closed for missing or different canonical department keys', () => {
  assert.equal(assessMeetupScopeAccess({
    sameSchool: true,
    scopeType: 'department',
    roomDepartmentKey: 'pnu:mechanical',
    actorDepartmentKey: null,
  }), 'department_identity_required')
  assert.equal(assessMeetupScopeAccess({
    sameSchool: true,
    scopeType: 'department',
    roomDepartmentKey: 'pnu:mechanical',
    actorDepartmentKey: 'pnu:chemical',
  }), 'department_restricted')
  assert.equal(assessMeetupScopeAccess({
    sameSchool: true,
    scopeType: 'department',
    roomDepartmentKey: 'pnu:mechanical',
    actorDepartmentKey: 'pnu:mechanical',
  }), 'eligible')
})

test('department challenges are limited to the approved soccer and game modes', () => {
  assert.deepEqual(CHALLENGE_CATEGORIES, ['soccer', 'gaming'])
})

test('roster acceptance requires the current department, capacity, and one challenge team only', () => {
  const base = {
    sameSchool: true,
    challengeStatus: 'scheduled' as const,
    actorDepartmentKey: 'pnu:mechanical',
    teamDepartmentKey: 'pnu:mechanical',
    targetTeamId: 'team-a',
    acceptedTeamId: null,
    acceptedCount: 4,
    capacity: 5,
  }

  assert.deepEqual(assessChallengeRosterAcceptance(base), { ok: true })
  assert.deepEqual(assessChallengeRosterAcceptance({ ...base, sameSchool: false }), { ok: false, reason: 'wrong_school' })
  assert.deepEqual(assessChallengeRosterAcceptance({ ...base, actorDepartmentKey: null }), { ok: false, reason: 'department_identity_required' })
  assert.deepEqual(assessChallengeRosterAcceptance({ ...base, actorDepartmentKey: 'pnu:chemical' }), { ok: false, reason: 'department_restricted' })
  assert.deepEqual(assessChallengeRosterAcceptance({ ...base, acceptedCount: 5 }), { ok: false, reason: 'team_full' })
  assert.deepEqual(assessChallengeRosterAcceptance({ ...base, acceptedTeamId: 'team-b' }), { ok: false, reason: 'already_on_other_team' })
  assert.deepEqual(assessChallengeRosterAcceptance({ ...base, challengeStatus: 'completed' }), { ok: false, reason: 'challenge_closed' })
})

test('a challenge result is published only after mirrored captain confirmations agree', () => {
  const teamA = { teamId: 'team-a', ownScore: 3, opponentScore: 1 }
  const teamB = { teamId: 'team-b', ownScore: 1, opponentScore: 3 }

  assert.deepEqual(resolveBilateralChallengeResult(teamA, null), { status: 'pending', result: null })
  assert.deepEqual(resolveBilateralChallengeResult(teamA, teamB), {
    status: 'confirmed',
    result: { firstTeamId: 'team-a', secondTeamId: 'team-b', firstScore: 3, secondScore: 1 },
  })
  assert.deepEqual(resolveBilateralChallengeResult(teamA, { ...teamB, ownScore: 2 }), {
    status: 'conflict',
    result: null,
  })
})

test('friend invitations fail closed before an invited member can take a roster slot', () => {
  const { assessDepartmentChallengeFriendInvite } = require('../../lib/community/challenges') as {
    assessDepartmentChallengeFriendInvite?: (input: {
      inviterIsCaptain: boolean
      activeFriendship: boolean
      sameSchool: boolean
      challengeStatus: 'recruiting' | 'opponent_pending' | 'scheduled' | 'result_pending' | 'completed' | 'cancelled'
      friendDepartmentKey: string | null
      teamDepartmentKey: string | null
      alreadyOnTeam: boolean
      acceptedCount: number
      capacity: number
    }) => { ok: true } | { ok: false; reason: string }
  }
  assert.equal(typeof assessDepartmentChallengeFriendInvite, 'function')
  const base = {
    inviterIsCaptain: true,
    activeFriendship: true,
    sameSchool: true,
    challengeStatus: 'opponent_pending' as const,
    friendDepartmentKey: 'mechanical',
    teamDepartmentKey: 'mechanical',
    alreadyOnTeam: false,
    acceptedCount: 4,
    capacity: 5,
  }
  assert.deepEqual(assessDepartmentChallengeFriendInvite?.(base), { ok: true })
  assert.deepEqual(assessDepartmentChallengeFriendInvite?.({ ...base, activeFriendship: false }), { ok: false, reason: 'active_friendship_required' })
  assert.deepEqual(assessDepartmentChallengeFriendInvite?.({ ...base, friendDepartmentKey: 'computer' }), { ok: false, reason: 'department_restricted' })
  assert.deepEqual(assessDepartmentChallengeFriendInvite?.({ ...base, acceptedCount: 5 }), { ok: false, reason: 'team_full' })
  assert.deepEqual(assessDepartmentChallengeFriendInvite?.({ ...base, alreadyOnTeam: true }), { ok: false, reason: 'already_on_team' })
})

test('friend invite projection rejects extra evidence and malformed member rows', () => {
  const candidate = {
    challenge_id: '10000000-0000-4000-8000-000000000001',
    revision: 3,
    candidates: [{ user_id: '10000000-0000-4000-8000-000000000002', display_name: '친구 이름' }],
    sent: [{
      invite_id: '10000000-0000-4000-8000-000000000003',
      user_id: '10000000-0000-4000-8000-000000000002',
      display_name: '친구 이름',
      status: 'pending',
      expires_at: '2026-09-14T00:00:00Z',
    }],
    incoming: [],
  }
  assert.deepEqual(parseDepartmentChallengeInviteState(candidate), candidate)
  assert.equal(parseDepartmentChallengeInviteState({ ...candidate, source_match_id: 'private' }), null)
  assert.equal(parseDepartmentChallengeInviteState({
    ...candidate,
    candidates: [{ ...candidate.candidates[0], source_match_id: 'private' }],
  }), null)
  assert.equal(parseDepartmentChallengeInviteState({ ...candidate, revision: 1.5 }), null)
})
