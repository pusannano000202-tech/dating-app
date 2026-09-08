import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function source(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

test('partner access API returns an exact inactive tombstone state for user and venue filters', () => {
  const route = source('app/api/admin/super-admin/tonight/access/partner/route.ts')

  assert.match(route, /if \(userId && venueId && afterMembershipId === null\)/)
  assert.match(route, /super_admin_get_venue_partner_membership_state/)
  assert.match(route, /p_user_id:\s*userId/)
  assert.match(route, /p_venue_id:\s*venueId/)
  assert.match(route, /!Array\.isArray\(stateData\) \|\| stateData\.length !== 1/)
  assert.match(route, /membership_state:\s*membershipState/)
})

test('partner grant sends the exact state revision and never revives an inactive pair with revision zero', () => {
  const adapter = source('components/tonight/live-adapters.ts')
  const start = adapter.indexOf("} else if (input.role === 'partner')")
  const end = adapter.indexOf("} else {", start + 1)
  assert.ok(start >= 0 && end > start, 'missing partner membership adapter branch')
  const branch = adapter.slice(start, end)

  assert.match(branch, /const state = asRecord\(partnerAccess\.membership_state\)/)
  assert.match(branch, /nullableNumber\(state\.revision\)/)
  assert.match(branch, /state\.is_active === true/)
  assert.match(branch, /str\(state\.user_id\) !== input\.subject/)
  assert.match(branch, /str\(state\.venue_id\) !== input\.venueId/)
  assert.match(branch, /expected_revision:\s*currentRevision/)
  assert.doesNotMatch(branch, /expected_revision:\s*num\(current\?\.revision\)/)
  assert.doesNotMatch(branch, /\?\?\s*0/)
})
