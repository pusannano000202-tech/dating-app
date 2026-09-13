import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { DailyIdentityAccountScope } from '../../lib/daily-identity/account-scope'

import {
  DAILY_IDENTITY_DISCLOSURE,
  DAILY_IDENTITY_ODDS,
  parseDailyIdentityResponse,
  rarityPresentation,
} from '../../lib/daily-identity'
import {
  dailyIdentityCardReducer,
  initialDailyIdentityCardState,
  nextSeoulMidnightDelay,
  seoulLocalDate,
} from '../../lib/daily-identity/daily-card-state'

test('published rarity odds use the approved SS/A/B/C distribution and total 100', () => {
  assert.deepEqual(DAILY_IDENTITY_ODDS, { SS: 5, A: 15, B: 25, C: 55 })
  assert.equal(Object.values(DAILY_IDENTITY_ODDS).reduce((sum, value) => sum + value, 0), 100)
})

test('the contract accepts a safe server assignment without exposing user or gender identity', () => {
  const parsed = parseDailyIdentityResponse({
    local_date: '2026-09-09',
    timezone: 'Asia/Seoul',
    pool_version: 'campus-characters-v1-2026-09',
    tier: 'SS',
    character_key: 'pompompurin',
    display_name: '폼폼푸린',
    odds: { SS: 5, A: 15, B: 25, C: 55 },
  })

  assert.deepEqual(parsed, {
    localDate: '2026-09-09',
    timezone: 'Asia/Seoul',
    poolVersion: 'campus-characters-v1-2026-09',
    tier: 'SS',
    characterKey: 'pompompurin',
    displayName: '폼폼푸린',
    odds: { SS: 5, A: 15, B: 25, C: 55 },
  })
  assert.equal('userId' in parsed, false)
  assert.equal('genderPool' in parsed, false)
})

test('the contract rejects forged odds, dates, tiers, and oversized names', () => {
  const valid = {
    local_date: '2026-09-09', timezone: 'Asia/Seoul', pool_version: 'campus-characters-v1-2026-09',
    tier: 'C', character_key: 'chococat', display_name: '초코캣',
    odds: { SS: 5, A: 15, B: 25, C: 55 },
  }
  assert.equal(parseDailyIdentityResponse({ ...valid, local_date: '09/09/2026' }), null)
  assert.equal(parseDailyIdentityResponse({ ...valid, tier: 'S' }), null)
  assert.equal(parseDailyIdentityResponse({ ...valid, display_name: '가'.repeat(61) }), null)
  assert.equal(parseDailyIdentityResponse({ ...valid, odds: { SS: 10, A: 15, B: 25, C: 50 } }), null)
})

test('rarity copy says chance rather than status or benefits', () => {
  assert.deepEqual(rarityPresentation('SS'), {
    label: 'SS · 오늘의 희귀 등장',
    chance: '등장 확률 5%',
  })
  assert.match(DAILY_IDENTITY_DISCLOSURE.noBenefit, /혜택.*없/)
  assert.match(DAILY_IDENTITY_DISCLOSURE.noReroll, /새로고침.*바뀌지 않/)
  assert.match(DAILY_IDENTITY_DISCLOSURE.licenseRisk, /이미지.*로고.*사용하지 않/)
})

test('the reveal card stays hidden until a click and supports retry and privacy reset', () => {
  const loading = dailyIdentityCardReducer(initialDailyIdentityCardState, { type: 'reveal' })
  assert.equal(loading.status, 'loading')
  const failed = dailyIdentityCardReducer(loading, { type: 'failed' })
  assert.equal(failed.status, 'error')
  assert.equal(dailyIdentityCardReducer(failed, { type: 'reveal' }).status, 'loading')
  const reset = dailyIdentityCardReducer({ status: 'ready', identity: {
    localDate: '2026-09-09', timezone: 'Asia/Seoul', poolVersion: 'campus-characters-v1-2026-09',
    tier: 'C', characterKey: 'chococat', displayName: '초코캣', odds: DAILY_IDENTITY_ODDS,
  } }, { type: 'privacy-reset' })
  assert.deepEqual(reset, initialDailyIdentityCardState)
})

test('Seoul midnight is the only daily reset boundary', () => {
  assert.equal(seoulLocalDate(new Date('2026-09-08T14:59:59.999Z')), '2026-09-08')
  assert.equal(seoulLocalDate(new Date('2026-09-08T15:00:00.000Z')), '2026-09-09')
  assert.equal(nextSeoulMidnightDelay(new Date('2026-09-08T14:59:59.000Z')), 1000)
  assert.equal(nextSeoulMidnightDelay(new Date('2026-09-08T15:00:00.000Z')), 24 * 60 * 60 * 1000)
})

test('identity requests cannot start before authentication or survive account changes and ABA', () => {
  const scope = new DailyIdentityAccountScope()
  assert.equal(scope.capture(), null)
  scope.bind('account-a')
  const first = scope.capture()!
  assert.equal(scope.isCurrent(first), true)
  scope.bind('account-b')
  assert.equal(scope.isCurrent(first), false)
  scope.bind('account-a')
  assert.equal(scope.isCurrent(first), false)
  const second = scope.capture()!
  scope.bind(null)
  assert.equal(scope.isCurrent(second), false)
  assert.equal(scope.capture(), null)
})

test('identity UI and route bind reveal to the authenticated account before reading the RPC', () => {
  const card = readFileSync(join(process.cwd(), 'components/daily-identity/DailyIdentityCard.tsx'), 'utf8')
  const route = readFileSync(join(process.cwd(), 'app/api/daily-identity/route.ts'), 'utf8')
  assert.match(card, /scope\.current\.capture\(\)/)
  assert.match(card, /scope\.current\.isCurrent\(lease\)/)
  assert.match(card, /'X-Expected-Account': lease\.account/)
  assert.match(card, /getUser\(\)/)
  assert.match(card, /response\.status === 401 \|\| response\.status === 403/)
  assert.ok(route.indexOf('expectedAccount !== user.id') < route.indexOf("rpc('get_my_daily_identity')"))
})

test('the visual fixture is offline-development-only and reuses the real presentation and reducer', () => {
  const page = readFileSync(join(process.cwd(), 'app/community/daily-identity-preview/page.tsx'), 'utf8')
  const preview = readFileSync(join(process.cwd(), 'components/daily-identity/DailyIdentityExamplesPreview.tsx'), 'utf8')
  assert.match(page, /NODE_ENV\s*!==\s*'development'/)
  assert.match(page, /QUANTUM_LOCAL_RUNTIME_MODE\s*!==\s*'offline-ui'/)
  assert.match(preview, /DailyIdentityPresentation/)
  assert.match(preview, /dailyIdentityCardReducer/)
  assert.match(preview, /예시 별명 · 실제 배정 아님/)
  assert.match(preview, /tier: 'C'/)
  assert.match(preview, /tier: 'A'/)
  assert.match(preview, /tier: 'SS'/)
})
