import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

test('user arrival-help API is user-only, strict, idempotent, and private', () => {
  const route = source('app/api/tonight/arrival-help/route.ts')
  assert.match(route, /allowedRoles:\s*\['user'\]/)
  assert.match(route, /readStrictJson\(request,\s*\['team_id', 'category', 'idempotency_key'\]\)/)
  assert.match(route, /request_my_tonight_arrival_help/)
  assert.match(route, /get_my_tonight_arrival_help/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /cancel_my_tonight_arrival_help/)
  assert.match(route, /readStrictJson\(request,\s*\['request_id', 'expected_revision', 'idempotency_key'\]\)/)
  assert.match(route, /asIdempotencyKey/)
  assert.match(route, /privateJson/)
  assert.doesNotMatch(route, /phone|email|display_name/)
})

test('partner arrival-help API pins every operation to the authenticated venue', () => {
  const route = source('app/api/partner/tonight/arrival-help/route.ts')
  assert.match(route, /allowedRoles:\s*\['partner'\]/)
  assert.match(route, /partnerVenueId:\s*venueId/)
  assert.match(route, /partner_get_tonight_arrival_help_queue/)
  assert.match(route, /partner_update_tonight_arrival_help/)
  assert.match(route, /readStrictJson\(request,\s*\['venue_id', 'request_id', 'action', 'expected_revision', 'idempotency_key'\]\)/)
  assert.match(route, /privateJson/)
  assert.doesNotMatch(route, /phone|email|display_name/)
})

test('admin arrival-help API is role guarded and never accepts a manual reason', () => {
  const route = source('app/api/admin/tonight/arrival-help/route.ts')
  assert.match(route, /allowedRoles:\s*\['admin', 'super_admin'\]/)
  assert.match(route, /admin_get_tonight_arrival_help_queue/)
  assert.match(route, /admin_update_tonight_arrival_help/)
  assert.match(route, /readStrictJson\(request,\s*\['request_id', 'action', 'expected_revision', 'idempotency_key'\]\)/)
  assert.match(route, /privateJson/)
  assert.doesNotMatch(route, /reason|notes|phone|email/)
})
