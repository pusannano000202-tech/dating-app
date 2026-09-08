import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationPath = 'supabase/migrations/20260903035000_tonight_authoritative_activation_gate.sql'

function readFunction(sql: string, qualifiedName: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION ${escapeRegex(qualifiedName)}\\b`, 'i'))
  assert.notEqual(start, -1, `missing function ${qualifiedName}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for ${qualifiedName}`)
  assert.notEqual(end, -1, `missing end for ${qualifiedName}`)
  return sql.slice(start, end + 3)
}

test('authoritative Tonight application gate is seeded fail closed', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  assert.match(
    sql,
    /INSERT INTO public\.app_config\s*\(key, value\)[\s\S]*?'tonight_applications_open'[\s\S]*?to_jsonb\(FALSE\)[\s\S]*?ON CONFLICT \(key\) DO NOTHING/i,
  )
})

test('application submit keeps its six-argument public contract and locks before checking the database gate', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  const fn = readFunction(sql, 'public.submit_tonight_application')
  const signature = fn.slice(0, fn.indexOf('RETURNS TABLE'))

  assert.match(
    signature,
    /p_round_id UUID,[\s\S]*?p_ranked_activity_ids UUID\[\],[\s\S]*?p_matching_consent_accepted BOOLEAN,[\s\S]*?p_matching_consent_version TEXT,[\s\S]*?p_friend_invite_code TEXT DEFAULT NULL,[\s\S]*?p_idempotency_key TEXT DEFAULT NULL/i,
  )
  assert.equal(signature.match(/^\s{2}p_[a-z0-9_]+\s+/gim)?.length, 6)
  assert.match(fn, /RETURNS TABLE\s*\(\s*application_id UUID,\s*bundle_id UUID,\s*friend_invite_code TEXT\s*\)/i)
  assert.match(fn, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i)

  const roundLock = fn.indexOf('FOR SHARE;')
  const gateLookup = fn.indexOf("config.key = 'tonight_applications_open'")
  const gateError = fn.indexOf("RAISE EXCEPTION 'tonight_applications_closed'")
  const idempotencyLookup = fn.indexOf('INTO v_existing')
  assert.ok(roundLock >= 0 && roundLock < gateLookup)
  assert.ok(gateLookup < gateError)
  assert.ok(gateError < idempotencyLookup)

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.submit_tonight_application\(UUID, UUID\[\], BOOLEAN, TEXT, TEXT, TEXT\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.submit_tonight_application\(UUID, UUID\[\], BOOLEAN, TEXT, TEXT, TEXT\)\s+TO authenticated/i,
  )
})

test('concurrent application retries serialize idempotency and round-user ownership before canonical replay', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  const fn = readFunction(sql, 'public.submit_tonight_application')

  const idempotencyLock = fn.indexOf("'tonight-application-idempotency:' || p_idempotency_key")
  const roundUserLock = fn.indexOf(
    "'tonight-application-user:' || p_round_id::TEXT || ':' || v_caller::TEXT",
  )
  const idempotencyLookup = fn.indexOf('WHERE application_row.submission_idempotency_key = p_idempotency_key')
  const bundleLock = fn.indexOf("'tonight-bundle:' || p_round_id::TEXT")

  assert.ok(idempotencyLock >= 0, 'submission idempotency key must have a transaction lock')
  assert.ok(roundUserLock > idempotencyLock, 'round-user ownership must serialize after idempotency')
  assert.ok(idempotencyLookup > roundUserLock, 'canonical replay lookup must happen after both locks')
  assert.ok(bundleLock > idempotencyLookup, 'bundle mutation lock must remain after replay resolution')

  assert.match(
    fn,
    /WHERE application_row\.submission_idempotency_key = p_idempotency_key[\s\S]*?v_existing\.user_id <> v_caller[\s\S]*?v_existing\.round_id <> p_round_id[\s\S]*?v_existing\.matching_consent_version <> p_matching_consent_version[\s\S]*?choice\.activity_id <> p_ranked_activity_ids\[choice\.rank\][\s\S]*?RETURN QUERY SELECT v_existing\.id, v_existing\.bundle_id, v_invite_code;[\s\S]*?RETURN;/i,
  )
  assert.match(
    fn,
    /SELECT \*[\s\S]*?INTO v_existing[\s\S]*?FROM public\.tonight_applications AS application_row[\s\S]*?WHERE application_row\.round_id = p_round_id[\s\S]*?AND application_row\.user_id = v_caller[\s\S]*?IF FOUND THEN[\s\S]*?RAISE EXCEPTION 'idempotency_conflict'/i,
  )
})

test('application submission holds the active market membership against concurrent revoke', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  const fn = readFunction(sql, 'public.submit_tonight_application')
  const membershipLookup = fn.indexOf('FROM public.tonight_market_memberships AS membership')
  const membershipLock = fn.indexOf('FOR SHARE;', membershipLookup)
  const applicationInsert = fn.indexOf('INSERT INTO public.tonight_applications')

  assert.ok(membershipLookup >= 0, 'submit must re-read the exact membership row')
  assert.ok(membershipLock > membershipLookup, 'active membership must be share-locked')
  assert.ok(applicationInsert > membershipLock, 'membership lock must be held through application insert')
  assert.match(
    fn.slice(membershipLookup, membershipLock + 'FOR SHARE;'.length),
    /membership\.market_code = v_round\.market_code[\s\S]*?membership\.user_id = v_caller[\s\S]*?membership\.revoked_at IS NULL[\s\S]*?FOR SHARE;/i,
  )
})

test('only a recently authenticated super-admin can change either boolean application gate', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  const fn = readFunction(sql, 'public.set_app_config')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(fn, /p_key NOT IN \('match_requires_approval', 'tonight_applications_open'\)/i)
  assert.match(fn, /pg_catalog\.jsonb_typeof\(p_value\) <> 'boolean'/i)
  assert.match(fn, /app\.bypass_app_config_guard/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.set_app_config\(TEXT, JSONB\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.set_app_config\(TEXT, JSONB\) TO authenticated/i)
})

test('deployment can remotely verify the database gate without exposing it to browser roles', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  const fn = readFunction(sql, 'public.service_get_tonight_activation_gate')

  assert.match(fn, /RETURNS BOOLEAN/i)
  assert.match(fn, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
  assert.match(fn, /config\.key = 'tonight_applications_open'/i)
  assert.match(fn, /config\.value = pg_catalog\.to_jsonb\(TRUE\)/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.service_get_tonight_activation_gate\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.service_get_tonight_activation_gate\(\) TO service_role/i)
})

test('an authenticated user can read only the effective application gate boolean', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  const fn = readFunction(sql, 'public.get_tonight_application_gate')

  assert.match(fn, /RETURNS BOOLEAN/i)
  assert.match(fn, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
  assert.match(fn, /v_caller UUID := auth\.uid\(\)/i)
  assert.match(fn, /RAISE EXCEPTION 'not_authenticated'/i)
  assert.match(fn, /config\.key = 'tonight_applications_open'/i)
  assert.match(fn, /config\.value = pg_catalog\.to_jsonb\(TRUE\)/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.get_tonight_application_gate\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_tonight_application_gate\(\) TO authenticated/i)
})

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
