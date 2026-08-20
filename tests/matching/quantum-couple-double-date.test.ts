import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

test('couple double date stays separate from the five-person singles catalog', () => {
  const discovery = read('components/matching/QuantumMatchDiscovery.tsx')
  const spotlight = read('components/matching/QuantumCoupleDoubleDateSpotlight.tsx')
  const catalog = read('lib/matching/quantum-event-catalog.ts')

  assert.match(discovery, /QuantumCoupleDoubleDateSpotlight/)
  assert.match(discovery, /mode === 'scheduled'/)
  assert.match(spotlight, /커플 2팀 · 총 4명/)
  assert.match(spotlight, /event-couple-double-date\.png/)
  assert.match(spotlight, /실제 참가자 사진 아님/)
  assert.doesNotMatch(catalog, /couple-double-date/)
})

test('couple flow requires partner consent and never exposes the opponent profile', () => {
  const page = read('app/match/couples/double-date/page.tsx')
  const component = read('components/matching/QuantumCoupleDoubleDate.tsx')
  const route = read('app/api/match/couple-parties/route.ts')
  const acceptRoute = read('app/api/match/couple-parties/accept/route.ts')

  assert.match(page, /QuantumCoupleDoubleDate/)
  assert.match(component, /파트너 수락/)
  assert.match(component, /상대 커플 프로필은 만남 종료 후/)
  assert.match(component, /setInterval/)
  assert.match(route, /create_quantum_couple_party/)
  assert.match(route, /get_my_quantum_couple_party/)
  assert.match(acceptRoute, /accept_quantum_couple_party/)
  assert.doesNotMatch(component, /opponent.*photo|opponent.*display_name/i)
})

test('couple database contract is pair based, private, and atomically forms four people', () => {
  const migration = read('supabase/migrations/20260813222000_matching_quantum_couple_double_date.sql')
  const statusFunction = migration.match(
    /CREATE OR REPLACE FUNCTION public\.get_my_quantum_couple_party\(\)[\s\S]*?\n\$\$;/,
  )?.[0]

  assert.ok(statusFunction)
  assert.match(migration, /CREATE TABLE public\.quantum_couple_parties/)
  assert.match(migration, /CREATE TABLE public\.quantum_couple_matches/)
  assert.match(migration, /partner_user_id UUID NOT NULL/)
  assert.match(migration, /school_scope TEXT NOT NULL/)
  assert.match(migration, /school_scope_mismatch/)
  assert.match(migration, /candidate\.school_scope = v_party\.school_scope/)
  assert.match(migration, /active_friendship_required/)
  assert.match(migration, /partner_consent_required/)
  assert.match(migration, /FOR UPDATE SKIP LOCKED/)
  assert.match(migration, /expire_quantum_couple_parties/)
  assert.match(migration, /complete_due_quantum_couple_matches/)
  assert.match(migration, /INSERT INTO public\.friendships/)
  assert.match(migration, /app\.bypass_notifications_guard/)
  assert.match(migration, /CHECK \(participant_count = 4\)/)
  assert.equal(
    (migration.match(/REFERENCES public\.quantum_couple_parties\(id\) ON DELETE CASCADE/g) ?? []).length,
    2,
  )
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.quantum_couple_parties FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /SET search_path = ''/)
  assert.match(statusFunction, /STABLE/)
  assert.doesNotMatch(
    statusFunction,
    /expire_quantum_couple_parties|complete_due_quantum_couple_matches|\b(?:UPDATE|INSERT|DELETE)\b/,
  )
  assert.doesNotMatch(migration, /opponent_(display_name|photo_url)/)
})

test('couple cleanup is cron-only and restores transaction-local guard settings', () => {
  const migration = read('supabase/migrations/20260813222000_matching_quantum_couple_double_date.sql')
  const compactMigration = migration.replace(/\s+/g, ' ')

  assert.match(migration, /^BEGIN;/)
  assert.match(migration, /COMMIT;\s*$/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.cleanup_quantum_couple_state/)
  assert.match(migration, /SELECT public\.cleanup_quantum_couple_state\(\);/)
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.cleanup_quantum_couple_state\(TIMESTAMPTZ\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.cleanup_quantum_couple_state\(TIMESTAMPTZ\)[\s\S]*TO service_role/,
  )
  assert.match(migration, /v_previous_notifications_guard TEXT :=[\s\S]*current_setting\('app\.bypass_notifications_guard', TRUE\)/)
  assert.match(migration, /v_previous_friendships_guard TEXT :=[\s\S]*current_setting\('app\.bypass_friendships_guard', TRUE\)/)
  assert.match(
    compactMigration,
    /set_config\(\s*'app\.bypass_notifications_guard',\s*COALESCE\(v_previous_notifications_guard, ''\),\s*TRUE\s*\)/,
  )
  assert.match(
    compactMigration,
    /set_config\(\s*'app\.bypass_friendships_guard',\s*COALESCE\(v_previous_friendships_guard, ''\),\s*TRUE\s*\)/,
  )
  assert.match(migration, /EXCEPTION\s+WHEN OTHERS THEN[\s\S]*RAISE;/)
  assert.doesNotMatch(migration, /set_config\('app\.bypass_(?:notifications|friendships)_guard', 'off', TRUE\)/)
})

test('deleting one matched couple member cannot strand the opposite party as matched', () => {
  const migration = read('supabase/migrations/20260813222000_matching_quantum_couple_double_date.sql')

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.release_quantum_couple_counterparty_before_delete\(\)/,
  )
  assert.match(
    migration,
    /BEFORE DELETE ON public\.quantum_couple_parties[\s\S]*release_quantum_couple_counterparty_before_delete/,
  )
  assert.match(
    migration,
    /SET status = 'cancelled',[\s\S]*WHERE counterpart\.id <> OLD\.id[\s\S]*OLD\.status = 'matched'/,
  )
})
