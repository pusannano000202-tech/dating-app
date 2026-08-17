import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function readMigration(): string {
  const filename = readdirSync(migrationsDir).find((entry) =>
    /^20260801\d{6}_private_appearance_scores\.sql$/.test(entry),
  )
  assert.ok(filename, 'missing 20260801*_private_appearance_scores.sql migration')
  return readFileSync(join(migrationsDir, filename), 'utf8')
}

function readFunction(sql: string, functionName: string): string {
  const start = sql.search(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\b`, 'i'),
  )
  assert.notEqual(start, -1, `missing function public.${functionName}`)

  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for public.${functionName}`)
  assert.notEqual(end, -1, `missing end for public.${functionName}`)
  return sql.slice(start, end + 3)
}

test('private appearance scores keep the complete service-owned scoring state', () => {
  const migration = readMigration()

  assert.match(
    migration,
    /CREATE TABLE public\.private_appearance_scores\s*\([\s\S]*?user_id UUID PRIMARY KEY REFERENCES public\.users\(id\) ON DELETE CASCADE/i,
  )
  for (const column of [
    'photo_revision UUID',
    'analyzed_photo_revision UUID',
    'status TEXT',
    'lease_expires_at TIMESTAMPTZ',
    'request_id UUID',
    'attempt_count INTEGER',
    'provider TEXT',
    'model_version TEXT',
    'prompt_version TEXT',
    'anchor_version TEXT',
    'score_raw DOUBLE PRECISION',
    'score_normalized DOUBLE PRECISION',
    'confidence_0_1 DOUBLE PRECISION',
    'appearance_type TEXT',
    'error_code TEXT',
    'analyzed_at TIMESTAMPTZ',
    'created_at TIMESTAMPTZ',
    'updated_at TIMESTAMPTZ',
  ]) {
    assert.match(migration, new RegExp(column, 'i'))
  }

  assert.match(migration, /status IN \('pending', 'ready', 'failed', 'stale'\)/i)
  assert.match(migration, /score_raw[\s\S]*?BETWEEN 0 AND 100/i)
  assert.match(migration, /score_normalized[\s\S]*?BETWEEN 0 AND 1/i)
  assert.match(migration, /confidence_0_1[\s\S]*?BETWEEN 0 AND 1/i)
  assert.match(migration, /attempt_count[\s\S]*?>= 0/i)
  assert.match(migration, /status <> 'ready'[\s\S]*?analyzed_photo_revision = photo_revision[\s\S]*?score_raw IS NOT NULL[\s\S]*?score_normalized IS NOT NULL[\s\S]*?confidence_0_1 IS NOT NULL[\s\S]*?appearance_type IS NOT NULL/i)
})

test('the private table denies browser roles and grants direct DML only to service_role', () => {
  const migration = readMigration()

  assert.match(
    migration,
    /ALTER TABLE public\.private_appearance_scores ENABLE ROW LEVEL SECURITY/i,
  )
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.private_appearance_scores\s+FROM PUBLIC, anon, authenticated/i,
  )
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.private_appearance_scores\s+TO service_role/i,
  )
  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,120}?ON TABLE public\.private_appearance_scores[\s\S]{0,120}?TO\s+(?:PUBLIC|anon|authenticated)/i,
  )
})

test('status RPCs expose readiness metadata without exposing either score', () => {
  const migration = readMigration()
  const ownStatus = readFunction(migration, 'get_my_appearance_score_status')
  const groupReadiness = readFunction(migration, 'get_group_appearance_score_readiness')

  assert.match(
    ownStatus,
    /RETURNS TABLE\s*\(\s*status TEXT,\s*ready BOOLEAN,\s*photo_revision UUID\s*\)/i,
  )
  assert.match(ownStatus, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(ownStatus, /auth\.uid\(\)/i)
  assert.doesNotMatch(ownStatus.slice(0, ownStatus.indexOf('LANGUAGE')), /score_raw|score_normalized/i)

  assert.match(
    groupReadiness,
    /p_group_id UUID[\s\S]*?RETURNS TABLE\s*\(\s*user_id UUID,\s*ready BOOLEAN\s*\)/i,
  )
  assert.match(groupReadiness, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(groupReadiness, /auth\.uid\(\)/i)
  assert.match(groupReadiness, /member\.left_at IS NULL/i)
  for (const required of [
    /score\.status = 'ready'/i,
    /score\.analyzed_photo_revision = score\.photo_revision/i,
    /score\.score_raw IS NOT NULL/i,
    /score\.score_normalized IS NOT NULL/i,
    /score\.confidence_0_1 IS NOT NULL/i,
    /score\.appearance_type IS NOT NULL/i,
    /score\.provider = 'openai'/i,
    /score\.model_version = 'gpt-5\.6-terra'/i,
    /score\.prompt_version = 'appearance-anchor-v2'/i,
    /score\.anchor_version = 'approved-v1'/i,
    /score\.analyzed_at IS NOT NULL/i,
  ]) assert.match(groupReadiness, required)
  assert.doesNotMatch(groupReadiness.slice(0, groupReadiness.indexOf('LANGUAGE')), /score_raw|score_normalized/i)

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.get_my_appearance_score_status\(\)\s+FROM PUBLIC, anon, authenticated[\s\S]*?GRANT EXECUTE ON FUNCTION public\.get_my_appearance_score_status\(\)\s+TO authenticated/i,
  )
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.get_group_appearance_score_readiness\(UUID\)\s+FROM PUBLIC, anon, authenticated[\s\S]*?GRANT EXECUTE ON FUNCTION public\.get_group_appearance_score_readiness\(UUID\)\s+TO authenticated/i,
  )
})

test('service-only claim is atomic and accepts only claimable rows', () => {
  const migration = readMigration()
  const claim = readFunction(migration, 'claim_private_appearance_score')

  assert.match(claim, /p_user_id UUID,[\s\S]*?p_photo_revision UUID,[\s\S]*?p_request_id UUID,[\s\S]*?p_lease_seconds INTEGER DEFAULT 300/i)
  assert.match(claim, /RETURNS TABLE[\s\S]*?claimed BOOLEAN[\s\S]*?reused_existing_score BOOLEAN/i)
  assert.match(claim, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(claim, /INSERT INTO public\.private_appearance_scores/i)
  assert.match(claim, /ON CONFLICT \(user_id\) DO UPDATE/i)
  assert.match(claim, /private_appearance_scores\.status IN \('stale', 'failed'\)/i)
  assert.match(
    claim,
    /private_appearance_scores\.status = 'pending'[\s\S]*?private_appearance_scores\.lease_expires_at <= CURRENT_TIMESTAMP/i,
  )
  assert.doesNotMatch(claim, /private_appearance_scores\.status = 'ready'/i)
  assert.match(claim, /attempt_count = private_appearance_scores\.attempt_count \+ 1/i)
  assert.match(claim, /request_id = p_request_id/i)

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.claim_private_appearance_score\(UUID, UUID, UUID, INTEGER\)\s+FROM PUBLIC, anon, authenticated, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.claim_private_appearance_score\(UUID, UUID, UUID, INTEGER\)\s+TO service_role/i,
  )
})

test('service-only completion and failure apply only to the active request lease', () => {
  const migration = readMigration()
  const complete = readFunction(migration, 'complete_private_appearance_score')
  const fail = readFunction(migration, 'fail_private_appearance_score')

  for (const fn of [complete, fail]) {
    assert.match(fn, /p_user_id UUID,[\s\S]*?p_photo_revision UUID,[\s\S]*?p_request_id UUID/i)
    assert.match(fn, /status = 'pending'/i)
    assert.match(fn, /photo_revision = p_photo_revision/i)
    assert.match(fn, /request_id = p_request_id/i)
    assert.match(fn, /SECURITY DEFINER\s+SET search_path = ''/i)
    assert.match(fn, /lease_expires_at > CURRENT_TIMESTAMP/i)
  }
  assert.match(complete, /confidence_0_1 = p_confidence_0_1/i)
  assert.match(complete, /analyzed_photo_revision = p_photo_revision/i)
  assert.match(complete, /p_provider\s*<>\s*'openai'/i)
  assert.match(complete, /p_model_version\s*<>\s*'gpt-5\.6-terra'/i)
  assert.match(complete, /p_prompt_version\s*<>\s*'appearance-anchor-v2'/i)
  assert.match(complete, /p_anchor_version\s*<>\s*'approved-v1'/i)
  assert.match(fail, /error_code = p_error_code/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.complete_private_appearance_score[\s\S]*?TO service_role/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.fail_private_appearance_score[\s\S]*?TO service_role/i)
})

test('legacy profile scores are copied as stale without breaking the currently deployed writer', () => {
  const migration = readMigration()

  assert.match(
    migration,
    /INSERT INTO public\.private_appearance_scores[\s\S]*?'stale'[\s\S]*?FROM public\.users AS app_user[\s\S]*?LEFT JOIN public\.profiles AS profile[\s\S]*?LEFT JOIN public\.appearance_scores AS legacy_score/i,
  )
  assert.match(migration, /legacy_score\.score_raw/i)
  assert.match(migration, /legacy_score\.model_version/i)
  assert.match(migration, /profile\.self_appearance_score_auto/i)
  assert.doesNotMatch(migration, /UPDATE public\.profiles\s+SET[\s\S]*self_appearance_score_auto = NULL/i)
  assert.doesNotMatch(migration, /profiles_legacy_appearance_scores_unused/i)
  assert.doesNotMatch(migration, /DELETE FROM public\.appearance_scores/i)

  const contract = readFileSync(
    join(process.cwd(), 'supabase', 'deferred-migrations', '20260802160000_retire_legacy_appearance_scores_contract.sql'),
    'utf8',
  )
  assert.match(contract, /UPDATE public\.profiles[\s\S]*self_appearance_score_auto = NULL/i)
  assert.match(contract, /profiles_legacy_appearance_scores_unused/i)
  assert.match(contract, /DELETE FROM public\.appearance_scores/i)
})

test('enter_match_pool preserves existing gates and rechecks every active private score', () => {
  const migration = readMigration()
  const enterPool = readFunction(migration, 'enter_match_pool')

  const dropLegacySignature = migration.search(
    /DROP FUNCTION IF EXISTS public\.enter_match_pool\(UUID\)/i,
  )
  const createUpdatedSignature = migration.search(
    /CREATE OR REPLACE FUNCTION public\.enter_match_pool\b/i,
  )
  assert.notEqual(dropLegacySignature, -1)
  assert.ok(dropLegacySignature < createUpdatedSignature)

  assert.match(enterPool, /RETURNS TABLE \(\s*pool_id UUID,\s*group_id UUID,\s*group_status TEXT,\s*pool_status TEXT,\s*reused_existing_entry BOOLEAN\s*\)/i)
  assert.match(enterPool, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(enterPool, /WHERE group_row\.id = p_group_id\s+FOR UPDATE/i)
  assert.match(enterPool, /v_group\.leader_user_id <> v_uid/i)
  assert.match(enterPool, /v_pool_id IS NULL[\s\S]*?v_group\.status <> 'forming'/i)
  assert.match(enterPool, /v_pool_id IS NOT NULL[\s\S]*?v_group\.status NOT IN \('forming', 'ready'\)/i)
  assert.match(enterPool, /pool\.status IN \('waiting', 'rolled_over'\)[\s\S]*?RETURN QUERY[\s\S]*?TRUE/i)
  assert.match(enterPool, /v_member_count <> v_group\.size/i)
  assert.match(enterPool, /NOT quantum_private\.match_setup_ready\(member\.user_id\)/i)
  assert.match(
    enterPool,
    /FROM public\.private_appearance_scores AS score[\s\S]*?score\.user_id = member\.user_id[\s\S]*?score\.status = 'ready'[\s\S]*?score\.analyzed_photo_revision = score\.photo_revision[\s\S]*?score\.confidence_0_1 IS NOT NULL/i,
  )
  assert.match(enterPool, /member\.left_at IS NULL[\s\S]*?RAISE EXCEPTION 'member_appearance_score_required'/i)
  assert.match(enterPool, /FROM public\.pre_match_card_drafts AS draft/i)
  assert.match(enterPool, /INSERT INTO public\.match_pool[\s\S]*?'waiting'/i)

  const existingEntryReturn = enterPool.indexOf('SELECT v_pool_id, p_group_id, v_group.status, v_pool_status, TRUE')
  const appearanceGate = enterPool.indexOf("RAISE EXCEPTION 'member_appearance_score_required'")
  const preMatchGate = enterPool.indexOf("RAISE EXCEPTION 'member_pre_match_card_incomplete'")
  assert.ok(existingEntryReturn > appearanceGate)
  assert.ok(existingEntryReturn > preMatchGate)
  assert.match(enterPool, /score\.provider = 'openai'/i)
  assert.match(enterPool, /score\.model_version = 'gpt-5\.6-terra'/i)
  assert.match(enterPool, /score\.prompt_version = 'appearance-anchor-v2'/i)
  assert.match(enterPool, /score\.anchor_version = 'approved-v1'/i)

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.enter_match_pool\(UUID\)\s+FROM PUBLIC, anon, authenticated[\s\S]*?GRANT EXECUTE ON FUNCTION public\.enter_match_pool\(UUID\) TO authenticated/i,
  )
})
