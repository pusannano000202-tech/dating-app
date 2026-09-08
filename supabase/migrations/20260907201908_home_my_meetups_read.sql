-- File only: local/remote application requires explicit approval.
-- Created with the repository's 14-digit UTC naming rule after PATH/npx lookup failed.
-- The separate local runtime launcher locates a pinned cached CLI; no apply is implied.
begin;

create function public.get_my_home_meetups()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_items jsonb;
  v_more boolean;
begin
  perform quantum_private.assert_activity_room_access(v_actor);
  with own_meetups as (
    select meetup.id, 'scheduled'::text as kind, meetup.title,
      meetup.activity_key, null::integer as room_number,
      (select pg_catalog.count(*)::integer from public.activity_meetup_members counted
       where counted.meetup_id=meetup.id and counted.status='joined'
       and quantum_private.activity_meetup_scope_eligible(meetup.id,counted.user_id)) as member_count,
      meetup.capacity, meetup.scheduled_at, meetup.place_name, meetup.status,
      meetup.scheduled_at as sort_at
    from public.activity_meetups meetup
    join public.activity_meetup_members mine on mine.meetup_id=meetup.id
      and mine.user_id=v_actor and mine.status='joined'
    where meetup.status in ('open','full') and meetup.ends_at>pg_catalog.clock_timestamp()
      and quantum_private.activity_meetup_scope_eligible(meetup.id,v_actor)
    union all
    select room.id, 'activity_room'::text, null::text,
      pool.activity_key, room.room_number,
      (select pg_catalog.count(*)::integer from quantum_private.activity_room_members counted
       where counted.room_id=room.id and counted.status='joined'
       and quantum_private.activity_room_member_current(pool.id,counted.user_id)),
      pool.capacity, null::timestamptz, null::text, room.status, mine.joined_at
    from quantum_private.activity_room_members mine
    join quantum_private.activity_room_rooms room on room.id=mine.room_id
    join quantum_private.activity_room_pools pool on pool.id=room.pool_id
    where mine.user_id=v_actor and mine.status='joined'
      and room.status in ('open','full')
      and quantum_private.activity_room_member_current(pool.id,v_actor)
  ), ranked as (
    -- A known ongoing/upcoming appointment is actionable before an unscheduled room.
    -- Within automatic rooms, recent participation is most useful to resume.
    select own_meetups.*, pg_catalog.row_number() over(order by
      case when kind='scheduled' then 0 else 1 end,
      case when kind='scheduled' then sort_at end asc,
      case when kind='activity_room' then sort_at end desc,
      id,kind) as position
    from own_meetups
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',id,'kind',kind,'title',title,'activity_key',activity_key,'room_number',room_number,
    'member_count',member_count,'capacity',capacity,'scheduled_at',scheduled_at,
    'place_name',place_name,'status',status
  ) order by position) filter(where position<=100),'[]'::jsonb),
  coalesce(pg_catalog.bool_or(position>100),false)
  into v_items,v_more from ranked;
  return pg_catalog.jsonb_build_object('items',v_items,'has_more',v_more);
end
$$;

revoke all on function public.get_my_home_meetups() from public,anon,authenticated,service_role;
grant execute on function public.get_my_home_meetups() to authenticated;
comment on function public.get_my_home_meetups() is
  'Read-only own active memberships; no public-list cap before ownership, no PII, no room creation.';
commit;
