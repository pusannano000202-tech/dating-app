-- Harden guided-event capacity and chat timing after the initial lifecycle rollout.
-- All participant mutations remain RPC-only so occurrence locks can serialize
-- the last available seats and terminal states keep their audit history.

revoke select, insert, update, delete
  on table public.match_chat_messages
  from authenticated;

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
  v_incoming_gender text;
  v_incoming_count integer := 1;
  v_gender_mismatch_count integer;
  v_occurrence_id uuid;
  v_occurrence public.quantum_event_occurrences%rowtype;
  v_existing public.quantum_event_participations%rowtype;
  v_current_total integer := 0;
  v_current_male integer := 0;
  v_current_female integer := 0;
  v_party_member_conflicts integer := 0;
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

  select qep.*
    into v_existing
  from public.quantum_event_participations qep
  where qep.user_id = v_user_id
  for update;

  if found and v_existing.status in ('confirmed', 'completed') then
    raise exception 'event_state_locked' using errcode = 'P0001';
  end if;

  if p_party_type = 'friends' then
    if p_group_id is null then
      raise exception 'friend_group_required' using errcode = '22023';
    end if;

    select g.leader_user_id, g.status, g.gender
      into v_group_leader_id, v_group_status, v_incoming_gender
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
      into v_incoming_count
    from public.group_members gm
    where gm.group_id = p_group_id and gm.left_at is null;

    if v_incoming_count < 2 or v_incoming_count > 3 then
      raise exception 'friend_group_member_count' using errcode = 'P0001';
    end if;
    if v_incoming_gender is null or v_incoming_gender not in ('male', 'female') then
      raise exception 'friend_group_gender_mismatch' using errcode = 'P0001';
    end if;

    select pg_catalog.count(*)::integer
      into v_gender_mismatch_count
    from public.group_members gm
    left join public.profiles p on p.user_id = gm.user_id
    where gm.group_id = p_group_id
      and gm.left_at is null
      and p.gender is distinct from v_incoming_gender;

    if v_gender_mismatch_count > 0 then
      raise exception 'friend_group_gender_mismatch' using errcode = 'P0001';
    end if;

    select pg_catalog.count(*)::integer
      into v_party_member_conflicts
    from public.group_members gm
    join public.quantum_event_participations qep on qep.user_id = gm.user_id
    where gm.group_id = p_group_id
      and gm.left_at is null
      and gm.user_id <> v_user_id
      and qep.status in ('recruiting', 'confirmed');

    if v_party_member_conflicts > 0 then
      raise exception 'party_member_already_applied' using errcode = 'P0001';
    end if;
  else
    select p.gender
      into v_incoming_gender
    from public.profiles p
    where p.user_id = v_user_id;

    if v_incoming_gender is null or v_incoming_gender not in ('male', 'female') then
      raise exception 'profile_gender_required' using errcode = 'P0001';
    end if;
  end if;

  v_occurrence_id := public.get_or_create_quantum_event_occurrence(
    p_event_id,
    p_event_mode,
    pg_catalog.now()
  );

  select qeo.*
    into v_occurrence
  from public.quantum_event_occurrences qeo
  where qeo.id = v_occurrence_id
  for update;

  if v_occurrence.status <> 'recruiting' then
    raise exception 'event_not_recruiting' using errcode = 'P0001';
  end if;
  if pg_catalog.now() >= v_occurrence.application_closes_at then
    raise exception 'application_closed' using errcode = 'P0001';
  end if;

  if v_existing.user_id is not null
     and v_existing.status = 'recruiting'
     and v_existing.occurrence_id = v_occurrence_id
     and v_existing.party_type = p_party_type
     and v_existing.group_id is not distinct from p_group_id then
    return public.get_my_quantum_event_lifecycle();
  end if;

  with target_people as (
    select qep.user_id, p.gender
    from public.quantum_event_participations qep
    left join public.profiles p on p.user_id = qep.user_id
    where qep.occurrence_id = v_occurrence_id
      and qep.status in ('recruiting', 'confirmed')
      and qep.party_type = 'solo'
      and qep.user_id <> v_user_id
    union
    select gm.user_id, p.gender
    from public.quantum_event_participations qep
    join public.group_members gm on gm.group_id = qep.group_id and gm.left_at is null
    left join public.profiles p on p.user_id = gm.user_id
    where qep.occurrence_id = v_occurrence_id
      and qep.status in ('recruiting', 'confirmed')
      and qep.party_type = 'friends'
      and qep.user_id <> v_user_id
  )
  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where gender = 'male')::integer,
    pg_catalog.count(*) filter (where gender = 'female')::integer
  into v_current_total, v_current_male, v_current_female
  from target_people;

  if v_current_total + v_incoming_count > v_occurrence.required_total then
    raise exception 'event_full' using errcode = 'P0001';
  end if;
  if v_incoming_gender = 'male'
     and v_current_male + v_incoming_count > v_occurrence.male_capacity then
    raise exception 'gender_capacity_full' using errcode = 'P0001';
  end if;
  if v_incoming_gender = 'female'
     and v_current_female + v_incoming_count > v_occurrence.female_capacity then
    raise exception 'gender_capacity_full' using errcode = 'P0001';
  end if;

  insert into public.quantum_event_participations (
    user_id, event_id, event_mode, party_type, group_id, occurrence_id,
    status, match_id, cancel_reason, completed_at
  ) values (
    v_user_id, p_event_id, p_event_mode, p_party_type, p_group_id,
    v_occurrence_id, 'recruiting', null, null, null
  )
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
      updated_at = pg_catalog.now()
  where public.quantum_event_participations.status in ('recruiting', 'cancelled');

  if not found then
    raise exception 'event_state_locked' using errcode = 'P0001';
  end if;

  return public.get_my_quantum_event_lifecycle();
end;
$$;

create or replace function public.cancel_my_quantum_event_participation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select qep.status
    into v_status
  from public.quantum_event_participations qep
  where qep.user_id = v_user_id
  for update;

  if not found or v_status = 'cancelled' then
    return false;
  end if;
  if v_status in ('confirmed', 'completed') then
    raise exception 'event_state_locked' using errcode = 'P0001';
  end if;

  update public.quantum_event_participations
  set status = 'cancelled',
      cancel_reason = 'user_cancelled',
      updated_at = pg_catalog.now()
  where user_id = v_user_id and status = 'recruiting';

  return found;
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
    select
      qep.*,
      coalesce(active_meeting.scheduled_start, qeo.starts_at) as starts_at,
      coalesce(active_meeting.scheduled_end, qeo.ends_at) as ends_at,
      coalesce(active_meeting.venue_name, qeo.location_name) as location_name,
      qeo.required_total
    from public.quantum_event_participations qep
    join public.quantum_event_occurrences qeo on qeo.id = qep.occurrence_id
    left join lateral (
      select mm.scheduled_start, mm.scheduled_end, v.name as venue_name
      from public.match_meetings mm
      left join public.venues v on v.id = mm.venue_id
      where mm.match_id = qep.match_id and mm.status = 'scheduled'
      order by mm.scheduled_start asc, mm.id asc
      limit 1
    ) active_meeting on true
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
    select mine.user_id from mine where mine.party_type = 'solo'
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
    and meeting.status = 'scheduled'
  order by meeting.scheduled_start asc, meeting.id asc
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

drop policy if exists match_chat_messages_select_participants
  on public.match_chat_messages;
create policy match_chat_messages_select_participants
  on public.match_chat_messages
  for select
  to authenticated
  using (
    public.can_access_match_chat(match_id, auth.uid())
    and coalesce((public.get_my_match_chat_window(match_id) ->> 'is_open')::boolean, false)
  );

drop policy if exists match_chat_messages_insert_participants
  on public.match_chat_messages;
create policy match_chat_messages_insert_participants
  on public.match_chat_messages
  for insert
  to authenticated
  with check (
    sender_user_id = auth.uid()
    and public.can_access_match_chat(match_id, auth.uid())
    and coalesce((public.get_my_match_chat_window(match_id) ->> 'is_open')::boolean, false)
  );

revoke all on function public.set_my_quantum_event_participation(text, text, text, uuid)
  from public, anon;
grant execute on function public.set_my_quantum_event_participation(text, text, text, uuid)
  to authenticated;
revoke all on function public.cancel_my_quantum_event_participation()
  from public, anon;
grant execute on function public.cancel_my_quantum_event_participation()
  to authenticated;
revoke all on function public.get_my_quantum_event_lifecycle()
  from public, anon;
grant execute on function public.get_my_quantum_event_lifecycle()
  to authenticated;
revoke all on function public.get_my_match_chat_window(uuid)
  from public, anon;
grant execute on function public.get_my_match_chat_window(uuid)
  to authenticated;

comment on function public.set_my_quantum_event_participation(text, text, text, uuid) is
  'Serializes occurrence applications and enforces deadline, capacity, gender, party, and terminal-state rules.';
comment on function public.cancel_my_quantum_event_participation() is
  'Cancels only a recruiting application while preserving the audit row.';
