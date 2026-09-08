-- Integrated weekly first-meeting and same-roster continuation ledger.
-- Local forward-only implementation. Remote apply, live payment and deployment
-- remain separate owner approvals.

alter table public.quantum_event_occurrences
  add column if not exists roster_revision integer not null default 0 check (roster_revision >= 0);

-- Weekly operators may publish new scheduled activity identifiers. Keep the
-- existing Tonight allowlist closed while permitting only bounded scheduled
-- identifiers in the shared participation ledger.
alter table public.quantum_event_participations
  drop constraint if exists quantum_event_participations_event_check;
alter table public.quantum_event_participations
  add constraint quantum_event_participations_event_check check (
    (
      event_mode = 'tonight'
      and event_id in (
        'tonight-onsenjjang-run', 'tonight-board-game',
        'tonight-casual-drinks', 'tonight-late-dinner'
      )
    )
    or (
      event_mode = 'scheduled'
      and event_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'
    )
  );

-- The former scheduled-event lifecycle created friendships for every completed
-- roster pair. Current consent policy requires a paid, explicit friend request,
-- so completion must have no friendship side effect.
drop trigger if exists trg_connect_completed_quantum_event_match on public.matches;

create or replace function public.connect_completed_quantum_event_match(p_match_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return 0;
end
$$;

revoke all on function public.connect_completed_quantum_event_match(uuid)
  from public, anon, authenticated, service_role;

create table public.quantum_weekly_activity_windows (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  activity_id text not null check (activity_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  activity_kind text not null check (activity_kind in ('board_game', 'walk', 'meal', 'bowling', 'other')),
  week_key date not null check (extract(isodow from week_key) = 1),
  title text not null check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 80),
  summary text not null check (pg_catalog.char_length(pg_catalog.btrim(summary)) between 1 and 280),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  application_closes_at timestamptz not null,
  location_name text,
  capacity smallint not null check (capacity between 5 and 60),
  status text not null default 'draft' check (status in ('draft', 'recruiting', 'closed', 'assigned', 'cancelled')),
  activity_snapshot jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(activity_snapshot) = 'object'),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (activity_id, starts_at),
  check (ends_at > starts_at),
  check (application_closes_at <= starts_at),
  check (location_name is null or pg_catalog.char_length(pg_catalog.btrim(location_name)) between 1 and 160)
);

create table public.quantum_weekly_applications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  activity_id text not null,
  week_key date not null,
  status text not null default 'active' check (status in ('active', 'assigned', 'cancelled', 'expired')),
  assigned_window_id uuid references public.quantum_weekly_activity_windows(id) on delete restrict,
  assigned_occurrence_id uuid references public.quantum_event_occurrences(id) on delete restrict,
  assignment_idempotency_key uuid unique,
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (user_id, idempotency_key),
  check ((status = 'assigned') = (assigned_window_id is not null and assigned_occurrence_id is not null))
);

create unique index quantum_weekly_one_live_application_idx
  on public.quantum_weekly_applications (user_id, week_key)
  where status in ('active', 'assigned');

create table public.quantum_weekly_application_candidates (
  application_id uuid not null references public.quantum_weekly_applications(id) on delete cascade,
  window_id uuid not null references public.quantum_weekly_activity_windows(id) on delete restrict,
  preference_rank smallint not null check (preference_rank between 1 and 14),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (application_id, window_id),
  unique (application_id, preference_rank)
);

create table public.quantum_weekly_attendance_resolutions (
  occurrence_id uuid not null references public.quantum_event_occurrences(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  attendance_status text not null check (attendance_status in ('present', 'absent', 'disputed')),
  roster_revision integer not null check (roster_revision >= 0),
  attendance_revision integer not null check (attendance_revision >= 0),
  resolution_id uuid not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (occurrence_id, participant_user_id),
  unique (occurrence_id, participant_user_id, attendance_revision)
);

create table public.quantum_weekly_attendance_audit (
  id bigint generated always as identity primary key,
  occurrence_id uuid not null references public.quantum_event_occurrences(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  resolution_id uuid not null unique,
  before_status text check (before_status is null or before_status in ('present', 'absent', 'disputed')),
  after_status text not null check (after_status in ('present', 'absent', 'disputed')),
  previous_revision integer not null check (previous_revision >= 0),
  resulting_revision integer not null check (resulting_revision = previous_revision + 1),
  recorded_by_kind text not null check (recorded_by_kind in ('service', 'authenticated')),
  recorded_by uuid references public.users(id) on delete restrict,
  reason text not null check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 280),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (occurrence_id, participant_user_id, resulting_revision),
  check ((recorded_by_kind = 'service') = (recorded_by is null))
);

create table public.quantum_continuation_sources (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  source_kind text not null check (source_kind in ('tonight_team', 'scheduled_event_occurrence')),
  tonight_team_id uuid references public.tonight_teams(id) on delete restrict,
  scheduled_event_occurrence_id uuid references public.quantum_event_occurrences(id) on delete restrict,
  activity_kind text not null check (activity_kind in ('board_game', 'walk', 'meal', 'bowling', 'other')),
  activity_snapshot jsonb not null check (pg_catalog.jsonb_typeof(activity_snapshot) = 'object'),
  roster_revision integer not null check (roster_revision >= 0),
  attendance_revision integer not null check (attendance_revision >= 0),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{32}$'),
  source_completed_at timestamptz not null,
  status text not null default 'ready' check (status in ('ready', 'disputed', 'cancelled')),
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (idempotency_key),
  check (num_nonnulls(tonight_team_id, scheduled_event_occurrence_id) = 1),
  check (
    (source_kind = 'tonight_team' and tonight_team_id is not null and scheduled_event_occurrence_id is null)
    or
    (source_kind = 'scheduled_event_occurrence' and scheduled_event_occurrence_id is not null and tonight_team_id is null)
  )
);

create unique index quantum_continuation_tonight_source_idx
  on public.quantum_continuation_sources (tonight_team_id)
  where tonight_team_id is not null;
create unique index quantum_continuation_scheduled_source_idx
  on public.quantum_continuation_sources (scheduled_event_occurrence_id)
  where scheduled_event_occurrence_id is not null;

create table public.quantum_continuation_source_members (
  source_id uuid not null references public.quantum_continuation_sources(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  seat_number smallint not null check (seat_number between 1 and 6),
  attendance_status text not null check (attendance_status in ('present', 'absent', 'disputed')),
  roster_revision integer not null check (roster_revision >= 0),
  attendance_revision integer not null check (attendance_revision >= 0),
  joined_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (source_id, participant_user_id),
  unique (source_id, seat_number)
);

create table public.quantum_continuation_series (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  source_id uuid not null unique references public.quantum_continuation_sources(id) on delete restrict,
  start_program_day smallint not null check (start_program_day in (1, 2)),
  maximum_physical_meeting_no smallint not null check (maximum_physical_meeting_no in (5, 6)),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled', 'review_required')),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table public.quantum_continuation_transitions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  series_id uuid not null references public.quantum_continuation_series(id) on delete restrict,
  transition_index smallint not null check (transition_index between 0 and 4),
  target_program_day smallint not null check (target_program_day between 1 and 5),
  roster_revision integer not null check (roster_revision >= 0),
  open_idempotency_key uuid not null unique,
  status text not null default 'awaiting_choices' check (status in (
    'awaiting_choices', 'payment_pending', 'ready_to_schedule', 'scheduled', 'closed', 'review_required'
  )),
  closes_at timestamptz not null,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (series_id, transition_index),
  unique (id, series_id)
);

create table public.quantum_continuation_transition_members (
  transition_id uuid not null references public.quantum_continuation_transitions(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  roster_revision integer not null check (roster_revision >= 0),
  source_program_day smallint check (source_program_day between 1 and 5),
  fee_waived boolean not null default false,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (transition_id, participant_user_id)
);

create table public.quantum_continuation_choices (
  transition_id uuid not null references public.quantum_continuation_transitions(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  choice text not null check (choice in ('continue', 'end')),
  roster_revision integer not null check (roster_revision >= 0),
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (transition_id, participant_user_id),
  unique (participant_user_id, idempotency_key)
);

create table public.quantum_continuation_fee_orders (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  transition_id uuid not null references public.quantum_continuation_transitions(id) on delete restrict,
  owner_user_id uuid not null references public.users(id) on delete restrict,
  target_user_id uuid references public.users(id) on delete restrict,
  purpose text not null check (purpose in ('next_occurrence', 'friend_request')),
  provider text not null check (provider in ('local_verified_simulator', 'toss_sandbox', 'toss')),
  notice_version text not null check (notice_version = '2026-09-05'),
  amount_krw integer not null default 1000 check (amount_krw = 1000),
  currency text not null default 'KRW' check (currency = 'KRW'),
  status text not null default 'prepared' check (status in ('prepared', 'verifying', 'verified', 'cancelled', 'recovery_required')),
  provider_event_id text,
  provider_transaction_id text,
  provider_verified boolean not null default false,
  idempotency_key uuid not null,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (owner_user_id, idempotency_key),
  unique (provider, provider_event_id),
  unique (provider, provider_transaction_id),
  check ((purpose = 'friend_request') = (target_user_id is not null)),
  check (status <> 'verified' or provider_verified)
);

create unique index quantum_continuation_one_fee_per_purpose_idx
  on public.quantum_continuation_fee_orders (
    transition_id, owner_user_id, purpose, coalesce(target_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status in ('prepared', 'verifying', 'verified', 'recovery_required');

create table public.quantum_continuation_occurrences (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  series_id uuid not null references public.quantum_continuation_series(id) on delete restrict,
  transition_id uuid not null unique,
  schedule_idempotency_key uuid not null unique,
  program_day smallint not null check (program_day between 1 and 5),
  physical_meeting_no smallint not null check (physical_meeting_no between 2 and 6),
  transition_index smallint not null check (transition_index between 0 and 4),
  status text not null default 'confirmed' check (status in ('confirmed', 'in_progress', 'completed', 'cancelled', 'review_required')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  chat_opens_at timestamptz not null,
  chat_send_closes_at timestamptz not null,
  content_state jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(content_state) = 'object'),
  content_revision integer not null default 0 check (content_revision >= 0),
  location_snapshot jsonb not null check (pg_catalog.jsonb_typeof(location_snapshot) = 'object'),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (series_id, program_day),
  unique (series_id, physical_meeting_no),
  unique (series_id, transition_index),
  foreign key (transition_id, series_id)
    references public.quantum_continuation_transitions(id, series_id) on delete restrict,
  check (ends_at > starts_at),
  check (chat_opens_at <= starts_at and chat_send_closes_at >= starts_at and chat_send_closes_at <= ends_at),
  check (physical_meeting_no between 2 and 6)
);

create table public.quantum_continuation_occurrence_members (
  occurrence_id uuid not null references public.quantum_continuation_occurrences(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  alias text not null check (alias ~ '^참가자 [1-6]$'),
  attendance_status text not null default 'confirmed' check (attendance_status in ('confirmed', 'present', 'absent', 'disputed', 'cancelled')),
  attendance_revision integer not null default 0 check (attendance_revision >= 0),
  attendance_resolution_id uuid unique,
  roster_revision integer not null check (roster_revision >= 0),
  visible_from_program_day smallint not null check (visible_from_program_day between 1 and 5),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (occurrence_id, participant_user_id),
  unique (occurrence_id, alias)
);

create table public.quantum_continuation_attendance_audit (
  id bigint generated always as identity primary key,
  occurrence_id uuid not null references public.quantum_continuation_occurrences(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  resolution_id uuid not null unique,
  before_status text not null check (before_status in ('confirmed', 'present', 'absent', 'disputed', 'cancelled')),
  after_status text not null check (after_status in ('present', 'absent', 'disputed')),
  previous_revision integer not null check (previous_revision >= 0),
  resulting_revision integer not null check (resulting_revision = previous_revision + 1),
  reason text not null check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 280),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (occurrence_id, participant_user_id, resulting_revision)
);

create table public.quantum_continuation_content_commands (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  occurrence_id uuid not null references public.quantum_continuation_occurrences(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (pg_catalog.char_length(pg_catalog.btrim(action)) between 1 and 80),
  payload jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(payload) = 'object'),
  prior_revision integer not null check (prior_revision >= 0),
  resulting_revision integer not null check (resulting_revision = prior_revision + 1),
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_user_id, idempotency_key)
);

create table public.quantum_continuation_chat_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  occurrence_id uuid not null references public.quantum_continuation_occurrences(id) on delete restrict,
  sender_user_id uuid not null references public.users(id) on delete restrict,
  message text not null check (pg_catalog.char_length(pg_catalog.btrim(message)) between 1 and 1000),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table public.quantum_continuation_friend_entitlements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  fee_order_id uuid not null unique references public.quantum_continuation_fee_orders(id) on delete restrict,
  requester_user_id uuid not null references public.users(id) on delete restrict,
  target_user_id uuid not null references public.users(id) on delete restrict,
  transition_id uuid not null references public.quantum_continuation_transitions(id) on delete restrict,
  status text not null default 'ready' check (status in ('ready', 'queued', 'delivered', 'cancelled')),
  friend_request_id uuid references public.friend_requests(id) on delete restrict,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (transition_id, requester_user_id, target_user_id)
);

create table public.quantum_continuation_notification_outbox (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  recipient_user_id uuid not null references public.users(id) on delete restrict,
  transition_id uuid references public.quantum_continuation_transitions(id) on delete restrict,
  occurrence_id uuid references public.quantum_continuation_occurrences(id) on delete restrict,
  kind text not null check (kind in ('transition_ready', 'payment_verified', 'schedule_changed', 'series_closed')),
  deep_link text not null check (deep_link ~ '^/[^/]' and pg_catalog.char_length(deep_link) <= 240),
  dedupe_key text not null unique check (pg_catalog.char_length(dedupe_key) between 1 and 240),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  claim_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (num_nonnulls(transition_id, occurrence_id) = 1),
  check ((status = 'processing') = (claim_token is not null and lease_expires_at is not null))
);

create index quantum_weekly_window_discovery_idx
  on public.quantum_weekly_activity_windows (week_key, status, starts_at);
create index quantum_weekly_candidate_window_idx
  on public.quantum_weekly_application_candidates (window_id, application_id);
create index quantum_continuation_source_member_user_idx
  on public.quantum_continuation_source_members (participant_user_id, source_id);
create index quantum_continuation_occurrence_member_user_idx
  on public.quantum_continuation_occurrence_members (participant_user_id, occurrence_id);
create index quantum_continuation_chat_page_idx
  on public.quantum_continuation_chat_messages (occurrence_id, created_at, id);
create index quantum_continuation_outbox_claim_idx
  on public.quantum_continuation_notification_outbox (status, next_attempt_at, created_at);

alter table public.quantum_weekly_activity_windows enable row level security;
alter table public.quantum_weekly_applications enable row level security;
alter table public.quantum_weekly_application_candidates enable row level security;
alter table public.quantum_weekly_attendance_resolutions enable row level security;
alter table public.quantum_weekly_attendance_audit enable row level security;
alter table public.quantum_continuation_sources enable row level security;
alter table public.quantum_continuation_source_members enable row level security;
alter table public.quantum_continuation_series enable row level security;
alter table public.quantum_continuation_transitions enable row level security;
alter table public.quantum_continuation_transition_members enable row level security;
alter table public.quantum_continuation_choices enable row level security;
alter table public.quantum_continuation_fee_orders enable row level security;
alter table public.quantum_continuation_occurrences enable row level security;
alter table public.quantum_continuation_occurrence_members enable row level security;
alter table public.quantum_continuation_attendance_audit enable row level security;
alter table public.quantum_continuation_content_commands enable row level security;
alter table public.quantum_continuation_chat_messages enable row level security;
alter table public.quantum_continuation_friend_entitlements enable row level security;
alter table public.quantum_continuation_notification_outbox enable row level security;

revoke all on table public.quantum_weekly_activity_windows from public, anon, authenticated, service_role;
revoke all on table public.quantum_weekly_applications from public, anon, authenticated, service_role;
revoke all on table public.quantum_weekly_application_candidates from public, anon, authenticated, service_role;
revoke all on table public.quantum_weekly_attendance_resolutions from public, anon, authenticated, service_role;
revoke all on table public.quantum_weekly_attendance_audit from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_sources from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_source_members from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_series from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_transitions from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_transition_members from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_choices from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_fee_orders from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_occurrences from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_occurrence_members from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_attendance_audit from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_content_commands from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_chat_messages from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_friend_entitlements from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_notification_outbox from public, anon, authenticated, service_role;

create or replace function quantum_private.continuation_chat_phase(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_chat_opens_at timestamptz,
  p_chat_send_closes_at timestamptz,
  p_now timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_now < p_chat_opens_at then 'locked'
    when p_now < p_chat_send_closes_at then 'send'
    when p_now < p_ends_at then 'read_only'
    else 'hidden'
  end
$$;

revoke all on function quantum_private.continuation_chat_phase(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_weekly_activity_discovery(p_week_key date)
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
      from public.quantum_weekly_applications as assigned
      where assigned.assigned_window_id = activity_window.id and assigned.status = 'assigned'
    )
  ) order by activity_window.starts_at, activity_window.id), '[]'::jsonb)
  into v_windows
  from public.quantum_weekly_activity_windows as activity_window
  where activity_window.week_key = p_week_key
    and (
      (activity_window.status = 'recruiting'
       and activity_window.application_closes_at > pg_catalog.clock_timestamp())
      or exists (
        select 1 from public.quantum_weekly_applications as assigned
        where assigned.user_id = v_actor
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
      select coalesce(pg_catalog.jsonb_agg(candidate.window_id order by candidate.preference_rank), '[]'::jsonb)
      from public.quantum_weekly_application_candidates as candidate
      where candidate.application_id = application.id
    )
  )
  into v_application
  from public.quantum_weekly_applications as application
  where application.user_id = v_actor
    and application.week_key = p_week_key
    and application.status in ('active', 'assigned')
  order by application.updated_at desc
  limit 1;

  return pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.clock_timestamp(),
    'week_key', p_week_key,
    'windows', v_windows,
    'application', v_application
  );
end
$$;

create or replace function public.apply_to_my_weekly_activity(
  p_activity_id text,
  p_week_key date,
  p_candidate_window_ids uuid[],
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
  v_candidate_count integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_activity_id is null or p_activity_id !~ '^[a-z0-9][a-z0-9-]{0,79}$'
     or p_week_key is null or extract(isodow from p_week_key) <> 1
     or p_idempotency_key is null or p_candidate_window_ids is null
     or pg_catalog.cardinality(p_candidate_window_ids) not between 1 and 14 then
    raise exception 'invalid_weekly_application';
  end if;
  if not public.is_profile_matching_ready(v_actor) then
    raise exception 'matching_profile_not_ready';
  end if;
  select pg_catalog.count(distinct candidate_id)::integer
  into v_candidate_count
  from pg_catalog.unnest(p_candidate_window_ids) as candidate_id;
  if v_candidate_count <> pg_catalog.cardinality(p_candidate_window_ids) then
    raise exception 'duplicate_candidate_window';
  end if;

  v_request_hash := pg_catalog.md5(
    p_activity_id || ':' || p_week_key::text || ':' || pg_catalog.array_to_string(p_candidate_window_ids, ',')
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('weekly:' || v_actor::text || ':' || p_week_key::text, 0));

  select application.* into v_existing
  from public.quantum_weekly_applications as application
  where application.user_id = v_actor and application.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.request_hash <> v_request_hash then raise exception 'idempotency_key_reused'; end if;
    return public.get_my_weekly_activity_discovery(p_week_key);
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_candidate_window_ids) as selected(window_id)
    left join public.quantum_weekly_activity_windows as activity_window on activity_window.id = selected.window_id
    where activity_window.id is null
       or activity_window.activity_id <> p_activity_id
       or activity_window.week_key <> p_week_key
       or activity_window.status <> 'recruiting'
       or activity_window.application_closes_at <= v_now
       or activity_window.starts_at <= v_now
  ) then raise exception 'weekly_window_unavailable'; end if;

  insert into public.quantum_weekly_applications (
    user_id, activity_id, week_key, idempotency_key, request_hash
  ) values (v_actor, p_activity_id, p_week_key, p_idempotency_key, v_request_hash)
  returning id into v_application_id;

  insert into public.quantum_weekly_application_candidates (application_id, window_id, preference_rank)
  select v_application_id, selected.window_id, selected.ordinality::smallint
  from pg_catalog.unnest(p_candidate_window_ids) with ordinality as selected(window_id, ordinality);

  return public.get_my_weekly_activity_discovery(p_week_key);
end
$$;

create or replace function public.cancel_my_weekly_activity_application(
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
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_application_id is null or p_expected_revision is null or p_expected_revision < 0 or p_idempotency_key is null then
    raise exception 'invalid_cancel_request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('weekly-application:' || p_application_id::text, 0));
  select application.* into v_application
  from public.quantum_weekly_applications as application
  where application.id = p_application_id and application.user_id = v_actor
  for update;
  if v_application.id is null then raise exception 'weekly_application_not_found'; end if;
  if v_application.status = 'cancelled' then return public.get_my_weekly_activity_discovery(v_application.week_key); end if;
  if v_application.status = 'assigned' then raise exception 'assigned_application_cannot_cancel'; end if;
  if v_application.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  update public.quantum_weekly_applications
  set status = 'cancelled', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = v_application.id;
  return public.get_my_weekly_activity_discovery(v_application.week_key);
end
$$;

create or replace function public.assign_weekly_application_for_service(
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
  v_gender text;
  v_gender_count integer;
  v_roster_count integer;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_application_id is null or p_window_id is null or p_occurrence_id is null
     or p_expected_revision is null or p_expected_revision < 0 or p_idempotency_key is null then
    raise exception 'invalid_assignment_request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('weekly-window:' || p_window_id::text, 0));
  select application.* into v_application
  from public.quantum_weekly_applications as application
  where application.id = p_application_id for update;
  select activity_window.* into v_window
  from public.quantum_weekly_activity_windows as activity_window
  where activity_window.id = p_window_id for update;
  select occurrence.* into v_occurrence
  from public.quantum_event_occurrences as occurrence
  where occurrence.id = p_occurrence_id for update;
  if v_application.id is null or v_window.id is null or v_occurrence.id is null then raise exception 'assignment_not_found'; end if;
  if v_application.status = 'assigned' then
    if v_application.assigned_window_id = p_window_id
       and v_application.assigned_occurrence_id = p_occurrence_id
       and v_application.assignment_idempotency_key = p_idempotency_key then
      return pg_catalog.jsonb_build_object('application_id', v_application.id, 'assigned_occurrence_id', p_occurrence_id, 'replayed', true);
    end if;
    raise exception 'application_already_assigned';
  end if;
  if v_application.status <> 'active' or v_application.revision <> p_expected_revision then raise exception 'stale_assignment'; end if;
  if not public.is_profile_matching_ready(v_application.user_id) then raise exception 'matching_profile_not_ready'; end if;
  if v_application.activity_id <> v_window.activity_id or v_application.week_key <> v_window.week_key then
    raise exception 'application_window_mismatch';
  end if;
  if not exists (
    select 1 from public.quantum_weekly_application_candidates as candidate
    where candidate.application_id = p_application_id and candidate.window_id = p_window_id
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
    select 1 from public.quantum_weekly_applications as assigned
    where assigned.assigned_occurrence_id = p_occurrence_id
      and assigned.assigned_window_id <> p_window_id
      and assigned.status = 'assigned'
  ) then raise exception 'occurrence_window_mismatch'; end if;
  if (select pg_catalog.count(*) from public.quantum_weekly_applications as assigned
      where assigned.assigned_window_id = p_window_id and assigned.status = 'assigned') >= v_window.capacity then
    raise exception 'window_capacity_full';
  end if;
  if (select pg_catalog.count(*) from public.quantum_weekly_applications as assigned
      where assigned.assigned_occurrence_id = p_occurrence_id and assigned.status = 'assigned') >=
      least(v_window.capacity, v_occurrence.required_total) then
    raise exception 'window_capacity_full';
  end if;
  select profile.gender into v_gender from public.profiles as profile where profile.user_id = v_application.user_id;
  if v_gender not in ('male', 'female') then raise exception 'matching_profile_not_ready'; end if;
  select pg_catalog.count(*)::integer,
         pg_catalog.count(*) filter (where room_person.gender = v_gender)::integer
  into v_roster_count, v_gender_count
  from private.quantum_event_room_people(p_occurrence_id) as room_person
  where room_person.participant_user_id <> v_application.user_id;
  if v_roster_count + 1 > v_occurrence.required_total then
    raise exception 'window_capacity_full';
  end if;
  if (v_gender = 'male' and v_gender_count >= v_occurrence.male_capacity)
     or (v_gender = 'female' and v_gender_count >= v_occurrence.female_capacity) then
    raise exception 'occurrence_gender_capacity_full';
  end if;
  if exists (
    select 1
    from public.quantum_event_participations as participation
    join public.quantum_event_occurrences as occurrence on occurrence.id = participation.occurrence_id
    where participation.user_id = v_application.user_id
      and participation.status = 'confirmed'
      and occurrence.status in ('confirmed', 'assignment')
      and pg_catalog.tstzrange(occurrence.starts_at, occurrence.ends_at, '[)')
          && pg_catalog.tstzrange(v_window.starts_at, v_window.ends_at, '[)')
  ) or exists (
    select 1
    from public.quantum_continuation_occurrence_members as member
    join public.quantum_continuation_occurrences as occurrence on occurrence.id = member.occurrence_id
    where member.participant_user_id = v_application.user_id
      and member.attendance_status <> 'cancelled'
      and occurrence.status in ('confirmed', 'in_progress')
      and pg_catalog.tstzrange(occurrence.starts_at, occurrence.ends_at, '[)')
          && pg_catalog.tstzrange(v_window.starts_at, v_window.ends_at, '[)')
  ) then raise exception 'confirmed_schedule_conflict'; end if;

  insert into public.quantum_event_participations (
    user_id, event_id, event_mode, party_type, group_id, occurrence_id,
    status, match_id, cancel_reason, completed_at
  ) values (
    v_application.user_id, v_window.activity_id, 'scheduled', 'solo', null,
    p_occurrence_id, 'recruiting', null, null, null
  ) on conflict (user_id) do update
    set event_id = excluded.event_id,
        event_mode = excluded.event_mode,
        party_type = excluded.party_type,
        group_id = null,
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
  if not found then raise exception 'event_state_locked'; end if;

  update public.quantum_weekly_applications
  set status = 'assigned', assigned_window_id = p_window_id, assigned_occurrence_id = p_occurrence_id,
      assignment_idempotency_key = p_idempotency_key,
      revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = p_application_id and revision = p_expected_revision;
  if not found then raise exception 'stale_assignment'; end if;
  return pg_catalog.jsonb_build_object('application_id', p_application_id, 'assigned_occurrence_id', p_occurrence_id, 'replayed', false);
end
$$;

create or replace function public.resolve_weekly_attendance_for_service(
  p_occurrence_id uuid,
  p_participant_user_id uuid,
  p_attendance_status text,
  p_expected_attendance_revision integer,
  p_resolution_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_occurrence public.quantum_event_occurrences%rowtype;
  v_existing public.quantum_weekly_attendance_resolutions%rowtype;
  v_audit public.quantum_weekly_attendance_audit%rowtype;
  v_before_status text;
  v_resulting_revision integer;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_occurrence_id is null or p_participant_user_id is null
     or p_attendance_status not in ('present', 'absent', 'disputed')
     or p_expected_attendance_revision is null or p_expected_attendance_revision < 0
     or p_resolution_id is null or p_reason is null
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 280 then
    raise exception 'invalid_attendance_resolution';
  end if;

  select audit.* into v_audit
  from public.quantum_weekly_attendance_audit as audit
  where audit.resolution_id = p_resolution_id;
  if v_audit.id is not null then
    if v_audit.occurrence_id <> p_occurrence_id
       or v_audit.participant_user_id <> p_participant_user_id
       or v_audit.after_status <> p_attendance_status then
      raise exception 'resolution_id_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'occurrence_id', v_audit.occurrence_id,
      'participant_user_id', v_audit.participant_user_id,
      'attendance_status', v_audit.after_status,
      'attendance_revision', v_audit.resulting_revision,
      'replayed', true
    );
  end if;

  select occurrence.* into v_occurrence
  from public.quantum_event_occurrences as occurrence
  where occurrence.id = p_occurrence_id
  for update;
  if v_occurrence.id is null then raise exception 'event_occurrence_not_found'; end if;
  if v_occurrence.event_mode <> 'scheduled'
     or v_occurrence.status not in ('confirmed', 'completed')
     or v_occurrence.starts_at > pg_catalog.statement_timestamp() then
    raise exception 'attendance_resolution_not_allowed';
  end if;
  if not exists (
    select 1 from public.quantum_event_match_members as member
    where member.occurrence_id = p_occurrence_id and member.user_id = p_participant_user_id
  ) then raise exception 'occurrence_member_not_found'; end if;

  select resolution.* into v_existing
  from public.quantum_weekly_attendance_resolutions as resolution
  where resolution.occurrence_id = p_occurrence_id
    and resolution.participant_user_id = p_participant_user_id
  for update;
  if v_existing.occurrence_id is null then
    if p_expected_attendance_revision <> 0 then raise exception 'stale_attendance_revision'; end if;
    v_before_status := null;
    v_resulting_revision := 1;
    insert into public.quantum_weekly_attendance_resolutions (
      occurrence_id, participant_user_id, attendance_status, roster_revision,
      attendance_revision, resolution_id
    ) values (
      p_occurrence_id, p_participant_user_id, p_attendance_status,
      v_occurrence.roster_revision, v_resulting_revision, p_resolution_id
    );
  else
    if v_existing.attendance_revision <> p_expected_attendance_revision then
      raise exception 'stale_attendance_revision';
    end if;
    v_before_status := v_existing.attendance_status;
    v_resulting_revision := v_existing.attendance_revision + 1;
    update public.quantum_weekly_attendance_resolutions
    set attendance_status = p_attendance_status,
        roster_revision = v_occurrence.roster_revision,
        attendance_revision = v_resulting_revision,
        resolution_id = p_resolution_id,
        recorded_at = pg_catalog.clock_timestamp()
    where occurrence_id = p_occurrence_id
      and participant_user_id = p_participant_user_id
      and attendance_revision = p_expected_attendance_revision;
    if not found then raise exception 'stale_attendance_revision'; end if;
  end if;

  insert into public.quantum_weekly_attendance_audit (
    occurrence_id, participant_user_id, resolution_id, before_status, after_status,
    previous_revision, resulting_revision, recorded_by_kind, recorded_by, reason
  ) values (
    p_occurrence_id, p_participant_user_id, p_resolution_id, v_before_status,
    p_attendance_status, p_expected_attendance_revision, v_resulting_revision,
    'service', null, pg_catalog.btrim(p_reason)
  );
  return pg_catalog.jsonb_build_object(
    'occurrence_id', p_occurrence_id,
    'participant_user_id', p_participant_user_id,
    'attendance_status', p_attendance_status,
    'attendance_revision', v_resulting_revision,
    'replayed', false
  );
end
$$;

revoke all on function public.resolve_weekly_attendance_for_service(uuid, uuid, text, integer, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_weekly_attendance_for_service(uuid, uuid, text, integer, uuid, text)
  to service_role;

create or replace function public.register_my_tonight_continuation_source(
  p_team_id uuid,
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
  v_team public.tonight_teams%rowtype;
  v_activity public.tonight_round_activities%rowtype;
  v_confirmation public.tonight_partner_service_confirmations%rowtype;
  v_existing public.quantum_continuation_sources%rowtype;
  v_member_count integer;
  v_attendance_count integer;
  v_arrived_count integer;
  v_attendance_revision integer;
  v_snapshot jsonb;
  v_snapshot_hash text;
  v_activity_kind text;
  v_source_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_team_id is null or p_idempotency_key is null then
    raise exception 'invalid_source_registration';
  end if;

  select team.* into v_team
  from public.tonight_teams as team
  where team.id = p_team_id
  for update;
  if v_team.id is null then raise exception 'tonight_team_not_found'; end if;
  if v_team.status <> 'completed' then raise exception 'tonight_team_not_completed'; end if;

  perform 1
  from public.tonight_team_members as member
  where member.team_id = p_team_id
  order by member.seat_number
  for no key update;
  perform 1
  from public.tonight_attendance as attendance
  where attendance.team_id = p_team_id
  order by attendance.id
  for no key update;

  if not exists (
    select 1
    from public.tonight_team_members as member
    join public.tonight_attendance as attendance
      on attendance.team_id = member.team_id and attendance.application_id = member.application_id
    where member.team_id = p_team_id
      and member.user_id = v_actor
      and attendance.status = 'arrived'
  ) then raise exception 'source_attendee_required'; end if;

  select activity.* into v_activity
  from public.tonight_round_activities as activity
  where activity.id = v_team.activity_id and activity.round_id = v_team.round_id;
  if v_activity.id is null then raise exception 'tonight_activity_not_found'; end if;

  select confirmation.* into v_confirmation
  from public.tonight_partner_service_confirmations as confirmation
  where confirmation.team_id = p_team_id
  for update;
  if v_confirmation.id is null then raise exception 'actual_attendance_unknown'; end if;

  select pg_catalog.count(*)::integer,
         pg_catalog.count(attendance.id)::integer,
         pg_catalog.count(*) filter (where attendance.status = 'arrived')::integer,
         coalesce(pg_catalog.max(attendance.revision), 0)::integer
  into v_member_count, v_attendance_count, v_arrived_count, v_attendance_revision
  from public.tonight_team_members as member
  left join public.tonight_attendance as attendance
    on attendance.team_id = member.team_id and attendance.application_id = member.application_id
  where member.team_id = p_team_id;

  if v_team.member_count not in (5, 6) or v_member_count <> v_team.member_count then
    raise exception 'source_roster_invalid';
  end if;
  if v_attendance_count <> v_member_count or exists (
    select 1 from public.tonight_attendance as attendance
    where attendance.team_id = p_team_id and attendance.status = 'pending'
  ) then raise exception 'actual_attendance_unknown'; end if;
  if v_confirmation.confirmed_attendee_count <> v_arrived_count
     or v_confirmation.observed_arrived_count <> v_arrived_count then
    raise exception 'confirmed_attendance_mismatch';
  end if;
  if v_confirmation.service_completed_at > pg_catalog.clock_timestamp() then
    raise exception 'invalid_source_completion_time';
  end if;

  v_activity_kind := case v_activity.activity_kind
    when 'board_game' then 'board_game'
    when 'walk' then 'walk'
    when 'bar' then 'meal'
    when 'cafe' then 'meal'
    else 'other'
  end;
  select pg_catalog.jsonb_build_object(
    'source_kind', 'tonight_team',
    'team_id', v_team.id,
    'team_revision', v_team.revision,
    'service_confirmation_revision', v_confirmation.revision,
    'source_completed_at', v_confirmation.service_completed_at,
    'activity', pg_catalog.jsonb_build_object(
      'id', v_activity.id,
      'source_kind', v_activity.activity_kind,
      'kind', v_activity_kind,
      'title', v_activity.title,
      'description', v_activity.description,
      'image_url', v_activity.image_url,
      'duration_minutes', v_activity.duration_minutes
    ),
    'members', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', member.user_id,
      'seat_number', member.seat_number,
      'member_status', member.member_status,
      'attendance_status', attendance.status,
      'attendance_revision', attendance.revision
    ) order by member.seat_number), '[]'::jsonb)
  )
  into v_snapshot
  from public.tonight_team_members as member
  join public.tonight_attendance as attendance
    on attendance.team_id = member.team_id and attendance.application_id = member.application_id
  where member.team_id = p_team_id;
  v_snapshot_hash := pg_catalog.md5(v_snapshot::text);

  select source.* into v_existing
  from public.quantum_continuation_sources as source
  where source.idempotency_key = p_idempotency_key;
  if v_existing.id is not null and v_existing.tonight_team_id is distinct from p_team_id then
    raise exception 'idempotency_key_reused';
  end if;
  if v_existing.id is null then
    select source.* into v_existing
    from public.quantum_continuation_sources as source
    where source.tonight_team_id = p_team_id;
  end if;
  if v_existing.id is not null then
    if v_existing.snapshot_hash <> v_snapshot_hash
       or v_existing.roster_revision <> v_team.revision
       or v_existing.attendance_revision <> v_attendance_revision then
      raise exception 'source_snapshot_changed';
    end if;
    return pg_catalog.jsonb_build_object(
      'source_id', v_existing.id,
      'source_kind', v_existing.source_kind,
      'activity_kind', v_existing.activity_kind,
      'roster_revision', v_existing.roster_revision,
      'attendance_revision', v_existing.attendance_revision,
      'replayed', true
    );
  end if;

  insert into public.quantum_continuation_sources (
    source_kind, tonight_team_id, scheduled_event_occurrence_id, activity_kind,
    activity_snapshot, roster_revision, attendance_revision, snapshot_hash,
    source_completed_at, idempotency_key
  ) values (
    'tonight_team', p_team_id, null, v_activity_kind, v_snapshot -> 'activity',
    v_team.revision, v_attendance_revision, v_snapshot_hash,
    v_confirmation.service_completed_at, p_idempotency_key
  ) returning id into v_source_id;

  insert into public.quantum_continuation_source_members (
    source_id, participant_user_id, seat_number, attendance_status,
    roster_revision, attendance_revision
  )
  select v_source_id, member.user_id, member.seat_number,
         case when attendance.status = 'arrived' then 'present' else 'absent' end,
         v_team.revision, attendance.revision
  from public.tonight_team_members as member
  join public.tonight_attendance as attendance
    on attendance.team_id = member.team_id and attendance.application_id = member.application_id
  where member.team_id = p_team_id
  order by member.seat_number;

  return pg_catalog.jsonb_build_object(
    'source_id', v_source_id,
    'source_kind', 'tonight_team',
    'activity_kind', v_activity_kind,
    'roster_revision', v_team.revision,
    'attendance_revision', v_attendance_revision,
    'replayed', false
  );
end
$$;

revoke all on function public.register_my_tonight_continuation_source(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.register_my_tonight_continuation_source(uuid, uuid)
  to authenticated;

create or replace function public.register_my_scheduled_continuation_source(
  p_occurrence_id uuid,
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
  v_occurrence public.quantum_event_occurrences%rowtype;
  v_window public.quantum_weekly_activity_windows%rowtype;
  v_existing public.quantum_continuation_sources%rowtype;
  v_member_count integer;
  v_application_count integer;
  v_attendance_count integer;
  v_attendance_revision integer;
  v_snapshot jsonb;
  v_snapshot_hash text;
  v_source_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_occurrence_id is null or p_idempotency_key is null then
    raise exception 'invalid_source_registration';
  end if;

  select occurrence.* into v_occurrence
  from public.quantum_event_occurrences as occurrence
  where occurrence.id = p_occurrence_id
  for update;
  if v_occurrence.id is null then raise exception 'event_occurrence_not_found'; end if;
  if v_occurrence.event_mode <> 'scheduled' or v_occurrence.status <> 'completed' then
    raise exception 'scheduled_occurrence_not_completed';
  end if;

  perform 1 from public.quantum_event_match_members as member
  where member.occurrence_id = p_occurrence_id
  order by member.user_id
  for no key update;
  perform 1 from public.quantum_weekly_attendance_resolutions as attendance
  where attendance.occurrence_id = p_occurrence_id
  order by attendance.participant_user_id
  for no key update;

  if not exists (
    select 1
    from public.quantum_event_match_members as member
    join public.quantum_weekly_attendance_resolutions as attendance
      on attendance.occurrence_id = member.occurrence_id
     and attendance.participant_user_id = member.user_id
    where member.occurrence_id = p_occurrence_id
      and member.user_id = v_actor
      and attendance.attendance_status = 'present'
  ) then raise exception 'source_attendee_required'; end if;

  select activity_window.* into v_window
  from public.quantum_weekly_applications as application
  join public.quantum_weekly_activity_windows as activity_window on activity_window.id = application.assigned_window_id
  where application.assigned_occurrence_id = p_occurrence_id and application.status = 'assigned'
  order by activity_window.id
  limit 1;
  if v_window.id is null or (
    select pg_catalog.count(distinct application.assigned_window_id)
    from public.quantum_weekly_applications as application
    where application.assigned_occurrence_id = p_occurrence_id and application.status = 'assigned'
  ) <> 1 then raise exception 'weekly_source_window_unknown'; end if;

  select pg_catalog.count(*)::integer
  into v_member_count
  from public.quantum_event_match_members as member
  where member.occurrence_id = p_occurrence_id;
  select pg_catalog.count(*)::integer
  into v_application_count
  from public.quantum_event_match_members as member
  join public.quantum_weekly_applications as application
    on application.user_id = member.user_id
   and application.assigned_occurrence_id = member.occurrence_id
   and application.assigned_window_id = v_window.id
   and application.status = 'assigned'
  where member.occurrence_id = p_occurrence_id;
  select pg_catalog.count(*)::integer,
         coalesce(pg_catalog.max(attendance.attendance_revision), 0)::integer
  into v_attendance_count, v_attendance_revision
  from public.quantum_weekly_attendance_resolutions as attendance
  where attendance.occurrence_id = p_occurrence_id;

  if v_member_count not in (5, 6) or v_application_count <> v_member_count then
    raise exception 'source_roster_invalid';
  end if;
  if v_attendance_count <> v_member_count or exists (
    select 1 from public.quantum_weekly_attendance_resolutions as attendance
    where attendance.occurrence_id = p_occurrence_id
      and (
        attendance.attendance_status in ('disputed')
        or attendance.roster_revision <> v_occurrence.roster_revision
      )
  ) then raise exception 'actual_attendance_unknown'; end if;

  select pg_catalog.jsonb_build_object(
    'source_kind', 'scheduled_event_occurrence',
    'occurrence_id', v_occurrence.id,
    'roster_revision', v_occurrence.roster_revision,
    'source_completed_at', v_occurrence.updated_at,
    'activity', v_window.activity_snapshot || pg_catalog.jsonb_build_object(
      'id', v_window.activity_id,
      'kind', v_window.activity_kind,
      'title', v_window.title,
      'summary', v_window.summary,
      'location_name', v_window.location_name,
      'starts_at', v_occurrence.starts_at,
      'ends_at', v_occurrence.ends_at
    ),
    'members', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', member.user_id,
      'attendance_status', attendance.attendance_status,
      'attendance_revision', attendance.attendance_revision
    ) order by member.user_id), '[]'::jsonb)
  ) into v_snapshot
  from public.quantum_event_match_members as member
  join public.quantum_weekly_attendance_resolutions as attendance
    on attendance.occurrence_id = member.occurrence_id
   and attendance.participant_user_id = member.user_id
  where member.occurrence_id = p_occurrence_id;
  v_snapshot_hash := pg_catalog.md5(v_snapshot::text);

  select source.* into v_existing
  from public.quantum_continuation_sources as source
  where source.idempotency_key = p_idempotency_key;
  if v_existing.id is not null
     and v_existing.scheduled_event_occurrence_id is distinct from p_occurrence_id then
    raise exception 'idempotency_key_reused';
  end if;
  if v_existing.id is null then
    select source.* into v_existing
    from public.quantum_continuation_sources as source
    where source.scheduled_event_occurrence_id = p_occurrence_id;
  end if;
  if v_existing.id is not null then
    if v_existing.snapshot_hash <> v_snapshot_hash
       or v_existing.roster_revision <> v_occurrence.roster_revision
       or v_existing.attendance_revision <> v_attendance_revision then
      raise exception 'source_snapshot_changed';
    end if;
    return pg_catalog.jsonb_build_object(
      'source_id', v_existing.id,
      'source_kind', v_existing.source_kind,
      'activity_kind', v_existing.activity_kind,
      'roster_revision', v_existing.roster_revision,
      'attendance_revision', v_existing.attendance_revision,
      'replayed', true
    );
  end if;

  insert into public.quantum_continuation_sources (
    source_kind, tonight_team_id, scheduled_event_occurrence_id, activity_kind,
    activity_snapshot, roster_revision, attendance_revision, snapshot_hash,
    source_completed_at, idempotency_key
  ) values (
    'scheduled_event_occurrence', null, p_occurrence_id, v_window.activity_kind,
    v_snapshot -> 'activity', v_occurrence.roster_revision, v_attendance_revision,
    v_snapshot_hash, v_occurrence.updated_at, p_idempotency_key
  ) returning id into v_source_id;

  insert into public.quantum_continuation_source_members (
    source_id, participant_user_id, seat_number, attendance_status,
    roster_revision, attendance_revision
  )
  select v_source_id, member.user_id,
         pg_catalog.row_number() over (order by member.user_id)::smallint,
         attendance.attendance_status, v_occurrence.roster_revision,
         attendance.attendance_revision
  from public.quantum_event_match_members as member
  join public.quantum_weekly_attendance_resolutions as attendance
    on attendance.occurrence_id = member.occurrence_id
   and attendance.participant_user_id = member.user_id
  where member.occurrence_id = p_occurrence_id
  order by member.user_id;

  return pg_catalog.jsonb_build_object(
    'source_id', v_source_id,
    'source_kind', 'scheduled_event_occurrence',
    'activity_kind', v_window.activity_kind,
    'roster_revision', v_occurrence.roster_revision,
    'attendance_revision', v_attendance_revision,
    'replayed', false
  );
end
$$;

revoke all on function public.register_my_scheduled_continuation_source(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.register_my_scheduled_continuation_source(uuid, uuid)
  to authenticated;

create or replace function public.get_my_continuation_transition(p_transition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_transition public.quantum_continuation_transitions%rowtype;
  v_series public.quantum_continuation_series%rowtype;
  v_choice text;
  v_fee jsonb;
  v_fee_waived boolean;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select transition.* into v_transition
  from public.quantum_continuation_transitions as transition
  where transition.id = p_transition_id;
  if v_transition.id is null or not exists (
    select 1 from public.quantum_continuation_transition_members as member
    where member.transition_id = p_transition_id and member.participant_user_id = v_actor
  ) then raise exception 'continuation_transition_not_found'; end if;
  select series.* into v_series
  from public.quantum_continuation_series as series
  where series.id = v_transition.series_id;
  select choice.choice into v_choice
  from public.quantum_continuation_choices as choice
  where choice.transition_id = p_transition_id and choice.participant_user_id = v_actor;
  select member.fee_waived into v_fee_waived
  from public.quantum_continuation_transition_members as member
  where member.transition_id = p_transition_id and member.participant_user_id = v_actor;
  select pg_catalog.jsonb_build_object(
    'order_id', fee.id,
    'purpose', fee.purpose,
    'provider', fee.provider,
    'amount_krw', fee.amount_krw,
    'currency', fee.currency,
    'status', fee.status,
    'revision', fee.revision
  ) into v_fee
  from public.quantum_continuation_fee_orders as fee
  where fee.transition_id = p_transition_id
    and fee.owner_user_id = v_actor
    and fee.purpose = 'next_occurrence'
  order by fee.created_at desc
  limit 1;
  return pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.clock_timestamp(),
    'transition_id', v_transition.id,
    'series_id', v_transition.series_id,
    'transition_index', v_transition.transition_index,
    'target_program_day', v_transition.target_program_day,
    'physical_meeting_no', v_transition.target_program_day - v_series.start_program_day + 2,
    'state', v_transition.status,
    'closes_at', v_transition.closes_at,
    'roster_revision', v_transition.roster_revision,
    'participant_count', (
      select pg_catalog.count(*)::integer
      from public.quantum_continuation_transition_members as member
      where member.transition_id = v_transition.id
    ),
    'own_choice', v_choice,
    'own_fee_waived', coalesce(v_fee_waived, false),
    'own_fee', v_fee
  );
end
$$;

revoke all on function public.get_my_continuation_transition(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_continuation_transition(uuid)
  to authenticated;

-- Forward migrations can contribute a consented candidate to the next roster
-- without making the base migration depend on tables that do not exist yet.
create or replace function quantum_private.continuation_join_candidate_ids(
  p_series_id uuid,
  p_target_program_day smallint
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select '{}'::uuid[]
$$;

revoke all on function quantum_private.continuation_join_candidate_ids(uuid, smallint)
  from public, anon, authenticated, service_role;

create or replace function public.open_continuation_transition(
  p_source_id uuid,
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
  v_source public.quantum_continuation_sources%rowtype;
  v_series public.quantum_continuation_series%rowtype;
  v_transition public.quantum_continuation_transitions%rowtype;
  v_previous_occurrence public.quantum_continuation_occurrences%rowtype;
  v_member_ids uuid[];
  v_effective_member_ids uuid[];
  v_member_count integer;
  v_gender_count integer;
  v_start_program_day smallint;
  v_maximum_physical smallint;
  v_transition_index smallint;
  v_target_program_day smallint;
  v_minimum_participants integer;
  v_closes_at timestamptz;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_source_id is null or p_idempotency_key is null then raise exception 'invalid_transition_open'; end if;
  select source.* into v_source
  from public.quantum_continuation_sources as source
  where source.id = p_source_id
  for update;
  if v_source.id is null or not exists (
    select 1 from public.quantum_continuation_source_members as member
    where member.source_id = p_source_id
      and member.participant_user_id = v_actor
      and member.attendance_status = 'present'
  ) then raise exception 'continuation_source_not_found'; end if;
  if v_source.status <> 'ready' then raise exception 'continuation_source_not_ready'; end if;

  select transition.* into v_transition
  from public.quantum_continuation_transitions as transition
  join public.quantum_continuation_series as series on series.id = transition.series_id
  where series.source_id = p_source_id and transition.open_idempotency_key = p_idempotency_key;
  if v_transition.id is not null then return public.get_my_continuation_transition(v_transition.id); end if;

  select series.* into v_series
  from public.quantum_continuation_series as series
  where series.source_id = p_source_id
  for update;
  if v_series.id is null then
    v_start_program_day := case when v_source.activity_kind = 'board_game' then 2 else 1 end;
    v_maximum_physical := case when v_source.activity_kind = 'board_game' then 5 else 6 end;
    insert into public.quantum_continuation_series (
      source_id, start_program_day, maximum_physical_meeting_no
    ) values (p_source_id, v_start_program_day, v_maximum_physical)
    returning * into v_series;
  end if;
  if v_series.status <> 'active' then
    return pg_catalog.jsonb_build_object('series_id', v_series.id, 'terminal', true, 'state', v_series.status);
  end if;

  select transition.* into v_transition
  from public.quantum_continuation_transitions as transition
  where transition.series_id = v_series.id and transition.status <> 'closed'
  order by transition.transition_index desc
  limit 1;
  if v_transition.id is not null then
    if not exists (
      select 1 from public.quantum_continuation_transition_members as member
      where member.transition_id = v_transition.id and member.participant_user_id = v_actor
    ) then raise exception 'continuation_transition_not_found'; end if;
    return public.get_my_continuation_transition(v_transition.id);
  end if;

  select pg_catalog.count(*)::smallint
  into v_transition_index
  from public.quantum_continuation_transitions as transition
  where transition.series_id = v_series.id;
  v_target_program_day := v_series.start_program_day + v_transition_index;
  if v_target_program_day > 5 then
    update public.quantum_continuation_series
    set status = 'completed', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_series.id;
    return pg_catalog.jsonb_build_object('series_id', v_series.id, 'terminal', true, 'state', 'completed');
  end if;

  if v_transition_index = 0 then
    select pg_catalog.array_agg(member.participant_user_id order by member.seat_number)
    into v_member_ids
    from public.quantum_continuation_source_members as member
    where member.source_id = p_source_id and member.attendance_status = 'present';
    v_closes_at := pg_catalog.timezone(
      'Asia/Seoul',
      ((v_source.source_completed_at at time zone 'Asia/Seoul')::date + 1) + time '17:00'
    );
  else
    select occurrence.* into v_previous_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.series_id = v_series.id
      and occurrence.transition_index = v_transition_index - 1
    for update;
    if v_previous_occurrence.id is null or v_previous_occurrence.status <> 'completed' then
      raise exception 'previous_occurrence_not_completed';
    end if;
    if exists (
      select 1 from public.quantum_continuation_occurrence_members as member
      where member.occurrence_id = v_previous_occurrence.id
        and member.attendance_status in ('confirmed', 'disputed')
    ) then raise exception 'actual_attendance_unknown'; end if;
    select pg_catalog.array_agg(member.participant_user_id order by member.alias)
    into v_member_ids
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = v_previous_occurrence.id and member.attendance_status = 'present';
    v_closes_at := pg_catalog.timezone(
      'Asia/Seoul',
      ((v_previous_occurrence.ends_at at time zone 'Asia/Seoul')::date + 1) + time '17:00'
    );
  end if;

  if pg_catalog.clock_timestamp() >= v_closes_at then raise exception 'transition_cutoff_closed'; end if;
  v_effective_member_ids := coalesce(v_member_ids, '{}'::uuid[])
    || coalesce(
      quantum_private.continuation_join_candidate_ids(v_series.id, v_target_program_day),
      '{}'::uuid[]
    );
  v_member_count := coalesce(pg_catalog.cardinality(v_effective_member_ids), 0);
  v_minimum_participants := case when v_target_program_day in (1, 2) then 5 else 3 end;
  if v_member_count < v_minimum_participants then raise exception 'continuation_minimum_not_met'; end if;
  select pg_catalog.count(distinct profile.gender)::integer into v_gender_count
  from pg_catalog.unnest(v_effective_member_ids) as selected(user_id)
  join public.profiles as profile on profile.user_id = selected.user_id
  where profile.gender in ('male', 'female');
  if v_gender_count <> 2 then raise exception 'mixed_roster_required'; end if;

  insert into public.quantum_continuation_transitions (
    series_id, transition_index, target_program_day, roster_revision,
    open_idempotency_key, closes_at
  ) values (
    v_series.id, v_transition_index, v_target_program_day, v_source.roster_revision,
    p_idempotency_key, v_closes_at
  ) returning * into v_transition;
  insert into public.quantum_continuation_transition_members (
    transition_id, participant_user_id, roster_revision, source_program_day
  )
  select v_transition.id, selected.user_id, v_source.roster_revision,
         case when v_transition_index = 0 and v_source.activity_kind = 'board_game' then 1
              when v_transition_index > 0 then v_target_program_day - 1
              else null end
  from pg_catalog.unnest(v_member_ids) as selected(user_id);
  return public.get_my_continuation_transition(v_transition.id);
end
$$;

revoke all on function public.open_continuation_transition(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.open_continuation_transition(uuid, uuid)
  to authenticated;

create or replace function public.set_my_continuation_choice(
  p_transition_id uuid,
  p_choice text,
  p_expected_roster_revision integer,
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
  v_transition public.quantum_continuation_transitions%rowtype;
  v_existing public.quantum_continuation_choices%rowtype;
  v_missing_count integer;
  v_end_exists boolean;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_transition_id is null or p_choice not in ('continue', 'end')
     or p_expected_roster_revision is null or p_expected_roster_revision < 0
     or p_idempotency_key is null then raise exception 'invalid_continuation_choice'; end if;
  select transition.* into v_transition
  from public.quantum_continuation_transitions as transition
  where transition.id = p_transition_id
  for update;
  if v_transition.id is null or not exists (
    select 1 from public.quantum_continuation_transition_members as member
    where member.transition_id = p_transition_id and member.participant_user_id = v_actor
  ) then raise exception 'continuation_transition_not_found'; end if;

  select choice.* into v_existing
  from public.quantum_continuation_choices as choice
  where choice.participant_user_id = v_actor and choice.idempotency_key = p_idempotency_key;
  if v_existing.transition_id is not null then
    if v_existing.transition_id <> p_transition_id or v_existing.choice <> p_choice
       or v_existing.roster_revision <> p_expected_roster_revision then
      raise exception 'idempotency_key_reused';
    end if;
    return public.get_my_continuation_transition(p_transition_id);
  end if;

  if v_transition.roster_revision <> p_expected_roster_revision then raise exception 'stale_roster_revision'; end if;
  if v_transition.status not in ('awaiting_choices', 'payment_pending') then
    raise exception 'continuation_choice_locked';
  end if;
  if pg_catalog.clock_timestamp() >= v_transition.closes_at then
    update public.quantum_continuation_transitions
    set status = 'closed', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_transition_id;
    update public.quantum_continuation_series
    set status = 'completed', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_transition.series_id and status = 'active';
    update public.quantum_continuation_fee_orders
    set status = case
          when status in ('verifying', 'verified') then 'recovery_required'
          else 'cancelled'
        end,
        revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where transition_id = p_transition_id and status in ('prepared', 'verifying', 'verified');
    update public.quantum_continuation_notification_outbox
    set status = 'cancelled', claim_token = null, lease_expires_at = null,
        revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where transition_id = p_transition_id and status in ('pending', 'failed', 'processing');
    insert into public.quantum_continuation_notification_outbox (
      recipient_user_id, transition_id, occurrence_id, kind, deep_link, dedupe_key
    )
    select member.participant_user_id, p_transition_id, null, 'series_closed',
           '/match/series/' || v_transition.series_id::text,
           'series_cutoff_closed:' || p_transition_id::text || ':' || member.participant_user_id::text
    from public.quantum_continuation_transition_members as member
    where member.transition_id = p_transition_id
    on conflict (dedupe_key) do nothing;
    return public.get_my_continuation_transition(p_transition_id);
  end if;

  insert into public.quantum_continuation_choices (
    transition_id, participant_user_id, choice, roster_revision, idempotency_key
  ) values (
    p_transition_id, v_actor, p_choice, p_expected_roster_revision, p_idempotency_key
  ) on conflict (transition_id, participant_user_id) do update
    set choice = excluded.choice,
        roster_revision = excluded.roster_revision,
        idempotency_key = excluded.idempotency_key,
        updated_at = pg_catalog.clock_timestamp();

  select pg_catalog.count(*)::integer into v_missing_count
  from public.quantum_continuation_transition_members as member
  left join public.quantum_continuation_choices as choice
    on choice.transition_id = member.transition_id
   and choice.participant_user_id = member.participant_user_id
   and choice.roster_revision = member.roster_revision
  where member.transition_id = p_transition_id and choice.participant_user_id is null;
  select coalesce(pg_catalog.bool_or(choice.choice = 'end'), false)
  into v_end_exists
  from public.quantum_continuation_choices as choice
  where choice.transition_id = p_transition_id;

  if v_end_exists then
    update public.quantum_continuation_transitions
    set status = 'closed', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_transition_id;
    update public.quantum_continuation_series
    set status = 'completed', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_transition.series_id;
    update public.quantum_continuation_fee_orders
    set status = 'cancelled', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where transition_id = p_transition_id and status = 'prepared';
    update public.quantum_continuation_fee_orders
    set status = 'recovery_required', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where transition_id = p_transition_id and status in ('verifying', 'verified');
    update public.quantum_continuation_notification_outbox
    set status = 'cancelled', claim_token = null, lease_expires_at = null,
        revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where transition_id = p_transition_id and status in ('pending', 'failed', 'processing');
    insert into public.quantum_continuation_notification_outbox (
      recipient_user_id, transition_id, occurrence_id, kind, deep_link, dedupe_key
    )
    select member.participant_user_id, p_transition_id, null, 'series_closed',
           '/match/series/' || v_transition.series_id::text,
           'series_closed:' || p_transition_id::text || ':' || member.participant_user_id::text
    from public.quantum_continuation_transition_members as member
    where member.transition_id = p_transition_id
    on conflict (dedupe_key) do nothing;
  elsif v_missing_count = 0 then
    update public.quantum_continuation_transitions
    set status = 'payment_pending', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = p_transition_id and status = 'awaiting_choices';
  end if;
  return public.get_my_continuation_transition(p_transition_id);
end
$$;

revoke all on function public.set_my_continuation_choice(uuid, text, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_my_continuation_choice(uuid, text, integer, uuid)
  to authenticated;

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
  v_transition public.quantum_continuation_transitions%rowtype;
  v_existing public.quantum_continuation_fee_orders%rowtype;
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
    v_order := v_existing;
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
    insert into public.quantum_continuation_fee_orders (
      transition_id, owner_user_id, target_user_id, purpose, provider,
      notice_version, idempotency_key
    ) values (
      p_transition_id, v_actor, p_target_user_id, p_purpose, p_provider,
      '2026-09-05', p_idempotency_key
    ) returning * into v_order;
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
    'amount_krw', v_fee.amount_krw,
    'currency', v_fee.currency,
    'status', v_fee.status,
    'revision', v_fee.revision
  );
end
$$;

revoke all on function public.get_my_continuation_fee_order(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_continuation_fee_order(uuid)
  to authenticated;

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
  v_order public.quantum_continuation_fee_orders%rowtype;
  v_transition public.quantum_continuation_transitions%rowtype;
  v_replay_order_id uuid;
  v_all_verified boolean;
  v_recovery_required boolean;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
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
     and v_order.provider_verified
     and v_order.status in ('verified', 'recovery_required') then
    return pg_catalog.jsonb_build_object(
      'order_id', v_order.id, 'status', v_order.status,
      'replayed', true, 'recovery_required', v_order.status = 'recovery_required'
    );
  end if;
  if v_order.status not in ('prepared', 'verifying') then raise exception 'fee_order_not_confirmable'; end if;

  select transition.* into v_transition
  from public.quantum_continuation_transitions as transition
  where transition.id = p_transition_id
  for update;
  if v_transition.id is null then raise exception 'continuation_transition_not_found'; end if;
  v_recovery_required := p_purpose = 'next_occurrence'
    and (v_transition.status = 'closed' or pg_catalog.clock_timestamp() >= v_transition.closes_at);
  update public.quantum_continuation_fee_orders
  set status = case when v_recovery_required then 'recovery_required' else 'verified' end,
      provider_event_id = p_provider_event_id,
      provider_transaction_id = p_provider_transaction_id,
      provider_verified = true,
      revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_order_id;

  if p_purpose = 'friend_request' and not v_recovery_required then
    insert into public.quantum_continuation_friend_entitlements (
      fee_order_id, requester_user_id, target_user_id, transition_id
    ) values (
      p_order_id, p_owner_user_id, v_order.target_user_id, p_transition_id
    ) on conflict (fee_order_id) do nothing;
  elsif p_purpose = 'next_occurrence' and not v_recovery_required then
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
            and fee.status = 'verified'
            and fee.provider_verified
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
    'replayed', false,
    'recovery_required', v_recovery_required
  );
end
$$;

revoke all on function public.confirm_my_continuation_fee_for_service(uuid, uuid, uuid, text, text, text, text, integer, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_my_continuation_fee_for_service(uuid, uuid, uuid, text, text, text, text, integer, text, boolean)
  to service_role;

create or replace function public.schedule_continuation_occurrence_for_service(
  p_transition_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location_snapshot jsonb,
  p_expected_transition_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_transition public.quantum_continuation_transitions%rowtype;
  v_series public.quantum_continuation_series%rowtype;
  v_existing public.quantum_continuation_occurrences%rowtype;
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_member_count integer;
  v_gender_count integer;
  v_minimum integer;
  v_physical_meeting_no smallint;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_transition_id is null or p_starts_at is null or p_ends_at is null
     or p_ends_at <= p_starts_at or p_ends_at - p_starts_at not between interval '30 minutes' and interval '6 hours'
     or p_starts_at <= pg_catalog.clock_timestamp()
     or p_location_snapshot is null or pg_catalog.jsonb_typeof(p_location_snapshot) <> 'object'
     or not (p_location_snapshot @> '{"confirmed":true}'::jsonb)
     or pg_catalog.char_length(pg_catalog.btrim(p_location_snapshot ->> 'name')) not between 1 and 160
     or p_expected_transition_revision is null or p_expected_transition_revision < 0
     or p_idempotency_key is null then raise exception 'invalid_occurrence_schedule'; end if;
  select occurrence.* into v_existing
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.schedule_idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.transition_id <> p_transition_id or v_existing.starts_at <> p_starts_at
       or v_existing.ends_at <> p_ends_at or v_existing.location_snapshot <> p_location_snapshot then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object('occurrence_id', v_existing.id, 'replayed', true);
  end if;
  select transition.* into v_transition
  from public.quantum_continuation_transitions as transition
  where transition.id = p_transition_id
  for update;
  if v_transition.id is null then raise exception 'continuation_transition_not_found'; end if;
  if v_transition.status <> 'ready_to_schedule' then raise exception 'transition_not_ready_to_schedule'; end if;
  if v_transition.revision <> p_expected_transition_revision then raise exception 'stale_transition_revision'; end if;
  if pg_catalog.clock_timestamp() >= v_transition.closes_at then raise exception 'transition_cutoff_closed'; end if;
  if v_transition.target_program_day = 2 and p_ends_at - p_starts_at <> interval '120 minutes' then
    raise exception 'invalid_day2_duration';
  end if;
  if v_transition.target_program_day <> 2 and p_ends_at - p_starts_at < interval '60 minutes' then
    raise exception 'invalid_occurrence_duration';
  end if;
  if v_transition.target_program_day = 2 and (
    not (p_location_snapshot ? 'indoor_fallback')
    or coalesce(pg_catalog.char_length(pg_catalog.btrim(p_location_snapshot ->> 'indoor_fallback')), 0) not between 1 and 500
  ) then raise exception 'day2_indoor_fallback_required'; end if;
  if v_transition.target_program_day = 5 and (
    not (p_location_snapshot ? 'route_summary')
    or coalesce(pg_catalog.char_length(pg_catalog.btrim(p_location_snapshot ->> 'route_summary')), 0) not between 1 and 500
    or not (p_location_snapshot ? 'weather_fallback')
    or coalesce(pg_catalog.char_length(pg_catalog.btrim(p_location_snapshot ->> 'weather_fallback')), 0) not between 1 and 500
    or not (p_location_snapshot ? 'return_guidance')
    or coalesce(pg_catalog.char_length(pg_catalog.btrim(p_location_snapshot ->> 'return_guidance')), 0) not between 1 and 500
  ) then raise exception 'day5_route_safety_details_required'; end if;
  select series.* into v_series
  from public.quantum_continuation_series as series
  where series.id = v_transition.series_id
  for update;
  if v_series.status <> 'active' then raise exception 'continuation_series_not_active'; end if;

  select pg_catalog.count(*)::integer,
         pg_catalog.count(distinct profile.gender)::integer
  into v_member_count, v_gender_count
  from public.quantum_continuation_transition_members as member
  join public.profiles as profile on profile.user_id = member.participant_user_id
  where member.transition_id = p_transition_id and profile.gender in ('male', 'female');
  v_minimum := case when v_transition.target_program_day in (1, 2) then 5 else 3 end;
  if v_member_count < v_minimum or v_gender_count <> 2 then raise exception 'continuation_roster_not_supported'; end if;
  if exists (
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
  ) then raise exception 'verified_fee_required'; end if;
  if exists (
    select 1
    from public.quantum_continuation_transition_members as member
    join public.quantum_event_participations as participation on participation.user_id = member.participant_user_id
    join public.quantum_event_occurrences as occurrence on occurrence.id = participation.occurrence_id
    where member.transition_id = p_transition_id
      and participation.status = 'confirmed'
      and occurrence.status in ('confirmed', 'assignment')
      and pg_catalog.tstzrange(occurrence.starts_at, occurrence.ends_at, '[)')
          && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')
  ) or exists (
    select 1
    from public.quantum_continuation_transition_members as candidate
    join public.quantum_continuation_occurrence_members as member
      on member.participant_user_id = candidate.participant_user_id
    join public.quantum_continuation_occurrences as occurrence on occurrence.id = member.occurrence_id
    where candidate.transition_id = p_transition_id
      and member.attendance_status <> 'cancelled'
      and occurrence.status in ('confirmed', 'in_progress')
      and pg_catalog.tstzrange(occurrence.starts_at, occurrence.ends_at, '[)')
          && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')
  ) then raise exception 'confirmed_schedule_conflict'; end if;

  v_physical_meeting_no := v_transition.target_program_day - v_series.start_program_day + 2;
  insert into public.quantum_continuation_occurrences (
    series_id, transition_id, schedule_idempotency_key, program_day,
    physical_meeting_no, transition_index, starts_at, ends_at,
    chat_opens_at, chat_send_closes_at, location_snapshot
  ) values (
    v_series.id, p_transition_id, p_idempotency_key, v_transition.target_program_day,
    v_physical_meeting_no, v_transition.transition_index, p_starts_at, p_ends_at,
    p_starts_at - interval '24 hours',
    least(p_ends_at - interval '30 minutes', p_starts_at + interval '2 hours'),
    p_location_snapshot
  ) returning * into v_occurrence;
  insert into public.quantum_continuation_occurrence_members (
    occurrence_id, participant_user_id, alias, roster_revision, visible_from_program_day
  )
  select v_occurrence.id, member.participant_user_id,
         '참가자 ' || pg_catalog.row_number() over (order by member.participant_user_id)::text,
         member.roster_revision, v_transition.target_program_day
  from public.quantum_continuation_transition_members as member
  where member.transition_id = p_transition_id
  order by member.participant_user_id;
  update public.quantum_continuation_transitions
  set status = 'scheduled', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = p_transition_id and revision = p_expected_transition_revision;
  if not found then raise exception 'stale_transition_revision'; end if;
  insert into public.quantum_continuation_notification_outbox (
    recipient_user_id, transition_id, occurrence_id, kind, deep_link, dedupe_key
  )
  select member.participant_user_id, null, v_occurrence.id, 'schedule_changed',
         '/match/occurrences/' || v_occurrence.id::text,
         'schedule_changed:' || v_occurrence.id::text || ':' || member.participant_user_id::text || ':0'
  from public.quantum_continuation_transition_members as member
  where member.transition_id = p_transition_id
  on conflict (dedupe_key) do nothing;
  return pg_catalog.jsonb_build_object(
    'occurrence_id', v_occurrence.id,
    'series_id', v_occurrence.series_id,
    'program_day', v_occurrence.program_day,
    'physical_meeting_no', v_occurrence.physical_meeting_no,
    'replayed', false
  );
end
$$;

revoke all on function public.schedule_continuation_occurrence_for_service(uuid, timestamptz, timestamptz, jsonb, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.schedule_continuation_occurrence_for_service(uuid, timestamptz, timestamptz, jsonb, integer, uuid)
  to service_role;

create or replace function public.resolve_continuation_occurrence_attendance_for_service(
  p_occurrence_id uuid,
  p_participant_user_id uuid,
  p_attendance_status text,
  p_expected_attendance_revision integer,
  p_resolution_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_member public.quantum_continuation_occurrence_members%rowtype;
  v_audit public.quantum_continuation_attendance_audit%rowtype;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_occurrence_id is null or p_participant_user_id is null
     or p_attendance_status not in ('present', 'absent', 'disputed')
     or p_expected_attendance_revision is null or p_expected_attendance_revision < 0
     or p_resolution_id is null or p_reason is null
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 280 then
    raise exception 'invalid_attendance_resolution';
  end if;
  select audit.* into v_audit
  from public.quantum_continuation_attendance_audit as audit
  where audit.resolution_id = p_resolution_id;
  if v_audit.id is not null then
    if v_audit.occurrence_id <> p_occurrence_id or v_audit.participant_user_id <> p_participant_user_id
       or v_audit.after_status <> p_attendance_status then raise exception 'resolution_id_reused'; end if;
    return pg_catalog.jsonb_build_object(
      'occurrence_id', p_occurrence_id, 'participant_user_id', p_participant_user_id,
      'attendance_status', v_audit.after_status, 'attendance_revision', v_audit.resulting_revision,
      'replayed', true
    );
  end if;
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id
  for update;
  if v_occurrence.id is null then raise exception 'continuation_occurrence_not_found'; end if;
  if v_occurrence.status not in ('confirmed', 'in_progress', 'completed')
     or pg_catalog.clock_timestamp() < v_occurrence.starts_at then
    raise exception 'attendance_resolution_not_allowed';
  end if;
  select member.* into v_member
  from public.quantum_continuation_occurrence_members as member
  where member.occurrence_id = p_occurrence_id and member.participant_user_id = p_participant_user_id
  for update;
  if v_member.occurrence_id is null then raise exception 'occurrence_member_not_found'; end if;
  if v_member.attendance_revision <> p_expected_attendance_revision then
    raise exception 'stale_attendance_revision';
  end if;
  update public.quantum_continuation_occurrence_members
  set attendance_status = p_attendance_status,
      attendance_revision = attendance_revision + 1,
      attendance_resolution_id = p_resolution_id
  where occurrence_id = p_occurrence_id and participant_user_id = p_participant_user_id
    and attendance_revision = p_expected_attendance_revision;
  if not found then raise exception 'stale_attendance_revision'; end if;
  insert into public.quantum_continuation_attendance_audit (
    occurrence_id, participant_user_id, resolution_id, before_status, after_status,
    previous_revision, resulting_revision, reason
  ) values (
    p_occurrence_id, p_participant_user_id, p_resolution_id, v_member.attendance_status,
    p_attendance_status, p_expected_attendance_revision, p_expected_attendance_revision + 1,
    pg_catalog.btrim(p_reason)
  );
  if v_occurrence.status = 'completed' then
    -- Attendance corrections keep closed/completed history intact, but make every
    -- later eligibility decision unusable until an operator reviews the series.
    update public.quantum_continuation_series
    set status = 'review_required', revision = revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where id = v_occurrence.series_id
      and status in ('active', 'completed')
      and (
        exists (
          select 1 from public.quantum_continuation_transitions as transition
          where transition.series_id = v_occurrence.series_id
            and transition.transition_index > v_occurrence.transition_index
        )
        or exists (
          select 1 from public.quantum_continuation_occurrences as occurrence
          where occurrence.series_id = v_occurrence.series_id
            and occurrence.transition_index > v_occurrence.transition_index
        )
      );
    update public.quantum_continuation_transitions
    set status = 'review_required', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where series_id = v_occurrence.series_id
      and transition_index > v_occurrence.transition_index
      and status in ('awaiting_choices', 'payment_pending', 'ready_to_schedule');
    update public.quantum_continuation_occurrences
    set status = 'review_required', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where series_id = v_occurrence.series_id
      and transition_index > v_occurrence.transition_index
      and status in ('confirmed', 'in_progress');
    update public.quantum_continuation_fee_orders as fee
    set status = case
          when fee.status in ('verifying', 'verified') then 'recovery_required'
          else 'cancelled'
        end,
        revision = fee.revision + 1, updated_at = pg_catalog.clock_timestamp()
    where fee.purpose = 'friend_request'
      and fee.transition_id in (
        select transition.id from public.quantum_continuation_transitions as transition
        where transition.series_id = v_occurrence.series_id
          and transition.transition_index = v_occurrence.transition_index
      )
      and (
        fee.owner_user_id = p_participant_user_id
        or fee.target_user_id = p_participant_user_id
      )
      and fee.status in ('prepared', 'verifying', 'verified');
    update public.quantum_continuation_friend_entitlements as entitlement
    set status = 'cancelled', revision = entitlement.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where entitlement.transition_id in (
      select transition.id from public.quantum_continuation_transitions as transition
      where transition.series_id = v_occurrence.series_id
        and transition.transition_index = v_occurrence.transition_index
    )
      and (
        entitlement.requester_user_id = p_participant_user_id
        or entitlement.target_user_id = p_participant_user_id
      )
      and entitlement.status in ('ready', 'queued');
    update public.quantum_continuation_fee_orders as fee
    set status = case
          when fee.status in ('verifying', 'verified') then 'recovery_required'
          else 'cancelled'
        end,
        revision = fee.revision + 1, updated_at = pg_catalog.clock_timestamp()
    where fee.transition_id in (
      select transition.id from public.quantum_continuation_transitions as transition
      where transition.series_id = v_occurrence.series_id
        and transition.transition_index > v_occurrence.transition_index
    ) and fee.status in ('prepared', 'verifying', 'verified');
    update public.quantum_continuation_friend_entitlements as entitlement
    set status = 'cancelled', revision = entitlement.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where entitlement.transition_id in (
      select transition.id from public.quantum_continuation_transitions as transition
      where transition.series_id = v_occurrence.series_id
        and transition.transition_index > v_occurrence.transition_index
    ) and entitlement.status in ('ready', 'queued');
    update public.quantum_continuation_notification_outbox as outbox
    set status = 'cancelled', claim_token = null, lease_expires_at = null,
        revision = outbox.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where outbox.transition_id in (
      select transition.id from public.quantum_continuation_transitions as transition
      where transition.series_id = v_occurrence.series_id
        and transition.transition_index > v_occurrence.transition_index
    ) and outbox.status in ('pending', 'processing', 'failed');
  end if;
  return pg_catalog.jsonb_build_object(
    'occurrence_id', p_occurrence_id, 'participant_user_id', p_participant_user_id,
    'attendance_status', p_attendance_status,
    'attendance_revision', p_expected_attendance_revision + 1,
    'replayed', false
  );
end
$$;

revoke all on function public.resolve_continuation_occurrence_attendance_for_service(uuid, uuid, text, integer, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_continuation_occurrence_attendance_for_service(uuid, uuid, text, integer, uuid, text)
  to service_role;

create or replace function public.get_my_continuation_occurrence_content(p_occurrence_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_occurrence public.quantum_continuation_occurrences%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id;
  if v_occurrence.id is null or not exists (
    select 1 from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
      and member.visible_from_program_day <= v_occurrence.program_day
      and member.attendance_status <> 'cancelled'
  ) then raise exception 'continuation_occurrence_not_found'; end if;
  return pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.clock_timestamp(),
    'occurrence_id', v_occurrence.id,
    'series_id', v_occurrence.series_id,
    'program_day', v_occurrence.program_day,
    'physical_meeting_no', v_occurrence.physical_meeting_no,
    'status', v_occurrence.status,
    'starts_at', v_occurrence.starts_at,
    'ends_at', v_occurrence.ends_at,
    'location', v_occurrence.location_snapshot,
    'content_state', v_occurrence.content_state,
    'content_revision', v_occurrence.content_revision,
    'members', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'alias', member.alias,
        'attendance_status', member.attendance_status
      ) order by member.alias), '[]'::jsonb)
      from public.quantum_continuation_occurrence_members as member
      where member.occurrence_id = v_occurrence.id
        and member.attendance_status <> 'cancelled'
    ),
    'commands', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'action', command.action,
        'payload', command.payload,
        'resulting_revision', command.resulting_revision,
        'created_at', command.created_at
      ) order by command.resulting_revision), '[]'::jsonb)
      from public.quantum_continuation_content_commands as command
      where command.occurrence_id = v_occurrence.id
    )
  );
end
$$;

revoke all on function public.get_my_continuation_occurrence_content(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_continuation_occurrence_content(uuid)
  to authenticated;

create or replace function public.apply_my_continuation_content_action(
  p_occurrence_id uuid,
  p_action text,
  p_payload jsonb,
  p_expected_content_revision integer,
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
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_existing public.quantum_continuation_content_commands%rowtype;
  v_allowed boolean := false;
  v_new_state jsonb;
  v_round integer;
  v_member_count integer;
  v_male_count integer;
  v_female_count integer;
  v_bowling_teams jsonb;
  v_bowling_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_occurrence_id is null or p_action is null
     or pg_catalog.char_length(pg_catalog.btrim(p_action)) not between 1 and 80
     or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or p_expected_content_revision is null or p_expected_content_revision < 0
     or p_idempotency_key is null then raise exception 'invalid_content_action'; end if;
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id
  for update;
  if v_occurrence.id is null or not exists (
    select 1 from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
      and member.attendance_status <> 'cancelled'
  ) then raise exception 'continuation_occurrence_not_found'; end if;

  select command.* into v_existing
  from public.quantum_continuation_content_commands as command
  where command.actor_user_id = v_actor and command.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.occurrence_id <> p_occurrence_id or v_existing.action <> p_action
       or v_existing.payload <> p_payload or v_existing.prior_revision <> p_expected_content_revision then
      raise exception 'idempotency_key_reused';
    end if;
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  if v_occurrence.status not in ('confirmed', 'in_progress') then raise exception 'content_action_locked'; end if;
  if pg_catalog.clock_timestamp() < v_occurrence.starts_at - interval '15 minutes'
     or pg_catalog.clock_timestamp() > v_occurrence.ends_at + interval '6 hours' then
    raise exception 'content_action_time_closed';
  end if;
  if v_occurrence.content_revision <> p_expected_content_revision then raise exception 'stale_content_revision'; end if;

  v_allowed := case v_occurrence.program_day
    when 1 then p_action in ('select_game', 'start_game', 'finish_game', 'finish_occurrence')
    when 2 then p_action in ('start_round', 'advance_prompt', 'finish_round', 'finish_occurrence')
    when 3 then p_action in ('save_practice_scores', 'set_teams', 'save_game_scores', 'finish_occurrence')
    when 4 then p_action in ('draw_card', 'take_break', 'finish_occurrence')
    when 5 then p_action in ('check_in', 'confirm_route', 'take_break', 'finish_occurrence')
    else false
  end;
  if not v_allowed then raise exception 'content_action_not_allowed_for_day'; end if;
  if pg_catalog.octet_length(p_payload::text) > 12000
     or (
       case
         when p_action in ('start_game', 'finish_game', 'finish_occurrence', 'take_break', 'check_in', 'confirm_route')
           then p_payload <> '{}'::jsonb
         when p_action = 'select_game' then p_payload - 'game_id' <> '{}'::jsonb
         when p_action in ('start_round', 'advance_prompt', 'finish_round')
           then p_payload - 'round' <> '{}'::jsonb
         when p_action in ('save_practice_scores', 'save_game_scores')
           then p_payload - 'scores' <> '{}'::jsonb
         when p_action = 'set_teams' then p_payload - 'teams' <> '{}'::jsonb
         when p_action = 'draw_card' then p_payload - 'card_id' <> '{}'::jsonb
         else true
       end
     ) then
    raise exception 'invalid_content_payload';
  end if;
  v_new_state := v_occurrence.content_state;

  if v_occurrence.program_day = 1 then
    if p_action = 'select_game' then
      if p_payload ->> 'game_id' not in ('dalmuti', 'halligalli', 'one-card') then
        raise exception 'invalid_game_selection';
      end if;
      v_new_state := v_new_state || pg_catalog.jsonb_build_object('selected_game', pg_catalog.btrim(p_payload ->> 'game_id'));
    elsif p_action = 'start_game' then
      if not (v_new_state ? 'selected_game') or coalesce((v_new_state ->> 'game_started')::boolean, false) then
        raise exception 'content_sequence_not_ready';
      end if;
      v_new_state := v_new_state || '{"game_started":true}'::jsonb;
    elsif p_action = 'finish_game' then
      if not coalesce((v_new_state ->> 'game_started')::boolean, false) then
        raise exception 'content_sequence_not_ready';
      end if;
      v_new_state := v_new_state || '{"game_finished":true}'::jsonb;
    elsif p_action = 'finish_occurrence' and not coalesce((v_new_state ->> 'game_finished')::boolean, false) then
      raise exception 'content_sequence_not_ready';
    end if;
  elsif v_occurrence.program_day = 2 then
    if p_action in ('start_round', 'advance_prompt', 'finish_round') and (
      not (p_payload ? 'round') or (p_payload ->> 'round') !~ '^[1-3]$'
    ) then raise exception 'invalid_conversation_round'; end if;
    v_round := coalesce((v_new_state ->> 'conversation_round')::integer, 0);
    if p_action = 'start_round' then
      if (p_payload ->> 'round')::integer <> v_round + 1
         or coalesce((v_new_state ->> 'round_active')::boolean, false) then
        raise exception 'content_sequence_not_ready';
      end if;
      v_new_state := v_new_state || pg_catalog.jsonb_build_object(
        'conversation_round', v_round + 1,
        'round_active', true,
        'round_duration_minutes', 30,
        'prompt_index', 0
      );
    elsif p_action = 'advance_prompt' then
      if (p_payload ->> 'round')::integer <> v_round
         or not coalesce((v_new_state ->> 'round_active')::boolean, false) then
        raise exception 'content_sequence_not_ready';
      end if;
      v_new_state := v_new_state || pg_catalog.jsonb_build_object(
        'prompt_index', coalesce((v_new_state ->> 'prompt_index')::integer, 0) + 1
      );
    elsif p_action = 'finish_round' then
      if (p_payload ->> 'round')::integer <> v_round
         or not coalesce((v_new_state ->> 'round_active')::boolean, false) then
        raise exception 'content_sequence_not_ready';
      end if;
      v_new_state := v_new_state || '{"round_active":false}'::jsonb;
    elsif p_action = 'finish_occurrence' and (
      v_round <> 3 or coalesce((v_new_state ->> 'round_active')::boolean, false)
    ) then raise exception 'content_sequence_not_ready'; end if;
  elsif v_occurrence.program_day = 3 then
    select pg_catalog.count(*)::integer into v_member_count
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id and member.attendance_status <> 'cancelled';
    if p_action = 'save_practice_scores' then
      if pg_catalog.jsonb_typeof(p_payload -> 'scores') <> 'array'
         or pg_catalog.jsonb_array_length(p_payload -> 'scores') <> v_member_count
         or exists (
           select 1 from pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)
           where pg_catalog.jsonb_typeof(score.value) <> 'object'
              or score.value - 'alias' - 'score' <> '{}'::jsonb
              or not exists (
                select 1 from public.quantum_continuation_occurrence_members as member
                where member.occurrence_id = p_occurrence_id
                  and member.attendance_status <> 'cancelled'
                  and member.alias = score.value ->> 'alias'
              )
              or not (case when score.value ->> 'score' ~ '^[0-9]{1,2}$'
                    then (score.value ->> 'score')::integer between 0 and 60 else false end)
         )
         or (select pg_catalog.count(distinct score.value ->> 'alias')
             from pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)) <> v_member_count then
        raise exception 'bowling_scores_required';
      end if;
      select pg_catalog.count(*) filter (where profile.gender = 'male')::integer,
             pg_catalog.count(*) filter (where profile.gender = 'female')::integer
      into v_male_count, v_female_count
      from public.quantum_continuation_occurrence_members as member
      join public.profiles as profile on profile.user_id = member.participant_user_id
      where member.occurrence_id = p_occurrence_id and member.attendance_status <> 'cancelled';
      if not (
        (v_member_count = 6 and v_male_count = 3 and v_female_count = 3)
        or (v_member_count = 5 and v_male_count in (2, 3) and v_female_count in (2, 3))
      ) then raise exception 'bowling_roster_not_supported'; end if;

      if v_member_count = 6 then
        with ranked as (
          select member.alias, profile.gender,
                 pg_catalog.row_number() over (
                   partition by profile.gender
                   order by (score.value ->> 'score')::integer desc, member.alias
                 ) as practice_rank
          from public.quantum_continuation_occurrence_members as member
          join public.profiles as profile on profile.user_id = member.participant_user_id
          join pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)
            on score.value ->> 'alias' = member.alias
          where member.occurrence_id = p_occurrence_id and member.attendance_status <> 'cancelled'
        )
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'alias', ranked.alias,
          'team', case
            when ranked.gender = 'male' then (array['A', 'B', 'C'])[ranked.practice_rank::integer]
            else (array['C', 'B', 'A'])[ranked.practice_rank::integer]
          end
        ) order by ranked.alias)
        into v_bowling_teams
        from ranked;
      else
        with roster as (
          select member.alias, profile.gender,
                 (score.value ->> 'score')::numeric
                   * case when profile.gender = 'female' then 1.5 else 1 end as adjusted_score
          from public.quantum_continuation_occurrence_members as member
          join public.profiles as profile on profile.user_id = member.participant_user_id
          join pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)
            on score.value ->> 'alias' = member.alias
          where member.occurrence_id = p_occurrence_id and member.attendance_status <> 'cancelled'
        ), candidate_pairs as (
          select left_member.alias as left_alias, right_member.alias as right_alias,
                 pg_catalog.abs(
                   (left_member.adjusted_score + right_member.adjusted_score) / 2
                   - (
                     (select pg_catalog.sum(all_member.adjusted_score) from roster as all_member)
                     - left_member.adjusted_score - right_member.adjusted_score
                   ) / 3
                 ) as score_difference,
                 left_member.alias || ',' || right_member.alias as pair_signature,
                 (select pg_catalog.string_agg(rest.alias, ',' order by rest.alias)
                  from roster as rest
                  where rest.alias not in (left_member.alias, right_member.alias)) as rest_signature
          from roster as left_member
          join roster as right_member on left_member.alias < right_member.alias
          where left_member.gender <> right_member.gender
            and exists (
              select 1 from roster as rest
              where rest.alias not in (left_member.alias, right_member.alias) and rest.gender = 'male'
            )
            and exists (
              select 1 from roster as rest
              where rest.alias not in (left_member.alias, right_member.alias) and rest.gender = 'female'
            )
        ), selected as (
          select pair.left_alias, pair.right_alias, pair.pair_signature, pair.rest_signature,
                 least(pair.pair_signature, pair.rest_signature) as team_a_signature
          from candidate_pairs as pair
          order by pair.score_difference,
                   least(pair.pair_signature, pair.rest_signature),
                   greatest(pair.pair_signature, pair.rest_signature)
          limit 1
        )
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'alias', roster.alias,
          'team', case
            when (roster.alias in (selected.left_alias, selected.right_alias))
              = (selected.pair_signature = selected.team_a_signature) then 'A'
            else 'B'
          end
        ) order by roster.alias)
        into v_bowling_teams
        from roster cross join selected;
      end if;
      if v_bowling_teams is null or pg_catalog.jsonb_array_length(v_bowling_teams) <> v_member_count then
        raise exception 'bowling_roster_not_supported';
      end if;
      v_new_state := v_new_state || pg_catalog.jsonb_build_object(
        'practice_scores', p_payload -> 'scores',
        'bowling_team_plan', v_bowling_teams,
        'bowling_comparison', case when v_member_count = 6 then 'adjusted_total' else 'adjusted_average' end
      );
    elsif p_action = 'set_teams' then
      if not (v_new_state ? 'bowling_team_plan')
         or p_payload -> 'teams' is distinct from v_new_state -> 'bowling_team_plan' then
        raise exception 'content_sequence_not_ready';
      end if;
      v_new_state := v_new_state || pg_catalog.jsonb_build_object('bowling_teams', v_new_state -> 'bowling_team_plan');
    elsif p_action = 'save_game_scores' then
      if (v_member_count not in (3, 4) and not (v_new_state ? 'bowling_teams'))
         or pg_catalog.jsonb_typeof(p_payload -> 'scores') <> 'array'
         or pg_catalog.jsonb_array_length(p_payload -> 'scores') <> v_member_count
         or exists (
           select 1 from pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)
           where pg_catalog.jsonb_typeof(score.value) <> 'object'
              or score.value - 'alias' - 'score' <> '{}'::jsonb
              or not exists (
                select 1 from public.quantum_continuation_occurrence_members as member
                where member.occurrence_id = p_occurrence_id
                  and member.attendance_status <> 'cancelled'
                  and member.alias = score.value ->> 'alias'
              )
              or not (case when score.value ->> 'score' ~ '^[0-9]{1,3}$'
                    then (score.value ->> 'score')::integer between 0 and 300 else false end)
         )
         or (select pg_catalog.count(distinct score.value ->> 'alias')
             from pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)) <> v_member_count then
        raise exception 'content_sequence_not_ready';
      end if;
      if v_member_count in (3, 4) then
        v_new_state := v_new_state || pg_catalog.jsonb_build_object(
          'game_scores', p_payload -> 'scores',
          'bowling_comparison', 'none',
          'bowling_result', '[]'::jsonb
        );
      else
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'team', ranked.team_name,
          'total', ranked.total,
          'rank', ranked.team_rank,
          'tied', ranked.same_score_count > 1
        ) order by ranked.total desc, ranked.team_name), '[]'::jsonb)
        into v_bowling_result
        from (
          select team_score.team_name, team_score.total,
                 pg_catalog.dense_rank() over (order by team_score.total desc)::integer as team_rank,
                 pg_catalog.count(*) over (partition by team_score.total)::integer as same_score_count
          from (
            select team.value ->> 'team' as team_name,
                   pg_catalog.round(case when v_member_count = 5 then pg_catalog.sum(
                     (score.value ->> 'score')::numeric
                     * case when profile.gender = 'female' then 1.5 else 1 end
                   ) / pg_catalog.count(*) else pg_catalog.sum(
                     (score.value ->> 'score')::numeric
                     * case when profile.gender = 'female' then 1.5 else 1 end
                   ) end, 1) as total
            from pg_catalog.jsonb_array_elements(v_new_state -> 'bowling_teams') as team(value)
            join pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)
              on score.value ->> 'alias' = team.value ->> 'alias'
            join public.quantum_continuation_occurrence_members as member
              on member.occurrence_id = p_occurrence_id and member.alias = team.value ->> 'alias'
            join public.profiles as profile on profile.user_id = member.participant_user_id
            group by team.value ->> 'team'
          ) as team_score
        ) as ranked;
        v_new_state := v_new_state || pg_catalog.jsonb_build_object(
          'game_scores', p_payload -> 'scores',
          'bowling_result', v_bowling_result
        );
      end if;
    elsif p_action = 'finish_occurrence' and not (v_new_state ? 'game_scores') then
      raise exception 'content_sequence_not_ready';
    end if;
  elsif v_occurrence.program_day = 4 then
    if p_action = 'draw_card' then
      if coalesce(pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'card_id')), 0) not between 1 and 80 then
        raise exception 'invalid_card_draw';
      end if;
      v_new_state := v_new_state || pg_catalog.jsonb_build_object(
        'drawn_card_count', coalesce((v_new_state ->> 'drawn_card_count')::integer, 0) + 1,
        'last_card_id', pg_catalog.btrim(p_payload ->> 'card_id')
      );
    elsif p_action = 'take_break' then
      v_new_state := v_new_state || pg_catalog.jsonb_build_object('last_break_at', pg_catalog.clock_timestamp());
    elsif p_action = 'finish_occurrence' and coalesce((v_new_state ->> 'drawn_card_count')::integer, 0) < 1 then
      raise exception 'content_sequence_not_ready';
    end if;
  elsif v_occurrence.program_day = 5 then
    if p_action = 'check_in' then
      v_new_state := v_new_state || pg_catalog.jsonb_build_object('checked_in_at', pg_catalog.clock_timestamp());
    elsif p_action = 'confirm_route' then
      if not (v_new_state ? 'checked_in_at') or not (v_occurrence.location_snapshot @> '{"confirmed":true}'::jsonb) then
        raise exception 'content_sequence_not_ready';
      end if;
      v_new_state := v_new_state || '{"route_confirmed":true}'::jsonb;
    elsif p_action = 'take_break' then
      v_new_state := v_new_state || pg_catalog.jsonb_build_object('last_break_at', pg_catalog.clock_timestamp());
    elsif p_action = 'finish_occurrence' and not coalesce((v_new_state ->> 'route_confirmed')::boolean, false) then
      raise exception 'content_sequence_not_ready';
    end if;
  end if;

  insert into public.quantum_continuation_content_commands (
    occurrence_id, actor_user_id, action, payload, prior_revision,
    resulting_revision, idempotency_key
  ) values (
    p_occurrence_id, v_actor, pg_catalog.btrim(p_action), p_payload,
    p_expected_content_revision, p_expected_content_revision + 1, p_idempotency_key
  );
  update public.quantum_continuation_occurrences
  set content_state = v_new_state || pg_catalog.jsonb_build_object(
        'last_action', p_action,
        'last_payload', p_payload,
        'last_actor_alias', (
          select member.alias from public.quantum_continuation_occurrence_members as member
          where member.occurrence_id = p_occurrence_id and member.participant_user_id = v_actor
        ),
        'completed', p_action = 'finish_occurrence'
      ),
      content_revision = content_revision + 1,
      status = case when p_action = 'finish_occurrence' then 'completed' else 'in_progress' end,
      revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_occurrence_id and content_revision = p_expected_content_revision;
  if not found then raise exception 'stale_content_revision'; end if;
  if p_action = 'finish_occurrence' then
    update public.quantum_continuation_transitions
    set status = 'closed', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_occurrence.transition_id;
    if v_occurrence.program_day = 5 then
      update public.quantum_continuation_series
      set status = 'completed', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
      where id = v_occurrence.series_id;
    end if;
  end if;
  return public.get_my_continuation_occurrence_content(p_occurrence_id);
end
$$;

revoke all on function public.apply_my_continuation_content_action(uuid, text, jsonb, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_my_continuation_content_action(uuid, text, jsonb, integer, uuid)
  to authenticated;

create or replace function public.get_my_continuation_chat(p_occurrence_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_phase text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id;
  if v_occurrence.id is null or not exists (
    select 1 from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
      and member.attendance_status <> 'cancelled'
  ) then raise exception 'continuation_occurrence_not_found'; end if;
  v_phase := quantum_private.continuation_chat_phase(
    v_occurrence.starts_at, v_occurrence.ends_at, v_occurrence.chat_opens_at,
    v_occurrence.chat_send_closes_at, pg_catalog.clock_timestamp()
  );
  return pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.clock_timestamp(),
    'occurrence_id', p_occurrence_id,
    'phase', v_phase,
    'messages', case when v_phase in ('send', 'read_only') then (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', message.id,
        'sender_alias', member.alias,
        'message', message.message,
        'created_at', message.created_at
      ) order by message.created_at, message.id), '[]'::jsonb)
      from public.quantum_continuation_chat_messages as message
      join public.quantum_continuation_occurrence_members as member
        on member.occurrence_id = message.occurrence_id
       and member.participant_user_id = message.sender_user_id
      where message.occurrence_id = p_occurrence_id
    ) else '[]'::jsonb end
  );
end
$$;

revoke all on function public.get_my_continuation_chat(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_continuation_chat(uuid)
  to authenticated;

create or replace function public.send_my_continuation_chat_message(
  p_occurrence_id uuid,
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
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_phase text;
  v_alias text;
  v_message public.quantum_continuation_chat_messages%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_occurrence_id is null or p_idempotency_key is null or p_message is null
     or pg_catalog.char_length(pg_catalog.btrim(p_message)) not between 1 and 1000 then
    raise exception 'invalid_chat_message';
  end if;
  if p_message ~* '(https?://|www[.]|[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|instagram|insta[[:space:]_-]*gram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)'
     or pg_catalog.regexp_replace(p_message, '[^0-9]', '', 'g') ~ '01[016789][0-9]{7,8}' then
    raise exception 'contact_sharing_not_allowed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'continuation-chat:' || v_actor::text || ':' || p_idempotency_key::text, 0
  ));
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id;
  select member.alias into v_alias
  from public.quantum_continuation_occurrence_members as member
  where member.occurrence_id = p_occurrence_id
    and member.participant_user_id = v_actor
    and member.attendance_status <> 'cancelled';
  if v_occurrence.id is null or v_alias is null then raise exception 'continuation_occurrence_not_found'; end if;
  v_phase := quantum_private.continuation_chat_phase(
    v_occurrence.starts_at, v_occurrence.ends_at, v_occurrence.chat_opens_at,
    v_occurrence.chat_send_closes_at, pg_catalog.clock_timestamp()
  );
  if v_phase <> 'send' then raise exception 'continuation_chat_not_writable'; end if;
  select message.* into v_message
  from public.quantum_continuation_chat_messages as message
  where message.occurrence_id = p_occurrence_id
    and message.sender_user_id = v_actor
    and message.id = p_idempotency_key;
  if v_message.id is null then
    insert into public.quantum_continuation_chat_messages (
      id, occurrence_id, sender_user_id, message
    ) values (p_idempotency_key, p_occurrence_id, v_actor, pg_catalog.btrim(p_message))
    returning * into v_message;
  elsif v_message.message <> pg_catalog.btrim(p_message) then
    raise exception 'idempotency_key_reused';
  end if;
  return pg_catalog.jsonb_build_object(
    'id', v_message.id,
    'sender_alias', v_alias,
    'message', v_message.message,
    'created_at', v_message.created_at,
    'phase', v_phase
  );
end
$$;

revoke all on function public.send_my_continuation_chat_message(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.send_my_continuation_chat_message(uuid, text, uuid)
  to authenticated;

create or replace function public.get_my_integrated_continuation_series(p_series_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_series public.quantum_continuation_series%rowtype;
  v_source public.quantum_continuation_sources%rowtype;
  v_latest_transition public.quantum_continuation_transitions%rowtype;
  v_latest_occurrence public.quantum_continuation_occurrences%rowtype;
  v_own_choice text;
  v_own_fee_status text;
  v_own_fee_waived boolean := false;
  v_next_action text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select series.* into v_series
  from public.quantum_continuation_series as series
  where (p_series_id is null or series.id = p_series_id)
    and exists (
      select 1 from public.quantum_continuation_source_members as source_member
      where source_member.source_id = series.source_id and source_member.participant_user_id = v_actor
      union all
      select 1
      from public.quantum_continuation_transitions as transition
      join public.quantum_continuation_transition_members as member on member.transition_id = transition.id
      where transition.series_id = series.id and member.participant_user_id = v_actor
    )
  order by series.updated_at desc
  limit 1;
  if v_series.id is null then return null; end if;
  select source.* into v_source
  from public.quantum_continuation_sources as source
  where source.id = v_series.source_id;
  select transition.* into v_latest_transition
  from public.quantum_continuation_transitions as transition
  where transition.series_id = v_series.id
  order by transition.transition_index desc
  limit 1;
  if v_latest_transition.id is not null then
    select member.fee_waived into v_own_fee_waived
    from public.quantum_continuation_transition_members as member
    where member.transition_id = v_latest_transition.id and member.participant_user_id = v_actor;
    select choice.choice into v_own_choice
    from public.quantum_continuation_choices as choice
    where choice.transition_id = v_latest_transition.id and choice.participant_user_id = v_actor;
    select fee.status into v_own_fee_status
    from public.quantum_continuation_fee_orders as fee
    where fee.transition_id = v_latest_transition.id
      and fee.owner_user_id = v_actor and fee.purpose = 'next_occurrence'
    order by fee.created_at desc limit 1;
    select occurrence.* into v_latest_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.transition_id = v_latest_transition.id;
  end if;

  v_next_action := case
    when v_series.status <> 'active' then 'completed'
    when v_latest_transition.id is null then 'open_transition'
    when v_latest_transition.status = 'awaiting_choices' and v_own_choice is null then 'choose'
    when v_latest_transition.status = 'awaiting_choices' then 'wait_private_choices'
    when v_latest_transition.status = 'payment_pending'
      and not coalesce(v_own_fee_waived, false)
      and v_own_fee_status is distinct from 'verified' then 'pay_fee'
    when v_latest_transition.status = 'payment_pending' then 'wait_private_payments'
    when v_latest_transition.status = 'ready_to_schedule' then 'wait_schedule'
    when v_latest_transition.status = 'scheduled' then 'open_occurrence'
    when v_latest_transition.status = 'closed' and v_latest_transition.target_program_day < 5 then 'open_transition'
    else 'completed'
  end;

  return pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.clock_timestamp(),
    'series_id', v_series.id,
    'source_id', v_series.source_id,
    'source', pg_catalog.jsonb_build_object(
      'source_kind', v_source.source_kind,
      'activity_kind', v_source.activity_kind,
      'activity', v_source.activity_snapshot,
      'source_completed_at', v_source.source_completed_at,
      'roster_revision', v_source.roster_revision
    ),
    'start_program_day', v_series.start_program_day,
    'maximum_physical_meeting_no', v_series.maximum_physical_meeting_no,
    'status', v_series.status,
    'revision', v_series.revision,
    'next_action', v_next_action,
    'latest_occurrence_id', v_latest_occurrence.id,
    'transitions', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'transition_id', transition.id,
        'transition_index', transition.transition_index,
        'target_program_day', transition.target_program_day,
        'physical_meeting_no', transition.target_program_day - v_series.start_program_day + 2,
        'state', transition.status,
        'closes_at', transition.closes_at,
        'roster_revision', transition.roster_revision,
        'own_choice', (
          select choice.choice from public.quantum_continuation_choices as choice
          where choice.transition_id = transition.id and choice.participant_user_id = v_actor
        ),
        'own_fee_waived', (
          select member.fee_waived
          from public.quantum_continuation_transition_members as member
          where member.transition_id = transition.id and member.participant_user_id = v_actor
        ),
        'own_fee', (
          select pg_catalog.jsonb_build_object(
            'order_id', fee.id, 'purpose', fee.purpose, 'provider', fee.provider,
            'amount_krw', fee.amount_krw, 'currency', fee.currency,
            'status', fee.status, 'revision', fee.revision
          )
          from public.quantum_continuation_fee_orders as fee
          where fee.transition_id = transition.id
            and fee.owner_user_id = v_actor and fee.purpose = 'next_occurrence'
          order by fee.created_at desc limit 1
        )
      ) order by transition.transition_index), '[]'::jsonb)
      from public.quantum_continuation_transitions as transition
      where transition.series_id = v_series.id
        and exists (
          select 1 from public.quantum_continuation_transition_members as member
          where member.transition_id = transition.id and member.participant_user_id = v_actor
        )
    ),
    'occurrences', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'occurrence_id', occurrence.id,
        'program_day', occurrence.program_day,
        'physical_meeting_no', occurrence.physical_meeting_no,
        'status', occurrence.status,
        'starts_at', occurrence.starts_at,
        'ends_at', occurrence.ends_at,
        'location', occurrence.location_snapshot,
        'content_revision', occurrence.content_revision,
        'chat_phase', quantum_private.continuation_chat_phase(
          occurrence.starts_at, occurrence.ends_at, occurrence.chat_opens_at,
          occurrence.chat_send_closes_at, pg_catalog.clock_timestamp()
        ),
        'members', (
          select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'alias', member.alias,
            'attendance_status', member.attendance_status
          ) order by member.alias), '[]'::jsonb)
          from public.quantum_continuation_occurrence_members as member
          where member.occurrence_id = occurrence.id
        )
      ) order by occurrence.program_day), '[]'::jsonb)
      from public.quantum_continuation_occurrences as occurrence
      where occurrence.series_id = v_series.id
        and exists (
          select 1 from public.quantum_continuation_occurrence_members as member
          where member.occurrence_id = occurrence.id
            and member.participant_user_id = v_actor
            and member.visible_from_program_day <= occurrence.program_day
        )
    )
  );
end
$$;

revoke all on function public.get_my_integrated_continuation_series(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_integrated_continuation_series(uuid)
  to authenticated;

create or replace function public.get_my_continuation_after(p_occurrence_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_occurrence public.quantum_continuation_occurrences%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id;
  if v_occurrence.id is null or v_occurrence.status <> 'completed' or not exists (
    select 1 from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
      and member.attendance_status = 'present'
  ) then raise exception 'continuation_after_not_found'; end if;
  return pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.clock_timestamp(),
    'occurrence_id', p_occurrence_id,
    'series_id', v_occurrence.series_id,
    'transition_id', v_occurrence.transition_id,
    'program_day', v_occurrence.program_day,
    'physical_meeting_no', v_occurrence.physical_meeting_no,
    'final_program_day', v_occurrence.program_day = 5,
    'friend_targets', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'target_user_id', member.participant_user_id,
        'alias', member.alias
      ) order by member.alias), '[]'::jsonb)
      from public.quantum_continuation_occurrence_members as member
      where member.occurrence_id = p_occurrence_id
        and member.participant_user_id <> v_actor
        and member.attendance_status = 'present'
    )
  );
end
$$;

revoke all on function public.get_my_continuation_after(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_continuation_after(uuid)
  to authenticated;

create or replace function public.deliver_continuation_notifications_for_service(
  p_limit integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.quantum_continuation_notification_outbox%rowtype;
  v_delivered integer := 0;
  v_failed integer := 0;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_limit is null or p_limit not between 1 and 500 or p_now is null then
    raise exception 'invalid_notification_batch';
  end if;
  for v_row in
    select outbox.*
    from public.quantum_continuation_notification_outbox as outbox
    where outbox.status in ('pending', 'failed')
      and outbox.next_attempt_at <= p_now
      and outbox.attempt_count < 20
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit p_limit
  loop
    begin
      insert into public.notifications (user_id, kind, payload)
      values (
        v_row.recipient_user_id,
        'meeting_reminder',
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'continuation_kind', v_row.kind,
          'deep_link', v_row.deep_link,
          'transition_id', v_row.transition_id,
          'occurrence_id', v_row.occurrence_id
        ))
      );
      update public.quantum_continuation_notification_outbox
      set status = 'sent', claim_token = null, lease_expires_at = null,
          last_error_code = null, revision = revision + 1,
          updated_at = pg_catalog.clock_timestamp()
      where id = v_row.id;
      v_delivered := v_delivered + 1;
    exception when others then
      update public.quantum_continuation_notification_outbox
      set status = 'failed', claim_token = null, lease_expires_at = null,
          attempt_count = attempt_count + 1,
          next_attempt_at = p_now + interval '5 minutes',
          last_error_code = 'in_app_delivery_failed',
          revision = revision + 1,
          updated_at = pg_catalog.clock_timestamp()
      where id = v_row.id;
      v_failed := v_failed + 1;
    end;
  end loop;
  return pg_catalog.jsonb_build_object('delivered_count', v_delivered, 'failed_count', v_failed);
end
$$;

revoke all on function public.deliver_continuation_notifications_for_service(integer, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.deliver_continuation_notifications_for_service(integer, timestamptz)
  to service_role;

create or replace function public.deliver_continuation_friend_entitlements_for_service(p_limit integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entitlement public.quantum_continuation_friend_entitlements%rowtype;
  v_request_id uuid;
  v_delivered integer := 0;
  v_cancelled integer := 0;
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then raise exception 'invalid_entitlement_batch'; end if;
  for v_entitlement in
    select entitlement.*
    from public.quantum_continuation_friend_entitlements as entitlement
    join public.quantum_continuation_fee_orders as fee on fee.id = entitlement.fee_order_id
    where entitlement.status = 'ready'
      and fee.purpose = 'friend_request'
      and fee.status = 'verified'
      and fee.provider_verified
    order by entitlement.created_at
    for update of entitlement skip locked
    limit p_limit
  loop
    v_request_id := null;
    if not exists (
      select 1
      from public.quantum_continuation_occurrences as occurrence
      join public.quantum_continuation_occurrence_members as requester
        on requester.occurrence_id = occurrence.id
       and requester.participant_user_id = v_entitlement.requester_user_id
      join public.quantum_continuation_occurrence_members as target
        on target.occurrence_id = occurrence.id
       and target.participant_user_id = v_entitlement.target_user_id
      join public.quantum_continuation_transitions as transition on transition.id = v_entitlement.transition_id
      where occurrence.series_id = transition.series_id
        and occurrence.status = 'completed'
        and requester.attendance_status = 'present'
        and target.attendance_status = 'present'
    ) or exists (
      select 1 from public.friendships as friendship
      where friendship.status = 'active'
        and friendship.user_id = least(v_entitlement.requester_user_id, v_entitlement.target_user_id)
        and friendship.friend_user_id = greatest(v_entitlement.requester_user_id, v_entitlement.target_user_id)
    ) then
      update public.quantum_continuation_friend_entitlements
      set status = 'cancelled', revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
      where id = v_entitlement.id;
      update public.quantum_continuation_fee_orders as fee
      set status = 'recovery_required', revision = fee.revision + 1,
          updated_at = pg_catalog.clock_timestamp()
      where fee.id = v_entitlement.fee_order_id
        and fee.status = 'verified'
        and fee.provider_verified;
      v_cancelled := v_cancelled + 1;
      continue;
    end if;
    select request.id into v_request_id
    from public.friend_requests as request
    where request.sender_user_id = v_entitlement.requester_user_id
      and request.receiver_user_id = v_entitlement.target_user_id
      and request.status = 'pending'
    order by request.created_at desc
    limit 1;
    if v_request_id is null then
      insert into public.friend_requests (
        sender_user_id, receiver_user_id, receiver_phone, token,
        status, message, expires_at
      ) values (
        v_entitlement.requester_user_id, v_entitlement.target_user_id, null,
        pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
        'pending', null, pg_catalog.clock_timestamp() + interval '14 days'
      ) returning id into v_request_id;
      insert into public.notifications (user_id, kind, payload)
      values (
        v_entitlement.target_user_id, 'friend_request_received',
        pg_catalog.jsonb_build_object('request_id', v_request_id, 'source', 'continuation_entitlement')
      );
    end if;
    update public.quantum_continuation_friend_entitlements
    set status = 'delivered', friend_request_id = v_request_id,
        revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_entitlement.id;
    v_delivered := v_delivered + 1;
  end loop;
  return pg_catalog.jsonb_build_object('delivered_count', v_delivered, 'cancelled_count', v_cancelled);
end
$$;

revoke all on function public.deliver_continuation_friend_entitlements_for_service(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.deliver_continuation_friend_entitlements_for_service(integer)
  to service_role;

revoke all on function public.get_my_weekly_activity_discovery(date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_weekly_activity_discovery(date)
  to authenticated;
revoke all on function public.apply_to_my_weekly_activity(text, date, uuid[], uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_to_my_weekly_activity(text, date, uuid[], uuid)
  to authenticated;
revoke all on function public.cancel_my_weekly_activity_application(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_my_weekly_activity_application(uuid, integer, uuid)
  to authenticated;
revoke all on function public.assign_weekly_application_for_service(uuid, uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_weekly_application_for_service(uuid, uuid, uuid, integer, uuid)
  to service_role;
