import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260903103000_tonight_arrival_help.sql',
), 'utf8')

function readFunction(schema: 'public' | 'quantum_private', name: string): string {
  const start = migration.search(new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing ${schema}.${name}`)
  const bodyStart = migration.indexOf('AS $$', start)
  const end = migration.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for ${schema}.${name}`)
  assert.notEqual(end, -1, `missing end for ${schema}.${name}`)
  return migration.slice(start, end + 3)
}

test('arrival help is durable, private by default, and permits only one active request per member', () => {
  assert.match(migration, /CREATE TABLE public\.tonight_arrival_help_requests/i)
  assert.match(migration, /category TEXT NOT NULL CHECK \(category IN \(\s*'entrance', 'team', 'venue'\s*\)\)/i)
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'requested' CHECK \(status IN \(\s*'requested', 'acknowledged', 'escalated', 'resolved', 'cancelled'\s*\)\)/i)
  assert.match(migration, /CREATE UNIQUE INDEX tonight_arrival_help_one_active_per_member[\s\S]*?WHERE status IN \('requested', 'acknowledged', 'escalated'\)/i)
  assert.match(migration, /ALTER TABLE public\.tonight_arrival_help_requests ENABLE ROW LEVEL SECURITY/i)
  assert.match(migration, /REVOKE ALL ON TABLE public\.tonight_arrival_help_requests[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(migration, /GRANT SELECT ON TABLE public\.tonight_arrival_help_requests TO service_role/i)
})

test('user request proves current team membership and the revealed arrival window', () => {
  const fn = readFunction('public', 'request_my_tonight_arrival_help')
  assert.match(fn, /v_caller UUID := auth\.uid\(\)/i)
  assert.match(fn, /FROM public\.tonight_team_members AS member[\s\S]*?member\.team_id = p_team_id[\s\S]*?member\.user_id = v_caller/i)
  assert.match(fn, /JOIN public\.tonight_rounds AS round_row[\s\S]*?CURRENT_TIMESTAMP >= round_row\.reveal_at[\s\S]*?CURRENT_TIMESTAMP < round_row\.starts_at \+ INTERVAL '2 hours'/i)
  assert.match(fn, /team\.status IN \('revealed', 'in_progress'\)/i)
  assert.match(fn, /ON CONFLICT \(team_id, requested_by\)[\s\S]*?WHERE status IN \('requested', 'acknowledged', 'escalated'\)[\s\S]*?DO UPDATE/i)
  assert.match(fn, /quantum_private\.write_tonight_audit/i)
  assert.doesNotMatch(fn, /phone|email|display_name/i)
})

test('user read is caller scoped and never returns participant contact data', () => {
  const fn = readFunction('public', 'get_my_tonight_arrival_help')
  assert.match(fn, /request\.requested_by = v_caller/i)
  assert.match(fn, /member\.user_id = v_caller/i)
  assert.doesNotMatch(fn, /phone|email|display_name/i)
})

test('user can cancel only the callers own active request with revision and idempotency', () => {
  const fn = readFunction('public', 'cancel_my_tonight_arrival_help')
  assert.match(fn, /request\.requested_by = v_caller/i)
  assert.match(fn, /request\.status IN \('requested', 'acknowledged', 'escalated'\)/i)
  assert.match(fn, /FOR UPDATE OF request/i)
  assert.match(fn, /v_request\.revision <> p_expected_revision[\s\S]*?stale_revision/i)
  assert.match(fn, /status = 'cancelled'/i)
  assert.match(fn, /quantum_private\.write_tonight_audit/i)
  assert.doesNotMatch(fn, /phone|email|display_name|p_reason|p_notes/i)
})

test('partner queue and mutations are restricted to the callers exact active venue', () => {
  const list = readFunction('public', 'partner_get_tonight_arrival_help_queue')
  const update = readFunction('public', 'partner_update_tonight_arrival_help')

  for (const fn of [list, update]) {
    assert.match(fn, /public\.venue_partner_memberships/i)
    assert.match(fn, /membership\.user_id = v_caller/i)
    assert.match(fn, /membership\.venue_id = capacity\.venue_id/i)
    assert.match(fn, /membership\.revoked_at IS NULL/i)
    assert.doesNotMatch(fn, /phone|email|display_name/i)
  }
  assert.match(list, /request\.status IN \('requested', 'acknowledged', 'escalated'\)/i)
  assert.match(list, /LIMIT 100/i)
  assert.match(update, /p_expected_revision/i)
  assert.match(update, /FOR UPDATE/i)
  assert.match(update, /status = CASE p_action[\s\S]*?'acknowledge'[\s\S]*?'resolve'[\s\S]*?'escalate'/i)
  assert.match(update, /quantum_private\.write_tonight_audit/i)
})

test('daily operators can see and progress help without manual reasons or contact leakage', () => {
  const list = readFunction('public', 'admin_get_tonight_arrival_help_queue')
  const update = readFunction('public', 'admin_update_tonight_arrival_help')

  for (const fn of [list, update]) {
    assert.match(fn, /public\.is_admin\(v_caller\)/i)
    assert.doesNotMatch(fn, /phone|email|p_reason|p_notes|JOIN public\.(?:users|profiles)/i)
  }
  assert.match(list, /request\.status IN \('requested', 'acknowledged', 'escalated'\)/i)
  assert.match(list, /LIMIT 100/i)
  assert.match(update, /p_expected_revision/i)
  assert.match(update, /FOR UPDATE/i)
  assert.match(update, /quantum_private\.write_tonight_audit/i)
})

test('all arrival-help RPCs are authenticated-only and direct table access stays closed', () => {
  for (const signature of [
    'request_my_tonight_arrival_help(UUID, TEXT, TEXT)',
    'get_my_tonight_arrival_help(UUID)',
    'cancel_my_tonight_arrival_help(UUID, INTEGER, TEXT)',
    'partner_get_tonight_arrival_help_queue(UUID, UUID)',
    'partner_update_tonight_arrival_help(UUID, UUID, TEXT, INTEGER, TEXT)',
    'admin_get_tonight_arrival_help_queue(UUID)',
    'admin_update_tonight_arrival_help(UUID, TEXT, INTEGER, TEXT)',
  ]) {
    const escaped = signature.replace(/[()]/g, '\\$&')
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped} FROM PUBLIC, anon, authenticated, service_role`, 'i'))
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO authenticated`, 'i'))
  }
})
