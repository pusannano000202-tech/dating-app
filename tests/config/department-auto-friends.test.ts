import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('department friend API returns suggestions without creating active friendships', () => {
  const route = readSource('app/api/friends/department-sync/route.ts')

  assert.match(route, /createSupabaseServerClient/)
  assert.match(route, /\.auth\.getUser\(\)/)
  assert.match(route, /get_department_friend_suggestions/)
  assert.match(route, /normalizeLimit/)
  assert.match(route, /department_friend_discovery_enabled/)
  assert.match(route, /department_suggestions_unavailable/)
  assert.doesNotMatch(route, /sync_department_friendships/)
})

test('Phase 12 migration disables auto-active friendships and hardens the suggestion RPC', () => {
  const migration = readSource(
    'supabase/migrations/20260715155041_phase12_payment_ownership_refund_and_friend_safety.sql',
  )

  assert.match(migration, /REVOKE ALL ON FUNCTION public\.sync_department_friendships\(INT\) FROM authenticated/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_department_friend_suggestions/)
  assert.match(migration, /v_caller := auth\.uid\(\)/)
  assert.match(migration, /SET search_path = ''/)
  assert.match(migration, /public\.profiles/)
  assert.match(migration, /department_friend_discovery_enabled/)
  assert.match(migration, /school_email_verified_at/)
  assert.match(migration, /department_discovery_consent_required/)
  assert.match(migration, /public\.friendships/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_department_friend_suggestions\(INT\) TO authenticated/)
  assert.doesNotMatch(migration, /INSERT INTO public\.friendships[\s\S]*status[\s\S]*active/)
})

test('group and friends surfaces expose same-department suggestions and explicit requests', () => {
  const groupCreate = readSource('app/group/create/page.tsx')
  const friendsPage = readSource('app/friends/page.tsx')
  const panel = readSource('components/matching/group-create/DepartmentAutoFriendPanel.tsx')

  assert.match(groupCreate, /DepartmentAutoFriendPanel/)
  assert.match(friendsPage, /DepartmentAutoFriendPanel/)
  assert.match(panel, /같은 학과/)
  assert.match(panel, /추천 노출 끄기/)
  assert.match(panel, /enabled: true/)
  assert.match(panel, /enabled: false/)
  assert.doesNotMatch(panel, /자동.*친구|친구.*자동/)
  assert.match(panel, /\/api\/friends\/department-sync/)
  assert.match(panel, /\/api\/friend-requests/)
})
