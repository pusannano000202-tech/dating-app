-- Explicit operator draft/publication only. No generated schedule or seed data.
begin;
create function quantum_private.guard_couple_calendar_metadata() returns trigger
language plpgsql set search_path='' as $$
begin
  if (old.status<>'draft' or exists(select 1 from public.quantum_couple_parties p where p.calendar_event_id=old.id))
    and (row(new.school_scope_key,new.title,new.summary,new.image_path,new.starts_at,new.ends_at,new.application_closes_at,
      new.location_name,new.deposit_amount_krw,new.required_people)
    is distinct from row(old.school_scope_key,old.title,old.summary,old.image_path,old.starts_at,old.ends_at,old.application_closes_at,
      old.location_name,old.deposit_amount_krw,old.required_people)
    -- Only Auth erasure's FK SET NULL may anonymize the immutable creator.
    -- A live creator cannot be removed or replaced by an ordinary update.
    or (new.created_by is distinct from old.created_by and not (
      new.created_by is null and old.created_by is not null
      and not exists(select 1 from public.users where id=old.created_by)))) then
    raise exception 'calendar_event_metadata_locked';
  end if;
  if old.status<>'draft' and new.status='draft' then raise exception 'calendar_event_metadata_locked'; end if;
  return new;
end $$;
create trigger couple_calendar_metadata_locked before update on quantum_private.couple_calendar_events
  for each row execute function quantum_private.guard_couple_calendar_metadata();

create function public.admin_create_couple_calendar_event(p_event_id uuid,p_school_scope_key text,p_title text,p_summary text,
  p_image_path text,p_starts_at timestamptz,p_ends_at timestamptz,p_application_closes_at timestamptz,p_location_name text,p_deposit_amount_krw integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); e quantum_private.couple_calendar_events;
begin
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  perform public.verify_admin_aal2_session();
  if p_event_id is null or coalesce(length(btrim(p_school_scope_key)),0) not between 1 and 120
    or quantum_private.canonical_school_scope_key(p_school_scope_key) is distinct from p_school_scope_key
    or coalesce(length(btrim(p_title)),0) not between 1 and 80 or coalesce(length(btrim(p_summary)),0) not between 1 and 280
    or (p_image_path is not null and p_image_path !~ '^/images/[a-zA-Z0-9/_-]+\.(png|webp|jpg|jpeg)$')
    or p_starts_at is null or p_ends_at is null or p_application_closes_at is null
    or not isfinite(p_starts_at) or not isfinite(p_ends_at) or not isfinite(p_application_closes_at)
    or p_ends_at<=p_starts_at or p_application_closes_at>=p_starts_at
    or p_application_closes_at<=clock_timestamp()
    or coalesce(length(btrim(p_location_name)),0) not between 1 and 160
    or p_deposit_amount_krw is distinct from 10000 then raise exception 'invalid_calendar_event'; end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-couple-event:'||p_event_id::text,0));
  select * into e from quantum_private.couple_calendar_events where id=p_event_id for update;
  if found then
    if row(e.created_by,e.school_scope_key,e.title,e.summary,e.image_path,e.starts_at,e.ends_at,e.application_closes_at,e.location_name)
      is distinct from row(v_actor,p_school_scope_key,btrim(p_title),btrim(p_summary),p_image_path,p_starts_at,p_ends_at,p_application_closes_at,btrim(p_location_name))
      then raise exception 'calendar_idempotency_conflict'; end if;
  else
    insert into quantum_private.couple_calendar_events(id,school_scope_key,title,summary,image_path,starts_at,ends_at,application_closes_at,location_name,created_by)
      values(p_event_id,p_school_scope_key,btrim(p_title),btrim(p_summary),p_image_path,p_starts_at,p_ends_at,p_application_closes_at,btrim(p_location_name),v_actor)
      returning * into e;
  end if;
  return jsonb_build_object('eventId',e.id,'status',e.status,'depositAmountKrw',10000);
end $$;

create function public.admin_publish_couple_calendar_event(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e quantum_private.couple_calendar_events;
begin
  perform quantum_private.require_recent_super_admin_auth(auth.uid());
  perform public.verify_admin_aal2_session();
  if p_event_id is null then raise exception 'invalid_calendar_event'; end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-couple-event:'||p_event_id::text,0));
  select * into e from quantum_private.couple_calendar_events where id=p_event_id for update;
  if not found then raise exception 'calendar_event_not_found'; end if;
  if e.status not in ('draft','recruiting') or e.application_closes_at<=clock_timestamp() then raise exception 'calendar_event_closed'; end if;
  update quantum_private.couple_calendar_events set status='recruiting' where id=e.id;
  return jsonb_build_object('eventId',e.id,'status','recruiting','depositAmountKrw',10000);
end $$;
revoke all on function quantum_private.guard_couple_calendar_metadata() from public,anon,authenticated,service_role;
revoke all on function public.admin_create_couple_calendar_event(uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,integer),
  public.admin_publish_couple_calendar_event(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_create_couple_calendar_event(uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,integer),
  public.admin_publish_couple_calendar_event(uuid) to authenticated;
commit;
