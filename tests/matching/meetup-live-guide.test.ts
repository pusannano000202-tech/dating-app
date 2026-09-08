import assert from 'node:assert/strict'
import test from 'node:test'

import { featuredMeetupIdeas } from '../../lib/community/catalog'
import {
  CONTINUATION_GUIDE_BINDINGS,
  TONIGHT_GUIDE_BINDINGS,
  getMeetupGuideTemplate,
} from '../../lib/meetups/guide-catalog'
import { resolveMeetupGuideView } from '../../lib/meetups/guide-contract'
import { validateMeetupCreateV3Input } from '../../lib/meetups/contracts'
import { resolveIdempotencyAttempt } from '../../lib/meetups/idempotency'

test('meetup creation reuses one key for the same payload and rotates it after an edit', () => {
  let next = 0
  const createKey = () => `key-${++next}`
  const first = resolveIdempotencyAttempt(null, 'same-payload', createKey)
  const retry = resolveIdempotencyAttempt(first, 'same-payload', createKey)
  const edited = resolveIdempotencyAttempt(retry, 'edited-payload', createKey)

  assert.equal(retry, first)
  assert.equal(retry.idempotencyKey, 'key-1')
  assert.equal(edited.idempotencyKey, 'key-2')
})

test('meetup v3 creation accepts only a matching known preset and a valid end time', () => {
  const now = new Date('2026-09-07T08:00:00.000Z')
  const valid = {
    category: 'board_game',
    gender_mode: 'all',
    title: '보드게임 같이 해요',
    description: '초보도 함께하는 모임',
    place_name: '부산대 정문',
    scheduled_at: '2026-09-07T10:00:00.000Z',
    ends_at: '2026-09-07T12:00:00.000Z',
    capacity: 5,
    scope_type: 'department',
    activity_key: 'board-game-round',
    idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }

  const parsed = validateMeetupCreateV3Input(valid, now)
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    assert.equal(parsed.value.scopeType, 'department')
    assert.equal(parsed.value.activityKey, 'board-game-round')
    assert.equal(parsed.value.endsAt, '2026-09-07T12:00:00.000Z')
  }
  assert.deepEqual(validateMeetupCreateV3Input({ ...valid, activity_key: 'night-basketball' }, now), { ok: false, error: 'invalid_activity_key' })
  assert.deepEqual(validateMeetupCreateV3Input({ ...valid, ends_at: '2026-09-07T09:00:00.000Z' }, now), { ok: false, error: 'invalid_end_time' })
  assert.deepEqual(validateMeetupCreateV3Input({ ...valid, scope_type: 'voice' }, now), { ok: false, error: 'invalid_scope_type' })
})

test('every current meetup idea has a guide binding and custom topics use the honest fallback', () => {
  assert.equal(featuredMeetupIdeas.length, 15)
  for (const idea of featuredMeetupIdeas) {
    const template = getMeetupGuideTemplate(idea.id, idea.category)
    assert.equal(template.activityKey, idea.id)
    assert.equal(template.scenes.length >= 7, true)
    assert.equal(template.scenes.every((scene) => Boolean(scene.artwork.src) && Boolean(scene.primaryAction)), true)
  }

  const fallback = getMeetupGuideTemplate('my-custom-topic', 'other')
  assert.equal(fallback.id, 'meetup-common-v1')
  assert.equal(fallback.professionalRulesClaimed, false)
})

test('board-game meetup guidance preserves the existing fourteen-panel rules component contract', () => {
  const template = getMeetupGuideTemplate('board-game-round', 'board_game')
  assert.equal(template.usesDalmutiRules, true)
  assert.equal(template.scenes.some((scene) => scene.id === 'activity' && scene.primaryAction === 'open_activity'), true)
})

test('tonight and continuation sources remain owned by their existing runtimes', () => {
  assert.equal(TONIGHT_GUIDE_BINDINGS.length, 6)
  assert.equal(TONIGHT_GUIDE_BINDINGS.every((binding) => binding.runtimeOwner === 'tonight'), true)
  assert.deepEqual(CONTINUATION_GUIDE_BINDINGS.map((binding) => binding.programDay), [1, 2, 3, 4, 5])
  assert.equal(CONTINUATION_GUIDE_BINDINGS.every((binding) => binding.runtimeOwner === 'continuation'), true)
  assert.equal(CONTINUATION_GUIDE_BINDINGS.map((binding) => String(binding.personalProgressOwner)).includes('meetup'), false)
})

test('personal acknowledgement never advances shared meetup state', () => {
  const input = {
    mode: 'actual' as const,
    lifecycleStatus: 'open' as const,
    serverNow: '2026-09-07T10:05:00.000Z',
    scheduledAt: '2026-09-07T10:00:00.000Z',
    endsAt: '2026-09-07T12:00:00.000Z',
    sharedStep: 'greet' as const,
    personalAcknowledgedStep: 'wrap' as const,
    previewStep: null,
  }

  const first = resolveMeetupGuideView(input)
  const lateJoin = resolveMeetupGuideView({ ...input, personalAcknowledgedStep: null })
  assert.equal(first.currentSceneId, 'greet')
  assert.equal(first.personalAcknowledgedStep, 'wrap')
  assert.equal(lateJoin.currentSceneId, 'greet')
  assert.equal(first.source, 'shared_state')
})

test('preview navigation is read-only and terminal lifecycle states override stale shared steps', () => {
  const base = {
    lifecycleStatus: 'open' as const,
    serverNow: '2026-09-07T09:00:00.000Z',
    scheduledAt: '2026-09-07T10:00:00.000Z',
    endsAt: '2026-09-07T12:00:00.000Z',
    sharedStep: null,
    personalAcknowledgedStep: null,
  }
  assert.deepEqual(resolveMeetupGuideView({ ...base, mode: 'preview', previewStep: 'activity' }), {
    currentSceneId: 'activity',
    personalAcknowledgedStep: null,
    source: 'preview',
    mayMutateSharedState: false,
  })
  assert.equal(resolveMeetupGuideView({ ...base, mode: 'actual', previewStep: null, lifecycleStatus: 'completed', sharedStep: 'activity' }).currentSceneId, 'next')
  assert.equal(resolveMeetupGuideView({ ...base, mode: 'actual', previewStep: null, lifecycleStatus: 'cancelled', sharedStep: 'activity' }).currentSceneId, 'cancelled')
})
