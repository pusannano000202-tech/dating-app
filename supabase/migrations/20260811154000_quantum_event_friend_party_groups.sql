-- Bind friend event applications to an accepted same-gender Quantum group.
-- Existing friend rows remain readable for migration safety, but the client treats
-- rows without group_id as incomplete and requires a fresh accepted team.

alter table public.quantum_event_participations
  add column if not exists group_id uuid references public.groups(id) on delete set null;

create index if not exists quantum_event_participations_group_idx
  on public.quantum_event_participations (group_id)
  where group_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'quantum_event_participations_party_group_check'
      and conrelid = 'public.quantum_event_participations'::regclass
  ) then
    alter table public.quantum_event_participations
      add constraint quantum_event_participations_party_group_check
      check (
        (party_type = 'solo' and group_id is null)
        or (party_type = 'friends' and group_id is not null)
      ) not valid;
  end if;
end;
$$;

create or replace function public.get_my_quantum_event_participation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_participation jsonb;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'event_id', qep.event_id,
    'event_mode', qep.event_mode,
    'party_type', qep.party_type,
    'group_id', qep.group_id,
    'updated_at', qep.updated_at
  )
  into v_participation
  from public.quantum_event_participations qep
  where qep.user_id = v_user_id;

  return v_participation;
end;
$$;

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
  v_participation jsonb;
  v_group_leader_id uuid;
  v_group_status text;
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_party_type not in ('solo', 'friends') then
    raise exception 'invalid_party_type' using errcode = '22023';
  end if;

  if not (
    (
      p_event_mode = 'tonight'
      and p_event_id in (
        'tonight-onsenjjang-run',
        'tonight-board-game',
        'tonight-casual-drinks',
        'tonight-late-dinner'
      )
    )
    or (
      p_event_mode = 'scheduled'
      and p_event_id in (
        'scheduled-board-game',
        'scheduled-jogging',
        'scheduled-dinner',
        'scheduled-walk'
      )
    )
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

    select g.leader_user_id, g.status
      into v_group_leader_id, v_group_status
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

    select count(*)::integer
      into v_member_count
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.left_at is null;

    if v_member_count < 2 or v_member_count > 3 then
      raise exception 'friend_group_member_count' using errcode = 'P0001';
    end if;
  end if;

  insert into public.quantum_event_participations (
    user_id,
    event_id,
    event_mode,
    party_type,
    group_id
  )
  values (
    v_user_id,
    p_event_id,
    p_event_mode,
    p_party_type,
    p_group_id
  )
  on conflict (user_id) do update
  set event_id = excluded.event_id,
      event_mode = excluded.event_mode,
      party_type = excluded.party_type,
      group_id = excluded.group_id,
      updated_at = pg_catalog.now();

  select jsonb_build_object(
    'event_id', qep.event_id,
    'event_mode', qep.event_mode,
    'party_type', qep.party_type,
    'group_id', qep.group_id,
    'updated_at', qep.updated_at
  )
  into v_participation
  from public.quantum_event_participations qep
  where qep.user_id = v_user_id;

  return v_participation;
end;
$$;

revoke execute on function public.set_my_quantum_event_participation(text, text, text) from public, anon, authenticated;
revoke execute on function public.set_my_quantum_event_participation(text, text, text, uuid) from public, anon;
grant execute on function public.set_my_quantum_event_participation(text, text, text, uuid) to authenticated;

comment on column public.quantum_event_participations.group_id is
  'Accepted 2-3 person same-gender group used by a friends event application.';
