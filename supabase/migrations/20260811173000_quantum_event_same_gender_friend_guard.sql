-- Enforce the product rule that a friends event application is made by an
-- accepted two or three person group whose active members share one gender.

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
  v_group_gender text;
  v_member_count integer;
  v_gender_mismatch_count integer;
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

    select count(*)::integer
      into v_member_count
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.left_at is null;

    if v_member_count < 2 or v_member_count > 3 then
      raise exception 'friend_group_member_count' using errcode = 'P0001';
    end if;

    if v_group_gender is null or v_group_gender not in ('male', 'female') then
      raise exception 'friend_group_gender_mismatch' using errcode = 'P0001';
    end if;

    select count(*)::integer
      into v_gender_mismatch_count
    from public.group_members gm
    left join public.profiles p
      on p.user_id = gm.user_id
    where gm.group_id = p_group_id
      and gm.left_at is null
      and p.gender is distinct from v_group_gender;

    if v_gender_mismatch_count > 0 then
      raise exception 'friend_group_gender_mismatch' using errcode = 'P0001';
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

revoke execute on function public.set_my_quantum_event_participation(text, text, text, uuid) from public, anon;
grant execute on function public.set_my_quantum_event_participation(text, text, text, uuid) to authenticated;

comment on function public.set_my_quantum_event_participation(text, text, text, uuid) is
  'Stores one guided event application after leader, group size, and same-gender membership checks.';
