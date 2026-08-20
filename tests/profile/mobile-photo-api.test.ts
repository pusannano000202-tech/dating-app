import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const route = readFileSync(path.join(process.cwd(), 'app/api/profile/photos/route.ts'), 'utf8')

test('profile photo API supports cookie and mobile Bearer authentication', () => {
  assert.match(route, /createSupabaseRequestClient\(request\)/)
  assert.match(route, /export async function GET\(request: NextRequest\)/)
  assert.match(route, /export async function POST\(request: NextRequest\)/)
  assert.match(route, /export async function PUT\(request: NextRequest\)/)
  assert.match(route, /export async function DELETE\(request: NextRequest\)/)
})

test('profile photo replacement validates files and keeps storage owner scoped', () => {
  assert.match(route, /MAX_PHOTO_COUNT\s*=\s*3/)
  assert.match(route, /MAX_PHOTO_BYTES\s*=\s*10 \* 1024 \* 1024/)
  assert.match(route, /ALLOWED_PHOTO_TYPES/)
  assert.match(route, /`\$\{userId\}\/\$\{randomUUID\(\)\}-\$\{index\}\.jpg`/)
  assert.match(route, /isOwnedAppearanceStoragePath/)
  assert.match(route, /detectPhotoType/)
  assert.match(route, /photo_content_invalid/)
})

test('profile photo upload strips EXIF and bounds decoded image size before storage', () => {
  assert.match(route, /import sharp from 'sharp'/)
  assert.match(route, /sanitizeProfilePhoto/)
  assert.match(route, /limitInputPixels:\s*40_000_000/)
  assert.match(route, /\.rotate\(\)/)
  assert.match(route, /\.resize\(\{[\s\S]*width:\s*2048[\s\S]*height:\s*2048/)
  assert.match(route, /\.jpeg\(\{[\s\S]*quality:\s*88/)
  assert.match(route, /contentType:\s*'image\/jpeg'/)
})

test('profile photo replacement cleans new objects after a failed metadata write', () => {
  assert.match(route, /insertError/)
  assert.match(route, /uploadedPaths/)
  assert.match(route, /createSupabaseAdminClient/)
  assert.match(route, /cleanupStorage\(admin, uploadedPaths\)/)
  assert.doesNotMatch(route, /\/api\/score/)
  assert.doesNotMatch(route, /requestAppearanceScore/)
})

test('profile photo replacement completes the profile and invalidates any old appearance score server-side', () => {
  const invalidationMigration = readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260801152500_invalidate_score_on_photo_change.sql'),
    'utf8',
  )

  assert.match(route, /is_profile_complete:\s*true/)
  assert.match(invalidationMigration, /status = 'stale'/)
  assert.match(invalidationMigration, /photo_revision = pg_catalog\.gen_random_uuid\(\)/)
})
