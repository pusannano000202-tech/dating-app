import assert from 'node:assert/strict'
import test from 'node:test'

import { buildExperienceSubmissions, expandCountDraft } from '../../lib/community/mbti/draft'

test('quick counts remain grouped only when gender and relationship status match', () => {
  const drafts = expandCountDraft({ INFP: 2, INTP: 1 })
  drafts[0].partnerGender = 'male'
  drafts[0].relationshipStatus = 'past'
  drafts[1].partnerGender = 'male'
  drafts[1].relationshipStatus = 'current'
  drafts[2].partnerGender = 'female'

  const submissions = buildExperienceSubmissions(drafts, 'ENFP', (index) => `mutation:draft:${index}`)
  assert.deepEqual(submissions.map((entry) => [
    entry.partnerMbti,
    entry.partnerGender,
    entry.relationshipStatus,
    entry.entryMode,
    entry.reportedCount,
  ]), [
    ['INFP', 'male', 'past', 'count_only', 1],
    ['INFP', 'male', 'current', 'count_only', 1],
    ['INTP', 'female', 'past', 'count_only', 1],
  ])
})

test('optional detail creates independent one-count rows with independent scores', () => {
  const drafts = expandCountDraft({ INFP: 2 })
  drafts[0].evaluateIndividually = true
  drafts[0].score = 5
  drafts[0].matchedAspects = ['conversation', 'values']
  drafts[1].evaluateIndividually = true
  drafts[1].score = 2

  const submissions = buildExperienceSubmissions(drafts, 'ENFP', (index) => `mutation:draft:${index}`)
  assert.deepEqual(submissions.map((entry) => [entry.entryMode, entry.reportedCount, entry.score]), [
    ['detailed', 1, 5],
    ['detailed', 1, 2],
  ])
})

test('identical unscored drafts are grouped without inventing a score', () => {
  const drafts = expandCountDraft({ INFP: 2 })
  const submissions = buildExperienceSubmissions(drafts, 'ENFP', (index) => `mutation:draft:${index}`)
  assert.equal(submissions.length, 1)
  assert.equal(submissions[0].reportedCount, 2)
  assert.equal(submissions[0].score, null)
  assert.equal(submissions[0].matchedAspects, null)
})

test('an unlimited draft total is split into independently retryable rows of at most 100', () => {
  const drafts = expandCountDraft({ INFP: 201 })
  const submissions = buildExperienceSubmissions(drafts, 'ENFP', (index) => `mutation:draft:batch:${index}`)

  assert.deepEqual(submissions.map((entry) => entry.reportedCount), [100, 100, 1])
  assert.deepEqual(submissions.map((entry) => entry.clientMutationId), [
    'mutation:draft:batch:0',
    'mutation:draft:batch:1',
    'mutation:draft:batch:2',
  ])
})
