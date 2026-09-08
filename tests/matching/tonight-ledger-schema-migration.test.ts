import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const predecessor = '20260902201245'

function readMigration(suffix: string): { filename: string; sql: string } {
  const filenames = readdirSync(migrationsDir).filter((entry) =>
    new RegExp(`^\\d{14}_${suffix}\\.sql$`).test(entry),
  )
  assert.equal(filenames.length, 1, `expected one ${suffix} migration`)
  const [filename] = filenames
  assert.ok(filename.slice(0, 14) > predecessor, `${suffix} must follow ${predecessor}`)
  return { filename, sql: readFileSync(join(migrationsDir, filename), 'utf8') }
}

function readTable(sql: string, qualifiedName: string): string {
  const start = sql.search(new RegExp(`CREATE TABLE ${qualifiedName.replace('.', '\\.')}\\b`, 'i'))
  assert.notEqual(start, -1, `missing table ${qualifiedName}`)
  const end = sql.indexOf('\n);', start)
  assert.notEqual(end, -1, `missing end of table ${qualifiedName}`)
  return sql.slice(start, end + 3)
}

test('Tonight uses dedicated round, application, friend, team, and venue-capacity ledgers', () => {
  const { sql } = readMigration('tonight_ledger_schema')

  for (const table of [
    'tonight_market_memberships',
    'tonight_rounds',
    'tonight_round_activities',
    'tonight_friend_bundles',
    'tonight_friend_bundle_members',
    'tonight_applications',
    'tonight_application_choices',
    'tonight_venue_capacities',
    'tonight_teams',
    'tonight_team_members',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}\\b`, 'i'))
  }

  assert.doesNotMatch(sql, /ALTER TABLE public\.(?:groups|matches|deposits)\b/i)
  assert.doesNotMatch(sql, /REFERENCES public\.(?:groups|matches|deposits)\b/i)
})

test('market eligibility is an operator-issued revocable ledger, never a self-selected profile field', () => {
  const { sql } = readMigration('tonight_ledger_schema')
  const membership = readTable(sql, 'public.tonight_market_memberships')

  assert.match(membership, /market_code TEXT NOT NULL/i)
  assert.match(membership, /user_id UUID NOT NULL REFERENCES public\.users\(id\)/i)
  assert.match(membership, /granted_by UUID NOT NULL REFERENCES public\.users\(id\)/i)
  assert.match(membership, /revoked_by UUID REFERENCES public\.users\(id\)/i)
  assert.match(membership, /revoked_at TIMESTAMPTZ/i)
  assert.match(membership, /revision INTEGER NOT NULL DEFAULT 0/i)
  assert.match(
    sql,
    /CREATE UNIQUE INDEX tonight_market_memberships_one_active[\s\S]*?\(market_code, user_id\)[\s\S]*?WHERE revoked_at IS NULL/i,
  )
  assert.doesNotMatch(membership, /school_email|profiles\.school/i)
})

test('composite foreign keys make round, bundle, team, application, and capacity relations non-crossable', () => {
  const { sql } = readMigration('tonight_ledger_schema')

  assert.match(
    sql,
    /CREATE TABLE public\.tonight_applications[\s\S]*?FOREIGN KEY \(round_id, bundle_id\)[\s\S]*?REFERENCES public\.tonight_friend_bundles\(round_id, id\)/i,
  )
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_applications[\s\S]*?UNIQUE \(id, bundle_id\)/i,
  )
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_friend_bundle_members[\s\S]*?FOREIGN KEY \(application_id, bundle_id\)[\s\S]*?REFERENCES public\.tonight_applications\(id, bundle_id\)/i,
  )
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_venue_capacities[\s\S]*?UNIQUE \(id, round_id, activity_id\)/i,
  )
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_teams[\s\S]*?FOREIGN KEY \(venue_capacity_id, round_id, activity_id\)[\s\S]*?REFERENCES public\.tonight_venue_capacities\(id, round_id, activity_id\)/i,
  )
  assert.match(
    sql,
    /ALTER TABLE public\.venue_snapshots[\s\S]*?UNIQUE \(id, venue_id\)/i,
  )
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_venue_capacities[\s\S]*?FOREIGN KEY \(venue_snapshot_id, venue_id\)[\s\S]*?REFERENCES public\.venue_snapshots\(id, venue_id\)/i,
  )
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_team_members[\s\S]*?round_id UUID NOT NULL[\s\S]*?FOREIGN KEY \(team_id, round_id\)[\s\S]*?REFERENCES public\.tonight_teams\(id, round_id\)[\s\S]*?FOREIGN KEY \(application_id, round_id\)[\s\S]*?REFERENCES public\.tonight_applications\(id, round_id\)/i,
  )

  const acceptance = readTable(sql, 'public.tonight_partner_acceptances')
  assert.match(
    acceptance,
    /FOREIGN KEY \(team_id, venue_capacity_id\)[\s\S]*?REFERENCES public\.tonight_teams\(id, venue_capacity_id\)/i,
  )
  assert.match(
    acceptance,
    /FOREIGN KEY \(venue_capacity_id, venue_snapshot_id\)[\s\S]*?REFERENCES public\.tonight_venue_capacities\(id, venue_snapshot_id\)/i,
  )

  const confirmation = readTable(sql, 'public.tonight_partner_service_confirmations')
  assert.match(confirmation, /venue_capacity_id UUID NOT NULL/i)
  assert.match(
    confirmation,
    /FOREIGN KEY \(team_id, venue_capacity_id\)[\s\S]*?REFERENCES public\.tonight_teams\(id, venue_capacity_id\)/i,
  )
  assert.match(
    confirmation,
    /FOREIGN KEY \(venue_capacity_id, venue_id\)[\s\S]*?REFERENCES public\.tonight_venue_capacities\(id, venue_id\)/i,
  )

  const settlement = readTable(sql, 'public.tonight_settlements')
  assert.match(
    settlement,
    /FOREIGN KEY \(team_id, venue_id\)[\s\S]*?REFERENCES public\.tonight_partner_service_confirmations\(team_id, venue_id\)/i,
  )
})

test('round gates are absolute KST-safe timestamptz values and activities have exactly three slots', () => {
  const { sql } = readMigration('tonight_ledger_schema')
  const rounds = readTable(sql, 'public.tonight_rounds')

  assert.match(sql, /service_timezone TEXT NOT NULL DEFAULT 'Asia\/Seoul'/i)
  for (const column of [
    'signup_open_at',
    'signup_close_at',
    'capacity_lock_at',
    'allocation_publish_at',
    'deposit_due_at',
    'partner_acceptance_due_at',
    'reveal_at',
    'arrival_at',
    'starts_at',
  ]) {
    assert.match(sql, new RegExp(`${column} TIMESTAMPTZ NOT NULL`, 'i'))
  }
  assert.match(
    sql,
    /signup_open_at < signup_close_at[\s\S]*?signup_close_at <= capacity_lock_at[\s\S]*?capacity_lock_at <= allocation_publish_at[\s\S]*?allocation_publish_at < deposit_due_at[\s\S]*?deposit_due_at < partner_acceptance_due_at[\s\S]*?partner_acceptance_due_at <= reveal_at[\s\S]*?reveal_at <= arrival_at[\s\S]*?arrival_at < starts_at/i,
  )
  assert.match(
    sql,
    /slot SMALLINT NOT NULL CHECK \(slot BETWEEN 1 AND 3\)[\s\S]*?UNIQUE \(round_id, slot\)/i,
  )
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_round_activities[\s\S]*?image_url TEXT NOT NULL[\s\S]*?btrim\(image_url\)/i,
  )
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_round_activities[\s\S]*?duration_minutes SMALLINT NOT NULL CHECK \(duration_minutes BETWEEN 30 AND 240\)/i,
  )
  assert.match(rounds, /created_by UUID REFERENCES public\.users\(id\)/i)
  assert.match(rounds, /created_by_kind TEXT NOT NULL/i)
  assert.match(rounds, /created_by_kind = 'service'/i)
})

test('applications snapshot three ranked choices and private matching features separately', () => {
  const { sql } = readMigration('tonight_ledger_schema')
  const applications = readTable(sql, 'public.tonight_applications')
  const featureTable = readTable(sql, 'quantum_private.tonight_applicant_features')

  assert.match(
    sql,
    /CREATE TABLE public\.tonight_application_choices[\s\S]*?rank SMALLINT NOT NULL CHECK \(rank BETWEEN 1 AND 3\)[\s\S]*?PRIMARY KEY \(application_id, rank\)[\s\S]*?UNIQUE \(application_id, activity_id\)/i,
  )
  assert.match(featureTable, /application_id UUID PRIMARY KEY/i)
  assert.match(featureTable, /age_years SMALLINT/i)
  assert.match(featureTable, /gender_code TEXT/i)
  assert.match(featureTable, /appearance_score/i)
  assert.match(featureTable, /automatic_appearance_score NUMERIC\(5,2\) NOT NULL/i)
  assert.match(
    featureTable,
    /appearance_score_adjustment NUMERIC\(6,2\)[\s\S]*?GENERATED ALWAYS AS \(appearance_score - automatic_appearance_score\) STORED/i,
  )
  assert.match(featureTable, /revision INTEGER NOT NULL DEFAULT 0/i)
  assert.match(applications, /matching_consent_version TEXT NOT NULL[\s\S]*?'2026-09-03'/i)
  assert.match(applications, /matching_consent_accepted_at TIMESTAMPTZ NOT NULL/i)
  assert.doesNotMatch(
    sql,
    /GRANT SELECT ON TABLE quantum_private\.tonight_applicant_features\s+TO (?:anon|authenticated)/i,
  )
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_friend_bundle_members[\s\S]*?PRIMARY KEY \(bundle_id, application_id\)[\s\S]*?UNIQUE \(application_id\)/i,
  )
})

test('teams persist a round-global number and globally unambiguous stable human code', () => {
  const { sql } = readMigration('tonight_ledger_schema')

  assert.match(
    sql,
    /CREATE TABLE public\.tonight_teams[\s\S]*?team_number INTEGER NOT NULL CHECK \(team_number > 0\)[\s\S]*?team_code TEXT NOT NULL UNIQUE[\s\S]*?UNIQUE \(round_id, team_number\)/i,
  )
  assert.match(sql, /member_count SMALLINT NOT NULL DEFAULT 5 CHECK \(member_count = 5\)/i)
  assert.match(
    sql,
    /male_count SMALLINT NOT NULL[\s\S]*?female_count SMALLINT NOT NULL[\s\S]*?CHECK \([\s\S]*?male_count = 2 AND female_count = 3[\s\S]*?male_count = 3 AND female_count = 2/i,
  )
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_team_members[\s\S]*?PRIMARY KEY \(team_id, application_id\)[\s\S]*?UNIQUE \(application_id\)/i,
  )
})

test('Tonight has dedicated deposit, attendance, settlement, report, and append-only audit ledgers', () => {
  const { sql } = readMigration('tonight_ledger_schema')

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.tonight_deposit_amount\(\)[\s\S]*?RETURNS INTEGER[\s\S]*?SELECT 10000/i,
  )
  for (const table of [
    'tonight_deposits',
    'tonight_deposit_refund_requests',
    'tonight_partner_acceptances',
    'tonight_attendance',
    'tonight_partner_service_confirmations',
    'tonight_settlements',
    'tonight_incident_reports',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}\\b`, 'i'))
  }
  assert.match(
    sql,
    /CREATE TABLE public\.tonight_deposits[\s\S]*?application_id UUID NOT NULL UNIQUE[\s\S]*?user_id UUID NOT NULL[\s\S]*?amount INTEGER NOT NULL DEFAULT public\.tonight_deposit_amount\(\)/i,
  )
  assert.match(
    sql,
    /CREATE TABLE quantum_private\.tonight_audit_events[\s\S]*?actor_user_id UUID[\s\S]*?occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP[\s\S]*?before_state JSONB[\s\S]*?after_state JSONB/i,
  )
  assert.match(
    sql,
    /CREATE TABLE quantum_private\.tonight_deposit_result_events[\s\S]*?deposit_id UUID NOT NULL[\s\S]*?result_status TEXT NOT NULL[\s\S]*?provider_payment_key_hash TEXT[\s\S]*?idempotency_key TEXT NOT NULL UNIQUE/i,
  )
  assert.doesNotMatch(
    readTable(sql, 'quantum_private.tonight_deposit_result_events'),
    /provider_payment_key(?!_hash)/i,
  )
  assert.doesNotMatch(sql, /tonight_audit_events[\s\S]{0,900}?reason\s+TEXT/i)
})

test('Tonight refund queue stores bounded lease and hash-only provider finalization state', () => {
  const { sql } = readMigration('tonight_ledger_schema')
  const refund = readTable(sql, 'public.tonight_deposit_refund_requests')

  assert.match(refund, /settlement_lease_id UUID/i)
  assert.match(refund, /settlement_lease_expires_at TIMESTAMPTZ/i)
  assert.match(refund, /settlement_attempt_count INTEGER NOT NULL DEFAULT 0/i)
  assert.match(refund, /settlement_next_retry_at TIMESTAMPTZ/i)
  assert.match(refund, /provider_order_id TEXT/i)
  assert.match(refund, /provider_payment_key_hash TEXT/i)
  assert.doesNotMatch(refund, /provider_payment_key(?!_hash)/i)
  assert.match(refund, /provider_refund_transaction_key TEXT UNIQUE/i)
  assert.match(refund, /finalize_idempotency_key TEXT UNIQUE/i)
  assert.match(refund, /refunded_amount INTEGER/i)
  assert.match(refund, /status = 'processing'/i)
})

test('audit idempotency deduplicates only explicit keys and never collapses ordinary null-key events', () => {
  const { sql } = readMigration('tonight_ledger_schema')
  const auditTable = readTable(sql, 'quantum_private.tonight_audit_events')

  assert.doesNotMatch(auditTable, /UNIQUE NULLS NOT DISTINCT/i)
  assert.match(
    sql,
    /CREATE UNIQUE INDEX tonight_audit_events_idempotency_idx[\s\S]*?ON quantum_private\.tonight_audit_events \(entity_type, idempotency_key\)[\s\S]*?WHERE idempotency_key IS NOT NULL/i,
  )
})
