import assert from 'node:assert/strict'
import test from 'node:test'

import { aggregateSelfReported } from '../../lib/community/mbti/aggregation'
import type { MbtiExperienceDto, MbtiParticipantDto } from '../../lib/community/mbti/types'

const now = new Date('2026-09-05T12:00:00.000Z')

function participant(ownerUserId: string, selfMbti: MbtiParticipantDto['selfMbti']): MbtiParticipantDto {
  return {
    ownerUserId,
    selfMbti,
    selfGender: 'female',
    consentVersion: 'community_mbti_v1',
    consentConfirmedAt: '2026-09-01T00:00:00.000Z',
    revision: 1,
    expiresAt: '2026-11-30T00:00:00.000Z',
  }
}

function experience(overrides: Partial<MbtiExperienceDto> & Pick<MbtiExperienceDto, 'experienceId' | 'ownerUserId' | 'partnerMbti'>): MbtiExperienceDto {
  const { experienceId, ownerUserId, partnerMbti, ...rest } = overrides
  return {
    experienceId,
    ownerUserId,
    selfMbtiSnapshot: 'ENFP',
    partnerMbti,
    partnerGender: 'male',
    relationshipStatus: 'past',
    entryMode: 'count_only',
    reportedCount: 1,
    score: null,
    matchedAspects: null,
    revision: 1,
    updatedAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-11-30T00:00:00.000Z',
    ...rest,
  } as MbtiExperienceDto
}

test('INFP two plus INTP one counts one respondent and three experiences', () => {
  const result = aggregateSelfReported(
    [participant('owner-a', 'ENFP')],
    [
      experience({ experienceId: 'exp-a', ownerUserId: 'owner-a', partnerMbti: 'INFP', reportedCount: 2 }),
      experience({ experienceId: 'exp-b', ownerUserId: 'owner-a', partnerMbti: 'INTP' }),
    ],
    now,
  )

  assert.equal(result.respondentCount, 1)
  assert.equal(result.experienceCount, 3)
  assert.deepEqual(result.selfMbti.find((cell) => cell.selfMbti === 'ENFP'), {
    selfMbti: 'ENFP',
    respondentCount: 1,
  })
  assert.deepEqual(result.reportedCombinations.map((cell) => [cell.partnerMbti, cell.respondentCount, cell.experienceCount]), [
    ['INFP', 1, 2],
    ['INTP', 1, 1],
  ])
})

test('same partner type stays split across relationship status and gender', () => {
  const result = aggregateSelfReported(
    [participant('owner-a', 'ENFP')],
    [
      experience({ experienceId: 'past', ownerUserId: 'owner-a', partnerMbti: 'INFP', partnerGender: 'male', relationshipStatus: 'past' }),
      experience({ experienceId: 'current', ownerUserId: 'owner-a', partnerMbti: 'INFP', partnerGender: 'female', relationshipStatus: 'current' }),
    ],
    now,
  )

  assert.deepEqual(result.reportedCombinations.map((cell) => [cell.partnerGender, cell.relationshipStatus]), [
    ['female', 'current'],
    ['male', 'past'],
  ])
})

test('compatibility scores weight each respondent equally and ignore unscored count-only rows', () => {
  const participants = [participant('owner-a', 'ENFP'), participant('owner-b', 'ENFP')]
  const rows = [
    experience({ experienceId: 'a1', ownerUserId: 'owner-a', partnerMbti: 'INFP', entryMode: 'detailed', reportedCount: 1, score: 5 }),
    experience({ experienceId: 'a2', ownerUserId: 'owner-a', partnerMbti: 'INFP', entryMode: 'detailed', reportedCount: 1, score: 5 }),
    experience({ experienceId: 'a3', ownerUserId: 'owner-a', partnerMbti: 'INFP', entryMode: 'detailed', reportedCount: 1, score: 1 }),
    experience({ experienceId: 'b1', ownerUserId: 'owner-b', partnerMbti: 'INFP', entryMode: 'detailed', reportedCount: 1, score: 1 }),
    experience({ experienceId: 'b2', ownerUserId: 'owner-b', partnerMbti: 'INFP', reportedCount: 50 }),
  ]

  const cell = aggregateSelfReported(participants, rows, now).ratedCombinations[0]
  assert.equal(cell.scoredRespondentCount, 2)
  assert.equal(cell.scoredExperienceCount, 4)
  assert.equal(cell.positiveRate, 1 / 3)
})

test('expired participant or experience is immediately excluded', () => {
  const expired = participant('owner-expired', 'ENFP')
  expired.expiresAt = '2026-09-05T11:59:59.999Z'

  const result = aggregateSelfReported(
    [expired, participant('owner-active', 'INTJ')],
    [
      experience({ experienceId: 'expired-owner', ownerUserId: 'owner-expired', partnerMbti: 'INFP' }),
      experience({ experienceId: 'expired-row', ownerUserId: 'owner-active', partnerMbti: 'INTP', expiresAt: '2026-09-05T11:59:59.999Z' }),
    ],
    now,
  )

  assert.equal(result.respondentCount, 1)
  assert.equal(result.experienceCount, 0)
})
