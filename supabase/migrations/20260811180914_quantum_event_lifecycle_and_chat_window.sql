-- Server-owned lifecycle for guided Quantum events and exact chat opening.
-- Existing participation rows remain readable through the legacy RPC until a
-- user applies again and receives an occurrence_id.

create table if not exists public.quantum_event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_mode text not null check (event_mode in ('tonight', 'scheduled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  application_closes_at timestamptz not null,
  location_name text not null,
  male_capacity integer not null check (male_capacity between 2 and 3),
  female_capacity integer not null check (female_capacity between 2 and 3),
  required_total integer not null default 5 check (required_total = 5),
  status text not null default 'recruiting'
    check (status in ('recruiting', 'assignment', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, starts_at),
  check (ends_at > starts_at),
  check (application_closes_at <= starts_at),
  check (male_capacity + female_capacity = required_total)
);

create index if not exists quantum_event_occurrences_status_start_idx
  on public.quantum_event_occurrences (status, starts_at);

alter table public.quantum_event_occurrences enable row level security;
revoke all on table public.quantum_event_occurrences from public, anon, authenticated;
grant select, insert, update, delete on table public.quantum_event_occurrences to service_role;

alter table public.quantum_event_participations
  add column if not exists occurrence_id uuid
    references public.quantum_event_occurrences(id) on delete set null,
  add column if not exists status text not null default 'recruiting',
  add column if not exists match_id uuid references public.matches(id) on delete set null,
  add column if not exists cancel_reason text,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'quantum_event_participations_status_check'
      and conrelid = 'public.quantum_event_participations'::regclass
  ) then
    alter table public.quantum_event_participations
      add constraint quantum_event_participations_status_check
      check (status in ('recruiting', 'confirmed', 'cancelled', 'completed'));
  end if;
end
$$;

create index if not exists quantum_event_participations_occurrence_status_idx
  on public.quantum_event_participations (occurrence_id, status);

create or replace function public.get_or_create_quantum_event_occurrence(
  p_event_id text,
  p_event_mode text,
  p_now timestamptz default now()
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_local_now timestamp := pg_catalog.timezone('Asia/Seoul', p_now);
  v_local_start timestamp;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration interval;
  v_location text;
  v_male integer;
  v_female integer;
  v_target_dow integer;
  v_days_ahead integer;
  v_occurrence_id uuid;
begin
  if p_event_mode = 'tonight' then
    case p_event_id
      when 'tonight-onsenjjang-run' then
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + time '19:30';
        v_duration := interval '90 minutes';
        v_location := '온천장역 1번 출구';
        v_male := 3;
        v_female := 2;
      when 'tonight-board-game' then
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + time '20:00';
        v_duration := interval '120 minutes';
        v_location := '부산대 앞 보드게임 카페';
        v_male := 2;
        v_female := 3;
      when 'tonight-casual-drinks' then
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + time '20:30';
        v_duration := interval '120 minutes';
        v_location := '부산대 장전동';
        v_male := 3;
        v_female := 2;
      when 'tonight-late-dinner' then
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + time '21:00';
        v_duration := interval '90 minutes';
        v_location := '온천장 금강공원 입구';
        v_male := 2;
        v_female := 3;
      else
        raise exception 'invalid_event' using errcode = '22023';
    end case;

    v_starts_at := pg_catalog.timezone('Asia/Seoul', v_local_start);
    if v_starts_at < p_now + interval '2 hours' then
      v_local_start := v_local_start + interval '1 day';
      v_starts_at := pg_catalog.timezone('Asia/Seoul', v_local_start);
    end if;
  elsif p_event_mode = 'scheduled' then
    case p_event_id
      when 'scheduled-board-game' then
        v_target_dow := 2;
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + time '19:30';
        v_duration := interval '150 minutes';
        v_location := '부산대 앞 보드게임 카페';
        v_male := 3;
        v_female := 2;
      when 'scheduled-jogging' then
        v_target_dow := 3;
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + time '20:00';
        v_duration := interval '120 minutes';
        v_location := '온천천 산책로';
        v_male := 2;
        v_female := 3;
      when 'scheduled-dinner' then
        v_target_dow := 4;
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + time '19:00';
        v_duration := interval '120 minutes';
        v_location := '온천장 금강공원 입구';
        v_male := 2;
        v_female := 3;
      when 'scheduled-walk' then
        v_target_dow := 6;
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + time '16:00';
        v_duration := interval '120 minutes';
        v_location := '온천장 금강공원 산책로';
        v_male := 3;
        v_female := 2;
      else
        raise exception 'invalid_event' using errcode = '22023';
    end case;

    v_days_ahead := (
      v_target_dow
      - pg_catalog.date_part('dow', v_local_now)::integer
      + 7
    ) % 7;
    if v_days_ahead = 0 then
      v_days_ahead := 7;
    end if;
    v_local_start := v_local_start + pg_catalog.make_interval(days => v_days_ahead);
    v_starts_at := pg_catalog.timezone('Asia/Seoul', v_local_start);
  else
    raise exception 'invalid_event_mode' using errcode = '22023';
  end if;

  v_ends_at := v_starts_at + v_duration;

  insert into public.quantum_event_occurrences (
    event_id,
    event_mode,
    starts_at,
    ends_at,
    application_closes_at,
    location_name,
    male_capacity,
    female_capacity
  ) values (
    p_event_id,
    p_event_mode,
    v_starts_at,
    v_ends_at,
    v_starts_at - interval '2 hours',
    v_location,
    v_male,
    v_female
  )
  on conflict (event_id, starts_at) do update
  set updated_at = public.quantum_event_occurrences.updated_at
  returning id into v_occurrence_id;

  return v_occurrence_id;
end;
$$;

revoke all on function public.get_or_create_quantum_event_occurrence(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_or_create_quantum_event_occurrence(text, text, timestamptz)
  to service_role;

create or replace function public.set_my_quantum_event_participation(
  p_event_id text,
  p_event_mode text,
  p_party_type text,
  p_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_leader_id uuid;
  v_group_status text;
  v_group_gender text;
  v_member_count integer;
  v_gender_mismatch_count integer;
  v_occurrence_id uuid;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_party_type not in ('solo', 'friends') then
    raise exception 'invalid_party_type' using errcode = '22023';
  end if;
  if not (
    (p_event_mode = 'tonight' and p_event_id in (
      'tonight-onsenjjang-run', 'tonight-board-game',
      'tonight-casual-drinks', 'tonight-late-dinner'
    ))
    or
    (p_event_mode = 'scheduled' and p_event_id in (
      'scheduled-board-game', 'scheduled-jogging',
      'scheduled-dinner', 'scheduled-walk'
    ))
  ) then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  if p_party_type = 'solo' and p_group_id is not null then
    raise exception 'invalid_group_id' using errcode = '22023';
  end if;

  if p_party_type = 'friends' then
    if p_group_id is null then
      raise exception 'friend_group_required' using errcode = '22023';
    end if;

    select g.leader_user_id, g.status, g.gender
      into v_group_leader_id, v_group_status, v_group_gender
    from public.groups g
    join public.group_members mine
      on mine.group_id = g.id
     and mine.user_id = v_user_id
     and mine.left_at is null
    where g.id = p_group_id;

    if not found then
      raise exception 'friend_group_required' using errcode = 'P0001';
    end if;
    if v_group_leader_id <> v_user_id then
      raise exception 'friend_group_leader_required' using errcode = 'P0001';
    end if;
    if v_group_status not in ('forming', 'ready') then
      raise exception 'friend_group_not_ready' using errcode = 'P0001';
    end if;

    select pg_catalog.count(*)::integer
      into v_member_count
    from public.group_members gm
    where gm.group_id = p_group_id and gm.left_at is null;

    if v_member_count < 2 or v_member_count > 3 then
      raise exception 'friend_group_member_count' using errcode = 'P0001';
    end if;
    if v_group_gender is null or v_group_gender not in ('male', 'female') then
      raise exception 'friend_group_gender_mismatch' using errcode = 'P0001';
    end if;

    select pg_catalog.count(*)::integer
      into v_gender_mismatch_count
    from public.group_members gm
    left join public.profiles p on p.user_id = gm.user_id
    where gm.group_id = p_group_id
      and gm.left_at is null
      and p.gender is distinct from v_group_gender;

    if v_gender_mismatch_count > 0 then
      raise exception 'friend_group_gender_mismatch' using errcode = 'P0001';
    end if;
  end if;

  v_occurrence_id := public.get_or_create_quantum_event_occurrence(
    p_event_id,
    p_event_mode,
    pg_catalog.now()
  );

  insert into public.quantum_event_participations (
    user_id,
    event_id,
    event_mode,
    party_type,
    group_id,
    occurrence_id,
    status,
    match_id,
    cancel_reason,
    completed_at
  ) values (
    v_user_id,
    p_event_id,
    p_event_mode,
    p_party_type,
    p_group_id,
    v_occurrence_id,
    'recruiting',
    null,
    null,
    null
  )
  on conflict (user_id) do update
  set event_id = excluded.event_id,
      event_mode = excluded.event_mode,
      party_type = excluded.party_type,
      group_id = excluded.group_id,
      occurrence_id = excluded.occurrence_id,
      status = excluded.status,
      match_id = excluded.match_id,
      cancel_reason = excluded.cancel_reason,
      completed_at = excluded.completed_at,
      updated_at = pg_catalog.now();

  return public.get_my_quantum_event_lifecycle();
end;
$$;

create or replace function public.get_my_quantum_event_lifecycle()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  with mine as (
    select qep.*, qeo.starts_at, qeo.ends_at, qeo.location_name, qeo.required_total
    from public.quantum_event_participations qep
    join public.quantum_event_occurrences qeo on qeo.id = qep.occurrence_id
    where qep.user_id = v_user_id
  ), occurrence_people as (
    select distinct people.user_id, p.gender
    from (
      select qep.user_id
      from public.quantum_event_participations qep
      join mine on mine.occurrence_id = qep.occurrence_id
      where qep.status in ('recruiting', 'confirmed') and qep.party_type = 'solo'
      union all
      select gm.user_id
      from public.quantum_event_participations qep
      join mine on mine.occurrence_id = qep.occurrence_id
      join public.group_members gm on gm.group_id = qep.group_id and gm.left_at is null
      where qep.status in ('recruiting', 'confirmed') and qep.party_type = 'friends'
    ) people
    left join public.profiles p on p.user_id = people.user_id
  ), my_party as (
    select mine.user_id
    from mine
    where mine.party_type = 'solo'
    union all
    select gm.user_id
    from mine
    join public.group_members gm on gm.group_id = mine.group_id and gm.left_at is null
    where mine.party_type = 'friends'
  )
  select pg_catalog.jsonb_build_object(
    'occurrence_id', mine.occurrence_id,
    'event_id', mine.event_id,
    'event_mode', mine.event_mode,
    'party_type', mine.party_type,
    'group_id', mine.group_id,
    'status', mine.status,
    'starts_at', mine.starts_at,
    'ends_at', mine.ends_at,
    'chat_opens_at', mine.starts_at - interval '20 minutes',
    'server_now', pg_catalog.now(),
    'match_id', mine.match_id,
    'location_name', mine.location_name,
    'cancel_reason', mine.cancel_reason,
    'participant_counts', pg_catalog.jsonb_build_object(
      'total', (select pg_catalog.count(*) from occurrence_people),
      'male', (select pg_catalog.count(*) from occurrence_people where gender = 'male'),
      'female', (select pg_catalog.count(*) from occurrence_people where gender = 'female'),
      'required_total', mine.required_total
    ),
    'party_members', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', my_party.user_id,
        'display_name', coalesce(p.display_name, case when my_party.user_id = v_user_id then '나' else '친구' end),
        'avatar_url', null
      ) order by my_party.user_id)
      from my_party
      left join public.profiles p on p.user_id = my_party.user_id
    ), '[]'::jsonb),
    'review_required', mine.status = 'completed',
    'updated_at', mine.updated_at
  )
  into v_result
  from mine;

  return v_result;
end;
$$;

revoke all on function public.get_my_quantum_event_lifecycle() from public, anon;
grant execute on function public.get_my_quantum_event_lifecycle() to authenticated;
revoke all on function public.set_my_quantum_event_participation(text, text, text, uuid)
  from public, anon;
grant execute on function public.set_my_quantum_event_participation(text, text, text, uuid)
  to authenticated;

create or replace function public.get_my_match_chat_window(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_scheduled_start timestamptz;
  v_opens_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_access_match_chat(p_match_id, v_user_id) then
    raise exception 'access_denied';
  end if;

  select meeting.scheduled_start
    into v_scheduled_start
  from public.match_meetings meeting
  where meeting.match_id = p_match_id
  order by meeting.scheduled_start desc
  limit 1;

  if v_scheduled_start is null then
    raise exception 'chat_schedule_unavailable';
  end if;
  v_opens_at := v_scheduled_start - interval '20 minutes';

  return pg_catalog.jsonb_build_object(
    'opens_at', v_opens_at,
    'scheduled_start', v_scheduled_start,
    'server_now', pg_catalog.now(),
    'is_open', pg_catalog.now() >= v_opens_at
  );
end;
$$;

revoke all on function public.get_my_match_chat_window(uuid) from public, anon;
grant execute on function public.get_my_match_chat_window(uuid) to authenticated;

create or replace function public.get_match_chat_messages(
  p_match_id uuid,
  p_limit integer default 60,
  p_before timestamptz default null
)
returns table (
  id uuid,
  sender_user_id uuid,
  alias text,
  message text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_window jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  v_window := public.get_my_match_chat_window(p_match_id);
  if not coalesce((v_window ->> 'is_open')::boolean, false) then
    raise exception 'chat_not_open';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    p_limit := 60;
  end if;

  return query
  select chat.id, chat.sender_user_id, chat.sender_alias, chat.message, chat.created_at
  from public.match_chat_messages chat
  where chat.match_id = p_match_id
    and (p_before is null or chat.created_at < p_before)
  order by chat.created_at desc
  limit p_limit;
end;
$$;

revoke all on function public.get_match_chat_messages(uuid, integer, timestamptz)
  from public, anon;
grant execute on function public.get_match_chat_messages(uuid, integer, timestamptz)
  to authenticated;

create or replace function public.send_match_chat_message(
  p_match_id uuid,
  p_message_text text
)
returns table (
  id uuid,
  sender_user_id uuid,
  alias text,
  message text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sender uuid := auth.uid();
  v_alias text;
  v_window jsonb;
  v_inserted public.match_chat_messages%rowtype;
begin
  if v_sender is null then
    raise exception 'not_authenticated';
  end if;
  if p_message_text is null
     or pg_catalog.char_length(pg_catalog.btrim(p_message_text)) < 1
     or pg_catalog.char_length(pg_catalog.btrim(p_message_text)) > 1000 then
    raise exception 'invalid_message';
  end if;

  v_window := public.get_my_match_chat_window(p_match_id);
  if not coalesce((v_window ->> 'is_open')::boolean, false) then
    raise exception 'chat_not_open';
  end if;

  v_alias := '익명';
  if pg_catalog.to_regclass('public.match_member_aliases') is not null then
    select member_alias.alias
      into v_alias
    from public.match_member_aliases member_alias
    where member_alias.match_id = p_match_id
      and member_alias.target_user_id = v_sender
    limit 1;
  end if;

  insert into public.match_chat_messages (
    match_id,
    sender_user_id,
    message,
    sender_alias
  ) values (
    p_match_id,
    v_sender,
    pg_catalog.btrim(p_message_text),
    coalesce(v_alias, '익명')
  )
  returning * into v_inserted;

  return query
  select
    v_inserted.id,
    v_inserted.sender_user_id,
    v_inserted.sender_alias,
    v_inserted.message,
    v_inserted.created_at;
end;
$$;

revoke all on function public.send_match_chat_message(uuid, text)
  from public, anon;
grant execute on function public.send_match_chat_message(uuid, text)
  to authenticated;

comment on table public.quantum_event_occurrences is
  'Server-owned event rounds. Static catalog ids are never used as a dated occurrence id.';
comment on function public.get_my_quantum_event_lifecycle() is
  'Returns only the caller lifecycle, aggregate counts, safe party names, and server timestamps.';
comment on function public.get_my_match_chat_window(uuid) is
  'Returns the authenticated participant chat window; chat opens exactly 20 minutes before schedule.';
