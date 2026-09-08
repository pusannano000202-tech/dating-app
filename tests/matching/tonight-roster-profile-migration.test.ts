import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function migration(name: string): string {
  return readFileSync(join(migrationsDir, name), 'utf8')
}

function migrationBySuffix(suffix: string): string {
  const names = readdirSync(migrationsDir).filter((name) =>
    new RegExp(`^\\d{14}_${suffix}\\.sql$`).test(name),
  )
  assert.equal(names.length, 1, `expected one ${suffix} migration`)
  return migration(names[0])
}

function readFunction(sql: string, schema: 'public' | 'quantum_private', name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing ${schema}.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for ${schema}.${name}`)
  assert.notEqual(end, -1, `missing end for ${schema}.${name}`)
  return sql.slice(start, end + 3)
}

const rosterSql = migrationBySuffix('tonight_roster_profiles')
const partnerServiceRoute = readFileSync(join(process.cwd(), 'app', 'api', 'partner', 'tonight', 'service', 'route.ts'), 'utf8')

test('roster profiles run after the authoritative friend invite ledger', () => {
  const names = readdirSync(migrationsDir)
  const rosterName = names.find((name) => name.endsWith('_tonight_roster_profiles.sql'))
  const friendInviteName = names.find((name) => name.endsWith('_tonight_friend_invites.sql'))

  assert.ok(rosterName)
  assert.ok(friendInviteName)
  assert.ok(rosterName > friendInviteName, `${rosterName} must run after ${friendInviteName}`)
})

test('Tonight schema supports only the standard 3M2F or female-trio exception 3M3F sizes', () => {
  const preflightIndex = rosterSql.indexOf('tonight_roster_legacy_team_remediation_required')
  const constraintDropIndex = rosterSql.indexOf('DROP CONSTRAINT IF EXISTS tonight_teams_member_count_check')
  assert.ok(preflightIndex >= 0, 'legacy incompatible teams must fail with an explicit remediation gate')
  assert.ok(
    constraintDropIndex > preflightIndex,
    'legacy roster preflight must run before any existing team constraint is dropped',
  )
  assert.match(
    rosterSql,
    /IF EXISTS\s*\([\s\S]*?member_count = 5[\s\S]*?male_count = 3[\s\S]*?female_count = 2[\s\S]*?member_count = 6[\s\S]*?male_count = 3[\s\S]*?female_count = 3/i,
  )
  assert.match(rosterSql, /ALTER TABLE public\.tonight_teams[\s\S]*?CHECK \(member_count IN \(5, 6\)\)/i)
  assert.match(
    rosterSql,
    /member_count = 5[\s\S]*?male_count = 3 AND female_count = 2[\s\S]*?member_count = 6[\s\S]*?male_count = 3 AND female_count = 3/i,
  )
  assert.doesNotMatch(rosterSql, /male_count = 2 AND female_count = 3/i)
  assert.match(rosterSql, /tonight_team_members[\s\S]*?seat_number BETWEEN 1 AND 6/i)
  assert.match(rosterSql, /tonight_partner_acceptances[\s\S]*?accepted_headcount BETWEEN 0 AND 6/i)
  assert.match(rosterSql, /tonight_partner_service_confirmations[\s\S]*?confirmed_attendee_count BETWEEN 0 AND 6/i)
  assert.match(rosterSql, /tonight_settlements[\s\S]*?confirmed_attendee_count BETWEEN 0 AND 6/i)
  assert.match(rosterSql, /max_team_headcount[\s\S]*?IN \(5, 6\)/i)
})

test('database integrity allows six people only with one atomic all-female trio bundle', () => {
  const integrity = readFunction(rosterSql, 'quantum_private', 'assert_tonight_team_integrity')

  assert.match(integrity, /v_member_count NOT IN \(5, 6\)/i)
  assert.match(integrity, /v_member_count = 5[\s\S]*?v_male_count = 3[\s\S]*?v_female_count = 2/i)
  assert.match(integrity, /v_member_count = 6[\s\S]*?v_male_count = 3[\s\S]*?v_female_count = 3/i)
  assert.match(integrity, /six_person_team_requires_female_trio_bundle/i)
  assert.match(
    integrity,
    /GROUP BY member\.bundle_id[\s\S]*?HAVING COUNT\(\*\) = 3[\s\S]*?gender_code = 'female'/i,
  )
  assert.match(integrity, /COUNT\(\*\) FILTER \([\s\S]*?application_row\.status = 'allocated'[\s\S]*?\) = 3/i)
  assert.match(integrity, /AS bundle_member_ready/i)
  assert.match(
    integrity,
    /HAVING COUNT\(\*\) <> \(\s*SELECT COUNT\(\*\)\s*FROM public\.tonight_friend_bundle_members/i,
  )
})

test('ranked activity validation accepts dynamic team size and ignores incompatible higher-ranked capacity', () => {
  const ranked = readFunction(rosterSql, 'quantum_private', 'assert_tonight_ranked_activity_selection')

  assert.match(ranked, /v_team_size\s+INTEGER\s*:=\s*pg_catalog\.cardinality\(p_application_ids\)/i)
  assert.match(ranked, /v_team_size NOT IN \(5, 6\)/i)
  assert.match(ranked, /v_application_count <> v_team_size/i)
  assert.match(ranked, /v_choice_count <> v_team_size \* 3/i)
  assert.match(ranked, /capacity\.max_team_headcount >= v_team_size/i)
  assert.doesNotMatch(ranked, /cardinality\(p_application_ids\) <> 5/i)
  assert.doesNotMatch(ranked, /v_application_count <> 5/i)
  assert.doesNotMatch(ranked, /v_choice_count <> 15/i)
})

test('allocator input derives readiness from submitted membership and accepted invite state', () => {
  const allocatorInput = readFunction(rosterSql, 'public', 'service_get_tonight_allocator_input')

  assert.match(allocatorInput, /'max_team_headcount', capacity\.max_team_headcount/i)
  assert.match(allocatorInput, /'bundle_member_ready'/i)
  assert.match(allocatorInput, /application_row\.status IN \('submitted', 'waitlisted'\)/i)
  assert.match(allocatorInput, /tonight_market_memberships[\s\S]*?revoked_at IS NULL/i)
  assert.match(allocatorInput, /tonight_friend_bundle_members/i)
  assert.match(
    allocatorInput,
    /bundle\.created_by = application_row\.user_id[\s\S]*?tonight_friend_invites[\s\S]*?status = 'accepted'[\s\S]*?claimed_by_user_id = application_row\.user_id/i,
  )
  assert.doesNotMatch(allocatorInput, /'bundle_member_ready', TRUE/i)
})

test('both allocation publishers accept 5 or 6 members and enforce the trio exception', () => {
  const publish = readFunction(rosterSql, 'quantum_private', 'publish_tonight_allocation_internal')
  assert.match(publish, /v_expected_member_count NOT IN \(5, 6\)/i)
  assert.match(publish, /v_valid_application_count <> v_expected_member_count/i)
  assert.match(publish, /six_person_team_requires_female_trio_bundle/i)
  assert.match(publish, /max_team_headcount < v_expected_member_count/i)
  assert.match(
    publish,
    /HAVING COUNT\(\*\) <> \(\s*SELECT COUNT\(\*\)\s*FROM public\.tonight_friend_bundle_members/i,
  )
  assert.doesNotMatch(publish, /jsonb_array_length\(v_members\) <> 5/i)
})

test('deposit and partner acceptance gates compare against the actual team size', () => {
  const prepare = readFunction(rosterSql, 'public', 'service_prepare_tonight_deposit')
  const recordResult = readFunction(rosterSql, 'public', 'service_record_tonight_deposit_result')
  const expireGate = readFunction(rosterSql, 'public', 'service_expire_tonight_deposit_gate')
  const accept = readFunction(rosterSql, 'public', 'partner_accept_tonight_team')

  assert.match(prepare, /team_row public\.tonight_teams%ROWTYPE[\s\S]*?FOR UPDATE OF team/i)
  assert.match(recordResult, /v_paid_count = v_team\.member_count/i)
  assert.match(expireGate, /v_paid_count = team_row\.member_count/i)
  assert.match(accept, /v_member_count <> v_team\.member_count[\s\S]*?v_paid_count <> v_team\.member_count/i)
  assert.match(accept, /accepted_headcount[\s\S]*?v_team\.member_count/i)
  for (const definition of [prepare, recordResult, expireGate, accept]) {
    assert.doesNotMatch(definition, /(?:member|paid|accepted)_count\s*(?:=|<>)\s*5/i)
  }
})

test('attendance and service confirmation never exceed the assigned team size', () => {
  const partnerConfirm = readFunction(rosterSql, 'public', 'partner_confirm_tonight_service')
  const recordAttempt = readFunction(rosterSql, 'public', 'partner_record_tonight_service_confirmation_attempt')

  assert.match(partnerConfirm, /p_confirmed_attendee_count > v_team\.member_count/i)
  assert.match(recordAttempt, /p_reported_attendee_count > v_team\.member_count/i)
  assert.match(rosterSql, /tonight_partner_service_confirmation_attempts[\s\S]*?reported_attendee_count BETWEEN 0 AND 6/i)
  assert.match(rosterSql, /tonight_partner_service_confirmation_attempts[\s\S]*?observed_arrived_count BETWEEN 0 AND 6/i)
  assert.match(
    partnerServiceRoute,
    /confirmed_attendee_count[\s\S]*?asInteger\([\s\S]*?min:\s*0,\s*max:\s*6/i,
  )
})

test('partners atomically write a five or six person capacity profile', () => {
  const profile = readFunction(rosterSql, 'public', 'partner_set_tonight_capacity_profile')
  const legacy = readFunction(rosterSql, 'public', 'partner_set_tonight_capacity')
  const setup = readFunction(rosterSql, 'public', 'partner_get_tonight_setup')

  assert.match(profile, /p_max_team_headcount SMALLINT/i)
  assert.match(profile, /p_max_team_headcount NOT IN \(5, 6\)/i)
  assert.match(profile, /snapshot\.id = \(\s*SELECT latest_snapshot\.id[\s\S]*?ORDER BY latest_snapshot\.created_at DESC/i)
  assert.match(profile, /activity\.allowed_venue_categories[\s\S]*?venue_activity_category_incompatible/i)
  assert.match(profile, /tonight-capacity-set-key:/i)
  assert.match(profile, /quantum_private\.tonight_audit_events[\s\S]*?actor_user_id IS DISTINCT FROM v_caller/i)
  assert.match(profile, /after_state ->> 'max_team_headcount'[\s\S]*?IS DISTINCT FROM p_max_team_headcount/i)
  assert.match(profile, /venue-partner-venue:/i)
  assert.match(profile, /FOR UPDATE OF capacity/i)
  assert.match(profile, /max_team_headcount[\s\S]*?p_max_team_headcount/i)
  assert.match(legacy, /partner_set_tonight_capacity_profile\([\s\S]*?5::SMALLINT/i)
  assert.match(setup, /'max_team_headcount', COALESCE\(capacity\.max_team_headcount, 5\)/i)
  assert.match(
    rosterSql,
    /REVOKE ALL ON FUNCTION public\.partner_set_tonight_capacity_profile\(UUID, UUID, UUID, INTEGER, SMALLINT, INTEGER, TEXT\) FROM PUBLIC/i,
  )
  assert.match(
    rosterSql,
    /GRANT EXECUTE ON FUNCTION public\.partner_set_tonight_capacity_profile\(UUID, UUID, UUID, INTEGER, SMALLINT, INTEGER, TEXT\) TO authenticated/i,
  )
})

test('remaining roster-sensitive functions are forward-defined with dynamic team limits', () => {
  const swap = readFunction(rosterSql, 'public', 'super_admin_swap_tonight_friend_bundles')
  const dashboard = readFunction(rosterSql, 'public', 'partner_get_tonight_dashboard')

  assert.match(swap, /assert_tonight_team_integrity/i)
  assert.doesNotMatch(swap, /jsonb_array_length\([^)]*\)\s*<>\s*5/i)
  assert.match(dashboard, /team\.member_count/i)

  for (const name of [
    'service_prepare_tonight_deposit',
    'service_record_tonight_deposit_result',
    'service_expire_tonight_deposit_gate',
    'partner_accept_tonight_team',
    'super_admin_swap_tonight_friend_bundles',
    'partner_confirm_tonight_service',
    'partner_record_tonight_service_confirmation_attempt',
    'partner_get_tonight_dashboard',
  ]) {
    const definition = readFunction(rosterSql, 'public', name)
    assert.match(definition, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
  }
})

test('privileged roster functions keep explicit execute boundaries', () => {
  for (const signature of [
    'quantum_private.assert_tonight_ranked_activity_selection(UUID, UUID[], UUID, BOOLEAN)',
    'quantum_private.assert_tonight_team_integrity(UUID)',
    'quantum_private.publish_tonight_allocation_internal(UUID, INTEGER, JSONB, TEXT)',
    'public.service_get_tonight_allocator_input(UUID)',
    'public.service_prepare_tonight_deposit(UUID, UUID, TEXT, INTEGER, TEXT)',
    'public.service_record_tonight_deposit_result(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT)',
    'public.service_expire_tonight_deposit_gate(UUID, TEXT)',
    'public.partner_accept_tonight_team(UUID, INTEGER, TEXT)',
    'public.super_admin_swap_tonight_friend_bundles(UUID, UUID, INTEGER, UUID, UUID, INTEGER, TEXT)',
    'public.partner_confirm_tonight_service(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT)',
    'public.partner_record_tonight_service_confirmation_attempt(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT)',
    'public.partner_get_tonight_dashboard(UUID)',
    'public.partner_set_tonight_capacity_profile(UUID, UUID, UUID, INTEGER, SMALLINT, INTEGER, TEXT)',
    'public.partner_set_tonight_capacity(UUID, UUID, UUID, SMALLINT, INTEGER, TEXT)',
    'public.partner_get_tonight_setup(UUID)',
  ]) {
    const escapedSignature = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(rosterSql, new RegExp(`REVOKE ALL ON FUNCTION ${escapedSignature} FROM PUBLIC`, 'i'))
  }
  assert.match(rosterSql, /GRANT EXECUTE ON FUNCTION public\.service_get_tonight_allocator_input\(UUID\) TO service_role/i)
  assert.match(rosterSql, /GRANT EXECUTE ON FUNCTION public\.partner_accept_tonight_team\(UUID, INTEGER, TEXT\) TO authenticated/i)
  assert.match(rosterSql, /GRANT EXECUTE ON FUNCTION public\.partner_get_tonight_setup\(UUID\) TO authenticated/i)
})
