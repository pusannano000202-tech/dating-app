import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  QUANTUM_SECRET_ROLE_DEFINITIONS,
  SECRET_ROLE_KEYS,
  getQuantumSecretRoleMission,
  parseMySecretRole,
  parseQuantumRoleGuessState,
} from '../../lib/matching/quantum-secret-roles'

const ROLE_SOURCE_PATH = path.join(
  process.cwd(),
  'lib/matching/quantum-secret-roles.ts',
)

test('defines exactly five unique secret roles with one shared safety contract', () => {
  assert.deepEqual(SECRET_ROLE_KEYS, [
    'explorer',
    'reactor',
    'observer',
    'bridge',
    'pace_maker',
  ])
  assert.equal(new Set(SECRET_ROLE_KEYS).size, 5)

  const safetyCopies = new Set(
    SECRET_ROLE_KEYS.map((role) => QUANTUM_SECRET_ROLE_DEFINITIONS[role].safetyCopy),
  )
  assert.equal(safetyCopies.size, 1)

  for (const role of SECRET_ROLE_KEYS) {
    const definition = QUANTUM_SECRET_ROLE_DEFINITIONS[role]
    assert.equal(definition.key, role)
    assert.ok(definition.label.trim().length > 0)
    assert.ok(definition.genericMission.trim().length > 0)
    assert.ok(definition.safetyCopy.trim().length > 0)
  }
})

test('looks up activity missions and falls back to the generic mission', () => {
  const activityEventKeys = [
    'tonight-onsenjjang-run',
    'tonight-board-game',
    'tonight-casual-drinks',
    'scheduled-dinner',
    'scheduled-walk',
  ] as const

  for (const role of SECRET_ROLE_KEYS) {
    for (const eventKey of activityEventKeys) {
      const mission = getQuantumSecretRoleMission(role, eventKey)
      assert.equal(typeof mission, 'string')
      assert.ok((mission?.length ?? 0) > 0)
    }

    assert.equal(
      getQuantumSecretRoleMission(role, 'unknown-event'),
      QUANTUM_SECRET_ROLE_DEFINITIONS[role].genericMission,
    )
  }
  assert.equal(getQuantumSecretRoleMission('unknown-role', 'scheduled-walk'), null)
})

test('maps both dinner events to the exact dinner missions', () => {
  for (const role of SECRET_ROLE_KEYS) {
    const dinnerMission = QUANTUM_SECRET_ROLE_DEFINITIONS[role].activityMissions.dinner
    assert.equal(getQuantumSecretRoleMission(role, 'tonight-late-dinner'), dinnerMission)
    assert.equal(getQuantumSecretRoleMission(role, 'scheduled-dinner'), dinnerMission)
  }
})

test('parses only an owner role from the five-key allowlist', () => {
  const parsed = parseMySecretRole({
    role: 'explorer',
    occurrence_id: '11111111-1111-4111-8111-111111111111',
    event_key: 'scheduled-walk',
    can_change: true,
    role_confirmed: false,
    application_confirmed: false,
    starts_at: '2026-08-16T07:00:00.000Z',
    participant_user_id: 'private-id',
    swap_target: 'must-not-leak',
  })

  assert.ok(parsed)
  assert.deepEqual(Object.keys(parsed).sort(), [
    'applicationConfirmed',
    'canChange',
    'eventKey',
    'label',
    'mission',
    'occurrenceId',
    'role',
    'roleConfirmed',
    'safetyCopy',
    'startsAt',
  ])
  assert.equal(parsed.role, 'explorer')
  assert.equal(parsed.occurrenceId, '11111111-1111-4111-8111-111111111111')
  assert.equal(parsed.label, '탐구자')
  assert.equal(parsed.canChange, true)
  assert.equal(parsed.roleConfirmed, false)
  assert.equal(parsed.applicationConfirmed, false)
  assert.equal('participantUserId' in parsed, false)
  assert.equal('swapTarget' in parsed, false)

  assert.equal(parseMySecretRole({ role: 'admin' }), null)
  assert.equal(parseMySecretRole({ role: 'explorer' }), null)
  assert.equal(parseMySecretRole({ role: 'explorer', occurrence_id: 'not-a-uuid' }), null)
  assert.equal(parseMySecretRole({ secret_role: 'observer' }), null)
  assert.equal(parseMySecretRole({ meetup_role: 'question_starter' }), null)
  assert.equal(parseMySecretRole({ role: 'observer', can_change: 'yes' }), null)
})

test('keeps unrevealed guess state free of answer roles', () => {
  const parsed = parseQuantumRoleGuessState({
    status: 'submitted',
    reveal_at: '2026-08-17T07:00:00.000Z',
    submitted: true,
    reveal_available: false,
    targets: [
      { seat_label: '참가자 B', guessed_role: 'bridge' },
      { seat_label: '참가자 C', guessed_role: 'observer' },
    ],
    match_id: 'private-match-id',
    user_id: 'private-user-id',
  })

  assert.ok(parsed)
  assert.equal(parsed.status, 'submitted')
  assert.equal(parsed.revealAvailable, false)
  assert.deepEqual(Object.keys(parsed.targets[0]).sort(), ['guessedRole', 'seatLabel'])
  assert.equal('matchId' in parsed, false)
  assert.equal('userId' in parsed, false)

  assert.equal(parseQuantumRoleGuessState({
    status: 'submitted',
    reveal_at: '2026-08-17T07:00:00.000Z',
    submitted: true,
    reveal_available: false,
    targets: [{
      seat_label: '참가자 B',
      guessed_role: 'bridge',
      answer_role: 'observer',
      correct: false,
    }],
  }), null)
})

test('accepts revealed answers only when every role remains in the allowlist', () => {
  const revealed = parseQuantumRoleGuessState({
    status: 'revealed',
    reveal_at: '2026-08-17T07:00:00.000Z',
    submitted: true,
    reveal_available: true,
    targets: [{
      seat_label: '참가자 B',
      guessed_role: 'bridge',
      answer_role: 'observer',
      correct: false,
    }],
  })

  assert.ok(revealed)
  assert.deepEqual(revealed.targets[0], {
    seatLabel: '참가자 B',
    guessedRole: 'bridge',
    answerRole: 'observer',
    correct: false,
  })
  assert.equal(parseQuantumRoleGuessState({
    status: 'revealed',
    reveal_at: '2026-08-17T07:00:00.000Z',
    submitted: true,
    reveal_available: true,
    targets: [{
      seat_label: '참가자 B',
      guessed_role: 'bridge',
      answer_role: 'unknown-role',
      correct: false,
    }],
  }), null)
})

test('accepts PostgreSQL UTC offset timestamps without accepting non-UTC offsets', () => {
  const role = parseMySecretRole({
    role: 'observer',
    occurrence_id: '22222222-2222-4222-8222-222222222222',
    event_key: 'scheduled-dinner',
    can_change: false,
    role_confirmed: true,
    application_confirmed: true,
    starts_at: '2026-08-16T07:00:00+00:00',
  })
  const guess = parseQuantumRoleGuessState({
    status: 'open',
    reveal_at: '2026-08-17T07:00:00.123456+00:00',
    submitted: false,
    reveal_available: false,
    targets: [{ seat_label: '참가자 B', guessed_role: null }],
  })

  assert.equal(role?.startsAt, '2026-08-16T07:00:00+00:00')
  assert.equal(guess?.revealAt, '2026-08-17T07:00:00.123456+00:00')
  assert.equal(parseMySecretRole({
    role: 'observer',
    occurrence_id: '22222222-2222-4222-8222-222222222222',
    starts_at: '2026-08-16T16:00:00+09:00',
  }), null)
  assert.equal(parseQuantumRoleGuessState({
    status: 'open',
    reveal_at: '2026-08-17T16:00:00+09:00',
    submitted: false,
    reveal_available: false,
    targets: [{ seat_label: '참가자 B', guessed_role: null }],
  }), null)
})

test('requires a consistent explicit role-confirmation state', () => {
  const response = {
    role: 'bridge',
    occurrence_id: '33333333-3333-4333-8333-333333333333',
    event_key: 'tonight-board-game',
    can_change: true,
    starts_at: '2026-08-16T07:00:00+00:00',
  }

  assert.equal(parseMySecretRole(response), null)
  assert.equal(parseMySecretRole({
    ...response,
    role_confirmed: true,
    application_confirmed: false,
  }), null)
  assert.deepEqual(parseMySecretRole({
    ...response,
    role_confirmed: true,
    application_confirmed: true,
  })?.roleConfirmed, true)
})

test('keeps role parsing free of unsafe escape hatches and public participant role fields', () => {
  const roleSource = fs.readFileSync(ROLE_SOURCE_PATH, 'utf8')
  const publicSource = fs.readFileSync(
    path.join(process.cwd(), 'lib/matching/quantum-profile-preferences.ts'),
    'utf8',
  )
  const publicTypeStart = publicSource.indexOf('export type QuantumPublicParticipantPreview')
  const publicTypeEnd = publicSource.indexOf('\n}\n', publicTypeStart)
  const publicType = publicSource.slice(publicTypeStart, publicTypeEnd + 3)

  assert.doesNotMatch(roleSource, /\bany\b/)
  assert.notEqual(publicTypeStart, -1)
  assert.doesNotMatch(publicType, /role/i)
})
