import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMUNITY_MBTI_PUBLIC_POLICY,
  isFreshPublicSnapshot,
  participantExpiresAt,
  protectSelfReportedAggregate,
} from '../../lib/community/mbti/privacy'
import type { MbtiAggregate } from '../../lib/community/mbti/aggregation'

function rawAggregate(respondents: number, cellRespondents: number, scoredRespondents = 0): MbtiAggregate {
  return {
    generatedAt: '2026-09-05T00:00:00.000Z',
    respondentCount: respondents,
    experienceCount: cellRespondents,
    selfMbti: [{ selfMbti: 'ENFP', respondentCount: cellRespondents }],
    reportedCombinations: [{
      selfMbtiSnapshot: 'ENFP',
      partnerMbti: 'INFP',
      selfGender: 'female',
      partnerGender: 'male',
      relationshipStatus: 'past',
      respondentCount: cellRespondents,
      experienceCount: cellRespondents,
    }],
    ratedCombinations: scoredRespondents > 0 ? [{
      selfMbtiSnapshot: 'ENFP',
      partnerMbti: 'INFP',
      selfGender: 'female',
      partnerGender: 'male',
      relationshipStatus: 'past',
      scoredRespondentCount: scoredRespondents,
      scoredExperienceCount: scoredRespondents,
      positiveRate: 0.8,
    }] : [],
    matchedAspects: [],
  }
}

test('90-day consent expiry is based only on the last explicit confirmation', () => {
  assert.equal(
    participantExpiresAt('2026-09-01T00:00:00.000Z'),
    '2026-11-30T00:00:00.000Z',
  )
})

test('public cells require k=10 and a k=10 complement, not experience count alone', () => {
  const onlyCell = protectSelfReportedAggregate(rawAggregate(10, 10), null, COMMUNITY_MBTI_PUBLIC_POLICY)
  assert.equal(onlyCell.selfMbti.length, 0)
  assert.equal(onlyCell.reportedCombinations.length, 0)
  assert.equal(onlyCell.status, 'insufficient_sample')

  const safeComplement = protectSelfReportedAggregate(rawAggregate(20, 10), null, COMMUNITY_MBTI_PUBLIC_POLICY)
  assert.equal(safeComplement.selfMbti.length, 1)
  assert.equal(safeComplement.reportedCombinations.length, 1)
})

test('positive ranking stays hidden below 30 unique scored respondents', () => {
  assert.equal(
    protectSelfReportedAggregate(rawAggregate(50, 30, 29), null, COMMUNITY_MBTI_PUBLIC_POLICY).ratedCombinations.length,
    0,
  )
  assert.equal(
    protectSelfReportedAggregate(rawAggregate(60, 30, 30), null, COMMUNITY_MBTI_PUBLIC_POLICY).ratedCombinations.length,
    1,
  )
})

test('difference protection suppresses a cell that changes by fewer than k respondents', () => {
  const previous = protectSelfReportedAggregate(rawAggregate(40, 20), null, COMMUNITY_MBTI_PUBLIC_POLICY)
  const next = protectSelfReportedAggregate(rawAggregate(41, 21), previous, COMMUNITY_MBTI_PUBLIC_POLICY)
  assert.equal(next.selfMbti.length, 0)
  assert.equal(next.reportedCombinations.length, 0)
  assert.equal(next.status, 'suppressed')
})

test('one small cell change suppresses the whole release even when another cell changes by k', () => {
  const previousRaw = rawAggregate(60, 20)
  previousRaw.selfMbti.push({ selfMbti: 'INTJ', respondentCount: 20 })
  previousRaw.reportedCombinations.push({
    selfMbtiSnapshot: 'INTJ',
    partnerMbti: 'ENTP',
    selfGender: 'female',
    partnerGender: 'male',
    relationshipStatus: 'past',
    respondentCount: 20,
    experienceCount: 20,
  })
  const previous = protectSelfReportedAggregate(previousRaw, null, COMMUNITY_MBTI_PUBLIC_POLICY)

  const nextRaw = rawAggregate(71, 30)
  nextRaw.selfMbti.push({ selfMbti: 'INTJ', respondentCount: 21 })
  nextRaw.reportedCombinations.push({
    selfMbtiSnapshot: 'INTJ',
    partnerMbti: 'ENTP',
    selfGender: 'female',
    partnerGender: 'male',
    relationshipStatus: 'past',
    respondentCount: 21,
    experienceCount: 21,
  })
  const next = protectSelfReportedAggregate(nextRaw, previous, COMMUNITY_MBTI_PUBLIC_POLICY)

  assert.equal(next.status, 'suppressed')
  assert.equal(next.respondentCount, null)
  assert.deepEqual(next.selfMbti, [])
  assert.deepEqual(next.reportedCombinations, [])
})

test('an unchanged aggregate can be refreshed without creating a false difference signal', () => {
  const raw = rawAggregate(40, 20)
  const previous = protectSelfReportedAggregate(raw, null, COMMUNITY_MBTI_PUBLIC_POLICY)
  const next = protectSelfReportedAggregate(rawAggregate(40, 20), previous, COMMUNITY_MBTI_PUBLIC_POLICY)
  assert.equal(next.status, 'published')
  assert.equal(next.respondentCount, 40)
  assert.equal(next.selfMbti.length, 1)
})

test('public snapshot freshness fails closed at and after 24 hours', () => {
  assert.equal(isFreshPublicSnapshot('2026-09-05T00:00:00.000Z', new Date('2026-09-05T23:59:59.999Z')), true)
  assert.equal(isFreshPublicSnapshot('2026-09-05T00:00:00.000Z', new Date('2026-09-06T00:00:00.000Z')), false)
  assert.equal(isFreshPublicSnapshot('not-a-date', new Date('2026-09-05T00:00:00.000Z')), false)
})
