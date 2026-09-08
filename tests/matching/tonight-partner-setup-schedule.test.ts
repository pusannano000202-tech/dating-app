import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function migrationBySuffix(suffix: string): string {
  const names = readdirSync(migrationsDir).filter((name) =>
    new RegExp(`^\\d{14}_${suffix}\\.sql$`).test(name),
  )
  assert.equal(names.length, 1, `expected one ${suffix} migration`)
  return readFileSync(join(migrationsDir, names[0]), 'utf8')
}

function readFunction(sql: string, name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing public.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for public.${name}`)
  assert.notEqual(end, -1, `missing end for public.${name}`)
  return sql.slice(start, end + 3)
}

test('partner setup returns the complete persisted round schedule expected by the live mapper', () => {
  const migration = migrationBySuffix('tonight_partner_setup_schedule')
  const setup = readFunction(migration, 'partner_get_tonight_setup')

  for (const field of [
    'id',
    'market_code',
    'service_date',
    'status',
    'signup_close_at',
    'capacity_lock_at',
    'allocation_publish_at',
    'deposit_due_at',
    'partner_acceptance_due_at',
    'reveal_at',
    'arrival_at',
    'starts_at',
  ]) {
    assert.match(
      setup,
      new RegExp(`'${field}'\\s*,\\s*v_round\\.${field}\\b`, 'i'),
      `round.${field} must come from the persisted round`,
    )
  }
})

test('partner setup keeps its authentication, own-venue scope, defaults, and execute boundary', () => {
  const migration = migrationBySuffix('tonight_partner_setup_schedule')
  const setup = readFunction(migration, 'partner_get_tonight_setup')

  assert.match(setup, /LANGUAGE plpgsql[\s\S]*?STABLE[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
  assert.match(setup, /v_caller UUID := auth\.uid\(\)/i)
  assert.match(setup, /IF v_caller IS NULL[\s\S]*?RAISE EXCEPTION 'not_authenticated'/i)
  assert.match(setup, /FROM public\.tonight_rounds AS round_row[\s\S]*?round_row\.id = p_round_id/i)
  assert.match(setup, /IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION 'tonight_round_not_found'/i)
  assert.match(setup, /membership\.user_id = v_caller[\s\S]*?membership\.revoked_at IS NULL/i)
  assert.match(setup, /ORDER BY snapshot_row\.created_at DESC, snapshot_row\.id DESC[\s\S]*?LIMIT 1/i)
  assert.match(setup, /snapshot\.venue_category = ANY\(activity\.allowed_venue_categories\)/i)
  assert.match(setup, /'team_capacity', COALESCE\(capacity\.team_capacity, 0\)/i)
  assert.match(setup, /'reserved_team_count', COALESCE\(capacity\.reserved_team_count, 0\)/i)
  assert.match(setup, /'max_team_headcount', COALESCE\(capacity\.max_team_headcount, 5\)/i)
  assert.match(setup, /'status', COALESCE\(capacity\.status, 'open'\)/i)
  assert.match(setup, /'revision', COALESCE\(capacity\.revision, 0\)/i)

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.partner_get_tonight_setup\(UUID\) FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.partner_get_tonight_setup\(UUID\) TO authenticated/i,
  )
})
