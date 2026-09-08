import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

test('notification failures API is recent-super-admin-only, bounded and PII-safe', () => {
  const route = source('app/api/admin/super-admin/tonight/notifications/failures/route.ts')

  assert.match(route, /allowedRoles: \['super_admin'\]/)
  assert.match(route, /requireRecentAuth: true/)
  assert.match(route, /super_admin_list_tonight_notification_failures/)
  assert.match(route, /limit < 1 \|\| limit > 50/)
  assert.match(route, /QUERY_KEYS = new Set\(\['round_id', 'limit', 'cursor'\]\)/)
  assert.match(route, /decodeFailureCursor/)
  assert.match(route, /p_before_failed_at:/)
  assert.match(route, /p_before_failure_id:/)
  assert.match(route, /next_cursor/)
  assert.match(route, /TIMESTAMPTZ_PATTERN/)
  assert.match(route, /failedAt: row\.failedAt/)
  assert.match(route, /failed_at: failedAt/)
  assert.doesNotMatch(route, /new Date\([^)]*failed(?:At|_at)[^)]*\)\.toISOString\(\)/)
  assert.match(route, /sanitizeNotificationFailure/)
  assert.match(route, /round_id:/)
  assert.match(route, /team_id:/)
  assert.match(route, /event_type:/)
  assert.match(route, /recipient_ref:/)
  assert.match(route, /team_ref:/)
  assert.doesNotMatch(route, /row\.(endpoint|auth_secret|p256dh|phone|photo|display_name|recipient_user_id)/)
  assert.match(route, /privateJson\(\{\s*failures/)
})

test('failure cursor retains PostgreSQL microseconds exactly', () => {
  const rows = Array.from({ length: 73 }, (_, index) => ({
    failedAt: `2026-09-03T02:00:00.${String(index + 1).padStart(6, '0')}+00:00`,
    failureId: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
  })).sort((left, right) => right.failedAt.localeCompare(left.failedAt)
    || right.failureId.localeCompare(left.failureId))
  const cursor = rows[49]
  const encoded = Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
  const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as typeof cursor

  assert.equal(decoded.failedAt, cursor.failedAt)
  assert.equal(decoded.failedAt.split('.')[1]?.slice(0, 6), '000024')
  const nextPage = rows.filter((row) => row.failedAt < decoded.failedAt
    || (row.failedAt === decoded.failedAt && row.failureId < decoded.failureId))
  assert.deepEqual(nextPage, rows.slice(50))
})

test('notification recovery API accepts only revisioned idempotent retry requests', () => {
  const route = source('app/api/admin/super-admin/tonight/notifications/retry/route.ts')

  assert.match(route, /allowedRoles: \['super_admin'\]/)
  assert.match(route, /requireRecentAuth: true/)
  assert.match(
    route,
    /readStrictJson\(request, \[\s*'failureKind', 'failureId', 'expectedRevision', 'idempotencyKey',\s*\]\)/,
  )
  assert.match(route, /super_admin_retry_tonight_notification_failure/)
  assert.match(route, /asIdempotencyKey/)
  assert.doesNotMatch(route, /reason|notes/)
  assert.match(route, /resubscribe_required/)
  assert.match(route, /retry_queued/)
})
