-- Pending appointments have NULL dates/place and a named state.
-- Confirmed v3 clients retain their signature and existing validation.
begin;
alter table public.activity_meetups
  alter column scheduled_at drop not null,
  alter column place_name drop not null,
  add column schedule_status text not null default 'confirmed'
    check (schedule_status in ('confirmed','schedule_pending')),
  add constraint activity_meetups_schedule_state_check check (
    (schedule_status='schedule_pending' and scheduled_at is null and ends_at is null and place_name is null and shared_guide_step is null and status <> 'completed')
    or (schedule_status='confirmed' and scheduled_at is not null and place_name is not null)
  );


create function public.create_activity_meetup_v4(
 p_category text,p_title text,p_description text,p_place_name text,p_scheduled_at timestamptz,
 p_capacity integer,p_gender_mode text,p_ends_at timestamptz,p_scope_type text,p_activity_key text,
 p_idempotency_key uuid,p_schedule_status text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid();
 v_existing public.activity_meetup_events%rowtype;
 v_meetup public.activity_meetups%rowtype;
 v_hash text;v_result jsonb;v_school text;v_eligibility text;
 v_school_scope_key text;v_department_key text;v_department_label text;
begin
 if v_actor is null then raise exception 'not_authenticated'; end if;
 if p_schedule_status is null or p_schedule_status not in ('confirmed','schedule_pending') then raise exception 'invalid_schedule_status'; end if;
 if p_idempotency_key is null or p_scope_type is null or p_scope_type not in ('school','department') then raise exception 'invalid_meetup_scope'; end if;
 if p_gender_mode is null or p_gender_mode not in ('all','male_only','female_only') then raise exception 'invalid_gender_mode'; end if;
 if p_schedule_status='confirmed' then
  return public.create_activity_meetup_v3(p_category,p_title,p_description,p_place_name,p_scheduled_at,p_capacity,p_gender_mode,p_ends_at,p_scope_type,p_activity_key,p_idempotency_key)
    || pg_catalog.jsonb_build_object('schedule_status','confirmed');
 end if;
 if p_place_name is not null or p_scheduled_at is not null or p_ends_at is not null then raise exception 'invalid_pending_schedule'; end if;
 if p_category is null or p_category not in ('baseball','soccer','basketball','badminton','tennis','running','board_game','gaming','hiking','walking','dining','study','other') then raise exception 'invalid_category'; end if;
 if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_title,''))) not between 4 and 60 then raise exception 'invalid_title'; end if;
 if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_description,'')))>500 then raise exception 'invalid_description'; end if;
 if p_capacity is null or p_capacity not between 2 and 20 then raise exception 'invalid_capacity'; end if;
 if not quantum_private.meetup_activity_key_valid(p_category,p_activity_key) then raise exception 'invalid_activity_key'; end if;
 v_hash:=pg_catalog.md5(pg_catalog.jsonb_build_array(p_category,p_title,p_description,p_capacity,p_gender_mode,p_scope_type,p_activity_key,p_schedule_status)::text);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-create:'||v_actor::text||':'||p_idempotency_key::text,0));
 select event.* into v_existing from public.activity_meetup_events event where event.actor_user_id=v_actor and event.idempotency_key=p_idempotency_key for update;
 if v_existing.id is not null then
  if v_existing.action<>'created' or v_existing.request_hash<>v_hash then raise exception 'idempotency_key_reused'; end if;
  return v_existing.result;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:'||v_actor::text,0));
 select identity.school into v_school from quantum_private.get_community_identity(v_actor) identity;
 if v_school is null then raise exception 'profile_required'; end if;
 v_eligibility:=quantum_private.meetup_gender_eligibility(v_actor,p_gender_mode);
 if v_eligibility='gender_required' then raise exception 'meetup_gender_required'; end if;
 if v_eligibility is distinct from 'eligible' then raise exception 'meetup_gender_restricted'; end if;
 if p_scope_type='department' then
  select identity.school_scope_key,identity.department_key into v_school_scope_key,v_department_key from quantum_private.get_member_department_identity(v_actor) identity;
  if v_school_scope_key is null or v_department_key is null then raise exception 'department_identity_required'; end if;
  select pg_catalog.btrim(profile.department) into v_department_label from quantum_private.community_member_profiles profile where profile.user_id=v_actor;
  if v_department_label is null then raise exception 'department_identity_required'; end if;
 end if;
 insert into public.activity_meetups(host_user_id,school,category,title,description,place_name,scheduled_at,ends_at,capacity,gender_mode,scope_type,school_scope_key,department_key,department_label,activity_key,schedule_status)
 values(v_actor,v_school,p_category,pg_catalog.btrim(p_title),pg_catalog.btrim(coalesce(p_description,'')),null,null,null,p_capacity,p_gender_mode,p_scope_type,v_school_scope_key,v_department_key,v_department_label,p_activity_key,'schedule_pending')
 returning * into v_meetup;
 insert into public.activity_meetup_members(meetup_id,user_id,role,school_scope_key_snapshot,department_key_snapshot)
 values(v_meetup.id,v_actor,'host',v_school_scope_key,v_department_key);
 v_result:=pg_catalog.jsonb_build_object('id',v_meetup.id,'category',p_category,'title',v_meetup.title,'description',v_meetup.description,'place_name',null,'scheduled_at',null,'ends_at',null,'schedule_status','schedule_pending','capacity',p_capacity,'status',v_meetup.status,'member_count',1,'joined',true,'is_host',true,'gender_mode',p_gender_mode,'gender_eligibility','eligible','scope_type',p_scope_type,'department_label',v_department_label,'activity_key',p_activity_key,'revision',0,'created_at',v_meetup.created_at);
 insert into public.activity_meetup_events(meetup_id,actor_user_id,action,request_hash,idempotency_key,prior_revision,resulting_revision,public_payload,result)
 values(v_meetup.id,v_actor,'created',v_hash,p_idempotency_key,0,0,pg_catalog.jsonb_build_object('scope_type',p_scope_type,'schedule_status','schedule_pending'),v_result);
 return v_result;
end $$;
revoke all on function public.create_activity_meetup_v4(text,text,text,text,timestamptz,integer,text,timestamptz,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.create_activity_meetup_v4(text,text,text,text,timestamptz,integer,text,timestamptz,text,text,uuid,text) to authenticated;

create or replace function public.list_activity_meetups_v4(
  p_category text,
  p_limit integer,
  p_gender_mode text,
  p_scope_type text,
  p_cursor text default null
)
returns table (
  id uuid, category text, title text, description text, place_name text,
  scheduled_at timestamptz, ends_at timestamptz, capacity smallint, status text,
  member_count bigint, joined boolean, is_host boolean, created_at timestamptz,
  gender_mode text, gender_eligibility text, scope_type text, department_label text,
  activity_key text, revision integer, schedule_status text, list_cursor text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school text;
  v_cursor jsonb; v_scheduled timestamptz; v_created timestamptz; v_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_scope_type is not null and p_scope_type not in ('school', 'department') then raise exception 'invalid_scope_type'; end if;
  if p_cursor is not null then
    begin
      if pg_catalog.octet_length(p_cursor)>300 then raise exception 'invalid_cursor'; end if;
      v_cursor:=p_cursor::jsonb;
      if pg_catalog.jsonb_typeof(v_cursor)<>'array' or pg_catalog.jsonb_array_length(v_cursor)<>3
        or pg_catalog.jsonb_typeof(v_cursor->0) not in ('null','string')
        or pg_catalog.jsonb_typeof(v_cursor->1)<>'string' or pg_catalog.jsonb_typeof(v_cursor->2)<>'string'
      then raise exception 'invalid_cursor';end if;
      v_scheduled:=(v_cursor->>0)::timestamptz;v_created:=(v_cursor->>1)::timestamptz;v_id:=(v_cursor->>2)::uuid;
      if not pg_catalog.isfinite(v_created) or (v_scheduled is not null and not pg_catalog.isfinite(v_scheduled)) then raise exception 'invalid_cursor';end if;
    exception when others then raise exception 'invalid_cursor';end;
  end if;
  select identity.school into v_school from quantum_private.get_community_identity(v_actor) as identity;
  if v_school is null then raise exception 'profile_required'; end if;
  return query
  select meetup.id, meetup.category, meetup.title, meetup.description, meetup.place_name,
    meetup.scheduled_at, meetup.ends_at, meetup.capacity, meetup.status,
    (select pg_catalog.count(*) from public.activity_meetup_members as counted
      where counted.meetup_id = meetup.id and counted.status = 'joined'
        and quantum_private.activity_meetup_scope_eligible(meetup.id, counted.user_id)),
    exists (select 1 from public.activity_meetup_members as mine where mine.meetup_id = meetup.id and mine.user_id = v_actor and mine.status = 'joined'),
    meetup.host_user_id = v_actor,
    meetup.created_at, meetup.gender_mode,
    quantum_private.meetup_gender_eligibility(v_actor, meetup.gender_mode),
    meetup.scope_type, meetup.department_label, meetup.activity_key, meetup.revision, meetup.schedule_status,
    pg_catalog.jsonb_build_array(meetup.scheduled_at,meetup.created_at,meetup.id)::text
  from public.activity_meetups as meetup
  where meetup.school = v_school
    and meetup.status in ('open', 'full')
    and (meetup.schedule_status = 'schedule_pending' or meetup.scheduled_at > pg_catalog.clock_timestamp())
    and (p_category is null or meetup.category = p_category)
    and (p_gender_mode is null or meetup.gender_mode = p_gender_mode)
    and (p_scope_type is null or meetup.scope_type = p_scope_type)
    and quantum_private.activity_meetup_scope_eligible(meetup.id, v_actor)
    and (p_cursor is null
      or (v_scheduled is not null and meetup.scheduled_at is null)
      or meetup.scheduled_at>v_scheduled
      or (meetup.scheduled_at is not distinct from v_scheduled and
        (meetup.created_at<v_created or (meetup.created_at=v_created and meetup.id<v_id))))
  -- Preserve chronological confirmed ordering and make the NULL pending tail
  -- reachable. The cursor carries values, so its row may disappear safely.
  order by meetup.scheduled_at asc nulls last, meetup.created_at desc, meetup.id desc
  -- API requests one sentinel row beyond the visible maximum of 30.
  limit greatest(1, least(coalesce(p_limit, 30), 31));
end
$$;

create or replace function public.get_my_home_meetups()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_items jsonb;v_more boolean;
begin
 perform quantum_private.assert_activity_room_access(v_actor);
 with own_meetups as (
  select meetup.id,'scheduled'::text as kind,meetup.title,meetup.activity_key,null::integer as room_number,
   (select pg_catalog.count(*)::integer from public.activity_meetup_members counted
    where counted.meetup_id=meetup.id and counted.status='joined'
    and quantum_private.activity_meetup_scope_eligible(meetup.id,counted.user_id)) as member_count,
   meetup.capacity,meetup.scheduled_at,meetup.place_name,meetup.status,meetup.schedule_status,
   coalesce(meetup.scheduled_at,mine.joined_at) as sort_at
  from public.activity_meetups meetup
  join public.activity_meetup_members mine on mine.meetup_id=meetup.id and mine.user_id=v_actor and mine.status='joined'
  where meetup.status in ('open','full')
   and (meetup.schedule_status='schedule_pending' or meetup.ends_at>pg_catalog.clock_timestamp())
   and quantum_private.activity_meetup_scope_eligible(meetup.id,v_actor)
  union all
  select room.id,'activity_room'::text,null::text,pool.activity_key,room.room_number,
   (select pg_catalog.count(*)::integer from quantum_private.activity_room_members counted
    where counted.room_id=room.id and counted.status='joined'
    and quantum_private.activity_room_member_current(pool.id,counted.user_id)),
   pool.capacity,null::timestamptz,null::text,room.status,null::text,mine.joined_at
  from quantum_private.activity_room_members mine
  join quantum_private.activity_room_rooms room on room.id=mine.room_id
  join quantum_private.activity_room_pools pool on pool.id=room.pool_id
  where mine.user_id=v_actor and mine.status='joined' and room.status in ('open','full')
   and quantum_private.activity_room_member_current(pool.id,v_actor)
 ),ranked as (
  select own_meetups.*,pg_catalog.row_number() over(order by
   case when schedule_status='confirmed' then 0 else 1 end,
   case when schedule_status='confirmed' then sort_at end asc,
   case when schedule_status is distinct from 'confirmed' then sort_at end desc,id,kind) as position
  from own_meetups
 )
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'id',id,'kind',kind,'title',title,'activity_key',activity_key,'room_number',room_number,
  'member_count',member_count,'capacity',capacity,'scheduled_at',scheduled_at,
  'place_name',place_name,'status',status,'schedule_status',schedule_status
 ) order by position) filter(where position<=100),'[]'::jsonb),coalesce(pg_catalog.bool_or(position>100),false)
 into v_items,v_more from ranked;
 return pg_catalog.jsonb_build_object('items',v_items,'has_more',v_more);
end $$;
revoke all on function public.get_my_home_meetups() from public,anon,authenticated,service_role;
grant execute on function public.get_my_home_meetups() to authenticated;

create or replace function public.get_my_activity_meetup_detail(p_meetup_id uuid)
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
  v_scope_eligible boolean;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id=p_meetup_id;
  v_scope_eligible:=quantum_private.activity_meetup_scope_eligible(p_meetup_id,v_actor);
  if v_meetup.id is null or (not v_scope_eligible and v_meetup.host_user_id<>v_actor) then raise exception 'meetup_not_found'; end if;
  select exists(select 1 from public.activity_meetup_members as member where member.meetup_id=p_meetup_id and member.user_id=v_actor and member.status='joined') into v_joined;
  return pg_catalog.jsonb_build_object(
    'id',v_meetup.id,'category',v_meetup.category,'activity_key',v_meetup.activity_key,
    'title',v_meetup.title,'description',v_meetup.description,'place_name',v_meetup.place_name,
    'schedule_status',v_meetup.schedule_status,'scheduled_at',v_meetup.scheduled_at,'ends_at',v_meetup.ends_at,'capacity',v_meetup.capacity,
    'status',v_meetup.status,'gender_mode',v_meetup.gender_mode,'scope_type',v_meetup.scope_type,
    'department_label',v_meetup.department_label,'revision',v_meetup.revision,'joined',v_joined,
    'is_host',v_meetup.host_user_id=v_actor,
    'scope_eligibility',case when v_scope_eligible then 'eligible' else 'department_restricted' end,
    'member_count',(select pg_catalog.count(*) from public.activity_meetup_members as member where member.meetup_id=p_meetup_id and member.status='joined' and quantum_private.activity_meetup_scope_eligible(p_meetup_id,member.user_id)),
    'members',case when v_joined or v_meetup.host_user_id=v_actor then (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'alias',member.identity_alias_snapshot,'role',member.role
      ) order by member.joined_at,member.user_id),'[]'::jsonb)
      from public.activity_meetup_members as member
      where member.meetup_id=p_meetup_id and member.status='joined'
        and quantum_private.activity_meetup_scope_eligible(p_meetup_id,member.user_id)
    ) else '[]'::jsonb end,
    'events',case when v_joined or v_meetup.host_user_id=v_actor then (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'action',event.action,'created_at',event.created_at,'resulting_revision',event.resulting_revision,
        'public_payload',event.public_payload
      ) order by event.created_at,event.id),'[]'::jsonb)
      from public.activity_meetup_events as event where event.meetup_id=p_meetup_id
    ) else '[]'::jsonb end
  );
end
$$;

create or replace function public.get_my_activity_meetup_guide(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_progress public.activity_meetup_guide_progress%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  if v_meetup.id is null or not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor)
     or not exists (
       select 1 from public.activity_meetup_members as member
       where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
     ) then
    raise exception 'meetup_not_found';
  end if;
  select progress.* into v_progress from public.activity_meetup_guide_progress as progress
  where progress.meetup_id = p_meetup_id and progress.user_id = v_actor;
  return pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.clock_timestamp(),
    'category', v_meetup.category,
    'activity_key', v_meetup.activity_key,
    'lifecycle_status', v_meetup.status,
    'schedule_status', v_meetup.schedule_status,
    'scheduled_at', v_meetup.scheduled_at,
    'ends_at', v_meetup.ends_at,
    'shared_step', v_meetup.shared_guide_step,
    'personal_acknowledged_step', v_progress.acknowledged_step,
    'meetup_revision', v_meetup.revision,
    'personal_revision', coalesce(v_progress.revision, 0),
    'is_host', v_meetup.host_user_id = v_actor
  );
end
$$;

create or replace function public.leave_activity_meetup(p_meetup_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_prior_revision integer;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'quantum:minimum-signup:user:' || v_actor::text, 0
  ));
  select meetup.* into v_meetup
  from public.activity_meetups as meetup
  where meetup.id = p_meetup_id
  for update;
  if v_meetup.id is null then raise exception 'meetup_not_found'; end if;
  if v_meetup.host_user_id = v_actor then raise exception 'host_cannot_leave'; end if;

  update public.activity_meetup_members as member
  set status = 'left', left_at = pg_catalog.clock_timestamp(),
      membership_revision = member.membership_revision + 1
  where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined';
  if not found then
    return pg_catalog.jsonb_build_object('joined', false, 'reused', true, 'revision', v_meetup.revision);
  end if;
  v_prior_revision := v_meetup.revision;
  update public.activity_meetups as meetup
  set status = case
        when meetup.status = 'full' and (meetup.schedule_status = 'schedule_pending' or meetup.scheduled_at > pg_catalog.clock_timestamp()) then 'open'
        else meetup.status
      end,
      revision = meetup.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object('joined', false, 'reused', false, 'revision', v_prior_revision + 1);
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'member_left', pg_catalog.md5(v_actor::text || ':' || (v_prior_revision + 1)::text), pg_catalog.gen_random_uuid(),
    v_prior_revision, v_prior_revision + 1, '{}'::jsonb, v_result
  );
  return v_result;
end
$$;

create or replace function public.acknowledge_my_activity_meetup_guide(
  p_meetup_id uuid,
  p_scene_id text,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_progress public.activity_meetup_guide_progress%rowtype;
  v_action public.activity_meetup_personal_actions%rowtype;
  v_revision integer;
  v_current text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null or p_scene_id not in ('prepare', 'gather', 'greet', 'start', 'activity', 'wrap', 'next') then
    raise exception 'invalid_guide_scene';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-meetup-personal:' || v_actor::text || ':' || p_idempotency_key::text, 0
  ));
  select action.* into v_action from public.activity_meetup_personal_actions as action
  where action.actor_user_id = v_actor and action.idempotency_key = p_idempotency_key for update;
  if v_action.id is not null then
    if v_action.meetup_id <> p_meetup_id or v_action.action <> 'acknowledge' or v_action.scene_id <> p_scene_id then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'acknowledged_step', v_action.scene_id,
      'personal_revision', v_action.resulting_personal_revision,
      'reused', true
    );
  end if;
  if not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor)
     or not exists (
       select 1 from public.activity_meetup_members as member
       where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
     ) then raise exception 'meetup_not_found'; end if;
  select meetup.* into v_meetup
  from public.activity_meetups as meetup
  where meetup.id = p_meetup_id
  for share;
  if v_meetup.status = 'cancelled' then raise exception 'meetup_closed'; end if;
  if v_meetup.schedule_status = 'schedule_pending' then raise exception 'schedule_pending'; end if;
  v_current := case
    when v_meetup.status = 'completed' then 'next'
    else coalesce(v_meetup.shared_guide_step, case
      when pg_catalog.clock_timestamp() < v_meetup.scheduled_at - interval '1 hour' then 'prepare'
      when pg_catalog.clock_timestamp() < v_meetup.scheduled_at then 'gather'
      when v_meetup.ends_at is not null and pg_catalog.clock_timestamp() >= v_meetup.ends_at then 'wrap'
      else 'activity'
    end)
  end;
  if p_scene_id <> v_current then raise exception 'guide_scene_not_current'; end if;
  select progress.* into v_progress from public.activity_meetup_guide_progress as progress
  where progress.meetup_id = p_meetup_id and progress.user_id = v_actor for update;
  v_revision := coalesce(v_progress.revision, 0);
  if v_revision <> p_expected_revision then raise exception 'stale_personal_revision'; end if;
  insert into public.activity_meetup_guide_progress (meetup_id, user_id, acknowledged_step, revision, updated_at)
  values (p_meetup_id, v_actor, p_scene_id, v_revision + 1, pg_catalog.clock_timestamp())
  on conflict (meetup_id, user_id) do update
    set acknowledged_step = excluded.acknowledged_step,
        revision = excluded.revision,
        updated_at = excluded.updated_at;
  insert into public.activity_meetup_personal_actions (
    meetup_id, actor_user_id, action, note, scene_id, idempotency_key, resulting_personal_revision
  ) values (p_meetup_id, v_actor, 'acknowledge', '', p_scene_id, p_idempotency_key, v_revision + 1);
  return pg_catalog.jsonb_build_object('acknowledged_step', p_scene_id, 'personal_revision', v_revision + 1, 'reused', false);
end
$$;

create or replace function public.advance_my_activity_meetup_shared_guide(
  p_meetup_id uuid,
  p_scene_id text,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_event public.activity_meetup_events%rowtype;
  v_current text;
  v_expected text;
  v_hash text := pg_catalog.md5(p_meetup_id::text || ':' || coalesce(p_scene_id, ''));
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null or p_scene_id not in ('gather', 'greet', 'start', 'activity', 'wrap', 'next') then raise exception 'invalid_guide_scene'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-mutation:' || v_actor::text || ':' || p_idempotency_key::text, 0));
  select event.* into v_event from public.activity_meetup_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'shared_guide_advanced' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id for update;
  if v_meetup.id is null or v_meetup.host_user_id <> v_actor then raise exception 'meetup_not_found'; end if;
  if v_meetup.status not in ('open', 'full') then raise exception 'meetup_closed'; end if;
  if v_meetup.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_meetup.schedule_status = 'schedule_pending' then raise exception 'schedule_pending'; end if;
  v_current := coalesce(v_meetup.shared_guide_step, case
    when pg_catalog.clock_timestamp() < v_meetup.scheduled_at - interval '1 hour' then 'prepare'
    when pg_catalog.clock_timestamp() < v_meetup.scheduled_at then 'gather'
    when v_meetup.ends_at is not null and pg_catalog.clock_timestamp() >= v_meetup.ends_at then 'wrap'
    else 'activity'
  end);
  v_expected := case v_current
    when 'prepare' then 'gather' when 'gather' then 'greet' when 'greet' then 'start'
    when 'start' then 'activity' when 'activity' then 'wrap' when 'wrap' then 'next'
    else null end;
  if p_scene_id is distinct from v_expected then raise exception 'invalid_guide_transition'; end if;
  update public.activity_meetups as meetup
  set shared_guide_step = p_scene_id, revision = meetup.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object('shared_step', p_scene_id, 'revision', v_meetup.revision + 1);
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key, prior_revision,
    resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'shared_guide_advanced', v_hash, p_idempotency_key,
    v_meetup.revision, v_meetup.revision + 1,
    pg_catalog.jsonb_build_object('scene_id', p_scene_id), v_result
  );
  return v_result;
end
$$;

create or replace function public.complete_my_activity_meetup(
  p_meetup_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_event public.activity_meetup_events%rowtype;
  v_hash text := pg_catalog.md5(p_meetup_id::text || ':complete');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null then raise exception 'invalid_idempotency_key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-mutation:' || v_actor::text || ':' || p_idempotency_key::text, 0));
  select event.* into v_event from public.activity_meetup_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'completed' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id for update;
  if v_meetup.id is null or v_meetup.host_user_id <> v_actor then raise exception 'meetup_not_found'; end if;
  if v_meetup.status not in ('open', 'full') then raise exception 'meetup_closed'; end if;
  if v_meetup.schedule_status = 'schedule_pending' then raise exception 'schedule_pending'; end if;
  if v_meetup.scheduled_at > pg_catalog.clock_timestamp() then raise exception 'meetup_not_started'; end if;
  if v_meetup.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  update public.activity_meetups as meetup
  set status = 'completed', completed_at = pg_catalog.clock_timestamp(), revision = meetup.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object('id', p_meetup_id, 'status', 'completed', 'revision', v_meetup.revision + 1);
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key, prior_revision,
    resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'completed', v_hash, p_idempotency_key, v_meetup.revision,
    v_meetup.revision + 1, '{}'::jsonb, v_result
  );
  return v_result;
end
$$;

create or replace function public.update_my_activity_meetup_schedule(
  p_meetup_id uuid,
  p_scheduled_at timestamptz,
  p_ends_at timestamptz,
  p_place_name text,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_event public.activity_meetup_events%rowtype;
  v_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null
     or p_scheduled_at is null or p_ends_at is null
     or p_scheduled_at < pg_catalog.clock_timestamp() + interval '30 minutes'
     or p_ends_at < p_scheduled_at + interval '30 minutes'
     or p_ends_at > p_scheduled_at + interval '24 hours'
     or p_place_name is null or pg_catalog.char_length(pg_catalog.btrim(p_place_name)) not between 2 and 80 then
    raise exception 'invalid_meetup_schedule';
  end if;
  v_hash := pg_catalog.md5(pg_catalog.concat_ws('|', p_meetup_id::text, p_scheduled_at::text, p_ends_at::text, pg_catalog.btrim(p_place_name)));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-meetup-mutation:' || v_actor::text || ':' || p_idempotency_key::text, 0
  ));
  select event.* into v_event from public.activity_meetup_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'schedule_changed' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id for update;
  if v_meetup.id is null or v_meetup.host_user_id <> v_actor then raise exception 'meetup_not_found'; end if;
  if v_meetup.status not in ('open', 'full') then raise exception 'meetup_closed'; end if;
  if v_meetup.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  update public.activity_meetups as meetup
  set schedule_status = 'confirmed', scheduled_at = p_scheduled_at, ends_at = p_ends_at, place_name = pg_catalog.btrim(p_place_name),
      revision = meetup.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object(
    'id', p_meetup_id, 'schedule_status', 'confirmed', 'scheduled_at', p_scheduled_at, 'ends_at', p_ends_at,
    'place_name', pg_catalog.btrim(p_place_name), 'revision', v_meetup.revision + 1
  );
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key, prior_revision,
    resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'schedule_changed', v_hash, p_idempotency_key, v_meetup.revision,
    v_meetup.revision + 1, pg_catalog.jsonb_build_object('scheduled_at', p_scheduled_at, 'ends_at', p_ends_at, 'place_name', pg_catalog.btrim(p_place_name)), v_result
  );
  return v_result;
end
$$;
revoke all on function public.list_activity_meetups_v4(text,integer,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.list_activity_meetups_v4(text,integer,text,text,text) to authenticated;
commit;
