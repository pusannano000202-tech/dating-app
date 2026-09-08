import assert from 'node:assert/strict'
import test from 'node:test'

import {
  activityExplorerFingerprint,
  canProgressTonightActivityExplorer,
  classifyFreshActivityExplorerSubmission,
  guardFreshActivityExplorerAction,
  inspectActivityExplorerDraft,
  isExactlyThreeUniqueActivityIds,
  readActivityExplorerDraft,
  reconcileActivityExplorerState,
} from '../../components/tonight/activity-explorer-state'

const round = {
  id: 'round-2026-09-05',
  serviceDate: '2026-09-05',
  signupCloseAt: '2026-09-05T18:30:00+09:00',
  status: 'open',
}

const activities = [
  { id: 'board-game', title: '보드게임', description: '가볍게 시작해요', imageUrl: '/board.webp', imageAlt: '보드게임', durationMinutes: 90, kind: 'game' },
  { id: 'casual-pub', title: '캐주얼 펍', description: '대화를 나눠요', imageUrl: '/pub.webp', imageAlt: '캐주얼 펍', durationMinutes: 100, kind: 'pub' },
  { id: 'night-walk', title: '야간 산책', description: '천천히 걸어요', imageUrl: '/walk.webp', imageAlt: '야간 산책', durationMinutes: 75, kind: 'walk' },
] as const

const openData = { round, activities, applicationsOpen: true }

test('exactly three unique IDs must be a permutation of this round activities', () => {
  assert.equal(isExactlyThreeUniqueActivityIds(['night-walk', 'board-game', 'casual-pub'], activities), true)
  assert.equal(isExactlyThreeUniqueActivityIds(['board-game', 'board-game', 'casual-pub'], activities), false)
  assert.equal(isExactlyThreeUniqueActivityIds(['board-game', 'casual-pub', 'unknown'], activities), false)
})

test('activity tuple rejects empty, whitespace, duplicate, and non-three raw IDs fail-closed', () => {
  const invalidActivities = [
    [{ ...activities[0], id: '' }, activities[1], activities[2]],
    [{ ...activities[0], id: '  ' }, activities[1], activities[2]],
    [activities[0], { ...activities[1], id: activities[0].id }, activities[2]],
    [...activities, { id: 'fourth', title: '넷째', description: '넷째', imageUrl: '/four.webp', imageAlt: '넷째', durationMinutes: 60, kind: 'other' }],
  ]

  for (const candidate of invalidActivities) {
    const next = { ...openData, activities: candidate }
    assert.equal(isExactlyThreeUniqueActivityIds(candidate.map((activity) => activity.id), candidate), false)
    assert.equal(canProgressTonightActivityExplorer(next), false)
  }
})

test('same round reload keeps a valid custom rank', () => {
  const fingerprint = activityExplorerFingerprint(openData)
  const result = reconcileActivityExplorerState({
    next: openData,
    previousFingerprint: fingerprint,
    previousRankedIds: ['night-walk', 'board-game', 'casual-pub'],
  })

  assert.deepEqual(result.rankedIds, ['night-walk', 'board-game', 'casual-pub'])
  assert.equal(result.reset, false)
})

test('draft fingerprint is a deterministic content digest and stores no activity copy', () => {
  const fingerprint = activityExplorerFingerprint(openData)
  const changed = activityExplorerFingerprint({
    ...openData,
    activities: [{ ...activities[0], description: '바뀐 세부 설명' }, activities[1], activities[2]],
  })

  assert.match(fingerprint, /^g1:[a-f0-9]{16}$/)
  assert.doesNotMatch(fingerprint, /보드게임|가볍게 시작해요|board\.webp/)
  assert.notEqual(fingerprint, changed)
})

test('round, date, content, deadline, and status changes invalidate local rank state', () => {
  const fingerprint = activityExplorerFingerprint(openData)
  const variants = [
    { ...openData, round: { ...round, id: 'round-next' } },
    { ...openData, round: { ...round, serviceDate: '2026-09-06' } },
    { ...openData, activities: [{ ...activities[0], title: '새 보드게임' }, activities[1], activities[2]] },
    { ...openData, round: { ...round, signupCloseAt: '2026-09-05T18:00:00+09:00' } },
    { ...openData, round: { ...round, status: 'closed' }, applicationsOpen: false },
  ]

  for (const next of variants) {
    const result = reconcileActivityExplorerState({
      next,
      previousFingerprint: fingerprint,
      previousRankedIds: ['night-walk', 'board-game', 'casual-pub'],
    })
    assert.equal(result.reset, true)
    assert.deepEqual(result.rankedIds, next.activities.map((activity) => activity.id))
  }
})

test('a server application gate change invalidates the draft even when round status is unchanged', () => {
  const previousFingerprint = activityExplorerFingerprint(openData)
  const next = { ...openData, applicationsOpen: false }
  const result = reconcileActivityExplorerState({
    next,
    previousFingerprint,
    previousRankedIds: ['night-walk', 'board-game', 'casual-pub'],
  })

  assert.notEqual(previousFingerprint, activityExplorerFingerprint(next))
  assert.equal(result.reset, true)
  assert.equal(result.canProgress, false)
})

test('a corrupted or mismatched session draft is ignored', () => {
  const fingerprint = activityExplorerFingerprint(openData)
  assert.equal(readActivityExplorerDraft({ version: 1, fingerprint, rankedIds: ['board-game', 'board-game', 'night-walk'] }, openData), null)
  assert.equal(readActivityExplorerDraft({ version: 1, fingerprint: 'another-round', rankedIds: ['board-game', 'casual-pub', 'night-walk'] }, openData), null)
  assert.equal(readActivityExplorerDraft('not-json', openData), null)
})

test('a well-formed draft from a changed round is discarded with a stale signal', () => {
  const result = inspectActivityExplorerDraft({
    version: 1,
    fingerprint: 'g1:0000000000000000',
    rankedIds: ['night-walk', 'board-game', 'casual-pub'],
  }, openData)

  assert.equal(result.draft, null)
  assert.equal(result.stale, true)
})

test('closed state disables progression even when its IDs are valid', () => {
  const result = reconcileActivityExplorerState({
    next: { ...openData, round: { ...round, status: 'closed' }, applicationsOpen: false },
    previousFingerprint: activityExplorerFingerprint(openData),
    previousRankedIds: ['night-walk', 'board-game', 'casual-pub'],
  })

  assert.equal(result.canProgress, false)
})

test('strict-mode cleanup invalidates a fresh load before it can invoke apply', async () => {
  let resolveLoad!: (value: typeof openData) => void
  let lifecycleGeneration = 1
  let applyCalls = 0
  const pending = guardFreshActivityExplorerAction(
    () => new Promise<typeof openData>((resolve) => { resolveLoad = resolve }),
    () => lifecycleGeneration === 1,
    async () => { applyCalls += 1 },
  )

  lifecycleGeneration = 2 // Strict-mode cleanup for the first mount.
  lifecycleGeneration = 3 // Replacement mount is a new component lifetime.
  resolveLoad(openData)

  assert.equal(await pending, 'invalidated')
  assert.equal(applyCalls, 0)
})

test('a synchronous owner-ref change blocks an old owner after its fresh load resolves', async () => {
  let resolveLoad!: (value: typeof openData) => void
  let currentOwner = 'applicant-m1'
  let applyCalls = 0
  const pending = guardFreshActivityExplorerAction(
    () => new Promise<typeof openData>((resolve) => { resolveLoad = resolve }),
    () => currentOwner === 'applicant-m1',
    async () => { applyCalls += 1 },
  )

  currentOwner = 'applicant-m2'
  resolveLoad(openData)

  assert.equal(await pending, 'invalidated')
  assert.equal(applyCalls, 0)
})

test('a fresh response with an existing application recovers instead of applying again', () => {
  assert.equal(classifyFreshActivityExplorerSubmission({
    next: openData,
    expectedFingerprint: activityExplorerFingerprint(openData),
    rankedIds: ['night-walk', 'board-game', 'casual-pub'],
    hasExistingApplication: true,
  }), 'existing_application')
})
