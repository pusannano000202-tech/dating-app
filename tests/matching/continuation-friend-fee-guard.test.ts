import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationDir = path.join(process.cwd(), 'supabase/migrations')
const migrationNames = fs.readdirSync(migrationDir)
  .filter((name) => /^\d{14}_continuation_friend_fee_pair_guard\.sql$/.test(name))
const migrationName = migrationNames.at(-1) ?? ''
const sql = migrationName
  ? fs.readFileSync(path.join(migrationDir, migrationName), 'utf8').replace(/\r\n/g, '\n')
  : ''
const recoverySql = fs.readFileSync(
  path.join(migrationDir, '20260905180000_continuation_fee_recovery.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const postFlow = fs.readFileSync(
  path.join(process.cwd(), 'components/matching/FiveMeetingPostFlow.tsx'),
  'utf8',
).replace(/\r\n/g, '\n')
const checkout = fs.readFileSync(
  path.join(process.cwd(), 'components/matching/ContinuationFeeCheckout.tsx'),
  'utf8',
).replace(/\r\n/g, '\n')
const friendAcceptRoute = fs.readFileSync(
  path.join(process.cwd(), 'app/api/friend-requests/[id]/accept/route.ts'),
  'utf8',
).replace(/\r\n/g, '\n')
const friendDeclineRoute = fs.readFileSync(
  path.join(process.cwd(), 'app/api/friend-requests/[id]/decline/route.ts'),
  'utf8',
).replace(/\r\n/g, '\n')
const friendCancelRoute = fs.readFileSync(
  path.join(process.cwd(), 'app/api/friend-requests/[id]/cancel/route.ts'),
  'utf8',
).replace(/\r\n/g, '\n')
const friendRequestsRoute = fs.readFileSync(
  path.join(process.cwd(), 'app/api/friend-requests/route.ts'),
  'utf8',
).replace(/\r\n/g, '\n')
const friendConnectionRoute = fs.readFileSync(
  path.join(process.cwd(), 'app/api/friends/[id]/connection/route.ts'),
  'utf8',
).replace(/\r\n/g, '\n')
const friendsPage = fs.readFileSync(
  path.join(process.cwd(), 'app/friends/page.tsx'),
  'utf8',
).replace(/\r\n/g, '\n')

function rpc(name: string) {
  const match = sql.match(new RegExp(
    `create(?: or replace)? function public\\.${name}\\(([\\s\\S]*?)\\n\\$\\$;`,
    'i',
  ))
  assert.ok(match, `${name} must be overridden in the forward migration`)
  return match[0]
}

test('friend fee guard is one additive migration after the applied continuation migrations', () => {
  assert.equal(migrationNames.length, 1)
  assert.match(migrationName, /^20260906\d{6}_continuation_friend_fee_pair_guard\.sql$/)
  assert.ok(migrationName.slice(0, 14) > '20260906130854')
  assert.match(sql, /begin;[\s\S]*commit;/i)
  assert.doesNotMatch(sql, /begin_continuation_fee_verification_for_service_impl_20260905180000/i)
  assert.doesNotMatch(sql, /deliver_continuation_friend_entitlements_for_service_impl_20260905120000/i)
})

test('all friendship and UUID friend-request mutations join the unordered-pair lock without waiting in row triggers', () => {
  assert.match(sql, /create or replace function quantum_private\.friend_pair_lock_key\(p_left uuid, p_right uuid\)/i)
  assert.match(sql, /pg_catalog\.hashtextextended\([\s\S]*least\([\s\S]*greatest\(/i)
  assert.match(sql, /pg_catalog\.pg_try_advisory_xact_lock/i)
  assert.match(sql, /raise exception 'friend_pair_retryable'/i)
  assert.match(sql, /create trigger trg_lock_friend_request_pair_mutation[\s\S]*before insert or update or delete on public\.friend_requests/i)
  assert.match(sql, /create trigger trg_lock_friendship_pair_mutation[\s\S]*before insert or update or delete on public\.friendships/i)
  assert.match(sql, /revoke all on function quantum_private\.friend_pair_lock_key\(uuid, uuid\)[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(sql, /revoke all on function quantum_private\.try_lock_friend_pair_mutation\(\)[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(sql, /revoke all on function quantum_private\.expire_stale_friend_pair_requests\(uuid, uuid\)[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(sql, /v_old_sub text := pg_catalog\.current_setting\('request\.jwt\.claim\.sub', true\)/i)
  assert.match(sql, /v_old_claims text := pg_catalog\.current_setting\('request\.jwt\.claims', true\)/i)
  assert.match(sql, /exception when others then[\s\S]*set_config\('request\.jwt\.claim\.sub', coalesce\(v_old_sub, ''\), true\)[\s\S]*set_config\('request\.jwt\.claims', coalesce\(v_old_claims, ''\), true\)[\s\S]*raise;/i)
})

test('prepare keeps exact and active-order replay but blocks a new friend fee under the pair lock', () => {
  const prepare = rpc('prepare_my_continuation_fee')
  assert.match(prepare, /owner_user_id = v_actor[\s\S]*idempotency_key = p_idempotency_key/i)
  assert.match(prepare, /prepare_my_continuation_fee_impl_20260905180000/i)
  assert.match(prepare, /select fee\.\* into v_active/i)
  assert.match(prepare, /continuation_friend_pair_is_blocked/i)
  assert.match(prepare, /expire_stale_friend_pair_requests/i)
  assert.match(prepare, /quantum_continuation_friend_entitlements[\s\S]*transition_id = p_transition_id/i)
  assert.match(prepare, /fee\.status = 'verified'[\s\S]*delivered\.fee_order_id = fee\.id[\s\S]*delivered\.status = 'delivered'/i)
  assert.match(prepare, /raise exception 'friend_request_not_allowed'/i)

  const pairLock = prepare.indexOf('pg_advisory_xact_lock')
  const exactReplay = prepare.indexOf('if v_existing.id is not null')
  const pairBlocked = prepare.indexOf('continuation_friend_pair_is_blocked')
  assert.ok(pairLock > -1)
  assert.doesNotMatch(prepare.slice(0, pairLock), /for update/i, 'pair lock must precede transition/order row locks')
  assert.ok(exactReplay > -1 && pairBlocked > exactReplay, 'exact idempotency replay must remain authoritative')
})

test('after projection omits active friends, pending requests, unresolved entitlements, and non-resumable fee orders', () => {
  const projection = rpc('get_my_continuation_after')
  assert.match(projection, /continuation_friend_pair_is_blocked/i)
  assert.match(projection, /quantum_continuation_friend_entitlements[\s\S]*transition_id = \(v_payload->>'transition_id'\)::uuid/i)
  assert.match(sql, /public\.friendships[\s\S]*status in \('active', 'blocked'\)/i)
  assert.match(sql, /public\.friend_requests[\s\S]*status = 'pending'[\s\S]*expires_at > pg_catalog\.statement_timestamp\(\)/i)
  assert.match(sql, /least\(request\.sender_user_id, request\.receiver_user_id\)[\s\S]*greatest\(request\.sender_user_id, request\.receiver_user_id\)/i)
  assert.match(sql, /public\.quantum_continuation_friend_entitlements[\s\S]*status in \('ready', 'queued'\)/i)
  assert.match(projection, /fee\.status in \('verifying', 'recovery_required'\)/i)
  assert.match(projection, /fee\.status = 'prepared'[\s\S]*fee\.owner_user_id = v_actor[\s\S]*fee\.transition_id = \(v_payload->>'transition_id'\)::uuid/i)
  assert.match(projection, /fee\.status = 'verified'[\s\S]*delivered\.status = 'delivered'/i)
  assert.doesNotMatch(sql, /entitlement\.status in \('ready', 'queued', 'delivered'\)/i)
  assert.doesNotMatch(projection, /gender|school/i)
})

test('verification checks pair eligibility before provider work and preserves charged evidence in recovery', () => {
  const begin = rpc('begin_continuation_fee_verification_for_service')
  const confirm = rpc('confirm_my_continuation_fee_for_service')

  assert.match(begin, /quantum_private\.is_service_role\(\)/i)
  assert.match(begin, /p_provider is null[\s\S]*invalid_fee_verification/i)
  assert.match(begin, /pg_advisory_xact_lock/i)
  assert.match(begin, /continuation_friend_pair_is_blocked/i)
  assert.match(begin, /status = 'cancelled'/i)
  assert.match(begin, /set_config\('request\.jwt\.claim\.role', 'service_role', true\)/i)
  assert.ok(begin.indexOf('pg_advisory_xact_lock') < begin.indexOf('for update'))
  assert.ok(begin.indexOf('for update') < begin.indexOf('payment_context_mismatch'))

  assert.match(confirm, /quantum_private\.is_service_role\(\)/i)
  assert.match(confirm, /p_purpose is null[\s\S]*p_provider is null[\s\S]*char_length\(p_provider_event_id\) not between 1 and 180[\s\S]*char_length\(p_provider_transaction_id\) not between 1 and 180[\s\S]*p_currency is null[\s\S]*provider_verification_failed/i)
  assert.match(confirm, /pg_advisory_xact_lock/i)
  assert.match(confirm, /continuation_friend_pair_is_blocked/i)
  assert.match(confirm, /confirm_my_continuation_fee_for_service_impl_20260905180000/i)
  assert.match(confirm, /p_provider_event_id, p_provider_transaction_id, p_amount_krw/i)
  assert.match(confirm, /set_config\('request\.jwt\.claim\.role', 'service_role', true\)/i)
  assert.match(confirm, /status = 'recovery_required'/i)
  assert.match(confirm, /p_provider = 'local_verified_simulator'[\s\S]*status = 'cancelled'[\s\S]*provider_verified = false/i)
  assert.match(confirm, /'recovery_required', false, 'no_charge', true/i)
  assert.ok(
    confirm.indexOf("v_order.status = 'cancelled'") < confirm.indexOf('v_pair_blocked :='),
    'local no-charge replay must not depend on the pair still being blocked',
  )
  assert.match(confirm, /provider_event_id = p_provider_event_id/i)
  assert.match(confirm, /provider_transaction_id = p_provider_transaction_id/i)
  assert.match(recoverySql, /trg_queue_continuation_fee_recovery[\s\S]*quantum_continuation_fee_recovery_jobs/i)
  assert.ok(confirm.indexOf('pg_advisory_xact_lock') < confirm.indexOf('for update'))
  assert.ok(confirm.indexOf('for update') < confirm.indexOf('payment_context_mismatch'))
})

test('entitlement delivery retries lock contention and never reuses a pending friend request after payment', () => {
  const deliver = rpc('deliver_continuation_friend_entitlements_for_service')
  assert.match(deliver, /quantum_private\.is_service_role\(\)/i)
  assert.match(deliver, /pg_try_advisory_xact_lock/i)
  assert.match(deliver, /expire_stale_friend_pair_requests/i)
  assert.match(deliver, /v_retryable := v_retryable \+ 1/i)
  assert.match(sql, /public\.friend_requests[\s\S]*status = 'pending'[\s\S]*expires_at > pg_catalog\.statement_timestamp\(\)/i)
  assert.match(deliver, /quantum_continuation_fee_orders[\s\S]*else 'recovery_required'/i)
  assert.match(deliver, /fee\.provider = 'local_verified_simulator'[\s\S]*then 'cancelled'/i)
  assert.match(deliver, /'no_charge:friend_pair_blocked:' \|\| fee\.id::text/i)
  assert.match(deliver, /where entitlement\.id = v_candidate\.id/i)
  assert.match(deliver, /insert into public\.friend_requests/i)
  assert.doesNotMatch(deliver, /select request\.id into v_request_id/i)
  assert.doesNotMatch(deliver, /deliver_cont_friend_impl_20260905120000\(1\)/i)
  assert.match(deliver, /'retryable_count', v_retryable/i)
})

test('post-flow explains filtered targets and checkout handles a stale-page prepare block without claiming payment', () => {
  assert.match(postFlow, /이미 친구이거나 요청이 진행 중인 상대는 결제 대상에서 제외/i)
  assert.match(checkout, /payload\?\.error === 'not_ready'/i)
  assert.match(checkout, /친구 요청 이용권을 새로 만들 수 없어요/i)
  assert.match(checkout, /confirmedPayload\?\.result\?\.recovery_required === true/i)
  assert.match(checkout, /confirmedPayload\?\.result\?\.status === 'cancelled'/i)
  assert.match(checkout, /confirmedPayload\?\.result\?\.no_charge === true/i)
  assert.match(checkout, /실제 청구는 발생하지 않았습니다/i)
  assert.match(checkout, /await onComplete\?\.\(\)/i)
})

test('friend mutation callers expose pair-lock contention as retryable HTTP 409 and a clear retry action', () => {
  for (const route of [friendAcceptRoute, friendDeclineRoute, friendCancelRoute]) {
    assert.match(route, /error\.code === '40001'/i)
    assert.match(route, /friend_pair_retryable/i)
    assert.match(route, /status: retryable \? 409 : 400/i)
  }
  assert.match(friendRequestsRoute, /friend_pair_retryable/i)
  assert.match(friendRequestsRoute, /status: 409/i)
  assert.match(friendConnectionRoute, /friend_pair_retryable/i)
  assert.match(friendsPage, /case 'friend_pair_retryable'/i)
  assert.match(friendsPage, /상태를 변경 중이에요\. 잠시 후 다시 눌러주세요\./i)
  assert.match(friendsPage, /await response\.json\(\)\.catch/i)
})
