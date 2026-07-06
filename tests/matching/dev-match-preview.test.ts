import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canUseDevMatchPreview,
  getDevMatchPreviewStatus,
  isDevMatchPreviewId,
  isDevSoloMatchPreviewId,
} from '../../lib/matching/dev-match-preview'

test('dev match preview keeps the pending route in pending state', () => {
  assert.equal(getDevMatchPreviewStatus('dev-match-pending'), 'pending')
})

test('dev match preview shows the confirmed sample as confirmed', () => {
  assert.equal(getDevMatchPreviewStatus('dev-match-1'), 'confirmed')
})

test('dev match preview ids are explicit and cannot be inferred from arbitrary solo text', () => {
  assert.equal(isDevMatchPreviewId('dev-match-pending'), true)
  assert.equal(isDevMatchPreviewId('dev-solo-match-pending'), true)
  assert.equal(isDevMatchPreviewId('real-solo-match-id'), false)
  assert.equal(isDevMatchPreviewId('8d1f0c7c-0000-4000-9000-000000000000'), false)
})

test('solo preview detection only accepts the dev solo prefix', () => {
  assert.equal(isDevSoloMatchPreviewId('dev-solo-match-pending'), true)
  assert.equal(isDevSoloMatchPreviewId('dev-match-1'), false)
  assert.equal(isDevSoloMatchPreviewId('real-solo-match-id'), false)
})

test('dev match preview data requires both a dev id and a dev preview session', () => {
  assert.equal(canUseDevMatchPreview('dev-match-1', true), true)
  assert.equal(canUseDevMatchPreview('dev-solo-match-pending', true), true)
  assert.equal(canUseDevMatchPreview('dev-match-1', false), false)
  assert.equal(canUseDevMatchPreview('real-solo-match-id', true), false)
})
