import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8')
}

function readFunction(sql: string, name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing public.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

const lifecycle = read('supabase/migrations/20260902201247_tonight_lifecycle_rpcs.sql')
const deadLetter = read('supabase/migrations/20260903000000_tonight_refund_dead_letter.sql')
const capacity = read('supabase/migrations/20260903000700_tonight_venue_activity_compatibility.sql')

test('the seven mutable idempotency keys are serialized before canonical replay', () => {
  const cases = [
    [lifecycle, 'super_admin_swap_tonight_friend_bundles', 'tonight-friend-bundle-swap-key:', "p_idempotency_key || ':team-a'"],
    [lifecycle, 'super_admin_adjust_tonight_appearance_score', 'tonight-appearance-adjust-key:', 'audit.idempotency_key = p_idempotency_key'],
    [lifecycle, 'super_admin_set_tonight_attendance', 'tonight-attendance-set-key:', 'audit.idempotency_key = p_idempotency_key'],
    [lifecycle, 'service_finalize_tonight_refund_request', 'tonight-refund-finalize-key:', 'request.finalize_idempotency_key = p_idempotency_key'],
    [lifecycle, 'super_admin_retry_tonight_refund', 'tonight-refund-retry-key:', 'audit.idempotency_key = p_idempotency_key'],
    [deadLetter, 'service_dead_letter_tonight_refund_request', 'tonight-refund-dead-letter-key:', 'audit.idempotency_key = pg_catalog.btrim(p_idempotency_key)'],
    [capacity, 'partner_set_tonight_capacity', 'tonight-capacity-set-key:', 'audit.idempotency_key = p_idempotency_key'],
  ] as const

  for (const [sql, name, prefix, replayToken] of cases) {
    const fn = readFunction(sql, name)
    const lock = fn.indexOf(`'${prefix}' ||`)
    const replay = fn.indexOf(replayToken)
    assert.ok(lock >= 0, `${name} must lock its idempotency key`)
    assert.ok(replay > lock, `${name} must replay only after key serialization`)
  }
})

test('operator replays bind actor, target, optimistic revision, and mutation payload', () => {
  const swap = readFunction(lifecycle, 'super_admin_swap_tonight_friend_bundles')
  assert.match(swap, /v_has_audit_a[\s\S]*?v_has_audit_b[\s\S]*?idempotency_conflict/i)
  for (const token of [
    'p_team_a_id', 'p_team_b_id', 'p_bundle_a_id', 'p_bundle_b_id',
    'p_expected_team_a_revision', 'p_expected_team_b_revision', 'v_caller',
  ]) assert.match(swap, new RegExp(token, 'i'))

  const appearance = readFunction(lifecycle, 'super_admin_adjust_tonight_appearance_score')
  assert.match(appearance, /audit_row\.entity_id <> p_application_id/i)
  assert.match(appearance, /audit_row\.actor_user_id IS DISTINCT FROM v_caller/i)
  assert.match(appearance, /audit_row\.before_state ->> 'revision'[\s\S]*?p_expected_revision/i)
  assert.match(appearance, /audit_row\.after_state ->> 'appearance_score'[\s\S]*?p_appearance_score/i)

  const attendance = readFunction(lifecycle, 'super_admin_set_tonight_attendance')
  assert.match(attendance, /audit_row\.actor_user_id IS DISTINCT FROM v_caller/i)
  assert.match(attendance, /audit_row\.before_state ->> 'revision'[\s\S]*?p_expected_revision/i)
  assert.match(attendance, /audit_row\.after_state ->> 'team_id'[\s\S]*?p_team_id/i)
  assert.match(attendance, /audit_row\.after_state ->> 'user_id'[\s\S]*?p_user_id/i)
  assert.match(attendance, /audit_row\.after_state ->> 'status'[\s\S]*?p_status/i)

  const retry = readFunction(lifecycle, 'super_admin_retry_tonight_refund')
  assert.match(retry, /audit_row\.actor_user_id IS DISTINCT FROM v_caller/i)
  assert.match(retry, /audit_row\.before_state ->> 'revision'[\s\S]*?p_expected_revision/i)
  assert.match(retry, /audit_row\.after_state ->> 'revision'[\s\S]*?p_expected_revision \+ 1/i)
})

test('service refund replays bind lease, revision, evidence, and terminal error payloads', () => {
  const finalize = readFunction(lifecycle, 'service_finalize_tonight_refund_request')
  assert.match(finalize, /audit_row\.before_state ->> 'settlement_lease_id'[\s\S]*?p_lease_id::TEXT/i)
  assert.match(finalize, /audit_row\.before_state ->> 'revision'[\s\S]*?p_expected_revision/i)
  assert.match(finalize, /request_row\.provider_order_id[\s\S]*?p_provider_order_id/i)
  assert.match(finalize, /request_row\.provider_payment_key_hash[\s\S]*?p_provider_payment_key_hash/i)
  assert.match(finalize, /request_row\.provider_refund_transaction_key[\s\S]*?p_provider_refund_transaction_key/i)
  assert.match(finalize, /request_row\.refunded_amount <> p_refunded_amount/i)

  const terminal = readFunction(deadLetter, 'service_dead_letter_tonight_refund_request')
  assert.match(terminal, /v_existing\.before_state ->> 'settlement_lease_id'[\s\S]*?p_lease_id::TEXT/i)
  assert.match(terminal, /v_existing\.before_state ->> 'revision'[\s\S]*?p_expected_revision/i)
  assert.match(terminal, /v_existing\.after_state ->> 'error'[\s\S]*?p_error/i)
  assert.match(terminal, /'settlement_lease_id', v_request\.settlement_lease_id/i)
})

test('capacity replay is audit-canonical and binds the complete partner request', () => {
  const fn = readFunction(capacity, 'partner_set_tonight_capacity')
  assert.match(fn, /audit_row\.entity_type|audit\.entity_type = 'venue_capacity'/i)
  assert.match(fn, /audit_row\.actor_user_id IS DISTINCT FROM v_caller/i)
  for (const field of [
    'round_id', 'activity_id', 'venue_snapshot_id', 'venue_id',
    'team_capacity', 'venue_category', 'expected_revision',
  ]) {
    assert.match(fn, new RegExp(`after_state ->> '${field}'`, 'i'), field)
  }
  assert.match(fn, /RETURN audit_row\.entity_id/i)
})
