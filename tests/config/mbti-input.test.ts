import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MbtiInputError,
  parseExperienceCreateInput,
  parseExperienceId,
  parseExperiencePatchInput,
  parseExperiencePage,
  parseParticipantInput,
} from '../../lib/community/mbti/input'

const mutationId = 'mutation:mbti:00000001'

test('participant input requires explicit consent and rejects unlisted private fields', () => {
  assert.deepEqual(parseParticipantInput({
    self_mbti: 'ENFP',
    self_gender: 'other_or_undisclosed',
    consent: true,
    consent_version: 'community_mbti_v1',
    expected_revision: 0,
    client_mutation_id: mutationId,
  }), {
    selfMbti: 'ENFP',
    selfGender: 'other_or_undisclosed',
    consent: true,
    consentVersion: 'community_mbti_v1',
    expectedRevision: 0,
    clientMutationId: mutationId,
  })

  assert.throws(() => parseParticipantInput({
    self_mbti: 'ENFP',
    self_gender: 'male',
    consent: false,
    consent_version: 'community_mbti_v1',
    expected_revision: 0,
    client_mutation_id: mutationId,
  }), (error: unknown) => error instanceof MbtiInputError && error.field === 'consent')

  assert.throws(() => parseParticipantInput({
    self_mbti: 'ENFP',
    self_gender: 'male',
    consent: true,
    consent_version: 'community_mbti_v1',
    expected_revision: 0,
    client_mutation_id: mutationId,
    phone: '010-0000-0000',
  }), (error: unknown) => error instanceof MbtiInputError && error.code === 'unexpected_field')
})

test('count-only bounds each request to 100 without imposing a lifetime total', () => {
  const parsed = parseExperienceCreateInput({
    self_mbti_snapshot: 'ENFP',
    partner_mbti: 'INFP',
    partner_gender: 'other_or_undisclosed',
    relationship_status: 'past',
    entry_mode: 'count_only',
    reported_count: 100,
    score: null,
    matched_aspects: null,
    client_mutation_id: mutationId,
  })

  assert.equal(parsed.entryMode, 'count_only')
  assert.equal(parsed.reportedCount, 100)
  assert.equal(parsed.score, null)
  assert.equal(parsed.matchedAspects, null)

  assert.throws(() => parseExperienceCreateInput({
    self_mbti_snapshot: 'ENFP',
    partner_mbti: 'INFP',
    partner_gender: 'other_or_undisclosed',
    relationship_status: 'past',
    entry_mode: 'count_only',
    reported_count: 101,
    score: null,
    matched_aspects: null,
    client_mutation_id: mutationId,
  }), (error: unknown) => error instanceof MbtiInputError && error.field === 'reported_count')

  assert.throws(() => parseExperiencePatchInput({
    expected_revision: 1,
    client_mutation_id: mutationId,
    reported_count: 101,
  }), (error: unknown) => error instanceof MbtiInputError && error.field === 'reported_count')
})

test('not knowing a former partner MBTI is a valid experience input', () => {
  const parsed = parseExperienceCreateInput({
    self_mbti_snapshot: 'ENFP',
    partner_mbti: 'UNKNOWN',
    partner_gender: 'unknown',
    relationship_status: 'past',
    entry_mode: 'count_only',
    reported_count: 1,
    score: null,
    matched_aspects: null,
    client_mutation_id: mutationId,
  })
  assert.equal(parsed.partnerMbti, 'UNKNOWN')
})

test('detailed entries are exactly one experience and keep optional independent ratings', () => {
  const parsed = parseExperienceCreateInput({
    self_mbti_snapshot: 'ENFP',
    partner_mbti: 'INFP',
    partner_gender: 'female',
    relationship_status: 'current',
    entry_mode: 'detailed',
    reported_count: 1,
    score: 5,
    matched_aspects: ['conversation', 'values', 'conversation'],
    client_mutation_id: mutationId,
  })

  assert.deepEqual(parsed.matchedAspects, ['conversation', 'values'])
  assert.equal(parsed.score, 5)

  assert.throws(() => parseExperienceCreateInput({
    self_mbti_snapshot: 'ENFP',
    partner_mbti: 'INFP',
    partner_gender: 'female',
    relationship_status: 'current',
    entry_mode: 'detailed',
    reported_count: 2,
    score: 5,
    matched_aspects: null,
    client_mutation_id: mutationId,
  }), (error: unknown) => error instanceof MbtiInputError && error.field === 'reported_count')
})

test('experience payload rejects identity, free-text, date and account-link fields', () => {
  for (const privateField of ['partner_name', 'partner_phone', 'partner_user_id', 'photo_url', 'relationship_date', 'note']) {
    assert.throws(() => parseExperienceCreateInput({
      self_mbti_snapshot: 'ISTJ',
      partner_mbti: 'ENFP',
      partner_gender: 'unknown',
      relationship_status: 'past',
      entry_mode: 'count_only',
      reported_count: 1,
      score: null,
      matched_aspects: null,
      client_mutation_id: mutationId,
      [privateField]: 'must-not-be-stored',
    }), (error: unknown) => error instanceof MbtiInputError && error.field === privateField)
  }
})

test('patch input requires CAS and explicit confirmation to rewrite a self MBTI snapshot', () => {
  assert.deepEqual(parseExperiencePatchInput({
    expected_revision: 3,
    client_mutation_id: mutationId,
    score: 2,
    matched_aspects: ['conflict'],
  }), {
    expectedRevision: 3,
    clientMutationId: mutationId,
    score: 2,
    matchedAspects: ['conflict'],
  })

  assert.throws(() => parseExperiencePatchInput({
    expected_revision: 3,
    client_mutation_id: mutationId,
    self_mbti_snapshot: 'INTP',
  }), (error: unknown) => error instanceof MbtiInputError && error.field === 'confirm_self_snapshot_change')

  assert.deepEqual(parseExperiencePatchInput({
    expected_revision: 3,
    client_mutation_id: mutationId,
    self_mbti_snapshot: 'INTP',
    confirm_self_snapshot_change: true,
  }), {
    expectedRevision: 3,
    clientMutationId: mutationId,
    selfMbtiSnapshot: 'INTP',
    confirmSelfSnapshotChange: true,
  })
})

test('path and pagination inputs are bounded before repository access', () => {
  assert.equal(parseExperienceId('8F4BA3D9-39EC-4D18-B120-267D2D115A51'), '8f4ba3d9-39ec-4d18-b120-267d2d115a51')
  assert.deepEqual(parseExperiencePage(new URL('https://quantum.example/api?limit=50&cursor=8f4ba3d9-39ec-4d18-b120-267d2d115a51')), {
    limit: 50,
    cursor: '8f4ba3d9-39ec-4d18-b120-267d2d115a51',
  })
  assert.throws(() => parseExperiencePage(new URL('https://quantum.example/api?limit=51')), MbtiInputError)
  assert.throws(() => parseExperienceId('../other-user'), MbtiInputError)
})
