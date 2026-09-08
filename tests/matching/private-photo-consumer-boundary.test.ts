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

function readDoBlock(sql: string, label: string): string {
  const marker = `$${label}$`
  const start = sql.indexOf(`DO ${marker}`)
  const end = sql.indexOf(`${marker};`, start + marker.length)
  assert.notEqual(start, -1, `missing DO ${marker}`)
  assert.notEqual(end, -1, `missing end for DO ${marker}`)
  return sql.slice(start, end + marker.length + 1)
}

test('follow-up migration removes public URL reads from every private photo consumer', () => {
  const migration = readRequiredSource(
    'supabase/deferred-migrations/20260802154500_private_photo_consumers_contract.sql',
  )
  const applyRewrite = readDoBlock(migration, 'rewrite_apply_photo')
  const cohortRewrite = readDoBlock(migration, 'rewrite_cohort_photo')
  const dashboardRewrite = readDoBlock(migration, 'rewrite_dashboard_photo')

  for (const functionName of ['admin_get_user_profile', '_admin_group_members_json']) {
    assert.match(
      migration,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\b`, 'i'),
      `missing latest ${functionName} definition`,
    )
  }

  assert.match(migration, /UPDATE public\.photos[\s\S]*public_url = NULL/i)
  assert.match(migration, /ALTER COLUMN public_url SET DEFAULT NULL/i)
  assert.match(migration, /CHECK \(public_url IS NULL\)/i)
  assert.match(migration, /admin_get_user_profile[\s\S]*ARRAY\[\]::TEXT\[\]/i)
  assert.match(migration, /_admin_group_members_json[\s\S]*'primary_photo_url',\s*NULL/i)
  assert.match(migration, /LEFT JOIN public\.private_appearance_scores AS score/i)
  assert.match(migration, /'effective_score', score\.score_effective/i)
  assert.match(migration, /'score_source',[\s\S]*score\.score_override IS NOT NULL/i)
  assert.match(applyRewrite, /public\.apply_to_campus_seven\(text,date,jsonb,jsonb,boolean,text\)/i)
  assert.match(applyRewrite, /v_needle CONSTANT TEXT := 'profile_photo\.public_url'/i)
  assert.match(applyRewrite, /v_replacement CONSTANT TEXT := 'profile_photo\.storage_path'/i)
  assert.match(applyRewrite, /pg_catalog\.replace\(v_definition, v_needle, v_replacement\)/i)
  assert.match(cohortRewrite, /public\.form_campus_seven_cohort\(text,date,text,text\)/i)
  assert.match(cohortRewrite, /v_needle CONSTANT TEXT := 'profile_photo\.public_url'/i)
  assert.match(cohortRewrite, /v_replacement CONSTANT TEXT := 'profile_photo\.storage_path'/i)
  assert.match(cohortRewrite, /pg_catalog\.replace\(v_definition, v_needle, v_replacement\)/i)
  assert.match(dashboardRewrite, /public\.get_my_campus_seven_dashboard\(\)/i)
  assert.match(dashboardRewrite, /v_needle CONSTANT TEXT := 'participant_photo\.public_url'/i)
  assert.match(dashboardRewrite, /v_replacement CONSTANT TEXT := 'NULL::TEXT'/i)
  assert.match(dashboardRewrite, /pg_catalog\.replace\(v_definition, v_needle, v_replacement\)/i)
  assert.match(migration, /RAISE EXCEPTION 'campus_seven_[a-z_]+_photo_rewrite_failed'/i)
})

test('admin and Campus Seven APIs replace SQL placeholders with signed URLs only on the server', () => {
  const adminUser = readRequiredSource('app/api/admin/users/[id]/route.ts')
  const adminMatch = readRequiredSource('app/api/admin/matches/[id]/route.ts')
  const campusSeven = readRequiredSource('app/api/campus-seven/route.ts')

  for (const route of [adminUser, adminMatch, campusSeven]) {
    assert.match(route, /signPrivateProfilePhotos/)
    assert.doesNotMatch(route, /getPublicUrl|public_url|storage_path/)
    assert.doesNotMatch(route, /console\.(?:log|info|warn|error)/)
    assert.doesNotMatch(route, /error\.message\s*\|\|/)
  }

  assert.match(adminUser, /const profileUserId = profile\.user_id/)
  assert.match(adminUser, /signPrivateProfilePhotos\(\[profileUserId\], 3\)/)
  assert.match(adminUser, /photo_urls:\s*signedPhotos\.urlsByUser\[profileUserId\]\s*\?\?\s*\[\]/)
  assert.doesNotMatch(adminUser, /signPrivateProfilePhotos\(\[params\.id\]/)
  assert.match(adminMatch, /primary_photo_url:/)
  assert.match(campusSeven, /photoUrl:/)
  assert.match(campusSeven, /participants/)
})
