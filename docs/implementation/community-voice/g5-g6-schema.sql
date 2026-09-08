-- Forward-only voice ledger. No external media, account or payment action is performed by this DDL.
begin;
create table quantum_private.voice_policy_ack(user_id uuid primary key references public.users(id) on delete cascade,version text not null,acknowledged_at timestamptz not null default now());
create table quantum_private.voice_restrictions(user_id uuid primary key references public.users(id) on delete cascade,until_at timestamptz not null,reason_code text not null,created_by uuid references public.users(id));
create table quantum_private.voice_rooms(
 id uuid primary key default gen_random_uuid(),created_by uuid not null references public.users(id),school_scope text not null,
 title text not null check(length(title) between 3 and 80),description text not null check(length(description)<=600),
 topic text not null check(topic in ('worries','social','baseball','department')),kind text not null default 'group' check(kind in ('group','random','friend')),
 scope text not null check(scope in ('school','department')),department_key text,capacity int not null check(capacity between 2 and 24),
 starts_at timestamptz not null,ends_at timestamptz not null,status text not null default 'scheduled' check(status in ('scheduled','open','ended','cancelled','delayed')),
 source_url text,source_revision text,source_event_key text,schedule_notice text,schedule_changed_at timestamptz,
 revision int not null default 0,created_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '8 hours'),check(scope<>'department' or department_key is not null),
 check(kind<>'group' or topic<>'baseball' or (source_url ~ '^https://(www\.)?koreabaseball\.com/' and length(source_url)<=500 and length(source_revision) between 3 and 120 and source_event_key ~ '^[a-z0-9][a-z0-9:_-]{2,119}$')),
 check(kind<>'group' or topic='baseball' or source_event_key is null),check(schedule_notice is null or length(schedule_notice) between 3 and 500)
);
create unique index voice_one_active_official_room_per_event on quantum_private.voice_rooms(
 school_scope,scope,coalesce(department_key,''),lower(source_event_key)
) where kind='group' and topic='baseball' and status not in ('ended','cancelled');
create table quantum_private.voice_sessions(
 id uuid primary key default gen_random_uuid(),room_id uuid not null references quantum_private.voice_rooms(id) on delete cascade,
 state text not null check(state in ('proposed','active','ended')),revision int not null default 0,expires_at timestamptz not null,created_at timestamptz not null default now()
);
create unique index voice_one_live_session_per_room on quantum_private.voice_sessions(room_id) where state<>'ended';
create table quantum_private.voice_members(
 session_id uuid not null references quantum_private.voice_sessions(id) on delete cascade,user_id uuid not null references public.users(id) on delete cascade,
 identity uuid not null unique default gen_random_uuid(),generation int not null default 1,mode text not null check(mode in ('listen','speak')),
 accepted_at timestamptz,active boolean not null default true,connected boolean not null default false,disconnected_at timestamptz default now(),provider_sid text,last_provider_event bigint not null default 0,
 joined_at timestamptz not null default now(),left_at timestamptz,primary key(session_id,user_id)
);
create unique index voice_one_active_membership on quantum_private.voice_members(user_id) where active;
create table quantum_private.voice_queue(user_id uuid primary key references public.users(id) on delete cascade,school_scope text not null,topic text not null,search_id uuid not null,created_at timestamptz not null default now(),expires_at timestamptz not null);
create table quantum_private.voice_skips(user_id uuid references public.users(id) on delete cascade,peer_id uuid references public.users(id) on delete cascade,search_id uuid not null,expires_at timestamptz not null,primary key(user_id,peer_id,search_id));
create table quantum_private.voice_searches(user_id uuid primary key references public.users(id) on delete cascade,search_id uuid not null);
create table quantum_private.voice_friend_invitations(id uuid primary key default gen_random_uuid(),sender_id uuid not null references public.users(id) on delete cascade,recipient_id uuid not null references public.users(id) on delete cascade,status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','expired')),session_id uuid references quantum_private.voice_sessions(id),expires_at timestamptz not null,created_at timestamptz not null default now(),check(sender_id<>recipient_id));
create table quantum_private.voice_commands(user_id uuid references public.users(id) on delete cascade,idempotency_key uuid,operation text not null,payload jsonb not null,response jsonb not null,created_at timestamptz not null default now(),primary key(user_id,idempotency_key));
create table quantum_private.voice_media_outbox(id uuid primary key default gen_random_uuid(),room_name text not null,identity text,user_id uuid references public.users(id) on delete set null,action text not null check(action in ('remove','delete_room')),revoked_at timestamptz not null default now(),claim_token uuid,claimed_at timestamptz,attempts int not null default 0,completed_at timestamptz);
create index voice_media_pending on quantum_private.voice_media_outbox(revoked_at) where completed_at is null;
create table quantum_private.voice_webhook_events(id text primary key,received_at timestamptz not null default now());
create table quantum_private.voice_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid references public.users(id) on delete set null,room_id uuid references quantum_private.voice_rooms(id),target_user_id uuid references public.users(id) on delete set null,target_identity uuid,reason text not null check(length(reason) between 3 and 1000),status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),resolution text,reviewer_id uuid references public.users(id),created_at timestamptz not null default now(),resolved_at timestamptz);

create function quantum_private.voice_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from quantum_private.resolve_profile_readiness(p_user) where minimum_signup_complete)
 and exists(select 1 from auth.users where id=p_user and deleted_at is null and (banned_until is null or banned_until<=now()))
 and not exists(select 1 from quantum_private.voice_restrictions where user_id=p_user and until_at>now());
$$;
create function quantum_private.voice_are_friends(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.friendships f join public.friend_requests r on r.id=f.created_from_request_id
 where f.user_id=least(a,b) and f.friend_user_id=greatest(a,b) and f.status='active' and r.status='accepted'
 and least(r.sender_user_id,r.receiver_user_id)=least(a,b) and greatest(r.sender_user_id,r.receiver_user_id)=greatest(a,b));
$$;
create function quantum_private.voice_rules_current(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from quantum_private.voice_policy_ack where user_id=p_user and version='2026-09-07-v1');
$$;
create function quantum_private.voice_room_scope_allows(p_room quantum_private.voice_rooms,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from quantum_private.community_member_profiles p
   where p.user_id=p_user and p.school_scope=p_room.school_scope
     and (p_room.scope='school' or quantum_private.canonical_department_key(p.department)=p_room.department_key)
 );
$$;
create function quantum_private.voice_room_participant_current(p_room quantum_private.voice_rooms,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select quantum_private.voice_eligible(p_user)
   and quantum_private.voice_rules_current(p_user)
   and quantum_private.voice_room_scope_allows(p_room,p_user);
$$;
create function quantum_private.voice_operator_can_manage(p_room quantum_private.voice_rooms,p_user uuid,p_role text) returns boolean language sql immutable security definer set search_path='' as $$
 select p_role='super_admin' or (p_role='admin' and p_room.created_by=p_user);
$$;
create function quantum_private.voice_operator_moderation_json(p_room quantum_private.voice_rooms) returns jsonb language sql stable security definer set search_path='' as $$
 select case when s.id is null then null else jsonb_build_object(
   'sessionId',s.id,'revision',s.revision,
   'participants',coalesce((select jsonb_agg(jsonb_build_object(
     'identity',m.identity,'displayName',p.display_name,'mode',m.mode,'connected',m.connected
   ) order by m.joined_at,m.identity)
   from quantum_private.voice_members m
   join quantum_private.community_member_profiles p on p.user_id=m.user_id
   where m.session_id=s.id and m.active and (m.connected or m.disconnected_at>now()-interval '2 minutes') and quantum_private.voice_room_participant_current(p_room,m.user_id)),'[]'::jsonb)
 ) end
 from (select v.id,v.revision from quantum_private.voice_sessions v where v.room_id=p_room.id and v.state<>'ended' order by v.created_at desc limit 1) s;
$$;
create function quantum_private.voice_emit_room_notice(p_room_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare n integer:=0;
begin
 insert into public.notifications(user_id,kind,payload)
 select distinct m.user_id,'community_voice',jsonb_build_object('roomId',r.id,'status',r.status,'revision',r.revision)
 from quantum_private.voice_rooms r
 join quantum_private.voice_sessions s on s.room_id=r.id
 join quantum_private.voice_members m on m.session_id=s.id
 where r.id=p_room_id;
 get diagnostics n=row_count;
 return n;
end;$$;
create function quantum_private.voice_summary(p_scope text,p_basis text,p_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('scopeId',p_scope,'asOf',now(),'basis',p_basis,'disclosureBasis','all_valid_participants','policyVersion','2026-09-07-mandatory-aggregate-v1',
 'totalPeople',count(*),'genderBreakdown',jsonb_build_object('malePeople',count(*) filter(where community_gender='male'),'femalePeople',count(*) filter(where community_gender='female'),'otherOrUnspecifiedPeople',count(*) filter(where community_gender not in ('male','female'))))
 from quantum_private.community_member_profiles where user_id=any(coalesce(p_ids,'{}'::uuid[]));
$$;
create function quantum_private.voice_room_json(r quantum_private.voice_rooms) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'title',r.title,'description',r.description,'topic',r.topic,'scope',r.scope,'departmentKey',r.department_key,'capacity',r.capacity,'startsAt',r.starts_at,'endsAt',r.ends_at,'status',r.status,'revision',r.revision,'sourceUrl',r.source_url,'sourceRevision',r.source_revision,'sourceEventKey',r.source_event_key,'scheduleNotice',r.schedule_notice,'scheduleChangedAt',r.schedule_changed_at,
 'connected',quantum_private.voice_summary(r.id::text,'connected_to_voice',array(select m.user_id from quantum_private.voice_members m join quantum_private.voice_sessions s on s.id=m.session_id where s.room_id=r.id and s.state='active' and m.active and m.connected and quantum_private.voice_room_participant_current(r,m.user_id))),
 'waiting',quantum_private.voice_summary(r.id::text,'waiting_for_voice',array(select m.user_id from quantum_private.voice_members m join quantum_private.voice_sessions s on s.id=m.session_id where s.room_id=r.id and s.state<>'ended' and m.active and not m.connected and m.disconnected_at>now()-interval '2 minutes' and quantum_private.voice_room_participant_current(r,m.user_id))));
$$;
create function quantum_private.voice_revoke_member(p_session uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare m quantum_private.voice_members%rowtype;
begin
 update quantum_private.voice_members set active=false,connected=false,disconnected_at=now(),left_at=now(),generation=generation+1 where session_id=p_session and user_id=p_user and active returning * into m;
 if found then insert into quantum_private.voice_media_outbox(room_name,identity,user_id,action) values('qv-'||p_session::text,m.identity::text,m.user_id,'remove');end if;
end;$$;
create function quantum_private.voice_end_session(p_session uuid) returns void language plpgsql security definer set search_path='' as $$
declare m record;
begin
 for m in select user_id from quantum_private.voice_members where session_id=p_session and active loop perform quantum_private.voice_revoke_member(p_session,m.user_id);end loop;
 update quantum_private.voice_sessions set state='ended',revision=revision+1 where id=p_session and state<>'ended';
 if found then insert into quantum_private.voice_media_outbox(room_name,action) values('qv-'||p_session::text,'delete_room');end if;
end;$$;
create function quantum_private.voice_session_json(p_session uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('session',jsonb_build_object('id',s.id,'roomId',r.id,'kind',r.kind,'state',case when m.active then s.state else 'ended' end,'revision',s.revision,'generation',m.generation,'mode',m.mode,'accepted',m.accepted_at is not null,'peerAccepted',not exists(select 1 from quantum_private.voice_members peer where peer.session_id=s.id and peer.active and peer.accepted_at is null),
 'participants',case when m.active then coalesce((select jsonb_agg(jsonb_build_object('identity',v.identity,'displayName',case when r.kind='friend' then coalesce(p.friend_recognition_name,p.display_name) else p.display_name end,'mode',v.mode,'isModerator',r.kind='group' and v.user_id=r.created_by)) from quantum_private.voice_members v join quantum_private.community_member_profiles p on p.user_id=v.user_id where v.session_id=s.id and v.active and (v.connected or v.disconnected_at>now()-interval '2 minutes') and quantum_private.voice_room_participant_current(r,v.user_id)),'[]'::jsonb) else '[]'::jsonb end), 'room',quantum_private.voice_room_json(r))
 from quantum_private.voice_sessions s join quantum_private.voice_rooms r on r.id=s.room_id join quantum_private.voice_members m on m.session_id=s.id and m.user_id=p_user where s.id=p_session;
$$;

create function public.community_voice_command(p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); profile quantum_private.community_member_profiles%rowtype; role_name text; op boolean;
 r quantum_private.voice_rooms%rowtype;s quantum_private.voice_sessions%rowtype;m quantum_private.voice_members%rowtype;
 other quantum_private.voice_queue%rowtype;inv quantum_private.voice_friend_invitations%rowtype;cmd quantum_private.voice_commands%rowtype;
 key uuid; rid uuid;sid uuid;friend uuid;target uuid;action text;mode text;rev int;result jsonb;search uuid;v_source text;
 can_manage boolean:=false;operator_management boolean:=false;cleanup_operation boolean:=false;new_start timestamptz;new_end timestamptz;notice text;new_source_revision text;
begin
 if u is null then raise exception 'not_authenticated';end if;
 select access_role into role_name from public.get_access_context();op:=coalesce(role_name in ('admin','super_admin'),false);
 operator_management:=op and (
   p_operation in ('operator_rooms','create_room','room','review_reports','resolve_report')
   or (p_operation='room_command' and p_payload->>'action' in ('open','delay','cancel','close','reschedule'))
   or (p_operation='session_command' and p_payload->>'action'='kick')
 );
 cleanup_operation:=(p_operation='session_command' and p_payload->>'action'='leave')
   or (p_operation='queue_command' and p_payload->>'action'='leave');
 if exists(select 1 from quantum_private.voice_restrictions where user_id=u and until_at>now())
    and not operator_management
    and not cleanup_operation
 then raise exception 'voice_restricted';end if;
 if not quantum_private.voice_eligible(u)
    and not operator_management
    and not cleanup_operation
 then raise exception 'minimum_signup_required';end if;
 select * into profile from quantum_private.community_member_profiles where user_id=u;
 if p_operation not in ('list_rooms','room','session','queue_status','friend_invitations','operator_rooms','token_context','review_reports','acknowledge_rules') then
   key:=(p_payload->>'idempotencyKey')::uuid;if key is null then raise exception 'invalid_input';end if;
   -- One global arbitration lock makes cross-user queue/membership/block transitions deterministic.
   perform pg_advisory_xact_lock(hashtextextended('quantum-voice-ledger-v1',0));
   select * into cmd from quantum_private.voice_commands where user_id=u and idempotency_key=key;
   if found then if cmd.operation<>p_operation or cmd.payload<>p_payload then raise exception 'idempotency_conflict';end if;return cmd.response;end if;
   if (select count(*) from quantum_private.voice_commands where user_id=u and created_at>now()-interval '1 minute')>=30 then raise exception 'rate_limited';end if;
 end if;
 if p_operation='acknowledge_rules' then
   insert into quantum_private.voice_policy_ack(user_id,version) values(u,'2026-09-07-v1') on conflict(user_id) do update set version=excluded.version,acknowledged_at=now();return jsonb_build_object('acknowledged',true);
 elsif p_operation in ('list_rooms','operator_rooms') then
   if p_operation='operator_rooms' and not op then raise exception 'forbidden';end if;
   return jsonb_build_object('rooms',coalesce((select jsonb_agg(quantum_private.voice_room_json(x) order by x.starts_at) from (select * from quantum_private.voice_rooms v where kind='group'
   and ((p_operation='operator_rooms' and quantum_private.voice_operator_can_manage(v,u,role_name)) or (p_operation='list_rooms' and quantum_private.voice_room_scope_allows(v,u)))
   and (ends_at>now()-interval '1 day') order by starts_at limit 100) x),'[]'::jsonb));
 elsif p_operation='create_room' then
   if not op then raise exception 'forbidden';end if;
   if profile.user_id is null or nullif(btrim(profile.school_scope),'') is null then raise exception 'minimum_signup_required';end if;
   if p_payload->>'scope' not in ('school','department') then raise exception 'invalid_input';end if;
   insert into quantum_private.voice_rooms(created_by,school_scope,title,description,topic,scope,department_key,capacity,starts_at,ends_at,source_url,source_revision,source_event_key)
   values(u,profile.school_scope,btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),p_payload->>'topic',p_payload->>'scope',quantum_private.canonical_department_key(p_payload->>'departmentKey'),(p_payload->>'capacity')::int,(p_payload->>'startsAt')::timestamptz,(p_payload->>'endsAt')::timestamptz,p_payload->>'sourceUrl',p_payload->>'sourceRevision',lower(btrim(p_payload->>'sourceEventKey'))) returning * into r;
   result:=jsonb_build_object('room',quantum_private.voice_room_json(r));
 elsif p_operation in ('room','room_command') then
   rid:=(p_payload->>'roomId')::uuid;select * into r from quantum_private.voice_rooms where id=rid for update;
   if not found then raise exception 'not_found';end if;
   can_manage:=quantum_private.voice_operator_can_manage(r,u,role_name);
   if not can_manage and not quantum_private.voice_room_scope_allows(r,u) then raise exception 'not_found';end if;
   if r.kind<>'group' then raise exception 'not_found';end if;
   if p_operation='room' then return jsonb_build_object('room',quantum_private.voice_room_json(r),'moderation',case when can_manage then quantum_private.voice_operator_moderation_json(r) else null end);end if;
   action:=p_payload->>'action';rev:=(p_payload->>'expectedRevision')::int;
   if rev is null or rev<>r.revision then raise exception 'stale_revision';end if;
   if action='join' then
     if r.status<>'open' or now()<r.starts_at or now()>=r.ends_at then raise exception 'room_closed';end if;
     if not exists(select 1 from quantum_private.voice_policy_ack where user_id=u and version='2026-09-07-v1') then raise exception 'voice_rules_required';end if;
     if exists(select 1 from quantum_private.voice_members where user_id=u and active) or exists(select 1 from quantum_private.voice_queue where user_id=u and expires_at>now()) then raise exception 'already_in_voice';end if;
     mode:=p_payload->>'mode';if mode is null or mode not in ('listen','speak') then raise exception 'invalid_input';end if;
     select * into s from quantum_private.voice_sessions where room_id=r.id and state<>'ended' for update;
     if not found then insert into quantum_private.voice_sessions(room_id,state,expires_at) values(r.id,'active',r.ends_at) returning * into s;end if;
     if (select count(*) from quantum_private.voice_members where session_id=s.id and active)>=r.capacity then raise exception 'room_full';end if;
     if exists(select 1 from quantum_private.voice_members where session_id=s.id and active and quantum_private.tonight_invite_pair_is_blocked(u,user_id)) then raise exception 'blocked_pair';end if;
     if exists(select 1 from quantum_private.voice_media_outbox e where e.user_id=u and e.completed_at is null) then raise exception 'media_cleanup_pending';end if;
     insert into quantum_private.voice_members(session_id,user_id,mode,accepted_at) values(s.id,u,mode,now()) on conflict(session_id,user_id) do update set identity=gen_random_uuid(),generation=quantum_private.voice_members.generation+1,mode=excluded.mode,accepted_at=now(),active=true,connected=false,disconnected_at=now(),left_at=null,joined_at=now(),last_provider_event=0,provider_sid=null;
     update quantum_private.voice_sessions set revision=revision+1 where id=s.id;update quantum_private.voice_rooms set revision=revision+1 where id=r.id;
     result:=jsonb_build_object('sessionId',s.id,'roomId',r.id);
   elsif action in ('open','delay','cancel','close','reschedule') then
     if not can_manage then raise exception 'forbidden';end if;
     if r.status in ('ended','cancelled') then raise exception 'room_closed';end if;
     if action in ('cancel','close','delay','reschedule') then for s in select * from quantum_private.voice_sessions where room_id=r.id and state<>'ended' loop perform quantum_private.voice_end_session(s.id);end loop;end if;
     if action='reschedule' then
       new_start:=(p_payload->>'startsAt')::timestamptz;new_end:=(p_payload->>'endsAt')::timestamptz;notice:=btrim(coalesce(p_payload->>'scheduleNotice',''));new_source_revision:=btrim(coalesce(p_payload->>'sourceRevision',r.source_revision));
       if new_start is null or new_end is null or new_end<=new_start or new_end>new_start+interval '8 hours' or length(notice) not between 3 and 500 then raise exception 'invalid_input';end if;
       if r.topic='baseball' and length(new_source_revision)<3 then raise exception 'invalid_input';end if;
       update quantum_private.voice_rooms set starts_at=new_start,ends_at=new_end,status='scheduled',schedule_notice=notice,schedule_changed_at=now(),source_revision=new_source_revision,revision=revision+1 where id=r.id returning * into r;
     else
       notice:=nullif(btrim(p_payload->>'scheduleNotice'),'');
       if action='delay' and coalesce(length(notice),0) not between 3 and 500 then raise exception 'invalid_input';end if;
       update quantum_private.voice_rooms set status=case action when 'open' then 'open' when 'delay' then 'delayed' when 'cancel' then 'cancelled' else 'ended' end,schedule_notice=case when action='delay' then notice else schedule_notice end,schedule_changed_at=case when action='delay' then now() else schedule_changed_at end,revision=revision+1 where id=r.id returning * into r;
     end if;
     if action in ('delay','reschedule','cancel','close') then perform quantum_private.voice_emit_room_notice(r.id);end if;
     result:=jsonb_build_object('room',quantum_private.voice_room_json(r));
   else raise exception 'invalid_input';end if;
 elsif p_operation in ('session','session_command','token_context') then
   sid:=(p_payload->>'sessionId')::uuid;select * into s from quantum_private.voice_sessions where id=sid for update;
   if s.id is null then raise exception 'not_found';end if;
   select * into r from quantum_private.voice_rooms where id=s.room_id;
   can_manage:=quantum_private.voice_operator_can_manage(r,u,role_name);
   select * into m from quantum_private.voice_members where session_id=sid and user_id=u;
   if p_operation='session' then
     if m.user_id is null or not m.active or (not m.connected and m.disconnected_at<=now()-interval '2 minutes') or not quantum_private.voice_room_participant_current(r,u) then raise exception 'not_found';end if;
     return quantum_private.voice_session_json(sid,u);
   end if;
   if p_operation='token_context' then
     if m.user_id is null or not quantum_private.voice_room_participant_current(r,u) then raise exception 'not_found';end if;
     if s.state<>'active' or not m.active or m.accepted_at is null or s.expires_at<=now() or r.status<>'open' or (not m.connected and m.disconnected_at<=now()-interval '2 minutes') then raise exception 'acceptance_required';end if;
     if exists(select 1 from quantum_private.voice_members v where v.session_id=sid and v.active and (not quantum_private.voice_room_participant_current(r,v.user_id) or quantum_private.tonight_invite_pair_is_blocked(u,v.user_id))) then raise exception 'blocked_pair';end if;
     if r.kind='friend' and exists(select 1 from quantum_private.voice_members v where v.session_id=sid and v.user_id<>u and not quantum_private.voice_are_friends(u,v.user_id)) then raise exception 'forbidden';end if;
     if exists(select 1 from quantum_private.voice_media_outbox e where e.user_id=u and e.completed_at is null) then raise exception 'media_cleanup_pending';end if;
     return jsonb_build_object('identity',m.identity,'roomName','qv-'||sid::text,'generation',m.generation,'mode',m.mode,'displayName',case when r.kind='friend' then coalesce(profile.friend_recognition_name,profile.display_name) else profile.display_name end);
   end if;
   action:=p_payload->>'action';rev:=(p_payload->>'expectedRevision')::int;
   if rev is null or rev<>s.revision then raise exception 'stale_revision';end if;
   if action='kick' then
     if r.kind<>'group' or not can_manage then raise exception 'forbidden';end if;
     target:=(p_payload->>'targetIdentity')::uuid;select user_id into friend from quantum_private.voice_members where session_id=sid and identity=target and active;
     if friend is null then raise exception 'not_found';end if;
     perform quantum_private.voice_revoke_member(sid,friend);
   else
     if m.user_id is null then raise exception 'not_found';end if;
     if not m.active or s.state='ended' then raise exception 'room_closed';end if;
     if action<>'leave' and not quantum_private.voice_room_participant_current(r,u) then raise exception 'forbidden';end if;
   if action='accept' then
     if s.expires_at<=now() then raise exception 'room_closed';end if;
     if exists(select 1 from quantum_private.voice_members v where v.session_id=sid and v.active and (not quantum_private.voice_room_participant_current(r,v.user_id) or quantum_private.tonight_invite_pair_is_blocked(u,v.user_id))) then raise exception 'blocked_pair';end if;
     update quantum_private.voice_members set accepted_at=now() where session_id=sid and user_id=u;
     if not exists(select 1 from quantum_private.voice_members where session_id=sid and active and accepted_at is null) then update quantum_private.voice_sessions set state='active',expires_at=r.ends_at where id=sid;end if;
   elsif action in ('leave','next') then
     if action='next' and r.kind<>'random' then raise exception 'invalid_input';end if;
     if r.kind='group' then perform quantum_private.voice_revoke_member(sid,u);
     else
       if action='next' then insert into quantum_private.voice_skips(user_id,peer_id,search_id,expires_at) select u,v.user_id,q.search_id,now()+interval '1 hour' from quantum_private.voice_members v cross join quantum_private.voice_searches q where v.session_id=sid and v.user_id<>u and q.user_id=u on conflict do nothing;end if;
       perform quantum_private.voice_end_session(sid);
     end if;
   elsif action='mode' then
     mode:=p_payload->>'mode';if mode is null or mode not in ('listen','speak') then raise exception 'invalid_input';end if;
     insert into quantum_private.voice_media_outbox(room_name,identity,user_id,action) values('qv-'||sid::text,m.identity::text,u,'remove');
     update quantum_private.voice_members set mode=p_payload->>'mode',identity=gen_random_uuid(),generation=generation+1,connected=false,disconnected_at=now(),provider_sid=null,last_provider_event=0 where session_id=sid and user_id=u;
   else raise exception 'invalid_input';end if;
   end if;
   update quantum_private.voice_sessions set revision=revision+1 where id=sid;
   result:=case when action='kick' then jsonb_build_object('moderation',quantum_private.voice_operator_moderation_json(r)) else quantum_private.voice_session_json(sid,u) end;
 elsif p_operation in ('queue_status','queue_command') then
   if p_operation='queue_command' then
     action:=p_payload->>'action';search:=(p_payload->>'searchId')::uuid;
     if action='leave' then
       delete from quantum_private.voice_queue where user_id=u and search_id=search;
       if not found and exists(select 1 from quantum_private.voice_queue where user_id=u and expires_at>now()) then raise exception 'stale_revision';end if;
     elsif action='join' then
       if not quantum_private.voice_rules_current(u) then raise exception 'voice_rules_required';end if;
       if p_payload->>'topic' not in ('worries','social','baseball','department') or search is null then raise exception 'invalid_input';end if;
       if exists(select 1 from quantum_private.voice_members where user_id=u and active) then raise exception 'already_in_voice';end if;
       if exists(select 1 from quantum_private.voice_media_outbox e where e.user_id=u and e.completed_at is null) then raise exception 'media_cleanup_pending';end if;
       delete from quantum_private.voice_queue where expires_at<=now();
       insert into quantum_private.voice_searches values(u,search) on conflict(user_id) do update set search_id=excluded.search_id;
       insert into quantum_private.voice_queue(user_id,school_scope,topic,search_id,created_at,expires_at) values(u,profile.school_scope,p_payload->>'topic',search,now(),now()+interval '5 minutes') on conflict(user_id) do update set school_scope=excluded.school_scope,topic=excluded.topic,search_id=excluded.search_id,created_at=excluded.created_at,expires_at=excluded.expires_at;
       select * into other from quantum_private.voice_queue q where q.user_id<>u and q.school_scope=profile.school_scope and q.topic=p_payload->>'topic' and q.expires_at>now() and quantum_private.voice_eligible(q.user_id) and quantum_private.voice_rules_current(q.user_id)
        and exists(select 1 from quantum_private.community_member_profiles qp where qp.user_id=q.user_id and qp.school_scope=q.school_scope)
        and not exists(select 1 from quantum_private.voice_members vm where vm.user_id=q.user_id and vm.active)
        and not quantum_private.tonight_invite_pair_is_blocked(u,q.user_id)
        and not exists(select 1 from quantum_private.voice_skips k where k.expires_at>now() and ((k.user_id=u and k.peer_id=q.user_id and k.search_id=search) or (k.user_id=q.user_id and k.peer_id=u and k.search_id=q.search_id)))
       order by q.created_at,q.user_id limit 1 for update;
       if found then
         insert into quantum_private.voice_rooms(created_by,school_scope,title,description,topic,kind,scope,capacity,starts_at,ends_at,status) values(u,profile.school_scope,'둘이 나누는 이야기','서로 수락한 뒤 목소리로 만나요.',p_payload->>'topic','random','school',2,now(),now()+interval '1 hour','open') returning * into r;
         insert into quantum_private.voice_sessions(room_id,state,expires_at) values(r.id,'proposed',now()+interval '45 seconds') returning * into s;
         insert into quantum_private.voice_members(session_id,user_id,mode) values(s.id,u,'speak'),(s.id,other.user_id,'speak');
         delete from quantum_private.voice_queue where user_id in (u,other.user_id);
         update quantum_private.voice_friend_invitations set status='cancelled' where status='pending' and expires_at>now() and (sender_id in (u,other.user_id) or recipient_id in (u,other.user_id));
       end if;
     else raise exception 'invalid_input';end if;
   end if;
   select vm.* into m from quantum_private.voice_members vm join quantum_private.voice_sessions vs on vs.id=vm.session_id join quantum_private.voice_rooms vr on vr.id=vs.room_id where vm.user_id=u and vm.active and quantum_private.voice_room_participant_current(vr,u);
   result:=jsonb_build_object('sessionId',m.session_id,'queued',exists(select 1 from quantum_private.voice_queue where user_id=u and expires_at>now()),
     'waiting',quantum_private.voice_summary('random:'||profile.school_scope,'waiting_for_voice',array(select user_id from quantum_private.voice_queue where school_scope=profile.school_scope and expires_at>now() and quantum_private.voice_eligible(user_id) and quantum_private.voice_rules_current(user_id))));
 elsif p_operation in ('friend_invitations','invite_friend','accept_friend') then
   if p_operation='friend_invitations' then return jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'fromUserId',i.sender_id,'displayName',coalesce(p.friend_recognition_name,p.display_name),'expiresAt',i.expires_at)) from quantum_private.voice_friend_invitations i join quantum_private.community_member_profiles p on p.user_id=i.sender_id where i.recipient_id=u and i.status='pending' and i.expires_at>now() and p.school_scope=profile.school_scope and quantum_private.voice_are_friends(u,i.sender_id) and quantum_private.voice_eligible(i.sender_id) and quantum_private.voice_rules_current(i.sender_id)),'[]'::jsonb));end if;
   if p_operation='invite_friend' then
     friend:=(p_payload->>'friendUserId')::uuid;
     if not quantum_private.voice_rules_current(u) then raise exception 'voice_rules_required';end if;
     if not quantum_private.voice_are_friends(u,friend) or not quantum_private.voice_eligible(friend) or not exists(select 1 from quantum_private.community_member_profiles p where p.user_id=friend and p.school_scope=profile.school_scope) then raise exception 'forbidden';end if;
     if exists(select 1 from quantum_private.voice_members where user_id in (u,friend) and active) or exists(select 1 from quantum_private.voice_queue where user_id in (u,friend) and expires_at>now()) then raise exception 'already_in_voice';end if;
     if exists(select 1 from quantum_private.voice_media_outbox e where e.user_id in (u,friend) and e.completed_at is null) then raise exception 'media_cleanup_pending';end if;
     if exists(select 1 from quantum_private.voice_friend_invitations where sender_id=u and status='pending' and expires_at>now()) then raise exception 'rate_limited';end if;
     insert into quantum_private.voice_friend_invitations(sender_id,recipient_id,expires_at) values(u,friend,now()+interval '1 minute') returning * into inv;
     result:=jsonb_build_object('invitationId',inv.id,'status','pending','expiresAt',inv.expires_at);
   else
     select * into inv from quantum_private.voice_friend_invitations where id=(p_payload->>'invitationId')::uuid and recipient_id=u for update;
     if not found or inv.status<>'pending' or inv.expires_at<=now() then raise exception 'not_found';end if;
     if not quantum_private.voice_rules_current(u) or not quantum_private.voice_rules_current(inv.sender_id) then raise exception 'voice_rules_required';end if;
     if not quantum_private.voice_are_friends(u,inv.sender_id) or not quantum_private.voice_eligible(inv.sender_id) or not exists(select 1 from quantum_private.community_member_profiles p where p.user_id=inv.sender_id and p.school_scope=profile.school_scope) then raise exception 'forbidden';end if;
     if exists(select 1 from quantum_private.voice_members where user_id in (u,inv.sender_id) and active) or exists(select 1 from quantum_private.voice_queue where user_id in (u,inv.sender_id) and expires_at>now()) then raise exception 'already_in_voice';end if;
     if exists(select 1 from quantum_private.voice_media_outbox e where e.user_id in (u,inv.sender_id) and e.completed_at is null) then raise exception 'media_cleanup_pending';end if;
     insert into quantum_private.voice_rooms(created_by,school_scope,title,description,topic,kind,scope,capacity,starts_at,ends_at,status) values(inv.sender_id,profile.school_scope,'친구와 이야기','친구가 수락한 통화예요.','social','friend','school',2,now(),now()+interval '2 hours','open') returning * into r;
     insert into quantum_private.voice_sessions(room_id,state,expires_at) values(r.id,'active',r.ends_at) returning * into s;
     insert into quantum_private.voice_members(session_id,user_id,mode,accepted_at) values(s.id,u,'speak',now()),(s.id,inv.sender_id,'speak',now());
     update quantum_private.voice_friend_invitations set status='accepted',session_id=s.id where id=inv.id;
     update quantum_private.voice_friend_invitations set status='cancelled' where id<>inv.id and status='pending' and (sender_id in (u,inv.sender_id) or recipient_id in (u,inv.sender_id));
     result:=jsonb_build_object('sessionId',s.id,'roomId',r.id);
   end if;
 elsif p_operation='report' then
   sid:=(p_payload->>'sessionId')::uuid;target:=(p_payload->>'targetIdentity')::uuid;
   select * into m from quantum_private.voice_members where session_id=sid and user_id=u;
   select user_id into friend from quantum_private.voice_members where session_id=sid and identity=target;
   if m.user_id is null or friend is null or friend=u then raise exception 'not_found';end if;
   if length(btrim(coalesce(p_payload->>'reason',''))) not between 3 and 1000 then raise exception 'invalid_input';end if;
   select * into s from quantum_private.voice_sessions where id=sid;
   insert into quantum_private.voice_reports(reporter_id,room_id,target_user_id,target_identity,reason) values(u,s.room_id,friend,target,btrim(p_payload->>'reason')) returning id into rid;
   if coalesce((p_payload->>'block')::boolean,false) then
     perform set_config('app.bypass_friendships_guard','on',true);
     insert into public.friendships(user_id,friend_user_id,status,blocked_by,blocked_at) values(least(u,friend),greatest(u,friend),'blocked',u,now())
     on conflict(user_id,friend_user_id) do update set status='blocked',blocked_by=case when public.friendships.status='blocked' then public.friendships.blocked_by else u end,blocked_at=coalesce(public.friendships.blocked_at,now());
     perform set_config('app.bypass_friendships_guard','off',true);
     -- INSERT of a new blocked pair has no UPDATE trigger; revoke the blocker's own membership explicitly.
     select * into r from quantum_private.voice_rooms where id=s.room_id;
     if r.kind='group' then perform quantum_private.voice_revoke_member(sid,u);else perform quantum_private.voice_end_session(sid);end if;
   end if;
   result:=jsonb_build_object('reportId',rid,'status','open');
 elsif p_operation='review_reports' then
   if not op then raise exception 'forbidden';end if;
   return jsonb_build_object('reports',coalesce((select jsonb_agg(to_jsonb(v)) from(select report.id,report.room_id,report.reason,report.status,report.created_at,report.resolution from quantum_private.voice_reports report join quantum_private.voice_rooms room on room.id=report.room_id where role_name='super_admin' or (role_name='admin' and room.created_by=u) order by report.created_at desc limit 100)v),'[]'::jsonb));
 elsif p_operation='resolve_report' then
   if not op then raise exception 'forbidden';end if;
   if p_payload->>'status' not in ('reviewing','resolved','dismissed') or length(btrim(coalesce(p_payload->>'resolution',''))) not between 3 and 1000 then raise exception 'invalid_input';end if;
   update quantum_private.voice_reports report set status=p_payload->>'status',resolution=btrim(p_payload->>'resolution'),reviewer_id=u,resolved_at=case when p_payload->>'status' in ('resolved','dismissed') then now() else null end from quantum_private.voice_rooms room where report.id=(p_payload->>'reportId')::uuid and room.id=report.room_id and (role_name='super_admin' or (role_name='admin' and room.created_by=u)) and report.status in ('open','reviewing') returning report.id into rid;
   if rid is null then raise exception 'not_found';end if;
   result:=jsonb_build_object('reportId',rid,'status',p_payload->>'status');
 else raise exception 'invalid_input';end if;
 if key is not null then insert into quantum_private.voice_commands values(u,key,p_operation,p_payload,result,now());end if;
 return result;
end;$$;

-- Outbox leases prevent concurrent workers from treating another worker's result as their own.
create function public.claim_voice_media_effects(p_limit int default 25,p_session_id uuid default null,p_room_id uuid default null) returns setof quantum_private.voice_media_outbox language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden';end if;
 return query update quantum_private.voice_media_outbox e set claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1 where e.id in(
   select pending.id from quantum_private.voice_media_outbox pending
   where pending.completed_at is null and (pending.claimed_at is null or pending.claimed_at<now()-interval '1 minute')
     and (p_session_id is null or pending.room_name='qv-'||p_session_id::text)
     and (p_room_id is null or exists(select 1 from quantum_private.voice_sessions scoped where scoped.room_id=p_room_id and pending.room_name='qv-'||scoped.id::text))
   order by pending.revoked_at limit least(greatest(p_limit,1),50) for update skip locked
 ) returning e.*;
end;$$;
create function public.finish_voice_media_effect(p_id uuid,p_claim_token uuid,p_success boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden';end if;
 update quantum_private.voice_media_outbox set completed_at=case when p_success then now() else null end,claimed_at=case when p_success then claimed_at else now()-interval '45 seconds' end where id=p_id and claim_token=p_claim_token and completed_at is null;
 return found;
end;$$;
create function public.apply_voice_provider_event(p_event_id text,p_event text,p_room text,p_identity uuid,p_sid text,p_created_at bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare m quantum_private.voice_members%rowtype;s quantum_private.voice_sessions%rowtype;r quantum_private.voice_rooms%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum-voice-ledger-v1',0));
 insert into quantum_private.voice_webhook_events(id) values(p_event_id) on conflict do nothing;if not found then return jsonb_build_object('replayed',true);end if;
 select * into m from quantum_private.voice_members where identity=p_identity for update;select * into s from quantum_private.voice_sessions where id=m.session_id;select * into r from quantum_private.voice_rooms where id=s.room_id;
 if m.user_id is null then
   if p_event='participant_joined' and p_room ~ '^qv-[0-9a-f-]{36}$' then insert into quantum_private.voice_media_outbox(room_name,identity,action) values(p_room,p_identity::text,'remove');end if;
   return jsonb_build_object('ignored',true);
 end if;
 if p_room<>'qv-'||m.session_id::text then return jsonb_build_object('ignored',true);end if;
 if p_created_at<m.last_provider_event then return jsonb_build_object('ignored',true);end if;
 if p_event='participant_joined' then
   if p_created_at=m.last_provider_event and not m.connected and m.provider_sid is not distinct from p_sid then return jsonb_build_object('ignored',true);end if;
   if not m.active or s.state<>'active' or s.expires_at<=now() or r.status<>'open' or (not m.connected and m.disconnected_at<=now()-interval '2 minutes') or not quantum_private.voice_room_participant_current(r,m.user_id)
      or exists(select 1 from quantum_private.voice_members v where v.session_id=m.session_id and v.active and quantum_private.tonight_invite_pair_is_blocked(m.user_id,v.user_id)) then
     if m.active then
       if r.kind='group' then perform quantum_private.voice_revoke_member(m.session_id,m.user_id);else perform quantum_private.voice_end_session(m.session_id);end if;
     else insert into quantum_private.voice_media_outbox(room_name,identity,action) values(p_room,p_identity::text,'remove');end if;
     return jsonb_build_object('revoked',true);
   end if;
   update quantum_private.voice_members set connected=true,disconnected_at=null,provider_sid=p_sid,last_provider_event=p_created_at where identity=p_identity;
 elsif p_event in ('participant_left','participant_connection_aborted') and (m.provider_sid=p_sid or m.provider_sid is null) then
   update quantum_private.voice_members set connected=false,disconnected_at=now(),last_provider_event=p_created_at where identity=p_identity;
 end if;
 return jsonb_build_object('accepted',true);
end;$$;

-- Membership revocation is synchronous with a user block. The blocker leaves; other participants are not globally kicked.
create function quantum_private.voice_friendship_revoke_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare m record;caller uuid:=auth.uid();
begin
 if new.status is distinct from old.status and new.status<>'active' then
   perform pg_advisory_xact_lock(hashtextextended('quantum-voice-ledger-v1',0));
   for m in select a.session_id,r.kind from quantum_private.voice_members a join quantum_private.voice_members b on b.session_id=a.session_id join quantum_private.voice_sessions s on s.id=a.session_id join quantum_private.voice_rooms r on r.id=s.room_id
     where a.user_id=new.user_id and b.user_id=new.friend_user_id and a.active and b.active loop
     if m.kind in ('random','friend') then perform quantum_private.voice_end_session(m.session_id);
     elsif new.status='blocked' and caller in(new.user_id,new.friend_user_id) then perform quantum_private.voice_revoke_member(m.session_id,caller);end if;
   end loop;
 end if;return new;
end;$$;
create trigger voice_friendship_revoke after update of status on public.friendships for each row execute function quantum_private.voice_friendship_revoke_trigger();

create function public.sweep_voice_sessions() returns jsonb language plpgsql security definer set search_path='' as $$
declare s record;m record;n int:=0;g int:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum-voice-ledger-v1',0));
 for s in select id from quantum_private.voice_sessions where state<>'ended' and expires_at<=now() loop perform quantum_private.voice_end_session(s.id);n:=n+1;end loop;
 for m in select v.session_id,v.user_id,r.kind from quantum_private.voice_members v join quantum_private.voice_sessions vsess on vsess.id=v.session_id join quantum_private.voice_rooms r on r.id=vsess.room_id where v.active and not v.connected and v.disconnected_at<=now()-interval '2 minutes' loop
   if m.kind='group' then perform quantum_private.voice_revoke_member(m.session_id,m.user_id);else perform quantum_private.voice_end_session(m.session_id);end if;g:=g+1;
 end loop;
 for m in select v.session_id,v.user_id,r.kind from quantum_private.voice_members v join quantum_private.voice_sessions vsess on vsess.id=v.session_id join quantum_private.voice_rooms r on r.id=vsess.room_id where v.active and not quantum_private.voice_room_participant_current(r,v.user_id) loop
   if m.kind='group' then perform quantum_private.voice_revoke_member(m.session_id,m.user_id);else perform quantum_private.voice_end_session(m.session_id);end if;
 end loop;
 delete from quantum_private.voice_queue q where q.expires_at<=now() or not quantum_private.voice_eligible(q.user_id) or not quantum_private.voice_rules_current(q.user_id) or not exists(select 1 from quantum_private.community_member_profiles p where p.user_id=q.user_id and p.school_scope=q.school_scope);
 update quantum_private.voice_friend_invitations set status='expired' where status='pending' and expires_at<=now();
 update quantum_private.voice_friend_invitations i set status='cancelled' where i.status='pending' and (
   not quantum_private.voice_eligible(i.sender_id) or not quantum_private.voice_eligible(i.recipient_id)
   or not quantum_private.voice_rules_current(i.sender_id)
   or not quantum_private.voice_are_friends(i.sender_id,i.recipient_id)
   or not exists(select 1 from quantum_private.community_member_profiles a join quantum_private.community_member_profiles b on b.user_id=i.recipient_id where a.user_id=i.sender_id and a.school_scope=b.school_scope)
 );
 update quantum_private.voice_rooms set status='ended',revision=revision+1 where status in ('open','scheduled','delayed') and ends_at<=now();
 delete from quantum_private.voice_skips where expires_at<=now();
 delete from quantum_private.voice_webhook_events where received_at<now()-interval '7 days';
 delete from quantum_private.voice_commands where created_at<now()-interval '7 days';
 return jsonb_build_object('expiredSessions',n,'expiredDisconnectedMembers',g);
end;$$;

do $$declare t text; f record;begin
 foreach t in array array['voice_policy_ack','voice_restrictions','voice_rooms','voice_sessions','voice_members','voice_queue','voice_skips','voice_searches','voice_friend_invitations','voice_commands','voice_media_outbox','voice_webhook_events','voice_reports'] loop
 execute format('alter table quantum_private.%I enable row level security',t);execute format('revoke all on quantum_private.%I from public,anon,authenticated,service_role',t);end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='quantum_private' and p.proname like 'voice_%' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end;$$;
revoke all on function public.community_voice_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.community_voice_command(text,jsonb) to authenticated;
revoke all on function public.claim_voice_media_effects(int,uuid,uuid),public.finish_voice_media_effect(uuid,uuid,boolean),public.apply_voice_provider_event(text,text,text,uuid,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.claim_voice_media_effects(int,uuid,uuid),public.finish_voice_media_effect(uuid,uuid,boolean),public.apply_voice_provider_event(text,text,text,uuid,text,bigint) to service_role;
revoke all on function public.sweep_voice_sessions() from public,anon,authenticated,service_role;
grant execute on function public.sweep_voice_sessions() to service_role;
commit;
