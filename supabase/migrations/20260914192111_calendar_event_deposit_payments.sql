-- Dedicated event/person receipts. No seeds, provider calls, remote activation or balance reuse.
begin;
create table quantum_private.calendar_payment_orders (
  order_id text primary key check(order_id ~ '^calendar_[0-9a-f]{32}$'),
  intent_id uuid not null unique,
  audience text not null check(audience in ('single','couple')),
  event_id uuid not null,
  application_id uuid not null,
  user_id uuid references public.users(id) on delete set null,
  provider_mode text not null check(provider_mode in ('test','live')),
  amount_krw integer not null default 10000 check(amount_krw=10000),
  state text not null default 'prepared' check(state in ('prepared','confirming','reconciliation_required','confirmed','aborted')),
  payment_key text,
  deposit_state text not null default 'unpaid' check(deposit_state in ('unpaid','held','refund_due','refunded')),
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(provider_mode,payment_key),
  check(order_id='calendar_'||replace(intent_id::text,'-','')),
  check(deposit_state='unpaid' or (payment_key is not null and state='confirmed' and paid_at is not null))
);
create unique index calendar_one_open_order_per_person on quantum_private.calendar_payment_orders(audience,event_id,application_id,user_id)
  where state<>'aborted' and deposit_state in ('unpaid','held');
create table quantum_private.calendar_refund_outbox (
  order_id text primary key references quantum_private.calendar_payment_orders(order_id) on delete restrict,
  request_id uuid unique,
  state text not null default 'available' check(state in ('available','requested','processing','failed','completed')),
  requested_at timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  transaction_key text unique,
  completed_at timestamptz,
  check((request_id is null)=(requested_at is null)),
  check(state<>'completed' or (transaction_key is not null and completed_at is not null))
);
alter table quantum_private.calendar_payment_orders enable row level security;
alter table quantum_private.calendar_refund_outbox enable row level security;
revoke all on quantum_private.calendar_payment_orders,quantum_private.calendar_refund_outbox from public,anon,authenticated,service_role;

create function quantum_private.calendar_has_held_deposit(p_audience text,p_event_id uuid,p_entry_id uuid,p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from quantum_private.calendar_payment_orders o where o.audience=p_audience and o.event_id=p_event_id
    and o.application_id=p_entry_id and o.user_id=p_owner and o.amount_krw=10000 and o.state='confirmed'
    and o.deposit_state='held' and o.payment_key is not null and o.paid_at is not null
    and not exists(select 1 from quantum_private.calendar_refund_outbox r where r.order_id=o.order_id))
$$;
-- Replaced by the separately reviewed dated four-person allocator migration.
create function quantum_private.try_assign_calendar_couple(p_party_id uuid) returns void language sql set search_path='' as $$select$$;
create or replace function quantum_private.calendar_checkout_available() returns boolean language sql stable set search_path='' as $$select true$$;
revoke all on function quantum_private.calendar_has_held_deposit(text,uuid,uuid,uuid),quantum_private.try_assign_calendar_couple(uuid) from public,anon,authenticated,service_role;

create function quantum_private.calendar_payment_service() returns void language plpgsql set search_path='' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') is distinct from 'service_role'
    then raise exception 'forbidden'; end if;
end $$;

-- Lock order agrees with preparation/cancellation; the saved participants determine locks.
-- The context remains readable for late approval/refund recovery after cancellation.
create function quantum_private.calendar_payment_lock(p_actor uuid,p_audience text,p_event_id uuid,p_application_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.quantum_couple_parties; s quantum_private.calendar_single_applications;
  e quantum_private.couple_calendar_events; w public.quantum_weekly_activity_windows;
  member_id uuid; members uuid[]; eligible boolean; deadline timestamptz; final boolean;
begin
  if p_actor is null or p_event_id is null or p_application_id is null then raise exception 'calendar_invalid_input'; end if;
  if p_audience='couple' then
    select * into p from public.quantum_couple_parties where id=p_application_id and calendar_event_id=p_event_id
      and p_actor in (leader_user_id,partner_user_id);
    if not found then raise exception 'calendar_application_not_found'; end if;
    perform pg_advisory_xact_lock(hashtextextended('calendar-couple-event:'||p_event_id::text,0));
    members:=array[p.leader_user_id,p.partner_user_id];
  elsif p_audience='single' then
    select * into s from quantum_private.calendar_single_applications where id=p_application_id and user_id=p_actor and window_id=p_event_id;
    if not found then raise exception 'calendar_application_not_found'; end if;
    members:=array[p_actor];
  else raise exception 'calendar_invalid_input'; end if;
  for member_id in select u from unnest(members) u order by u loop
    perform pg_advisory_xact_lock(hashtextextended(member_id::text,71));
    perform pg_advisory_xact_lock(hashtextextended('relationship-state:'||member_id::text,0));
  end loop;
  if p_audience='couple' then
    select * into e from quantum_private.couple_calendar_events where id=p_event_id for update;
    select * into p from public.quantum_couple_parties where id=p_application_id for update;
    eligible:=e.status='recruiting' and e.application_closes_at>clock_timestamp()
      and p.status in ('payment_pending','calendar_ready') and p.accepted_at is not null and p.calendar_consent_at is not null
      and not quantum_private.tonight_invite_pair_is_blocked(p.leader_user_id,p.partner_user_id)
      and not exists(select 1 from unnest(members) m where not exists(select 1 from quantum_private.relationship_states r where r.user_id=m and r.status='in_relationship'))
      and not exists(select 1 from unnest(members) m where not exists(
        select 1 from quantum_private.get_member_department_identity(m) identity where identity.school_scope_key=e.school_scope_key));
    deadline:=least(e.application_closes_at,p.expires_at);
    final:=p.status in ('calendar_ready','calendar_matched','matched','completed');
  else
    select * into w from public.quantum_weekly_activity_windows where id=p_event_id;
    perform pg_advisory_xact_lock(hashtextextended('weekly:'||p_actor::text||':'||w.week_key::text,0));
    select * into w from public.quantum_weekly_activity_windows where id=p_event_id for update;
    select * into s from quantum_private.calendar_single_applications where id=p_application_id for update;
    eligible:=w.status='recruiting' and w.application_closes_at>clock_timestamp() and w.starts_at>clock_timestamp()
      and s.status in ('payment_pending','active') and s.consent_at is not null
      and public.is_profile_matching_ready(p_actor)
      and coalesce((select r.status from quantum_private.relationship_states r where r.user_id=p_actor),'single')='single'
      and exists(select 1 from quantum_private.get_member_department_identity(p_actor) identity where identity.school_scope_key=w.school_scope_key);
    deadline:=w.application_closes_at;
    final:=s.status='active';
  end if;
  return jsonb_build_object('eligible',coalesce(eligible,false),'deadline',deadline,'members',to_jsonb(members),'finalized',coalesce(final,false));
end $$;

create function quantum_private.calendar_order_json(o quantum_private.calendar_payment_orders) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('orderId',o.order_id,'intentId',o.intent_id,'audience',o.audience,'eventId',o.event_id,'applicationId',o.application_id,
   'ownerId',o.user_id,'amountKrw',o.amount_krw,'providerMode',o.provider_mode,'state',o.state,'paymentKey',o.payment_key,
   'expiresAt',o.expires_at,'depositState',o.deposit_state,'eventStartsAt',case when o.audience='couple'
     then (select starts_at from quantum_private.couple_calendar_events where id=o.event_id)
     else (select starts_at from public.quantum_weekly_activity_windows where id=o.event_id) end)
$$;
create function quantum_private.calendar_refund_due(p_order_id text) returns void language plpgsql set search_path='' as $$
begin
  update quantum_private.calendar_payment_orders set deposit_state='refund_due',updated_at=clock_timestamp()
    where order_id=p_order_id and deposit_state='held';
  insert into quantum_private.calendar_refund_outbox(order_id)
    select order_id from quantum_private.calendar_payment_orders where order_id=p_order_id and deposit_state='refund_due'
    on conflict(order_id) do nothing;
end $$;

create function public.prepare_calendar_payment_for_service(p_actor uuid,p_audience text,p_event_id uuid,p_application_id uuid,p_intent_id uuid,p_provider_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; o quantum_private.calendar_payment_orders; member_id uuid;
begin
  perform quantum_private.calendar_payment_service();
  if p_intent_id is null or p_provider_mode is null or p_provider_mode not in ('test','live') then raise exception 'calendar_invalid_input'; end if;
  context:=quantum_private.calendar_payment_lock(p_actor,p_audience,p_event_id,p_application_id);
  select * into o from quantum_private.calendar_payment_orders where intent_id=p_intent_id;
  if found and (o.user_id is distinct from p_actor or o.audience<>p_audience or o.event_id<>p_event_id or o.application_id<>p_application_id)
    then raise exception 'calendar_idempotency_conflict'; end if;
  if found and o.state='aborted' then return quantum_private.calendar_order_json(o); end if;
  select * into o from quantum_private.calendar_payment_orders where audience=p_audience and event_id=p_event_id
    and application_id=p_application_id and user_id=p_actor and state<>'aborted' order by created_at desc limit 1 for update;
  if found then
    if o.provider_mode<>p_provider_mode then raise exception 'calendar_provider_changed'; end if;
    -- An existing unpaid order must not reopen checkout after photos/readiness change.
    -- Paid or uncertain orders still return their receipt for reconciliation/refund.
    if o.state='prepared' and p_audience='single' and not public.is_profile_matching_ready(p_actor)
      then raise exception 'matching_features_not_ready'; end if;
    return quantum_private.calendar_order_json(o);
  end if;
  if p_audience='single' and not public.is_profile_matching_ready(p_actor) then raise exception 'matching_features_not_ready'; end if;
  if (context->>'eligible')::boolean is distinct from true then raise exception 'calendar_event_closed'; end if;
  for member_id in select value::uuid from jsonb_array_elements_text(context->'members') loop
    perform quantum_private.assert_activity_room_access(member_id);
  end loop;
  insert into quantum_private.calendar_payment_orders(order_id,intent_id,audience,event_id,application_id,user_id,provider_mode,expires_at)
    values('calendar_'||replace(p_intent_id::text,'-',''),p_intent_id,p_audience,p_event_id,p_application_id,p_actor,p_provider_mode,
      least((context->>'deadline')::timestamptz,clock_timestamp()+interval '30 minutes')) returning * into o;
  return quantum_private.calendar_order_json(o);
end $$;

create function public.get_calendar_payment_for_service(p_actor uuid,p_audience text,p_event_id uuid,p_order_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o quantum_private.calendar_payment_orders;
begin
  perform quantum_private.calendar_payment_service();
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id and user_id=p_actor and event_id=p_event_id and audience=p_audience;
  if not found then raise exception 'calendar_order_not_found'; end if;
  return quantum_private.calendar_order_json(o);
end $$;

create function public.record_calendar_payment_for_service(p_actor uuid,p_audience text,p_event_id uuid,p_order_id text,p_state text,p_payment_key text,p_amount_krw integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o quantum_private.calendar_payment_orders; context jsonb; member_id uuid;
begin
  perform quantum_private.calendar_payment_service();
  if p_amount_krw is distinct from 10000 or p_payment_key is null or p_payment_key !~ '^[!-~]{1,200}$'
    or p_state is null or p_state not in ('confirming','confirmed','reconciliation_required') then raise exception 'calendar_payment_evidence_mismatch'; end if;
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id and user_id=p_actor and event_id=p_event_id and audience=p_audience;
  if not found then raise exception 'calendar_order_not_found'; end if;
  context:=quantum_private.calendar_payment_lock(p_actor,p_audience,p_event_id,o.application_id);
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id for update;
  if o.payment_key is not null and o.payment_key<>p_payment_key then raise exception 'calendar_payment_evidence_mismatch'; end if;
  if o.state='confirmed' then return quantum_private.calendar_order_json(o); end if;
  if p_state='confirming' then
    if o.state='aborted' or o.expires_at<=clock_timestamp() then raise exception 'calendar_payment_expired'; end if;
    if (context->>'eligible')::boolean is distinct from true then raise exception 'calendar_event_closed'; end if;
    for member_id in select value::uuid from jsonb_array_elements_text(context->'members') loop
      perform quantum_private.assert_activity_room_access(member_id);
    end loop;
  elsif p_state='reconciliation_required' and o.state='aborted' then
    raise exception 'calendar_payment_aborted';
  end if;
  update quantum_private.calendar_payment_orders set state=p_state,payment_key=p_payment_key,
    deposit_state=case when p_state='confirmed' then
      case when o.state='aborted' or o.expires_at<=clock_timestamp() or (context->>'eligible')::boolean is distinct from true then 'refund_due' else 'held' end
      else deposit_state end,
    paid_at=case when p_state='confirmed' then coalesce(paid_at,clock_timestamp()) else paid_at end,updated_at=clock_timestamp()
    where order_id=p_order_id returning * into o;
  if p_state='confirmed' and o.deposit_state='refund_due' then
    perform quantum_private.calendar_refund_due(o.order_id);
    select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id;
  end if;
  return quantum_private.calendar_order_json(o);
end $$;

create function public.abort_calendar_payment_for_service(p_actor uuid,p_audience text,p_event_id uuid,p_order_id text,p_provider_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o quantum_private.calendar_payment_orders;
begin
  perform quantum_private.calendar_payment_service();
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id and user_id=p_actor and event_id=p_event_id and audience=p_audience;
  if not found then raise exception 'calendar_order_not_found'; end if;
  perform quantum_private.calendar_payment_lock(p_actor,p_audience,p_event_id,o.application_id);
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id for update;
  if o.provider_mode<>p_provider_mode then raise exception 'calendar_provider_changed'; end if;
  if o.state='aborted' then return quantum_private.calendar_order_json(o); end if;
  if o.state<>'prepared' or o.payment_key is not null or o.expires_at>clock_timestamp() then raise exception 'calendar_payment_conflict'; end if;
  update quantum_private.calendar_payment_orders set state='aborted',updated_at=clock_timestamp() where order_id=p_order_id returning * into o;
  return quantum_private.calendar_order_json(o);
end $$;

-- Keep selected-date couples out of the legacy fixed-Saturday `ready` allocator.
alter table public.quantum_couple_parties drop constraint quantum_couple_parties_status_check;
alter table public.quantum_couple_parties add constraint quantum_couple_parties_status_check
  check(status in ('pending_partner','payment_pending','calendar_ready','ready','matched','completed','cancelled'));
create or replace function quantum_private.guard_calendar_couple_party() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and old.calendar_event_id is not null and (new.calendar_event_id is distinct from old.calendar_event_id
    or new.leader_user_id<>old.leader_user_id or new.partner_user_id<>old.partner_user_id) then raise exception 'calendar_party_identity_locked'; end if;
  if new.calendar_event_id is not null then
    if new.status in ('ready','matched','completed') then raise exception 'calendar_date_assignment_required'; end if;
    if new.status='calendar_ready' and (new.accepted_at is null or new.calendar_consent_at is null or
      not quantum_private.calendar_has_held_deposit('couple',new.calendar_event_id,new.id,new.leader_user_id)
      or not quantum_private.calendar_has_held_deposit('couple',new.calendar_event_id,new.id,new.partner_user_id))
      then raise exception 'calendar_payment_not_ready'; end if;
  end if;
  return new;
end $$;

-- Every non-draft weekly window is a calendar event. Gate new candidates at the
-- database boundary, not only when a user happens to have a prepared entry.
-- Existing admissions are not rewritten or charged retroactively.
create function quantum_private.assert_calendar_weekly_receipt(
  a public.quantum_weekly_applications,p_window_id uuid,p_require_binding boolean
) returns void language plpgsql security definer set search_path='' as $$
declare s quantum_private.calendar_single_applications;
begin
  select * into s from quantum_private.calendar_single_applications
    where id=a.idempotency_key and user_id=a.user_id and window_id=p_window_id;
  if not found or s.status not in ('payment_pending','active')
    or a.party_type is distinct from 'solo' or a.party_size is distinct from 1 or a.party_group_id is not null
    or not exists(select 1 from public.quantum_weekly_activity_windows w
      where w.id=p_window_id and w.activity_id=a.activity_id and w.week_key=a.week_key)
    or 1<>(select count(*) from public.quantum_weekly_application_candidates where application_id=a.id)
    or not quantum_private.calendar_has_held_deposit('single',p_window_id,s.id,a.user_id)
    then raise exception 'calendar_payment_not_ready'; end if;
  if p_require_binding and (s.status<>'active' or s.linked_weekly_application_id is distinct from a.id)
    then raise exception 'calendar_payment_conflict'; end if;
  if p_require_binding and (1<>(select count(*) from public.quantum_weekly_application_members where application_id=a.id)
    or not exists(select 1 from public.quantum_weekly_application_members
      where application_id=a.id and participant_user_id=a.user_id and consent_status='accepted'))
    then raise exception 'calendar_payment_conflict'; end if;
end $$;

create function quantum_private.guard_calendar_weekly_candidate() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.quantum_weekly_applications;
begin
  -- A candidate removed in this same transaction no longer admits anyone.
  if not exists(select 1 from public.quantum_weekly_application_candidates
    where application_id=new.application_id and window_id=new.window_id) then return new; end if;
  select * into a from public.quantum_weekly_applications where id=new.application_id;
  perform quantum_private.assert_calendar_weekly_receipt(a,new.window_id,tg_argv[0]='bound');
  return new;
end $$;
create trigger calendar_weekly_candidate_receipt after insert or update on public.quantum_weekly_application_candidates
  for each row execute function quantum_private.guard_calendar_weekly_candidate('receipt');
-- finalize links the paid entry after invoking the unchanged weekly RPC. At
-- commit require that link too: a direct paid RPC must not leave an unlinked
-- active application that could outlive a cancelled/refunded prepared entry.
create constraint trigger calendar_weekly_candidate_binding after insert or update on public.quantum_weekly_application_candidates
  deferrable initially deferred for each row execute function quantum_private.guard_calendar_weekly_candidate('bound');

create function quantum_private.guard_calendar_weekly_identity() returns trigger
language plpgsql security definer set search_path='' as $$
declare candidate record;
begin
  if new.status in ('active','awaiting_consents','assigned') and (
    new.user_id is distinct from old.user_id or new.idempotency_key is distinct from old.idempotency_key
    or new.party_type is distinct from old.party_type or new.party_size is distinct from old.party_size
    or new.party_group_id is distinct from old.party_group_id or new.week_key is distinct from old.week_key
    or new.activity_id is distinct from old.activity_id or old.status not in ('active','awaiting_consents','assigned')
  ) then
    if not exists(select 1 from public.quantum_weekly_application_candidates where application_id=new.id)
      then raise exception 'calendar_payment_not_ready'; end if;
    for candidate in select window_id from public.quantum_weekly_application_candidates where application_id=new.id loop
      perform quantum_private.assert_calendar_weekly_receipt(new,candidate.window_id,true);
    end loop;
  end if;
  return new;
end $$;
create trigger calendar_weekly_identity before update on public.quantum_weekly_applications
  for each row execute function quantum_private.guard_calendar_weekly_identity();

create function public.finalize_calendar_payment_application(p_audience text,p_event_id uuid,p_application_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=quantum_private.calendar_actor(); context jsonb; o quantum_private.calendar_payment_orders;
  s quantum_private.calendar_single_applications; w public.quantum_weekly_activity_windows; linked uuid; member_id uuid;
begin
  context:=quantum_private.calendar_payment_lock(actor,p_audience,p_event_id,p_application_id);
  if (context->>'finalized')::boolean then return jsonb_build_object('applicationFinalized',true,'entryId',p_application_id); end if;
  select * into o from quantum_private.calendar_payment_orders where user_id=actor and audience=p_audience and event_id=p_event_id
    and application_id=p_application_id and state='confirmed' order by created_at desc limit 1 for update;
  if not found or o.deposit_state<>'held' then raise exception 'calendar_payment_not_ready'; end if;
  if (context->>'eligible')::boolean is distinct from true then
    for o in select * from quantum_private.calendar_payment_orders where audience=p_audience and event_id=p_event_id and application_id=p_application_id and deposit_state='held' order by order_id for update loop
      perform quantum_private.calendar_refund_due(o.order_id);
    end loop;
    return jsonb_build_object('applicationFinalized',false,'entryId',p_application_id,'refundDue',true);
  end if;
  for member_id in select value::uuid from jsonb_array_elements_text(context->'members') loop
    perform quantum_private.assert_activity_room_access(member_id);
  end loop;
  if p_audience='couple' then
    if 2<>(select count(distinct user_id) from quantum_private.calendar_payment_orders where audience='couple' and event_id=p_event_id
      and application_id=p_application_id and state='confirmed' and deposit_state='held'
      and user_id in (select value::uuid from jsonb_array_elements_text(context->'members'))) then
      return jsonb_build_object('applicationFinalized',false,'entryId',p_application_id,'partnerPaymentPending',true);
    end if;
    update public.quantum_couple_parties set status='calendar_ready',updated_at=clock_timestamp() where id=p_application_id;
    perform quantum_private.try_assign_calendar_couple(p_application_id);
  else
    select * into s from quantum_private.calendar_single_applications where id=p_application_id;
    select * into w from public.quantum_weekly_activity_windows where id=p_event_id;
    -- The current user's auth.uid is unchanged. Reuse the existing weekly allocator
    -- contract with exactly the one selected window and no friend party.
    perform public.apply_to_my_weekly_activity_v2(w.activity_id,w.week_key,array[w.id],null,s.id);
    select id into linked from public.quantum_weekly_applications where user_id=actor and idempotency_key=s.id;
    if linked is null or 1<>(select count(*) from public.quantum_weekly_application_candidates where application_id=linked)
      or not exists(select 1 from public.quantum_weekly_application_candidates where application_id=linked and window_id=w.id)
      then raise exception 'calendar_payment_conflict'; end if;
    update quantum_private.calendar_single_applications set status='active',linked_weekly_application_id=linked where id=s.id;
  end if;
  return jsonb_build_object('applicationFinalized',true,'entryId',p_application_id);
end $$;

-- Cancellation/closing cannot erase a paid receipt; it creates a requestable liability.
create function quantum_private.calendar_cancel_liability() returns trigger language plpgsql security definer set search_path='' as $$
declare o quantum_private.calendar_payment_orders; audience_name text; entry_id uuid; target_event_id uuid;
begin
  if tg_table_name='quantum_couple_parties' then
    if new.calendar_event_id is null or new.status<>'cancelled' then return new; end if;
    audience_name:='couple';entry_id:=new.id;target_event_id:=new.calendar_event_id;
  elsif tg_table_name='calendar_single_applications' then
    if new.status<>'cancelled' then return new; end if;
    audience_name:='single';entry_id:=new.id;target_event_id:=new.window_id;
  else
    if new.status not in ('cancelled','completed') then return new; end if;
    audience_name:=case when tg_table_name='couple_calendar_events' then 'couple' else 'single' end;target_event_id:=new.id;
  end if;
  for o in select * from quantum_private.calendar_payment_orders where audience=audience_name and calendar_payment_orders.event_id=target_event_id
    and (entry_id is null or application_id=entry_id) and deposit_state='held' order by order_id for update loop
    perform quantum_private.calendar_refund_due(o.order_id);
  end loop;
  return new;
end $$;
create trigger calendar_couple_cancel_receipts after update of status on public.quantum_couple_parties for each row execute function quantum_private.calendar_cancel_liability();
create trigger calendar_single_cancel_receipts after update of status on quantum_private.calendar_single_applications for each row execute function quantum_private.calendar_cancel_liability();
create trigger calendar_couple_event_receipts after update of status on quantum_private.couple_calendar_events for each row execute function quantum_private.calendar_cancel_liability();
create trigger calendar_single_event_receipts after update of status on public.quantum_weekly_activity_windows for each row execute function quantum_private.calendar_cancel_liability();

create function quantum_private.calendar_weekly_cancel_liability() returns trigger language plpgsql security definer set search_path='' as $$
declare o quantum_private.calendar_payment_orders;
begin
  if new.status not in ('cancelled','expired') then return new; end if;
  for o in select payment.* from quantum_private.calendar_payment_orders payment
    join quantum_private.calendar_single_applications entry on entry.id=payment.application_id
      and entry.window_id=payment.event_id and entry.user_id=payment.user_id
    where payment.audience='single' and entry.linked_weekly_application_id=new.id and payment.deposit_state='held'
    order by payment.order_id for update of payment loop
    perform quantum_private.calendar_refund_due(o.order_id);
  end loop;
  return new;
end $$;
create trigger calendar_weekly_cancel_receipts after update of status on public.quantum_weekly_applications
  for each row execute function quantum_private.calendar_weekly_cancel_liability();

create function public.request_my_calendar_refund(p_audience text,p_event_id uuid,p_order_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=quantum_private.calendar_actor(); o quantum_private.calendar_payment_orders; r quantum_private.calendar_refund_outbox;
begin
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id and user_id=actor and audience=p_audience and event_id=p_event_id;
  if not found then raise exception 'calendar_order_not_found'; end if;
  perform quantum_private.calendar_payment_lock(actor,p_audience,p_event_id,o.application_id);
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id for update;
  if o.deposit_state not in ('refund_due','refunded') then raise exception 'calendar_refund_not_available'; end if;
  select * into r from quantum_private.calendar_refund_outbox where order_id=p_order_id for update;
  if not found then raise exception 'calendar_refund_not_available'; end if;
  if r.request_id is null then
    update quantum_private.calendar_refund_outbox set request_id=gen_random_uuid(),requested_at=clock_timestamp(),state='requested' where order_id=p_order_id returning * into r;
  end if;
  return jsonb_build_object('orderId',o.order_id,'refundState',r.state,'requestId',r.request_id);
end $$;

create function public.claim_calendar_refund_for_service(p_actor uuid,p_audience text,p_event_id uuid,p_order_id text,p_lease_id uuid,p_provider_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o quantum_private.calendar_payment_orders; r quantum_private.calendar_refund_outbox;
begin
  perform quantum_private.calendar_payment_service();
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id and user_id=p_actor and audience=p_audience and event_id=p_event_id;
  if not found then raise exception 'calendar_order_not_found'; end if;
  perform quantum_private.calendar_payment_lock(p_actor,p_audience,p_event_id,o.application_id);
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id for update;
  if p_provider_mode is distinct from o.provider_mode or p_lease_id is null then raise exception 'calendar_provider_changed'; end if;
  select * into r from quantum_private.calendar_refund_outbox where order_id=p_order_id for update;
  if not found or r.request_id is null or o.deposit_state not in ('refund_due','refunded') then raise exception 'calendar_refund_not_available'; end if;
  if r.state='completed' then return jsonb_build_object('order',quantum_private.calendar_order_json(o),'requestId',r.request_id,'leaseId',p_lease_id); end if;
  if r.state='processing' and r.lease_until>clock_timestamp() then raise exception 'calendar_refund_busy'; end if;
  update quantum_private.calendar_refund_outbox set state='processing',lease_id=p_lease_id,lease_until=clock_timestamp()+interval '2 minutes' where order_id=p_order_id;
  return jsonb_build_object('order',quantum_private.calendar_order_json(o),'requestId',r.request_id,'leaseId',p_lease_id);
end $$;

create function public.finalize_calendar_refund_for_service(p_actor uuid,p_audience text,p_event_id uuid,p_order_id text,p_lease_id uuid,p_provider_mode text,p_request_id uuid,p_payment_key text,p_transaction_key text,p_amount_krw integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o quantum_private.calendar_payment_orders; r quantum_private.calendar_refund_outbox;
begin
  perform quantum_private.calendar_payment_service();
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id and user_id=p_actor and audience=p_audience and event_id=p_event_id;
  if not found then raise exception 'calendar_order_not_found'; end if;
  perform quantum_private.calendar_payment_lock(p_actor,p_audience,p_event_id,o.application_id);
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id for update;
  select * into r from quantum_private.calendar_refund_outbox where order_id=p_order_id for update;
  if r.request_id is distinct from p_request_id or o.provider_mode is distinct from p_provider_mode or o.payment_key is distinct from p_payment_key
    or p_amount_krw is distinct from 10000 or p_transaction_key is null or p_transaction_key !~ '^[!-~]{1,200}$' then raise exception 'calendar_payment_evidence_mismatch'; end if;
  if r.state='completed' then
    if r.transaction_key<>p_transaction_key then raise exception 'calendar_payment_evidence_mismatch'; end if;
    return quantum_private.calendar_order_json(o);
  end if;
  if r.state is distinct from 'processing' or r.lease_id is distinct from p_lease_id or r.lease_until<=clock_timestamp()
    or o.deposit_state<>'refund_due' then raise exception 'calendar_refund_busy'; end if;
  update quantum_private.calendar_refund_outbox set state='completed',transaction_key=p_transaction_key,completed_at=clock_timestamp(),lease_until=null where order_id=p_order_id;
  update quantum_private.calendar_payment_orders set deposit_state='refunded',updated_at=clock_timestamp() where order_id=p_order_id returning * into o;
  return quantum_private.calendar_order_json(o);
end $$;

create function public.release_calendar_refund_for_service(p_actor uuid,p_audience text,p_event_id uuid,p_order_id text,p_lease_id uuid,p_provider_mode text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o quantum_private.calendar_payment_orders;
begin
  perform quantum_private.calendar_payment_service();
  select * into o from quantum_private.calendar_payment_orders where order_id=p_order_id and user_id=p_actor and audience=p_audience and event_id=p_event_id;
  if not found or o.provider_mode is distinct from p_provider_mode then raise exception 'calendar_order_not_found'; end if;
  perform quantum_private.calendar_payment_lock(p_actor,p_audience,p_event_id,o.application_id);
  perform 1 from quantum_private.calendar_payment_orders where order_id=p_order_id for update;
  update quantum_private.calendar_refund_outbox set state='failed',lease_id=null,lease_until=null where order_id=p_order_id
    and request_id=p_request_id and lease_id=p_lease_id and state='processing';
  return jsonb_build_object('released',true);
end $$;

create or replace function quantum_private.calendar_payment_summary(p_audience text,p_entry_id uuid,p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o quantum_private.calendar_payment_orders; finalized boolean:=false; accepted boolean:=false; partner_paid boolean;
begin
  if p_audience='couple' then
    select p.status in ('calendar_ready','calendar_matched'),
      p.status='payment_pending' and p.accepted_at is not null and e.status='recruiting' and e.application_closes_at>now(),
      quantum_private.calendar_has_held_deposit('couple',p.calendar_event_id,p.id,
        case when p.leader_user_id=p_actor then p.partner_user_id else p.leader_user_id end)
      into finalized,accepted,partner_paid from public.quantum_couple_parties p
      join quantum_private.couple_calendar_events e on e.id=p.calendar_event_id
      where p.id=p_entry_id and p_actor in (p.leader_user_id,p.partner_user_id);
    if not found then raise exception 'calendar_application_not_found'; end if;
  else
    select s.status='active',s.status='payment_pending' and s.consent_at is not null and w.status='recruiting'
      and w.application_closes_at>now() and w.starts_at>now() into finalized,accepted
      from quantum_private.calendar_single_applications s join public.quantum_weekly_activity_windows w on w.id=s.window_id
      where s.id=p_entry_id and s.user_id=p_actor;
    if not found then raise exception 'calendar_application_not_found'; end if;
  end if;
  select * into o from quantum_private.calendar_payment_orders where audience=p_audience and application_id=p_entry_id and user_id=p_actor
    order by created_at desc limit 1;
  return jsonb_build_object('checkoutEnabled',accepted and not finalized and coalesce(o.deposit_state,'unpaid')='unpaid','applicationFinalized',finalized,'myDepositState',coalesce(o.deposit_state,'unpaid'),
    'partnerDepositReady',partner_paid,'depositPolicyStatus','connected','orderId',o.order_id,
    'refundState',coalesce((select state from quantum_private.calendar_refund_outbox where order_id=o.order_id),'unavailable'));
end $$;

-- Extend the existing account-erasure predicates, including the readiness RPC
-- and delete-time guard. Keep the same explicit hash-reviewed retention policy.
create or replace function quantum_private.account_has_legal_retention_candidates(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.deposits d where d.user_id=p_user_id)
    or exists(select 1 from public.deposit_refund_requests r where r.user_id=p_user_id)
    or exists(select 1 from public.campus_seven_deposit_holds h where h.user_id=p_user_id)
    or exists(select 1 from public.campus_seven_deposit_reviews r where r.user_id=p_user_id)
    or exists(select 1 from public.tonight_deposits d where d.user_id=p_user_id)
    or exists(select 1 from public.tonight_deposit_refund_requests r where r.requested_by=p_user_id)
    or exists(select 1 from public.quantum_continuation_fee_orders o where o.owner_user_id=p_user_id or o.target_user_id=p_user_id)
    or exists(select 1 from public.meeting_photo_evidence e where e.uploader_user_id=p_user_id and e.dispute_hold=true and e.status<>'deleted')
    or exists(select 1 from quantum_private.meetup_admission_checkout_orders o where o.user_id=p_user_id)
    or exists(select 1 from quantum_private.activity_meetup_admission_deposits d where d.user_id=p_user_id)
    or exists(select 1 from quantum_private.activity_meetup_admission_refund_outbox o
      join quantum_private.activity_meetup_admission_deposits d on d.id=o.deposit_id where d.user_id=p_user_id)
    or exists(select 1 from quantum_private.calendar_payment_orders o where o.user_id=p_user_id)
$$;

-- Historical helper name is retained for its callers; unsettled calendar money
-- uses the same erasure boundary as native meetup money. No expiry bypass.
create or replace function quantum_private.account_has_unresolved_meetup_payments(p_user_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from quantum_private.meetup_admission_checkout_orders o where o.user_id=p_user_id and (
    o.state not in ('confirmed','aborted') or (o.state='confirmed' and not exists(
      select 1 from quantum_private.activity_meetup_admission_deposits d
      where d.intent_id=o.intent_id and d.user_id=p_user_id and d.state='refunded'))))
    or exists(select 1 from quantum_private.activity_meetup_admission_deposits d where d.user_id=p_user_id and d.state<>'refunded')
    or exists(select 1 from quantum_private.activity_meetup_admission_refund_outbox o
      join quantum_private.activity_meetup_admission_deposits d on d.id=o.deposit_id where d.user_id=p_user_id and o.state<>'completed')
    or exists(select 1 from quantum_private.calendar_payment_orders o where o.user_id=p_user_id and
      (o.state not in ('confirmed','aborted') or o.deposit_state in ('held','refund_due')
       or (o.state='confirmed' and o.deposit_state<>'refunded')))
    or exists(select 1 from quantum_private.calendar_refund_outbox r
      join quantum_private.calendar_payment_orders o on o.order_id=r.order_id where o.user_id=p_user_id and r.state<>'completed')
$$;

-- Serialize receipt/refund writes with Auth's user-row deletion, as the existing
-- admission ledger does. DELETE itself must not take payment advisory locks.
create function quantum_private.calendar_finance_owner_lock() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare owner_id uuid;
begin
  if tg_table_name='calendar_refund_outbox' then
    select user_id into owner_id from quantum_private.calendar_payment_orders where order_id=new.order_id;
  else owner_id:=new.user_id;
  end if;
  if owner_id is not null then
    perform 1 from public.users where id=owner_id for key share;
    if not found then raise exception 'account_financial_retention_pending' using errcode='55000'; end if;
  end if;
  return new;
end $$;
create trigger calendar_finance_owner_order before insert or update on quantum_private.calendar_payment_orders
  for each row execute function quantum_private.calendar_finance_owner_lock();
create trigger calendar_finance_owner_refund before insert or update on quantum_private.calendar_refund_outbox
  for each row execute function quantum_private.calendar_finance_owner_lock();

revoke all on function quantum_private.calendar_payment_service(),quantum_private.calendar_payment_lock(uuid,text,uuid,uuid),
  quantum_private.calendar_order_json(quantum_private.calendar_payment_orders),quantum_private.calendar_refund_due(text),
  quantum_private.calendar_cancel_liability(),quantum_private.calendar_weekly_cancel_liability(),quantum_private.calendar_payment_summary(text,uuid,uuid),
  quantum_private.calendar_finance_owner_lock(),quantum_private.account_has_legal_retention_candidates(uuid),
  quantum_private.account_has_unresolved_meetup_payments(uuid),
  quantum_private.assert_calendar_weekly_receipt(public.quantum_weekly_applications,uuid,boolean),
  quantum_private.guard_calendar_weekly_candidate(),quantum_private.guard_calendar_weekly_identity() from public,anon,authenticated,service_role;
revoke all on function public.prepare_calendar_payment_for_service(uuid,text,uuid,uuid,uuid,text),public.get_calendar_payment_for_service(uuid,text,uuid,text),
  public.record_calendar_payment_for_service(uuid,text,uuid,text,text,text,integer),public.abort_calendar_payment_for_service(uuid,text,uuid,text,text),
  public.claim_calendar_refund_for_service(uuid,text,uuid,text,uuid,text),public.finalize_calendar_refund_for_service(uuid,text,uuid,text,uuid,text,uuid,text,text,integer),
  public.release_calendar_refund_for_service(uuid,text,uuid,text,uuid,text,uuid),public.finalize_calendar_payment_application(text,uuid,uuid),public.request_my_calendar_refund(text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_calendar_payment_for_service(uuid,text,uuid,uuid,uuid,text),public.get_calendar_payment_for_service(uuid,text,uuid,text),
  public.record_calendar_payment_for_service(uuid,text,uuid,text,text,text,integer),public.abort_calendar_payment_for_service(uuid,text,uuid,text,text),
  public.claim_calendar_refund_for_service(uuid,text,uuid,text,uuid,text),public.finalize_calendar_refund_for_service(uuid,text,uuid,text,uuid,text,uuid,text,text,integer),
  public.release_calendar_refund_for_service(uuid,text,uuid,text,uuid,text,uuid) to service_role;
grant execute on function public.finalize_calendar_payment_application(text,uuid,uuid),public.request_my_calendar_refund(text,uuid,text) to authenticated;
commit;
