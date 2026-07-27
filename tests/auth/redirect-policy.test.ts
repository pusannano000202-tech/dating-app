import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPostLoginDestination,
  isSafeLocalRedirect,
} from '../../lib/auth/redirect'

test('getPostLoginDestination starts basic onboarding without a requested redirect', () => {
  assert.equal(getPostLoginDestination({}), '/profile/basic')
})

test('getPostLoginDestination keeps safe local redirects', () => {
  assert.equal(
    getPostLoginDestination({
      requestedRedirect: '/group/create',
    }),
    '/group/create'
  )
  assert.equal(
    getPostLoginDestination({
      requestedRedirect: '/profile/survey',
    }),
    '/profile/survey'
  )
  assert.equal(
    getPostLoginDestination({
      requestedRedirect: 'https://evil.example/path',
    }),
    '/profile/basic'
  )
})

test('isSafeLocalRedirect rejects protocol-relative and external redirects', () => {
  assert.equal(isSafeLocalRedirect('/match'), true)
  assert.equal(isSafeLocalRedirect('//evil.example'), false)
  assert.equal(isSafeLocalRedirect('https://evil.example'), false)
  assert.equal(isSafeLocalRedirect(null), false)
})
