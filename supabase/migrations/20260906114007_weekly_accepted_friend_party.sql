-- Restore indivisible accepted-friend parties for weekly applications.
-- This is forward-only. The already-applied weekly base migration remains
-- untouched, and remote/local application is a separate owner action.

alter table public.quantum_weekly_applications
  add column if not exists party_type text not null default 'solo',
  add column if not exists party_group_id uuid references public.groups(id) on delete restrict,
  add column if not exists party_size smallint not null default 1,
  add column if not exists roster_snapshot_hash text,
  add column if not exists cancellation_kind text,
  add column if not exists withdrawn_by uuid references public.users(id) on delete restrict;

update public.quantum_weekly_applications as application
set party_type = 'solo',
    party_group_id = null,
    party_size = 1,
    roster_snapshot_hash = pg_catalog.md5(
      'solo|' || application.user_id::text || '|' || application.week_key::text
    )
where application.roster_snapshot_hash is null;

alter table public.quantum_weekly_applications
  alter column roster_snapshot_hash set not null,
  drop constraint if exists quantum_weekly_applications_status_check,
  drop constraint if exists quantum_weekly_applications_party_type_check,
  drop constraint if exists quantum_weekly_applications_party_size_check,
  drop constraint if exists quantum_weekly_applications_party_shape_check,
  drop constraint if exists quantum_weekly_applications_cancellation_kind_check;

alter table public.quantum_weekly_applications
  add constraint quantum_weekly_applications_status_check check (
    status in ('awaiting_consents', 'active', 'assigned', 'cancelled', 'expired')
  ),
  add constraint quantum_weekly_applications_party_type_check check (
    party_type in ('solo', 'friends')
  ),
  add constraint quantum_weekly_applications_party_size_check check (
    party_size between 1 and 3
  ),
  add constraint quantum_weekly_applications_party_shape_check check (
    (party_type = 'solo' and party_group_id is null and party_size = 1)
    or (party_type = 'friends' and party_group_id is not null and party_size between 2 and 3)
  ),
  add constraint quantum_weekly_applications_cancellation_kind_check check (
    cancellation_kind is null or cancellation_kind in ('owner_cancelled', 'party_member_withdrew')
  );

drop index if exists public.quantum_weekly_one_live_application_idx;
create unique index quantum_weekly_one_live_application_idx
  on public.quantum_weekly_applications (user_id, week_key)
  where status in ('awaiting_consents', 'active', 'assigned');

create table public.quantum_weekly_application_members (
  application_id uuid not null references public.quantum_weekly_applications(id) on delete cascade,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  week_key date not null check (extract(isodow from week_key) = 1),
  role text not null check (role in ('owner', 'member')),
  consent_status text not null check (consent_status in ('pending', 'accepted', 'withdrawn')),
  lifecycle_status text not null check (
    lifecycle_status in ('awaiting_consents', 'active', 'assigned', 'cancelled', 'expired')
  ),
  school_snapshot text not null check (pg_catalog.char_length(pg_catalog.btrim(school_snapshot)) between 1 and 120),
  gender_snapshot text not null check (gender_snapshot in ('male', 'female')),
  roster_snapshot_hash text not null check (roster_snapshot_hash ~ '^[0-9a-f]{32}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  consent_idempotency_key uuid,
  consent_request_hash text check (consent_request_hash is null or consent_request_hash ~ '^[0-9a-f]{32}$'),
  consented_at timestamptz,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (application_id, participant_user_id),
  unique (participant_user_id, consent_idempotency_key),
  check ((consent_status = 'accepted') = (consented_at is not null)),
  check ((consent_idempotency_key is null) = (consent_request_hash is null))
);

create unique index quantum_weekly_member_one_live_application_idx
  on public.quantum_weekly_application_members (participant_user_id, week_key)
  where lifecycle_status in ('awaiting_consents', 'active', 'assigned');

create index quantum_weekly_application_members_application_idx
  on public.quantum_weekly_application_members (application_id, lifecycle_status, participant_user_id);

create table public.quantum_weekly_party_commands (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.quantum_weekly_applications(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (action in ('apply', 'accept', 'withdraw', 'cancel')),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  idempotency_key uuid not null,
  prior_revision integer not null check (prior_revision >= 0),
  resulting_revision integer not null check (resulting_revision >= prior_revision),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_user_id, idempotency_key)
);

alter table public.quantum_weekly_application_members enable row level security;
alter table public.quantum_weekly_party_commands enable row level security;
revoke all on table public.quantum_weekly_application_members from public, anon, authenticated, service_role;
revoke all on table public.quantum_weekly_party_commands from public, anon, authenticated, service_role;
revoke all on sequence public.quantum_weekly_party_commands_id_seq from public, anon, authenticated, service_role;

insert into public.quantum_weekly_application_members (
  application_id, participant_user_id, week_key, role, consent_status,
  lifecycle_status, school_snapshot, gender_snapshot, roster_snapshot_hash,
  request_hash, consented_at
)
select
  application.id,
  application.user_id,
  application.week_key,
  'owner',
  'accepted',
  application.status,
  profile.school,
  profile.gender,
  application.roster_snapshot_hash,
  application.request_hash,
  application.created_at
from public.quantum_weekly_applications as application
join public.profiles as profile on profile.user_id = application.user_id
where nullif(pg_catalog.btrim(profile.school), '') is not null
  and profile.gender in ('male', 'female')
on conflict (application_id, participant_user_id) do nothing;

do $$
begin
  if exists (
    select 1
    from public.quantum_weekly_applications as application
    left join public.quantum_weekly_application_members as member
      on member.application_id = application.id
     and member.participant_user_id = application.user_id
    where member.application_id is null
  ) then
    raise exception 'weekly_solo_member_backfill_failed';
  end if;
end
$$;

create or replace function quantum_private.weekly_party_group_roster_hash(p_group_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.md5(
    p_group_id::text || '|' || pg_catalog.string_agg(member.user_id::text, ',' order by member.user_id)
  )
  from public.group_members as member
  where member.group_id = p_group_id
    and member.left_at is null
$$;

revoke all on function quantum_private.weekly_party_group_roster_hash(uuid)
  from public, anon, authenticated, service_role;

create or replace function quantum_private.weekly_party_member_is_eligible(
  p_user_id uuid,
  p_school text,
  p_gender text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from quantum_private.resolve_profile_readiness(p_user_id) as readiness
    join quantum_private.community_member_profiles as community
      on community.user_id = p_user_id
    join public.profiles as profile
      on profile.user_id = p_user_id
    where readiness.matching_ready
      and community.school_scope = 'pnu_self_selected'
      and community.community_gender in ('male', 'female')
      and profile.gender = community.community_gender
      and profile.gender = p_gender
      and pg_catalog.lower(pg_catalog.btrim(profile.school))
          = pg_catalog.lower(pg_catalog.btrim(p_school))
  )
$$;

revoke all on function quantum_private.weekly_party_member_is_eligible(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function quantum_private.weekly_party_members_are_accepted_friends(
  p_application_id uuid,
  p_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.quantum_weekly_application_members as member
    where member.application_id = p_application_id
      and member.participant_user_id <> p_owner_id
      and not exists (
        select 1
        from public.friendships as friendship
        join public.friend_requests as request
          on request.id = friendship.created_from_request_id
         and request.status = 'accepted'
         and least(request.sender_user_id, request.receiver_user_id)
             = least(p_owner_id, member.participant_user_id)
         and greatest(request.sender_user_id, request.receiver_user_id)
             = greatest(p_owner_id, member.participant_user_id)
        where friendship.user_id = least(p_owner_id, member.participant_user_id)
          and friendship.friend_user_id = greatest(p_owner_id, member.participant_user_id)
          and friendship.status = 'active'
      )
  )
$$;

revoke all on function quantum_private.weekly_party_members_are_accepted_friends(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_weekly_activity_discovery_v2(p_week_key date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_windows jsonb;
  v_application jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_week_key is null or extract(isodow from p_week_key) <> 1 then
    raise exception 'invalid_week_key';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', activity_window.id,
    'activity_id', activity_window.activity_id,
    'activity_kind', activity_window.activity_kind,
    'week_key', activity_window.week_key,
    'title', activity_window.title,
    'summary', activity_window.summary,
    'starts_at', activity_window.starts_at,
    'ends_at', activity_window.ends_at,
    'application_closes_at', activity_window.application_closes_at,
    'location_name', activity_window.location_name,
    'capacity', activity_window.capacity,
    'status', activity_window.status,
    'activity_snapshot', activity_window.activity_snapshot,
    'assigned_count', (
      select pg_catalog.count(*)::integer
      from public.quantum_weekly_application_members as assigned_member
      join public.quantum_weekly_applications as assigned
        on assigned.id = assigned_member.application_id
      where assigned.assigned_window_id = activity_window.id
        and assigned.status = 'assigned'
        and assigned_member.lifecycle_status = 'assigned'
    )
  ) order by activity_window.starts_at, activity_window.id), '[]'::jsonb)
  into v_windows
  from public.quantum_weekly_activity_windows as activity_window
  where activity_window.week_key = p_week_key
    and (
      (activity_window.status = 'recruiting'
       and activity_window.application_closes_at > pg_catalog.clock_timestamp())
      or exists (
        select 1
        from public.quantum_weekly_applications as assigned
        join public.quantum_weekly_application_members as assigned_member
          on assigned_member.application_id = assigned.id
        where assigned_member.participant_user_id = v_actor
          and assigned.assigned_window_id = activity_window.id
          and assigned.status = 'assigned'
      )
    );

  select pg_catalog.jsonb_build_object(
    'id', application.id,
    'activity_id', application.activity_id,
    'week_key', application.week_key,
    'status', application.status,
    'assigned_window_id', application.assigned_window_id,
    'assigned_occurrence_id', application.assigned_occurrence_id,
    'revision', application.revision,
    'candidate_window_ids', (
      select coalesce(
        pg_catalog.jsonb_agg(candidate.window_id order by candidate.preference_rank),
        '[]'::jsonb
      )
      from public.quantum_weekly_application_candidates as candidate
      where candidate.application_id = application.id
    ),
    'party', pg_catalog.jsonb_build_object(
      'type', application.party_type,
      'size', application.party_size,
      'accepted_count', (
        select pg_catalog.count(*)::integer
        from public.quantum_weekly_application_members as accepted
        where accepted.application_id = application.id
          and accepted.consent_status = 'accepted'
      ),
      'pending_count', (
        select pg_catalog.count(*)::integer
        from public.quantum_weekly_application_members as pending
        where pending.application_id = application.id
          and pending.consent_status = 'pending'
      ),
      'my_role', mine.role,
      'my_consent_status', mine.consent_status,
      'cancellation_kind', application.cancellation_kind
    )
  )
  into v_application
  from public.quantum_weekly_applications as application
  join public.quantum_weekly_application_members as mine
    on mine.application_id = application.id
   and mine.participant_user_id = v_actor
  where application.week_key = p_week_key
  order by
    case when application.status in ('awaiting_consents', 'active', 'assigned') then 0 else 1 end,
    application.updated_at desc,
    application.id desc
  limit 1;

  return pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.clock_timestamp(),
    'week_key', p_week_key,
    'windows', v_windows,
    'application', v_application
  );
end
$$;

create or replace function public.apply_to_my_weekly_activity_v2(
  p_activity_id text,
  p_week_key date,
  p_candidate_window_ids uuid[],
  p_party_group_id uuid,
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
  v_request_hash text;
  v_existing public.quantum_weekly_applications%rowtype;
  v_application_id uuid;
  v_candidate_ids uuid[];
  v_member_ids uuid[];
  v_member_id uuid;
  v_party_type text;
  v_party_size integer;
  v_school text;
  v_gender text;
  v_roster_snapshot_hash text;
  v_initial_status text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_activity_id is null or p_activity_id !~ '^[a-z0-9][a-z0-9-]{0,79}$'
     or p_week_key is null or extract(isodow from p_week_key) <> 1
     or p_idempotency_key is null or p_candidate_window_ids is null
     or pg_catalog.cardinality(p_candidate_window_ids) not between 1 and 14 then
    raise exception 'invalid_weekly_application';
  end if;

  select pg_catalog.array_agg(distinct selected.window_id order by selected.window_id)
  into v_candidate_ids
  from pg_catalog.unnest(p_candidate_window_ids) as selected(window_id);
  if pg_catalog.cardinality(v_candidate_ids) <> pg_catalog.cardinality(p_candidate_window_ids) then
    raise exception 'duplicate_candidate_window';
  end if;

  if p_party_group_id is null then
    v_party_type := 'solo';
    v_member_ids := array[v_actor];
    select profile.school, profile.gender into v_school, v_gender
    from public.profiles as profile where profile.user_id = v_actor;
    v_roster_snapshot_hash := pg_catalog.md5(
      'solo|' || v_actor::text || '|' || p_week_key::text
    );
  else
    v_party_type := 'friends';
    perform 1
    from public.groups as group_row
    where group_row.id = p_party_group_id
      and group_row.leader_user_id = v_actor
      and group_row.status in ('forming', 'ready')
    for update;
    if not found then raise exception 'friend_group_leader_required'; end if;

    select pg_catalog.array_agg(member.user_id order by member.user_id)
    into v_member_ids
    from public.group_members as member
    where member.group_id = p_party_group_id
      and member.left_at is null;
    if v_member_ids is null
       or pg_catalog.cardinality(v_member_ids) not between 2 and 3 then
      raise exception 'friend_group_member_count';
    end if;
    if not (v_actor = any(v_member_ids)) then raise exception 'friend_group_required'; end if;

    select profile.school, profile.gender into v_school, v_gender
    from public.profiles as profile where profile.user_id = v_actor;
    v_roster_snapshot_hash := quantum_private.weekly_party_group_roster_hash(p_party_group_id);
  end if;

  if nullif(pg_catalog.btrim(v_school), '') is null
     or v_gender not in ('male', 'female') then
    raise exception 'matching_profile_not_ready';
  end if;
  v_party_size := pg_catalog.cardinality(v_member_ids);

  foreach v_member_id in array v_member_ids loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'weekly:' || v_member_id::text || ':' || p_week_key::text,
      0
    ));
  end loop;

  v_request_hash := pg_catalog.md5(
    p_activity_id || ':' || p_week_key::text || ':'
    || coalesce(p_party_group_id::text, 'solo') || ':'
    || pg_catalog.array_to_string(v_candidate_ids, ',') || ':'
    || v_roster_snapshot_hash
  );

  select application.* into v_existing
  from public.quantum_weekly_applications as application
  where application.user_id = v_actor
    and application.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.request_hash <> v_request_hash then raise exception 'idempotency_key_reused'; end if;
    return public.get_my_weekly_activity_discovery_v2(p_week_key);
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(v_candidate_ids) as selected(window_id)
    left join public.quantum_weekly_activity_windows as activity_window
      on activity_window.id = selected.window_id
    where activity_window.id is null
       or activity_window.activity_id <> p_activity_id
       or activity_window.week_key <> p_week_key
       or activity_window.status <> 'recruiting'
       or activity_window.application_closes_at <= v_now
       or activity_window.starts_at <= v_now
  ) then raise exception 'weekly_window_unavailable'; end if;

  foreach v_member_id in array v_member_ids loop
    if not quantum_private.weekly_party_member_is_eligible(v_member_id, v_school, v_gender) then
      raise exception 'matching_profile_not_ready';
    end if;
    if p_party_group_id is not null and v_member_id <> v_actor and not exists (
      select 1
      from public.friendships as friendship
      join public.friend_requests as request
        on request.id = friendship.created_from_request_id
       and request.status = 'accepted'
       and least(request.sender_user_id, request.receiver_user_id)
           = least(v_actor, v_member_id)
       and greatest(request.sender_user_id, request.receiver_user_id)
           = greatest(v_actor, v_member_id)
      where friendship.user_id = least(v_actor, v_member_id)
        and friendship.friend_user_id = greatest(v_actor, v_member_id)
        and friendship.status = 'active'
    ) then raise exception 'accepted_friend_required'; end if;
  end loop;

  v_initial_status := case when v_party_type = 'solo' then 'active' else 'awaiting_consents' end;
  insert into public.quantum_weekly_applications (
    user_id, activity_id, week_key, status, idempotency_key, request_hash,
    party_type, party_group_id, party_size, roster_snapshot_hash
  ) values (
    v_actor, p_activity_id, p_week_key, v_initial_status, p_idempotency_key,
    v_request_hash, v_party_type, p_party_group_id, v_party_size,
    v_roster_snapshot_hash
  ) returning id into v_application_id;

  insert into public.quantum_weekly_application_candidates (
    application_id, window_id, preference_rank
  )
  select v_application_id, selected.window_id, selected.ordinality::smallint
  from pg_catalog.unnest(v_candidate_ids) with ordinality as selected(window_id, ordinality);

  insert into public.quantum_weekly_application_members (
    application_id, participant_user_id, week_key, role, consent_status,
    lifecycle_status, school_snapshot, gender_snapshot, roster_snapshot_hash,
    request_hash, consented_at
  )
  select
    v_application_id,
    member.user_id,
    p_week_key,
    case when member.user_id = v_actor then 'owner' else 'member' end,
    case when member.user_id = v_actor then 'accepted' else 'pending' end,
    v_initial_status,
    profile.school,
    profile.gender,
    v_roster_snapshot_hash,
    v_request_hash,
    case when member.user_id = v_actor then v_now else null end
  from pg_catalog.unnest(v_member_ids) as member(user_id)
  join public.profiles as profile on profile.user_id = member.user_id;

  insert into public.quantum_weekly_party_commands (
    application_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision
  ) values (
    v_application_id, v_actor, 'apply', v_request_hash, p_idempotency_key, 0, 0
  );

  return public.get_my_weekly_activity_discovery_v2(p_week_key);
end
$$;

create or replace function public.set_my_weekly_party_consent(
  p_application_id uuid,
  p_decision text,
  p_expected_revision integer,
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
  v_application public.quantum_weekly_applications%rowtype;
  v_member public.quantum_weekly_application_members%rowtype;
  v_command public.quantum_weekly_party_commands%rowtype;
  v_request_hash text;
  v_next_status text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_application_id is null or p_decision not in ('accept', 'withdraw')
     or p_expected_revision is null or p_expected_revision < 0
     or p_idempotency_key is null then
    raise exception 'invalid_party_consent';
  end if;
  v_request_hash := pg_catalog.md5(
    p_application_id::text || ':' || p_decision || ':' || p_expected_revision::text
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'weekly-application:' || p_application_id::text,
    0
  ));

  select application.* into v_application
  from public.quantum_weekly_applications as application
  where application.id = p_application_id
  for update;
  if v_application.id is null then raise exception 'weekly_application_not_found'; end if;

  select command.* into v_command
  from public.quantum_weekly_party_commands as command
  where command.actor_user_id = v_actor
    and command.idempotency_key = p_idempotency_key;
  if v_command.id is not null then
    if v_command.application_id <> p_application_id
       or v_command.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return public.get_my_weekly_activity_discovery_v2(v_application.week_key);
  end if;

  select member.* into v_member
  from public.quantum_weekly_application_members as member
  where member.application_id = p_application_id
    and member.participant_user_id = v_actor
  for update;
  if v_member.application_id is null then raise exception 'party_member_required'; end if;
  if v_application.status = 'assigned' then raise exception 'assigned_application_cannot_cancel'; end if;
  if v_application.status not in ('awaiting_consents', 'active') then
    raise exception 'weekly_application_not_open';
  end if;
  if v_application.revision <> p_expected_revision then raise exception 'stale_revision'; end if;

  if p_decision = 'withdraw' then
    update public.quantum_weekly_application_members
    set consent_status = case
          when participant_user_id = v_actor then 'withdrawn'
          else consent_status
        end,
        consented_at = case
          when participant_user_id = v_actor then null
          else consented_at
        end,
        lifecycle_status = 'cancelled',
        revision = revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where application_id = p_application_id;
    update public.quantum_weekly_applications
    set status = 'cancelled', cancellation_kind = 'party_member_withdrew',
        withdrawn_by = v_actor, revision = revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where id = p_application_id and revision = p_expected_revision;
    if not found then raise exception 'stale_revision'; end if;
    insert into public.quantum_weekly_party_commands (
      application_id, actor_user_id, action, request_hash, idempotency_key,
      prior_revision, resulting_revision
    ) values (
      p_application_id, v_actor, 'withdraw', v_request_hash, p_idempotency_key,
      p_expected_revision, p_expected_revision + 1
    );
    return public.get_my_weekly_activity_discovery_v2(v_application.week_key);
  end if;

  if v_application.party_type <> 'friends' or v_application.party_group_id is null then
    raise exception 'friend_party_required';
  end if;
  if quantum_private.weekly_party_group_roster_hash(v_application.party_group_id)
     is distinct from v_application.roster_snapshot_hash then
    raise exception 'party_roster_changed';
  end if;
  if not exists (
    select 1 from public.groups as group_row
    where group_row.id = v_application.party_group_id
      and group_row.leader_user_id = v_application.user_id
      and group_row.status in ('forming', 'ready')
  ) then raise exception 'friend_group_not_ready'; end if;
  if exists (
    select 1
    from public.quantum_weekly_application_members as member
    where member.application_id = p_application_id
      and (
        member.roster_snapshot_hash <> v_application.roster_snapshot_hash
        or member.request_hash <> v_application.request_hash
        or not quantum_private.weekly_party_member_is_eligible(
          member.participant_user_id,
          member.school_snapshot,
          member.gender_snapshot
        )
      )
  ) then raise exception 'party_snapshot_changed'; end if;
  if not quantum_private.weekly_party_members_are_accepted_friends(
    p_application_id,
    v_application.user_id
  ) then raise exception 'accepted_friend_required'; end if;

  update public.quantum_weekly_application_members
  set consent_status = 'accepted', consented_at = pg_catalog.clock_timestamp(),
      consent_idempotency_key = p_idempotency_key,
      consent_request_hash = v_request_hash,
      revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where application_id = p_application_id
    and participant_user_id = v_actor;

  if not exists (
    select 1
    from public.quantum_weekly_application_members as member
    where member.application_id = p_application_id
      and member.consent_status <> 'accepted'
  ) then
    v_next_status := 'active';
  else
    v_next_status := 'awaiting_consents';
  end if;

  update public.quantum_weekly_applications
  set status = v_next_status, revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_application_id and revision = p_expected_revision;
  if not found then raise exception 'stale_revision'; end if;
  update public.quantum_weekly_application_members
  set lifecycle_status = v_next_status,
      updated_at = pg_catalog.clock_timestamp()
  where application_id = p_application_id;

  insert into public.quantum_weekly_party_commands (
    application_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision
  ) values (
    p_application_id, v_actor, 'accept', v_request_hash, p_idempotency_key,
    p_expected_revision, p_expected_revision + 1
  );
  return public.get_my_weekly_activity_discovery_v2(v_application.week_key);
end
$$;

create or replace function public.cancel_my_weekly_activity_application_v2(
  p_application_id uuid,
  p_expected_revision integer,
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
  v_application public.quantum_weekly_applications%rowtype;
  v_command public.quantum_weekly_party_commands%rowtype;
  v_request_hash text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_application_id is null or p_expected_revision is null
     or p_expected_revision < 0 or p_idempotency_key is null then
    raise exception 'invalid_cancel_request';
  end if;
  v_request_hash := pg_catalog.md5(
    p_application_id::text || ':cancel:' || p_expected_revision::text
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'weekly-application:' || p_application_id::text,
    0
  ));
  select application.* into v_application
  from public.quantum_weekly_applications as application
  where application.id = p_application_id
    and application.user_id = v_actor
  for update;
  if v_application.id is null then raise exception 'weekly_application_not_found'; end if;

  select command.* into v_command
  from public.quantum_weekly_party_commands as command
  where command.actor_user_id = v_actor
    and command.idempotency_key = p_idempotency_key;
  if v_command.id is not null then
    if v_command.application_id <> p_application_id
       or v_command.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return public.get_my_weekly_activity_discovery_v2(v_application.week_key);
  end if;

  if v_application.status = 'assigned' then raise exception 'assigned_application_cannot_cancel'; end if;
  if v_application.status not in ('awaiting_consents', 'active') then
    raise exception 'weekly_application_not_open';
  end if;
  if v_application.revision <> p_expected_revision then raise exception 'stale_revision'; end if;

  update public.quantum_weekly_applications
  set status = 'cancelled', cancellation_kind = 'owner_cancelled',
      revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = p_application_id and revision = p_expected_revision;
  if not found then raise exception 'stale_revision'; end if;
  update public.quantum_weekly_application_members
  set lifecycle_status = 'cancelled', revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where application_id = p_application_id;

  insert into public.quantum_weekly_party_commands (
    application_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision
  ) values (
    p_application_id, v_actor, 'cancel', v_request_hash, p_idempotency_key,
    p_expected_revision, p_expected_revision + 1
  );
  return public.get_my_weekly_activity_discovery_v2(v_application.week_key);
end
$$;

create or replace function public.assign_weekly_party_for_service(
  p_application_id uuid,
  p_window_id uuid,
  p_occurrence_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_application public.quantum_weekly_applications%rowtype;
  v_window public.quantum_weekly_activity_windows%rowtype;
  v_occurrence public.quantum_event_occurrences%rowtype;
  v_member record;
  v_party_size integer;
  v_gender text;
  v_gender_variant_count integer;
  v_school_variant_count integer;
  v_gender_count integer;
  v_roster_count integer;
  v_assigned_seat_count integer;
  v_upsert_count integer;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_application_id is null or p_window_id is null or p_occurrence_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or p_idempotency_key is null then
    raise exception 'invalid_assignment_request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'weekly-application:' || p_application_id::text,
    0
  ));
  select application.* into v_application
  from public.quantum_weekly_applications as application
  where application.id = p_application_id
  for update;
  if v_application.id is null then raise exception 'assignment_not_found'; end if;

  if v_application.status = 'assigned' then
    if v_application.assigned_window_id = p_window_id
       and v_application.assigned_occurrence_id = p_occurrence_id
       and v_application.assignment_idempotency_key = p_idempotency_key then
      return pg_catalog.jsonb_build_object(
        'application_id', v_application.id,
        'assigned_occurrence_id', p_occurrence_id,
        'party_size', v_application.party_size,
        'replayed', true
      );
    end if;
    raise exception 'application_already_assigned';
  end if;
  if v_application.status <> 'active'
     or v_application.revision <> p_expected_revision then
    raise exception 'stale_assignment';
  end if;

  -- `leave_group` and `remove_group_member` lock the group before mutating its
  -- active roster. Holding the same group/member locks prevents a consented
  -- snapshot from changing between validation and assignment commit. The group
  -- lock also conflicts with the FK key-share lock used by a concurrent member
  -- insert.
  if v_application.party_type = 'friends' then
    perform 1
    from public.groups as group_row
    where group_row.id = v_application.party_group_id
      and group_row.leader_user_id = v_application.user_id
      and group_row.status in ('forming', 'ready')
    for update;
    if not found then raise exception 'party_roster_changed'; end if;

    perform 1
    from public.group_members as group_member
    where group_member.group_id = v_application.party_group_id
      and group_member.left_at is null
    order by group_member.user_id
    for update;

    if quantum_private.weekly_party_group_roster_hash(v_application.party_group_id)
       is distinct from v_application.roster_snapshot_hash then
      raise exception 'party_roster_changed';
    end if;
  end if;

  -- Legacy event participation takes the caller lock before the other party
  -- locks, so two callers can request the same UUID set in different orders.
  -- Try-lock every UUID in a stable order and fail the whole RPC for retry rather
  -- than waiting into a cross-order advisory deadlock. Any locks acquired by the
  -- failed statement are released with its transaction rollback.
  for v_member in
    select member.participant_user_id
    from public.quantum_weekly_application_members as member
    where member.application_id = p_application_id
    order by member.participant_user_id
  loop
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
      'quantum-event-user|' || v_member.participant_user_id::text,
      0
    )) then
      raise exception 'weekly_assignment_retry';
    end if;
  end loop;

  select pg_catalog.count(*)::integer,
         pg_catalog.min(member.gender_snapshot),
         pg_catalog.count(distinct member.gender_snapshot)::integer,
         pg_catalog.count(distinct pg_catalog.lower(pg_catalog.btrim(member.school_snapshot)))::integer
  into v_party_size, v_gender, v_gender_variant_count, v_school_variant_count
  from public.quantum_weekly_application_members as member
  where member.application_id = p_application_id
    and member.lifecycle_status = 'active'
    and member.consent_status = 'accepted';
  if v_party_size <> v_application.party_size
     or v_gender not in ('male', 'female')
     or v_gender_variant_count <> 1
     or v_school_variant_count <> 1 then
    raise exception 'all_party_consents_required';
  end if;

  for v_member in
    select member.*
    from public.quantum_weekly_application_members as member
    where member.application_id = p_application_id
    order by member.participant_user_id
    for update
  loop
    if v_member.roster_snapshot_hash <> v_application.roster_snapshot_hash
       or v_member.request_hash <> v_application.request_hash
       or v_member.lifecycle_status <> 'active'
       or v_member.consent_status <> 'accepted'
       or not public.is_profile_matching_ready(v_member.participant_user_id)
       or not quantum_private.weekly_party_member_is_eligible(
         v_member.participant_user_id,
         v_member.school_snapshot,
         v_member.gender_snapshot
       ) then
      raise exception 'party_snapshot_changed';
    end if;
  end loop;

  if v_application.party_type = 'friends' then
    -- `remove_friend_and_exclude` updates this exact friendship row. Locking
    -- both the active friendship and its accepted source request keeps the
    -- accepted-friend proof stable through commit.
    perform 1
    from public.friendships as friendship
    join public.friend_requests as request
      on request.id = friendship.created_from_request_id
     and request.status = 'accepted'
    join public.quantum_weekly_application_members as member
      on member.application_id = p_application_id
     and member.participant_user_id <> v_application.user_id
     and friendship.user_id = least(v_application.user_id, member.participant_user_id)
     and friendship.friend_user_id = greatest(v_application.user_id, member.participant_user_id)
    where friendship.status = 'active'
    order by friendship.user_id, friendship.friend_user_id
    for update of friendship, request;

    if not quantum_private.weekly_party_members_are_accepted_friends(
      p_application_id,
      v_application.user_id
    ) then raise exception 'accepted_friend_required'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'weekly-window:' || p_window_id::text,
    0
  ));
  select activity_window.* into v_window
  from public.quantum_weekly_activity_windows as activity_window
  where activity_window.id = p_window_id
  for update;
  select occurrence.* into v_occurrence
  from public.quantum_event_occurrences as occurrence
  where occurrence.id = p_occurrence_id
  for update;
  if v_window.id is null or v_occurrence.id is null then
    raise exception 'assignment_not_found';
  end if;

  if v_application.activity_id <> v_window.activity_id
     or v_application.week_key <> v_window.week_key then
    raise exception 'application_window_mismatch';
  end if;
  if not exists (
    select 1
    from public.quantum_weekly_application_candidates as candidate
    where candidate.application_id = p_application_id
      and candidate.window_id = p_window_id
  ) then raise exception 'window_not_selected'; end if;
  if v_window.status <> 'recruiting'
     or v_window.application_closes_at > pg_catalog.clock_timestamp()
     or v_window.starts_at <= pg_catalog.clock_timestamp() then
    raise exception 'window_not_assignable';
  end if;
  if v_occurrence.event_mode <> 'scheduled'
     or v_occurrence.event_id is distinct from v_window.activity_id
     or v_occurrence.starts_at is distinct from v_window.starts_at
     or v_occurrence.ends_at is distinct from v_window.ends_at
     or v_occurrence.application_closes_at is distinct from v_window.application_closes_at
     or v_occurrence.location_name is distinct from v_window.location_name
     or v_occurrence.status <> 'recruiting'
     or v_occurrence.required_total not between 5 and 6
     or v_occurrence.required_total > v_window.capacity then
    raise exception 'occurrence_window_mismatch';
  end if;
  if exists (
    select 1
    from public.quantum_weekly_applications as assigned
    where assigned.assigned_occurrence_id = p_occurrence_id
      and assigned.assigned_window_id <> p_window_id
      and assigned.status = 'assigned'
  ) then raise exception 'occurrence_window_mismatch'; end if;

  select pg_catalog.count(*)::integer into v_assigned_seat_count
  from public.quantum_weekly_application_members as assigned_member
  join public.quantum_weekly_applications as assigned
    on assigned.id = assigned_member.application_id
  where assigned.assigned_window_id = p_window_id
    and assigned.status = 'assigned'
    and assigned_member.lifecycle_status = 'assigned';
  if v_assigned_seat_count + v_party_size > v_window.capacity then
    raise exception 'window_capacity_full';
  end if;

  select pg_catalog.count(*)::integer,
         pg_catalog.count(*) filter (where room_person.gender = v_gender)::integer
  into v_roster_count, v_gender_count
  from private.quantum_event_room_people(p_occurrence_id) as room_person;
  if v_roster_count + v_party_size > v_occurrence.required_total then
    raise exception 'window_capacity_full';
  end if;
  if (v_gender = 'male' and v_gender_count + v_party_size > v_occurrence.male_capacity)
     or (v_gender = 'female' and v_gender_count + v_party_size > v_occurrence.female_capacity) then
    raise exception 'occurrence_gender_capacity_full';
  end if;

  if exists (
    select 1
    from public.quantum_weekly_application_members as member
    join public.quantum_event_participations as participation
      on participation.user_id = member.participant_user_id
    join public.quantum_event_occurrences as occurrence
      on occurrence.id = participation.occurrence_id
    where member.application_id = p_application_id
      and participation.status in ('recruiting', 'confirmed')
      and occurrence.status in ('recruiting', 'assignment', 'confirmed')
      and pg_catalog.tstzrange(occurrence.starts_at, occurrence.ends_at, '[)')
          && pg_catalog.tstzrange(v_window.starts_at, v_window.ends_at, '[)')
  ) or exists (
    select 1
    from public.quantum_weekly_application_members as member
    join public.quantum_continuation_occurrence_members as continuation_member
      on continuation_member.participant_user_id = member.participant_user_id
    join public.quantum_continuation_occurrences as occurrence
      on occurrence.id = continuation_member.occurrence_id
    where member.application_id = p_application_id
      and continuation_member.attendance_status <> 'cancelled'
      and occurrence.status in ('confirmed', 'in_progress')
      and pg_catalog.tstzrange(occurrence.starts_at, occurrence.ends_at, '[)')
          && pg_catalog.tstzrange(v_window.starts_at, v_window.ends_at, '[)')
  ) then raise exception 'confirmed_schedule_conflict'; end if;

  insert into public.quantum_event_participations (
    user_id, event_id, event_mode, party_type, group_id, occurrence_id,
    status, match_id, cancel_reason, completed_at
  )
  select
    member.participant_user_id,
    v_window.activity_id,
    'scheduled',
    v_application.party_type,
    v_application.party_group_id,
    p_occurrence_id,
    'recruiting',
    null,
    null,
    null
  from public.quantum_weekly_application_members as member
  where member.application_id = p_application_id
  order by member.participant_user_id
  on conflict (user_id) do update
    set event_id = excluded.event_id,
        event_mode = excluded.event_mode,
        party_type = excluded.party_type,
        group_id = excluded.group_id,
        occurrence_id = excluded.occurrence_id,
        status = 'recruiting',
        match_id = null,
        cancel_reason = null,
        completed_at = null,
        updated_at = pg_catalog.clock_timestamp()
    where public.quantum_event_participations.status = 'cancelled'
       or (
         public.quantum_event_participations.status = 'recruiting'
         and public.quantum_event_participations.occurrence_id = p_occurrence_id
         and public.quantum_event_participations.event_mode = 'scheduled'
       );
  get diagnostics v_upsert_count = row_count;
  if v_upsert_count <> v_party_size then raise exception 'event_state_locked'; end if;

  update public.quantum_weekly_applications
  set status = 'assigned', assigned_window_id = p_window_id,
      assigned_occurrence_id = p_occurrence_id,
      assignment_idempotency_key = p_idempotency_key,
      revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = p_application_id and revision = p_expected_revision;
  if not found then raise exception 'stale_assignment'; end if;
  update public.quantum_weekly_application_members
  set lifecycle_status = 'assigned', revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where application_id = p_application_id;
  update public.quantum_event_occurrences
  set roster_revision = roster_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_occurrence_id;

  return pg_catalog.jsonb_build_object(
    'application_id', p_application_id,
    'assigned_occurrence_id', p_occurrence_id,
    'party_size', v_party_size,
    'replayed', false
  );
end
$$;

-- Weekly assigned parties use their immutable application snapshot rather than
-- the mutable group_members roster. Legacy non-weekly friend participation keeps
-- the existing active-group behavior.
create or replace function private.quantum_event_room_people(p_occurrence_id uuid)
returns table (
  participant_user_id uuid,
  gender text,
  school text
)
language sql
stable
set search_path = ''
as $$
  select participation.user_id, profile.gender, profile.school
  from public.quantum_event_participations as participation
  join public.profiles as profile on profile.user_id = participation.user_id
  where participation.occurrence_id = p_occurrence_id
    and participation.status in ('recruiting', 'confirmed')
    and participation.party_type = 'solo'
  union
  select member.participant_user_id, member.gender_snapshot, member.school_snapshot
  from public.quantum_weekly_applications as application
  join public.quantum_weekly_application_members as member
    on member.application_id = application.id
   and member.lifecycle_status = 'assigned'
  where application.assigned_occurrence_id = p_occurrence_id
    and application.status = 'assigned'
    and application.party_type = 'friends'
  union
  select group_member.user_id, profile.gender, profile.school
  from public.quantum_event_participations as participation
  join public.group_members as group_member
    on group_member.group_id = participation.group_id
   and group_member.left_at is null
  join public.profiles as profile on profile.user_id = group_member.user_id
  where participation.occurrence_id = p_occurrence_id
    and participation.status in ('recruiting', 'confirmed')
    and participation.party_type = 'friends'
    and not exists (
      select 1
      from public.quantum_weekly_applications as weekly
      where weekly.assigned_occurrence_id = p_occurrence_id
        and weekly.party_group_id = participation.group_id
        and weekly.status = 'assigned'
    )
$$;

revoke all on function private.quantum_event_room_people(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.apply_to_my_weekly_activity(text, date, uuid[], uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_my_weekly_activity_application(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.assign_weekly_application_for_service(uuid, uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.get_my_weekly_activity_discovery_v2(date)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_to_my_weekly_activity_v2(text, date, uuid[], uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.set_my_weekly_party_consent(uuid, text, integer, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_my_weekly_activity_application_v2(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_weekly_activity_discovery_v2(date)
  to authenticated;
grant execute on function public.apply_to_my_weekly_activity_v2(text, date, uuid[], uuid, uuid)
  to authenticated;
grant execute on function public.set_my_weekly_party_consent(uuid, text, integer, uuid)
  to authenticated;
grant execute on function public.cancel_my_weekly_activity_application_v2(uuid, integer, uuid)
  to authenticated;
grant execute on function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  to service_role;
