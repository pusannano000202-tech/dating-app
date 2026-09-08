import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const forwardSql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260905150000_weekly_operations_and_continuation_join.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const recoverySql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260905180000_continuation_fee_recovery.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const notificationWorker = fs.readFileSync(
  path.join(process.cwd(), 'app/api/internal/match/continuation-notifications/route.ts'),
  'utf8',
).replace(/\r\n/g, '\n')

test('ending a private transition cancels unpaid work and isolates verified money for recovery', () => {
  const match = sql.match(/create or replace function public\.set_my_continuation_choice\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  assert.match(match[0], /quantum_continuation_fee_orders/i)
  assert.match(match[0], /status = 'cancelled'/i)
  assert.match(match[0], /status = 'recovery_required'/i)
  assert.match(match[0], /status in \('verifying', 'verified'\)[\s\S]*recovery_required/i)
  assert.match(match[0], /quantum_continuation_notification_outbox[\s\S]*status = 'cancelled'/i)
  assert.match(match[0], /status = 'cancelled'[\s\S]*claim_token = null[\s\S]*lease_expires_at = null/i)
})

test('in-app continuation delivery is service-only, retryable, skip-locked, and choice-free', () => {
  const match = sql.match(/create or replace function public\.deliver_continuation_notifications_for_service\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  const rpc = match[0]
  assert.match(rpc, /request\.jwt\.claim\.role/i)
  assert.match(rpc, /for update skip locked/i)
  assert.match(rpc, /insert into public\.notifications/i)
  assert.match(rpc, /next_attempt_at/i)
  assert.doesNotMatch(rpc, /continuation_choices|phone|contact/i)
})

test('paid friend entitlement delivers only its own explicit request and never contact details', () => {
  const match = sql.match(/create or replace function public\.deliver_continuation_friend_entitlements_for_service\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  const rpc = match[0]
  assert.match(rpc, /quantum_continuation_friend_entitlements/i)
  assert.match(rpc, /quantum_continuation_fee_orders/i)
  assert.match(rpc, /purpose = 'friend_request'/i)
  assert.match(rpc, /insert into public\.friend_requests/i)
  assert.match(rpc, /receiver_phone[\s\S]*null/i)
  assert.doesNotMatch(rpc, /auto(?:matic)?[_ ]?friend/i)
  assert.match(rpc, /quantum_continuation_fee_orders[\s\S]*status = 'recovery_required'[\s\S]*fee\.id = v_entitlement\.fee_order_id/i)
})

test('local confirmation reads an authenticated owner-only fee projection before service verification', () => {
  const match = sql.match(/create or replace function public\.get_my_continuation_fee_order\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  const rpc = match[0]
  assert.match(rpc, /auth\.uid\(\)/i)
  assert.match(rpc, /owner_user_id = v_actor/i)
  assert.match(rpc, /'amount_krw',[\s\S]*v_fee\.amount_krw/i)
  assert.doesNotMatch(rpc, /target_user_id|provider_transaction_id/i)
})

test('legacy scheduled-event auto friendship is retired in favor of explicit friend requests', () => {
  assert.match(sql, /drop trigger if exists trg_connect_completed_quantum_event_match[\s\S]*on public\.matches/i)
  const match = sql.match(/create or replace function public\.connect_completed_quantum_event_match\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  assert.doesNotMatch(match[0], /insert into public\.friendships/i)
  assert.match(match[0], /return 0/i)
})

test('a late private choice commits cutoff cleanup instead of rolling it back with an exception', () => {
  const match = sql.match(/create or replace function public\.set_my_continuation_choice\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  const cutoff = match[0].match(/if pg_catalog\.clock_timestamp\(\) >= v_transition\.closes_at then([\s\S]*?)end if;/i)
  assert.ok(cutoff)
  assert.match(cutoff[0], /quantum_continuation_series/i)
  assert.match(cutoff[0], /recovery_required/i)
  assert.match(cutoff[0], /return public\.get_my_continuation_transition/i)
  assert.doesNotMatch(cutoff[0], /raise exception/i)
})

test('attendance correction invalidates every downstream transition and recoverable fee before scheduling', () => {
  const match = sql.match(/create or replace function public\.resolve_continuation_occurrence_attendance_for_service\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  const rpc = match[0]
  assert.match(rpc, /transition_index > v_occurrence\.transition_index/i)
  assert.match(rpc, /status = 'review_required'/i)
  assert.match(rpc, /quantum_continuation_fee_orders[\s\S]*recovery_required/i)
  assert.match(rpc, /quantum_continuation_notification_outbox[\s\S]*status = 'cancelled'/i)
  assert.match(rpc, /status = 'cancelled'[\s\S]*claim_token = null[\s\S]*lease_expires_at = null/i)
  assert.match(rpc, /quantum_continuation_series[\s\S]*status in \('active', 'completed'\)/i)
  assert.match(rpc, /quantum_continuation_friend_entitlements[\s\S]*status = 'cancelled'/i)
  assert.match(rpc, /fee\.status in \('verifying', 'verified'\)[\s\S]*recovery_required/i)
  assert.match(rpc, /fee\.purpose = 'friend_request'[\s\S]*fee\.owner_user_id = p_participant_user_id[\s\S]*fee\.target_user_id = p_participant_user_id/i)
  assert.match(rpc, /entitlement\.requester_user_id = p_participant_user_id[\s\S]*entitlement\.target_user_id = p_participant_user_id/i)
  assert.doesNotMatch(rpc, /if found or exists/i)
})

test('authoritative source revision changes invalidate already-open continuation state', () => {
  assert.match(forwardSql, /create or replace function quantum_private\.invalidate_continuation_source/i)
  assert.match(forwardSql, /quantum_continuation_sources[\s\S]*status = 'disputed'/i)
  assert.match(forwardSql, /quantum_continuation_series[\s\S]*status = 'review_required'/i)
  assert.match(forwardSql, /quantum_continuation_transitions[\s\S]*status = 'review_required'/i)
  assert.match(forwardSql, /quantum_continuation_fee_orders[\s\S]*recovery_required/i)
  assert.match(forwardSql, /quantum_continuation_notification_outbox[\s\S]*claim_token = null[\s\S]*lease_expires_at = null/i)
  assert.match(forwardSql, /trg_invalidate_continuation_from_tonight_attendance/i)
  assert.match(forwardSql, /trg_invalidate_continuation_from_tonight_confirmation/i)
  assert.match(forwardSql, /trg_invalidate_continuation_from_weekly_attendance/i)
})

test('continuation fee recovery is append-only, leased, bounded, and service-only', () => {
  assert.match(recoverySql, /create table public\.quantum_continuation_fee_events/i)
  assert.match(recoverySql, /idempotency_key text not null unique/i)
  assert.match(recoverySql, /trg_log_continuation_fee_prepared/i)
  assert.match(recoverySql, /trg_protect_continuation_fee_events/i)
  assert.match(recoverySql, /trg_queue_continuation_fee_recovery/i)
  assert.match(recoverySql, /create table public\.quantum_continuation_fee_recovery_jobs/i)
  const claim = recoverySql.match(/create or replace function public\.service_claim_continuation_fee_recoveries\(([\s\S]*?)\n\$\$;/i)
  assert.ok(claim)
  assert.match(claim[0], /for update skip locked/i)
  assert.match(claim[0], /lease_id/i)
  assert.match(claim[0], /lease_expires_at/i)
  assert.match(claim[0], /least\(greatest\(p_limit, 1\), 25\)/i)
  assert.match(recoverySql, /grant execute on function public\.service_claim_continuation_fee_recoveries[\s\S]*to service_role/i)
  assert.match(recoverySql, /attempts >= 20[\s\S]*manual_review/i)
})

test('prepared continuation fees can expire or cancel without abandoning provider reconciliation', () => {
  assert.match(recoverySql, /create or replace function public\.cancel_my_continuation_fee/i)
  assert.match(recoverySql, /create or replace function public\.service_expire_continuation_fee_orders/i)
  assert.match(recoverySql, /quantum_continuation_fee_recovery_jobs/i)
  assert.match(recoverySql, /checkout_expires_at/i)
  assert.match(recoverySql, /status = 'cancelled'/i)
  assert.match(recoverySql, /quantum_continuation_friend_entitlements[\s\S]*status in \('ready', 'queued'\)/i)
  assert.doesNotMatch(recoverySql, /if\s+pg_catalog\.[^(]+\([^)]*\)\s+then/i)
})

test('provider confirmation remains exact and replay-safe after recovery expansion', () => {
  const confirm = recoverySql.match(/create or replace function public\.confirm_my_continuation_fee_for_service\(([\s\S]*?)\n\$\$;/i)
  assert.ok(confirm)
  assert.match(confirm[0], /p_provider_verified is not true/i)
  assert.match(confirm[0], /payment_context_mismatch/i)
  assert.match(confirm[0], /payment_event_replayed/i)
  assert.match(confirm[0], /provider_transaction_id/i)
  assert.match(confirm[0], /recovery_required/i)
  assert.match(confirm[0], /not member\.fee_waived/i)
})

test('prepare resumes the authoritative active order when a response is lost and the client rotates its key', () => {
  const prepare = recoverySql.match(/create or replace function public\.prepare_my_continuation_fee\(([\s\S]*?)\n\$\$;/i)
  assert.ok(prepare, 'the forward migration must override prepare without editing the C-owned base migration')
  const rpc = prepare[0]
  assert.match(rpc, /owner_user_id = v_actor[\s\S]*idempotency_key = p_idempotency_key/i)
  assert.match(rpc, /transition_id = p_transition_id/i)
  assert.match(rpc, /purpose = p_purpose/i)
  assert.match(rpc, /target_user_id is not distinct from p_target_user_id/i)
  assert.match(rpc, /provider = p_provider/i)
  assert.match(rpc, /status = 'prepared'/i)
  assert.match(rpc, /for update/i)
  assert.match(rpc, /v_order := v_active/i)
  assert.match(rpc, /idempotency_key_reused/i)
})

test('expired prepared orders commit recovery cleanup and make room for a fresh checkout', () => {
  const prepare = recoverySql.match(/create or replace function public\.prepare_my_continuation_fee\(([\s\S]*?)\n\$\$;/i)
  const begin = recoverySql.match(/create or replace function public\.begin_continuation_fee_verification_for_service\(([\s\S]*?)\n\$\$;/i)
  const expiry = recoverySql.match(/create or replace function public\.service_expire_continuation_fee_orders\(([\s\S]*?)\n\$\$;/i)
  assert.ok(prepare)
  assert.ok(begin)
  assert.ok(expiry)
  assert.match(recoverySql, /drop index if exists public\.quantum_continuation_one_fee_per_purpose_idx[\s\S]*where status in \('prepared', 'verifying', 'verified'\)/i)
  assert.match(prepare[0], /checkout_expires_at <= v_now/i)
  assert.match(prepare[0], /local_verified_simulator[\s\S]*cancelled[\s\S]*recovery_required/i)
  assert.match(prepare[0], /event_type[\s\S]*'expired'/i)
  assert.match(prepare[0], /status = 'prepared'[\s\S]*checkout_expires_at > v_now/i)
  assert.match(begin[0], /status in \('prepared', 'verifying'\)[\s\S]*checkout_expires_at <= v_now[\s\S]*status = 'recovery_required'/i)
  assert.match(expiry[0], /status = 'recovery_required'/i)
  assert.match(expiry[0], /event_type[\s\S]*'expired'/i)
  assert.doesNotMatch(expiry[0], /status = case when v_order\.status = 'prepared' then 'cancelled'/i)
})

test('server deadline sweep closes stale transitions and weekly windows in bounded locked batches', () => {
  const match = forwardSql.match(/create or replace function public\.service_sweep_continuation_deadlines\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  const rpc = match[0]
  assert.match(rpc, /request\.jwt\.claim\.role/i)
  assert.match(rpc, /least\(greatest\(p_limit, 1\), 100\)/i)
  assert.match(rpc, /for update skip locked[\s\S]*limit v_limit/i)
  assert.match(rpc, /quantum_continuation_transitions[\s\S]*status = 'closed'/i)
  assert.match(rpc, /quantum_continuation_fee_orders[\s\S]*recovery_required/i)
  assert.match(rpc, /quantum_continuation_notification_outbox[\s\S]*claim_token = null[\s\S]*lease_expires_at = null/i)
  assert.match(rpc, /quantum_weekly_activity_windows[\s\S]*status = 'closed'/i)
  assert.match(rpc, /quantum_weekly_applications[\s\S]*status = 'expired'/i)
  assert.match(rpc, /v_application_count := v_application_count \+ v_expired_count/i)
  assert.match(forwardSql, /revoke all on function public\.service_sweep_continuation_deadlines\(timestamptz, integer\)[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(forwardSql, /grant execute on function public\.service_sweep_continuation_deadlines\(timestamptz, integer\)[\s\S]*to service_role/i)
})

test('continuation cron uses CRON_SECRET only and sweeps deadlines before delivery', () => {
  const get = notificationWorker.match(/export async function GET\([\s\S]*?\n\}/i)
  const post = notificationWorker.match(/export async function POST\([\s\S]*?\n\}/i)
  assert.ok(get)
  assert.ok(post)
  assert.match(get[0], /process\.env\.CRON_SECRET/)
  assert.doesNotMatch(get[0], /CONTINUATION_INTERNAL_SECRET/)
  assert.match(post[0], /process\.env\.CONTINUATION_INTERNAL_SECRET/)
  assert.doesNotMatch(notificationWorker, /CONTINUATION_INTERNAL_SECRET\s*\|\|\s*process\.env\.CRON_SECRET/)
  const sweepIndex = notificationWorker.indexOf("service_sweep_continuation_deadlines")
  const deliveryIndex = notificationWorker.indexOf("deliver_continuation_notifications_for_service")
  assert.ok(sweepIndex > -1)
  assert.ok(deliveryIndex > sweepIndex)
})
