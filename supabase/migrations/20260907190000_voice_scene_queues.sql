-- Additive voice-scene queues. Applying this migration is a separate release step.
-- Existing community_voice_command and LiveKit token/provider contracts remain intact.

alter table quantum_private.voice_members
  add column advice_role text
    check (advice_role is null or advice_role in ('talker','listener')),
  add column advice_topic text
    check (advice_topic is null or advice_topic in ('general','romance','career')),
  add constraint voice_advice_fields_together
    check ((advice_role is null)=(advice_topic is null));

create table quantum_private.voice_advice_queue (
  user_id uuid primary key references public.users(id) on delete cascade,
  school_scope text not null,
  role text not null check (role in ('talker','listener')),
  advice_topic text not null check (advice_topic in ('general','romance','career')),
  search_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table quantum_private.voice_advice_searches (
  user_id uuid primary key references public.users(id) on delete cascade,
  search_id uuid not null,
  role text not null check (role in ('talker','listener')),
  advice_topic text not null check (advice_topic in ('general','romance','career'))
);

create table quantum_private.voice_cheer_teams (
  id text primary key check (id ~ '^(lck|kbo)-[a-z0-9]+(?:-[a-z0-9]+)*$'),
  league text not null check (league in ('lck','kbo')),
  display_name text not null check (length(display_name) between 1 and 80)
);

insert into quantum_private.voice_cheer_teams(id,league,display_name) values
  ('lck-hanwha-life-esports','lck','Hanwha Life Esports'),
  ('lck-t1','lck','T1'),
  ('lck-bnk-fearx','lck','BNK FEARX'),
  ('lck-dn-soopers','lck','DN SOOPers'),
  ('lck-hanjin-brion','lck','HANJIN BRION'),
  ('lck-gen-g-esports','lck','Gen.G Esports'),
  ('lck-dplus-kia','lck','Dplus KIA'),
  ('lck-kt-rolster','lck','kt Rolster'),
  ('lck-nongshim-red-force','lck','NONGSHIM RED FORCE'),
  ('lck-kiwoom-drx','lck','KIWOOM DRX'),
  ('kbo-lg-twins','kbo','LG 트윈스'),
  ('kbo-hanwha-eagles','kbo','한화 이글스'),
  ('kbo-ssg-landers','kbo','SSG 랜더스'),
  ('kbo-samsung-lions','kbo','삼성 라이온즈'),
  ('kbo-nc-dinos','kbo','NC 다이노스'),
  ('kbo-kt-wiz','kbo','KT 위즈'),
  ('kbo-lotte-giants','kbo','롯데 자이언츠'),
  ('kbo-kia-tigers','kbo','KIA 타이거즈'),
  ('kbo-doosan-bears','kbo','두산 베어스'),
  ('kbo-kiwoom-heroes','kbo','키움 히어로즈');

create table quantum_private.voice_cheer_cells (
  id uuid primary key default gen_random_uuid(),
  school_scope text not null,
  team_id text not null references quantum_private.voice_cheer_teams(id),
  cohort_no integer not null check (cohort_no > 0),
  room_id uuid not null unique references quantum_private.voice_rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (school_scope,team_id,cohort_no)
);

alter table quantum_private.voice_advice_queue enable row level security;
alter table quantum_private.voice_advice_searches enable row level security;
alter table quantum_private.voice_cheer_teams enable row level security;
alter table quantum_private.voice_cheer_cells enable row level security;

-- The legacy RPC and scene RPC share one arbitration lock. These triggers are a
-- second line of defense for future callers that forget one side of the queue.
create function quantum_private.voice_scene_queue_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='voice_queue' and exists(
    select 1 from quantum_private.voice_advice_queue queue
    where queue.user_id=new.user_id and queue.expires_at>now()
  ) then
    raise exception 'already_in_voice';
  end if;
  if tg_table_name='voice_advice_queue' and (
    exists(select 1 from quantum_private.voice_queue queue where queue.user_id=new.user_id and queue.expires_at>now())
    or exists(select 1 from quantum_private.voice_members member where member.user_id=new.user_id and member.active)
  ) then
    raise exception 'already_in_voice';
  end if;
  return new;
end;
$$;

create trigger voice_queue_scene_exclusivity
before insert or update on quantum_private.voice_queue
for each row execute function quantum_private.voice_scene_queue_guard();
create trigger voice_advice_queue_scene_exclusivity
before insert or update on quantum_private.voice_advice_queue
for each row execute function quantum_private.voice_scene_queue_guard();

create function quantum_private.voice_scene_member_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.active and (tg_op='INSERT' or not old.active) and exists(
    select 1 from quantum_private.voice_sessions session
    join quantum_private.voice_cheer_cells cell on cell.room_id=session.room_id
    where session.id=new.session_id
  ) and current_setting('app.voice_cheer_admission',true) is distinct from 'on' then
    raise exception 'forbidden';
  end if;
  if new.active and (tg_op='INSERT' or not old.active) and exists(
    select 1 from quantum_private.voice_advice_queue queue
    where queue.user_id=new.user_id and queue.expires_at>now()
  ) then
    raise exception 'already_in_voice';
  end if;
  return new;
end;
$$;

create trigger voice_member_scene_exclusivity
before insert or update on quantum_private.voice_members
for each row execute function quantum_private.voice_scene_member_guard();

-- Keep the existing public command contract, but prevent team rooms from
-- leaking into the generic room list or bypassing server-owned team admission.
alter function public.community_voice_command(text,jsonb)
  rename to community_voice_command_before_scenes;
revoke all on function public.community_voice_command_before_scenes(text,jsonb)
  from public,anon,authenticated,service_role;

create function public.community_voice_command(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_operation='room_command' and p_payload->>'action'='join' and exists(
    select 1 from quantum_private.voice_cheer_cells cell
    where cell.room_id=(p_payload->>'roomId')::uuid
  ) then raise exception 'forbidden'; end if;
  result:=public.community_voice_command_before_scenes(p_operation,p_payload);
  if not quantum_private.voice_eligible(auth.uid()) then
    if p_operation='queue_command' and p_payload->>'action'='leave' then
      return jsonb_build_object('queued',false,'sessionId',null);
    elsif p_operation='session_command' and p_payload->>'action'='leave' then
      return jsonb_build_object('session',jsonb_build_object('state','ended'));
    end if;
  end if;
  if p_operation='list_rooms' then
    select jsonb_set(
      result,
      '{rooms}',
      coalesce(jsonb_agg(listed.entry),'[]'::jsonb)
    ) into result
    from jsonb_array_elements(coalesce(result->'rooms','[]'::jsonb)) listed(entry)
    where not exists(
      select 1 from quantum_private.voice_cheer_cells cell
      where cell.room_id=(listed.entry->>'id')::uuid
    );
  end if;
  return result;
end;
$$;

-- Run the established cleanup first, then retain only the newest empty active
-- allocation cell for each school/team. History rows remain; only sessions end.
alter function public.sweep_voice_sessions()
  rename to sweep_voice_sessions_before_scenes;
revoke all on function public.sweep_voice_sessions_before_scenes()
  from public,anon,authenticated,service_role;

create function public.sweep_voice_sessions()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; excess record; retired integer:=0;
begin
  result:=public.sweep_voice_sessions_before_scenes();
  for excess in
    select ranked.session_id,ranked.room_id
    from (
      select session.id as session_id,room.id as room_id,
        row_number() over(partition by cell.school_scope,cell.team_id order by cell.created_at desc,cell.id desc) as position
      from quantum_private.voice_cheer_cells cell
      join quantum_private.voice_rooms room on room.id=cell.room_id and room.status='open' and room.ends_at>now()
      join quantum_private.voice_sessions session on session.room_id=room.id and session.state='active'
      where not exists(select 1 from quantum_private.voice_members member where member.session_id=session.id and member.active)
    ) ranked
    where ranked.position>1
  loop
    perform quantum_private.voice_end_session(excess.session_id);
    update quantum_private.voice_rooms set status='ended',revision=revision+1 where id=excess.room_id;
    retired:=retired+1;
  end loop;
  return result||jsonb_build_object('retiredCheerEmptyCells',retired);
end;
$$;

create function quantum_private.voice_advice_status_json(p_user uuid,p_advice_topic text default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'sessionId',(
      select member.session_id
      from quantum_private.voice_members member
      join quantum_private.voice_sessions session on session.id=member.session_id
      join quantum_private.voice_rooms room on room.id=session.room_id
      where member.user_id=p_user and member.active and member.advice_role is not null
        and session.state<>'ended'
        and quantum_private.voice_room_participant_current(room,p_user)
      order by member.joined_at desc limit 1
    ),
    'queued',exists(
      select 1 from quantum_private.voice_advice_queue queue
      where queue.user_id=p_user and queue.expires_at>now() and queue.school_scope=profile.school_scope
    ),
    'role',coalesce(
      (select queue.role from quantum_private.voice_advice_queue queue where queue.user_id=p_user and queue.expires_at>now() and queue.school_scope=profile.school_scope),
      (select search.role from quantum_private.voice_advice_searches search where search.user_id=p_user)
    ),
    'adviceTopic',coalesce(
      (select queue.advice_topic from quantum_private.voice_advice_queue queue where queue.user_id=p_user and queue.expires_at>now() and queue.school_scope=profile.school_scope),
      p_advice_topic,
      (select search.advice_topic from quantum_private.voice_advice_searches search where search.user_id=p_user),
      'general'
    ),
    'waiting',quantum_private.voice_summary(
      'advice:'||profile.school_scope||':'||coalesce(p_advice_topic,(select search.advice_topic from quantum_private.voice_advice_searches search where search.user_id=p_user),'general'),
      'waiting_for_voice',
      array(select queue.user_id from quantum_private.voice_advice_queue queue where queue.expires_at>now() and queue.school_scope=profile.school_scope and queue.advice_topic=coalesce(p_advice_topic,(select search.advice_topic from quantum_private.voice_advice_searches search where search.user_id=p_user),'general') and quantum_private.voice_eligible(queue.user_id) and quantum_private.voice_rules_current(queue.user_id) and exists(select 1 from quantum_private.community_member_profiles current_profile where current_profile.user_id=queue.user_id and current_profile.school_scope=queue.school_scope))
    )||jsonb_build_object(
      'talkers',(select count(*) from quantum_private.voice_advice_queue queue where queue.expires_at>now() and queue.school_scope=profile.school_scope and queue.advice_topic=coalesce(p_advice_topic,(select search.advice_topic from quantum_private.voice_advice_searches search where search.user_id=p_user),'general') and queue.role='talker' and quantum_private.voice_eligible(queue.user_id) and quantum_private.voice_rules_current(queue.user_id) and exists(select 1 from quantum_private.community_member_profiles current_profile where current_profile.user_id=queue.user_id and current_profile.school_scope=queue.school_scope)),
      'listeners',(select count(*) from quantum_private.voice_advice_queue queue where queue.expires_at>now() and queue.school_scope=profile.school_scope and queue.advice_topic=coalesce(p_advice_topic,(select search.advice_topic from quantum_private.voice_advice_searches search where search.user_id=p_user),'general') and queue.role='listener' and quantum_private.voice_eligible(queue.user_id) and quantum_private.voice_rules_current(queue.user_id) and exists(select 1 from quantum_private.community_member_profiles current_profile where current_profile.user_id=queue.user_id and current_profile.school_scope=queue.school_scope))
    )
  )
  from quantum_private.community_member_profiles profile where profile.user_id=p_user;
$$;

create function quantum_private.voice_match_advice(p_user uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  own_queue quantum_private.voice_advice_queue%rowtype;
  peer_queue quantum_private.voice_advice_queue%rowtype;
  room quantum_private.voice_rooms%rowtype;
  session quantum_private.voice_sessions%rowtype;
begin
  select * into own_queue from quantum_private.voice_advice_queue
    where user_id=p_user and expires_at>now() for update;
  if not found then return null; end if;
  if not exists(
    select 1 from quantum_private.community_member_profiles current_profile
    where current_profile.user_id=p_user and current_profile.school_scope=own_queue.school_scope
  ) then raise exception 'minimum_signup_required'; end if;
  if exists(select 1 from quantum_private.voice_media_outbox outbox where outbox.user_id=p_user and outbox.completed_at is null) then return null; end if;

  select * into peer_queue from quantum_private.voice_advice_queue candidate
    where candidate.user_id<>p_user
      and candidate.school_scope=own_queue.school_scope
      and candidate.role<>own_queue.role
      and candidate.advice_topic=own_queue.advice_topic
      and candidate.expires_at>now()
      and quantum_private.voice_eligible(candidate.user_id)
      and quantum_private.voice_rules_current(candidate.user_id)
      and exists(select 1 from quantum_private.community_member_profiles current_profile where current_profile.user_id=candidate.user_id and current_profile.school_scope=candidate.school_scope)
      and not exists(select 1 from quantum_private.voice_members member where member.user_id=candidate.user_id and member.active)
      and not exists(select 1 from quantum_private.voice_media_outbox outbox where outbox.user_id=candidate.user_id and outbox.completed_at is null)
      and not quantum_private.tonight_invite_pair_is_blocked(p_user,candidate.user_id)
      and not exists(
        select 1 from quantum_private.voice_skips skipped
        where skipped.expires_at>now() and (
          (skipped.user_id=p_user and skipped.peer_id=candidate.user_id and skipped.search_id=own_queue.search_id)
          or (skipped.user_id=candidate.user_id and skipped.peer_id=p_user and skipped.search_id=candidate.search_id)
        )
      )
    order by candidate.created_at,candidate.user_id limit 1 for update;

  if not found then return null; end if;
  -- Remove the selected queue rows before membership insertion so the shared
  -- exclusivity trigger can reject every other admission path.
  delete from quantum_private.voice_advice_queue where user_id in (own_queue.user_id,peer_queue.user_id);
  insert into quantum_private.voice_rooms(
    created_by,school_scope,title,description,topic,kind,scope,capacity,starts_at,ends_at,status
  ) values (
    p_user,own_queue.school_scope,
    case own_queue.advice_topic when 'romance' then '둘이 나누는 연애 고민' when 'career' then '둘이 나누는 진로 고민' else '둘이 나누는 고민' end,
    '말하는 사람과 들어주는 사람이 서로 수락한 뒤 연결돼요.','worries','random','school',2,now(),now()+interval '1 hour','open'
  ) returning * into room;
  insert into quantum_private.voice_sessions(room_id,state,expires_at)
    values(room.id,'proposed',now()+interval '45 seconds') returning * into session;
  insert into quantum_private.voice_members(session_id,user_id,mode,advice_role,advice_topic) values
    (session.id,own_queue.user_id,'speak',own_queue.role,own_queue.advice_topic),
    (session.id,peer_queue.user_id,'speak',peer_queue.role,peer_queue.advice_topic);
  update quantum_private.voice_friend_invitations set status='cancelled'
    where status='pending' and expires_at>now()
      and (sender_id in (own_queue.user_id,peer_queue.user_id) or recipient_id in (own_queue.user_id,peer_queue.user_id));
  return session.id;
end;
$$;

create or replace function quantum_private.voice_session_json(p_session uuid,p_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('session',jsonb_build_object('id',s.id,'roomId',r.id,'kind',r.kind,'state',case when m.active then s.state else 'ended' end,'revision',s.revision,'generation',m.generation,'mode',m.mode,'adviceRole',m.advice_role,'adviceTopic',m.advice_topic,'accepted',m.accepted_at is not null,'peerAccepted',not exists(select 1 from quantum_private.voice_members peer where peer.session_id=s.id and peer.active and peer.accepted_at is null),
 'participants',case when m.active then coalesce((select jsonb_agg(jsonb_build_object('identity',v.identity,'displayName',case when r.kind='friend' then coalesce(p.friend_recognition_name,p.display_name) else p.display_name end,'mode',v.mode,'isModerator',r.kind='group' and v.user_id=r.created_by and not exists(select 1 from quantum_private.voice_cheer_cells cheer where cheer.room_id=r.id))) from quantum_private.voice_members v join quantum_private.community_member_profiles p on p.user_id=v.user_id where v.session_id=s.id and v.active and (v.connected or v.disconnected_at>now()-interval '2 minutes') and quantum_private.voice_room_participant_current(r,v.user_id)),'[]'::jsonb) else '[]'::jsonb end), 'room',quantum_private.voice_room_json(r))
 from quantum_private.voice_sessions s join quantum_private.voice_rooms r on r.id=s.room_id join quantum_private.voice_members m on m.session_id=s.id and m.user_id=p_user where s.id=p_session;
$$;

create function public.community_voice_scene_command(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  profile quantum_private.community_member_profiles%rowtype;
  command quantum_private.voice_commands%rowtype;
  key uuid;
  search uuid;
  role_name text;
  advice_topic_name text;
  matched_session_id uuid;
  old_session quantum_private.voice_sessions%rowtype;
  old_room quantum_private.voice_rooms%rowtype;
  old_member quantum_private.voice_members%rowtype;
  old_search quantum_private.voice_advice_searches%rowtype;
  cheer_team quantum_private.voice_cheer_teams%rowtype;
  cheer_cell quantum_private.voice_cheer_cells%rowtype;
  room quantum_private.voice_rooms%rowtype;
  session quantum_private.voice_sessions%rowtype;
  result jsonb;
  member_count integer;
begin
  if actor is null then raise exception 'not_authenticated'; end if;
  select * into profile from quantum_private.community_member_profiles where user_id=actor;
  if profile.user_id is null then raise exception 'minimum_signup_required'; end if;
  if p_operation='advice_status' and not quantum_private.voice_eligible(actor) then raise exception 'minimum_signup_required'; end if;
  if p_operation not in ('advice_status','advice_leave') and not quantum_private.voice_eligible(actor) then raise exception 'minimum_signup_required'; end if;
  if p_operation not in ('advice_status','advice_leave') and not quantum_private.voice_rules_current(actor) then raise exception 'voice_rules_required'; end if;
  if p_operation not in ('advice_status') then
    key:=(p_payload->>'idempotencyKey')::uuid;
    if key is null then raise exception 'invalid_input'; end if;
    perform pg_advisory_xact_lock(hashtextextended('quantum-voice-ledger-v1',0));
    select * into command from quantum_private.voice_commands where user_id=actor and idempotency_key=key;
    if found then
      if command.operation<>p_operation or command.payload<>p_payload then raise exception 'idempotency_conflict'; end if;
      return command.response;
    end if;
    if (select count(*) from quantum_private.voice_commands where user_id=actor and created_at>now()-interval '1 minute')>=30 then raise exception 'rate_limited'; end if;
  end if;

  delete from quantum_private.voice_advice_queue where expires_at<=now();
  if p_operation='advice_status' then
    advice_topic_name:=coalesce(p_payload->>'adviceTopic','general');
    if advice_topic_name not in ('general','romance','career') then raise exception 'invalid_input'; end if;
    return quantum_private.voice_advice_status_json(actor,advice_topic_name);
  elsif p_operation='advice_join' then
    role_name:=p_payload->>'role';
    advice_topic_name:=p_payload->>'adviceTopic';
    search:=(p_payload->>'searchId')::uuid;
    if role_name not in ('talker','listener') or advice_topic_name not in ('general','romance','career') or search is null then raise exception 'invalid_input'; end if;
    if exists(select 1 from quantum_private.voice_members where user_id=actor and active)
      or exists(select 1 from quantum_private.voice_queue where user_id=actor and expires_at>now()) then raise exception 'already_in_voice'; end if;
    if exists(select 1 from quantum_private.voice_media_outbox where user_id=actor and completed_at is null) then raise exception 'media_cleanup_pending'; end if;
    insert into quantum_private.voice_advice_searches(user_id,search_id,role,advice_topic) values(actor,search,role_name,advice_topic_name)
      on conflict(user_id) do update set search_id=excluded.search_id,role=excluded.role,advice_topic=excluded.advice_topic;
    insert into quantum_private.voice_advice_queue(user_id,school_scope,role,advice_topic,search_id,created_at,expires_at)
      values(actor,profile.school_scope,role_name,advice_topic_name,search,now(),now()+interval '5 minutes')
      on conflict(user_id) do update set school_scope=excluded.school_scope,role=excluded.role,advice_topic=excluded.advice_topic,search_id=excluded.search_id,created_at=excluded.created_at,expires_at=excluded.expires_at;
    matched_session_id:=quantum_private.voice_match_advice(actor);
    result:=quantum_private.voice_advice_status_json(actor,advice_topic_name);
  elsif p_operation='advice_leave' then
    search:=(p_payload->>'searchId')::uuid;
    delete from quantum_private.voice_advice_queue where user_id=actor and search_id=search;
    if not found and exists(select 1 from quantum_private.voice_advice_queue where user_id=actor and expires_at>now()) then raise exception 'stale_revision'; end if;
    if quantum_private.voice_eligible(actor) then
      result:=quantum_private.voice_advice_status_json(actor,null);
    else
      result:=jsonb_build_object('queued',false);
    end if;
  elsif p_operation='advice_next' then
    matched_session_id:=(p_payload->>'sessionId')::uuid;
    select * into old_session from quantum_private.voice_sessions where id=matched_session_id for update;
    select * into old_room from quantum_private.voice_rooms where id=old_session.room_id;
    select * into old_member from quantum_private.voice_members member where member.session_id=matched_session_id and member.user_id=actor and member.active;
    select * into old_search from quantum_private.voice_advice_searches where user_id=actor;
    if old_session.id is null or old_room.kind<>'random' or old_room.topic<>'worries' or old_member.advice_role is null or old_search.user_id is null then raise exception 'not_found'; end if;
    insert into quantum_private.voice_skips(user_id,peer_id,search_id,expires_at)
      select actor,member.user_id,old_search.search_id,now()+interval '1 hour'
      from quantum_private.voice_members member where member.session_id=matched_session_id and member.user_id<>actor
      on conflict do nothing;
    perform quantum_private.voice_end_session(matched_session_id);
    insert into quantum_private.voice_advice_queue(user_id,school_scope,role,advice_topic,search_id,created_at,expires_at)
      values(actor,profile.school_scope,old_search.role,old_search.advice_topic,old_search.search_id,now(),now()+interval '5 minutes')
      on conflict(user_id) do update set school_scope=excluded.school_scope,role=excluded.role,advice_topic=excluded.advice_topic,search_id=excluded.search_id,created_at=excluded.created_at,expires_at=excluded.expires_at;
    result:=quantum_private.voice_advice_status_json(actor,old_search.advice_topic);
  elsif p_operation='advice_resume' then
    if exists(select 1 from quantum_private.voice_media_outbox where user_id=actor and completed_at is null) then raise exception 'media_cleanup_pending'; end if;
    if not exists(select 1 from quantum_private.voice_members where user_id=actor and active)
      and exists(select 1 from quantum_private.voice_advice_queue where user_id=actor and expires_at>now()) then
      matched_session_id:=quantum_private.voice_match_advice(actor);
    end if;
    result:=quantum_private.voice_advice_status_json(actor,null);
  elsif p_operation='cheer_join' then
    select * into cheer_team from quantum_private.voice_cheer_teams where id=p_payload->>'teamId';
    if cheer_team.id is null then raise exception 'invalid_input'; end if;
    if exists(select 1 from quantum_private.voice_members where user_id=actor and active)
      or exists(select 1 from quantum_private.voice_queue where user_id=actor and expires_at>now())
      or exists(select 1 from quantum_private.voice_advice_queue where user_id=actor and expires_at>now()) then raise exception 'already_in_voice'; end if;
    if exists(select 1 from quantum_private.voice_media_outbox where user_id=actor and completed_at is null) then raise exception 'media_cleanup_pending'; end if;

    select cell.* into cheer_cell from quantum_private.voice_cheer_cells cell
      join quantum_private.voice_rooms candidate_room on candidate_room.id=cell.room_id
      join quantum_private.voice_sessions candidate_session on candidate_session.room_id=candidate_room.id and candidate_session.state='active'
      where cell.school_scope=profile.school_scope and cell.team_id=cheer_team.id
        and candidate_room.status='open' and candidate_room.ends_at>now()
        and (select count(*) from quantum_private.voice_members member where member.session_id=candidate_session.id and member.active)<5
        and not exists(select 1 from quantum_private.voice_members member where member.session_id=candidate_session.id and member.active and quantum_private.tonight_invite_pair_is_blocked(actor,member.user_id))
      order by cell.cohort_no limit 1 for update of cell;

    if cheer_cell.id is null then
      insert into quantum_private.voice_rooms(created_by,school_scope,title,description,topic,kind,scope,capacity,starts_at,ends_at,status)
        values(actor,profile.school_scope,cheer_team.display_name||' 5인 응원방','경기 영상은 각자 보고, 목소리로만 함께 응원해요.','social','group','school',5,now(),now()+interval '2 hours','open') returning * into room;
      insert into quantum_private.voice_sessions(room_id,state,expires_at) values(room.id,'active',room.ends_at) returning * into session;
      insert into quantum_private.voice_cheer_cells(school_scope,team_id,cohort_no,room_id)
        values(profile.school_scope,cheer_team.id,coalesce((select max(cohort_no) from quantum_private.voice_cheer_cells where school_scope=profile.school_scope and team_id=cheer_team.id),0)+1,room.id)
        returning * into cheer_cell;
    else
      select * into room from quantum_private.voice_rooms where id=cheer_cell.room_id;
      select * into session from quantum_private.voice_sessions where room_id=room.id and state='active';
    end if;
    if (select count(*) from quantum_private.voice_members member where member.session_id=session.id and member.active)>=5 then raise exception 'room_full'; end if;
    perform set_config('app.voice_cheer_admission','on',true);
    insert into quantum_private.voice_members(session_id,user_id,mode,accepted_at) values(session.id,actor,'speak',now())
      on conflict(session_id,user_id) do update set
        identity=gen_random_uuid(),
        generation=quantum_private.voice_members.generation+1,
        mode=excluded.mode,
        advice_role=null,
        advice_topic=null,
        accepted_at=now(),
        active=true,
        connected=false,
        disconnected_at=now(),
        left_at=null,
        joined_at=now(),
        last_provider_event=0,
        provider_sid=null;
    perform set_config('app.voice_cheer_admission','off',true);
    update quantum_private.voice_sessions set revision=revision+1 where id=session.id;
    update quantum_private.voice_rooms set revision=revision+1 where id=room.id;
    select count(*) into member_count from quantum_private.voice_members member where member.session_id=session.id and member.active;
    result:=jsonb_build_object('sessionId',session.id,'roomId',room.id,'teamId',cheer_team.id,'teamName',cheer_team.display_name,'league',cheer_team.league,'cellNumber',cheer_cell.cohort_no,'memberCount',member_count,'capacity',5);
    if member_count=5 and not exists(
      select 1 from quantum_private.voice_cheer_cells cell
      join quantum_private.voice_rooms empty_room on empty_room.id=cell.room_id
      join quantum_private.voice_sessions empty_session on empty_session.room_id=empty_room.id and empty_session.state='active'
      where cell.school_scope=profile.school_scope and cell.team_id=cheer_team.id
        and empty_room.status='open' and empty_room.ends_at>now()
        and not exists(select 1 from quantum_private.voice_members empty_member where empty_member.session_id=empty_session.id and empty_member.active)
    ) then
      insert into quantum_private.voice_rooms(created_by,school_scope,title,description,topic,kind,scope,capacity,starts_at,ends_at,status)
        values(actor,profile.school_scope,cheer_team.display_name||' 5인 응원방','경기 영상은 각자 보고, 목소리로만 함께 응원해요.','social','group','school',5,now(),now()+interval '2 hours','open') returning * into room;
      insert into quantum_private.voice_sessions(room_id,state,expires_at) values(room.id,'active',room.ends_at) returning * into session;
      insert into quantum_private.voice_cheer_cells(school_scope,team_id,cohort_no,room_id)
        values(profile.school_scope,cheer_team.id,coalesce((select max(cohort_no) from quantum_private.voice_cheer_cells where school_scope=profile.school_scope and team_id=cheer_team.id),0)+1,room.id);
    end if;
  else
    raise exception 'invalid_input';
  end if;

  insert into quantum_private.voice_commands(user_id,idempotency_key,operation,payload,response)
    values(actor,key,p_operation,p_payload,result);
  return result;
end;
$$;

revoke all on table quantum_private.voice_advice_queue from public,anon,authenticated,service_role;
revoke all on table quantum_private.voice_advice_searches from public,anon,authenticated,service_role;
revoke all on table quantum_private.voice_cheer_teams from public,anon,authenticated,service_role;
revoke all on table quantum_private.voice_cheer_cells from public,anon,authenticated,service_role;
revoke all on function quantum_private.voice_scene_queue_guard() from public,anon,authenticated,service_role;
revoke all on function quantum_private.voice_scene_member_guard() from public,anon,authenticated,service_role;
revoke all on function quantum_private.voice_advice_status_json(uuid,text) from public,anon,authenticated,service_role;
revoke all on function quantum_private.voice_match_advice(uuid) from public,anon,authenticated,service_role;
revoke all on function public.community_voice_scene_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.community_voice_scene_command(text,jsonb) to authenticated;
revoke all on function public.community_voice_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.community_voice_command(text,jsonb) to authenticated;
revoke all on function public.sweep_voice_sessions() from public,anon,authenticated,service_role;
grant execute on function public.sweep_voice_sessions() to service_role;
