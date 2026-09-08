import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260905150000_weekly_operations_and_continuation_join.sql')
const baseMigrationPath = path.join(process.cwd(), 'supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql')

test('new participant proposals require snapshot consent and current readiness', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
  assert.match(sql, /create table public\.quantum_continuation_join_proposals/i)
  assert.match(sql, /create table public\.quantum_continuation_join_consents/i)
  assert.match(sql, /propose_continuation_join_for_admin/i)
  assert.match(sql, /get_my_continuation_join_proposals/i)
  assert.match(sql, /set_my_continuation_join_consent/i)
  assert.match(sql, /cancel_continuation_join_for_admin/i)
  assert.match(sql, /quantum_continuation_join_admin_commands/i)
  assert.match(sql, /public\.is_profile_matching_ready\(p_candidate_user_id\)/i)
  assert.match(sql, /roster_snapshot_hash/i)
  assert.match(sql, /all_join_consents_required/i)
  assert.match(sql, /fee_scope[\s\S]*first_join_occurrence_waived/i)
  assert.match(sql, /fee_waived[\s\S]*true/i)
  assert.match(sql, /visible_from_program_day/i)
  assert.match(sql, /transition_index > 0/i)
})

test('join APIs separate operator proposal from private participant consent', () => {
  const adminRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/super-admin/match/continuation-joins/route.ts'), 'utf8')
  const consentRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/match/series/join-proposals/route.ts'), 'utf8')
  assert.match(adminRoute, /allowedRoles: \['super_admin'\]/)
  assert.match(adminRoute, /requireRecentAuth: true/)
  assert.match(adminRoute, /propose_continuation_join_for_admin/)
  assert.match(adminRoute, /cancel_continuation_join_for_admin/)
  assert.match(consentRoute, /set_my_continuation_join_consent/)
  assert.doesNotMatch(consentRoute, /service_role|admin/i)
})

test('accepted candidate is included in the pre-insert minimum and mixed-roster check', () => {
  const baseSql = fs.readFileSync(baseMigrationPath, 'utf8').replace(/\r\n/g, '\n')
  const forwardSql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
  const open = baseSql.match(/create or replace function public\.open_continuation_transition\(([\s\S]*?)\n\$\$;/i)
  assert.ok(open)
  assert.match(baseSql, /quantum_private\.continuation_join_candidate_ids/i)
  assert.match(open[0], /v_effective_member_ids[\s\S]*continuation_join_candidate_ids/i)
  assert.match(open[0], /cardinality\(v_effective_member_ids\)/i)
  assert.match(open[0], /unnest\(v_effective_member_ids\)/i)
  const helper = forwardSql.match(/create or replace function quantum_private\.continuation_join_candidate_ids\(([\s\S]*?)\n\$\$;/i)
  assert.ok(helper)
  assert.match(helper[0], /status = 'accepted'/i)
  assert.match(helper[0], /for update/i)
})

test('candidate has an authenticated proposal-only page and receives its private deep link', () => {
  const forwardSql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
  const component = fs.readFileSync(path.join(process.cwd(), 'components/matching/ContinuationJoinConsentCard.tsx'), 'utf8')
  const pagePath = path.join(process.cwd(), 'app/match/series/join/page.tsx')
  assert.ok(fs.existsSync(pagePath))
  assert.match(component, /seriesId\?: string/)
  assert.match(component, /seriesId \?[^\n]*filter/i)
  assert.match(forwardSql, /insert into public\.notifications[\s\S]*\/match\/series\/join/i)
  assert.match(fs.readFileSync(pagePath, 'utf8'), /ContinuationJoinConsentCard/)
})

test('every authoritative weekly roster source mutation invalidates a registered continuation source', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
  const trigger = sql.match(/create or replace function quantum_private\.invalidate_continuation_from_weekly_source\(([\s\S]*?)\n\$\$;/i)
  assert.ok(trigger)
  assert.match(trigger[0], /tg_op = 'DELETE'[\s\S]*old/i)
  assert.match(trigger[0], /tg_op in \('INSERT', 'UPDATE'\)[\s\S]*new/i)
  assert.match(sql, /trg_invalidate_continuation_from_weekly_occurrence[\s\S]*update of roster_revision[\s\S]*quantum_event_occurrences/i)
  assert.match(sql, /trg_invalidate_continuation_from_weekly_match_member_change[\s\S]*insert or delete[\s\S]*quantum_event_match_members/i)
  assert.match(sql, /trg_invalidate_continuation_from_weekly_match_member_update[\s\S]*update of occurrence_id, user_id[\s\S]*quantum_event_match_members/i)
  assert.match(sql, /trg_invalidate_continuation_from_weekly_attendance_change[\s\S]*insert or delete[\s\S]*quantum_weekly_attendance_resolutions/i)
})
