import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903000100_tonight_settlement_automation.sql',
)

test('Tonight settlement automation lists only confirmed unreconciled teams for service workers', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'settlement automation migration must exist')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.service_list_tonight_unsettled_teams\s*\(/i)
  assert.match(sql, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
  assert.match(sql, /auth\.role\(\)[\s\S]*?service_role_required/i)
  assert.match(sql, /tonight_partner_service_confirmations/i)
  assert.match(sql, /NOT EXISTS[\s\S]*?tonight_settlements/i)
  assert.match(sql, /confirmed_attendee_count[\s\S]*?tonight_attendance[\s\S]*?status = 'arrived'/i)
  assert.match(sql, /LIMIT LEAST\(GREATEST\(p_limit, 1\), 100\)/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.service_list_tonight_unsettled_teams/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.service_list_tonight_unsettled_teams[\s\S]*?TO service_role/i)
})

test('admins can see a service-confirmed team until its settlement is finalized', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.admin_get_tonight_settlement_exceptions\s*\(/i)
  assert.match(sql, /public\.is_admin\(v_caller\)/i)
  assert.match(sql, /'settlement_finalize_pending'::TEXT/i)
  assert.match(sql, /NOT EXISTS[\s\S]*?tonight_settlements/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_get_tonight_settlement_exceptions[\s\S]*?TO authenticated/i)
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.admin_get_tonight_settlement_exceptions[\s\S]*?TO anon/i)
})
