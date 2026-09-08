begin;

-- One fail-closed role check for the new service wrappers. The legacy bodies
-- remain private implementation details and keep their existing signatures.
create or replace function quantum_private.is_service_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.role()) = 'service_role', false)
$$;

create or replace function quantum_private.friend_pair_lock_key(p_left uuid, p_right uuid)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.hashtextextended(
    least(p_left, p_right)::text || ':' || greatest(p_left, p_right)::text,
    0
  )
$$;

-- Direct table mutations still exist in older friend-request routes. Make all
-- UUID-pair mutations participate in the same lock as request-by-display-name.
-- A row trigger cannot safely wait after PostgreSQL has locked the row, so it
-- fails quickly and lets the caller retry instead of introducing a cycle.
create or replace function quantum_private.try_lock_friend_pair_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_left uuid;
  v_right uuid;
begin
  if tg_table_name = 'friend_requests' then
    if tg_op = 'DELETE' then
      v_left := old.sender_user_id;
      v_right := old.receiver_user_id;
    else
      v_left := new.sender_user_id;
      v_right := new.receiver_user_id;
    end if;
  elsif tg_table_name = 'friendships' then
    if tg_op = 'DELETE' then
      v_left := old.user_id;
      v_right := old.friend_user_id;
    else
      v_left := new.user_id;
      v_right := new.friend_user_id;
    end if;
  end if;

  if v_left is not null and v_right is not null and v_left <> v_right
     and not pg_catalog.pg_try_advisory_xact_lock(
       quantum_private.friend_pair_lock_key(v_left, v_right)
     ) then
    raise exception 'friend_pair_retryable' using errcode = '40001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists trg_lock_friend_request_pair_mutation on public.friend_requests;
create trigger trg_lock_friend_request_pair_mutation
before insert or update or delete on public.friend_requests
for each row execute function quantum_private.try_lock_friend_pair_mutation();

drop trigger if exists trg_lock_friendship_pair_mutation on public.friendships;
create trigger trg_lock_friendship_pair_mutation
before insert or update or delete on public.friendships
for each row execute function quantum_private.try_lock_friend_pair_mutation();

-- This helper intentionally exposes only a boolean. Callers already know their
-- own pair; no friendship direction, request owner, or target profile leaks.
create or replace function quantum_private.continuation_friend_pair_is_blocked(
  p_requester uuid,
  p_target uuid,
  p_ignore_entitlement_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_requester is null
    or p_target is null
    or p_requester = p_target
    or exists (
      select 1
      from public.friendships as friendship
      where friendship.user_id = least(p_requester, p_target)
        and friendship.friend_user_id = greatest(p_requester, p_target)
        and friendship.status in ('active', 'blocked')
    )
    or exists (
      select 1
      from public.friend_requests as request
      where request.status = 'pending'
        and request.receiver_user_id is not null
        and request.expires_at > pg_catalog.statement_timestamp()
        and least(request.sender_user_id, request.receiver_user_id) = least(p_requester, p_target)
        and greatest(request.sender_user_id, request.receiver_user_id) = greatest(p_requester, p_target)
    )
    or exists (
      select 1
      from public.quantum_continuation_friend_entitlements as entitlement
      where entitlement.status in ('ready', 'queued')
        and entitlement.id is distinct from p_ignore_entitlement_id
        and least(entitlement.requester_user_id, entitlement.target_user_id) = least(p_requester, p_target)
        and greatest(entitlement.requester_user_id, entitlement.target_user_id) = greatest(p_requester, p_target)
    )
$$;

create or replace function quantum_private.expire_stale_friend_pair_requests(
  p_left uuid,
  p_right uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_old_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  v_old_claims text := pg_catalog.current_setting('request.jwt.claims', true);
begin
  -- The preserved update guard permits maintenance only when auth.uid() is
  -- absent. Clear both claim formats only around this exact stale->expired
  -- update, then restore them even when a downstream trigger raises.
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claims', '', true);
  begin
    update public.friend_requests as request
    set status = 'expired'
    where request.status = 'pending'
      and request.receiver_user_id is not null
      and request.expires_at <= pg_catalog.statement_timestamp()
      and least(request.sender_user_id, request.receiver_user_id) = least(p_left, p_right)
      and greatest(request.sender_user_id, request.receiver_user_id) = greatest(p_left, p_right);
    get diagnostics v_count = row_count;
  exception when others then
    perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_old_sub, ''), true);
    perform pg_catalog.set_config('request.jwt.claims', coalesce(v_old_claims, ''), true);
    raise;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_old_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_old_claims, ''), true);
  return v_count;
end
$$;

revoke all on function quantum_private.is_service_role()
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.friend_pair_lock_key(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.try_lock_friend_pair_mutation()
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.continuation_friend_pair_is_blocked(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.expire_stale_friend_pair_requests(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Preserve the recovery-aware 20260905180000 implementation and put only the
-- friend-pair eligibility guard in front of it.
alter function public.prepare_my_continuation_fee(uuid, text, uuid, text, uuid)
  set schema quantum_private;
alter function quantum_private.prepare_my_continuation_fee(uuid, text, uuid, text, uuid)
  rename to prepare_my_continuation_fee_impl_20260905180000;
revoke all on function quantum_private.prepare_my_continuation_fee_impl_20260905180000(uuid, text, uuid, text, uuid)
  from public, anon, authenticated, service_role;

create function public.prepare_my_continuation_fee(
  p_transition_id uuid,
  p_purpose text,
  p_target_user_id uuid,
  p_provider text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.quantum_continuation_fee_orders%rowtype;
  v_active public.quantum_continuation_fee_orders%rowtype;
begin
  if v_actor is null or p_purpose <> 'friend_request'
     or p_target_user_id is null or p_target_user_id = v_actor then
    return quantum_private.prepare_my_continuation_fee_impl_20260905180000(
      p_transition_id, p_purpose, p_target_user_id, p_provider, p_idempotency_key
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    quantum_private.friend_pair_lock_key(v_actor, p_target_user_id)
  );
  perform quantum_private.expire_stale_friend_pair_requests(v_actor, p_target_user_id);

  select fee.* into v_existing
  from public.quantum_continuation_fee_orders as fee
  where fee.owner_user_id = v_actor
    and fee.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return quantum_private.prepare_my_continuation_fee_impl_20260905180000(
      p_transition_id, p_purpose, p_target_user_id, p_provider, p_idempotency_key
    );
  end if;

  select fee.* into v_active
  from public.quantum_continuation_fee_orders as fee
  where fee.transition_id = p_transition_id
    and fee.owner_user_id = v_actor
    and fee.purpose = p_purpose
    and fee.target_user_id = p_target_user_id
    and fee.provider = p_provider
    and fee.status = 'prepared'
  order by fee.created_at
  limit 1;

  if quantum_private.continuation_friend_pair_is_blocked(v_actor, p_target_user_id)
     or exists (
       select 1
       from public.quantum_continuation_friend_entitlements as entitlement
       where entitlement.transition_id = p_transition_id
         and least(entitlement.requester_user_id, entitlement.target_user_id) = least(v_actor, p_target_user_id)
         and greatest(entitlement.requester_user_id, entitlement.target_user_id) = greatest(v_actor, p_target_user_id)
     )
     or exists (
       select 1
       from public.quantum_continuation_fee_orders as fee
       where fee.purpose = 'friend_request'
         and (
           fee.status in ('prepared', 'verifying', 'recovery_required')
           or (
             fee.status = 'verified'
             and not exists (
               select 1
               from public.quantum_continuation_friend_entitlements as delivered
               where delivered.fee_order_id = fee.id
                 and delivered.status = 'delivered'
             )
           )
         )
         and fee.id is distinct from v_active.id
         and least(fee.owner_user_id, fee.target_user_id) = least(v_actor, p_target_user_id)
         and greatest(fee.owner_user_id, fee.target_user_id) = greatest(v_actor, p_target_user_id)
     ) then
    raise exception 'friend_request_not_allowed';
  end if;

  return quantum_private.prepare_my_continuation_fee_impl_20260905180000(
    p_transition_id, p_purpose, p_target_user_id, p_provider, p_idempotency_key
  );
end
$$;

revoke all on function public.prepare_my_continuation_fee(uuid, text, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_my_continuation_fee(uuid, text, uuid, text, uuid)
  to authenticated;

alter function public.get_my_continuation_after(uuid) set schema quantum_private;
alter function quantum_private.get_my_continuation_after(uuid)
  rename to get_my_continuation_after_impl_20260905120000;
revoke all on function quantum_private.get_my_continuation_after_impl_20260905120000(uuid)
  from public, anon, authenticated, service_role;

create function public.get_my_continuation_after(p_occurrence_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_payload jsonb;
  v_targets jsonb;
begin
  v_payload := quantum_private.get_my_continuation_after_impl_20260905120000(p_occurrence_id);
  select coalesce(pg_catalog.jsonb_agg(target.value order by target.value->>'alias'), '[]'::jsonb)
  into v_targets
  from pg_catalog.jsonb_array_elements(v_payload->'friend_targets') as target(value)
  where not quantum_private.continuation_friend_pair_is_blocked(
    v_actor,
    (target.value->>'target_user_id')::uuid
  )
    and not exists (
      select 1
      from public.quantum_continuation_friend_entitlements as entitlement
      where entitlement.transition_id = (v_payload->>'transition_id')::uuid
        and least(entitlement.requester_user_id, entitlement.target_user_id) = least(
          v_actor, (target.value->>'target_user_id')::uuid
        )
        and greatest(entitlement.requester_user_id, entitlement.target_user_id) = greatest(
          v_actor, (target.value->>'target_user_id')::uuid
        )
    )
    and not exists (
      select 1
      from public.quantum_continuation_fee_orders as fee
      where fee.purpose = 'friend_request'
        and least(fee.owner_user_id, fee.target_user_id) = least(
          v_actor, (target.value->>'target_user_id')::uuid
        )
        and greatest(fee.owner_user_id, fee.target_user_id) = greatest(
          v_actor, (target.value->>'target_user_id')::uuid
        )
        and (
          fee.status in ('verifying', 'recovery_required')
          or (
            fee.status = 'prepared'
            and not (
              fee.owner_user_id = v_actor
              and fee.transition_id = (v_payload->>'transition_id')::uuid
            )
          )
          or (
            fee.status = 'verified'
            and not exists (
              select 1
              from public.quantum_continuation_friend_entitlements as delivered
              where delivered.fee_order_id = fee.id
                and delivered.status = 'delivered'
            )
          )
        )
    );
  return pg_catalog.jsonb_set(v_payload, '{friend_targets}', v_targets, true);
end
$$;

revoke all on function public.get_my_continuation_after(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_continuation_after(uuid)
  to authenticated;

alter function public.begin_continuation_fee_verification_for_service(uuid, uuid, text, text)
  set schema quantum_private;
alter function quantum_private.begin_continuation_fee_verification_for_service(uuid, uuid, text, text)
  rename to begin_cont_fee_verify_impl_20260905180000;
revoke all on function quantum_private.begin_cont_fee_verify_impl_20260905180000(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

create function public.begin_continuation_fee_verification_for_service(
  p_order_id uuid,
  p_owner_user_id uuid,
  p_provider text,
  p_provider_order_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.quantum_continuation_fee_orders%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not quantum_private.is_service_role() then raise exception 'service_role_required'; end if;
  if p_order_id is null or p_owner_user_id is null or p_provider is null
     or p_provider not in ('toss_sandbox', 'toss')
     or p_provider_order_id is null then
    raise exception 'invalid_fee_verification';
  end if;

  select fee.* into v_order
  from public.quantum_continuation_fee_orders as fee
  where fee.id = p_order_id;
  if v_order.id is null then raise exception 'continuation_fee_order_not_found'; end if;

  if v_order.purpose = 'friend_request' then
    perform pg_catalog.pg_advisory_xact_lock(
      quantum_private.friend_pair_lock_key(v_order.owner_user_id, v_order.target_user_id)
    );
    perform quantum_private.expire_stale_friend_pair_requests(
      v_order.owner_user_id, v_order.target_user_id
    );
    select fee.* into v_order
    from public.quantum_continuation_fee_orders as fee
    where fee.id = p_order_id
    for update;
    if v_order.owner_user_id <> p_owner_user_id
       or v_order.provider <> p_provider
       or v_order.provider_order_id <> p_provider_order_id then
      raise exception 'payment_context_mismatch';
    end if;

    if v_order.status in ('prepared', 'verifying')
       and not v_order.provider_verified
       and (
         quantum_private.continuation_friend_pair_is_blocked(
           v_order.owner_user_id, v_order.target_user_id
         ) or exists (
           select 1
           from public.quantum_continuation_friend_entitlements as entitlement
           where entitlement.transition_id = v_order.transition_id
             and least(entitlement.requester_user_id, entitlement.target_user_id) = least(
               v_order.owner_user_id, v_order.target_user_id
             )
             and greatest(entitlement.requester_user_id, entitlement.target_user_id) = greatest(
               v_order.owner_user_id, v_order.target_user_id
             )
         )
       ) then
      if v_order.status = 'prepared' then
        update public.quantum_continuation_fee_orders
        set status = 'cancelled', revision = revision + 1, updated_at = v_now
        where id = p_order_id;
        insert into public.quantum_continuation_fee_events (
          fee_order_id, event_type, provider, error_code, idempotency_key
        ) values (
          p_order_id, 'no_charge', v_order.provider, 'friend_request_not_allowed',
          'no_charge:friend_pair_blocked:' || p_order_id::text
        ) on conflict (idempotency_key) do nothing;
      else
        update public.quantum_continuation_fee_orders
        set status = 'recovery_required', revision = revision + 1, updated_at = v_now
        where id = p_order_id;
      end if;

      select fee.* into v_order
      from public.quantum_continuation_fee_orders as fee
      where fee.id = p_order_id;
      return pg_catalog.jsonb_build_object(
        'order_id', v_order.id, 'status', v_order.status,
        'revision', v_order.revision, 'provider_verified', v_order.provider_verified
      );
    end if;
  end if;

  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  return quantum_private.begin_cont_fee_verify_impl_20260905180000(
    p_order_id, p_owner_user_id, p_provider, p_provider_order_id
  );
end
$$;

revoke all on function public.begin_continuation_fee_verification_for_service(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_continuation_fee_verification_for_service(uuid, uuid, text, text)
  to service_role;

alter function public.confirm_my_continuation_fee_for_service(
  uuid, uuid, uuid, text, text, text, text, integer, text, boolean
) set schema quantum_private;
alter function quantum_private.confirm_my_continuation_fee_for_service(
  uuid, uuid, uuid, text, text, text, text, integer, text, boolean
) rename to confirm_my_continuation_fee_for_service_impl_20260905180000;
revoke all on function quantum_private.confirm_my_continuation_fee_for_service_impl_20260905180000(
  uuid, uuid, uuid, text, text, text, text, integer, text, boolean
) from public, anon, authenticated, service_role;

create function public.confirm_my_continuation_fee_for_service(
  p_order_id uuid,
  p_owner_user_id uuid,
  p_transition_id uuid,
  p_purpose text,
  p_provider text,
  p_provider_event_id text,
  p_provider_transaction_id text,
  p_amount_krw integer,
  p_currency text,
  p_provider_verified boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.quantum_continuation_fee_orders%rowtype;
  v_transition public.quantum_continuation_transitions%rowtype;
  v_result jsonb;
  v_pair_blocked boolean := false;
  v_was_verified boolean := false;
  v_replay_order_id uuid;
begin
  if not quantum_private.is_service_role() then raise exception 'service_role_required'; end if;
  if p_order_id is null or p_owner_user_id is null or p_transition_id is null
     or p_purpose is null or p_purpose not in ('next_occurrence', 'friend_request')
     or p_provider is null or p_provider not in ('local_verified_simulator', 'toss_sandbox', 'toss')
     or p_provider_event_id is null
     or pg_catalog.char_length(p_provider_event_id) not between 1 and 180
     or p_provider_transaction_id is null
     or pg_catalog.char_length(p_provider_transaction_id) not between 1 and 180
     or p_amount_krw is null or p_amount_krw <> 1000
     or p_currency is null or p_currency <> 'KRW'
     or p_provider_verified is not true then
    raise exception 'provider_verification_failed';
  end if;

  select fee.* into v_order
  from public.quantum_continuation_fee_orders as fee
  where fee.id = p_order_id;
  if v_order.id is not null and v_order.purpose = 'friend_request'
     and v_order.target_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      quantum_private.friend_pair_lock_key(v_order.owner_user_id, v_order.target_user_id)
    );
    perform quantum_private.expire_stale_friend_pair_requests(
      v_order.owner_user_id, v_order.target_user_id
    );
    select fee.* into v_order
    from public.quantum_continuation_fee_orders as fee
    where fee.id = p_order_id
    for update;
    if v_order.owner_user_id <> p_owner_user_id
       or v_order.transition_id <> p_transition_id
       or v_order.purpose <> p_purpose
       or v_order.provider <> p_provider
       or v_order.amount_krw <> p_amount_krw
       or v_order.currency <> p_currency then
      raise exception 'payment_context_mismatch';
    end if;
    if p_provider = 'local_verified_simulator'
       and v_order.status = 'cancelled'
       and v_order.provider_event_id = p_provider_event_id
       and v_order.provider_transaction_id = p_provider_transaction_id
       and not v_order.provider_verified then
      return pg_catalog.jsonb_build_object(
        'order_id', v_order.id, 'status', v_order.status,
        'replayed', true, 'recovery_required', false, 'no_charge', true
      );
    end if;
    v_was_verified := v_order.provider_verified
      and v_order.status in ('verified', 'recovery_required');
    if not v_was_verified then
      v_pair_blocked := quantum_private.continuation_friend_pair_is_blocked(
        v_order.owner_user_id, v_order.target_user_id
      ) or exists (
        select 1
        from public.quantum_continuation_friend_entitlements as entitlement
        where entitlement.transition_id = v_order.transition_id
          and least(entitlement.requester_user_id, entitlement.target_user_id) = least(
            v_order.owner_user_id, v_order.target_user_id
          )
          and greatest(entitlement.requester_user_id, entitlement.target_user_id) = greatest(
            v_order.owner_user_id, v_order.target_user_id
          )
      );
    end if;
  end if;

  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  if v_pair_blocked and not v_was_verified then
    select fee.id into v_replay_order_id
    from public.quantum_continuation_fee_orders as fee
    where fee.provider = p_provider
      and (
        fee.provider_event_id = p_provider_event_id
        or fee.provider_transaction_id = p_provider_transaction_id
      )
    limit 1;
    if v_replay_order_id is not null and v_replay_order_id <> p_order_id then
      raise exception 'payment_event_replayed';
    end if;
    if v_order.status not in ('prepared', 'verifying', 'cancelled', 'recovery_required') then
      raise exception 'fee_order_not_confirmable';
    end if;
    select transition.* into v_transition
    from public.quantum_continuation_transitions as transition
    where transition.id = p_transition_id
    for update;
    if v_transition.id is null then raise exception 'continuation_transition_not_found'; end if;

    if p_provider = 'local_verified_simulator' then
      update public.quantum_continuation_fee_orders as fee
      set status = 'cancelled',
          provider_event_id = p_provider_event_id,
          provider_transaction_id = p_provider_transaction_id,
          provider_verified = false,
          revision = fee.revision + 1,
          updated_at = pg_catalog.clock_timestamp()
      where fee.id = p_order_id;
      insert into public.quantum_continuation_fee_events (
        fee_order_id, event_type, provider, provider_event_id,
        provider_transaction_id, error_code, idempotency_key
      ) values (
        p_order_id, 'no_charge', p_provider, p_provider_event_id,
        p_provider_transaction_id, 'friend_request_not_allowed',
        'no_charge:friend_pair_blocked:' || p_order_id::text
      ) on conflict (idempotency_key) do nothing;
      return pg_catalog.jsonb_build_object(
        'order_id', p_order_id, 'status', 'cancelled',
        'replayed', false, 'recovery_required', false, 'no_charge', true
      );
    end if;

    update public.quantum_continuation_fee_orders as fee
    set status = 'recovery_required',
        provider_event_id = p_provider_event_id,
        provider_transaction_id = p_provider_transaction_id,
        provider_verified = true,
        revision = fee.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where fee.id = p_order_id;
    insert into public.quantum_continuation_fee_events (
      fee_order_id, event_type, provider, provider_event_id,
      provider_transaction_id, idempotency_key
    ) values (
      p_order_id, 'provider_verified', p_provider, p_provider_event_id,
      p_provider_transaction_id,
      'provider_verified:' || p_provider || ':' || p_provider_event_id
    ) on conflict (idempotency_key) do nothing;
    update public.quantum_continuation_friend_entitlements as entitlement
    set status = 'cancelled', revision = entitlement.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where entitlement.fee_order_id = p_order_id
      and entitlement.status in ('ready', 'queued');
    if p_provider in ('toss_sandbox', 'toss') then
      insert into public.quantum_continuation_fee_recovery_jobs (
        fee_order_id, desired_action, request_key
      ) values (
        p_order_id, 'cancel', 'verified_recovery:' || p_order_id::text
      ) on conflict (fee_order_id) do update
        set desired_action = 'cancel',
            status = case
              when public.quantum_continuation_fee_recovery_jobs.status = 'processing' then 'processing'
              else 'pending'
            end,
            next_attempt_at = pg_catalog.clock_timestamp(),
            lease_id = case
              when public.quantum_continuation_fee_recovery_jobs.status = 'processing'
                then public.quantum_continuation_fee_recovery_jobs.lease_id
              else null
            end,
            lease_expires_at = case
              when public.quantum_continuation_fee_recovery_jobs.status = 'processing'
                then public.quantum_continuation_fee_recovery_jobs.lease_expires_at
              else null
            end,
            revision = case
              when public.quantum_continuation_fee_recovery_jobs.status = 'processing'
                then public.quantum_continuation_fee_recovery_jobs.revision
              else public.quantum_continuation_fee_recovery_jobs.revision + 1
            end,
            updated_at = pg_catalog.clock_timestamp();
    end if;
    select fee.* into v_order
    from public.quantum_continuation_fee_orders as fee
    where fee.id = p_order_id;
    return pg_catalog.jsonb_build_object(
      'order_id', v_order.id, 'status', v_order.status,
      'replayed', false, 'recovery_required', true
    );
  end if;

  v_result := quantum_private.confirm_my_continuation_fee_for_service_impl_20260905180000(
    p_order_id, p_owner_user_id, p_transition_id, p_purpose, p_provider,
    p_provider_event_id, p_provider_transaction_id, p_amount_krw,
    p_currency, p_provider_verified
  );

  return v_result;
end
$$;

revoke all on function public.confirm_my_continuation_fee_for_service(
  uuid, uuid, uuid, text, text, text, text, integer, text, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.confirm_my_continuation_fee_for_service(
  uuid, uuid, uuid, text, text, text, text, integer, text, boolean
) to service_role;

alter function public.deliver_continuation_friend_entitlements_for_service(integer)
  set schema quantum_private;
alter function quantum_private.deliver_continuation_friend_entitlements_for_service(integer)
  rename to deliver_cont_friend_impl_20260905120000;
revoke all on function quantum_private.deliver_cont_friend_impl_20260905120000(integer)
  from public, anon, authenticated, service_role;

create function public.deliver_continuation_friend_entitlements_for_service(p_limit integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate public.quantum_continuation_friend_entitlements%rowtype;
  v_request_id uuid;
  v_attempted integer := 0;
  v_delivered integer := 0;
  v_cancelled integer := 0;
  v_retryable integer := 0;
begin
  if not quantum_private.is_service_role() then raise exception 'service_role_required'; end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'invalid_entitlement_batch';
  end if;

  -- The preserved implementation checks the legacy claim GUC. The public
  -- wrapper has already authenticated auth.role(), so this is transaction-local.
  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

  while v_attempted < p_limit loop
    v_candidate := null;
    select entitlement.* into v_candidate
    from public.quantum_continuation_friend_entitlements as entitlement
    join public.quantum_continuation_fee_orders as fee
      on fee.id = entitlement.fee_order_id
    where entitlement.status = 'ready'
      and fee.purpose = 'friend_request'
      and fee.status = 'verified'
      and fee.provider_verified
    order by entitlement.created_at, entitlement.id
    limit 1;
    exit when v_candidate.id is null;

    if not pg_catalog.pg_try_advisory_xact_lock(
      quantum_private.friend_pair_lock_key(
        v_candidate.requester_user_id, v_candidate.target_user_id
      )
    ) then
      v_retryable := v_retryable + 1;
      exit;
    end if;
    perform quantum_private.expire_stale_friend_pair_requests(
      v_candidate.requester_user_id, v_candidate.target_user_id
    );

    select entitlement.* into v_candidate
    from public.quantum_continuation_friend_entitlements as entitlement
    join public.quantum_continuation_fee_orders as fee
      on fee.id = entitlement.fee_order_id
    where entitlement.id = v_candidate.id
      and entitlement.status = 'ready'
      and fee.purpose = 'friend_request'
      and fee.status = 'verified'
      and fee.provider_verified
    for update of entitlement skip locked;
    if v_candidate.id is null then
      v_retryable := v_retryable + 1;
      exit;
    end if;

    if quantum_private.continuation_friend_pair_is_blocked(
         v_candidate.requester_user_id,
         v_candidate.target_user_id,
         v_candidate.id
       ) or not exists (
         select 1
         from public.quantum_continuation_occurrences as occurrence
         join public.quantum_continuation_occurrence_members as requester
           on requester.occurrence_id = occurrence.id
          and requester.participant_user_id = v_candidate.requester_user_id
         join public.quantum_continuation_occurrence_members as target
           on target.occurrence_id = occurrence.id
          and target.participant_user_id = v_candidate.target_user_id
         join public.quantum_continuation_transitions as transition
           on transition.id = v_candidate.transition_id
         where occurrence.series_id = transition.series_id
           and occurrence.status = 'completed'
           and requester.attendance_status = 'present'
           and target.attendance_status = 'present'
       ) then
      update public.quantum_continuation_friend_entitlements as entitlement
      set status = 'cancelled', revision = entitlement.revision + 1,
          updated_at = pg_catalog.clock_timestamp()
      where entitlement.id = v_candidate.id;
      update public.quantum_continuation_fee_orders as fee
      set status = case
            when fee.provider = 'local_verified_simulator' then 'cancelled'
            else 'recovery_required'
          end,
          provider_verified = case
            when fee.provider = 'local_verified_simulator' then false
            else fee.provider_verified
          end,
          revision = fee.revision + 1,
          updated_at = pg_catalog.clock_timestamp()
      where fee.id = v_candidate.fee_order_id
        and fee.status = 'verified'
        and fee.provider_verified;
      insert into public.quantum_continuation_fee_events (
        fee_order_id, event_type, provider, error_code, idempotency_key
      )
      select fee.id, 'no_charge', fee.provider, 'friend_request_not_allowed',
             'no_charge:friend_pair_blocked:' || fee.id::text
      from public.quantum_continuation_fee_orders as fee
      where fee.id = v_candidate.fee_order_id
        and fee.provider = 'local_verified_simulator'
        and fee.status = 'cancelled'
        and not fee.provider_verified
      on conflict (idempotency_key) do nothing;
      v_cancelled := v_cancelled + 1;
    else
      insert into public.friend_requests (
        sender_user_id, receiver_user_id, receiver_phone, token,
        status, message, expires_at
      ) values (
        v_candidate.requester_user_id, v_candidate.target_user_id, null,
        pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
        'pending', null, pg_catalog.clock_timestamp() + interval '14 days'
      ) returning id into v_request_id;
      insert into public.notifications (user_id, kind, payload)
      values (
        v_candidate.target_user_id, 'friend_request_received',
        pg_catalog.jsonb_build_object('request_id', v_request_id)
      );
      update public.quantum_continuation_friend_entitlements as entitlement
      set status = 'delivered', friend_request_id = v_request_id,
          revision = entitlement.revision + 1,
          updated_at = pg_catalog.clock_timestamp()
      where entitlement.id = v_candidate.id;
      v_delivered := v_delivered + 1;
    end if;
    v_attempted := v_attempted + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'delivered_count', v_delivered,
    'cancelled_count', v_cancelled,
    'retryable_count', v_retryable
  );
end
$$;

revoke all on function public.deliver_continuation_friend_entitlements_for_service(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.deliver_continuation_friend_entitlements_for_service(integer)
  to service_role;

commit;
