import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

function migration(): string {
  const names = readdirSync(MIGRATIONS).filter((name) => (
    /^\d{14}_venue_partner_revision_aba\.sql$/.test(name)
  ))
  assert.equal(names.length, 1, 'expected one venue-partner revision ABA migration')
  assert.ok(names[0].slice(0, 14) > '20260903054620')
  return readFileSync(join(MIGRATIONS, names[0]), 'utf8')
}

function readFunction(sql: string, schema: 'public' | 'quantum_private', name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing ${schema}.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for ${schema}.${name}`)
  assert.notEqual(end, -1, `missing end for ${schema}.${name}`)
  return sql.slice(start, end + 3)
}

test('venue-partner revision high-water survives inactive membership tombstones', () => {
  const sql = migration()

  assert.match(
    sql,
    /CREATE TABLE quantum_private\.venue_partner_membership_revision_states\s*\([\s\S]*?user_id UUID NOT NULL[\s\S]*?venue_id UUID NOT NULL[\s\S]*?revision INTEGER NOT NULL[\s\S]*?is_active BOOLEAN NOT NULL[\s\S]*?active_membership_id UUID[\s\S]*?last_role TEXT[\s\S]*?PRIMARY KEY \(user_id, venue_id\)/i,
  )
  assert.match(sql, /CHECK \(revision >= 0\)/i)
  assert.match(sql, /ALTER TABLE quantum_private\.venue_partner_membership_revision_states\s+ENABLE ROW LEVEL SECURITY/i)
  assert.match(
    sql,
    /REVOKE ALL ON TABLE quantum_private\.venue_partner_membership_revision_states[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /INSERT INTO quantum_private\.venue_partner_membership_revision_states[\s\S]*?SUM\(membership\.revision\)[\s\S]*?FROM public\.venue_partner_memberships AS membership[\s\S]*?GROUP BY membership\.user_id, membership\.venue_id/i,
    'backfill must retain every prior grant/revoke generation instead of resetting to the latest row revision',
  )
  assert.match(sql, /bool_or\(membership\.revoked_at IS NULL\)[\s\S]*?array_agg\([\s\S]*?membership\.id/i)
})

test('exact target-state lookup returns zero for never granted and tombstone high-water for revoked', () => {
  const sql = migration()
  const stateFn = readFunction(sql, 'public', 'super_admin_get_venue_partner_membership_state')

  assert.match(stateFn, /RETURNS TABLE\s*\([\s\S]*?membership_id UUID[\s\S]*?user_id UUID[\s\S]*?venue_id UUID[\s\S]*?revision INTEGER[\s\S]*?is_active BOOLEAN/i)
  assert.match(stateFn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(stateFn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(stateFn, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(stateFn, /quantum_private\.venue_partner_membership_revision_states/i)
  assert.match(stateFn, /COALESCE\(state\.revision,\s*0\)/i)
  assert.match(stateFn, /COALESCE\(state\.is_active,\s*FALSE\)/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.super_admin_get_venue_partner_membership_state\(UUID, UUID\)[\s\S]*?PUBLIC, anon, authenticated, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.super_admin_get_venue_partner_membership_state\(UUID, UUID\)[\s\S]*?TO authenticated/i,
  )
})

test('grant serializes state and CASes the durable tombstone before a monotonic regrant', () => {
  const sql = migration()
  const grantFn = readFunction(sql, 'public', 'grant_venue_partner_membership')

  assert.match(grantFn, /pg_catalog\.pg_advisory_xact_lock[\s\S]*?'venue-partner-venue:' \|\| p_venue_id::TEXT/i)
  assert.match(grantFn, /venue_partner_membership_events[\s\S]*?event\.actor_id = v_caller[\s\S]*?event\.idempotency_key = pg_catalog\.btrim\(p_idempotency_key\)/i)
  assert.match(grantFn, /INSERT INTO quantum_private\.venue_partner_membership_revision_states[\s\S]*?ON CONFLICT \(user_id, venue_id\) DO NOTHING/i)
  assert.match(
    grantFn,
    /FROM quantum_private\.venue_partner_membership_revision_states AS state[\s\S]*?state\.user_id = p_user_id[\s\S]*?state\.venue_id = p_venue_id[\s\S]*?FOR UPDATE/i,
  )
  assert.match(grantFn, /state_row\.revision <> p_expected_revision[\s\S]*?venue_partner_membership_revision_conflict/i)
  assert.match(grantFn, /v_result_revision := state_row\.revision \+ 1/i)
  assert.match(grantFn, /INSERT INTO public\.venue_partner_memberships[\s\S]*?v_result_revision/i)
  assert.match(
    grantFn,
    /UPDATE quantum_private\.venue_partner_membership_revision_states[\s\S]*?revision = v_result_revision[\s\S]*?is_active = TRUE[\s\S]*?revision = p_expected_revision[\s\S]*?is_active = FALSE/i,
  )
  assert.doesNotMatch(grantFn, /IF p_expected_revision <> 0/i)
})

test('revoke advances the same state row so stale revoke cannot cross a regrant incarnation', () => {
  const sql = migration()
  const revokeFn = readFunction(sql, 'public', 'revoke_venue_partner_membership')

  assert.match(revokeFn, /pg_catalog\.pg_advisory_xact_lock[\s\S]*?'venue-partner-venue:' \|\| v_membership_venue_id::TEXT/i)
  assert.match(
    revokeFn,
    /FROM quantum_private\.venue_partner_membership_revision_states AS state[\s\S]*?state\.user_id = membership\.user_id[\s\S]*?state\.venue_id = membership\.venue_id[\s\S]*?FOR UPDATE/i,
  )
  assert.match(revokeFn, /state_row\.revision <> p_expected_revision/i)
  assert.match(revokeFn, /state_row\.active_membership_id IS DISTINCT FROM membership\.id/i)
  assert.match(revokeFn, /venue_has_live_tonight_obligations\(membership\.venue_id\)/i)
  assert.match(revokeFn, /v_result_revision := state_row\.revision \+ 1/i)
  assert.match(
    revokeFn,
    /UPDATE quantum_private\.venue_partner_membership_revision_states[\s\S]*?revision = v_result_revision[\s\S]*?is_active = FALSE[\s\S]*?active_membership_id = NULL[\s\S]*?revision = p_expected_revision[\s\S]*?active_membership_id = membership\.id/i,
  )
})

test('active directory rows expose the durable revision used by revoke CAS', () => {
  const sql = migration()
  const pageFn = readFunction(sql, 'public', 'super_admin_list_venue_partner_memberships_page')
  const detailFn = readFunction(sql, 'public', 'super_admin_get_venue_partner_membership')

  for (const reader of [pageFn, detailFn]) {
    assert.match(reader, /LEFT JOIN quantum_private\.venue_partner_membership_revision_states AS state/i)
    assert.match(
      reader,
      /CASE[\s\S]*?state\.is_active[\s\S]*?state\.active_membership_id = membership\.id[\s\S]*?THEN state\.revision[\s\S]*?ELSE membership\.revision[\s\S]*?END/i,
    )
  }
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.super_admin_get_venue_partner_membership\(UUID\)[\s\S]*?PUBLIC, anon, authenticated, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.super_admin_get_venue_partner_membership\(UUID\)[\s\S]*?TO authenticated/i,
  )
})
