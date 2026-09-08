import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getSafeClientRedirect,
  getSequentialMatchStartRedirect,
} from '../../lib/client-redirect'

function withLocationSearch<T>(search: string, action: () => T): T {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { search } },
  })

  try {
    return action()
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow)
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  }
}

test('client redirect rejects encoded backslash external targets', () => {
  assert.equal(
    withLocationSearch(
      '?redirect=%2F%255Cattacker.invalid%2Fpath',
      () => getSafeClientRedirect('/profile/preferences'),
    ),
    '/profile/preferences',
  )
})

test('client redirect preserves legitimate internal and sequential match destinations', () => {
  assert.equal(
    withLocationSearch(
      '?redirect=%2Fcommunity%2Fplaces%3Fcategory%3Dcafe%23nearby',
      () => getSafeClientRedirect('/'),
    ),
    '/community/places?category=cafe#nearby',
  )
  assert.equal(
    withLocationSearch(
      '?redirect=%2Fmatch%2Fstart%3Fstep%3Dpreferences',
      () => getSequentialMatchStartRedirect('/profile/schedule', '/profile/schedule'),
    ),
    '/profile/schedule?redirect=%2Fmatch%2Fstart%3Fstep%3Dpreferences',
  )
})
