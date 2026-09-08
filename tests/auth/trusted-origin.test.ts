import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TrustedOriginError,
  assertTrustedMutationOrigin,
  resolveExpectedAppOrigin,
} from '../../lib/auth/trusted-origin'

const APP_ORIGIN = 'http://localhost:3004'

test('cookie mutations require the exact configured application Origin', () => {
  assert.doesNotThrow(() => assertTrustedMutationOrigin(
    new Request(`${APP_ORIGIN}/api/tonight`, {
      method: 'POST',
      headers: { cookie: 'sb-session=fake', origin: APP_ORIGIN },
    }),
    APP_ORIGIN,
  ))

  for (const origin of [null, 'http://127.0.0.1:3004', 'http://localhost:3004.evil.test']) {
    const headers = new Headers({ cookie: 'sb-session=fake' })
    if (origin) headers.set('origin', origin)
    assert.throws(
      () => assertTrustedMutationOrigin(new Request(`${APP_ORIGIN}/api/tonight`, { method: 'POST', headers }), APP_ORIGIN),
      (error: unknown) => error instanceof TrustedOriginError && error.status === 403,
    )
  }
})

test('exact bearer mutations allow native no-Origin but reject a present foreign Origin', () => {
  assert.doesNotThrow(() => assertTrustedMutationOrigin(
    new Request(`${APP_ORIGIN}/api/tonight`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer mobile-token' },
    }),
    APP_ORIGIN,
  ))
  assert.doesNotThrow(() => assertTrustedMutationOrigin(
    new Request(`${APP_ORIGIN}/api/tonight`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer mobile-token', origin: APP_ORIGIN },
    }),
    APP_ORIGIN,
  ))
  assert.throws(
    () => assertTrustedMutationOrigin(new Request(`${APP_ORIGIN}/api/tonight`, {
      method: 'POST',
      headers: { authorization: 'Bearer mobile-token', origin: 'https://evil.example' },
    }), APP_ORIGIN),
    (error: unknown) => error instanceof TrustedOriginError && error.status === 403,
  )
})

test('malformed Authorization never changes a request into cookie authentication', () => {
  for (const authorization of ['Bearer first Bearer second', 'Bearer first,Bearer-second']) {
    assert.throws(
      () => assertTrustedMutationOrigin(new Request(`${APP_ORIGIN}/api/tonight`, {
        method: 'POST',
        headers: {
          authorization,
          cookie: 'sb-session=fake',
          origin: APP_ORIGIN,
        },
      }), APP_ORIGIN),
      (error: unknown) => error instanceof TrustedOriginError && error.status === 401,
    )
  }
})

test('expected origin is a configured origin, never Host or forwarded headers', () => {
  assert.equal(resolveExpectedAppOrigin(APP_ORIGIN), APP_ORIGIN)
  for (const invalid of [
    undefined,
    '',
    'http://localhost:3004/',
    'http://localhost:3004/path',
    'http://localhost:3004?next=/tonight',
    'http://localhost:3004#fragment',
    'http://user@localhost:3004',
    'javascript:alert(1)',
  ]) {
    assert.throws(
      () => resolveExpectedAppOrigin(invalid),
      (error: unknown) => error instanceof TrustedOriginError && error.status === 503,
    )
  }
})

test('Host and forwarded headers cannot rescue a foreign cookie mutation Origin', () => {
  assert.throws(
    () => assertTrustedMutationOrigin(new Request(`${APP_ORIGIN}/api/tonight`, {
      method: 'POST',
      headers: {
        cookie: 'sb-session=fake',
        host: 'localhost:3004',
        origin: 'https://evil.example',
        'x-forwarded-host': 'localhost:3004',
        'x-forwarded-proto': 'http',
      },
    }), APP_ORIGIN),
    (error: unknown) => error instanceof TrustedOriginError && error.status === 403,
  )
})
