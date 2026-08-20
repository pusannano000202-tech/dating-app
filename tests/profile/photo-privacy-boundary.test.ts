import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readRequiredSource(path: string) {
  const absolutePath = join(ROOT, path)
  assert.equal(existsSync(absolutePath), true, `${path} must exist`)
  return readFileSync(absolutePath, 'utf8')
}

test('profile photo expand migration keeps legacy clients working before the private contract step', () => {
  const migration = readRequiredSource(
    'supabase/migrations/20260801152000_make_profile_photos_private.sql',
  )

  assert.match(migration, /ALTER TABLE public\.photos[\s\S]*ALTER COLUMN public_url DROP NOT NULL/)
  assert.match(migration, /VALUES\s*\(\s*'photos',\s*'photos',\s*true,/)
  assert.doesNotMatch(migration, /public = false/)

  for (const action of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY profile_photos_${action.toLowerCase()}_own[\\s\\S]*FOR ${action} TO authenticated[\\s\\S]*bucket_id = 'photos'[\\s\\S]*storage\\.foldername\\(name\\)[\\s\\S]*auth\\.uid\\(\\)`,
      ),
      `${action} must remain restricted to the authenticated owner's folder`,
    )
  }
})

test('deferred photo contract makes the bucket private after the application cutover', () => {
  const migration = readRequiredSource(
    'supabase/deferred-migrations/20260802154500_private_photo_consumers_contract.sql',
  )

  assert.match(migration, /UPDATE storage\.buckets[\s\S]*public = false[\s\S]*WHERE id = 'photos'/)
  assert.match(migration, /DROP POLICY IF EXISTS ["']?public_read["']? ON storage\.objects/)
  assert.doesNotMatch(migration, /CREATE POLICY\s+["']?public_read["']?/)
})

test('active photo security migration shuts down unauthenticated public object downloads', () => {
  const migration = readRequiredSource(
    'supabase/migrations/20260813181000_profile_photo_public_read_shutdown.sql',
  )

  assert.match(migration, /UPDATE storage\.buckets[\s\S]*public = false[\s\S]*WHERE id = 'photos'/)
  assert.match(migration, /DROP POLICY IF EXISTS public_read ON storage\.objects/)
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS profile_photos_select_own/)
})

test('server-only photo cutover removes direct authenticated metadata and object writes', () => {
  const migration = readRequiredSource(
    'supabase/migrations/20260813221000_profile_photo_server_write_only.sql',
  )

  assert.match(migration, /DROP POLICY IF EXISTS "owner_rw" ON public\.photos/i)
  assert.match(migration, /CREATE POLICY photos_select_own[\s\S]*FOR SELECT[\s\S]*TO authenticated/i)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.photos FROM authenticated/i)
  assert.match(migration, /REVOKE ALL ON TABLE public\.photos FROM service_role/i)
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.photos TO service_role/i,
  )
  for (const policy of ['insert', 'update', 'delete']) {
    assert.match(
      migration,
      new RegExp(`DROP POLICY IF EXISTS profile_photos_${policy}_own ON storage\\.objects`, 'i'),
    )
  }
  assert.doesNotMatch(migration, /CREATE POLICY profile_photos_(?:insert|update|delete)_own/i)
  assert.match(migration, /GRANT USAGE ON SCHEMA storage TO service_role/i)
  assert.match(migration, /GRANT SELECT ON TABLE storage\.buckets TO service_role/i)
  assert.match(
    migration,
    /GRANT SELECT, INSERT, DELETE ON TABLE storage\.objects TO service_role/i,
  )
  assert.match(migration, /REVOKE UPDATE ON TABLE storage\.objects FROM service_role/i)
  assert.doesNotMatch(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE storage\.objects TO service_role/i,
  )
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS photos_user_sort_order_unique/i)
})

test('photo changes invalidate the private score using the canonical model version column', () => {
  const migration = readRequiredSource(
    'supabase/migrations/20260801152500_invalidate_score_on_photo_change.sql',
  )

  assert.match(migration, /model_version/)
  assert.doesNotMatch(migration, /model_id/)
  assert.match(migration, /AFTER UPDATE OR DELETE\s+ON storage\.objects/i)
  assert.match(migration, /OLD\.bucket_id = 'photos'/i)
  assert.match(migration, /storage\.foldername\(OLD\.name\)/i)
})

test('signed photo URL API authenticates, checks row and path ownership, and returns only five-minute URLs', () => {
  const route = readRequiredSource('app/api/profile/photos/route.ts')

  assert.match(route, /createSupabaseRequestClient\(request\)/)
  assert.match(route, /auth\.getUser\(\)/)
  assert.match(route, /authError \|\| !user/)
  assert.match(route, /jsonError\(['"]unauthorized['"],\s*401\)/)
  assert.match(route, /\.from\(['"]photos['"]\)/)
  assert.match(route, /\.select\(['"]storage_path,sort_order['"]\)/)
  assert.match(route, /\.eq\(['"]user_id['"],\s*userId\)/)
  assert.match(route, /isOwnedAppearanceStoragePath\(photo\.storage_path, userId\)/)
  assert.match(route, /const SIGNED_URL_TTL_SECONDS = 5 \* 60/)
  assert.match(route, /createSignedUrl\(photo\.storage_path, SIGNED_URL_TTL_SECONDS\)/)
  assert.match(route, /photos:\s*safeItems\.map\(\(item\) => item\.signed_url\)/)
  assert.match(route, /Cache-Control['"]?:\s*['"]private, no-store['"]/)
  assert.doesNotMatch(route, /createAppearanceServiceClient|service_role|SUPABASE_SERVICE_ROLE/)
  assert.doesNotMatch(route, /console\.(?:log|info|warn|error)/)
  assert.doesNotMatch(route, /error\.message/)
  assert.match(route, /photo_storage_cleanup_failed/)
  assert.match(route, /const \{ error \} = await supabase\.storage\.from\(STORAGE_BUCKET\)\.remove\(paths\)/)
})

test('profile photo page stores paths, loads signed URLs, and Next Image permits only the signed object route', () => {
  const page = readRequiredSource('app/profile/photos/page.tsx')
  const nextConfig = readRequiredSource('next.config.mjs')

  assert.match(page, /fetch\(['"]\/api\/profile\/photos['"]/)
  assert.match(page, /method:\s*['"]PUT['"]/)
  assert.match(page, /FormData/)
  assert.doesNotMatch(page, /\.storage[\s\S]*\.upload\(/)
  assert.doesNotMatch(page, /\.from\(['"]photos['"]\)[\s\S]*\.insert\(/)
  assert.doesNotMatch(page, /photo_\$\{idx\}/)
  assert.doesNotMatch(page, /getPublicUrl/)
  assert.doesNotMatch(page, /\.select\(['"]public_url['"]\)/)
  assert.doesNotMatch(page, /public_url:\s*/)
  assert.match(nextConfig, /pathname:\s*['"]\/storage\/v1\/object\/sign\/\*\*['"]/)
})
