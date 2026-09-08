import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260905150000_weekly_operations_and_continuation_join.sql')

test('weekly window operations are recent-super-admin commands with CAS and idempotency', () => {
  assert.ok(fs.existsSync(migrationPath), 'forward migration must exist')
  const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
  for (const rpc of [
    'admin_list_weekly_activity_windows',
    'admin_create_weekly_activity_window',
    'admin_update_weekly_activity_window',
    'admin_publish_weekly_activity_window',
  ]) assert.match(sql, new RegExp(`create or replace function public\\.${rpc}`, 'i'))
  assert.match(sql, /quantum_private\.require_recent_super_admin_auth\(v_actor\)/i)
  assert.match(sql, /expected_revision[\s\S]*stale_revision/i)
  assert.match(sql, /quantum_weekly_window_commands/i)
  assert.match(sql, /idempotency_key_reused/i)
  assert.match(sql, /status = 'recruiting'/i)
  assert.match(sql, /application_closes_at[\s\S]*starts_at/i)
  assert.match(sql, /revoke all on function public\.admin_/i)
})

test('weekly operator API and page use guarded live commands', () => {
  const route = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/super-admin/match/weekly-windows/route.ts'), 'utf8')
  const ui = fs.readFileSync(path.join(process.cwd(), 'components/matching/WeeklyActivityWindowOperator.tsx'), 'utf8')
  assert.match(route, /allowedRoles: \['super_admin'\]/)
  assert.match(route, /requireRecentAuth: true/)
  assert.match(route, /checkMutationOrigin: true/)
  assert.match(route, /admin_create_weekly_activity_window/)
  assert.match(route, /admin_update_weekly_activity_window/)
  assert.match(route, /admin_publish_weekly_activity_window/)
  assert.match(ui, /모집 공개/)
  assert.match(ui, /expected_revision/)
})

test('weekly assignment binds the chosen window to one exact ready occurrence and roster capacity', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql'), 'utf8')
  assert.match(sql, /quantum_weekly_one_live_application_idx[\s\S]*\(user_id, week_key\)[\s\S]*status in \('active', 'assigned'\)/i)
  const match = sql.match(/create or replace function public\.assign_weekly_application_for_service\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  const rpc = match[0]
  assert.match(rpc, /public\.is_profile_matching_ready\(v_application\.user_id\)/i)
  assert.match(rpc, /event_mode <> 'scheduled'/i)
  assert.match(rpc, /event_id is distinct from v_window\.activity_id/i)
  assert.match(rpc, /starts_at is distinct from v_window\.starts_at/i)
  assert.match(rpc, /ends_at is distinct from v_window\.ends_at/i)
  assert.match(rpc, /application_closes_at is distinct from v_window\.application_closes_at/i)
  assert.match(rpc, /location_name is distinct from v_window\.location_name/i)
  assert.match(rpc, /required_total[\s\S]*v_window\.capacity/i)
  assert.match(rpc, /occurrence_gender_capacity_full/i)
  assert.match(rpc, /private\.quantum_event_room_people\(p_occurrence_id\)/i)
  assert.match(rpc, /insert into public\.quantum_event_participations/i)
  assert.match(rpc, /v_window\.activity_id[\s\S]*'scheduled'[\s\S]*'solo'[\s\S]*p_occurrence_id/i)
  assert.match(rpc, /event_state_locked/i)
  assert.match(rpc, /assignment_idempotency_key = p_idempotency_key/i)
})

test('legacy scheduled-event participation is reachable only through the canonical readiness wrapper', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8')
  const route = fs.readFileSync(path.join(process.cwd(), 'app/api/match/event-participation/route.ts'), 'utf8')
  assert.match(migration, /create or replace function public\.save_my_ready_quantum_event_meeting_moment_and_participate/i)
  assert.match(migration, /public\.is_profile_matching_ready\(v_actor\)/i)
  assert.match(migration, /revoke all on function public\.save_my_quantum_event_meeting_moment_and_participate/i)
  assert.match(route, /save_my_ready_quantum_event_meeting_moment_and_participate/)
})

test('weekly attendance cannot be authored before the scheduled occurrence starts', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql'), 'utf8')
  const match = sql.match(/create or replace function public\.resolve_weekly_attendance_for_service\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  assert.match(match[0], /v_occurrence\.starts_at > pg_catalog\.statement_timestamp\(\)/i)
  assert.match(match[0], /attendance_resolution_not_allowed/i)
})
