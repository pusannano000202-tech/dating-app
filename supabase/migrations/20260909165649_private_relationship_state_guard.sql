-- G4: voluntary, owner-private relationship state. No partner identifiers, no
-- automatic cancellation of appointments/payments, and no community-wide gate.
create table quantum_private.relationship_states (
  user_id uuid primary key references public.users(id) on delete cascade,
  status text not null default 'single' check (status in ('single','in_relationship')),
  changed_at timestamptz,
  check (status = 'single' or changed_at is not null)
);
alter table quantum_private.relationship_states enable row level security;
revoke all on quantum_private.relationship_states from public, anon, authenticated, service_role;

create function quantum_private.relationship_user_eligible(p_user_id uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
  select p_user_id is not null
    and exists (select 1 from public.users u join auth.users a on a.id=u.id
      where u.id=p_user_id and a.deleted_at is null
        and (a.banned_until is null or a.banned_until <= current_timestamp))
    and not quantum_private.account_deletion_blocks_access(p_user_id)
    and coalesce((select s.status from quantum_private.relationship_states s where s.user_id=p_user_id),'single')='single'
$$;

create function quantum_private.assert_dating_users(p_user_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_status text;
begin
  if coalesce(cardinality(p_user_ids),0)=0 or array_position(p_user_ids,null) is not null then
    raise exception 'dating_participation_unavailable';
  end if;
  -- The same lock serializes status changes against new admissions. Sorted sets
  -- avoid order-dependent lock acquisition for companion/group participants.
  for v_user in select distinct x from unnest(p_user_ids) x order by x loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('relationship-state:'||v_user::text,0));
    if not quantum_private.relationship_user_eligible(v_user) then
      raise exception 'dating_participation_unavailable';
    end if;
    -- A real row lock also makes repeatable-read transactions fail with a
    -- serialization conflict instead of admitting from a pre-lock snapshot.
    insert into quantum_private.relationship_states(user_id,status) values(v_user,'single') on conflict(user_id) do nothing;
    select status into v_status from quantum_private.relationship_states where user_id=v_user for update;
    if v_status is distinct from 'single' then raise exception 'dating_participation_unavailable'; end if;
  end loop;
end $$;

create function quantum_private.my_relationship_state(p_status text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_state quantum_private.relationship_states%rowtype;
  v_now timestamptz; v_next timestamptz;
begin
  if v_user is null then raise exception 'relationship_not_authenticated'; end if;
  if not exists(select 1 from public.users u join auth.users a on a.id=u.id
    where u.id=v_user and a.deleted_at is null and (a.banned_until is null or a.banned_until<=current_timestamp))
    or quantum_private.account_deletion_blocks_access(v_user) then raise exception 'relationship_forbidden'; end if;
  if p_status is not null and p_status not in ('single','in_relationship') then raise exception 'invalid_relationship_status'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('relationship-state:'||v_user::text,0));
  select * into v_state from quantum_private.relationship_states where user_id=v_user for update;
  v_now := clock_timestamp();
  if not found then v_state.status := 'single'; v_state.changed_at := null; end if;
  if p_status is not null and p_status<>v_state.status then
    if v_state.changed_at is not null and v_now<v_state.changed_at+interval '720 hours' then
      raise exception 'relationship_change_locked';
    end if;
    insert into quantum_private.relationship_states(user_id,status,changed_at) values(v_user,p_status,v_now)
      on conflict(user_id) do update set status=excluded.status,changed_at=excluded.changed_at;
    v_state.status := p_status; v_state.changed_at := v_now;
  end if;
  v_next := v_state.changed_at+interval '720 hours';
  return jsonb_build_object('status',v_state.status,'changed_at',v_state.changed_at,
    'next_change_at',v_next,'can_change',v_next is null or v_now>=v_next,'server_now',v_now);
end $$;

create function public.get_my_relationship_state() returns jsonb
language sql security definer set search_path = '' as $$ select quantum_private.my_relationship_state(null) $$;
create function public.set_my_relationship_state(p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_status is null then raise exception 'invalid_relationship_status'; end if;
  return quantum_private.my_relationship_state(p_status);
end $$;

-- Final database boundary: no API-only/localStorage rule. Only a NEW admission,
-- identity change or allocation is guarded; cancellation and existing confirmed
-- appointment/payment lifecycle updates are intentionally left alone.
create function quantum_private.enforce_dating_relationship_admission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n jsonb:=to_jsonb(new); o jsonb; v_users uuid[]; v_group uuid; v_candidate uuid;
  v_guard boolean:=false; v_insert boolean:=tg_op='INSERT';
begin
  if not v_insert then o:=to_jsonb(old); else o:='{}'::jsonb; end if;
  case tg_table_name
  when 'tonight_applications' then
    v_guard := (v_insert and n->>'status' in ('submitted','waitlisted','allocated'))
      or (not v_insert and ((n->>'user_id') is distinct from (o->>'user_id')
        or ((n->>'status') is distinct from (o->>'status') and n->>'status' in ('submitted','allocated'))));
    v_users:=array[(n->>'user_id')::uuid];
  when 'tonight_team_members' then
    v_guard:=v_insert or n->>'user_id' is distinct from o->>'user_id' or n->>'team_id' is distinct from o->>'team_id';
    v_users:=array[(n->>'user_id')::uuid];
  when 'quantum_weekly_applications' then
    v_guard:=(v_insert and n->>'status' in ('active','awaiting_consents','assigned'))
      or (not v_insert and (n->>'user_id' is distinct from o->>'user_id'
        or (n->>'status' is distinct from o->>'status' and n->>'status' in ('active','assigned'))));
    select array[(n->>'user_id')::uuid]||coalesce(array_agg(m.participant_user_id),'{}'::uuid[]) into v_users
      from public.quantum_weekly_application_members m where m.application_id=(n->>'id')::uuid
        and m.consent_status='accepted' and m.lifecycle_status not in ('cancelled','expired');
  when 'quantum_weekly_application_members' then
    v_guard:=n->>'consent_status'='accepted' and n->>'lifecycle_status' not in ('cancelled','expired')
      and (v_insert or n->>'participant_user_id' is distinct from o->>'participant_user_id'
        or n->>'application_id' is distinct from o->>'application_id'
        or n->>'consent_status' is distinct from o->>'consent_status'
        or n->>'lifecycle_status' is distinct from o->>'lifecycle_status');
    v_users:=array[(n->>'participant_user_id')::uuid];
  when 'quantum_event_participations' then
    v_guard:=n->>'status' in ('recruiting','confirmed') and (v_insert
      or n->>'user_id' is distinct from o->>'user_id' or n->>'group_id' is distinct from o->>'group_id'
      or n->>'occurrence_id' is distinct from o->>'occurrence_id' or n->>'status' is distinct from o->>'status');
    v_users:=array[(n->>'user_id')::uuid]; v_group:=(n->>'group_id')::uuid;
    if v_group is not null then select v_users||coalesce(array_agg(m.user_id),'{}'::uuid[]) into v_users
      from public.group_members m where m.group_id=v_group and m.left_at is null; end if;
  when 'quantum_event_match_members' then
    v_guard:=v_insert or n->>'user_id' is distinct from o->>'user_id' or n->>'match_id' is distinct from o->>'match_id';
    v_users:=array[(n->>'user_id')::uuid];
  when 'match_pool' then
    v_guard:=n->>'status' in ('waiting','matched','rolled_over') and (v_insert
      or n->>'group_id' is distinct from o->>'group_id' or n->>'status' is distinct from o->>'status');
    select array_agg(m.user_id) into v_users from public.group_members m where m.group_id=(n->>'group_id')::uuid and m.left_at is null;
  when 'matches' then
    v_guard:=v_insert or n->>'group_a_id' is distinct from o->>'group_a_id' or n->>'group_b_id' is distinct from o->>'group_b_id';
    select array_agg(m.user_id) into v_users from public.group_members m
      where m.group_id in ((n->>'group_a_id')::uuid,(n->>'group_b_id')::uuid) and m.left_at is null;
  when 'group_members' then
    v_guard:=n->>'left_at' is null and (v_insert or o->>'left_at' is not null
      or n->>'user_id' is distinct from o->>'user_id' or n->>'group_id' is distinct from o->>'group_id')
      and (exists(select 1 from public.match_pool p where p.group_id=(n->>'group_id')::uuid and p.status in ('waiting','matched','rolled_over'))
        or exists(select 1 from public.groups g where g.id=(n->>'group_id')::uuid and g.status in ('queued','matched')));
    v_users:=array[(n->>'user_id')::uuid];
  when 'quantum_continuation_join_proposal_members' then
    v_guard:=n->>'member_role'='candidate' and (v_insert or n->>'participant_user_id' is distinct from o->>'participant_user_id' or n->>'member_role' is distinct from o->>'member_role');
    v_users:=array[(n->>'participant_user_id')::uuid];
  when 'quantum_continuation_join_consents' then
    select p.candidate_user_id into v_candidate from public.quantum_continuation_join_proposals p where p.id=(n->>'proposal_id')::uuid;
    v_guard:=n->>'decision'='accept' and v_candidate=(n->>'participant_user_id')::uuid
      and (v_insert or n->>'decision' is distinct from o->>'decision' or n->>'participant_user_id' is distinct from o->>'participant_user_id');
    v_users:=array[v_candidate];
  when 'quantum_continuation_transitions' then
    select array_agg(p.candidate_user_id) into v_users from public.quantum_continuation_join_proposals p
      where p.series_id=(n->>'series_id')::uuid and p.target_program_day=(n->>'target_program_day')::integer and p.status='accepted';
    v_guard:=v_insert and coalesce(cardinality(v_users),0)>0;
  else raise exception 'unsupported_dating_admission_boundary';
  end case;
  if v_guard then perform quantum_private.assert_dating_users(v_users); end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['tonight_applications','tonight_team_members','quantum_weekly_applications',
    'quantum_weekly_application_members','quantum_event_participations','quantum_event_match_members',
    'match_pool','matches','group_members','quantum_continuation_join_proposal_members',
    'quantum_continuation_join_consents','quantum_continuation_transitions'] loop
    execute format('create trigger relationship_admission_guard before insert or update on public.%I for each row execute function quantum_private.enforce_dating_relationship_admission()',t);
  end loop;
end $$;

-- Keep the existing reviewed snapshot functions intact, but remove whole
-- companion bundles/parties from active allocator input when anyone is no longer
-- eligible. Output does not reveal a participant's private status or reason.
alter function public.service_get_tonight_allocator_input(uuid) set schema quantum_private;
alter function quantum_private.service_get_tonight_allocator_input(uuid) rename to tonight_allocator_before_relationship;
alter function public.service_get_weekly_allocator_input(uuid) set schema quantum_private;
alter function quantum_private.service_get_weekly_allocator_input(uuid) rename to weekly_allocator_before_relationship;

create function public.service_get_tonight_allocator_input(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_apps jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  v_payload:=quantum_private.tonight_allocator_before_relationship(p_round_id);
  select coalesce(jsonb_agg(a.value order by a.ordinality),'[]'::jsonb) into v_apps
    from jsonb_array_elements(v_payload->'applications') with ordinality a(value,ordinality)
    where exists(select 1 from public.tonight_applications own where own.id=(a.value->>'application_id')::uuid and own.round_id=p_round_id)
      and not exists(select 1 from jsonb_array_elements(v_payload->'applications') b(value)
        left join public.tonight_applications app on app.id=(b.value->>'application_id')::uuid and app.round_id=p_round_id
        where b.value->>'bundle_id'=a.value->>'bundle_id' and not quantum_private.relationship_user_eligible(app.user_id));
  return jsonb_set(v_payload,'{applications}',v_apps,false);
end $$;

create function public.service_get_weekly_allocator_input(p_window_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_apps jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  v_payload:=quantum_private.weekly_allocator_before_relationship(p_window_id);
  select coalesce(jsonb_agg(a.value order by a.ordinality),'[]'::jsonb) into v_apps
    from jsonb_array_elements(v_payload->'applications') with ordinality a(value,ordinality)
    where jsonb_array_length(a.value->'members')>0 and not exists(
      select 1 from jsonb_array_elements(a.value->'members') m(value)
      where not quantum_private.relationship_user_eligible((m.value->>'participant_user_id')::uuid));
  return jsonb_set(v_payload,'{applications}',v_apps,false);
end $$;

revoke all on function quantum_private.relationship_user_eligible(uuid), quantum_private.assert_dating_users(uuid[]),
  quantum_private.my_relationship_state(text), quantum_private.enforce_dating_relationship_admission(),
  quantum_private.tonight_allocator_before_relationship(uuid), quantum_private.weekly_allocator_before_relationship(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.get_my_relationship_state(), public.set_my_relationship_state(text),
  public.service_get_tonight_allocator_input(uuid), public.service_get_weekly_allocator_input(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_my_relationship_state(), public.set_my_relationship_state(text) to authenticated;
grant execute on function public.service_get_tonight_allocator_input(uuid), public.service_get_weekly_allocator_input(uuid) to service_role;
