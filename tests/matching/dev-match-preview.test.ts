import test from 'node:test'
import assert from 'node:assert/strict'

import { getDevMatchPreviewStatus } from '../../lib/matching/dev-match-preview'

test('dev match preview keeps the pending route in pending state', () => {
  assert.equal(getDevMatchPreviewStatus('dev-match-pending'), 'pending')
})

test('dev match preview shows the confirmed sample as confirmed', () => {
  assert.equal(getDevMatchPreviewStatus('dev-match-1'), 'confirmed')
})
