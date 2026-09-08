import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CURRENT_QUANTUM_DEBATE_QUESTION_BANK,
  containsBlockedPersonalContact,
  createEmptyQuantumProfilePreference,
  parseQuantumMeetingMoment,
  parseQuantumProfilePreference,
  toPublicParticipantPreview,
  validateQuantumMeetingMoment,
  validateQuantumProfilePreference,
  type QuantumMeetingMoment,
  type QuantumProfilePreference,
  type QuantumProfilePreferenceDraft,
} from '../../lib/matching/quantum-profile-preferences'

const VALID_PREFERENCE: QuantumProfilePreference = {
  schemaVersion: 2,
  mbti: null,
  relationshipBoundary: null,
  conversationEnergy: 'balanced',
  planStyle: 'balanced',
  interests: ['board-games', 'running', 'movies'],
  favoriteMusic: 'Indie pop',
  debateAnswers: [],
  questionBankVersion: 'quantum-debate-v1',
  updatedAt: '2026-08-15T09:00:00.000Z',
}

const VALID_MOMENT: QuantumMeetingMoment = {
  occurrenceKey: 'event-2026-08-15-room-1',
  mood: 'curious',
  expectation: 'new_people',
  activityChoice: 'board-game',
}

test('validates distinct persistent preferences and per-occurrence meeting moments', () => {
  assert.deepEqual(validateQuantumProfilePreference(VALID_PREFERENCE), { ok: true })
  assert.deepEqual(validateQuantumMeetingMoment(VALID_MOMENT), { ok: true })
  assert.equal(validateQuantumProfilePreference({ ...VALID_PREFERENCE, interests: ['one'] }).ok, false)
  assert.equal(validateQuantumMeetingMoment({ ...VALID_MOMENT, activityChoice: '@danger' }).ok, false)
  assert.equal(validateQuantumMeetingMoment({ ...VALID_MOMENT, occurrenceKey: 'invalid key' }).ok, false)
})

test('accepts only the server-approved debate bank version and question ids', () => {
  assert.equal(CURRENT_QUANTUM_DEBATE_QUESTION_BANK.version, 'quantum-debate-v1')
  assert.equal(validateQuantumProfilePreference({
    ...VALID_PREFERENCE,
    debateAnswers: [{ questionId: 'mint-chocolate', choice: 'A', shareOnCard: true }],
  }).ok, true)
  assert.equal(validateQuantumProfilePreference({
    ...VALID_PREFERENCE,
    questionBankVersion: 'quantum-debate-v9999',
  }).ok, false)
  assert.equal(validateQuantumProfilePreference({
    ...VALID_PREFERENCE,
    debateAnswers: [{ questionId: 'client-invented-question', choice: 'A', shareOnCard: true }],
  }).ok, false)
})

test('rejects oversized raw interest arrays before duplicate normalization', () => {
  assert.equal(validateQuantumProfilePreference({
    ...VALID_PREFERENCE,
    interests: ['running', 'running', 'running', 'running', 'movies', 'board-games'],
  }).ok, false)
})

test('parses normalized persistent preferences while allowing optional MBTI and boundaries', () => {
  assert.equal(validateQuantumProfilePreference({ ...VALID_PREFERENCE, mbti: null, relationshipBoundary: null }).ok, true)
  const { relationshipBoundary: _relationshipBoundary, ...withoutRelationshipBoundary } = VALID_PREFERENCE
  assert.equal(validateQuantumProfilePreference(withoutRelationshipBoundary).ok, true)
  assert.equal(validateQuantumProfilePreference({ ...VALID_PREFERENCE, interests: ['running', ' running ', 'movies'] }).ok, false)

  const parsed = parseQuantumProfilePreference({
    ...VALID_PREFERENCE,
    interests: [' running ', 'movies', 'running', ' board-games '],
    favoriteMusic: '  Indie   pop  ',
  })

  assert.deepEqual(parsed?.interests, ['running', 'movies', 'board-games'])
  assert.equal(parsed?.favoriteMusic, 'Indie pop')
  assert.equal(validateQuantumProfilePreference(parsed).ok, true)
})

test('canonicalizes only strict short UTC updatedAt values', () => {
  const timestamp = '2026-08-15T00:00:00Z'
  const parsed = parseQuantumProfilePreference({ ...VALID_PREFERENCE, updatedAt: timestamp })
  const paddedTimestamp = `${timestamp}${' '.repeat(65)}`

  assert.equal(parsed?.updatedAt, new Date(timestamp).toISOString())
  assert.equal(parseQuantumProfilePreference({ ...VALID_PREFERENCE, updatedAt: paddedTimestamp }), null)
  assert.equal(parseQuantumProfilePreference({ ...VALID_PREFERENCE, updatedAt: '2026-02-30T00:00:00Z' }), null)
  assert.equal(parseQuantumProfilePreference({ ...VALID_PREFERENCE, updatedAt: '0' }), null)
  assert.equal(parseQuantumProfilePreference({ ...VALID_PREFERENCE, updatedAt: '08/09/2026' }), null)
})

test('creates an explicit incomplete draft instead of a valid profile preference', () => {
  const draft: QuantumProfilePreferenceDraft = createEmptyQuantumProfilePreference()
  type DraftIsProfilePreference = QuantumProfilePreferenceDraft extends QuantumProfilePreference ? true : false
  const draftIsProfilePreference: DraftIsProfilePreference = false

  assert.equal(draft.schemaVersion, 2)
  assert.equal(draft.updatedAt, null)
  assert.equal(draftIsProfilePreference, false)
  assert.equal(validateQuantumProfilePreference(draft).ok, false)
})

test('parses normalized meeting moment text for persistence', () => {
  const parsed = parseQuantumMeetingMoment({ ...VALID_MOMENT, activityChoice: '  board   game  ' })

  assert.deepEqual(parsed, { ...VALID_MOMENT, activityChoice: 'board game' })
  assert.deepEqual(validateQuantumMeetingMoment(parsed), { ok: true })
})

test('blocks personal contact and identity text without false-positive English substrings', () => {
  const blockedSamples: unknown[] = [
    'name@example.com',
    '010-1234-5678',
    '051-123-4567',
    '+82 10-1234-5678',
    'https://example.com',
    '@private_handle',
    '@홍길동',
    'ｎａｍｅ＠ｅｘａｍｐｌｅ．ｃｏｍ',
    '＠홍길동',
    '０１０－１２３４－５６７８',
    'name @ example . com',
    '인\u200B스타',
    '연\u200B락하자',
    '+1 (415) 555-2671',
    '카카오 아이디',
    'instagram dm',
    'telegram me',
    'SNS 연락처',
    '연락 주세요',
    'message me',
    '번호 알려줄게',
    '컴퓨터공학',
    '기계공학',
    '경영학',
    '심리학',
    '경제학',
    '간호학',
    '법학',
    '의예과',
    '컴공',
    '010/1234/5678',
    '(051) 123-4567',
    '2024-1234',
    'Computer Science Department',
    'Mechanical Engineering',
    null,
    42,
  ]
  const allowedSamples = [
    'Headphones are useful',
    'admiral enjoys board games',
    'BTS 2.0',
    'Maroon 5.0',
    'version 1.2',
    'a calm conversation',
  ]

  blockedSamples.forEach((sample) => assert.equal(containsBlockedPersonalContact(sample), true, String(sample)))
  allowedSamples.forEach((sample) => assert.equal(containsBlockedPersonalContact(sample), false, sample))
})

test('builds public previews from a closed allowlist without private participant fields', () => {
  const preview = toPublicParticipantPreview({
    seatLabel: 'A-1',
    gender: 'female',
    userId: 'private-user-id',
    realName: 'Private Name',
    photoUrl: 'https://private.example/photo.jpg',
    department: 'Computer Science',
    contact: '010-1234-5678',
    appearanceScore: 0.99,
    secretRole: 'observer',
    profilePreference: {
      ...VALID_PREFERENCE,
      debateAnswers: [
        { questionId: 'tangsuyuk', choice: 'A', shareOnCard: true },
        { questionId: 'mint-chocolate', choice: 'B', shareOnCard: false },
      ],
    },
    meetingMoment: VALID_MOMENT,
  })

  assert.ok(preview)
  assert.deepEqual(preview, {
    seatLabel: 'A-1',
    gender: 'female',
    profilePreference: {
      mbti: null,
      conversationEnergy: 'balanced',
      planStyle: 'balanced',
      interests: ['board-games', 'running', 'movies'],
      favoriteMusic: 'Indie pop',
      debateAnswers: [{ questionId: 'tangsuyuk', choice: 'A' }],
    },
    meetingMoment: {
      mood: 'curious',
      expectation: 'new_people',
      activityChoice: 'board-game',
    },
  })
  assert.equal('secretRole' in preview, false)
  assert.equal('userId' in preview, false)
  assert.equal('occurrenceKey' in (preview.meetingMoment ?? {}), false)
})

test('fails closed instead of manufacturing missing preference or meeting data', () => {
  const preview = toPublicParticipantPreview({
    seatLabel: 'A-2',
    gender: 'male',
    profilePreference: { ...VALID_PREFERENCE, favoriteMusic: 'kakao: private-id' },
    meetingMoment: { mood: 'calm' },
  })

  assert.ok(preview)
  assert.equal(preview.profilePreference, null)
  assert.equal(preview.meetingMoment, null)
})

test('rejects invalid public participant identity instead of defaulting fields', () => {
  assert.equal(toPublicParticipantPreview({}), null)
  assert.equal(toPublicParticipantPreview(null), null)
  assert.equal(toPublicParticipantPreview({ seatLabel: 'A-1', gender: 'unknown' }), null)
  assert.equal(toPublicParticipantPreview({ gender: 'male' }), null)
  assert.equal(toPublicParticipantPreview({ seatLabel: '   ', gender: 'male' }), null)
})

test('keeps missing or invalid nested cards null after valid outer identity is established', () => {
  assert.deepEqual(toPublicParticipantPreview({ seatLabel: 'A-3', gender: 'male' }), {
    seatLabel: 'A-3',
    gender: 'male',
    profilePreference: null,
    meetingMoment: null,
  })
})
