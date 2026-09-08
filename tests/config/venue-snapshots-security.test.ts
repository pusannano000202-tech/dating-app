import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function readMigration(): string {
  const filenames = readdirSync(migrationsDir).filter((entry) =>
    /^\d{14}_immutable_venue_snapshots\.sql$/.test(entry),
  )
  assert.equal(filenames.length, 1, 'expected one immutable venue snapshots migration')
  return readFileSync(join(migrationsDir, filenames[0]), 'utf8')
}

function readCreateTable(sql: string, table: string): string {
  const start = sql.search(new RegExp(`CREATE TABLE public\\.${table}\\b`, 'i'))
  assert.notEqual(start, -1, `missing table public.${table}`)
  const end = sql.indexOf('\n);', start)
  assert.notEqual(end, -1, `missing end for public.${table}`)
  return sql.slice(start, end + 3)
}

function readFunction(sql: string, functionName: string): string {
  const start = sql.search(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\b`, 'i'),
  )
  assert.notEqual(start, -1, `missing function public.${functionName}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

test('venue snapshots contain only public place facts and permit unknown coordinates', () => {
  const sql = readMigration()
  const table = readCreateTable(sql, 'venue_snapshots')

  assert.match(table, /venue_id UUID NOT NULL REFERENCES public\.venues\(id\) ON DELETE RESTRICT/i)
  assert.match(table, /snapshot_revision UUID NOT NULL DEFAULT gen_random_uuid\(\)/i)
  assert.match(table, /display_name TEXT NOT NULL/i)
  assert.match(table, /venue_category TEXT NOT NULL/i)
  assert.match(table, /area_label TEXT NOT NULL/i)
  assert.match(table, /address TEXT/i)
  assert.match(table, /address_evidence TEXT/i)
  assert.match(table, /latitude DOUBLE PRECISION/i)
  assert.match(table, /longitude DOUBLE PRECISION/i)
  assert.doesNotMatch(table, /latitude DOUBLE PRECISION NOT NULL|longitude DOUBLE PRECISION NOT NULL/i)
  assert.match(table, /coordinate_evidence TEXT/i)
  assert.match(table, /naver_url TEXT/i)
  assert.match(table, /kakao_url TEXT/i)

  assert.doesNotMatch(
    table,
    /\bphone\b|capacity|settlement|internal_score|quality_score|admin_priority|notes|checkin_radius|provider_payload|secret|opening_hours|available_timeslots|min_group_size|max_group_size|created_by/i,
  )
})

test('venue snapshots are immutable and unavailable for browser-side table mutation', () => {
  const sql = readMigration()

  assert.match(sql, /ALTER TABLE public\.venue_snapshots ENABLE ROW LEVEL SECURITY/i)
  assert.match(
    sql,
    /CREATE TRIGGER venue_snapshots_immutable[\s\S]*?BEFORE DELETE OR UPDATE ON public\.venue_snapshots[\s\S]*?quantum_private\.prevent_venue_snapshot_mutation\(\)/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\.venue_snapshots\s+FROM\s+\/\* explicit role boundary \*\/\s+PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(sql, /GRANT SELECT ON TABLE public\.venue_snapshots\s+TO service_role/i)
  assert.doesNotMatch(
    sql,
    /GRANT\s+(?:ALL|UPDATE|DELETE|[A-Z, ]*(?:UPDATE|DELETE)[A-Z, ]*)\s+ON TABLE public\.venue_snapshots/i,
  )

  assert.match(
    sql,
    /CREATE TABLE quantum_private\.venue_snapshot_provenance[\s\S]*?snapshot_id UUID PRIMARY KEY[\s\S]*?created_by UUID NOT NULL REFERENCES public\.users\(id\)/i,
  )
  assert.match(
    sql,
    /CREATE TRIGGER venue_snapshot_provenance_immutable[\s\S]*?BEFORE DELETE OR UPDATE ON quantum_private\.venue_snapshot_provenance/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON TABLE quantum_private\.venue_snapshot_provenance[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  )
})

test('snapshot creation is super-admin gated and never trusts legacy venue map evidence', () => {
  const sql = readMigration()
  const fn = readFunction(sql, 'create_venue_snapshot')

  assert.match(fn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(fn, /v_caller UUID := auth\.uid\(\)/i)
  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /p_address_evidence TEXT/i)
  assert.match(fn, /p_address_verified_at TIMESTAMPTZ/i)
  assert.match(fn, /p_latitude DOUBLE PRECISION DEFAULT NULL/i)
  assert.match(fn, /p_longitude DOUBLE PRECISION DEFAULT NULL/i)
  assert.match(fn, /p_coordinate_evidence TEXT DEFAULT NULL/i)
  assert.match(fn, /p_naver_url TEXT DEFAULT NULL/i)
  assert.match(fn, /p_kakao_url TEXT DEFAULT NULL/i)
  assert.match(fn, /INSERT INTO public\.venue_snapshots/i)
  assert.match(fn, /RETURNING snapshot\.id INTO v_snapshot_id/i)
  assert.match(fn, /INSERT INTO quantum_private\.venue_snapshot_provenance[\s\S]*?v_snapshot_id[\s\S]*?v_caller/i)
  assert.match(fn, /RETURN v_snapshot_id/i)
  assert.match(fn, /p_address_evidence NOT IN \([\s\S]*?'search-verified'[\s\S]*?'provider-verified'[\s\S]*?'operator-verified'/i)
  assert.match(fn, /p_address_verified_at IS NULL[\s\S]*?verified_address_evidence_required/i)
  assert.doesNotMatch(fn, /address_evidence[\s\S]*?'host-supplied'/i)
  assert.match(
    fn,
    /p_coordinate_evidence IS NULL\s+OR p_coordinate_evidence NOT IN/i,
  )
  assert.doesNotMatch(fn, /venue\.(?:latitude|longitude|map_url)/i)
  assert.doesNotMatch(fn, /provider_payload|secret/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.create_venue_snapshot\([\s\S]*?FROM\s+\/\* explicit role boundary \*\/\s+PUBLIC, anon, authenticated[\s\S]*?GRANT EXECUTE ON FUNCTION public\.create_venue_snapshot\([\s\S]*?TO authenticated/i,
  )
})
