import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

test('every terminal-attempt worker invokes the shared stale-claim sweep', () => {
  for (const route of [
    'app/api/internal/tonight/deposits/finalize/route.ts',
    'app/api/internal/tonight/deposits/reconcile/route.ts',
    'app/api/internal/tonight/refunds/process/route.ts',
    'app/api/internal/tonight/settlements/process/route.ts',
    'app/api/internal/tonight/notifications/dispatch/route.ts',
  ]) {
    assert.match(source(route), /service_sweep_tonight_terminal_worker_claims/)
  }
})

test('financial health is read-only for operators and recovery is recent super-admin only', () => {
  const healthRoute = source('app/api/admin/tonight/financial-health/route.ts')
  const retryRoute = source('app/api/admin/super-admin/tonight/financial-jobs/retry/route.ts')

  assert.match(healthRoute, /allowedRoles: \['admin', 'super_admin'\]/)
  assert.match(healthRoute, /assertStrictSearchParams\(request, \['round_id', 'limit', 'cursor'\]\)/)
  assert.match(healthRoute, /admin_get_tonight_financial_worker_health/)
  assert.match(healthRoute, /p_before_updated_at: cursor\?\.updatedAt \?\? null/)
  assert.match(healthRoute, /p_before_job_kind: cursor\?\.jobKind \?\? null/)
  assert.match(healthRoute, /p_before_job_id: cursor\?\.jobId \?\? null/)
  assert.match(healthRoute, /p_limit: limit/)
  assert.match(healthRoute, /next_cursor/)
  assert.doesNotMatch(healthRoute, /POST|readStrictJson/)

  assert.match(retryRoute, /allowedRoles: \['super_admin'\]/)
  assert.match(retryRoute, /requireRecentAuth: true/)
  assert.match(retryRoute, /readStrictJson\(request, \['jobKind', 'jobId', 'expectedRevision', 'idempotencyKey'\]\)/)
  assert.match(retryRoute, /super_admin_retry_tonight_financial_job/)
  assert.doesNotMatch(retryRoute, /reason|notes/)
})

test('financial cursor retains PostgreSQL microseconds and all three stable key parts', () => {
  const healthRoute = source('app/api/admin/tonight/financial-health/route.ts')
  const cursor = {
    updatedAt: '2026-09-03T18:50:00.123456+09:00',
    jobKind: 'settlement',
    jobId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  }
  const encoded = Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
  const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as typeof cursor

  assert.deepEqual(decoded, cursor)
  assert.match(healthRoute, /TIMESTAMPTZ_PATTERN/)
  assert.match(healthRoute, /updatedAt: row\.updatedAt/)
  assert.doesNotMatch(healthRoute, /new Date\(row\.updatedAt\)\.toISOString\(\)/)
})

test('stable financial keyset pages 51 plus same-timestamp jobs without skip or duplicate', () => {
  type Row = { updatedAt: string; jobKind: 'deposit_disposition' | 'settlement'; jobId: string }
  const timestamp = '2026-09-03T18:50:00.123456+09:00'
  const rows: Row[] = Array.from({ length: 123 }, (_, index) => ({
    updatedAt: timestamp,
    jobKind: index % 2 === 0 ? 'settlement' : 'deposit_disposition',
    jobId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  }))
  const compareDesc = (left: Row, right: Row) => {
    for (const key of ['updatedAt', 'jobKind', 'jobId'] as const) {
      const compared = right[key].localeCompare(left[key])
      if (compared !== 0) return compared
    }
    return 0
  }
  const ordered = [...rows].sort(compareDesc)
  const seen: Row[] = []
  let cursor: Row | null = null

  while (true) {
    const eligible = ordered.filter((row) => cursor === null || compareDesc(cursor, row) < 0)
    const pagePlusOne = eligible.slice(0, 51)
    const page = pagePlusOne.slice(0, 50)
    seen.push(...page)
    if (pagePlusOne.length <= 50) break
    cursor = page.at(-1) ?? null
  }

  assert.equal(seen.length, rows.length)
  assert.equal(new Set(seen.map((row) => `${row.updatedAt}:${row.jobKind}:${row.jobId}`)).size, rows.length)
})

test('both consoles show financial queue health while only super-admin can retry', () => {
  const types = source('components/tonight/types.ts')
  const adapter = source('components/tonight/live-adapters.ts')
  const admin = source('components/tonight/AdminTonightConsole.tsx')
  const superAdmin = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(types, /FinancialQueueHealth/)
  assert.match(types, /retryFinancialJob/)
  assert.match(adapter, /\/api\/admin\/tonight\/financial-health\?round_id=/)
  assert.match(adapter, /\/api\/admin\/super-admin\/tonight\/financial-jobs\/retry/)
  assert.match(admin, /금융 작업 대기열/)
  assert.match(admin, /운영자는 조회만 가능/)
  assert.doesNotMatch(admin, /금융 작업 재시도/)
  assert.match(superAdmin, /금융 작업 재시도/)
})

test('both consoles can traverse every bounded financial dead-letter page', () => {
  const types = source('components/tonight/types.ts')
  const adapter = source('components/tonight/live-adapters.ts')
  const fixture = source('components/tonight/rehearsal-fixtures.ts')
  const operator = source('components/tonight/AdminTonightConsole.tsx')
  const superAdmin = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(types, /FinancialJobPage/)
  assert.match(types, /financialJobPage/)
  assert.match(types, /financialCursor\?: string \| null/)
  assert.match(adapter, /currentFinancialCursor/)
  assert.match(adapter, /cursor=\$\{encodeURIComponent\(currentFinancialCursor\)\}/)
  assert.match(adapter, /nextCursor: nullableString\(financialPayload\.next_cursor\)/)
  assert.match(fixture, /financialJobPage/)
  assert.match(operator, /이전 50건/)
  assert.match(operator, /다음 50건/)
  assert.match(superAdmin, /financialJobBackStack/)
  assert.match(superAdmin, /financialCursor:/)
})

test('super-admin can page and recover PII-free terminal notification failures', () => {
  const types = source('components/tonight/types.ts')
  const adapter = source('components/tonight/live-adapters.ts')
  const fixture = source('components/tonight/rehearsal-fixtures.ts')
  const operator = source('components/tonight/AdminTonightConsole.tsx')
  const superAdmin = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(types, /NotificationFailureView/)
  assert.match(types, /notificationFailurePage/)
  assert.match(types, /retryNotificationFailure/)
  assert.match(adapter, /\/api\/admin\/super-admin\/tonight\/notifications\/failures/)
  assert.match(adapter, /\/api\/admin\/super-admin\/tonight\/notifications\/retry/)
  assert.match(adapter, /notificationFailureCursor/)
  assert.match(fixture, /resubscribeRequired/)
  assert.match(superAdmin, /알림 전송 실패/)
  assert.match(superAdmin, /재구독 안내/)
  assert.match(superAdmin, /알림 실패 재처리/)
  assert.match(superAdmin, /이전 50건/)
  assert.match(superAdmin, /다음 50건/)
  assert.doesNotMatch(operator, /알림 실패 재처리/)
})
