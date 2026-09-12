-- Persistent, hostless department study programs. Local migration candidate only.
-- Identity remains server-checked signup information, not a claim of verified enrollment.
begin;

create table quantum_private.study_course_catalog (
  course_id text primary key, course_name text not null, source_url text not null
);
insert into quantum_private.study_course_catalog values
 ('pnu:AN1600527','공학미적분학','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:AN1500214','일반물리학(Ⅰ)','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:AN1500845','일반화학(Ⅰ)','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:AN1500385','공학수학','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:AN1500215','일반물리학(Ⅱ)','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:AN1500847','일반화학(Ⅱ)','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:AN1501145','인공지능프로그래밍','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:NY2600025','전자기학','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:NY2600840','재료공학개론','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:NY3400004','회로이론및실험','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:NY2200581','정역학','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:NY2500249','파동및광학','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:NY2100768','전기화학','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:NY2300811','동역학','https://ste.pusan.ac.kr/ste/9579/subview.do'),
 ('pnu:NY3400019','기능성재료공학','https://ste.pusan.ac.kr/ste/9579/subview.do');

create table quantum_private.study_room_pools (
 id uuid primary key default pg_catalog.gen_random_uuid(), school_key text not null, department_key text not null,
 department_label text not null, course_id text not null, course_name text not null,
 level text not null check(level in ('beginner','intermediate','advanced')),
 unique(school_key,department_key,course_id,level)
);
create table quantum_private.study_rooms (
 id uuid primary key default pg_catalog.gen_random_uuid(), pool_id uuid not null references quantum_private.study_room_pools(id),
 room_number integer not null check(room_number>0), current_session integer not null default 1 check(current_session between 1 and 10),
 completed boolean not null default false, created_at timestamptz not null default pg_catalog.clock_timestamp(),
 unique(pool_id,room_number), unique(id,pool_id)
);
create table quantum_private.study_room_members (
 id uuid primary key default pg_catalog.gen_random_uuid(), pool_id uuid not null, room_id uuid not null,
 user_id uuid not null references public.users(id) on delete cascade, alias text not null,
 joined_at timestamptz not null default pg_catalog.clock_timestamp(), joined_session integer not null check(joined_session between 1 and 10),
 left_at timestamptz, unique(room_id,user_id),
 foreign key(room_id,pool_id) references quantum_private.study_rooms(id,pool_id)
);
create unique index study_room_one_active_pool on quantum_private.study_room_members(pool_id,user_id) where left_at is null;
create index study_room_active_members on quantum_private.study_room_members(room_id) where left_at is null;
create table quantum_private.study_room_sessions (
 room_id uuid not null references quantum_private.study_rooms(id), session_number integer not null check(session_number between 1 and 10),
 status text not null default 'planning' check(status in ('planning','confirmed','completed')),
 starts_at timestamptz, place_name text, place_note text, is_sponsored boolean not null default false, confirmed_proposal_id uuid,
 primary key(room_id,session_number)
);
create table quantum_private.study_room_proposals (
 id uuid primary key default pg_catalog.gen_random_uuid(), room_id uuid not null, session_number integer not null,
 proposer_id uuid references quantum_private.study_room_members(id) on delete set null, proposer_alias text not null,
 starts_at timestamptz not null, place_name text not null check(char_length(place_name) between 1 and 120),
 place_note text not null default '' check(char_length(place_note)<=500), is_sponsored boolean not null default false,
 created_at timestamptz not null default pg_catalog.clock_timestamp(),
 foreign key(room_id,session_number) references quantum_private.study_room_sessions(room_id,session_number)
);
create table quantum_private.study_room_attendance (
 room_id uuid not null, session_number integer not null, user_id uuid not null references public.users(id) on delete cascade,
 attending boolean not null, proposal_id uuid references quantum_private.study_room_proposals(id),
 schedule_confirmed boolean not null default false, schedule_accepted boolean not null default false,
 completion_confirmed boolean not null default false,
 primary key(room_id,session_number,user_id),
 foreign key(room_id,session_number) references quantum_private.study_room_sessions(room_id,session_number)
);
alter table quantum_private.study_room_sessions add foreign key(confirmed_proposal_id) references quantum_private.study_room_proposals(id);
create table quantum_private.study_room_messages (
 id uuid primary key default pg_catalog.gen_random_uuid(),room_id uuid not null references quantum_private.study_rooms(id),
 user_id uuid not null references public.users(id) on delete cascade, sender_alias text not null,
 message text not null check(char_length(message) between 1 and 1000), idempotency_key uuid not null,
 created_at timestamptz not null default pg_catalog.clock_timestamp(),unique(room_id,user_id,idempotency_key)
);
create index study_room_message_history on quantum_private.study_room_messages(room_id,created_at,id);
create index study_room_message_rate on quantum_private.study_room_messages(user_id,created_at);
create table quantum_private.study_room_recaps (
 id uuid primary key default pg_catalog.gen_random_uuid(),room_id uuid not null,session_number integer not null,
 user_id uuid not null references public.users(id) on delete cascade, author_alias text not null,
 text text not null check(char_length(text) between 1 and 1500),created_at timestamptz not null default pg_catalog.clock_timestamp(),
 unique(room_id,session_number,user_id),foreign key(room_id,session_number) references quantum_private.study_room_sessions(room_id,session_number)
);
create table quantum_private.study_room_reports (
 id uuid primary key default pg_catalog.gen_random_uuid(),room_id uuid not null references quantum_private.study_rooms(id),
 reporter_id uuid not null references public.users(id) on delete cascade,reason text not null check(char_length(reason) between 1 and 2000),
 evidence jsonb not null, created_at timestamptz not null default pg_catalog.clock_timestamp()
);

-- RPC-only private schema: no client table access, even when a permissive default grant exists.
alter table quantum_private.study_course_catalog enable row level security;
alter table quantum_private.study_room_pools enable row level security;
alter table quantum_private.study_rooms enable row level security;
alter table quantum_private.study_room_members enable row level security;
alter table quantum_private.study_room_sessions enable row level security;
alter table quantum_private.study_room_proposals enable row level security;
alter table quantum_private.study_room_attendance enable row level security;
alter table quantum_private.study_room_messages enable row level security;
alter table quantum_private.study_room_recaps enable row level security;
alter table quantum_private.study_room_reports enable row level security;
revoke all on quantum_private.study_course_catalog,quantum_private.study_room_pools,quantum_private.study_rooms,
 quantum_private.study_room_members,quantum_private.study_room_sessions,quantum_private.study_room_proposals,
 quantum_private.study_room_attendance,quantum_private.study_room_messages,quantum_private.study_room_recaps,
 quantum_private.study_room_reports from public,anon,authenticated,service_role;

create function quantum_private.study_room_summary(p_room uuid,p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select pg_catalog.jsonb_build_object('id',r.id,'course_id',p.course_id,'course_name',p.course_name,'level',p.level,
  'department_label',p.department_label,'room_number',r.room_number,'capacity',5,'member_count',
  (select count(*) from quantum_private.study_room_members m where m.room_id=r.id and m.left_at is null),
  'joined',exists(select 1 from quantum_private.study_room_members m where m.room_id=r.id and m.user_id=p_actor and m.left_at is null),
  'current_session',r.current_session,'status',case when r.completed then 'completed' when
   (select count(*) from quantum_private.study_room_members m where m.room_id=r.id and m.left_at is null)>=5 then 'full' else 'recruiting' end)
 from quantum_private.study_rooms r join quantum_private.study_room_pools p on p.id=r.pool_id where r.id=p_room
$$;

-- Entirely abandoned started programs are retained, not reassigned to a new cohort.
-- Partially populated rooms remain independently refillable.
create function quantum_private.study_room_recruitable(p_room uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not r.completed and (exists(select 1 from quantum_private.study_room_members m where m.room_id=r.id and m.left_at is null)
  or not exists(select 1 from quantum_private.study_room_sessions s where s.room_id=r.id and s.status in ('confirmed','completed')))
 from quantum_private.study_rooms r where r.id=p_room
$$;

create function quantum_private.study_room_history(p_room uuid,p_actor uuid,p_before_at timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 with recent as (
  select m.* from quantum_private.study_room_messages m where m.room_id=p_room
   and (p_before_at is null or (m.created_at,m.id)<(p_before_at,p_before_id)) order by m.created_at desc,m.id desc limit 101
 ), page as(select * from recent order by created_at desc,id desc limit 100)
 select pg_catalog.jsonb_build_object('messages',coalesce((select jsonb_agg(jsonb_build_object(
 'id',m.id,'sender_alias',m.sender_alias,'message',m.message,'created_at',m.created_at,'is_me',m.user_id=p_actor)
 order by m.created_at,m.id) from page m),'[]'::jsonb),'has_older_messages',(select count(*)>100 from recent))
$$;

create function quantum_private.study_room_detail(p_room uuid,p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select quantum_private.study_room_summary(p_room,p_actor)
 || quantum_private.study_room_history(p_room,p_actor)
 || jsonb_build_object('recommended_sessions',10,'membership_since',me.joined_at,
  'members',(select coalesce(jsonb_agg(jsonb_build_object('member_id',m.id,'alias',m.alias,'is_me',m.user_id=p_actor) order by m.joined_at),'[]')
    from quantum_private.study_room_members m where m.room_id=p_room and m.left_at is null),
  'sessions',(select jsonb_agg(jsonb_build_object('session_number',s.session_number,'status',s.status,
   'my_attendance',case when s.session_number<me.joined_session then 'not_member' when own.attending then 'attending' when own.attending=false then 'skipping' else 'undecided' end,
   'attending_count',(select count(*) from quantum_private.study_room_attendance a where a.room_id=p_room and a.session_number=s.session_number and a.attending),
   'my_schedule_accepted',coalesce(own.schedule_accepted,false),'completion_confirmed',coalesce(own.completion_confirmed,false),
   'completed_count',(select count(*) from quantum_private.study_room_attendance a where a.room_id=p_room and a.session_number=s.session_number and a.attending and a.completion_confirmed),
   'starts_at',s.starts_at,'place_name',s.place_name,'place_note',s.place_note,'is_sponsored',s.is_sponsored,
   'proposals',(select coalesce(jsonb_agg(jsonb_build_object('id',pr.id,'starts_at',pr.starts_at,'place_name',pr.place_name,
    'place_note',pr.place_note,'is_sponsored',pr.is_sponsored,'proposer_alias',pr.proposer_alias,
    'votes',(select count(*) from quantum_private.study_room_attendance a where a.proposal_id=pr.id and a.attending),
    'confirmations',(select count(*) from quantum_private.study_room_attendance a where a.proposal_id=pr.id and a.attending and a.schedule_confirmed),
    'my_vote',coalesce(own.proposal_id=pr.id,false),'my_confirmation',coalesce(own.proposal_id=pr.id and own.schedule_confirmed,false)) order by pr.created_at),'[]')
   from quantum_private.study_room_proposals pr where pr.room_id=p_room and pr.session_number=s.session_number
    and ((s.status='planning' and pr.starts_at>clock_timestamp()) or (s.status<>'planning' and pr.id=s.confirmed_proposal_id))),
   'recaps',(select coalesce(jsonb_agg(jsonb_build_object('id',rc.id,'author_alias',rc.author_alias,'text',rc.text,'created_at',rc.created_at) order by rc.created_at),'[]')
    from quantum_private.study_room_recaps rc where rc.room_id=p_room and rc.session_number=s.session_number)
   ) order by s.session_number) from quantum_private.study_room_sessions s
   left join quantum_private.study_room_attendance own on own.room_id=p_room and own.session_number=s.session_number and own.user_id=p_actor
   where s.room_id=p_room))
 from quantum_private.study_room_members me where me.room_id=p_room and me.user_id=p_actor and me.left_at is null
$$;

-- Private SECURITY DEFINER is necessary for atomic hostless enrollment and consensus.
-- Public wrapper is SECURITY INVOKER; the only granted private entry checks auth.uid itself.
create function quantum_private.study_room_finalize_ready(p_room uuid,p_number integer)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(select 1 from quantum_private.study_room_sessions s where s.room_id=p_room and s.session_number=p_number
    and s.status='confirmed' and s.starts_at<=clock_timestamp())
   and exists(select 1 from quantum_private.study_room_attendance a where a.room_id=p_room and a.session_number=p_number and a.attending)
   and not exists(select 1 from quantum_private.study_room_attendance a where a.room_id=p_room and a.session_number=p_number and a.attending and not a.completion_confirmed) then
  update quantum_private.study_room_sessions set status='completed' where room_id=p_room and session_number=p_number;
  update quantum_private.study_rooms set current_session=least(10,p_number+1),completed=p_number=10 where id=p_room and current_session=p_number;
 end if;
end
$$;

-- Match existing activity-chat erasure semantics: deleting an account erases its own
-- membership/messages/recaps/report submissions, never another participant's room or plan.
create function quantum_private.study_room_member_deleted()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare v_pool quantum_private.study_room_pools%rowtype; v_room quantum_private.study_rooms%rowtype;
begin
 select p.* into v_pool from quantum_private.study_room_pools p where p.id=old.pool_id;
 perform pg_advisory_xact_lock(hashtextextended('study-pool|'||v_pool.school_key||'|'||v_pool.department_key||'|'||v_pool.course_id||'|'||v_pool.level,0));
 select * into v_room from quantum_private.study_rooms r where r.id=old.room_id for update;
 if not found then return old; end if;
 update quantum_private.study_room_attendance set attending=false,proposal_id=null,schedule_confirmed=false,completion_confirmed=false
  where room_id=old.room_id and user_id=old.user_id and session_number>=v_room.current_session
  and exists(select 1 from quantum_private.study_room_sessions s where s.room_id=old.room_id and s.session_number=study_room_attendance.session_number and s.status<>'completed');
 if old.left_at is null then
  update quantum_private.study_room_attendance set schedule_confirmed=false where room_id=old.room_id and session_number=v_room.current_session
   and exists(select 1 from quantum_private.study_room_sessions s where s.room_id=old.room_id and s.session_number=v_room.current_session and s.status='planning');
 end if;
 perform quantum_private.study_room_finalize_ready(old.room_id,v_room.current_session);
 return old;
end
$$;
create trigger study_room_cleanup_deleted_member after delete on quantum_private.study_room_members
 for each row execute function quantum_private.study_room_member_deleted();

create function quantum_private.study_room_action(p_action text,p_args jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_identity record; v_pool quantum_private.study_room_pools%rowtype;
 v_room quantum_private.study_rooms%rowtype; v_member quantum_private.study_room_members%rowtype;
 v_session quantum_private.study_room_sessions%rowtype; v_proposal quantum_private.study_room_proposals%rowtype;
 v_course_id text; v_course_name text; v_level text; v_room_id uuid; v_number integer; v_count integer;
 v_text text; v_key uuid; v_existing record; v_alias text; v_attending boolean; v_report_status text:='not_requested';
 v_json jsonb; v_before_at timestamptz; v_before_id uuid; v_time timestamptz;
begin
 if v_actor is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 if p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>16000 then raise exception 'invalid_request'; end if;
 if p_action is null or p_action not in ('list','mine','create','detail','join','leave','history','message','attendance','propose_schedule','vote_schedule','confirm_schedule','accept_schedule','complete_session','recap') then raise exception 'invalid_action'; end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||v_actor::text,0));
 -- Leave only needs an authenticated own membership; changed profile never traps someone in a room.
 if p_action<>'leave' then
  perform 1 from quantum_private.assert_activity_room_access(v_actor);
  select * into v_identity from quantum_private.get_member_department_identity(v_actor);
  if not found then raise exception 'department_identity_required'; end if;
 end if;

 if p_action='mine' then
  select coalesce(jsonb_agg(quantum_private.study_room_summary(r.id,v_actor) order by m.joined_at desc),'[]') into v_json
   from quantum_private.study_rooms r join quantum_private.study_room_members m on m.room_id=r.id and m.user_id=v_actor and m.left_at is null
   join quantum_private.study_room_pools p on p.id=r.pool_id and p.school_key=v_identity.school_scope_key and p.department_key=v_identity.department_key;
  return jsonb_build_object('rooms',v_json);
 end if;
 if p_action in ('create','list') then
  v_course_id:=p_args->>'course_id'; v_level:=p_args->>'level';
  if v_level is null or v_level not in ('beginner','intermediate','advanced') then raise exception 'invalid_level'; end if;
  if v_course_id='custom' then
   v_course_name:=regexp_replace(btrim(p_args->>'course_name'),'[[:space:]]+',' ','g');
   if v_course_name is null or char_length(v_course_name) not between 1 and 80 then raise exception 'invalid_course_name'; end if;
   v_course_id:='custom:'||md5(lower(regexp_replace(v_course_name,'[[:space:]]','','g')));
  elsif v_course_id ~ '^custom:[a-f0-9]{32}$' and p_action='list' then null;
  else
   select c.course_name into v_course_name from quantum_private.study_course_catalog c where c.course_id=v_course_id;
   if v_course_name is null then raise exception 'invalid_course_id'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('study-pool|'||v_identity.school_scope_key||'|'||v_identity.department_key||'|'||v_course_id||'|'||v_level,0));
  if p_action='create' then
   insert into quantum_private.study_room_pools(school_key,department_key,department_label,course_id,course_name,level)
   select v_identity.school_scope_key,v_identity.department_key,m.department,v_course_id,v_course_name,v_level
   from quantum_private.community_member_profiles m where m.user_id=v_actor
   on conflict(school_key,department_key,course_id,level) do nothing;
  end if;
  select * into v_pool from quantum_private.study_room_pools p where p.school_key=v_identity.school_scope_key
   and p.department_key=v_identity.department_key and p.course_id=v_course_id and p.level=v_level for update;
  if p_action='list' then
   select coalesce(jsonb_agg(quantum_private.study_room_summary(r.id,v_actor) order by r.room_number),'[]') into v_json
   from quantum_private.study_rooms r where r.pool_id=v_pool.id and (quantum_private.study_room_recruitable(r.id) or exists(select 1 from quantum_private.study_room_members m where m.room_id=r.id and m.user_id=v_actor and m.left_at is null));
   return jsonb_build_object('rooms',v_json);
  end if;
  select r.* into v_room from quantum_private.study_rooms r join quantum_private.study_room_members m on m.room_id=r.id
   where m.pool_id=v_pool.id and m.user_id=v_actor and m.left_at is null;
  if v_room.id is not null then
   if exists(select 1 from quantum_private.study_room_members m where m.room_id=v_room.id and m.left_at is null
     and quantum_private.tonight_invite_pair_is_blocked(v_actor,m.user_id)) then raise exception 'study_room_forbidden'; end if;
   return quantum_private.study_room_detail(v_room.id,v_actor);
  end if;
  select r.* into v_room from quantum_private.study_rooms r where r.pool_id=v_pool.id and quantum_private.study_room_recruitable(r.id)
   and (select count(*) from quantum_private.study_room_members m where m.room_id=r.id and m.left_at is null)<5
   order by r.room_number limit 1 for update;
  if v_room.id is null then
   insert into quantum_private.study_rooms(pool_id,room_number)
   select v_pool.id,coalesce(max(r.room_number),0)+1 from quantum_private.study_rooms r where r.pool_id=v_pool.id returning * into v_room;
   insert into quantum_private.study_room_sessions(room_id,session_number) select v_room.id,n from generate_series(1,10) as n;
  end if;
  v_room_id:=v_room.id;
 else
  begin v_room_id:=(p_args->>'room_id')::uuid; exception when invalid_text_representation then raise exception 'invalid_room_id'; end;
  select * into v_room from quantum_private.study_rooms r where r.id=v_room_id;
  if v_room.id is null then raise exception 'study_room_not_found'; end if;
  select * into v_pool from quantum_private.study_room_pools p where p.id=v_room.pool_id;
  perform pg_advisory_xact_lock(hashtextextended('study-pool|'||v_pool.school_key||'|'||v_pool.department_key||'|'||v_pool.course_id||'|'||v_pool.level,0));
  select * into v_room from quantum_private.study_rooms r where r.id=v_room_id for update;
 end if;
 if p_action<>'leave' and (v_pool.school_key<>v_identity.school_scope_key or v_pool.department_key<>v_identity.department_key) then raise exception 'study_room_forbidden' using errcode='42501'; end if;
 select * into v_member from quantum_private.study_room_members m where m.room_id=v_room_id and m.user_id=v_actor and m.left_at is null;

 if p_action in ('join','create') then
  if exists(select 1 from quantum_private.study_room_members m where m.room_id=v_room_id and m.left_at is null
   and quantum_private.tonight_invite_pair_is_blocked(v_actor,m.user_id)) then raise exception 'study_room_forbidden'; end if;
  if v_member.id is not null then return quantum_private.study_room_detail(v_room_id,v_actor); end if;
  if not quantum_private.study_room_recruitable(v_room.id) then raise exception 'study_room_closed'; end if;
  if exists(select 1 from quantum_private.study_room_members m where m.pool_id=v_pool.id and m.user_id=v_actor and m.left_at is null) then raise exception 'study_room_already_joined'; end if;
  select count(*) into v_count from quantum_private.study_room_members m where m.room_id=v_room_id and m.left_at is null;
  if v_count>=5 then raise exception 'study_room_full'; end if;
  v_alias:=quantum_private.get_or_create_daily_identity(v_actor,clock_timestamp())->>'display_name';
  if v_alias is null then raise exception 'profile_required'; end if;
  v_text:=v_alias; v_count:=1;
  while exists(select 1 from quantum_private.study_room_members m where m.room_id=v_room_id and m.alias=v_alias) loop
   v_count:=v_count+1; v_alias:=v_text||'·'||v_count::text;
  end loop;
  insert into quantum_private.study_room_members(pool_id,room_id,user_id,alias,joined_session)
   values(v_pool.id,v_room_id,v_actor,v_alias,v_room.current_session)
   on conflict(room_id,user_id) do update set left_at=null,joined_at=clock_timestamp(),joined_session=excluded.joined_session;
  -- Filling the last seat exposes one spare room, but a 4/5 and a 2/5 stay independent.
  if not exists(select 1 from quantum_private.study_rooms r where r.pool_id=v_pool.id and quantum_private.study_room_recruitable(r.id)
    and (select count(*) from quantum_private.study_room_members m where m.room_id=r.id and m.left_at is null)<5) then
   insert into quantum_private.study_rooms(pool_id,room_number)
    select v_pool.id,coalesce(max(r.room_number),0)+1 from quantum_private.study_rooms r where r.pool_id=v_pool.id returning id into v_key;
   insert into quantum_private.study_room_sessions(room_id,session_number) select v_key,n from generate_series(1,10) as n;
  end if;
  return quantum_private.study_room_detail(v_room_id,v_actor);
 end if;
 if v_member.id is null then
  if p_action='leave' then return jsonb_build_object('left',true,'report_status','not_requested'); end if;
  raise exception 'study_room_membership_required' using errcode='42501';
 end if;
 if p_action='leave' then
  v_text:=nullif(btrim(p_args->>'report_reason'),'');
  if v_text is not null then
   begin
    if char_length(v_text)>2000 then raise exception 'invalid_report'; end if;
    insert into quantum_private.study_room_reports(room_id,reporter_id,reason,evidence)
     values(v_room_id,v_actor,v_text,jsonb_build_object('reporter_alias',v_member.alias,'current_session',v_room.current_session,
      'messages',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from (select id,user_id,sender_alias,message,created_at
       from quantum_private.study_room_messages where room_id=v_room_id order by created_at desc,id desc limit 20) m)));
    v_report_status:='saved';
   exception when others then v_report_status:='failed'; end;
  end if;
  update quantum_private.study_room_members set left_at=clock_timestamp() where id=v_member.id;
  update quantum_private.study_room_attendance set attending=false,proposal_id=null,schedule_confirmed=false,completion_confirmed=false
   where room_id=v_room_id and user_id=v_actor and session_number>=v_room.current_session
    and exists(select 1 from quantum_private.study_room_sessions s where s.room_id=v_room_id and s.session_number=study_room_attendance.session_number and s.status<>'completed');
  update quantum_private.study_room_attendance set schedule_confirmed=false where room_id=v_room_id and session_number=v_room.current_session
   and exists(select 1 from quantum_private.study_room_sessions s where s.room_id=v_room_id and s.session_number=v_room.current_session and s.status='planning');
  perform quantum_private.study_room_finalize_ready(v_room_id,v_room.current_session);
  return jsonb_build_object('left',true,'report_status',v_report_status);
 end if;
 -- Blocking after enrollment revokes historical reads and all participation, not only new messages.
 if exists(select 1 from quantum_private.study_room_members m where m.room_id=v_room_id and m.left_at is null
   and quantum_private.tonight_invite_pair_is_blocked(v_actor,m.user_id)) then raise exception 'study_room_forbidden'; end if;
 if p_action='detail' then return quantum_private.study_room_detail(v_room_id,v_actor); end if;
 if p_action='history' then
  if (p_args->>'before_at' is null)<>(p_args->>'before_id' is null) then raise exception 'invalid_cursor'; end if;
  begin v_before_at:=(p_args->>'before_at')::timestamptz; v_before_id:=(p_args->>'before_id')::uuid;
   exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'invalid_cursor'; end;
  return quantum_private.study_room_history(v_room_id,v_actor,v_before_at,v_before_id);
 end if;
 if p_action='message' then
  v_text:=btrim(p_args->>'message');
  begin v_key:=(p_args->>'idempotency_key')::uuid; exception when invalid_text_representation then raise exception 'invalid_idempotency_key'; end;
  if v_key is null or v_text is null or char_length(v_text) not between 1 and 1000 then raise exception 'invalid_message'; end if;
  if v_text ~* '(https?://|www[.]|[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|instagram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)'
   or regexp_replace(v_text,'[^0-9]','','g') ~ '01[016789][0-9]{7,8}' then raise exception 'contact_sharing_not_allowed'; end if;
  if exists(select 1 from quantum_private.study_room_members m where m.room_id=v_room_id and m.left_at is null
   and quantum_private.tonight_invite_pair_is_blocked(v_actor,m.user_id)) then raise exception 'study_room_forbidden'; end if;
  select message into v_existing from quantum_private.study_room_messages where room_id=v_room_id and user_id=v_actor and idempotency_key=v_key;
  if found then
   if v_existing.message<>v_text then raise exception 'idempotency_key_reused'; end if;
  else
   if (select count(*) from quantum_private.study_room_messages where user_id=v_actor and created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'study_rate_limited'; end if;
   insert into quantum_private.study_room_messages(room_id,user_id,sender_alias,message,idempotency_key) values(v_room_id,v_actor,v_member.alias,v_text,v_key);
  end if;
  return quantum_private.study_room_detail(v_room_id,v_actor);
 end if;

 begin v_number:=(p_args->>'session_number')::integer; exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'invalid_session_number'; end;
 if v_number is null or v_number not between 1 and 10 then raise exception 'invalid_session_number'; end if;
 select * into v_session from quantum_private.study_room_sessions s where s.room_id=v_room_id and s.session_number=v_number for update;
 if p_action='recap' then
  if v_member.joined_session>v_number or not exists(select 1 from quantum_private.study_room_attendance a where a.room_id=v_room_id and a.session_number=v_number and a.user_id=v_actor and a.attending and a.schedule_accepted)
   then raise exception 'study_session_participation_required'; end if;
  if v_session.status='planning' or v_session.starts_at>clock_timestamp() then raise exception 'study_session_not_started'; end if;
  v_text:=btrim(p_args->>'text'); if v_text is null or char_length(v_text) not between 1 and 1500 then raise exception 'invalid_recap'; end if;
  insert into quantum_private.study_room_recaps(room_id,session_number,user_id,author_alias,text) values(v_room_id,v_number,v_actor,v_member.alias,v_text)
   on conflict(room_id,session_number,user_id) do update set text=excluded.text;
  return quantum_private.study_room_detail(v_room_id,v_actor);
 end if;
 if v_number<>v_room.current_session or v_room.completed or v_session.status='completed' then raise exception 'study_session_not_current'; end if;
 if p_action='attendance' then
  if jsonb_typeof(p_args->'attending') is distinct from 'boolean' then raise exception 'invalid_attendance'; end if;
  v_attending:=(p_args->>'attending')::boolean;
  select attending into v_existing from quantum_private.study_room_attendance where room_id=v_room_id and session_number=v_number and user_id=v_actor;
  if not found or v_existing.attending is distinct from v_attending then
   insert into quantum_private.study_room_attendance(room_id,session_number,user_id,attending) values(v_room_id,v_number,v_actor,v_attending)
    on conflict(room_id,session_number,user_id) do update set attending=excluded.attending,proposal_id=null,schedule_confirmed=false,schedule_accepted=false,completion_confirmed=false;
   if v_session.status='planning' then update quantum_private.study_room_attendance set schedule_confirmed=false where room_id=v_room_id and session_number=v_number; end if;
  end if;
  perform quantum_private.study_room_finalize_ready(v_room_id,v_number);
  return quantum_private.study_room_detail(v_room_id,v_actor);
 end if;
 if not exists(select 1 from quantum_private.study_room_attendance where room_id=v_room_id and session_number=v_number and user_id=v_actor and attending) then raise exception 'study_session_attendance_required'; end if;
 if p_action in ('propose_schedule','vote_schedule','confirm_schedule') then
  if v_session.status<>'planning' then raise exception 'study_schedule_closed'; end if;
  if p_action='propose_schedule' then
   begin v_time:=(p_args->>'starts_at')::timestamptz; exception when invalid_datetime_format or datetime_field_overflow then raise exception 'invalid_schedule_time'; end;
   if v_time is null or v_time<=clock_timestamp() or v_time>clock_timestamp()+interval '180 days' then raise exception 'invalid_schedule_time'; end if;
   v_text:=btrim(p_args->>'place_name'); if v_text is null or char_length(v_text) not between 1 and 120 or char_length(coalesce(p_args->>'place_note',''))>500 then raise exception 'invalid_place'; end if;
   if (select count(*) from quantum_private.study_room_proposals where room_id=v_room_id and session_number=v_number and starts_at>clock_timestamp())>=8 then raise exception 'study_proposal_limit'; end if;
   if p_args ? 'is_sponsored' and jsonb_typeof(p_args->'is_sponsored') is distinct from 'boolean' then raise exception 'invalid_sponsorship'; end if;
   insert into quantum_private.study_room_proposals(room_id,session_number,proposer_id,proposer_alias,starts_at,place_name,place_note,is_sponsored)
    values(v_room_id,v_number,v_member.id,v_member.alias,v_time,v_text,coalesce(p_args->>'place_note',''),coalesce((p_args->>'is_sponsored')::boolean,false));
  else
   begin v_key:=(p_args->>'proposal_id')::uuid; exception when invalid_text_representation then raise exception 'invalid_proposal_id'; end;
   select * into v_proposal from quantum_private.study_room_proposals p where p.id=v_key and p.room_id=v_room_id and p.session_number=v_number;
   if v_proposal.id is null then raise exception 'invalid_proposal_id'; end if;
   if v_proposal.starts_at<=clock_timestamp() then raise exception 'invalid_schedule_time'; end if;
   if p_action='vote_schedule' then
    if exists(select 1 from quantum_private.study_room_attendance where room_id=v_room_id and session_number=v_number and user_id=v_actor and proposal_id is distinct from v_key) then
     update quantum_private.study_room_attendance set proposal_id=v_key where room_id=v_room_id and session_number=v_number and user_id=v_actor;
     update quantum_private.study_room_attendance set schedule_confirmed=false where room_id=v_room_id and session_number=v_number;
    end if;
   else
    if not exists(select 1 from quantum_private.study_room_attendance where room_id=v_room_id and session_number=v_number and user_id=v_actor and proposal_id=v_key) then raise exception 'study_schedule_not_ready'; end if;
    update quantum_private.study_room_attendance set schedule_confirmed=true where room_id=v_room_id and session_number=v_number and user_id=v_actor;
    if not exists(select 1 from quantum_private.study_room_attendance where room_id=v_room_id and session_number=v_number and attending and (proposal_id is distinct from v_key or not schedule_confirmed)) then
     update quantum_private.study_room_sessions set status='confirmed',starts_at=v_proposal.starts_at,place_name=v_proposal.place_name,place_note=v_proposal.place_note,is_sponsored=v_proposal.is_sponsored,confirmed_proposal_id=v_proposal.id where room_id=v_room_id and session_number=v_number;
     update quantum_private.study_room_attendance set schedule_accepted=true where room_id=v_room_id and session_number=v_number and attending;
    end if;
   end if;
  end if;
 elsif p_action='accept_schedule' then
  if v_session.status<>'confirmed' then raise exception 'study_schedule_not_ready'; end if;
  update quantum_private.study_room_attendance set schedule_accepted=true where room_id=v_room_id and session_number=v_number and user_id=v_actor;
 elsif p_action='complete_session' then
  if v_session.status<>'confirmed' then raise exception 'study_schedule_not_ready'; end if;
  if not exists(select 1 from quantum_private.study_room_attendance where room_id=v_room_id and session_number=v_number and user_id=v_actor and schedule_accepted) then raise exception 'study_schedule_acceptance_required'; end if;
  if v_session.starts_at>clock_timestamp() then raise exception 'study_session_not_started'; end if;
  update quantum_private.study_room_attendance set completion_confirmed=true where room_id=v_room_id and session_number=v_number and user_id=v_actor;
  perform quantum_private.study_room_finalize_ready(v_room_id,v_number);
 end if;
 return quantum_private.study_room_detail(v_room_id,v_actor);
end
$$;

create function public.study_room_action(p_action text,p_args jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$
 select quantum_private.study_room_action(p_action,p_args)
$$;
revoke all on function quantum_private.study_room_summary(uuid,uuid),quantum_private.study_room_recruitable(uuid),quantum_private.study_room_history(uuid,uuid,timestamptz,uuid),
 quantum_private.study_room_detail(uuid,uuid),quantum_private.study_room_finalize_ready(uuid,integer),quantum_private.study_room_member_deleted(),quantum_private.study_room_action(text,jsonb),public.study_room_action(text,jsonb) from public,anon,authenticated,service_role;
grant usage on schema quantum_private to authenticated;
grant execute on function quantum_private.study_room_action(text,jsonb),public.study_room_action(text,jsonb) to authenticated;

comment on table quantum_private.study_room_reports is 'Private operator evidence. No participant, venue, or general service-role table access. Dedicated authorized operator review required.';
comment on table quantum_private.study_room_pools is 'School/department are canonical server profile claims, not verified enrollment. Course selection does not assert actual enrollment.';
commit;
