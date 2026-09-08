import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateContinuationTransition,
  projectPrivateTransition,
  type ContinuationTransitionMember,
} from '../../lib/matching/continuation-entry'

const members: ContinuationTransitionMember[] = Array.from({ length: 5 }, (_, index) => ({
  userId: `10000000-0000-4000-8000-00000000000${index + 1}`,
  present: true,
  choice: 'continue' as const,
  feeStatus: 'verified' as const,
}))

test('first transition never bypasses private consent or verified fee because the source was a board game', () => {
  const result = evaluateContinuationTransition({
    sourceStatus: 'completed',
    rosterRevision: 3,
    consentRosterRevision: 3,
    transitionIndex: 0,
    targetProgramDay: 2,
    members: members.map((member, index) => index === 4 ? { ...member, choice: null, feeStatus: 'unpaid' } : member),
    minimumParticipants: 5,
    hasScheduleConflict: false,
  })

  assert.deepEqual(result, { state: 'awaiting_private_choices' })
})

test('stale roster consent, missing payment, schedule conflict, and Day 5 termination are explicit states', () => {
  assert.deepEqual(evaluateContinuationTransition({
    sourceStatus: 'completed', rosterRevision: 4, consentRosterRevision: 3, transitionIndex: 0,
    targetProgramDay: 1, members, minimumParticipants: 5, hasScheduleConflict: false,
  }), { state: 'roster_reconsent_required' })

  assert.deepEqual(evaluateContinuationTransition({
    sourceStatus: 'completed', rosterRevision: 4, consentRosterRevision: 4, transitionIndex: 0,
    targetProgramDay: 1, members: members.map((member, index) => index === 0 ? { ...member, feeStatus: 'pending' } : member),
    minimumParticipants: 5, hasScheduleConflict: false,
  }), { state: 'payment_verification_pending' })

  assert.deepEqual(evaluateContinuationTransition({
    sourceStatus: 'completed', rosterRevision: 4, consentRosterRevision: 4, transitionIndex: 0,
    targetProgramDay: 1, members, minimumParticipants: 5, hasScheduleConflict: true,
  }), { state: 'schedule_conflict' })

  assert.deepEqual(evaluateContinuationTransition({
    sourceStatus: 'completed', rosterRevision: 4, consentRosterRevision: 4, transitionIndex: 4,
    targetProgramDay: null, members, minimumParticipants: 3, hasScheduleConflict: false,
  }), { state: 'terminal' })
})

test('participant projection exposes only the caller choice and never aggregate decline details', () => {
  const projection = projectPrivateTransition({
    transitionId: '20000000-0000-4000-8000-000000000001',
    state: 'awaiting_private_choices',
    actorUserId: members[0].userId,
    members: [members[0], { ...members[1], choice: 'end' }],
  })

  assert.deepEqual(projection, {
    transitionId: '20000000-0000-4000-8000-000000000001',
    state: 'awaiting_private_choices',
    ownChoice: 'continue',
  })
  assert.doesNotMatch(JSON.stringify(projection), /decline|endCount|userId|phone|contact/i)
})
