import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const predecessor = '20260801140202'

function readMigration(): { filename: string; sql: string } {
  const filenames = readdirSync(migrationsDir).filter((entry) =>
    /^\d{14}_profile_admin_appearance_private_boundary\.sql$/.test(entry),
  )

  assert.equal(filenames.length, 1, 'expected one admin appearance private-boundary migration')
  const [filename] = filenames
  assert.ok(filename.slice(0, 14) > predecessor, 'migration must follow 20260801140202')

  return {
    filename,
    sql: readFileSync(join(migrationsDir, filename), 'utf8'),
  }
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

test('private scores own override and effective values after the canonical migration', () => {
  const { sql } = readMigration()

  assert.match(
    sql,
    /ALTER TABLE public\.private_appearance_scores[\s\S]*?ADD COLUMN score_override DOUBLE PRECISION[\s\S]*?BETWEEN 0 AND 100/i,
  )
  assert.match(
    sql,
    /ADD COLUMN score_effective DOUBLE PRECISION[\s\S]*?GENERATED ALWAYS AS\s*\(\s*COALESCE\(score_override, score_raw\)\s*\) STORED/i,
  )
  assert.match(sql, /FROM public\.appearance_score_audits/i)
  assert.match(sql, /source = 'admin_override'/i)
  assert.match(sql, /COALESCE\(profile\.self_appearance_score_auto, first_override\.prev_effective\) AS score_auto/i)
  assert.match(
    sql,
    /score_raw = CASE[\s\S]*?provider LIKE 'legacy-%' THEN EXCLUDED\.score_raw/i,
  )
  assert.match(
    sql,
    /score_normalized = CASE[\s\S]*?provider LIKE 'legacy-%' THEN EXCLUDED\.score_normalized/i,
  )
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.sync_private_appearance_score_effective\(\)[\s\S]*?NEW\.score_normalized := COALESCE\(NEW\.score_override, NEW\.score_raw\) \/ 100\.0/i,
  )
  assert.match(
    sql,
    /CREATE TRIGGER sync_private_appearance_score_effective[\s\S]*?BEFORE INSERT OR UPDATE OF score_raw, score_override[\s\S]*?ON public\.private_appearance_scores/i,
  )
})

test('admin override writes only the private boundary and keeps the audit trail', () => {
  const { sql } = readMigration()
  const fn = readFunction(sql, 'admin_set_appearance_override')

  assert.match(
    fn,
    /p_user_id UUID,[\s\S]*?p_score FLOAT,[\s\S]*?p_reason TEXT DEFAULT NULL[\s\S]*?RETURNS FLOAT/i,
  )
  assert.match(fn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(fn, /auth\.uid\(\)/i)
  assert.match(fn, /public\.is_admin\(v_caller\)/i)
  assert.match(fn, /FROM public\.profiles[\s\S]*?FOR UPDATE/i)
  assert.match(fn, /INSERT INTO public\.private_appearance_scores/i)
  assert.match(fn, /ON CONFLICT \(user_id\) DO UPDATE/i)
  assert.match(fn, /score_override = EXCLUDED\.score_override/i)
  assert.match(fn, /INSERT INTO public\.appearance_score_audits/i)
  assert.match(fn, /'admin_override'/i)
  assert.doesNotMatch(
    fn,
    /appearance_score_normalized|self_appearance_score(?:_auto|_override|_source|_updated_at)?/i,
  )
})

test('clearing an override restores the private automatic score and audits the result', () => {
  const { sql } = readMigration()
  const fn = readFunction(sql, 'admin_clear_appearance_override')

  assert.match(
    fn,
    /p_user_id UUID,[\s\S]*?p_reason TEXT DEFAULT NULL[\s\S]*?RETURNS FLOAT/i,
  )
  assert.match(fn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(fn, /auth\.uid\(\)/i)
  assert.match(fn, /public\.is_admin\(v_caller\)/i)
  assert.match(fn, /FROM public\.profiles[\s\S]*?FOR UPDATE/i)
  assert.match(fn, /FROM public\.private_appearance_scores[\s\S]*?FOR UPDATE/i)
  assert.match(fn, /UPDATE public\.private_appearance_scores/i)
  assert.match(fn, /score_override = NULL/i)
  assert.match(fn, /INSERT INTO public\.appearance_score_audits/i)
  assert.match(fn, /'cleared'/i)
  assert.doesNotMatch(
    fn,
    /appearance_score_normalized|self_appearance_score(?:_auto|_override|_source|_updated_at)?/i,
  )
})

test('admin profile lookup preserves its result contract using private values', () => {
  const { sql } = readMigration()
  const fn = readFunction(sql, 'admin_get_user_profile')

  assert.match(
    fn,
    /RETURNS TABLE\s*\(\s*user_id UUID,\s*display_name TEXT,\s*gender TEXT,\s*age INT,\s*school TEXT,\s*department TEXT,\s*appearance_type TEXT,\s*is_profile_complete BOOLEAN,\s*effective_score FLOAT,\s*score_auto FLOAT,\s*score_override FLOAT,\s*score_source TEXT,\s*score_updated_at TIMESTAMPTZ,\s*appearance_score_normalized FLOAT,\s*photo_urls TEXT\[\]\s*\)/i,
  )
  assert.match(fn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(fn, /auth\.uid\(\)/i)
  assert.match(fn, /public\.is_admin\(v_caller\)/i)
  assert.match(
    fn,
    /LEFT JOIN public\.private_appearance_scores AS score\s+ON score\.user_id = profile\.user_id/i,
  )
  assert.match(fn, /score\.score_effective/i)
  assert.match(fn, /score\.score_raw/i)
  assert.match(fn, /score\.score_override/i)
  assert.match(fn, /score\.score_effective \/ 100\.0/i)
  assert.doesNotMatch(
    fn,
    /profile\.appearance_score_normalized|self_appearance_score(?:_auto|_override|_source|_updated_at)?/i,
  )
})

test('admin group member payload reads effective scores from the private boundary', () => {
  const { sql } = readMigration()
  const fn = readFunction(sql, '_admin_group_members_json')

  assert.match(fn, /LEFT JOIN public\.private_appearance_scores AS score/i)
  assert.match(fn, /'effective_score', score\.score_effective/i)
  assert.match(fn, /'score_source',[\s\S]*?score\.score_override IS NOT NULL/i)
  assert.doesNotMatch(
    fn,
    /profile\.self_appearance_score(?:_auto|_override|_source|_updated_at)?/i,
  )
})

test('admin RPC ACL remains authenticated-only', () => {
  const { sql } = readMigration()

  for (const signature of [
    'admin_set_appearance_override\\(UUID, FLOAT, TEXT\\)',
    'admin_clear_appearance_override\\(UUID, TEXT\\)',
    'admin_get_user_profile\\(UUID\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM PUBLIC, anon, authenticated[\\s\\S]*?GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO authenticated`,
        'i',
      ),
    )
  }
})
