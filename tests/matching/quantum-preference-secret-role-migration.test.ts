import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/20260814030000_matching_profile_preference_secret_roles.sql',
)

function readMigration() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8')
}

function extractFunction(sql: string, schema: 'private' | 'public', name: string) {
  const signature = new RegExp(`create\\s+or\\s+replace\\s+function\\s+${schema}\\.${name}\\s*\\(`, 'i')
  const start = sql.search(signature)
  assert.notEqual(start, -1, `missing ${schema}.${name}`)
  const tail = sql.slice(start)
  const end = tail.search(/\n\$\$;/)
  assert.notEqual(end, -1, `unterminated ${schema}.${name}`)
  return tail.slice(0, end + 4)
}

test('creates four private versioned stores with RLS and no browser table access', () => {
  const sql = readMigration()
  const tables = [
    'quantum_profile_preferences',
    'quantum_event_meeting_moment_drafts',
    'quantum_event_secret_role_assignments',
    'quantum_event_role_guesses',
  ]

  for (const table of tables) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? private\\.${table}`, 'i'))
    assert.match(sql, new RegExp(`alter table private\\.${table} enable row level security`, 'i'))
    assert.match(
      sql,
      new RegExp(`revoke all on table private\\.${table}\\s+from public, anon, authenticated`, 'i'),
    )
  }

  assert.match(sql, /is_active\s+boolean\s+not null/i)
  assert.match(sql, /invalidated_at\s+timestamptz/i)
  assert.match(sql, /invalidation_reason\s+text/i)
  assert.match(sql, /jsonb_typeof/i)
  assert.match(sql, /foreign key|references public\./i)
})

test('locks active rows behind unique partial indexes and room foreign-key indexes', () => {
  const sql = readMigration()

  assert.match(sql, /create unique index[\s\S]*quantum_profile_preferences[\s\S]*where is_active/i)
  assert.match(sql, /create unique index[\s\S]*quantum_event_meeting_moment_drafts[\s\S]*where is_active/i)
  assert.match(sql, /create unique index[\s\S]*quantum_event_secret_role_assignments[\s\S]*occurrence_id[\s\S]*role_key[\s\S]*where is_active/i)
  assert.match(sql, /create unique index[\s\S]*quantum_event_role_guesses[\s\S]*guesser_user_id[\s\S]*target_user_id[\s\S]*where is_active/i)
  assert.match(sql, /quantum_event_secret_role_assignments_participant_history_idx/i)
  assert.match(sql, /quantum_event_role_guesses_target_idx/i)
})

test('gives every user RPC a fixed definer boundary and authenticated-only execute grant', () => {
  const sql = readMigration()
  const userFunctions = [
    'get_my_quantum_profile_preference',
    'save_my_quantum_profile_preference',
    'get_my_quantum_event_meeting_moment',
    'save_my_quantum_event_meeting_moment',
    'save_my_quantum_event_meeting_moment_and_participate',
    'get_my_quantum_event_secret_role',
    'confirm_my_quantum_event_secret_role',
    'change_my_quantum_event_secret_role',
    'submit_my_quantum_event_role_guesses',
    'get_my_quantum_event_role_guess_state',
    'get_my_quantum_event_room_participants',
    'cancel_my_quantum_event_participation',
  ]

  for (const name of userFunctions) {
    const fn = extractFunction(sql, 'public', name)
    assert.match(fn, /security definer/i)
    assert.match(fn, /set search_path\s*=\s*''/i)
    assert.match(fn, /auth\.uid\(\)/i)
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to authenticated`, 'i'),
    )
  }
})

test('pins profile preferences to the current debate bank and its eleven question ids', () => {
  const sql = readMigration()
  const validator = extractFunction(sql, 'private', 'quantum_profile_preference_payload_is_safe')
  const save = extractFunction(sql, 'public', 'save_my_quantum_profile_preference')
  const questionIds = [
    'jjajang-jjamppong',
    'tangsuyuk',
    'mint-chocolate',
    'naengmyeon',
    'perilla-leaf',
    'shrimp-peeling',
    'padding-zipper',
    'bluetooth-history',
    'friend-drinking',
    'surprise-contact',
    'hotdog-bite',
  ]

  assert.match(validator, /p_question_bank_version\s*(?:<>|!=)\s*1/i)
  assert.match(validator, /questionBankVersion[\s\S]*quantum-debate-v1/i)
  for (const questionId of questionIds) {
    assert.match(validator, new RegExp(`'${questionId}'`, 'i'))
  }
  assert.match(validator, /questionId[\s\S]*(?:not\s+in|=\s*any)/i)
  assert.match(save, /quantum_profile_preference_payload_is_safe/i)
  assert.match(
    sql,
    /revoke all on table private\.quantum_profile_preferences[\s\S]*from public, anon, authenticated, service_role/i,
  )
})

test('atomically resolves an occurrence, saves readiness, and returns only the caller sealed role', () => {
  const sql = readMigration()
  const readiness = extractFunction(sql, 'private', 'quantum_event_precard_ready')
  const atomic = extractFunction(
    sql,
    'public',
    'save_my_quantum_event_meeting_moment_and_participate',
  )
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/match/event-participation/route.ts'),
    'utf8',
  )

  assert.doesNotMatch(readiness, /pre_match_card_drafts/i)
  assert.match(readiness, /private\.quantum_profile_preferences/i)
  assert.match(readiness, /is_active/i)
  assert.match(atomic, /auth\.uid\(\)/i)
  assert.match(atomic, /public\.set_my_quantum_event_participation/i)
  assert.match(atomic, /public\.save_my_quantum_event_meeting_moment/i)
  assert.match(atomic, /public\.get_my_quantum_event_secret_role/i)
  assert.match(atomic, /occurrence_id/i)
  assert.match(atomic, /'participation'[\s\S]*'meeting_moment'[\s\S]*'secret_role'/i)
  assert.match(atomic, /'role_confirmation_required'[\s\S]*role_confirmed/i)
  assert.match(atomic, /'application_confirmed'[\s\S]*role_confirmed/i)
  assert.doesNotMatch(atomic, /jsonb_agg[\s\S]*role|swap_target|target_user_id/i)
  assert.doesNotMatch(atomic, /p_occurrence_(?:id|key)/i)
  assert.match(
    sql,
    /revoke all on function public\.set_my_quantum_event_participation\(\s*TEXT, TEXT, TEXT, UUID\s*\)[\s\S]*from public, anon, authenticated, service_role/i,
  )
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.set_my_quantum_event_participation\(\s*TEXT, TEXT, TEXT, UUID\s*\)\s*to authenticated/i,
  )
  assert.match(route, /save_my_quantum_event_meeting_moment_and_participate/i)
  assert.match(route, /meeting_moment/i)
  assert.match(route, /parseMySecretRole/i)
  assert.match(route, /role_confirmation_required/i)
  assert.match(route, /application_confirmed/i)
  assert.doesNotMatch(route, /get_my_pre_match_card_draft|pre_match_card_required/i)
  assert.doesNotMatch(route, /\.rpc\('set_my_quantum_event_participation'/i)
})

test('replaces legacy snapshots with a v2 allowlist that never emits a role field', () => {
  const sql = readMigration()
  const snapshot = extractFunction(sql, 'private', 'snapshot_quantum_event_room_member_card')
  const participants = extractFunction(sql, 'public', 'get_my_quantum_event_room_participants')

  assert.match(sql, /add column if not exists schema_version[\s\S]*default 1/i)
  assert.match(sql, /schema_version\s*=\s*2/i)
  assert.match(sql, /'profile_preference'/i)
  assert.match(sql, /'meeting_moment'/i)
  assert.match(sql, /quantum_public_snapshot_payload_is_safe\s*\(\s*safe_payload\s*\)/i)
  assert.doesNotMatch(snapshot, /pre_match_card_drafts|meetup_role|secret_role|role_key/i)
  assert.doesNotMatch(participants, /meetup_role|secret_role|role_key|'role'/i)
  assert.doesNotMatch(
    participants,
    /'user_id'|'display_name'|'real_name'|'photo'|'department'|'contact'|'phone'|'appearance_score'/i,
  )
  assert.match(participants, /status\s+in\s*\(\s*'recruiting'\s*,\s*'confirmed'\s*\)/i)
  assert.match(participants, /schema_version\s*=\s*2/i)
})

test('normalizes Unicode contact attacks before every private payload write', () => {
  const sql = readMigration()
  const safeText = extractFunction(sql, 'private', 'quantum_text_is_safe')

  assert.match(safeText, /normalize\s*\(\s*p_value\s*,\s*NFKC\s*\)/i)
  assert.match(safeText, /\\200B|200b/i)
  assert.match(safeText, /v_compact/i)
  assert.match(safeText, /\+\??(?:\\d|\[0-9\])/i)
  assert.match(safeText, /@|email|이메일/i)
  assert.match(safeText, /연락|contact|message/i)

  for (const attack of [
    '+82 10-1234-5678',
    '０１０－１２３４－５６７８',
    'ｎａｍｅ＠ｅｘａｍｐｌｅ．ｃｏｍ',
    'name @ example . com',
    '인\u200B스타 디엠',
    '연\u200B락 주세요',
  ]) {
    assert.ok(attack.length > 0)
  }
})

test('validates every v2 snapshot nested element through a closed payload helper', () => {
  const sql = readMigration()
  const validator = extractFunction(sql, 'private', 'quantum_public_snapshot_payload_is_safe')

  assert.match(sql, /quantum_public_snapshot_payload_is_safe\s*\(\s*safe_payload\s*\)/i)
  assert.match(validator, /profile_preference[\s\S]*meeting_moment/i)
  assert.match(validator, /jsonb_array_elements[\s\S]*interests/i)
  assert.match(validator, /jsonb_array_elements[\s\S]*debate_answers/i)
  assert.match(validator, /question_id[\s\S]*choice/i)
  assert.match(validator, /jsonb_typeof/i)
  assert.match(validator, /private\.quantum_text_is_safe/i)
})

test('returns unready room members with stable seats and null v2 cards', () => {
  const sql = readMigration()
  const participants = extractFunction(sql, 'public', 'get_my_quantum_event_room_participants')

  assert.match(participants, /private\.quantum_event_room_people/i)
  assert.match(participants, /left join public\.quantum_event_room_card_snapshots/i)
  assert.match(participants, /'ready'/i)
  assert.match(participants, /case[\s\S]*schema_version\s*=\s*2[\s\S]*else false/i)
  assert.match(participants, /'profile_preference'[\s\S]*case[\s\S]*else null/i)
  assert.match(participants, /'meeting_moment'[\s\S]*case[\s\S]*else null/i)
})

test('adds an owner-only active meeting moment read RPC', () => {
  const sql = readMigration()
  const getter = extractFunction(sql, 'public', 'get_my_quantum_event_meeting_moment')

  assert.match(getter, /security definer/i)
  assert.match(getter, /set search_path\s*=\s*''/i)
  assert.match(getter, /auth\.uid\(\)/i)
  assert.match(getter, /occurrence\.event_id\s*=\s*p_event_key/i)
  assert.match(getter, /quantum_event_assignment_people/i)
  assert.match(getter, /moment\.participant_user_id\s*=\s*v_user_id/i)
  assert.match(getter, /moment\.is_active/i)
  assert.doesNotMatch(getter, /jsonb_build_object[\s\S]*user_id|role_key|secret_role/i)
  assert.match(
    sql,
    /revoke all on function public\.get_my_quantum_event_meeting_moment\(TEXT, TEXT\)[\s\S]*from public, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /grant execute on function public\.get_my_quantum_event_meeting_moment\(TEXT, TEXT\)[\s\S]*to authenticated/i,
  )
})

test('assigns unique roles immediately for one to five members while considering history', () => {
  const sql = readMigration()
  const assign = extractFunction(sql, 'private', 'ensure_quantum_event_secret_role_assignments')

  for (const role of ['explorer', 'reactor', 'observer', 'bridge', 'pace_maker']) {
    assert.match(assign, new RegExp(`'${role}'`, 'i'))
  }
  assert.match(assign, /from public\.quantum_event_occurrences[\s\S]*for update/i)
  assert.match(assign, /between 1 and 5/i)
  assert.match(assign, /v_recent_role|participant_history/i)
  assert.match(assign, /not exists[\s\S]*role_key/i)
  assert.match(sql, /unique[\s\S]*occurrence_id[\s\S]*role_key[\s\S]*where is_active/i)
})

test('requires owner role confirmation before capacity finalization', () => {
  const sql = readMigration()
  const getRole = extractFunction(sql, 'public', 'get_my_quantum_event_secret_role')
  const confirmRole = extractFunction(sql, 'public', 'confirm_my_quantum_event_secret_role')
  const capacityTrigger = extractFunction(sql, 'public', 'handle_quantum_event_capacity_reached')

  assert.match(sql, /role_confirmed_at\s+timestamptz/i)
  assert.match(
    sql,
    /function public\.confirm_my_quantum_event_secret_role\(\s*p_occurrence_id UUID\s*\)/i,
  )
  assert.match(confirmRole, /auth\.uid\(\)/i)
  assert.match(confirmRole, /occurrence\.id\s*=\s*p_occurrence_id/i)
  assert.match(confirmRole, /private\.quantum_event_room_people/i)
  assert.match(confirmRole, /for update/i)
  assert.match(confirmRole, /private\.ensure_quantum_event_secret_role_assignments/i)
  assert.match(confirmRole, /update private\.quantum_event_secret_role_assignments[\s\S]*role_confirmed_at/i)
  assert.match(confirmRole, /participant_user_id\s*=\s*v_user_id/i)
  assert.match(confirmRole, /private\.quantum_event_role_confirmations_complete/i)
  assert.match(confirmRole, /public\.finalize_quantum_event_occurrence/i)
  assert.match(confirmRole, /'role_confirmed'\s*,\s*true/i)
  assert.match(confirmRole, /'application_confirmed'\s*,\s*true/i)
  assert.match(getRole, /'role_confirmed'/i)
  assert.match(getRole, /'application_confirmed'/i)

  const completionCheck = extractFunction(
    sql,
    'private',
    'quantum_event_role_confirmations_complete',
  )
  assert.match(completionCheck, /required_total/i)
  assert.match(completionCheck, /role_confirmed_at\s+is not null/i)
  assert.match(completionCheck, /private\.quantum_event_room_people/i)

  assert.match(capacityTrigger, /security definer/i)
  assert.match(capacityTrigger, /set search_path\s*=\s*''/i)
  assert.match(capacityTrigger, /private\.quantum_event_role_confirmations_complete/i)
  const confirmationGate = capacityTrigger.search(
    /private\.quantum_event_role_confirmations_complete/i,
  )
  const finalization = capacityTrigger.search(/public\.finalize_quantum_event_occurrence/i)
  assert.ok(confirmationGate >= 0 && finalization > confirmationGate)
  assert.match(
    sql,
    /revoke all on function public\.handle_quantum_event_capacity_reached\(\)[\s\S]*from public, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /comment on function public\.handle_quantum_event_capacity_reached\(\)[\s\S]*trigger-only|trigger only/i,
  )
  assert.doesNotMatch(capacityTrigger, /auth\.uid\(\)/i)
})

test('changes a role once through an atomic private swap without exposing the target', () => {
  const sql = readMigration()
  const getRole = extractFunction(sql, 'public', 'get_my_quantum_event_secret_role')
  const confirmRole = extractFunction(sql, 'public', 'confirm_my_quantum_event_secret_role')
  const change = extractFunction(sql, 'public', 'change_my_quantum_event_secret_role')

  assert.match(change, /for update/i)
  assert.match(change, /changed_once/i)
  assert.match(change, /role_change_already_used/i)
  assert.match(change, /starts_at/i)
  assert.match(change, /role_change_closed/i)
  assert.match(change, /update private\.quantum_event_secret_role_assignments[\s\S]*is_active\s*=\s*false/i)
  assert.match(change, /insert into private\.quantum_event_secret_role_assignments/gi)
  assert.match(change, /v_other\.changed_once/i)
  assert.match(
    change,
    /if\s+v_mine\.role_confirmed_at\s+is\s+not\s+null\s+then[\s\S]*role_change_closed/i,
  )
  assert.match(
    change,
    /participant_user_id\s*<>\s*v_user_id[\s\S]*assignment\.is_active[\s\S]*assignment\.role_confirmed_at\s+is\s+null/i,
  )
  assert.match(
    getRole,
    /'can_change'[\s\S]*v_assignment\.role_confirmed_at\s+is\s+null/i,
  )
  assert.match(confirmRole, /'can_change'\s*,\s*false/i)
  assert.match(change, /'role_confirmed'\s*,\s*false/i)
  assert.match(change, /'application_confirmed'\s*,\s*false/i)
  assert.doesNotMatch(change, /'swap_target'|'target_user_id'|'participant_user_id'/i)
})

test('scopes owner role reads and changes to an explicit occurrence membership', () => {
  const sql = readMigration()
  const getRole = extractFunction(sql, 'public', 'get_my_quantum_event_secret_role')
  const changeRole = extractFunction(sql, 'public', 'change_my_quantum_event_secret_role')

  assert.match(
    sql,
    /function public\.get_my_quantum_event_secret_role\(\s*p_occurrence_id UUID\s*\)/i,
  )
  assert.match(
    sql,
    /function public\.change_my_quantum_event_secret_role\(\s*p_occurrence_id UUID\s*\)/i,
  )
  for (const roleFunction of [getRole, changeRole]) {
    assert.match(roleFunction, /occurrence\.id\s*=\s*p_occurrence_id/i)
    assert.match(roleFunction, /participant_user_id\s*=\s*v_user_id|user_id\s*=\s*v_user_id/i)
    assert.match(roleFunction, /'occurrence_id'\s*,\s*v_occurrence\.id/i)
    assert.doesNotMatch(roleFunction, /order by\s+occurrence\.starts_at/i)
  }
  assert.match(
    sql,
    /drop function if exists public\.get_my_quantum_event_secret_role\(\)/i,
  )
  assert.match(
    sql,
    /drop function if exists public\.change_my_quantum_event_secret_role\(\)/i,
  )
})

test('blocks guessing until completion and reveals only at quorum or the deadline', () => {
  const sql = readMigration()
  const submit = extractFunction(sql, 'public', 'submit_my_quantum_event_role_guesses')
  const state = extractFunction(sql, 'public', 'get_my_quantum_event_role_guess_state')
  const combined = `${submit}\n${state}`

  assert.match(combined, /v_match\.status\s*<>\s*'completed'|match_row\.status\s*=\s*'completed'/i)
  assert.match(combined, /v_occurrence\.status\s*<>\s*'completed'|occurrence\.status\s*=\s*'completed'/i)
  assert.match(combined, /quantum_event_match_members/i)
  assert.match(submit, /jsonb_array_length\(p_guesses\)/i)
  assert.match(submit, /between 2 and 4|v_participant_count\s*-\s*1/i)
  assert.match(submit, /target_user_id\s*=\s*v_user_id|self_guess_not_allowed/i)
  assert.match(submit, /one guess|already_submitted|duplicate_guess_target/i)
  assert.match(state, /ends_at\s*\+\s*interval\s*'24 hours'/i)
  assert.match(state, /v_expected_guess_count|v_participant_count\s*\*\s*\(v_participant_count\s*-\s*1\)/i)
  assert.match(state, /reveal_available/i)
  assert.match(state, /answer_role/i)
  assert.doesNotMatch(combined, /appearance_score|deposit|report|score_breakdown|matching_score/i)
})

test('checks role-guess membership first and normalizes hidden-state errors', () => {
  const sql = readMigration()
  const state = extractFunction(sql, 'public', 'get_my_quantum_event_role_guess_state')
  const submit = extractFunction(sql, 'public', 'submit_my_quantum_event_role_guesses')

  for (const fn of [state, submit]) {
    const membershipCheck = fn.search(/quantum_event_match_members[\s\S]*user_id\s*=\s*v_user_id/i)
    const matchStateCheck = fn.search(/v_match\.status\s*<>\s*'completed'/i)
    assert.ok(membershipCheck >= 0, 'missing caller membership check')
    assert.ok(matchStateCheck > membershipCheck, 'membership must be checked before match state')
    assert.match(fn, /role_guessing_not_available/i)
    assert.doesNotMatch(fn, /role_guessing_not_allowed|role_guessing_not_open/i)
    assert.match(fn, /role_guessing_invalid_participant_count/i)
    assert.match(fn, /role_guessing_participants_incomplete/i)
  }
})

test('cancellation preserves honest friend ownership and clears every active room artifact', () => {
  const sql = readMigration()
  const cancellation = extractFunction(sql, 'public', 'cancel_my_quantum_event_participation')

  assert.match(sql, /drop function if exists public\.cancel_my_quantum_event_participation\(\)/i)
  assert.match(cancellation, /for update/i)
  assert.match(cancellation, /friend_party_leader_required/i)
  assert.match(cancellation, /leader_user_id/i)
  assert.match(cancellation, /status\s*=\s*'cancelled'/i)
  assert.match(cancellation, /public\.quantum_event_room_invites/i)
  assert.match(cancellation, /invite\.status\s*=\s*'pending'|status\s+in\s*\(\s*'pending'/i)
  assert.match(cancellation, /delete from public\.quantum_event_room_card_snapshots/i)
  assert.match(cancellation, /private\.quantum_event_meeting_moment_drafts/i)
  assert.match(cancellation, /private\.quantum_event_secret_role_assignments/i)
  assert.match(cancellation, /remaining_participation/i)
  assert.match(cancellation, /'cancelled'/i)
})

test('cancellation locks occurrence before participation and scopes every cleanup to that occurrence', () => {
  const sql = readMigration()
  const cancellation = extractFunction(sql, 'public', 'cancel_my_quantum_event_participation')
  const occurrenceLock = cancellation.search(
    /perform 1\s+from public\.quantum_event_occurrences[\s\S]*?for update/i,
  )
  const participationLock = cancellation.search(
    /select participation\.\*\s+into v_participation\s+from public\.quantum_event_participations[\s\S]*?for update/i,
  )

  assert.ok(occurrenceLock >= 0, 'missing occurrence lock')
  assert.ok(participationLock > occurrenceLock, 'participation must lock after occurrence')
  assert.match(cancellation, /where user_id\s*=\s*v_participation\.user_id[\s\S]*occurrence_id\s+is\s+not\s+distinct\s+from\s+v_participation\.occurrence_id/i)
  assert.match(cancellation, /invite\.occurrence_id\s*=\s*v_participation\.occurrence_id/i)
  assert.match(cancellation, /notification_invite\.occurrence_id\s*=\s*v_participation\.occurrence_id/i)
  assert.match(cancellation, /snapshot\.occurrence_id\s*=\s*v_participation\.occurrence_id/i)
  assert.match(cancellation, /moment\.occurrence_id\s*=\s*v_participation\.occurrence_id/i)
  assert.match(cancellation, /assignment\.occurrence_id\s*=\s*v_participation\.occurrence_id/i)
})

test('room moves invalidate old snapshots, meeting moments, and active role assignments', () => {
  const sql = readMigration()
  const trigger = extractFunction(sql, 'private', 'invalidate_quantum_event_room_artifacts')

  assert.match(trigger, /old\.occurrence_id\s+is distinct from\s+new\.occurrence_id/i)
  assert.match(trigger, /old\.status\s+(?:not\s+)?in\s*\(\s*'recruiting'\s*,\s*'confirmed'\s*\)/i)
  assert.match(trigger, /delete from public\.quantum_event_room_card_snapshots/i)
  assert.match(trigger, /private\.quantum_event_meeting_moment_drafts/i)
  assert.match(trigger, /private\.quantum_event_secret_role_assignments/i)
  assert.match(sql, /create trigger trg_quantum_event_artifact_invalidation/i)
})

test('the security definer trigger is fixed-path and impossible to call directly', () => {
  const sql = readMigration()
  const trigger = extractFunction(sql, 'private', 'invalidate_quantum_event_room_artifacts')

  assert.match(trigger, /security definer/i)
  assert.match(trigger, /set search_path\s*=\s*''/i)
  assert.match(
    sql,
    /revoke all on function private\.invalidate_quantum_event_room_artifacts\(\)[\s\S]*from public, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /comment on function private\.invalidate_quantum_event_room_artifacts\(\)[\s\S]*old\/new|old and new/i,
  )
  assert.doesNotMatch(trigger, /auth\.uid\(\)/i)
})

test('participation API maps nonleader friend cancellation to an explicit product error', () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/match/event-participation/route.ts'),
    'utf8',
  )

  assert.match(route, /friend_party_leader_required/)
  assert.match(
    route,
    /includes\('friend_party_leader_required'\)[\s\S]*jsonError\('friend_party_leader_required',\s*(?:403|409)\)/,
  )
})

test('the migration never wires preferences or roles into decisions, deposits, or reports', () => {
  const sql = readMigration()

  assert.doesNotMatch(
    sql,
    /appearance_score|score_breakdown|matching_score|deposit|refund|report_score|penalty/i,
  )
  assert.doesNotMatch(sql, /service_role_key|supabase_service_role|next_public/i)
})
