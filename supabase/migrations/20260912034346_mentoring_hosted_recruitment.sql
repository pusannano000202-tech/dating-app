-- Forward-only hosted mentoring. No remote application or payment execution.
begin;
alter table quantum_private.group_mentoring_sessions
 add column recruitment_mode text not null default 'legacy' check(recruitment_mode in('legacy','hosted')),
 add column host_user_id uuid references public.users(id) on delete set null,
 add column title text check(char_length(title) between 1 and 60),
 add column topic text check(topic in('courses','career','campus')),
 add column department_label text,
 add column revision integer not null default 0,
 add column creation_owner_id uuid references public.users(id) on delete set null,
 add column creation_key uuid,
 add column creation_args jsonb;
alter table quantum_private.group_mentoring_sessions add constraint hosted_mentoring_shape check(
 recruitment_mode='legacy' or(title is not null and topic is not null and department_label is not null and creation_key is not null and creation_args is not null));
create unique index hosted_mentoring_create_key on quantum_private.group_mentoring_sessions(creation_owner_id,creation_key) where recruitment_mode='hosted';
alter table quantum_private.group_mentoring_members alter column party_id drop not null;
alter table quantum_private.group_mentoring_members add column joined_at timestamptz not null default clock_timestamp(),add column left_at timestamptz;
create unique index hosted_mentoring_one_active on quantum_private.group_mentoring_members(user_id) where party_id is null and accepted and left_at is null;

-- One serialization order shared with native paid admission: mentoring globals,
-- current user readiness locks, room row, then admission/deposit and pair locks.
create function quantum_private.hosted_mentoring_lock(p_room uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare person uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('group-mentoring:v1',0));
 perform pg_advisory_xact_lock(hashtextextended('quantum:mentoring:v1',0));
 for person in select u from(select p_actor u union select user_id from quantum_private.group_mentoring_members where session_id=p_room and accepted and left_at is null) a where u is not null order by u loop
  perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||person::text,0));
 end loop;
 perform 1 from quantum_private.group_mentoring_sessions where id=p_room for update;
end $$;

create function quantum_private.hosted_mentoring_room_eligible(p_room uuid,p_actor uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from quantum_private.group_mentoring_sessions s where s.id=p_room and s.recruitment_mode='hosted'
  and quantum_private.mentoring_member_eligible(p_actor,s.school_key,s.department_key)
  and s.host_user_id is not null and quantum_private.mentoring_member_eligible(s.host_user_id,s.school_key,s.department_key)
  and exists(select 1 from quantum_private.group_mentoring_members h where h.session_id=s.id and h.user_id=s.host_user_id and h.accepted and h.left_at is null)
  and not exists(select 1 from quantum_private.group_mentoring_members m where m.session_id=s.id and m.accepted and m.left_at is null
   and(not quantum_private.mentoring_member_eligible(m.user_id,s.school_key,s.department_key) or quantum_private.group_mentoring_pair_excluded(p_actor,m.user_id)))
  and not exists(select 1 from quantum_private.group_mentoring_members a join quantum_private.group_mentoring_members b on b.session_id=a.session_id and a.user_id<b.user_id
   where a.session_id=s.id and a.accepted and b.accepted and a.left_at is null and b.left_at is null and quantum_private.group_mentoring_pair_excluded(a.user_id,b.user_id)))
$$;
create function quantum_private.hosted_mentoring_member_current(p_room uuid,p_user uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from quantum_private.group_mentoring_sessions s join quantum_private.group_mentoring_members m on m.session_id=s.id
  where s.id=p_room and s.recruitment_mode='hosted' and s.status='active' and s.expires_at>clock_timestamp() and m.user_id=p_user and m.accepted and m.left_at is null)
  and quantum_private.hosted_mentoring_room_eligible(p_room,p_user)
$$;
create function quantum_private.hosted_mentoring_target(p_room uuid,p_actor uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s quantum_private.group_mentoring_sessions%rowtype; a integer;b integer;begin
 select * into s from quantum_private.group_mentoring_sessions where id=p_room and recruitment_mode='hosted';
 if not found or not quantum_private.hosted_mentoring_room_eligible(p_room,p_actor) then return null;end if;
 select count(*)filter(where role='mentor'),count(*)filter(where role='mentee') into a,b from quantum_private.group_mentoring_members where session_id=p_room and accepted and left_at is null;
 return jsonb_build_object('kind','mentoring','id',s.id,'title',s.title,'host_user_id',s.host_user_id,'school_key',s.school_key,'department_key',s.department_key,
  'capacity',s.side_size*2,'member_count',a+b,'revision',s.revision,'status',case when s.status<>'active' or s.expires_at<=clock_timestamp() then 'closed' when a+b=s.side_size*2 then 'full' else 'open' end,
  'role_capacity',s.side_size,'mentor_count',a,'mentee_count',b,'joined',quantum_private.hosted_mentoring_member_current(p_room,p_actor));
end $$;

-- Called only by the paid admission transaction after receipt + host approval.
-- No grant to any API role: selecting this role does not itself buy admission.
create function quantum_private.hosted_mentoring_admit(p_room uuid,p_applicant uuid,p_metadata jsonb) returns void
language plpgsql volatile security definer set search_path='' as $$
declare s quantum_private.group_mentoring_sessions%rowtype; chosen text;people uuid[]; old quantum_private.group_mentoring_members%rowtype;begin
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or p_metadata-'role'<>'{}'::jsonb or not p_metadata?'role'
  or jsonb_typeof(p_metadata->'role')<>'string' or p_metadata->>'role' not in('mentor','mentee') then raise exception 'mentoring_invalid';end if;
 -- The caller already owns the globals/readiness/room locks in this order.
 perform pg_advisory_xact_lock(hashtextextended('group-mentoring:v1',0));
 perform pg_advisory_xact_lock(hashtextextended('quantum:mentoring:v1',0));
 select * into s from quantum_private.group_mentoring_sessions where id=p_room and recruitment_mode='hosted' for update;
 if not found then raise exception 'mentoring_not_found';end if;
 if s.status<>'active' or s.expires_at<=clock_timestamp() then raise exception 'mentoring_closed';end if;
 select array_agg(u) into people from(select p_applicant u union select user_id from quantum_private.group_mentoring_members where session_id=p_room and accepted and left_at is null)a;
 perform quantum_private.group_mentoring_lock_pairs(people);
 if not quantum_private.hosted_mentoring_room_eligible(p_room,p_applicant) then raise exception 'mentoring_forbidden';end if;
 chosen:=p_metadata->>'role';
 select * into old from quantum_private.group_mentoring_members where session_id=p_room and user_id=p_applicant;
 if found and old.accepted and old.left_at is null then
  if old.role<>chosen then raise exception 'mentoring_conflict';end if;return;
 end if;
 if exists(select 1 from quantum_private.group_mentoring_members m join quantum_private.group_mentoring_sessions r on r.id=m.session_id where m.user_id=p_applicant and m.accepted and m.left_at is null and r.recruitment_mode='hosted' and r.status='active' and r.expires_at>clock_timestamp())
  or exists(select 1 from quantum_private.group_mentoring_party_members m join quantum_private.group_mentoring_parties p on p.id=m.party_id where m.user_id=p_applicant and m.active and p.status in('friends','waiting','offered','active') and p.expires_at>clock_timestamp())
  or exists(select 1 from quantum_private.mentoring_waiters where user_id=p_applicant and status in('offered','active') and expires_at>clock_timestamp()) then raise exception 'mentoring_already_active';end if;
 if(select count(*)from quantum_private.group_mentoring_members where session_id=p_room and accepted and left_at is null and role=chosen)>=s.side_size then raise exception 'mentoring_full';end if;
 -- Expired hosted reservations may be released, without deleting their records.
 update quantum_private.group_mentoring_members m set left_at=clock_timestamp() from quantum_private.group_mentoring_sessions r where m.session_id=r.id and m.user_id=p_applicant and m.party_id is null and m.left_at is null and(r.status<>'active' or r.expires_at<=clock_timestamp());
 insert into quantum_private.group_mentoring_members(session_id,party_id,user_id,role,alias,accepted)
  values(p_room,null,p_applicant,chosen,case when chosen='mentor' then '멘토 ' else '멘티 ' end||(select count(*)+1 from quantum_private.group_mentoring_members where session_id=p_room and role=chosen),true)
  on conflict(session_id,user_id) do update set role=excluded.role,alias=excluded.alias,accepted=true,left_at=null,joined_at=clock_timestamp();
 update quantum_private.group_mentoring_sessions set revision=revision+1 where id=p_room;
end $$;

create function quantum_private.hosted_mentoring_summary(p_room uuid,p_actor uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s quantum_private.group_mentoring_sessions%rowtype;a integer;b integer;own_unleft boolean;eligible boolean;restricted boolean;begin
 select * into s from quantum_private.group_mentoring_sessions where id=p_room and recruitment_mode='hosted';if not found then return null;end if;
 select exists(select 1 from quantum_private.group_mentoring_members where session_id=p_room and user_id=p_actor and accepted and left_at is null)into own_unleft;
 eligible:=quantum_private.hosted_mentoring_room_eligible(p_room,p_actor);
 restricted:=own_unleft and not quantum_private.hosted_mentoring_member_current(p_room,p_actor);
 -- A current personal obligation must remain manageable after scope/block changes.
 -- This is not a room preview: hide changes, roster size and host identity. Past
 -- participants may retain evidence/leave routes, never a recovery listing.
 if not eligible or restricted then
  return jsonb_build_object('id',s.id,'title','참여 상태를 확인할 멘토링','topic','campus','side_size',s.side_size,
   'mentor_count',0,'mentee_count',0,'member_count',0,'status','closed','joined',false,'is_host',false,
   'revision',0,'expires_at',s.expires_at,'department_label','참여 관리')
   ||case when restricted then jsonb_build_object('participation_restricted',true)else '{}'::jsonb end;
 end if;
 select count(*)filter(where role='mentor'),count(*)filter(where role='mentee') into a,b from quantum_private.group_mentoring_members where session_id=p_room and accepted and left_at is null;
 return jsonb_build_object('id',s.id,'title',s.title,'topic',s.topic,'side_size',s.side_size,'mentor_count',a,'mentee_count',b,'member_count',a+b,
  'status',case when s.status<>'active' or s.expires_at<=clock_timestamp() or not quantum_private.hosted_mentoring_room_eligible(p_room,p_actor) then 'closed' when a+b=s.side_size*2 then 'full' else 'open' end,
  'joined',quantum_private.hosted_mentoring_member_current(p_room,p_actor),'is_host',coalesce(s.host_user_id=p_actor,false),'revision',s.revision,'expires_at',s.expires_at,'department_label',s.department_label);
end $$;
create function quantum_private.hosted_mentoring_detail(p_room uuid,p_actor uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s quantum_private.group_mentoring_sessions%rowtype; own quantum_private.group_mentoring_members%rowtype; current_member boolean;members jsonb:='[]';messages jsonb:='[]';targets jsonb:='[]';meeting jsonb;begin
 select * into s from quantum_private.group_mentoring_sessions where id=p_room and recruitment_mode='hosted';if not found then raise exception 'mentoring_not_found';end if;
 select * into own from quantum_private.group_mentoring_members where session_id=p_room and user_id=p_actor and accepted;
 if own.id is null and not quantum_private.hosted_mentoring_room_eligible(p_room,p_actor) then raise exception 'mentoring_forbidden';end if;
 current_member:=quantum_private.hosted_mentoring_member_current(p_room,p_actor);
 if current_member then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'role',role,'label',alias,'mine',user_id=p_actor,'is_host',user_id=s.host_user_id)order by role,joined_at,id),'[]')into members from quantum_private.group_mentoring_members where session_id=p_room and accepted and left_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'mine',m.author_id=p_actor,'alias',a.alias,'text',m.body,'created_at',m.created_at)order by m.created_at,m.id),'[]')into messages
   from(select * from quantum_private.group_mentoring_messages where session_id=p_room order by created_at desc,id desc limit 100)m join quantum_private.group_mentoring_members a on a.session_id=m.session_id and a.user_id=m.author_id;
  if s.meeting_at is not null then meeting:=jsonb_build_object('starts_at',s.meeting_at,'place',s.meeting_place,'revision',s.plan_revision);end if;
 end if;
 if own.id is not null then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',alias)order by joined_at,id),'[]')into targets from(
   select * from quantum_private.group_mentoring_members where session_id=p_room and accepted and user_id<>p_actor
    and joined_at<=coalesce(own.left_at,clock_timestamp()) and coalesce(left_at,clock_timestamp())>=own.joined_at order by joined_at,id limit 50)m;
 end if;
 return jsonb_build_object('owner_id',p_actor,'room',quantum_private.hosted_mentoring_summary(p_room,p_actor)||jsonb_build_object('my_role',own.role,'members',members,'messages',messages,'meeting',meeting,'report_targets',targets));
end $$;

create function quantum_private.mentoring_hosted_action(p_action text,p_args jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();s quantum_private.group_mentoring_sessions%rowtype;own quantum_private.group_mentoring_members%rowtype;other quantum_private.group_mentoring_members%rowtype;ident record;fields text[];sid uuid;body text;key uuid;people uuid[];stamp timestamptz;result jsonb;person uuid;begin
 if actor is null then raise exception 'not_authenticated';end if;
 perform quantum_private.assert_activity_room_access(actor);
 fields:=case p_action when 'list'then array[]::text[] when 'create'then array['title','topic','role','side_size','client_id'] when 'status'then array['session_id'] when 'message'then array['session_id','text','client_id'] when 'plan'then array['session_id','starts_at','place','revision'] when 'leave'then array['session_id'] when 'report'then array['session_id','member_id','reason']end;
 if fields is null or p_args is null or jsonb_typeof(p_args)<>'object' or(select count(*)from jsonb_object_keys(p_args))<>cardinality(fields) or not p_args?&fields then raise exception 'mentoring_invalid';end if;
 if p_action not in('list','create')then sid:=(p_args->>'session_id')::uuid;if sid is null then raise exception 'mentoring_invalid';end if;end if;
 perform quantum_private.hosted_mentoring_lock(sid,actor);
 perform quantum_private.assert_activity_room_access(actor);
 if p_action='list' then
  select coalesce(jsonb_agg(quantum_private.hosted_mentoring_summary(id,actor)order by mine desc,created_at desc,id),'[]')into result from(
   select r.*,exists(select 1 from quantum_private.group_mentoring_members m where m.session_id=r.id and m.user_id=actor and m.accepted and m.left_at is null)mine
    from quantum_private.group_mentoring_sessions r where r.recruitment_mode='hosted'
     and((r.status='active' and r.expires_at>clock_timestamp() and quantum_private.hosted_mentoring_room_eligible(r.id,actor))
      or exists(select 1 from quantum_private.group_mentoring_members m where m.session_id=r.id and m.user_id=actor and m.accepted and m.left_at is null))
    order by mine desc,r.created_at desc,r.id limit 100)rooms;
  return jsonb_build_object('owner_id',actor,'rooms',result);
 elsif p_action='create' then
  if jsonb_typeof(p_args->'title')is distinct from 'string' or char_length(btrim(p_args->>'title')) not between 1 and 60 or jsonb_typeof(p_args->'topic')is distinct from 'string' or p_args->>'topic' not in('courses','career','campus') or jsonb_typeof(p_args->'role')is distinct from 'string' or p_args->>'role' not in('mentor','mentee') or jsonb_typeof(p_args->'side_size')is distinct from 'number' or p_args->>'side_size' not in('2','3') then raise exception 'mentoring_invalid';end if;
  key:=(p_args->>'client_id')::uuid;if key is null then raise exception 'mentoring_invalid';end if;
  select * into s from quantum_private.group_mentoring_sessions where creation_owner_id=actor and creation_key=key and recruitment_mode='hosted';
  if found then if s.creation_args<>p_args then raise exception 'mentoring_conflict';end if;return quantum_private.hosted_mentoring_detail(s.id,actor);end if;
  select * into ident from quantum_private.get_member_department_identity(actor);if ident.school_scope_key is null or ident.department_key is null then raise exception 'mentoring_profile_required';end if;
  if exists(select 1 from quantum_private.group_mentoring_members m join quantum_private.group_mentoring_sessions r on r.id=m.session_id where m.user_id=actor and m.accepted and m.left_at is null and r.recruitment_mode='hosted' and r.status='active' and r.expires_at>clock_timestamp())
   or exists(select 1 from quantum_private.group_mentoring_party_members m join quantum_private.group_mentoring_parties p on p.id=m.party_id where m.user_id=actor and m.active and p.status in('friends','waiting','offered','active') and p.expires_at>clock_timestamp())
   or exists(select 1 from quantum_private.mentoring_waiters where user_id=actor and status in('offered','active')and expires_at>clock_timestamp())then raise exception 'mentoring_already_active';end if;
  if(select count(*)from quantum_private.group_mentoring_sessions where creation_owner_id=actor and created_at>clock_timestamp()-interval '1 hour')>=6 then raise exception 'mentoring_rate_limited';end if;
  update quantum_private.group_mentoring_members m set left_at=clock_timestamp() from quantum_private.group_mentoring_sessions r where m.session_id=r.id and m.user_id=actor and m.party_id is null and m.left_at is null and(r.status<>'active'or r.expires_at<=clock_timestamp());
  insert into quantum_private.group_mentoring_sessions(side_size,school_key,department_key,status,expires_at,recruitment_mode,host_user_id,title,topic,department_label,creation_owner_id,creation_key,creation_args)
   values((p_args->>'side_size')::integer,ident.school_scope_key,ident.department_key,'active',clock_timestamp()+interval '14 days','hosted',actor,btrim(p_args->>'title'),p_args->>'topic',(select department from quantum_private.community_member_profiles where user_id=actor),actor,key,p_args)returning id into sid;
  insert into quantum_private.group_mentoring_members(session_id,party_id,user_id,role,alias,accepted) values(sid,null,actor,p_args->>'role',case when p_args->>'role'='mentor' then '멘토 1' else '멘티 1'end,true);
  return quantum_private.hosted_mentoring_detail(sid,actor);
 end if;
 select * into s from quantum_private.group_mentoring_sessions where id=sid and recruitment_mode='hosted';if not found then raise exception 'mentoring_not_found';end if;
 select * into own from quantum_private.group_mentoring_members where session_id=sid and user_id=actor and accepted;
 select array_agg(u)into people from(select actor u union select user_id from quantum_private.group_mentoring_members where session_id=sid and accepted and left_at is null)a;
 perform quantum_private.group_mentoring_lock_pairs(people);
 if p_action='status'then return quantum_private.hosted_mentoring_detail(sid,actor);end if;
 if own.id is null then raise exception 'mentoring_forbidden';end if;
 if p_action not in('leave','report')and not quantum_private.hosted_mentoring_member_current(sid,actor)then raise exception 'mentoring_forbidden';end if;
 if p_action='message'then
  body:=btrim(p_args->>'text');key:=(p_args->>'client_id')::uuid;
  if jsonb_typeof(p_args->'text')<>'string'or body is null or char_length(body)not between 1 and 1000 or key is null then raise exception 'mentoring_invalid';end if;
  if exists(select 1 from quantum_private.group_mentoring_messages m where m.session_id=sid and m.author_id=actor and m.client_id=key and m.body<>btrim(p_args->>'text'))then raise exception 'mentoring_conflict';end if;
  if not exists(select 1 from quantum_private.group_mentoring_messages where session_id=sid and author_id=actor and client_id=key)then
   if(select count(*)from quantum_private.group_mentoring_messages where author_id=actor and created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'mentoring_rate_limited';end if;
   insert into quantum_private.group_mentoring_messages(session_id,author_id,client_id,body)values(sid,actor,key,body);
  end if;
 elsif p_action='plan'then
  body:=btrim(p_args->>'place');stamp:=(p_args->>'starts_at')::timestamptz;
  if jsonb_typeof(p_args->'place')<>'string' or char_length(body)not between 1 and 160 or jsonb_typeof(p_args->'starts_at')<>'string' or stamp is null or stamp<=clock_timestamp() or stamp>=s.expires_at or jsonb_typeof(p_args->'revision')<>'number'then raise exception 'mentoring_invalid';end if;
  if(p_args->>'revision')::integer is distinct from s.plan_revision then raise exception 'mentoring_conflict';end if;
  update quantum_private.group_mentoring_sessions set meeting_at=stamp,meeting_place=body,plan_revision=plan_revision+1,revision=revision+1 where id=sid;
 elsif p_action in('leave','report')then
  if p_action='report'then
   body:=btrim(p_args->>'reason');if jsonb_typeof(p_args->'reason')<>'string' or char_length(body)not between 1 and 2000 then raise exception 'mentoring_invalid';end if;
   select * into other from quantum_private.group_mentoring_members where id=(p_args->>'member_id')::uuid and session_id=sid and user_id<>actor and accepted and joined_at<=coalesce(own.left_at,clock_timestamp())and coalesce(left_at,clock_timestamp())>=own.joined_at;
   if not found then raise exception 'mentoring_forbidden';end if;
   perform quantum_private.group_mentoring_lock_pairs(array[actor,other.user_id]);
   insert into quantum_private.group_mentoring_reports(session_id,reporter_id,reported_id,reason)values(sid,actor,other.user_id,body)on conflict(session_id,reporter_id,reported_id)do nothing;
  end if;
  if own.left_at is null then
   update quantum_private.group_mentoring_members set left_at=clock_timestamp()where id=own.id;
   if s.host_user_id=actor then
    select user_id into person from quantum_private.group_mentoring_members where session_id=sid and accepted and left_at is null and quantum_private.mentoring_member_eligible(user_id,s.school_key,s.department_key)order by joined_at,id limit 1;
    update quantum_private.group_mentoring_sessions set host_user_id=person,status=case when person is null then 'ended'else status end,revision=revision+1 where id=sid;
   else update quantum_private.group_mentoring_sessions set revision=revision+1 where id=sid;end if;
  end if;
 end if;
 return quantum_private.hosted_mentoring_detail(sid,actor);
end $$;
create function public.mentoring_hosted_action(p_action text,p_args jsonb default '{}')returns jsonb
language sql volatile security definer set search_path='' as $$select quantum_private.mentoring_hosted_action(p_action,p_args)$$;

-- Preserve legacy consent/message/report behavior, without any new auto group.
-- Transform exactly the known auto-composition section; fail closed on drift.
do $$declare definition text;start_at integer;end_at integer;needle text;begin
 select pg_get_functiondef('quantum_private.group_mentoring_action(text,jsonb)'::regprocedure)into definition;
 needle:='  if party.status=''waiting'' then';start_at:=strpos(definition,needle);
 end_at:=strpos(substr(definition,start_at),E'\n  select p.* into party from quantum_private.group_mentoring_parties p join quantum_private.group_mentoring_party_members m on m.party_id=p.id\n    where m.user_id=actor and m.accepted order by m.active desc,p.created_at desc,p.id desc limit 1;');
 if start_at=0 or end_at=0 then raise exception 'hosted_mentoring_legacy_definition_drift';end if;
 definition:=substr(definition,1,start_at-1)||E'  -- New auto-composition intentionally retired.\n'||substr(definition,start_at+end_at-1);
 if strpos(definition,'where status in (''offered'',''active'') and expires_at<=ts;')=0 or strpos(definition,'where s.status in (''offered'',''active'') and (')=0 then raise exception 'hosted_mentoring_legacy_cleanup_drift';end if;
 definition:=replace(definition,'where status in (''offered'',''active'') and expires_at<=ts;','where recruitment_mode=''legacy'' and status in (''offered'',''active'') and expires_at<=ts;');
 definition:=replace(definition,'where s.status in (''offered'',''active'') and (','where s.recruitment_mode=''legacy'' and s.status in (''offered'',''active'') and (');
 execute definition;
end $$;
alter function quantum_private.group_mentoring_action(text,jsonb) rename to group_mentoring_preserved_action;
create function quantum_private.group_mentoring_action(p_action text,p_args jsonb default '{}')returns jsonb
language plpgsql volatile security definer set search_path='' as $$begin
 if auth.uid()is null then raise exception 'not_authenticated';end if;
 if p_action='join'then raise exception 'mentoring_approval_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('group-mentoring:v1',0));
 if p_action in('party_accept','accept')and exists(select 1 from quantum_private.group_mentoring_members m join quantum_private.group_mentoring_sessions s on s.id=m.session_id where m.user_id=auth.uid()and m.accepted and m.left_at is null and s.recruitment_mode='hosted'and s.status='active'and s.expires_at>clock_timestamp())then raise exception 'mentoring_already_waiting';end if;
 if p_args?'session_id'and exists(select 1 from quantum_private.group_mentoring_sessions where id=(p_args->>'session_id')::uuid and recruitment_mode='hosted')then raise exception 'mentoring_approval_required';end if;
 return quantum_private.group_mentoring_preserved_action(p_action,p_args);
end $$;
create or replace function public.mentoring_group_action(p_action text,p_args jsonb default '{}')returns jsonb
language sql volatile security definer set search_path='' as $$select quantum_private.group_mentoring_action(p_action,p_args)$$;

-- A partial hosted room is already a chat room. Existing legacy gates remain.
alter function quantum_private.social_chat_room_authorized_base(text,uuid,uuid)rename to social_chat_room_before_hosted_mentoring;
create function quantum_private.social_chat_room_authorized_base(p_kind text,p_id uuid,p_actor uuid)returns jsonb
language plpgsql volatile security definer set search_path='' as $$declare result jsonb;s quantum_private.group_mentoring_sessions%rowtype;begin
 if p_kind='mentoring'then
  select * into s from quantum_private.group_mentoring_sessions where id=p_id;
  if s.recruitment_mode='hosted'then
   if not quantum_private.hosted_mentoring_member_current(p_id,p_actor)then return null;end if;
   return jsonb_build_object('kind','mentoring','id',p_id,'title',s.title,'affiliation',s.department_label,'member_count',(select count(*)from quantum_private.group_mentoring_members where session_id=p_id and accepted and left_at is null),'writable',true,
    'updated_at',greatest(s.created_at,(select max(created_at)from quantum_private.group_mentoring_messages where session_id=p_id)),'recruitment_mode','hosted');
  end if;
  result:=quantum_private.social_chat_room_before_hosted_mentoring(p_kind,p_id,p_actor);
  return case when result is null then null else result||jsonb_build_object('recruitment_mode','legacy')end;
 end if;
 return quantum_private.social_chat_room_before_hosted_mentoring(p_kind,p_id,p_actor);
end $$;

revoke all on function quantum_private.hosted_mentoring_lock(uuid,uuid),quantum_private.hosted_mentoring_room_eligible(uuid,uuid),quantum_private.hosted_mentoring_member_current(uuid,uuid),
 quantum_private.hosted_mentoring_target(uuid,uuid),quantum_private.hosted_mentoring_admit(uuid,uuid,jsonb),quantum_private.hosted_mentoring_summary(uuid,uuid),quantum_private.hosted_mentoring_detail(uuid,uuid),
 quantum_private.mentoring_hosted_action(text,jsonb),public.mentoring_hosted_action(text,jsonb),quantum_private.group_mentoring_preserved_action(text,jsonb),quantum_private.group_mentoring_action(text,jsonb),
 quantum_private.social_chat_room_before_hosted_mentoring(text,uuid,uuid),quantum_private.social_chat_room_authorized_base(text,uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.mentoring_hosted_action(text,jsonb)to authenticated;
commit;
