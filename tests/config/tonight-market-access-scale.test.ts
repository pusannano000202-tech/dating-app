import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  normalizeTonightMarketMembershipPage,
  normalizeTonightPartnerMembershipPage,
} from '../../lib/server/tonight/access-page'

const source = (relative: string) => {
  const path = join(process.cwd(), relative)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

test('market access route returns at most fifty non-PII rows with cursor and exact user search', () => {
  const route = source('app/api/admin/super-admin/tonight/access/market/route.ts')

  assert.match(route, /super_admin_list_tonight_market_memberships_page/)
  assert.match(route, /after_membership_id/)
  assert.match(route, /user_id/)
  assert.match(route, /p_limit:\s*50/)
  assert.doesNotMatch(route, /hydrateTonightAccessMemberships/)
  assert.doesNotMatch(route, /super_admin_list_tonight_market_memberships'/)
})

test('ten thousand synthetic memberships are capped before the browser response', () => {
  const rows = Array.from({ length: 10_000 }, (_, index) => ({
    membership_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    market_code: 'PNU',
    user_id: '11111111-1111-4111-8111-111111111111',
    revision: 0,
  }))
  const page = normalizeTonightMarketMembershipPage(rows, 50)

  assert.equal(page.memberships.length, 50)
  assert.equal(page.nextAfterMembershipId, rows[49].membership_id)
})

test('one selected membership detail alone hydrates display PII', () => {
  const detail = source('app/api/admin/super-admin/tonight/access/market/detail/route.ts')

  assert.match(detail, /super_admin_get_tonight_market_membership/)
  assert.match(detail, /hydrateTonightAccessMemberships/)
  assert.match(detail, /slice\(0, 1\)|\[0\]/)
})

test('super-admin access data is explicit, cached, and absent from ordinary team loads', () => {
  const adapter = source('components/tonight/live-adapters.ts')
  const console = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(adapter, /loadAccess/)
  assert.match(adapter, /accessLoaded/)
  assert.match(adapter, /cachedMemberships/)
  assert.match(adapter, /loadAccessDetail/)
  assert.match(console, /value === 'access'[\s\S]*?adapter\.loadAccess/)
  assert.match(console, /다음 50명/)
})

test('partner access route is bounded and does not hydrate the full venue directory', () => {
  const route = source('app/api/admin/super-admin/tonight/access/partner/route.ts')

  assert.match(route, /super_admin_list_venue_partner_memberships_page/)
  assert.match(route, /after_membership_id/)
  assert.match(route, /user_id/)
  assert.match(route, /venue_id/)
  assert.match(route, /p_limit:\s*50/)
  assert.doesNotMatch(route, /hydrateTonightAccessMemberships/)
  assert.doesNotMatch(route, /\.rpc\('list_venue_partner_memberships'/)
})

test('ten thousand synthetic partner memberships are capped before the browser response', () => {
  const rows = Array.from({ length: 10_000 }, (_, index) => ({
    membership_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    user_id: '11111111-1111-4111-8111-111111111111',
    venue_id: '22222222-2222-4222-8222-222222222222',
    revision: 1,
  }))
  const page = normalizeTonightPartnerMembershipPage(rows, 50)

  assert.equal(page.memberships.length, 50)
  assert.equal(page.nextAfterMembershipId, rows[49].membership_id)
})

test('one selected partner membership detail alone hydrates account and venue labels', () => {
  const detail = source('app/api/admin/super-admin/tonight/access/partner/detail/route.ts')

  assert.match(detail, /super_admin_get_venue_partner_membership/)
  assert.match(detail, /hydrateTonightAccessMemberships/)
  assert.match(detail, /includeVenueName:\s*true/)
  assert.match(detail, /slice\(0, 1\)|\[0\]/)
})

test('partner access uses its own cursor and selected-detail path', () => {
  const adapter = source('components/tonight/live-adapters.ts')
  const console = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(adapter, /partnerMembershipPage/)
  assert.match(adapter, /partnerAfterMembershipId/)
  assert.match(adapter, /role === 'partner'[\s\S]*?access\/partner\/detail/)
  assert.match(console, /다음 50개 업장 권한/)
  assert.match(console, /선택 업장의 권한만 보기/)
  assert.match(console, /role:\s*membership\.role/)
})
