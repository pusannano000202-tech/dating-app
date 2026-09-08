begin;

create function public.get_activity_room_messages(
  p_room_id uuid,
  p_before_created_at timestamptz default null,
  p_before_message_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_pool_id uuid;
  v_messages jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  -- Reuse the canonical room-detail authorization boundary on every page:
  -- current auth/profile/school/gender/account state, active membership, and
  -- pair blocking are all re-evaluated before any message metadata is read.
  perform public.get_activity_room(p_room_id);

  if (p_before_created_at is null) <> (p_before_message_id is null) then
    raise exception 'invalid_activity_room_cursor';
  end if;

  select room.pool_id into v_pool_id
  from quantum_private.activity_room_rooms room
  where room.id=p_room_id;

  if p_before_created_at is not null and not exists(
    select 1
    from quantum_private.activity_room_messages message
    where message.room_id=p_room_id
      and message.id=p_before_message_id
      and message.created_at=p_before_created_at
  ) then
    raise exception 'invalid_activity_room_cursor';
  end if;

  with page as (
    select message.*
    from quantum_private.activity_room_messages message
    where message.room_id=p_room_id
      and quantum_private.activity_room_member_current(v_pool_id,message.sender_user_id)
      and (
        p_before_created_at is null
        or (message.created_at,message.id)<(p_before_created_at,p_before_message_id)
      )
    order by message.created_at desc,message.id desc
    limit 101
  ), selected as (
    select page.*
    from page
    order by page.created_at desc,page.id desc
    limit 100
  )
  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',selected.id,
      'sender_alias',quantum_private.activity_meetup_alias(selected.sender_user_id),
      'message',selected.message,
      'created_at',selected.created_at,
      'is_me',selected.sender_user_id=v_actor
    ) order by selected.created_at,selected.id),'[]'::jsonb),
    (select pg_catalog.count(*)>100 from page),
    case when (select pg_catalog.count(*)>100 from page) then (
      select pg_catalog.jsonb_build_object(
        'created_at',oldest.created_at,
        'id',oldest.id
      )
      from selected oldest
      order by oldest.created_at,oldest.id
      limit 1
    ) else null end
  into v_messages,v_has_more,v_next_cursor
  from selected;

  return pg_catalog.jsonb_build_object(
    'room_id',p_room_id,
    'messages',v_messages,
    'has_more',v_has_more,
    'next_cursor',v_next_cursor
  );
end
$$;

revoke all on function public.get_activity_room_messages(uuid,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_activity_room_messages(uuid,timestamptz,uuid)
  to authenticated;

commit;
