-- Personal snapshots only. No public popularity/statistics are incremented.
create table quantum_private.content_history_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  snapshot jsonb not null,
  note text not null default '' check (length(note)<=500),
  revision integer not null default 1 check(revision>0),
  saved_at timestamptz not null default now(),
  unique(owner_id,source_key)
);
create index content_history_owner_page on quantum_private.content_history_records(owner_id,saved_at desc,id desc);
alter table quantum_private.content_history_records enable row level security;
revoke all on quantum_private.content_history_records from public,anon,authenticated,service_role;

create function quantum_private.content_history_owner() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'auth_required'; end if;
  if not exists(select 1 from auth.users u where u.id=v_user and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
    or quantum_private.account_deletion_blocks_access(v_user) then raise exception 'account_unavailable'; end if;
  return v_user;
end $$;

create function quantum_private.content_snapshot_valid(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare c jsonb; s jsonb; ids text[]:='{}';
begin
  if jsonb_typeof(p) is distinct from 'object' or length(p::text)>200000
    or (select count(*) from jsonb_object_keys(p))<>8
    or exists(select 1 from jsonb_object_keys(p) k where k not in ('sourceKey','kind','category','title','winnerId','candidates','selections','completedAt'))
    or coalesce(p->>'kind','') not in ('visit','places')
    or coalesce(p->>'sourceKey','') !~ '^[a-zA-Z][a-zA-Z0-9:_-]{1,179}$'
    or (p->>'sourceKey') not like (p->>'kind')||':%'
    or coalesce(p->>'category','') !~ '^[a-z][a-z0-9_-]{0,49}$'
    or jsonb_typeof(p->'title') is distinct from 'string' or length(trim(p->>'title')) not between 1 and 100
    or (p->>'title') ~ '[[:cntrl:]]' or (p->>'title')<>trim(p->>'title')
    or jsonb_typeof(p->'winnerId') is distinct from 'string'
    or jsonb_typeof(p->'candidates') is distinct from 'array'
    or jsonb_typeof(p->'selections') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p->'candidates') not between 2 and 64 or jsonb_array_length(p->'selections') not between 1 and 512 then return false; end if;
  if p->'completedAt' is distinct from 'null'::jsonb then
    if jsonb_typeof(p->'completedAt') is distinct from 'string' or (p->>'completedAt') !~ '^\d{4}-\d{2}-\d{2}T' then return false; end if;
    perform (p->>'completedAt')::timestamptz;
  end if;
  for c in select value from jsonb_array_elements(p->'candidates') loop
    if jsonb_typeof(c) is distinct from 'object' or (select count(*) from jsonb_object_keys(c))<>2
      or jsonb_typeof(c->'id') is distinct from 'string' or length(trim(c->>'id')) not between 1 and 120
      or jsonb_typeof(c->'name') is distinct from 'string' or length(trim(c->>'name')) not between 1 and 100
      or (c->>'id') ~ '[[:cntrl:]]' or (c->>'name') ~ '[[:cntrl:]]'
      or (c->>'id')<>trim(c->>'id') or (c->>'name')<>trim(c->>'name')
      or (c->>'id')=any(ids) then return false; end if;
    ids:=array_append(ids,c->>'id');
  end loop;
  if not (p->>'winnerId')=any(ids) then return false; end if;
  for s in select value from jsonb_array_elements(p->'selections') loop
    if jsonb_typeof(s) is distinct from 'object' or (select count(*) from jsonb_object_keys(s))<>2
      or jsonb_typeof(s->'winnerId') is distinct from 'string' or jsonb_typeof(s->'loserId') is distinct from 'string'
      or not (s->>'winnerId')=any(ids) or not (s->>'loserId')=any(ids)
      or (s->>'winnerId')=(s->>'loserId') then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
alter table quantum_private.content_history_records add constraint content_snapshot_valid check(quantum_private.content_snapshot_valid(snapshot));

create function quantum_private.content_record_dto(p quantum_private.content_history_records) returns jsonb
language sql stable set search_path='' as $$
  select p.snapshot||jsonb_build_object('id',p.id,'savedAt',p.saved_at,'note',p.note,'revision',p.revision)
$$;

create function public.save_my_content_record(p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=quantum_private.content_history_owner(); r quantum_private.content_history_records;
begin
  if not quantum_private.content_snapshot_valid(p_snapshot) then raise exception 'invalid_snapshot'; end if;
  -- Serialize only this owner's writes and bound personal storage growth.
  perform 1 from auth.users where id=v_user for update;
  perform quantum_private.content_history_owner();
  select * into r from quantum_private.content_history_records where owner_id=v_user and source_key=p_snapshot->>'sourceKey';
  if found then
    if r.snapshot<>p_snapshot then raise exception 'source_conflict'; end if;
    return quantum_private.content_record_dto(r);
  end if;
  if (select count(*) from quantum_private.content_history_records where owner_id=v_user)>=1000 then raise exception 'record_limit'; end if;
  insert into quantum_private.content_history_records(owner_id,source_key,snapshot)
    values(v_user,p_snapshot->>'sourceKey',p_snapshot) returning * into r;
  return quantum_private.content_record_dto(r);
end $$;

create function public.list_my_content_records(p_kind text default null,p_before_at timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=quantum_private.content_history_owner(); rows jsonb; last_row jsonb;
begin
  if (p_kind is not null and p_kind not in ('visit','places')) or ((p_before_at is null)<>(p_before_id is null)) then raise exception 'invalid_query'; end if;
  select coalesce(jsonb_agg(quantum_private.content_record_dto(r) order by r.saved_at desc,r.id desc),'[]'::jsonb) into rows
    from (select * from quantum_private.content_history_records
      where owner_id=v_user and (p_kind is null or snapshot->>'kind'=p_kind)
        and (p_before_at is null or (saved_at,id)<(p_before_at,p_before_id))
      order by saved_at desc,id desc limit 21) r;
  if jsonb_array_length(rows)>20 then
    rows:=rows-20; last_row:=rows->19;
    return jsonb_build_object('records',rows,'nextCursor',jsonb_build_object('savedAt',last_row->>'savedAt','id',last_row->>'id'));
  end if;
  return jsonb_build_object('records',rows,'nextCursor',null);
end $$;

create function public.get_my_content_record(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=quantum_private.content_history_owner(); r quantum_private.content_history_records;
begin
  select * into r from quantum_private.content_history_records where owner_id=v_user and id=p_id;
  if not found then raise exception 'record_not_found'; end if;
  return quantum_private.content_record_dto(r);
end $$;

create function public.update_my_content_record_note(p_id uuid,p_note text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=quantum_private.content_history_owner(); r quantum_private.content_history_records;
begin
  if p_note is null or length(p_note)>500
    or regexp_replace(p_note,E'[\n\r\t]','','g') ~ '[[:cntrl:]]' then raise exception 'invalid_note'; end if;
  select * into r from quantum_private.content_history_records where owner_id=v_user and id=p_id for update;
  if not found then raise exception 'record_not_found'; end if;
  if r.revision is distinct from p_revision then raise exception 'revision_conflict'; end if;
  update quantum_private.content_history_records set note=trim(p_note),revision=revision+1 where id=r.id returning * into r;
  return quantum_private.content_record_dto(r);
end $$;

create function public.delete_my_content_record(p_id uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=quantum_private.content_history_owner(); r quantum_private.content_history_records;
begin
  select * into r from quantum_private.content_history_records where owner_id=v_user and id=p_id for update;
  if not found then raise exception 'record_not_found'; end if;
  if r.revision is distinct from p_revision then raise exception 'revision_conflict'; end if;
  delete from quantum_private.content_history_records where id=r.id;
  return jsonb_build_object('deleted',true);
end $$;

revoke all on function quantum_private.content_history_owner(),quantum_private.content_snapshot_valid(jsonb),quantum_private.content_record_dto(quantum_private.content_history_records) from public,anon,authenticated,service_role;
revoke all on function public.save_my_content_record(jsonb),public.list_my_content_records(text,timestamptz,uuid),public.get_my_content_record(uuid),public.update_my_content_record_note(uuid,text,integer),public.delete_my_content_record(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.save_my_content_record(jsonb),public.list_my_content_records(text,timestamptz,uuid),public.get_my_content_record(uuid),public.update_my_content_record_note(uuid,text,integer),public.delete_my_content_record(uuid,integer) to authenticated;
