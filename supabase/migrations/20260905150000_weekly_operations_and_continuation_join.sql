-- Operator-managed weekly windows and explicit-consent continuation joins.
-- Forward-only local implementation. Remote application remains a separate approval.

alter table public.quantum_weekly_activity_windows
  add column if not exists created_by uuid references public.users(id) on delete restrict;

create table public.quantum_weekly_window_commands (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  window_id uuid not null references public.quantum_weekly_activity_windows(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  command_type text not null check (command_type in ('create', 'update', 'publish')),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  prior_revision integer not null check (prior_revision >= -1),
  resulting_revision integer not null check (resulting_revision = prior_revision + 1),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_user_id, idempotency_key)
);

alter table public.quantum_weekly_window_commands enable row level security;
revoke all on table public.quantum_weekly_window_commands from public, anon, authenticated, service_role;

create or replace function public.admin_list_weekly_activity_windows(p_week_key date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_windows jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_week_key is not null and extract(isodow from p_week_key) <> 1 then
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
    'revision', activity_window.revision,
    'updated_at', activity_window.updated_at
  ) order by activity_window.week_key, activity_window.starts_at), '[]'::jsonb)
  into v_windows
  from public.quantum_weekly_activity_windows as activity_window
  where (p_week_key is not null and activity_window.week_key = p_week_key)
     or (p_week_key is null and activity_window.week_key between
       (pg_catalog.date_trunc('week', pg_catalog.clock_timestamp() at time zone 'Asia/Seoul'))::date
       and (pg_catalog.date_trunc('week', pg_catalog.clock_timestamp() at time zone 'Asia/Seoul'))::date + 84
     );
  return pg_catalog.jsonb_build_object('server_now', pg_catalog.clock_timestamp(), 'windows', v_windows);
end
$$;

revoke all on function public.admin_list_weekly_activity_windows(date) from public, anon, authenticated, service_role;
grant execute on function public.admin_list_weekly_activity_windows(date) to authenticated;

create or replace function public.admin_create_weekly_activity_window(
  p_activity_id text,
  p_activity_kind text,
  p_week_key date,
  p_title text,
  p_summary text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_application_closes_at timestamptz,
  p_location_name text,
  p_capacity integer,
  p_activity_snapshot jsonb,
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
  v_request_hash text;
  v_existing public.quantum_weekly_window_commands%rowtype;
  v_window public.quantum_weekly_activity_windows%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_activity_id is null or p_activity_id !~ '^[a-z0-9][a-z0-9-]{0,79}$'
     or p_activity_kind not in ('board_game', 'walk', 'meal', 'bowling', 'other')
     or p_week_key is null or extract(isodow from p_week_key) <> 1
     or coalesce(pg_catalog.char_length(pg_catalog.btrim(p_title)), 0) not between 1 and 80
     or coalesce(pg_catalog.char_length(pg_catalog.btrim(p_summary)), 0) not between 1 and 280
     or p_starts_at is null or p_ends_at is null or p_application_closes_at is null
     or p_ends_at <= p_starts_at or p_application_closes_at <= pg_catalog.clock_timestamp()
     or p_application_closes_at >= p_starts_at or p_starts_at <= pg_catalog.clock_timestamp()
     or (pg_catalog.date_trunc('week', p_starts_at at time zone 'Asia/Seoul'))::date <> p_week_key
     or (pg_catalog.date_trunc('week', p_ends_at at time zone 'Asia/Seoul'))::date <> p_week_key
     or coalesce(pg_catalog.char_length(pg_catalog.btrim(p_location_name)), 0) not between 1 and 160
     or p_capacity not between 5 and 60
     or p_activity_snapshot is null or pg_catalog.jsonb_typeof(p_activity_snapshot) <> 'object'
     or p_idempotency_key is null then raise exception 'invalid_weekly_window'; end if;

  v_request_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'activity_id', p_activity_id, 'activity_kind', p_activity_kind, 'week_key', p_week_key,
    'title', pg_catalog.btrim(p_title), 'summary', pg_catalog.btrim(p_summary),
    'starts_at', p_starts_at, 'ends_at', p_ends_at,
    'application_closes_at', p_application_closes_at,
    'location_name', pg_catalog.btrim(p_location_name), 'capacity', p_capacity,
    'activity_snapshot', p_activity_snapshot
  )::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('weekly-window-create:' || p_activity_id || ':' || p_starts_at::text, 0));
  select command.* into v_existing
  from public.quantum_weekly_window_commands as command
  where command.actor_user_id = v_actor and command.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.command_type <> 'create' or v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused';
    end if;
    select activity_window.* into v_window
    from public.quantum_weekly_activity_windows as activity_window where activity_window.id = v_existing.window_id;
    return pg_catalog.jsonb_build_object('window_id', v_window.id, 'revision', v_window.revision, 'status', v_window.status, 'replayed', true);
  end if;

  insert into public.quantum_weekly_activity_windows (
    activity_id, activity_kind, week_key, title, summary, starts_at, ends_at,
    application_closes_at, location_name, capacity, status, activity_snapshot, created_by
  ) values (
    p_activity_id, p_activity_kind, p_week_key, pg_catalog.btrim(p_title), pg_catalog.btrim(p_summary),
    p_starts_at, p_ends_at, p_application_closes_at, pg_catalog.btrim(p_location_name),
    p_capacity, 'draft', p_activity_snapshot, v_actor
  ) returning * into v_window;
  insert into public.quantum_weekly_window_commands (
    window_id, actor_user_id, command_type, idempotency_key, request_hash, prior_revision, resulting_revision
  ) values (v_window.id, v_actor, 'create', p_idempotency_key, v_request_hash, -1, 0);
  return pg_catalog.jsonb_build_object('window_id', v_window.id, 'revision', 0, 'status', 'draft', 'replayed', false);
end
$$;

revoke all on function public.admin_create_weekly_activity_window(text, text, date, text, text, timestamptz, timestamptz, timestamptz, text, integer, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_create_weekly_activity_window(text, text, date, text, text, timestamptz, timestamptz, timestamptz, text, integer, jsonb, uuid)
  to authenticated;

create or replace function public.admin_update_weekly_activity_window(
  p_window_id uuid,
  p_title text,
  p_summary text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_application_closes_at timestamptz,
  p_location_name text,
  p_capacity integer,
  p_activity_snapshot jsonb,
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
  v_request_hash text;
  v_existing public.quantum_weekly_window_commands%rowtype;
  v_window public.quantum_weekly_activity_windows%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_window_id is null or coalesce(pg_catalog.char_length(pg_catalog.btrim(p_title)), 0) not between 1 and 80
     or coalesce(pg_catalog.char_length(pg_catalog.btrim(p_summary)), 0) not between 1 and 280
     or p_starts_at is null or p_ends_at is null or p_application_closes_at is null
     or p_ends_at <= p_starts_at or p_application_closes_at <= pg_catalog.clock_timestamp()
     or p_application_closes_at >= p_starts_at or p_starts_at <= pg_catalog.clock_timestamp()
     or coalesce(pg_catalog.char_length(pg_catalog.btrim(p_location_name)), 0) not between 1 and 160
     or p_capacity not between 5 and 60
     or p_activity_snapshot is null or pg_catalog.jsonb_typeof(p_activity_snapshot) <> 'object'
     or p_expected_revision is null or p_expected_revision < 0 or p_idempotency_key is null then
    raise exception 'invalid_weekly_window_update';
  end if;
  v_request_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'window_id', p_window_id, 'title', pg_catalog.btrim(p_title), 'summary', pg_catalog.btrim(p_summary),
    'starts_at', p_starts_at, 'ends_at', p_ends_at, 'application_closes_at', p_application_closes_at,
    'location_name', pg_catalog.btrim(p_location_name), 'capacity', p_capacity,
    'activity_snapshot', p_activity_snapshot, 'expected_revision', p_expected_revision
  )::text);
  select command.* into v_existing from public.quantum_weekly_window_commands as command
  where command.actor_user_id = v_actor and command.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.command_type <> 'update' or v_existing.window_id <> p_window_id or v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object('window_id', p_window_id, 'revision', v_existing.resulting_revision, 'replayed', true);
  end if;
  select activity_window.* into v_window from public.quantum_weekly_activity_windows as activity_window
  where activity_window.id = p_window_id for update;
  if v_window.id is null then raise exception 'weekly_window_not_found'; end if;
  if v_window.status not in ('draft', 'closed') then raise exception 'weekly_window_update_locked'; end if;
  if v_window.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if (pg_catalog.date_trunc('week', p_starts_at at time zone 'Asia/Seoul'))::date <> v_window.week_key
     or (pg_catalog.date_trunc('week', p_ends_at at time zone 'Asia/Seoul'))::date <> v_window.week_key then
    raise exception 'weekly_window_week_mismatch';
  end if;
  update public.quantum_weekly_activity_windows
  set title = pg_catalog.btrim(p_title), summary = pg_catalog.btrim(p_summary), starts_at = p_starts_at,
      ends_at = p_ends_at, application_closes_at = p_application_closes_at,
      location_name = pg_catalog.btrim(p_location_name), capacity = p_capacity,
      activity_snapshot = p_activity_snapshot, revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_window_id and revision = p_expected_revision;
  if not found then raise exception 'stale_revision'; end if;
  insert into public.quantum_weekly_window_commands (
    window_id, actor_user_id, command_type, idempotency_key, request_hash, prior_revision, resulting_revision
  ) values (p_window_id, v_actor, 'update', p_idempotency_key, v_request_hash, p_expected_revision, p_expected_revision + 1);
  return pg_catalog.jsonb_build_object('window_id', p_window_id, 'revision', p_expected_revision + 1, 'replayed', false);
end
$$;

revoke all on function public.admin_update_weekly_activity_window(uuid, text, text, timestamptz, timestamptz, timestamptz, text, integer, jsonb, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_update_weekly_activity_window(uuid, text, text, timestamptz, timestamptz, timestamptz, text, integer, jsonb, integer, uuid)
  to authenticated;

create or replace function public.admin_publish_weekly_activity_window(
  p_window_id uuid,
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
  v_request_hash text;
  v_existing public.quantum_weekly_window_commands%rowtype;
  v_window public.quantum_weekly_activity_windows%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_window_id is null or p_expected_revision is null or p_expected_revision < 0 or p_idempotency_key is null then
    raise exception 'invalid_weekly_window_publish';
  end if;
  v_request_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'window_id', p_window_id, 'expected_revision', p_expected_revision
  )::text);
  select command.* into v_existing from public.quantum_weekly_window_commands as command
  where command.actor_user_id = v_actor and command.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.command_type <> 'publish' or v_existing.window_id <> p_window_id or v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object('window_id', p_window_id, 'revision', v_existing.resulting_revision, 'status', 'recruiting', 'replayed', true);
  end if;
  select activity_window.* into v_window from public.quantum_weekly_activity_windows as activity_window
  where activity_window.id = p_window_id for update;
  if v_window.id is null then raise exception 'weekly_window_not_found'; end if;
  if v_window.status not in ('draft', 'closed') then raise exception 'weekly_window_publish_locked'; end if;
  if v_window.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_window.application_closes_at <= pg_catalog.clock_timestamp()
     or v_window.starts_at <= pg_catalog.clock_timestamp()
     or v_window.application_closes_at >= v_window.starts_at then
    raise exception 'weekly_window_publish_time_invalid';
  end if;
  update public.quantum_weekly_activity_windows
  set status = 'recruiting', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = p_window_id and revision = p_expected_revision;
  if not found then raise exception 'stale_revision'; end if;
  insert into public.quantum_weekly_window_commands (
    window_id, actor_user_id, command_type, idempotency_key, request_hash, prior_revision, resulting_revision
  ) values (p_window_id, v_actor, 'publish', p_idempotency_key, v_request_hash, p_expected_revision, p_expected_revision + 1);
  return pg_catalog.jsonb_build_object('window_id', p_window_id, 'revision', p_expected_revision + 1, 'status', 'recruiting', 'replayed', false);
end
$$;

revoke all on function public.admin_publish_weekly_activity_window(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_publish_weekly_activity_window(uuid, integer, uuid)
  to authenticated;

-- The legacy scheduled-event command remains the implementation core, but is
-- no longer browser-callable without the canonical matching-readiness check.
revoke all on function public.save_my_quantum_event_meeting_moment_and_participate(text, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.save_my_ready_quantum_event_meeting_moment_and_participate(
  p_event_key text,
  p_event_mode text,
  p_party_type text,
  p_group_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_profile_matching_ready(v_actor) then raise exception 'matching_profile_not_ready'; end if;
  return public.save_my_quantum_event_meeting_moment_and_participate(
    p_event_key, p_event_mode, p_party_type, p_group_id, p_payload
  );
end
$$;

revoke all on function public.save_my_ready_quantum_event_meeting_moment_and_participate(text, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_my_ready_quantum_event_meeting_moment_and_participate(text, text, text, uuid, jsonb)
  to authenticated;

alter table public.quantum_continuation_transition_members
  add column if not exists visible_from_program_day smallint not null default 1
    check (visible_from_program_day between 1 and 5);

create table public.quantum_continuation_join_proposals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  series_id uuid not null references public.quantum_continuation_series(id) on delete restrict,
  previous_occurrence_id uuid not null references public.quantum_continuation_occurrences(id) on delete restrict,
  candidate_user_id uuid not null references public.users(id) on delete restrict,
  target_program_day smallint not null check (target_program_day between 2 and 5),
  proposed_series_revision integer not null check (proposed_series_revision >= 0),
  fee_scope text not null default 'first_join_occurrence_waived'
    check (fee_scope = 'first_join_occurrence_waived'),
  roster_snapshot_hash text not null check (roster_snapshot_hash ~ '^[0-9a-f]{32}$'),
  status text not null default 'awaiting_consents' check (status in (
    'awaiting_consents', 'accepted', 'applied', 'rejected', 'expired', 'review_required', 'cancelled'
  )),
  proposed_by uuid not null references public.users(id) on delete restrict,
  propose_idempotency_key uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  expires_at timestamptz not null,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (series_id, target_program_day, candidate_user_id),
  check (expires_at > created_at)
);

create unique index quantum_continuation_one_open_join_idx
  on public.quantum_continuation_join_proposals (series_id, target_program_day)
  where status in ('awaiting_consents', 'accepted');

create table public.quantum_continuation_join_proposal_members (
  proposal_id uuid not null references public.quantum_continuation_join_proposals(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  member_role text not null check (member_role in ('existing', 'candidate')),
  attendance_revision integer,
  visible_from_program_day smallint not null check (visible_from_program_day between 1 and 5),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (proposal_id, participant_user_id),
  check ((member_role = 'candidate') = (attendance_revision is null))
);

create table public.quantum_continuation_join_consents (
  proposal_id uuid not null references public.quantum_continuation_join_proposals(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  decision text not null check (decision in ('accept', 'reject')),
  roster_snapshot_hash text not null check (roster_snapshot_hash ~ '^[0-9a-f]{32}$'),
  revision integer not null default 0 check (revision >= 0),
  decided_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (proposal_id, participant_user_id),
  foreign key (proposal_id, participant_user_id)
    references public.quantum_continuation_join_proposal_members(proposal_id, participant_user_id) on delete restrict
);

create table public.quantum_continuation_join_consent_commands (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  proposal_id uuid not null references public.quantum_continuation_join_proposals(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  decision text not null check (decision in ('accept', 'reject')),
  prior_proposal_revision integer not null check (prior_proposal_revision >= 0),
  resulting_proposal_revision integer not null check (resulting_proposal_revision = prior_proposal_revision + 1),
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (participant_user_id, idempotency_key)
);

create table public.quantum_continuation_join_admin_commands (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  proposal_id uuid not null references public.quantum_continuation_join_proposals(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  command_type text not null check (command_type = 'cancel'),
  prior_proposal_revision integer not null check (prior_proposal_revision >= 0),
  resulting_proposal_revision integer not null check (resulting_proposal_revision = prior_proposal_revision + 1),
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_user_id, idempotency_key)
);

alter table public.quantum_continuation_join_proposals enable row level security;
alter table public.quantum_continuation_join_proposal_members enable row level security;
alter table public.quantum_continuation_join_consents enable row level security;
alter table public.quantum_continuation_join_consent_commands enable row level security;
alter table public.quantum_continuation_join_admin_commands enable row level security;
revoke all on table public.quantum_continuation_join_proposals from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_join_proposal_members from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_join_consents from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_join_consent_commands from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_join_admin_commands from public, anon, authenticated, service_role;

create or replace function quantum_private.continuation_join_candidate_ids(
  p_series_id uuid,
  p_target_program_day smallint
)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate_user_id uuid;
begin
  select proposal.candidate_user_id into v_candidate_user_id
  from public.quantum_continuation_join_proposals as proposal
  where proposal.series_id = p_series_id
    and proposal.target_program_day = p_target_program_day
    and proposal.status = 'accepted'
    and proposal.expires_at > pg_catalog.clock_timestamp()
  for update;

  if v_candidate_user_id is null then
    return '{}'::uuid[];
  end if;
  return array[v_candidate_user_id];
end
$$;

revoke all on function quantum_private.continuation_join_candidate_ids(uuid, smallint)
  from public, anon, authenticated, service_role;

create or replace function quantum_private.continuation_join_snapshot_hash(
  p_occurrence_id uuid,
  p_candidate_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.md5(pg_catalog.jsonb_build_object(
    'occurrence_id', occurrence.id,
    'occurrence_revision', occurrence.revision,
    'candidate_user_id', p_candidate_user_id,
    'members', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', member.participant_user_id,
        'attendance_status', member.attendance_status,
        'attendance_revision', member.attendance_revision,
        'attendance_resolution_id', member.attendance_resolution_id
      ) order by member.participant_user_id), '[]'::jsonb)
      from public.quantum_continuation_occurrence_members as member
      where member.occurrence_id = occurrence.id
    )
  )::text)
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id
$$;

revoke all on function quantum_private.continuation_join_snapshot_hash(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.admin_list_continuation_join_options(p_series_id uuid default null)
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
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_series_id is not null and not exists (
    select 1 from public.quantum_continuation_series as series where series.id = p_series_id
  ) then raise exception 'continuation_series_not_found'; end if;

  return pg_catalog.jsonb_build_object(
    'series', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'series_id', series.id,
        'source_kind', source.source_kind,
        'activity_kind', source.activity_kind,
        'status', series.status,
        'revision', series.revision,
        'latest_program_day', latest.program_day,
        'latest_occurrence_status', latest.status,
        'active_transition', exists (
          select 1 from public.quantum_continuation_transitions as transition
          where transition.series_id = series.id and transition.status <> 'closed'
        )
      ) order by series.updated_at desc), '[]'::jsonb)
      from public.quantum_continuation_series as series
      join public.quantum_continuation_sources as source on source.id = series.source_id
      left join lateral (
        select occurrence.program_day, occurrence.status
        from public.quantum_continuation_occurrences as occurrence
        where occurrence.series_id = series.id
        order by occurrence.transition_index desc limit 1
      ) as latest on true
      where series.status = 'active'
        and (p_series_id is null or series.id = p_series_id)
    ),
    'candidates', case when p_series_id is null then '[]'::jsonb else (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', candidate.user_id,
        'display_name', candidate.display_name
      ) order by candidate.display_name, candidate.user_id), '[]'::jsonb)
      from (
        select profile.user_id, profile.display_name
        from public.profiles as profile
        where public.is_profile_matching_ready(profile.user_id)
          and not exists (
            select 1
            from public.quantum_continuation_series as series
            join public.quantum_continuation_source_members as source_member on source_member.source_id = series.source_id
            where series.id = p_series_id and source_member.participant_user_id = profile.user_id
          )
          and not exists (
            select 1
            from public.quantum_continuation_occurrences as occurrence
            join public.quantum_continuation_occurrence_members as member on member.occurrence_id = occurrence.id
            where occurrence.series_id = p_series_id and member.participant_user_id = profile.user_id
          )
        order by profile.display_name, profile.user_id
        limit 100
      ) as candidate
    ) end,
    'proposals', case when p_series_id is null then '[]'::jsonb else (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'proposal_id', proposal.id,
        'candidate_label', profile.display_name,
        'target_program_day', proposal.target_program_day,
        'status', proposal.status,
        'expires_at', proposal.expires_at,
        'revision', proposal.revision
      ) order by proposal.created_at desc), '[]'::jsonb)
      from public.quantum_continuation_join_proposals as proposal
      join public.profiles as profile on profile.user_id = proposal.candidate_user_id
      where proposal.series_id = p_series_id
        and proposal.status in ('awaiting_consents', 'accepted', 'review_required', 'expired')
    ) end
  );
end
$$;

revoke all on function public.admin_list_continuation_join_options(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_continuation_join_options(uuid)
  to authenticated;

create or replace function public.propose_continuation_join_for_admin(
  p_series_id uuid,
  p_candidate_user_id uuid,
  p_expected_series_revision integer,
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
  v_series public.quantum_continuation_series%rowtype;
  v_previous public.quantum_continuation_occurrences%rowtype;
  v_existing public.quantum_continuation_join_proposals%rowtype;
  v_proposal public.quantum_continuation_join_proposals%rowtype;
  v_member_count integer;
  v_gender_count integer;
  v_next_transition_index integer;
  v_target_program_day smallint;
  v_snapshot_hash text;
  v_request_hash text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_series_id is null or p_candidate_user_id is null
     or p_expected_series_revision is null or p_expected_series_revision < 0
     or p_idempotency_key is null then raise exception 'invalid_join_proposal'; end if;

  select proposal.* into v_existing
  from public.quantum_continuation_join_proposals as proposal
  where proposal.propose_idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.proposed_by <> v_actor or v_existing.series_id <> p_series_id
       or v_existing.candidate_user_id <> p_candidate_user_id
       or v_existing.proposed_series_revision <> p_expected_series_revision then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object('proposal_id', v_existing.id, 'status', v_existing.status, 'revision', v_existing.revision, 'replayed', true);
  end if;

  select series.* into v_series from public.quantum_continuation_series as series
  where series.id = p_series_id for update;
  if v_series.id is null then raise exception 'continuation_series_not_found'; end if;
  if v_series.status <> 'active' then raise exception 'continuation_series_not_active'; end if;
  if v_series.revision <> p_expected_series_revision then raise exception 'stale_revision'; end if;
  if exists (
    select 1 from public.quantum_continuation_transitions as transition
    where transition.series_id = p_series_id and transition.status <> 'closed'
  ) then raise exception 'active_transition_blocks_join'; end if;

  select occurrence.* into v_previous
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.series_id = p_series_id
  order by occurrence.transition_index desc limit 1 for update;
  if v_previous.id is null or v_previous.status <> 'completed' then raise exception 'completed_occurrence_required'; end if;
  v_next_transition_index := v_previous.transition_index + 1;
  if not (v_next_transition_index > 0) then raise exception 'first_transition_roster_is_fixed'; end if;
  v_target_program_day := v_previous.program_day + 1;
  if v_target_program_day > 5 then raise exception 'final_program_day_has_no_join'; end if;
  if exists (
    select 1 from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = v_previous.id and member.attendance_status in ('confirmed', 'disputed')
  ) then raise exception 'actual_attendance_unknown'; end if;
  if exists (
    select 1 from public.quantum_continuation_occurrence_members as member
    join public.quantum_continuation_occurrences as occurrence on occurrence.id = member.occurrence_id
    where occurrence.series_id = p_series_id and member.participant_user_id = p_candidate_user_id
  ) then raise exception 'candidate_already_in_series'; end if;
  if not public.is_profile_matching_ready(p_candidate_user_id) then raise exception 'matching_profile_not_ready'; end if;

  select pg_catalog.count(*)::integer into v_member_count
  from public.quantum_continuation_occurrence_members as member
  where member.occurrence_id = v_previous.id and member.attendance_status = 'present';
  if v_member_count + 1 > 6
     or v_member_count + 1 < (case when v_target_program_day = 2 then 5 else 3 end) then
    raise exception 'continuation_minimum_not_met';
  end if;
  select pg_catalog.count(distinct profile.gender)::integer into v_gender_count
  from public.profiles as profile
  where profile.user_id = p_candidate_user_id or profile.user_id in (
    select member.participant_user_id from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = v_previous.id and member.attendance_status = 'present'
  );
  if v_gender_count <> 2 then raise exception 'mixed_roster_required'; end if;

  v_snapshot_hash := quantum_private.continuation_join_snapshot_hash(v_previous.id, p_candidate_user_id);
  v_request_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'series_id', p_series_id, 'candidate_user_id', p_candidate_user_id,
    'expected_series_revision', p_expected_series_revision, 'snapshot_hash', v_snapshot_hash
  )::text);
  insert into public.quantum_continuation_join_proposals (
    series_id, previous_occurrence_id, candidate_user_id, target_program_day,
    proposed_series_revision, roster_snapshot_hash, proposed_by,
    propose_idempotency_key, request_hash, expires_at
  ) values (
    p_series_id, v_previous.id, p_candidate_user_id, v_target_program_day,
    p_expected_series_revision, v_snapshot_hash, v_actor, p_idempotency_key, v_request_hash,
    pg_catalog.clock_timestamp() + interval '24 hours'
  ) returning * into v_proposal;
  insert into public.quantum_continuation_join_proposal_members (
    proposal_id, participant_user_id, member_role, attendance_revision, visible_from_program_day
  )
  select v_proposal.id, member.participant_user_id, 'existing', member.attendance_revision, 1
  from public.quantum_continuation_occurrence_members as member
  where member.occurrence_id = v_previous.id and member.attendance_status = 'present'
  union all
  select v_proposal.id, p_candidate_user_id, 'candidate', null, v_target_program_day;
  insert into public.notifications (user_id, kind, payload)
  values (
    p_candidate_user_id,
    'meeting_reminder',
    pg_catalog.jsonb_build_object(
      'continuation_kind', 'join_consent_request',
      'proposal_id', v_proposal.id,
      'deep_link', '/match/series/join'
    )
  );
  update public.quantum_continuation_series
  set revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = p_series_id and revision = p_expected_series_revision;
  if not found then raise exception 'stale_revision'; end if;
  return pg_catalog.jsonb_build_object(
    'proposal_id', v_proposal.id, 'status', v_proposal.status,
    'target_program_day', v_target_program_day, 'revision', 0,
    'fee_scope', 'first_join_occurrence_waived', 'replayed', false
  );
end
$$;

revoke all on function public.propose_continuation_join_for_admin(uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.propose_continuation_join_for_admin(uuid, uuid, integer, uuid)
  to authenticated;

create or replace function public.cancel_continuation_join_for_admin(
  p_proposal_id uuid,
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
  v_proposal public.quantum_continuation_join_proposals%rowtype;
  v_command public.quantum_continuation_join_admin_commands%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_proposal_id is null or p_expected_revision is null or p_expected_revision < 0
     or p_idempotency_key is null then raise exception 'invalid_join_cancel'; end if;
  select command.* into v_command
  from public.quantum_continuation_join_admin_commands as command
  where command.actor_user_id = v_actor and command.idempotency_key = p_idempotency_key;
  if v_command.id is not null then
    if v_command.proposal_id <> p_proposal_id
       or v_command.prior_proposal_revision <> p_expected_revision then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'proposal_id', p_proposal_id, 'status', 'cancelled',
      'revision', v_command.resulting_proposal_revision, 'replayed', true
    );
  end if;
  select proposal.* into v_proposal
  from public.quantum_continuation_join_proposals as proposal
  where proposal.id = p_proposal_id
  for update;
  if v_proposal.id is null then raise exception 'join_proposal_not_found'; end if;
  if v_proposal.status not in ('awaiting_consents', 'accepted', 'review_required', 'expired') then
    raise exception 'join_cancel_locked';
  end if;
  if v_proposal.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  update public.quantum_continuation_join_proposals
  set status = 'cancelled', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = p_proposal_id and revision = p_expected_revision;
  if not found then raise exception 'stale_revision'; end if;
  insert into public.quantum_continuation_join_admin_commands (
    proposal_id, actor_user_id, command_type, prior_proposal_revision,
    resulting_proposal_revision, idempotency_key
  ) values (
    p_proposal_id, v_actor, 'cancel', p_expected_revision,
    p_expected_revision + 1, p_idempotency_key
  );
  return pg_catalog.jsonb_build_object(
    'proposal_id', p_proposal_id, 'status', 'cancelled',
    'revision', p_expected_revision + 1, 'replayed', false
  );
end
$$;

revoke all on function public.cancel_continuation_join_for_admin(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_continuation_join_for_admin(uuid, integer, uuid)
  to authenticated;

create or replace function public.get_my_continuation_join_proposals()
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
  return pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.clock_timestamp(),
    'proposals', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'proposal_id', proposal.id,
        'series_id', proposal.series_id,
        'target_program_day', proposal.target_program_day,
        'status', proposal.status,
        'fee_scope', proposal.fee_scope,
        'expires_at', proposal.expires_at,
        'revision', proposal.revision,
        'is_candidate', member.member_role = 'candidate',
        'own_decision', consent.decision,
        'candidate_label', '신규 참가자'
      ) order by proposal.created_at desc), '[]'::jsonb)
      from public.quantum_continuation_join_proposals as proposal
      join public.quantum_continuation_join_proposal_members as member
        on member.proposal_id = proposal.id and member.participant_user_id = v_actor
      left join public.quantum_continuation_join_consents as consent
        on consent.proposal_id = proposal.id and consent.participant_user_id = v_actor
      where proposal.status in ('awaiting_consents', 'accepted', 'applied', 'rejected', 'review_required')
    )
  );
end
$$;

revoke all on function public.get_my_continuation_join_proposals() from public, anon, authenticated, service_role;
grant execute on function public.get_my_continuation_join_proposals() to authenticated;

create or replace function public.set_my_continuation_join_consent(
  p_proposal_id uuid,
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
  v_proposal public.quantum_continuation_join_proposals%rowtype;
  v_command public.quantum_continuation_join_consent_commands%rowtype;
  v_status text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_proposal_id is null or p_decision not in ('accept', 'reject')
     or p_expected_revision is null or p_expected_revision < 0 or p_idempotency_key is null then
    raise exception 'invalid_join_consent';
  end if;
  select command.* into v_command from public.quantum_continuation_join_consent_commands as command
  where command.participant_user_id = v_actor and command.idempotency_key = p_idempotency_key;
  if v_command.id is not null then
    if v_command.proposal_id <> p_proposal_id or v_command.decision <> p_decision
       or v_command.prior_proposal_revision <> p_expected_revision then raise exception 'idempotency_key_reused'; end if;
    return public.get_my_continuation_join_proposals();
  end if;
  select proposal.* into v_proposal from public.quantum_continuation_join_proposals as proposal
  where proposal.id = p_proposal_id for update;
  if v_proposal.id is null or not exists (
    select 1 from public.quantum_continuation_join_proposal_members as member
    where member.proposal_id = p_proposal_id and member.participant_user_id = v_actor
  ) then raise exception 'join_proposal_not_found'; end if;
  if v_proposal.status <> 'awaiting_consents' then raise exception 'join_consent_locked'; end if;
  if v_proposal.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_proposal.expires_at <= pg_catalog.clock_timestamp() then
    update public.quantum_continuation_join_proposals set status = 'expired', revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp() where id = p_proposal_id;
    return public.get_my_continuation_join_proposals()
      || pg_catalog.jsonb_build_object('result', 'join_proposal_expired');
  end if;
  if v_proposal.roster_snapshot_hash <> quantum_private.continuation_join_snapshot_hash(
    v_proposal.previous_occurrence_id, v_proposal.candidate_user_id
  ) then
    update public.quantum_continuation_join_proposals set status = 'review_required', revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp() where id = p_proposal_id;
    return public.get_my_continuation_join_proposals()
      || pg_catalog.jsonb_build_object('result', 'join_roster_snapshot_changed');
  end if;
  if not public.is_profile_matching_ready(v_actor) then
    raise exception 'matching_profile_not_ready';
  end if;
  insert into public.quantum_continuation_join_consents (
    proposal_id, participant_user_id, decision, roster_snapshot_hash
  ) values (p_proposal_id, v_actor, p_decision, v_proposal.roster_snapshot_hash)
  on conflict (proposal_id, participant_user_id) do update
    set decision = excluded.decision,
        roster_snapshot_hash = excluded.roster_snapshot_hash,
        revision = public.quantum_continuation_join_consents.revision + 1,
        decided_at = pg_catalog.clock_timestamp();
  insert into public.quantum_continuation_join_consent_commands (
    proposal_id, participant_user_id, decision, prior_proposal_revision,
    resulting_proposal_revision, idempotency_key
  ) values (p_proposal_id, v_actor, p_decision, p_expected_revision, p_expected_revision + 1, p_idempotency_key);
  if exists (
    select 1 from public.quantum_continuation_join_consents as consent
    where consent.proposal_id = p_proposal_id and consent.decision = 'reject'
  ) then
    v_status := 'rejected';
  elsif not exists (
    select 1 from public.quantum_continuation_join_proposal_members as member
    where member.proposal_id = p_proposal_id and not exists (
      select 1 from public.quantum_continuation_join_consents as consent
      where consent.proposal_id = member.proposal_id
        and consent.participant_user_id = member.participant_user_id
        and consent.decision = 'accept'
        and consent.roster_snapshot_hash = v_proposal.roster_snapshot_hash
    )
  ) then
    v_status := 'accepted';
  else
    v_status := 'awaiting_consents';
  end if;
  update public.quantum_continuation_join_proposals
  set status = v_status, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = p_proposal_id and revision = p_expected_revision;
  if not found then raise exception 'stale_revision'; end if;
  return public.get_my_continuation_join_proposals();
end
$$;

revoke all on function public.set_my_continuation_join_consent(uuid, text, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_my_continuation_join_consent(uuid, text, integer, uuid)
  to authenticated;

create or replace function quantum_private.prepare_continuation_join_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.quantum_continuation_join_proposals%rowtype;
  v_member_count integer;
  v_gender_count integer;
begin
  select proposal.* into v_proposal
  from public.quantum_continuation_join_proposals as proposal
  where proposal.series_id = new.series_id
    and proposal.target_program_day = new.target_program_day
    and proposal.status in ('awaiting_consents', 'accepted')
  for update;
  if v_proposal.id is null then return new; end if;
  if not exists (
    select 1 from public.quantum_continuation_series as series
    where series.id = new.series_id and series.status = 'active'
      and series.revision = v_proposal.proposed_series_revision + 1
  ) then raise exception 'join_series_snapshot_changed'; end if;
  if v_proposal.status = 'awaiting_consents' then raise exception 'join_consent_pending'; end if;
  if v_proposal.expires_at <= pg_catalog.clock_timestamp() then raise exception 'join_proposal_expired'; end if;
  if v_proposal.roster_snapshot_hash <> quantum_private.continuation_join_snapshot_hash(
    v_proposal.previous_occurrence_id, v_proposal.candidate_user_id
  ) then raise exception 'join_roster_snapshot_changed'; end if;
  if exists (
    select 1 from public.quantum_continuation_join_proposal_members as member
    where member.proposal_id = v_proposal.id
      and not public.is_profile_matching_ready(member.participant_user_id)
  ) then raise exception 'matching_profile_not_ready'; end if;
  if exists (
    select 1 from public.quantum_continuation_join_proposal_members as member
    where member.proposal_id = v_proposal.id and not exists (
      select 1 from public.quantum_continuation_join_consents as consent
      where consent.proposal_id = member.proposal_id
        and consent.participant_user_id = member.participant_user_id
        and consent.decision = 'accept'
        and consent.roster_snapshot_hash = v_proposal.roster_snapshot_hash
    )
  ) then raise exception 'all_join_consents_required'; end if;
  select pg_catalog.count(*)::integer, pg_catalog.count(distinct profile.gender)::integer
  into v_member_count, v_gender_count
  from public.quantum_continuation_join_proposal_members as member
  join public.profiles as profile on profile.user_id = member.participant_user_id
  where member.proposal_id = v_proposal.id;
  if v_member_count not between (case when new.target_program_day = 2 then 5 else 3 end) and 6 then
    raise exception 'continuation_minimum_not_met';
  end if;
  if v_gender_count <> 2 then raise exception 'mixed_roster_required'; end if;
  new.roster_revision := new.roster_revision + 1;
  return new;
end
$$;

revoke all on function quantum_private.prepare_continuation_join_transition()
  from public, anon, authenticated, service_role;

create trigger trg_prepare_continuation_join_transition
before insert on public.quantum_continuation_transitions
for each row execute function quantum_private.prepare_continuation_join_transition();

create or replace function quantum_private.normalize_continuation_transition_member_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select transition.roster_revision into new.roster_revision
  from public.quantum_continuation_transitions as transition where transition.id = new.transition_id;
  return new;
end
$$;

revoke all on function quantum_private.normalize_continuation_transition_member_revision()
  from public, anon, authenticated, service_role;

create trigger trg_normalize_continuation_transition_member_revision
before insert on public.quantum_continuation_transition_members
for each row execute function quantum_private.normalize_continuation_transition_member_revision();

create or replace function quantum_private.attach_accepted_continuation_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.quantum_continuation_join_proposals%rowtype;
begin
  select proposal.* into v_proposal
  from public.quantum_continuation_join_proposals as proposal
  where proposal.series_id = new.series_id
    and proposal.target_program_day = new.target_program_day
    and proposal.status = 'accepted'
  for update;
  if v_proposal.id is null then return new; end if;
  insert into public.quantum_continuation_transition_members (
    transition_id, participant_user_id, roster_revision, source_program_day,
    visible_from_program_day, fee_waived
  ) values (
    new.id, v_proposal.candidate_user_id, new.roster_revision, null,
    new.target_program_day, true
  );
  update public.quantum_continuation_join_proposals
  set status = 'applied', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = v_proposal.id and status = 'accepted';
  return new;
end
$$;

revoke all on function quantum_private.attach_accepted_continuation_join()
  from public, anon, authenticated, service_role;

create trigger trg_attach_accepted_continuation_join
after insert on public.quantum_continuation_transitions
for each row execute function quantum_private.attach_accepted_continuation_join();

create or replace function quantum_private.invalidate_continuation_source(p_source_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.quantum_continuation_sources
  set status = 'disputed', updated_at = pg_catalog.clock_timestamp()
  where id = p_source_id and status = 'ready';
  update public.quantum_continuation_series
  set status = 'review_required', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where source_id = p_source_id and status in ('active', 'completed');
  update public.quantum_continuation_transitions
  set status = 'review_required', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where series_id in (
    select series.id from public.quantum_continuation_series as series where series.source_id = p_source_id
  ) and status in ('awaiting_choices', 'payment_pending', 'ready_to_schedule');
  update public.quantum_continuation_occurrences
  set status = 'review_required', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where series_id in (
    select series.id from public.quantum_continuation_series as series where series.source_id = p_source_id
  ) and status in ('confirmed', 'in_progress');
  update public.quantum_continuation_fee_orders as fee
  set status = case
        when fee.status in ('verifying', 'verified') then 'recovery_required'
        else 'cancelled'
      end,
      revision = fee.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where fee.transition_id in (
    select transition.id
    from public.quantum_continuation_transitions as transition
    join public.quantum_continuation_series as series on series.id = transition.series_id
    where series.source_id = p_source_id
  ) and fee.status in ('prepared', 'verifying', 'verified');
  update public.quantum_continuation_friend_entitlements as entitlement
  set status = 'cancelled', revision = entitlement.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where entitlement.transition_id in (
    select transition.id
    from public.quantum_continuation_transitions as transition
    join public.quantum_continuation_series as series on series.id = transition.series_id
    where series.source_id = p_source_id
  ) and entitlement.status in ('ready', 'queued');
  update public.quantum_continuation_notification_outbox as outbox
  set status = 'cancelled', claim_token = null, lease_expires_at = null,
      revision = outbox.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where outbox.transition_id in (
    select transition.id
    from public.quantum_continuation_transitions as transition
    join public.quantum_continuation_series as series on series.id = transition.series_id
    where series.source_id = p_source_id
  ) and outbox.status in ('pending', 'processing', 'failed');
  update public.quantum_continuation_join_proposals as proposal
  set status = 'review_required', revision = proposal.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where proposal.series_id in (
    select series.id from public.quantum_continuation_series as series where series.source_id = p_source_id
  ) and proposal.status in ('awaiting_consents', 'accepted');
end
$$;

revoke all on function quantum_private.invalidate_continuation_source(uuid)
  from public, anon, authenticated, service_role;

create or replace function quantum_private.invalidate_continuation_from_tonight_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_source_id uuid;
begin
  v_team_id := case when tg_table_name = 'tonight_teams' then new.id else new.team_id end;
  select source.id into v_source_id from public.quantum_continuation_sources as source
  where source.tonight_team_id = v_team_id;
  if v_source_id is not null then perform quantum_private.invalidate_continuation_source(v_source_id); end if;
  return new;
end
$$;

revoke all on function quantum_private.invalidate_continuation_from_tonight_change()
  from public, anon, authenticated, service_role;

create trigger trg_invalidate_continuation_from_tonight_attendance
after update of status, revision on public.tonight_attendance
for each row when (old.status is distinct from new.status or old.revision is distinct from new.revision)
execute function quantum_private.invalidate_continuation_from_tonight_change();

create trigger trg_invalidate_continuation_from_tonight_team
after update of status, revision, activity_id, member_count on public.tonight_teams
for each row when (
  old.status is distinct from new.status or old.revision is distinct from new.revision
  or old.activity_id is distinct from new.activity_id or old.member_count is distinct from new.member_count
)
execute function quantum_private.invalidate_continuation_from_tonight_change();

create trigger trg_invalidate_continuation_from_tonight_confirmation
after update of confirmed_attendee_count, observed_arrived_count, revision, service_completed_at
on public.tonight_partner_service_confirmations
for each row when (
  old.confirmed_attendee_count is distinct from new.confirmed_attendee_count
  or old.observed_arrived_count is distinct from new.observed_arrived_count
  or old.revision is distinct from new.revision
  or old.service_completed_at is distinct from new.service_completed_at
)
execute function quantum_private.invalidate_continuation_from_tonight_change();

create or replace function quantum_private.invalidate_continuation_from_weekly_source()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old_occurrence_id uuid;
  v_new_occurrence_id uuid;
  v_source_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old_occurrence_id := case
      when tg_table_name = 'quantum_event_occurrences'
        then (pg_catalog.to_jsonb(old) ->> 'id')::uuid
      else (pg_catalog.to_jsonb(old) ->> 'occurrence_id')::uuid
    end;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_occurrence_id := case
      when tg_table_name = 'quantum_event_occurrences'
        then (pg_catalog.to_jsonb(new) ->> 'id')::uuid
      else (pg_catalog.to_jsonb(new) ->> 'occurrence_id')::uuid
    end;
  end if;
  if tg_op = 'UPDATE' then
    v_old_occurrence_id := case
      when tg_table_name = 'quantum_event_occurrences'
        then (pg_catalog.to_jsonb(old) ->> 'id')::uuid
      else (pg_catalog.to_jsonb(old) ->> 'occurrence_id')::uuid
    end;
  end if;

  for v_source_id in
    select source.id
    from public.quantum_continuation_sources as source
    where source.scheduled_event_occurrence_id = v_old_occurrence_id
       or source.scheduled_event_occurrence_id = v_new_occurrence_id
    order by source.id
    for update
  loop
    perform quantum_private.invalidate_continuation_source(v_source_id);
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke all on function quantum_private.invalidate_continuation_from_weekly_source()
  from public, anon, authenticated, service_role;

create trigger trg_invalidate_continuation_from_weekly_occurrence
after update of roster_revision on public.quantum_event_occurrences
for each row when (old.roster_revision is distinct from new.roster_revision)
execute function quantum_private.invalidate_continuation_from_weekly_source();

create trigger trg_invalidate_continuation_from_weekly_match_member_change
after insert or delete on public.quantum_event_match_members
for each row
execute function quantum_private.invalidate_continuation_from_weekly_source();

create trigger trg_invalidate_continuation_from_weekly_match_member_update
after update of occurrence_id, user_id on public.quantum_event_match_members
for each row when (
  old.occurrence_id is distinct from new.occurrence_id
  or old.user_id is distinct from new.user_id
)
execute function quantum_private.invalidate_continuation_from_weekly_source();

create trigger trg_invalidate_continuation_from_weekly_attendance_change
after insert or delete on public.quantum_weekly_attendance_resolutions
for each row
execute function quantum_private.invalidate_continuation_from_weekly_source();

create trigger trg_invalidate_continuation_from_weekly_attendance_update
after update of attendance_status, attendance_revision, roster_revision
on public.quantum_weekly_attendance_resolutions
for each row when (
  old.attendance_status is distinct from new.attendance_status
  or old.attendance_revision is distinct from new.attendance_revision
  or old.roster_revision is distinct from new.roster_revision
)
execute function quantum_private.invalidate_continuation_from_weekly_source();

create or replace function public.service_sweep_continuation_deadlines(
  p_now timestamptz,
  p_limit integer default 100
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_transition record;
  v_window record;
  v_transition_count integer := 0;
  v_window_count integer := 0;
  v_application_count integer := 0;
  v_expired_count integer := 0;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_now is null or p_limit is null or p_limit < 1 then
    raise exception 'invalid_deadline_sweep';
  end if;
  v_limit := least(greatest(p_limit, 1), 100);

  for v_transition in
    select transition.id, transition.series_id
    from public.quantum_continuation_transitions as transition
    where transition.status in ('awaiting_choices', 'payment_pending', 'ready_to_schedule')
      and transition.closes_at <= p_now
    order by transition.closes_at, transition.id
    for update skip locked
    limit v_limit
  loop
    update public.quantum_continuation_transitions
    set status = 'closed', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_transition.id
      and status in ('awaiting_choices', 'payment_pending', 'ready_to_schedule')
      and closes_at <= p_now;
    if not found then continue; end if;

    update public.quantum_continuation_fee_orders as fee
    set status = case
          when fee.status in ('verifying', 'verified') then 'recovery_required'
          else 'cancelled'
        end,
        revision = fee.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where fee.transition_id = v_transition.id
      and fee.status in ('prepared', 'verifying', 'verified');

    update public.quantum_continuation_notification_outbox as outbox
    set status = 'cancelled', claim_token = null, lease_expires_at = null,
        revision = outbox.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where outbox.transition_id = v_transition.id
      and outbox.status in ('pending', 'processing', 'failed');

    update public.quantum_continuation_series
    set status = 'completed', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_transition.series_id and status = 'active';

    insert into public.quantum_continuation_notification_outbox (
      recipient_user_id, transition_id, occurrence_id, kind, deep_link, dedupe_key
    )
    select member.participant_user_id, v_transition.id, null, 'series_closed',
           '/match/series/' || v_transition.series_id::text,
           'series_deadline_closed:' || v_transition.id::text || ':' || member.participant_user_id::text
    from public.quantum_continuation_transition_members as member
    where member.transition_id = v_transition.id
    on conflict (dedupe_key) do nothing;

    v_transition_count := v_transition_count + 1;
  end loop;

  for v_window in
    select activity_window.id
    from public.quantum_weekly_activity_windows as activity_window
    where activity_window.status = 'recruiting'
      and activity_window.starts_at <= p_now
    order by activity_window.starts_at, activity_window.id
    for update skip locked
    limit v_limit
  loop
    update public.quantum_weekly_activity_windows
    set status = 'closed', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_window.id and status = 'recruiting' and starts_at <= p_now;
    if not found then continue; end if;
    v_window_count := v_window_count + 1;

    with expired as (
      update public.quantum_weekly_applications as application
      set status = 'expired', revision = application.revision + 1,
          updated_at = pg_catalog.clock_timestamp()
      where application.status = 'active'
        and exists (
          select 1
          from public.quantum_weekly_application_candidates as candidate
          where candidate.application_id = application.id
            and candidate.window_id = v_window.id
        )
        and not exists (
          select 1
          from public.quantum_weekly_application_candidates as candidate
          join public.quantum_weekly_activity_windows as candidate_window
            on candidate_window.id = candidate.window_id
          where candidate.application_id = application.id
            and candidate_window.status = 'recruiting'
            and candidate_window.starts_at > p_now
        )
      returning 1
    )
    select pg_catalog.count(*)::integer into v_expired_count
    from expired;
    v_application_count := v_application_count + v_expired_count;
  end loop;

  return pg_catalog.jsonb_build_object(
    'transition_count', v_transition_count,
    'window_count', v_window_count,
    'application_count', v_application_count
  );
end
$$;

revoke all on function public.service_sweep_continuation_deadlines(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_sweep_continuation_deadlines(timestamptz, integer)
  to service_role;
