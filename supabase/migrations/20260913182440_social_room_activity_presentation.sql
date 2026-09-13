begin;

-- Add catalog identity only AFTER the existing current-membership gate passes.
-- Existing rooms, messages, read receipts and grants remain intact.
create or replace function quantum_private.social_chat_room(p_kind text,p_id uuid,p_actor uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare room jsonb; latest jsonb; unread integer; structural_time timestamptz; metadata jsonb;
begin
 room:=quantum_private.social_chat_room_authorized_base(p_kind,p_id,p_actor);
 if room is null then return null;end if;
 select jsonb_build_object('id',m.id,'body',left(m.body,160),'created_at',m.created_at,'is_me',m.author_id=p_actor)
 into latest from quantum_private.social_chat_message_rows(p_kind,p_id,p_actor)m order by m.created_at desc,m.id desc limit 1;
 select count(*)::integer into unread from quantum_private.social_chat_message_rows(p_kind,p_id,p_actor)m
 where m.author_id<>p_actor and not exists(select 1 from quantum_private.social_chat_read_positions r
  where r.user_id=p_actor and r.room_kind=p_kind and r.room_id=p_id and r.message_id=m.id);
 if p_kind='league_team' then select c.updated_at into structural_time from public.department_challenges c join public.department_challenge_teams t on t.challenge_id=c.id where t.id=p_id;
 elsif p_kind='league_match' then select updated_at into structural_time from public.department_challenges where id=p_id;
 elsif p_kind='meetup' then
  select updated_at,jsonb_build_object('activity_key',activity_key,'category',category) into structural_time,metadata from public.activity_meetups where id=p_id;
 elsif p_kind='activity_room' then select greatest(r.updated_at,p.updated_at) into structural_time from quantum_private.activity_room_rooms r join quantum_private.activity_room_pools p on p.id=r.pool_id where r.id=p_id;
 elsif p_kind='study_room' then
  select r.created_at,jsonb_build_object('course_key',p.course_id,'category','study')
   || case when r.admission_mode='hosted' and nullif(btrim(r.title),'') is not null then jsonb_build_object('title',r.title) else '{}'::jsonb end
  into structural_time,metadata from quantum_private.study_rooms r join quantum_private.study_room_pools p on p.id=r.pool_id where r.id=p_id;
 elsif p_kind='mentoring' then select created_at into structural_time from quantum_private.group_mentoring_sessions where id=p_id;
 end if;
 return room||coalesce(metadata,'{}'::jsonb)||jsonb_build_object('latest_message',latest,'unread_count',unread,'updated_at',greatest(structural_time,(latest->>'created_at')::timestamptz));
end
$$;
revoke all on function quantum_private.social_chat_room(text,uuid,uuid) from public,anon,authenticated,service_role;
commit;
