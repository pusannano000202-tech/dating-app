-- G9 integration draft. Parent task converts this into the timestamped migration
-- after G1/G2 and G5/G6. Do not apply this draft directly to any database.
begin;

create table quantum_private.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  idempotency_key uuid not null,
  status text not null default 'requested'
    check (status in ('requested','cleanup_pending','retry_wait','auth_delete_pending','completed','cancelled')),
  requested_at timestamptz not null default clock_timestamp(),
  access_revoked_at timestamptz not null default clock_timestamp(),
  legal_retention_ready boolean not null default false,
  legal_review_reference_hash text check (
    legal_review_reference_hash is null or legal_review_reference_hash ~ '^[0-9a-f]{64}$'
  ),
  legal_reviewed_at timestamptz,
  storage_cleanup_ready boolean not null default false,
  auth_deleted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,80}$'),
  updated_at timestamptz not null default clock_timestamp(),
  unique (user_id, idempotency_key),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check ((legal_review_reference_hash is null) = (legal_reviewed_at is null))
);
create unique index account_deletion_one_open_per_user_idx
  on quantum_private.account_deletion_requests(user_id)
  where status not in ('completed','cancelled');
create index account_deletion_status_updated_idx
  on quantum_private.account_deletion_requests(status,updated_at,id);

create table quantum_private.account_legal_retention_reviews (
  request_id uuid primary key references quantum_private.account_deletion_requests(id) on delete restrict,
  reviewer_user_id uuid references public.users(id) on delete set null,
  review_reference_hash text not null check (review_reference_hash ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('no_retention_required','retention_preserved')),
  reviewed_at timestamptz not null default clock_timestamp()
);

create table quantum_private.retention_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references quantum_private.account_deletion_requests(id) on delete restrict,
  user_id uuid not null,
  kind text not null check (kind in ('storage_object','auth_user')),
  source_kind text not null check (source_kind in (
    'profile_photo','meeting_evidence','continuation_album','campus_seven_attendance','auth_user'
  )),
  source_record_id uuid,
  bucket text check (bucket in ('photos','meeting-evidence','campus-seven-attendance')),
  storage_path text,
  status text not null default 'pending'
    check (status in ('pending','processing','retry_wait','completed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  next_attempt_at timestamptz not null default clock_timestamp(),
  claim_token uuid,
  lease_expires_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (kind = 'storage_object' and source_record_id is not null and bucket is not null and storage_path is not null)
    or (kind = 'auth_user' and source_kind = 'auth_user' and request_id is not null
      and source_record_id is null and bucket is null and storage_path is null)
  ),
  check ((status = 'processing') = (claim_token is not null and lease_expires_at is not null)),
  check ((status = 'completed') = (completed_at is not null))
);
create unique index retention_cleanup_storage_once_idx
  on quantum_private.retention_cleanup_jobs(source_kind,source_record_id)
  where kind = 'storage_object';
create unique index retention_cleanup_auth_once_idx
  on quantum_private.retention_cleanup_jobs(request_id)
  where kind = 'auth_user';
create index retention_cleanup_due_idx
  on quantum_private.retention_cleanup_jobs(next_attempt_at,created_at,id)
  where status in ('pending','retry_wait');

alter table quantum_private.account_deletion_requests enable row level security;
alter table quantum_private.account_legal_retention_reviews enable row level security;
alter table quantum_private.retention_cleanup_jobs enable row level security;
revoke all on table quantum_private.account_deletion_requests,
  quantum_private.account_legal_retention_reviews,
  quantum_private.retention_cleanup_jobs from public,anon,authenticated,service_role;
grant select,insert,update,delete on table quantum_private.account_deletion_requests,
  quantum_private.account_legal_retention_reviews,
  quantum_private.retention_cleanup_jobs to service_role;

-- PostgREST v10+ supplies one JSON claims setting, while older/local callers
-- can still supply the split role setting. Reuse the existing project helper
-- for auth.role() compatibility after checking both representations directly.
create or replace function quantum_private.account_current_request_role()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_claims_text text:=nullif(pg_catalog.current_setting('request.jwt.claims',true),'');
  v_claims_role text;
begin
  if v_claims_text is not null then
    begin
      v_claims_role:=v_claims_text::jsonb->>'role';
    exception when invalid_text_representation then
      v_claims_role:=null;
    end;
  end if;
  return coalesce(
    nullif(v_claims_role,''),
    nullif(pg_catalog.current_setting('request.jwt.claim.role',true),''),
    nullif(private.current_request_role(),'')
  );
end;
$$;

create or replace function quantum_private.account_require_service()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if quantum_private.account_current_request_role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
end;
$$;

-- Exact cross-feature guard. Voice, friend projections, message RPCs and upload
-- RPCs call this helper. Completed stays blocked because the auth identity is gone.
create or replace function quantum_private.account_deletion_blocks_access(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id is null or exists(
    select 1 from quantum_private.account_deletion_requests request
    where request.user_id=p_user_id
      and request.status in ('requested','cleanup_pending','retry_wait','auth_delete_pending','completed')
  )
$$;

-- The shared request guard obtains this context before protected mutations.
-- Keep its two-column DTO stable, but fail closed while deletion is durable.
create or replace function public.get_access_context()
returns table(access_role text,partner_venue_ids uuid[])
language plpgsql stable security definer set search_path = '' as $$
declare
  v_caller uuid:=auth.uid();
  v_admin_role text;
  v_partner_venue_ids uuid[];
begin
  if v_caller is null then raise exception 'not_authenticated'; end if;
  if quantum_private.account_deletion_blocks_access(v_caller) then
    raise exception 'account_deletion_pending' using errcode='42501';
  end if;
  select admin_row.role into v_admin_role from public.admins admin_row
    where admin_row.user_id=v_caller;
  select coalesce(pg_catalog.array_agg(distinct membership.venue_id order by membership.venue_id),array[]::uuid[])
    into v_partner_venue_ids from public.venue_partner_memberships membership
    where membership.user_id=v_caller and membership.revoked_at is null;
  return query select case
    when v_admin_role='super_admin' then 'super_admin'
    when v_admin_role='admin' then 'admin'
    when pg_catalog.cardinality(v_partner_venue_ids)>0 then 'partner'
    else 'user' end,v_partner_venue_ids;
end;
$$;

-- RLS policies cannot read the private ledger as the authenticated caller.
-- This SECURITY DEFINER predicate exposes only the caller's allow/deny bit.
create or replace function public.account_allows_current_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not quantum_private.account_deletion_blocks_access(auth.uid())
$$;

-- PostgREST runs this before every Data API table/view/RPC request. Storage and
-- Realtime do not use db_pre_request and remain protected by their RLS paths.
create or replace function public.enforce_active_account_data_api_request()
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text:=quantum_private.account_current_request_role();
  v_user_id uuid;
begin
  if v_role is distinct from 'authenticated' then return; end if;
  v_user_id:=auth.uid();
  if v_user_id is not null
     and quantum_private.account_deletion_blocks_access(v_user_id) then
    raise exception 'account_deletion_pending' using errcode='42501';
  end if;
end;
$$;

-- Never silently replace an operator's existing PostgREST hook. An identical
-- setting is idempotent; any other applicable role/database value is a release
-- blocker that requires an explicitly reviewed composed hook.
do $$
declare
  v_authenticator oid;
  v_database oid;
  v_hooks text[];
  v_expected constant text:='public.enforce_active_account_data_api_request';
begin
  select role.oid into v_authenticator from pg_catalog.pg_roles role
    where role.rolname='authenticator';
  select database.oid into v_database from pg_catalog.pg_database database
    where database.datname=pg_catalog.current_database();
  if v_authenticator is null then
    raise exception 'pgrst_authenticator_role_missing' using errcode='55000';
  end if;
  select pg_catalog.array_agg(distinct setting.hook order by setting.hook)
    into v_hooks
  from (
    select pg_catalog.substr(config.value,pg_catalog.length('pgrst.db_pre_request=')+1) hook
    from pg_catalog.pg_roles role
    cross join lateral pg_catalog.unnest(coalesce(role.rolconfig,array[]::text[])) config(value)
    where role.oid=v_authenticator and config.value like 'pgrst.db_pre_request=%'
    union all
    select pg_catalog.substr(config.value,pg_catalog.length('pgrst.db_pre_request=')+1)
    from pg_catalog.pg_db_role_setting role_setting
    cross join lateral pg_catalog.unnest(role_setting.setconfig) config(value)
    where role_setting.setrole in(0,v_authenticator)
      and role_setting.setdatabase in(0,v_database)
      and config.value like 'pgrst.db_pre_request=%'
  ) setting;
  if coalesce(pg_catalog.cardinality(v_hooks),0)=0 then
    execute 'alter role authenticator set pgrst.db_pre_request='
      ||pg_catalog.quote_literal(v_expected);
  elsif pg_catalog.cardinality(v_hooks)<>1 or v_hooks[1]<>v_expected then
    raise exception 'pgrst_db_pre_request_conflict' using errcode='55000',
      detail='Existing applicable hook(s): '||pg_catalog.array_to_string(v_hooks,', '),
      hint='Review and compose the existing hook with public.enforce_active_account_data_api_request before applying G9.';
  end if;
end;
$$;
notify pgrst,'reload config';

create or replace function quantum_private.account_has_legal_retention_candidates(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.deposits d where d.user_id=p_user_id)
    or exists(select 1 from public.deposit_refund_requests r where r.user_id=p_user_id)
    or exists(select 1 from public.campus_seven_deposit_holds h where h.user_id=p_user_id)
    or exists(select 1 from public.campus_seven_deposit_reviews r where r.user_id=p_user_id)
    or exists(select 1 from public.tonight_deposits d where d.user_id=p_user_id)
    or exists(select 1 from public.tonight_deposit_refund_requests r where r.requested_by=p_user_id)
    or exists(select 1 from public.quantum_continuation_fee_orders o
      where o.owner_user_id=p_user_id or o.target_user_id=p_user_id)
    or exists(select 1 from public.meeting_photo_evidence e
      where e.uploader_user_id=p_user_id and e.dispute_hold=true and e.status<>'deleted')
$$;

create or replace function quantum_private.prevent_deleting_account_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid;v_role text:=quantum_private.account_current_request_role();
begin
  v_user_id := (to_jsonb(new)->>tg_argv[0])::uuid;
  if quantum_private.account_deletion_blocks_access(v_user_id) then
    -- request_account_deletion_for_service may only blank the private friend
    -- recognition name for the exact requested account.
    if tg_table_schema='quantum_private' and tg_table_name='community_member_profiles'
       and tg_op='UPDATE' and v_role='service_role'
       and current_setting('app.account_deletion_profile_scrub_user_id',true)=v_user_id::text
       and to_jsonb(new)->>'friend_recognition_name' is null
       and (to_jsonb(new)-array['friend_recognition_name','updated_at'])
         =(to_jsonb(old)-array['friend_recognition_name','updated_at']) then
      return new;
    end if;
    -- Physical album cleanup is limited to the exact leased job and permits
    -- only the deletion marker/lease fields to change.
    if tg_table_schema='public' and tg_table_name='quantum_continuation_album_photos'
       and tg_op='UPDATE' and v_role='service_role'
       and to_jsonb(new)->>'status'='deleted'
       and to_jsonb(new)->>'deleted_at' is not null
       and (to_jsonb(new)-array['status','deleted_at','processing_token','processing_lease_expires_at'])
         =(to_jsonb(old)-array['status','deleted_at','processing_token','processing_lease_expires_at'])
       and exists(
         select 1 from quantum_private.retention_cleanup_jobs job
         where job.id::text=current_setting('app.account_retention_cleanup_job_id',true)
           and job.status='processing' and job.kind='storage_object'
           and job.source_kind='continuation_album'
           and job.source_record_id=(to_jsonb(new)->>'id')::uuid
           and job.user_id=v_user_id
       ) then
      return new;
    end if;
    raise exception 'account_deletion_pending' using errcode='42501';
  end if;
  return new;
end;
$$;

-- Storage requests bypass PostgREST's pre-request hook. Do not silently enable
-- Storage RLS; fail the migration if an existing storage.objects table is not
-- already protected. Previously issued signed URLs are bearer capabilities and
-- can remain usable until their configured expiry, so production TTLs must be
-- short and urgent revocation still requires deleting/replacing the object.
do $$
declare v_rls_enabled boolean;
begin
  if pg_catalog.to_regclass('storage.objects') is null then return; end if;
  select class.relrowsecurity into v_rls_enabled
  from pg_catalog.pg_class class
  where class.oid=pg_catalog.to_regclass('storage.objects');
  if not coalesce(v_rls_enabled,false) then
    raise exception 'storage_objects_rls_required' using errcode='55000',
      hint='Enable and review Storage RLS separately before applying G9; this migration will not enable it implicitly.';
  end if;
  drop policy if exists account_deletion_active_storage on storage.objects;
  create policy account_deletion_active_storage on storage.objects
    as restrictive for all to authenticated
    using(public.account_allows_current_access())
    with check(public.account_allows_current_access());
end;
$$;

create trigger photos_deny_deleting_account_write
  before insert or update on public.photos for each row
  execute function quantum_private.prevent_deleting_account_write('user_id');
create trigger continuation_album_deny_deleting_account_write
  before insert or update on public.quantum_continuation_album_photos for each row
  execute function quantum_private.prevent_deleting_account_write('uploader_user_id');
create trigger community_profile_deny_deleting_account_write
  before insert or update on quantum_private.community_member_profiles for each row
  execute function quantum_private.prevent_deleting_account_write('user_id');

-- Existing authenticated JWTs can outlive refresh-session revocation. Apply a
-- statement guard to every pre-existing public application table so direct
-- table writes and SECURITY DEFINER RPC writes cannot accumulate new data.
create or replace function quantum_private.prevent_deleting_account_actor_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is not null and quantum_private.account_deletion_blocks_access(v_actor) then
    raise exception 'account_deletion_pending' using errcode='42501';
  end if;
  return null;
end;
$$;
do $$
declare v_table record;
begin
  for v_table in
    select namespace.nspname as schema_name,class.relname as table_name,
      class.relrowsecurity as rls_enabled
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid=class.relnamespace
    where namespace.nspname='public' and class.relkind in('r','p')
      and not class.relispartition
      and not exists(
        select 1 from pg_catalog.pg_depend dependency
        where dependency.classid='pg_catalog.pg_class'::regclass
          and dependency.objid=class.oid and dependency.deptype='e'
      )
  loop
    execute pg_catalog.format('drop trigger if exists account_deletion_deny_actor_write on %I.%I',
      v_table.schema_name,v_table.table_name);
    execute pg_catalog.format('create trigger account_deletion_deny_actor_write before insert or update or delete on %I.%I for each statement execute function quantum_private.prevent_deleting_account_actor_write()',
      v_table.schema_name,v_table.table_name);
    if v_table.rls_enabled then
      execute pg_catalog.format('drop policy if exists account_deletion_active_select on %I.%I',
        v_table.schema_name,v_table.table_name);
      execute pg_catalog.format('create policy account_deletion_active_select on %I.%I as restrictive for select to authenticated using (public.account_allows_current_access())',
        v_table.schema_name,v_table.table_name);
    end if;
  end loop;
end;
$$;

create or replace function quantum_private.prevent_deleting_account_friend_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if quantum_private.account_deletion_blocks_access(new.sender_user_id)
     or quantum_private.account_deletion_blocks_access(
       case when new.friendship_user_id=new.sender_user_id
         then new.friendship_friend_user_id else new.friendship_user_id end
     ) then
    raise exception 'account_deletion_pending' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger friend_message_deny_deleting_account_write
  before insert on public.friend_direct_messages for each row
  execute function quantum_private.prevent_deleting_account_friend_message();

create or replace function public.get_account_deletion_status_for_service(p_actor_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_request quantum_private.account_deletion_requests%rowtype;
begin
  perform quantum_private.account_require_service();
  select * into v_request from quantum_private.account_deletion_requests r
    where r.user_id=p_actor_user_id order by r.requested_at desc,r.id desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('request_id',v_request.id,'status',v_request.status,
    'requested_at',v_request.requested_at,'completed_at',v_request.completed_at);
end;
$$;

create or replace function public.request_account_deletion_for_service(
  p_actor_user_id uuid,p_idempotency_key uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_request quantum_private.account_deletion_requests%rowtype;
  v_session record;
begin
  perform quantum_private.account_require_service();
  if p_actor_user_id is null or p_idempotency_key is null then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account-delete|'||p_actor_user_id::text,0));
  select * into v_request from quantum_private.account_deletion_requests r
    where r.user_id=p_actor_user_id and r.idempotency_key=p_idempotency_key;
  if not found then
    select * into v_request from quantum_private.account_deletion_requests r
      where r.user_id=p_actor_user_id and r.status not in ('completed','cancelled') for update;
    if not found then
      insert into quantum_private.account_deletion_requests(
        user_id,idempotency_key,status,legal_retention_ready
      ) values(
        p_actor_user_id,p_idempotency_key,'cleanup_pending',
        not quantum_private.account_has_legal_retention_candidates(p_actor_user_id)
      ) returning * into v_request;
    end if;
  end if;

  -- Irreversible product-access denial is durable before external cleanup.
  perform set_config('app.account_deletion_profile_scrub_user_id',p_actor_user_id::text,true);
  update quantum_private.community_member_profiles
    set friend_recognition_name=null,updated_at=clock_timestamp() where user_id=p_actor_user_id;
  perform set_config('app.account_deletion_profile_scrub_user_id','',true);
  update public.friend_invites set status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp()
    where status='pending' and (inviter_user_id=p_actor_user_id or claimed_by_user_id=p_actor_user_id);
  update public.friend_requests set status='cancelled',responded_at=clock_timestamp()
    where status='pending' and (sender_user_id=p_actor_user_id or receiver_user_id=p_actor_user_id);
  update public.friendships set status='blocked'
    where status='active' and p_actor_user_id in (user_id,friend_user_id);

  delete from quantum_private.voice_queue where user_id=p_actor_user_id;
  delete from quantum_private.voice_searches where user_id=p_actor_user_id;
  update quantum_private.voice_friend_invitations set status='cancelled'
    where status='pending' and p_actor_user_id in(sender_id,recipient_id);
  for v_session in
    select distinct member.session_id,room.kind
    from quantum_private.voice_members member
    join quantum_private.voice_sessions session on session.id=member.session_id
    join quantum_private.voice_rooms room on room.id=session.room_id
    where member.user_id=p_actor_user_id and member.active and session.state<>'ended'
  loop
    if v_session.kind='group' then
      perform quantum_private.voice_revoke_member(v_session.session_id,p_actor_user_id);
    else
      perform quantum_private.voice_end_session(v_session.session_id);
    end if;
  end loop;

  update quantum_private.account_deletion_requests set access_revoked_at=clock_timestamp(),
    status=case when status='requested' then 'cleanup_pending' else status end,updated_at=clock_timestamp()
    where id=v_request.id returning * into v_request;
  return jsonb_build_object('request_id',v_request.id,'status',v_request.status,
    'requested_at',v_request.requested_at);
end;
$$;

-- Financial/dispute candidates never become ready by inference. A trusted
-- reviewer must provide a hash of the external retention evidence/decision.
create or replace function public.approve_account_legal_retention_for_service(
  p_request_id uuid,p_reviewer_user_id uuid,p_decision text,p_review_reference_hash text
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  perform quantum_private.account_require_service();
  if p_decision not in ('no_retention_required','retention_preserved')
     or coalesce(p_review_reference_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'legal_retention_review_required';
  end if;
  insert into quantum_private.account_legal_retention_reviews(
    request_id,reviewer_user_id,decision,review_reference_hash
  ) values(p_request_id,p_reviewer_user_id,p_decision,p_review_reference_hash)
  on conflict(request_id) do nothing;
  if not found then raise exception 'legal_retention_review_already_recorded'; end if;
  update quantum_private.account_deletion_requests set legal_retention_ready=true,
    legal_review_reference_hash=p_review_reference_hash,legal_reviewed_at=clock_timestamp(),
    updated_at=clock_timestamp() where id=p_request_id and status not in ('completed','cancelled');
  if not found then raise exception 'account_deletion_request_not_found'; end if;
  return true;
end;
$$;

create or replace function quantum_private.enqueue_retention_cleanup_jobs()
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  -- Account profile photos. The path remains private and is validated again by the worker.
  insert into quantum_private.retention_cleanup_jobs(request_id,user_id,kind,source_kind,source_record_id,bucket,storage_path)
  select request.id,photo.user_id,'storage_object','profile_photo',photo.id,'photos',photo.storage_path
  from quantum_private.account_deletion_requests request
  join public.photos photo on photo.user_id=request.user_id
  where request.status not in ('completed','cancelled')
  on conflict(source_kind,source_record_id) where kind='storage_object' do nothing;

  insert into quantum_private.retention_cleanup_jobs(request_id,user_id,kind,source_kind,source_record_id,bucket,storage_path)
  select request.id,photo.uploader_user_id,'storage_object','continuation_album',photo.id,
    'meeting-evidence',photo.storage_path
  from quantum_private.account_deletion_requests request
  join public.quantum_continuation_album_photos photo on photo.uploader_user_id=request.user_id
  where request.status not in ('completed','cancelled') and photo.status<>'deleted'
  on conflict(source_kind,source_record_id) where kind='storage_object' do nothing;

  insert into quantum_private.retention_cleanup_jobs(request_id,user_id,kind,source_kind,source_record_id,bucket,storage_path)
  select request.id,evidence.uploader_user_id,'storage_object','meeting_evidence',evidence.id,
    'meeting-evidence',evidence.storage_path
  from quantum_private.account_deletion_requests request
  join public.meeting_photo_evidence evidence on evidence.uploader_user_id=request.user_id
  where request.status not in ('completed','cancelled') and evidence.status<>'deleted'
    and evidence.dispute_hold=false
  on conflict(source_kind,source_record_id) where kind='storage_object' do nothing;

  insert into quantum_private.retention_cleanup_jobs(request_id,user_id,kind,source_kind,source_record_id,bucket,storage_path)
  select request.id,enrollment.user_id,'storage_object','campus_seven_attendance',evidence.id,
    'campus-seven-attendance',evidence.object_path
  from quantum_private.account_deletion_requests request
  join public.campus_seven_enrollments enrollment on enrollment.user_id=request.user_id
  join public.campus_seven_attendance_evidence evidence on evidence.enrollment_id=enrollment.id
  where request.status not in ('completed','cancelled') and evidence.deleted_at is null
  on conflict(source_kind,source_record_id) where kind='storage_object' do nothing;

  -- Normal expiry uses the same leased retry queue instead of deleting storage
  -- inside a transaction. Evidence under a dispute hold is always excluded.
  insert into quantum_private.retention_cleanup_jobs(user_id,kind,source_kind,source_record_id,bucket,storage_path)
  select photo.uploader_user_id,'storage_object','continuation_album',photo.id,
    'meeting-evidence',photo.storage_path
  from public.quantum_continuation_album_photos photo
  where photo.status<>'deleted' and photo.retention_until<=statement_timestamp()
  on conflict(source_kind,source_record_id) where kind='storage_object' do nothing;

  insert into quantum_private.retention_cleanup_jobs(user_id,kind,source_kind,source_record_id,bucket,storage_path)
  select evidence.uploader_user_id,'storage_object','meeting_evidence',evidence.id,
    'meeting-evidence',evidence.storage_path
  from public.meeting_photo_evidence evidence
  where evidence.status<>'deleted' and evidence.dispute_hold=false
    and evidence.retention_until<=statement_timestamp()
  on conflict(source_kind,source_record_id) where kind='storage_object' do nothing;

  insert into quantum_private.retention_cleanup_jobs(user_id,kind,source_kind,source_record_id,bucket,storage_path)
  select enrollment.user_id,'storage_object','campus_seven_attendance',evidence.id,
    'campus-seven-attendance',evidence.object_path
  from public.campus_seven_attendance_evidence evidence
  join public.campus_seven_enrollments enrollment on enrollment.id=evidence.enrollment_id
  where evidence.deleted_at is null and evidence.delete_after<=statement_timestamp()
  on conflict(source_kind,source_record_id) where kind='storage_object' do nothing;

  update quantum_private.account_deletion_requests request set
    storage_cleanup_ready=not exists(
      select 1 from quantum_private.retention_cleanup_jobs job
      where job.request_id=request.id and job.kind='storage_object' and job.status<>'completed'
    ),updated_at=clock_timestamp()
  where request.status not in ('completed','cancelled');

  insert into quantum_private.retention_cleanup_jobs(request_id,user_id,kind,source_kind)
  select request.id,request.user_id,'auth_user','auth_user'
  from quantum_private.account_deletion_requests request
  where request.status not in ('completed','cancelled') and request.legal_retention_ready
    and request.storage_cleanup_ready
  on conflict(request_id) where kind='auth_user' do nothing;
  update quantum_private.account_deletion_requests request set status='auth_delete_pending',updated_at=clock_timestamp()
    where request.status not in ('completed','cancelled') and request.legal_retention_ready
      and request.storage_cleanup_ready and exists(
        select 1 from quantum_private.retention_cleanup_jobs job
        where job.request_id=request.id and job.kind='auth_user' and job.status<>'completed'
      );
end;
$$;

create or replace function public.preview_retention_cleanup_jobs_for_service(p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,25),1),50);v_storage bigint;v_auth bigint;
begin
  perform quantum_private.account_require_service();
  select count(*) into v_storage from (
    select job.source_kind,job.source_record_id from quantum_private.retention_cleanup_jobs job
    where job.kind='storage_object' and job.status<>'completed' and job.next_attempt_at<=clock_timestamp()
    union
    select 'continuation_album',photo.id from public.quantum_continuation_album_photos photo
      where photo.status<>'deleted' and photo.retention_until<=statement_timestamp()
    union
    select 'meeting_evidence',evidence.id from public.meeting_photo_evidence evidence
      where evidence.status<>'deleted' and evidence.dispute_hold=false
        and evidence.retention_until<=statement_timestamp()
    union
    select 'campus_seven_attendance',evidence.id from public.campus_seven_attendance_evidence evidence
      where evidence.deleted_at is null and evidence.delete_after<=statement_timestamp()
    union
    select 'profile_photo',photo.id from quantum_private.account_deletion_requests request
      join public.photos photo on photo.user_id=request.user_id
      where request.status not in ('completed','cancelled')
    union
    select 'continuation_album',photo.id from quantum_private.account_deletion_requests request
      join public.quantum_continuation_album_photos photo on photo.uploader_user_id=request.user_id
      where request.status not in ('completed','cancelled') and photo.status<>'deleted'
    union
    select 'meeting_evidence',evidence.id from quantum_private.account_deletion_requests request
      join public.meeting_photo_evidence evidence on evidence.uploader_user_id=request.user_id
      where request.status not in ('completed','cancelled') and evidence.status<>'deleted'
        and evidence.dispute_hold=false
    union
    select 'campus_seven_attendance',evidence.id from quantum_private.account_deletion_requests request
      join public.campus_seven_enrollments enrollment on enrollment.user_id=request.user_id
      join public.campus_seven_attendance_evidence evidence on evidence.enrollment_id=enrollment.id
      where request.status not in ('completed','cancelled') and evidence.deleted_at is null
  ) eligible_storage;
  select count(*) into v_auth from quantum_private.account_deletion_requests request
    where request.status not in ('completed','cancelled') and request.legal_retention_ready
      and request.storage_cleanup_ready;
  return jsonb_build_object('storage_jobs',least(v_storage,v_limit),'auth_jobs',least(v_auth,v_limit),
    'limit',v_limit,'note','dry_run_does_not_enqueue_or_claim');
end;
$$;

create or replace function public.claim_retention_cleanup_jobs_for_service(
  p_worker_token uuid,p_limit integer default 25
)
returns table(kind text,job_id uuid,user_id uuid,request_id uuid,bucket text,storage_path text,
  claim_token uuid,attempt_count integer)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform quantum_private.account_require_service();
  if p_worker_token is null then raise exception 'invalid_worker_token'; end if;
  perform quantum_private.enqueue_retention_cleanup_jobs();
  return query
  update quantum_private.retention_cleanup_jobs job set status='processing',claim_token=p_worker_token,
    lease_expires_at=clock_timestamp()+interval '5 minutes',attempt_count=job.attempt_count+1,
    updated_at=clock_timestamp()
  where job.id in(
    select candidate.id from quantum_private.retention_cleanup_jobs candidate
    where (candidate.status in ('pending','retry_wait')
        or (candidate.status='processing' and candidate.lease_expires_at<=clock_timestamp()))
      and candidate.next_attempt_at<=clock_timestamp()
    order by candidate.next_attempt_at,candidate.created_at,candidate.id
    limit least(greatest(coalesce(p_limit,25),1),50) for update skip locked
  )
  returning job.kind,job.id,job.user_id,job.request_id,job.bucket,job.storage_path,
    job.claim_token,job.attempt_count;
end;
$$;

create or replace function public.confirm_account_auth_delete_ready_for_service(
  p_request_id uuid,p_user_id uuid,p_worker_token uuid
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_ready boolean;
begin
  perform quantum_private.account_require_service();
  select request.legal_retention_ready and request.storage_cleanup_ready
    and request.status='auth_delete_pending'
    and not exists(select 1 from quantum_private.retention_cleanup_jobs pending
      where pending.request_id=request.id and pending.kind='storage_object' and pending.status<>'completed')
    and not exists(select 1 from public.photos photo where photo.user_id=request.user_id
      and not exists(select 1 from quantum_private.retention_cleanup_jobs job
        where job.source_kind='profile_photo' and job.source_record_id=photo.id and job.status='completed'))
    and not exists(select 1 from public.quantum_continuation_album_photos photo
      where photo.uploader_user_id=request.user_id and photo.status<>'deleted')
    and not exists(select 1 from public.meeting_photo_evidence evidence
      where evidence.uploader_user_id=request.user_id and evidence.status<>'deleted'
        and evidence.dispute_hold=false)
    and not exists(select 1 from public.campus_seven_attendance_evidence evidence
      join public.campus_seven_enrollments enrollment on enrollment.id=evidence.enrollment_id
      where enrollment.user_id=request.user_id and evidence.deleted_at is null)
  into v_ready
  from quantum_private.account_deletion_requests request
  join quantum_private.retention_cleanup_jobs auth_job on auth_job.request_id=request.id
    and auth_job.kind='auth_user' and auth_job.status='processing'
    and auth_job.claim_token=p_worker_token
  where request.id=p_request_id and request.user_id=p_user_id;
  return coalesce(v_ready,false);
end;
$$;

create or replace function public.complete_retention_cleanup_job_for_service(
  p_job_id uuid,p_claim_token uuid
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_job quantum_private.retention_cleanup_jobs%rowtype;
begin
  perform quantum_private.account_require_service();
  select * into v_job from quantum_private.retention_cleanup_jobs job
    where job.id=p_job_id and job.status='processing' and job.claim_token=p_claim_token for update;
  if not found then return false; end if;
  if v_job.source_kind='profile_photo' then
    delete from public.photos where id=v_job.source_record_id and user_id=v_job.user_id;
  elsif v_job.source_kind='meeting_evidence' then
    update public.meeting_photo_evidence set status='deleted'
      where id=v_job.source_record_id and uploader_user_id=v_job.user_id and dispute_hold=false;
  elsif v_job.source_kind='continuation_album' then
    perform set_config('app.account_retention_cleanup_job_id',v_job.id::text,true);
    update public.quantum_continuation_album_photos set status='deleted',deleted_at=clock_timestamp(),
      processing_token=null,processing_lease_expires_at=null where id=v_job.source_record_id;
    perform set_config('app.account_retention_cleanup_job_id','',true);
  elsif v_job.source_kind='campus_seven_attendance' then
    update public.campus_seven_attendance_evidence set status='deleted',deleted_at=clock_timestamp()
      where id=v_job.source_record_id;
  elsif v_job.source_kind='auth_user' then
    update quantum_private.account_deletion_requests set status='completed',auth_deleted_at=clock_timestamp(),
      completed_at=clock_timestamp(),last_error_code=null,updated_at=clock_timestamp()
      where id=v_job.request_id and user_id=v_job.user_id;
  end if;
  update quantum_private.retention_cleanup_jobs set status='completed',completed_at=clock_timestamp(),
    claim_token=null,lease_expires_at=null,last_error_code=null,updated_at=clock_timestamp()
    where id=v_job.id;
  return true;
end;
$$;

create or replace function public.retry_retention_cleanup_job_for_service(
  p_job_id uuid,p_claim_token uuid,p_error_code text,p_retry_after_seconds integer
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_request_id uuid;
begin
  perform quantum_private.account_require_service();
  if coalesce(p_error_code,'') !~ '^[a-z0-9_]{1,80}$'
     or p_retry_after_seconds not between 60 and 21600 then raise exception 'invalid_retry'; end if;
  update quantum_private.retention_cleanup_jobs job set status='retry_wait',claim_token=null,
    lease_expires_at=null,last_error_code=p_error_code,
    next_attempt_at=clock_timestamp()+make_interval(secs=>p_retry_after_seconds),updated_at=clock_timestamp()
    where job.id=p_job_id and job.status='processing' and job.claim_token=p_claim_token
    returning job.request_id into v_request_id;
  if not found then return false; end if;
  if v_request_id is not null then
    update quantum_private.account_deletion_requests set status='retry_wait',last_error_code=p_error_code,
      updated_at=clock_timestamp() where id=v_request_id and status not in ('completed','cancelled');
  end if;
  return true;
end;
$$;

revoke all on function quantum_private.account_current_request_role() from public,anon,authenticated,service_role;
revoke all on function quantum_private.account_require_service() from public,anon,authenticated,service_role;
revoke all on function quantum_private.account_deletion_blocks_access(uuid) from public,anon,authenticated,service_role;
revoke all on function quantum_private.account_has_legal_retention_candidates(uuid) from public,anon,authenticated,service_role;
revoke all on function quantum_private.prevent_deleting_account_write() from public,anon,authenticated,service_role;
revoke all on function quantum_private.prevent_deleting_account_friend_message() from public,anon,authenticated,service_role;
revoke all on function quantum_private.prevent_deleting_account_actor_write() from public,anon,authenticated,service_role;
revoke all on function quantum_private.enqueue_retention_cleanup_jobs() from public,anon,authenticated,service_role;
revoke all on function public.get_account_deletion_status_for_service(uuid) from public,anon,authenticated,service_role;
revoke all on function public.request_account_deletion_for_service(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.approve_account_legal_retention_for_service(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.preview_retention_cleanup_jobs_for_service(integer) from public,anon,authenticated,service_role;
revoke all on function public.claim_retention_cleanup_jobs_for_service(uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.confirm_account_auth_delete_ready_for_service(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.complete_retention_cleanup_job_for_service(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.retry_retention_cleanup_job_for_service(uuid,uuid,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.get_access_context() from public,anon,authenticated,service_role;
revoke all on function public.account_allows_current_access() from public,anon,authenticated,service_role;
revoke all on function public.enforce_active_account_data_api_request() from public,anon,authenticated,service_role;
grant execute on function public.get_access_context() to authenticated;
grant execute on function public.account_allows_current_access() to authenticated;
grant execute on function public.enforce_active_account_data_api_request() to anon,authenticated,service_role;
grant execute on function public.get_account_deletion_status_for_service(uuid) to service_role;
grant execute on function public.request_account_deletion_for_service(uuid,uuid) to service_role;
grant execute on function public.approve_account_legal_retention_for_service(uuid,uuid,text,text) to service_role;
grant execute on function public.preview_retention_cleanup_jobs_for_service(integer) to service_role;
grant execute on function public.claim_retention_cleanup_jobs_for_service(uuid,integer) to service_role;
grant execute on function public.confirm_account_auth_delete_ready_for_service(uuid,uuid,uuid) to service_role;
grant execute on function public.complete_retention_cleanup_job_for_service(uuid,uuid) to service_role;
grant execute on function public.retry_retention_cleanup_job_for_service(uuid,uuid,text,integer) to service_role;

comment on function quantum_private.account_deletion_blocks_access(uuid) is
  'Fail-closed shared guard for all product access while account deletion is pending or complete.';
comment on function public.enforce_active_account_data_api_request() is
  'PostgREST db_pre_request hook: rejects only pending authenticated accounts; Storage and Realtime require RLS.';
comment on table quantum_private.account_legal_retention_reviews is
  'Stores only review decision metadata and an external evidence hash; legal policy still requires operator/legal approval.';
comment on table quantum_private.retention_cleanup_jobs is
  'Leased, retryable physical storage and auth-provider cleanup. Storage must complete before an auth_user job is ready.';

commit;
