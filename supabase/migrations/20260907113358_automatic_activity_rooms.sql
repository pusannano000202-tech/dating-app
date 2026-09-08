-- Hostless, schedule-free activity recruitment rooms.
-- This intentionally does not overload scheduled activity_meetups.
begin;

create table quantum_private.activity_room_pools (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_scope text not null,
  activity_key text not null,
  category text not null,
  gender_mode text not null check (gender_mode in ('all','male_only','female_only')),
  capacity smallint not null check (capacity between 2 and 20),
  status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (school_scope, activity_key, gender_mode)
);

create table quantum_private.activity_room_rooms (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  pool_id uuid not null references quantum_private.activity_room_pools(id) on delete restrict,
  room_number integer not null check (room_number > 0),
  status text not null default 'open' check (status in ('open','full','retired')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (pool_id, room_number),
  unique (pool_id, id)
);

create table quantum_private.activity_room_members (
  pool_id uuid not null,
  room_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'joined' check (status in ('joined','left')),
  school_scope_snapshot text not null,
  community_gender_snapshot text not null,
  joined_at timestamptz not null default pg_catalog.clock_timestamp(),
  left_at timestamptz,
  primary key (room_id, user_id),
  foreign key (pool_id, room_id)
    references quantum_private.activity_room_rooms(pool_id, id) on delete restrict,
  check ((status='joined' and left_at is null) or (status='left' and left_at is not null))
);

create unique index activity_room_members_one_active_pool
  on quantum_private.activity_room_members(pool_id,user_id)
  where status='joined';
create index activity_room_members_room_joined
  on quantum_private.activity_room_members(room_id,joined_at,user_id)
  where status='joined';

create table quantum_private.activity_room_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  room_id uuid not null references quantum_private.activity_room_rooms(id) on delete restrict,
  sender_user_id uuid not null references public.users(id) on delete cascade,
  idempotency_key uuid not null,
  message text not null check (pg_catalog.char_length(pg_catalog.btrim(message)) between 1 and 1000),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (room_id,sender_user_id,idempotency_key)
);

create index activity_room_messages_page
  on quantum_private.activity_room_messages(room_id,created_at,id);
create index activity_room_messages_sender_window
  on quantum_private.activity_room_messages(sender_user_id,created_at);

alter table quantum_private.activity_room_pools enable row level security;
alter table quantum_private.activity_room_rooms enable row level security;
alter table quantum_private.activity_room_members enable row level security;
alter table quantum_private.activity_room_messages enable row level security;

revoke all on table quantum_private.activity_room_pools from public,anon,authenticated,service_role;
revoke all on table quantum_private.activity_room_rooms from public,anon,authenticated,service_role;
revoke all on table quantum_private.activity_room_members from public,anon,authenticated,service_role;
revoke all on table quantum_private.activity_room_messages from public,anon,authenticated,service_role;

create function quantum_private.activity_room_definition(p_activity_key text)
returns table(category text,capacity smallint)
language sql immutable security definer set search_path='' as $$
  select definition.category,definition.capacity
  from (values
    ('oncheon-running','running',6::smallint),
    ('evening-badminton','badminton',4::smallint),
    ('night-basketball','basketball',6::smallint),
    ('campus-tennis','tennis',4::smallint),
    ('board-game-round','board_game',5::smallint),
    ('team-gaming','gaming',5::smallint),
    ('geumjeongsan-hiking','hiking',6::smallint),
    ('campus-cafe-chat','dining',5::smallint),
    ('campus-small-shop','other',6::smallint),
    ('evening-neighborhood-walk','walking',6::smallint),
    ('evening-dining','dining',5::smallint),
    ('major-foundation-study','study',5::smallint),
    ('language-speaking-study','study',5::smallint),
    ('career-certificate-study','study',5::smallint),
    ('portfolio-project-study','study',5::smallint)
  ) as definition(activity_key,category,capacity)
  where definition.activity_key=p_activity_key
$$;

create function quantum_private.assert_activity_room_access(p_user uuid)
returns table(school_scope text,community_gender text)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_user is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if quantum_private.account_deletion_blocks_access(p_user) then
    raise exception 'account_deletion_pending' using errcode='42501';
  end if;
  if not exists(
    select 1 from auth.users account
    where account.id=p_user and account.deleted_at is null
      and (account.banned_until is null or account.banned_until<=pg_catalog.clock_timestamp())
  ) then raise exception 'activity_room_forbidden' using errcode='42501'; end if;
  if not exists(
    select 1 from quantum_private.resolve_profile_readiness(p_user) readiness
    where readiness.minimum_signup_complete
  ) then raise exception 'profile_required'; end if;
  return query
    select profile.school_scope,profile.community_gender
    from quantum_private.community_member_profiles profile
    where profile.user_id=p_user;
  if not found then raise exception 'profile_required'; end if;
end
$$;

create function quantum_private.activity_room_member_current(p_pool_id uuid,p_user uuid)
returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from quantum_private.activity_room_pools pool
    join quantum_private.community_member_profiles profile on profile.user_id=p_user
    join auth.users account on account.id=p_user
    where pool.id=p_pool_id and pool.status='active'
      and profile.school_scope=pool.school_scope
      and account.deleted_at is null
      and (account.banned_until is null or account.banned_until<=pg_catalog.clock_timestamp())
      and quantum_private.meetup_gender_eligibility(p_user,pool.gender_mode)='eligible'
      and not quantum_private.account_deletion_blocks_access(p_user)
      and exists(
        select 1 from quantum_private.resolve_profile_readiness(p_user) readiness
        where readiness.minimum_signup_complete
      )
  )
$$;

create function quantum_private.activity_room_lobby_json(
  p_actor uuid,p_activity_key text,p_gender_mode text
)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_school_scope text;
  v_capacity smallint;
  v_pool_id uuid;
  v_rooms jsonb;
begin
  select identity.school_scope into v_school_scope
    from quantum_private.assert_activity_room_access(p_actor) identity;
  select definition.capacity into v_capacity
    from quantum_private.activity_room_definition(p_activity_key) definition;
  if v_capacity is null then raise exception 'invalid_activity_key'; end if;
  if p_gender_mode not in ('all','male_only','female_only') or p_gender_mode is null then
    raise exception 'invalid_gender_mode';
  end if;
  select pool.id into v_pool_id
  from quantum_private.activity_room_pools pool
  where pool.school_scope=v_school_scope and pool.activity_key=p_activity_key
    and pool.gender_mode=p_gender_mode and pool.status='active';
  if v_pool_id is null then
    return pg_catalog.jsonb_build_object(
      'activity_key',p_activity_key,'gender_mode',p_gender_mode,
      'capacity',v_capacity,'room_count',0,'rooms','[]'::jsonb
    );
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',room.id,
      'room_number',room.room_number,
      'member_count',room_state.member_count,
      'capacity',v_capacity,
      'joined',room_state.joined,
      'status',case when room_state.member_count>=v_capacity then 'full' else 'recruiting' end,
      'joinable',not room_state.joined
        and room_state.member_count<v_capacity
        and not exists(
          select 1 from quantum_private.activity_room_members mine
          where mine.pool_id=v_pool_id and mine.user_id=p_actor and mine.status='joined'
        )
        and not exists(
          select 1 from quantum_private.activity_room_members member
          where member.room_id=room.id and member.status='joined'
            and quantum_private.activity_room_member_current(v_pool_id,member.user_id)
            and quantum_private.tonight_invite_pair_is_blocked(p_actor,member.user_id)
        )
    ) order by room.room_number),'[]'::jsonb)
    into v_rooms
  from quantum_private.activity_room_rooms room
  cross join lateral (
    select
      pg_catalog.count(*) filter(
        where member.status='joined'
          and quantum_private.activity_room_member_current(v_pool_id,member.user_id)
      )::integer as member_count,
      coalesce(pg_catalog.bool_or(member.user_id=p_actor and member.status='joined'),false) as joined
    from quantum_private.activity_room_members member
    where member.room_id=room.id
  ) room_state
  where room.pool_id=v_pool_id and room.status in ('open','full');
  return pg_catalog.jsonb_build_object(
    'activity_key',p_activity_key,'gender_mode',p_gender_mode,
    'capacity',v_capacity,'room_count',pg_catalog.jsonb_array_length(v_rooms),'rooms',v_rooms
  );
end
$$;

create function quantum_private.prune_activity_room_empty_rooms(p_pool_id uuid)
returns void
language sql volatile security definer set search_path='' as $$
  with empty_rooms as (
    select room.id,pg_catalog.row_number() over(order by room.room_number desc,room.id desc) as keep_rank
    from quantum_private.activity_room_rooms room
    where room.pool_id=p_pool_id and room.status='open'
      and not exists(
        select 1 from quantum_private.activity_room_members member
        where member.room_id=room.id and member.status='joined'
      )
  )
  update quantum_private.activity_room_rooms room
  set status='retired',updated_at=pg_catalog.clock_timestamp()
  from empty_rooms empty_room
  where room.id=empty_room.id and empty_room.keep_rank>1
$$;

create function quantum_private.reconcile_activity_room_pool(p_pool_id uuid)
returns void
language plpgsql volatile security definer set search_path='' as $$
declare
  v_capacity smallint;
begin
  select pool.capacity into v_capacity
  from quantum_private.activity_room_pools pool where pool.id=p_pool_id;
  update quantum_private.activity_room_members member
  set status='left',left_at=pg_catalog.clock_timestamp()
  where member.pool_id=p_pool_id and member.status='joined'
    and not quantum_private.activity_room_member_current(p_pool_id,member.user_id);
  update quantum_private.activity_room_rooms room
  set status=case
        when (
          select pg_catalog.count(*) from quantum_private.activity_room_members member
          where member.room_id=room.id and member.status='joined'
        )>=v_capacity then 'full'
        else 'open'
      end,
      updated_at=pg_catalog.clock_timestamp()
  where room.pool_id=p_pool_id and room.status<>'retired';
end
$$;

create function public.list_activity_rooms(p_activity_key text,p_gender_mode text)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_eligibility text;
begin
  perform 1 from quantum_private.assert_activity_room_access(v_actor);
  if not exists(select 1 from quantum_private.activity_room_definition(p_activity_key)) then
    raise exception 'invalid_activity_key';
  end if;
  if p_gender_mode not in ('all','male_only','female_only') or p_gender_mode is null then
    raise exception 'invalid_gender_mode';
  end if;
  v_eligibility:=quantum_private.meetup_gender_eligibility(v_actor,p_gender_mode);
  if v_eligibility='gender_required' then raise exception 'activity_room_gender_required'; end if;
  if v_eligibility is distinct from 'eligible' then raise exception 'activity_room_gender_restricted'; end if;
  return quantum_private.activity_room_lobby_json(v_actor,p_activity_key,p_gender_mode);
end
$$;

create function public.ensure_activity_room_pool(p_activity_key text,p_gender_mode text)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_school_scope text;
  v_category text;
  v_capacity smallint;
  v_pool quantum_private.activity_room_pools%rowtype;
  v_eligibility text;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'quantum:minimum-signup:user:'||v_actor::text,0
  ));
  select identity.school_scope into v_school_scope
    from quantum_private.assert_activity_room_access(v_actor) identity;
  select definition.category,definition.capacity into v_category,v_capacity
    from quantum_private.activity_room_definition(p_activity_key) definition;
  if v_capacity is null then raise exception 'invalid_activity_key'; end if;
  if p_gender_mode not in ('all','male_only','female_only') or p_gender_mode is null then
    raise exception 'invalid_gender_mode';
  end if;
  v_eligibility:=quantum_private.meetup_gender_eligibility(v_actor,p_gender_mode);
  if v_eligibility='gender_required' then raise exception 'activity_room_gender_required'; end if;
  if v_eligibility is distinct from 'eligible' then raise exception 'activity_room_gender_restricted'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-room-pool|'||v_school_scope||'|'||p_activity_key||'|'||p_gender_mode,0
  ));
  insert into quantum_private.activity_room_pools(
    school_scope,activity_key,category,gender_mode,capacity
  ) values(v_school_scope,p_activity_key,v_category,p_gender_mode,v_capacity)
  on conflict(school_scope,activity_key,gender_mode) do nothing;
  select pool.* into v_pool
  from quantum_private.activity_room_pools pool
  where pool.school_scope=v_school_scope and pool.activity_key=p_activity_key
    and pool.gender_mode=p_gender_mode
  for update;
  if v_pool.status<>'active' or v_pool.category<>v_category or v_pool.capacity<>v_capacity then
    raise exception 'activity_room_pool_contract_mismatch';
  end if;
  perform quantum_private.reconcile_activity_room_pool(v_pool.id);
  perform quantum_private.prune_activity_room_empty_rooms(v_pool.id);
  if not exists(
    select 1 from quantum_private.activity_room_rooms room
    where room.pool_id=v_pool.id and room.status='open'
      and (
        select pg_catalog.count(*) from quantum_private.activity_room_members member
        where member.room_id=room.id and member.status='joined'
      )<v_pool.capacity
  ) then
    insert into quantum_private.activity_room_rooms(pool_id,room_number)
    values(v_pool.id,coalesce((select pg_catalog.max(room.room_number) from quantum_private.activity_room_rooms room where room.pool_id=v_pool.id),0)+1);
  end if;
  return quantum_private.activity_room_lobby_json(v_actor,p_activity_key,p_gender_mode);
end
$$;

create function public.join_activity_room(p_room_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_school_scope text;
  v_gender text;
  v_room quantum_private.activity_room_rooms%rowtype;
  v_pool quantum_private.activity_room_pools%rowtype;
  v_existing quantum_private.activity_room_members%rowtype;
  v_count integer;
  v_eligibility text;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'quantum:minimum-signup:user:'||v_actor::text,0
  ));
  select identity.school_scope,identity.community_gender into v_school_scope,v_gender
    from quantum_private.assert_activity_room_access(v_actor) identity;
  select room.* into v_room from quantum_private.activity_room_rooms room where room.id=p_room_id;
  if v_room.id is null then raise exception 'activity_room_not_found'; end if;
  select pool.* into v_pool from quantum_private.activity_room_pools pool where pool.id=v_room.pool_id;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-room-pool|'||v_pool.school_scope||'|'||v_pool.activity_key||'|'||v_pool.gender_mode,0
  ));
  select pool.* into v_pool from quantum_private.activity_room_pools pool where pool.id=v_pool.id for update;
  select room.* into v_room from quantum_private.activity_room_rooms room where room.id=p_room_id;
  if v_pool.status<>'active' or v_pool.school_scope<>v_school_scope or v_room.status='retired' then
    raise exception 'activity_room_not_found';
  end if;
  perform quantum_private.reconcile_activity_room_pool(v_pool.id);
  perform quantum_private.prune_activity_room_empty_rooms(v_pool.id);
  select room.* into v_room from quantum_private.activity_room_rooms room where room.id=p_room_id for update;
  if v_room.status='retired' then raise exception 'activity_room_not_found'; end if;
  v_eligibility:=quantum_private.meetup_gender_eligibility(v_actor,v_pool.gender_mode);
  if v_eligibility='gender_required' then raise exception 'activity_room_gender_required'; end if;
  if v_eligibility is distinct from 'eligible' then raise exception 'activity_room_gender_restricted'; end if;

  select member.* into v_existing
  from quantum_private.activity_room_members member
  where member.pool_id=v_pool.id and member.user_id=v_actor and member.status='joined'
  for update;
  if v_existing.user_id is not null then
    if exists(
      select 1 from quantum_private.activity_room_members member
      where member.room_id=v_existing.room_id and member.status='joined'
        and quantum_private.activity_room_member_current(v_pool.id,member.user_id)
        and quantum_private.tonight_invite_pair_is_blocked(v_actor,member.user_id)
    ) then raise exception 'blocked_pair'; end if;
    select pg_catalog.count(*)::integer into v_count
    from quantum_private.activity_room_members member
    where member.room_id=v_existing.room_id and member.status='joined'
      and quantum_private.activity_room_member_current(v_pool.id,member.user_id);
    return pg_catalog.jsonb_build_object(
      'room_id',v_existing.room_id,'reused',true,'member_count',v_count,'capacity',v_pool.capacity
    );
  end if;
  if v_room.status<>'open' then raise exception 'activity_room_full'; end if;
  if exists(
    select 1 from quantum_private.activity_room_members member
    where member.room_id=v_room.id and member.status='joined'
      and quantum_private.activity_room_member_current(v_pool.id,member.user_id)
      and quantum_private.tonight_invite_pair_is_blocked(v_actor,member.user_id)
  ) then raise exception 'blocked_pair'; end if;
  select pg_catalog.count(*)::integer into v_count
  from quantum_private.activity_room_members member
  where member.room_id=v_room.id and member.status='joined'
    and quantum_private.activity_room_member_current(v_pool.id,member.user_id);
  if v_count>=v_pool.capacity then
    update quantum_private.activity_room_rooms set status='full',updated_at=pg_catalog.clock_timestamp() where id=v_room.id;
    raise exception 'activity_room_full';
  end if;
  insert into quantum_private.activity_room_members(
    pool_id,room_id,user_id,status,school_scope_snapshot,community_gender_snapshot,joined_at,left_at
  ) values(v_pool.id,v_room.id,v_actor,'joined',v_school_scope,v_gender,pg_catalog.clock_timestamp(),null)
  on conflict(room_id,user_id) do update
    set status='joined',school_scope_snapshot=excluded.school_scope_snapshot,
        community_gender_snapshot=excluded.community_gender_snapshot,
        joined_at=excluded.joined_at,left_at=null;
  v_count:=v_count+1;
  update quantum_private.activity_room_rooms
  set status=case when v_count>=v_pool.capacity then 'full' else 'open' end,
      updated_at=pg_catalog.clock_timestamp()
  where id=v_room.id;
  if v_count>=v_pool.capacity and not exists(
    select 1 from quantum_private.activity_room_rooms room
    where room.pool_id=v_pool.id and room.status='open'
      and (
        select pg_catalog.count(*) from quantum_private.activity_room_members member
        where member.room_id=room.id and member.status='joined'
      )<v_pool.capacity
  ) then
    insert into quantum_private.activity_room_rooms(pool_id,room_number)
    values(v_pool.id,coalesce((select pg_catalog.max(room.room_number) from quantum_private.activity_room_rooms room where room.pool_id=v_pool.id),0)+1);
  end if;
  return pg_catalog.jsonb_build_object(
    'room_id',v_room.id,'reused',false,'member_count',v_count,'capacity',v_pool.capacity
  );
end
$$;

create function public.leave_activity_room(p_room_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_member quantum_private.activity_room_members%rowtype;
  v_room quantum_private.activity_room_rooms%rowtype;
  v_pool quantum_private.activity_room_pools%rowtype;
  v_count integer;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'quantum:minimum-signup:user:'||v_actor::text,0
  ));
  select member.* into v_member
  from quantum_private.activity_room_members member
  where member.room_id=p_room_id and member.user_id=v_actor;
  if v_member.user_id is null or v_member.status='left' then
    return pg_catalog.jsonb_build_object('room_id',p_room_id,'joined',false,'reused',true);
  end if;
  select pool.* into v_pool from quantum_private.activity_room_pools pool where pool.id=v_member.pool_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-room-pool|'||v_pool.school_scope||'|'||v_pool.activity_key||'|'||v_pool.gender_mode,0
  ));
  select pool.* into v_pool from quantum_private.activity_room_pools pool where pool.id=v_member.pool_id for update;
  select room.* into v_room from quantum_private.activity_room_rooms room where room.id=p_room_id for update;
  select member.* into v_member
  from quantum_private.activity_room_members member
  where member.room_id=p_room_id and member.user_id=v_actor
  for update;
  if v_member.status='left' then
    return pg_catalog.jsonb_build_object('room_id',p_room_id,'joined',false,'reused',true);
  end if;
  update quantum_private.activity_room_members
  set status='left',left_at=pg_catalog.clock_timestamp()
  where room_id=p_room_id and user_id=v_actor and status='joined';
  select pg_catalog.count(*)::integer into v_count
  from quantum_private.activity_room_members member
  where member.room_id=p_room_id and member.status='joined';
  update quantum_private.activity_room_rooms
  set status=case when status='retired' then status else 'open' end,
      updated_at=pg_catalog.clock_timestamp()
  where id=p_room_id;
  perform quantum_private.prune_activity_room_empty_rooms(v_member.pool_id);
  return pg_catalog.jsonb_build_object(
    'room_id',p_room_id,'joined',false,'reused',false,'member_count',v_count
  );
end
$$;

create function public.get_activity_room(p_room_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_school_scope text;
  v_room quantum_private.activity_room_rooms%rowtype;
  v_pool quantum_private.activity_room_pools%rowtype;
  v_count integer;
begin
  select identity.school_scope into v_school_scope
    from quantum_private.assert_activity_room_access(v_actor) identity;
  select room.* into v_room from quantum_private.activity_room_rooms room where room.id=p_room_id;
  if v_room.id is null or v_room.status='retired' then raise exception 'activity_room_not_found'; end if;
  select pool.* into v_pool from quantum_private.activity_room_pools pool where pool.id=v_room.pool_id;
  if v_pool.status<>'active' or v_pool.school_scope<>v_school_scope then raise exception 'activity_room_not_found'; end if;
  if not exists(
    select 1 from quantum_private.activity_room_members member
    where member.room_id=p_room_id and member.user_id=v_actor and member.status='joined'
      and quantum_private.activity_room_member_current(v_pool.id,v_actor)
  ) then raise exception 'activity_room_membership_required'; end if;
  if exists(
    select 1 from quantum_private.activity_room_members member
    where member.room_id=p_room_id and member.status='joined'
      and quantum_private.activity_room_member_current(v_pool.id,member.user_id)
      and quantum_private.tonight_invite_pair_is_blocked(v_actor,member.user_id)
  ) then raise exception 'blocked_pair'; end if;
  select pg_catalog.count(*)::integer into v_count
  from quantum_private.activity_room_members member
  where member.room_id=p_room_id and member.status='joined'
    and quantum_private.activity_room_member_current(v_pool.id,member.user_id);
  return pg_catalog.jsonb_build_object(
    'id',v_room.id,
    'room_number',v_room.room_number,
    'member_count',v_count,
    'capacity',v_pool.capacity,
    'joined',true,
    'status',case when v_count>=v_pool.capacity then 'full' else 'recruiting' end,
    'joinable',false,
    'activity_key',v_pool.activity_key,
    'gender_mode',v_pool.gender_mode,
    'members',(
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'alias',quantum_private.activity_meetup_alias(member.user_id),
        'is_me',member.user_id=v_actor
      ) order by member.joined_at,member.user_id),'[]'::jsonb)
      from quantum_private.activity_room_members member
      where member.room_id=p_room_id and member.status='joined'
        and quantum_private.activity_room_member_current(v_pool.id,member.user_id)
    ),
    'messages',(
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',message.id,
        'sender_alias',quantum_private.activity_meetup_alias(message.sender_user_id),
        'message',message.message,
        'created_at',message.created_at,
        'is_me',message.sender_user_id=v_actor
      ) order by message.created_at,message.id),'[]'::jsonb)
      from (
        select recent.* from quantum_private.activity_room_messages recent
        where recent.room_id=p_room_id
          and quantum_private.activity_room_member_current(v_pool.id,recent.sender_user_id)
        order by recent.created_at desc,recent.id desc limit 100
      ) message
    )
  );
end
$$;

create function public.send_activity_room_message(
  p_room_id uuid,p_message text,p_idempotency_key uuid
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_school_scope text;
  v_text text:=pg_catalog.btrim(p_message);
  v_room quantum_private.activity_room_rooms%rowtype;
  v_pool quantum_private.activity_room_pools%rowtype;
  v_message quantum_private.activity_room_messages%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'quantum:minimum-signup:user:'||v_actor::text,0
  ));
  select identity.school_scope into v_school_scope
    from quantum_private.assert_activity_room_access(v_actor) identity;
  if p_idempotency_key is null or v_text is null or pg_catalog.char_length(v_text) not between 1 and 1000 then
    raise exception 'invalid_activity_room_message';
  end if;
  if v_text ~* '(https?://|www[.]|[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|instagram|insta[[:space:]_-]*gram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)'
     or pg_catalog.regexp_replace(v_text,'[^0-9]','','g') ~ '01[016789][0-9]{7,8}' then
    raise exception 'contact_sharing_not_allowed';
  end if;
  select room.* into v_room from quantum_private.activity_room_rooms room where room.id=p_room_id;
  if v_room.id is null or v_room.status='retired' then raise exception 'activity_room_not_found'; end if;
  select pool.* into v_pool from quantum_private.activity_room_pools pool where pool.id=v_room.pool_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-room-pool|'||v_pool.school_scope||'|'||v_pool.activity_key||'|'||v_pool.gender_mode,0
  ));
  select pool.* into v_pool from quantum_private.activity_room_pools pool where pool.id=v_pool.id for update;
  select room.* into v_room from quantum_private.activity_room_rooms room where room.id=p_room_id for update;
  if v_pool.status<>'active' or v_pool.school_scope<>v_school_scope or v_room.status='retired' then raise exception 'activity_room_not_found'; end if;
  if not exists(
    select 1 from quantum_private.activity_room_members member
    where member.room_id=p_room_id and member.user_id=v_actor and member.status='joined'
      and quantum_private.activity_room_member_current(v_pool.id,v_actor)
  ) then raise exception 'activity_room_membership_required'; end if;
  if exists(
    select 1 from quantum_private.activity_room_members member
    where member.room_id=p_room_id and member.status='joined'
      and quantum_private.activity_room_member_current(v_pool.id,member.user_id)
      and quantum_private.tonight_invite_pair_is_blocked(v_actor,member.user_id)
  ) then raise exception 'blocked_pair'; end if;

  select message.* into v_message
  from quantum_private.activity_room_messages message
  where message.room_id=p_room_id and message.sender_user_id=v_actor
    and message.idempotency_key=p_idempotency_key
  for update;
  if v_message.id is not null then
    if v_message.message<>v_text then raise exception 'idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object(
      'id',v_message.id,'sender_alias',quantum_private.activity_meetup_alias(v_actor),
      'message',v_message.message,'created_at',v_message.created_at,'is_me',true,'reused',true
    );
  end if;
  if (
    select pg_catalog.count(*)
    from quantum_private.activity_room_messages recent
    where recent.sender_user_id=v_actor
      and recent.created_at>=pg_catalog.clock_timestamp()-interval '1 minute'
  )>=30 then raise exception 'activity_room_rate_limited'; end if;
  insert into quantum_private.activity_room_messages(room_id,sender_user_id,idempotency_key,message)
  values(p_room_id,v_actor,p_idempotency_key,v_text)
  returning * into v_message;
  return pg_catalog.jsonb_build_object(
    'id',v_message.id,'sender_alias',quantum_private.activity_meetup_alias(v_actor),
    'message',v_message.message,'created_at',v_message.created_at,'is_me',true,'reused',false
  );
end
$$;

revoke all on function quantum_private.activity_room_definition(text) from public,anon,authenticated,service_role;
revoke all on function quantum_private.assert_activity_room_access(uuid) from public,anon,authenticated,service_role;
revoke all on function quantum_private.activity_room_member_current(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function quantum_private.activity_room_lobby_json(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function quantum_private.prune_activity_room_empty_rooms(uuid) from public,anon,authenticated,service_role;
revoke all on function quantum_private.reconcile_activity_room_pool(uuid) from public,anon,authenticated,service_role;
revoke all on function public.list_activity_rooms(text,text) from public,anon,authenticated,service_role;
revoke all on function public.ensure_activity_room_pool(text,text) from public,anon,authenticated,service_role;
revoke all on function public.join_activity_room(uuid) from public,anon,authenticated,service_role;
revoke all on function public.leave_activity_room(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_activity_room(uuid) from public,anon,authenticated,service_role;
revoke all on function public.send_activity_room_message(uuid,text,uuid) from public,anon,authenticated,service_role;

grant execute on function public.list_activity_rooms(text,text) to authenticated;
grant execute on function public.ensure_activity_room_pool(text,text) to authenticated;
grant execute on function public.join_activity_room(uuid) to authenticated;
grant execute on function public.leave_activity_room(uuid) to authenticated;
grant execute on function public.get_activity_room(uuid) to authenticated;
grant execute on function public.send_activity_room_message(uuid,text,uuid) to authenticated;

commit;
