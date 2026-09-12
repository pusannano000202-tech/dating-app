-- Opt-in discovery only. This migration never writes membership or payment state.
begin;
create table quantum_private.meetup_candidates(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.users(id)on delete cascade,
 scope_kind text not null check(scope_kind in('league','study','mentoring','meetup')),scope_key text not null,
 school_key text not null,department_key text,positions text[]not null default '{}',tier text,
 intro text not null default ''check(char_length(intro)<=200),availability text not null check(char_length(availability)between 1 and 100),
 status text not null default 'waiting'check(status in('waiting','joining','joined','cancelled')),revision integer not null default 0,
 joining_until timestamptz,last_room_id uuid,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(owner_id,scope_kind,scope_key)
);
create index meetup_candidate_discovery on quantum_private.meetup_candidates(scope_kind,scope_key,school_key,department_key,id)where status in('waiting','joining');
create table quantum_private.candidate_board_invites(
 id uuid primary key default gen_random_uuid(),candidate_id uuid not null references quantum_private.meetup_candidates(id)on delete cascade,
 sender_id uuid not null references public.users(id)on delete cascade,room_id uuid not null,slot text,
 status text not null default 'pending'check(status in('pending','joining','joined','declined','cancelled')),revision integer not null default 0,
 joining_until timestamptz,created_at timestamptz not null default clock_timestamp()
);
create unique index candidate_invite_active_room on quantum_private.candidate_board_invites(candidate_id,room_id,coalesce(slot,''))where status in('pending','joining');
create index candidate_invite_sender on quantum_private.candidate_board_invites(sender_id,created_at desc);
create table quantum_private.candidate_board_requests(
 actor_id uuid not null references public.users(id)on delete cascade,idempotency_key uuid not null,request_hash text not null,
 invite_id uuid references quantum_private.candidate_board_invites(id)on delete set null,result_status text not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,idempotency_key)
);
create table quantum_private.candidate_board_notification_sources(
 nid uuid primary key references public.notifications(id)on delete cascade,invite_id uuid not null references quantum_private.candidate_board_invites(id)on delete cascade,
 recipient_id uuid not null references public.users(id)on delete cascade,event text not null,unique(invite_id,recipient_id,event)
);
alter table quantum_private.meetup_candidates enable row level security;
alter table quantum_private.candidate_board_invites enable row level security;
alter table quantum_private.candidate_board_requests enable row level security;
alter table quantum_private.candidate_board_notification_sources enable row level security;
revoke all on quantum_private.meetup_candidates,quantum_private.candidate_board_invites,quantum_private.candidate_board_requests,quantum_private.candidate_board_notification_sources from public,anon,authenticated,service_role;

create function quantum_private.candidate_scope_valid(k text,q text)returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(q~'^[A-Za-z0-9:_-]{1,100}$'and case k
 when 'league'then q in('lol','futsal','football')when 'study'then exists(select 1 from quantum_private.study_course_catalog where course_id=q)
 when 'mentoring'then q in('courses','career','campus')when 'meetup'then exists(select 1 from unnest(array['running','badminton','basketball','tennis','board_game','gaming','hiking','dining','other','walking','study'])c where quantum_private.meetup_activity_key_valid(c,q))else false end,false)
$$;
create function quantum_private.candidate_positions(k text,q text)returns text[]language sql immutable set search_path='' as $$
 select case when k='league'and q='lol'then array['top','jungle','mid','adc','support']when k='league'then array['goalkeeper','defender','midfielder','forward']when k='mentoring'then array['mentor','mentee']else '{}'::text[]end
$$;
create function quantum_private.candidate_person_current(u uuid)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=u and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()))
 and not quantum_private.account_deletion_blocks_access(u)and exists(select 1 from quantum_private.resolve_profile_readiness(u)where minimum_signup_complete)
$$;
create function quantum_private.candidate_scope_member(k text,q text,u uuid)returns uuid language plpgsql stable security definer set search_path='' as $$declare r uuid;begin
 if k='league'then select m.team_id into r from public.department_challenge_roster m join public.department_challenges c on c.id=m.challenge_id where m.user_id=u and m.status='accepted'and c.status in('recruiting','opponent_pending','scheduled')and quantum_private.challenge_journey_sport(c.id)=q and quantum_private.league_team_chat_access(m.team_id,u)order by m.accepted_at desc limit 1;
 elsif k='study'then select m.room_id into r from quantum_private.study_room_members m join quantum_private.study_room_pools p on p.id=m.pool_id join quantum_private.study_rooms room on room.id=m.room_id where m.user_id=u and m.left_at is null and p.course_id=q and not room.completed and quantum_private.hosted_study_member_current(m.room_id,u)order by m.joined_at desc limit 1;
 elsif k='mentoring'then select m.session_id into r from quantum_private.group_mentoring_members m join quantum_private.group_mentoring_sessions s on s.id=m.session_id where m.user_id=u and m.accepted and m.left_at is null and s.recruitment_mode='hosted'and s.topic=q and s.status='active'and s.expires_at>clock_timestamp()and quantum_private.hosted_mentoring_member_current(s.id,u)limit 1;
 else select m.meetup_id into r from public.activity_meetup_members m join public.activity_meetups room on room.id=m.meetup_id where m.user_id=u and m.status='joined'and room.status in('open','full')and room.activity_key=q and(room.ends_at is null or room.ends_at>clock_timestamp())and quantum_private.activity_meetup_scope_eligible(room.id,u)and quantum_private.admission_pair_clear(room.id,u)limit 1;end if;
 return r;
end$$;
create function quantum_private.candidate_current(cid uuid,viewer uuid)returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from quantum_private.meetup_candidates c cross join quantum_private.get_member_department_identity(c.owner_id)o cross join quantum_private.get_member_department_identity(viewer)v
 where c.id=cid and quantum_private.candidate_person_current(c.owner_id)and quantum_private.candidate_person_current(viewer)
 and o.school_scope_key=c.school_key and v.school_scope_key=c.school_key
 and(c.scope_kind='meetup'or(o.department_key=c.department_key and v.department_key=c.department_key))
 and not quantum_private.tonight_invite_pair_is_blocked(c.owner_id,viewer)
 and(c.scope_kind<>'league'or not exists(select 1 from quantum_private.challenge_restrictions x where x.user_id in(c.owner_id,viewer)and x.revoked_at is null and x.ends_at>clock_timestamp()))),false)
$$;
create function quantum_private.candidate_state(cid uuid)returns text language sql stable security definer set search_path='' as $$
 select case when not quantum_private.candidate_current(c.id,c.owner_id)then 'unavailable'when c.status='joining'and c.joining_until<=clock_timestamp()then 'waiting'else c.status end from quantum_private.meetup_candidates c where id=cid
$$;
create function quantum_private.candidate_chat_href(k text,r uuid)returns text language sql immutable set search_path='' as $$
 select case when r is null then null when k='league'then '/chat/league-team/'||r::text else '/chat/rooms/'||case k when 'study'then 'study_room'else k end||'/'||r::text end
$$;
create function quantum_private.candidate_apply_href(k text,r uuid,p text)returns text language sql immutable set search_path='' as $$
 select case k when 'study'then '/meetups/participation/study/'||r::text||'/apply'when 'mentoring'then '/meetups/participation/mentoring/'||r::text||'/apply?role='||p when 'meetup'then '/meetups/'||r::text||'/apply'else null end
$$;
-- Current target projection is shared by browse, sending and accepting. It is not admission.
create function quantum_private.candidate_room(k text,q text,r uuid,u uuid)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare t jsonb;s jsonb;host_id uuid;n integer;room public.activity_meetups%rowtype;begin
 if not quantum_private.candidate_person_current(u)then return null;end if;
 if k='league'then
  select jsonb_build_object('id',tm.id,'title',tm.team_name,'host_user_id',tm.captain_user_id,'capacity',c.team_capacity,'revision',c.revision)into t
  from public.department_challenge_teams tm join public.department_challenges c on c.id=tm.challenge_id where tm.id=r and c.status='recruiting'and quantum_private.challenge_recruitment_visible(tm.id,u,q);
  if t is null then return null;end if;s:=quantum_private.challenge_recruitment_slots(r,q);
  t:=t||jsonb_build_object('member_count',s->'accepted_count','slots',s->'empty_slots');
 elsif k='study'then
  if not exists(select 1 from quantum_private.study_rooms x join quantum_private.study_room_pools p on p.id=x.pool_id where x.id=r and p.course_id=q)then return null;end if;
  t:=quantum_private.hosted_study_target(r,u);if t->>'status'<>'open'then return null;end if;t:=t||jsonb_build_object('slots','[]'::jsonb);
 elsif k='mentoring'then
  if not exists(select 1 from quantum_private.group_mentoring_sessions where id=r and topic=q)then return null;end if;
  t:=quantum_private.hosted_mentoring_target(r,u);if t is null or t->>'status'<>'open'then return null;end if;
  t:=t||jsonb_build_object('slots',to_jsonb(array_remove(array[case when(t->>'mentor_count')::int<(t->>'role_capacity')::int then 'mentor'end,case when(t->>'mentee_count')::int<(t->>'role_capacity')::int then 'mentee'end],null)));
 else
  select *into room from public.activity_meetups where id=r and activity_key=q and status in('open','full')and(scheduled_at is null or scheduled_at>clock_timestamp());
  if room.id is null or not quantum_private.activity_meetup_scope_eligible(r,u)or quantum_private.meetup_gender_eligibility(u,room.gender_mode)<>'eligible'
   or not exists(select 1 from quantum_private.get_community_identity(u)x where x.school=room.school)or not quantum_private.admission_pair_clear(r,u)then return null;end if;
  if not exists(select 1 from public.activity_meetup_members m where m.meetup_id=r and m.user_id=room.host_user_id and m.status='joined'and quantum_private.activity_meetup_scope_eligible(r,m.user_id))then return null;end if;
  select count(*)into n from public.activity_meetup_members where meetup_id=r and status='joined'and quantum_private.activity_meetup_scope_eligible(r,user_id);
  t:=jsonb_build_object('id',r,'title',room.title,'host_user_id',room.host_user_id,'capacity',room.capacity,'member_count',n,'revision',room.revision,'slots','[]'::jsonb);
 end if;
 host_id:=(t->>'host_user_id')::uuid;
 if host_id is null or not quantum_private.candidate_person_current(host_id)or(t->>'member_count')::int>=(t->>'capacity')::int or quantum_private.tonight_invite_pair_is_blocked(u,host_id)then return null;end if;
 return jsonb_build_object('id',r,'title',t->'title','host_user_id',host_id,'capacity',t->'capacity','member_count',t->'member_count','revision',t->'revision','slots',t->'slots');
exception when raise_exception or insufficient_privilege then return null;
end$$;
create function quantum_private.candidate_invite_current(iid uuid,viewer uuid)returns boolean language plpgsql volatile security definer set search_path='' as $$
declare i quantum_private.candidate_board_invites%rowtype;c quantum_private.meetup_candidates%rowtype;t jsonb;begin
 select *into i from quantum_private.candidate_board_invites where id=iid;select *into c from quantum_private.meetup_candidates where id=i.candidate_id;
 if i.id is null or viewer not in(i.sender_id,c.owner_id)or not quantum_private.candidate_current(c.id,viewer)then return false;end if;
 if i.status='joined'then return coalesce(quantum_private.candidate_scope_member(c.scope_kind,c.scope_key,c.owner_id)=i.room_id,false);end if;
 if c.status not in('waiting','joining')or quantum_private.candidate_scope_member(c.scope_kind,c.scope_key,c.owner_id)is not null then return false;end if;
 t:=quantum_private.candidate_room(c.scope_kind,c.scope_key,i.room_id,c.owner_id);
 return t is not null and(t->>'host_user_id')::uuid=i.sender_id and(i.slot is null or t->'slots'?i.slot);
end$$;
create function quantum_private.candidate_row(cid uuid,viewer uuid)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c quantum_private.meetup_candidates%rowtype;state text;next_link text:=null;begin
 select *into c from quantum_private.meetup_candidates where id=cid;if c.id is null then return null;end if;
 state:=quantum_private.candidate_state(cid);
 if c.owner_id=viewer and state='joined'and quantum_private.candidate_scope_member(c.scope_kind,c.scope_key,c.owner_id)=c.last_room_id then next_link:=quantum_private.candidate_chat_href(c.scope_kind,c.last_room_id);
 elsif c.owner_id=viewer and state='joining'then select quantum_private.candidate_apply_href(c.scope_kind,i.room_id,i.slot)into next_link from quantum_private.candidate_board_invites i where i.candidate_id=cid and i.status='joining'and i.joining_until>clock_timestamp()and quantum_private.candidate_invite_current(i.id,viewer)limit 1;end if;
 return jsonb_build_object('id',c.id,'alias',coalesce(quantum_private.activity_meetup_alias(c.owner_id),'합류 후보'),'positions',c.positions,'tier',c.tier,'intro',c.intro,'availability',c.availability,'status',state,'revision',c.revision,'is_me',c.owner_id=viewer,'joining_until',case when state='joining'then c.joining_until end,'next_href',next_link);
end$$;
create function quantum_private.candidate_invite_row(iid uuid,viewer uuid)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare i quantum_private.candidate_board_invites%rowtype;c quantum_private.meetup_candidates%rowtype;t jsonb;state text;link text;begin
 select *into i from quantum_private.candidate_board_invites where id=iid;select *into c from quantum_private.meetup_candidates where id=i.candidate_id;
 if i.id is null or viewer not in(i.sender_id,c.owner_id)then return null;end if;
 state:=case when not quantum_private.candidate_invite_current(iid,viewer)then 'unavailable'when i.status='joining'and i.joining_until<=clock_timestamp()then 'pending'else i.status end;
 if state<>'unavailable'then t:=quantum_private.candidate_room(c.scope_kind,c.scope_key,i.room_id,viewer);end if;
 if c.owner_id=viewer and state='joining'then link:=quantum_private.candidate_apply_href(c.scope_kind,i.room_id,i.slot);
 elsif c.owner_id=viewer and state='joined'then link:=quantum_private.candidate_chat_href(c.scope_kind,i.room_id);end if;
 return jsonb_build_object('id',i.id,'candidate_id',c.id,'candidate_alias',case when state='unavailable'then '합류 후보'else coalesce(quantum_private.activity_meetup_alias(c.owner_id),'합류 후보')end,
 'room_id',i.room_id,'room_title',coalesce(t->>'title','참가 제안'),'slot',i.slot,'status',state,'revision',i.revision,'is_sender',i.sender_id=viewer,
 'joining_until',case when state='joining'then i.joining_until end,'next_href',link,'checkout_enabled',false);
end$$;
create function quantum_private.emit_candidate_board_notification(iid uuid,ev text,recipient uuid)returns void language plpgsql security definer set search_path='' as $$
declare i quantum_private.candidate_board_invites%rowtype;c quantum_private.meetup_candidates%rowtype;n uuid:=gen_random_uuid();heading text;begin
 select *into i from quantum_private.candidate_board_invites where id=iid;select *into c from quantum_private.meetup_candidates where id=i.candidate_id;
 if not quantum_private.candidate_current(c.id,recipient)or exists(select 1 from quantum_private.candidate_board_notification_sources where invite_id=iid and recipient_id=recipient and event=ev)then return;end if;
 heading:=case ev when 'invitation_received'then '모임 참가 제안이 도착했어요'when 'invitation_accepted'then '제안한 후보의 참가가 확정됐어요'else '참가 제안의 답변이 도착했어요'end;
 insert into public.notifications(id,user_id,kind,payload)values(n,recipient,'social_activity',jsonb_build_object('version',1,'domain',case c.scope_kind when 'study'then 'study_room'else c.scope_kind end,'event',ev,'entity_type','candidate_invite','entity_id',iid,'audience','participant','title',heading,'body','현재 참가 제안을 확인해 주세요.','context_label','합류 후보','status','current','href','/meetups/candidates?kind='||c.scope_kind||'&key='||replace(c.scope_key,':','%3A')||'&invite='||iid::text));
 insert into quantum_private.candidate_board_notification_sources values(n,iid,recipient,ev);
end$$;
create function quantum_private.candidate_notification_current(nid uuid,recipient uuid)returns boolean language plpgsql volatile security definer set search_path='' as $$declare x quantum_private.candidate_board_notification_sources%rowtype;i quantum_private.candidate_board_invites%rowtype;begin
 select *into x from quantum_private.candidate_board_notification_sources s where s.nid=$1 and s.recipient_id=$2;
 if x.nid is null or not exists(select 1 from public.notifications where id=$1 and user_id=$2)or quantum_private.candidate_invite_current(x.invite_id,recipient)is not true then return false;end if;
 select *into i from quantum_private.candidate_board_invites where id=x.invite_id;
 return case x.event when 'invitation_received'then i.status='pending'or(i.status='joining'and i.joining_until<=clock_timestamp())when 'invitation_accepted'then i.status='joined'when 'invitation_declined'then i.status='declined'else false end;
end$$;
create function quantum_private.candidate_notification_href(nid uuid,recipient uuid)returns text language plpgsql volatile security definer set search_path='' as $$declare c quantum_private.meetup_candidates%rowtype;iid uuid;begin
 if not quantum_private.candidate_notification_current(nid,recipient)then return null;end if;
 select n.invite_id into iid from quantum_private.candidate_board_notification_sources n where n.nid=$1 and n.recipient_id=$2;
 select x.*into c from quantum_private.candidate_board_invites i join quantum_private.meetup_candidates x on x.id=i.candidate_id where i.id=iid;
 return '/meetups/candidates?kind='||c.scope_kind||'&key='||replace(c.scope_key,':','%3A')||'&invite='||iid::text;
end$$;

create function quantum_private.candidate_board_projection(k text,q text,viewer uuid,filter_value text,cursor_id uuid,action_result jsonb default null)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare rows jsonb;total integer;filtered integer;more uuid;mine jsonb;incoming jsonb;outgoing jsonb;rooms jsonb;begin
 select count(*)into total from quantum_private.meetup_candidates c where c.scope_kind=k and c.scope_key=q and quantum_private.candidate_state(c.id)='waiting'and quantum_private.candidate_current(c.id,viewer);
 select count(*)into filtered from quantum_private.meetup_candidates c where c.scope_kind=k and c.scope_key=q and quantum_private.candidate_state(c.id)='waiting'and quantum_private.candidate_current(c.id,viewer)and(filter_value='all'or filter_value=any(c.positions));
 if cursor_id is not null and not exists(select 1 from quantum_private.meetup_candidates c where c.id=cursor_id and c.scope_kind=k and c.scope_key=q and quantum_private.candidate_current(c.id,viewer))then raise exception 'invalid_cursor';end if;
 select coalesce(jsonb_agg(quantum_private.candidate_row(c.id,viewer)order by c.id),'[]'::jsonb)into rows from(select c.*from quantum_private.meetup_candidates c where c.scope_kind=k and c.scope_key=q and quantum_private.candidate_state(c.id)='waiting'and quantum_private.candidate_current(c.id,viewer)and(filter_value='all'or filter_value=any(c.positions))and(cursor_id is null or c.id>cursor_id)order by c.id limit 20)c;
 if jsonb_array_length(rows)=20 and exists(select 1 from quantum_private.meetup_candidates c where c.scope_kind=k and c.scope_key=q and quantum_private.candidate_state(c.id)='waiting'and quantum_private.candidate_current(c.id,viewer)and(filter_value='all'or filter_value=any(c.positions))and c.id>(rows->19->>'id')::uuid)then more:=(rows->19->>'id')::uuid;end if;
 select quantum_private.candidate_row(id,viewer)into mine from quantum_private.meetup_candidates where owner_id=viewer and scope_kind=k and scope_key=q;
 select coalesce(jsonb_agg(quantum_private.candidate_invite_row(x.id,viewer)order by x.created_at desc),'[]')into incoming from(select i.*from quantum_private.candidate_board_invites i join quantum_private.meetup_candidates c on c.id=i.candidate_id where c.owner_id=viewer and c.scope_kind=k and c.scope_key=q order by i.created_at desc limit 100)x;
 select coalesce(jsonb_agg(quantum_private.candidate_invite_row(x.id,viewer)order by x.created_at desc),'[]')into outgoing from(select i.*from quantum_private.candidate_board_invites i join quantum_private.meetup_candidates c on c.id=i.candidate_id where i.sender_id=viewer and c.scope_kind=k and c.scope_key=q order by i.created_at desc limit 100)x;
 select coalesce(jsonb_agg(t-'host_user_id'),'[]')into rooms from(
 select quantum_private.candidate_room(k,q,id,viewer)t from(
 select id from public.department_challenge_teams where k='league'and captain_user_id=viewer
 union all select id from quantum_private.study_rooms where k='study'and host_user_id=viewer
 union all select id from quantum_private.group_mentoring_sessions where k='mentoring'and host_user_id=viewer
 union all select id from public.activity_meetups where k='meetup'and host_user_id=viewer)x limit 100)y where t is not null;
 return jsonb_build_object('owner_id',viewer,'scope',jsonb_build_object('kind',k,'key',q),'department_label',coalesce((select department from quantum_private.community_member_profiles where user_id=viewer),'내 학교'),'total_count',total,'filtered_count',filtered,'candidates',rows,'next_cursor',more,'mine',mine,'incoming',incoming,'outgoing',outgoing,'host_rooms',rooms,'result',action_result);
end$$;

create function quantum_private.meetup_candidate_board(p_action text,p_args jsonb)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();k text:=p_args->>'scope_kind';q text:=p_args->>'scope_key';allowed text[];ident record;
 c quantum_private.meetup_candidates%rowtype;i quantum_private.candidate_board_invites%rowtype;prior quantum_private.candidate_board_requests%rowtype;
cid uuid;iid uuid;v_room_id uuid;key uuid;hash text;person uuid;other uuid;role_value text;t jsonb;positions_value text[];expected integer;result_status text:='updated';next_link text:=null;begin
 if actor is null then raise exception 'not_authenticated';end if;
 if p_args is null or jsonb_typeof(p_args)<>'object'or octet_length(p_args::text)>4096 or not quantum_private.candidate_scope_valid(k,q)then raise exception 'invalid_candidate_scope';end if;
 allowed:=array['scope_kind','scope_key']||case p_action when 'overview'then array['filter','cursor']when 'register'then array['positions','tier','intro','availability','consent','expected_revision','idempotency_key']when 'cancel'then array['expected_revision','idempotency_key']when 'invite'then array['candidate_id','candidate_revision','room_id','room_revision','slot','idempotency_key']when 'accept'then array['invite_id','expected_revision','idempotency_key']when 'decline'then array['invite_id','expected_revision','idempotency_key']when 'release'then array['invite_id','expected_revision','idempotency_key']end;
 if allowed is null or not(p_args?&allowed)or(select count(*)from jsonb_object_keys(p_args))<>cardinality(allowed)then raise exception 'invalid_candidate_action';end if;
 if not quantum_private.candidate_person_current(actor)then raise exception 'candidate_account_unavailable';end if;
 select *into ident from quantum_private.get_member_department_identity(actor);if ident.school_scope_key is null then raise exception 'department_identity_required';end if;
 if p_action='overview'then
  if p_args->>'filter'<>'all'and not(p_args->>'filter'=any(quantum_private.candidate_positions(k,q)))then raise exception 'invalid_candidate_filter';end if;
  return quantum_private.candidate_board_projection(k,q,actor,p_args->>'filter',(p_args->>'cursor')::uuid);
 end if;
 key:=(p_args->>'idempotency_key')::uuid;if key is null then raise exception 'invalid_idempotency_key';end if;hash:=md5(p_action||':'||p_args::text);
 if p_action='invite'then cid:=(p_args->>'candidate_id')::uuid;select owner_id into other from quantum_private.meetup_candidates where id=cid;v_room_id:=(p_args->>'room_id')::uuid;
 elsif p_action in('accept','decline','release')then iid:=(p_args->>'invite_id')::uuid;select *into i from quantum_private.candidate_board_invites where id=iid;cid:=i.candidate_id;other:=i.sender_id;v_room_id:=i.room_id;
 else select id into cid from quantum_private.meetup_candidates where owner_id=actor and scope_kind=k and scope_key=q;end if;
 -- Same global->ordered-user->room->candidate ordering as native membership.
 if k='mentoring'then perform quantum_private.native_admission_global_lock(k);end if;
 for person in select distinct x from(select unnest(array[actor,other])x
  union select user_id from quantum_private.study_room_members where k='study'and room_id=v_room_id and left_at is null
  union select user_id from quantum_private.group_mentoring_members where k='mentoring'and session_id=v_room_id and left_at is null
  union select user_id from public.department_challenge_roster where k='league'and team_id=v_room_id and status='accepted'
  union select user_id from public.activity_meetup_members where k='meetup'and meetup_id=v_room_id and status='joined')people where x is not null order by x loop perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||person::text,0));end loop;
 perform pg_advisory_xact_lock(hashtextextended('candidate-request:'||actor::text||':'||key::text,0));
 if v_room_id is not null then
  if k='league'then perform 1 from public.department_challenges ch join public.department_challenge_teams tm on tm.challenge_id=ch.id where tm.id=v_room_id for update of ch,tm;
  elsif k='study'then perform quantum_private.native_admission_room_lock(k,v_room_id);
  elsif k='mentoring'then perform quantum_private.hosted_mentoring_lock(v_room_id,actor);
  else perform 1 from public.activity_meetups where id=v_room_id for update;end if;
 end if;
 -- A parallel first registration can have committed while this actor lock waited.
 -- Re-read its identity under that lock before evaluating the expected revision.
 if p_action in('register','cancel')then select id into cid from quantum_private.meetup_candidates where owner_id=actor and scope_kind=k and scope_key=q;end if;
 select *into c from quantum_private.meetup_candidates where id=cid for update;
 if iid is not null then select *into i from quantum_private.candidate_board_invites where id=iid for update;end if;
 if not quantum_private.candidate_person_current(actor)then raise exception 'candidate_account_unavailable';end if;
 select *into ident from quantum_private.get_member_department_identity(actor);if ident.school_scope_key is null then raise exception 'department_identity_required';end if;
 select *into prior from quantum_private.candidate_board_requests where actor_id=actor and idempotency_key=key;
 if prior.actor_id is not null then
  if prior.request_hash<>hash then raise exception 'idempotency_key_reused';end if;
  if prior.result_status='joining'and prior.invite_id is not null and quantum_private.candidate_invite_current(prior.invite_id,actor)then
   select quantum_private.candidate_apply_href(k,x.room_id,x.slot)into next_link from quantum_private.candidate_board_invites x where x.id=prior.invite_id and x.status='joining'and x.joining_until>clock_timestamp();end if;
  return quantum_private.candidate_board_projection(k,q,actor,'all',null,jsonb_build_object('status',case when next_link is not null then 'joining'when prior.result_status='preparation_required'then prior.result_status else 'updated'end,'next_href',next_link,'checkout_enabled',false));
 end if;
 if c.id is not null and(c.scope_kind<>k or c.scope_key<>q)then raise exception 'candidate_not_found';end if;
 if p_action='register'then
  if c.id is null and p_args->'expected_revision'<>'null'::jsonb or c.id is not null and(p_args->>'expected_revision')::integer is distinct from c.revision then raise exception 'stale_revision';end if;
  if quantum_private.candidate_scope_member(k,q,actor)is not null then raise exception 'candidate_already_joined';end if;
  if c.status='joining'and c.joining_until>clock_timestamp()then raise exception 'candidate_joining';end if;
  if jsonb_typeof(p_args->'positions')<>'array'or jsonb_array_length(p_args->'positions')>5 then raise exception 'invalid_candidate_positions';end if;
  select array_agg(x),count(distinct x)into positions_value,expected from jsonb_array_elements_text(p_args->'positions')x;
  positions_value:=coalesce(positions_value,'{}');
  if cardinality(positions_value)<>expected or not positions_value<@quantum_private.candidate_positions(k,q)or(cardinality(quantum_private.candidate_positions(k,q))=0)<>(cardinality(positions_value)=0)then raise exception 'invalid_candidate_positions';end if;
  if(k='league'and not coalesce(p_args->>'tier'=any(case q when 'lol'then array['iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger']else array['beginner','intermediate','advanced']end),false))or(k<>'league'and p_args->'tier'<>'null'::jsonb)then raise exception 'invalid_candidate_tier';end if;
  if p_args->'consent'<>'true'::jsonb or jsonb_typeof(p_args->'intro')<>'string'or char_length(p_args->>'intro')>200 or jsonb_typeof(p_args->'availability')<>'string'or char_length(btrim(p_args->>'availability'))not between 1 and 100 or ((p_args->>'intro')||(p_args->>'availability'))~U&'[[:cntrl:]\007F-\009F\200B-\200F\2028-\202E\2060-\206F\FEFF]'then raise exception 'invalid_candidate_registration';end if;
  insert into quantum_private.meetup_candidates(owner_id,scope_kind,scope_key,school_key,department_key,positions,tier,intro,availability)
  values(actor,k,q,ident.school_scope_key,case when k<>'meetup'then ident.department_key end,positions_value,p_args->>'tier',btrim(p_args->>'intro'),btrim(p_args->>'availability'))
  on conflict(owner_id,scope_kind,scope_key)do update set school_key=excluded.school_key,department_key=excluded.department_key,positions=excluded.positions,tier=excluded.tier,intro=excluded.intro,availability=excluded.availability,status='waiting',joining_until=null,last_room_id=null,revision=meetup_candidates.revision+1,updated_at=clock_timestamp()returning *into c;
  update quantum_private.candidate_board_invites set status='cancelled',revision=revision+1,joining_until=null where candidate_id=c.id and status in('pending','joining');
 elsif p_action='cancel'then
  if c.id is null or c.owner_id<>actor then raise exception 'candidate_not_found';end if;
  if c.revision is distinct from(p_args->>'expected_revision')::integer then raise exception 'stale_revision';end if;
  update quantum_private.meetup_candidates set status='cancelled',joining_until=null,revision=revision+1,updated_at=clock_timestamp()where id=c.id;
  update quantum_private.candidate_board_invites set status='cancelled',revision=revision+1,joining_until=null where candidate_id=c.id and status in('pending','joining');
 elsif p_action='invite'then
  if c.id is null or c.owner_id=actor or not quantum_private.candidate_current(c.id,actor)or quantum_private.candidate_state(c.id)<>'waiting'or quantum_private.candidate_scope_member(k,q,c.owner_id)is not null then raise exception 'candidate_not_available';end if;
  if c.revision is distinct from(p_args->>'candidate_revision')::integer then raise exception 'stale_revision';end if;
  t:=quantum_private.candidate_room(k,q,v_room_id,c.owner_id);
  if t is null or(t->>'host_user_id')::uuid<>actor then raise exception 'candidate_host_required';end if;
  if(t->>'revision')::integer is distinct from(p_args->>'room_revision')::integer then raise exception 'stale_revision';end if;
  role_value:=case when k='league'then quantum_private.challenge_slot_position(q,p_args->>'slot')when k='mentoring'then p_args->>'slot'end;
  if k in('league','mentoring')then
   if role_value is null or not(role_value=any(c.positions))or not(t->'slots'?(p_args->>'slot'))then raise exception 'candidate_slot_unavailable';end if;
  elsif p_args->'slot'<>'null'::jsonb then raise exception 'invalid_candidate_slot';end if;
  if exists(select 1 from quantum_private.candidate_board_invites x where x.candidate_id=c.id and x.room_id=v_room_id and coalesce(x.slot,'')=coalesce(p_args->>'slot','')and x.status in('pending','joining'))then raise exception 'candidate_already_invited';end if;
  if(select count(*)from quantum_private.candidate_board_invites where sender_id=actor and created_at>clock_timestamp()-interval '1 hour')>=30 then raise exception 'candidate_rate_limited';end if;
  insert into quantum_private.candidate_board_invites(candidate_id,sender_id,room_id,slot)values(c.id,actor,v_room_id,p_args->>'slot')returning *into i;iid:=i.id;
  perform quantum_private.emit_candidate_board_notification(iid,'invitation_received',c.owner_id);
 else
  if i.id is null or c.owner_id<>actor then raise exception 'candidate_invite_not_found';end if;
  if i.revision is distinct from(p_args->>'expected_revision')::integer then raise exception 'stale_revision';end if;
  if p_action='accept'then
   if i.status not in('pending','joining')or not quantum_private.candidate_invite_current(iid,actor)then raise exception 'candidate_invite_unavailable';end if;
   if c.status='joining'and c.joining_until>clock_timestamp()and not(i.status='joining'and i.joining_until=c.joining_until)then raise exception 'candidate_joining';end if;
   if k='league'then result_status:='preparation_required';
   else
    update quantum_private.candidate_board_invites set status='pending',revision=revision+1,joining_until=null where candidate_id=c.id and status='joining';
    update quantum_private.candidate_board_invites set status='joining',revision=revision+1,joining_until=clock_timestamp()+interval '15 minutes'where id=iid returning *into i;
    update quantum_private.meetup_candidates set status='joining',joining_until=i.joining_until,revision=revision+1,updated_at=clock_timestamp()where id=c.id;
    result_status:='joining';next_link:=quantum_private.candidate_apply_href(k,i.room_id,i.slot);
   end if;
  elsif p_action='decline'then
   if i.status not in('pending','joining')then raise exception 'candidate_invite_unavailable';end if;
   update quantum_private.candidate_board_invites set status='declined',revision=revision+1,joining_until=null where id=iid;
   if i.status='joining'and c.joining_until=i.joining_until then update quantum_private.meetup_candidates set status='waiting',joining_until=null,revision=revision+1,updated_at=clock_timestamp()where id=c.id;end if;
   perform quantum_private.emit_candidate_board_notification(iid,'invitation_declined',i.sender_id);
  else
   if i.status<>'joining'then raise exception 'candidate_invite_unavailable';end if;
   update quantum_private.candidate_board_invites set status='pending',revision=revision+1,joining_until=null where id=iid;
   if c.status='joining'and c.joining_until=i.joining_until then update quantum_private.meetup_candidates set status='waiting',joining_until=null,revision=revision+1,updated_at=clock_timestamp()where id=c.id;end if;
  end if;
 end if;
 insert into quantum_private.candidate_board_requests(actor_id,idempotency_key,request_hash,invite_id,result_status)values(actor,key,hash,iid,result_status);
 return quantum_private.candidate_board_projection(k,q,actor,'all',null,jsonb_build_object('status',result_status,'next_href',next_link,'checkout_enabled',false));
end$$;
create function public.meetup_candidate_board(p_action text,p_args jsonb)returns jsonb language sql security definer set search_path='' as $$select quantum_private.meetup_candidate_board(p_action,p_args)$$;

-- Membership is the only authority that removes a candidate as successfully joined.
create function quantum_private.candidate_membership_confirmed()returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb:=to_jsonb(new);u uuid:=(item->>'user_id')::uuid;k text;q text;r uuid;granted_slot text;c record;i record;begin
 if tg_table_name='department_challenge_roster'then if item->>'status'<>'accepted'then return new;end if;k:='league';r:=(item->>'team_id')::uuid;q:=quantum_private.challenge_journey_sport((item->>'challenge_id')::uuid);select coalesce(p.slot_key,case when q='lol'then p.position end)into granted_slot from quantum_private.challenge_skill_profiles p where p.roster_id=(item->>'id')::uuid;
 elsif tg_table_name='study_room_members'then if item->>'left_at'is not null then return new;end if;k:='study';r:=(item->>'room_id')::uuid;select course_id into q from quantum_private.study_room_pools where id=(item->>'pool_id')::uuid;
 elsif tg_table_name='group_mentoring_members'then if(item->>'accepted')::boolean is not true or item->>'left_at'is not null then return new;end if;k:='mentoring';r:=(item->>'session_id')::uuid;granted_slot:=item->>'role';select topic into q from quantum_private.group_mentoring_sessions where id=r and recruitment_mode='hosted';
 else if item->>'status'<>'joined'then return new;end if;k:='meetup';r:=(item->>'meetup_id')::uuid;select activity_key into q from public.activity_meetups where id=r;end if;
 for c in update quantum_private.meetup_candidates set status='joined',last_room_id=r,joining_until=null,revision=revision+1,updated_at=clock_timestamp()where owner_id=u and scope_kind=k and scope_key=q and status in('waiting','joining')returning id loop
  for i in update quantum_private.candidate_board_invites set status=case when room_id=r and(k not in('league','mentoring')or slot=granted_slot)then 'joined'else 'cancelled'end,joining_until=null,revision=revision+1 where candidate_id=c.id and status in('pending','joining')returning id,sender_id,status loop
   if i.status='joined'then perform quantum_private.emit_candidate_board_notification(i.id,'invitation_accepted',i.sender_id);end if;
  end loop;
 end loop;return new;
end$$;
create trigger candidate_league_joined after insert or update of status on public.department_challenge_roster for each row execute function quantum_private.candidate_membership_confirmed();
create trigger candidate_study_joined after insert or update of left_at on quantum_private.study_room_members for each row execute function quantum_private.candidate_membership_confirmed();
create trigger candidate_mentoring_joined after insert or update of accepted,left_at on quantum_private.group_mentoring_members for each row execute function quantum_private.candidate_membership_confirmed();
create trigger candidate_meetup_joined after insert or update of status on public.activity_meetup_members for each row execute function quantum_private.candidate_membership_confirmed();
do $$declare f record;begin for f in select oid::regprocedure p from pg_proc where pronamespace='quantum_private'::regnamespace and proname=any(array['candidate_scope_valid','candidate_positions','candidate_person_current','candidate_scope_member','candidate_current','candidate_state','candidate_chat_href','candidate_apply_href','candidate_room','candidate_invite_current','candidate_row','candidate_invite_row','emit_candidate_board_notification','candidate_notification_current','candidate_notification_href','candidate_board_projection','meetup_candidate_board','candidate_membership_confirmed'])loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.p);end loop;end$$;
revoke all on function public.meetup_candidate_board(text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.meetup_candidate_board(text,jsonb)to authenticated;
commit;
