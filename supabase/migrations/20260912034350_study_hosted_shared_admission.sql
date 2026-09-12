-- Forward-only native study extension. Existing hostless rooms/history remain intact.
-- Creator chooses a room explicitly; no automatic admission or spare-room creation.
begin;
alter table quantum_private.study_rooms
 add column admission_mode text not null default 'legacy_auto' check(admission_mode in('legacy_auto','hosted')),
 add column host_user_id uuid references public.users(id) on delete set null,
 add column title text check(char_length(title) between 1 and 60),
 add column creation_client_id uuid,
 add column creation_snapshot jsonb,
 add column revision integer not null default 0 check(revision>=0),
 add column recruitment_closed boolean not null default false;
create unique index study_hosted_creation_replay on quantum_private.study_rooms(host_user_id,creation_client_id) where admission_mode='hosted';

create function quantum_private.hosted_study_scope(p_room uuid,p_user uuid)returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from quantum_private.study_rooms r join quantum_private.study_room_pools p on p.id=r.pool_id
 join quantum_private.get_member_department_identity(p_user)i on i.school_scope_key=p.school_key and i.department_key=p.department_key
 where r.id=p_room and not quantum_private.account_deletion_blocks_access(p_user)
 and exists(select 1 from auth.users u where u.id=p_user and u.deleted_at is null and(u.banned_until is null or u.banned_until<=clock_timestamp()))
 and exists(select 1 from quantum_private.resolve_profile_readiness(p_user)x where x.minimum_signup_complete)),false)
$$;
create function quantum_private.hosted_study_member_current(p_room uuid,p_user uuid)returns boolean
language sql stable security definer set search_path='' as $$
 select quantum_private.hosted_study_scope(p_room,p_user) and exists(select 1 from quantum_private.study_room_members where room_id=p_room and user_id=p_user and left_at is null)
 and not exists(select 1 from quantum_private.study_room_members where room_id=p_room and left_at is null and quantum_private.tonight_invite_pair_is_blocked(p_user,user_id))
$$;
-- Recruitment and paid intake must agree even if a former host's row remains.
-- This does not close an existing member's conversation or rewrite its sessions.
create function quantum_private.hosted_study_recruitment_closed(p_room uuid)returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select r.completed or r.recruitment_closed or not quantum_private.hosted_study_member_current(r.id,r.host_user_id)
 from quantum_private.study_rooms r where r.id=p_room and r.admission_mode='hosted'),true)
$$;
create function quantum_private.hosted_study_target(p_room uuid,p_actor uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare r quantum_private.study_rooms%rowtype;p quantum_private.study_room_pools%rowtype;n integer;begin
 perform quantum_private.assert_activity_room_access(p_actor);
 select * into r from quantum_private.study_rooms where id=p_room and admission_mode='hosted';
 if r.id is null or not quantum_private.hosted_study_scope(p_room,p_actor)then raise exception 'study_room_not_found';end if;
 if exists(select 1 from quantum_private.study_room_members where room_id=p_room and left_at is null and quantum_private.tonight_invite_pair_is_blocked(p_actor,user_id))then raise exception 'admission_pair_blocked';end if;
 select * into p from quantum_private.study_room_pools where id=r.pool_id;
 select count(*)into n from quantum_private.study_room_members m where room_id=p_room and left_at is null and quantum_private.hosted_study_scope(p_room,m.user_id);
 return jsonb_build_object('kind','study','id',r.id,'title',r.title,'host_user_id',r.host_user_id,'school_key',p.school_key,'department_key',p.department_key,
 'capacity',5,'member_count',n,'revision',r.revision,'status',case when quantum_private.hosted_study_recruitment_closed(p_room)then 'closed'when n>=5 then 'full'else 'open'end,
 'joined',quantum_private.hosted_study_member_current(p_room,p_actor));
end$$;
alter function quantum_private.study_room_summary(uuid,uuid)rename to study_room_legacy_summary;
create function quantum_private.study_room_summary(p_room uuid,p_actor uuid)returns jsonb
language sql stable security definer set search_path='' as $$
 select quantum_private.study_room_legacy_summary(p_room,p_actor)||jsonb_build_object('admission_mode',r.admission_mode,'title',coalesce(r.title,p.course_name||' '||r.room_number||'번 방'),'is_host',coalesce(r.host_user_id=p_actor,false))
 ||case when r.admission_mode='hosted'then jsonb_build_object('recruitment_closed',quantum_private.hosted_study_recruitment_closed(r.id),
 'member_count',(select count(*)from quantum_private.study_room_members m where m.room_id=r.id and m.left_at is null and quantum_private.hosted_study_scope(r.id,m.user_id)),
 'status',case when r.completed then 'completed'when(select count(*)from quantum_private.study_room_members m where m.room_id=r.id and m.left_at is null and quantum_private.hosted_study_scope(r.id,m.user_id))>=5 then 'full'else 'recruiting'end)else '{}'::jsonb end
 from quantum_private.study_rooms r join quantum_private.study_room_pools p on p.id=r.pool_id where r.id=p_room
$$;
alter function quantum_private.study_room_detail(uuid,uuid)rename to study_room_legacy_detail;
create function quantum_private.study_room_detail(p_room uuid,p_actor uuid)returns jsonb
language sql stable security definer set search_path='' as $$
 select quantum_private.study_room_legacy_detail(p_room,p_actor)||case when r.admission_mode='hosted'then jsonb_build_object('members',
 (select coalesce(jsonb_agg(jsonb_build_object('member_id',m.id,'alias',m.alias,'is_me',m.user_id=p_actor)order by m.joined_at),'[]'::jsonb)from quantum_private.study_room_members m where m.room_id=p_room and m.left_at is null and quantum_private.hosted_study_scope(p_room,m.user_id)))else '{}'::jsonb end
 from quantum_private.study_rooms r where r.id=p_room
$$;

create function quantum_private.hosted_study_admit(p_room uuid,p_applicant uuid,p_metadata jsonb)returns void
language plpgsql security definer set search_path='' as $$
declare r quantum_private.study_rooms%rowtype;t jsonb;alias_base text;alias_text text;suffix integer:=1;stale record;
begin
 if p_metadata is distinct from '{}'::jsonb then raise exception 'invalid_admission_metadata';end if;
 select * into r from quantum_private.study_rooms where id=p_room for update;
 t:=quantum_private.hosted_study_target(p_room,p_applicant);
 if(t->>'joined')::boolean then raise exception 'meetup_already_joined';end if;
 if t->>'status'='closed'then raise exception 'meetup_closed';end if;
 if t->>'status'='full'then raise exception 'meetup_full';end if;
 if exists(select 1 from quantum_private.study_room_members where pool_id=r.pool_id and user_id=p_applicant and left_at is null)then raise exception 'study_room_already_joined';end if;
 -- Retire no-longer-eligible seats, preserving messages/recaps. This uses the same
 -- current-scope predicate as display/capacity and the existing leave cleanup.
 for stale in select user_id from quantum_private.study_room_members m where room_id=p_room and left_at is null and not quantum_private.hosted_study_scope(p_room,m.user_id)loop
  update quantum_private.study_room_members set left_at=clock_timestamp()where room_id=p_room and user_id=stale.user_id;
  update quantum_private.study_room_attendance set attending=false,proposal_id=null,schedule_confirmed=false,completion_confirmed=false
  where room_id=p_room and user_id=stale.user_id and session_number>=r.current_session
  and exists(select 1 from quantum_private.study_room_sessions s where s.room_id=p_room and s.session_number=study_room_attendance.session_number and s.status<>'completed');
 end loop;
 alias_base:=quantum_private.get_or_create_daily_identity(p_applicant,clock_timestamp())->>'display_name';
 if alias_base is null then raise exception 'profile_required';end if;alias_text:=alias_base;
 while exists(select 1 from quantum_private.study_room_members where room_id=p_room and alias=alias_text and user_id<>p_applicant)loop suffix:=suffix+1;alias_text:=alias_base||'·'||suffix::text;end loop;
 insert into quantum_private.study_room_members(pool_id,room_id,user_id,alias,joined_session)
 values(r.pool_id,p_room,p_applicant,alias_text,r.current_session)on conflict(room_id,user_id)do update set left_at=null,joined_at=clock_timestamp(),joined_session=excluded.joined_session;
 update quantum_private.study_rooms set revision=revision+1 where id=p_room;
end$$;

alter function quantum_private.study_room_action(text,jsonb)rename to study_room_legacy_action;
-- A fresh session can call leave first. Do not let SQL expression preparation
-- dereference the intentionally unassigned department record on that branch.
do $$declare definition text;old_guard text:=$guard$if p_action<>'leave' and (v_pool.school_key<>v_identity.school_scope_key or v_pool.department_key<>v_identity.department_key) then raise exception 'study_room_forbidden' using errcode='42501'; end if;$guard$;begin
 definition:=pg_get_functiondef('quantum_private.study_room_legacy_action(text,jsonb)'::regprocedure);
 if position(old_guard in definition)=0 then raise exception 'study_leave_guard_contract_changed';end if;
 definition:=replace(definition,old_guard,$guard$if p_action<>'leave' then
  if v_pool.school_key<>v_identity.school_scope_key or v_pool.department_key<>v_identity.department_key then raise exception 'study_room_forbidden' using errcode='42501';end if;
 end if;$guard$);
 execute definition;
end$$;
create function quantum_private.study_room_action(p_action text,p_args jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();identity_row record;p quantum_private.study_room_pools%rowtype;r quantum_private.study_rooms%rowtype;
 course text;course_name text;level_value text;room_name text;client uuid;snapshot jsonb;result jsonb;rid uuid;alias_text text;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 if p_args is null or jsonb_typeof(p_args)<>'object'or octet_length(p_args::text)>16000 then raise exception 'invalid_request';end if;
 if p_action='create'then raise exception 'hosted_creation_required';end if;
 if p_action='join'then
  begin rid:=(p_args->>'room_id')::uuid;exception when invalid_text_representation then raise exception 'invalid_room_id';end;
  if not quantum_private.hosted_study_member_current(rid,actor)then raise exception 'admission_required';end if;
  return quantum_private.study_room_legacy_action('detail',p_args);
 end if;
 if p_action<>'create_hosted'then
  result:=quantum_private.study_room_legacy_action(p_action,p_args);
  if p_action='list'then
   select jsonb_build_object('rooms',coalesce(jsonb_agg(item),'[]'::jsonb))into result from jsonb_array_elements(result->'rooms')item
   where (item->>'joined')::boolean or(item->>'admission_mode'='hosted'and not coalesce((item->>'recruitment_closed')::boolean,true));
  end if;return result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||actor::text,0));
 perform quantum_private.assert_activity_room_access(actor);
 if exists(select 1 from jsonb_object_keys(p_args)k where k not in('course_id','course_name','level','title','client_id'))then raise exception 'invalid_request';end if;
 course:=p_args->>'course_id';level_value:=p_args->>'level';room_name:=btrim(p_args->>'title');
 if jsonb_typeof(p_args->'title')is distinct from 'string'or char_length(room_name)not between 1 and 60 or room_name~'[[:cntrl:]]'then raise exception 'invalid_room_title';end if;
 if level_value is null or level_value not in('beginner','intermediate','advanced')then raise exception 'invalid_level';end if;
 begin client:=(p_args->>'client_id')::uuid;exception when invalid_text_representation then raise exception 'invalid_idempotency_key';end;
 if client is null then raise exception 'invalid_idempotency_key';end if;
 if course='custom'then
  course_name:=regexp_replace(btrim(p_args->>'course_name'),'[[:space:]]+',' ','g');
  if course_name is null or char_length(course_name)not between 1 and 80 then raise exception 'invalid_course_name';end if;
  course:='custom:'||md5(lower(regexp_replace(course_name,'[[:space:]]','','g')));
 else select c.course_name into course_name from quantum_private.study_course_catalog c where c.course_id=course;if course_name is null then raise exception 'invalid_course_id';end if;end if;
 select * into identity_row from quantum_private.get_member_department_identity(actor);if not found then raise exception 'department_identity_required';end if;
 snapshot:=jsonb_build_object('course_id',course,'course_name',course_name,'level',level_value,'title',room_name,'school_key',identity_row.school_scope_key,'department_key',identity_row.department_key);
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||actor::text,0));
 select * into r from quantum_private.study_rooms where host_user_id=actor and creation_client_id=client and admission_mode='hosted';
 if r.id is not null then
  if r.creation_snapshot<>snapshot then raise exception 'idempotency_key_reused';end if;
  if not quantum_private.hosted_study_member_current(r.id,actor)then raise exception 'study_room_closed';end if;
  return quantum_private.study_room_detail(r.id,actor);
 end if;
 if(select count(*)from quantum_private.study_rooms where host_user_id=actor and created_at>clock_timestamp()-interval '1 hour')>=6 then raise exception 'study_rate_limited';end if;
 perform pg_advisory_xact_lock(hashtextextended('study-pool|'||identity_row.school_scope_key||'|'||identity_row.department_key||'|'||course||'|'||level_value,0));
 insert into quantum_private.study_room_pools(school_key,department_key,department_label,course_id,course_name,level)
 select identity_row.school_scope_key,identity_row.department_key,m.department,course,course_name,level_value from quantum_private.community_member_profiles m where m.user_id=actor
 on conflict(school_key,department_key,course_id,level)do nothing;
 select * into p from quantum_private.study_room_pools where school_key=identity_row.school_scope_key and department_key=identity_row.department_key and course_id=course and level=level_value for update;
 if exists(select 1 from quantum_private.study_room_members where pool_id=p.id and user_id=actor and left_at is null)then raise exception 'study_room_already_joined';end if;
 insert into quantum_private.study_rooms(pool_id,room_number,admission_mode,host_user_id,title,creation_client_id,creation_snapshot)
 select p.id,coalesce(max(room_number),0)+1,'hosted',actor,room_name,client,snapshot from quantum_private.study_rooms where pool_id=p.id returning * into r;
 insert into quantum_private.study_room_sessions(room_id,session_number)select r.id,n from generate_series(1,10)n;
 alias_text:=quantum_private.get_or_create_daily_identity(actor,clock_timestamp())->>'display_name';if alias_text is null then raise exception 'profile_required';end if;
 insert into quantum_private.study_room_members(pool_id,room_id,user_id,alias,joined_session)values(p.id,r.id,actor,alias_text,1);
 return quantum_private.study_room_detail(r.id,actor);
end$$;
-- The invoker wrapper needs the guarded entry, never the renamed legacy intake.
revoke all on function quantum_private.study_room_legacy_action(text,jsonb),quantum_private.study_room_legacy_summary(uuid,uuid),quantum_private.study_room_legacy_detail(uuid,uuid),quantum_private.study_room_detail(uuid,uuid),quantum_private.hosted_study_scope(uuid,uuid),quantum_private.hosted_study_member_current(uuid,uuid),quantum_private.hosted_study_recruitment_closed(uuid),quantum_private.hosted_study_target(uuid,uuid),quantum_private.hosted_study_admit(uuid,uuid,jsonb),quantum_private.study_room_summary(uuid,uuid),quantum_private.study_room_action(text,jsonb)from public,anon,authenticated,service_role;
grant execute on function quantum_private.study_room_action(text,jsonb)to authenticated;
commit;
