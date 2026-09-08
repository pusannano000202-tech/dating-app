-- G7/G8 integration draft. Parent integration must place this after the shared
-- department identity contract that defines:
--   quantum_private.get_member_department_identity(uuid)
-- This file is intentionally not a migration and has not been applied to a DB.

alter table public.activity_meetups
  add column scope_type text not null default 'school',
  add column school_scope_key text,
  add column department_key text,
  add column department_label text,
  add column activity_key text,
  add column ends_at timestamptz,
  add column revision integer not null default 0,
  add column shared_guide_step text,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancel_reason text;

alter table public.activity_meetups
  add constraint activity_meetups_scope_type_check check (scope_type in ('school', 'department')),
  add constraint activity_meetups_department_scope_check check (
    (scope_type = 'school' and school_scope_key is null and department_key is null and department_label is null)
    or
    (scope_type = 'department' and school_scope_key is not null and department_key is not null and department_label is not null)
  ),
  add constraint activity_meetups_end_time_check check (ends_at is null or ends_at > scheduled_at),
  add constraint activity_meetups_revision_check check (revision >= 0),
  add constraint activity_meetups_shared_guide_step_check check (
    shared_guide_step is null or shared_guide_step in ('prepare', 'gather', 'greet', 'start', 'activity', 'wrap', 'next')
  ),
  add constraint activity_meetups_cancel_reason_check check (
    cancel_reason is null or pg_catalog.char_length(pg_catalog.btrim(cancel_reason)) between 2 and 240
  );

alter table public.activity_meetup_members
  add column school_scope_key_snapshot text,
  add column department_key_snapshot text,
  add column membership_revision integer not null default 0;

create table public.activity_meetup_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  meetup_id uuid not null references public.activity_meetups(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (action in ('created', 'member_joined', 'member_left', 'schedule_changed', 'cancelled', 'completed', 'shared_guide_advanced')),
  request_hash text not null check (pg_catalog.char_length(request_hash) between 32 and 128),
  idempotency_key uuid not null,
  prior_revision integer not null check (prior_revision >= 0),
  resulting_revision integer not null check (resulting_revision >= prior_revision),
  public_payload jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(public_payload) = 'object'),
  result jsonb not null check (pg_catalog.jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_user_id, idempotency_key)
);

create table public.activity_meetup_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  meetup_id uuid not null references public.activity_meetups(id) on delete restrict,
  sender_user_id uuid not null references public.users(id) on delete restrict,
  idempotency_key uuid not null,
  message text not null check (pg_catalog.char_length(pg_catalog.btrim(message)) between 1 and 1000),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (meetup_id, sender_user_id, idempotency_key)
);

create table public.activity_meetup_guide_progress (
  meetup_id uuid not null references public.activity_meetups(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  acknowledged_step text check (acknowledged_step is null or acknowledged_step in ('prepare', 'gather', 'greet', 'start', 'activity', 'wrap', 'next')),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (meetup_id, user_id)
);

create table public.activity_meetup_personal_actions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  meetup_id uuid not null references public.activity_meetups(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (action in ('acknowledge', 'report_late', 'request_help', 'take_break')),
  note text not null default '' check (pg_catalog.char_length(note) <= 240),
  scene_id text,
  idempotency_key uuid not null,
  resulting_personal_revision integer not null check (resulting_personal_revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_user_id, idempotency_key)
);

create table public.department_challenges (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school text not null,
  school_scope_key text not null,
  category text not null check (category in ('soccer', 'gaming')),
  title text not null check (pg_catalog.char_length(pg_catalog.btrim(title)) between 4 and 80),
  rules text not null default '' check (pg_catalog.char_length(rules) <= 2000),
  team_capacity smallint not null check (team_capacity between 2 and 20),
  status text not null default 'recruiting' check (status in ('recruiting', 'opponent_pending', 'scheduled', 'result_pending', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  ends_at timestamptz,
  place_name text check (place_name is null or pg_catalog.char_length(pg_catalog.btrim(place_name)) between 2 and 80),
  first_score integer check (first_score between 0 and 999),
  second_score integer check (second_score between 0 and 999),
  revision integer not null default 0 check (revision >= 0),
  created_by uuid not null references public.users(id) on delete restrict,
  cancelled_by uuid references public.users(id) on delete restrict,
  cancel_reason text check (cancel_reason is null or pg_catalog.char_length(pg_catalog.btrim(cancel_reason)) between 2 and 240),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check ((scheduled_at is null and ends_at is null and place_name is null) or (scheduled_at is not null and ends_at > scheduled_at and place_name is not null)),
  check ((status = 'completed') = (first_score is not null and second_score is not null))
);

create table public.department_challenge_teams (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  side text not null check (side in ('challenger', 'opponent')),
  department_key text not null,
  department_label text not null check (pg_catalog.char_length(pg_catalog.btrim(department_label)) between 1 and 120),
  captain_user_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'accepted' check (status in ('accepted', 'cancelled')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (challenge_id, side),
  unique (challenge_id, department_key)
);

create table public.department_challenge_roster (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  team_id uuid not null references public.department_challenge_teams(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  status text not null check (status in ('requested', 'accepted', 'declined', 'left')),
  department_key_snapshot text not null,
  revision integer not null default 0 check (revision >= 0),
  requested_at timestamptz not null default pg_catalog.clock_timestamp(),
  accepted_at timestamptz,
  left_at timestamptz,
  unique (challenge_id, user_id)
);

create table public.department_challenge_schedule_confirmations (
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  team_id uuid not null references public.department_challenge_teams(id) on delete restrict,
  captain_user_id uuid not null references public.users(id) on delete restrict,
  scheduled_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > scheduled_at),
  place_name text not null check (pg_catalog.char_length(pg_catalog.btrim(place_name)) between 2 and 80),
  idempotency_key uuid not null,
  confirmed_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (challenge_id, team_id)
);

create table public.department_challenge_result_confirmations (
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  team_id uuid not null references public.department_challenge_teams(id) on delete restrict,
  captain_user_id uuid not null references public.users(id) on delete restrict,
  own_score integer not null check (own_score between 0 and 999),
  opponent_score integer not null check (opponent_score between 0 and 999),
  idempotency_key uuid not null,
  confirmed_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (challenge_id, team_id)
);

create table public.department_challenge_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (action in ('created', 'opponent_accepted', 'roster_requested', 'roster_accepted', 'roster_left', 'schedule_confirmed', 'cancelled', 'result_confirmed')),
  request_hash text not null check (pg_catalog.char_length(request_hash) between 32 and 128),
  idempotency_key uuid not null,
  prior_revision integer not null check (prior_revision >= 0),
  resulting_revision integer not null check (resulting_revision >= prior_revision),
  result jsonb not null check (pg_catalog.jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_user_id, idempotency_key)
);

create index activity_meetup_messages_page_idx on public.activity_meetup_messages (meetup_id, created_at, id);
create index activity_meetup_events_page_idx on public.activity_meetup_events (meetup_id, created_at, id);
create index activity_meetup_personal_actions_actor_idx on public.activity_meetup_personal_actions (meetup_id, actor_user_id, created_at);
create index department_challenges_school_status_idx on public.department_challenges (school, status, created_at desc);
create index department_challenge_roster_team_status_idx on public.department_challenge_roster (team_id, status, requested_at);

alter table public.activity_meetup_events enable row level security;
alter table public.activity_meetup_messages enable row level security;
alter table public.activity_meetup_guide_progress enable row level security;
alter table public.activity_meetup_personal_actions enable row level security;
alter table public.department_challenges enable row level security;
alter table public.department_challenge_teams enable row level security;
alter table public.department_challenge_roster enable row level security;
alter table public.department_challenge_schedule_confirmations enable row level security;
alter table public.department_challenge_result_confirmations enable row level security;
alter table public.department_challenge_events enable row level security;

revoke all on table public.activity_meetup_events from public, anon, authenticated, service_role;
revoke all on table public.activity_meetup_messages from public, anon, authenticated, service_role;
revoke all on table public.activity_meetup_guide_progress from public, anon, authenticated, service_role;
revoke all on table public.activity_meetup_personal_actions from public, anon, authenticated, service_role;
revoke all on table public.department_challenges from public, anon, authenticated, service_role;
revoke all on table public.department_challenge_teams from public, anon, authenticated, service_role;
revoke all on table public.department_challenge_roster from public, anon, authenticated, service_role;
revoke all on table public.department_challenge_schedule_confirmations from public, anon, authenticated, service_role;
revoke all on table public.department_challenge_result_confirmations from public, anon, authenticated, service_role;
revoke all on table public.department_challenge_events from public, anon, authenticated, service_role;

create or replace function quantum_private.activity_meetup_scope_eligible(p_meetup_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_meetup public.activity_meetups%rowtype;
  v_school text;
  v_school_scope_key text;
  v_department_key text;
begin
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  if v_meetup.id is null then return false; end if;
  select identity.school into v_school from quantum_private.get_community_identity(p_user_id) as identity;
  if v_school is distinct from v_meetup.school then return false; end if;
  if v_meetup.scope_type = 'school' then return true; end if;
  select identity.school_scope_key, identity.department_key
    into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(p_user_id) as identity;
  return v_school_scope_key is not null
    and v_department_key is not null
    and v_school_scope_key = v_meetup.school_scope_key
    and v_department_key = v_meetup.department_key;
end
$$;

create or replace function quantum_private.department_challenge_projection(
  p_challenge_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_challenge public.department_challenges%rowtype;
  v_school_scope_key text;
  v_department_key text;
  v_participant boolean;
begin
  select challenge.* into v_challenge
  from public.department_challenges as challenge where challenge.id = p_challenge_id;
  select identity.school_scope_key, identity.department_key
    into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(p_actor) as identity;
  if v_challenge.id is null or v_school_scope_key is null or v_department_key is null
     or v_challenge.school_scope_key <> v_school_scope_key then
    raise exception 'department_challenge_not_found';
  end if;
  select exists (
    select 1 from public.department_challenge_roster as roster
    where roster.challenge_id = p_challenge_id and roster.user_id = p_actor and roster.status = 'accepted'
  ) into v_participant;
  return pg_catalog.jsonb_build_object(
    'id', v_challenge.id,
    'category', v_challenge.category,
    'title', v_challenge.title,
    'rules', v_challenge.rules,
    'status', v_challenge.status,
    'revision', v_challenge.revision,
    'team_capacity', v_challenge.team_capacity,
    'scheduled_at', v_challenge.scheduled_at,
    'ends_at', v_challenge.ends_at,
    'place_name', v_challenge.place_name,
    'can_accept_opponent', v_challenge.status = 'recruiting'
      and not exists (select 1 from public.department_challenge_teams as team where team.challenge_id = p_challenge_id and team.side = 'opponent')
      and not exists (select 1 from public.department_challenge_teams as team where team.challenge_id = p_challenge_id and team.department_key = v_department_key),
    'is_captain', exists (
      select 1 from public.department_challenge_teams as team
      where team.challenge_id = p_challenge_id and team.captain_user_id = p_actor and team.status = 'accepted'
    ),
    'teams', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', team.id,
        'side', team.side,
        'department_label', team.department_label,
        'accepted_count', (
          select pg_catalog.count(*) from public.department_challenge_roster as counted
          where counted.team_id = team.id and counted.status = 'accepted'
        ),
        'capacity', v_challenge.team_capacity,
        'is_captain', team.captain_user_id = p_actor,
        'may_request_roster', v_challenge.status not in ('completed', 'cancelled') and team.department_key = v_department_key,
        'roster', (
          select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', roster.id,
            'alias', quantum_private.activity_meetup_alias(roster.user_id),
            'status', roster.status,
            'is_me', roster.user_id = p_actor
          ) order by roster.requested_at, roster.id), '[]'::jsonb)
          from public.department_challenge_roster as roster
          where roster.team_id = team.id
            and (
              team.captain_user_id = p_actor
              or (v_participant and roster.status = 'accepted')
              or roster.user_id = p_actor
            )
        )
      ) order by team.side), '[]'::jsonb)
      from public.department_challenge_teams as team
      where team.challenge_id = p_challenge_id and team.status = 'accepted'
    ),
    'result', case when v_challenge.status = 'completed' then pg_catalog.jsonb_build_object(
      'first_score', v_challenge.first_score, 'second_score', v_challenge.second_score
    ) else null end
  );
end
$$;

revoke all on function quantum_private.department_challenge_projection(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.create_department_challenge(
  p_category text,
  p_title text,
  p_rules text,
  p_team_capacity integer,
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
  v_school text;
  v_school_scope_key text;
  v_department_key text;
  v_department_label text;
  v_challenge_id uuid;
  v_team_id uuid;
  v_event public.department_challenge_events%rowtype;
  v_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_category not in ('soccer', 'gaming')
     or p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 4 and 80
     or p_rules is null or pg_catalog.char_length(p_rules) > 2000
     or p_team_capacity is null or p_team_capacity not between 2 and 20 then raise exception 'invalid_challenge_input'; end if;
  v_hash := pg_catalog.md5(pg_catalog.concat_ws('|', p_category, pg_catalog.btrim(p_title), p_rules, p_team_capacity::text));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'department-challenge:' || v_actor::text || ':' || p_idempotency_key::text, 0
  ));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'created' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select identity.school into v_school from quantum_private.get_community_identity(v_actor) as identity;
  select identity.school_scope_key, identity.department_key into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  select pg_catalog.btrim(profile.department) into v_department_label
  from quantum_private.community_member_profiles as profile
  where profile.user_id = v_actor;
  if v_school is null or v_school_scope_key is null or v_department_key is null or v_department_label is null then
    raise exception 'department_identity_required';
  end if;
  insert into public.department_challenges (
    school, school_scope_key, category, title, rules, team_capacity, status, created_by
  ) values (
    v_school, v_school_scope_key, p_category, pg_catalog.btrim(p_title), p_rules, p_team_capacity, 'recruiting', v_actor
  ) returning id into v_challenge_id;
  insert into public.department_challenge_teams (
    challenge_id, side, department_key, department_label, captain_user_id
  ) values (v_challenge_id, 'challenger', v_department_key, v_department_label, v_actor)
  returning id into v_team_id;
  insert into public.department_challenge_roster (
    challenge_id, team_id, user_id, status, department_key_snapshot, accepted_at
  ) values (v_challenge_id, v_team_id, v_actor, 'accepted', v_department_key, pg_catalog.clock_timestamp());
  v_result := quantum_private.department_challenge_projection(v_challenge_id, v_actor);
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (v_challenge_id, v_actor, 'created', v_hash, p_idempotency_key, 0, 0, v_result);
  return v_result;
end
$$;

create or replace function public.accept_department_challenge_roster_request(
  p_challenge_id uuid,
  p_roster_id uuid,
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
  v_candidate uuid;
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_roster public.department_challenge_roster%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_actor_school_scope_key text;
  v_actor_department_key text;
  v_candidate_school_scope_key text;
  v_candidate_department_key text;
  v_accepted_count integer;
  v_hash text := pg_catalog.md5(p_challenge_id::text || ':' || p_roster_id::text || ':accept');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null then raise exception 'invalid_idempotency_key'; end if;
  select roster.user_id into v_candidate
  from public.department_challenge_roster as roster
  where roster.id = p_roster_id and roster.challenge_id = p_challenge_id;
  if v_candidate is null then raise exception 'roster_not_found'; end if;
  if v_actor::text < v_candidate::text then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_candidate::text, 0));
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_candidate::text, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  end if;
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'roster_accepted' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  select roster.* into v_roster from public.department_challenge_roster as roster
  where roster.id = p_roster_id and roster.challenge_id = p_challenge_id for update;
  select team.* into v_team from public.department_challenge_teams as team where team.id = v_roster.team_id;
  if v_challenge.id is null or v_roster.id is null or v_team.captain_user_id <> v_actor then raise exception 'roster_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status in ('completed', 'cancelled') or v_roster.status <> 'requested' then raise exception 'roster_not_pending'; end if;
  select identity.school_scope_key, identity.department_key
    into v_actor_school_scope_key, v_actor_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_actor_school_scope_key is null or v_actor_department_key is null
     or v_actor_school_scope_key <> v_challenge.school_scope_key
     or v_actor_department_key <> v_team.department_key then
    raise exception 'department_identity_changed';
  end if;
  select identity.school_scope_key, identity.department_key
    into v_candidate_school_scope_key, v_candidate_department_key
  from quantum_private.get_member_department_identity(v_candidate) as identity;
  if v_candidate_school_scope_key is null or v_candidate_department_key is null
     or v_candidate_school_scope_key <> v_challenge.school_scope_key
     or v_candidate_department_key <> v_team.department_key
     or v_candidate_department_key <> v_roster.department_key_snapshot then
    raise exception 'department_identity_changed';
  end if;
  select pg_catalog.count(*)::integer into v_accepted_count
  from public.department_challenge_roster as roster
  where roster.team_id = v_team.id and roster.status = 'accepted';
  if v_accepted_count >= v_challenge.team_capacity then raise exception 'team_full'; end if;
  update public.department_challenge_roster as roster
  set status = 'accepted', accepted_at = pg_catalog.clock_timestamp(), left_at = null,
      revision = roster.revision + 1
  where roster.id = p_roster_id;
  update public.department_challenges as challenge
  set revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object(
    'roster_id', p_roster_id, 'status', 'accepted',
    'accepted_count', v_accepted_count + 1, 'team_capacity', v_challenge.team_capacity,
    'revision', v_challenge.revision + 1
  );
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'roster_accepted', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.leave_my_department_challenge_roster(
  p_challenge_id uuid,
  p_team_id uuid,
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
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_roster public.department_challenge_roster%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_hash text := pg_catalog.md5(p_challenge_id::text || ':' || p_team_id::text || ':leave');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null then raise exception 'invalid_idempotency_key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'roster_left' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  select team.* into v_team from public.department_challenge_teams as team where team.id = p_team_id and team.challenge_id = p_challenge_id;
  select roster.* into v_roster from public.department_challenge_roster as roster
  where roster.challenge_id = p_challenge_id and roster.team_id = p_team_id and roster.user_id = v_actor for update;
  if v_challenge.id is null or v_team.id is null or v_roster.id is null then raise exception 'roster_not_found'; end if;
  if v_team.captain_user_id = v_actor then raise exception 'captain_cannot_leave'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status in ('completed', 'cancelled') or v_roster.status not in ('requested', 'accepted') then raise exception 'roster_not_active'; end if;
  update public.department_challenge_roster as roster
  set status = 'left', left_at = pg_catalog.clock_timestamp(), revision = roster.revision + 1
  where roster.id = v_roster.id;
  update public.department_challenges as challenge
  set revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object('roster_id', v_roster.id, 'status', 'left', 'revision', v_challenge.revision + 1);
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'roster_left', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.confirm_my_department_challenge_schedule(
  p_challenge_id uuid,
  p_scheduled_at timestamptz,
  p_ends_at timestamptz,
  p_place_name text,
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
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_first public.department_challenge_schedule_confirmations%rowtype;
  v_second public.department_challenge_schedule_confirmations%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_actor_school_scope_key text;
  v_actor_department_key text;
  v_hash text;
  v_published boolean := false;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null
     or p_scheduled_at is null or p_ends_at is null
     or p_scheduled_at < pg_catalog.clock_timestamp() + interval '30 minutes'
     or p_ends_at < p_scheduled_at + interval '30 minutes'
     or p_ends_at > p_scheduled_at + interval '12 hours'
     or p_place_name is null or pg_catalog.char_length(pg_catalog.btrim(p_place_name)) not between 2 and 80 then
    raise exception 'invalid_challenge_schedule';
  end if;
  v_hash := pg_catalog.md5(pg_catalog.concat_ws('|', p_challenge_id::text, p_scheduled_at::text, p_ends_at::text, pg_catalog.btrim(p_place_name)));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'schedule_confirmed' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  select team.* into v_team from public.department_challenge_teams as team
  where team.challenge_id = p_challenge_id and team.captain_user_id = v_actor and team.status = 'accepted';
  if v_challenge.id is null or v_team.id is null then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  select identity.school_scope_key, identity.department_key
    into v_actor_school_scope_key, v_actor_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_actor_school_scope_key is null or v_actor_department_key is null
     or v_actor_school_scope_key <> v_challenge.school_scope_key
     or v_actor_department_key <> v_team.department_key then
    raise exception 'department_identity_changed';
  end if;
  if v_challenge.status not in ('opponent_pending', 'scheduled')
     or (select pg_catalog.count(*) from public.department_challenge_teams as team where team.challenge_id = p_challenge_id and team.status = 'accepted') <> 2 then
    raise exception 'challenge_schedule_not_available';
  end if;
  insert into public.department_challenge_schedule_confirmations (
    challenge_id, team_id, captain_user_id, scheduled_at, ends_at, place_name, idempotency_key, confirmed_at
  ) values (
    p_challenge_id, v_team.id, v_actor, p_scheduled_at, p_ends_at, pg_catalog.btrim(p_place_name), p_idempotency_key, pg_catalog.clock_timestamp()
  ) on conflict (challenge_id, team_id) do update
    set captain_user_id = excluded.captain_user_id, scheduled_at = excluded.scheduled_at,
        ends_at = excluded.ends_at, place_name = excluded.place_name,
        idempotency_key = excluded.idempotency_key, confirmed_at = excluded.confirmed_at;
  select confirmation.* into v_first
  from public.department_challenge_schedule_confirmations as confirmation
  join public.department_challenge_teams as team on team.id = confirmation.team_id
  where confirmation.challenge_id = p_challenge_id and team.side = 'challenger';
  select confirmation.* into v_second
  from public.department_challenge_schedule_confirmations as confirmation
  join public.department_challenge_teams as team on team.id = confirmation.team_id
  where confirmation.challenge_id = p_challenge_id and team.side = 'opponent';
  v_published := v_first.team_id is not null and v_second.team_id is not null
    and v_first.scheduled_at = v_second.scheduled_at
    and v_first.ends_at = v_second.ends_at
    and v_first.place_name = v_second.place_name;
  update public.department_challenges as challenge
  set status = case when v_published then 'scheduled' else 'opponent_pending' end,
      scheduled_at = case when v_published then p_scheduled_at else null end,
      ends_at = case when v_published then p_ends_at else null end,
      place_name = case when v_published then pg_catalog.btrim(p_place_name) else null end,
      revision = challenge.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object(
    'status', case when v_published then 'scheduled' else 'opponent_pending' end,
    'published', v_published, 'revision', v_challenge.revision + 1
  );
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'schedule_confirmed', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.cancel_my_department_challenge(
  p_challenge_id uuid,
  p_reason text,
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
  v_challenge public.department_challenges%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null or p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 2 and 240 then raise exception 'invalid_cancel_reason'; end if;
  v_hash := pg_catalog.md5(p_challenge_id::text || ':' || pg_catalog.btrim(p_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'cancelled' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  if v_challenge.id is null or not exists (
    select 1 from public.department_challenge_teams as team
    where team.challenge_id = p_challenge_id and team.captain_user_id = v_actor and team.status = 'accepted'
  ) then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status in ('completed', 'cancelled') then raise exception 'challenge_closed'; end if;
  update public.department_challenges as challenge
  set status = 'cancelled', cancelled_by = v_actor, cancel_reason = pg_catalog.btrim(p_reason),
      revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object('status', 'cancelled', 'revision', v_challenge.revision + 1);
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'cancelled', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.confirm_my_department_challenge_result(
  p_challenge_id uuid,
  p_own_score integer,
  p_opponent_score integer,
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
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_first public.department_challenge_result_confirmations%rowtype;
  v_second public.department_challenge_result_confirmations%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_actor_school_scope_key text;
  v_actor_department_key text;
  v_hash text := pg_catalog.md5(pg_catalog.concat_ws('|', p_challenge_id::text, p_own_score::text, p_opponent_score::text));
  v_confirmed boolean := false;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null or p_own_score is null or p_opponent_score is null
     or p_own_score not between 0 and 999 or p_opponent_score not between 0 and 999 then raise exception 'invalid_challenge_result'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'result_confirmed' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  select team.* into v_team from public.department_challenge_teams as team
  where team.challenge_id = p_challenge_id and team.captain_user_id = v_actor and team.status = 'accepted';
  if v_challenge.id is null or v_team.id is null then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  select identity.school_scope_key, identity.department_key
    into v_actor_school_scope_key, v_actor_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_actor_school_scope_key is null or v_actor_department_key is null
     or v_actor_school_scope_key <> v_challenge.school_scope_key
     or v_actor_department_key <> v_team.department_key then
    raise exception 'department_identity_changed';
  end if;
  if v_challenge.status not in ('scheduled', 'result_pending') or v_challenge.ends_at > pg_catalog.clock_timestamp() then
    raise exception 'challenge_result_not_available';
  end if;
  insert into public.department_challenge_result_confirmations (
    challenge_id, team_id, captain_user_id, own_score, opponent_score, idempotency_key, confirmed_at
  ) values (
    p_challenge_id, v_team.id, v_actor, p_own_score, p_opponent_score, p_idempotency_key, pg_catalog.clock_timestamp()
  ) on conflict (challenge_id, team_id) do update
    set captain_user_id = excluded.captain_user_id, own_score = excluded.own_score,
        opponent_score = excluded.opponent_score, idempotency_key = excluded.idempotency_key,
        confirmed_at = excluded.confirmed_at;
  select confirmation.* into v_first
  from public.department_challenge_result_confirmations as confirmation
  join public.department_challenge_teams as team on team.id = confirmation.team_id
  where confirmation.challenge_id = p_challenge_id and team.side = 'challenger';
  select confirmation.* into v_second
  from public.department_challenge_result_confirmations as confirmation
  join public.department_challenge_teams as team on team.id = confirmation.team_id
  where confirmation.challenge_id = p_challenge_id and team.side = 'opponent';
  v_confirmed := v_first.team_id is not null and v_second.team_id is not null
    and v_first.own_score = v_second.opponent_score
    and v_first.opponent_score = v_second.own_score;
  update public.department_challenges as challenge
  set status = case when v_confirmed then 'completed' else 'result_pending' end,
      first_score = case when v_confirmed then v_first.own_score else null end,
      second_score = case when v_confirmed then v_first.opponent_score else null end,
      revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object(
    'status', case when v_confirmed then 'completed' else 'result_pending' end,
    'published', v_confirmed,
    'result', case when v_confirmed then pg_catalog.jsonb_build_object('first_score', v_first.own_score, 'second_score', v_first.opponent_score) else null end,
    'revision', v_challenge.revision + 1
  );
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'result_confirmed', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.list_my_department_challenges()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_scope_key text;
  v_department_key text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select identity.school_scope_key, identity.department_key into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_school_scope_key is null or v_department_key is null then raise exception 'department_identity_required'; end if;
  return query
  select quantum_private.department_challenge_projection(challenge.id, v_actor)
  from public.department_challenges as challenge
  where challenge.school_scope_key = v_school_scope_key
  order by challenge.created_at desc
  limit 50;
end
$$;

create or replace function public.get_my_department_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  return quantum_private.department_challenge_projection(p_challenge_id, v_actor);
end
$$;

create or replace function public.accept_department_challenge_opponent(
  p_challenge_id uuid,
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
  v_challenge public.department_challenges%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_school_scope_key text;
  v_department_key text;
  v_department_label text;
  v_team_id uuid;
  v_hash text := pg_catalog.md5(p_challenge_id::text || ':opponent');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null then raise exception 'invalid_idempotency_key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'opponent_accepted' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select identity.school_scope_key, identity.department_key into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  select pg_catalog.btrim(profile.department) into v_department_label
  from quantum_private.community_member_profiles as profile
  where profile.user_id = v_actor;
  if v_school_scope_key is null or v_department_key is null or v_department_label is null then raise exception 'department_identity_required'; end if;
  select challenge.* into v_challenge from public.department_challenges as challenge
  where challenge.id = p_challenge_id for update;
  if v_challenge.id is null or v_challenge.school_scope_key <> v_school_scope_key then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status <> 'recruiting' or exists (
    select 1 from public.department_challenge_teams as team
    where team.challenge_id = p_challenge_id and (team.side = 'opponent' or team.department_key = v_department_key)
  ) then raise exception 'opponent_not_available'; end if;
  insert into public.department_challenge_teams (
    challenge_id, side, department_key, department_label, captain_user_id
  ) values (p_challenge_id, 'opponent', v_department_key, v_department_label, v_actor)
  returning id into v_team_id;
  insert into public.department_challenge_roster (
    challenge_id, team_id, user_id, status, department_key_snapshot, accepted_at
  ) values (p_challenge_id, v_team_id, v_actor, 'accepted', v_department_key, pg_catalog.clock_timestamp());
  update public.department_challenges as challenge
  set status = 'opponent_pending', revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := quantum_private.department_challenge_projection(p_challenge_id, v_actor);
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'opponent_accepted', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.request_department_challenge_roster(
  p_challenge_id uuid,
  p_team_id uuid,
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
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_school_scope_key text;
  v_department_key text;
  v_roster_id uuid;
  v_hash text := pg_catalog.md5(p_challenge_id::text || ':' || p_team_id::text || ':request');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null then raise exception 'invalid_idempotency_key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'roster_requested' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select identity.school_scope_key, identity.department_key into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_school_scope_key is null or v_department_key is null then raise exception 'department_identity_required'; end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  select team.* into v_team from public.department_challenge_teams as team where team.id = p_team_id and team.challenge_id = p_challenge_id;
  if v_challenge.id is null or v_team.id is null or v_challenge.school_scope_key <> v_school_scope_key then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status in ('completed', 'cancelled') or v_team.department_key <> v_department_key then raise exception 'department_restricted'; end if;
  if exists (
    select 1 from public.department_challenge_roster as roster
    where roster.challenge_id = p_challenge_id and roster.user_id = v_actor and roster.status in ('requested', 'accepted')
  ) then raise exception 'roster_already_active'; end if;
  insert into public.department_challenge_roster (
    challenge_id, team_id, user_id, status, department_key_snapshot
  ) values (p_challenge_id, p_team_id, v_actor, 'requested', v_department_key)
  on conflict (challenge_id, user_id) do update
    set team_id = excluded.team_id, status = 'requested', department_key_snapshot = excluded.department_key_snapshot,
        revision = public.department_challenge_roster.revision + 1,
        requested_at = pg_catalog.clock_timestamp(), accepted_at = null, left_at = null
  returning id into v_roster_id;
  update public.department_challenges as challenge
  set revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object('roster_id', v_roster_id, 'status', 'requested', 'revision', v_challenge.revision + 1);
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'roster_requested', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function quantum_private.activity_meetup_alias(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select identity.display_name
  from quantum_private.get_community_identity(p_user_id) as identity
  limit 1
$$;

create or replace function quantum_private.meetup_activity_key_valid(p_category text, p_activity_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_activity_key is null or (p_category, p_activity_key) in (
    ('running', 'oncheon-running'),
    ('badminton', 'evening-badminton'),
    ('basketball', 'night-basketball'),
    ('tennis', 'campus-tennis'),
    ('board_game', 'board-game-round'),
    ('gaming', 'team-gaming'),
    ('hiking', 'geumjeongsan-hiking'),
    ('dining', 'campus-cafe-chat'),
    ('other', 'campus-small-shop'),
    ('walking', 'evening-neighborhood-walk'),
    ('dining', 'evening-dining'),
    ('study', 'major-foundation-study'),
    ('study', 'language-speaking-study'),
    ('study', 'career-certificate-study'),
    ('study', 'portfolio-project-study')
  )
$$;

revoke all on function quantum_private.activity_meetup_scope_eligible(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function quantum_private.activity_meetup_alias(uuid) from public, anon, authenticated, service_role;
revoke all on function quantum_private.meetup_activity_key_valid(text, text) from public, anon, authenticated, service_role;

create or replace function public.create_activity_meetup_v3(
  p_category text,
  p_title text,
  p_description text,
  p_place_name text,
  p_scheduled_at timestamptz,
  p_capacity integer,
  p_gender_mode text,
  p_ends_at timestamptz,
  p_scope_type text,
  p_activity_key text,
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
  v_existing public.activity_meetup_events%rowtype;
  v_hash text;
  v_result jsonb;
  v_meetup_id uuid;
  v_school_scope_key text;
  v_department_key text;
  v_department_label text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_scope_type not in ('school', 'department') then raise exception 'invalid_meetup_scope'; end if;
  if p_ends_at is null or p_scheduled_at is null or p_ends_at < p_scheduled_at + interval '30 minutes' or p_ends_at > p_scheduled_at + interval '24 hours' then
    raise exception 'invalid_end_time';
  end if;
  if not quantum_private.meetup_activity_key_valid(p_category, p_activity_key) then raise exception 'invalid_activity_key'; end if;
  v_hash := pg_catalog.md5(pg_catalog.concat_ws('|', p_category, p_title, p_description, p_place_name, p_scheduled_at::text, p_capacity::text, p_gender_mode, p_ends_at::text, p_scope_type, coalesce(p_activity_key, '')));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-create:' || v_actor::text || ':' || p_idempotency_key::text, 0));
  select event.* into v_existing from public.activity_meetup_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_existing.id is not null then
    if v_existing.action <> 'created' or v_existing.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_existing.result;
  end if;
  if p_scope_type = 'department' then
    select identity.school_scope_key, identity.department_key into v_school_scope_key, v_department_key
    from quantum_private.get_member_department_identity(v_actor) as identity;
    if v_school_scope_key is null or v_department_key is null then raise exception 'department_identity_required'; end if;
    select pg_catalog.btrim(profile.department) into v_department_label
    from quantum_private.community_member_profiles as profile
    where profile.user_id = v_actor;
    if v_department_label is null then raise exception 'department_identity_required'; end if;
  end if;
  v_result := public.create_activity_meetup_v2(p_category, p_title, p_description, p_place_name, p_scheduled_at, p_capacity, p_gender_mode);
  v_meetup_id := (v_result ->> 'id')::uuid;
  update public.activity_meetups as meetup
  set scope_type = p_scope_type,
      school_scope_key = v_school_scope_key,
      department_key = v_department_key,
      department_label = v_department_label,
      activity_key = p_activity_key,
      ends_at = p_ends_at,
      -- NULL lets the read model derive the initial scene from server time.
      -- A host action sets this only when the group explicitly advances it.
      shared_guide_step = null,
      updated_at = pg_catalog.clock_timestamp()
  where meetup.id = v_meetup_id;
  update public.activity_meetup_members as member
  set school_scope_key_snapshot = v_school_scope_key, department_key_snapshot = v_department_key
  where member.meetup_id = v_meetup_id and member.user_id = v_actor;
  v_result := v_result || pg_catalog.jsonb_build_object(
    'scope_type', p_scope_type,
    'department_label', v_department_label,
    'activity_key', p_activity_key,
    'ends_at', p_ends_at,
    'revision', 0
  );
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, public_payload, result
  ) values (
    v_meetup_id, v_actor, 'created', v_hash, p_idempotency_key,
    0, 0, pg_catalog.jsonb_build_object('scope_type', p_scope_type), v_result
  );
  return v_result;
end
$$;

create or replace function public.get_my_activity_meetup_chat(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_joined boolean;
  v_phase text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  select exists (
    select 1 from public.activity_meetup_members as member
    where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
  ) into v_joined;
  if v_meetup.id is null or not v_joined or not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor) then
    raise exception 'meetup_not_found';
  end if;
  v_phase := case when v_meetup.status in ('open', 'full') then 'send' else 'read_only' end;
  return pg_catalog.jsonb_build_object(
    'phase', v_phase,
    'messages', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', message.id,
        'sender_alias', quantum_private.activity_meetup_alias(message.sender_user_id),
        'message', message.message,
        'created_at', message.created_at
      ) order by message.created_at, message.id), '[]'::jsonb)
      from public.activity_meetup_messages as message
      where message.meetup_id = p_meetup_id
        and not exists (
          select 1 from public.friendships as friendship
          where friendship.status = 'blocked'
            and ((friendship.user_id = v_actor and friendship.friend_user_id = message.sender_user_id)
              or (friendship.user_id = message.sender_user_id and friendship.friend_user_id = v_actor))
        )
    )
  );
end
$$;

create or replace function public.send_my_activity_meetup_chat_message(
  p_meetup_id uuid,
  p_message text,
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
  v_meetup public.activity_meetups%rowtype;
  v_message public.activity_meetup_messages%rowtype;
  v_text text := pg_catalog.btrim(p_message);
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or v_text is null or pg_catalog.char_length(v_text) not between 1 and 1000 then
    raise exception 'invalid_chat_message';
  end if;
  if v_text ~* '(https?://|www[.]|[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|instagram|insta[[:space:]_-]*gram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)'
     or pg_catalog.regexp_replace(v_text, '[^0-9]', '', 'g') ~ '01[016789][0-9]{7,8}' then
    raise exception 'contact_sharing_not_allowed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-meetup-chat:' || v_actor::text || ':' || p_idempotency_key::text, 0
  ));
  select message.* into v_message
  from public.activity_meetup_messages as message
  where message.meetup_id = p_meetup_id and message.sender_user_id = v_actor
    and message.idempotency_key = p_idempotency_key
  for update;
  if v_message.id is not null then
    if v_message.message <> v_text then raise exception 'idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object(
      'id', v_message.id, 'sender_alias', quantum_private.activity_meetup_alias(v_actor),
      'message', v_message.message, 'created_at', v_message.created_at, 'phase', 'send', 'reused', true
    );
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  if v_meetup.id is null or v_meetup.status not in ('open', 'full')
     or not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor)
     or not exists (
       select 1 from public.activity_meetup_members as member
       where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
     ) then
    raise exception 'meetup_chat_not_writable';
  end if;
  insert into public.activity_meetup_messages (meetup_id, sender_user_id, idempotency_key, message)
  values (p_meetup_id, v_actor, p_idempotency_key, v_text)
  returning * into v_message;
  return pg_catalog.jsonb_build_object(
    'id', v_message.id, 'sender_alias', quantum_private.activity_meetup_alias(v_actor),
    'message', v_message.message, 'created_at', v_message.created_at, 'phase', 'send', 'reused', false
  );
end
$$;

create or replace function public.get_my_activity_meetup_guide(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_progress public.activity_meetup_guide_progress%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  if v_meetup.id is null or not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor)
     or not exists (
       select 1 from public.activity_meetup_members as member
       where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
     ) then
    raise exception 'meetup_not_found';
  end if;
  select progress.* into v_progress from public.activity_meetup_guide_progress as progress
  where progress.meetup_id = p_meetup_id and progress.user_id = v_actor;
  return pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.clock_timestamp(),
    'category', v_meetup.category,
    'activity_key', v_meetup.activity_key,
    'lifecycle_status', v_meetup.status,
    'scheduled_at', v_meetup.scheduled_at,
    'ends_at', v_meetup.ends_at,
    'shared_step', v_meetup.shared_guide_step,
    'personal_acknowledged_step', v_progress.acknowledged_step,
    'meetup_revision', v_meetup.revision,
    'personal_revision', coalesce(v_progress.revision, 0),
    'is_host', v_meetup.host_user_id = v_actor
  );
end
$$;

create or replace function public.acknowledge_my_activity_meetup_guide(
  p_meetup_id uuid,
  p_scene_id text,
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
  v_meetup public.activity_meetups%rowtype;
  v_progress public.activity_meetup_guide_progress%rowtype;
  v_action public.activity_meetup_personal_actions%rowtype;
  v_revision integer;
  v_current text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null or p_scene_id not in ('prepare', 'gather', 'greet', 'start', 'activity', 'wrap', 'next') then
    raise exception 'invalid_guide_scene';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-meetup-personal:' || v_actor::text || ':' || p_idempotency_key::text, 0
  ));
  select action.* into v_action from public.activity_meetup_personal_actions as action
  where action.actor_user_id = v_actor and action.idempotency_key = p_idempotency_key for update;
  if v_action.id is not null then
    if v_action.meetup_id <> p_meetup_id or v_action.action <> 'acknowledge' or v_action.scene_id <> p_scene_id then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'acknowledged_step', v_action.scene_id,
      'personal_revision', v_action.resulting_personal_revision,
      'reused', true
    );
  end if;
  if not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor)
     or not exists (
       select 1 from public.activity_meetup_members as member
       where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
     ) then raise exception 'meetup_not_found'; end if;
  select meetup.* into v_meetup
  from public.activity_meetups as meetup
  where meetup.id = p_meetup_id
  for share;
  if v_meetup.status = 'cancelled' then raise exception 'meetup_closed'; end if;
  v_current := case
    when v_meetup.status = 'completed' then 'next'
    else coalesce(v_meetup.shared_guide_step, case
      when pg_catalog.clock_timestamp() < v_meetup.scheduled_at - interval '1 hour' then 'prepare'
      when pg_catalog.clock_timestamp() < v_meetup.scheduled_at then 'gather'
      when v_meetup.ends_at is not null and pg_catalog.clock_timestamp() >= v_meetup.ends_at then 'wrap'
      else 'activity'
    end)
  end;
  if p_scene_id <> v_current then raise exception 'guide_scene_not_current'; end if;
  select progress.* into v_progress from public.activity_meetup_guide_progress as progress
  where progress.meetup_id = p_meetup_id and progress.user_id = v_actor for update;
  v_revision := coalesce(v_progress.revision, 0);
  if v_revision <> p_expected_revision then raise exception 'stale_personal_revision'; end if;
  insert into public.activity_meetup_guide_progress (meetup_id, user_id, acknowledged_step, revision, updated_at)
  values (p_meetup_id, v_actor, p_scene_id, v_revision + 1, pg_catalog.clock_timestamp())
  on conflict (meetup_id, user_id) do update
    set acknowledged_step = excluded.acknowledged_step,
        revision = excluded.revision,
        updated_at = excluded.updated_at;
  insert into public.activity_meetup_personal_actions (
    meetup_id, actor_user_id, action, note, scene_id, idempotency_key, resulting_personal_revision
  ) values (p_meetup_id, v_actor, 'acknowledge', '', p_scene_id, p_idempotency_key, v_revision + 1);
  return pg_catalog.jsonb_build_object('acknowledged_step', p_scene_id, 'personal_revision', v_revision + 1, 'reused', false);
end
$$;

create or replace function public.advance_my_activity_meetup_shared_guide(
  p_meetup_id uuid,
  p_scene_id text,
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
  v_meetup public.activity_meetups%rowtype;
  v_event public.activity_meetup_events%rowtype;
  v_current text;
  v_expected text;
  v_hash text := pg_catalog.md5(p_meetup_id::text || ':' || coalesce(p_scene_id, ''));
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null or p_scene_id not in ('gather', 'greet', 'start', 'activity', 'wrap', 'next') then raise exception 'invalid_guide_scene'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-mutation:' || v_actor::text || ':' || p_idempotency_key::text, 0));
  select event.* into v_event from public.activity_meetup_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'shared_guide_advanced' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id for update;
  if v_meetup.id is null or v_meetup.host_user_id <> v_actor then raise exception 'meetup_not_found'; end if;
  if v_meetup.status not in ('open', 'full') then raise exception 'meetup_closed'; end if;
  if v_meetup.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  v_current := coalesce(v_meetup.shared_guide_step, case
    when pg_catalog.clock_timestamp() < v_meetup.scheduled_at - interval '1 hour' then 'prepare'
    when pg_catalog.clock_timestamp() < v_meetup.scheduled_at then 'gather'
    when v_meetup.ends_at is not null and pg_catalog.clock_timestamp() >= v_meetup.ends_at then 'wrap'
    else 'activity'
  end);
  v_expected := case v_current
    when 'prepare' then 'gather' when 'gather' then 'greet' when 'greet' then 'start'
    when 'start' then 'activity' when 'activity' then 'wrap' when 'wrap' then 'next'
    else null end;
  if p_scene_id is distinct from v_expected then raise exception 'invalid_guide_transition'; end if;
  update public.activity_meetups as meetup
  set shared_guide_step = p_scene_id, revision = meetup.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object('shared_step', p_scene_id, 'revision', v_meetup.revision + 1);
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key, prior_revision,
    resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'shared_guide_advanced', v_hash, p_idempotency_key,
    v_meetup.revision, v_meetup.revision + 1,
    pg_catalog.jsonb_build_object('scene_id', p_scene_id), v_result
  );
  return v_result;
end
$$;

create or replace function public.get_my_activity_meetup_personal_actions(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor)
     or not exists (
       select 1 from public.activity_meetup_members as member
       where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
     ) then raise exception 'meetup_not_found'; end if;
  return pg_catalog.jsonb_build_object(
    'actions', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'action', action.action, 'note', action.note, 'created_at', action.created_at
      ) order by action.created_at, action.id), '[]'::jsonb)
      from public.activity_meetup_personal_actions as action
      where action.meetup_id = p_meetup_id and action.actor_user_id = v_actor
        and action.action <> 'acknowledge'
    )
  );
end
$$;

create or replace function public.record_my_activity_meetup_personal_action(
  p_meetup_id uuid,
  p_action text,
  p_note text,
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
  v_meetup public.activity_meetups%rowtype;
  v_action public.activity_meetup_personal_actions%rowtype;
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_action not in ('report_late', 'request_help', 'take_break') or pg_catalog.char_length(v_note) > 240 then
    raise exception 'invalid_personal_action';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-personal:' || v_actor::text || ':' || p_idempotency_key::text, 0));
  select action.* into v_action from public.activity_meetup_personal_actions as action
  where action.actor_user_id = v_actor and action.idempotency_key = p_idempotency_key for update;
  if v_action.id is not null then
    if v_action.meetup_id <> p_meetup_id or v_action.action <> p_action or v_action.note <> v_note then raise exception 'idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object('action', v_action.action, 'created_at', v_action.created_at, 'reused', true);
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  if v_meetup.id is null or v_meetup.status not in ('open', 'full')
     or not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor)
     or not exists (
       select 1 from public.activity_meetup_members as member
       where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
     ) then raise exception 'meetup_personal_action_not_allowed'; end if;
  insert into public.activity_meetup_personal_actions (
    meetup_id, actor_user_id, action, note, scene_id, idempotency_key, resulting_personal_revision
  ) values (p_meetup_id, v_actor, p_action, v_note, null, p_idempotency_key, 0)
  returning * into v_action;
  return pg_catalog.jsonb_build_object('action', v_action.action, 'created_at', v_action.created_at, 'reused', false);
end
$$;

create or replace function public.list_activity_meetups_v3(
  p_category text,
  p_limit integer,
  p_gender_mode text,
  p_scope_type text
)
returns table (
  id uuid, category text, title text, description text, place_name text,
  scheduled_at timestamptz, ends_at timestamptz, capacity smallint, status text,
  member_count bigint, joined boolean, is_host boolean, created_at timestamptz,
  gender_mode text, gender_eligibility text, scope_type text, department_label text,
  activity_key text, revision integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_scope_type is not null and p_scope_type not in ('school', 'department') then raise exception 'invalid_scope_type'; end if;
  select identity.school into v_school from quantum_private.get_community_identity(v_actor) as identity;
  if v_school is null then raise exception 'profile_required'; end if;
  return query
  select meetup.id, meetup.category, meetup.title, meetup.description, meetup.place_name,
    meetup.scheduled_at, meetup.ends_at, meetup.capacity, meetup.status,
    (select pg_catalog.count(*) from public.activity_meetup_members as counted
      where counted.meetup_id = meetup.id and counted.status = 'joined'
        and quantum_private.activity_meetup_scope_eligible(meetup.id, counted.user_id)),
    exists (select 1 from public.activity_meetup_members as mine where mine.meetup_id = meetup.id and mine.user_id = v_actor and mine.status = 'joined'),
    meetup.host_user_id = v_actor,
    meetup.created_at, meetup.gender_mode,
    quantum_private.meetup_gender_eligibility(v_actor, meetup.gender_mode),
    meetup.scope_type, meetup.department_label, meetup.activity_key, meetup.revision
  from public.activity_meetups as meetup
  where meetup.school = v_school
    and meetup.status in ('open', 'full')
    and meetup.scheduled_at > pg_catalog.clock_timestamp()
    and (p_category is null or meetup.category = p_category)
    and (p_gender_mode is null or meetup.gender_mode = p_gender_mode)
    and (p_scope_type is null or meetup.scope_type = p_scope_type)
    and quantum_private.activity_meetup_scope_eligible(meetup.id, v_actor)
  order by meetup.scheduled_at, meetup.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 30));
end
$$;

create or replace function public.get_my_activity_meetup_detail(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_joined boolean;
  v_scope_eligible boolean;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  v_scope_eligible := quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor);
  if v_meetup.id is null or (not v_scope_eligible and v_meetup.host_user_id <> v_actor) then raise exception 'meetup_not_found'; end if;
  select exists (select 1 from public.activity_meetup_members as member where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined') into v_joined;
  return pg_catalog.jsonb_build_object(
    'id', v_meetup.id,
    'category', v_meetup.category,
    'activity_key', v_meetup.activity_key,
    'title', v_meetup.title,
    'description', v_meetup.description,
    'place_name', v_meetup.place_name,
    'scheduled_at', v_meetup.scheduled_at,
    'ends_at', v_meetup.ends_at,
    'capacity', v_meetup.capacity,
    'status', v_meetup.status,
    'gender_mode', v_meetup.gender_mode,
    'scope_type', v_meetup.scope_type,
    'department_label', v_meetup.department_label,
    'revision', v_meetup.revision,
    'joined', v_joined,
    'is_host', v_meetup.host_user_id = v_actor,
    'scope_eligibility', case when v_scope_eligible then 'eligible' else 'department_restricted' end,
    'member_count', (select pg_catalog.count(*) from public.activity_meetup_members as member where member.meetup_id = p_meetup_id and member.status = 'joined' and quantum_private.activity_meetup_scope_eligible(p_meetup_id, member.user_id)),
    'members', case when v_joined or v_meetup.host_user_id = v_actor then (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'alias', quantum_private.activity_meetup_alias(member.user_id),
        'role', member.role
      ) order by member.joined_at, member.user_id), '[]'::jsonb)
      from public.activity_meetup_members as member
      where member.meetup_id = p_meetup_id and member.status = 'joined'
        and quantum_private.activity_meetup_scope_eligible(p_meetup_id, member.user_id)
    ) else '[]'::jsonb end,
    'events', case when v_joined or v_meetup.host_user_id = v_actor then (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'action', event.action,
        'created_at', event.created_at,
        'resulting_revision', event.resulting_revision,
        'public_payload', event.public_payload
      ) order by event.created_at, event.id), '[]'::jsonb)
      from public.activity_meetup_events as event where event.meetup_id = p_meetup_id
    ) else '[]'::jsonb end
  );
end
$$;

-- Existing clients keep these public signatures. The replacement closes the
-- department scope at the database boundary and serializes capacity changes.
create or replace function public.join_activity_meetup(p_meetup_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_member public.activity_meetup_members%rowtype;
  v_member_count integer;
  v_gender_eligibility text;
  v_school_scope_key text;
  v_department_key text;
  v_prior_revision integer;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'quantum:minimum-signup:user:' || v_actor::text, 0
  ));
  select meetup.* into v_meetup
  from public.activity_meetups as meetup
  where meetup.id = p_meetup_id
  for update;
  if v_meetup.id is null or not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor) then
    raise exception 'meetup_not_found';
  end if;
  if v_meetup.status not in ('open', 'full') or v_meetup.scheduled_at <= pg_catalog.clock_timestamp() then
    raise exception 'meetup_closed';
  end if;
  v_gender_eligibility := quantum_private.meetup_gender_eligibility(v_actor, v_meetup.gender_mode);
  if v_gender_eligibility = 'gender_required' then raise exception 'meetup_gender_required'; end if;
  if v_gender_eligibility <> 'eligible' then raise exception 'meetup_gender_restricted'; end if;

  select member.* into v_member
  from public.activity_meetup_members as member
  where member.meetup_id = p_meetup_id and member.user_id = v_actor
  for update;
  if v_member.status = 'joined' then
    return pg_catalog.jsonb_build_object('joined', true, 'reused', true, 'revision', v_meetup.revision);
  end if;
  select pg_catalog.count(*)::integer into v_member_count
  from public.activity_meetup_members as member
  where member.meetup_id = p_meetup_id and member.status = 'joined'
    and quantum_private.activity_meetup_scope_eligible(p_meetup_id, member.user_id);
  if v_member_count >= v_meetup.capacity then raise exception 'meetup_full'; end if;

  if v_meetup.scope_type = 'department' then
    select identity.school_scope_key, identity.department_key
      into v_school_scope_key, v_department_key
    from quantum_private.get_member_department_identity(v_actor) as identity;
    if v_school_scope_key is null or v_department_key is null then raise exception 'department_identity_required'; end if;
  end if;
  insert into public.activity_meetup_members (
    meetup_id, user_id, role, status, joined_at, left_at,
    school_scope_key_snapshot, department_key_snapshot, membership_revision
  ) values (
    p_meetup_id, v_actor, 'member', 'joined', pg_catalog.clock_timestamp(), null,
    v_school_scope_key, v_department_key, 0
  ) on conflict (meetup_id, user_id) do update
    set role = 'member', status = 'joined', joined_at = excluded.joined_at, left_at = null,
        school_scope_key_snapshot = excluded.school_scope_key_snapshot,
        department_key_snapshot = excluded.department_key_snapshot,
        membership_revision = public.activity_meetup_members.membership_revision + 1;

  v_prior_revision := v_meetup.revision;
  v_member_count := v_member_count + 1;
  update public.activity_meetups as meetup
  set status = case when v_member_count >= meetup.capacity then 'full' else 'open' end,
      revision = meetup.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object(
    'joined', true, 'reused', false, 'member_count', v_member_count,
    'revision', v_prior_revision + 1
  );
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'member_joined', pg_catalog.md5(v_actor::text || ':' || (v_prior_revision + 1)::text), pg_catalog.gen_random_uuid(),
    v_prior_revision, v_prior_revision + 1, '{}'::jsonb, v_result
  );
  return v_result;
end
$$;

create or replace function public.leave_activity_meetup(p_meetup_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_prior_revision integer;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'quantum:minimum-signup:user:' || v_actor::text, 0
  ));
  select meetup.* into v_meetup
  from public.activity_meetups as meetup
  where meetup.id = p_meetup_id
  for update;
  if v_meetup.id is null then raise exception 'meetup_not_found'; end if;
  if v_meetup.host_user_id = v_actor then raise exception 'host_cannot_leave'; end if;

  update public.activity_meetup_members as member
  set status = 'left', left_at = pg_catalog.clock_timestamp(),
      membership_revision = member.membership_revision + 1
  where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined';
  if not found then
    return pg_catalog.jsonb_build_object('joined', false, 'reused', true, 'revision', v_meetup.revision);
  end if;
  v_prior_revision := v_meetup.revision;
  update public.activity_meetups as meetup
  set status = case
        when meetup.status = 'full' and meetup.scheduled_at > pg_catalog.clock_timestamp() then 'open'
        else meetup.status
      end,
      revision = meetup.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object('joined', false, 'reused', false, 'revision', v_prior_revision + 1);
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'member_left', pg_catalog.md5(v_actor::text || ':' || (v_prior_revision + 1)::text), pg_catalog.gen_random_uuid(),
    v_prior_revision, v_prior_revision + 1, '{}'::jsonb, v_result
  );
  return v_result;
end
$$;

create or replace function public.update_my_activity_meetup_schedule(
  p_meetup_id uuid,
  p_scheduled_at timestamptz,
  p_ends_at timestamptz,
  p_place_name text,
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
  v_meetup public.activity_meetups%rowtype;
  v_event public.activity_meetup_events%rowtype;
  v_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null
     or p_scheduled_at is null or p_ends_at is null
     or p_scheduled_at < pg_catalog.clock_timestamp() + interval '30 minutes'
     or p_ends_at < p_scheduled_at + interval '30 minutes'
     or p_ends_at > p_scheduled_at + interval '24 hours'
     or p_place_name is null or pg_catalog.char_length(pg_catalog.btrim(p_place_name)) not between 2 and 80 then
    raise exception 'invalid_meetup_schedule';
  end if;
  v_hash := pg_catalog.md5(pg_catalog.concat_ws('|', p_meetup_id::text, p_scheduled_at::text, p_ends_at::text, pg_catalog.btrim(p_place_name)));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-meetup-mutation:' || v_actor::text || ':' || p_idempotency_key::text, 0
  ));
  select event.* into v_event from public.activity_meetup_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'schedule_changed' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id for update;
  if v_meetup.id is null or v_meetup.host_user_id <> v_actor then raise exception 'meetup_not_found'; end if;
  if v_meetup.status not in ('open', 'full') then raise exception 'meetup_closed'; end if;
  if v_meetup.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  update public.activity_meetups as meetup
  set scheduled_at = p_scheduled_at, ends_at = p_ends_at, place_name = pg_catalog.btrim(p_place_name),
      revision = meetup.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object(
    'id', p_meetup_id, 'scheduled_at', p_scheduled_at, 'ends_at', p_ends_at,
    'place_name', pg_catalog.btrim(p_place_name), 'revision', v_meetup.revision + 1
  );
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key, prior_revision,
    resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'schedule_changed', v_hash, p_idempotency_key, v_meetup.revision,
    v_meetup.revision + 1, pg_catalog.jsonb_build_object('scheduled_at', p_scheduled_at, 'ends_at', p_ends_at, 'place_name', pg_catalog.btrim(p_place_name)), v_result
  );
  return v_result;
end
$$;

create or replace function public.cancel_my_activity_meetup(
  p_meetup_id uuid,
  p_reason text,
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
  v_meetup public.activity_meetups%rowtype;
  v_event public.activity_meetup_events%rowtype;
  v_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null or p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 2 and 240 then raise exception 'invalid_cancel_reason'; end if;
  v_hash := pg_catalog.md5(pg_catalog.concat_ws('|', p_meetup_id::text, pg_catalog.btrim(p_reason)));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-mutation:' || v_actor::text || ':' || p_idempotency_key::text, 0));
  select event.* into v_event from public.activity_meetup_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'cancelled' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id for update;
  if v_meetup.id is null or v_meetup.host_user_id <> v_actor then raise exception 'meetup_not_found'; end if;
  if v_meetup.status not in ('open', 'full') then raise exception 'meetup_closed'; end if;
  if v_meetup.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  update public.activity_meetups as meetup
  set status = 'cancelled', cancel_reason = pg_catalog.btrim(p_reason), cancelled_at = pg_catalog.clock_timestamp(),
      revision = meetup.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object('id', p_meetup_id, 'status', 'cancelled', 'revision', v_meetup.revision + 1);
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key, prior_revision,
    resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'cancelled', v_hash, p_idempotency_key, v_meetup.revision,
    v_meetup.revision + 1, pg_catalog.jsonb_build_object('reason', pg_catalog.btrim(p_reason)), v_result
  );
  return v_result;
end
$$;

create or replace function public.complete_my_activity_meetup(
  p_meetup_id uuid,
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
  v_meetup public.activity_meetups%rowtype;
  v_event public.activity_meetup_events%rowtype;
  v_hash text := pg_catalog.md5(p_meetup_id::text || ':complete');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null then raise exception 'invalid_idempotency_key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-mutation:' || v_actor::text || ':' || p_idempotency_key::text, 0));
  select event.* into v_event from public.activity_meetup_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'completed' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id for update;
  if v_meetup.id is null or v_meetup.host_user_id <> v_actor then raise exception 'meetup_not_found'; end if;
  if v_meetup.status not in ('open', 'full') then raise exception 'meetup_closed'; end if;
  if v_meetup.scheduled_at > pg_catalog.clock_timestamp() then raise exception 'meetup_not_started'; end if;
  if v_meetup.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  update public.activity_meetups as meetup
  set status = 'completed', completed_at = pg_catalog.clock_timestamp(), revision = meetup.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object('id', p_meetup_id, 'status', 'completed', 'revision', v_meetup.revision + 1);
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key, prior_revision,
    resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'completed', v_hash, p_idempotency_key, v_meetup.revision,
    v_meetup.revision + 1, '{}'::jsonb, v_result
  );
  return v_result;
end
$$;

-- RPCs are the only public surface. Direct tables remain closed above.
revoke all on function public.create_activity_meetup_v3(text, text, text, text, timestamptz, integer, text, timestamptz, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_activity_meetups_v3(text, integer, text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_my_activity_meetup_detail(uuid) from public, anon, authenticated, service_role;
revoke all on function public.join_activity_meetup(uuid) from public, anon, authenticated, service_role;
revoke all on function public.leave_activity_meetup(uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_my_activity_meetup_schedule(uuid, timestamptz, timestamptz, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancel_my_activity_meetup(uuid, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.complete_my_activity_meetup(uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_my_activity_meetup_chat(uuid) from public, anon, authenticated, service_role;
revoke all on function public.send_my_activity_meetup_chat_message(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_my_activity_meetup_guide(uuid) from public, anon, authenticated, service_role;
revoke all on function public.acknowledge_my_activity_meetup_guide(uuid, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.advance_my_activity_meetup_shared_guide(uuid, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_my_activity_meetup_personal_actions(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_my_activity_meetup_personal_action(uuid, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_department_challenge(text, text, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_my_department_challenges() from public, anon, authenticated, service_role;
revoke all on function public.get_my_department_challenge(uuid) from public, anon, authenticated, service_role;
revoke all on function public.accept_department_challenge_opponent(uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.request_department_challenge_roster(uuid, uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.accept_department_challenge_roster_request(uuid, uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.leave_my_department_challenge_roster(uuid, uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.confirm_my_department_challenge_schedule(uuid, timestamptz, timestamptz, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancel_my_department_challenge(uuid, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.confirm_my_department_challenge_result(uuid, integer, integer, integer, uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_activity_meetup_v3(text, text, text, text, timestamptz, integer, text, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.list_activity_meetups_v3(text, integer, text, text) to authenticated;
grant execute on function public.get_my_activity_meetup_detail(uuid) to authenticated;
grant execute on function public.join_activity_meetup(uuid) to authenticated;
grant execute on function public.leave_activity_meetup(uuid) to authenticated;
grant execute on function public.update_my_activity_meetup_schedule(uuid, timestamptz, timestamptz, text, integer, uuid) to authenticated;
grant execute on function public.cancel_my_activity_meetup(uuid, text, integer, uuid) to authenticated;
grant execute on function public.complete_my_activity_meetup(uuid, integer, uuid) to authenticated;
grant execute on function public.get_my_activity_meetup_chat(uuid) to authenticated;
grant execute on function public.send_my_activity_meetup_chat_message(uuid, text, uuid) to authenticated;
grant execute on function public.get_my_activity_meetup_guide(uuid) to authenticated;
grant execute on function public.acknowledge_my_activity_meetup_guide(uuid, text, integer, uuid) to authenticated;
grant execute on function public.advance_my_activity_meetup_shared_guide(uuid, text, integer, uuid) to authenticated;
grant execute on function public.get_my_activity_meetup_personal_actions(uuid) to authenticated;
grant execute on function public.record_my_activity_meetup_personal_action(uuid, text, text, uuid) to authenticated;
grant execute on function public.create_department_challenge(text, text, text, integer, uuid) to authenticated;
grant execute on function public.list_my_department_challenges() to authenticated;
grant execute on function public.get_my_department_challenge(uuid) to authenticated;
grant execute on function public.accept_department_challenge_opponent(uuid, integer, uuid) to authenticated;
grant execute on function public.request_department_challenge_roster(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.accept_department_challenge_roster_request(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.leave_my_department_challenge_roster(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.confirm_my_department_challenge_schedule(uuid, timestamptz, timestamptz, text, integer, uuid) to authenticated;
grant execute on function public.cancel_my_department_challenge(uuid, text, integer, uuid) to authenticated;
grant execute on function public.confirm_my_department_challenge_result(uuid, integer, integer, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
