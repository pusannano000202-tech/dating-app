-- Activity lobbies use an exact activity key before keyset pagination.
-- The existing v4 function/signature and all participation mutations remain unchanged.
begin;

create function public.list_activity_meetups_v5(
  p_category text,
  p_limit integer,
  p_gender_mode text,
  p_scope_type text,
  p_activity_key text,
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
  if p_gender_mode is not null and p_gender_mode not in ('all', 'male_only', 'female_only') then raise exception 'invalid_gender_mode'; end if;
  if p_activity_key is null or not exists (
    select 1 from pg_catalog.unnest(array[
      'baseball','soccer','basketball','badminton','tennis','running','board_game',
      'gaming','hiking','walking','dining','study','other'
    ]::text[]) as candidate(category)
    where (p_category is null or candidate.category = p_category)
      and quantum_private.meetup_activity_key_valid(candidate.category, p_activity_key)
  ) then raise exception 'invalid_activity_key'; end if;
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
    and meetup.activity_key = p_activity_key
    and (p_gender_mode is null or meetup.gender_mode = p_gender_mode)
    and (p_scope_type is null or meetup.scope_type = p_scope_type)
    and quantum_private.activity_meetup_scope_eligible(meetup.id, v_actor)
    and (p_cursor is null
      or (v_scheduled is not null and meetup.scheduled_at is null)
      or meetup.scheduled_at>v_scheduled
      or (meetup.scheduled_at is not distinct from v_scheduled and
        (meetup.created_at<v_created or (meetup.created_at=v_created and meetup.id<v_id))))
  order by meetup.scheduled_at asc nulls last, meetup.created_at desc, meetup.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 31));
end
$$;

revoke all on function public.list_activity_meetups_v5(text,integer,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.list_activity_meetups_v5(text,integer,text,text,text,text) to authenticated;
commit;
