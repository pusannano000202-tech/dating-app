-- Preserve the existing chat contract and block filtering; expose a boolean, not account IDs.
-- Current membership and account status are checked by the database, not only the route.
begin;

create or replace function public.get_my_activity_meetup_chat(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_joined boolean;
  v_phase text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform quantum_private.assert_activity_room_access(v_actor);
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id=p_meetup_id;
  select exists(
    select 1 from public.activity_meetup_members as member
    where member.meetup_id=p_meetup_id and member.user_id=v_actor and member.status='joined'
  ) into v_joined;
  if v_meetup.id is null or not v_joined or not quantum_private.activity_meetup_scope_eligible(p_meetup_id,v_actor) then
    raise exception 'meetup_not_found';
  end if;
  v_phase:=case when v_meetup.status in ('open','full') then 'send' else 'read_only' end;
  return pg_catalog.jsonb_build_object(
    'phase',v_phase,
    'messages',(
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',message.id,'sender_alias',message.sender_alias_snapshot,
        'is_me',message.sender_user_id=v_actor,
        'message',message.message,'created_at',message.created_at
      ) order by message.created_at,message.id),'[]'::jsonb)
      from public.activity_meetup_messages as message
      where message.meetup_id=p_meetup_id
        and not exists(
          select 1 from public.friendships as friendship
          where friendship.status='blocked'
            and ((friendship.user_id=v_actor and friendship.friend_user_id=message.sender_user_id)
              or (friendship.user_id=message.sender_user_id and friendship.friend_user_id=v_actor))
        )
    )
  );
end
$$;

revoke all on function public.get_my_activity_meetup_chat(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_activity_meetup_chat(uuid) to authenticated;
commit;
