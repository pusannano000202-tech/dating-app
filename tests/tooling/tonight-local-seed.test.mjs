import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FIXED_CONTAINER_NAME,
  buildAccountSpecs,
  buildBootstrapSql,
  buildRoundRpcArgs,
  buildRoundWindow,
  parseRuntimeEnv,
  summarizeSeedError,
} from '../../scripts/qa/tonight-local-seed.mjs'

const LOCAL_RUNTIME = {
  schema_version: 1,
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56321/',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-publishable-key',
  SUPABASE_SECRET_KEY: 'local-secret-key',
  LOCAL_SUPABASE_DB_CONTAINER: 'supabase_db_quantum-tonight-live-local',
  LOCAL_SUPABASE_DB_NAME: 'postgres',
  LOCAL_SUPABASE_DB_USER: 'postgres',
}

test('parseRuntimeEnv accepts only the exact local database target', () => {
  const parsed = parseRuntimeEnv(LOCAL_RUNTIME)

  assert.equal(parsed.url.href, 'http://127.0.0.1:56321/')
  assert.equal(parsed.publicKey, 'local-publishable-key')
  assert.equal(parsed.adminKey, 'local-secret-key')
  assert.equal(parsed.container, FIXED_CONTAINER_NAME)
  assert.equal(parsed.database, 'postgres')
  assert.equal(parsed.databaseUser, 'postgres')
})

test('parseRuntimeEnv refuses remote URLs before accepting credentials', () => {
  assert.throws(
    () => parseRuntimeEnv({
      ...LOCAL_RUNTIME,
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co/',
    }),
    /local_supabase_url_invalid/,
  )
})

test('parseRuntimeEnv refuses a different docker database target', () => {
  assert.throws(
    () => parseRuntimeEnv({
      ...LOCAL_RUNTIME,
      LOCAL_SUPABASE_DB_CONTAINER: 'supabase_db_other-project',
    }),
    /local_database_target_invalid/,
  )
})

test('parseRuntimeEnv refuses every loopback alias or port except the dedicated stack origin', () => {
  for (const url of [
    'http://127.0.0.1:54321/',
    'http://localhost:56321/',
    'http://[::1]:56321/',
  ]) {
    assert.throws(
      () => parseRuntimeEnv({ ...LOCAL_RUNTIME, NEXT_PUBLIC_SUPABASE_URL: url }),
      /local_supabase_target_invalid/,
    )
  }
})

test('summarizeSeedError keeps a bounded cause while redacting credentials', () => {
  const passwordValue = ['secret', '123'].join('')
  const rawSecret = `${['sb', 'secret'].join('_')}_abcdefghijklmnop`
  const summary = summarizeSeedError({
    code: 'local_seed_round_create_failed',
    detail: `42883 missing function password=${passwordValue} ${rawSecret}`,
  })

  assert.match(summary, /^code=local_seed_round_create_failed detail=/)
  assert.match(summary, /42883 missing function/)
  assert.equal(summary.includes(passwordValue), false)
  assert.equal(summary.includes(rawSecret), false)
})

test('buildAccountSpecs creates four live roles and five applicant-capable users', () => {
  const accounts = buildAccountSpecs()
  const labels = accounts.map((account) => account.label)
  const applicantAccounts = accounts.filter((account) => account.applicant)

  assert.deepEqual(labels.slice(0, 4), ['super-admin', 'admin', 'partner', 'user'])
  assert.equal(accounts.length, 8)
  assert.equal(applicantAccounts.length, 5)
  assert.equal(new Set(accounts.map((account) => account.email)).size, accounts.length)
  assert.ok(accounts.every((account) => account.email.endsWith('@example.invalid')))
})

test('buildBootstrapSql never inserts auth users or financial rows', () => {
  const accounts = buildAccountSpecs().map((account, index) => ({
    ...account,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  }))
  const sql = buildBootstrapSql({ accounts })

  assert.doesNotMatch(sql, /insert\s+into\s+auth\.users/i)
  assert.doesNotMatch(sql, /tonight_(deposits|deposit_refund_requests|settlements)/i)
  assert.match(sql, /tonight_local_seed_profile_conflict/)
  assert.match(sql, /tonight_local_seed_score_conflict/)
  assert.match(sql, /attempt_count = 1/)
  assert.match(sql, /lease_expires_at IS NULL/)
  assert.match(sql, /score_override IS NULL/)
  assert.match(sql, /tonight_local_seed_super_admin_conflict/)
  assert.match(sql, /tonight_local_seed_venue_conflict/)
  assert.match(sql, /vibe_tags = ARRAY\[\]::TEXT\[\]/)
  assert.match(sql, /has_alcohol = FALSE/)
  assert.match(sql, /checkin_radius_m = 50/)
  assert.match(sql, /tonight_local_seed_venue_snapshot_conflict/)
  assert.match(sql, /venue_category = 'restaurant'/)
  assert.match(sql, /naver_link_kind = 'search'/)
  assert.match(sql, /kakao_link_kind = 'search'/)
  assert.match(sql, /quantum_private\.bootstrap_initial_super_admin/)
})

test('buildRoundWindow keeps the supplied instant inside a deterministic open round', () => {
  const now = new Date('2026-09-05T03:04:05.000Z')
  const window = buildRoundWindow(now)

  assert.equal(window.serviceDate, '2026-09-06')
  assert.equal(window.signupOpenAt, '2026-09-04T15:00:00.000Z')
  assert.equal(window.signupCloseAt, '2026-09-06T09:30:00.000Z')
  assert.ok(new Date(window.signupOpenAt) < now)
  assert.ok(now < new Date(window.signupCloseAt))
  assert.ok(new Date(window.signupCloseAt) <= new Date(window.capacityLockAt))
  assert.ok(new Date(window.arrivalAt) < new Date(window.startsAt))
})

test('buildRoundRpcArgs includes the current venue-category compatibility contract', () => {
  const args = buildRoundRpcArgs(buildRoundWindow(new Date('2026-09-05T03:04:05.000Z')))

  assert.deepEqual(args.p_activity_allowed_venue_categories, [
    ['activity'],
    ['public-meeting-point'],
    ['restaurant'],
  ])
  assert.equal(args.p_activity_titles.length, 3)
  assert.equal(args.p_activity_allowed_venue_categories.length, args.p_activity_titles.length)
})
