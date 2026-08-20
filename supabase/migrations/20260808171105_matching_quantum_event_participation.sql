-- One current Quantum event selection per user.
-- The application reads and mutates this table only through authenticated RPCs.

create table if not exists public.quantum_event_participations (
  user_id uuid primary key references public.users(id) on delete cascade,
  event_id text not null,
  event_mode text not null check (event_mode in ('tonight', 'scheduled')),
  party_type text not null check (party_type in ('solo', 'friends')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quantum_event_participations_event_check check (
    (
      event_mode = 'tonight'
      and event_id in (
        'tonight-onsenjjang-run',
        'tonight-board-game',
        'tonight-casual-drinks',
        'tonight-late-dinner'
      )
    )
    or (
      event_mode = 'scheduled'
      and event_id in (
        'scheduled-board-game',
        'scheduled-jogging',
        'scheduled-dinner',
        'scheduled-walk'
      )
    )
  )
);

alter table public.quantum_event_participations enable row level security;

revoke all on table public.quantum_event_participations from public;
revoke all on table public.quantum_event_participations from anon, authenticated;
grant select, insert, update, delete on table public.quantum_event_participations to service_role;

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
  if auth.uid() is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'event_id', qep.event_id,
    'event_mode', qep.event_mode,
    'party_type', qep.party_type,
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
  p_party_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_participation jsonb;
begin
  if auth.uid() is null then
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

  insert into public.quantum_event_participations (
    user_id,
    event_id,
    event_mode,
    party_type
  )
  values (
    v_user_id,
    p_event_id,
    p_event_mode,
    p_party_type
  )
  on conflict (user_id) do update
  set event_id = excluded.event_id,
      event_mode = excluded.event_mode,
      party_type = excluded.party_type,
      updated_at = now();

  select jsonb_build_object(
    'event_id', qep.event_id,
    'event_mode', qep.event_mode,
    'party_type', qep.party_type,
    'updated_at', qep.updated_at
  )
  into v_participation
  from public.quantum_event_participations qep
  where qep.user_id = v_user_id;

  return v_participation;
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
begin
  if auth.uid() is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  delete from public.quantum_event_participations
  where user_id = v_user_id;

  return found;
end;
$$;

revoke execute on function public.get_my_quantum_event_participation() from public, anon;
revoke execute on function public.set_my_quantum_event_participation(text, text, text) from public, anon;
revoke execute on function public.cancel_my_quantum_event_participation() from public, anon;

grant execute on function public.get_my_quantum_event_participation() to authenticated;
grant execute on function public.set_my_quantum_event_participation(text, text, text) to authenticated;
grant execute on function public.cancel_my_quantum_event_participation() to authenticated;

comment on table public.quantum_event_participations is
  'Current Quantum event selection. A primary-key row enforces one active event per user.';
