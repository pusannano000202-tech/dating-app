-- Group mentoring is a new ledger, never a disguised 1:1 session. Local only.
begin;
create table quantum_private.group_mentoring_parties (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.users(id) on delete cascade,
  role text not null check(role in ('mentor','mentee')), side_size integer not null check(side_size in (2,3)),
  school_key text not null, department_key text not null,
  status text not null check(status in ('friends','waiting','offered','active','ended','expired','cancelled')),
  client_id uuid not null, request_args jsonb not null, session_id uuid,
  created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
  unique(owner_id,client_id)
);
create table quantum_private.group_mentoring_party_members (
  party_id uuid not null references quantum_private.group_mentoring_parties(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  accepted boolean not null default false, active boolean not null default false,
  primary key(party_id,user_id), check(not active or accepted)
);
create unique index group_mentoring_one_active_membership on quantum_private.group_mentoring_party_members(user_id) where active;
create index group_mentoring_queue on quantum_private.group_mentoring_parties(school_key,department_key,side_size,created_at) where status='waiting';
create table quantum_private.group_mentoring_sessions (
  id uuid primary key default gen_random_uuid(), side_size integer not null check(side_size in (2,3)),
  school_key text not null, department_key text not null,
  status text not null check(status in ('offered','active','ended','expired')),
  expires_at timestamptz not null, created_at timestamptz not null default clock_timestamp(),
  meeting_at timestamptz, meeting_place text check(char_length(meeting_place) between 1 and 160), plan_revision integer not null default 0
);
create index group_mentoring_session_expiry on quantum_private.group_mentoring_sessions(expires_at) where status in ('offered','active');
alter table quantum_private.group_mentoring_parties add foreign key(session_id) references quantum_private.group_mentoring_sessions(id);
create index group_mentoring_party_session on quantum_private.group_mentoring_parties(session_id) where session_id is not null;
create index group_mentoring_party_expiry on quantum_private.group_mentoring_parties(expires_at) where status in ('friends','waiting');
create table quantum_private.group_mentoring_members (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references quantum_private.group_mentoring_sessions(id) on delete cascade,
  party_id uuid not null references quantum_private.group_mentoring_parties(id) on delete cascade, user_id uuid not null references public.users(id) on delete cascade,
  role text not null check(role in ('mentor','mentee')), alias text not null, accepted boolean not null default false,
  unique(session_id,user_id)
);
create table quantum_private.group_mentoring_messages (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references quantum_private.group_mentoring_sessions(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade, client_id uuid not null,
  body text not null check(char_length(body) between 1 and 1000), created_at timestamptz not null default clock_timestamp(),
  unique(session_id,author_id,client_id)
);
create index group_mentoring_message_history on quantum_private.group_mentoring_messages(session_id,created_at desc,id desc);
create table quantum_private.group_mentoring_reports (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references quantum_private.group_mentoring_sessions(id) on delete cascade,
  reporter_id uuid not null references public.users(id) on delete cascade, reported_id uuid not null references public.users(id) on delete cascade,
  reason text not null check(char_length(reason) between 1 and 2000), status text not null default 'open' check(status in ('open','reviewed')),
  created_at timestamptz not null default clock_timestamp(), unique(session_id,reporter_id,reported_id), check(reporter_id<>reported_id)
);
do $$ declare t text; begin
  foreach t in array array['group_mentoring_parties','group_mentoring_party_members','group_mentoring_sessions','group_mentoring_members','group_mentoring_messages','group_mentoring_reports'] loop
    execute format('alter table quantum_private.%I enable row level security',t);
    execute format('revoke all on quantum_private.%I from public,anon,authenticated,service_role',t);
  end loop;
end $$;

-- Reports exclude their actual pair only; they never suspend either account.
-- Keep historical mentoring reports effective after the group-only transition.
create function quantum_private.group_mentoring_pair_excluded(a uuid,b uuid) returns boolean
language sql volatile security definer set search_path='' as $$
  select quantum_private.tonight_invite_pair_is_blocked(a,b)
    or exists(select 1 from quantum_private.group_mentoring_reports r where (r.reporter_id=a and r.reported_id=b) or (r.reporter_id=b and r.reported_id=a))
    or exists(select 1 from quantum_private.mentoring_reports r where (r.reporter_id=a and r.reported_id=b) or (r.reporter_id=b and r.reported_id=a))
$$;
create function quantum_private.group_mentoring_clear(p_parties uuid[]) returns boolean
language sql volatile security definer set search_path='' as $$
  select not exists(select 1 from quantum_private.group_mentoring_party_members a
    join quantum_private.group_mentoring_party_members b on a.user_id<b.user_id
    where a.party_id=any(p_parties) and b.party_id=any(p_parties)
      and quantum_private.group_mentoring_pair_excluded(a.user_id,b.user_id))
$$;
create function quantum_private.group_mentoring_lock_pairs(p_users uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare pair record; begin
  for pair in select distinct a.u as a,b.u as b from unnest(p_users) a(u) cross join unnest(p_users) b(u) where a.u<b.u order by a.u,b.u loop
    perform pg_advisory_xact_lock(quantum_private.friend_pair_lock_key(pair.a,pair.b));
  end loop;
end $$;

-- Close the old intake without deleting any historical session or message.
alter function quantum_private.mentoring_action(text,jsonb) rename to mentoring_legacy_action;
revoke all on function quantum_private.mentoring_legacy_action(text,jsonb) from public,anon,authenticated,service_role;
create function quantum_private.mentoring_action(p_action text,p_args jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_action='join' then raise exception 'mentoring_group_required'; end if;
  return quantum_private.mentoring_legacy_action(p_action,p_args);
end $$;
revoke all on function quantum_private.mentoring_action(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function quantum_private.mentoring_action(text,jsonb) to authenticated;

create function quantum_private.group_mentoring_action(p_action text,p_args jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); ts timestamptz; school text; department text; allowed text[];
  party quantum_private.group_mentoring_parties%rowtype; room quantum_private.group_mentoring_sessions%rowtype;
  own_member quantum_private.group_mentoring_members%rowtype; other_party quantum_private.group_mentoring_parties%rowtype;
  chosen uuid[]; people uuid[]; friends uuid[]; friend uuid; p_id uuid; s_id uuid; target uuid; client uuid;
  role_value text; n integer; phase text:='idle'; body text; meeting_time timestamptz; has_old boolean;
  members_json jsonb:='[]'; messages_json jsonb:='[]'; invitations_json jsonb:='[]'; friends_json jsonb:='[]'; meeting_json jsonb; targets_json jsonb:='[]';
  accepted_count integer:=0; member_count integer:=0; party_count integer:=0; party_accepted integer:=0;
begin
  if actor is null then raise exception 'not_authenticated'; end if;
  perform quantum_private.assert_activity_room_access(actor);
  select i.school_scope_key,i.department_key into school,department from quantum_private.get_member_department_identity(actor) i;
  if school is null or department is null then raise exception 'mentoring_profile_required'; end if;
  allowed:=case p_action
    when 'status' then array[]::text[] when 'join' then array['role','side_size','friend_ids','client_id']
    when 'cancel' then array[]::text[] when 'leave_legacy' then array[]::text[]
    when 'party_accept' then array['party_id'] when 'party_decline' then array['party_id']
    when 'accept' then array['session_id'] when 'decline' then array['session_id'] when 'end' then array['session_id']
    when 'message' then array['session_id','text','client_id'] when 'plan' then array['session_id','starts_at','place','revision']
    when 'report' then array['session_id','member_id','reason'] else null end;
  if allowed is null or jsonb_typeof(p_args) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_args))<>cardinality(allowed)
    or not p_args ?& allowed then raise exception 'mentoring_invalid'; end if;
  -- Bounded groups share one short transaction lock. No network work is done
  -- under this lock; the unique active-user index is the independent backstop.
  perform pg_advisory_xact_lock(hashtextextended('group-mentoring:v1',0));
  -- Old rooms can still be reported. Serialize with that existing ledger too,
  -- so a legacy report cannot commit between pair validation and disclosure.
  perform pg_advisory_xact_lock(hashtextextended('quantum:mentoring:v1',0));
  ts:=clock_timestamp();
  update quantum_private.group_mentoring_sessions set status='expired' where status in ('offered','active') and expires_at<=ts;
  update quantum_private.group_mentoring_sessions s set status='ended' where s.status in ('offered','active') and (
    exists(select 1 from quantum_private.group_mentoring_members m where m.session_id=s.id and not quantum_private.mentoring_member_eligible(m.user_id,s.school_key,s.department_key))
    or (select count(*) from quantum_private.group_mentoring_members m where m.session_id=s.id)<>s.side_size*2
    or exists(select 1 from quantum_private.group_mentoring_members a join quantum_private.group_mentoring_members b on a.session_id=b.session_id and a.user_id<b.user_id
      where a.session_id=s.id and quantum_private.group_mentoring_pair_excluded(a.user_id,b.user_id)));
  update quantum_private.group_mentoring_parties p set status=s.status,expires_at=s.expires_at
    from quantum_private.group_mentoring_sessions s where p.session_id=s.id and p.status<>s.status;
  update quantum_private.group_mentoring_parties set status='expired' where status in ('friends','waiting') and expires_at<=ts;
  update quantum_private.group_mentoring_parties p set status='ended' where p.status in ('friends','waiting') and (
    not quantum_private.group_mentoring_clear(array[p.id])
    or exists(select 1 from quantum_private.group_mentoring_party_members m where m.party_id=p.id and (
      not quantum_private.mentoring_member_eligible(m.user_id,p.school_key,p.department_key)
      or (m.user_id<>p.owner_id and not quantum_private.is_active_accepted_friend_pair(p.owner_id,m.user_id)))));
  update quantum_private.group_mentoring_party_members m set active=false from quantum_private.group_mentoring_parties p
    where m.party_id=p.id and p.status in ('ended','expired','cancelled') and m.active;
  select p.* into party from quantum_private.group_mentoring_parties p join quantum_private.group_mentoring_party_members m on m.party_id=p.id
    where m.user_id=actor and m.accepted order by m.active desc,p.created_at desc,p.id desc limit 1;

  if p_action='leave_legacy' then
    perform quantum_private.mentoring_legacy_action('cancel','{}');
  elsif p_action='join' then
    role_value:=p_args->>'role'; n:=(p_args->>'side_size')::integer; client:=(p_args->>'client_id')::uuid;
    if role_value is null or role_value not in ('mentor','mentee') or n is null or n not in (2,3) or client is null
      or jsonb_typeof(p_args->'side_size') is distinct from 'number' or jsonb_typeof(p_args->'friend_ids') is distinct from 'array'
      or jsonb_array_length(p_args->'friend_ids')>=n then raise exception 'mentoring_invalid'; end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into friends from jsonb_array_elements_text(p_args->'friend_ids');
    if actor=any(friends) or array_position(friends,null) is not null or cardinality(friends)<>(select count(distinct u) from unnest(friends) u) then raise exception 'mentoring_invalid'; end if;
    select * into other_party from quantum_private.group_mentoring_parties where owner_id=actor and client_id=client;
    if found then
      if other_party.request_args<>p_args then raise exception 'mentoring_conflict'; end if;
      -- A replay returns current state and never recreates a cancelled party.
    else
      if party.status in ('friends','waiting','offered','active') then raise exception 'mentoring_already_waiting'; end if;
      if exists(select 1 from quantum_private.mentoring_waiters where user_id=actor and status in ('offered','active') and expires_at>ts) then raise exception 'mentoring_legacy_active'; end if;
      if (select count(*) from quantum_private.group_mentoring_parties where owner_id=actor and created_at>ts-interval '1 hour')>=12 then raise exception 'mentoring_rate_limited'; end if;
      people:=array[actor]||friends;
      perform quantum_private.group_mentoring_lock_pairs(people);
      foreach friend in array friends loop
        if not quantum_private.is_active_accepted_friend_pair(actor,friend) or not quantum_private.mentoring_member_eligible(friend,school,department)
          or quantum_private.group_mentoring_pair_excluded(actor,friend) then raise exception 'mentoring_friend_unavailable'; end if;
      end loop;
      if exists(select 1 from unnest(people) a(u) cross join unnest(people) b(u) where a.u<b.u and quantum_private.group_mentoring_pair_excluded(a.u,b.u)) then raise exception 'mentoring_friend_unavailable'; end if;
      -- Only explicitly accepted membership reserves a user. Pending invitations
      -- neither queue nor silently remove a friend's existing participation.
      insert into quantum_private.group_mentoring_parties(owner_id,role,side_size,school_key,department_key,status,client_id,request_args,expires_at)
        values(actor,role_value,n,school,department,case when cardinality(friends)>0 then 'friends' else 'waiting' end,client,p_args,ts+interval '30 minutes') returning id into p_id;
      insert into quantum_private.group_mentoring_party_members(party_id,user_id,accepted,active) values(p_id,actor,true,true);
      insert into quantum_private.group_mentoring_party_members(party_id,user_id) select p_id,u from unnest(friends) u;
      update quantum_private.mentoring_waiters set status='cancelled' where user_id=actor and status='waiting';
    end if;
  elsif p_action in ('party_accept','party_decline') then
    p_id:=(p_args->>'party_id')::uuid;
    select * into other_party from quantum_private.group_mentoring_parties where id=p_id;
    if not found or not exists(select 1 from quantum_private.group_mentoring_party_members where party_id=p_id and user_id=actor)
      then raise exception 'mentoring_forbidden'; end if;
    if p_action='party_accept' then
      if other_party.status not in ('friends','waiting') then raise exception 'mentoring_not_active'; end if;
      if party.status in ('friends','waiting','offered','active') and party.id<>p_id then raise exception 'mentoring_already_waiting'; end if;
      if exists(select 1 from quantum_private.mentoring_waiters where user_id=actor and status in ('offered','active') and expires_at>ts) then raise exception 'mentoring_legacy_active'; end if;
      select array_agg(user_id) into people from quantum_private.group_mentoring_party_members where party_id=p_id;
      perform quantum_private.group_mentoring_lock_pairs(people);
      if not quantum_private.is_active_accepted_friend_pair(actor,other_party.owner_id)
        or not quantum_private.mentoring_member_eligible(actor,other_party.school_key,other_party.department_key)
        or not quantum_private.group_mentoring_clear(array[p_id]) then raise exception 'mentoring_friend_unavailable'; end if;
      update quantum_private.group_mentoring_party_members set accepted=true,active=true where party_id=p_id and user_id=actor;
      if not exists(select 1 from quantum_private.group_mentoring_party_members where party_id=p_id and not accepted) then
        update quantum_private.group_mentoring_parties set status='waiting' where id=p_id;
      end if;
      update quantum_private.mentoring_waiters set status='cancelled' where user_id=actor and status='waiting';
    else
      if other_party.status not in ('friends','waiting') then raise exception 'mentoring_not_active'; end if;
      update quantum_private.group_mentoring_parties set status='cancelled' where id=p_id;
      update quantum_private.group_mentoring_party_members set active=false where party_id=p_id;
    end if;
  elsif p_action='cancel' then
    if party.session_id is not null and party.status in ('offered','active') then
      update quantum_private.group_mentoring_sessions set status='ended' where id=party.session_id;
      update quantum_private.group_mentoring_parties set status='ended' where session_id=party.session_id;
    end if;
    update quantum_private.group_mentoring_parties set status='cancelled' where id=party.id;
  elsif p_action not in ('status','leave_legacy') then
    s_id:=(p_args->>'session_id')::uuid;
    select * into own_member from quantum_private.group_mentoring_members where session_id=s_id and user_id=actor;
    if not found then raise exception 'mentoring_forbidden'; end if;
    select * into room from quantum_private.group_mentoring_sessions where id=s_id;
    select array_agg(user_id) into people from quantum_private.group_mentoring_members where session_id=s_id;
    perform quantum_private.group_mentoring_lock_pairs(people);
    if p_action<>'report' and room.status not in ('offered','active') then raise exception 'mentoring_not_active'; end if;
    if p_action<>'report' and exists(select 1 from unnest(people) a(u) cross join unnest(people) b(u) where a.u<b.u and quantum_private.group_mentoring_pair_excluded(a.u,b.u)) then raise exception 'mentoring_not_active'; end if;
    if p_action='accept' then
      update quantum_private.group_mentoring_members set accepted=true where id=own_member.id;
      if room.status='offered' and (select count(*) from quantum_private.group_mentoring_members where session_id=s_id and accepted)=room.side_size*2 then
        update quantum_private.group_mentoring_sessions set status='active',expires_at=ts+interval '14 days' where id=s_id;
        update quantum_private.group_mentoring_parties set status='active',expires_at=ts+interval '14 days' where session_id=s_id;
      end if;
    elsif p_action in ('end','decline','report') then
      if p_action='report' then
        body:=btrim(p_args->>'reason');
        select user_id into target from quantum_private.group_mentoring_members where id=(p_args->>'member_id')::uuid and session_id=s_id and user_id<>actor;
        if target is null or (select count(*) from quantum_private.group_mentoring_members where session_id=s_id and accepted)<>room.side_size*2 then raise exception 'mentoring_forbidden'; end if;
        if jsonb_typeof(p_args->'reason') is distinct from 'string' or body is null or char_length(body) not between 1 and 2000 then raise exception 'mentoring_invalid'; end if;
        insert into quantum_private.group_mentoring_reports(session_id,reporter_id,reported_id,reason) values(s_id,actor,target,body) on conflict(session_id,reporter_id,reported_id) do nothing;
      end if;
      update quantum_private.group_mentoring_sessions set status='ended' where id=s_id;
      update quantum_private.group_mentoring_parties set status='ended' where session_id=s_id;
    elsif p_action='message' then
      if room.status<>'active' then raise exception 'mentoring_not_active'; end if;
      body:=btrim(p_args->>'text'); client:=(p_args->>'client_id')::uuid;
      if jsonb_typeof(p_args->'text') is distinct from 'string' or body is null or char_length(body) not between 1 and 1000 or client is null then raise exception 'mentoring_invalid'; end if;
      if exists(select 1 from quantum_private.group_mentoring_messages m where m.session_id=s_id and m.author_id=actor and m.client_id=client and m.body<>btrim(p_args->>'text')) then raise exception 'mentoring_conflict'; end if;
      if not exists(select 1 from quantum_private.group_mentoring_messages where session_id=s_id and author_id=actor and client_id=client) then
        if (select count(*) from quantum_private.group_mentoring_messages where author_id=actor and created_at>ts-interval '1 minute')>=30 then raise exception 'mentoring_rate_limited'; end if;
        insert into quantum_private.group_mentoring_messages(session_id,author_id,client_id,body) values(s_id,actor,client,body);
      end if;
    elsif p_action='plan' then
      if room.status<>'active' then raise exception 'mentoring_not_active'; end if;
      body:=btrim(p_args->>'place'); meeting_time:=(p_args->>'starts_at')::timestamptz;
      if jsonb_typeof(p_args->'place') is distinct from 'string' or jsonb_typeof(p_args->'starts_at') is distinct from 'string'
        or jsonb_typeof(p_args->'revision') is distinct from 'number' or body is null or char_length(body) not between 1 and 160 or meeting_time is null or meeting_time<=ts or meeting_time>=room.expires_at then raise exception 'mentoring_invalid'; end if;
      if (p_args->>'revision')::integer is distinct from room.plan_revision then raise exception 'mentoring_conflict'; end if;
      update quantum_private.group_mentoring_sessions set meeting_at=meeting_time,meeting_place=body,plan_revision=plan_revision+1 where id=s_id;
    end if;
  end if;

  update quantum_private.group_mentoring_party_members m set active=false from quantum_private.group_mentoring_parties p
    where m.party_id=p.id and p.status in ('ended','expired','cancelled') and m.active;
  select p.* into party from quantum_private.group_mentoring_parties p join quantum_private.group_mentoring_party_members m on m.party_id=p.id
    where m.user_id=actor and m.accepted order by m.active desc,p.created_at desc,p.id desc limit 1;
  if party.status='waiting' then
    -- Search bounded atomic parties, anchored to this opted-in participant.
    -- Both roles must reach the exact target. There is no 1:1 fallback.
    with recursive candidates as (
      select row_number() over(order by p.created_at,p.id)::integer idx,p.id,p.role,p.amount
      -- Preserve each role/party-size combination within a 24-party ceiling:
      -- a long queue of one role or size must not hide an exact composition.
      -- Exclude parties blocked with this anchor before applying the cap.
      from (select ranked.* from (
        select q.*,members.amount,row_number() over(partition by q.role,members.amount order by q.created_at,q.id) role_rank
        from quantum_private.group_mentoring_parties q
          cross join lateral (select count(*)::integer amount from quantum_private.group_mentoring_party_members m where m.party_id=q.id and m.accepted) members
        where q.status='waiting' and q.id<>party.id
          and q.school_key=party.school_key and q.department_key=party.department_key and q.side_size=party.side_size
          and members.amount between 1 and party.side_size
          and quantum_private.group_mentoring_clear(array[party.id,q.id])
        ) ranked where ranked.role_rank<=4) p
    ), choices(ids,last_idx,mentors,mentees) as (
      select array[party.id],0,case when party.role='mentor' then (select count(*)::integer from quantum_private.group_mentoring_party_members where party_id=party.id) else 0 end,
        case when party.role='mentee' then (select count(*)::integer from quantum_private.group_mentoring_party_members where party_id=party.id) else 0 end
      union all
      select c.ids||p.id,p.idx,c.mentors+case when p.role='mentor' then p.amount else 0 end,c.mentees+case when p.role='mentee' then p.amount else 0 end
      from choices c join candidates p on p.idx>c.last_idx
      where c.mentors+case when p.role='mentor' then p.amount else 0 end<=party.side_size
        and c.mentees+case when p.role='mentee' then p.amount else 0 end<=party.side_size
        and quantum_private.group_mentoring_clear(c.ids||p.id)
    ) select ids into chosen from choices where mentors=party.side_size and mentees=party.side_size limit 1;
    if chosen is not null then
      select array_agg(user_id) into people from quantum_private.group_mentoring_party_members where party_id=any(chosen);
      perform quantum_private.group_mentoring_lock_pairs(people);
      if quantum_private.group_mentoring_clear(chosen) and not exists(select 1 from unnest(people) u where not quantum_private.mentoring_member_eligible(u,party.school_key,party.department_key)) then
        insert into quantum_private.group_mentoring_sessions(side_size,school_key,department_key,status,expires_at)
          values(party.side_size,party.school_key,party.department_key,'offered',ts+interval '2 minutes') returning id into s_id;
        insert into quantum_private.group_mentoring_members(session_id,party_id,user_id,role,alias)
          select s_id,p.id,m.user_id,p.role,case when p.role='mentor' then '멘토 ' else '멘티 ' end||row_number() over(partition by p.role order by p.created_at,p.id,m.user_id)::text
          from quantum_private.group_mentoring_parties p join quantum_private.group_mentoring_party_members m on m.party_id=p.id where p.id=any(chosen) and m.accepted;
        update quantum_private.group_mentoring_parties set status='offered',session_id=s_id,expires_at=ts+interval '2 minutes' where id=any(chosen);
      end if;
    end if;
  end if;

  select p.* into party from quantum_private.group_mentoring_parties p join quantum_private.group_mentoring_party_members m on m.party_id=p.id
    where m.user_id=actor and m.accepted order by m.active desc,p.created_at desc,p.id desc limit 1;
  phase:=case when party.id is null or party.status='cancelled' then 'idle' else party.status end;
  select count(*)::integer,count(*) filter(where accepted)::integer into party_count,party_accepted from quantum_private.group_mentoring_party_members where party_id=party.id;
  room:=null; own_member:=null;
  if party.session_id is not null then
    select * into room from quantum_private.group_mentoring_sessions where id=party.session_id;
    select array_agg(user_id) into people from quantum_private.group_mentoring_members where session_id=room.id;
    -- Status reads use the same pair-lock boundary as mutations. A block may
    -- have committed since the first cleanup pass; never disclose a stale chat.
    perform quantum_private.group_mentoring_lock_pairs(people);
    if room.status in ('offered','active') and (
      cardinality(people) is distinct from room.side_size*2
      or exists(select 1 from unnest(people) u where not quantum_private.mentoring_member_eligible(u,room.school_key,room.department_key))
      or exists(select 1 from unnest(people) a(u) cross join unnest(people) b(u) where a.u<b.u and quantum_private.group_mentoring_pair_excluded(a.u,b.u))
    ) then
      update quantum_private.group_mentoring_sessions set status='ended' where id=room.id;
      update quantum_private.group_mentoring_parties set status='ended' where session_id=room.id;
      update quantum_private.group_mentoring_party_members m set active=false from quantum_private.group_mentoring_parties p where m.party_id=p.id and p.session_id=room.id;
      room.status:='ended'; phase:='ended';
    end if;
    select * into own_member from quantum_private.group_mentoring_members where session_id=room.id and user_id=actor;
    select count(*)::integer,count(*) filter(where accepted)::integer into member_count,accepted_count from quantum_private.group_mentoring_members where session_id=room.id;
  end if;
  if phase='active' then
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'label',m.alias,'mine',m.user_id=actor) order by m.role,m.alias),'[]') into members_json from quantum_private.group_mentoring_members m where m.session_id=room.id;
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'mine',m.author_id=actor,'alias',a.alias,'text',m.body,'created_at',m.created_at) order by m.created_at,m.id),'[]') into messages_json
      from (select * from quantum_private.group_mentoring_messages where session_id=room.id order by created_at desc,id desc limit 100) m
      join quantum_private.group_mentoring_members a on a.session_id=m.session_id and a.user_id=m.author_id;
    if room.meeting_at is not null then meeting_json:=jsonb_build_object('starts_at',room.meeting_at,'place',room.meeting_place,'revision',room.plan_revision); end if;
  end if;
  -- Retain only previously disclosed room aliases for a participant to report
  -- after leaving. Closed chats and actual account identifiers stay private.
  if phase in ('active','ended','expired') and accepted_count=room.side_size*2 then
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'label',m.alias) order by m.alias),'[]') into targets_json
      from quantum_private.group_mentoring_members m where m.session_id=room.id and m.user_id<>actor;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('party_id',q.id,'inviter_label',q.label,'role',q.role,'side_size',q.side_size,'expires_at',q.expires_at)),'[]') into invitations_json from (
    select p.*,coalesce(nullif(f.display_name,''),'친구') label from quantum_private.group_mentoring_parties p
      join quantum_private.group_mentoring_party_members m on m.party_id=p.id
      join public.get_friend_summaries() f on f.user_id=p.owner_id
      where m.user_id=actor and not m.accepted and p.status='friends' and p.expires_at>ts
        and quantum_private.is_active_accepted_friend_pair(actor,p.owner_id)
      order by p.created_at desc limit 20) q;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',f.user_id,'label',f.label)),'[]') into friends_json from (
    select f.user_id,coalesce(nullif(f.display_name,''),'친구') label from public.get_friend_summaries() f
      where quantum_private.mentoring_member_eligible(f.user_id,school,department) and not quantum_private.group_mentoring_pair_excluded(actor,f.user_id)
      order by f.display_name,f.user_id limit 100) f;
  return jsonb_build_object('phase',phase,'role',party.role,'side_size',party.side_size,'party_id',party.id,'session_id',party.session_id,
    'server_now',clock_timestamp(),'expires_at',case when phase in ('friends','waiting','offered','active') then party.expires_at else null end,
    'my_accepted',coalesce(own_member.accepted,false),'party_accepted',party_accepted,'party_total',party_count,'accepted_count',accepted_count,'member_count',member_count,
    'members',members_json,'messages',messages_json,'friends',friends_json,'invitations',invitations_json,'meeting',meeting_json,'report_targets',targets_json);
end $$;

create function public.mentoring_group_action(p_action text,p_args jsonb default '{}') returns jsonb
language sql volatile security definer set search_path='' as $$ select quantum_private.group_mentoring_action(p_action,p_args) $$;
revoke all on function quantum_private.group_mentoring_pair_excluded(uuid,uuid),quantum_private.group_mentoring_clear(uuid[]),quantum_private.group_mentoring_lock_pairs(uuid[]),quantum_private.group_mentoring_action(text,jsonb),public.mentoring_group_action(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mentoring_group_action(text,jsonb) to authenticated;
commit;
