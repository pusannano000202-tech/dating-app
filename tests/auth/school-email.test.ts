import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPostLoginDestination,
  isPnuEmail,
  normalizeSchoolEmail,
} from '../../lib/auth/school-email'

test('normalizeSchoolEmail trims and lowercases email addresses', () => {
  assert.equal(normalizeSchoolEmail('  Student@PUSAN.ac.kr '), 'student@pusan.ac.kr')
})

test('isPnuEmail accepts only Pusan National University email domains', () => {
  assert.equal(isPnuEmail('student@pusan.ac.kr'), true)
  assert.equal(isPnuEmail('student@pusan.ac.kr '), true)
  assert.equal(isPnuEmail('student@gmail.com'), false)
  assert.equal(isPnuEmail('student@notpusan.ac.kr'), false)
})

test('getPostLoginDestination does not require school verification for basic onboarding', () => {
  assert.equal(getPostLoginDestination({ schoolEmailVerifiedAt: null }), '/profile/basic')
  assert.equal(getPostLoginDestination({ schoolEmailVerifiedAt: '2026-05-23T00:00:00Z' }), '/profile/basic')
})

test('getPostLoginDestination keeps safe redirects without school verification gate', () => {
  assert.equal(
    getPostLoginDestination({
      schoolEmailVerifiedAt: null,
      requestedRedirect: '/group/create',
    }),
    '/group/create'
  )
  assert.equal(
    getPostLoginDestination({
      schoolEmailVerifiedAt: null,
      requestedRedirect: '/profile/survey',
    }),
    '/profile/survey'
  )
  assert.equal(
    getPostLoginDestination({
      schoolEmailVerifiedAt: '2026-05-23T00:00:00Z',
      requestedRedirect: '/group/create',
    }),
    '/group/create'
  )
  assert.equal(
    getPostLoginDestination({
      schoolEmailVerifiedAt: '2026-05-23T00:00:00Z',
      requestedRedirect: 'https://evil.example/path',
    }),
    '/profile/basic'
  )
})
