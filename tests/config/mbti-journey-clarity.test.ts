import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { expandCountDraft, type MbtiExperienceDraft } from '../../lib/community/mbti/draft'

const root = process.cwd()
const hub = readFileSync(path.join(root, 'components/community/mbti/MbtiHub.tsx'), 'utf8')
const editor = readFileSync(path.join(root, 'components/community/mbti/MbtiExperienceEditor.tsx'), 'utf8')
const journey = readFileSync(path.join(root, 'components/community/mbti/MbtiJourneyProgress.tsx'), 'utf8')
const review = readFileSync(path.join(root, 'components/community/mbti/MbtiExperienceReview.tsx'), 'utf8')
const manager = readFileSync(path.join(root, 'components/community/mbti/MbtiResponseManager.tsx'), 'utf8')
const stats = readFileSync(path.join(root, 'components/community/mbti/MbtiStats.tsx'), 'utf8')

test('returning to review retains edits for the same partner type and ordinal', () => {
  const original = expandCountDraft({ INFP: 2 })
  const edited: MbtiExperienceDraft[] = [
    { ...original[0], partnerGender: 'female', relationshipStatus: 'current', evaluateIndividually: true, score: 5, matchedAspects: ['conversation', 'values'] },
    { ...original[1], partnerGender: 'male', relationshipStatus: 'past', evaluateIndividually: true, score: 2, matchedAspects: ['contact'] },
  ]
  const expandWithPrior = expandCountDraft as unknown as (counts: { INFP: number }, prior: readonly MbtiExperienceDraft[]) => MbtiExperienceDraft[]

  const returned = expandWithPrior({ INFP: 3 }, edited)

  assert.deepEqual(returned.slice(0, 2).map((draft) => [draft.draftId, draft.partnerGender, draft.relationshipStatus, draft.score, draft.matchedAspects]), [
    ['INFP-1', 'female', 'current', 5, ['conversation', 'values']],
    ['INFP-2', 'male', 'past', 2, ['contact']],
  ])
  assert.deepEqual(returned[2], { ...original[0], draftId: 'INFP-3', ordinal: 3 })
})

test('closing an earlier review card does not clear a newer open card', () => {
  let transition: ((current: string | null, toggledId: string, isOpen: boolean) => string | null) | undefined
  try {
    transition = (require('../../lib/community/mbti/journey') as {
      transitionExpandedReviewId: (current: string | null, toggledId: string, isOpen: boolean) => string | null
    }).transitionExpandedReviewId
  } catch {
    transition = undefined
  }

  assert.equal(typeof transition, 'function')
  assert.equal(transition?.('INFP-2', 'INFP-1', false), 'INFP-2')
  assert.equal(transition?.('INFP-1', 'INFP-1', false), null)
  assert.equal(transition?.('INFP-1', 'INFP-2', true), 'INFP-2')
})

test('a partial submission is retry-locked with the original idempotency payload', async () => {
  let runAttempt: undefined | ((plan: unknown, transport: unknown, participantConfirmed: boolean) => Promise<{ kind: string, participantConfirmed: boolean }>)
  try {
    runAttempt = (require('../../lib/community/mbti/journey') as {
      runMbtiSubmissionAttempt: (plan: unknown, transport: unknown, participantConfirmed: boolean) => Promise<{ kind: string, participantConfirmed: boolean }>
    }).runMbtiSubmissionAttempt
  } catch {
    runAttempt = undefined
  }

  assert.equal(typeof runAttempt, 'function')
  if (!runAttempt) return

  const plan = {
    participant: { selfMbti: 'ENFP', selfGender: 'unknown', consent: true, consentVersion: 'community_mbti_v1', expectedRevision: 0, clientMutationId: 'fixed:participant' },
    experiences: [
      { selfMbtiSnapshot: 'ENFP', partnerMbti: 'INFP', partnerGender: 'unknown', relationshipStatus: 'past', entryMode: 'count_only', reportedCount: 1, score: null, matchedAspects: null, clientMutationId: 'fixed:experience:0' },
      { selfMbtiSnapshot: 'ENFP', partnerMbti: 'INTP', partnerGender: 'unknown', relationshipStatus: 'past', entryMode: 'count_only', reportedCount: 1, score: null, matchedAspects: null, clientMutationId: 'fixed:experience:1' },
    ],
  }
  const calls: string[] = []
  let failSecondExperience = true
  const transport = {
    putParticipant: async (input: { clientMutationId: string }) => { calls.push(input.clientMutationId); return { ok: true, status: 200 } },
    postExperience: async (input: { clientMutationId: string }) => {
      calls.push(input.clientMutationId)
      const shouldFail = failSecondExperience && input.clientMutationId.endsWith(':1')
      return { ok: !shouldFail, status: shouldFail ? 503 : 201 }
    },
  }

  const first = await runAttempt(plan, transport, false)
  assert.deepEqual(first, { kind: 'retry_locked', participantConfirmed: true })
  failSecondExperience = false
  const retry = await runAttempt(plan, transport, first.participantConfirmed)

  assert.deepEqual(retry, { kind: 'completed', participantConfirmed: true })
  assert.deepEqual(calls, ['fixed:participant', 'fixed:experience:0', 'fixed:experience:1', 'fixed:experience:0', 'fixed:experience:1'])
})

test('a first participant revision conflict is safe to reload before any experience post', async () => {
  const runMbtiSubmissionAttempt = (require('../../lib/community/mbti/journey') as {
    runMbtiSubmissionAttempt?: (plan: unknown, transport: unknown, participantConfirmed: boolean) => Promise<{ kind: string, participantConfirmed: boolean }>
  }).runMbtiSubmissionAttempt
  assert.equal(typeof runMbtiSubmissionAttempt, 'function')
  if (!runMbtiSubmissionAttempt) return
  let experiencePosts = 0
  const result = await runMbtiSubmissionAttempt({ participant: { clientMutationId: 'fixed:participant' }, experiences: [] }, {
    putParticipant: async () => ({ ok: false, status: 409 }),
    postExperience: async () => { experiencePosts += 1; return { ok: true, status: 201 } },
  }, false)

  assert.deepEqual(result, { kind: 'participant_conflict', participantConfirmed: false })
  assert.equal(experiencePosts, 0)
})

test('journey makes steps, selection state, final consent and login limitations explicit', () => {
  assert.match(journey, /\['내 유형', '경험 선택', '확인·동의'\]/)
  assert.match(journey, /\{step\} \{label\}/)
  assert.match(hub, /로그인/) 
  assert.match(hub, /로그인.*초안|초안.*로그인/)
  assert.match(editor, /aria-pressed=/)
  assert.match(review, /<details/)
  assert.match(review, /총 \{drafts\.length\}건/)
  assert.match(review, /aria-pressed=/)
  assert.match(manager, /aria-pressed=\{experience\.score === score\}/)
})

test('statistics distinguish a loading failure from an honest empty result and offer retry', () => {
  assert.match(stats, /setError/)
  assert.match(stats, /통계를 불러오지 못했어요/)
  assert.match(stats, /다시 시도/)
  assert.match(hub, /내 유형 선택으로 돌아가기|경험 선택으로 돌아가기/)
  assert.doesNotMatch(stats, /권위 있는 출석/)
})
