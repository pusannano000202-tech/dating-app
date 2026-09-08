import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  TONIGHT_ACTIVITY_TEMPLATE_CATALOG,
  selectTonightActivityTemplates,
} from '../../lib/matching/tonight-ranked/activity-catalog'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const migrationSuffix = 'tonight_venue_activity_compatibility'

function readCompatibilityMigration(): string {
  const filenames = readdirSync(migrationsDir).filter((entry) =>
    new RegExp(`^20260903000700_${migrationSuffix}\\.sql$`).test(entry),
  )
  assert.equal(filenames.length, 1, 'expected the 20260903000700 venue/activity compatibility migration')
  return readFileSync(join(migrationsDir, filenames[0]), 'utf8')
}

function readFunction(sql: string, schema: 'public' | 'quantum_private', name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing function ${schema}.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for ${schema}.${name}`)
  assert.notEqual(end, -1, `missing end for ${schema}.${name}`)
  return sql.slice(start, end + 3)
}

test('Tonight catalog uses immutable venue-category mappings that match the venue snapshot taxonomy', () => {
  const expected = new Map<string, readonly string[]>([
    ['pnu-snack-worldcup', ['bar']],
    ['pnu-darts-team-battle', ['bar', 'activity']],
    ['pnu-boardgame-three-match', ['activity']],
    ['pnu-table-mini-league', ['activity']],
    ['pnu-dessert-pick-tour', ['cafe']],
    ['pnu-night-menu-tournament', ['restaurant', 'cafe']],
  ])

  assert.equal(TONIGHT_ACTIVITY_TEMPLATE_CATALOG.length, expected.size)
  for (const activity of TONIGHT_ACTIVITY_TEMPLATE_CATALOG) {
    assert.deepEqual(activity.venueCategories, expected.get(activity.id), activity.id)
    assert.equal(Object.isFrozen(activity.venueCategories), true, `${activity.id} categories must be immutable`)
    assert.equal(new Set(activity.venueCategories).size, activity.venueCategories.length)
  }
})

test('prepare sends the exact three catalog category lists without changing the three-card user selection', () => {
  const source = readFileSync(
    join(process.cwd(), 'app', 'api', 'internal', 'tonight', 'prepare', 'route.ts'),
    'utf8',
  )
  assert.match(
    source,
    /p_activity_allowed_venue_categories:\s*activities\.map\(\(activity\)\s*=>\s*\[\.\.\.activity\.venueCategories\]\)/,
  )

  const activities = selectTonightActivityTemplates({ marketCode: 'PNU', serviceDate: '2026-09-03' })
  assert.equal(activities.length, 3)
  assert.equal(new Set(activities.map((activity) => activity.id)).size, 3)
})

test('round activity category snapshots are constrained, immutable after finalization, and legacy rows fail closed', () => {
  const sql = readCompatibilityMigration()

  assert.match(sql, /^\s*--[\s\S]*?\bBEGIN;[\s\S]*?\bCOMMIT;\s*$/i)
  assert.match(
    sql,
    /ALTER TABLE public\.tonight_round_activities[\s\S]*?ADD COLUMN allowed_venue_categories TEXT\[\][\s\S]*?DEFAULT ARRAY\[\]::TEXT\[\]/i,
  )
  assert.match(sql, /tonight_activity_venue_categories_valid/i)
  assert.match(sql, /cardinality\(p_categories\)[\s\S]*?array_positions\(p_categories, 'activity'/i)
  assert.match(
    sql,
    /title = '보드게임 팀전 3종'[\s\S]*?activity_kind = 'board_game'[\s\S]*?description = '설명하기 쉬운 협동·추리·순발력 게임을 한 판씩 하며 팀 호흡을 맞춰요\.'[\s\S]*?image_url = '\/images\/match\/events\/event-board-game\.webp'[\s\S]*?duration_minutes = 80[\s\S]*?ARRAY\['activity'\]::TEXT\[\]/i,
  )
  assert.match(sql, /ELSE ARRAY\[\]::TEXT\[\]/i)
  assert.match(
    sql,
    /UPDATE public\.tonight_venue_capacities[\s\S]*?SET status = 'closed'[\s\S]*?NOT \(snapshot\.venue_category = ANY\(activity\.allowed_venue_categories\)\)/i,
  )
  assert.match(
    sql,
    /CREATE TRIGGER tonight_round_activity_category_snapshot_immutable[\s\S]*?BEFORE UPDATE OF allowed_venue_categories/i,
  )
})

test('round preparation validates exactly three nonempty category arrays and binds them to idempotent snapshots', () => {
  const sql = readCompatibilityMigration()
  const parser = readFunction(sql, 'quantum_private', 'parse_tonight_venue_categories')
  const create = readFunction(sql, 'quantum_private', 'create_tonight_round_internal')

  assert.match(parser, /jsonb_typeof\(p_categories\)[\s\S]*?<> 'array'/i)
  assert.match(parser, /jsonb_typeof\(item\.value\)[\s\S]*?<> 'string'/i)
  assert.match(parser, /invalid_activity_venue_categories/i)
  assert.match(create, /p_activity_allowed_venue_categories JSONB/i)
  assert.match(
    create,
    /jsonb_typeof\(p_activity_allowed_venue_categories\)[\s\S]*?jsonb_array_length\(p_activity_allowed_venue_categories\) <> 3[\s\S]*?invalid_activity_venue_category_count/i,
  )
  assert.match(
    create,
    /FOR v_slot IN 1\.\.3 LOOP[\s\S]*?parse_tonight_venue_categories\([\s\S]*?p_activity_allowed_venue_categories -> \(v_slot - 1\)/i,
  )
  assert.match(
    create,
    /cardinality\(activity\.allowed_venue_categories\) = 0[\s\S]*?activity\.allowed_venue_categories = v_allowed_venue_categories[\s\S]*?idempotency_conflict/i,
  )
})

test('partner capacity rejects an owned venue snapshot whose category is incompatible before idempotent replay', () => {
  const sql = readCompatibilityMigration()
  const fn = readFunction(sql, 'public', 'partner_set_tonight_capacity')

  assert.match(fn, /snapshot\.venue_id, snapshot\.venue_category[\s\S]*?INTO v_venue_id, v_venue_category/i)
  assert.match(
    fn,
    /snapshot\.id = \([\s\S]*?FROM public\.venue_snapshots AS latest_snapshot[\s\S]*?latest_snapshot\.venue_id = snapshot\.venue_id[\s\S]*?ORDER BY latest_snapshot\.created_at DESC, latest_snapshot\.id DESC[\s\S]*?LIMIT 1/i,
    'capacity must reject a crafted historical snapshot even when it belongs to the caller venue',
  )
  assert.match(fn, /public\.is_venue_partner\(v_venue_id, v_caller\)/i)
  assert.match(
    fn,
    /activity\.allowed_venue_categories[\s\S]*?INTO v_allowed_venue_categories[\s\S]*?activity_not_in_round/i,
  )
  assert.match(
    fn,
    /cardinality\(v_allowed_venue_categories\) = 0[\s\S]*?NOT \(v_venue_category = ANY\(v_allowed_venue_categories\)\)[\s\S]*?venue_activity_category_incompatible/i,
  )
  assert.ok(
    fn.indexOf('venue_activity_category_incompatible') < fn.indexOf('audit.idempotency_key = p_idempotency_key'),
    'category compatibility must be checked before idempotent replay',
  )
})

test('partner setup returns only activities compatible with the caller own latest venue snapshots', () => {
  const sql = readCompatibilityMigration()
  const fn = readFunction(sql, 'public', 'partner_get_tonight_setup')

  assert.match(fn, /membership\.user_id = v_caller/i)
  assert.match(fn, /membership\.revoked_at IS NULL/i)
  assert.match(fn, /ORDER BY snapshot_row\.created_at DESC, snapshot_row\.id DESC/i)
  assert.match(
    fn,
    /snapshot\.venue_category = ANY\(activity\.allowed_venue_categories\)/i,
  )
  assert.match(fn, /LEFT JOIN public\.tonight_venue_capacities AS capacity/i)
  assert.match(fn, /COALESCE\(capacity\.team_capacity, 0\)/i)
  assert.match(fn, /COALESCE\(capacity\.revision, 0\)/i)
})

test('the compatibility follow-up preserves the user three-choice and allocator RPC contracts', () => {
  const sql = readCompatibilityMigration()
  const lifecycle = readFileSync(
    join(migrationsDir, '20260902201247_tonight_lifecycle_rpcs.sql'),
    'utf8',
  )
  const userRound = readFunction(lifecycle, 'public', 'get_current_tonight_round')

  assert.match(userRound, /COUNT\(\*\)[\s\S]*?<> 3[\s\S]*?activity_count_invalid/i)
  assert.match(userRound, /FROM public\.tonight_round_activities AS activity[\s\S]*?activity\.round_id = v_round\.id/i)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.get_current_tonight_round/i)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.submit_tonight_application/i)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.service_get_tonight_allocator_input/i)
})

test('new round preparation overloads and partner RPCs have explicit least-privilege ACLs', () => {
  const sql = readCompatibilityMigration()
  const newSignature = [
    'TEXT', 'DATE',
    'TIMESTAMPTZ', 'TIMESTAMPTZ', 'TIMESTAMPTZ', 'TIMESTAMPTZ', 'TIMESTAMPTZ',
    'TIMESTAMPTZ', 'TIMESTAMPTZ', 'TIMESTAMPTZ', 'TIMESTAMPTZ',
    'TEXT\\[\\]', 'TEXT\\[\\]', 'TEXT\\[\\]', 'TEXT\\[\\]', 'SMALLINT\\[\\]', 'JSONB', 'TEXT',
  ].join(',\\s*')
  const oldSignature = newSignature.replace(',\\s*JSONB', '')

  for (const name of ['quantum_private\\.create_tonight_round_internal', 'public\\.super_admin_create_tonight_round', 'public\\.service_create_tonight_round']) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION ${name}\\(\\s*${newSignature}\\s*\\)[^;]*?FROM[^;]*?PUBLIC, anon, authenticated, service_role;`, 'i'),
    )
  }
  for (const name of ['public\\.super_admin_create_tonight_round', 'public\\.service_create_tonight_round']) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION ${name}\\(\\s*${oldSignature}\\s*\\)[^;]*?FROM[^;]*?PUBLIC, anon, authenticated, service_role;`, 'i'),
    )
  }
  assert.match(
    sql,
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.super_admin_create_tonight_round\\(\\s*${newSignature}\\s*\\)\\s+TO authenticated;`, 'i'),
  )
  assert.match(
    sql,
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.service_create_tonight_round\\(\\s*${newSignature}\\s*\\)\\s+TO service_role;`, 'i'),
  )
  for (const signature of [
    'public\\.partner_set_tonight_capacity\\(UUID,\\s*UUID,\\s*UUID,\\s*SMALLINT,\\s*INTEGER,\\s*TEXT\\)',
    'public\\.partner_get_tonight_setup\\(UUID\\)',
  ]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION ${signature}[^;]*?FROM[^;]*?PUBLIC, anon, authenticated, service_role;`, 'i'))
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ${signature}\\s+TO authenticated;`, 'i'))
  }
})
