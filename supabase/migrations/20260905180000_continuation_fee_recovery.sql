-- Continuation-fee checkout completion and provider recovery.
-- This migration intentionally keeps the 20260905120000 public RPC signatures.

alter table public.quantum_continuation_fee_orders
  add column if not exists provider_order_id text,
  add column if not exists checkout_expires_at timestamptz,
  add column if not exists verification_started_at timestamptz;

update public.quantum_continuation_fee_orders
set provider_order_id = 'ct_' || pg_catalog.replace(id::text, '-', '')
where provider_order_id is null;

update public.quantum_continuation_fee_orders
set checkout_expires_at = created_at + interval '15 minutes'
where checkout_expires_at is null;

alter table public.quantum_continuation_fee_orders
  alter column provider_order_id set default ('ct_' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')),
  alter column provider_order_id set not null,
  alter column checkout_expires_at set default (pg_catalog.clock_timestamp() + interval '15 minutes'),
  alter column checkout_expires_at set not null;

create unique index if not exists quantum_continuation_fee_provider_order_idx
  on public.quantum_continuation_fee_orders(provider, provider_order_id);

drop index if exists public.quantum_continuation_one_fee_per_purpose_idx;
create unique index quantum_continuation_one_fee_per_purpose_idx
  on public.quantum_continuation_fee_orders (
    transition_id, owner_user_id, purpose,
    coalesce(target_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status in ('prepared', 'verifying', 'verified');

create table public.quantum_continuation_fee_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  fee_order_id uuid not null references public.quantum_continuation_fee_orders(id) on delete restrict,
  event_type text not null check (event_type in (
    'prepared', 'verification_started', 'provider_verified', 'recovery_queued', 'cancel_requested',
    'expired', 'no_charge', 'provider_cancelled', 'recovery_retry', 'manual_review'
  )),
  provider text not null check (provider in ('local_verified_simulator', 'toss_sandbox', 'toss')),
  provider_event_id text,
  provider_transaction_id text,
  error_code text,
  idempotency_key text not null unique,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (provider_event_id is null or pg_catalog.char_length(provider_event_id) between 1 and 180),
  check (provider_transaction_id is null or pg_catalog.char_length(provider_transaction_id) between 1 and 180),
  check (error_code is null or pg_catalog.char_length(error_code) between 1 and 80)
);

create unique index quantum_continuation_fee_event_provider_event_idx
  on public.quantum_continuation_fee_events(provider, provider_event_id)
  where provider_event_id is not null;
create unique index quantum_continuation_fee_event_provider_transaction_idx
  on public.quantum_continuation_fee_events(provider, provider_transaction_id)
  where provider_transaction_id is not null;

create table public.quantum_continuation_fee_recovery_jobs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  fee_order_id uuid not null unique references public.quantum_continuation_fee_orders(id) on delete restrict,
  desired_action text not null check (desired_action in ('reconcile', 'cancel')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'manual_review')),
  request_key text not null unique,
  attempts integer not null default 0 check (attempts between 0 and 20),
  provider_not_found_count integer not null default 0 check (provider_not_found_count between 0 and 3),
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  lease_id uuid,
  lease_expires_at timestamptz,
  last_error text,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  check ((status = 'processing') = (lease_id is not null and lease_expires_at is not null)),
  check (last_error is null or pg_catalog.char_length(last_error) between 1 and 80)
);

create index quantum_continuation_fee_recovery_due_idx
  on public.quantum_continuation_fee_recovery_jobs(next_attempt_at, created_at)
  where status = 'pending';

alter table public.quantum_continuation_fee_events enable row level security;
alter table public.quantum_continuation_fee_recovery_jobs enable row level security;
revoke all on table public.quantum_continuation_fee_events from public, anon, authenticated;
revoke all on table public.quantum_continuation_fee_recovery_jobs from public, anon, authenticated;

insert into public.quantum_continuation_fee_events (
  fee_order_id, event_type, provider, idempotency_key, created_at
)
select fee.id, 'prepared', fee.provider,
       'prepared:' || fee.owner_user_id::text || ':' || fee.idempotency_key::text,
       fee.created_at
from public.quantum_continuation_fee_orders as fee
on conflict (idempotency_key) do nothing;

insert into public.quantum_continuation_fee_recovery_jobs (
  fee_order_id, desired_action, request_key
)
select fee.id,
       case when fee.provider_verified then 'cancel' else 'reconcile' end,
       'backfill_recovery:' || fee.id::text
from public.quantum_continuation_fee_orders as fee
where fee.status = 'recovery_required'
  and fee.provider in ('toss_sandbox', 'toss')
on conflict (fee_order_id) do nothing;

insert into public.quantum_continuation_fee_events (
  fee_order_id, event_type, provider, error_code, idempotency_key
)
select fee.id, 'recovery_queued', fee.provider, 'migration_backfill',
       'backfill_recovery:' || fee.id::text
from public.quantum_continuation_fee_orders as fee
where fee.status = 'recovery_required'
  and fee.provider in ('toss_sandbox', 'toss')
on conflict (idempotency_key) do nothing;

create or replace function quantum_private.log_continuation_fee_prepared()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.quantum_continuation_fee_events (
    fee_order_id, event_type, provider, idempotency_key, created_at
  ) values (
    new.id, 'prepared', new.provider,
    'prepared:' || new.owner_user_id::text || ':' || new.idempotency_key::text,
    new.created_at
  );
  return new;
end
$$;

drop trigger if exists trg_log_continuation_fee_prepared
  on public.quantum_continuation_fee_orders;
create trigger trg_log_continuation_fee_prepared
after insert on public.quantum_continuation_fee_orders
for each row execute function quantum_private.log_continuation_fee_prepared();

create or replace function quantum_private.reject_continuation_fee_event_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  raise exception 'continuation_fee_event_immutable';
end
$$;

drop trigger if exists trg_protect_continuation_fee_events
  on public.quantum_continuation_fee_events;
create trigger trg_protect_continuation_fee_events
before update or delete on public.quantum_continuation_fee_events
for each row execute function quantum_private.reject_continuation_fee_event_mutation();

revoke all on function quantum_private.log_continuation_fee_prepared()
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.reject_continuation_fee_event_mutation()
  from public, anon, authenticated, service_role;

create or replace function quantum_private.queue_continuation_fee_recovery_on_status()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_action text := case when new.provider_verified then 'cancel' else 'reconcile' end;
  v_request_key text := 'status_recovery:' || new.id::text || ':' || new.revision::text;
begin
  if new.status = 'recovery_required' and old.status <> 'recovery_required'
     and new.provider in ('toss_sandbox', 'toss') then
    insert into public.quantum_continuation_fee_recovery_jobs (
      fee_order_id, desired_action, request_key
    ) values (
      new.id, v_action, v_request_key
    ) on conflict (fee_order_id) do update
      set desired_action = case
            when excluded.desired_action = 'cancel' then 'cancel'
            else public.quantum_continuation_fee_recovery_jobs.desired_action
          end,
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
    insert into public.quantum_continuation_fee_events (
      fee_order_id, event_type, provider, error_code, idempotency_key
    ) values (
      new.id, 'recovery_queued', new.provider,
      case when new.provider_verified then 'verified_order_invalidated' else 'verification_uncertain' end,
      v_request_key
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists trg_queue_continuation_fee_recovery
  on public.quantum_continuation_fee_orders;
create trigger trg_queue_continuation_fee_recovery
after update of status on public.quantum_continuation_fee_orders
for each row execute function quantum_private.queue_continuation_fee_recovery_on_status();

revoke all on function quantum_private.queue_continuation_fee_recovery_on_status()
  from public, anon, authenticated, service_role;

create or replace function public.prepare_my_continuation_fee(
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
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_transition public.quantum_continuation_transitions%rowtype;
  v_existing public.quantum_continuation_fee_orders%rowtype;
  v_active public.quantum_continuation_fee_orders%rowtype;
  v_order public.quantum_continuation_fee_orders%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_transition_id is null or p_purpose not in ('next_occurrence', 'friend_request')
     or p_provider not in ('local_verified_simulator', 'toss_sandbox', 'toss')
     or p_idempotency_key is null
     or ((p_purpose = 'friend_request') <> (p_target_user_id is not null)) then
    raise exception 'invalid_continuation_fee';
  end if;
  if p_provider = 'toss' then raise exception 'live_payment_disabled'; end if;
  select transition.* into v_transition
  from public.quantum_continuation_transitions as transition
  where transition.id = p_transition_id
  for update;
  if v_transition.id is null or not exists (
    select 1 from public.quantum_continuation_transition_members as member
    where member.transition_id = p_transition_id and member.participant_user_id = v_actor
  ) then raise exception 'continuation_transition_not_found'; end if;

  if p_purpose = 'next_occurrence' and exists (
    select 1 from public.quantum_continuation_transition_members as member
    where member.transition_id = p_transition_id
      and member.participant_user_id = v_actor
      and member.fee_waived
  ) then raise exception 'continuation_fee_waived'; end if;

  select fee.* into v_existing
  from public.quantum_continuation_fee_orders as fee
  where fee.owner_user_id = v_actor and fee.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.transition_id <> p_transition_id or v_existing.purpose <> p_purpose
       or v_existing.target_user_id is distinct from p_target_user_id
       or v_existing.provider <> p_provider then raise exception 'idempotency_key_reused'; end if;
    if v_existing.status = 'prepared' and v_existing.checkout_expires_at <= v_now then
      update public.quantum_continuation_fee_orders
      set status = case
            when v_existing.provider = 'local_verified_simulator' then 'cancelled'
            else 'recovery_required'
          end,
          revision = revision + 1, updated_at = v_now
      where id = v_existing.id;
      insert into public.quantum_continuation_fee_events (
        fee_order_id, event_type, provider, idempotency_key
      ) values (
        v_existing.id, 'expired', v_existing.provider, 'expired:' || v_existing.id::text
      ) on conflict (idempotency_key) do nothing;
      select fee.* into v_order
      from public.quantum_continuation_fee_orders as fee
      where fee.id = v_existing.id;
    else
      v_order := v_existing;
    end if;
  else
    if p_purpose = 'next_occurrence' then
      if v_transition.status not in ('payment_pending', 'ready_to_schedule')
         or pg_catalog.clock_timestamp() >= v_transition.closes_at
         or not exists (
           select 1 from public.quantum_continuation_choices as choice
           where choice.transition_id = p_transition_id
             and choice.participant_user_id = v_actor and choice.choice = 'continue'
         ) then raise exception 'continuation_fee_not_preparable'; end if;
    else
      if p_target_user_id = v_actor or not exists (
        select 1
        from public.quantum_continuation_occurrences as occurrence
        join public.quantum_continuation_occurrence_members as requester
          on requester.occurrence_id = occurrence.id and requester.participant_user_id = v_actor
        join public.quantum_continuation_occurrence_members as target
          on target.occurrence_id = occurrence.id and target.participant_user_id = p_target_user_id
        where occurrence.series_id = v_transition.series_id
          and occurrence.status = 'completed'
          and requester.attendance_status = 'present'
          and target.attendance_status = 'present'
      ) then raise exception 'friend_entitlement_not_eligible'; end if;
    end if;

    select fee.* into v_active
    from public.quantum_continuation_fee_orders as fee
    where fee.transition_id = p_transition_id
      and fee.owner_user_id = v_actor
      and fee.purpose = p_purpose
      and fee.target_user_id is not distinct from p_target_user_id
      and fee.provider = p_provider
      and fee.status = 'prepared'
    for update;
    if v_active.id is not null then
      if v_active.checkout_expires_at > v_now then
        v_order := v_active;
      else
        update public.quantum_continuation_fee_orders
        set status = case
              when v_active.provider = 'local_verified_simulator' then 'cancelled'
              else 'recovery_required'
            end,
            revision = revision + 1, updated_at = v_now
        where id = v_active.id;
        insert into public.quantum_continuation_fee_events (
          fee_order_id, event_type, provider, idempotency_key
        ) values (
          v_active.id, 'expired', v_active.provider, 'expired:' || v_active.id::text
        ) on conflict (idempotency_key) do nothing;
      end if;
    end if;
    if v_order.id is null then
      insert into public.quantum_continuation_fee_orders (
        transition_id, owner_user_id, target_user_id, purpose, provider,
        notice_version, idempotency_key
      ) values (
        p_transition_id, v_actor, p_target_user_id, p_purpose, p_provider,
        '2026-09-05', p_idempotency_key
      ) returning * into v_order;
    end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'order_id', v_order.id,
    'transition_id', v_order.transition_id,
    'purpose', v_order.purpose,
    'target_user_id', v_order.target_user_id,
    'provider', v_order.provider,
    'amount_krw', v_order.amount_krw,
    'currency', v_order.currency,
    'status', v_order.status,
    'notice_version', v_order.notice_version,
    'revision', v_order.revision
  );
end
$$;

revoke all on function public.prepare_my_continuation_fee(uuid, text, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_my_continuation_fee(uuid, text, uuid, text, uuid)
  to authenticated;

create or replace function public.get_my_continuation_fee_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_fee public.quantum_continuation_fee_orders%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_order_id is null then raise exception 'invalid_fee_order'; end if;
  select fee.* into v_fee
  from public.quantum_continuation_fee_orders as fee
  where fee.id = p_order_id and fee.owner_user_id = v_actor;
  if v_fee.id is null then raise exception 'continuation_fee_not_found'; end if;
  return pg_catalog.jsonb_build_object(
    'order_id', v_fee.id,
    'owner_user_id', v_fee.owner_user_id,
    'transition_id', v_fee.transition_id,
    'purpose', v_fee.purpose,
    'provider', v_fee.provider,
    'provider_order_id', v_fee.provider_order_id,
    'amount_krw', v_fee.amount_krw,
    'currency', v_fee.currency,
    'status', v_fee.status,
    'provider_verified', v_fee.provider_verified,
    'checkout_expires_at', v_fee.checkout_expires_at,
    'notice_version', v_fee.notice_version,
    'revision', v_fee.revision
  );
end
$$;

revoke all on function public.get_my_continuation_fee_order(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_continuation_fee_order(uuid)
  to authenticated;

create or replace function public.begin_continuation_fee_verification_for_service(
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
  v_role text := pg_catalog.current_setting('request.jwt.claim.role', true);
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_order public.quantum_continuation_fee_orders%rowtype;
begin
  if v_role <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_order_id is null or p_owner_user_id is null
     or p_provider not in ('toss_sandbox', 'toss')
     or p_provider_order_id is null then
    raise exception 'invalid_fee_verification';
  end if;
  select fee.* into v_order
  from public.quantum_continuation_fee_orders as fee
  where fee.id = p_order_id
  for update;
  if v_order.id is null then raise exception 'continuation_fee_order_not_found'; end if;
  if v_order.owner_user_id <> p_owner_user_id or v_order.provider <> p_provider
     or v_order.provider_order_id <> p_provider_order_id then
    raise exception 'payment_context_mismatch';
  end if;
  if v_order.status in ('prepared', 'verifying') and v_order.checkout_expires_at <= v_now then
    update public.quantum_continuation_fee_orders
    set status = 'recovery_required', revision = revision + 1,
        updated_at = v_now
    where id = p_order_id;
    insert into public.quantum_continuation_fee_events (
      fee_order_id, event_type, provider, idempotency_key
    ) values (
      p_order_id, 'expired', v_order.provider, 'expired:' || p_order_id::text
    ) on conflict (idempotency_key) do nothing;
  elsif v_order.status = 'prepared' then
    update public.quantum_continuation_fee_orders
    set status = 'verifying', verification_started_at = v_now,
        revision = revision + 1, updated_at = v_now
    where id = p_order_id;
    insert into public.quantum_continuation_fee_events (
      fee_order_id, event_type, provider, idempotency_key
    ) values (
      p_order_id, 'verification_started', v_order.provider,
      'verification_started:' || p_order_id::text
    ) on conflict (idempotency_key) do nothing;
  elsif v_order.status not in ('verifying', 'verified', 'cancelled', 'recovery_required') then
    raise exception 'fee_order_not_confirmable';
  end if;
  select fee.* into v_order
  from public.quantum_continuation_fee_orders as fee
  where fee.id = p_order_id;
  return pg_catalog.jsonb_build_object(
    'order_id', v_order.id, 'status', v_order.status,
    'revision', v_order.revision, 'provider_verified', v_order.provider_verified
  );
end
$$;

revoke all on function public.begin_continuation_fee_verification_for_service(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_continuation_fee_verification_for_service(uuid, uuid, text, text)
  to service_role;

create or replace function public.queue_continuation_fee_recovery_for_service(
  p_order_id uuid,
  p_reason text,
  p_desired_action text,
  p_request_key text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := pg_catalog.current_setting('request.jwt.claim.role', true);
  v_order public.quantum_continuation_fee_orders%rowtype;
  v_job_id uuid;
begin
  if v_role <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_order_id is null or p_desired_action not in ('reconcile', 'cancel')
     or p_reason is null or pg_catalog.char_length(p_reason) not between 1 and 80
     or p_request_key is null or pg_catalog.char_length(p_request_key) not between 8 and 180 then
    raise exception 'invalid_recovery_request';
  end if;
  select fee.* into v_order
  from public.quantum_continuation_fee_orders as fee
  where fee.id = p_order_id
  for update;
  if v_order.id is null then raise exception 'continuation_fee_order_not_found'; end if;
  if v_order.provider not in ('toss_sandbox', 'toss') then raise exception 'recovery_provider_not_supported'; end if;
  if v_order.status <> 'cancelled' then
    update public.quantum_continuation_fee_orders
    set status = 'recovery_required', revision = revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where id = p_order_id and status <> 'verified';
  end if;
  insert into public.quantum_continuation_fee_recovery_jobs (
    fee_order_id, desired_action, status, request_key, next_attempt_at
  ) values (
    p_order_id, p_desired_action, 'pending', p_request_key, pg_catalog.clock_timestamp()
  )
  on conflict (fee_order_id) do update
    set desired_action = case
          when public.quantum_continuation_fee_recovery_jobs.status = 'processing'
            then public.quantum_continuation_fee_recovery_jobs.desired_action
          when public.quantum_continuation_fee_recovery_jobs.desired_action = 'cancel' then 'cancel'
          else excluded.desired_action
        end,
        status = case
          when public.quantum_continuation_fee_recovery_jobs.status = 'processing' then 'processing'
          else 'pending'
        end,
        next_attempt_at = case
          when public.quantum_continuation_fee_recovery_jobs.status = 'processing'
            then public.quantum_continuation_fee_recovery_jobs.next_attempt_at
          else pg_catalog.clock_timestamp()
        end,
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
        last_error = case
          when public.quantum_continuation_fee_recovery_jobs.status = 'processing'
            then public.quantum_continuation_fee_recovery_jobs.last_error
          else p_reason
        end,
        revision = case
          when public.quantum_continuation_fee_recovery_jobs.status = 'processing'
            then public.quantum_continuation_fee_recovery_jobs.revision
          else public.quantum_continuation_fee_recovery_jobs.revision + 1
        end,
        updated_at = pg_catalog.clock_timestamp()
  returning id into v_job_id;
  insert into public.quantum_continuation_fee_events (
    fee_order_id, event_type, provider, error_code, idempotency_key
  ) values (
    p_order_id, 'recovery_queued', v_order.provider, p_reason, p_request_key
  ) on conflict (idempotency_key) do nothing;
  return v_job_id;
end
$$;

revoke all on function public.queue_continuation_fee_recovery_for_service(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.queue_continuation_fee_recovery_for_service(uuid, text, text, text)
  to service_role;

create or replace function public.cancel_my_continuation_fee(
  p_order_id uuid,
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
  v_order public.quantum_continuation_fee_orders%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_order_id is null or p_idempotency_key is null then raise exception 'invalid_fee_cancellation'; end if;
  select fee.* into v_order
  from public.quantum_continuation_fee_orders as fee
  where fee.id = p_order_id and fee.owner_user_id = v_actor
  for update;
  if v_order.id is null then raise exception 'continuation_fee_not_found'; end if;
  if v_order.status = 'prepared' then
    update public.quantum_continuation_fee_orders
    set status = 'cancelled', revision = revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where id = p_order_id;
    insert into public.quantum_continuation_fee_events (
      fee_order_id, event_type, provider, idempotency_key
    ) values (
      p_order_id, 'cancel_requested', v_order.provider,
      'owner_cancel:' || p_idempotency_key::text
    ) on conflict (idempotency_key) do nothing;
    if v_order.provider in ('toss_sandbox', 'toss') then
      insert into public.quantum_continuation_fee_recovery_jobs (
        fee_order_id, desired_action, request_key
      ) values (
        p_order_id, 'cancel', 'owner_cancel:' || p_idempotency_key::text
      ) on conflict (fee_order_id) do update
        set desired_action = 'cancel', status = 'pending', next_attempt_at = pg_catalog.clock_timestamp(),
            lease_id = null, lease_expires_at = null, last_error = null,
            revision = public.quantum_continuation_fee_recovery_jobs.revision + 1,
            updated_at = pg_catalog.clock_timestamp();
    end if;
  elsif v_order.status not in ('cancelled', 'verified', 'recovery_required') then
    raise exception 'fee_order_not_cancellable';
  end if;
  select fee.* into v_order from public.quantum_continuation_fee_orders as fee where fee.id = p_order_id;
  return pg_catalog.jsonb_build_object(
    'order_id', v_order.id, 'status', v_order.status, 'revision', v_order.revision
  );
end
$$;

revoke all on function public.cancel_my_continuation_fee(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_my_continuation_fee(uuid, uuid)
  to authenticated;

create or replace function public.service_expire_continuation_fee_orders(
  p_now timestamptz,
  p_limit integer default 25
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := pg_catalog.current_setting('request.jwt.claim.role', true);
  v_limit integer := least(greatest(p_limit, 1), 25);
  v_order public.quantum_continuation_fee_orders%rowtype;
  v_count integer := 0;
begin
  if v_role <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_now is null or p_limit is null then raise exception 'invalid_expiry_request'; end if;
  for v_order in
    select fee.*
    from public.quantum_continuation_fee_orders as fee
    where fee.provider in ('toss_sandbox', 'toss')
      and fee.status in ('prepared', 'verifying')
      and fee.checkout_expires_at <= p_now
    order by fee.checkout_expires_at, fee.id
    for update skip locked
    limit v_limit
  loop
    update public.quantum_continuation_fee_orders
    set status = 'recovery_required',
        revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_order.id;
    insert into public.quantum_continuation_fee_events (
      fee_order_id, event_type, provider, idempotency_key
    ) values (
      v_order.id, 'expired', v_order.provider, 'expired:' || v_order.id::text
    ) on conflict (idempotency_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

revoke all on function public.service_expire_continuation_fee_orders(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_expire_continuation_fee_orders(timestamptz, integer)
  to service_role;

create or replace function public.service_claim_continuation_fee_recoveries(
  p_lease_id uuid,
  p_limit integer default 5,
  p_lease_seconds integer default 120
)
returns table (
  job_id uuid,
  fee_order_id uuid,
  owner_user_id uuid,
  transition_id uuid,
  purpose text,
  provider text,
  provider_order_id text,
  amount_krw integer,
  currency text,
  order_status text,
  provider_verified boolean,
  desired_action text,
  attempts integer,
  provider_not_found_count integer,
  job_revision integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := pg_catalog.current_setting('request.jwt.claim.role', true);
  v_limit integer := least(greatest(p_limit, 1), 25);
  v_lease_seconds integer := least(greatest(p_lease_seconds, 30), 300);
begin
  if v_role <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_lease_id is null or p_limit is null or p_lease_seconds is null then raise exception 'invalid_recovery_claim'; end if;
  update public.quantum_continuation_fee_recovery_jobs as job
  set status = case when job.attempts >= 20 then 'manual_review' else 'pending' end,
      lease_id = null, lease_expires_at = null,
      next_attempt_at = pg_catalog.clock_timestamp(), last_error = 'lease_expired',
      revision = job.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where job.status = 'processing' and job.lease_expires_at <= pg_catalog.clock_timestamp();
  return query
  with selected as (
    select job.id
    from public.quantum_continuation_fee_recovery_jobs as job
    where job.status = 'pending' and job.attempts < 20
      and job.next_attempt_at <= pg_catalog.clock_timestamp()
    order by job.next_attempt_at, job.created_at, job.id
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.quantum_continuation_fee_recovery_jobs as job
    set status = 'processing', lease_id = p_lease_id,
        lease_expires_at = pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => v_lease_seconds),
        attempts = job.attempts + 1, revision = job.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    from selected
    where job.id = selected.id
    returning job.*
  )
  select claimed.id, fee.id, fee.owner_user_id, fee.transition_id, fee.purpose,
         fee.provider, fee.provider_order_id, fee.amount_krw, fee.currency,
         fee.status, fee.provider_verified, claimed.desired_action,
         claimed.attempts, claimed.provider_not_found_count, claimed.revision
  from claimed
  join public.quantum_continuation_fee_orders as fee on fee.id = claimed.fee_order_id;
end
$$;

revoke all on function public.service_claim_continuation_fee_recoveries(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_claim_continuation_fee_recoveries(uuid, integer, integer)
  to service_role;

create or replace function public.service_release_continuation_fee_recovery(
  p_job_id uuid,
  p_lease_id uuid,
  p_expected_revision integer,
  p_error_code text,
  p_retry_after_seconds integer,
  p_provider_not_found boolean default false
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := pg_catalog.current_setting('request.jwt.claim.role', true);
  v_revision integer;
  v_order_id uuid;
  v_provider text;
  v_terminal boolean;
begin
  if v_role <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_job_id is null or p_lease_id is null or p_expected_revision is null
     or p_error_code is null or pg_catalog.char_length(p_error_code) not between 1 and 80
     or p_retry_after_seconds not between 10 and 86400 then
    raise exception 'invalid_recovery_release';
  end if;
  update public.quantum_continuation_fee_recovery_jobs as job
  set status = case when job.attempts >= 20 then 'manual_review' else 'pending' end,
      lease_id = null, lease_expires_at = null,
      next_attempt_at = pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_retry_after_seconds),
      provider_not_found_count = case when p_provider_not_found
        then least(job.provider_not_found_count + 1, 3)
        else job.provider_not_found_count end,
      last_error = p_error_code, revision = job.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where job.id = p_job_id and job.status = 'processing'
    and job.lease_id = p_lease_id and job.revision = p_expected_revision
  returning job.revision, job.fee_order_id, job.status = 'manual_review'
  into v_revision, v_order_id, v_terminal;
  if v_revision is null then raise exception 'stale_recovery_lease'; end if;
  select fee.provider into v_provider from public.quantum_continuation_fee_orders as fee where fee.id = v_order_id;
  insert into public.quantum_continuation_fee_events (
    fee_order_id, event_type, provider, error_code, idempotency_key
  ) values (
    v_order_id, case when v_terminal then 'manual_review' else 'recovery_retry' end,
    v_provider, p_error_code,
    'retry:' || p_job_id::text || ':' || v_revision::text
  );
  return v_revision;
end
$$;

revoke all on function public.service_release_continuation_fee_recovery(uuid, uuid, integer, text, integer, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.service_release_continuation_fee_recovery(uuid, uuid, integer, text, integer, boolean)
  to service_role;

create or replace function public.service_finalize_continuation_fee_recovery(
  p_job_id uuid,
  p_lease_id uuid,
  p_expected_revision integer,
  p_outcome text,
  p_error_code text,
  p_provider_event_id text,
  p_provider_transaction_id text,
  p_idempotency_key text
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := pg_catalog.current_setting('request.jwt.claim.role', true);
  v_job public.quantum_continuation_fee_recovery_jobs%rowtype;
  v_order public.quantum_continuation_fee_orders%rowtype;
  v_revision integer;
  v_event_type text;
begin
  if v_role <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_job_id is null or p_lease_id is null or p_expected_revision is null
     or p_outcome not in ('verified', 'no_charge', 'cancelled', 'manual_review')
     or p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 8 and 180
     or (p_error_code is not null and pg_catalog.char_length(p_error_code) not between 1 and 80) then
    raise exception 'invalid_recovery_finalization';
  end if;
  select job.* into v_job
  from public.quantum_continuation_fee_recovery_jobs as job
  where job.id = p_job_id
  for update;
  if v_job.id is null or v_job.status <> 'processing' or v_job.lease_id <> p_lease_id
     or v_job.revision <> p_expected_revision then raise exception 'stale_recovery_lease'; end if;
  select fee.* into v_order
  from public.quantum_continuation_fee_orders as fee
  where fee.id = v_job.fee_order_id
  for update;
  if p_outcome = 'verified' and v_order.status <> 'verified' then
    raise exception 'payment_verification_missing';
  elsif p_outcome in ('no_charge', 'cancelled') then
    update public.quantum_continuation_fee_orders
    set status = 'cancelled', provider_verified = false,
        revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_order.id;
    update public.quantum_continuation_friend_entitlements
    set status = 'cancelled', revision = revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where fee_order_id = v_order.id and status in ('ready', 'queued');
  elsif p_outcome = 'manual_review' then
    update public.quantum_continuation_fee_orders
    set status = 'recovery_required', revision = revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where id = v_order.id;
  end if;
  update public.quantum_continuation_fee_recovery_jobs as job
  set status = case when p_outcome = 'manual_review' then 'manual_review' else 'completed' end,
      lease_id = null, lease_expires_at = null, last_error = p_error_code,
      completed_at = case when p_outcome = 'manual_review' then null else pg_catalog.clock_timestamp() end,
      revision = job.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where job.id = p_job_id
  returning job.revision into v_revision;
  v_event_type := case p_outcome
    when 'no_charge' then 'no_charge'
    when 'cancelled' then 'provider_cancelled'
    when 'manual_review' then 'manual_review'
    else 'provider_verified'
  end;
  insert into public.quantum_continuation_fee_events (
    fee_order_id, event_type, provider, provider_event_id,
    provider_transaction_id, error_code, idempotency_key
  ) values (
    v_order.id, v_event_type, v_order.provider, p_provider_event_id,
    p_provider_transaction_id, p_error_code, p_idempotency_key
  ) on conflict (idempotency_key) do nothing;
  return v_revision;
end
$$;

revoke all on function public.service_finalize_continuation_fee_recovery(uuid, uuid, integer, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_finalize_continuation_fee_recovery(uuid, uuid, integer, text, text, text, text, text)
  to service_role;

create or replace function public.confirm_my_continuation_fee_for_service(
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
  v_role text := pg_catalog.current_setting('request.jwt.claim.role', true);
  v_order public.quantum_continuation_fee_orders%rowtype;
  v_transition public.quantum_continuation_transitions%rowtype;
  v_replay_order_id uuid;
  v_all_verified boolean;
  v_recovery_required boolean;
begin
  if v_role <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_order_id is null or p_owner_user_id is null or p_transition_id is null
     or p_purpose not in ('next_occurrence', 'friend_request')
     or p_provider not in ('local_verified_simulator', 'toss_sandbox', 'toss')
     or p_provider_event_id is null or pg_catalog.char_length(p_provider_event_id) not between 1 and 180
     or p_provider_transaction_id is null or pg_catalog.char_length(p_provider_transaction_id) not between 1 and 180
     or p_amount_krw <> 1000 or p_currency <> 'KRW' or p_provider_verified is not true then
    raise exception 'provider_verification_failed';
  end if;
  select fee.id into v_replay_order_id
  from public.quantum_continuation_fee_orders as fee
  where fee.provider = p_provider
    and (fee.provider_event_id = p_provider_event_id or fee.provider_transaction_id = p_provider_transaction_id)
  limit 1;
  if v_replay_order_id is not null and v_replay_order_id <> p_order_id then
    raise exception 'payment_event_replayed';
  end if;
  select fee.* into v_order
  from public.quantum_continuation_fee_orders as fee
  where fee.id = p_order_id
  for update;
  if v_order.id is null then raise exception 'continuation_fee_order_not_found'; end if;
  if v_order.owner_user_id <> p_owner_user_id or v_order.transition_id <> p_transition_id
     or v_order.purpose <> p_purpose or v_order.provider <> p_provider
     or v_order.amount_krw <> p_amount_krw or v_order.currency <> p_currency then
    raise exception 'payment_context_mismatch';
  end if;
  if v_order.provider_event_id = p_provider_event_id
     and v_order.provider_transaction_id = p_provider_transaction_id
     and v_order.provider_verified and v_order.status in ('verified', 'recovery_required') then
    return pg_catalog.jsonb_build_object(
      'order_id', v_order.id, 'status', v_order.status,
      'replayed', true, 'recovery_required', v_order.status = 'recovery_required'
    );
  end if;
  if v_order.status not in ('prepared', 'verifying', 'cancelled', 'recovery_required') then
    raise exception 'fee_order_not_confirmable';
  end if;
  select transition.* into v_transition
  from public.quantum_continuation_transitions as transition
  where transition.id = p_transition_id
  for update;
  if v_transition.id is null then raise exception 'continuation_transition_not_found'; end if;
  v_recovery_required := v_order.status = 'cancelled'
    or (v_order.status = 'recovery_required' and v_order.provider_verified)
    or (p_provider in ('toss_sandbox', 'toss')
      and pg_catalog.clock_timestamp() >= v_order.checkout_expires_at)
    or (p_purpose = 'next_occurrence' and (
      v_transition.status in ('closed', 'review_required')
      or pg_catalog.clock_timestamp() >= v_transition.closes_at
    ));
  update public.quantum_continuation_fee_orders
  set status = case when v_recovery_required then 'recovery_required' else 'verified' end,
      provider_event_id = p_provider_event_id,
      provider_transaction_id = p_provider_transaction_id,
      provider_verified = true, revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_order_id;
  insert into public.quantum_continuation_fee_events (
    fee_order_id, event_type, provider, provider_event_id,
    provider_transaction_id, idempotency_key
  ) values (
    p_order_id, 'provider_verified', p_provider, p_provider_event_id,
    p_provider_transaction_id, 'provider_verified:' || p_provider || ':' || p_provider_event_id
  ) on conflict (idempotency_key) do nothing;
  if v_recovery_required and p_provider in ('toss_sandbox', 'toss') then
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
  elsif p_purpose = 'friend_request' then
    insert into public.quantum_continuation_friend_entitlements (
      fee_order_id, requester_user_id, target_user_id, transition_id
    ) values (
      p_order_id, p_owner_user_id, v_order.target_user_id, p_transition_id
    ) on conflict (fee_order_id) do nothing;
  elsif p_purpose = 'next_occurrence' then
    select not exists (
      select 1
      from public.quantum_continuation_transition_members as member
      where member.transition_id = p_transition_id
        and not member.fee_waived
        and not exists (
          select 1 from public.quantum_continuation_fee_orders as fee
          where fee.transition_id = p_transition_id
            and fee.owner_user_id = member.participant_user_id
            and fee.purpose = 'next_occurrence'
            and fee.status = 'verified' and fee.provider_verified
        )
    ) into v_all_verified;
    if v_all_verified then
      update public.quantum_continuation_transitions
      set status = 'ready_to_schedule', revision = revision + 1,
          updated_at = pg_catalog.clock_timestamp()
      where id = p_transition_id and status = 'payment_pending';
      insert into public.quantum_continuation_notification_outbox (
        recipient_user_id, transition_id, occurrence_id, kind, deep_link, dedupe_key
      )
      select member.participant_user_id, p_transition_id, null, 'transition_ready',
             '/match/series/' || v_transition.series_id::text,
             'transition_ready:' || p_transition_id::text || ':' || member.participant_user_id::text
      from public.quantum_continuation_transition_members as member
      where member.transition_id = p_transition_id
      on conflict (dedupe_key) do nothing;
    end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'order_id', p_order_id,
    'status', case when v_recovery_required then 'recovery_required' else 'verified' end,
    'replayed', false, 'recovery_required', v_recovery_required
  );
end
$$;

revoke all on function public.confirm_my_continuation_fee_for_service(uuid, uuid, uuid, text, text, text, text, integer, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_my_continuation_fee_for_service(uuid, uuid, uuid, text, text, text, text, integer, text, boolean)
  to service_role;
