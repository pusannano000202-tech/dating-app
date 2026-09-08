import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createOwnerMbtiRepository, MbtiRepositoryError, type MbtiStore } from '../../lib/community/mbti/repository'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260905110000_community_mbti_experiences.sql'),
  'utf8',
)

const attendanceMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260905140000_mbti_authoritative_attendance.sql',
)

test('repository captures the authenticated owner and never accepts a caller-supplied owner', async () => {
  const owners: string[] = []
  const store: MbtiStore = {
    async getState(ownerUserId) {
      owners.push(ownerUserId)
      return { participant: null, experiences: [], nextCursor: null, meetingStatsConsent: null }
    },
    async upsertParticipant(ownerUserId) { owners.push(ownerUserId); throw new MbtiRepositoryError('not_implemented') },
    async createExperience(ownerUserId) { owners.push(ownerUserId); throw new MbtiRepositoryError('not_implemented') },
    async updateExperience(ownerUserId) { owners.push(ownerUserId); throw new MbtiRepositoryError('not_implemented') },
    async deleteExperience(ownerUserId) { owners.push(ownerUserId); throw new MbtiRepositoryError('not_implemented') },
    async expandExperience(ownerUserId) { owners.push(ownerUserId); throw new MbtiRepositoryError('not_implemented') },
    async withdraw(ownerUserId) { owners.push(ownerUserId); throw new MbtiRepositoryError('not_implemented') },
    async getMeetingStatsConsent(ownerUserId) { owners.push(ownerUserId); return null },
    async putMeetingStatsConsent(ownerUserId) { owners.push(ownerUserId); throw new MbtiRepositoryError('not_implemented') },
    async withdrawMeetingStatsConsent(ownerUserId) { owners.push(ownerUserId); throw new MbtiRepositoryError('not_implemented') },
  }

  const repository = createOwnerMbtiRepository('owner-a', store)
  await repository.getState()
  await repository.getMeetingStatsConsent()
  assert.deepEqual(owners, ['owner-a', 'owner-a'])
  assert.equal('ownerUserId' in repository, false)
})

test('raw tables deny direct browser roles and owner RLS uses auth.uid', () => {
  for (const table of [
    'community_mbti_participants',
    'community_mbti_experiences',
    'community_mbti_meeting_stats_consents',
  ]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
    assert.match(migration, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, 'i'))
  }
  assert.match(migration, /\(select auth\.uid\(\)\) = owner_user_id/i)
})

test('owner RPCs derive auth uid, reject target owner arguments and are not service-role RPCs', () => {
  assert.match(migration, /v_owner_user_id UUID := \(select auth\.uid\(\)\)/i)
  assert.doesNotMatch(migration, /p_owner_user_id UUID/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.community_mbti_get_my_state\(INTEGER, UUID\) TO authenticated/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.community_mbti_get_my_state\(INTEGER, UUID\) FROM PUBLIC, anon, service_role/i)
})

test('community mutations that add or change statistical data require completed minimum signup', () => {
  for (const name of [
    'community_mbti_upsert_participant',
    'community_mbti_create_experience',
    'community_mbti_update_experience',
    'community_mbti_expand_experience',
    'community_mbti_put_meeting_stats_consent',
  ]) {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
    const end = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
    const fn = migration.slice(start, end === -1 ? undefined : end)
    assert.match(fn, /community_mbti_require_minimum_signup\(v_owner_user_id\)/i, name)
  }
  assert.match(migration, /resolve_profile_readiness\(p_member_user_id\)[\s\S]*minimum_signup_complete/i)
})

test('mutation RPCs implement idempotency receipts and revision compare-and-swap', () => {
  assert.match(migration, /PRIMARY KEY \(owner_user_id, client_mutation_id\)/i)
  assert.match(migration, /request_hash/i)
  assert.match(migration, /idempotency_conflict/i)
  assert.match(migration, /stale_revision/i)
  assert.match(migration, /FOR UPDATE/i)
})

test('all owner mutation RPCs serialize concurrent retries before reading receipts', () => {
  assert.equal((migration.match(/pg_advisory_xact_lock/g) ?? []).length, 16)
  const mutations = [
    'community_mbti_upsert_participant',
    'community_mbti_create_experience',
    'community_mbti_update_experience',
    'community_mbti_delete_experience',
    'community_mbti_expand_experience',
    'community_mbti_withdraw',
    'community_mbti_put_meeting_stats_consent',
    'community_mbti_withdraw_meeting_stats_consent',
  ]
  for (const name of mutations) {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
    const end = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
    const fn = migration.slice(start, end === -1 ? undefined : end)
    assert.match(fn, /community-mbti-owner:/, name)
    assert.ok(fn.indexOf('pg_advisory_xact_lock') < fn.indexOf('community_mbti_existing_receipt'), name)
  }
})

test('atomic expansion deletes the count row and inserts one detailed row per count', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.community_mbti_expand_experience')
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
  const fn = migration.slice(start, end === -1 ? undefined : end)
  assert.match(fn, /entry_mode <> 'count_only'/i)
  assert.match(fn, /v_batch_count := LEAST\(v_experience\.reported_count, 100\)/i)
  assert.match(fn, /reported_count = reported_count - v_batch_count[\s\S]*revision = revision \+ 1/i)
  assert.match(fn, /IF v_experience\.reported_count = v_batch_count THEN[\s\S]*DELETE FROM public\.community_mbti_experiences/i)
  assert.match(fn, /generate_series\(1, v_batch_count\)/i)
  assert.match(fn, /'detailed'/i)
  assert.doesNotMatch(fn, /expansion_batch_too_large/i)
})

test('owner pagination returns the last visible id only when another row exists', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.community_mbti_get_my_state')
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
  const fn = migration.slice(start, end)
  assert.match(fn, /OFFSET p_limit - 1 LIMIT 1/i)
  assert.match(fn, /NOT EXISTS[\s\S]*?experience_id > v_next_cursor/i)
  assert.match(fn, /p_limit IS NULL OR p_limit < 1 OR p_limit > 50/i)
})

test('direct experience RPC rejects duplicate detail dimensions', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.community_mbti_create_experience')
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
  const fn = migration.slice(start, end)
  assert.match(fn, /cardinality\(p_matched_aspects\)[\s\S]*count\(DISTINCT aspect\)[\s\S]*unnest\(p_matched_aspects\)/i)
})

test('each count-only request creates a separately bounded row instead of growing one lifetime bundle', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.community_mbti_create_experience')
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
  const fn = migration.slice(start, end)
  assert.match(migration, /reported_count INTEGER NOT NULL CHECK \(reported_count BETWEEN 1 AND 100\)/i)
  assert.match(fn, /p_reported_count < 1 OR p_reported_count > 100/i)
  assert.doesNotMatch(fn, /reported_count = reported_count \+ p_reported_count/i)
  assert.doesNotMatch(migration, /CREATE UNIQUE INDEX community_mbti_count_bundle_unique/i)
})

test('self snapshot changes require an explicit flag inside the owner RPC', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.community_mbti_update_experience')
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
  const fn = migration.slice(start, end)
  assert.match(fn, /confirm_self_snapshot_change/i)
  assert.match(fn, /self_mbti_snapshot_change_requires_confirmation/i)
  assert.match(fn, /self_mbti_snapshot = v_self_mbti_snapshot/i)
})

test('authoritative attendance adapter is service-only and returns only minimal identifiers', () => {
  const source = readFileSync(attendanceMigrationPath, 'utf8')
  assert.match(source, /service_list_authoritative_mbti_attendance/i)
  assert.match(source, /current_setting\('request\.jwt\.claim\.role', TRUE\) IS DISTINCT FROM 'service_role'/i)
  assert.match(source, /quantum_weekly_attendance_resolutions/i)
  assert.match(source, /quantum_continuation_occurrence_members/i)
  assert.match(source, /tonight_partner_service_confirmations/i)
  assert.match(source, /'tonight_team'::TEXT/i)
  assert.doesNotMatch(source, /'tonight'::TEXT/i)
  assert.match(source, /attendance_resolution_id IS NOT NULL/i)
  const weeklyStart = source.indexOf("'weekly'::TEXT")
  const weeklyEnd = source.indexOf('  )\n  SELECT', weeklyStart)
  assert.match(source.slice(weeklyStart, weeklyEnd), /occurrence\.starts_at <= pg_catalog\.statement_timestamp\(\)/i)
  assert.match(source, /confirmed_attendee_count[\s\S]*observed_arrived_count/i)
  assert.match(source, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/i)
  assert.match(source, /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/i)
  const returnedColumns = source.slice(source.indexOf('RETURNS TABLE'), source.indexOf('LANGUAGE plpgsql'))
  assert.doesNotMatch(returnedColumns, /phone|email|alias|display_name|profile/i)
})

test('individual deletion and retention expiry leave payload-free 30-day tombstones', () => {
  assert.match(migration, /deletion_scope IN \('survey','experience','meeting_stats'\)/i)
  assert.match(migration, /target_experience_id UUID/i)
  const deleteStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.community_mbti_delete_experience')
  const deleteEnd = migration.indexOf('CREATE OR REPLACE FUNCTION', deleteStart + 1)
  assert.match(migration.slice(deleteStart, deleteEnd), /community_mbti_deletion_tombstones[\s\S]*'experience'/i)
  const purgeStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.service_purge_expired_community_mbti')
  const purgeEnd = migration.indexOf('REVOKE ALL ON FUNCTION', purgeStart)
  const purge = migration.slice(purgeStart, purgeEnd)
  assert.match(purge, /community_mbti_deletion_tombstones[\s\S]*'survey'/i)
  assert.match(purge, /community_mbti_deletion_tombstones[\s\S]*'meeting_stats'/i)
  assert.match(purge, /community_mbti_deletion_tombstones[\s\S]*'experience'/i)
  assert.match(migration, /expires_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp\(\) \+ INTERVAL '30 days'/i)
})

test('durable idempotency envelopes contain no private relationship payload and survive raw deletion', () => {
  const keyTableStart = migration.indexOf('CREATE TABLE quantum_private.community_mbti_idempotency_keys')
  const keyTableEnd = migration.indexOf(');', keyTableStart)
  const keyTable = migration.slice(keyTableStart, keyTableEnd)
  assert.match(keyTable, /request_hash TEXT NOT NULL/i)
  assert.match(keyTable, /result_envelope JSONB NOT NULL/i)
  assert.doesNotMatch(keyTable, /expires_at|self_mbti|partner_mbti|partner_gender|relationship_status|score|matched_aspects/i)

  const saveStart = migration.indexOf('CREATE OR REPLACE FUNCTION quantum_private.community_mbti_save_receipt')
  const saveEnd = migration.indexOf('CREATE OR REPLACE FUNCTION', saveStart + 1)
  const save = migration.slice(saveStart, saveEnd)
  assert.match(save, /jsonb_object_keys\(p_result_envelope\)/i)
  assert.match(save, /'status','resource_id','resource_ids','revision'/i)
  assert.doesNotMatch(save, /self_mbti|partner_mbti|partner_gender|relationship_status|score|matched_aspects/i)

  const purgeStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.service_purge_expired_community_mbti')
  const purgeEnd = migration.indexOf('REVOKE ALL ON FUNCTION', purgeStart)
  const purge = migration.slice(purgeStart, purgeEnd)
  assert.doesNotMatch(purge, /DELETE FROM quantum_private\.community_mbti_idempotency_keys/i)
})

test('service purge fails closed unless the request carries the service-role claim', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.service_purge_expired_community_mbti')
  const end = migration.indexOf('REVOKE ALL ON FUNCTION', start)
  const fn = migration.slice(start, end)
  assert.match(fn, /current_setting\('request\.jwt\.claim\.role', TRUE\) IS DISTINCT FROM 'service_role'/i)
  assert.doesNotMatch(fn, /current_user NOT IN|session_user NOT IN/i)
  assert.match(fn, /'aggregation_boundary', clock_timestamp\(\)/i)
})

test('durable idempotency keys compare both kind and request hash for every replay', () => {
  assert.match(migration, /CREATE TABLE quantum_private\.community_mbti_idempotency_keys/i)
  assert.match(migration, /PRIMARY KEY \(owner_user_id, client_mutation_id\)/i)
  const receiptStart = migration.indexOf('CREATE OR REPLACE FUNCTION quantum_private.community_mbti_existing_receipt')
  const receiptEnd = migration.indexOf('CREATE OR REPLACE FUNCTION', receiptStart + 1)
  const receipt = migration.slice(receiptStart, receiptEnd)
  assert.match(receipt, /community_mbti_idempotency_keys/i)
  assert.match(receipt, /mutation_kind <> p_mutation_kind OR v_key\.request_hash <> p_request_hash/i)
  assert.match(receipt, /RETURN v_key\.result_envelope/i)
  assert.doesNotMatch(receipt, /IF v_key_kind = 'experience_delete'|idempotency_result_unavailable/i)
})

test('public snapshot reads are atomic and fail closed after deletion or source expiry', () => {
  assert.match(migration, /service_get_fresh_community_mbti_snapshot/i)
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.service_get_fresh_community_mbti_snapshot')
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
  const fn = migration.slice(start, end === -1 ? undefined : end)
  assert.match(fn, /community_mbti_deletion_tombstones[\s\S]*deleted_before >= snapshot\.generated_at/i)
  assert.match(fn, /community_mbti_participants[\s\S]*90 days/i)
  assert.match(fn, /community_mbti_experiences[\s\S]*expires_at <= p_now/i)
  assert.match(fn, /community_mbti_meeting_stats_consents[\s\S]*90 days/i)
  assert.match(fn, /community_mbti_source_epoch[\s\S]*FOR SHARE/i)
  assert.match(fn, /snapshot\.source_epoch = v_current_epoch/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.service_get_fresh_community_mbti_snapshot\(TIMESTAMPTZ\) TO service_role/i)
})

test('snapshot publication compares a pre-read source epoch under a row lock', () => {
  assert.match(migration, /source_epoch BIGINT NOT NULL/i)
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.service_publish_community_mbti_snapshot')
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
  const fn = migration.slice(start, end)
  assert.match(fn, /community_mbti_source_epoch[\s\S]*FOR UPDATE/i)
  assert.match(fn, /v_current_epoch <> p_expected_source_epoch[\s\S]*source_epoch_changed/i)
  assert.match(fn, /INSERT INTO public\.community_mbti_public_snapshots/i)
})

test('source epoch triggers cover raw responses, eligibility inputs and every attendance adapter source', () => {
  const attendance = readFileSync(attendanceMigrationPath, 'utf8')
  assert.doesNotMatch(`${migration}\n${attendance}`, /AFTER INSERT OR UPDATE OR DELETE/i)
  for (const table of [
    'community_mbti_participants',
    'community_mbti_experiences',
    'community_mbti_meeting_stats_consents',
    'community_member_profiles',
    'users',
  ]) {
    assert.match(migration, new RegExp(`ON (?:public|quantum_private|auth)\\.${table}`, 'i'), table)
  }
  for (const table of [
    'quantum_continuation_occurrences',
    'quantum_continuation_occurrence_members',
    'tonight_teams',
    'tonight_team_members',
    'tonight_attendance',
    'tonight_partner_service_confirmations',
    'quantum_weekly_attendance_resolutions',
    'quantum_event_occurrences',
  ]) {
    assert.match(attendance, new RegExp(`ON public\\.${table}`, 'i'), table)
  }
  const authTrigger = migration.slice(
    migration.indexOf('CREATE TRIGGER community_mbti_eligibility_auth_source_epoch'),
    migration.indexOf('CREATE OR REPLACE FUNCTION quantum_private.community_mbti_existing_receipt'),
  )
  assert.match(authTrigger, /AFTER UPDATE OF phone, phone_confirmed_at ON auth\.users/i)
  assert.doesNotMatch(authTrigger, /AFTER INSERT OR UPDATE OR DELETE ON auth\.users/i)
})

test('all mutation RPCs return only the shared privacy-safe result envelope', () => {
  const mutations = [
    'community_mbti_upsert_participant',
    'community_mbti_create_experience',
    'community_mbti_update_experience',
    'community_mbti_delete_experience',
    'community_mbti_expand_experience',
    'community_mbti_withdraw',
    'community_mbti_put_meeting_stats_consent',
    'community_mbti_withdraw_meeting_stats_consent',
  ]
  for (const name of mutations) {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
    const end = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
    const fn = migration.slice(start, end === -1 ? undefined : end)
    assert.match(fn, /jsonb_build_object\([\s\S]*'status'/i, name)
    assert.doesNotMatch(fn, /v_receipt := to_jsonb\(v_saved\)/i, name)
  }
})
