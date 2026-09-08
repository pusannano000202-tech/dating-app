begin;

create table public.quantum_continuation_album_photos (
  id uuid primary key,
  series_id uuid not null references public.quantum_continuation_series(id) on delete restrict,
  source_id uuid references public.quantum_continuation_sources(id) on delete restrict,
  occurrence_id uuid references public.quantum_continuation_occurrences(id) on delete restrict,
  uploader_user_id uuid not null references public.users(id) on delete restrict,
  upload_idempotency_key uuid not null,
  storage_path text not null unique check (
    storage_path ~ '^continuation-series/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(source|occurrence)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  ),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  content_type text check (content_type is null or content_type = 'image/jpeg'),
  byte_size integer check (byte_size is null or byte_size between 1 and 12582912),
  status text not null default 'uploading' check (status in ('uploading', 'active', 'delete_pending', 'deleted')),
  processing_token uuid,
  processing_lease_expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  activated_at timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  retention_until timestamptz not null default (pg_catalog.clock_timestamp() + interval '90 days'),
  unique (uploader_user_id, upload_idempotency_key),
  check (num_nonnulls(source_id, occurrence_id) = 1),
  check ((source_id is not null) = (storage_path like '%/source/%')),
  check ((occurrence_id is not null) = (storage_path like '%/occurrence/%')),
  check (
    (status = 'uploading' and processing_token is not null and processing_lease_expires_at is not null)
    or (status <> 'uploading' and processing_token is null and processing_lease_expires_at is null)
  ),
  check (status <> 'active' or (
    activated_at is not null and content_type = 'image/jpeg' and byte_size is not null
  )),
  check ((status = 'deleted') = (deleted_at is not null))
);

create index quantum_continuation_album_source_active_idx
  on public.quantum_continuation_album_photos (source_id, created_at, id)
  where status in ('uploading', 'active', 'delete_pending');
create index quantum_continuation_album_occurrence_active_idx
  on public.quantum_continuation_album_photos (occurrence_id, created_at, id)
  where status in ('uploading', 'active', 'delete_pending');

alter table public.quantum_continuation_album_photos enable row level security;
revoke all on table public.quantum_continuation_album_photos from public, anon, authenticated, service_role;
grant select, insert, update on table public.quantum_continuation_album_photos to service_role;

create or replace function quantum_private.continuation_album_require_service()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
end
$$;

create or replace function quantum_private.continuation_album_has_series_access(
  p_actor_user_id uuid,
  p_series_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quantum_continuation_series as series
    join public.quantum_continuation_source_members as member
      on member.source_id = series.source_id
    where series.id = p_series_id
      and member.participant_user_id = p_actor_user_id
  ) or exists (
    select 1
    from public.quantum_continuation_transitions as transition
    join public.quantum_continuation_transition_members as member
      on member.transition_id = transition.id
    where transition.series_id = p_series_id
      and member.participant_user_id = p_actor_user_id
  )
$$;

create or replace function quantum_private.continuation_album_target_context(
  p_actor_user_id uuid,
  p_series_id uuid,
  p_target_kind text,
  p_target_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_series public.quantum_continuation_series%rowtype;
  v_source public.quantum_continuation_sources%rowtype;
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_can_upload boolean;
begin
  if p_actor_user_id is null or p_series_id is null or p_target_id is null
     or p_target_kind not in ('source', 'occurrence') then
    raise exception 'invalid_series_album_target';
  end if;

  select series.* into v_series
  from public.quantum_continuation_series as series
  where series.id = p_series_id;
  if v_series.id is null then raise exception 'continuation_series_not_found'; end if;
  if v_series.status not in ('active', 'completed') then raise exception 'series_album_not_available'; end if;
  if not quantum_private.continuation_album_has_series_access(p_actor_user_id, p_series_id) then
    raise exception 'attendee_required';
  end if;

  if p_target_kind = 'source' then
    select source.* into v_source
    from public.quantum_continuation_sources as source
    where source.id = p_target_id and source.id = v_series.source_id;
    if v_source.id is null
       or v_series.start_program_day <> 2
       or v_source.activity_kind <> 'board_game'
       or v_source.status <> 'ready'
       or not exists (
         select 1
         from public.quantum_continuation_source_members as member
         where member.source_id = v_source.id
           and member.participant_user_id = p_actor_user_id
           and member.attendance_status = 'present'
       ) then
      raise exception 'series_album_target_not_available';
    end if;
    v_can_upload := v_now >= v_source.source_completed_at
      and v_now <= v_source.source_completed_at + interval '24 hours';
    return pg_catalog.jsonb_build_object(
      'target_kind', 'source',
      'target_id', v_source.id,
      'program_day', 1,
      'physical_meeting_no', 1,
      'happened_at', v_source.source_completed_at,
      'upload_closes_at', v_source.source_completed_at + interval '24 hours',
      'can_upload', v_can_upload
    );
  end if;

  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_target_id and occurrence.series_id = p_series_id;
  if v_occurrence.id is null
     or v_occurrence.status not in ('confirmed', 'in_progress', 'completed')
     or not exists (
       select 1
       from public.quantum_continuation_occurrence_members as member
       where member.occurrence_id = v_occurrence.id
         and member.participant_user_id = p_actor_user_id
         and member.attendance_status = 'present'
         and member.visible_from_program_day <= v_occurrence.program_day
     ) then
    raise exception 'series_album_target_not_available';
  end if;
  v_can_upload := v_now >= v_occurrence.starts_at - interval '20 minutes'
    and v_now <= v_occurrence.ends_at + interval '24 hours';
  return pg_catalog.jsonb_build_object(
    'target_kind', 'occurrence',
    'target_id', v_occurrence.id,
    'program_day', v_occurrence.program_day,
    'physical_meeting_no', v_occurrence.physical_meeting_no,
    'happened_at', v_occurrence.starts_at,
    'upload_closes_at', v_occurrence.ends_at + interval '24 hours',
    'can_upload', v_can_upload
  );
end
$$;

create or replace function public.get_continuation_series_album_for_service(
  p_actor_user_id uuid,
  p_series_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_series public.quantum_continuation_series%rowtype;
  v_source public.quantum_continuation_sources%rowtype;
  v_days jsonb := '[]'::jsonb;
  v_pending_deletion_photo_ids jsonb := '[]'::jsonb;
  v_pending_uploads jsonb := '[]'::jsonb;
  v_context jsonb;
begin
  perform quantum_private.continuation_album_require_service();
  if p_actor_user_id is null or p_series_id is null then raise exception 'invalid_series_album_request'; end if;
  select series.* into v_series from public.quantum_continuation_series as series where series.id = p_series_id;
  if v_series.id is null then raise exception 'continuation_series_not_found'; end if;
  if not quantum_private.continuation_album_has_series_access(p_actor_user_id, p_series_id) then
    raise exception 'attendee_required';
  end if;

  select source.* into v_source
  from public.quantum_continuation_sources as source
  where source.id = v_series.source_id;
  if v_series.start_program_day = 2
     and v_source.activity_kind = 'board_game'
     and v_source.status = 'ready'
     and exists (
       select 1 from public.quantum_continuation_source_members as member
       where member.source_id = v_source.id
         and member.participant_user_id = p_actor_user_id
         and member.attendance_status = 'present'
     ) then
    v_context := quantum_private.continuation_album_target_context(
      p_actor_user_id, p_series_id, 'source', v_source.id
    );
    v_days := v_days || pg_catalog.jsonb_build_array(v_context || pg_catalog.jsonb_build_object(
      'photos', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', photo.id,
          'storage_path', photo.storage_path,
          'created_at', photo.created_at,
          'mine', photo.uploader_user_id = p_actor_user_id
        ) order by photo.created_at, photo.id)
        from public.quantum_continuation_album_photos as photo
        where photo.series_id = p_series_id
          and photo.source_id = v_source.id
          and photo.status = 'active'
          and photo.retention_until > pg_catalog.statement_timestamp()
      ), '[]'::jsonb)
    ));
  end if;

  select v_days || coalesce(pg_catalog.jsonb_agg(
    context.value || pg_catalog.jsonb_build_object(
      'photos', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', photo.id,
          'storage_path', photo.storage_path,
          'created_at', photo.created_at,
          'mine', photo.uploader_user_id = p_actor_user_id
        ) order by photo.created_at, photo.id)
        from public.quantum_continuation_album_photos as photo
        where photo.series_id = p_series_id
          and photo.occurrence_id = occurrence.id
          and photo.status = 'active'
          and photo.retention_until > pg_catalog.statement_timestamp()
      ), '[]'::jsonb)
    ) order by occurrence.program_day
  ), '[]'::jsonb)
  into v_days
  from public.quantum_continuation_occurrences as occurrence
  join public.quantum_continuation_occurrence_members as member
    on member.occurrence_id = occurrence.id
   and member.participant_user_id = p_actor_user_id
  cross join lateral (
    select quantum_private.continuation_album_target_context(
      p_actor_user_id, p_series_id, 'occurrence', occurrence.id
    ) as value
  ) as context
  where occurrence.series_id = p_series_id
    and occurrence.status in ('confirmed', 'in_progress', 'completed')
    and member.attendance_status = 'present'
    and member.visible_from_program_day <= occurrence.program_day;

  select coalesce(pg_catalog.jsonb_agg(photo.id order by photo.deletion_requested_at, photo.id), '[]'::jsonb)
  into v_pending_deletion_photo_ids
  from public.quantum_continuation_album_photos as photo
  where photo.series_id = p_series_id
    and photo.uploader_user_id = p_actor_user_id
    and photo.status = 'delete_pending';

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'photo_id', photo.id,
    'target_kind', case when photo.source_id is not null then 'source' else 'occurrence' end,
    'target_id', coalesce(photo.source_id, photo.occurrence_id),
    'lease_expires_at', photo.processing_lease_expires_at,
    'can_cancel', photo.processing_lease_expires_at <= pg_catalog.statement_timestamp()
  ) order by photo.created_at, photo.id), '[]'::jsonb)
  into v_pending_uploads
  from public.quantum_continuation_album_photos as photo
  where photo.series_id = p_series_id
    and photo.uploader_user_id = p_actor_user_id
    and photo.status = 'uploading';

  return pg_catalog.jsonb_build_object(
    'series_id', p_series_id,
    'server_now', pg_catalog.statement_timestamp(),
    'retention_days', 90,
    'pending_deletion_photo_ids', v_pending_deletion_photo_ids,
    'pending_uploads', v_pending_uploads,
    'days', v_days
  );
end
$$;

create or replace function public.get_continuation_series_album_upload_target_for_service(
  p_actor_user_id uuid,
  p_series_id uuid,
  p_target_kind text,
  p_target_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform quantum_private.continuation_album_require_service();
  return quantum_private.continuation_album_target_context(
    p_actor_user_id, p_series_id, p_target_kind, p_target_id
  );
end
$$;

create or replace function public.reserve_continuation_series_album_upload_for_service(
  p_actor_user_id uuid,
  p_series_id uuid,
  p_target_kind text,
  p_target_id uuid,
  p_photo_id uuid,
  p_idempotency_key uuid,
  p_source_sha256 text,
  p_processing_token uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existing public.quantum_continuation_album_photos%rowtype;
  v_context jsonb;
  v_user_count integer;
  v_total_count integer;
  v_storage_path text;
begin
  perform quantum_private.continuation_album_require_service();
  if p_actor_user_id is null or p_series_id is null or p_target_id is null or p_photo_id is null
     or p_idempotency_key is null or p_processing_token is null
     or p_target_kind not in ('source', 'occurrence')
     or p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_series_album_upload';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('continuation-album-user:' || p_actor_user_id::text, 0)
  );
  perform 1 from public.quantum_continuation_series as series where series.id = p_series_id for update;
  if not found then raise exception 'continuation_series_not_found'; end if;
  if p_target_kind = 'source' then
    perform 1 from public.quantum_continuation_sources as source where source.id = p_target_id for update;
  else
    perform 1 from public.quantum_continuation_occurrences as occurrence where occurrence.id = p_target_id for update;
  end if;
  v_context := quantum_private.continuation_album_target_context(
    p_actor_user_id, p_series_id, p_target_kind, p_target_id
  );

  select photo.* into v_existing
  from public.quantum_continuation_album_photos as photo
  where photo.uploader_user_id = p_actor_user_id
    and photo.upload_idempotency_key = p_idempotency_key
  for update;
  if v_existing.id is not null then
    if v_existing.series_id <> p_series_id
       or (p_target_kind = 'source' and v_existing.source_id is distinct from p_target_id)
       or (p_target_kind = 'occurrence' and v_existing.occurrence_id is distinct from p_target_id)
       or v_existing.source_sha256 <> p_source_sha256 then
      raise exception 'idempotency_key_reused';
    end if;
    if v_existing.status = 'active' then
      return pg_catalog.jsonb_build_object(
        'photo_id', v_existing.id, 'storage_path', v_existing.storage_path,
        'status', 'active', 'replayed', true, 'owns_processing', false
      );
    end if;
    if v_existing.status <> 'uploading' then raise exception 'series_album_upload_not_ready'; end if;
    if v_existing.processing_lease_expires_at > pg_catalog.clock_timestamp() then
      return pg_catalog.jsonb_build_object(
        'photo_id', v_existing.id, 'storage_path', v_existing.storage_path,
        'status', 'uploading', 'replayed', true, 'owns_processing', false
      );
    end if;
    if not coalesce((v_context ->> 'can_upload')::boolean, false) then
      raise exception 'series_album_upload_closed';
    end if;
    update public.quantum_continuation_album_photos
    set processing_token = p_processing_token,
        processing_lease_expires_at = pg_catalog.clock_timestamp() + interval '5 minutes'
    where id = v_existing.id;
    return pg_catalog.jsonb_build_object(
      'photo_id', v_existing.id, 'storage_path', v_existing.storage_path,
      'status', 'uploading', 'replayed', true, 'owns_processing', true
    );
  end if;
  if not coalesce((v_context ->> 'can_upload')::boolean, false) then
    raise exception 'series_album_upload_closed';
  end if;

  select pg_catalog.count(*)::integer into v_user_count
  from public.quantum_continuation_album_photos as photo
  where photo.uploader_user_id = p_actor_user_id
    and photo.status in ('uploading', 'active', 'delete_pending')
    and ((p_target_kind = 'source' and photo.source_id = p_target_id)
      or (p_target_kind = 'occurrence' and photo.occurrence_id = p_target_id));
  select pg_catalog.count(*)::integer into v_total_count
  from public.quantum_continuation_album_photos as photo
  where photo.status in ('uploading', 'active', 'delete_pending')
    and ((p_target_kind = 'source' and photo.source_id = p_target_id)
      or (p_target_kind = 'occurrence' and photo.occurrence_id = p_target_id));
  if v_user_count >= 10 then raise exception 'series_album_user_limit'; end if;
  if v_total_count >= 50 then raise exception 'series_album_target_limit'; end if;

  v_storage_path := 'continuation-series/' || p_series_id::text || '/' || p_target_kind || '/'
    || p_target_id::text || '/' || p_photo_id::text || '.jpg';
  insert into public.quantum_continuation_album_photos (
    id, series_id, source_id, occurrence_id, uploader_user_id, upload_idempotency_key,
    storage_path, source_sha256, status, processing_token, processing_lease_expires_at
  ) values (
    p_photo_id, p_series_id,
    case when p_target_kind = 'source' then p_target_id end,
    case when p_target_kind = 'occurrence' then p_target_id end,
    p_actor_user_id, p_idempotency_key, v_storage_path, p_source_sha256,
    'uploading', p_processing_token, pg_catalog.clock_timestamp() + interval '5 minutes'
  );
  return pg_catalog.jsonb_build_object(
    'photo_id', p_photo_id, 'storage_path', v_storage_path,
    'status', 'uploading', 'replayed', false, 'owns_processing', true
  );
end
$$;

create or replace function public.finalize_continuation_series_album_upload_for_service(
  p_actor_user_id uuid,
  p_series_id uuid,
  p_photo_id uuid,
  p_processing_token uuid,
  p_byte_size integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_photo public.quantum_continuation_album_photos%rowtype;
  v_context jsonb;
begin
  perform quantum_private.continuation_album_require_service();
  if p_actor_user_id is null or p_series_id is null or p_photo_id is null
     or p_processing_token is null or p_byte_size is null or p_byte_size not between 1 and 12582912 then
    raise exception 'invalid_series_album_finalize';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('continuation-album-user:' || p_actor_user_id::text, 0)
  );
  select photo.* into v_photo
  from public.quantum_continuation_album_photos as photo
  where photo.id = p_photo_id and photo.series_id = p_series_id
  for update;
  if v_photo.id is null then raise exception 'series_album_photo_not_found'; end if;
  if v_photo.uploader_user_id <> p_actor_user_id then raise exception 'forbidden'; end if;
  if v_photo.status = 'active' then
    return pg_catalog.jsonb_build_object('photo_id', v_photo.id, 'status', 'active', 'replayed', true);
  end if;
  if v_photo.status = 'deleted' then
    -- A lease owner may finish the private-storage write after an expired upload was
    -- deleted. Re-open only the terminal cleanup state so a failed object removal
    -- remains visible to the owner; this never restores an album photo to active.
    update public.quantum_continuation_album_photos
    set status = 'delete_pending',
        deletion_requested_at = pg_catalog.clock_timestamp(),
        deleted_at = null
    where id = v_photo.id;
    return pg_catalog.jsonb_build_object(
      'photo_id', v_photo.id,
      'status', 'delete_pending',
      'storage_path', v_photo.storage_path,
      'cleanup_required', true
    );
  end if;
  if v_photo.status = 'delete_pending' then
    return pg_catalog.jsonb_build_object(
      'photo_id', v_photo.id,
      'status', 'delete_pending',
      'storage_path', v_photo.storage_path,
      'cleanup_required', true
    );
  end if;
  if v_photo.status <> 'uploading' or v_photo.processing_token is distinct from p_processing_token then
    raise exception 'series_album_processing_conflict';
  end if;
  v_context := quantum_private.continuation_album_target_context(
    p_actor_user_id, p_series_id,
    case when v_photo.source_id is not null then 'source' else 'occurrence' end,
    coalesce(v_photo.source_id, v_photo.occurrence_id)
  );
  if not coalesce((v_context ->> 'can_upload')::boolean, false) then
    update public.quantum_continuation_album_photos
    set status = 'delete_pending', processing_token = null, processing_lease_expires_at = null,
        deletion_requested_at = pg_catalog.clock_timestamp()
    where id = v_photo.id;
    return pg_catalog.jsonb_build_object(
      'photo_id', v_photo.id, 'status', 'delete_pending', 'storage_path', v_photo.storage_path,
      'cleanup_required', true
    );
  end if;
  update public.quantum_continuation_album_photos
  set status = 'active', content_type = 'image/jpeg', byte_size = p_byte_size,
      activated_at = pg_catalog.clock_timestamp(), processing_token = null,
      processing_lease_expires_at = null
  where id = v_photo.id;
  return pg_catalog.jsonb_build_object('photo_id', v_photo.id, 'status', 'active', 'replayed', false);
end
$$;

create or replace function public.reserve_continuation_series_album_delete_for_service(
  p_actor_user_id uuid,
  p_series_id uuid,
  p_photo_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_photo public.quantum_continuation_album_photos%rowtype;
begin
  perform quantum_private.continuation_album_require_service();
  if p_actor_user_id is null or p_series_id is null or p_photo_id is null then
    raise exception 'invalid_series_album_delete';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('continuation-album-user:' || p_actor_user_id::text, 0)
  );
  select photo.* into v_photo
  from public.quantum_continuation_album_photos as photo
  where photo.id = p_photo_id and photo.series_id = p_series_id
  for update;
  if v_photo.id is null then raise exception 'series_album_photo_not_found'; end if;
  if v_photo.uploader_user_id <> p_actor_user_id then raise exception 'forbidden'; end if;
  if v_photo.status = 'deleted' then
    return pg_catalog.jsonb_build_object('photo_id', v_photo.id, 'status', 'deleted', 'replayed', true);
  end if;
  if v_photo.status = 'uploading'
     and v_photo.processing_lease_expires_at > pg_catalog.clock_timestamp() then
    raise exception 'series_album_upload_busy';
  end if;
  if v_photo.status <> 'delete_pending' then
    update public.quantum_continuation_album_photos
    set status = 'delete_pending', processing_token = null, processing_lease_expires_at = null,
        deletion_requested_at = coalesce(deletion_requested_at, pg_catalog.clock_timestamp())
    where id = v_photo.id;
  end if;
  return pg_catalog.jsonb_build_object(
    'photo_id', v_photo.id, 'status', 'delete_pending',
    'storage_path', v_photo.storage_path, 'replayed', v_photo.status = 'delete_pending'
  );
end
$$;

create or replace function public.finalize_continuation_series_album_delete_for_service(
  p_actor_user_id uuid,
  p_series_id uuid,
  p_photo_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_photo public.quantum_continuation_album_photos%rowtype;
begin
  perform quantum_private.continuation_album_require_service();
  select photo.* into v_photo
  from public.quantum_continuation_album_photos as photo
  where photo.id = p_photo_id and photo.series_id = p_series_id
  for update;
  if v_photo.id is null then raise exception 'series_album_photo_not_found'; end if;
  if v_photo.uploader_user_id <> p_actor_user_id then raise exception 'forbidden'; end if;
  if v_photo.status = 'deleted' then
    return pg_catalog.jsonb_build_object('photo_id', v_photo.id, 'status', 'deleted', 'replayed', true);
  end if;
  if v_photo.status <> 'delete_pending' then raise exception 'series_album_delete_not_ready'; end if;
  update public.quantum_continuation_album_photos
  set status = 'deleted', deleted_at = pg_catalog.clock_timestamp()
  where id = v_photo.id;
  return pg_catalog.jsonb_build_object('photo_id', v_photo.id, 'status', 'deleted', 'replayed', false);
end
$$;

revoke all on function quantum_private.continuation_album_require_service() from public, anon, authenticated, service_role;
revoke all on function quantum_private.continuation_album_has_series_access(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function quantum_private.continuation_album_target_context(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;

revoke all on function public.get_continuation_series_album_for_service(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_continuation_series_album_upload_target_for_service(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.reserve_continuation_series_album_upload_for_service(uuid, uuid, text, uuid, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.finalize_continuation_series_album_upload_for_service(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.reserve_continuation_series_album_delete_for_service(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.finalize_continuation_series_album_delete_for_service(uuid, uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_continuation_series_album_for_service(uuid, uuid) to service_role;
grant execute on function public.get_continuation_series_album_upload_target_for_service(uuid, uuid, text, uuid) to service_role;
grant execute on function public.reserve_continuation_series_album_upload_for_service(uuid, uuid, text, uuid, uuid, uuid, text, uuid) to service_role;
grant execute on function public.finalize_continuation_series_album_upload_for_service(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.reserve_continuation_series_album_delete_for_service(uuid, uuid, uuid) to service_role;
grant execute on function public.finalize_continuation_series_album_delete_for_service(uuid, uuid, uuid) to service_role;

comment on table public.quantum_continuation_album_photos is
  'Optional private continuation-series album metadata. It never changes attendance, payment, or progression.';

commit;
