import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const routePath = join(
  process.cwd(),
  'app',
  'api',
  'admin',
  'super-admin',
  'tonight',
  'audit',
  'route.ts',
)

function auditRoute(): string {
  return readFileSync(routePath, 'utf8')
}

test('audit API uses a strict opaque composite cursor and keeps round filtering optional', () => {
  const source = auditRoute()

  assert.match(source, /allowedRoles:\s*\['super_admin'\][\s\S]*?requireRecentAuth:\s*true/)
  assert.match(source, /assertStrictSearchParams\(request,\s*\['round_id', 'limit', 'cursor'\]\)/)
  assert.match(source, /roundValue === null\s*\? null\s*:\s*asUuid\(roundValue, 'round_id'\)/)
  assert.match(source, /rawLimit === null\s*\? 50/)
  assert.match(source, /max:\s*50/)
  assert.match(source, /Buffer\.from\(value, 'base64url'\)/)
  assert.match(source, /Buffer\.from\(JSON\.stringify\(cursor\), 'utf8'\)\.toString\('base64url'\)/)
  assert.match(source, /TIMESTAMPTZ_PATTERN\s*=\s*\/\^\\d\{4\}[^\n]+\\d\{1,6\}/)
  assert.match(source, /typeof row\.occurredAt !== 'string'/)
  assert.match(source, /typeof row\.id !== 'string'/)
  assert.doesNotMatch(source, /toISOString\(\)|new Date\(row\.occurredAt\)/)
})

test('audit API requests limit plus one rows, strips the lookahead, and returns next_cursor', () => {
  const source = auditRoute()

  assert.match(source, /super_admin_list_tonight_audit_events/)
  assert.match(source, /p_round_id:\s*roundId/)
  assert.match(source, /p_before_occurred_at:\s*cursor\?\.occurredAt \?\? null/)
  assert.match(source, /p_before_id:\s*cursor\?\.id \?\? null/)
  assert.match(source, /p_limit:\s*limit/)
  assert.match(source, /safeRows\.length > limit/)
  assert.match(source, /safeRows\.slice\(0, limit\)/)
  assert.match(source, /occurredAt:\s*last\.cursorOccurredAt/)
  assert.match(source, /id:\s*last\.cursorId/)
  assert.match(source, /audit:\s*page\.audit,\s*next_cursor:\s*page\.nextCursor/)
  assert.match(source, /service_unavailable/)
})

test('audit pagination keeps the public audit DTO allowlisted and recursively removes secret state', () => {
  const source = auditRoute()

  for (const field of [
    'audit_id',
    'audit_entity_type',
    'audit_entity_id',
    'audit_action',
    'audit_actor_user_id',
    'audit_actor_kind',
    'audit_occurred_at',
    'audit_before_state',
    'audit_after_state',
  ]) {
    assert.match(source, new RegExp(`${field}:`), `${field} must remain in the response DTO`)
  }
  assert.match(source, /sanitizeAuditState/)
  assert.match(source, /payment_key\|secret\|token\|password\|phone\|photo\|idempotency/i)
  assert.doesNotMatch(source, /audit_cursor_id:/)
})
