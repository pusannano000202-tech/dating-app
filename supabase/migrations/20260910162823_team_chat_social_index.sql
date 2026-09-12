begin;

-- Team IDs survive manual opponent pairing. No messages or admission snapshots
-- are copied into the bilateral challenge_match_chat_messages ledger.
create table quantum_private.league_team_chat_messages (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.department_challenge_teams(id) on delete cascade,
 sender_id uuid not null references public.users(id) on delete cascade,
 idempotency_key uuid not null,
 alias text not null,
 body text not null check(char_length(btrim(body)) between 1 and 1000),
 created_at timestamptz not null default clock_timestamp(),
 unique(team_id,sender_id,idempotency_key)
);
create index league_team_chat_history on quantum_private.league_team_chat_messages(team_id,created_at desc,id desc);
create index league_team_chat_rate on quantum_private.league_team_chat_messages(sender_id,created_at);
alter table quantum_private.league_team_chat_messages enable row level security;
revoke all on quantum_private.league_team_chat_messages from public,anon,authenticated,service_role;

create function quantum_private.league_team_chat_access(p_team uuid,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.department_challenge_teams t
  join public.department_challenges c on c.id=t.challenge_id
  join public.department_challenge_roster me on me.team_id=t.id and me.challenge_id=c.id
  where t.id=p_team and t.status='accepted' and c.status<>'cancelled'
   and me.user_id=p_actor and me.status='accepted'
   and exists(select 1 from quantum_private.get_member_department_identity(p_actor) i where i.school_scope_key=c.school_scope_key and i.department_key=t.department_key)
   and not exists(select 1 from quantum_private.challenge_restrictions r where r.user_id=p_actor and r.revoked_at is null and r.ends_at>now())
   and not exists(select 1 from public.department_challenge_roster member where member.team_id=t.id and member.status='accepted' and quantum_private.tonight_invite_pair_is_blocked(p_actor,member.user_id))
 )
$$;

create function quantum_private.league_team_chat(p_action text,p_args jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); team uuid; before_id uuid; before_time timestamptz; message_body text; key uuid;
 t public.department_challenge_teams%rowtype; c public.department_challenges%rowtype;
 message quantum_private.league_team_chat_messages%rowtype; peer record;
 rows jsonb; page_count integer; next_id uuid; school_key text;
begin
 if actor is null then raise exception 'not_authenticated'; end if;
 if p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>12000
  or p_action is null or p_action not in('read','send') then raise exception 'invalid_request'; end if;
 if p_action='read' then
  if not p_args ?& array['team_id','before'] or (p_args-array['team_id','before'])<>'{}'::jsonb then raise exception 'invalid_request'; end if;
 else
  if not p_args ?& array['team_id','body','idempotency_key'] or (p_args-array['team_id','body','idempotency_key'])<>'{}'::jsonb then raise exception 'invalid_request'; end if;
 end if;
 begin team:=(p_args->>'team_id')::uuid; before_id:=(p_args->>'before')::uuid; key:=(p_args->>'idempotency_key')::uuid;
 exception when invalid_text_representation then raise exception 'invalid_request'; end;
 if team is null then raise exception 'invalid_request'; end if;
 perform quantum_private.assert_activity_room_access(actor);
 select i.school_scope_key into school_key from quantum_private.get_member_department_identity(actor)i;
 -- Same pairing lock and canonical rows as league membership writers. Account
 -- deletion and block changes are also rechecked after waiting for these locks.
 perform pg_advisory_xact_lock(hashtextextended('quantum:challenge-league:'||school_key,0));
 select ch.* into c from public.department_challenges ch join public.department_challenge_teams tm on tm.challenge_id=ch.id where tm.id=team for update of ch;
 select * into t from public.department_challenge_teams where id=team for update;
 perform 1 from public.department_challenge_roster where team_id=team order by id for share;
 for peer in select distinct user_id from public.department_challenge_roster where team_id=team and status='accepted' and user_id<>actor order by user_id loop
  perform pg_advisory_xact_lock(quantum_private.friend_pair_lock_key(actor,peer.user_id));
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('account-delete|'||actor::text,0));
 perform quantum_private.assert_activity_room_access(actor);
 if not quantum_private.league_team_chat_access(team,actor) then raise exception 'team_chat_membership_required'; end if;
 if p_action='read' then
  if before_id is not null then
   select created_at into before_time from quantum_private.league_team_chat_messages where id=before_id and team_id=team;
   if before_time is null then raise exception 'invalid_cursor'; end if;
  end if;
  with page as(
   select * from quantum_private.league_team_chat_messages m where m.team_id=team
    and(before_id is null or(m.created_at,m.id)<(before_time,before_id)) order by m.created_at desc,m.id desc limit 51
  ), display as(select * from page order by created_at desc,id desc limit 50)
  select coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'alias',m.alias,'is_me',m.sender_id=actor,'created_at',m.created_at)order by m.created_at,m.id)from display m),'[]'),
   (select count(*)from page),case when(select count(*)from page)>50 then(select id from display order by created_at,id limit 1)end into rows,page_count,next_id;
  return jsonb_build_object('owner_id',actor,'chat',jsonb_build_object(
   'team_id',team,'challenge_id',t.challenge_id,'title',t.team_name,'department',t.department_label,
   'sport',quantum_private.challenge_journey_sport(t.challenge_id),
   'member_count',(select count(*)from public.department_challenge_roster where team_id=team and status='accepted'),
   'writable',c.status<>'completed','messages',rows,'has_more',page_count>50,'next_cursor',next_id));
 end if;
 if c.status='completed' then raise exception 'team_chat_closed'; end if;
 message_body:=btrim(p_args->>'body');
 if key is null or jsonb_typeof(p_args->'body')<>'string' or message_body is null
  or char_length(message_body) not between 1 and 1000 or message_body~'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then raise exception 'invalid_message'; end if;
 -- Serialize rate/idempotency across all of this actor's teams.
 perform pg_advisory_xact_lock(hashtextextended('league-team-chat-sender:'||actor::text,0));
 select * into message from quantum_private.league_team_chat_messages where team_id=team and sender_id=actor and idempotency_key=key;
 if message.id is not null then
  if message.body<>message_body then raise exception 'idempotency_key_reused'; end if;
 else
  if(select count(*)from quantum_private.league_team_chat_messages where sender_id=actor and created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'rate_limited'; end if;
  insert into quantum_private.league_team_chat_messages(team_id,sender_id,idempotency_key,alias,body)
   values(team,actor,key,quantum_private.activity_meetup_alias(actor),message_body) returning * into message;
 end if;
 return jsonb_build_object('owner_id',actor,'message',jsonb_build_object('id',message.id,'body',message.body,'alias',message.alias,'is_me',true,'created_at',message.created_at));
end
$$;

-- One private authorization/projection helper serves list and exact-room lookup.
-- It never returns a title, count, or timestamp before current membership passes.
create function quantum_private.social_chat_room(p_kind text,p_id uuid,p_actor uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;
begin
 if p_kind='league_team' then
  if not quantum_private.league_team_chat_access(p_id,p_actor) then return null; end if;
  select jsonb_build_object('title',t.team_name,'affiliation',t.department_label,'sport',quantum_private.challenge_journey_sport(c.id),'challenge_id',c.id,
   'member_count',(select count(*)from public.department_challenge_roster where team_id=t.id and status='accepted'),
   'writable',c.status<>'completed','updated_at',greatest(c.updated_at,(select max(created_at)from quantum_private.league_team_chat_messages where team_id=t.id))) into result
   from public.department_challenge_teams t join public.department_challenges c on c.id=t.challenge_id where t.id=p_id;
 elsif p_kind='league_match' then
  begin perform quantum_private.challenge_match_chat_access(p_id,p_actor,false);
  exception when raise_exception then
   if sqlerrm in('match_chat_membership_required','match_chat_forbidden','challenge_restricted_forbidden')then return null;else raise;end if;
  end;
  select jsonb_build_object('title',c.title,'sport',quantum_private.challenge_journey_sport(c.id),'challenge_id',c.id,'affiliation',(select string_agg(t.department_label,' · ' order by t.side)from public.department_challenge_teams t where t.challenge_id=c.id and t.status='accepted'),
   'member_count',(select count(*)from quantum_private.challenge_match_chat_members m join public.department_challenge_roster r on r.id=m.roster_id and r.team_id=m.team_id and r.challenge_id=m.challenge_id and r.user_id=m.user_id and r.status='accepted' where m.challenge_id=c.id),
   'writable',c.status<>'completed','updated_at',greatest(c.updated_at,(select max(created_at)from quantum_private.challenge_match_chat_messages where challenge_id=c.id))) into result from public.department_challenges c where c.id=p_id;
 elsif p_kind='meetup' then
  select jsonb_build_object('title',r.title,'affiliation',coalesce(r.department_label,r.school),
   'member_count',(select count(*)from public.activity_meetup_members m where m.meetup_id=r.id and m.status='joined'),
   'writable',r.status in('open','full'),'updated_at',greatest(r.updated_at,(select max(created_at)from public.activity_meetup_messages where meetup_id=r.id))) into result
  from public.activity_meetups r where r.id=p_id
   and exists(select 1 from public.activity_meetup_members m where m.meetup_id=r.id and m.user_id=p_actor and m.status='joined')
   and quantum_private.activity_meetup_scope_eligible(r.id,p_actor);
 elsif p_kind='activity_room' then
  select jsonb_build_object('title',p.activity_key||' '||r.room_number||'번 방','affiliation',p.activity_key,'activity_key',p.activity_key,'room_number',r.room_number,
   'member_count',(select count(*)from quantum_private.activity_room_members m where m.room_id=r.id and m.status='joined' and quantum_private.activity_room_member_current(p.id,m.user_id)),
   'writable',true,'updated_at',greatest(r.updated_at,p.updated_at,(select max(created_at)from quantum_private.activity_room_messages where room_id=r.id))) into result
  from quantum_private.activity_room_rooms r join quantum_private.activity_room_pools p on p.id=r.pool_id
  where r.id=p_id and r.status<>'retired' and p.status='active'
   and exists(select 1 from quantum_private.activity_room_members m where m.room_id=r.id and m.user_id=p_actor and m.status='joined' and quantum_private.activity_room_member_current(p.id,p_actor))
   and not exists(select 1 from quantum_private.activity_room_members m where m.room_id=r.id and m.status='joined' and quantum_private.activity_room_member_current(p.id,m.user_id) and quantum_private.tonight_invite_pair_is_blocked(p_actor,m.user_id));
 elsif p_kind='study_room' then
  select jsonb_build_object('title',p.course_name||' '||r.room_number||'번 방','affiliation',p.department_label,
   'member_count',(select count(*)from quantum_private.study_room_members where room_id=r.id and left_at is null),
   -- Existing study RPC allows member chat even after the ten-session program.
   'writable',true,'updated_at',greatest(r.created_at,(select max(created_at)from quantum_private.study_room_messages where room_id=r.id))) into result
  from quantum_private.study_rooms r join quantum_private.study_room_pools p on p.id=r.pool_id
  where r.id=p_id and exists(select 1 from quantum_private.study_room_members where room_id=r.id and user_id=p_actor and left_at is null)
   and exists(select 1 from quantum_private.get_member_department_identity(p_actor)i where i.school_scope_key=p.school_key and i.department_key=p.department_key)
   and not exists(select 1 from quantum_private.study_room_members m where m.room_id=r.id and m.left_at is null and quantum_private.tonight_invite_pair_is_blocked(p_actor,m.user_id));
 elsif p_kind='mentoring' then
  -- Mentoring hides closed messages by existing policy. Offered/pending groups
  -- and ended/expired sessions do not become chat rooms through this index.
  -- Current chat UI opens group sessions only. Legacy one-to-one records are
  -- preserved in their original ledger, without creating an unusable link here.
  select jsonb_build_object('title','학과 멘토링 '||s.side_size||':'||s.side_size,'affiliation',p.department,
   'member_count',s.side_size*2,'writable',true,'updated_at',greatest(s.created_at,(select max(created_at)from quantum_private.group_mentoring_messages where session_id=s.id))) into result
  from quantum_private.group_mentoring_sessions s join quantum_private.community_member_profiles p on p.user_id=p_actor
  where s.id=p_id and s.status='active' and s.expires_at>clock_timestamp()
   and exists(select 1 from quantum_private.group_mentoring_members m join quantum_private.group_mentoring_party_members pm on pm.party_id=m.party_id and pm.user_id=m.user_id where m.session_id=s.id and m.user_id=p_actor and m.accepted and pm.active and pm.accepted)
   and(select count(*)from quantum_private.group_mentoring_members m where m.session_id=s.id and m.accepted)=s.side_size*2
   and not exists(select 1 from quantum_private.group_mentoring_members m where m.session_id=s.id and not quantum_private.mentoring_member_eligible(m.user_id,s.school_key,s.department_key))
   and not exists(select 1 from quantum_private.group_mentoring_members a join quantum_private.group_mentoring_members b on a.session_id=b.session_id and a.user_id<b.user_id where a.session_id=s.id and quantum_private.group_mentoring_pair_excluded(a.user_id,b.user_id));
 else raise exception 'invalid_room_kind';
 end if;
 return case when result is null then null else jsonb_build_object('kind',p_kind,'id',p_id)||result end;
end
$$;

create function quantum_private.social_chat_rooms(p_args jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); kind text; room_id uuid; cursor_value text; result jsonb; rooms jsonb:='[]'; item record; next_cursor text; more boolean:=false;
begin
 if actor is null then raise exception 'not_authenticated'; end if;
 perform quantum_private.assert_activity_room_access(actor);
 if p_args is null or jsonb_typeof(p_args)<>'object' or not p_args ?& array['kind','id','cursor']
  or(p_args-array['kind','id','cursor'])<>'{}'::jsonb or octet_length(p_args::text)>1000 then raise exception 'invalid_request'; end if;
 kind:=p_args->>'kind';cursor_value:=p_args->>'cursor';
 begin room_id:=(p_args->>'id')::uuid;exception when invalid_text_representation then raise exception 'invalid_request';end;
 if kind is not null or room_id is not null then
  if kind is null or room_id is null or cursor_value is not null or kind not in('league_team','league_match','meetup','activity_room','study_room','mentoring') then raise exception 'invalid_request';end if;
  result:=quantum_private.social_chat_room(kind,room_id,actor);
  if result is null then raise exception 'chat_membership_required';end if;
  return jsonb_build_object('owner_id',actor,'rooms',jsonb_build_array(result),'has_more',false,'next_cursor',null);
 end if;
 if cursor_value is not null and cursor_value !~ '^(league_team|league_match|meetup|activity_room|study_room|mentoring):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'then raise exception 'invalid_cursor';end if;
 -- Membership is the input set; public discovery limits cannot truncate it.
 -- Stable kind/id keyset permits room renames and deleted cursor rooms safely.
 for item in
  with candidates as(
   select 'league_team'::text kind,r.team_id id from public.department_challenge_roster r where r.user_id=actor and r.status='accepted'
   union select 'league_match',m.challenge_id from quantum_private.challenge_match_chat_members m where m.user_id=actor
   union select 'meetup',m.meetup_id from public.activity_meetup_members m where m.user_id=actor and m.status='joined'
   union select 'activity_room',m.room_id from quantum_private.activity_room_members m where m.user_id=actor and m.status='joined'
   union select 'study_room',m.room_id from quantum_private.study_room_members m where m.user_id=actor and m.left_at is null
   union select 'mentoring',m.session_id from quantum_private.group_mentoring_members m where m.user_id=actor and m.accepted
  )select c.* from candidates c where cursor_value is null or(c.kind||':'||c.id::text)collate "C">lower(cursor_value)collate "C" order by(c.kind||':'||c.id::text)collate "C"
 loop
  result:=quantum_private.social_chat_room(item.kind,item.id,actor);
  if result is null then continue;end if;
  if jsonb_array_length(rooms)=50 then more:=true;exit;end if;
  rooms:=rooms||jsonb_build_array(result);next_cursor:=item.kind||':'||item.id;
 end loop;
 return jsonb_build_object('owner_id',actor,'rooms',rooms,'has_more',more,'next_cursor',case when more then next_cursor end);
end
$$;

create function public.league_team_chat(p_action text,p_args jsonb)returns jsonb
language sql volatile security invoker set search_path='' as $$select quantum_private.league_team_chat(p_action,p_args)$$;
create function public.social_chat_rooms(p_args jsonb)returns jsonb
language sql volatile security invoker set search_path='' as $$select quantum_private.social_chat_rooms(p_args)$$;
revoke all on function quantum_private.league_team_chat_access(uuid,uuid),quantum_private.social_chat_room(text,uuid,uuid),
 quantum_private.league_team_chat(text,jsonb),quantum_private.social_chat_rooms(jsonb),
 public.league_team_chat(text,jsonb),public.social_chat_rooms(jsonb)from public,anon,authenticated,service_role;
grant usage on schema quantum_private to authenticated;
grant execute on function quantum_private.league_team_chat(text,jsonb),quantum_private.social_chat_rooms(jsonb),
 public.league_team_chat(text,jsonb),public.social_chat_rooms(jsonb)to authenticated;

-- Auth deletion cascades authored rows (including replay keys) and cannot erase
-- peers' messages; no second ledger retains a copy of a deleted author's text.
comment on table quantum_private.league_team_chat_messages is 'Private current-team chat. Public user deletion cascades authored messages; no access for pending, departed, blocked or deleting accounts.';
commit;
