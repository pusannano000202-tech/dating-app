-- Room-bound polls and explicit, versioned agreement proposals for automatic
-- activity rooms. Poll results are advisory: no function here changes a room,
-- meetup schedule, role assignment, match, payment, or friendship state.
begin;

create table quantum_private.activity_room_polls (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  room_kind text not null default 'activity_room'
    check (room_kind in ('activity_room','meetup','friend','department_challenge')),
  room_id uuid not null,
  creator_user_id uuid not null references public.users(id) on delete cascade,
  creator_alias_snapshot text not null check (
    pg_catalog.char_length(pg_catalog.btrim(creator_alias_snapshot)) between 1 and 40
    and creator_alias_snapshot=pg_catalog.btrim(creator_alias_snapshot)
  ),
  purpose text not null check (purpose in ('schedule','place','role','general')),
  title text not null check (
    pg_catalog.char_length(pg_catalog.btrim(title)) between 2 and 100
    and title=pg_catalog.btrim(title)
  ),
  selection_mode text not null check (selection_mode in ('single','multiple')),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  revision integer not null default 1 check (revision > 0),
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  closed_at timestamptz,
  cancelled_at timestamptz,
  unique (creator_user_id,idempotency_key),
  unique (room_kind,room_id,id),
  check (
    (status='open' and closed_at is null and cancelled_at is null)
    or (status='closed' and closed_at is not null and cancelled_at is null)
    or (status='cancelled' and cancelled_at is not null)
  )
);

create index activity_room_polls_room_created
  on quantum_private.activity_room_polls(room_kind,room_id,created_at desc,id desc);
create index activity_room_polls_creator_rate
  on quantum_private.activity_room_polls(creator_user_id,created_at desc);

create table quantum_private.activity_room_poll_options (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  poll_id uuid not null references quantum_private.activity_room_polls(id) on delete cascade,
  label text not null check (
    pg_catalog.char_length(pg_catalog.btrim(label)) between 1 and 80
    and label=pg_catalog.btrim(label)
  ),
  position smallint not null check (position between 0 and 7),
  unique (poll_id,id),
  unique (poll_id,position)
);

create index activity_room_poll_options_poll
  on quantum_private.activity_room_poll_options(poll_id,position,id);

create table quantum_private.activity_room_poll_ballots (
  poll_id uuid not null references quantum_private.activity_room_polls(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (poll_id,user_id)
);

create index activity_room_poll_ballots_user
  on quantum_private.activity_room_poll_ballots(user_id,poll_id);

create table quantum_private.activity_room_poll_ballot_choices (
  poll_id uuid not null,
  user_id uuid not null,
  option_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (poll_id,user_id,option_id),
  foreign key (poll_id,user_id)
    references quantum_private.activity_room_poll_ballots(poll_id,user_id) on delete cascade,
  foreign key (poll_id,option_id)
    references quantum_private.activity_room_poll_options(poll_id,id) on delete cascade
);

create index activity_room_poll_choices_option
  on quantum_private.activity_room_poll_ballot_choices(option_id,poll_id);

create table quantum_private.activity_room_poll_agreements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  room_kind text not null default 'activity_room'
    check (room_kind in ('activity_room','meetup','friend','department_challenge')),
  room_id uuid not null,
  poll_id uuid not null,
  version integer not null check (version > 0),
  selected_option_id uuid not null,
  summary text not null check (
    pg_catalog.char_length(pg_catalog.btrim(summary)) between 2 and 160
    and summary=pg_catalog.btrim(summary)
  ),
  member_snapshot uuid[] not null check (pg_catalog.cardinality(member_snapshot) > 0),
  status text not null default 'proposal' check (status in ('proposal','confirmed','superseded')),
  proposed_by_user_id uuid not null references public.users(id) on delete cascade,
  idempotency_key uuid not null,
  proposed_at timestamptz not null default pg_catalog.clock_timestamp(),
  confirmed_at timestamptz,
  foreign key (room_kind,room_id,poll_id)
    references quantum_private.activity_room_polls(room_kind,room_id,id) on delete cascade,
  foreign key (poll_id,selected_option_id)
    references quantum_private.activity_room_poll_options(poll_id,id) on delete restrict,
  unique (room_kind,room_id,version),
  unique (proposed_by_user_id,idempotency_key),
  unique (id,room_id),
  check ((status='confirmed' and confirmed_at is not null) or status<>'confirmed')
);

create unique index activity_room_poll_agreements_one_current
  on quantum_private.activity_room_poll_agreements(room_kind,room_id)
  where status in ('proposal','confirmed');
create index activity_room_poll_agreements_poll
  on quantum_private.activity_room_poll_agreements(poll_id,proposed_at desc,id desc);

create table quantum_private.chat_poll_friend_rooms (
  room_id uuid primary key,
  first_user_id uuid not null,
  second_user_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (first_user_id,second_user_id)
    references public.friendships(user_id,friend_user_id) on delete cascade,
  unique (first_user_id,second_user_id),
  check (first_user_id<second_user_id)
);

create table quantum_private.activity_room_poll_agreement_confirmations (
  agreement_id uuid not null references quantum_private.activity_room_poll_agreements(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  confirmed_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (agreement_id,user_id)
);

create index activity_room_poll_agreement_confirmations_user
  on quantum_private.activity_room_poll_agreement_confirmations(user_id,agreement_id);

alter table quantum_private.activity_room_polls enable row level security;
alter table quantum_private.activity_room_poll_options enable row level security;
alter table quantum_private.activity_room_poll_ballots enable row level security;
alter table quantum_private.activity_room_poll_ballot_choices enable row level security;
alter table quantum_private.activity_room_poll_agreements enable row level security;
alter table quantum_private.activity_room_poll_agreement_confirmations enable row level security;
alter table quantum_private.chat_poll_friend_rooms enable row level security;

revoke all on table quantum_private.activity_room_polls from public,anon,authenticated,service_role;
revoke all on table quantum_private.activity_room_poll_options from public,anon,authenticated,service_role;
revoke all on table quantum_private.activity_room_poll_ballots from public,anon,authenticated,service_role;
revoke all on table quantum_private.activity_room_poll_ballot_choices from public,anon,authenticated,service_role;
revoke all on table quantum_private.activity_room_poll_agreements from public,anon,authenticated,service_role;
revoke all on table quantum_private.activity_room_poll_agreement_confirmations from public,anon,authenticated,service_role;
revoke all on table quantum_private.chat_poll_friend_rooms from public,anon,authenticated,service_role;

create function quantum_private.chat_poll_actor_is_live(p_actor uuid)
returns boolean
language sql stable security definer set search_path='' as $$
  select p_actor is not null
    and exists(
      select 1 from auth.users account
      where account.id=p_actor and account.deleted_at is null
        and (account.banned_until is null or account.banned_until<=pg_catalog.clock_timestamp())
    )
    and not quantum_private.account_deletion_blocks_access(p_actor)
$$;

create function quantum_private.assert_activity_poll_member(p_room_id uuid,p_actor uuid)
returns uuid
language plpgsql stable security definer set search_path='' as $$
declare
  v_pool_id uuid;
begin
  if p_room_id is null or not quantum_private.chat_poll_actor_is_live(p_actor) then
    raise exception 'activity_poll_forbidden' using errcode='42501';
  end if;
  select room.pool_id into v_pool_id
  from quantum_private.activity_room_rooms room
  join quantum_private.activity_room_members member
    on member.room_id=room.id and member.pool_id=room.pool_id
  where room.id=p_room_id and room.status in ('open','full')
    and member.user_id=p_actor and member.status='joined';
  if v_pool_id is null
    or not quantum_private.activity_room_member_current(v_pool_id,p_actor)
    or exists(
      select 1
      from quantum_private.activity_room_members member
      where member.room_id=p_room_id and member.status='joined'
        and quantum_private.activity_room_member_current(v_pool_id,member.user_id)
        and quantum_private.tonight_invite_pair_is_blocked(p_actor,member.user_id)
    )
  then
    raise exception 'activity_poll_forbidden' using errcode='42501';
  end if;
  return v_pool_id;
end
$$;

create function quantum_private.activity_poll_current_members(p_room_id uuid)
returns table(user_id uuid)
language sql stable security definer set search_path='' as $$
  select member.user_id
  from quantum_private.activity_room_members member
  join quantum_private.activity_room_rooms room
    on room.id=member.room_id and room.pool_id=member.pool_id
  where member.room_id=p_room_id and member.status='joined'
    and room.status in ('open','full')
    and quantum_private.activity_room_member_current(room.pool_id,member.user_id)
  order by member.user_id
$$;

create function quantum_private.friend_chat_poll_room_id(p_first uuid,p_second uuid)
returns uuid
language sql immutable security definer set search_path='' as $$
  select (
    pg_catalog.substr(digest.value,1,8)||'-'||
    pg_catalog.substr(digest.value,9,4)||'-'||
    pg_catalog.substr(digest.value,13,4)||'-'||
    pg_catalog.substr(digest.value,17,4)||'-'||
    pg_catalog.substr(digest.value,21,12)
  )::uuid
  from (select pg_catalog.md5(
    'quantum:friend-chat-poll|'||least(p_first,p_second)::text||'|'||greatest(p_first,p_second)::text
  ) as value) digest
$$;

create function quantum_private.chat_poll_current_members(p_room_kind text,p_room_id uuid)
returns table(user_id uuid)
language sql stable security definer set search_path='' as $$
  select selected.user_id
  from (
    select member.user_id
    from quantum_private.activity_poll_current_members(p_room_id) member
    where p_room_kind='activity_room'
    union all
    select member.user_id
    from public.activity_meetup_members member
    where p_room_kind='meetup' and member.meetup_id=p_room_id and member.status='joined'
    union all
    select roster.user_id
    from public.department_challenge_roster roster
    where p_room_kind='department_challenge' and roster.challenge_id=p_room_id and roster.status='accepted'
    union all
    select pair.user_id
    from quantum_private.chat_poll_friend_rooms room
    cross join lateral (values(room.first_user_id),(room.second_user_id)) pair(user_id)
    where p_room_kind='friend' and room.room_id=p_room_id
      and quantum_private.is_active_accepted_friend_pair(room.first_user_id,room.second_user_id)
  ) selected
  join auth.users account on account.id=selected.user_id
  where account.deleted_at is null
    and (account.banned_until is null or account.banned_until<=pg_catalog.clock_timestamp())
    and not quantum_private.account_deletion_blocks_access(selected.user_id)
  order by selected.user_id
$$;

create function quantum_private.resolve_chat_poll_room(
  p_room_kind text,p_room_ref_id uuid,p_actor uuid,p_require_writable boolean
)
returns uuid
language plpgsql stable security definer set search_path='' as $$
declare
  v_room_id uuid;
  v_first uuid;
  v_second uuid;
begin
  if p_room_kind not in ('activity_room','meetup','friend','department_challenge')
    or p_room_kind is null or p_room_ref_id is null
    or not quantum_private.chat_poll_actor_is_live(p_actor)
  then raise exception 'activity_poll_forbidden' using errcode='42501'; end if;
  if p_room_kind='activity_room' then
    perform quantum_private.assert_activity_poll_member(p_room_ref_id,p_actor);
    return p_room_ref_id;
  elsif p_room_kind='meetup' then
    if not exists(
      select 1
      from public.activity_meetup_members member
      join public.activity_meetups meetup on meetup.id=member.meetup_id
      where member.meetup_id=p_room_ref_id and member.user_id=p_actor and member.status='joined'
        and (not p_require_writable or meetup.status in ('open','full'))
    ) then raise exception 'activity_poll_forbidden' using errcode='42501'; end if;
    v_room_id:=p_room_ref_id;
  elsif p_room_kind='department_challenge' then
    if not exists(
      select 1
      from public.department_challenge_roster roster
      join public.department_challenges challenge on challenge.id=roster.challenge_id
      where roster.challenge_id=p_room_ref_id and roster.user_id=p_actor and roster.status='accepted'
        and (not p_require_writable or challenge.status not in ('completed','cancelled'))
    ) then raise exception 'activity_poll_forbidden' using errcode='42501'; end if;
    v_room_id:=p_room_ref_id;
  else
    if p_room_ref_id=p_actor
      or not quantum_private.is_active_accepted_friend_pair(p_actor,p_room_ref_id)
      or (
        select pg_catalog.count(*) from auth.users account
        where account.id in (p_actor,p_room_ref_id) and account.deleted_at is null
          and (account.banned_until is null or account.banned_until<=pg_catalog.clock_timestamp())
      )<>2
      or quantum_private.account_deletion_blocks_access(p_actor)
      or quantum_private.account_deletion_blocks_access(p_room_ref_id)
    then raise exception 'activity_poll_forbidden' using errcode='42501'; end if;
    v_first:=least(p_actor,p_room_ref_id); v_second:=greatest(p_actor,p_room_ref_id);
    v_room_id:=quantum_private.friend_chat_poll_room_id(v_first,v_second);
  end if;
  if p_room_kind in ('meetup','department_challenge') and exists(
    select 1 from quantum_private.chat_poll_current_members(p_room_kind,v_room_id) member
    where quantum_private.tonight_invite_pair_is_blocked(p_actor,member.user_id)
  ) then raise exception 'activity_poll_forbidden' using errcode='42501'; end if;
  return v_room_id;
end
$$;

-- Poll writes share the canonical domain rows with membership/status writers,
-- then re-run authorization while those rows are locked. This prevents a
-- writer that waited on a poll row from continuing after a leave, block,
-- account deletion, ban, or roster change committed.
create function quantum_private.lock_chat_poll_room(
  p_room_kind text,p_room_ref_id uuid,p_actor uuid,p_require_writable boolean
)
returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare
  v_room_id uuid;
  v_member uuid;
  v_locked_members uuid[];
  v_current_members uuid[];
begin
  if p_room_kind not in ('activity_room','meetup','friend','department_challenge')
    or p_room_ref_id is null or p_actor is null
  then raise exception 'activity_poll_forbidden' using errcode='42501'; end if;

  -- A preliminary, non-authoritative check prevents nonmembers from using
  -- guessed room or friend IDs to acquire locks on real users. The same check
  -- runs again below after all canonical rows are locked.
  v_room_id:=quantum_private.resolve_chat_poll_room(
    p_room_kind,p_room_ref_id,p_actor,p_require_writable
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'chat-poll-room-write|'||p_room_kind||'|'||v_room_id::text,0
  ));

  -- Freeze the raw roster first, then acquire every account-domain lock in one
  -- global UUID order. Actor-first locking can deadlock when the same two
  -- people write polls in different rooms with reversed actor roles.
  select coalesce(pg_catalog.array_agg(candidate.user_id order by candidate.user_id),'{}'::uuid[])
    into v_locked_members
  from (
    select p_actor as user_id
    union select p_room_ref_id where p_room_kind='friend'
    union select member.user_id from quantum_private.activity_room_members member
      where p_room_kind='activity_room' and member.room_id=p_room_ref_id and member.status='joined'
    union select member.user_id from public.activity_meetup_members member
      where p_room_kind='meetup' and member.meetup_id=p_room_ref_id and member.status='joined'
    union select roster.user_id from public.department_challenge_roster roster
      where p_room_kind='department_challenge' and roster.challenge_id=p_room_ref_id and roster.status='accepted'
  ) candidate
  where candidate.user_id is not null;

  foreach v_member in array v_locked_members loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'account-delete|'||v_member::text,0
    ));
    perform 1 from auth.users account where account.id=v_member for share;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'quantum:minimum-signup:user:'||v_member::text,0
    ));
  end loop;

  if p_room_kind='activity_room' then
    perform 1
    from quantum_private.activity_room_pools pool
    join quantum_private.activity_room_rooms room on room.pool_id=pool.id
    where room.id=p_room_ref_id for share of pool;
    perform 1 from quantum_private.activity_room_rooms room
      where room.id=p_room_ref_id for share;
    perform 1 from quantum_private.activity_room_members member
      where member.room_id=p_room_ref_id order by member.user_id for share;
  elsif p_room_kind='meetup' then
    perform 1 from public.activity_meetups meetup
      where meetup.id=p_room_ref_id for share;
    perform 1 from public.activity_meetup_members member
      where member.meetup_id=p_room_ref_id order by member.user_id for share;
  elsif p_room_kind='department_challenge' then
    perform 1 from public.department_challenges challenge
      where challenge.id=p_room_ref_id for share;
    perform 1 from public.department_challenge_roster roster
      where roster.challenge_id=p_room_ref_id order by roster.user_id for share;
  end if;

  select coalesce(pg_catalog.array_agg(candidate.user_id order by candidate.user_id),'{}'::uuid[])
    into v_current_members
  from (
    select p_actor as user_id
    union select p_room_ref_id where p_room_kind='friend'
    union select member.user_id from quantum_private.activity_room_members member
      where p_room_kind='activity_room' and member.room_id=p_room_ref_id and member.status='joined'
    union select member.user_id from public.activity_meetup_members member
      where p_room_kind='meetup' and member.meetup_id=p_room_ref_id and member.status='joined'
    union select roster.user_id from public.department_challenge_roster roster
      where p_room_kind='department_challenge' and roster.challenge_id=p_room_ref_id and roster.status='accepted'
  ) candidate
  where candidate.user_id is not null;
  if v_current_members is distinct from v_locked_members then
    raise exception 'activity_poll_membership_changed';
  end if;

  for v_member in
    select candidate.user_id
    from (
      select p_room_ref_id as user_id where p_room_kind='friend'
      union select member.user_id from quantum_private.activity_room_members member
        where p_room_kind='activity_room' and member.room_id=p_room_ref_id and member.status='joined'
      union select member.user_id from public.activity_meetup_members member
        where p_room_kind='meetup' and member.meetup_id=p_room_ref_id and member.status='joined'
      union select roster.user_id from public.department_challenge_roster roster
        where p_room_kind='department_challenge' and roster.challenge_id=p_room_ref_id and roster.status='accepted'
    ) candidate
    where candidate.user_id is not null and candidate.user_id<>p_actor
    order by candidate.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      quantum_private.friend_pair_lock_key(p_actor,v_member)
    );
  end loop;

  if p_room_kind='friend' then
    perform 1
    from public.friendships friendship
    join public.friend_requests request on request.id=friendship.created_from_request_id
    where friendship.user_id=least(p_actor,p_room_ref_id)
      and friendship.friend_user_id=greatest(p_actor,p_room_ref_id)
    for share of friendship,request;
  end if;

  return quantum_private.resolve_chat_poll_room(
    p_room_kind,p_room_ref_id,p_actor,p_require_writable
  );
end
$$;

create function quantum_private.chat_poll_creator_alias(
  p_room_kind text,p_room_id uuid,p_actor uuid
)
returns text
language plpgsql stable security definer set search_path='' as $$
declare v_alias text;
begin
  if p_room_kind='activity_room' then
    select nullif(pg_catalog.btrim(pg_catalog.to_jsonb(member)->>'identity_alias_snapshot'),'')
      into v_alias
    from quantum_private.activity_room_members member
    where member.room_id=p_room_id and member.user_id=p_actor and member.status='joined';
  elsif p_room_kind='meetup' then
    select nullif(pg_catalog.btrim(pg_catalog.to_jsonb(member)->>'identity_alias_snapshot'),'')
      into v_alias
    from public.activity_meetup_members member
    where member.meetup_id=p_room_id and member.user_id=p_actor and member.status='joined';
  end if;
  v_alias:=coalesce(v_alias,nullif(pg_catalog.btrim(quantum_private.activity_meetup_alias(p_actor)),''));
  if v_alias is null or pg_catalog.char_length(v_alias) not between 1 and 40 then
    raise exception 'activity_poll_forbidden' using errcode='42501';
  end if;
  return v_alias;
end
$$;

create function quantum_private.activity_poll_agreement_json(p_agreement_id uuid,p_actor uuid)
returns jsonb
language sql stable security definer set search_path='' as $$
  select pg_catalog.jsonb_build_object(
    'id',agreement.id,
    'version',agreement.version,
    'status',agreement.status,
    'selected_option_id',agreement.selected_option_id,
    'summary',agreement.summary,
    'confirmation_count',(
      select pg_catalog.count(*)::integer
      from quantum_private.activity_room_poll_agreement_confirmations confirmation
      where confirmation.agreement_id=agreement.id
        and confirmation.user_id=any(agreement.member_snapshot)
    ),
    'required_count',pg_catalog.cardinality(agreement.member_snapshot),
    'confirmed_by_me',exists(
      select 1 from quantum_private.activity_room_poll_agreement_confirmations confirmation
      where confirmation.agreement_id=agreement.id and confirmation.user_id=p_actor
    ),
    'membership_current',agreement.member_snapshot=coalesce((
      select pg_catalog.array_agg(member.user_id order by member.user_id)
      from quantum_private.chat_poll_current_members(agreement.room_kind,agreement.room_id) member
    ),'{}'::uuid[]),
    'proposed_at',agreement.proposed_at,
    'confirmed_at',agreement.confirmed_at
  )
  from quantum_private.activity_room_poll_agreements agreement
  where agreement.id=p_agreement_id and agreement.status in ('proposal','confirmed')
$$;

create function quantum_private.activity_poll_json(p_poll_id uuid,p_actor uuid)
returns jsonb
language sql stable security definer set search_path='' as $$
  select pg_catalog.jsonb_build_object(
    'id',poll.id,
    'purpose',poll.purpose,
    'title',poll.title,
    'selection_mode',poll.selection_mode,
    'status',poll.status,
    'revision',poll.revision,
    'creator_alias',poll.creator_alias_snapshot,
    'is_creator',poll.creator_user_id=p_actor,
    'created_at',poll.created_at,
    'closed_at',poll.closed_at,
    'ballot_count',(
      select pg_catalog.count(*)::integer
      from quantum_private.activity_room_poll_ballots ballot
      where ballot.poll_id=poll.id
        and ballot.user_id in (
          select member.user_id from quantum_private.chat_poll_current_members(poll.room_kind,poll.room_id) member
        )
    ),
    'options',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',option.id,
        'label',option.label,
        'position',option.position,
        'vote_count',(
          select pg_catalog.count(*)::integer
          from quantum_private.activity_room_poll_ballot_choices choice
          where choice.poll_id=poll.id and choice.option_id=option.id
            and choice.user_id in (
              select member.user_id from quantum_private.chat_poll_current_members(poll.room_kind,poll.room_id) member
            )
        ),
        'selected_by_me',exists(
          select 1 from quantum_private.activity_room_poll_ballot_choices mine
          where mine.poll_id=poll.id and mine.option_id=option.id and mine.user_id=p_actor
        )
      ) order by option.position,option.id)
      from quantum_private.activity_room_poll_options option
      where option.poll_id=poll.id
    ),'[]'::jsonb),
    'agreement',(
      select quantum_private.activity_poll_agreement_json(agreement.id,p_actor)
      from quantum_private.activity_room_poll_agreements agreement
      where agreement.poll_id=poll.id and agreement.status in ('proposal','confirmed')
      order by agreement.version desc limit 1
    )
  )
  from quantum_private.activity_room_polls poll
  where poll.id=p_poll_id
$$;

create function public.get_activity_room_polls(p_room_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
begin
  perform quantum_private.assert_activity_poll_member(p_room_id,v_actor);
  return pg_catalog.jsonb_build_object(
    'room_id',p_room_id,
    'polls',coalesce((
      select pg_catalog.jsonb_agg(
        quantum_private.activity_poll_json(poll.id,v_actor)
        order by poll.has_current_agreement desc,poll.created_at desc,poll.id desc
      )
      from (
        select selected.id,selected.created_at,exists(
          select 1 from quantum_private.activity_room_poll_agreements agreement
          where agreement.poll_id=selected.id and agreement.status in ('proposal','confirmed')
        ) as has_current_agreement
        from quantum_private.activity_room_polls selected
        where selected.room_kind='activity_room' and selected.room_id=p_room_id
        order by has_current_agreement desc,selected.created_at desc,selected.id desc
        limit 30
      ) poll
    ),'[]'::jsonb)
  );
end
$$;

create function public.create_activity_room_poll(
  p_room_id uuid,p_purpose text,p_title text,p_selection_mode text,
  p_options text[],p_idempotency_key uuid
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_poll quantum_private.activity_room_polls%rowtype;
  v_existing_options text[];
  v_options text[];
begin
  perform quantum_private.lock_chat_poll_room('activity_room',p_room_id,v_actor,true);
  if p_purpose is null or p_purpose not in ('schedule','place','role','general') then
    raise exception 'invalid_activity_poll_purpose';
  end if;
  if p_selection_mode is null or p_selection_mode not in ('single','multiple') then
    raise exception 'invalid_activity_poll_selection_mode';
  end if;
  if p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 2 and 100 then
    raise exception 'invalid_activity_poll_title';
  end if;
  if p_idempotency_key is null or p_options is null or pg_catalog.cardinality(p_options) not between 2 and 8
    or exists(
      select 1 from pg_catalog.unnest(p_options) option(label)
      where label is null or pg_catalog.char_length(pg_catalog.btrim(label)) not between 1 and 80
    )
  then raise exception 'invalid_activity_poll_options'; end if;
  select pg_catalog.array_agg(pg_catalog.btrim(option.label) order by option.ordinality)
    into v_options
  from pg_catalog.unnest(p_options) with ordinality option(label,ordinality);
  if (
    select pg_catalog.count(*) from (
      select pg_catalog.lower(option.label) from pg_catalog.unnest(v_options) option(label)
      group by pg_catalog.lower(option.label)
    ) distinct_options
  )<>pg_catalog.cardinality(v_options)
  then raise exception 'invalid_activity_poll_options'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'chat-poll-create-rate|'||v_actor::text,0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-poll-create|'||v_actor::text||'|'||p_idempotency_key::text,0
  ));
  select poll.* into v_poll
  from quantum_private.activity_room_polls poll
  where poll.creator_user_id=v_actor and poll.idempotency_key=p_idempotency_key;
  if found then
    select pg_catalog.array_agg(option.label order by option.position)
      into v_existing_options
    from quantum_private.activity_room_poll_options option where option.poll_id=v_poll.id;
    if v_poll.room_kind<>'activity_room' or v_poll.room_id<>p_room_id or v_poll.purpose<>p_purpose
      or v_poll.title<>pg_catalog.btrim(p_title) or v_poll.selection_mode<>p_selection_mode
      or v_existing_options is distinct from v_options
    then raise exception 'activity_poll_idempotency_key_reused'; end if;
    return quantum_private.activity_poll_json(v_poll.id,v_actor);
  end if;
  if (
    select pg_catalog.count(*)
    from quantum_private.activity_room_polls recent
    where recent.creator_user_id=v_actor
      and recent.created_at>pg_catalog.clock_timestamp()-interval '1 hour'
  )>=12 then raise exception 'activity_poll_rate_limited'; end if;

  insert into quantum_private.activity_room_polls(
    room_kind,room_id,creator_user_id,creator_alias_snapshot,purpose,title,selection_mode,idempotency_key
  ) values(
    'activity_room',p_room_id,v_actor,
    quantum_private.chat_poll_creator_alias('activity_room',p_room_id,v_actor),
    p_purpose,pg_catalog.btrim(p_title),p_selection_mode,p_idempotency_key
  ) returning * into v_poll;
  insert into quantum_private.activity_room_poll_options(poll_id,label,position)
  select v_poll.id,option.label,(option.ordinality-1)::smallint
  from pg_catalog.unnest(v_options) with ordinality option(label,ordinality);
  return quantum_private.activity_poll_json(v_poll.id,v_actor);
end
$$;

create function public.vote_activity_room_poll(
  p_room_id uuid,p_poll_id uuid,p_option_ids uuid[]
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_poll quantum_private.activity_room_polls%rowtype;
begin
  perform quantum_private.lock_chat_poll_room('activity_room',p_room_id,v_actor,true);
  select poll.* into v_poll
  from quantum_private.activity_room_polls poll
  where poll.id=p_poll_id and poll.room_kind='activity_room' and poll.room_id=p_room_id
  for update;
  if not found then raise exception 'activity_poll_not_found'; end if;
  if v_poll.status<>'open' then raise exception 'activity_poll_not_open'; end if;
  if p_option_ids is null or pg_catalog.cardinality(p_option_ids) not between 1 and 8
    or exists(select 1 from pg_catalog.unnest(p_option_ids) selected(id) where selected.id is null)
  then raise exception 'invalid_activity_poll_options'; end if;
  if v_poll.selection_mode='single' and pg_catalog.cardinality(p_option_ids)<>1 then
    raise exception 'activity_poll_single_choice_required';
  end if;
  if (
    select pg_catalog.count(distinct option.id)
    from quantum_private.activity_room_poll_options option
    where option.poll_id=v_poll.id and option.id=any(p_option_ids)
  )<>pg_catalog.cardinality(p_option_ids)
  then raise exception 'invalid_activity_poll_options'; end if;

  insert into quantum_private.activity_room_poll_ballots(poll_id,user_id)
  values(v_poll.id,v_actor)
  on conflict(poll_id,user_id) do update
    set updated_at=pg_catalog.clock_timestamp();
  delete from quantum_private.activity_room_poll_ballot_choices choice
  where choice.poll_id=v_poll.id and choice.user_id=v_actor;
  insert into quantum_private.activity_room_poll_ballot_choices(poll_id,user_id,option_id)
  select v_poll.id,v_actor,selected.id
  from pg_catalog.unnest(p_option_ids) selected(id);
  return quantum_private.activity_poll_json(v_poll.id,v_actor);
end
$$;

create function public.close_activity_room_poll(
  p_room_id uuid,p_poll_id uuid,p_expected_revision integer
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_poll quantum_private.activity_room_polls%rowtype;
begin
  perform quantum_private.lock_chat_poll_room('activity_room',p_room_id,v_actor,true);
  select poll.* into v_poll
  from quantum_private.activity_room_polls poll
  where poll.id=p_poll_id and poll.room_kind='activity_room' and poll.room_id=p_room_id
  for update;
  if not found then raise exception 'activity_poll_not_found'; end if;
  if v_poll.creator_user_id<>v_actor then raise exception 'activity_poll_creator_required' using errcode='42501'; end if;
  if v_poll.status='closed' then return quantum_private.activity_poll_json(v_poll.id,v_actor); end if;
  if v_poll.status<>'open' then raise exception 'activity_poll_not_open'; end if;
  if p_expected_revision is null or p_expected_revision<>v_poll.revision then
    raise exception 'activity_poll_stale_revision';
  end if;
  update quantum_private.activity_room_polls poll
  set status='closed',revision=revision+1,closed_at=pg_catalog.clock_timestamp()
  where poll.id=v_poll.id;
  return quantum_private.activity_poll_json(v_poll.id,v_actor);
end
$$;

create function public.cancel_activity_room_poll(
  p_room_id uuid,p_poll_id uuid,p_expected_revision integer
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_poll quantum_private.activity_room_polls%rowtype;
begin
  perform quantum_private.lock_chat_poll_room('activity_room',p_room_id,v_actor,true);
  select poll.* into v_poll
  from quantum_private.activity_room_polls poll
  where poll.id=p_poll_id and poll.room_kind='activity_room' and poll.room_id=p_room_id
  for update;
  if not found then raise exception 'activity_poll_not_found'; end if;
  if v_poll.creator_user_id<>v_actor then raise exception 'activity_poll_creator_required' using errcode='42501'; end if;
  if v_poll.status='cancelled' then return quantum_private.activity_poll_json(v_poll.id,v_actor); end if;
  if v_poll.status<>'open' then raise exception 'activity_poll_not_open'; end if;
  if p_expected_revision is null or p_expected_revision<>v_poll.revision then
    raise exception 'activity_poll_stale_revision';
  end if;
  update quantum_private.activity_room_polls poll
  set status='cancelled',revision=revision+1,cancelled_at=pg_catalog.clock_timestamp()
  where poll.id=v_poll.id;
  return quantum_private.activity_poll_json(v_poll.id,v_actor);
end
$$;

create function public.propose_activity_room_poll_agreement(
  p_room_id uuid,p_poll_id uuid,p_selected_option_id uuid,
  p_expected_revision integer,p_idempotency_key uuid,p_summary text
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_poll quantum_private.activity_room_polls%rowtype;
  v_agreement quantum_private.activity_room_poll_agreements%rowtype;
  v_member_snapshot uuid[];
  v_max_votes integer;
  v_top_count integer;
  v_selected_votes integer;
  v_version integer;
begin
  perform quantum_private.lock_chat_poll_room('activity_room',p_room_id,v_actor,true);
  select poll.* into v_poll
  from quantum_private.activity_room_polls poll
  where poll.id=p_poll_id and poll.room_kind='activity_room' and poll.room_id=p_room_id
  for update;
  if not found then raise exception 'activity_poll_not_found'; end if;
  if v_poll.creator_user_id<>v_actor then raise exception 'activity_poll_creator_required' using errcode='42501'; end if;
  if v_poll.status<>'closed' then raise exception 'activity_poll_not_closed'; end if;
  if p_expected_revision is null or p_expected_revision<>v_poll.revision then
    raise exception 'activity_poll_stale_revision';
  end if;
  if p_idempotency_key is null or p_summary is null
    or pg_catalog.char_length(pg_catalog.btrim(p_summary)) not between 2 and 160
    or not exists(
      select 1 from quantum_private.activity_room_poll_options option
      where option.poll_id=v_poll.id and option.id=p_selected_option_id
    )
  then raise exception 'invalid_activity_poll_agreement'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-poll-agreement|'||p_room_id::text,0
  ));
  select agreement.* into v_agreement
  from quantum_private.activity_room_poll_agreements agreement
  where agreement.proposed_by_user_id=v_actor and agreement.idempotency_key=p_idempotency_key;
  if found then
    if v_agreement.room_id<>p_room_id or v_agreement.poll_id<>p_poll_id
      or v_agreement.selected_option_id<>p_selected_option_id
      or v_agreement.summary<>pg_catalog.btrim(p_summary)
    then raise exception 'activity_poll_idempotency_key_reused'; end if;
    return quantum_private.activity_poll_agreement_json(v_agreement.id,v_actor);
  end if;

  with counts as (
    select option.id,(
      select pg_catalog.count(*)::integer
      from quantum_private.activity_room_poll_ballot_choices choice
      where choice.poll_id=v_poll.id and choice.option_id=option.id
        and choice.user_id in (
          select member.user_id from quantum_private.activity_poll_current_members(p_room_id) member
        )
    ) as votes
    from quantum_private.activity_room_poll_options option
    where option.poll_id=v_poll.id
  ), top_result as (
    select pg_catalog.max(counts.votes) as max_votes from counts
  )
  select top_result.max_votes,
    (select pg_catalog.count(*)::integer from counts where counts.votes=top_result.max_votes),
    (select counts.votes from counts where counts.id=p_selected_option_id)
  into v_max_votes,v_top_count,v_selected_votes
  from top_result;
  if coalesce(v_max_votes,0)=0 then raise exception 'activity_poll_no_response'; end if;
  if v_top_count<>1 then raise exception 'activity_poll_tied'; end if;
  if v_selected_votes<>v_max_votes then raise exception 'activity_poll_winning_option_required'; end if;

  select pg_catalog.array_agg(member.user_id order by member.user_id)
    into v_member_snapshot
  from quantum_private.activity_poll_current_members(p_room_id) member;
  if coalesce(pg_catalog.cardinality(v_member_snapshot),0)=0 then
    raise exception 'activity_poll_forbidden' using errcode='42501';
  end if;
  select coalesce(pg_catalog.max(agreement.version),0)+1 into v_version
  from quantum_private.activity_room_poll_agreements agreement
  where agreement.room_kind='activity_room' and agreement.room_id=p_room_id;
  update quantum_private.activity_room_poll_agreements agreement
  set status='superseded'
  where agreement.room_kind='activity_room' and agreement.room_id=p_room_id and agreement.status in ('proposal','confirmed');
  insert into quantum_private.activity_room_poll_agreements(
    room_kind,room_id,poll_id,version,selected_option_id,summary,member_snapshot,
    proposed_by_user_id,idempotency_key
  ) values(
    'activity_room',p_room_id,p_poll_id,v_version,p_selected_option_id,pg_catalog.btrim(p_summary),
    v_member_snapshot,v_actor,p_idempotency_key
  ) returning * into v_agreement;
  return quantum_private.activity_poll_agreement_json(v_agreement.id,v_actor);
end
$$;

create function public.confirm_activity_room_poll_agreement(
  p_room_id uuid,p_poll_id uuid,p_agreement_id uuid,p_expected_version integer
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_agreement quantum_private.activity_room_poll_agreements%rowtype;
  v_current_members uuid[];
  v_confirmation_count integer;
begin
  perform quantum_private.lock_chat_poll_room('activity_room',p_room_id,v_actor,true);
  select agreement.* into v_agreement
  from quantum_private.activity_room_poll_agreements agreement
  where agreement.id=p_agreement_id and agreement.room_kind='activity_room'
    and agreement.room_id=p_room_id and agreement.poll_id=p_poll_id
  for update;
  if not found or v_agreement.status='superseded' then raise exception 'activity_poll_agreement_not_found'; end if;
  if p_expected_version is null or v_agreement.version<>p_expected_version then
    raise exception 'activity_poll_stale_version';
  end if;
  select pg_catalog.array_agg(member.user_id order by member.user_id)
    into v_current_members
  from quantum_private.activity_poll_current_members(p_room_id) member;
  if v_current_members is distinct from v_agreement.member_snapshot
    or not v_actor=any(v_agreement.member_snapshot)
  then raise exception 'activity_poll_agreement_membership_changed'; end if;

  insert into quantum_private.activity_room_poll_agreement_confirmations(agreement_id,user_id)
  values(v_agreement.id,v_actor)
  on conflict(agreement_id,user_id) do nothing;
  select pg_catalog.count(*)::integer into v_confirmation_count
  from quantum_private.activity_room_poll_agreement_confirmations confirmation
  where confirmation.agreement_id=v_agreement.id
    and confirmation.user_id=any(v_agreement.member_snapshot);
  if v_confirmation_count=pg_catalog.cardinality(v_agreement.member_snapshot)
    and v_agreement.status='proposal'
  then
    update quantum_private.activity_room_poll_agreements agreement
    set status='confirmed',confirmed_at=pg_catalog.clock_timestamp()
    where agreement.id=v_agreement.id;
  end if;
  return quantum_private.activity_poll_agreement_json(v_agreement.id,v_actor);
end
$$;

create function public.get_chat_room_polls(p_room_kind text,p_room_ref_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_room_id uuid;
begin
  v_room_id:=quantum_private.resolve_chat_poll_room(p_room_kind,p_room_ref_id,v_actor,false);
  return pg_catalog.jsonb_build_object(
    'room_id',p_room_ref_id,
    'polls',coalesce((
      select pg_catalog.jsonb_agg(
        quantum_private.activity_poll_json(poll.id,v_actor)
        order by poll.has_current_agreement desc,poll.created_at desc,poll.id desc
      )
      from (
        select selected.id,selected.created_at,exists(
          select 1 from quantum_private.activity_room_poll_agreements agreement
          where agreement.poll_id=selected.id and agreement.status in ('proposal','confirmed')
        ) as has_current_agreement
        from quantum_private.activity_room_polls selected
        where selected.room_kind=p_room_kind and selected.room_id=v_room_id
        order by has_current_agreement desc,selected.created_at desc,selected.id desc limit 30
      ) poll
    ),'[]'::jsonb)
  );
end
$$;

create function public.create_chat_room_poll(
  p_room_kind text,p_room_ref_id uuid,p_purpose text,p_title text,
  p_selection_mode text,p_options text[],p_idempotency_key uuid
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_room_id uuid;
  v_poll quantum_private.activity_room_polls%rowtype;
  v_existing_options text[];
  v_options text[];
  v_alias text;
begin
  if p_room_kind='activity_room' then
    return public.create_activity_room_poll(
      p_room_ref_id,p_purpose,p_title,p_selection_mode,p_options,p_idempotency_key
    );
  end if;
  v_room_id:=quantum_private.lock_chat_poll_room(p_room_kind,p_room_ref_id,v_actor,true);
  if p_purpose is null or p_purpose not in ('schedule','place','role','general') then
    raise exception 'invalid_activity_poll_purpose';
  end if;
  if p_selection_mode is null or p_selection_mode not in ('single','multiple') then
    raise exception 'invalid_activity_poll_selection_mode';
  end if;
  if p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 2 and 100 then
    raise exception 'invalid_activity_poll_title';
  end if;
  if p_idempotency_key is null or p_options is null or pg_catalog.cardinality(p_options) not between 2 and 8
    or exists(
      select 1 from pg_catalog.unnest(p_options) option(label)
      where label is null or pg_catalog.char_length(pg_catalog.btrim(label)) not between 1 and 80
    )
  then raise exception 'invalid_activity_poll_options'; end if;
  select pg_catalog.array_agg(pg_catalog.btrim(option.label) order by option.ordinality)
    into v_options
  from pg_catalog.unnest(p_options) with ordinality option(label,ordinality);
  if (
    select pg_catalog.count(*) from (
      select pg_catalog.lower(option.label) from pg_catalog.unnest(v_options) option(label)
      group by pg_catalog.lower(option.label)
    ) distinct_options
  )<>pg_catalog.cardinality(v_options)
  then raise exception 'invalid_activity_poll_options'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'chat-poll-create-rate|'||v_actor::text,0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'chat-poll-create|'||v_actor::text||'|'||p_idempotency_key::text,0
  ));
  select poll.* into v_poll from quantum_private.activity_room_polls poll
  where poll.creator_user_id=v_actor and poll.idempotency_key=p_idempotency_key;
  if found then
    select pg_catalog.array_agg(option.label order by option.position)
      into v_existing_options
    from quantum_private.activity_room_poll_options option where option.poll_id=v_poll.id;
    if v_poll.room_kind<>p_room_kind or v_poll.room_id<>v_room_id or v_poll.purpose<>p_purpose
      or v_poll.title<>pg_catalog.btrim(p_title) or v_poll.selection_mode<>p_selection_mode
      or v_existing_options is distinct from v_options
    then raise exception 'activity_poll_idempotency_key_reused'; end if;
    return quantum_private.activity_poll_json(v_poll.id,v_actor);
  end if;
  if (
    select pg_catalog.count(*) from quantum_private.activity_room_polls recent
    where recent.creator_user_id=v_actor
      and recent.created_at>pg_catalog.clock_timestamp()-interval '1 hour'
  )>=12 then raise exception 'activity_poll_rate_limited'; end if;

  if p_room_kind='friend' then
    insert into quantum_private.chat_poll_friend_rooms(room_id,first_user_id,second_user_id)
    values(v_room_id,least(v_actor,p_room_ref_id),greatest(v_actor,p_room_ref_id))
    on conflict(room_id) do nothing;
  end if;
  v_alias:=quantum_private.chat_poll_creator_alias(p_room_kind,v_room_id,v_actor);
  insert into quantum_private.activity_room_polls(
    room_kind,room_id,creator_user_id,creator_alias_snapshot,
    purpose,title,selection_mode,idempotency_key
  ) values(
    p_room_kind,v_room_id,v_actor,v_alias,p_purpose,pg_catalog.btrim(p_title),
    p_selection_mode,p_idempotency_key
  ) returning * into v_poll;
  insert into quantum_private.activity_room_poll_options(poll_id,label,position)
  select v_poll.id,option.label,(option.ordinality-1)::smallint
  from pg_catalog.unnest(v_options) with ordinality option(label,ordinality);
  return quantum_private.activity_poll_json(v_poll.id,v_actor);
end
$$;

create function public.vote_chat_room_poll(
  p_room_kind text,p_room_ref_id uuid,p_poll_id uuid,p_option_ids uuid[]
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_room_id uuid;
  v_poll quantum_private.activity_room_polls%rowtype;
begin
  if p_room_kind='activity_room' then
    return public.vote_activity_room_poll(p_room_ref_id,p_poll_id,p_option_ids);
  end if;
  v_room_id:=quantum_private.lock_chat_poll_room(p_room_kind,p_room_ref_id,v_actor,true);
  select poll.* into v_poll from quantum_private.activity_room_polls poll
  where poll.id=p_poll_id and poll.room_kind=p_room_kind and poll.room_id=v_room_id for update;
  if not found then raise exception 'activity_poll_not_found'; end if;
  if v_poll.status<>'open' then raise exception 'activity_poll_not_open'; end if;
  if p_option_ids is null or pg_catalog.cardinality(p_option_ids) not between 1 and 8
    or exists(select 1 from pg_catalog.unnest(p_option_ids) selected(id) where selected.id is null)
  then raise exception 'invalid_activity_poll_options'; end if;
  if v_poll.selection_mode='single' and pg_catalog.cardinality(p_option_ids)<>1 then
    raise exception 'activity_poll_single_choice_required';
  end if;
  if (
    select pg_catalog.count(distinct option.id)
    from quantum_private.activity_room_poll_options option
    where option.poll_id=v_poll.id and option.id=any(p_option_ids)
  )<>pg_catalog.cardinality(p_option_ids)
  then raise exception 'invalid_activity_poll_options'; end if;
  insert into quantum_private.activity_room_poll_ballots(poll_id,user_id)
  values(v_poll.id,v_actor)
  on conflict(poll_id,user_id) do update set updated_at=pg_catalog.clock_timestamp();
  delete from quantum_private.activity_room_poll_ballot_choices choice
  where choice.poll_id=v_poll.id and choice.user_id=v_actor;
  insert into quantum_private.activity_room_poll_ballot_choices(poll_id,user_id,option_id)
  select v_poll.id,v_actor,selected.id from pg_catalog.unnest(p_option_ids) selected(id);
  return quantum_private.activity_poll_json(v_poll.id,v_actor);
end
$$;

create function quantum_private.change_chat_poll_status(
  p_actor uuid,p_room_kind text,p_room_ref_id uuid,p_poll_id uuid,
  p_expected_revision integer,p_action text
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_room_id uuid;
  v_poll quantum_private.activity_room_polls%rowtype;
begin
  v_room_id:=quantum_private.lock_chat_poll_room(p_room_kind,p_room_ref_id,p_actor,true);
  if p_action not in ('close','cancel') then raise exception 'invalid_activity_poll_action'; end if;
  select poll.* into v_poll from quantum_private.activity_room_polls poll
  where poll.id=p_poll_id and poll.room_kind=p_room_kind and poll.room_id=v_room_id for update;
  if not found then raise exception 'activity_poll_not_found'; end if;
  if v_poll.creator_user_id<>p_actor then raise exception 'activity_poll_creator_required' using errcode='42501'; end if;
  if p_action='close' and v_poll.status='closed' then
    return quantum_private.activity_poll_json(v_poll.id,p_actor);
  elsif p_action='cancel' and v_poll.status='cancelled' then
    return quantum_private.activity_poll_json(v_poll.id,p_actor);
  end if;
  if v_poll.status<>'open' then raise exception 'activity_poll_not_open'; end if;
  if p_expected_revision is null or p_expected_revision<>v_poll.revision then
    raise exception 'activity_poll_stale_revision';
  end if;
  update quantum_private.activity_room_polls poll
  set status=case when p_action='close' then 'closed' else 'cancelled' end,
      revision=revision+1,
      closed_at=case when p_action='close' then pg_catalog.clock_timestamp() else null end,
      cancelled_at=case when p_action='cancel' then pg_catalog.clock_timestamp() else null end
  where poll.id=v_poll.id;
  return quantum_private.activity_poll_json(v_poll.id,p_actor);
end
$$;

create function public.close_chat_room_poll(
  p_room_kind text,p_room_ref_id uuid,p_poll_id uuid,p_expected_revision integer
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_room_kind='activity_room' then
    return public.close_activity_room_poll(p_room_ref_id,p_poll_id,p_expected_revision);
  end if;
  return quantum_private.change_chat_poll_status(
    auth.uid(),p_room_kind,p_room_ref_id,p_poll_id,p_expected_revision,'close'
  );
end
$$;

create function public.cancel_chat_room_poll(
  p_room_kind text,p_room_ref_id uuid,p_poll_id uuid,p_expected_revision integer
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_room_kind='activity_room' then
    return public.cancel_activity_room_poll(p_room_ref_id,p_poll_id,p_expected_revision);
  end if;
  return quantum_private.change_chat_poll_status(
    auth.uid(),p_room_kind,p_room_ref_id,p_poll_id,p_expected_revision,'cancel'
  );
end
$$;

create function public.propose_chat_room_poll_agreement(
  p_room_kind text,p_room_ref_id uuid,p_poll_id uuid,p_selected_option_id uuid,
  p_expected_revision integer,p_idempotency_key uuid,p_summary text
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_room_id uuid;
  v_poll quantum_private.activity_room_polls%rowtype;
  v_agreement quantum_private.activity_room_poll_agreements%rowtype;
  v_member_snapshot uuid[];
  v_max_votes integer;
  v_top_count integer;
  v_selected_votes integer;
  v_version integer;
begin
  if p_room_kind='activity_room' then
    return public.propose_activity_room_poll_agreement(
      p_room_ref_id,p_poll_id,p_selected_option_id,p_expected_revision,p_idempotency_key,p_summary
    );
  end if;
  v_room_id:=quantum_private.lock_chat_poll_room(p_room_kind,p_room_ref_id,v_actor,true);
  select poll.* into v_poll from quantum_private.activity_room_polls poll
  where poll.id=p_poll_id and poll.room_kind=p_room_kind and poll.room_id=v_room_id for update;
  if not found then raise exception 'activity_poll_not_found'; end if;
  if v_poll.creator_user_id<>v_actor then raise exception 'activity_poll_creator_required' using errcode='42501'; end if;
  if v_poll.status<>'closed' then raise exception 'activity_poll_not_closed'; end if;
  if p_expected_revision is null or p_expected_revision<>v_poll.revision then
    raise exception 'activity_poll_stale_revision';
  end if;
  if p_idempotency_key is null or p_summary is null
    or pg_catalog.char_length(pg_catalog.btrim(p_summary)) not between 2 and 160
    or not exists(
      select 1 from quantum_private.activity_room_poll_options option
      where option.poll_id=v_poll.id and option.id=p_selected_option_id
    )
  then raise exception 'invalid_activity_poll_agreement'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'chat-poll-agreement|'||p_room_kind||'|'||v_room_id::text,0
  ));
  select agreement.* into v_agreement
  from quantum_private.activity_room_poll_agreements agreement
  where agreement.proposed_by_user_id=v_actor and agreement.idempotency_key=p_idempotency_key;
  if found then
    if v_agreement.room_kind<>p_room_kind or v_agreement.room_id<>v_room_id
      or v_agreement.poll_id<>p_poll_id or v_agreement.selected_option_id<>p_selected_option_id
      or v_agreement.summary<>pg_catalog.btrim(p_summary)
    then raise exception 'activity_poll_idempotency_key_reused'; end if;
    return quantum_private.activity_poll_agreement_json(v_agreement.id,v_actor);
  end if;

  with counts as (
    select option.id,(
      select pg_catalog.count(*)::integer
      from quantum_private.activity_room_poll_ballot_choices choice
      where choice.poll_id=v_poll.id and choice.option_id=option.id
        and choice.user_id in (
          select member.user_id from quantum_private.chat_poll_current_members(p_room_kind,v_room_id) member
        )
    ) as votes
    from quantum_private.activity_room_poll_options option where option.poll_id=v_poll.id
  ), top_result as (select pg_catalog.max(counts.votes) as max_votes from counts)
  select top_result.max_votes,
    (select pg_catalog.count(*)::integer from counts where counts.votes=top_result.max_votes),
    (select counts.votes from counts where counts.id=p_selected_option_id)
  into v_max_votes,v_top_count,v_selected_votes from top_result;
  if coalesce(v_max_votes,0)=0 then raise exception 'activity_poll_no_response'; end if;
  if v_top_count<>1 then raise exception 'activity_poll_tied'; end if;
  if v_selected_votes<>v_max_votes then raise exception 'activity_poll_winning_option_required'; end if;

  select pg_catalog.array_agg(member.user_id order by member.user_id) into v_member_snapshot
  from quantum_private.chat_poll_current_members(p_room_kind,v_room_id) member;
  if coalesce(pg_catalog.cardinality(v_member_snapshot),0)=0 then
    raise exception 'activity_poll_forbidden' using errcode='42501';
  end if;
  select coalesce(pg_catalog.max(agreement.version),0)+1 into v_version
  from quantum_private.activity_room_poll_agreements agreement
  where agreement.room_kind=p_room_kind and agreement.room_id=v_room_id;
  update quantum_private.activity_room_poll_agreements agreement set status='superseded'
  where agreement.room_kind=p_room_kind and agreement.room_id=v_room_id
    and agreement.status in ('proposal','confirmed');
  insert into quantum_private.activity_room_poll_agreements(
    room_kind,room_id,poll_id,version,selected_option_id,summary,member_snapshot,
    proposed_by_user_id,idempotency_key
  ) values(
    p_room_kind,v_room_id,p_poll_id,v_version,p_selected_option_id,pg_catalog.btrim(p_summary),
    v_member_snapshot,v_actor,p_idempotency_key
  ) returning * into v_agreement;
  return quantum_private.activity_poll_agreement_json(v_agreement.id,v_actor);
end
$$;

create function public.confirm_chat_room_poll_agreement(
  p_room_kind text,p_room_ref_id uuid,p_poll_id uuid,p_agreement_id uuid,p_expected_version integer
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_room_id uuid;
  v_agreement quantum_private.activity_room_poll_agreements%rowtype;
  v_current_members uuid[];
  v_confirmation_count integer;
begin
  if p_room_kind='activity_room' then
    return public.confirm_activity_room_poll_agreement(
      p_room_ref_id,p_poll_id,p_agreement_id,p_expected_version
    );
  end if;
  v_room_id:=quantum_private.lock_chat_poll_room(p_room_kind,p_room_ref_id,v_actor,true);
  select agreement.* into v_agreement
  from quantum_private.activity_room_poll_agreements agreement
  where agreement.id=p_agreement_id and agreement.room_kind=p_room_kind
    and agreement.room_id=v_room_id and agreement.poll_id=p_poll_id for update;
  if not found or v_agreement.status='superseded' then raise exception 'activity_poll_agreement_not_found'; end if;
  if p_expected_version is null or v_agreement.version<>p_expected_version then
    raise exception 'activity_poll_stale_version';
  end if;
  select pg_catalog.array_agg(member.user_id order by member.user_id) into v_current_members
  from quantum_private.chat_poll_current_members(p_room_kind,v_room_id) member;
  if v_current_members is distinct from v_agreement.member_snapshot
    or not v_actor=any(v_agreement.member_snapshot)
  then raise exception 'activity_poll_agreement_membership_changed'; end if;
  insert into quantum_private.activity_room_poll_agreement_confirmations(agreement_id,user_id)
  values(v_agreement.id,v_actor) on conflict(agreement_id,user_id) do nothing;
  select pg_catalog.count(*)::integer into v_confirmation_count
  from quantum_private.activity_room_poll_agreement_confirmations confirmation
  where confirmation.agreement_id=v_agreement.id
    and confirmation.user_id=any(v_agreement.member_snapshot);
  if v_confirmation_count=pg_catalog.cardinality(v_agreement.member_snapshot)
    and v_agreement.status='proposal'
  then
    update quantum_private.activity_room_poll_agreements agreement
    set status='confirmed',confirmed_at=pg_catalog.clock_timestamp()
    where agreement.id=v_agreement.id;
  end if;
  return quantum_private.activity_poll_agreement_json(v_agreement.id,v_actor);
end
$$;

revoke execute on function quantum_private.chat_poll_actor_is_live(uuid) from public,anon,authenticated,service_role;
revoke execute on function quantum_private.assert_activity_poll_member(uuid,uuid) from public,anon,authenticated,service_role;
revoke execute on function quantum_private.activity_poll_current_members(uuid) from public,anon,authenticated,service_role;
revoke execute on function quantum_private.friend_chat_poll_room_id(uuid,uuid) from public,anon,authenticated,service_role;
revoke execute on function quantum_private.chat_poll_current_members(text,uuid) from public,anon,authenticated,service_role;
revoke execute on function quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean) from public,anon,authenticated,service_role;
revoke execute on function quantum_private.lock_chat_poll_room(text,uuid,uuid,boolean) from public,anon,authenticated,service_role;
revoke execute on function quantum_private.chat_poll_creator_alias(text,uuid,uuid) from public,anon,authenticated,service_role;
revoke execute on function quantum_private.activity_poll_agreement_json(uuid,uuid) from public,anon,authenticated,service_role;
revoke execute on function quantum_private.activity_poll_json(uuid,uuid) from public,anon,authenticated,service_role;
revoke execute on function quantum_private.change_chat_poll_status(uuid,text,uuid,uuid,integer,text) from public,anon,authenticated,service_role;

revoke execute on function public.get_activity_room_polls(uuid) from public,anon,authenticated,service_role;
revoke execute on function public.create_activity_room_poll(uuid,text,text,text,text[],uuid) from public,anon,authenticated,service_role;
revoke execute on function public.vote_activity_room_poll(uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
revoke execute on function public.close_activity_room_poll(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke execute on function public.cancel_activity_room_poll(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke execute on function public.propose_activity_room_poll_agreement(uuid,uuid,uuid,integer,uuid,text) from public,anon,authenticated,service_role;
revoke execute on function public.confirm_activity_room_poll_agreement(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke execute on function public.get_chat_room_polls(text,uuid) from public,anon,authenticated,service_role;
revoke execute on function public.create_chat_room_poll(text,uuid,text,text,text,text[],uuid) from public,anon,authenticated,service_role;
revoke execute on function public.vote_chat_room_poll(text,uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
revoke execute on function public.close_chat_room_poll(text,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke execute on function public.cancel_chat_room_poll(text,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke execute on function public.propose_chat_room_poll_agreement(text,uuid,uuid,uuid,integer,uuid,text) from public,anon,authenticated,service_role;
revoke execute on function public.confirm_chat_room_poll_agreement(text,uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;

grant execute on function public.get_activity_room_polls(uuid) to authenticated;
grant execute on function public.create_activity_room_poll(uuid,text,text,text,text[],uuid) to authenticated;
grant execute on function public.vote_activity_room_poll(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.close_activity_room_poll(uuid,uuid,integer) to authenticated;
grant execute on function public.cancel_activity_room_poll(uuid,uuid,integer) to authenticated;
grant execute on function public.propose_activity_room_poll_agreement(uuid,uuid,uuid,integer,uuid,text) to authenticated;
grant execute on function public.confirm_activity_room_poll_agreement(uuid,uuid,uuid,integer) to authenticated;
grant execute on function public.get_chat_room_polls(text,uuid) to authenticated;
grant execute on function public.create_chat_room_poll(text,uuid,text,text,text,text[],uuid) to authenticated;
grant execute on function public.vote_chat_room_poll(text,uuid,uuid,uuid[]) to authenticated;
grant execute on function public.close_chat_room_poll(text,uuid,uuid,integer) to authenticated;
grant execute on function public.cancel_chat_room_poll(text,uuid,uuid,integer) to authenticated;
grant execute on function public.propose_chat_room_poll_agreement(text,uuid,uuid,uuid,integer,uuid,text) to authenticated;
grant execute on function public.confirm_chat_room_poll_agreement(text,uuid,uuid,uuid,integer) to authenticated;

commit;
