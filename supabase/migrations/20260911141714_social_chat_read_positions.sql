begin;

-- A receipt names an actually displayed message, not a wall-clock high-water
-- mark. Jumping to the latest page must leave older unseen messages unread.
create table quantum_private.social_chat_read_positions (
 user_id uuid not null references public.users(id) on delete cascade,
 room_kind text not null check(room_kind in('league_team','league_match','meetup','activity_room','study_room','mentoring')),
 room_id uuid not null, message_id uuid not null,
 read_at timestamptz not null default clock_timestamp(),
 primary key(user_id,room_kind,room_id,message_id)
);
alter table quantum_private.social_chat_read_positions enable row level security;
revoke all on quantum_private.social_chat_read_positions from public,anon,authenticated,service_role;

-- Internal projection only; every caller first checks the original room gate.
-- Mirror each canonical chat's message-level rules as well as room membership:
-- meetup blocks are per sender, activity history requires current pool identity,
-- match/group mentoring history joins its captured aliases; mentoring exposes
-- only its latest 100 messages and has no older-history endpoint.
create function quantum_private.social_chat_message_rows(p_kind text,p_id uuid,p_actor uuid)
returns table(id uuid,author_id uuid,body text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select m.id,m.sender_id,m.body,m.created_at from quantum_private.league_team_chat_messages m where p_kind='league_team' and m.team_id=p_id
 union all select m.id,m.sender_id,m.body,m.created_at from quantum_private.challenge_match_chat_messages m
  join quantum_private.challenge_match_chat_members member on member.challenge_id=m.challenge_id and member.user_id=m.sender_id
  where p_kind='league_match' and m.challenge_id=p_id
 union all select m.id,m.sender_user_id,m.message,m.created_at from public.activity_meetup_messages m
  where p_kind='meetup' and m.meetup_id=p_id and not exists(select 1 from public.friendships f where f.status='blocked'
   and((f.user_id=p_actor and f.friend_user_id=m.sender_user_id)or(f.user_id=m.sender_user_id and f.friend_user_id=p_actor)))
 union all select m.id,m.sender_user_id,m.message,m.created_at from quantum_private.activity_room_messages m
  join quantum_private.activity_room_rooms r on r.id=m.room_id
  where p_kind='activity_room' and m.room_id=p_id and quantum_private.activity_room_member_current(r.pool_id,m.sender_user_id)
 union all select m.id,m.user_id,m.message,m.created_at from quantum_private.study_room_messages m where p_kind='study_room' and m.room_id=p_id
 union all select m.id,m.author_id,m.body,m.created_at
  from(select * from quantum_private.group_mentoring_messages where p_kind='mentoring' and session_id=p_id order by created_at desc,id desc limit 100)m
  join quantum_private.group_mentoring_members member on member.session_id=m.session_id and member.user_id=m.author_id
$$;

alter function quantum_private.social_chat_room(text,uuid,uuid) rename to social_chat_room_authorized_base;
create function quantum_private.social_chat_room(p_kind text,p_id uuid,p_actor uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare room jsonb; latest jsonb; unread integer; structural_time timestamptz;
begin
 room:=quantum_private.social_chat_room_authorized_base(p_kind,p_id,p_actor);
 if room is null then return null;end if;
 select jsonb_build_object('id',m.id,'body',left(m.body,160),'created_at',m.created_at,'is_me',m.author_id=p_actor)
 into latest from quantum_private.social_chat_message_rows(p_kind,p_id,p_actor)m order by m.created_at desc,m.id desc limit 1;
 select count(*)::integer into unread from quantum_private.social_chat_message_rows(p_kind,p_id,p_actor)m
 where m.author_id<>p_actor and not exists(select 1 from quantum_private.social_chat_read_positions r
  where r.user_id=p_actor and r.room_kind=p_kind and r.room_id=p_id and r.message_id=m.id);
 -- The older room projection mixed raw-message timestamps into updated_at.
 -- Replace that aggregate too, so hidden senders cannot affect sorting/time.
 if p_kind='league_team' then select c.updated_at into structural_time from public.department_challenges c join public.department_challenge_teams t on t.challenge_id=c.id where t.id=p_id;
 elsif p_kind='league_match' then select updated_at into structural_time from public.department_challenges where id=p_id;
 elsif p_kind='meetup' then select updated_at into structural_time from public.activity_meetups where id=p_id;
 elsif p_kind='activity_room' then select greatest(r.updated_at,p.updated_at) into structural_time from quantum_private.activity_room_rooms r join quantum_private.activity_room_pools p on p.id=r.pool_id where r.id=p_id;
 elsif p_kind='study_room' then select created_at into structural_time from quantum_private.study_rooms where id=p_id;
 elsif p_kind='mentoring' then select created_at into structural_time from quantum_private.group_mentoring_sessions where id=p_id;
 end if;
 return room||jsonb_build_object('latest_message',latest,'unread_count',unread,'updated_at',greatest(structural_time,(latest->>'created_at')::timestamptz));
end
$$;

-- Global authorized-room ordering precedes pagination. The cursor captures its
-- sort values, so deleting a cursor room does not restart or truncate history.
create or replace function quantum_private.social_chat_rooms(p_args jsonb)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();kind text;room_id uuid;cursor_value text;parts text[];cursor_unread boolean;cursor_time timestamptz;cursor_key text;
 result jsonb;rooms jsonb:='[]';item record;next_cursor text;more boolean:=false;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 perform quantum_private.assert_activity_room_access(actor);
 if p_args is null or jsonb_typeof(p_args)<>'object' or not p_args ?& array['kind','id','cursor'] or(p_args-array['kind','id','cursor'])<>'{}'::jsonb or octet_length(p_args::text)>1000 then raise exception 'invalid_request';end if;
 kind:=p_args->>'kind';cursor_value:=p_args->>'cursor';
 begin room_id:=(p_args->>'id')::uuid;exception when invalid_text_representation then raise exception 'invalid_request';end;
 if kind is not null or room_id is not null then
  if kind is null or room_id is null or cursor_value is not null or kind not in('league_team','league_match','meetup','activity_room','study_room','mentoring')then raise exception 'invalid_request';end if;
  result:=quantum_private.social_chat_room(kind,room_id,actor);if result is null then raise exception 'chat_membership_required';end if;
  return jsonb_build_object('owner_id',actor,'rooms',jsonb_build_array(result),'has_more',false,'next_cursor',null);
 end if;
 if cursor_value is not null then
  parts:=string_to_array(cursor_value,'|');
  if cardinality(parts)=3 and parts[1] in('0','1') then
   cursor_unread:=parts[1]='1';cursor_key:=parts[3];
   begin cursor_time:=parts[2]::timestamptz;exception when others then raise exception 'invalid_cursor';end;
  elsif cardinality(parts)=1 then cursor_key:=cursor_value;
  else raise exception 'invalid_cursor';end if;
  if cursor_key !~ '^(league_team|league_match|meetup|activity_room|study_room|mentoring):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'then raise exception 'invalid_cursor';end if;
 end if;
 for item in
  with candidates as(
   select 'league_team'::text kind,r.team_id id from public.department_challenge_roster r where r.user_id=actor and r.status='accepted'
   union select 'league_match',m.challenge_id from quantum_private.challenge_match_chat_members m where m.user_id=actor
   union select 'meetup',m.meetup_id from public.activity_meetup_members m where m.user_id=actor and m.status='joined'
   union select 'activity_room',m.room_id from quantum_private.activity_room_members m where m.user_id=actor and m.status='joined'
   union select 'study_room',m.room_id from quantum_private.study_room_members m where m.user_id=actor and m.left_at is null
   union select 'mentoring',m.session_id from quantum_private.group_mentoring_members m where m.user_id=actor and m.accepted
  ),authorized as materialized(select c.kind||':'||c.id::text key,quantum_private.social_chat_room(c.kind,c.id,actor)room from candidates c),ranked as(
   select a.*,coalesce((a.room->>'unread_count')::integer,0)>0 unread,coalesce((a.room->'latest_message'->>'created_at')::timestamptz,(a.room->>'updated_at')::timestamptz)at from authorized a where a.room is not null
  )select r.* from ranked r where cursor_key is null
   or(cursor_time is null and r.key collate "C">lower(cursor_key)collate "C")
   or(cursor_time is not null and(r.unread<cursor_unread or(r.unread=cursor_unread and(r.at<cursor_time or(r.at=cursor_time and r.key collate "C">lower(cursor_key)collate "C")))))
  order by r.unread desc,r.at desc,r.key collate "C" limit 51
 loop
  if jsonb_array_length(rooms)=50 then more:=true;exit;end if;
  rooms:=rooms||jsonb_build_array(item.room);next_cursor:=(case when item.unread then '1' else '0'end)||'|'||to_char(item.at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')||'|'||item.key;
 end loop;
 return jsonb_build_object('owner_id',actor,'rooms',rooms,'has_more',more,'next_cursor',case when more then next_cursor end);
end
$$;

create function quantum_private.mark_social_chat_read(p_kind text,p_room_id uuid,p_message_ids uuid[]) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); room jsonb;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 if p_kind is null or p_kind not in('league_team','league_match','meetup','activity_room','study_room','mentoring')
  or p_room_id is null or p_message_ids is null or cardinality(p_message_ids) not between 1 and 100
  or array_position(p_message_ids,null) is not null then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended('account-delete|'||actor::text,0));
 perform quantum_private.assert_activity_room_access(actor);
 room:=quantum_private.social_chat_room_authorized_base(p_kind,p_room_id,actor);
 if room is null then raise exception 'chat_membership_required';end if;
 if exists(select 1 from unnest(p_message_ids) requested(id) where not exists(
  select 1 from quantum_private.social_chat_message_rows(p_kind,p_room_id,actor)m where m.id=requested.id)) then raise exception 'invalid_message';end if;
 insert into quantum_private.social_chat_read_positions(user_id,room_kind,room_id,message_id)
 select actor,p_kind,p_room_id,id from unnest(p_message_ids)requested(id) on conflict do nothing;
 return jsonb_build_object('owner_id',actor,'ok',true);
end
$$;
create function public.mark_social_chat_read(p_kind text,p_room_id uuid,p_message_ids uuid[])returns jsonb
language sql volatile security invoker set search_path='' as $$select quantum_private.mark_social_chat_read(p_kind,p_room_id,p_message_ids)$$;
revoke all on function quantum_private.social_chat_message_rows(text,uuid,uuid),quantum_private.social_chat_room_authorized_base(text,uuid,uuid),
 quantum_private.social_chat_room(text,uuid,uuid),quantum_private.mark_social_chat_read(text,uuid,uuid[]),public.mark_social_chat_read(text,uuid,uuid[])from public,anon,authenticated,service_role;
grant execute on function quantum_private.mark_social_chat_read(text,uuid,uuid[]),public.mark_social_chat_read(text,uuid,uuid[])to authenticated;
commit;
