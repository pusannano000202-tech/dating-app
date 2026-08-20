import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getOAuthCallbackErrorMessage,
  getOAuthCallbackUrl,
  getOAuthLoginErrorMessage,
  type QuantumOAuthProvider,
} from '../../lib/auth/oauth-login'

test('getOAuthCallbackErrorMessage hides provider internals from the login screen', () => {
  assert.equal(
    getOAuthCallbackErrorMessage('access_denied'),
    '로그인이 취소됐어요. 다시 시도해 주세요.'
  )
  assert.equal(
    getOAuthCallbackErrorMessage('unexpected_failure'),
    '로그인을 완료하지 못했어요. 다시 시도해 주세요.'
  )
  assert.doesNotMatch(getOAuthCallbackErrorMessage(), /oauth|callback|code/i)
})

test('getOAuthCallbackUrl preserves the requested local destination', () => {
  assert.equal(
    getOAuthCallbackUrl('https://dating-app-silk.vercel.app', '/profile/basic'),
    'https://dating-app-silk.vercel.app/auth/callback?next=%2Fprofile%2Fbasic'
  )
  assert.equal(
    getOAuthCallbackUrl('http://localhost:3003/', '/group/create?source=login'),
    'http://localhost:3003/auth/callback?next=%2Fgroup%2Fcreate%3Fsource%3Dlogin'
  )
  assert.equal(
    getOAuthCallbackUrl('https://dating-app-silk.vercel.app', 'https://evil.example/path'),
    'https://dating-app-silk.vercel.app/auth/callback?next=%2Fprofile%2Fbasic'
  )
})

test('getOAuthLoginErrorMessage explains disabled providers without exposing raw errors', () => {
  const cases: QuantumOAuthProvider[] = ['google', 'kakao']

  for (const provider of cases) {
    const message = getOAuthLoginErrorMessage(
      provider,
      new Error('Unsupported provider: provider is not enabled')
    )

    assert.match(message, provider === 'google' ? /Google/ : /카카오/)
    assert.match(message, /이메일/)
    assert.doesNotMatch(message, /Unsupported provider/)
  }
})

test('getOAuthLoginErrorMessage maps unknown provider errors to a safe generic message', () => {
  assert.notEqual(
    getOAuthLoginErrorMessage('kakao', new Error('redirect_uri mismatch')),
    'redirect_uri mismatch'
  )
  assert.notEqual(
    getOAuthLoginErrorMessage('google', null),
    'Google 로그인으로 이동하지 못했어요. 다시 시도해줘.'
  )
  assert.doesNotMatch(
    getOAuthLoginErrorMessage('kakao', new Error('redirect_uri mismatch: internal oauth callback diagnostic')),
    /redirect_uri|internal|oauth|callback/i
  )
})
