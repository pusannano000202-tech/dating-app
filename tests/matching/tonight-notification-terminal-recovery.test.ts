import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903021152_tonight_notification_terminal_recovery.sql',
)

function readMigration() {
  return fs.readFileSync(migrationPath, 'utf8')
}

test('notification terminal failures are listed through a bounded PII-safe RPC', () => {
  const sql = readMigration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.super_admin_list_tonight_notification_failures/i)
  assert.match(sql, /p_before_failed_at TIMESTAMPTZ DEFAULT NULL/i)
  assert.match(sql, /p_before_failure_id UUID DEFAULT NULL/i)
  assert.match(sql, /p_limit INTEGER DEFAULT 50/i)
  assert.match(sql, /p_limit NOT BETWEEN 1 AND 50/i)
  assert.match(sql, /cursor_pair_required/i)
  assert.match(sql, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(sql, /round_id UUID/i)
  assert.match(sql, /team_id UUID/i)
  assert.match(sql, /event_type TEXT/i)
  assert.match(sql, /recipient_ref TEXT/i)
  assert.match(sql, /team_ref TEXT/i)
  const returnsStart = sql.indexOf('RETURNS TABLE')
  const returnsEnd = sql.indexOf('LANGUAGE plpgsql', returnsStart)
  assert.ok(returnsStart > 0 && returnsEnd > returnsStart)
  assert.doesNotMatch(
    sql.slice(returnsStart, returnsEnd),
    /\b(endpoint|auth_secret|p256dh|phone|photo|display_name|recipient_user_id)\b/i,
  )
  assert.match(sql, /ORDER BY failures\.failed_at DESC, failures\.failure_id DESC/i)
  assert.match(sql, /\(failures\.failed_at, failures\.failure_id\) < \(p_before_failed_at, p_before_failure_id\)/i)
  assert.match(sql, /LIMIT p_limit/i)
})

test('failure keyset ordering cannot skip rows that share the same failed timestamp', () => {
  const sql = readMigration()
  assert.match(sql, /ORDER BY failures\.failed_at DESC, failures\.failure_id DESC/i)
  assert.match(sql, /\(failures\.failed_at, failures\.failure_id\) < \(p_before_failed_at, p_before_failure_id\)/i)

  const failedAt = '2026-09-03T02:00:00.000Z'
  const rows = Array.from({ length: 73 }, (_, index) => ({
    failedAt,
    failureId: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
  })).sort((left, right) => right.failureId.localeCompare(left.failureId))
  const seen: string[] = []
  let cursor: (typeof rows)[number] | undefined

  while (true) {
    const page = rows
      .filter((row) => !cursor || row.failedAt < cursor.failedAt
        || (row.failedAt === cursor.failedAt && row.failureId < cursor.failureId))
      .slice(0, 17)
    if (page.length === 0) break
    seen.push(...page.map((row) => row.failureId))
    cursor = page.at(-1)
  }

  assert.equal(seen.length, rows.length)
  assert.equal(new Set(seen).size, rows.length)
  assert.deepEqual(seen, rows.map((row) => row.failureId))
})

test('notification and push recovery is recent-super-admin-only, revisioned and idempotent', () => {
  const sql = readMigration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.super_admin_retry_tonight_notification_failure/i)
  assert.match(sql, /p_failure_kind TEXT/i)
  assert.match(sql, /p_failure_id UUID/i)
  assert.match(sql, /p_expected_revision INTEGER/i)
  assert.match(sql, /p_idempotency_key TEXT/i)
  assert.match(sql, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/i)
  assert.match(sql, /stale_revision/i)
  assert.match(sql, /notification_failure_recovery_requested/i)
  assert.match(sql, /quantum_private\.write_tonight_audit/i)
  assert.doesNotMatch(sql, /p_reason|p_notes|free.form/i)
})

test('push retry requires an active subscription and otherwise closes and notifies safely', () => {
  const sql = readMigration()

  assert.match(sql, /v_subscription_revoked_at IS NULL/i)
  assert.match(sql, /resubscribe_required/i)
  assert.match(sql, /retry_queued/i)
  assert.match(sql, /status = 'pending'/i)
  assert.match(sql, /status = 'cancelled'/i)
  assert.match(sql, /attempt_count = 0/i)
  assert.match(sql, /last_error_code = NULL/i)
  assert.match(sql, /INSERT INTO public\.notifications/i)
  assert.match(sql, /push_resubscribe_required/i)
  assert.match(sql, /'event_key', 'round:' \|\| v_outbox\.round_id::TEXT\s*\|\| ':push_resubscribe_required'/i)
})

test('recovery reuses the enqueue window and expires stale events instead of sending them late', () => {
  const sql = readMigration()

  assert.match(sql, /quantum_private\.is_tonight_notification_retry_open/i)
  assert.match(sql, /round_row\.status NOT IN \('completed', 'cancelled'\)/i)
  assert.match(sql, /p_now < round_row\.deposit_due_at/i)
  assert.match(sql, /p_now < round_row\.partner_acceptance_due_at/i)
  assert.match(sql, /p_now <= round_row\.starts_at/i)
  assert.match(sql, /notification_window_expired/i)
  assert.match(sql, /'outcome', 'expired'/i)
})

test('new privileged RPCs are closed by default and granted only to authenticated callers', () => {
  const sql = readMigration()

  for (const signature of [
    String.raw`super_admin_list_tonight_notification_failures\(\s*UUID\s*,\s*TIMESTAMPTZ\s*,\s*UUID\s*,\s*INTEGER\s*\)`,
    String.raw`super_admin_retry_tonight_notification_failure\(\s*TEXT\s*,\s*UUID\s*,\s*INTEGER\s*,\s*TEXT\s*\)`,
  ]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]{0,80}FROM PUBLIC, anon, authenticated`, 'i'))
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}[\\s\\S]{0,80}TO authenticated`, 'i'))
  }
})
