-- Forward-only local candidate. Dates and partner consent are NOT paid admission.
-- No calendar checkout/receipt/refund contract is connected in this migration.
begin;

create function public.get_my_current_tonight_team_count(p_round_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_current jsonb; v_count integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  v_current:=public.get_my_current_tonight_round();
  if p_round_id is null or v_current#>>'{round,id}' is distinct from p_round_id::text then
    raise exception 'tonight_round_not_found';
  end if;
  -- Reuse the existing school/market permission boundary. No feature/profile rows returned.
  perform public.get_my_tonight_participation_summary(p_round_id);
  select count(*)::integer into v_count from public.tonight_teams
    where round_id=p_round_id and status not in ('drafted','cancelled');
  return jsonb_build_object('roundId',p_round_id,'teamCount',v_count);
end $$;
revoke all on function public.get_my_current_tonight_team_count(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_current_tonight_team_count(uuid) to authenticated;

create table quantum_private.couple_calendar_events (
  id uuid primary key default gen_random_uuid(),
  school_scope_key text not null,
  title text not null check(length(btrim(title)) between 1 and 80),
  summary text not null check(length(btrim(summary)) between 1 and 280),
  image_path text check(image_path ~ '^/images/[a-zA-Z0-9/_-]+\.(png|webp|jpg|jpeg)$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  application_closes_at timestamptz not null,
  location_name text not null check(length(btrim(location_name)) between 1 and 160),
  status text not null default 'draft' check(status in ('draft','recruiting','closed','cancelled','completed')),
  deposit_amount_krw integer not null default 10000 check(deposit_amount_krw=10000),
  required_people integer not null default 4 check(required_people=4),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check(ends_at>starts_at and application_closes_at<=starts_at),
  check(quantum_private.canonical_school_scope_key(school_scope_key)=school_scope_key)
);
alter table quantum_private.couple_calendar_events enable row level security;
revoke all on quantum_private.couple_calendar_events from public,anon,authenticated,service_role;
alter table public.quantum_couple_parties
  add column calendar_event_id uuid references quantum_private.couple_calendar_events(id) on delete restrict,
  add column calendar_idempotency_key uuid,
  add column calendar_consent_at timestamptz;
alter table public.quantum_couple_parties drop constraint quantum_couple_parties_status_check;
alter table public.quantum_couple_parties add constraint quantum_couple_parties_status_check
  check(status in ('pending_partner','payment_pending','ready','matched','completed','cancelled'));
create unique index couple_calendar_request_key on public.quantum_couple_parties(leader_user_id,calendar_idempotency_key)
  where calendar_idempotency_key is not null;
create index couple_calendar_event_state on public.quantum_couple_parties(calendar_event_id,status);

create table quantum_private.calendar_single_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  window_id uuid not null references public.quantum_weekly_activity_windows(id) on delete restrict,
  status text not null default 'payment_pending' check(status in ('payment_pending','active','cancelled')),
  idempotency_key uuid not null,
  consent_at timestamptz not null default now(),
  linked_weekly_application_id uuid references public.quantum_weekly_applications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);
create unique index calendar_single_live_window on quantum_private.calendar_single_applications(user_id,window_id) where status<>'cancelled';
alter table quantum_private.calendar_single_applications enable row level security;
revoke all on quantum_private.calendar_single_applications from public,anon,authenticated,service_role;

-- The separate financial migration owns replacement of these fail-closed hooks.
create function quantum_private.calendar_checkout_available() returns boolean language sql stable set search_path='' as $$select false$$;
create function quantum_private.calendar_payment_summary(p_audience text,p_entry_id uuid,p_actor uuid) returns jsonb
language sql stable set search_path='' as $$select jsonb_build_object('checkoutEnabled',false,'applicationFinalized',false,
  'myDepositState','unavailable','partnerDepositReady',null,'depositPolicyStatus','not_connected','orderId',null,'refundState','unavailable')$$;
revoke all on function quantum_private.calendar_checkout_available(),quantum_private.calendar_payment_summary(text,uuid,uuid) from public,anon,authenticated,service_role;

create function quantum_private.calendar_actor() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_role text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select access_role into v_role from public.get_access_context();
  if v_role is distinct from 'user' then raise exception 'calendar_forbidden'; end if;
  perform public.get_my_relationship_state();
  if not exists(select 1 from quantum_private.get_member_department_identity(v_actor) i where i.school_scope_key is not null) then
    raise exception 'minimum_signup_required';
  end if;
  return v_actor;
end $$;

-- Calendar rows must not enter the legacy Saturday allocator, including via old RPCs.
create function quantum_private.guard_calendar_couple_party() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and old.calendar_event_id is not null and
    (new.calendar_event_id is distinct from old.calendar_event_id or new.leader_user_id<>old.leader_user_id or new.partner_user_id<>old.partner_user_id) then
    raise exception 'calendar_party_identity_locked';
  end if;
  if new.calendar_event_id is not null and new.status not in ('pending_partner','payment_pending','cancelled') then
    raise exception 'calendar_payment_unavailable';
  end if;
  return new;
end $$;
create trigger calendar_couple_payment_boundary before insert or update on public.quantum_couple_parties
  for each row execute function quantum_private.guard_calendar_couple_party();
revoke all on function public.create_quantum_couple_party(uuid),public.accept_quantum_couple_party(uuid)
  from public,anon,authenticated,service_role;

create function public.get_my_event_calendar(p_month date,p_audience text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=quantum_private.calendar_actor(); v_school text; v_relationship text; v_events jsonb;
begin
  if p_month is null or extract(day from p_month)<>1 or extract(year from p_month) not between 2000 and 2099
    or p_audience is null or p_audience not in ('single','couple') then raise exception 'invalid_calendar_query'; end if;
  select school_scope_key into v_school from quantum_private.get_member_department_identity(v_actor);
  v_relationship:=public.get_my_relationship_state()->>'status';
  if p_audience='single' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',w.id,'audience','single','title',w.title,'summary',w.summary,'imageUrl',null,
      'startsAt',w.starts_at,'endsAt',w.ends_at,'applicationClosesAt',w.application_closes_at,'locationName',w.location_name,
      'depositAmountKrw',10000,'checkoutEnabled',quantum_private.calendar_checkout_available(),
      'depositPolicyStatus',case when quantum_private.calendar_checkout_available() then 'connected' else 'not_connected' end,
      'status',case when w.status='recruiting' and w.application_closes_at<=now() then 'closed' else w.status end,
      'applicantCount',(select count(distinct m.participant_user_id)::integer
        from public.quantum_weekly_applications a join public.quantum_weekly_application_members m on m.application_id=a.id
        where m.school_scope_key=v_school and m.consent_status='accepted' and (
          (a.status='active' and m.lifecycle_status='active'
            and exists(select 1 from public.quantum_weekly_application_candidates c where c.application_id=a.id and c.window_id=w.id)
            and a.party_size=(select count(*) from public.quantum_weekly_application_members all_m where all_m.application_id=a.id
              and all_m.consent_status='accepted' and all_m.lifecycle_status='active' and all_m.school_scope_key=v_school and all_m.department_key is not null))
          or (a.status='assigned' and a.assigned_window_id=w.id and m.lifecycle_status='assigned'))),
      'myApplication',coalesce((select jsonb_build_object('id',prepared.id,'status',coalesce(linked.status,prepared.status))
        from quantum_private.calendar_single_applications prepared
        left join public.quantum_weekly_applications linked on linked.id=prepared.linked_weekly_application_id
        where prepared.window_id=w.id and prepared.user_id=v_actor
        and prepared.status<>'cancelled' order by prepared.created_at desc limit 1),
        (select jsonb_build_object('id',a.id,'status',a.status)
        from public.quantum_weekly_applications a join public.quantum_weekly_application_members m on m.application_id=a.id
        where m.participant_user_id=v_actor and (a.assigned_window_id=w.id or exists(select 1 from public.quantum_weekly_application_candidates c where c.application_id=a.id and c.window_id=w.id))
        order by a.updated_at desc limit 1))
    ) order by w.starts_at,w.id),'[]'::jsonb) into v_events
    from public.quantum_weekly_activity_windows w
    where w.school_scope_key=v_school and w.status<>'draft'
      and w.starts_at>=p_month::timestamp at time zone 'Asia/Seoul'
      and w.starts_at<(p_month+interval '1 month')::timestamp at time zone 'Asia/Seoul';
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'audience','couple','title',e.title,'summary',e.summary,'imageUrl',e.image_path,
      'startsAt',e.starts_at,'endsAt',e.ends_at,'applicationClosesAt',e.application_closes_at,'locationName',e.location_name,
      'depositAmountKrw',e.deposit_amount_krw,'checkoutEnabled',quantum_private.calendar_checkout_available(),
      'depositPolicyStatus',case when quantum_private.calendar_checkout_available() then 'connected' else 'not_connected' end,
      'status',case when e.status='recruiting' and e.application_closes_at<=now() then 'closed' else e.status end,
      -- Count finalized event applicants, not invitations or unpaid preparation.
      'applicantCount',(select count(*)::integer*2 from public.quantum_couple_parties p where p.calendar_event_id=e.id and p.status in ('calendar_ready','calendar_matched','matched','completed')),
      'myApplication',(select jsonb_build_object('id',p.id,'status',case when e.status='cancelled' then 'cancelled' when p.status='calendar_matched' then 'matched' else p.status end) from public.quantum_couple_parties p
        where p.calendar_event_id=e.id and v_actor in (p.leader_user_id,p.partner_user_id) order by p.created_at desc limit 1)
    ) order by e.starts_at,e.id),'[]'::jsonb) into v_events
    from quantum_private.couple_calendar_events e where e.school_scope_key=v_school and e.status<>'draft'
      and e.starts_at>=p_month::timestamp at time zone 'Asia/Seoul'
      and e.starts_at<(p_month+interval '1 month')::timestamp at time zone 'Asia/Seoul';
  end if;
  return jsonb_build_object('serverNow',now(),'relationshipStatus',v_relationship,'events',v_events);
end $$;

create function public.get_my_calendar_couple_party(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=quantum_private.calendar_actor(); p public.quantum_couple_parties; e quantum_private.couple_calendar_events;
begin
  select * into p from public.quantum_couple_parties where calendar_event_id=p_event_id and v_actor in (leader_user_id,partner_user_id)
    order by created_at desc limit 1;
  if not found then return null; end if;
  select * into e from quantum_private.couple_calendar_events where id=p.calendar_event_id;
  return jsonb_build_object('audience','couple','entryId',p.id,'eventId',e.id,'intentId',null,
    'role',case when p.leader_user_id=v_actor then 'leader' else 'partner' end,
    'status',case when e.status='cancelled' then 'cancelled' when p.status='calendar_matched' then 'matched' else p.status end,
    'myConsent',p.leader_user_id=v_actor or p.accepted_at is not null,
    'partnerAccepted',p.accepted_at is not null,'depositAmountKrw',10000)
    ||quantum_private.calendar_payment_summary('couple',p.id,v_actor);
end $$;

create function public.get_my_calendar_single_application(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=quantum_private.calendar_actor(); a quantum_private.calendar_single_applications; v_status text;
begin
  select * into a from quantum_private.calendar_single_applications where window_id=p_event_id and user_id=v_actor order by created_at desc limit 1;
  if not found then return null; end if;
  select status into v_status from public.quantum_weekly_applications where id=a.linked_weekly_application_id;
  return jsonb_build_object('audience','single','eventId',a.window_id,'entryId',a.id,'intentId',null,
    'status',coalesce(v_status,a.status),'role','self','myConsent',true,'partnerAccepted',null,'depositAmountKrw',10000)
    ||quantum_private.calendar_payment_summary('single',a.id,v_actor);
end $$;

create function public.prepare_calendar_single_application(p_event_id uuid,p_idempotency_key uuid,p_participation_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=quantum_private.calendar_actor(); v_school text; w public.quantum_weekly_activity_windows; a quantum_private.calendar_single_applications;
begin
  if p_event_id is null or p_idempotency_key is null or p_participation_consent is distinct from true then raise exception 'invalid_calendar_application'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text,71));
  perform pg_advisory_xact_lock(hashtextextended('relationship-state:'||v_actor::text,0));
  if not public.is_profile_matching_ready(v_actor) then raise exception 'matching_features_not_ready'; end if;
  select * into a from quantum_private.calendar_single_applications where user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then
    if a.window_id<>p_event_id or public.get_my_calendar_single_application(p_event_id)->>'entryId' is distinct from a.id::text then raise exception 'calendar_idempotency_conflict'; end if;
    return public.get_my_calendar_single_application(p_event_id);
  end if;
  select school_scope_key into v_school from quantum_private.get_member_department_identity(v_actor);
  select * into w from public.quantum_weekly_activity_windows where id=p_event_id and school_scope_key=v_school;
  if not found then raise exception 'calendar_event_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('weekly:'||v_actor::text||':'||w.week_key::text,0));
  select * into w from public.quantum_weekly_activity_windows where id=p_event_id and school_scope_key=v_school for update;
  if not found then raise exception 'calendar_event_not_found'; end if;
  if w.status<>'recruiting' or w.application_closes_at<=now() then raise exception 'calendar_event_closed'; end if;
  if public.get_my_relationship_state()->>'status' is distinct from 'single' then raise exception 'calendar_audience_unavailable'; end if;
  if exists(select 1 from quantum_private.calendar_single_applications where user_id=v_actor and window_id=w.id and status<>'cancelled') then raise exception 'calendar_application_exists'; end if;
  if exists(select 1 from public.quantum_weekly_applications old_a join public.quantum_weekly_application_members m on m.application_id=old_a.id
    where m.participant_user_id=v_actor and old_a.week_key=w.week_key and old_a.status in ('awaiting_consents','active','assigned')) then raise exception 'calendar_existing_weekly_application'; end if;
  insert into quantum_private.calendar_single_applications(user_id,window_id,idempotency_key) values(v_actor,w.id,p_idempotency_key);
  return public.get_my_calendar_single_application(w.id);
end $$;

create function public.prepare_calendar_couple_party(p_event_id uuid,p_partner_user_id uuid,p_idempotency_key uuid,p_invitation_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=quantum_private.calendar_actor(); v_school text; e quantum_private.couple_calendar_events; p public.quantum_couple_parties; v_user uuid;
begin
  if p_event_id is null or p_partner_user_id is null or p_partner_user_id=v_actor or p_idempotency_key is null or p_invitation_consent is distinct from true then raise exception 'invalid_calendar_application'; end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-couple-event:'||p_event_id::text,0));
  for v_user in select u from unnest(array[v_actor,p_partner_user_id]) u order by u loop
    perform pg_advisory_xact_lock(hashtextextended(v_user::text,71));
    perform pg_advisory_xact_lock(hashtextextended('relationship-state:'||v_user::text,0));
  end loop;
  select * into p from public.quantum_couple_parties where leader_user_id=v_actor and calendar_idempotency_key=p_idempotency_key;
  if found then
    if p.calendar_event_id<>p_event_id or p.partner_user_id<>p_partner_user_id
      or public.get_my_calendar_couple_party(p_event_id)->>'entryId' is distinct from p.id::text then raise exception 'calendar_idempotency_conflict'; end if;
    return public.get_my_calendar_couple_party(p_event_id);
  end if;
  select school_scope_key into v_school from quantum_private.get_member_department_identity(v_actor);
  select * into e from quantum_private.couple_calendar_events where id=p_event_id and school_scope_key=v_school for update;
  if not found then raise exception 'calendar_event_not_found'; end if;
  if e.status<>'recruiting' or now()>=e.application_closes_at then raise exception 'calendar_event_closed'; end if;
  if public.get_my_relationship_state()->>'status' is distinct from 'in_relationship' then raise exception 'calendar_audience_unavailable'; end if;
  if not exists(select 1 from quantum_private.get_member_department_identity(p_partner_user_id) i where i.school_scope_key=v_school)
    or quantum_private.tonight_invite_pair_is_blocked(v_actor,p_partner_user_id)
    or not exists(select 1 from public.friendships f where f.status='active' and
      ((f.user_id=v_actor and f.friend_user_id=p_partner_user_id) or (f.friend_user_id=v_actor and f.user_id=p_partner_user_id))) then raise exception 'calendar_partner_unavailable'; end if;
  if exists(select 1 from public.quantum_couple_parties a where
    (a.status in ('ready','matched','payment_pending','calendar_ready','calendar_matched') or (a.status='pending_partner' and a.expires_at>now()))
    and (a.leader_user_id in (v_actor,p_partner_user_id) or a.partner_user_id in (v_actor,p_partner_user_id))) then raise exception 'active_couple_party_exists'; end if;
  insert into public.quantum_couple_parties(leader_user_id,partner_user_id,school_scope,calendar_event_id,calendar_idempotency_key,calendar_consent_at,expires_at)
    values(v_actor,p_partner_user_id,v_school,e.id,p_idempotency_key,now(),least(now()+interval '48 hours',e.application_closes_at));
  return public.get_my_calendar_couple_party(p_event_id);
end $$;

create function public.accept_calendar_couple_party(p_party_id uuid,p_partner_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=quantum_private.calendar_actor(); p public.quantum_couple_parties; e quantum_private.couple_calendar_events; v_user uuid;
begin
  if p_partner_consent is distinct from true then raise exception 'partner_consent_required'; end if;
  select * into p from public.quantum_couple_parties where id=p_party_id and partner_user_id=v_actor and calendar_event_id is not null;
  if not found then raise exception 'calendar_party_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-couple-event:'||p.calendar_event_id::text,0));
  for v_user in select u from unnest(array[p.leader_user_id,p.partner_user_id]) u order by u loop
    perform pg_advisory_xact_lock(hashtextextended(v_user::text,71));
    perform pg_advisory_xact_lock(hashtextextended('relationship-state:'||v_user::text,0));
  end loop;
  select * into e from quantum_private.couple_calendar_events where id=p.calendar_event_id for update;
  select * into p from public.quantum_couple_parties where id=p_party_id for update;
  if p.status='payment_pending' then return public.get_my_calendar_couple_party(e.id); end if;
  if p.status<>'pending_partner' or p.expires_at<=now() or e.status<>'recruiting' or e.application_closes_at<=now() then raise exception 'calendar_event_closed'; end if;
  if public.get_my_relationship_state()->>'status' is distinct from 'in_relationship'
    or not exists(select 1 from quantum_private.relationship_states s where s.user_id=p.leader_user_id and s.status='in_relationship')
    or not exists(select 1 from quantum_private.get_member_department_identity(p.leader_user_id) i where i.school_scope_key=e.school_scope_key)
    or not exists(select 1 from quantum_private.get_member_department_identity(v_actor) i where i.school_scope_key=e.school_scope_key)
    or quantum_private.tonight_invite_pair_is_blocked(p.leader_user_id,v_actor)
    or not exists(select 1 from public.friendships f where f.status='active' and ((f.user_id=v_actor and f.friend_user_id=p.leader_user_id) or (f.friend_user_id=v_actor and f.user_id=p.leader_user_id))) then raise exception 'calendar_partner_unavailable'; end if;
  update public.quantum_couple_parties set status='payment_pending',accepted_at=now(),updated_at=now() where id=p.id;
  return public.get_my_calendar_couple_party(e.id);
end $$;

create function public.cancel_calendar_couple_party(p_party_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=quantum_private.calendar_actor(); p public.quantum_couple_parties; v_user uuid;
begin
  select * into p from public.quantum_couple_parties where id=p_party_id and calendar_event_id is not null
    and v_actor in (leader_user_id,partner_user_id);
  if not found then raise exception 'calendar_party_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-couple-event:'||p.calendar_event_id::text,0));
  for v_user in select u from unnest(array[p.leader_user_id,p.partner_user_id]) u order by u loop
    perform pg_advisory_xact_lock(hashtextextended(v_user::text,71));
    perform pg_advisory_xact_lock(hashtextextended('relationship-state:'||v_user::text,0));
  end loop;
  perform 1 from quantum_private.couple_calendar_events where id=p.calendar_event_id for update;
  select * into p from public.quantum_couple_parties where id=p_party_id for update;
  if p.status not in ('pending_partner','payment_pending','calendar_ready','cancelled') then raise exception 'couple_match_locked'; end if;
  update public.quantum_couple_parties set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),updated_at=now() where id=p.id;
  return jsonb_build_object('cancelled',true,'applicationFinalized',false,'providerPaymentChanged',false);
end $$;

create function public.cancel_calendar_single_application(p_entry_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=quantum_private.calendar_actor(); a quantum_private.calendar_single_applications;
  w public.quantum_weekly_activity_windows; v_revision integer; v_status text;
begin
  select * into a from quantum_private.calendar_single_applications where id=p_entry_id and user_id=v_actor;
  if not found then raise exception 'calendar_application_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text,71));
  perform pg_advisory_xact_lock(hashtextextended('relationship-state:'||v_actor::text,0));
  select * into w from public.quantum_weekly_activity_windows where id=a.window_id;
  perform pg_advisory_xact_lock(hashtextextended('weekly:'||v_actor::text||':'||w.week_key::text,0));
  if a.linked_weekly_application_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('weekly-application:'||a.linked_weekly_application_id::text,0));
    select status,revision into v_status,v_revision from public.quantum_weekly_applications
      where id=a.linked_weekly_application_id and user_id=v_actor for update;
    if not found then raise exception 'calendar_application_not_found'; end if;
    if v_status not in ('cancelled','expired') then
      perform public.cancel_my_weekly_activity_application_v2(a.linked_weekly_application_id,v_revision,gen_random_uuid());
    end if;
  end if;
  perform 1 from public.quantum_weekly_activity_windows where id=a.window_id for update;
  select * into a from quantum_private.calendar_single_applications where id=p_entry_id for update;
  update quantum_private.calendar_single_applications set status='cancelled',updated_at=now() where id=a.id;
  return jsonb_build_object('cancelled',true,'applicationFinalized',false,'providerPaymentChanged',false);
end $$;

revoke all on function quantum_private.calendar_actor(),quantum_private.guard_calendar_couple_party() from public,anon,authenticated,service_role;
revoke all on function public.get_my_event_calendar(date,text),public.get_my_calendar_couple_party(uuid),
  public.prepare_calendar_couple_party(uuid,uuid,uuid,boolean),public.accept_calendar_couple_party(uuid,boolean),
  public.cancel_calendar_couple_party(uuid),public.get_my_calendar_single_application(uuid),public.prepare_calendar_single_application(uuid,uuid,boolean),
  public.cancel_calendar_single_application(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_event_calendar(date,text),public.get_my_calendar_couple_party(uuid),
  public.prepare_calendar_couple_party(uuid,uuid,uuid,boolean),public.accept_calendar_couple_party(uuid,boolean),
  public.cancel_calendar_couple_party(uuid),public.get_my_calendar_single_application(uuid),public.prepare_calendar_single_application(uuid,uuid,boolean),
  public.cancel_calendar_single_application(uuid) to authenticated;
commit;
