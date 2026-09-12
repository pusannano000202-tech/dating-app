-- CLI-generated migration name; local verification only, not remotely applied.
begin;

create table quantum_private.mentoring_sessions (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.users(id) on delete cascade,
  mentee_id uuid not null references public.users(id) on delete cascade,
  school_key text not null, department_key text not null,
  topic text not null check(topic in ('courses','career','campus')),
  status text not null default 'offered' check(status in ('offered','active','ended','expired')),
  mentor_accepted boolean not null default false, mentee_accepted boolean not null default false,
  mentor_alias text not null, mentee_alias text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null, ended_at timestamptz,
  check(mentor_id<>mentee_id)
);
create table quantum_private.mentoring_waiters (
  user_id uuid primary key references public.users(id) on delete cascade,
  role text not null check(role in ('mentor','mentee')),
  topic text not null check(topic in ('courses','career','campus')),
  school_key text not null, department_key text not null,
  status text not null check(status in ('waiting','offered','active','ended','expired','cancelled')),
  session_id uuid references quantum_private.mentoring_sessions(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
  rate_window timestamptz not null default clock_timestamp(), join_count integer not null default 1
);
create index mentoring_waiting_pool on quantum_private.mentoring_waiters(school_key,department_key,topic,role,created_at) where status='waiting';
create index mentoring_session_expiry on quantum_private.mentoring_sessions(expires_at) where status in ('offered','active');
create table quantum_private.mentoring_messages (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references quantum_private.mentoring_sessions(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  client_id uuid not null, body text not null check(char_length(body) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp(), unique(session_id,author_id,client_id)
);
create index mentoring_message_history on quantum_private.mentoring_messages(session_id,created_at,id);
create table quantum_private.mentoring_reports (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references quantum_private.mentoring_sessions(id) on delete cascade,
  reporter_id uuid not null references public.users(id) on delete cascade,
  reported_id uuid not null references public.users(id) on delete cascade,
  reason text not null check(char_length(reason) between 1 and 2000), created_at timestamptz not null default clock_timestamp(),
  unique(session_id,reporter_id), check(reporter_id<>reported_id)
);
alter table quantum_private.mentoring_waiters enable row level security;
alter table quantum_private.mentoring_sessions enable row level security;
alter table quantum_private.mentoring_messages enable row level security;
alter table quantum_private.mentoring_reports enable row level security;
revoke all on quantum_private.mentoring_waiters,quantum_private.mentoring_sessions,quantum_private.mentoring_messages,quantum_private.mentoring_reports from public,anon,authenticated,service_role;

-- Private predicate: authoritative current identity, never query-supplied department.
create function quantum_private.mentoring_member_eligible(p_user uuid,p_school text,p_department text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  perform quantum_private.assert_activity_room_access(p_user);
  return exists(select 1 from quantum_private.get_member_department_identity(p_user) i where i.school_scope_key=p_school and i.department_key=p_department);
exception when others then return false;
end
$$;

create function quantum_private.mentoring_action(p_action text,p_args jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_now timestamptz:=clock_timestamp();
  v_school text; v_department text; v_role text; v_topic text;
  v_own quantum_private.mentoring_waiters%rowtype;
  v_other quantum_private.mentoring_waiters%rowtype;
  v_session quantum_private.mentoring_sessions%rowtype;
  v_session_id uuid; v_peer uuid; v_text text; v_client uuid;
  v_phase text; v_alias text; v_peer_alias text; v_messages jsonb:='[]';
  v_allowed text[]; v_mentor_count integer; v_mentee_count integer;
begin
  perform quantum_private.assert_activity_room_access(v_actor);
  select i.school_scope_key,i.department_key into v_school,v_department from quantum_private.get_member_department_identity(v_actor) i;
  if v_school is null or v_department is null then raise exception 'department_identity_required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('status','join','cancel','accept','decline','message','end','report') or p_args is null or jsonb_typeof(p_args)<>'object' then raise exception 'mentoring_invalid'; end if;
  v_allowed:=case p_action when 'join' then array['role','topic'] when 'message' then array['session_id','text','client_id'] when 'report' then array['session_id','reason'] when 'accept' then array['session_id'] when 'decline' then array['session_id'] when 'end' then array['session_id'] else array[]::text[] end;
  if exists(select 1 from jsonb_object_keys(p_args) k where not(k=any(v_allowed))) then raise exception 'mentoring_invalid'; end if;

  -- Low-volume MVP: one transaction-scoped queue lock gives every command the same
  -- lock order and prevents double offers, cross-role races and cancelled matches.
  -- It does not span network calls. Partition only after measuring real throughput.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:mentoring:v1',0));
  v_now:=clock_timestamp();
  update quantum_private.mentoring_sessions set status='expired',ended_at=v_now where status in ('offered','active') and expires_at<=v_now;
  update quantum_private.mentoring_waiters w set status=s.status,expires_at=s.expires_at from quantum_private.mentoring_sessions s where w.session_id=s.id and w.status in ('offered','active') and s.status in ('expired','ended');
  update quantum_private.mentoring_waiters set status='expired' where status='waiting' and expires_at<=v_now;
  select * into v_own from quantum_private.mentoring_waiters where user_id=v_actor;
  if v_own.status in ('waiting','offered','active') and (v_own.school_key<>v_school or v_own.department_key<>v_department) then
    update quantum_private.mentoring_sessions set status='ended',ended_at=v_now where id=v_own.session_id and status in ('offered','active');
    update quantum_private.mentoring_waiters set status='ended' where user_id=v_actor or (v_own.session_id is not null and session_id=v_own.session_id);
    select * into v_own from quantum_private.mentoring_waiters where user_id=v_actor;
  end if;
  if v_own.session_id is not null then
    select * into v_session from quantum_private.mentoring_sessions where id=v_own.session_id;
    if v_session.status in ('offered','active') and (
      not quantum_private.mentoring_member_eligible(v_session.mentor_id,v_session.school_key,v_session.department_key)
      or not quantum_private.mentoring_member_eligible(v_session.mentee_id,v_session.school_key,v_session.department_key)
      or quantum_private.tonight_invite_pair_is_blocked(v_session.mentor_id,v_session.mentee_id)
      or exists(select 1 from quantum_private.mentoring_reports r where (r.reporter_id=v_session.mentor_id and r.reported_id=v_session.mentee_id) or (r.reporter_id=v_session.mentee_id and r.reported_id=v_session.mentor_id))
    ) then
      update quantum_private.mentoring_sessions set status='ended',ended_at=v_now where id=v_session.id;
      update quantum_private.mentoring_waiters set status='ended' where session_id=v_session.id;
    end if;
  end if;

  if p_action='join' then
    v_role:=p_args->>'role'; v_topic:=p_args->>'topic';
    if v_role is null or v_role not in ('mentor','mentee') or v_topic is null or v_topic not in ('courses','career','campus') then raise exception 'mentoring_invalid'; end if;
    select * into v_own from quantum_private.mentoring_waiters where user_id=v_actor;
    if v_own.status in ('waiting','offered','active') then
      if v_own.role<>v_role or v_own.topic<>v_topic then raise exception 'mentoring_already_waiting'; end if;
    else
      if v_own.rate_window>v_now-interval '1 minute' and v_own.join_count>=8 then raise exception 'mentoring_rate_limited'; end if;
      insert into quantum_private.mentoring_waiters(user_id,role,topic,school_key,department_key,status,expires_at)
      values(v_actor,v_role,v_topic,v_school,v_department,'waiting',v_now+interval '30 minutes')
      on conflict(user_id) do update set role=excluded.role,topic=excluded.topic,school_key=excluded.school_key,department_key=excluded.department_key,status='waiting',session_id=null,created_at=v_now,expires_at=excluded.expires_at,
        join_count=case when mentoring_waiters.rate_window>v_now-interval '1 minute' then mentoring_waiters.join_count+1 else 1 end,
        rate_window=case when mentoring_waiters.rate_window>v_now-interval '1 minute' then mentoring_waiters.rate_window else v_now end;
      select * into v_other from quantum_private.mentoring_waiters w
      where w.status='waiting' and w.expires_at>v_now and w.user_id<>v_actor and w.role<>v_role and w.topic=v_topic and w.school_key=v_school and w.department_key=v_department
        and quantum_private.mentoring_member_eligible(w.user_id,v_school,v_department)
        and not quantum_private.tonight_invite_pair_is_blocked(v_actor,w.user_id)
        and not exists(select 1 from quantum_private.mentoring_reports r where (r.reporter_id=v_actor and r.reported_id=w.user_id) or (r.reporter_id=w.user_id and r.reported_id=v_actor))
      order by w.created_at,w.user_id limit 1;
      if v_other.user_id is not null then
        insert into quantum_private.mentoring_sessions(mentor_id,mentee_id,school_key,department_key,topic,mentor_alias,mentee_alias,expires_at)
        values(case when v_role='mentor' then v_actor else v_other.user_id end,case when v_role='mentee' then v_actor else v_other.user_id end,v_school,v_department,v_topic,
          coalesce(quantum_private.get_or_create_daily_identity(case when v_role='mentor' then v_actor else v_other.user_id end,v_now)->>'display_name','별빛'),
          coalesce(quantum_private.get_or_create_daily_identity(case when v_role='mentee' then v_actor else v_other.user_id end,v_now)->>'display_name','새봄'),v_now+interval '2 minutes') returning id into v_session_id;
        update quantum_private.mentoring_waiters set status='offered',session_id=v_session_id,expires_at=v_now+interval '2 minutes' where user_id in (v_actor,v_other.user_id);
      end if;
    end if;
  elsif p_action='cancel' then
    update quantum_private.mentoring_sessions set status='ended',ended_at=v_now where id=v_own.session_id and status in ('offered','active');
    update quantum_private.mentoring_waiters set status='ended' where session_id=v_own.session_id and status in ('offered','active');
    update quantum_private.mentoring_waiters set status='cancelled',session_id=null where user_id=v_actor;
  elsif p_action in ('accept','decline','message','end','report') then
    begin v_session_id:=(p_args->>'session_id')::uuid; exception when others then raise exception 'mentoring_invalid'; end;
    if v_session_id is null or v_own.session_id is distinct from v_session_id then raise exception 'mentoring_forbidden' using errcode='42501'; end if;
    select * into v_session from quantum_private.mentoring_sessions where id=v_session_id;
    if v_actor not in (v_session.mentor_id,v_session.mentee_id) then raise exception 'mentoring_forbidden' using errcode='42501'; end if;
    v_peer:=case when v_actor=v_session.mentor_id then v_session.mentee_id else v_session.mentor_id end;
    if p_action='accept' then
      if v_session.status not in ('offered','active') then raise exception 'mentoring_not_active'; end if;
      update quantum_private.mentoring_sessions set mentor_accepted=mentor_accepted or v_actor=mentor_id,mentee_accepted=mentee_accepted or v_actor=mentee_id where id=v_session_id;
      update quantum_private.mentoring_sessions set status='active',expires_at=v_now+interval '2 hours' where id=v_session_id and status='offered' and mentor_accepted and mentee_accepted;
      update quantum_private.mentoring_waiters w set status=s.status,expires_at=s.expires_at from quantum_private.mentoring_sessions s where w.session_id=s.id and s.id=v_session_id;
    elsif p_action='message' then
      if v_session.status<>'active' then raise exception 'mentoring_not_active'; end if;
      v_text:=btrim(p_args->>'text');
      if jsonb_typeof(p_args->'text')<>'string' or v_text is null or char_length(v_text) not between 1 and 1000 then raise exception 'mentoring_invalid'; end if;
      begin v_client:=(p_args->>'client_id')::uuid; exception when others then raise exception 'mentoring_invalid'; end;
      if v_client is null then raise exception 'mentoring_invalid'; end if;
      if not exists(select 1 from quantum_private.mentoring_messages where session_id=v_session_id and author_id=v_actor and client_id=v_client) then
        if (select count(*) from quantum_private.mentoring_messages where author_id=v_actor and created_at>v_now-interval '1 minute')>=30 then raise exception 'mentoring_rate_limited'; end if;
        insert into quantum_private.mentoring_messages(session_id,author_id,client_id,body) values(v_session_id,v_actor,v_client,v_text);
      end if;
    elsif p_action in ('end','decline','report') then
      if p_action='report' then
        v_text:=btrim(p_args->>'reason');
        if jsonb_typeof(p_args->'reason')<>'string' or v_text is null or char_length(v_text) not between 1 and 2000 then raise exception 'mentoring_invalid'; end if;
        insert into quantum_private.mentoring_reports(session_id,reporter_id,reported_id,reason) values(v_session_id,v_actor,v_peer,v_text) on conflict(session_id,reporter_id) do nothing;
      end if;
      update quantum_private.mentoring_sessions set status='ended',ended_at=coalesce(ended_at,v_now) where id=v_session_id;
      update quantum_private.mentoring_waiters set status='ended' where session_id=v_session_id;
    end if;
  end if;

  select * into v_own from quantum_private.mentoring_waiters where user_id=v_actor;
  v_phase:=case when v_own.user_id is null or v_own.status='cancelled' then 'idle' else v_own.status end;
  if v_own.session_id is not null then select * into v_session from quantum_private.mentoring_sessions where id=v_own.session_id; else v_session:=null; end if;
  if v_phase='active' then
    v_alias:=case when v_actor=v_session.mentor_id then v_session.mentor_alias else v_session.mentee_alias end;
    v_peer_alias:=case when v_actor=v_session.mentor_id then v_session.mentee_alias else v_session.mentor_alias end;
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'mine',m.author_id=v_actor,'text',m.body,'created_at',m.created_at) order by m.created_at,m.id),'[]') into v_messages
    from (select * from quantum_private.mentoring_messages where session_id=v_own.session_id order by created_at desc,id desc limit 100) m;
  end if;
  select count(*) filter(where w.role='mentor'),count(*) filter(where w.role='mentee') into v_mentor_count,v_mentee_count from quantum_private.mentoring_waiters w
  where w.status='waiting' and w.school_key=v_school and w.department_key=v_department and w.expires_at>v_now
    and (v_phase='idle' or w.topic=v_own.topic) and quantum_private.mentoring_member_eligible(w.user_id,v_school,v_department)
    and not quantum_private.tonight_invite_pair_is_blocked(v_actor,w.user_id);
  return jsonb_build_object('phase',v_phase,'role',v_own.role,'topic',v_own.topic,'session_id',v_own.session_id,
    'expires_at',case when v_phase in ('waiting','offered','active') then v_own.expires_at else null end,'server_now',v_now,
    'my_accepted',coalesce(case when v_actor=v_session.mentor_id then v_session.mentor_accepted else v_session.mentee_accepted end,false),
    'alias',v_alias,'peer_alias',v_peer_alias,'messages',v_messages,'mentor_waiting',v_mentor_count,'mentee_waiting',v_mentee_count);
end
$$;

-- Thin exposed invoker. Internal tables remain denied; the sole granted private
-- entrypoint independently validates auth, current department and session owner.
create function public.mentoring_action(p_action text,p_args jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$ select quantum_private.mentoring_action(p_action,p_args) $$;
revoke all on function quantum_private.mentoring_member_eligible(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function quantum_private.mentoring_action(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.mentoring_action(text,jsonb) from public,anon,authenticated,service_role;
grant usage on schema quantum_private to authenticated;
grant execute on function quantum_private.mentoring_action(text,jsonb),public.mentoring_action(text,jsonb) to authenticated;
commit;
