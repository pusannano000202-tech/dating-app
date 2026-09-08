import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const migrationsDir = join(root, 'supabase', 'migrations')

function abaMigration(): string {
  const names = readdirSync(migrationsDir).filter((name) =>
    /^\d{14}_tonight_notification_revision_aba\.sql$/.test(name),
  )
  assert.equal(names.length, 1, 'expected one notification revision ABA migration')
  assert.ok(names[0].slice(0, 14) > '20260903043100')
  return readFileSync(join(migrationsDir, names[0]), 'utf8')
}

test('every ordinary notification and push update advances exactly one revision', () => {
  const sql = abaMigration()
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION quantum_private\.advance_tonight_notification_revision\(\)[\s\S]*?NEW\.revision = OLD\.revision[\s\S]*?NEW\.revision := OLD\.revision \+ 1[\s\S]*?NEW\.revision <> OLD\.revision \+ 1[\s\S]*?invalid_notification_revision_transition/i,
  )
  for (const [table, trigger] of [
    ['tonight_notification_outbox', 'tonight_notification_outbox_advance_revision'],
    ['tonight_push_deliveries', 'tonight_push_deliveries_advance_revision'],
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TRIGGER ${trigger}[\\s\\S]*?BEFORE UPDATE ON public\\.${table}[\\s\\S]*?FOR EACH ROW[\\s\\S]*?advance_tonight_notification_revision`, 'i'),
    )
  }
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION quantum_private\.advance_tonight_notification_revision\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  )
})

test('the trigger covers claim, completion, failure, batch, sibling cancellation, and terminal sweep updates', () => {
  const outbox = readFileSync(
    join(migrationsDir, '20260903012223_tonight_notification_outbox.sql'),
    'utf8',
  )
  const sweeper = readFileSync(
    join(migrationsDir, '20260903012500_tonight_terminal_worker_recovery.sql'),
    'utf8',
  )
  for (const fn of [
    'claim_tonight_notification_outbox',
    'complete_tonight_notification_outbox',
    'fail_tonight_notification_outbox',
    'complete_tonight_notification_outbox_batch',
    'fail_tonight_notification_outbox_batch',
    'claim_tonight_push_deliveries',
    'complete_tonight_push_delivery',
  ]) assert.match(outbox, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`, 'i'))
  assert.match(outbox, /UPDATE public\.tonight_push_deliveries AS delivery[\s\S]*?status = 'cancelled'/i)
  assert.match(sweeper, /UPDATE public\.tonight_notification_outbox AS outbox/i)
  assert.match(sweeper, /UPDATE public\.tonight_push_deliveries AS delivery/i)
})

test('claimed notification and push work returns an exact revision lease token', () => {
  const sql = readFileSync(
    join(migrationsDir, '20260903012223_tonight_notification_outbox.sql'),
    'utf8',
  )
  assert.match(sql, /claim_tonight_notification_outbox[\s\S]*?outbox_revision INTEGER[\s\S]*?SELECT claimed\.id, claimed\.revision/i)
  assert.match(sql, /claim_tonight_push_deliveries[\s\S]*?delivery_revision INTEGER[\s\S]*?SELECT claimed\.id, claimed\.revision/i)
  assert.match(sql, /WHERE outbox\.id = candidates\.id[\s\S]*?outbox\.revision = candidates\.revision/i)
  assert.match(sql, /WHERE delivery\.id = candidates\.id[\s\S]*?delivery\.revision = candidates\.revision/i)
})

test('stalled worker A cannot complete or fail after worker B reclaims the same row', () => {
  const sql = readFileSync(
    join(migrationsDir, '20260903012223_tonight_notification_outbox.sql'),
    'utf8',
  )
  for (const functionName of [
    'complete_tonight_notification_outbox',
    'fail_tonight_notification_outbox',
    'complete_tonight_notification_outbox_batch',
    'fail_tonight_notification_outbox_batch',
    'complete_tonight_push_delivery',
  ]) {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`)
    const end = sql.indexOf('$$;', sql.indexOf('AS $$', start))
    assert.ok(start >= 0 && end > start, `missing ${functionName}`)
    const body = sql.slice(start, end + 3)
    assert.match(body, /p_expected_revision(?:s)?/i)
    assert.match(body, /\.revision = (?:p_expected_revision|p_expected_revisions\[claim\.position\]|map\.expected_revision)/i)
    assert.match(body, /stale_(?:notification|push)_claim/i)
  }

  const route = readFileSync(
    join(root, 'app', 'api', 'internal', 'tonight', 'notifications', 'dispatch', 'route.ts'),
    'utf8',
  )
  assert.match(route, /outboxRevisions = outboxRows\.map\(\(row\) => row\.outbox_revision\)/)
  assert.ok((route.match(/p_expected_revisions: outboxRevisions/g) ?? []).length >= 2)
  assert.ok((route.match(/p_expected_revision: delivery\.delivery_revision/g) ?? []).length >= 2)
})

test('push sibling cancellation and terminal sweeping compare the locked revision snapshot', () => {
  const sql = readFileSync(
    join(migrationsDir, '20260903012223_tonight_notification_outbox.sql'),
    'utf8',
  )
  assert.match(
    sql,
    /WITH siblings AS MATERIALIZED \([\s\S]*?SELECT delivery\.id, delivery\.revision[\s\S]*?FOR UPDATE OF delivery[\s\S]*?delivery\.revision = siblings\.revision/i,
  )

  const sweeper = readFileSync(
    join(migrationsDir, '20260903012500_tonight_terminal_worker_recovery.sql'),
    'utf8',
  )
  assert.match(sweeper, /SELECT outbox\.id, outbox\.revision[\s\S]*?outbox\.revision = candidates\.revision/i)
  assert.match(sweeper, /SELECT delivery\.id, delivery\.revision[\s\S]*?delivery\.revision = candidates\.revision/i)
})

test('super-admin notification retry remains expected-revision CAS', () => {
  const recovery = readFileSync(
    join(migrationsDir, '20260903021152_tonight_notification_terminal_recovery.sql'),
    'utf8',
  )
  assert.match(recovery, /revision = outbox\.revision \+ 1[\s\S]*?outbox\.revision = p_expected_revision/i)
  assert.match(recovery, /revision = delivery\.revision \+ 1[\s\S]*?delivery\.revision = p_expected_revision/i)
})
