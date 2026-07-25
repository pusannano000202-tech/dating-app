import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function readMigration(suffix: string): string {
  const filename = readdirSync(migrationsDir).find((entry) => entry.endsWith(suffix))
  assert.ok(filename, `missing migration ending with ${suffix}`)
  return readFileSync(join(migrationsDir, filename), 'utf8')
}

test('admin definer follow-up removes unsafe search paths and implicit public execution', () => {
  const migration = readMigration('_harden_matching_security_definers.sql')

  assert.doesNotMatch(migration, /SET search_path TO pg_catalog,\s*public/i)
  assert.match(migration, /SET search_path = ''/i)

  for (const signature of [
    'is_admin\\(UUID\\)',
    'is_super_admin\\(UUID\\)',
    'grant_admin\\(UUID, TEXT, TEXT\\)',
    'revoke_admin\\(UUID\\)',
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon`, 'i'),
    )
  }

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.is_admin[\s\S]*p_user_id IS DISTINCT FROM v_caller[\s\S]*FROM public\.admins/i,
  )
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.is_super_admin[\s\S]*p_user_id IS DISTINCT FROM v_caller[\s\S]*admin_row\.role = 'super_admin'/i,
  )
  assert.match(
    migration,
    /ALTER VIEW public\.admin_revenue_summary\s+SET \(security_invoker = TRUE\)/i,
  )
})

test('atomic assignment locks active queue rows and links them to the created match id', () => {
  const migration = readMigration('_atomic_match_pool_assignment.sql')

  assert.match(
    migration,
    /ALTER TABLE public\.match_pool[\s\S]*ADD COLUMN IF NOT EXISTS match_id UUID[\s\S]*REFERENCES public\.matches\(id\)/i,
  )
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.admin_create_pending_match\(\s*p_group_a UUID,\s*p_group_b UUID,\s*p_score (?:FLOAT|DOUBLE PRECISION) DEFAULT NULL,\s*p_breakdown JSONB DEFAULT NULL,\s*p_is_forced BOOLEAN DEFAULT FALSE\s*\)/i,
  )
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(
    migration,
    /FROM public\.match_pool AS pool[\s\S]*pool\.status IN \('waiting', 'rolled_over'\)[\s\S]*ORDER BY pool\.id[\s\S]*FOR UPDATE/i,
  )
  assert.match(
    migration,
    /FROM public\.matches AS active_match[\s\S]*active_match\.status IN \('pending', 'confirmed'\)/i,
  )
  assert.match(migration, /INSERT INTO public\.matches[\s\S]*RETURNING id INTO v_match_id/i)
  assert.match(
    migration,
    /UPDATE public\.match_pool[\s\S]*status = 'matched'[\s\S]*match_id = v_match_id[\s\S]*GET DIAGNOSTICS v_updated_pool_rows = ROW_COUNT/i,
  )
  assert.match(
    migration,
    /IF v_updated_pool_rows <> 2 THEN[\s\S]*RAISE EXCEPTION 'match_pool_assignment_incomplete'/i,
  )
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.admin_create_pending_match\(\s*UUID,\s*UUID,\s*DOUBLE PRECISION,\s*JSONB,\s*BOOLEAN\s*\)\s+FROM PUBLIC, anon/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.admin_create_pending_match\(\s*UUID,\s*UUID,\s*DOUBLE PRECISION,\s*JSONB,\s*BOOLEAN\s*\)\s+TO authenticated, service_role/i,
  )
  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[\s\S]*TO\s+(?:anon|authenticated)/i,
  )
})

test('match utility definer functions are internal-only and chat access is self-scoped', () => {
  const migration = readMigration('_harden_match_utility_acl.sql')

  assert.match(
    migration,
    /ALTER DEFAULT PRIVILEGES IN SCHEMA public\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/i,
  )

  for (const signature of [
    'get_match_meeting_info\\(UUID\\)',
    'get_match_scheduled_reveal_at\\(UUID\\)',
    'lazy_complete_match\\(UUID\\)',
    'notify_match_members\\(UUID, TEXT, JSONB\\)',
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE (?:ALL|EXECUTE) ON FUNCTION public\\.${signature}\\s+FROM PUBLIC, anon, authenticated`, 'i'),
    )
  }

  assert.doesNotMatch(
    migration,
    /ALTER FUNCTION public\.(?:get_match_meeting_info|get_match_scheduled_reveal_at|lazy_complete_match|notify_match_members)\([^)]*\)\s+SET search_path/i,
  )

  for (const signature of [
    'enqueue_meeting_reminders\\(\\)',
    'expire_overdue_friend_requests\\(\\)',
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE (?:ALL|EXECUTE) ON FUNCTION public\\.${signature}\\s+FROM PUBLIC, anon, authenticated`, 'i'),
    )
    assert.match(
      migration,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO service_role`, 'i'),
    )
  }

  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.excluded_pairs\s+FROM PUBLIC, anon, authenticated[\s\S]*?GRANT ALL ON TABLE public\.excluded_pairs TO service_role/i,
  )

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.can_access_match_chat\(p_match_id UUID, p_user_id UUID\)[\s\S]*?v_caller UUID := auth\.uid\(\)[\s\S]*?IF v_caller IS NULL OR p_user_id IS DISTINCT FROM v_caller THEN\s+RETURN FALSE;[\s\S]*?FROM public\.group_members AS \w+[\s\S]*?AND \w+\.user_id = p_user_id/i,
  )
  assert.match(
    migration,
    /ALTER FUNCTION public\.can_access_match_chat\(UUID, UUID\)\s+SET search_path = ''/i,
  )
  assert.match(
    migration,
    /REVOKE (?:ALL|EXECUTE) ON FUNCTION public\.can_access_match_chat\(UUID, UUID\)\s+FROM PUBLIC, anon[\s\S]*?GRANT EXECUTE ON FUNCTION public\.can_access_match_chat\(UUID, UUID\)\s+TO authenticated/i,
  )
})
