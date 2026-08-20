import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function readBridgeMigration(): string {
  const filename = readdirSync(migrationsDir).find((entry) =>
    /^20260801\d{6}_matching_private_appearance_bridge\.sql$/.test(entry),
  )
  assert.ok(filename, 'missing matching private appearance bridge migration')
  return readFileSync(join(migrationsDir, filename), 'utf8')
}

test('matching profiles join ready appearance data only inside a service-only RPC', () => {
  const migration = readBridgeMigration()

  const compatibilityGuard = migration.indexOf("SET status = 'stale'")
  const readyConstraint = migration.indexOf('ADD CONSTRAINT private_appearance_scores_ready_type_required')
  assert.ok(compatibilityGuard >= 0 && compatibilityGuard < readyConstraint)

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_private_matching_profiles\(p_group_ids UUID\[\]\)/i,
  )
  assert.match(migration, /SECURITY INVOKER\s+SET search_path = ''/i)
  assert.match(migration, /JOIN public\.private_appearance_scores AS score/i)
  assert.match(migration, /score\.status = 'ready'/i)
  assert.match(migration, /score\.score_normalized IS NOT NULL/i)
  assert.match(migration, /score\.appearance_type IS NOT NULL/i)
  assert.match(migration, /score\.analyzed_photo_revision = score\.photo_revision/i)
  assert.match(migration, /score\.confidence_0_1 IS NOT NULL/i)
  assert.match(migration, /score\.model_version IS NOT NULL/i)
  assert.match(migration, /score\.prompt_version IS NOT NULL/i)
  assert.match(migration, /score\.anchor_version IS NOT NULL/i)
  assert.match(migration, /score\.analyzed_at IS NOT NULL/i)
  assert.match(migration, /group_gender TEXT/i)
  assert.match(migration, /group_size INTEGER/i)
  assert.match(migration, /department TEXT/i)
  assert.match(migration, /excluded_group_ids UUID\[\]/i)
  assert.match(migration, /JOIN public\.groups AS matched_group/i)
  assert.match(migration, /FROM public\.excluded_pairs AS excluded/i)
  assert.match(migration, /member\.left_at IS NULL/i)
  assert.match(migration, /member\.group_id = ANY \(p_group_ids\)/i)
  assert.match(migration, /NOT EXISTS\s*\([\s\S]*pending_member\.group_id = member\.group_id/i)
  assert.match(migration, /pending_score\.status IS DISTINCT FROM 'ready'/i)
  assert.match(migration, /pending_score\.analyzed_photo_revision IS DISTINCT FROM pending_score\.photo_revision/i)
  assert.doesNotMatch(migration, /profile\.appearance_score_normalized/i)
  assert.doesNotMatch(migration, /profile\.appearance_type/i)

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.get_private_matching_profiles\(UUID\[\]\)\s+FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.get_private_matching_profiles\(UUID\[\]\)\s+TO service_role/i,
  )
})

test('pending match creation accepts computed scores only through the service role', () => {
  const migration = readBridgeMigration()

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.admin_create_pending_match\(UUID, UUID, DOUBLE PRECISION, JSONB, BOOLEAN\)\s+FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.admin_create_pending_match\(UUID, UUID, DOUBLE PRECISION, JSONB, BOOLEAN\)\s+TO service_role/i,
  )
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.admin_create_pending_match[\s\S]{0,160}?TO authenticated/i,
  )
})
