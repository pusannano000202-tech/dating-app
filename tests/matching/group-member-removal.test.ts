import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

function readSource(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

function readAllMigrations(): string {
  return readdirSync(join(repoRoot, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => `\n-- ${name}\n${readSource(`supabase/migrations/${name}`)}`)
    .join('\n')
}

test('leader member removal has an API route and database RPC', () => {
  assert.equal(existsSync(join(repoRoot, 'app/api/groups/remove-member/route.ts')), true)

  const route = readSource('app/api/groups/remove-member/route.ts')
  assert.match(route, /rpc\('remove_group_member'/)
  assert.match(route, /member_user_id_required/)

  const migrations = readAllMigrations()
  assert.match(migrations, /CREATE OR REPLACE FUNCTION public\.remove_group_member/)
  assert.match(migrations, /p_member_user_id UUID/)
  assert.match(migrations, /not_group_leader/)
  assert.match(migrations, /cannot_remove_self/)
  assert.match(migrations, /cannot_remove_leader/)
  assert.match(migrations, /v_member\.role = 'leader'/)
  assert.match(migrations, /UPDATE group_members AS gm\s+SET left_at = v_now/)
})

test('member removal is exposed as a real member-card action, not a preview button', () => {
  const page = readSource('app/group/create/page.tsx')
  const panel = readSource('components/matching/group-create/GroupMemberStatusPanel.tsx')
  const queuePanel = readSource('components/matching/group-create/FreeBetaQueuePanel.tsx')
  const types = readSource('components/matching/group-create/types.ts')
  const route = readSource('app/api/groups/route.ts')

  assert.doesNotMatch(page, /친구가 그룹을 나간 상황 보기/)
  assert.doesNotMatch(page, /simulateFriendLeaving/)
  assert.doesNotMatch(panel, /친구가 나가면/)
  assert.doesNotMatch(queuePanel, /친구가 나가면/)
  assert.match(page, /\/api\/groups\/remove-member/)
  assert.match(panel, /내보내기/)
  assert.match(panel, /그룹에서 내보내기/)
  assert.match(panel, /aria-label=\{`\$\{name\}를 그룹에서 내보내기`\}/)
  assert.match(panel, /대기 중이면 큐는 자동 취소됩니다/)
  assert.match(panel, /onRemoveMember\(member\)/)
  assert.match(panel, /친구 관리/)
  assert.match(panel, /길게 누르/)
  assert.match(panel, /onPointerDown/)
  assert.match(panel, /window\.setTimeout/)
  assert.match(panel, /이 그룹 자리만 비워요/)
  assert.match(panel, /성별 구성/)
  assert.match(types, /gender\?: 'male' \| 'female' \| null/)
  assert.match(route, /gender: 'male' \| 'female' \| null/)
  assert.match(route, /gender: row\.gender/)
})

test('group member summary exposes only safe active-member gender for composition UI', () => {
  const migrations = readAllMigrations()
  const latestMigration = readSource('supabase/migrations/20260623120000_group_member_gender_summary.sql')

  assert.match(latestMigration, /DROP FUNCTION IF EXISTS public\.get_group_member_summaries\(UUID\)/)
  assert.match(latestMigration, /CREATE OR REPLACE FUNCTION public\.get_group_member_summaries/)
  assert.match(latestMigration, /gender TEXT/)
  assert.match(latestMigration, /p\.gender::TEXT/)
  assert.match(latestMigration, /gm\.left_at IS NULL/)
  assert.match(migrations, /p\.gender::TEXT/)
})

test('removing a group member cancels ready queue state and reopens the group', () => {
  const migrations = readAllMigrations()

  assert.match(migrations, /UPDATE match_pool AS mp\s+SET status = 'cancelled'/)
  assert.match(migrations, /UPDATE groups AS g\s+SET status = 'forming'/)
})

test('admin match review accepts mixed composition labels', () => {
  const adminReviewPage = readSource('app/admin/matches/review/page.tsx')
  const migrations = readAllMigrations()

  assert.match(adminReviewPage, /type GroupCompositionGender = 'male' \| 'female' \| 'mixed'/)
  assert.match(adminReviewPage, /formatGroupComposition\(m\.group_a_gender\)/)
  assert.match(adminReviewPage, /case 'mixed': return '혼성'/)
  assert.match(migrations, /public\.get_group_composition_gender\(m\.group_a_id\)/)
  assert.match(migrations, /public\.get_group_composition_gender\(m\.group_b_id\)/)
})

test('queue and match display composition is calculated from active member genders', () => {
  const migrations = readAllMigrations()

  assert.match(migrations, /CREATE OR REPLACE FUNCTION public\.get_group_composition_gender/)
  assert.match(migrations, /WHEN male_members > 0 AND female_members > 0 THEN 'mixed'/)
  assert.match(migrations, /public\.get_group_composition_gender\(mp\.group_id\)/)
  assert.match(migrations, /public\.get_group_composition_gender\(CASE WHEN/)
  assert.match(migrations, /LEFT JOIN public\.profiles p\s+ON p\.user_id = gm\.user_id/)
  assert.doesNotMatch(migrations, /opp_group_gender,\s+CASE WHEN[\s\S]+?THEN g[ab]\.gender/)
})
