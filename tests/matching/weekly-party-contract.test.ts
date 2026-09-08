import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n')
}

function readPartyMigration() {
  const names = fs.readdirSync(path.join(ROOT, 'supabase/migrations'))
    .filter((name) => name.endsWith('_weekly_accepted_friend_party.sql'))
  assert.equal(names.length, 1, 'one forward weekly accepted-party migration must exist')
  return read(`supabase/migrations/${names[0]}`)
}

function functionBody(sql: string, name: string) {
  const qualifiedName = name.includes('.') ? name : `public.${name}`
  const escapedName = qualifiedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const start = sql.search(new RegExp(`create or replace function ${escapedName}\\(`, 'i'))
  assert.notEqual(start, -1, `missing ${name}`)
  const tail = sql.slice(start)
  const end = tail.search(/\n\$\$;/)
  assert.notEqual(end, -1, `unterminated ${name}`)
  return tail.slice(0, end + 4)
}

test('weekly party migration snapshots every application member and blocks live cross-party duplicates', () => {
  const sql = readPartyMigration()

  assert.match(sql, /create table public\.quantum_weekly_application_members/i)
  for (const field of [
    'application_id', 'participant_user_id', 'week_key', 'role', 'consent_status',
    'lifecycle_status', 'school_snapshot', 'gender_snapshot', 'roster_snapshot_hash',
    'revision',
  ]) assert.match(sql, new RegExp(`\\b${field}\\b`, 'i'))
  assert.match(sql, /unique[\s\S]*participant_user_id[\s\S]*week_key|create unique index[\s\S]*participant_user_id\s*,\s*week_key/i)
  assert.match(sql, /where lifecycle_status in \('awaiting_consents', 'active', 'assigned'\)/i)
  assert.match(sql, /insert into public\.quantum_weekly_application_members[\s\S]*from public\.quantum_weekly_applications/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all on table public\.quantum_weekly_application_members[\s\S]*public, anon, authenticated, service_role/i)
})

test('friend party apply is leader-owned, immutable, accepted-friend, ready, same-school and same-gender', () => {
  const sql = readPartyMigration()
  const apply = functionBody(sql, 'apply_to_my_weekly_activity_v2')
  const eligibility = functionBody(sql, 'quantum_private.weekly_party_member_is_eligible')

  assert.match(apply, /leader_user_id[\s\S]*v_actor/i)
  assert.match(apply, /group_members[\s\S]*left_at is null/i)
  assert.match(apply, /between 2 and 3|not between 2 and 3/i)
  assert.match(apply, /friendships[\s\S]*status\s*=\s*'active'/i)
  assert.match(apply, /friend_requests[\s\S]*status\s*=\s*'accepted'/i)
  assert.match(apply, /weekly_party_member_is_eligible/i)
  assert.match(eligibility, /resolve_profile_readiness[\s\S]*matching_ready/i)
  assert.match(eligibility, /school_scope[\s\S]*pnu_self_selected/i)
  assert.match(eligibility, /lower\([\s\S]*btrim\([\s\S]*school/i)
  assert.match(eligibility, /gender[\s\S]*male[\s\S]*female/i)
  assert.match(apply, /awaiting_consents/i)
  assert.match(apply, /roster_snapshot_hash/i)
  assert.match(apply, /request_hash/i)
  assert.match(apply, /idempotency_key_reused/i)
})

test('all member consents bind to the same roster and candidate-date revision before activation', () => {
  const sql = readPartyMigration()
  const consent = functionBody(sql, 'set_my_weekly_party_consent')

  assert.match(consent, /participant_user_id\s*=\s*v_actor/i)
  assert.match(consent, /for update/i)
  assert.match(consent, /expected_revision[\s\S]*stale_revision/i)
  assert.match(consent, /roster_snapshot_hash/i)
  assert.match(consent, /request_hash/i)
  assert.match(consent, /consent_status[\s\S]*accepted/i)
  assert.match(consent, /not exists[\s\S]*consent_status[\s\S]*accepted/i)
  assert.match(consent, /v_next_status\s*:=\s*'active'[\s\S]*status\s*=\s*v_next_status/i)
  assert.match(consent, /idempotency_key_reused/i)
})

test('service assignment locks and places every party seat in one occurrence or none', () => {
  const sql = readPartyMigration()
  const assign = functionBody(sql, 'assign_weekly_party_for_service')

  assert.match(assign, /service_role_required/i)
  assert.match(assign, /weekly-window:/i)
  assert.match(assign, /weekly-application:/i)
  assert.match(assign, /quantum-event-user\|/i)
  assert.match(assign, /order by[\s\S]*participant_user_id/i)
  assert.match(assign, /for update/i)
  assert.match(assign, /consent_status[\s\S]*accepted/i)
  assert.match(assign, /is_profile_matching_ready/i)
  assert.match(assign, /roster_snapshot_hash/i)
  assert.match(assign, /count\(distinct member\.gender_snapshot\)[\s\S]*v_gender_variant_count[\s\S]*<>\s*1/i)
  assert.match(assign, /count\(distinct[\s\S]*school_snapshot[\s\S]*v_school_variant_count[\s\S]*<>\s*1/i)
  assert.match(assign, /confirmed_schedule_conflict/i)
  assert.match(assign, /v_roster_count\s*\+\s*v_party_size[\s\S]*required_total/i)
  assert.match(assign, /v_gender_count\s*\+\s*v_party_size[\s\S]*(?:male_capacity|female_capacity)/i)
  assert.match(assign, /insert into public\.quantum_event_participations[\s\S]*select[\s\S]*participant_user_id/i)
  assert.match(assign, /'friends'/i)
  assert.doesNotMatch(assign, /v_application\.user_id[\s\S]*'scheduled'[\s\S]*'solo'/i)
  assert.match(assign, /assignment_idempotency_key[\s\S]*replayed/i)
})

test('service assignment preserves the shared event lock order and freezes mutable party evidence', () => {
  const sql = readPartyMigration()
  const apply = functionBody(sql, 'apply_to_my_weekly_activity_v2')
  const assign = functionBody(sql, 'assign_weekly_party_for_service')
  const userLock = assign.indexOf("'quantum-event-user|'")
  const occurrenceLock = assign.search(/from public\.quantum_event_occurrences[\s\S]*for update/i)

  assert.notEqual(userLock, -1, 'assignment must lock every participant user')
  assert.notEqual(occurrenceLock, -1, 'assignment must lock its occurrence')
  assert.ok(userLock < occurrenceLock, 'participant locks must precede the occurrence lock')
  assert.match(assign, /pg_try_advisory_xact_lock[\s\S]*weekly_assignment_retry/i)
  assert.match(assign, /from public\.groups[\s\S]*leader_user_id[\s\S]*for update/i)
  assert.match(assign, /from public\.group_members[\s\S]*order by[\s\S]*user_id[\s\S]*for update/i)
  assert.match(assign, /from public\.friendships[\s\S]*join public\.friend_requests[\s\S]*for update of friendship, request/i)
  assert.match(apply, /v_member_ids is null[\s\S]*cardinality\(v_member_ids\)[\s\S]*not between 2 and 3/i)
})

test('pre-allocation withdrawal cancels the bundle and assigned applications remain immutable', () => {
  const sql = readPartyMigration()
  const consent = functionBody(sql, 'set_my_weekly_party_consent')

  assert.match(consent, /decision[\s\S]*withdraw/i)
  assert.match(consent, /status\s*=\s*'cancelled'/i)
  assert.match(consent, /withdrawn_by/i)
  assert.match(consent, /party_member_withdrew/i)
  assert.match(consent, /assigned_application_cannot_cancel/i)
  assert.doesNotMatch(consent, /party_type\s*=\s*'solo'|group_id\s*=\s*null/i)
  assert.doesNotMatch(consent, /review_required/i)
})

test('weekly party database fixtures are security-focused and always roll back', () => {
  const fixture = read('supabase/tests/weekly-party-runtime.sql')

  assert.match(fixture, /^\\set ON_ERROR_STOP on/m)
  assert.match(fixture, /begin;[\s\S]*rollback;\s*$/i)
  assert.match(fixture, /no_raw_member_reads/i)
  assert.match(fixture, /old_solo_bypasses_revoked/i)
  assert.match(fixture, /no_cross_party_or_solo_live_membership/i)
  assert.match(fixture, /withdraw\.owner_sees_same_cancelled_state/i)
  assert.match(fixture, /privacy\.discovery_omits_other_member_identity_school_gender_and_withdrawer/i)
  assert.match(fixture, /assigned_application_cannot_cancel/i)
  assert.match(fixture, /bootstrap\.every_solo_and_party_application_has_owner_member/i)
  assert.match(fixture, /allocator\.actual_apply_consent_assign_all_members_same_occurrence/i)
  assert.match(fixture, /allocator\.same_key_replays_without_duplicate_seats/i)
  assert.match(fixture, /allocator\.capacity_failure_inserts_zero_party_members/i)
})

test('weekly HTTP and UI expose party consent without client-side allocation authority', () => {
  for (const relativePath of [
    'app/api/match/weekly-availability/party-consent/route.ts',
    'components/matching/WeeklyPartyControls.tsx',
  ]) assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `missing ${relativePath}`)

  const route = read('app/api/match/weekly-availability/route.ts')
  const consentRoute = read('app/api/match/weekly-availability/party-consent/route.ts')
  const internal = read('app/api/internal/match/weekly/assign/route.ts')
  const explorer = read('components/matching/WeeklyActivityExplorer.tsx')
  const controls = read('components/matching/WeeklyPartyControls.tsx')

  assert.match(route, /get_my_weekly_activity_discovery_v2/)
  assert.match(route, /apply_to_my_weekly_activity_v2/)
  assert.match(route, /party_group_id/)
  assert.match(consentRoute, /set_my_weekly_party_consent/)
  assert.match(consentRoute, /expected_revision/)
  assert.match(consentRoute, /allowedRoles:\s*\['user'\]/)
  assert.match(internal, /assign_weekly_party_for_service/)
  assert.match(internal, /isAuthorizedInternalRequest/)
  assert.match(internal, /assignment_retry[\s\S]*retryable:\s*true/)
  assert.match(explorer, /WeeklyPartyControls/)
  assert.match(controls, /친구[\s\S]*2[\s\S]*3|2~3명/)
  assert.match(controls, /전원[\s\S]*수락/)
  assert.match(controls, /친구들의 동반 신청도 함께 취소/)
  assert.match(controls, /확정된 일정은 여기서 취소할 수 없어요/)
  assert.match(controls, /party-consent/)
  assert.doesNotMatch(controls, /assign_weekly_party_for_service|service_role/i)
})
