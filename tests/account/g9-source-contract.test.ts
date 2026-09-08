import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const read = (path: string) => readFileSync(resolve(path), 'utf8')

test('account deletion flow requires recent auth, exact confirmation, trusted origin, and a private ledger', () => {
  for (const path of [
    'app/account/page.tsx',
    'app/account/delete/page.tsx',
    'components/account/AccountDeletionForm.tsx',
    'app/api/account/deletion/route.ts',
    'docs/implementation/community-voice/g9-schema.sql',
  ]) assert.ok(existsSync(resolve(path)), `${path} must exist`)
  const route = read('app/api/account/deletion/route.ts')
  assert.match(route, /assertTrustedMutationOrigin/)
  assert.match(route, /isRecentAccountAuthentication/)
  assert.match(route, /request_account_deletion_for_service/)
  assert.match(route, /export const maxDuration = 60/)
  assert.match(route, /resolveVoiceCleanupStatus/)
  assert.match(`${route}\n${read('lib/account/http.ts')}`, /private, no-store/)
  assert.doesNotMatch(route, /deleteUser/)
  const sql = read('docs/implementation/community-voice/g9-schema.sql')
  assert.match(sql, /quantum_private\.account_deletion_requests/i)
  assert.match(sql, /account_deletion_blocks_access\(p_user_id uuid\)/i)
  assert.match(sql, /account_current_request_role\(\)/i)
  assert.match(sql, /request\.jwt\.claims/i)
  assert.match(sql, /request\.jwt\.claim\.role/i)
  assert.match(sql, /private\.current_request_role\(\)/i)
  assert.match(sql, /create or replace function public\.get_access_context\(\)/i)
  assert.match(sql, /account_deletion_pending/i)
  assert.match(sql, /prevent_deleting_account_actor_write/i)
  assert.match(sql, /pg_catalog\.pg_class/i)
  assert.match(sql, /before insert or update or delete[\s\S]*for each statement/i)
  assert.match(sql, /as restrictive for select to authenticated/i)
  assert.match(sql, /class\.relrowsecurity/i)
  assert.match(sql, /account_allows_current_access/i)
  assert.match(sql, /enforce_active_account_data_api_request/i)
  assert.match(sql, /alter role authenticator set pgrst\.db_pre_request/i)
  assert.match(sql, /pg_catalog\.pg_db_role_setting/i)
  assert.match(sql, /pgrst_db_pre_request_conflict/i)
  assert.match(sql, /notify pgrst,'reload config'/i)
  assert.match(sql, /account_deletion_active_storage/i)
  assert.match(sql, /as restrictive for all to authenticated/i)
  assert.match(sql, /storage_objects_rls_required/i)
  assert.match(sql, /signed URLs are bearer capabilities/i)
  assert.match(sql, /voice_end_session/i)
  assert.match(sql, /voice_revoke_member/i)
})

test('retention endpoint is secret guarded, dry-run by default, and provider deletion is gated', () => {
  const route = read('app/api/internal/retention/process/route.ts')
  assert.match(route, /isAuthorizedInternalRequest/)
  assert.match(route, /ACCOUNT_DELETION_WORKER_ENABLED/)
  assert.match(route, /dryRun/)
  assert.match(route, /confirmAuthDeletionReady/)
  assert.match(route, /deleteUser/)
  assert.match(route, /claim_retention_cleanup_jobs_for_service/)
  assert.match(route, /export async function GET/)
  assert.match(route, /scheduledRetentionInput\(process\.env\.ACCOUNT_DELETION_WORKER_ENABLED\)/)
})

test('public terms and privacy pages fail honestly when operator details are missing', () => {
  const privacy = read('app/privacy/page.tsx')
  const terms = read('app/terms/page.tsx')
  assert.match(privacy, /readLegalDisclosure/)
  assert.match(terms, /readLegalDisclosure/)
  assert.match(`${privacy}\n${terms}`, /법률 준수 완료를 의미하지 않습니다/)
})

test('expired albums have a leased physical-delete retry queue and legal holds fail closed', () => {
  const sql = read('docs/implementation/community-voice/g9-schema.sql')
  assert.match(sql, /retention_cleanup_jobs/i)
  assert.match(sql, /for update skip locked/i)
  assert.match(sql, /meeting_photo_evidence/i)
  assert.match(sql, /quantum_continuation_album_photos/i)
  assert.match(sql, /dispute_hold\s*=\s*false/i)
  assert.match(sql, /legal_retention_ready/i)
  assert.match(sql, /storage_cleanup_ready/i)
  assert.match(sql, /app\.account_retention_cleanup_job_id/i)
  assert.match(sql, /job\.status='processing'/i)
  assert.match(sql, /job\.source_kind='continuation_album'/i)
  assert.match(sql, /community_profile_deny_deleting_account_write/i)
  assert.match(sql, /app\.account_deletion_profile_scrub_user_id/i)
})

test('profile reset copy describes the operation it actually performs', () => {
  const profile = read('app/profile/edit/page.tsx')
  assert.match(profile, /프로필 사진 초기화/)
  assert.match(profile, /사진만 삭제되며 기본정보·친구·모임·결제 기록은 유지돼요/)
  assert.doesNotMatch(profile, /저장된 기본정보와 사진이 삭제/)
  assert.match(profile, /href="\/account"/)
})
