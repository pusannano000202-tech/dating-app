import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function migration(): string {
  const name = readdirSync(join(ROOT, 'supabase', 'migrations'))
    .find((entry) => entry.endsWith('_campus_seven_program.sql'))
  assert.ok(name)
  return readFileSync(join(ROOT, 'supabase', 'migrations', name), 'utf8')
}

test('dashboard RPC is the only participant read surface and applies staged identity disclosure', () => {
  const sql = migration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_my_campus_seven_dashboard/i)
  assert.match(sql, /v_day_number >= 5[\s\S]*verified_name/i)
  assert.match(sql, /response = 'accepted'[\s\S]*(department_snapshot|phone)/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_my_campus_seven_dashboard\(\) TO authenticated/i)
})

test('participant mutation RPCs validate ownership and keep sensitive records server-owned', () => {
  const sql = migration()
  const functions = [
    'submit_campus_seven_day_two_choices',
    'update_campus_seven_reservation_task',
    'submit_campus_seven_attendance',
    'submit_campus_seven_interest_vote',
    'submit_campus_seven_date_choice',
    'respond_campus_seven_date_choice',
    'submit_campus_seven_final_proposal',
    'respond_campus_seven_final_proposal',
    'submit_campus_seven_safety_report',
    'set_campus_seven_card_publication',
  ]

  for (const name of functions) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}`, 'i'))
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}[\\s\\S]*FROM PUBLIC`, 'i'))
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[\\s\\S]*TO authenticated`, 'i'))
  }
})

test('safety exit stops future assignments without creating a deposit forfeiture', () => {
  const sql = migration()
  const safetyFunction = sql.match(
    /CREATE OR REPLACE FUNCTION public\.submit_campus_seven_safety_report[\s\S]*?COMMENT ON FUNCTION public\.submit_campus_seven_safety_report/i,
  )?.[0] ?? ''

  assert.match(safetyFunction, /status = 'safety_withdrawn'/i)
  assert.match(safetyFunction, /campus_seven_reservation_tasks[\s\S]*status = 'cancelled'/i)
  assert.doesNotMatch(safetyFunction, /campus_seven_deposit_reviews/i)
  assert.doesNotMatch(safetyFunction, /campus_seven_deposit_holds/i)
})

test('reservation no-action review stays service-only and pending human review', () => {
  const sql = migration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.queue_campus_seven_reservation_reviews/i)
  assert.match(sql, /reminders_sent >= 2/i)
  assert.match(sql, /attempted_at IS NULL/i)
  assert.match(sql, /'reservation_no_action'[\s\S]*10000[\s\S]*'pending_review'/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.queue_campus_seven_reservation_reviews\(\) TO service_role/i)
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.queue_campus_seven_reservation_reviews\(\) TO authenticated/i)
})

test('card access requires same cohort, paid status, and an unexpired 24-hour window', () => {
  const sql = migration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_campus_seven_card/i)
  assert.match(sql, /purchase\.status = 'paid'/i)
  assert.match(sql, /purchase\.access_expires_at > NOW\(\)/i)
  assert.match(sql, /buyer_user_id = v_caller/i)
  assert.match(sql, /day_number IN \(1, 3, 5\)/i)
})

test('service-only cohort formation creates exactly eight verified participants and seven schedules', () => {
  const sql = migration()
  const formFunction = sql.match(
    /CREATE OR REPLACE FUNCTION public\.form_campus_seven_cohort[\s\S]*?GRANT EXECUTE ON FUNCTION public\.form_campus_seven_cohort[\s\S]*?service_role;/i,
  )?.[0] ?? ''

  assert.match(formFunction, /identity_verified_at IS NOT NULL/i)
  assert.match(formFunction, /gender = 'male'[\s\S]*LIMIT 4/i)
  assert.match(formFunction, /gender = 'female'[\s\S]*LIMIT 4/i)
  assert.match(formFunction, /entry_role[\s\S]*'newcomer'/i)
  assert.match(formFunction, /generate_series\(1, 7\)/i)
  assert.doesNotMatch(formFunction, /TO authenticated/i)
})

test('cohort readiness requires paid deposits and seven confirmed venues', () => {
  const sql = migration()
  const startFunction = sql.match(
    /CREATE OR REPLACE FUNCTION public\.mark_campus_seven_cohort_ready[\s\S]*?GRANT EXECUTE ON FUNCTION public\.mark_campus_seven_cohort_ready[\s\S]*?service_role;/i,
  )?.[0] ?? ''

  assert.match(startFunction, /status <> 'paid'/i)
  assert.match(startFunction, /venue_status <> 'confirmed'/i)
  assert.match(startFunction, /COUNT\(\*\)[\s\S]{0,150}<> 7/i)
  assert.doesNotMatch(startFunction, /TO authenticated/i)
})

test('day four rankings lock only after all four teams submit unique ranks', () => {
  const sql = migration()
  const submitFunction = sql.match(
    /CREATE OR REPLACE FUNCTION public\.submit_campus_seven_game_rank[\s\S]*?GRANT EXECUTE ON FUNCTION public\.submit_campus_seven_game_rank[\s\S]*?authenticated;/i,
  )?.[0] ?? ''

  assert.match(submitFunction, /COUNT\(\*\) = 4/i)
  assert.match(submitFunction, /COUNT\(DISTINCT submission\.rank\) = 4/i)
  assert.match(submitFunction, /locked_at/i)
  assert.match(submitFunction, /p_rank BETWEEN 1 AND 4/i)
})

test('participant decisions use the same schedule windows as the dashboard', () => {
  const sql = migration()

  assert.match(sql, /day_number = 2[\s\S]*NOW\(\) < v_schedule\.starts_at[\s\S]*NOW\(\) >= v_schedule\.starts_at \+ INTERVAL '30 minutes'/i)
  assert.match(sql, /day_number = 4[\s\S]*NOW\(\) < v_schedule\.starts_at \+ INTERVAL '155 minutes'[\s\S]*NOW\(\) >= v_schedule\.ends_at \+ INTERVAL '30 minutes'/i)
  assert.match(sql, /day_number = p_day_number[\s\S]*NOW\(\) < v_schedule\.starts_at \+ INTERVAL '155 minutes'[\s\S]*NOW\(\) >= v_schedule\.ends_at \+ INTERVAL '30 minutes'/i)
  assert.match(sql, /day_number = 6[\s\S]*NOW\(\) < v_schedule\.starts_at - INTERVAL '7 hours'[\s\S]*NOW\(\) >= v_schedule\.starts_at - INTERVAL '4 hours'/i)
  assert.match(sql, /starts_at - INTERVAL '2 hours'[\s\S]*date_response_window_closed/i)
  assert.match(sql, /day_number = 7[\s\S]*NOW\(\) < v_schedule\.ends_at[\s\S]*NOW\(\) >= v_schedule\.ends_at \+ INTERVAL '2 hours'/i)
  assert.match(sql, /ends_at \+ INTERVAL '2 hours'[\s\S]*final_response_window_closed/i)
  assert.match(sql, /schedule\.ends_at \+ INTERVAL '2 hours' >= NOW\(\)/i)
})

test('deposit disputes stay pending for human review and no-show detection is service-only', () => {
  const sql = migration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.appeal_campus_seven_deposit_review/i)
  assert.match(sql, /status = 'appealed'/i)
  assert.match(sql, /appeal_deadline < NOW\(\)/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.appeal_campus_seven_deposit_review[\s\S]*TO authenticated/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.queue_campus_seven_no_show_reviews/i)
  assert.match(sql, /'unexcused_no_show'[\s\S]*50000[\s\S]*'pending_review'/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.queue_campus_seven_no_show_reviews\(\) TO service_role/i)
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.queue_campus_seven_no_show_reviews\(\) TO authenticated/i)
})
