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
  assert.ok(filename.slice(0, 14) > predecessor)
  return { filename, sql: readFileSync(join(migrationsDir, filename), 'utf8') }
}

function readFunction(sql: string, functionName: string): string {
  const start = sql.search(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\b`, 'i'),
  )
  assert.notEqual(start, -1, `missing function public.${functionName}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for ${functionName}`)
  assert.notEqual(end, -1, `missing end for ${functionName}`)
  return sql.slice(start, end + 3)
}

function readPrivateFunction(sql: string, functionName: string): string {
  const start = sql.search(
    new RegExp(`CREATE OR REPLACE FUNCTION quantum_private\\.${functionName}\\b`, 'i'),
  )
  assert.notEqual(start, -1, `missing function quantum_private.${functionName}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for ${functionName}`)
  assert.notEqual(end, -1, `missing end for ${functionName}`)
  return sql.slice(start, end + 3)
}

test('round configuration is all-or-nothing with exactly three activities and database time gates', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'super_admin_create_tonight_round')
  const internal = readPrivateFunction(sql, 'create_tonight_round_internal')
  const automated = readFunction(sql, 'service_create_tonight_round')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /quantum_private\.create_tonight_round_internal/i)
  assert.match(automated, /quantum_private\.create_tonight_round_internal/i)
  assert.doesNotMatch(automated, /auth\.uid|authenticated/i)
  assert.match(internal, /pg_catalog\.cardinality\(p_activity_titles\) <> 3/i)
  assert.match(internal, /invalid_activity_count/i)
  assert.match(internal, /p_activity_image_urls\[1\][\s\S]*?activity_image_required/i)
  assert.match(internal, /p_activity_duration_minutes SMALLINT\[\]/i)
  assert.match(internal, /pg_catalog\.cardinality\(p_activity_duration_minutes\) <> 3/i)
  assert.match(internal, /p_activity_duration_minutes\[v_slot\] NOT BETWEEN 30 AND 240[\s\S]*?invalid_activity_duration/i)
  assert.match(internal, /duration_minutes[\s\S]*?p_activity_duration_minutes\[v_slot\]/i)
  assert.match(internal, /'Asia\/Seoul'/i)
  assert.match(internal, /p_partner_acceptance_due_at TIMESTAMPTZ/i)
  assert.match(
    internal,
    /p_signup_open_at >= p_signup_close_at[\s\S]*?p_signup_close_at > p_capacity_lock_at[\s\S]*?p_capacity_lock_at > p_allocation_publish_at[\s\S]*?p_allocation_publish_at >= p_deposit_due_at[\s\S]*?p_deposit_due_at >= p_partner_acceptance_due_at[\s\S]*?p_partner_acceptance_due_at > p_reveal_at[\s\S]*?p_reveal_at > p_arrival_at[\s\S]*?p_arrival_at >= p_starts_at[\s\S]*?invalid_round_gate_order/i,
  )
  assert.match(internal, /round_row\.market_code = v_market_code/i)
  assert.match(internal, /round_row\.service_date = p_service_date/i)
  assert.match(internal, /pg_advisory_xact_lock/i)
  assert.match(internal, /INSERT INTO public\.tonight_round_activities/i)
  assert.doesNotMatch(internal, /clock_timestamp\(\).*p_|client_time|simulated_time/i)
})

test('application submission atomically stores a bundle of at most three and three distinct choices', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'submit_tonight_application')

  assert.match(fn, /p_matching_consent_accepted BOOLEAN/i)
  assert.match(fn, /p_matching_consent_version TEXT/i)
  assert.match(
    fn,
    /COALESCE\(p_matching_consent_accepted, FALSE\) = FALSE[\s\S]*?COALESCE\(p_matching_consent_version, ''\) <> '2026-09-03'[\s\S]*?matching_consent_required/i,
  )
  assert.match(fn, /pg_catalog\.cardinality\(p_ranked_activity_ids\) <> 3/i)
  assert.match(fn, /p_ranked_activity_ids\[1\] = p_ranked_activity_ids\[2\]/i)
  assert.match(fn, /p_ranked_activity_ids\[2\] = p_ranked_activity_ids\[3\]/i)
  assert.match(fn, /CURRENT_TIMESTAMP < v_round\.signup_open_at/i)
  assert.match(fn, /CURRENT_TIMESTAMP >= v_round\.signup_close_at/i)
  assert.match(fn, /INSERT INTO public\.tonight_application_choices/i)
  assert.match(fn, /INSERT INTO quantum_private\.tonight_applicant_features/i)
  assert.match(
    fn,
    /matching_consent_version[\s\S]*?matching_consent_accepted_at[\s\S]*?p_matching_consent_version[\s\S]*?CURRENT_TIMESTAMP/i,
  )
  assert.match(fn, /friend_bundle_limit_exceeded/i)
  assert.match(fn, /pg_advisory_xact_lock/i)
  assert.match(fn, /tonight_market_memberships/i)
  assert.match(fn, /membership\.market_code = v_round\.market_code/i)
  assert.match(fn, /membership\.revoked_at IS NULL/i)
  assert.match(fn, /tonight_market_membership_required/i)
})

test('concurrent applications share the round gate while allocation keeps an exclusive close boundary', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const submit = readFunction(sql, 'submit_tonight_application')
  const allocatorInput = readFunction(sql, 'service_get_tonight_allocator_input')
  const publish = readPrivateFunction(sql, 'publish_tonight_allocation_internal')

  assert.match(
    submit,
    /FROM public\.tonight_rounds AS round_row[\s\S]*?WHERE round_row\.id = p_round_id\s+FOR SHARE/i,
  )
  assert.doesNotMatch(
    submit,
    /FROM public\.tonight_rounds AS round_row[\s\S]*?WHERE round_row\.id = p_round_id\s+FOR UPDATE/i,
  )
  assert.match(submit, /v_round\.status <> 'open'/i)
  assert.match(submit, /CURRENT_TIMESTAMP >= v_round\.signup_close_at/i)
  assert.doesNotMatch(allocatorInput, /\bSTABLE\b/i)
  assert.match(
    allocatorInput,
    /FROM public\.tonight_rounds AS round_row[\s\S]*?WHERE round_row\.id = p_round_id\s+FOR UPDATE/i,
  )
  assert.match(
    publish,
    /FROM public\.tonight_rounds AS round_row[\s\S]*?WHERE round_row\.id = p_round_id\s+FOR UPDATE/i,
  )
})

test('super-admin alone grants, revokes, and lists market eligibility with optimistic revision checks', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const grant = readFunction(sql, 'super_admin_grant_tonight_market_membership')
  const revoke = readFunction(sql, 'super_admin_revoke_tonight_market_membership')
  const list = readFunction(sql, 'super_admin_list_tonight_market_memberships')

  assert.match(grant, /public\.is_super_admin\(v_caller\)/i)
  assert.match(grant, /INSERT INTO public\.tonight_market_memberships/i)
  assert.match(revoke, /public\.is_super_admin\(v_caller\)/i)
  assert.match(revoke, /p_expected_revision INTEGER/i)
  assert.match(revoke, /stale_revision/i)
  assert.match(revoke, /revoked_at = CURRENT_TIMESTAMP/i)
  assert.match(list, /public\.is_super_admin\(v_caller\)/i)
  assert.match(list, /public\.tonight_market_memberships/i)
})

test('market membership mutations serialize before their canonical idempotency replay', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const grant = readFunction(sql, 'super_admin_grant_tonight_market_membership')
  const revoke = readFunction(sql, 'super_admin_revoke_tonight_market_membership')

  const grantKeyLock = grant.indexOf("'tonight-market-membership-grant-key:' || p_idempotency_key")
  const grantTargetLock = grant.indexOf("'tonight-market-membership:' || v_market_code || ':' || p_user_id::TEXT")
  const grantReplay = grant.indexOf('WHERE membership.grant_idempotency_key = p_idempotency_key')
  const grantActiveConflict = grant.indexOf('tonight_market_membership_already_active')
  assert.ok(grantKeyLock >= 0, 'grant must serialize a global idempotency key')
  assert.ok(grantTargetLock > grantKeyLock, 'grant must serialize market:user after its key')
  assert.ok(grantReplay > grantTargetLock, 'grant must recheck canonical replay after both locks')
  assert.ok(grantActiveConflict > grantReplay, 'grant replay must precede active-membership conflict')

  const revokeKeyLock = revoke.indexOf("'tonight-market-membership-revoke-key:' || p_idempotency_key")
  const revokeRowLock = revoke.indexOf('WHERE membership.id = p_membership_id\n  FOR UPDATE')
  const revokeReplayAfterLock = revoke.indexOf(
    'WHERE membership.revoke_idempotency_key = p_idempotency_key',
    revokeRowLock,
  )
  const revokedConflict = revoke.indexOf('tonight_market_membership_already_revoked')
  assert.ok(revokeKeyLock >= 0, 'revoke must serialize a global idempotency key')
  assert.ok(revokeRowLock > revokeKeyLock, 'revoke must lock the membership after its key')
  assert.ok(revokeReplayAfterLock > revokeRowLock, 'revoke must recheck replay after its row lock')
  assert.ok(revokedConflict > revokeReplayAfterLock, 'replay must precede already-revoked conflict')
  assert.match(revoke, /v_replay\.id <> p_membership_id[\s\S]*?idempotency_conflict/i)
})

test('allocation publish enforces exact teams, sex mix, atomic friend bundles, and stable team codes', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readPrivateFunction(sql, 'publish_tonight_allocation_internal')
  const manual = readFunction(sql, 'super_admin_publish_tonight_allocation')
  const automated = readFunction(sql, 'service_publish_tonight_allocation')

  assert.match(fn, /p_expected_revision INTEGER/i)
  assert.match(fn, /stale_revision/i)
  assert.match(fn, /jsonb_array_length\(v_members\) <> 5/i)
  assert.match(fn, /male_count[\s\S]*?female_count/i)
  assert.match(fn, /invalid_team_gender_mix/i)
  assert.match(fn, /friend_bundle_split/i)
  assert.match(fn, /Q-[A-Z0-9_-]+-[0-9]{8}-/i)
  assert.match(fn, /UNIQUE_VIOLATION/i)
  assert.match(fn, /p_idempotency_key TEXT/i)
  assert.match(fn, /FOR v_team_index IN 0\.\.pg_catalog\.jsonb_array_length\(p_team_assignments\) - 1 LOOP/i)
  assert.match(fn, /v_member_ids := ARRAY\[/i)
  assert.match(fn, /pg_catalog\.array_position\(v_member_ids, NULL::UUID\) IS NOT NULL/i)
  assert.match(manual, /public\.is_super_admin\(v_caller\)/i)
  assert.match(manual, /quantum_private\.publish_tonight_allocation_internal/i)
  assert.match(automated, /quantum_private\.publish_tonight_allocation_internal/i)
  assert.doesNotMatch(automated, /GRANT|authenticated|auth\.uid/i)
  assert.match(
    fn,
    /UPDATE public\.tonight_applications AS application_row[\s\S]*?SET status = 'waitlisted'[\s\S]*?NOT EXISTS \([\s\S]*?public\.tonight_team_members/i,
  )
  assert.doesNotMatch(fn, /jsonb_array_length\(p_team_assignments\) = 0[\s\S]*?team_assignments_required/i)
  assert.match(fn, /CASE[\s\S]*?jsonb_array_length\(p_team_assignments\) = 0 THEN 'completed'[\s\S]*?ELSE 'awaiting_deposits'/i)
  assert.match(fn, /COALESCE\([\s\S]*?jsonb_agg[\s\S]*?'\[\]'::JSONB/i)
})

test('team codes preserve the full sequence above 999 in both publish implementations', () => {
  const base = readPrivateFunction(
    readMigration('tonight_lifecycle_rpcs').sql,
    'publish_tonight_allocation_internal',
  )
  const fallback = readPrivateFunction(
    readMigration('tonight_ranked_activity_capacity_fallback').sql,
    'publish_tonight_allocation_internal',
  )
  const fullWidthSequence =
    /pg_catalog\.lpad\(\s*v_team_number::TEXT,\s*GREATEST\(3,\s*pg_catalog\.length\(v_team_number::TEXT\)\),\s*'0'\s*\)/i

  assert.match(base, fullWidthSequence)
  assert.match(fallback, fullWidthSequence)

  const rendered = [999, 1000, 1001, 2000].map((value) =>
    String(value).padStart(Math.max(3, String(value).length), '0'),
  )
  assert.deepEqual(rendered, ['999', '1000', '1001', '2000'])
  assert.equal(new Set(rendered).size, rendered.length)
})

test('ranked activity capacity fallback replaces winner-only database validation', () => {
  const { sql } = readMigration('tonight_ranked_activity_capacity_fallback')
  const ranked = readPrivateFunction(sql, 'assert_tonight_ranked_activity_selection')
  const integrity = readPrivateFunction(sql, 'assert_tonight_team_integrity')
  const publish = readPrivateFunction(sql, 'publish_tonight_allocation_internal')

  assert.match(sql, /^\s*--[\s\S]*?\bBEGIN;[\s\S]*?\bCOMMIT;\s*$/i)
  assert.match(ranked, /p_enforce_capacity BOOLEAN/i)
  assert.match(ranked, /p_enforce_capacity IS NULL[\s\S]*?team_activity_capacity_policy_required/i)
  assert.match(ranked, /pg_catalog\.cardinality\(p_application_ids\) <> 5/i)
  assert.match(ranked, /p_application_ids\[1\] = ANY\(p_application_ids\[2:5\]\)/i)
  assert.match(ranked, /round_activity_count_invalid/i)
  assert.match(ranked, /application_choice_count_invalid/i)
  assert.match(ranked, /application_choice_rank_invalid/i)
  assert.match(ranked, /COUNT\(DISTINCT choice\.activity_id\) <> 3/i)
  assert.match(
    ranked,
    /ORDER BY[\s\S]*?points DESC[\s\S]*?first_choice_count DESC[\s\S]*?second_choice_count DESC[\s\S]*?slot ASC/i,
  )
  assert.match(ranked, /pg_catalog\.array_position\(v_ranked_activity_ids, p_selected_activity_id\)/i)
  assert.match(
    ranked,
    /p_enforce_capacity[\s\S]*?capacity\.activity_id = ANY\([\s\S]*?v_ranked_activity_ids\[1:v_selected_position - 1\][\s\S]*?capacity\.status IN \('open', 'locked'\)[\s\S]*?capacity\.reserved_team_count < capacity\.team_capacity[\s\S]*?team_activity_higher_rank_capacity_available/i,
  )

  assert.match(
    integrity,
    /quantum_private\.assert_tonight_ranked_activity_selection\([\s\S]*?v_team_activity_id,[\s\S]*?FALSE[\s\S]*?\)/i,
  )
  assert.doesNotMatch(integrity, /team_activity_not_rank_winner/i)
  assert.match(
    publish,
    /quantum_private\.assert_tonight_ranked_activity_selection\([\s\S]*?v_activity_id,[\s\S]*?TRUE[\s\S]*?\)/i,
  )
  assert.doesNotMatch(publish, /team_activity_not_rank_winner/i)
  assert.ok(
    publish.indexOf('assert_tonight_ranked_activity_selection')
      < publish.indexOf('INSERT INTO public.tonight_teams'),
    'capacity fallback must be checked before any team row is written',
  )
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION quantum_private\.assert_tonight_ranked_activity_selection\(UUID, UUID\[\], UUID, BOOLEAN\)[^;]*?FROM[^;]*?PUBLIC, anon, authenticated, service_role;/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION quantum_private\.assert_tonight_team_integrity\(UUID\)[^;]*?FROM[^;]*?PUBLIC, anon, authenticated, service_role;/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION quantum_private\.publish_tonight_allocation_internal\(UUID, INTEGER, JSONB, TEXT\)[^;]*?FROM[^;]*?PUBLIC, anon, authenticated, service_role;/i,
  )
})

test('published fallback stays valid if a higher-ranked capacity reopens later', () => {
  const { sql } = readMigration('tonight_ranked_activity_capacity_fallback')
  const integrity = readPrivateFunction(sql, 'assert_tonight_team_integrity')
  const publish = readPrivateFunction(sql, 'publish_tonight_allocation_internal')

  assert.match(integrity, /v_team_activity_id,[\s\S]*?FALSE/i)
  assert.doesNotMatch(integrity, /reserved_team_count < capacity\.team_capacity/i)
  assert.match(publish, /v_activity_id,[\s\S]*?TRUE/i)
})

test('service allocator input is gate-checked and contains only immutable allocation inputs', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'service_get_tonight_allocator_input')

  assert.match(fn, /capacity_lock_at/i)
  assert.match(fn, /allocation_publish_at/i)
  assert.match(fn, /CURRENT_TIMESTAMP < v_round\.capacity_lock_at/i)
  assert.doesNotMatch(
    fn,
    /OR CURRENT_TIMESTAMP < v_round\.allocation_publish_at[\s\S]*?allocator_input_time_gate_closed/i,
    'allocator input must open at the 18:30 capacity lock so calculation can finish before 18:32 publish',
  )
  assert.match(fn, /tonight_applications/i)
  assert.match(fn, /tonight_application_choices/i)
  assert.match(fn, /quantum_private\.tonight_applicant_features/i)
  assert.match(fn, /tonight_friend_bundle_members/i)
  assert.match(fn, /tonight_market_memberships/i)
  assert.match(fn, /membership\.revoked_at IS NULL/i)
  assert.match(fn, /membership\.market_code = v_round\.market_code/i)
  assert.match(fn, /COUNT\(\*\)[\s\S]*?<> 3[\s\S]*?application_choice_count_invalid/i)
  assert.doesNotMatch(fn, /phone|email|display_name|address/i)
})

test('role-scoped read DTOs support user cards, partner setup, and operator exceptions without table grants', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')

  const user = readFunction(sql, 'get_current_tonight_round')
  assert.match(user, /auth\.uid\(\)/i)
  assert.match(user, /tonight_market_memberships/i)
  assert.match(user, /membership\.revoked_at IS NULL/i)
  assert.match(user, /tonight_round_activities/i)
  assert.match(user, /'duration_minutes', activity\.duration_minutes/i)
  assert.match(user, /activity_count_invalid/i)
  assert.match(user, /tonight_application_choices/i)
  assert.match(user, /tonight_friend_bundles/i)
  assert.match(user, /tonight_deposits/i)
  assert.doesNotMatch(user, /venue_snapshots|venue_capacities|address|latitude|longitude/i)
  assert.doesNotMatch(user, /matching_consent_version|matching_consent_accepted_at/i)

  const journey = readFunction(sql, 'get_my_tonight_journey')
  assert.match(journey, /deposit_status TEXT/i)
  assert.match(journey, /deposit_revision INTEGER/i)
  assert.match(journey, /attendance_status TEXT/i)
  assert.match(journey, /attendance_revision INTEGER/i)
  assert.match(journey, /can_mark_arrival BOOLEAN/i)
  assert.match(
    journey,
    /attendance_row\.status = 'pending'[\s\S]*?CURRENT_TIMESTAMP >= round_row\.arrival_at[\s\S]*?CURRENT_TIMESTAMP < round_row\.starts_at \+ INTERVAL '2 hours'/i,
  )
  assert.match(journey, /activity_duration_minutes SMALLINT/i)
  assert.match(journey, /venue_address_evidence TEXT/i)
  assert.match(journey, /venue_address_verified_at TIMESTAMPTZ/i)
  assert.match(journey, /venue_coordinate_evidence TEXT/i)
  assert.match(journey, /venue_coordinates_verified_at TIMESTAMPTZ/i)

  const partner = readFunction(sql, 'partner_get_tonight_setup')
  assert.match(partner, /venue_partner_memberships/i)
  assert.match(partner, /membership\.user_id = v_caller/i)
  assert.match(partner, /membership\.revoked_at IS NULL/i)
  assert.match(partner, /venue_snapshots/i)
  assert.match(partner, /ORDER BY snapshot_row\.created_at DESC/i)
  assert.match(partner, /tonight_round_activities/i)
  assert.match(partner, /'duration_minutes', activity\.duration_minutes/i)
  assert.match(partner, /tonight_venue_capacities/i)
  assert.match(partner, /'address_evidence', snapshot\.address_evidence/i)
  assert.match(partner, /'coordinates_verified_at', snapshot\.coordinates_verified_at/i)

  const rounds = readFunction(sql, 'admin_list_tonight_rounds')
  assert.match(rounds, /public\.is_admin\(v_caller\)/i)
  assert.match(rounds, /signup_close_at/i)
  assert.match(rounds, /gender_code = 'male'/i)
  assert.match(rounds, /gender_code = 'female'/i)
  assert.match(rounds, /status = 'waitlisted'/i)
  assert.match(rounds, /reconciliation_required|disputed/i)
  assert.match(rounds, /tonight_deposit_refund_requests[\s\S]*?settlement_attempt_count >= 10/i)
  assert.match(rounds, /confirmed_attendee_count <>[\s\S]*?COUNT\(\*\)[\s\S]*?tonight_attendance/i)

  const exceptions = readFunction(sql, 'admin_get_tonight_active_exceptions')
  assert.match(exceptions, /public\.is_admin\(v_caller\)/i)
  assert.match(exceptions, /attendance\.status = 'pending'/i)
  assert.match(exceptions, /report\.status IN \('open', 'reviewing'\)/i)
  assert.match(exceptions, /user_row\.phone/i)
  assert.match(exceptions, /profile\.display_name/i)
  assert.match(exceptions, /reporter_user_id UUID/i)
  assert.match(exceptions, /reporter_user\.phone/i)
  assert.match(exceptions, /reporter_profile\.display_name/i)
  assert.match(exceptions, /refund_request_id UUID/i)
  assert.match(exceptions, /refund_request_revision INTEGER/i)
  assert.match(exceptions, /'refund_dead_letter'/i)
  assert.match(exceptions, /settlement_attempt_count >= 10/i)
  assert.match(exceptions, /'headcount_mismatch'/i)
  assert.match(exceptions, /confirmed_attendee_count <>[\s\S]*?COUNT\(\*\)[\s\S]*?tonight_attendance/i)
})

test('partner capacity mutation is own-venue only, revisioned, and locked at database time', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'partner_set_tonight_capacity')

  assert.match(fn, /public\.is_venue_partner\(v_venue_id, v_caller\)/i)
  assert.match(fn, /venue_snapshot_id[\s\S]*?v_venue_id/i)
  assert.match(fn, /capacity_lock_at <= CURRENT_TIMESTAMP/i)
  assert.match(fn, /v_round\.status <> 'open'/i)
  assert.match(fn, /p_expected_revision INTEGER/i)
  assert.match(fn, /stale_revision/i)
  assert.match(fn, /revision = [\s\S]*?\+ 1/i)
  assert.ok(
    fn.indexOf('public.is_venue_partner(v_venue_id, v_caller)') <
      fn.indexOf('capacity.idempotency_key = p_idempotency_key'),
    'partner authorization must happen before idempotent capacity replay',
  )
  assert.match(
    fn,
    /capacity\.idempotency_key = p_idempotency_key[\s\S]*?v_capacity\.round_id <> p_round_id[\s\S]*?v_capacity\.activity_id <> p_activity_id[\s\S]*?v_capacity\.venue_snapshot_id <> p_venue_snapshot_id[\s\S]*?v_capacity\.team_capacity <> p_team_capacity[\s\S]*?idempotency_conflict/i,
  )
})

test('payment result is idempotent and binds immutable application ownership', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'service_record_tonight_deposit_result')

  assert.match(fn, /p_idempotency_key TEXT/i)
  assert.match(fn, /application_row\.user_id <> p_user_id/i)
  assert.match(fn, /public\.tonight_deposit_amount\(\)/i)
  assert.match(fn, /ON CONFLICT \(idempotency_key\)/i)
  assert.match(fn, /deposit_result_conflict/i)
  assert.match(fn, /CURRENT_TIMESTAMP >= v_round\.deposit_due_at[\s\S]*?deposit_time_gate_closed/i)
  assert.match(fn, /application_row\.status <> 'allocated'[\s\S]*?deposit_application_not_allocated/i)
  assert.match(fn, /v_team\.status <> 'deposit_pending'[\s\S]*?deposit_team_not_payable/i)
  assert.match(fn, /COUNT\(\*\)[\s\S]*?deposit\.status IN \('paid', 'held'\)[\s\S]*?= 5[\s\S]*?status = 'partner_pending'/i)
  assert.match(
    fn,
    /JOIN public\.tonight_teams AS team[\s\S]*?FOR UPDATE OF team[\s\S]*?SELECT COUNT\(\*\)[\s\S]*?deposit\.status IN \('paid', 'held'\)/i,
  )
  assert.ok(
    fn.indexOf('FOR UPDATE OF team') < fn.indexOf('FOR UPDATE OF application_value'),
    'payment result must lock team before application',
  )
  assert.ok(
    fn.indexOf('FOR UPDATE OF application_value') < fn.indexOf('FOR UPDATE OF deposit'),
    'payment result must lock application before deposit',
  )
})

test('deposit preparation reserves one application-bound pending order and reuses it across concurrent tabs', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'service_prepare_tonight_deposit')

  assert.match(fn, /auth\.role\(\)[\s\S]*?service_role_required/i)
  assert.match(fn, /p_proposed_order_id TEXT/i)
  assert.match(fn, /p_idempotency_key TEXT/i)
  assert.match(fn, /application_value\.id = p_application_id[\s\S]*?FOR UPDATE/i)
  assert.match(fn, /application_row\.status <> 'allocated'[\s\S]*?deposit_application_not_allocated/i)
  assert.match(fn, /CURRENT_TIMESTAMP >= round_row\.deposit_due_at[\s\S]*?deposit_time_gate_closed/i)
  assert.match(fn, /team_row\.status <> 'deposit_pending'[\s\S]*?deposit_team_not_payable/i)
  assert.match(fn, /WHERE deposit\.application_id = p_application_id[\s\S]*?FOR UPDATE/i)
  assert.match(
    fn,
    /IF deposit_row\.status = 'pending' THEN[\s\S]*?'provider_order_id', deposit_row\.provider_order_id[\s\S]*?RETURN/i,
  )
  assert.match(fn, /INSERT INTO public\.tonight_deposits[\s\S]*?'pending'/i)
  assert.match(fn, /ON CONFLICT \(application_id\) DO NOTHING/i)
  assert.match(fn, /deposit_not_preparable/i)
  assert.ok(
    fn.indexOf('FOR UPDATE OF team') < fn.indexOf('FOR UPDATE OF application_value'),
    'deposit preparation must lock team before application',
  )
  assert.ok(
    fn.indexOf('FOR UPDATE OF application_value') < fn.indexOf('FOR UPDATE OF deposit'),
    'deposit preparation must lock application before deposit',
  )
})

test('payment reconciliation is append-only and can atomically promote the same payment to paid or held', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'service_record_tonight_deposit_result')

  assert.match(fn, /quantum_private\.tonight_deposit_result_events/i)
  assert.match(fn, /event\.idempotency_key = p_idempotency_key[\s\S]*?deposit_result_conflict/i)
  assert.match(fn, /WHERE deposit\.application_id = p_application_id[\s\S]*?FOR UPDATE/i)
  assert.match(
    fn,
    /v_deposit\.status = 'reconciliation_required'[\s\S]*?p_status IN \('paid', 'held'\)[\s\S]*?UPDATE public\.tonight_deposits/i,
  )
  assert.match(fn, /revision = deposit\.revision \+ 1/i)
  assert.match(
    fn,
    /v_deposit\.provider_order_id[\s\S]*?p_provider_order_id[\s\S]*?v_deposit\.provider_payment_key_hash[\s\S]*?p_provider_payment_key_hash[\s\S]*?deposit_result_conflict/i,
  )
  assert.match(fn, /p_status IN \('paid', 'held', 'reconciliation_required'\)[\s\S]*?provider_reference_required/i)
  assert.match(fn, /ON CONFLICT \(idempotency_key\) DO NOTHING/i)
  assert.match(
    sql,
    /CREATE TRIGGER tonight_deposit_result_events_update_immutable[\s\S]*?BEFORE UPDATE[\s\S]*?prevent_tonight_immutable_mutation/i,
  )
  assert.match(
    sql,
    /CREATE TRIGGER tonight_deposit_result_events_delete_immutable[\s\S]*?BEFORE DELETE[\s\S]*?prevent_tonight_immutable_mutation/i,
  )
})

test('deposit deadline atomically cancels underfunded teams and queues every paid member refund', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'service_expire_tonight_deposit_gate')
  const current = readFunction(sql, 'get_current_tonight_round')
  const journey = readFunction(sql, 'get_my_tonight_journey')

  assert.match(fn, /auth\.role\(\)[\s\S]*?service_role_required/i)
  assert.match(fn, /CURRENT_TIMESTAMP < round_row\.deposit_due_at[\s\S]*?deposit_gate_not_due/i)
  assert.match(fn, /team\.status = 'deposit_pending'/i)
  assert.match(fn, /deposit\.status IN \('paid', 'held'\)/i)
  assert.match(fn, /SET status = 'refund_requested'/i)
  assert.match(fn, /INSERT INTO public\.tonight_deposit_refund_requests/i)
  assert.match(fn, /SET status = 'cancelled'[\s\S]*?public\.tonight_teams/i)
  assert.match(fn, /application_row[\s\S]*?SET status = 'cancelled'/i)
  assert.match(fn, /member[\s\S]*?SET member_status = 'cancelled'/i)
  assert.match(fn, /queued_refund_count/i)
  assert.match(
    fn,
    /UPDATE public\.tonight_venue_capacities[\s\S]*?reserved_team_count = GREATEST\(capacity\.reserved_team_count - 1, 0\)/i,
  )
  assert.match(current, /refund_status/i)
  assert.match(journey, /refund_status TEXT/i)
  assert.match(journey, /refund_request_revision INTEGER/i)
  assert.doesNotMatch(fn, /FROM public\.tonight_rounds AS round_value\s+WHERE round_value\.id = p_round_id\s+FOR UPDATE/i)
})

test('allocation publish and deposit expiry serialize, and a missed allocator run cannot strand submitted applicants', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const publish = readPrivateFunction(sql, 'publish_tonight_allocation_internal')
  const depositGate = readFunction(sql, 'service_expire_tonight_deposit_gate')
  const partnerGate = readFunction(sql, 'service_expire_tonight_partner_acceptance_gate')

  for (const fn of [publish, depositGate, partnerGate]) {
    assert.match(
      fn,
      /pg_advisory_xact_lock[\s\S]*?'tonight-round-transition:'\s*\|\|\s*p_round_id::TEXT/i,
    )
  }
  assert.match(
    depositGate,
    /round_row\.status = 'open'[\s\S]*?UPDATE public\.tonight_applications[\s\S]*?status = 'waitlisted'/i,
  )
  assert.match(depositGate, /allocation_recovered[\s\S]*?waitlisted_application_count/i)
})

test('partner deadline atomically cancels unaccepted teams, releases capacity, and queues every paid member refund', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'service_expire_tonight_partner_acceptance_gate')

  assert.match(fn, /auth\.role\(\)[\s\S]*?service_role_required/i)
  assert.match(
    fn,
    /CURRENT_TIMESTAMP < round_row\.partner_acceptance_due_at[\s\S]*?partner_acceptance_gate_not_due/i,
  )
  assert.match(fn, /team\.status = 'partner_pending'/i)
  assert.match(fn, /deposit_row\.status IN \('paid', 'held', 'reconciliation_required'\)/i)
  assert.match(fn, /SET status = 'refund_requested'/i)
  assert.match(fn, /INSERT INTO public\.tonight_deposit_refund_requests/i)
  assert.match(fn, /SET status = 'cancelled'[\s\S]*?public\.tonight_teams/i)
  assert.match(
    fn,
    /UPDATE public\.tonight_venue_capacities[\s\S]*?reserved_team_count = GREATEST\(capacity\.reserved_team_count - 1, 0\)/i,
  )
  assert.match(fn, /partner_acceptance_gate_expired/i)
  assert.doesNotMatch(fn, /FROM public\.tonight_rounds AS round_value\s+WHERE round_value\.id = p_round_id\s+FOR UPDATE/i)
})

test('partner acceptance requires own venue, exact five paid or held deposits, revision lock, and an exact address', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'partner_accept_tonight_team')

  assert.match(fn, /FOR UPDATE/i)
  assert.match(fn, /public\.is_venue_partner\(v_venue_id, v_caller\)/i)
  assert.match(fn, /p_expected_revision INTEGER/i)
  assert.match(
    fn,
    /COUNT\(\*\) FILTER \(WHERE deposit\.status IN \('paid', 'held'\)\)[\s\S]*?INTO v_member_count, v_paid_count/i,
  )
  assert.match(fn, /v_member_count <> 5[\s\S]*?v_paid_count <> 5/i)
  assert.match(fn, /deposit_gate_not_satisfied/i)
  assert.match(fn, /v_team\.status <> 'partner_pending'/i)
  assert.match(fn, /CURRENT_TIMESTAMP >= v_round\.partner_acceptance_due_at/i)
  assert.match(fn, /v_snapshot\.address IS NULL/i)
  assert.match(fn, /v_snapshot\.address_verified_at IS NULL/i)
  assert.match(fn, /v_snapshot\.address_evidence NOT IN \([\s\S]*?'search-verified'[\s\S]*?'provider-verified'[\s\S]*?'operator-verified'/i)
  assert.match(fn, /v_snapshot\.latitude IS NULL[\s\S]*?v_snapshot\.longitude IS NULL/i)
  assert.match(fn, /v_snapshot\.coordinates_verified_at IS NULL/i)
  assert.match(fn, /v_snapshot\.coordinate_evidence NOT IN \([\s\S]*?'geocoded-address'[\s\S]*?'provider-verified'[\s\S]*?'operator-verified'/i)
  assert.match(fn, /v_snapshot\.naver_url IS NULL[\s\S]*?v_snapshot\.kakao_url IS NULL/i)
  assert.match(fn, /exact_venue_not_ready/i)
  assert.match(fn, /ON CONFLICT \(idempotency_key\)/i)
  assert.match(fn, /UPDATE public\.tonight_rounds[\s\S]*?'partner_confirmation'[\s\S]*?'accepted'/i)
})

test('friend-bundle changes move whole bundles and revalidate both teams', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'super_admin_swap_tonight_friend_bundles')
  const integrity = readPrivateFunction(sql, 'assert_tonight_team_integrity')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /WHERE member\.bundle_id = p_bundle_a_id/i)
  assert.match(fn, /WHERE member\.bundle_id = p_bundle_b_id/i)
  assert.match(fn, /DELETE FROM public\.tonight_team_members/i)
  assert.match(fn, /INSERT INTO public\.tonight_team_members/i)
  assert.match(fn, /PERFORM quantum_private\.assert_tonight_team_integrity/i)
  assert.match(integrity, /team_activity_not_rank_winner/i)
  assert.match(integrity, /tonight_market_memberships/i)
  assert.match(integrity, /membership\.revoked_at IS NULL/i)
  assert.match(fn, /CURRENT_TIMESTAMP >= v_round\.deposit_due_at[\s\S]*?team_locked_for_swap/i)
  assert.match(fn, /public\.tonight_deposits[\s\S]*?team_locked_for_swap/i)
  assert.doesNotMatch(fn, /p_reason|reason TEXT/i)
})

test('super-admin appearance adjustment is revisioned and records before/after without a reason field', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'super_admin_adjust_tonight_appearance_score')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /p_expected_revision INTEGER/i)
  assert.match(fn, /stale_revision/i)
  assert.match(fn, /appearance_score = p_appearance_score/i)
  assert.match(fn, /quantum_private\.write_tonight_audit/i)
  assert.doesNotMatch(fn, /p_reason|reason TEXT/i)
})

test('attendance, partner headcount, and settlement are revisioned and settlement uses confirmed attendees', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')

  const attendance = readFunction(sql, 'mark_my_tonight_arrival')
  assert.match(attendance, /CURRENT_TIMESTAMP < round_row\.arrival_at/i)
  assert.match(attendance, /p_expected_revision INTEGER/i)
  assert.ok(
    attendance.indexOf('FOR UPDATE OF team') < attendance.indexOf('FOR UPDATE OF attendance'),
    'arrival must lock the team before the member attendance row',
  )

  const headcount = readFunction(sql, 'partner_confirm_tonight_service')
  assert.match(headcount, /public\.is_venue_partner\(v_venue_id, v_caller\)/i)
  assert.match(headcount, /confirmed_attendee_count/i)
  assert.ok(
    headcount.indexOf('FOR UPDATE OF team') < headcount.indexOf('FOR UPDATE OF attendance'),
    'service confirmation must lock the team before all member attendance rows',
  )
  assert.match(headcount, /COUNT\(\*\)[\s\S]*?public\.tonight_attendance/i)
  assert.match(headcount, /v_activity_duration_minutes/i)
  assert.match(
    headcount,
    /v_round\.starts_at\s*\+\s*pg_catalog\.make_interval\(mins => v_activity_duration_minutes\)/i,
  )
  assert.match(
    headcount,
    /p_confirmed_attendee_count <> v_observed_arrived_count[\s\S]*?attendance_reconciliation_required/i,
  )

  const settlement = readFunction(sql, 'service_finalize_tonight_settlement')
  assert.match(settlement, /auth\.role\(\)[\s\S]*?service_role_required/i)
  assert.match(settlement, /confirmed_attendee_count/i)
  assert.match(settlement, /p_fee_per_attendee INTEGER/i)
  assert.match(settlement, /p_idempotency_key TEXT/i)
  assert.match(settlement, /ON CONFLICT \(idempotency_key\)/i)
  assert.match(
    settlement,
    /COUNT\(\*\)[\s\S]*?public\.tonight_attendance[\s\S]*?v_observed_arrived_count <> v_confirmation\.confirmed_attendee_count[\s\S]*?attendance_reconciliation_required/i,
  )
  assert.match(headcount, /UPDATE public\.tonight_rounds[\s\S]*?'completed'[\s\S]*?'accepted'/i)
})

test('super-admin can correct attendance without a reason while retaining revision and automatic audit history', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'super_admin_set_tonight_attendance')
  const diagnostics = readFunction(sql, 'super_admin_get_tonight_team_diagnostics')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /p_expected_revision IS NULL[\s\S]*?expected_revision_required/i)
  assert.match(fn, /p_status NOT IN \('pending', 'arrived', 'no_show', 'excused'\)/i)
  assert.match(fn, /attendance\.team_id = p_team_id[\s\S]*?attendance\.user_id = p_user_id[\s\S]*?FOR UPDATE/i)
  assert.match(fn, /attendance_row\.revision <> p_expected_revision[\s\S]*?stale_revision/i)
  assert.match(fn, /revision = attendance\.revision \+ 1/i)
  assert.match(fn, /UPDATE public\.tonight_partner_service_confirmations[\s\S]*?observed_arrived_count = v_observed_arrived_count/i)
  assert.match(fn, /UPDATE public\.tonight_settlements[\s\S]*?status = 'disputed'/i)
  assert.match(fn, /quantum_private\.write_tonight_audit/i)
  assert.doesNotMatch(fn, /p_reason|reason TEXT/i)

  assert.match(diagnostics, /diagnostic_team_revision INTEGER/i)
  assert.match(diagnostics, /diagnostic_bundle_member_count INTEGER/i)
  assert.match(diagnostics, /diagnostic_attendance_revision INTEGER/i)
  assert.match(diagnostics, /diagnostic_automatic_appearance_score NUMERIC/i)
  assert.match(diagnostics, /diagnostic_appearance_adjustment NUMERIC/i)
  assert.match(diagnostics, /diagnostic_effective_appearance_score NUMERIC/i)
})

test('partner can discover only the current setup through live own-venue membership', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'partner_get_current_tonight_setup')

  assert.match(fn, /auth\.uid\(\)/i)
  assert.match(fn, /venue_partner_memberships/i)
  assert.match(fn, /membership\.user_id = v_caller/i)
  assert.match(fn, /membership\.revoked_at IS NULL/i)
  assert.match(fn, /round_row\.market_code = 'PNU'/i)
  assert.match(fn, /round_row\.status NOT IN \('completed', 'cancelled'\)/i)
  assert.match(fn, /public\.partner_get_tonight_setup\(v_round_id\)/i)
})

test('Tonight refund worker uses bounded skip-locked leases and hash-only idempotent finalization', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const claim = readFunction(sql, 'service_claim_tonight_refund_requests')
  const release = readFunction(sql, 'service_release_tonight_refund_request')
  const finalize = readFunction(sql, 'service_finalize_tonight_refund_request')

  assert.match(claim, /auth\.role\(\)[\s\S]*?service_role_required/i)
  assert.match(claim, /FOR UPDATE OF candidate SKIP LOCKED/i)
  assert.match(claim, /LEAST\(GREATEST\(p_limit, 1\), 20\)/i)
  assert.match(claim, /settlement_lease_expires_at = CURRENT_TIMESTAMP/i)
  assert.match(claim, /provider_payment_key_hash TEXT/i)
  assert.doesNotMatch(claim, /provider_payment_key TEXT/i)

  assert.match(release, /settlement_lease_id = p_lease_id/i)
  assert.match(release, /settlement_next_retry_at = CURRENT_TIMESTAMP/i)
  assert.match(release, /revision = request\.revision \+ 1/i)

  assert.match(finalize, /auth\.role\(\)[\s\S]*?service_role_required/i)
  assert.match(finalize, /p_expected_revision IS NULL[\s\S]*?expected_revision_required/i)
  assert.match(finalize, /request_row\.settlement_lease_id IS NULL[\s\S]*?request_row\.settlement_lease_id <> p_lease_id/i)
  assert.match(finalize, /request_row\.revision <> p_expected_revision[\s\S]*?stale_revision/i)
  assert.match(finalize, /COALESCE\(deposit_row\.provider_payment_key_hash, ''\)[\s\S]*?<> COALESCE\(p_provider_payment_key_hash, ''\)/i)
  assert.match(finalize, /p_refunded_amount <> public\.tonight_deposit_amount\(\)/i)
  assert.match(finalize, /status = 'refunded'/i)
  assert.match(finalize, /finalize_idempotency_key = p_idempotency_key/i)
  assert.doesNotMatch(finalize, /provider_payment_key(?!_hash)/i)
})

test('a second refund request for the same deposit reuses the existing queue row', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'request_my_tonight_refund')

  assert.match(
    fn,
    /WHERE request\.deposit_id = v_deposit\.id[\s\S]*?IF FOUND THEN[\s\S]*?RETURN v_request_id/i,
  )
  assert.match(
    fn,
    /INSERT INTO public\.tonight_deposit_refund_requests[\s\S]*?ON CONFLICT \(deposit_id\) DO NOTHING/i,
  )
})

test('a participant refund is allowed only before commitment and fails closed after acceptance or service', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'request_my_tonight_refund')

  assert.match(fn, /v_team\.status <> 'deposit_pending'[\s\S]*?deposit_not_refundable/i)
  assert.match(fn, /CURRENT_TIMESTAMP >= v_round\.deposit_due_at[\s\S]*?deposit_not_refundable/i)
  assert.match(fn, /tonight_partner_acceptances[\s\S]*?deposit_not_refundable/i)
  assert.match(fn, /tonight_partner_service_confirmations[\s\S]*?deposit_not_refundable/i)
  assert.match(fn, /tonight_settlements[\s\S]*?deposit_not_refundable/i)
  assert.match(fn, /tonight_attendance[\s\S]*?status <> 'pending'[\s\S]*?deposit_not_refundable/i)
  assert.ok(
    fn.indexOf('FOR UPDATE OF team') < fn.indexOf('FOR UPDATE OF application_row'),
    'refund request must lock team before application',
  )
  assert.ok(
    fn.indexOf('FOR UPDATE OF application_row') < fn.indexOf('FOR UPDATE OF deposit'),
    'refund request must lock application before deposit',
  )
})

test('super-admin can explicitly requeue a dead-letter refund with revision and immutable audit', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'super_admin_retry_tonight_refund')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /p_expected_revision INTEGER/i)
  assert.match(fn, /request_row\.settlement_attempt_count < 10[\s\S]*?refund_not_dead_lettered/i)
  assert.match(fn, /status = 'requested'/i)
  assert.match(fn, /settlement_attempt_count = 0/i)
  assert.match(fn, /settlement_next_retry_at = CURRENT_TIMESTAMP/i)
  assert.match(fn, /revision = request\.revision \+ 1/i)
  assert.match(fn, /quantum_private\.write_tonight_audit/i)
  assert.doesNotMatch(fn, /p_reason|reason TEXT/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.super_admin_retry_tonight_refund\(UUID, INTEGER, TEXT\)[\s\S]*?PUBLIC, anon, authenticated, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.super_admin_retry_tonight_refund\(UUID, INTEGER, TEXT\)[\s\S]*?TO authenticated/i,
  )
})

test('journey keeps the unique team code private until the accepted reveal gate', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'get_my_tonight_journey')

  assert.match(fn, /CASE WHEN v_can_reveal THEN team\.team_code ELSE NULL END/i)
})

test('audit idempotency never silently drops a conflicting before or after record', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readPrivateFunction(sql, 'write_tonight_audit')

  assert.match(fn, /ON CONFLICT \(entity_type, idempotency_key\)/i)
  assert.match(fn, /RETURNING id INTO v_audit_id/i)
  assert.match(
    fn,
    /\(v_existing\.before_state IS NULL\) <> \(p_before_state IS NULL\)[\s\S]*?v_existing\.before_state <> p_before_state/i,
  )
  assert.match(
    fn,
    /\(v_existing\.after_state IS NULL\) <> \(p_after_state IS NULL\)[\s\S]*?v_existing\.after_state <> p_after_state/i,
  )
  assert.match(fn, /audit_idempotency_conflict/i)
  assert.doesNotMatch(fn, /ON CONFLICT DO NOTHING/i)
})

test('super-admin audit DTO is round-scoped, bounded, and exposes no manual reason', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'super_admin_list_tonight_audit_events')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /p_round_id UUID/i)
  assert.match(fn, /LEAST\(GREATEST\(p_limit, 1\), 500\)/i)
  assert.match(fn, /quantum_private\.tonight_audit_events/i)
  assert.match(fn, /audit\.before_state/i)
  assert.match(fn, /audit\.after_state/i)
  assert.match(fn, /application_row\.round_id = p_round_id|team\.round_id = p_round_id/i)
  assert.doesNotMatch(fn, /reason TEXT|p_reason/i)
})

test('a PNU membership cannot be revoked while the user has an active Tonight obligation', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const fn = readFunction(sql, 'super_admin_revoke_tonight_market_membership')

  assert.match(fn, /public\.tonight_applications/i)
  assert.match(fn, /public\.tonight_rounds/i)
  assert.match(fn, /application_row\.user_id = v_membership\.user_id/i)
  assert.match(fn, /round_row\.market_code = v_membership\.market_code/i)
  assert.match(
    fn,
    /application_row\.status IN \('submitted', 'waitlisted', 'allocated'\)[\s\S]*?membership_has_active_tonight_obligations/i,
  )
})

test('every Tonight mutation carrying an idempotency key rejects blank keys', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  for (const name of [
    'super_admin_swap_tonight_friend_bundles',
    'super_admin_adjust_tonight_appearance_score',
    'mark_my_tonight_arrival',
    'partner_confirm_tonight_service',
    'request_my_tonight_refund',
    'submit_tonight_incident_report',
    'admin_record_tonight_call_attempt',
  ]) {
    const fn = readFunction(sql, name)
    assert.match(
      fn,
      /p_idempotency_key IS NULL OR pg_catalog\.btrim\(p_idempotency_key\) = ''[\s\S]*?idempotency_key_required/i,
      `${name} must fail closed on a blank idempotency key`,
    )
  }
})

test('reporting and call-attempt idempotency binds the complete operational payload', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  const report = readFunction(sql, 'submit_tonight_incident_report')
  const call = readFunction(sql, 'admin_record_tonight_call_attempt')

  assert.match(
    report,
    /report\.idempotency_key = p_idempotency_key[\s\S]*?v_report\.subject_user_id[\s\S]*?p_subject_user_id[\s\S]*?v_report\.category <> p_category[\s\S]*?v_report\.description <> pg_catalog\.btrim\(p_description\)[\s\S]*?idempotency_conflict/i,
  )
  assert.match(
    call,
    /attempt\.idempotency_key = p_idempotency_key[\s\S]*?v_attempt\.team_id <> p_team_id[\s\S]*?v_attempt\.subject_user_id <> p_subject_user_id[\s\S]*?v_attempt\.outcome <> p_outcome[\s\S]*?idempotency_conflict/i,
  )
})

test('every optimistic mutation rejects a null expected revision before writing', () => {
  const { sql } = readMigration('tonight_lifecycle_rpcs')
  for (const functionName of [
    'super_admin_revoke_tonight_market_membership',
    'partner_set_tonight_capacity',
    'partner_accept_tonight_team',
    'super_admin_adjust_tonight_appearance_score',
    'super_admin_set_tonight_attendance',
    'mark_my_tonight_arrival',
    'partner_confirm_tonight_service',
    'request_my_tonight_refund',
  ]) {
    const fn = readFunction(sql, functionName)
    assert.match(fn, /p_expected(?:_deposit)?_revision IS NULL[\s\S]*?expected_revision_required/i, functionName)
  }

  const publish = readPrivateFunction(sql, 'publish_tonight_allocation_internal')
  assert.match(
    publish,
    /p_expected_revision IS NULL[\s\S]*?expected_revision_required/i,
    'publish_tonight_allocation_internal',
  )

  const swap = readFunction(sql, 'super_admin_swap_tonight_friend_bundles')
  assert.match(
    swap,
    /p_expected_team_a_revision IS NULL[\s\S]*?p_expected_team_b_revision IS NULL[\s\S]*?expected_revision_required/i,
  )
})
