import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('saving profile photos never starts paid appearance analysis', () => {
  const photosPage = readSource('app/profile/photos/page.tsx')

  assert.doesNotMatch(photosPage, /fetch\(['"]\/api\/score['"]/) ;
  assert.doesNotMatch(photosPage, /requestScorePersistence/)
  assert.doesNotMatch(photosPage, /photoAnalysis=deferred/)
  assert.doesNotMatch(photosPage, /fetch\(['"]\/api\/score\/invalidate['"]/) ;
  assert.doesNotMatch(photosPage, /self_appearance_score_auto/)
  assert.doesNotMatch(photosPage, /appearance_score_normalized/)
})

test('appearance analysis starts only from the explicit match-search gate', () => {
  const matchStartPage = readSource('app/match/start/page.tsx')
  const scoreGate = readSource('components/matching/AppearanceScoreGate.tsx')

  assert.match(matchStartPage, /get_my_appearance_score_status/)
  assert.doesNotMatch(matchStartPage, /appearance_score_normalized/)
  assert.match(matchStartPage, /AppearanceScoreGate/)
  assert.match(scoreGate, /fetch\(['"]\/api\/score['"]/) ;
  assert.match(scoreGate, /trigger:\s*['"]match_search['"]/) ;
})

test('score API derives the current users stored photos instead of trusting client URLs', () => {
  const scoreRoute = readSource('app/api/score/route.ts')

  assert.match(scoreRoute, /readTrigger\(body\) !== ['"]match_search['"]/) ;
  assert.match(scoreRoute, /\.from\(['"]photos['"]\)/)
  assert.match(scoreRoute, /\.order\(['"]sort_order['"]\)/)
  assert.match(scoreRoute, /APPEARANCE_SCORE_TABLE/)
  assert.match(scoreRoute, /createSignedUrl/)
  assert.match(scoreRoute, /storage_path/)
  assert.doesNotMatch(scoreRoute, /photo\.public_url/)
  assert.match(scoreRoute, /\.from\(['"]profiles['"]\)/)
  assert.match(scoreRoute, /\.select\(['"]gender['"]\)/)
  assert.match(scoreRoute, /profile_gender_required/)
  assert.doesNotMatch(scoreRoute, /body\.gender_bank/)
  assert.doesNotMatch(scoreRoute, /body\.photo_urls/)
})

test('group queue entry blocks until every member has an appearance score', () => {
  const enterRoute = readSource('app/api/match-pool/enter/route.ts')

  assert.match(enterRoute, /get_group_appearance_score_readiness/)
  assert.doesNotMatch(enterRoute, /appearance_score_normalized/)
  assert.match(enterRoute, /member_appearance_score_required/)
})

test('photo invalidation is authenticated and service-only', () => {
  const invalidateRoute = readSource('app/api/score/invalidate/route.ts')

  assert.match(invalidateRoute, /auth\.getUser\(\)/)
  assert.match(invalidateRoute, /createAppearanceServiceClient/)
  assert.match(invalidateRoute, /APPEARANCE_SCORE_TABLE/)
  assert.match(invalidateRoute, /randomUUID\(\)/)
})

test('database invalidates a private appearance score whenever stored photos change', () => {
  const migration = readSource(
    'supabase/migrations/20260801152500_invalidate_score_on_photo_change.sql',
  )

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.invalidate_private_appearance_score_on_photo_change\(\)/i,
  )
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(migration, /AFTER INSERT OR DELETE OR UPDATE OF storage_path, sort_order/i)
  assert.match(migration, /ON public\.photos/i)
  assert.match(migration, /photo_revision = pg_catalog\.gen_random_uuid\(\)/i)
  assert.match(migration, /status = 'stale'/i)
  assert.match(migration, /score_raw = NULL/i)
  assert.match(migration, /appearance_type = NULL/i)
  assert.match(migration, /confidence_0_1 = NULL/i)
  assert.match(migration, /request_id = NULL/i)
  assert.match(migration, /attempt_count = 0/i)
  assert.match(migration, /storage\.foldername\(OLD\.name\)/i)
  assert.match(migration, /storage\.foldername\(NEW\.name\)/i)
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.invalidate_private_appearance_score_on_photo_change\(\)/i,
  )
})
