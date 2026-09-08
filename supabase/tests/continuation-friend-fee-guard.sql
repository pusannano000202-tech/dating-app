\set ON_ERROR_STOP on

-- Local-only transactional regression for continuation friend-request fees.
-- Prerequisite: the explicitly seeded local c660 release-preservation browser fixtures.
-- Every mutation below is synthetic and is removed by the final ROLLBACK.
begin;
set local client_min_messages to warning;

create temp table continuation_friend_fee_assertions (
  label text primary key
) on commit drop;
create temp table continuation_friend_fee_state (
  key text primary key,
  value jsonb not null
) on commit drop;
grant select, insert on table continuation_friend_fee_assertions to authenticated, service_role;
grant select, insert, update on table continuation_friend_fee_state to authenticated, service_role;

create function pg_temp.friend_fee_assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception using errcode = 'XX000', message = 'assertion_failed:' || p_label;
  end if;
  insert into pg_temp.continuation_friend_fee_assertions(label) values (p_label);
end
$$;

create function pg_temp.friend_fee_raises(p_sql text, p_message text, p_label text)
returns void
language plpgsql
as $$
declare
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message is distinct from p_message then
      raise exception using
        errcode = 'XX000',
        message = 'assertion_failed:' || p_label || ':expected=' || p_message
          || ':actual=' || coalesce(v_message, '<null>');
    end if;
    insert into pg_temp.continuation_friend_fee_assertions(label) values (p_label);
    return;
  end;
  raise exception using errcode = 'XX000', message = 'assertion_failed:' || p_label || ':expected_error_not_raised';
end
$$;

-- Exact persisted local-QA fixture guard. No existing profile or meetup row is
-- modified by this test.
select pg_temp.friend_fee_assert(
  exists (
    select 1
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = 'c6600000-0000-4000-8000-000000000141'
      and occurrence.series_id = 'c6600000-0000-4000-8000-000000000120'
      and occurrence.transition_id = 'c6600000-0000-4000-8000-000000000131'
      and occurrence.status = 'completed'
  ) and (
    select count(*)
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = 'c6600000-0000-4000-8000-000000000141'
      and member.attendance_status = 'present'
  ) = 5,
  'fixture.completed_c660_roster_is_exact'
);
select pg_temp.friend_fee_assert(
  not exists (
    select 1
    from public.friendships as friendship
    where friendship.user_id in (
      'c6600000-0000-4000-8000-000000000001',
      'c6600000-0000-4000-8000-000000000002',
      'c6600000-0000-4000-8000-000000000003',
      'c6600000-0000-4000-8000-000000000004'
    )
      and friendship.friend_user_id in (
        'c6600000-0000-4000-8000-000000000001',
        'c6600000-0000-4000-8000-000000000002',
        'c6600000-0000-4000-8000-000000000003',
        'c6600000-0000-4000-8000-000000000004'
      )
  ) and not exists (
    select 1
    from public.friend_requests as request
    where request.token like 'd770-friend-fee-%'
  ) and not exists (
    select 1
    from public.quantum_continuation_fee_orders as fee
    where fee.idempotency_key::text like 'd7700000-0000-4000-8000-%'
  ),
  'fixture.synthetic_ids_are_unused'
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000001', true);

do $test$
declare
  v_actor constant uuid := 'c6600000-0000-4000-8000-000000000001';
  v_target_b constant uuid := 'c6600000-0000-4000-8000-000000000002';
  v_existing_friend constant uuid := 'd964b372-ef61-4dce-aadd-214fa6f98a43';
  v_transition constant uuid := 'c6600000-0000-4000-8000-000000000131';
  v_occurrence constant uuid := 'c6600000-0000-4000-8000-000000000141';
  v_first jsonb;
  v_replay jsonb;
  v_after jsonb;
begin
  v_after := public.get_my_continuation_after(v_occurrence);
  perform pg_temp.friend_fee_assert(
    pg_catalog.jsonb_array_length(v_after->'friend_targets') = 3
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(v_after->'friend_targets') as target(value)
        where target.value->>'target_user_id' = v_existing_friend::text
      ),
    'projection.active_friend_is_not_a_fee_target'
  );
  perform pg_temp.friend_fee_raises(
    $call$select public.prepare_my_continuation_fee(
      'c6600000-0000-4000-8000-000000000131', ' friend_request ',
      'c6600000-0000-4000-8000-000000000002', 'local_verified_simulator',
      'd7700000-0000-4000-8000-000000000001'
    )$call$,
    'invalid_continuation_fee',
    'prepare.whitespace_purpose_is_rejected'
  );
  perform pg_temp.friend_fee_raises(
    $call$select public.prepare_my_continuation_fee(
      'c6600000-0000-4000-8000-000000000131', 'friend_request',
      'd964b372-ef61-4dce-aadd-214fa6f98a43', 'local_verified_simulator',
      'd7700000-0000-4000-8000-000000000002'
    )$call$,
    'friend_request_not_allowed',
    'prepare.active_friend_is_blocked'
  );

  v_first := public.prepare_my_continuation_fee(
    v_transition, 'friend_request', v_target_b, 'local_verified_simulator',
    'd7700000-0000-4000-8000-000000000010'
  );
  v_replay := public.prepare_my_continuation_fee(
    v_transition, 'friend_request', v_target_b, 'local_verified_simulator',
    'd7700000-0000-4000-8000-000000000011'
  );
  perform pg_temp.friend_fee_assert(
    v_replay->>'order_id' = v_first->>'order_id',
    'prepare.rotated_key_reuses_active_order'
  );
  v_after := public.get_my_continuation_after(v_occurrence);
  perform pg_temp.friend_fee_assert(
    exists (
      select 1 from pg_catalog.jsonb_array_elements(v_after->'friend_targets') as target(value)
      where target.value->>'target_user_id' = v_target_b::text
    ),
    'projection.current_prepared_order_remains_resumable'
  );
  insert into pg_temp.continuation_friend_fee_state(key, value)
  values ('first_order', v_first);

  perform pg_catalog.set_config('request.jwt.claim.sub', v_target_b::text, true);
  insert into public.friend_requests (
    id, sender_user_id, receiver_user_id, token, status, expires_at
  ) values (
    'd7700000-0000-4000-8000-000000000100', v_target_b, v_actor,
    'd770-friend-fee-pending-ab', 'pending', pg_catalog.clock_timestamp() + interval '1 day'
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor::text, true);

  v_replay := public.prepare_my_continuation_fee(
    v_transition, 'friend_request', v_target_b, 'local_verified_simulator',
    'd7700000-0000-4000-8000-000000000010'
  );
  perform pg_temp.friend_fee_assert(
    v_replay->>'order_id' = v_first->>'order_id',
    'prepare.exact_idempotency_replay_survives_new_pending_request'
  );
  perform pg_temp.friend_fee_raises(
    $call$select public.prepare_my_continuation_fee(
      'c6600000-0000-4000-8000-000000000131', 'friend_request',
      'c6600000-0000-4000-8000-000000000002', 'local_verified_simulator',
      'd7700000-0000-4000-8000-000000000012'
    )$call$,
    'friend_request_not_allowed',
    'prepare.bidirectional_pending_blocks_new_key'
  );
  v_after := public.get_my_continuation_after(v_occurrence);
  perform pg_temp.friend_fee_assert(
    not exists (
      select 1 from pg_catalog.jsonb_array_elements(v_after->'friend_targets') as target(value)
      where target.value->>'target_user_id' = v_target_b::text
    ),
    'projection.pending_pair_is_not_a_fee_target'
  );
end
$test$;

-- Close the first synthetic order/request so the same pair can exercise a
-- separate paid-entitlement worker path later in this transaction.
do $test$
declare
  v_order_id uuid := ((select value from pg_temp.continuation_friend_fee_state where key = 'first_order')->>'order_id')::uuid;
begin
  perform public.cancel_my_continuation_fee(
    v_order_id, 'd7700000-0000-4000-8000-000000000013'
  );
  update public.friend_requests
  set status = 'declined'
  where id = 'd7700000-0000-4000-8000-000000000100';
end
$test$;

reset role;
insert into public.quantum_continuation_fee_orders (
  id, transition_id, owner_user_id, target_user_id, purpose, provider,
  provider_order_id, notice_version, status, provider_verified, idempotency_key
) values (
  'd7700000-0000-4000-8000-000000000205',
  'c6600000-0000-4000-8000-000000000131',
  'c6600000-0000-4000-8000-000000000001',
  'c6600000-0000-4000-8000-000000000004',
  'friend_request', 'toss_sandbox', 'ct_d770_unresolved_projection',
  '2026-09-05', 'recovery_required', false,
  'd7700000-0000-4000-8000-000000000053'
);
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000001', true);
select pg_temp.friend_fee_assert(
  not exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      public.get_my_continuation_after('c6600000-0000-4000-8000-000000000141')->'friend_targets'
    ) as target(value)
    where target.value->>'target_user_id' = 'c6600000-0000-4000-8000-000000000004'
  ),
  'projection.unresolved_recovery_order_is_not_clickable'
);
reset role;
update public.quantum_continuation_fee_orders
set status = 'cancelled', revision = revision + 1
where id = 'd7700000-0000-4000-8000-000000000205';

select pg_catalog.set_config('app.bypass_friendships_guard', 'on', true);
insert into public.friendships (
  user_id, friend_user_id, status, blocked_by, blocked_at
) values (
  'c6600000-0000-4000-8000-000000000001',
  'c6600000-0000-4000-8000-000000000004',
  'blocked', 'c6600000-0000-4000-8000-000000000001', pg_catalog.clock_timestamp()
);
select pg_catalog.set_config('app.bypass_friendships_guard', 'off', true);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000001', true);
select pg_temp.friend_fee_raises(
  $call$select public.prepare_my_continuation_fee(
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'c6600000-0000-4000-8000-000000000004', 'local_verified_simulator',
    'd7700000-0000-4000-8000-000000000020'
  )$call$,
  'friend_request_not_allowed',
  'prepare.blocked_friendship_cannot_be_bypassed_by_payment'
);
reset role;
delete from public.friendships
where user_id = 'c6600000-0000-4000-8000-000000000001'
  and friend_user_id = 'c6600000-0000-4000-8000-000000000004';

-- A pending request created after a Toss order is prepared must stop before
-- provider confirmation. The order is closed without provider evidence.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000001', true);
do $test$
declare
  v_order jsonb;
  v_projected jsonb;
begin
  v_order := public.prepare_my_continuation_fee(
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'c6600000-0000-4000-8000-000000000003', 'toss_sandbox',
    'd7700000-0000-4000-8000-000000000030'
  );
  v_projected := public.get_my_continuation_fee_order((v_order->>'order_id')::uuid);
  insert into pg_temp.continuation_friend_fee_state(key, value)
  values ('begin_order', v_projected);
  perform pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000003', true);
  insert into public.friend_requests (
    id, sender_user_id, receiver_user_id, token, status, expires_at
  ) values (
    'd7700000-0000-4000-8000-000000000101',
    'c6600000-0000-4000-8000-000000000003',
    'c6600000-0000-4000-8000-000000000001',
    'd770-friend-fee-pending-ac', 'pending', pg_catalog.clock_timestamp() + interval '1 day'
  );
end
$test$;
reset role;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
do $test$
declare
  v_order jsonb := (select value from pg_temp.continuation_friend_fee_state where key = 'begin_order');
  v_result jsonb;
begin
  v_result := public.begin_continuation_fee_verification_for_service(
    (v_order->>'order_id')::uuid,
    'c6600000-0000-4000-8000-000000000001',
    'toss_sandbox', v_order->>'provider_order_id'
  );
  perform pg_temp.friend_fee_assert(
    v_result->>'status' = 'cancelled'
      and (v_result->>'provider_verified')::boolean is false,
    'begin.pending_pair_closes_before_provider_call'
  );
  perform pg_temp.friend_fee_raises(
    format(
      'select public.begin_continuation_fee_verification_for_service(%L,%L,null,%L)',
      v_order->>'order_id', 'c6600000-0000-4000-8000-000000000001', v_order->>'provider_order_id'
    ),
    'invalid_fee_verification',
    'begin.null_provider_is_fail_closed'
  );
end
$test$;
reset role;

-- A pair that changes after local preparation is closed as no-charge. The
-- simulator never creates monetary recovery work or a paid entitlement.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000001', true);
do $test$
declare
  v_order jsonb;
begin
  v_order := public.prepare_my_continuation_fee(
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'c6600000-0000-4000-8000-000000000004', 'local_verified_simulator',
    'd7700000-0000-4000-8000-000000000040'
  );
  insert into pg_temp.continuation_friend_fee_state(key, value) values ('confirm_order', v_order);
  perform pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000004', true);
  insert into public.friend_requests (
    id, sender_user_id, receiver_user_id, token, status, expires_at
  ) values (
    'd7700000-0000-4000-8000-000000000102',
    'c6600000-0000-4000-8000-000000000004',
    'c6600000-0000-4000-8000-000000000001',
    'd770-friend-fee-pending-ad', 'pending', pg_catalog.clock_timestamp() + interval '1 day'
  );
end
$test$;
reset role;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
do $test$
declare
  v_order_id uuid := ((select value from pg_temp.continuation_friend_fee_state where key = 'confirm_order')->>'order_id')::uuid;
  v_result jsonb;
begin
  v_result := public.confirm_my_continuation_fee_for_service(
    v_order_id, 'c6600000-0000-4000-8000-000000000001',
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'local_verified_simulator', 'd770-local-event-ad', 'd770-local-txn-ad',
    1000, 'KRW', true
  );
  perform pg_temp.friend_fee_assert(
    v_result->>'status' = 'cancelled'
      and (v_result->>'recovery_required')::boolean is false
      and (v_result->>'no_charge')::boolean,
    'confirm.changed_pair_local_simulator_is_no_charge'
  );
  perform pg_temp.friend_fee_raises(
    format(
      'select public.confirm_my_continuation_fee_for_service(%L,%L,%L,%L,%L,%L,%L,1000,%L,true)',
      v_order_id,
      'c6600000-0000-4000-8000-000000000002',
      'c6600000-0000-4000-8000-000000000131',
      'friend_request', 'local_verified_simulator',
      'd770-local-event-ad', 'd770-local-txn-ad', 'KRW'
    ),
    'payment_context_mismatch',
    'confirm.local_no_charge_replay_validates_full_context'
  );
end
$test$;
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000001', true);
update public.friend_requests
set status = 'declined'
where id = 'd7700000-0000-4000-8000-000000000102';
reset role;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
do $test$
declare
  v_order_id uuid := ((select value from pg_temp.continuation_friend_fee_state where key = 'confirm_order')->>'order_id')::uuid;
  v_result jsonb;
begin
  v_result := public.confirm_my_continuation_fee_for_service(
    v_order_id, 'c6600000-0000-4000-8000-000000000001',
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'local_verified_simulator', 'd770-local-event-ad', 'd770-local-txn-ad',
    1000, 'KRW', true
  );
  perform pg_temp.friend_fee_assert(
    (v_result->>'replayed')::boolean
      and (v_result->>'no_charge')::boolean,
    'confirm.local_no_charge_exact_replay_is_idempotent'
  );
end
$test$;
reset role;
select pg_temp.friend_fee_assert(
  exists (
    select 1 from public.quantum_continuation_fee_orders as fee
    where fee.id = ((select value from pg_temp.continuation_friend_fee_state where key = 'confirm_order')->>'order_id')::uuid
      and fee.status = 'cancelled'
      and not fee.provider_verified
      and fee.provider_event_id = 'd770-local-event-ad'
      and fee.provider_transaction_id = 'd770-local-txn-ad'
  ) and not exists (
    select 1 from public.quantum_continuation_friend_entitlements as entitlement
    where entitlement.fee_order_id = ((select value from pg_temp.continuation_friend_fee_state where key = 'confirm_order')->>'order_id')::uuid
      and entitlement.status in ('ready', 'queued', 'delivered')
  ) and not exists (
    select 1 from public.quantum_continuation_fee_recovery_jobs as job
    where job.fee_order_id = ((select value from pg_temp.continuation_friend_fee_state where key = 'confirm_order')->>'order_id')::uuid
  ) and exists (
    select 1 from public.quantum_continuation_fee_events as event
    where event.fee_order_id = ((select value from pg_temp.continuation_friend_fee_state where key = 'confirm_order')->>'order_id')::uuid
      and event.event_type = 'no_charge'
  ),
  'confirm.local_no_charge_is_terminal_without_recovery_job'
);

-- The exact worker expires a stale pending row under the pair lock, then
-- creates one fresh request for the paid entitlement.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000001', true);
insert into pg_temp.continuation_friend_fee_state(key, value)
values (
  'stale_worker_order',
  public.prepare_my_continuation_fee(
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'c6600000-0000-4000-8000-000000000002', 'local_verified_simulator',
    'd7700000-0000-4000-8000-000000000060'
  )
);
reset role;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select public.confirm_my_continuation_fee_for_service(
  ((select value from pg_temp.continuation_friend_fee_state where key = 'stale_worker_order')->>'order_id')::uuid,
  'c6600000-0000-4000-8000-000000000001',
  'c6600000-0000-4000-8000-000000000131', 'friend_request',
  'local_verified_simulator', 'd770-local-event-ab', 'd770-local-txn-ab',
  1000, 'KRW', true
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000002', true);
insert into public.friend_requests (
  id, sender_user_id, receiver_user_id, token, status, expires_at
) values (
  'd7700000-0000-4000-8000-000000000103',
  'c6600000-0000-4000-8000-000000000002',
  'c6600000-0000-4000-8000-000000000001',
  'd770-friend-fee-stale-ab', 'pending', pg_catalog.clock_timestamp() - interval '1 hour'
);
reset role;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_temp.friend_fee_raises(
  $call$select public.confirm_my_continuation_fee_for_service(
    'd7700000-0000-4000-8000-000000000201',
    'c6600000-0000-4000-8000-000000000002',
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'toss_sandbox', '', 'd770-toss-txn-bd-invalid', 1000, 'KRW', true
  )$call$,
  'provider_verification_failed',
  'confirm.empty_provider_event_is_rejected_before_recovery_write'
);
select pg_temp.friend_fee_raises(
  $call$select public.confirm_my_continuation_fee_for_service(
    'd7700000-0000-4000-8000-000000000201',
    'c6600000-0000-4000-8000-000000000002',
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'toss_sandbox', repeat('e', 181), 'd770-toss-txn-bd-invalid', 1000, 'KRW', true
  )$call$,
  'provider_verification_failed',
  'confirm.overlong_provider_event_is_rejected_before_recovery_write'
);
select pg_temp.friend_fee_assert(
  (public.deliver_continuation_friend_entitlements_for_service(1)->>'delivered_count')::integer = 1,
  'worker.stale_pending_is_replaced_by_fresh_request'
);
select pg_temp.friend_fee_assert(
  auth.uid() = 'c6600000-0000-4000-8000-000000000002'::uuid,
  'worker.stale_expiry_restores_caller_claims'
);
reset role;
select pg_temp.friend_fee_assert(
  (select status = 'expired' from public.friend_requests where id = 'd7700000-0000-4000-8000-000000000103')
    and exists (
      select 1 from public.friend_requests as request
      where request.sender_user_id = 'c6600000-0000-4000-8000-000000000001'
        and request.receiver_user_id = 'c6600000-0000-4000-8000-000000000002'
        and request.status = 'pending'
        and request.expires_at > pg_catalog.clock_timestamp()
    ) and exists (
      select 1 from public.quantum_continuation_friend_entitlements as entitlement
      where entitlement.fee_order_id = ((select value from pg_temp.continuation_friend_fee_state where key = 'stale_worker_order')->>'order_id')::uuid
        and entitlement.status = 'delivered'
        and entitlement.friend_request_id is not null
    ),
  'worker.stale_pending_never_becomes_delivered_request'
);

-- A delivered request that was later declined does not permanently ban the
-- same pair from making a new explicit request in another transition.
insert into pg_temp.continuation_friend_fee_state(key, value)
select 'delivered_request', pg_catalog.jsonb_build_object(
  'request_id', entitlement.friend_request_id
)
from public.quantum_continuation_friend_entitlements as entitlement
where entitlement.fee_order_id = ((
  select value from pg_temp.continuation_friend_fee_state where key = 'stale_worker_order'
)->>'order_id')::uuid;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000002', true);
update public.friend_requests as request
set status = 'declined'
where request.id = ((
  select value from pg_temp.continuation_friend_fee_state where key = 'delivered_request'
)->>'request_id')::uuid;
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000001', true);
do $test$
declare
  v_new_order jsonb;
begin
  v_new_order := public.prepare_my_continuation_fee(
    'c6600000-0000-4000-8000-000000000130', 'friend_request',
    'c6600000-0000-4000-8000-000000000002', 'local_verified_simulator',
    'd7700000-0000-4000-8000-000000000080'
  );
  perform pg_temp.friend_fee_assert(
    v_new_order->>'status' = 'prepared',
    'prepare.historical_delivered_then_declined_allows_new_transition'
  );
  perform public.cancel_my_continuation_fee(
    (v_new_order->>'order_id')::uuid,
    'd7700000-0000-4000-8000-000000000081'
  );
end
$test$;
reset role;

-- A still-valid reverse pending request created after local confirmation is
-- not reused as a paid result. With no external charge, both rows close.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000002', true);
insert into pg_temp.continuation_friend_fee_state(key, value)
values (
  'pending_worker_order',
  public.prepare_my_continuation_fee(
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'c6600000-0000-4000-8000-000000000003', 'local_verified_simulator',
    'd7700000-0000-4000-8000-000000000070'
  )
);
reset role;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select public.confirm_my_continuation_fee_for_service(
  ((select value from pg_temp.continuation_friend_fee_state where key = 'pending_worker_order')->>'order_id')::uuid,
  'c6600000-0000-4000-8000-000000000002',
  'c6600000-0000-4000-8000-000000000131', 'friend_request',
  'local_verified_simulator', 'd770-local-event-bc', 'd770-local-txn-bc',
  1000, 'KRW', true
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000003', true);
insert into public.friend_requests (
  id, sender_user_id, receiver_user_id, token, status, expires_at
) values (
  'd7700000-0000-4000-8000-000000000104',
  'c6600000-0000-4000-8000-000000000003',
  'c6600000-0000-4000-8000-000000000002',
  'd770-friend-fee-pending-bc', 'pending', pg_catalog.clock_timestamp() + interval '1 day'
);
reset role;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_temp.friend_fee_assert(
  (public.deliver_continuation_friend_entitlements_for_service(1)->>'cancelled_count')::integer = 1,
  'worker.valid_pending_is_not_reused_as_paid_delivery'
);
reset role;
select pg_temp.friend_fee_assert(
  exists (
    select 1
    from public.quantum_continuation_friend_entitlements as entitlement
    join public.quantum_continuation_fee_orders as fee on fee.id = entitlement.fee_order_id
    where entitlement.fee_order_id = ((select value from pg_temp.continuation_friend_fee_state where key = 'pending_worker_order')->>'order_id')::uuid
      and entitlement.status = 'cancelled'
      and fee.status = 'cancelled'
      and not fee.provider_verified
  ) and not exists (
    select 1 from public.quantum_continuation_fee_recovery_jobs as job
    where job.fee_order_id = ((select value from pg_temp.continuation_friend_fee_state where key = 'pending_worker_order')->>'order_id')::uuid
  ) and exists (
    select 1 from public.quantum_continuation_fee_events as event
    where event.fee_order_id = ((select value from pg_temp.continuation_friend_fee_state where key = 'pending_worker_order')->>'order_id')::uuid
      and event.event_type = 'no_charge'
  ),
  'worker.valid_pending_closes_local_fee_without_recovery'
);

-- Same-transition cancelled entitlement remains a physical UNIQUE conflict.
-- Public prepare blocks it, while a pre-existing prepared Toss order still has
-- its externally verified evidence captured into recovery instead of rollback.
insert into public.quantum_continuation_fee_orders (
  id, transition_id, owner_user_id, target_user_id, purpose, provider,
  notice_version, status, provider_verified, idempotency_key
) values (
  'd7700000-0000-4000-8000-000000000200',
  'c6600000-0000-4000-8000-000000000131',
  'c6600000-0000-4000-8000-000000000002',
  'c6600000-0000-4000-8000-000000000004',
  'friend_request', 'local_verified_simulator', '2026-09-05',
  'cancelled', false, 'd7700000-0000-4000-8000-000000000050'
);
insert into public.quantum_continuation_friend_entitlements (
  id, fee_order_id, requester_user_id, target_user_id, transition_id, status
) values (
  'd7700000-0000-4000-8000-000000000300',
  'd7700000-0000-4000-8000-000000000200',
  'c6600000-0000-4000-8000-000000000002',
  'c6600000-0000-4000-8000-000000000004',
  'c6600000-0000-4000-8000-000000000131', 'cancelled'
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'c6600000-0000-4000-8000-000000000002', true);
select pg_temp.friend_fee_raises(
  $call$select public.prepare_my_continuation_fee(
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'c6600000-0000-4000-8000-000000000004', 'toss_sandbox',
    'd7700000-0000-4000-8000-000000000051'
  )$call$,
  'friend_request_not_allowed',
  'prepare.cancelled_entitlement_unique_is_preflighted'
);
reset role;

insert into public.quantum_continuation_fee_orders (
  id, transition_id, owner_user_id, target_user_id, purpose, provider,
  provider_order_id, checkout_expires_at, notice_version, status,
  provider_verified, idempotency_key
) values (
  'd7700000-0000-4000-8000-000000000201',
  'c6600000-0000-4000-8000-000000000131',
  'c6600000-0000-4000-8000-000000000002',
  'c6600000-0000-4000-8000-000000000004',
  'friend_request', 'toss_sandbox', 'ct_d770_cancelled_entitlement',
  pg_catalog.clock_timestamp() + interval '10 minutes', '2026-09-05',
  'prepared', false, 'd7700000-0000-4000-8000-000000000052'
);

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_temp.friend_fee_assert(
  (public.confirm_my_continuation_fee_for_service(
    'd7700000-0000-4000-8000-000000000201',
    'c6600000-0000-4000-8000-000000000002',
    'c6600000-0000-4000-8000-000000000131', 'friend_request',
    'toss_sandbox', 'd770-toss-event-bd', 'd770-toss-txn-bd',
    1000, 'KRW', true
  )->>'recovery_required')::boolean,
  'confirm.cancelled_entitlement_callback_is_recovered'
);
reset role;
select pg_temp.friend_fee_assert(
  exists (
    select 1 from public.quantum_continuation_fee_orders as fee
    where fee.id = 'd7700000-0000-4000-8000-000000000201'
      and fee.status = 'recovery_required' and fee.provider_verified
      and fee.provider_event_id = 'd770-toss-event-bd'
      and fee.provider_transaction_id = 'd770-toss-txn-bd'
  ) and exists (
    select 1 from public.quantum_continuation_fee_recovery_jobs as job
    where job.fee_order_id = 'd7700000-0000-4000-8000-000000000201'
      and job.desired_action = 'cancel'
  ),
  'confirm.cancelled_entitlement_preserves_money_evidence_and_job'
);

-- ACL and wrapper surface remain narrow.
select pg_temp.friend_fee_assert(
  not has_function_privilege(
    'authenticated',
    'quantum_private.prepare_my_continuation_fee_impl_20260905180000(uuid,text,uuid,text,uuid)',
    'EXECUTE'
  ) and not has_function_privilege(
    'service_role',
    'quantum_private.confirm_my_continuation_fee_for_service_impl_20260905180000(uuid,uuid,uuid,text,text,text,text,integer,text,boolean)',
    'EXECUTE'
  ) and has_function_privilege(
    'authenticated', 'public.prepare_my_continuation_fee(uuid,text,uuid,text,uuid)', 'EXECUTE'
  ) and has_function_privilege(
    'service_role',
    'public.confirm_my_continuation_fee_for_service(uuid,uuid,uuid,text,text,text,text,integer,text,boolean)',
    'EXECUTE'
  ),
  'acl.private_implementations_are_not_directly_callable'
);

select 'continuation_friend_fee_guard_assertions=' || count(*) as synthetic_test_summary
from pg_temp.continuation_friend_fee_assertions;

rollback;
