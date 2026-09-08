-- G3/G4 integration draft. Parent must copy this forward-only contract into a
-- timestamped migration after cross-lane review. This file is never applied by
-- the app and intentionally performs no remote action.

begin;

create or replace function quantum_private.canonical_department_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(p_value), '[[:space:]]+', '', 'g')),
    ''
  )
  where p_value is not null
    and pg_catalog.char_length(pg_catalog.btrim(p_value)) between 1 and 120
$$;

create or replace function quantum_private.canonical_school_scope_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(p_value), '[[:space:]]+', '', 'g')),
    ''
  )
  where p_value is not null
    and pg_catalog.char_length(pg_catalog.btrim(p_value)) between 1 and 120
$$;

create or replace function quantum_private.get_member_department_identity(p_user_id uuid)
returns table (school_scope_key text, department_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    quantum_private.canonical_school_scope_key(member.school_scope),
    quantum_private.canonical_department_key(member.department)
  from quantum_private.community_member_profiles as member
  cross join lateral quantum_private.resolve_profile_readiness(p_user_id) as readiness
  where member.user_id = p_user_id
    and readiness.minimum_signup_complete
    and member.school_scope = 'pnu_self_selected'
    and quantum_private.canonical_school_scope_key(member.school_scope) is not null
    and quantum_private.canonical_department_key(member.department) is not null
$$;

create or replace function quantum_private.get_member_department_key(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select identity.department_key
  from quantum_private.get_member_department_identity(p_user_id) as identity
$$;

revoke all on function quantum_private.canonical_department_key(text)
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.canonical_school_scope_key(text)
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.get_member_department_identity(uuid)
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.get_member_department_key(uuid)
  from public, anon, authenticated, service_role;

-- Snapshot the allocation identity. Historical terminal rows may remain null;
-- every new row and every currently allocatable row must have both keys.
alter table quantum_private.tonight_applicant_features
  add column if not exists school_scope_key text,
  add column if not exists department_key text;

update quantum_private.tonight_applicant_features as feature
set (school_scope_key, department_key) = (
  select identity.school_scope_key, identity.department_key
  from quantum_private.get_member_department_identity(feature.user_id) as identity
)
where feature.school_scope_key is null or feature.department_key is null;

do $$
begin
  if exists (
    select 1
    from public.tonight_applications as application_row
    join quantum_private.tonight_applicant_features as feature
      on feature.application_id = application_row.id
    where application_row.status in ('submitted', 'waitlisted', 'allocated')
      and (feature.school_scope_key is null or feature.department_key is null)
  ) then
    raise exception 'active_tonight_department_snapshot_missing';
  end if;
end
$$;

alter table quantum_private.tonight_applicant_features
  drop constraint if exists tonight_applicant_features_school_scope_key_check,
  drop constraint if exists tonight_applicant_features_department_key_check;
alter table quantum_private.tonight_applicant_features
  add constraint tonight_applicant_features_school_scope_key_check check (
    school_scope_key is null
    or quantum_private.canonical_school_scope_key(school_scope_key) = school_scope_key
  ),
  add constraint tonight_applicant_features_department_key_check check (
    department_key is null
    or quantum_private.canonical_department_key(department_key) = department_key
  );

create or replace function quantum_private.capture_tonight_department_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity record;
begin
  select identity.* into v_identity
  from quantum_private.get_member_department_identity(new.user_id) as identity;
  if not found then raise exception 'department_identity_required'; end if;
  new.school_scope_key := v_identity.school_scope_key;
  new.department_key := v_identity.department_key;
  return new;
end
$$;

create or replace function quantum_private.guard_department_snapshot_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.school_scope_key is distinct from old.school_scope_key
     or new.department_key is distinct from old.department_key then
    raise exception 'department_snapshot_immutable';
  end if;
  return new;
end
$$;

revoke all on function quantum_private.capture_tonight_department_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.guard_department_snapshot_immutable()
  from public, anon, authenticated, service_role;

drop trigger if exists tonight_applicant_features_capture_department
  on quantum_private.tonight_applicant_features;
create trigger tonight_applicant_features_capture_department
  before insert on quantum_private.tonight_applicant_features
  for each row execute function quantum_private.capture_tonight_department_snapshot();

drop trigger if exists tonight_applicant_features_department_immutable
  on quantum_private.tonight_applicant_features;
create trigger tonight_applicant_features_department_immutable
  before update of school_scope_key, department_key
  on quantum_private.tonight_applicant_features
  for each row execute function quantum_private.guard_department_snapshot_immutable();

alter table public.quantum_weekly_activity_windows
  add column if not exists school_scope_key text;
update public.quantum_weekly_activity_windows
set school_scope_key = 'pnu_self_selected'
where school_scope_key is null;
alter table public.quantum_weekly_activity_windows
  alter column school_scope_key set default 'pnu_self_selected',
  alter column school_scope_key set not null,
  drop constraint if exists quantum_weekly_activity_windows_school_scope_key_check;
alter table public.quantum_weekly_activity_windows
  add constraint quantum_weekly_activity_windows_school_scope_key_check check (
    quantum_private.canonical_school_scope_key(school_scope_key) = school_scope_key
  );

alter table public.quantum_weekly_application_members
  add column if not exists school_scope_key text,
  add column if not exists department_key text;

update public.quantum_weekly_application_members as member
set (school_scope_key, department_key) = (
  select identity.school_scope_key, identity.department_key
  from quantum_private.get_member_department_identity(member.participant_user_id) as identity
)
where member.school_scope_key is null or member.department_key is null;

do $$
begin
  if exists (
    select 1
    from public.quantum_weekly_application_members as member
    where member.lifecycle_status in ('awaiting_consents', 'active', 'assigned')
      and (member.school_scope_key is null or member.department_key is null)
  ) then
    raise exception 'active_weekly_department_snapshot_missing';
  end if;
end
$$;

create or replace function quantum_private.capture_weekly_department_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity record;
begin
  select identity.* into v_identity
  from quantum_private.get_member_department_identity(new.participant_user_id) as identity;
  if not found then raise exception 'department_identity_required'; end if;
  new.school_scope_key := v_identity.school_scope_key;
  new.department_key := v_identity.department_key;
  return new;
end
$$;

revoke all on function quantum_private.capture_weekly_department_snapshot()
  from public, anon, authenticated, service_role;

drop trigger if exists quantum_weekly_members_capture_department
  on public.quantum_weekly_application_members;
create trigger quantum_weekly_members_capture_department
  before insert on public.quantum_weekly_application_members
  for each row execute function quantum_private.capture_weekly_department_snapshot();

drop trigger if exists quantum_weekly_members_department_immutable
  on public.quantum_weekly_application_members;
create trigger quantum_weekly_members_department_immutable
  before update of school_scope_key, department_key
  on public.quantum_weekly_application_members
  for each row execute function quantum_private.guard_department_snapshot_immutable();

-- Enrich the existing reviewed service payload without duplicating its body.
alter function public.service_get_tonight_allocator_input(uuid)
  set schema quantum_private;
alter function quantum_private.service_get_tonight_allocator_input(uuid)
  rename to service_get_tonight_allocator_input_impl_20260903102500;
revoke all on function quantum_private.service_get_tonight_allocator_input_impl_20260903102500(uuid)
  from public, anon, authenticated, service_role;

create function public.service_get_tonight_allocator_input(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_applications jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  v_payload := quantum_private.service_get_tonight_allocator_input_impl_20260903102500(p_round_id);
  select coalesce(pg_catalog.jsonb_agg(
    application.value || pg_catalog.jsonb_build_object(
      'school_scope_key', feature.school_scope_key,
      'department_key', feature.department_key
    ) order by application.ordinality
  ), '[]'::jsonb)
  into v_applications
  from pg_catalog.jsonb_array_elements(v_payload -> 'applications')
    with ordinality as application(value, ordinality)
  join quantum_private.tonight_applicant_features as feature
    on feature.application_id = (application.value ->> 'application_id')::uuid
  where feature.school_scope_key is not null and feature.department_key is not null;
  if pg_catalog.jsonb_array_length(v_applications)
     <> pg_catalog.jsonb_array_length(v_payload -> 'applications') then
    raise exception 'application_department_snapshot_missing';
  end if;
  return pg_catalog.jsonb_set(v_payload, '{applications}', v_applications, false);
end
$$;

revoke all on function public.service_get_tonight_allocator_input(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.service_get_tonight_allocator_input(uuid)
  to service_role;

create or replace function quantum_private.assert_tonight_department_assignments(
  p_round_id uuid,
  p_team_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team jsonb;
  v_member_ids uuid[];
begin
  if p_team_assignments is null or pg_catalog.jsonb_typeof(p_team_assignments) <> 'array' then
    raise exception 'team_assignments_required';
  end if;
  for v_team in select value from pg_catalog.jsonb_array_elements(p_team_assignments)
  loop
    if pg_catalog.jsonb_typeof(v_team -> 'application_ids') <> 'array' then
      raise exception 'invalid_team_member';
    end if;
    select pg_catalog.array_agg(member_id::uuid order by ordinality)
    into v_member_ids
    from pg_catalog.jsonb_array_elements_text(v_team -> 'application_ids')
      with ordinality as member(member_id, ordinality);
    if v_member_ids is null then raise exception 'invalid_team_member'; end if;
    if (
      select pg_catalog.count(*)
      from public.tonight_applications as application_row
      join quantum_private.tonight_applicant_features as feature
        on feature.application_id = application_row.id
      where application_row.round_id = p_round_id
        and application_row.id = any(v_member_ids)
        and feature.school_scope_key is not null
        and feature.department_key is not null
    ) <> pg_catalog.cardinality(v_member_ids) then
      raise exception 'application_department_snapshot_missing';
    end if;
    if exists (
      select 1
      from public.tonight_applications as left_application
      join quantum_private.tonight_applicant_features as left_feature
        on left_feature.application_id = left_application.id
      join public.tonight_applications as right_application
        on right_application.id = any(v_member_ids)
       and right_application.id > left_application.id
       and right_application.round_id = left_application.round_id
      join quantum_private.tonight_applicant_features as right_feature
        on right_feature.application_id = right_application.id
      where left_application.round_id = p_round_id
        and left_application.id = any(v_member_ids)
        and left_application.bundle_id <> right_application.bundle_id
        and left_feature.school_scope_key = right_feature.school_scope_key
        and left_feature.department_key = right_feature.department_key
    ) then
      raise exception 'same_department_random_unit';
    end if;
  end loop;
end
$$;

revoke all on function quantum_private.assert_tonight_department_assignments(uuid, jsonb)
  from public, anon, authenticated, service_role;

alter function public.service_publish_tonight_allocation(uuid, integer, jsonb, text)
  set schema quantum_private;
alter function quantum_private.service_publish_tonight_allocation(uuid, integer, jsonb, text)
  rename to service_publish_tonight_allocation_impl_20260902201247;
revoke all on function quantum_private.service_publish_tonight_allocation_impl_20260902201247(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;

create function public.service_publish_tonight_allocation(
  p_round_id uuid,
  p_expected_revision integer,
  p_team_assignments jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  perform quantum_private.assert_tonight_department_assignments(p_round_id, p_team_assignments);
  return quantum_private.service_publish_tonight_allocation_impl_20260902201247(
    p_round_id, p_expected_revision, p_team_assignments, p_idempotency_key
  );
end
$$;

revoke all on function public.service_publish_tonight_allocation(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_publish_tonight_allocation(uuid, integer, jsonb, text)
  to service_role;

alter function public.super_admin_publish_tonight_allocation(uuid, integer, jsonb, text)
  set schema quantum_private;
alter function quantum_private.super_admin_publish_tonight_allocation(uuid, integer, jsonb, text)
  rename to super_admin_publish_tonight_allocation_impl_20260902201247;
revoke all on function quantum_private.super_admin_publish_tonight_allocation_impl_20260902201247(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;

create function public.super_admin_publish_tonight_allocation(
  p_round_id uuid,
  p_expected_revision integer,
  p_team_assignments jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  perform quantum_private.assert_tonight_department_assignments(p_round_id, p_team_assignments);
  return quantum_private.super_admin_publish_tonight_allocation_impl_20260902201247(
    p_round_id, p_expected_revision, p_team_assignments, p_idempotency_key
  );
end
$$;

revoke all on function public.super_admin_publish_tonight_allocation(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.super_admin_publish_tonight_allocation(uuid, integer, jsonb, text)
  to authenticated;

create or replace function public.get_my_tonight_participation_summary(p_round_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_scope_key text;
  v_total integer;
  v_male integer;
  v_female integer;
  v_other integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select identity.school_scope_key into v_school_scope_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_school_scope_key is null then raise exception 'minimum_signup_required'; end if;
  if not exists (
    select 1
    from public.tonight_rounds as round_row
    where round_row.id = p_round_id
      and round_row.market_code = 'PNU'
      and v_school_scope_key = 'pnu_self_selected'
      and (
        exists (
          select 1
          from public.tonight_market_memberships as membership
          where membership.market_code = round_row.market_code
            and membership.user_id = v_actor
            and membership.revoked_at is null
        )
        or exists (
          select 1
          from public.tonight_applications as mine
          where mine.round_id = round_row.id
            and mine.user_id = v_actor
        )
      )
  ) then raise exception 'tonight_market_membership_required'; end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where member.community_gender = 'male')::integer,
    pg_catalog.count(*) filter (where member.community_gender = 'female')::integer,
    pg_catalog.count(*) filter (
      where member.community_gender not in ('male', 'female') or member.community_gender is null
    )::integer
  into v_total, v_male, v_female, v_other
  from public.tonight_applications as application_row
  join quantum_private.tonight_applicant_features as feature
    on feature.application_id = application_row.id
   and feature.school_scope_key = v_school_scope_key
  left join quantum_private.community_member_profiles as member
    on member.user_id = application_row.user_id
  where application_row.round_id = p_round_id
    and application_row.status in ('submitted', 'waitlisted', 'allocated');

  return pg_catalog.jsonb_build_object(
    'scopeId', 'tonight:' || p_round_id::text,
    'asOf', current_timestamp,
    'totalPeople', v_total,
    'genderBreakdown', pg_catalog.jsonb_build_object(
      'malePeople', v_male,
      'femalePeople', v_female,
      'otherOrUnspecifiedPeople', v_other
    ),
    'disclosureBasis', 'all_valid_participants',
    'policyVersion', '2026-09-07-mandatory-aggregate-v1',
    'basis', 'valid_applicants'
  );
end
$$;

revoke all on function public.get_my_tonight_participation_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_tonight_participation_summary(uuid)
  to authenticated;

-- Add exact active demand to each authorized weekly window while retaining the
-- existing assigned_count from the reviewed discovery payload.
alter function public.get_my_weekly_activity_discovery_v2(date)
  set schema quantum_private;
alter function quantum_private.get_my_weekly_activity_discovery_v2(date)
  rename to get_my_weekly_activity_discovery_v2_impl_20260906114007;
revoke all on function quantum_private.get_my_weekly_activity_discovery_v2_impl_20260906114007(date)
  from public, anon, authenticated, service_role;

create function public.get_my_weekly_activity_discovery_v2(p_week_key date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_scope_key text;
  v_payload jsonb;
  v_windows jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select identity.school_scope_key into v_school_scope_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_school_scope_key is null then raise exception 'minimum_signup_required'; end if;
  v_payload := quantum_private.get_my_weekly_activity_discovery_v2_impl_20260906114007(p_week_key);
  select coalesce(pg_catalog.jsonb_agg(
    activity_window.value || pg_catalog.jsonb_build_object(
      'assigned_count', activity_window.value -> 'assigned_count',
      'applicant_count', (
        select pg_catalog.count(*)::integer
        from public.quantum_weekly_application_candidates as candidate
        join public.quantum_weekly_applications as application_row
          on application_row.id = candidate.application_id
         and application_row.status = 'active'
        join public.quantum_weekly_application_members as member
          on member.application_id = application_row.id
         and member.consent_status = 'accepted'
         and member.lifecycle_status = 'active'
         and member.school_scope_key = v_school_scope_key
        where candidate.window_id = window_row.id
          and application_row.party_size = (
            select pg_catalog.count(*)::integer
            from public.quantum_weekly_application_members as complete_member
            where complete_member.application_id = application_row.id
              and complete_member.consent_status = 'accepted'
              and complete_member.lifecycle_status = 'active'
              and complete_member.school_scope_key = v_school_scope_key
              and complete_member.department_key is not null
          )
      )
    ) order by activity_window.ordinality
  ), '[]'::jsonb)
  into v_windows
  from pg_catalog.jsonb_array_elements(v_payload -> 'windows')
    with ordinality as activity_window(value, ordinality)
  join public.quantum_weekly_activity_windows as window_row
    on window_row.id = (activity_window.value ->> 'id')::uuid
   and window_row.school_scope_key = v_school_scope_key;
  return pg_catalog.jsonb_set(v_payload, '{windows}', v_windows, false);
end
$$;

revoke all on function public.get_my_weekly_activity_discovery_v2(date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_weekly_activity_discovery_v2(date)
  to authenticated;

create table quantum_private.weekly_allocation_operator_grants (
  operator_user_id uuid not null references public.users(id) on delete restrict,
  school_scope_key text not null,
  capability text not null check (
    capability in ('weekly_allocation:review', 'weekly_allocation:execute')
  ),
  granted_by uuid not null references public.users(id) on delete restrict,
  revoked_by uuid references public.users(id) on delete restrict,
  granted_at timestamptz not null default current_timestamp,
  revoked_at timestamptz,
  revision integer not null default 0 check (revision >= 0),
  last_idempotency_key uuid not null,
  last_request_hash text not null check (last_request_hash ~ '^[0-9a-f]{32}$'),
  primary key (operator_user_id, school_scope_key, capability),
  check ((revoked_by is null) = (revoked_at is null)),
  check (quantum_private.canonical_school_scope_key(school_scope_key) = school_scope_key)
);

create table quantum_private.weekly_allocation_proposals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_scope_key text not null,
  week_key date not null check (extract(isodow from week_key) = 1),
  window_id uuid not null references public.quantum_weekly_activity_windows(id) on delete restrict,
  window_revision integer not null check (window_revision >= 0),
  assignment_plan jsonb not null check (pg_catalog.jsonb_typeof(assignment_plan) = 'array'),
  input_snapshot_hash text not null check (input_snapshot_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (
    status in ('proposed', 'in_review', 'executing', 'completed', 'rejected', 'stale', 'failed')
  ),
  revision integer not null default 0 check (revision >= 0),
  created_by uuid references public.users(id) on delete restrict,
  reviewed_by uuid references public.users(id) on delete restrict,
  execute_requested_by uuid references public.users(id) on delete restrict,
  create_idempotency_key uuid not null unique,
  execute_idempotency_key uuid unique,
  receipt jsonb,
  error_code text,
  created_at timestamptz not null default current_timestamp,
  reviewed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default current_timestamp,
  check (quantum_private.canonical_school_scope_key(school_scope_key) = school_scope_key),
  check (receipt is null or pg_catalog.jsonb_typeof(receipt) = 'object')
);

create table quantum_private.weekly_allocation_proposal_commands (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references quantum_private.weekly_allocation_proposals(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('operator', 'service')),
  action text not null check (action in ('review', 'reject', 'execute', 'complete', 'fail')),
  prior_revision integer not null check (prior_revision >= 0),
  resulting_revision integer not null check (resulting_revision >= prior_revision),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default current_timestamp,
  unique (actor_kind, idempotency_key)
);

create table quantum_private.weekly_allocation_operator_grant_commands (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  operator_user_id uuid not null references public.users(id) on delete restrict,
  school_scope_key text not null,
  capability text not null check (
    capability in ('weekly_allocation:review', 'weekly_allocation:execute')
  ),
  enabled boolean not null,
  resulting_revision integer not null check (resulting_revision >= 0),
  idempotency_key uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default current_timestamp,
  check (quantum_private.canonical_school_scope_key(school_scope_key) = school_scope_key)
);

alter table quantum_private.weekly_allocation_operator_grants enable row level security;
alter table quantum_private.weekly_allocation_proposals enable row level security;
alter table quantum_private.weekly_allocation_proposal_commands enable row level security;
alter table quantum_private.weekly_allocation_operator_grant_commands enable row level security;
revoke all on table quantum_private.weekly_allocation_operator_grants
  from public, anon, authenticated, service_role;
revoke all on table quantum_private.weekly_allocation_proposals
  from public, anon, authenticated, service_role;
revoke all on table quantum_private.weekly_allocation_proposal_commands
  from public, anon, authenticated, service_role;
revoke all on table quantum_private.weekly_allocation_operator_grant_commands
  from public, anon, authenticated, service_role;
revoke all on sequence quantum_private.weekly_allocation_proposal_commands_id_seq
  from public, anon, authenticated, service_role;
revoke all on sequence quantum_private.weekly_allocation_operator_grant_commands_id_seq
  from public, anon, authenticated, service_role;

create or replace function quantum_private.require_weekly_allocation_capability(
  p_actor uuid,
  p_school_scope_key text,
  p_capability text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1
    from quantum_private.weekly_allocation_operator_grants as grant_row
    where grant_row.operator_user_id = p_actor
      and grant_row.school_scope_key = p_school_scope_key
      and grant_row.capability = p_capability
      and grant_row.revoked_at is null
  ) then raise exception 'weekly_allocation_scope_required'; end if;
end
$$;

revoke all on function quantum_private.require_weekly_allocation_capability(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.super_admin_get_weekly_allocation_operator_grant(
  p_operator_user_id uuid,
  p_school_scope_key text,
  p_capability text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_scope text := quantum_private.canonical_school_scope_key(p_school_scope_key);
  v_grant quantum_private.weekly_allocation_operator_grants%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_operator_user_id is null
     or v_scope is null or v_scope is distinct from p_school_scope_key
     or p_capability not in ('weekly_allocation:review', 'weekly_allocation:execute') then
    raise exception 'invalid_weekly_allocation_grant';
  end if;
  select grant_row.* into v_grant
  from quantum_private.weekly_allocation_operator_grants as grant_row
  where grant_row.operator_user_id = p_operator_user_id
    and grant_row.school_scope_key = v_scope
    and grant_row.capability = p_capability;
  return pg_catalog.jsonb_build_object(
    'operator_user_id', p_operator_user_id,
    'school_scope_key', v_scope,
    'capability', p_capability,
    'enabled', found and v_grant.revoked_at is null,
    'revision', case when found then v_grant.revision else 0 end
  );
end
$$;

revoke all on function public.super_admin_get_weekly_allocation_operator_grant(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.super_admin_get_weekly_allocation_operator_grant(uuid, text, text)
  to authenticated;

create or replace function public.super_admin_set_weekly_allocation_operator_grant(
  p_operator_user_id uuid,
  p_school_scope_key text,
  p_capability text,
  p_enabled boolean,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_scope text := quantum_private.canonical_school_scope_key(p_school_scope_key);
  v_hash text;
  v_existing quantum_private.weekly_allocation_operator_grants%rowtype;
  v_command quantum_private.weekly_allocation_operator_grant_commands%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_operator_user_id is null or p_enabled is null
     or v_scope is null or v_scope is distinct from p_school_scope_key
     or p_capability not in ('weekly_allocation:review', 'weekly_allocation:execute')
     or p_expected_revision is null or p_expected_revision < 0
     or p_idempotency_key is null then
    raise exception 'invalid_weekly_allocation_grant';
  end if;
  v_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'operator_user_id', p_operator_user_id,
    'school_scope_key', v_scope,
    'capability', p_capability,
    'enabled', p_enabled,
    'expected_revision', p_expected_revision
  )::text);
  select command.* into v_command
  from quantum_private.weekly_allocation_operator_grant_commands as command
  where command.idempotency_key = p_idempotency_key;
  if found then
    if v_command.actor_user_id <> v_actor or v_command.request_hash <> v_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'operator_user_id', v_command.operator_user_id,
      'school_scope_key', v_command.school_scope_key,
      'capability', v_command.capability,
      'enabled', v_command.enabled,
      'revision', v_command.resulting_revision,
      'replayed', true
    );
  end if;

  select grant_row.* into v_existing
  from quantum_private.weekly_allocation_operator_grants as grant_row
  where grant_row.operator_user_id = p_operator_user_id
    and grant_row.school_scope_key = v_scope
    and grant_row.capability = p_capability
  for update;
  if (found and v_existing.revision <> p_expected_revision)
     or (not found and (p_expected_revision <> 0 or not p_enabled)) then
    raise exception 'stale_weekly_allocation_grant';
  end if;

  insert into quantum_private.weekly_allocation_operator_grants (
    operator_user_id, school_scope_key, capability, granted_by, revoked_by,
    granted_at, revoked_at, revision, last_idempotency_key, last_request_hash
  ) values (
    p_operator_user_id, v_scope, p_capability, v_actor,
    case when p_enabled then null else v_actor end,
    current_timestamp, case when p_enabled then null else current_timestamp end,
    p_expected_revision + 1, p_idempotency_key, v_hash
  )
  on conflict (operator_user_id, school_scope_key, capability) do update
  set granted_by = case when p_enabled then v_actor else quantum_private.weekly_allocation_operator_grants.granted_by end,
      granted_at = case when p_enabled then current_timestamp else quantum_private.weekly_allocation_operator_grants.granted_at end,
      revoked_by = case when p_enabled then null else v_actor end,
      revoked_at = case when p_enabled then null else current_timestamp end,
      revision = p_expected_revision + 1,
      last_idempotency_key = p_idempotency_key,
      last_request_hash = v_hash;

  insert into quantum_private.weekly_allocation_operator_grant_commands (
    actor_user_id, operator_user_id, school_scope_key, capability, enabled,
    resulting_revision, idempotency_key, request_hash
  ) values (
    v_actor, p_operator_user_id, v_scope, p_capability, p_enabled,
    p_expected_revision + 1, p_idempotency_key, v_hash
  );
  return pg_catalog.jsonb_build_object(
    'operator_user_id', p_operator_user_id,
    'school_scope_key', v_scope,
    'capability', p_capability,
    'enabled', p_enabled,
    'revision', p_expected_revision + 1,
    'replayed', false
  );
end
$$;

revoke all on function public.super_admin_set_weekly_allocation_operator_grant(uuid, text, text, boolean, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.super_admin_set_weekly_allocation_operator_grant(uuid, text, text, boolean, integer, uuid)
  to authenticated;

create or replace function public.service_get_weekly_allocator_input(p_window_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_window public.quantum_weekly_activity_windows%rowtype;
  v_applications jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  select activity_window.* into v_window
  from public.quantum_weekly_activity_windows as activity_window
  where activity_window.id = p_window_id;
  if not found
     or v_window.status <> 'recruiting'
     or v_window.application_closes_at > current_timestamp
     or v_window.starts_at <= current_timestamp then
    raise exception 'weekly_allocation_snapshot_stale';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'application_id', application_row.id,
    'revision', application_row.revision,
    'party_size', application_row.party_size,
    'accepted_member_count', application_row.party_size,
    'members', (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'participant_user_id', member.participant_user_id,
        'gender', member.gender_snapshot,
        'school_scope_key', member.school_scope_key,
        'department_key', member.department_key
      ) order by member.participant_user_id)
      from public.quantum_weekly_application_members as member
      where member.application_id = application_row.id
        and member.consent_status = 'accepted'
        and member.lifecycle_status = 'active'
    )
  ) order by application_row.id), '[]'::jsonb)
  into v_applications
  from public.quantum_weekly_applications as application_row
  join public.quantum_weekly_application_candidates as candidate
    on candidate.application_id = application_row.id
   and candidate.window_id = v_window.id
  where application_row.status = 'active'
    and application_row.party_size = (
      select pg_catalog.count(*)::integer
      from public.quantum_weekly_application_members as member
      where member.application_id = application_row.id
        and member.consent_status = 'accepted'
        and member.lifecycle_status = 'active'
        and member.school_scope_key = v_window.school_scope_key
        and member.department_key is not null
    );

  return pg_catalog.jsonb_build_object(
    'server_now', current_timestamp,
    'window', pg_catalog.jsonb_build_object(
      'window_id', v_window.id,
      'revision', v_window.revision,
      'school_scope_key', v_window.school_scope_key,
      'capacity', v_window.capacity
    ),
    'applications', v_applications
  );
end
$$;

revoke all on function public.service_get_weekly_allocator_input(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.service_get_weekly_allocator_input(uuid)
  to service_role;

create or replace function public.service_create_weekly_allocation_proposal(
  p_window_id uuid,
  p_expected_window_revision integer,
  p_school_scope_key text,
  p_assignment_plan jsonb,
  p_input_snapshot_hash text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text := quantum_private.canonical_school_scope_key(p_school_scope_key);
  v_window public.quantum_weekly_activity_windows%rowtype;
  v_existing quantum_private.weekly_allocation_proposals%rowtype;
  v_proposal_id uuid;
  v_application_count integer;
  v_unique_application_count integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_window_id is null
     or p_expected_window_revision is null or p_expected_window_revision < 0
     or v_scope is null or v_scope is distinct from p_school_scope_key
     or pg_catalog.jsonb_typeof(p_assignment_plan) <> 'array'
     or pg_catalog.jsonb_array_length(p_assignment_plan) < 1
     or p_input_snapshot_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null then
    raise exception 'invalid_weekly_allocation_proposal';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_assignment_plan) as room(value)
    where pg_catalog.jsonb_typeof(room.value) <> 'object'
       or pg_catalog.jsonb_typeof(room.value -> 'applications') <> 'array'
       or pg_catalog.jsonb_array_length(room.value -> 'applications') < 1
       or exists (
         select 1
         from pg_catalog.jsonb_array_elements(room.value -> 'applications') as application(value)
         where (application.value ->> 'application_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or (application.value ->> 'expected_revision') !~ '^[0-9]+$'
            or (application.value ->> 'assignment_idempotency_key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       )
  ) then raise exception 'invalid_weekly_assignment_plan'; end if;

  select pg_catalog.count(*)::integer,
         pg_catalog.count(distinct application.value ->> 'application_id')::integer
  into v_application_count, v_unique_application_count
  from pg_catalog.jsonb_array_elements(p_assignment_plan) as room(value)
  cross join lateral pg_catalog.jsonb_array_elements(room.value -> 'applications') as application(value);
  if v_application_count <> v_unique_application_count then
    raise exception 'duplicate_weekly_application_assignment';
  end if;

  select proposal.* into v_existing
  from quantum_private.weekly_allocation_proposals as proposal
  where proposal.create_idempotency_key = p_idempotency_key;
  if found then
    if v_existing.window_id <> p_window_id
       or v_existing.window_revision <> p_expected_window_revision
       or v_existing.school_scope_key <> v_scope
       or v_existing.assignment_plan <> p_assignment_plan
       or v_existing.input_snapshot_hash <> p_input_snapshot_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'proposal_id', v_existing.id, 'status', v_existing.status,
      'revision', v_existing.revision, 'replayed', true
    );
  end if;

  select activity_window.* into v_window
  from public.quantum_weekly_activity_windows as activity_window
  where activity_window.id = p_window_id for update;
  if not found
     or v_window.revision <> p_expected_window_revision
     or v_window.school_scope_key <> v_scope
     or v_window.status <> 'recruiting'
     or v_window.application_closes_at > current_timestamp
     or v_window.starts_at <= current_timestamp then
    raise exception 'weekly_allocation_snapshot_stale';
  end if;
  v_proposal_id := pg_catalog.gen_random_uuid();
  insert into quantum_private.weekly_allocation_proposals (
    id, school_scope_key, week_key, window_id, window_revision,
    assignment_plan, input_snapshot_hash, status, revision,
    created_by, create_idempotency_key
  ) values (
    v_proposal_id, v_scope, v_window.week_key, v_window.id, v_window.revision,
    p_assignment_plan, p_input_snapshot_hash, 'proposed', 0,
    null, p_idempotency_key
  );
  return pg_catalog.jsonb_build_object(
    'proposal_id', v_proposal_id, 'status', 'proposed',
    'revision', 0, 'replayed', false
  );
end
$$;

revoke all on function public.service_create_weekly_allocation_proposal(uuid, integer, text, jsonb, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.service_create_weekly_allocation_proposal(uuid, integer, text, jsonb, text, uuid)
  to service_role;

create or replace function public.operator_get_weekly_allocation_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_proposal quantum_private.weekly_allocation_proposals%rowtype;
  v_window public.quantum_weekly_activity_windows%rowtype;
  v_room_count integer;
  v_people_count integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select proposal.* into v_proposal
  from quantum_private.weekly_allocation_proposals as proposal
  where proposal.id = p_proposal_id;
  if not found then raise exception 'weekly_allocation_proposal_not_found'; end if;
  if not exists (
    select 1
    from quantum_private.weekly_allocation_operator_grants as grant_row
    where grant_row.operator_user_id = v_actor
      and grant_row.school_scope_key = v_proposal.school_scope_key
      and grant_row.capability in ('weekly_allocation:review', 'weekly_allocation:execute')
      and grant_row.revoked_at is null
  ) then raise exception 'weekly_allocation_scope_required'; end if;
  select activity_window.* into v_window
  from public.quantum_weekly_activity_windows as activity_window
  where activity_window.id = v_proposal.window_id;
  select pg_catalog.jsonb_array_length(v_proposal.assignment_plan) into v_room_count;
  select pg_catalog.count(distinct member.participant_user_id)::integer
  into v_people_count
  from pg_catalog.jsonb_array_elements(v_proposal.assignment_plan) as room(value)
  cross join lateral pg_catalog.jsonb_array_elements(room.value -> 'applications') as plan_application(value)
  join public.quantum_weekly_application_members as member
    on member.application_id = (plan_application.value ->> 'application_id')::uuid
   and member.consent_status = 'accepted'
   and member.lifecycle_status in ('active', 'assigned');
  return pg_catalog.jsonb_build_object(
    'proposal_id', v_proposal.id,
    'school_scope_key', v_proposal.school_scope_key,
    'week_key', v_proposal.week_key,
    'window_id', v_proposal.window_id,
    'window_revision', v_proposal.window_revision,
    'status', v_proposal.status,
    'revision', v_proposal.revision,
    'activity_id', v_window.activity_id,
    'starts_at', v_window.starts_at,
    'ends_at', v_window.ends_at,
    'location_name', v_window.location_name,
    'room_count', v_room_count,
    'people_count', v_people_count,
    'error_code', v_proposal.error_code
  );
end
$$;

revoke all on function public.operator_get_weekly_allocation_proposal(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.operator_get_weekly_allocation_proposal(uuid)
  to authenticated;

create or replace function public.operator_review_weekly_allocation(
  p_proposal_id uuid,
  p_decision text,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_proposal quantum_private.weekly_allocation_proposals%rowtype;
  v_hash text;
begin
  if p_decision not in ('review', 'reject') or p_idempotency_key is null then
    raise exception 'invalid_weekly_allocation_review';
  end if;
  select proposal.* into v_proposal
  from quantum_private.weekly_allocation_proposals as proposal
  where proposal.id = p_proposal_id for update;
  if not found then raise exception 'weekly_allocation_proposal_not_found'; end if;
  perform quantum_private.require_weekly_allocation_capability(
    v_actor, v_proposal.school_scope_key, 'weekly_allocation:review'
  );
  v_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'proposal_id', p_proposal_id, 'decision', p_decision,
    'expected_revision', p_expected_revision
  )::text);
  if exists (
    select 1 from quantum_private.weekly_allocation_proposal_commands as command
    where command.idempotency_key = p_idempotency_key
      and command.actor_kind = 'operator'
      and command.actor_user_id = v_actor
      and command.request_hash = v_hash
  ) then
    return pg_catalog.jsonb_build_object(
      'proposal_id', v_proposal.id, 'status', v_proposal.status,
      'revision', v_proposal.revision, 'replayed', true
    );
  end if;
  if exists (
    select 1 from quantum_private.weekly_allocation_proposal_commands as command
    where command.idempotency_key = p_idempotency_key
      and command.actor_kind = 'operator'
  ) then raise exception 'idempotency_key_reused'; end if;
  if v_proposal.status <> 'proposed' or v_proposal.revision <> p_expected_revision then
    raise exception 'stale_weekly_allocation_proposal';
  end if;
  update quantum_private.weekly_allocation_proposals
  set status = case when p_decision = 'review' then 'in_review' else 'rejected' end,
      reviewed_by = v_actor, reviewed_at = current_timestamp,
      revision = revision + 1, updated_at = current_timestamp
  where id = p_proposal_id and revision = p_expected_revision;
  insert into quantum_private.weekly_allocation_proposal_commands (
    proposal_id, actor_user_id, actor_kind, action, prior_revision,
    resulting_revision, idempotency_key, request_hash
  ) values (
    p_proposal_id, v_actor, 'operator', p_decision, p_expected_revision,
    p_expected_revision + 1, p_idempotency_key, v_hash
  );
  return pg_catalog.jsonb_build_object(
    'proposal_id', p_proposal_id,
    'status', case when p_decision = 'review' then 'in_review' else 'rejected' end,
    'revision', p_expected_revision + 1,
    'replayed', false
  );
end
$$;

create or replace function public.operator_request_weekly_allocation_execute(
  p_proposal_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_proposal quantum_private.weekly_allocation_proposals%rowtype;
  v_hash text;
begin
  if p_expected_revision is null or p_expected_revision < 0
     or p_idempotency_key is null then
    raise exception 'invalid_weekly_allocation_execute';
  end if;
  select proposal.* into v_proposal
  from quantum_private.weekly_allocation_proposals as proposal
  where proposal.id = p_proposal_id for update;
  if not found then raise exception 'weekly_allocation_proposal_not_found'; end if;
  perform quantum_private.require_weekly_allocation_capability(
    v_actor, v_proposal.school_scope_key, 'weekly_allocation:execute'
  );
  v_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'proposal_id', p_proposal_id, 'expected_revision', p_expected_revision
  )::text);
  if v_proposal.status = 'executing'
     and v_proposal.execute_requested_by = v_actor
     and v_proposal.execute_idempotency_key = p_idempotency_key then
    return pg_catalog.jsonb_build_object(
      'proposal_id', v_proposal.id, 'status', 'executing',
      'revision', v_proposal.revision, 'replayed', true
    );
  end if;
  if exists (
    select 1 from quantum_private.weekly_allocation_proposal_commands as command
    where command.idempotency_key = p_idempotency_key
      and command.actor_kind = 'operator'
  ) then raise exception 'idempotency_key_reused'; end if;
  if v_proposal.status <> 'in_review' or v_proposal.revision <> p_expected_revision then
    raise exception 'stale_weekly_allocation_proposal';
  end if;
  update quantum_private.weekly_allocation_proposals
  set status = 'executing', execute_requested_by = v_actor,
      execute_idempotency_key = p_idempotency_key,
      revision = revision + 1, updated_at = current_timestamp
  where id = p_proposal_id and revision = p_expected_revision;
  insert into quantum_private.weekly_allocation_proposal_commands (
    proposal_id, actor_user_id, actor_kind, action, prior_revision,
    resulting_revision, idempotency_key, request_hash
  ) values (
    p_proposal_id, v_actor, 'operator', 'execute', p_expected_revision,
    p_expected_revision + 1, p_idempotency_key, v_hash
  );
  return pg_catalog.jsonb_build_object(
    'proposal_id', p_proposal_id, 'status', 'executing',
    'revision', p_expected_revision + 1, 'replayed', false
  );
end
$$;

revoke all on function public.operator_review_weekly_allocation(uuid, text, integer, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.operator_request_weekly_allocation_execute(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.operator_review_weekly_allocation(uuid, text, integer, uuid)
  to authenticated;
grant execute on function public.operator_request_weekly_allocation_execute(uuid, integer, uuid)
  to authenticated;

-- Guard the already-reviewed single-party writer too; otherwise a direct
-- internal call could bypass the batch policy.
create or replace function quantum_private.assert_weekly_department_compatibility(
  p_application_id uuid,
  p_occurrence_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.quantum_weekly_application_members as candidate
    where candidate.application_id = p_application_id
      and (candidate.school_scope_key is null or candidate.department_key is null)
  ) then raise exception 'application_department_snapshot_missing'; end if;
  if exists (
    select 1
    from public.quantum_weekly_application_members as candidate
    join public.quantum_weekly_applications as existing_application
      on existing_application.assigned_occurrence_id = p_occurrence_id
     and existing_application.status = 'assigned'
     and existing_application.id <> p_application_id
    join public.quantum_weekly_application_members as existing_member
      on existing_member.application_id = existing_application.id
     and existing_member.lifecycle_status = 'assigned'
    where candidate.application_id = p_application_id
      and candidate.school_scope_key = existing_member.school_scope_key
      and candidate.department_key = existing_member.department_key
  ) then raise exception 'same_department_random_unit'; end if;
  if exists (
    select 1
    from public.quantum_event_participations as participation
    left join lateral quantum_private.get_member_department_identity(participation.user_id)
      as existing_identity on true
    where participation.occurrence_id = p_occurrence_id
      and participation.status in ('recruiting', 'confirmed')
      and not exists (
        select 1
        from public.quantum_weekly_applications as existing_application
        join public.quantum_weekly_application_members as existing_member
          on existing_member.application_id = existing_application.id
         and existing_member.participant_user_id = participation.user_id
        where existing_application.assigned_occurrence_id = p_occurrence_id
          and existing_application.status = 'assigned'
      )
      and (
        existing_identity.school_scope_key is null
        or existing_identity.department_key is null
      )
  ) then raise exception 'existing_department_identity_missing'; end if;
  if exists (
    select 1
    from public.quantum_weekly_application_members as candidate
    join public.quantum_event_participations as participation
      on participation.occurrence_id = p_occurrence_id
     and participation.status in ('recruiting', 'confirmed')
    join lateral quantum_private.get_member_department_identity(participation.user_id)
      as existing_identity on true
    where candidate.application_id = p_application_id
      and candidate.school_scope_key = existing_identity.school_scope_key
      and candidate.department_key = existing_identity.department_key
      and not exists (
        select 1
        from public.quantum_weekly_applications as existing_application
        join public.quantum_weekly_application_members as existing_member
          on existing_member.application_id = existing_application.id
         and existing_member.participant_user_id = participation.user_id
        where existing_application.assigned_occurrence_id = p_occurrence_id
          and existing_application.status = 'assigned'
      )
  ) then raise exception 'same_department_random_unit'; end if;
end
$$;

revoke all on function quantum_private.assert_weekly_department_compatibility(uuid, uuid)
  from public, anon, authenticated, service_role;

alter function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  set schema quantum_private;
alter function quantum_private.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  rename to assign_weekly_party_for_service_guarded_20260906130343;
revoke all on function quantum_private.assign_weekly_party_for_service_guarded_20260906130343(uuid, uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;

create function public.assign_weekly_party_for_service(
  p_application_id uuid,
  p_window_id uuid,
  p_occurrence_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  v_result := quantum_private.assign_weekly_party_for_service_guarded_20260906130343(
    p_application_id, p_window_id, p_occurrence_id,
    p_expected_revision, p_idempotency_key
  );
  -- The preserved allocator holds the application, participant, window, and
  -- occurrence locks until this transaction ends. Check the resulting room,
  -- not a pre-lock snapshot; an exception rolls the allocator writes back.
  perform quantum_private.assert_weekly_department_compatibility(
    p_application_id, p_occurrence_id
  );
  return v_result;
end
$$;

revoke all on function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  to service_role;

create or replace function public.service_execute_weekly_allocation_batch(
  p_proposal_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal quantum_private.weekly_allocation_proposals%rowtype;
  v_window public.quantum_weekly_activity_windows%rowtype;
  v_room jsonb;
  v_application jsonb;
  v_occurrence_id uuid;
  v_room_number integer;
  v_room_code text;
  v_receipts jsonb := '[]'::jsonb;
  v_room_people integer;
  v_room_male integer;
  v_room_female integer;
  v_error text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  select proposal.* into v_proposal
  from quantum_private.weekly_allocation_proposals as proposal
  where proposal.id = p_proposal_id for update;
  if not found then raise exception 'weekly_allocation_proposal_not_found'; end if;
  if v_proposal.status = 'completed'
     and v_proposal.execute_idempotency_key = p_idempotency_key then
    return v_proposal.receipt || pg_catalog.jsonb_build_object('replayed', true);
  end if;
  if v_proposal.status in ('failed', 'stale')
     and v_proposal.execute_idempotency_key = p_idempotency_key then
    return pg_catalog.jsonb_build_object(
      'proposal_id', p_proposal_id,
      'status', v_proposal.status,
      'error', v_proposal.error_code,
      'replayed', true
    );
  end if;
  if v_proposal.status <> 'executing'
     or v_proposal.revision <> p_expected_revision
     or v_proposal.execute_idempotency_key <> p_idempotency_key then
    raise exception 'stale_weekly_allocation_proposal';
  end if;

  begin
    select activity_window.* into v_window
    from public.quantum_weekly_activity_windows as activity_window
    where activity_window.id = v_proposal.window_id for update;
    if not found or v_window.revision <> v_proposal.window_revision
       or v_window.school_scope_key <> v_proposal.school_scope_key
       or v_window.status <> 'recruiting'
       or v_window.application_closes_at > current_timestamp
       or v_window.starts_at <= current_timestamp then
      raise exception 'weekly_allocation_snapshot_stale';
    end if;
    select coalesce(pg_catalog.max(occurrence.room_number), 0)
    into v_room_number
    from public.quantum_event_occurrences as occurrence
    where occurrence.event_id = v_window.activity_id
      and occurrence.starts_at = v_window.starts_at;

    for v_room in select value from pg_catalog.jsonb_array_elements(v_proposal.assignment_plan)
    loop
      if pg_catalog.jsonb_typeof(v_room -> 'applications') <> 'array' then
        raise exception 'invalid_weekly_assignment_plan';
      end if;
      v_room_number := v_room_number + 1;
      v_occurrence_id := pg_catalog.gen_random_uuid();
      v_room_code := pg_catalog.upper(pg_catalog.substr(
        pg_catalog.replace(v_occurrence_id::text, '-', ''), 1, 6
      ));
      insert into public.quantum_event_occurrences (
        id, event_id, event_mode, starts_at, ends_at, application_closes_at,
        location_name, male_capacity, female_capacity, required_total, status,
        room_number, room_code
      ) values (
        v_occurrence_id, v_window.activity_id, 'scheduled', v_window.starts_at,
        v_window.ends_at, v_window.application_closes_at, v_window.location_name,
        3, 2, 5, 'recruiting', v_room_number, v_room_code
      );

      for v_application in
        select value from pg_catalog.jsonb_array_elements(v_room -> 'applications')
      loop
        perform public.assign_weekly_party_for_service(
          (v_application ->> 'application_id')::uuid,
          v_window.id,
          v_occurrence_id,
          (v_application ->> 'expected_revision')::integer,
          (v_application ->> 'assignment_idempotency_key')::uuid
        );
      end loop;

      select
        pg_catalog.count(*)::integer,
        pg_catalog.count(*) filter (where room_person.gender = 'male')::integer,
        pg_catalog.count(*) filter (where room_person.gender = 'female')::integer
      into v_room_people, v_room_male, v_room_female
      from private.quantum_event_room_people(v_occurrence_id) as room_person;
      if v_room_people <> 5 or v_room_male <> 3 or v_room_female <> 2 then
        raise exception 'weekly_room_composition_invalid';
      end if;
      v_receipts := v_receipts || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'occurrence_id', v_occurrence_id,
          'room_number', v_room_number,
          'room_code', v_room_code,
          'people_count', v_room_people
        )
      );
    end loop;

    update public.quantum_weekly_activity_windows
    set status = 'assigned', revision = revision + 1,
        updated_at = current_timestamp
    where id = v_window.id and revision = v_proposal.window_revision;
    if not found then raise exception 'weekly_allocation_snapshot_stale'; end if;
    update quantum_private.weekly_allocation_proposals
    set status = 'completed', revision = revision + 1,
        receipt = pg_catalog.jsonb_build_object(
          'proposal_id', p_proposal_id, 'rooms', v_receipts, 'replayed', false
        ), completed_at = current_timestamp, updated_at = current_timestamp
    where id = p_proposal_id and revision = p_expected_revision;
    if not found then raise exception 'stale_weekly_allocation_proposal'; end if;
    insert into quantum_private.weekly_allocation_proposal_commands (
      proposal_id, actor_user_id, actor_kind, action, prior_revision,
      resulting_revision, idempotency_key, request_hash
    ) values (
      p_proposal_id, null, 'service', 'complete', p_expected_revision,
      p_expected_revision + 1, p_idempotency_key,
      pg_catalog.md5(pg_catalog.jsonb_build_object(
        'proposal_id', p_proposal_id, 'action', 'complete',
        'expected_revision', p_expected_revision
      )::text)
    );
    return pg_catalog.jsonb_build_object(
      'proposal_id', p_proposal_id, 'rooms', v_receipts, 'replayed', false
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    update quantum_private.weekly_allocation_proposals
    set status = case when v_error = 'weekly_allocation_snapshot_stale' then 'stale' else 'failed' end,
        error_code = v_error, revision = revision + 1, updated_at = current_timestamp
    where id = p_proposal_id and revision = p_expected_revision;
    if found then
      insert into quantum_private.weekly_allocation_proposal_commands (
        proposal_id, actor_user_id, actor_kind, action, prior_revision,
        resulting_revision, idempotency_key, request_hash
      ) values (
        p_proposal_id, null, 'service', 'fail', p_expected_revision,
        p_expected_revision + 1, p_idempotency_key,
        pg_catalog.md5(pg_catalog.jsonb_build_object(
          'proposal_id', p_proposal_id, 'action', 'fail',
          'expected_revision', p_expected_revision, 'error', v_error
        )::text)
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'proposal_id', p_proposal_id, 'error', v_error,
      'status', case when v_error = 'weekly_allocation_snapshot_stale' then 'stale' else 'failed' end
    );
  end;
end
$$;

revoke all on function public.service_execute_weekly_allocation_batch(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.service_execute_weekly_allocation_batch(uuid, integer, uuid)
  to service_role;

comment on function quantum_private.get_member_department_identity(uuid) is
  'Private normalized signup identity. No row means the caller must fail closed; this is not a catalog verification.';
comment on function public.get_my_tonight_participation_summary(uuid) is
  'Exact same-school active Tonight applicant totals. No participant identities are returned.';
comment on function public.service_execute_weekly_allocation_batch(uuid, integer, uuid) is
  'Service-only transaction: all planned rooms and accepted parties commit together or all allocation writes roll back.';

commit;
