import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readCampusSevenMigration(): string {
  const migrationName = readdirSync(join(ROOT, 'supabase', 'migrations'))
    .find((name) => name.endsWith('_campus_seven_program.sql'))

  assert.ok(migrationName, 'campus seven migration must exist')
  return readFileSync(join(ROOT, 'supabase', 'migrations', migrationName), 'utf8')
}

function readSchoolEmailRetirementMigration(): string {
  const migrationName = readdirSync(join(ROOT, 'supabase', 'migrations'))
    .find((name) => name.endsWith('_retire_school_email_gate.sql'))

  assert.ok(migrationName, 'school email retirement migration must exist')
  return readFileSync(join(ROOT, 'supabase', 'migrations', migrationName), 'utf8')
}

test('campus seven database keeps identity and cohort participation in separate tables', () => {
  const migration = readCampusSevenMigration()
  const enrollmentTable = migration.match(
    /CREATE TABLE public\.campus_seven_enrollments[\s\S]*?\n\);/i,
  )?.[0] ?? ''

  assert.match(migration, /CREATE TABLE public\.campus_seven_cohorts/i)
  assert.match(migration, /CREATE TABLE public\.campus_seven_enrollments/i)
  assert.match(migration, /CREATE TABLE public\.campus_seven_private_profiles/i)
  assert.match(migration, /submitted_name TEXT NOT NULL/i)
  assert.match(migration, /verified_name TEXT/i)
  assert.match(migration, /identity_verified_at IS NULL OR verified_name IS NOT NULL/i)
  assert.match(migration, /date_of_birth DATE NOT NULL/i)
  assert.doesNotMatch(enrollmentTable, /verified_name/i)
})

test('all campus seven user data tables enable RLS and deny direct anonymous access', () => {
  const migration = readCampusSevenMigration()
  const tables = [
    'campus_seven_cohorts',
    'campus_seven_applications',
    'campus_seven_enrollments',
    'campus_seven_private_profiles',
    'campus_seven_daily_schedules',
    'campus_seven_reservation_tasks',
    'campus_seven_attendance_evidence',
    'campus_seven_interest_votes',
    'campus_seven_game_rank_submissions',
    'campus_seven_game_results',
    'campus_seven_date_choices',
    'campus_seven_final_choices',
    'campus_seven_safety_reports',
    'campus_seven_deposit_reviews',
    'campus_seven_card_publications',
    'campus_seven_card_purchases',
  ]

  for (const table of tables) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
    assert.match(migration, new RegExp(`REVOKE ALL ON public\\.${table} FROM anon, authenticated`, 'i'))
  }
})

test('campus seven RPCs are authenticated, search-path hardened, and enforce eligibility', () => {
  const migration = readCampusSevenMigration()

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.apply_to_campus_seven/i)
  assert.match(migration, /v_school_verified_at IS NULL/i)
  assert.match(migration, /date_of_birth > CURRENT_DATE - INTERVAL '19 years'/i)
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.apply_to_campus_seven[\s\S]*FROM PUBLIC/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.apply_to_campus_seven[\s\S]*TO authenticated/i)
})

test('database settings keep applications, pilot school, and card payments closed independently of the web app', () => {
  const migration = readCampusSevenMigration()

  assert.match(migration, /CREATE TABLE public\.campus_seven_program_settings/i)
  assert.match(migration, /applications_open BOOLEAN NOT NULL DEFAULT FALSE/i)
  assert.match(migration, /card_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE/i)
  assert.match(migration, /max_active_cohorts INT NOT NULL DEFAULT 1/i)
  assert.match(migration, /application_window_closed/i)
  assert.match(migration, /card_payments_not_approved/i)
  assert.match(migration, /pilot_school/i)
  assert.match(migration, /REVOKE ALL ON public\.campus_seven_program_settings FROM anon, authenticated/i)
})

test('financial records cannot automatically forfeit deposits or enable card checkout', () => {
  const migration = readCampusSevenMigration()

  assert.match(migration, /amount_won INT NOT NULL CHECK \(amount_won IN \(10000, 50000\)\)/i)
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'pending_review'/i)
  assert.match(migration, /price_won INT NOT NULL DEFAULT 1000 CHECK \(price_won = 1000\)/i)
  assert.match(migration, /access_expires_at TIMESTAMPTZ/i)
  assert.doesNotMatch(migration, /UPDATE public\.deposits[\s\S]{0,200}(forfeited|compensated)/i)
})

test('attendance evidence uses a private bucket and scheduled deletion', () => {
  const migration = readCampusSevenMigration()

  assert.match(migration, /campus-seven-attendance/i)
  assert.match(migration, /public\s*=\s*FALSE/i)
  assert.match(migration, /delete_after TIMESTAMPTZ NOT NULL/i)
  assert.match(migration, /storage\.objects/i)
  assert.match(migration, /bucket_id = 'campus-seven-attendance'/i)
})

test('campus seven uses the existing primary profile photo only for active visible cohort members', () => {
  const migration = readCampusSevenMigration()

  assert.match(migration, /'photoUrl'/)
  assert.match(migration, /FROM public\.photos AS participant_photo/i)
  assert.match(migration, /participant_photo\.sort_order = 0/i)
  assert.match(migration, /participant\.status IN \('active', 'completed'\)/i)
  assert.doesNotMatch(migration, /participant\.status IN \('active', 'completed', 'safety_withdrawn'\)/i)
  assert.match(migration, /profile_photo_required/i)
})

test('application consent explicitly covers representative photo display inside the cohort', () => {
  const migration = readSchoolEmailRetirementMigration()

  assert.match(migration, /"cohort_photo_display": true/i)
  assert.match(migration, /"adult_eligibility": true/i)
  assert.match(migration, /p_consent_version TEXT DEFAULT 'campus-seven-v3'/i)
  assert.doesNotMatch(migration, /school_verification_required/i)
})
