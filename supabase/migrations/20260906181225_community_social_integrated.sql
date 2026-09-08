-- Quantum G1-G9 integrated migration. Local reviewed drafts; not remotely applied.
-- Keep source blocks in dependency order. One atomic transaction.
begin;

-- BEGIN SOURCE g1-g2-schema.sql
-- G1/G2 integration draft. Parent task converts this into the timestamped migration.
-- Raw invite capabilities never cross this database boundary.

alter table quantum_private.community_member_profiles
  add column if not exists friend_recognition_name text;

alter table quantum_private.community_member_profiles
  drop constraint if exists community_member_profiles_friend_recognition_name_check;
alter table quantum_private.community_member_profiles
  add constraint community_member_profiles_friend_recognition_name_check check (
    friend_recognition_name is null or (
      char_length(friend_recognition_name) between 2 and 40
      and friend_recognition_name = btrim(friend_recognition_name)
      and friend_recognition_name !~ '[[:cntrl:]]'
      and position(chr(8203) in friend_recognition_name)=0
      and position(chr(8238) in friend_recognition_name)=0
      and position(chr(8288) in friend_recognition_name)=0
      and position(chr(65279) in friend_recognition_name)=0
    )
  );

create table public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.users(id) on delete cascade,
  claimed_by_user_id uuid references public.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','expired')),
  create_idempotency_key uuid not null,
  decision_idempotency_key uuid,
  cancel_idempotency_key uuid,
  friend_request_id uuid references public.friend_requests(id) on delete set null,
  expires_at timestamptz not null,
  responded_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (inviter_user_id, create_idempotency_key),
  check (claimed_by_user_id is null or claimed_by_user_id <> inviter_user_id)
);
create index friend_invites_owner_idx on public.friend_invites(inviter_user_id, created_at desc);
create index friend_invites_expiry_idx on public.friend_invites(expires_at) where status='pending';
alter table public.friend_invites enable row level security;
revoke all on table public.friend_invites from public, anon, authenticated;
grant select, insert, update, delete on table public.friend_invites to service_role;

create table public.friend_direct_message_read_cursors (
  friendship_user_id uuid not null,
  friendship_friend_user_id uuid not null,
  reader_user_id uuid not null references public.users(id) on delete cascade,
  last_read_message_id uuid not null references public.friend_direct_messages(id) on delete cascade,
  last_read_created_at timestamptz not null,
  updated_at timestamptz not null default current_timestamp,
  primary key (friendship_user_id, friendship_friend_user_id, reader_user_id),
  foreign key (friendship_user_id, friendship_friend_user_id)
    references public.friendships(user_id, friend_user_id) on delete cascade,
  check (friendship_user_id < friendship_friend_user_id),
  check (reader_user_id in (friendship_user_id, friendship_friend_user_id))
);
alter table public.friend_direct_message_read_cursors enable row level security;
revoke all on table public.friend_direct_message_read_cursors from public, anon, authenticated;
grant select, insert, update, delete on table public.friend_direct_message_read_cursors to service_role;

-- Realtime carries only a pair-scoped revision. Message bodies, display names,
-- private recognition names, read message ids, and sender identity stay behind
-- the authenticated RPC projection.
create table public.friend_conversation_revisions (
  friendship_user_id uuid not null,
  friendship_friend_user_id uuid not null,
  revision bigint not null default 1 check (revision > 0),
  changed_at timestamptz not null default clock_timestamp(),
  primary key (friendship_user_id, friendship_friend_user_id),
  foreign key (friendship_user_id, friendship_friend_user_id)
    references public.friendships(user_id, friend_user_id) on delete cascade,
  check (friendship_user_id < friendship_friend_user_id)
);
alter table public.friend_conversation_revisions enable row level security;
revoke all on table public.friend_conversation_revisions from public, anon, authenticated;
grant select on table public.friend_conversation_revisions to authenticated;
grant select, insert, update, delete on table public.friend_conversation_revisions to service_role;
create policy friend_conversation_revision_participant_read on public.friend_conversation_revisions
  for select to authenticated
  using (auth.uid() in (friendship_user_id,friendship_friend_user_id));

create or replace function quantum_private.bump_friend_conversation_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_low uuid; v_high uuid;
begin
  if tg_table_name='friendships' then
    v_low:=new.user_id; v_high:=new.friend_user_id;
    if not exists(
      select 1 from public.friend_requests request
      where request.id=new.created_from_request_id and request.status='accepted'
        and request.receiver_user_id is not null
        and least(request.sender_user_id,request.receiver_user_id)=v_low
        and greatest(request.sender_user_id,request.receiver_user_id)=v_high
    ) then return new; end if;
  else
    v_low:=new.friendship_user_id; v_high:=new.friendship_friend_user_id;
  end if;
  insert into public.friend_conversation_revisions(
    friendship_user_id,friendship_friend_user_id,revision,changed_at
  ) values(v_low,v_high,1,clock_timestamp())
  on conflict(friendship_user_id,friendship_friend_user_id) do update
    set revision=public.friend_conversation_revisions.revision+1,
        changed_at=excluded.changed_at;
  return new;
end;
$$;

create trigger trg_friendship_conversation_revision
after insert or update on public.friendships
for each row execute function quantum_private.bump_friend_conversation_revision();
create trigger trg_friend_message_conversation_revision
after insert on public.friend_direct_messages
for each row execute function quantum_private.bump_friend_conversation_revision();
create trigger trg_friend_read_conversation_revision
after insert or update on public.friend_direct_message_read_cursors
for each row execute function quantum_private.bump_friend_conversation_revision();

alter publication supabase_realtime add table public.friend_conversation_revisions;

create or replace function quantum_private.friend_cursor(p_created_at timestamptz, p_id uuid)
returns text language sql stable set search_path = '' as $$
  select translate(rtrim(encode(convert_to(jsonb_build_array(p_created_at,p_id)::text,'utf8'),'base64'),'='),'+/','-_')
$$;

create or replace function public.get_my_friend_recognition_name()
returns table(friend_recognition_name text)
language plpgsql stable security definer set search_path = '' as $$
declare v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  return query select profile.friend_recognition_name
    from quantum_private.community_member_profiles profile where profile.user_id=v_caller;
end;
$$;

create or replace function public.set_my_friend_recognition_name(p_friend_recognition_name text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_caller uuid := auth.uid(); v_name text := btrim(regexp_replace(coalesce(p_friend_recognition_name,''),'[[:space:]]+',' ','g'));
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if char_length(v_name) not between 2 and 40 or v_name ~ '[[:cntrl:]]'
    or position(chr(8203) in v_name)>0 or position(chr(8238) in v_name)>0
    or position(chr(8288) in v_name)>0 or position(chr(65279) in v_name)>0
    then raise exception 'invalid_friend_recognition_name'; end if;
  update quantum_private.community_member_profiles profile
    set friend_recognition_name=v_name, updated_at=current_timestamp where profile.user_id=v_caller;
  if not found then raise exception 'minimum_signup_required'; end if;
  return true;
end;
$$;

create or replace function public.complete_minimum_signup_with_friend_name(
  p_user_id uuid, p_display_name text, p_friend_recognition_name text, p_birth_date date,
  p_school_scope text, p_department text, p_community_gender text, p_height integer default null,
  p_body_type text default null, p_hair_density text default null, p_year integer default null
)
returns table(display_name text, minimum_signup_complete boolean, profile_onboarding_complete boolean,
  matching_ready boolean, missing_reasons text[])
language plpgsql volatile security definer set search_path = '' as $$
declare v_name text := btrim(regexp_replace(coalesce(p_friend_recognition_name,''),'[[:space:]]+',' ','g'));
begin
  if private.current_request_role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if char_length(v_name) not between 2 and 40 or v_name ~ '[[:cntrl:]]'
    or position(chr(8203) in v_name)>0 or position(chr(8238) in v_name)>0
    or position(chr(8288) in v_name)>0 or position(chr(65279) in v_name)>0
    then raise exception 'invalid_friend_recognition_name'; end if;
  return query select result.display_name,result.minimum_signup_complete,result.profile_onboarding_complete,
      result.matching_ready,result.missing_reasons
    from public.complete_minimum_signup(p_user_id,p_display_name,p_birth_date,p_school_scope,p_department,
      p_community_gender,p_height,p_body_type,p_hair_density,p_year) result;
  update quantum_private.community_member_profiles profile
    set friend_recognition_name=v_name, updated_at=current_timestamp where profile.user_id=p_user_id;
  if not found then raise exception 'minimum_signup_required'; end if;
end;
$$;

create or replace function public.create_my_friend_invite(p_token_hash text, p_idempotency_key uuid)
returns table(invite_id uuid, expires_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare v_caller uuid := auth.uid(); v_row public.friend_invites%rowtype;
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_idempotency_key is null or coalesce(p_token_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_invite'; end if;
  if not exists(select 1 from quantum_private.community_member_profiles profile
      where profile.user_id=v_caller and profile.friend_recognition_name is not null)
    then raise exception 'friend_name_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('friend-invite-owner|'||v_caller::text,0));
  select * into v_row from public.friend_invites invite
    where invite.inviter_user_id=v_caller and invite.create_idempotency_key=p_idempotency_key;
  if found then
    if v_row.token_hash<>p_token_hash then raise exception 'idempotency_conflict'; end if;
    return query select v_row.id,v_row.expires_at; return;
  end if;
  if (select count(*) from public.friend_invites invite where invite.inviter_user_id=v_caller
      and invite.created_at>=current_timestamp-interval '10 minutes')>=10 then raise exception 'rate_limited'; end if;
  insert into public.friend_invites(inviter_user_id,token_hash,create_idempotency_key,expires_at)
    values(v_caller,p_token_hash,p_idempotency_key,current_timestamp+interval '7 days') returning * into v_row;
  return query select v_row.id,v_row.expires_at;
end;
$$;

create or replace function public.get_my_friend_invites()
returns table(invite_id uuid,status text,claimed_by_user_id uuid,expires_at timestamptz,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  return query select invite.id,
      case when invite.status='pending' and invite.expires_at<=current_timestamp then 'expired' else invite.status end,
      invite.claimed_by_user_id,invite.expires_at,invite.created_at
    from public.friend_invites invite where invite.inviter_user_id=v_caller
    order by invite.created_at desc limit 100;
end;
$$;

create or replace function public.preview_friend_invite(p_token_hash text)
returns table(invite_id uuid,inviter_display_name text,status text,expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  return query select invite.id,coalesce(profile.friend_recognition_name,profile.display_name),invite.status,invite.expires_at
    from public.friend_invites invite
    join quantum_private.community_member_profiles profile on profile.user_id=invite.inviter_user_id
    where invite.token_hash=p_token_hash and invite.status='pending' and invite.expires_at>current_timestamp
      and invite.inviter_user_id<>v_caller;
  if not found then raise exception 'invite_not_found'; end if;
end;
$$;

create or replace function public.accept_friend_invite(p_token_hash text,p_idempotency_key uuid)
returns table(friend_user_id uuid,request_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare v_caller uuid := auth.uid(); v_invite public.friend_invites%rowtype; v_low uuid; v_high uuid; v_request_id uuid;
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'invalid_idempotency_key'; end if;
  select * into v_invite from public.friend_invites invite where invite.token_hash=p_token_hash for update;
  if not found then raise exception 'invite_not_found'; end if;
  if v_invite.inviter_user_id=v_caller then raise exception 'cannot_invite_self'; end if;
  if v_invite.status='accepted' and v_invite.claimed_by_user_id=v_caller
      and v_invite.decision_idempotency_key=p_idempotency_key then
    return query select v_invite.inviter_user_id,v_invite.friend_request_id; return;
  end if;
  if v_invite.status<>'pending' then raise exception '%','invite_'||v_invite.status; end if;
  if v_invite.expires_at<=current_timestamp then
    update public.friend_invites set status='expired',updated_at=current_timestamp where id=v_invite.id;
    raise exception 'invite_expired';
  end if;
  v_low:=least(v_caller,v_invite.inviter_user_id); v_high:=greatest(v_caller,v_invite.inviter_user_id);
  perform pg_advisory_xact_lock(hashtextextended('friend-pair|'||v_low::text||'|'||v_high::text,0));
  if exists(select 1 from public.friendships friendship where friendship.user_id=v_low
      and friendship.friend_user_id=v_high and friendship.status='blocked') then raise exception 'blocked_pair'; end if;
  if exists(select 1 from public.friendships friendship join public.friend_requests request
      on request.id=friendship.created_from_request_id where friendship.user_id=v_low
      and friendship.friend_user_id=v_high and friendship.status='active' and request.status = 'accepted') then
    update public.friend_invites set status='accepted',claimed_by_user_id=v_caller,
      decision_idempotency_key=p_idempotency_key,responded_at=current_timestamp,updated_at=current_timestamp
      where id=v_invite.id;
    return query select v_invite.inviter_user_id,friendship.created_from_request_id
      from public.friendships friendship where friendship.user_id=v_low and friendship.friend_user_id=v_high; return;
  end if;
  insert into public.friend_requests(sender_user_id,receiver_user_id,receiver_phone,token,status,message,expires_at)
    values(v_invite.inviter_user_id,v_caller,null,
      encode(sha256(convert_to('friend-invite-request:'||v_invite.id::text,'utf8')),'hex'),
      'pending','친구 초대를 수락했어요.',v_invite.expires_at) returning id into v_request_id;
  perform public.accept_friend_request(v_request_id);
  update public.friend_invites set status='accepted',claimed_by_user_id=v_caller,friend_request_id=v_request_id,
    decision_idempotency_key=p_idempotency_key,responded_at=current_timestamp,updated_at=current_timestamp
    where id=v_invite.id;
  return query select v_invite.inviter_user_id,v_request_id;
end;
$$;

create or replace function public.decline_friend_invite(p_token_hash text,p_idempotency_key uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_caller uuid:=auth.uid(); v_invite public.friend_invites%rowtype;
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'invalid_idempotency_key'; end if;
  select * into v_invite from public.friend_invites invite where invite.token_hash=p_token_hash for update;
  if not found or v_invite.inviter_user_id=v_caller then raise exception 'invite_not_found'; end if;
  if v_invite.status='declined' and v_invite.claimed_by_user_id=v_caller
      and v_invite.decision_idempotency_key=p_idempotency_key then return true; end if;
  if v_invite.status<>'pending' or v_invite.expires_at<=current_timestamp then raise exception 'invite_expired'; end if;
  update public.friend_invites set status='declined',claimed_by_user_id=v_caller,
    decision_idempotency_key=p_idempotency_key,responded_at=current_timestamp,updated_at=current_timestamp
    where id=v_invite.id;
  return true;
end;
$$;

create or replace function public.cancel_my_friend_invite(p_invite_id uuid,p_idempotency_key uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_caller uuid:=auth.uid(); v_invite public.friend_invites%rowtype;
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'invalid_idempotency_key'; end if;
  select * into v_invite from public.friend_invites invite where invite.id=p_invite_id and invite.inviter_user_id=v_caller for update;
  if not found then raise exception 'invite_not_found'; end if;
  if v_invite.status='cancelled' and v_invite.cancel_idempotency_key=p_idempotency_key then return true; end if;
  if v_invite.status<>'pending' then raise exception '%','invite_'||v_invite.status; end if;
  update public.friend_invites set status='cancelled',cancel_idempotency_key=p_idempotency_key,
    cancelled_at=current_timestamp,updated_at=current_timestamp where id=p_invite_id;
  return true;
end;
$$;

create or replace function public.get_my_friend_direct_messages_page(
  p_friend_user_id uuid,p_before_created_at timestamptz default null,p_before_message_id uuid default null,p_limit integer default 50
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_caller uuid:=auth.uid(); v_low uuid; v_high uuid; v_rows jsonb; v_next text; v_my uuid; v_peer uuid;
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_friend_user_id is null or p_friend_user_id=v_caller then raise exception 'invalid_friend_user_id'; end if;
  if (p_before_created_at is null)<>(p_before_message_id is null) then raise exception 'invalid_cursor'; end if;
  v_low:=least(v_caller,p_friend_user_id); v_high:=greatest(v_caller,p_friend_user_id);
  if not exists(select 1 from public.friendships friendship join public.friend_requests request
      on request.id=friendship.created_from_request_id where friendship.user_id=v_low
      and friendship.friend_user_id=v_high and friendship.status='active' and request.status = 'accepted'
      and request.receiver_user_id is not null and least(request.sender_user_id,request.receiver_user_id)=v_low
      and greatest(request.sender_user_id,request.receiver_user_id)=v_high)
    then raise exception 'active_friendship_required' using errcode='42501'; end if;
  with page as (
    select message.* from public.friend_direct_messages message
      where message.friendship_user_id=v_low and message.friendship_friend_user_id=v_high
        and (p_before_created_at is null or (message.created_at,message.id)<(p_before_created_at,p_before_message_id))
      order by message.created_at desc,message.id desc limit least(greatest(coalesce(p_limit,50),1),100)+1
  ), kept as (select * from page order by created_at desc,id desc limit least(greatest(coalesce(p_limit,50),1),100))
  select coalesce(jsonb_agg(jsonb_build_object('id',kept.id,'is_mine',kept.sender_user_id=v_caller,
      'body',kept.body,'created_at',kept.created_at) order by kept.created_at,kept.id),'[]'::jsonb),
    case when (select count(*) from page)>least(greatest(coalesce(p_limit,50),1),100)
      then (select quantum_private.friend_cursor(kept.created_at,kept.id) from kept order by kept.created_at,kept.id limit 1) end
    into v_rows,v_next from kept;
  select cursor.last_read_message_id into v_my from public.friend_direct_message_read_cursors cursor
    where cursor.friendship_user_id=v_low and cursor.friendship_friend_user_id=v_high and cursor.reader_user_id=v_caller;
  select cursor.last_read_message_id into v_peer from public.friend_direct_message_read_cursors cursor
    where cursor.friendship_user_id=v_low and cursor.friendship_friend_user_id=v_high and cursor.reader_user_id=p_friend_user_id;
  return jsonb_build_object('friend',jsonb_build_object('user_id',p_friend_user_id,
      'display_name',profile.display_name,'friend_recognition_name',profile.friend_recognition_name),
      'messages',v_rows,'next_cursor',v_next,'my_last_read_message_id',v_my,'peer_last_read_message_id',v_peer)
    from quantum_private.community_member_profiles profile where profile.user_id=p_friend_user_id;
end;
$$;

create or replace function public.get_my_friend_conversations(
  p_before_created_at timestamptz default null,p_before_friend_user_id uuid default null,p_limit integer default 30
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_caller uuid:=auth.uid(); v_rows jsonb; v_next text;
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if (p_before_created_at is null)<>(p_before_friend_user_id is null) then raise exception 'invalid_cursor'; end if;
  with eligible as (
    select friendship.user_id pair_low,friendship.friend_user_id pair_high,friendship.created_at,
      case when friendship.user_id=v_caller then friendship.friend_user_id else friendship.user_id end friend_user_id
    from public.friendships friendship join public.friend_requests request on request.id=friendship.created_from_request_id
    where v_caller in(friendship.user_id,friendship.friend_user_id) and friendship.status='active'
      and request.status = 'accepted' and request.receiver_user_id is not null
      and least(request.sender_user_id,request.receiver_user_id)=friendship.user_id
      and greatest(request.sender_user_id,request.receiver_user_id)=friendship.friend_user_id
  ), enriched as (
    select eligible.*,coalesce(latest.created_at,eligible.created_at) sort_at,
      latest.id message_id,latest.sender_user_id,latest.body,latest.created_at message_created_at,
      mine.last_read_message_id my_read,peer.last_read_message_id peer_read,
      coalesce((select count(*) from public.friend_direct_messages unread where unread.friendship_user_id=eligible.pair_low
        and unread.friendship_friend_user_id=eligible.pair_high and unread.sender_user_id<>v_caller
        and (mine.last_read_created_at is null or (unread.created_at,unread.id)>(mine.last_read_created_at,mine.last_read_message_id))),0) unread_count
    from eligible left join lateral (select message.* from public.friend_direct_messages message
      where message.friendship_user_id=eligible.pair_low and message.friendship_friend_user_id=eligible.pair_high
      order by message.created_at desc,message.id desc limit 1) latest on true
    left join public.friend_direct_message_read_cursors mine on mine.friendship_user_id=eligible.pair_low
      and mine.friendship_friend_user_id=eligible.pair_high and mine.reader_user_id=v_caller
    left join public.friend_direct_message_read_cursors peer on peer.friendship_user_id=eligible.pair_low
      and peer.friendship_friend_user_id=eligible.pair_high and peer.reader_user_id=eligible.friend_user_id
  ), page as (select * from enriched where p_before_created_at is null
      or (sort_at,friend_user_id)<(p_before_created_at,p_before_friend_user_id)
      order by sort_at desc,friend_user_id desc limit least(greatest(coalesce(p_limit,30),1),100)+1),
  kept as (select * from page order by sort_at desc,friend_user_id desc limit least(greatest(coalesce(p_limit,30),1),100))
  select coalesce(jsonb_agg(jsonb_build_object('friend',jsonb_build_object('user_id',kept.friend_user_id,
      'display_name',profile.display_name,'friend_recognition_name',profile.friend_recognition_name,'photo_url',null),
      'last_message',case when kept.message_id is null then null else jsonb_build_object('id',kept.message_id,
        'is_mine',kept.sender_user_id=v_caller,'body',kept.body,'created_at',kept.message_created_at) end,
      'unread_count',kept.unread_count,'my_last_read_message_id',kept.my_read,'peer_last_read_message_id',kept.peer_read)
      order by kept.sort_at desc,kept.friend_user_id desc),'[]'::jsonb),
    case when (select count(*) from page)>least(greatest(coalesce(p_limit,30),1),100)
      then (select quantum_private.friend_cursor(kept.sort_at,kept.friend_user_id) from kept order by kept.sort_at,kept.friend_user_id limit 1) end
    into v_rows,v_next from kept join quantum_private.community_member_profiles profile on profile.user_id=kept.friend_user_id;
  return jsonb_build_object('conversations',v_rows,'next_cursor',v_next);
end;
$$;

create or replace function public.mark_my_friend_direct_messages_read(p_friend_user_id uuid,p_last_message_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_caller uuid:=auth.uid(); v_low uuid; v_high uuid; v_message public.friend_direct_messages%rowtype;
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  v_low:=least(v_caller,p_friend_user_id); v_high:=greatest(v_caller,p_friend_user_id);
  if not exists(select 1 from public.friendships friendship join public.friend_requests request
      on request.id=friendship.created_from_request_id where friendship.user_id=v_low
      and friendship.friend_user_id=v_high and friendship.status='active' and request.status = 'accepted'
      and request.receiver_user_id is not null and least(request.sender_user_id,request.receiver_user_id)=v_low
      and greatest(request.sender_user_id,request.receiver_user_id)=v_high)
    then raise exception 'active_friendship_required' using errcode='42501'; end if;
  select * into v_message from public.friend_direct_messages message where message.id=p_last_message_id
    and message.friendship_user_id=v_low and message.friendship_friend_user_id=v_high;
  if not found then raise exception 'message_not_found'; end if;
  insert into public.friend_direct_message_read_cursors(friendship_user_id,friendship_friend_user_id,reader_user_id,
      last_read_message_id,last_read_created_at) values(v_low,v_high,v_caller,v_message.id,v_message.created_at)
    on conflict(friendship_user_id,friendship_friend_user_id,reader_user_id) do update
      set last_read_message_id=excluded.last_read_message_id,last_read_created_at=excluded.last_read_created_at,
        updated_at=current_timestamp
      where (public.friend_direct_message_read_cursors.last_read_created_at,
        public.friend_direct_message_read_cursors.last_read_message_id)<(excluded.last_read_created_at,excluded.last_read_message_id);
  return true;
end;
$$;

revoke all on function quantum_private.friend_cursor(timestamptz,uuid) from public,anon,authenticated,service_role;
revoke all on function quantum_private.bump_friend_conversation_revision() from public,anon,authenticated,service_role;
revoke all on function public.get_my_friend_recognition_name() from public,anon,authenticated,service_role;
revoke all on function public.set_my_friend_recognition_name(text) from public,anon,authenticated,service_role;
revoke all on function public.complete_minimum_signup_with_friend_name(uuid,text,text,date,text,text,text,integer,text,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.create_my_friend_invite(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_my_friend_invites() from public,anon,authenticated,service_role;
revoke all on function public.preview_friend_invite(text) from public,anon,authenticated,service_role;
revoke all on function public.accept_friend_invite(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.decline_friend_invite(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.cancel_my_friend_invite(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_my_friend_direct_messages_page(uuid,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.get_my_friend_conversations(timestamptz,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.mark_my_friend_direct_messages_read(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_friend_recognition_name() to authenticated;
grant execute on function public.set_my_friend_recognition_name(text) to authenticated;
grant execute on function public.complete_minimum_signup_with_friend_name(uuid,text,text,date,text,text,text,integer,text,text,integer) to service_role;
grant execute on function public.create_my_friend_invite(text,uuid) to authenticated;
grant execute on function public.get_my_friend_invites() to authenticated;
grant execute on function public.preview_friend_invite(text) to authenticated;
grant execute on function public.accept_friend_invite(text,uuid) to authenticated;
grant execute on function public.decline_friend_invite(text,uuid) to authenticated;
grant execute on function public.cancel_my_friend_invite(uuid,uuid) to authenticated;
grant execute on function public.get_my_friend_direct_messages_page(uuid,timestamptz,uuid,integer) to authenticated;
grant execute on function public.get_my_friend_conversations(timestamptz,uuid,integer) to authenticated;
grant execute on function public.mark_my_friend_direct_messages_read(uuid,uuid) to authenticated;
-- END SOURCE g1-g2-schema.sql

-- BEGIN SOURCE g3-g4-schema.sql
-- G3/G4 integration draft. Parent must copy this forward-only contract into a
-- timestamped migration after cross-lane review. This file is never applied by
-- the app and intentionally performs no remote action.


create or replace function quantum_private.canonical_department_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(p_value), '[[:space:]]+', '', 'g')),
    ''
  )
  where p_value is not null
    and pg_catalog.char_length(pg_catalog.btrim(p_value)) between 1 and 120
$$;

create or replace function quantum_private.canonical_school_scope_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(p_value), '[[:space:]]+', '', 'g')),
    ''
  )
  where p_value is not null
    and pg_catalog.char_length(pg_catalog.btrim(p_value)) between 1 and 120
$$;

create or replace function quantum_private.get_member_department_identity(p_user_id uuid)
returns table (school_scope_key text, department_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    quantum_private.canonical_school_scope_key(member.school_scope),
    quantum_private.canonical_department_key(member.department)
  from quantum_private.community_member_profiles as member
  cross join lateral quantum_private.resolve_profile_readiness(p_user_id) as readiness
  where member.user_id = p_user_id
    and readiness.minimum_signup_complete
    and member.school_scope = 'pnu_self_selected'
    and quantum_private.canonical_school_scope_key(member.school_scope) is not null
    and quantum_private.canonical_department_key(member.department) is not null
$$;

create or replace function quantum_private.get_member_department_key(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select identity.department_key
  from quantum_private.get_member_department_identity(p_user_id) as identity
$$;

revoke all on function quantum_private.canonical_department_key(text)
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.canonical_school_scope_key(text)
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.get_member_department_identity(uuid)
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.get_member_department_key(uuid)
  from public, anon, authenticated, service_role;

-- Snapshot the allocation identity. Historical terminal rows may remain null;
-- every new row and every currently allocatable row must have both keys.
alter table quantum_private.tonight_applicant_features
  add column if not exists school_scope_key text,
  add column if not exists department_key text;

update quantum_private.tonight_applicant_features as feature
set (school_scope_key, department_key) = (
  select identity.school_scope_key, identity.department_key
  from quantum_private.get_member_department_identity(feature.user_id) as identity
)
where feature.school_scope_key is null or feature.department_key is null;

do $$
begin
  if exists (
    select 1
    from public.tonight_applications as application_row
    join quantum_private.tonight_applicant_features as feature
      on feature.application_id = application_row.id
    where application_row.status in ('submitted', 'waitlisted', 'allocated')
      and (feature.school_scope_key is null or feature.department_key is null)
  ) then
    raise exception 'active_tonight_department_snapshot_missing';
  end if;
end
$$;

alter table quantum_private.tonight_applicant_features
  drop constraint if exists tonight_applicant_features_school_scope_key_check,
  drop constraint if exists tonight_applicant_features_department_key_check;
alter table quantum_private.tonight_applicant_features
  add constraint tonight_applicant_features_school_scope_key_check check (
    school_scope_key is null
    or quantum_private.canonical_school_scope_key(school_scope_key) = school_scope_key
  ),
  add constraint tonight_applicant_features_department_key_check check (
    department_key is null
    or quantum_private.canonical_department_key(department_key) = department_key
  );

create or replace function quantum_private.capture_tonight_department_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity record;
begin
  select identity.* into v_identity
  from quantum_private.get_member_department_identity(new.user_id) as identity;
  if not found then raise exception 'department_identity_required'; end if;
  new.school_scope_key := v_identity.school_scope_key;
  new.department_key := v_identity.department_key;
  return new;
end
$$;

create or replace function quantum_private.guard_department_snapshot_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.school_scope_key is distinct from old.school_scope_key
     or new.department_key is distinct from old.department_key then
    raise exception 'department_snapshot_immutable';
  end if;
  return new;
end
$$;

revoke all on function quantum_private.capture_tonight_department_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function quantum_private.guard_department_snapshot_immutable()
  from public, anon, authenticated, service_role;

drop trigger if exists tonight_applicant_features_capture_department
  on quantum_private.tonight_applicant_features;
create trigger tonight_applicant_features_capture_department
  before insert on quantum_private.tonight_applicant_features
  for each row execute function quantum_private.capture_tonight_department_snapshot();

drop trigger if exists tonight_applicant_features_department_immutable
  on quantum_private.tonight_applicant_features;
create trigger tonight_applicant_features_department_immutable
  before update of school_scope_key, department_key
  on quantum_private.tonight_applicant_features
  for each row execute function quantum_private.guard_department_snapshot_immutable();

alter table public.quantum_weekly_activity_windows
  add column if not exists school_scope_key text;
update public.quantum_weekly_activity_windows
set school_scope_key = 'pnu_self_selected'
where school_scope_key is null;
alter table public.quantum_weekly_activity_windows
  alter column school_scope_key set default 'pnu_self_selected',
  alter column school_scope_key set not null,
  drop constraint if exists quantum_weekly_activity_windows_school_scope_key_check;
alter table public.quantum_weekly_activity_windows
  add constraint quantum_weekly_activity_windows_school_scope_key_check check (
    quantum_private.canonical_school_scope_key(school_scope_key) = school_scope_key
  );

alter table public.quantum_weekly_application_members
  add column if not exists school_scope_key text,
  add column if not exists department_key text;

update public.quantum_weekly_application_members as member
set (school_scope_key, department_key) = (
  select identity.school_scope_key, identity.department_key
  from quantum_private.get_member_department_identity(member.participant_user_id) as identity
)
where member.school_scope_key is null or member.department_key is null;

do $$
begin
  if exists (
    select 1
    from public.quantum_weekly_application_members as member
    where member.lifecycle_status in ('awaiting_consents', 'active', 'assigned')
      and (member.school_scope_key is null or member.department_key is null)
  ) then
    raise exception 'active_weekly_department_snapshot_missing';
  end if;
end
$$;

create or replace function quantum_private.capture_weekly_department_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity record;
begin
  select identity.* into v_identity
  from quantum_private.get_member_department_identity(new.participant_user_id) as identity;
  if not found then raise exception 'department_identity_required'; end if;
  new.school_scope_key := v_identity.school_scope_key;
  new.department_key := v_identity.department_key;
  return new;
end
$$;

revoke all on function quantum_private.capture_weekly_department_snapshot()
  from public, anon, authenticated, service_role;

drop trigger if exists quantum_weekly_members_capture_department
  on public.quantum_weekly_application_members;
create trigger quantum_weekly_members_capture_department
  before insert on public.quantum_weekly_application_members
  for each row execute function quantum_private.capture_weekly_department_snapshot();

drop trigger if exists quantum_weekly_members_department_immutable
  on public.quantum_weekly_application_members;
create trigger quantum_weekly_members_department_immutable
  before update of school_scope_key, department_key
  on public.quantum_weekly_application_members
  for each row execute function quantum_private.guard_department_snapshot_immutable();

-- Enrich the existing reviewed service payload without duplicating its body.
alter function public.service_get_tonight_allocator_input(uuid)
  set schema quantum_private;
alter function quantum_private.service_get_tonight_allocator_input(uuid)
  rename to service_get_tonight_allocator_input_impl_20260903102500;
revoke all on function quantum_private.service_get_tonight_allocator_input_impl_20260903102500(uuid)
  from public, anon, authenticated, service_role;

create function public.service_get_tonight_allocator_input(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_applications jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  v_payload := quantum_private.service_get_tonight_allocator_input_impl_20260903102500(p_round_id);
  select coalesce(pg_catalog.jsonb_agg(
    application.value || pg_catalog.jsonb_build_object(
      'school_scope_key', feature.school_scope_key,
      'department_key', feature.department_key
    ) order by application.ordinality
  ), '[]'::jsonb)
  into v_applications
  from pg_catalog.jsonb_array_elements(v_payload -> 'applications')
    with ordinality as application(value, ordinality)
  join quantum_private.tonight_applicant_features as feature
    on feature.application_id = (application.value ->> 'application_id')::uuid
  where feature.school_scope_key is not null and feature.department_key is not null;
  if pg_catalog.jsonb_array_length(v_applications)
     <> pg_catalog.jsonb_array_length(v_payload -> 'applications') then
    raise exception 'application_department_snapshot_missing';
  end if;
  return pg_catalog.jsonb_set(v_payload, '{applications}', v_applications, false);
end
$$;

revoke all on function public.service_get_tonight_allocator_input(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.service_get_tonight_allocator_input(uuid)
  to service_role;

create or replace function quantum_private.assert_tonight_department_assignments(
  p_round_id uuid,
  p_team_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team jsonb;
  v_member_ids uuid[];
begin
  if p_team_assignments is null or pg_catalog.jsonb_typeof(p_team_assignments) <> 'array' then
    raise exception 'team_assignments_required';
  end if;
  for v_team in select value from pg_catalog.jsonb_array_elements(p_team_assignments)
  loop
    if pg_catalog.jsonb_typeof(v_team -> 'application_ids') <> 'array' then
      raise exception 'invalid_team_member';
    end if;
    select pg_catalog.array_agg(member_id::uuid order by ordinality)
    into v_member_ids
    from pg_catalog.jsonb_array_elements_text(v_team -> 'application_ids')
      with ordinality as member(member_id, ordinality);
    if v_member_ids is null then raise exception 'invalid_team_member'; end if;
    if (
      select pg_catalog.count(*)
      from public.tonight_applications as application_row
      join quantum_private.tonight_applicant_features as feature
        on feature.application_id = application_row.id
      where application_row.round_id = p_round_id
        and application_row.id = any(v_member_ids)
        and feature.school_scope_key is not null
        and feature.department_key is not null
    ) <> pg_catalog.cardinality(v_member_ids) then
      raise exception 'application_department_snapshot_missing';
    end if;
    if exists (
      select 1
      from public.tonight_applications as left_application
      join quantum_private.tonight_applicant_features as left_feature
        on left_feature.application_id = left_application.id
      join public.tonight_applications as right_application
        on right_application.id = any(v_member_ids)
       and right_application.id > left_application.id
       and right_application.round_id = left_application.round_id
      join quantum_private.tonight_applicant_features as right_feature
        on right_feature.application_id = right_application.id
      where left_application.round_id = p_round_id
        and left_application.id = any(v_member_ids)
        and left_application.bundle_id <> right_application.bundle_id
        and left_feature.school_scope_key = right_feature.school_scope_key
        and left_feature.department_key = right_feature.department_key
    ) then
      raise exception 'same_department_random_unit';
    end if;
  end loop;
end
$$;

revoke all on function quantum_private.assert_tonight_department_assignments(uuid, jsonb)
  from public, anon, authenticated, service_role;

alter function public.service_publish_tonight_allocation(uuid, integer, jsonb, text)
  set schema quantum_private;
alter function quantum_private.service_publish_tonight_allocation(uuid, integer, jsonb, text)
  rename to service_publish_tonight_allocation_impl_20260902201247;
revoke all on function quantum_private.service_publish_tonight_allocation_impl_20260902201247(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;

create function public.service_publish_tonight_allocation(
  p_round_id uuid,
  p_expected_revision integer,
  p_team_assignments jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  perform quantum_private.assert_tonight_department_assignments(p_round_id, p_team_assignments);
  return quantum_private.service_publish_tonight_allocation_impl_20260902201247(
    p_round_id, p_expected_revision, p_team_assignments, p_idempotency_key
  );
end
$$;

revoke all on function public.service_publish_tonight_allocation(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_publish_tonight_allocation(uuid, integer, jsonb, text)
  to service_role;

alter function public.super_admin_publish_tonight_allocation(uuid, integer, jsonb, text)
  set schema quantum_private;
alter function quantum_private.super_admin_publish_tonight_allocation(uuid, integer, jsonb, text)
  rename to super_admin_publish_tonight_allocation_impl_20260902201247;
revoke all on function quantum_private.super_admin_publish_tonight_allocation_impl_20260902201247(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;

create function public.super_admin_publish_tonight_allocation(
  p_round_id uuid,
  p_expected_revision integer,
  p_team_assignments jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  perform quantum_private.assert_tonight_department_assignments(p_round_id, p_team_assignments);
  return quantum_private.super_admin_publish_tonight_allocation_impl_20260902201247(
    p_round_id, p_expected_revision, p_team_assignments, p_idempotency_key
  );
end
$$;

revoke all on function public.super_admin_publish_tonight_allocation(uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.super_admin_publish_tonight_allocation(uuid, integer, jsonb, text)
  to authenticated;

create or replace function public.get_my_tonight_participation_summary(p_round_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_scope_key text;
  v_total integer;
  v_male integer;
  v_female integer;
  v_other integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select identity.school_scope_key into v_school_scope_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_school_scope_key is null then raise exception 'minimum_signup_required'; end if;
  if not exists (
    select 1
    from public.tonight_rounds as round_row
    where round_row.id = p_round_id
      and round_row.market_code = 'PNU'
      and v_school_scope_key = 'pnu_self_selected'
      and (
        exists (
          select 1
          from public.tonight_market_memberships as membership
          where membership.market_code = round_row.market_code
            and membership.user_id = v_actor
            and membership.revoked_at is null
        )
        or exists (
          select 1
          from public.tonight_applications as mine
          where mine.round_id = round_row.id
            and mine.user_id = v_actor
        )
      )
  ) then raise exception 'tonight_market_membership_required'; end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where member.community_gender = 'male')::integer,
    pg_catalog.count(*) filter (where member.community_gender = 'female')::integer,
    pg_catalog.count(*) filter (
      where member.community_gender not in ('male', 'female') or member.community_gender is null
    )::integer
  into v_total, v_male, v_female, v_other
  from public.tonight_applications as application_row
  join quantum_private.tonight_applicant_features as feature
    on feature.application_id = application_row.id
   and feature.school_scope_key = v_school_scope_key
  left join quantum_private.community_member_profiles as member
    on member.user_id = application_row.user_id
  where application_row.round_id = p_round_id
    and application_row.status in ('submitted', 'waitlisted', 'allocated');

  return pg_catalog.jsonb_build_object(
    'scopeId', 'tonight:' || p_round_id::text,
    'asOf', current_timestamp,
    'totalPeople', v_total,
    'genderBreakdown', pg_catalog.jsonb_build_object(
      'malePeople', v_male,
      'femalePeople', v_female,
      'otherOrUnspecifiedPeople', v_other
    ),
    'disclosureBasis', 'all_valid_participants',
    'policyVersion', '2026-09-07-mandatory-aggregate-v1',
    'basis', 'valid_applicants'
  );
end
$$;

revoke all on function public.get_my_tonight_participation_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_tonight_participation_summary(uuid)
  to authenticated;

-- Add exact active demand to each authorized weekly window while retaining the
-- existing assigned_count from the reviewed discovery payload.
alter function public.get_my_weekly_activity_discovery_v2(date)
  set schema quantum_private;
alter function quantum_private.get_my_weekly_activity_discovery_v2(date)
  rename to get_my_weekly_activity_discovery_v2_impl_20260906114007;
revoke all on function quantum_private.get_my_weekly_activity_discovery_v2_impl_20260906114007(date)
  from public, anon, authenticated, service_role;

create function public.get_my_weekly_activity_discovery_v2(p_week_key date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_scope_key text;
  v_payload jsonb;
  v_windows jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select identity.school_scope_key into v_school_scope_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_school_scope_key is null then raise exception 'minimum_signup_required'; end if;
  v_payload := quantum_private.get_my_weekly_activity_discovery_v2_impl_20260906114007(p_week_key);
  select coalesce(pg_catalog.jsonb_agg(
    activity_window.value || pg_catalog.jsonb_build_object(
      'assigned_count', activity_window.value -> 'assigned_count',
      'applicant_count', (
        select pg_catalog.count(*)::integer
        from public.quantum_weekly_application_candidates as candidate
        join public.quantum_weekly_applications as application_row
          on application_row.id = candidate.application_id
         and application_row.status = 'active'
        join public.quantum_weekly_application_members as member
          on member.application_id = application_row.id
         and member.consent_status = 'accepted'
         and member.lifecycle_status = 'active'
         and member.school_scope_key = v_school_scope_key
        where candidate.window_id = window_row.id
          and application_row.party_size = (
            select pg_catalog.count(*)::integer
            from public.quantum_weekly_application_members as complete_member
            where complete_member.application_id = application_row.id
              and complete_member.consent_status = 'accepted'
              and complete_member.lifecycle_status = 'active'
              and complete_member.school_scope_key = v_school_scope_key
              and complete_member.department_key is not null
          )
      )
    ) order by activity_window.ordinality
  ), '[]'::jsonb)
  into v_windows
  from pg_catalog.jsonb_array_elements(v_payload -> 'windows')
    with ordinality as activity_window(value, ordinality)
  join public.quantum_weekly_activity_windows as window_row
    on window_row.id = (activity_window.value ->> 'id')::uuid
   and window_row.school_scope_key = v_school_scope_key;
  return pg_catalog.jsonb_set(v_payload, '{windows}', v_windows, false);
end
$$;

revoke all on function public.get_my_weekly_activity_discovery_v2(date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_weekly_activity_discovery_v2(date)
  to authenticated;

create table quantum_private.weekly_allocation_operator_grants (
  operator_user_id uuid not null references public.users(id) on delete restrict,
  school_scope_key text not null,
  capability text not null check (
    capability in ('weekly_allocation:review', 'weekly_allocation:execute')
  ),
  granted_by uuid not null references public.users(id) on delete restrict,
  revoked_by uuid references public.users(id) on delete restrict,
  granted_at timestamptz not null default current_timestamp,
  revoked_at timestamptz,
  revision integer not null default 0 check (revision >= 0),
  last_idempotency_key uuid not null,
  last_request_hash text not null check (last_request_hash ~ '^[0-9a-f]{32}$'),
  primary key (operator_user_id, school_scope_key, capability),
  check ((revoked_by is null) = (revoked_at is null)),
  check (quantum_private.canonical_school_scope_key(school_scope_key) = school_scope_key)
);

create table quantum_private.weekly_allocation_proposals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_scope_key text not null,
  week_key date not null check (extract(isodow from week_key) = 1),
  window_id uuid not null references public.quantum_weekly_activity_windows(id) on delete restrict,
  window_revision integer not null check (window_revision >= 0),
  assignment_plan jsonb not null check (pg_catalog.jsonb_typeof(assignment_plan) = 'array'),
  input_snapshot_hash text not null check (input_snapshot_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (
    status in ('proposed', 'in_review', 'executing', 'completed', 'rejected', 'stale', 'failed')
  ),
  revision integer not null default 0 check (revision >= 0),
  created_by uuid references public.users(id) on delete restrict,
  reviewed_by uuid references public.users(id) on delete restrict,
  execute_requested_by uuid references public.users(id) on delete restrict,
  create_idempotency_key uuid not null unique,
  execute_idempotency_key uuid unique,
  receipt jsonb,
  error_code text,
  created_at timestamptz not null default current_timestamp,
  reviewed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default current_timestamp,
  check (quantum_private.canonical_school_scope_key(school_scope_key) = school_scope_key),
  check (receipt is null or pg_catalog.jsonb_typeof(receipt) = 'object')
);

create table quantum_private.weekly_allocation_proposal_commands (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references quantum_private.weekly_allocation_proposals(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('operator', 'service')),
  action text not null check (action in ('review', 'reject', 'execute', 'complete', 'fail')),
  prior_revision integer not null check (prior_revision >= 0),
  resulting_revision integer not null check (resulting_revision >= prior_revision),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default current_timestamp,
  unique (actor_kind, idempotency_key)
);

create table quantum_private.weekly_allocation_operator_grant_commands (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  operator_user_id uuid not null references public.users(id) on delete restrict,
  school_scope_key text not null,
  capability text not null check (
    capability in ('weekly_allocation:review', 'weekly_allocation:execute')
  ),
  enabled boolean not null,
  resulting_revision integer not null check (resulting_revision >= 0),
  idempotency_key uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default current_timestamp,
  check (quantum_private.canonical_school_scope_key(school_scope_key) = school_scope_key)
);

alter table quantum_private.weekly_allocation_operator_grants enable row level security;
alter table quantum_private.weekly_allocation_proposals enable row level security;
alter table quantum_private.weekly_allocation_proposal_commands enable row level security;
alter table quantum_private.weekly_allocation_operator_grant_commands enable row level security;
revoke all on table quantum_private.weekly_allocation_operator_grants
  from public, anon, authenticated, service_role;
revoke all on table quantum_private.weekly_allocation_proposals
  from public, anon, authenticated, service_role;
revoke all on table quantum_private.weekly_allocation_proposal_commands
  from public, anon, authenticated, service_role;
revoke all on table quantum_private.weekly_allocation_operator_grant_commands
  from public, anon, authenticated, service_role;
revoke all on sequence quantum_private.weekly_allocation_proposal_commands_id_seq
  from public, anon, authenticated, service_role;
revoke all on sequence quantum_private.weekly_allocation_operator_grant_commands_id_seq
  from public, anon, authenticated, service_role;

create or replace function quantum_private.require_weekly_allocation_capability(
  p_actor uuid,
  p_school_scope_key text,
  p_capability text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1
    from quantum_private.weekly_allocation_operator_grants as grant_row
    where grant_row.operator_user_id = p_actor
      and grant_row.school_scope_key = p_school_scope_key
      and grant_row.capability = p_capability
      and grant_row.revoked_at is null
  ) then raise exception 'weekly_allocation_scope_required'; end if;
end
$$;

revoke all on function quantum_private.require_weekly_allocation_capability(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.super_admin_get_weekly_allocation_operator_grant(
  p_operator_user_id uuid,
  p_school_scope_key text,
  p_capability text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_scope text := quantum_private.canonical_school_scope_key(p_school_scope_key);
  v_grant quantum_private.weekly_allocation_operator_grants%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_operator_user_id is null
     or v_scope is null or v_scope is distinct from p_school_scope_key
     or p_capability not in ('weekly_allocation:review', 'weekly_allocation:execute') then
    raise exception 'invalid_weekly_allocation_grant';
  end if;
  select grant_row.* into v_grant
  from quantum_private.weekly_allocation_operator_grants as grant_row
  where grant_row.operator_user_id = p_operator_user_id
    and grant_row.school_scope_key = v_scope
    and grant_row.capability = p_capability;
  return pg_catalog.jsonb_build_object(
    'operator_user_id', p_operator_user_id,
    'school_scope_key', v_scope,
    'capability', p_capability,
    'enabled', found and v_grant.revoked_at is null,
    'revision', case when found then v_grant.revision else 0 end
  );
end
$$;

revoke all on function public.super_admin_get_weekly_allocation_operator_grant(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.super_admin_get_weekly_allocation_operator_grant(uuid, text, text)
  to authenticated;

create or replace function public.super_admin_set_weekly_allocation_operator_grant(
  p_operator_user_id uuid,
  p_school_scope_key text,
  p_capability text,
  p_enabled boolean,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_scope text := quantum_private.canonical_school_scope_key(p_school_scope_key);
  v_hash text;
  v_existing quantum_private.weekly_allocation_operator_grants%rowtype;
  v_command quantum_private.weekly_allocation_operator_grant_commands%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not public.is_super_admin(v_actor) then raise exception 'super_admin_required'; end if;
  perform quantum_private.require_recent_super_admin_auth(v_actor);
  if p_operator_user_id is null or p_enabled is null
     or v_scope is null or v_scope is distinct from p_school_scope_key
     or p_capability not in ('weekly_allocation:review', 'weekly_allocation:execute')
     or p_expected_revision is null or p_expected_revision < 0
     or p_idempotency_key is null then
    raise exception 'invalid_weekly_allocation_grant';
  end if;
  v_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'operator_user_id', p_operator_user_id,
    'school_scope_key', v_scope,
    'capability', p_capability,
    'enabled', p_enabled,
    'expected_revision', p_expected_revision
  )::text);
  select command.* into v_command
  from quantum_private.weekly_allocation_operator_grant_commands as command
  where command.idempotency_key = p_idempotency_key;
  if found then
    if v_command.actor_user_id <> v_actor or v_command.request_hash <> v_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'operator_user_id', v_command.operator_user_id,
      'school_scope_key', v_command.school_scope_key,
      'capability', v_command.capability,
      'enabled', v_command.enabled,
      'revision', v_command.resulting_revision,
      'replayed', true
    );
  end if;

  select grant_row.* into v_existing
  from quantum_private.weekly_allocation_operator_grants as grant_row
  where grant_row.operator_user_id = p_operator_user_id
    and grant_row.school_scope_key = v_scope
    and grant_row.capability = p_capability
  for update;
  if (found and v_existing.revision <> p_expected_revision)
     or (not found and (p_expected_revision <> 0 or not p_enabled)) then
    raise exception 'stale_weekly_allocation_grant';
  end if;

  insert into quantum_private.weekly_allocation_operator_grants (
    operator_user_id, school_scope_key, capability, granted_by, revoked_by,
    granted_at, revoked_at, revision, last_idempotency_key, last_request_hash
  ) values (
    p_operator_user_id, v_scope, p_capability, v_actor,
    case when p_enabled then null else v_actor end,
    current_timestamp, case when p_enabled then null else current_timestamp end,
    p_expected_revision + 1, p_idempotency_key, v_hash
  )
  on conflict (operator_user_id, school_scope_key, capability) do update
  set granted_by = case when p_enabled then v_actor else quantum_private.weekly_allocation_operator_grants.granted_by end,
      granted_at = case when p_enabled then current_timestamp else quantum_private.weekly_allocation_operator_grants.granted_at end,
      revoked_by = case when p_enabled then null else v_actor end,
      revoked_at = case when p_enabled then null else current_timestamp end,
      revision = p_expected_revision + 1,
      last_idempotency_key = p_idempotency_key,
      last_request_hash = v_hash;

  insert into quantum_private.weekly_allocation_operator_grant_commands (
    actor_user_id, operator_user_id, school_scope_key, capability, enabled,
    resulting_revision, idempotency_key, request_hash
  ) values (
    v_actor, p_operator_user_id, v_scope, p_capability, p_enabled,
    p_expected_revision + 1, p_idempotency_key, v_hash
  );
  return pg_catalog.jsonb_build_object(
    'operator_user_id', p_operator_user_id,
    'school_scope_key', v_scope,
    'capability', p_capability,
    'enabled', p_enabled,
    'revision', p_expected_revision + 1,
    'replayed', false
  );
end
$$;

revoke all on function public.super_admin_set_weekly_allocation_operator_grant(uuid, text, text, boolean, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.super_admin_set_weekly_allocation_operator_grant(uuid, text, text, boolean, integer, uuid)
  to authenticated;

create or replace function public.service_get_weekly_allocator_input(p_window_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_window public.quantum_weekly_activity_windows%rowtype;
  v_applications jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  select activity_window.* into v_window
  from public.quantum_weekly_activity_windows as activity_window
  where activity_window.id = p_window_id;
  if not found
     or v_window.status <> 'recruiting'
     or v_window.application_closes_at > current_timestamp
     or v_window.starts_at <= current_timestamp then
    raise exception 'weekly_allocation_snapshot_stale';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'application_id', application_row.id,
    'revision', application_row.revision,
    'party_size', application_row.party_size,
    'accepted_member_count', application_row.party_size,
    'members', (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'participant_user_id', member.participant_user_id,
        'gender', member.gender_snapshot,
        'school_scope_key', member.school_scope_key,
        'department_key', member.department_key
      ) order by member.participant_user_id)
      from public.quantum_weekly_application_members as member
      where member.application_id = application_row.id
        and member.consent_status = 'accepted'
        and member.lifecycle_status = 'active'
    )
  ) order by application_row.id), '[]'::jsonb)
  into v_applications
  from public.quantum_weekly_applications as application_row
  join public.quantum_weekly_application_candidates as candidate
    on candidate.application_id = application_row.id
   and candidate.window_id = v_window.id
  where application_row.status = 'active'
    and application_row.party_size = (
      select pg_catalog.count(*)::integer
      from public.quantum_weekly_application_members as member
      where member.application_id = application_row.id
        and member.consent_status = 'accepted'
        and member.lifecycle_status = 'active'
        and member.school_scope_key = v_window.school_scope_key
        and member.department_key is not null
    );

  return pg_catalog.jsonb_build_object(
    'server_now', current_timestamp,
    'window', pg_catalog.jsonb_build_object(
      'window_id', v_window.id,
      'revision', v_window.revision,
      'school_scope_key', v_window.school_scope_key,
      'capacity', v_window.capacity
    ),
    'applications', v_applications
  );
end
$$;

revoke all on function public.service_get_weekly_allocator_input(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.service_get_weekly_allocator_input(uuid)
  to service_role;

create or replace function public.service_create_weekly_allocation_proposal(
  p_window_id uuid,
  p_expected_window_revision integer,
  p_school_scope_key text,
  p_assignment_plan jsonb,
  p_input_snapshot_hash text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text := quantum_private.canonical_school_scope_key(p_school_scope_key);
  v_window public.quantum_weekly_activity_windows%rowtype;
  v_existing quantum_private.weekly_allocation_proposals%rowtype;
  v_proposal_id uuid;
  v_application_count integer;
  v_unique_application_count integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_window_id is null
     or p_expected_window_revision is null or p_expected_window_revision < 0
     or v_scope is null or v_scope is distinct from p_school_scope_key
     or pg_catalog.jsonb_typeof(p_assignment_plan) <> 'array'
     or pg_catalog.jsonb_array_length(p_assignment_plan) < 1
     or p_input_snapshot_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null then
    raise exception 'invalid_weekly_allocation_proposal';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_assignment_plan) as room(value)
    where pg_catalog.jsonb_typeof(room.value) <> 'object'
       or pg_catalog.jsonb_typeof(room.value -> 'applications') <> 'array'
       or pg_catalog.jsonb_array_length(room.value -> 'applications') < 1
       or exists (
         select 1
         from pg_catalog.jsonb_array_elements(room.value -> 'applications') as application(value)
         where (application.value ->> 'application_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            or (application.value ->> 'expected_revision') !~ '^[0-9]+$'
            or (application.value ->> 'assignment_idempotency_key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       )
  ) then raise exception 'invalid_weekly_assignment_plan'; end if;

  select pg_catalog.count(*)::integer,
         pg_catalog.count(distinct application.value ->> 'application_id')::integer
  into v_application_count, v_unique_application_count
  from pg_catalog.jsonb_array_elements(p_assignment_plan) as room(value)
  cross join lateral pg_catalog.jsonb_array_elements(room.value -> 'applications') as application(value);
  if v_application_count <> v_unique_application_count then
    raise exception 'duplicate_weekly_application_assignment';
  end if;

  select proposal.* into v_existing
  from quantum_private.weekly_allocation_proposals as proposal
  where proposal.create_idempotency_key = p_idempotency_key;
  if found then
    if v_existing.window_id <> p_window_id
       or v_existing.window_revision <> p_expected_window_revision
       or v_existing.school_scope_key <> v_scope
       or v_existing.assignment_plan <> p_assignment_plan
       or v_existing.input_snapshot_hash <> p_input_snapshot_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'proposal_id', v_existing.id, 'status', v_existing.status,
      'revision', v_existing.revision, 'replayed', true
    );
  end if;

  select activity_window.* into v_window
  from public.quantum_weekly_activity_windows as activity_window
  where activity_window.id = p_window_id for update;
  if not found
     or v_window.revision <> p_expected_window_revision
     or v_window.school_scope_key <> v_scope
     or v_window.status <> 'recruiting'
     or v_window.application_closes_at > current_timestamp
     or v_window.starts_at <= current_timestamp then
    raise exception 'weekly_allocation_snapshot_stale';
  end if;
  v_proposal_id := pg_catalog.gen_random_uuid();
  insert into quantum_private.weekly_allocation_proposals (
    id, school_scope_key, week_key, window_id, window_revision,
    assignment_plan, input_snapshot_hash, status, revision,
    created_by, create_idempotency_key
  ) values (
    v_proposal_id, v_scope, v_window.week_key, v_window.id, v_window.revision,
    p_assignment_plan, p_input_snapshot_hash, 'proposed', 0,
    null, p_idempotency_key
  );
  return pg_catalog.jsonb_build_object(
    'proposal_id', v_proposal_id, 'status', 'proposed',
    'revision', 0, 'replayed', false
  );
end
$$;

revoke all on function public.service_create_weekly_allocation_proposal(uuid, integer, text, jsonb, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.service_create_weekly_allocation_proposal(uuid, integer, text, jsonb, text, uuid)
  to service_role;

create or replace function public.operator_get_weekly_allocation_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_proposal quantum_private.weekly_allocation_proposals%rowtype;
  v_window public.quantum_weekly_activity_windows%rowtype;
  v_room_count integer;
  v_people_count integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select proposal.* into v_proposal
  from quantum_private.weekly_allocation_proposals as proposal
  where proposal.id = p_proposal_id;
  if not found then raise exception 'weekly_allocation_proposal_not_found'; end if;
  if not exists (
    select 1
    from quantum_private.weekly_allocation_operator_grants as grant_row
    where grant_row.operator_user_id = v_actor
      and grant_row.school_scope_key = v_proposal.school_scope_key
      and grant_row.capability in ('weekly_allocation:review', 'weekly_allocation:execute')
      and grant_row.revoked_at is null
  ) then raise exception 'weekly_allocation_scope_required'; end if;
  select activity_window.* into v_window
  from public.quantum_weekly_activity_windows as activity_window
  where activity_window.id = v_proposal.window_id;
  select pg_catalog.jsonb_array_length(v_proposal.assignment_plan) into v_room_count;
  select pg_catalog.count(distinct member.participant_user_id)::integer
  into v_people_count
  from pg_catalog.jsonb_array_elements(v_proposal.assignment_plan) as room(value)
  cross join lateral pg_catalog.jsonb_array_elements(room.value -> 'applications') as plan_application(value)
  join public.quantum_weekly_application_members as member
    on member.application_id = (plan_application.value ->> 'application_id')::uuid
   and member.consent_status = 'accepted'
   and member.lifecycle_status in ('active', 'assigned');
  return pg_catalog.jsonb_build_object(
    'proposal_id', v_proposal.id,
    'school_scope_key', v_proposal.school_scope_key,
    'week_key', v_proposal.week_key,
    'window_id', v_proposal.window_id,
    'window_revision', v_proposal.window_revision,
    'status', v_proposal.status,
    'revision', v_proposal.revision,
    'activity_id', v_window.activity_id,
    'starts_at', v_window.starts_at,
    'ends_at', v_window.ends_at,
    'location_name', v_window.location_name,
    'room_count', v_room_count,
    'people_count', v_people_count,
    'error_code', v_proposal.error_code
  );
end
$$;

revoke all on function public.operator_get_weekly_allocation_proposal(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.operator_get_weekly_allocation_proposal(uuid)
  to authenticated;

create or replace function public.operator_review_weekly_allocation(
  p_proposal_id uuid,
  p_decision text,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_proposal quantum_private.weekly_allocation_proposals%rowtype;
  v_hash text;
begin
  if p_decision not in ('review', 'reject') or p_idempotency_key is null then
    raise exception 'invalid_weekly_allocation_review';
  end if;
  select proposal.* into v_proposal
  from quantum_private.weekly_allocation_proposals as proposal
  where proposal.id = p_proposal_id for update;
  if not found then raise exception 'weekly_allocation_proposal_not_found'; end if;
  perform quantum_private.require_weekly_allocation_capability(
    v_actor, v_proposal.school_scope_key, 'weekly_allocation:review'
  );
  v_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'proposal_id', p_proposal_id, 'decision', p_decision,
    'expected_revision', p_expected_revision
  )::text);
  if exists (
    select 1 from quantum_private.weekly_allocation_proposal_commands as command
    where command.idempotency_key = p_idempotency_key
      and command.actor_kind = 'operator'
      and command.actor_user_id = v_actor
      and command.request_hash = v_hash
  ) then
    return pg_catalog.jsonb_build_object(
      'proposal_id', v_proposal.id, 'status', v_proposal.status,
      'revision', v_proposal.revision, 'replayed', true
    );
  end if;
  if exists (
    select 1 from quantum_private.weekly_allocation_proposal_commands as command
    where command.idempotency_key = p_idempotency_key
      and command.actor_kind = 'operator'
  ) then raise exception 'idempotency_key_reused'; end if;
  if v_proposal.status <> 'proposed' or v_proposal.revision <> p_expected_revision then
    raise exception 'stale_weekly_allocation_proposal';
  end if;
  update quantum_private.weekly_allocation_proposals
  set status = case when p_decision = 'review' then 'in_review' else 'rejected' end,
      reviewed_by = v_actor, reviewed_at = current_timestamp,
      revision = revision + 1, updated_at = current_timestamp
  where id = p_proposal_id and revision = p_expected_revision;
  insert into quantum_private.weekly_allocation_proposal_commands (
    proposal_id, actor_user_id, actor_kind, action, prior_revision,
    resulting_revision, idempotency_key, request_hash
  ) values (
    p_proposal_id, v_actor, 'operator', p_decision, p_expected_revision,
    p_expected_revision + 1, p_idempotency_key, v_hash
  );
  return pg_catalog.jsonb_build_object(
    'proposal_id', p_proposal_id,
    'status', case when p_decision = 'review' then 'in_review' else 'rejected' end,
    'revision', p_expected_revision + 1,
    'replayed', false
  );
end
$$;

create or replace function public.operator_request_weekly_allocation_execute(
  p_proposal_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_proposal quantum_private.weekly_allocation_proposals%rowtype;
  v_hash text;
begin
  if p_expected_revision is null or p_expected_revision < 0
     or p_idempotency_key is null then
    raise exception 'invalid_weekly_allocation_execute';
  end if;
  select proposal.* into v_proposal
  from quantum_private.weekly_allocation_proposals as proposal
  where proposal.id = p_proposal_id for update;
  if not found then raise exception 'weekly_allocation_proposal_not_found'; end if;
  perform quantum_private.require_weekly_allocation_capability(
    v_actor, v_proposal.school_scope_key, 'weekly_allocation:execute'
  );
  v_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'proposal_id', p_proposal_id, 'expected_revision', p_expected_revision
  )::text);
  if v_proposal.status = 'executing'
     and v_proposal.execute_requested_by = v_actor
     and v_proposal.execute_idempotency_key = p_idempotency_key then
    return pg_catalog.jsonb_build_object(
      'proposal_id', v_proposal.id, 'status', 'executing',
      'revision', v_proposal.revision, 'replayed', true
    );
  end if;
  if exists (
    select 1 from quantum_private.weekly_allocation_proposal_commands as command
    where command.idempotency_key = p_idempotency_key
      and command.actor_kind = 'operator'
  ) then raise exception 'idempotency_key_reused'; end if;
  if v_proposal.status <> 'in_review' or v_proposal.revision <> p_expected_revision then
    raise exception 'stale_weekly_allocation_proposal';
  end if;
  update quantum_private.weekly_allocation_proposals
  set status = 'executing', execute_requested_by = v_actor,
      execute_idempotency_key = p_idempotency_key,
      revision = revision + 1, updated_at = current_timestamp
  where id = p_proposal_id and revision = p_expected_revision;
  insert into quantum_private.weekly_allocation_proposal_commands (
    proposal_id, actor_user_id, actor_kind, action, prior_revision,
    resulting_revision, idempotency_key, request_hash
  ) values (
    p_proposal_id, v_actor, 'operator', 'execute', p_expected_revision,
    p_expected_revision + 1, p_idempotency_key, v_hash
  );
  return pg_catalog.jsonb_build_object(
    'proposal_id', p_proposal_id, 'status', 'executing',
    'revision', p_expected_revision + 1, 'replayed', false
  );
end
$$;

revoke all on function public.operator_review_weekly_allocation(uuid, text, integer, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.operator_request_weekly_allocation_execute(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.operator_review_weekly_allocation(uuid, text, integer, uuid)
  to authenticated;
grant execute on function public.operator_request_weekly_allocation_execute(uuid, integer, uuid)
  to authenticated;

-- Guard the already-reviewed single-party writer too; otherwise a direct
-- internal call could bypass the batch policy.
create or replace function quantum_private.assert_weekly_department_compatibility(
  p_application_id uuid,
  p_occurrence_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.quantum_weekly_application_members as candidate
    where candidate.application_id = p_application_id
      and (candidate.school_scope_key is null or candidate.department_key is null)
  ) then raise exception 'application_department_snapshot_missing'; end if;
  if exists (
    select 1
    from public.quantum_weekly_application_members as candidate
    join public.quantum_weekly_applications as existing_application
      on existing_application.assigned_occurrence_id = p_occurrence_id
     and existing_application.status = 'assigned'
     and existing_application.id <> p_application_id
    join public.quantum_weekly_application_members as existing_member
      on existing_member.application_id = existing_application.id
     and existing_member.lifecycle_status = 'assigned'
    where candidate.application_id = p_application_id
      and candidate.school_scope_key = existing_member.school_scope_key
      and candidate.department_key = existing_member.department_key
  ) then raise exception 'same_department_random_unit'; end if;
  if exists (
    select 1
    from public.quantum_event_participations as participation
    left join lateral quantum_private.get_member_department_identity(participation.user_id)
      as existing_identity on true
    where participation.occurrence_id = p_occurrence_id
      and participation.status in ('recruiting', 'confirmed')
      and not exists (
        select 1
        from public.quantum_weekly_applications as existing_application
        join public.quantum_weekly_application_members as existing_member
          on existing_member.application_id = existing_application.id
         and existing_member.participant_user_id = participation.user_id
        where existing_application.assigned_occurrence_id = p_occurrence_id
          and existing_application.status = 'assigned'
      )
      and (
        existing_identity.school_scope_key is null
        or existing_identity.department_key is null
      )
  ) then raise exception 'existing_department_identity_missing'; end if;
  if exists (
    select 1
    from public.quantum_weekly_application_members as candidate
    join public.quantum_event_participations as participation
      on participation.occurrence_id = p_occurrence_id
     and participation.status in ('recruiting', 'confirmed')
    join lateral quantum_private.get_member_department_identity(participation.user_id)
      as existing_identity on true
    where candidate.application_id = p_application_id
      and candidate.school_scope_key = existing_identity.school_scope_key
      and candidate.department_key = existing_identity.department_key
      and not exists (
        select 1
        from public.quantum_weekly_applications as existing_application
        join public.quantum_weekly_application_members as existing_member
          on existing_member.application_id = existing_application.id
         and existing_member.participant_user_id = participation.user_id
        where existing_application.assigned_occurrence_id = p_occurrence_id
          and existing_application.status = 'assigned'
      )
  ) then raise exception 'same_department_random_unit'; end if;
end
$$;

revoke all on function quantum_private.assert_weekly_department_compatibility(uuid, uuid)
  from public, anon, authenticated, service_role;

alter function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  set schema quantum_private;
alter function quantum_private.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  rename to assign_weekly_party_for_service_guarded_20260906130343;
revoke all on function quantum_private.assign_weekly_party_for_service_guarded_20260906130343(uuid, uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;

create function public.assign_weekly_party_for_service(
  p_application_id uuid,
  p_window_id uuid,
  p_occurrence_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  v_result := quantum_private.assign_weekly_party_for_service_guarded_20260906130343(
    p_application_id, p_window_id, p_occurrence_id,
    p_expected_revision, p_idempotency_key
  );
  -- The preserved allocator holds the application, participant, window, and
  -- occurrence locks until this transaction ends. Check the resulting room,
  -- not a pre-lock snapshot; an exception rolls the allocator writes back.
  perform quantum_private.assert_weekly_department_compatibility(
    p_application_id, p_occurrence_id
  );
  return v_result;
end
$$;

revoke all on function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  to service_role;

create or replace function public.service_execute_weekly_allocation_batch(
  p_proposal_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal quantum_private.weekly_allocation_proposals%rowtype;
  v_window public.quantum_weekly_activity_windows%rowtype;
  v_room jsonb;
  v_application jsonb;
  v_occurrence_id uuid;
  v_room_number integer;
  v_room_code text;
  v_receipts jsonb := '[]'::jsonb;
  v_room_people integer;
  v_room_male integer;
  v_room_female integer;
  v_error text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  select proposal.* into v_proposal
  from quantum_private.weekly_allocation_proposals as proposal
  where proposal.id = p_proposal_id for update;
  if not found then raise exception 'weekly_allocation_proposal_not_found'; end if;
  if v_proposal.status = 'completed'
     and v_proposal.execute_idempotency_key = p_idempotency_key then
    return v_proposal.receipt || pg_catalog.jsonb_build_object('replayed', true);
  end if;
  if v_proposal.status in ('failed', 'stale')
     and v_proposal.execute_idempotency_key = p_idempotency_key then
    return pg_catalog.jsonb_build_object(
      'proposal_id', p_proposal_id,
      'status', v_proposal.status,
      'error', v_proposal.error_code,
      'replayed', true
    );
  end if;
  if v_proposal.status <> 'executing'
     or v_proposal.revision <> p_expected_revision
     or v_proposal.execute_idempotency_key <> p_idempotency_key then
    raise exception 'stale_weekly_allocation_proposal';
  end if;

  begin
    select activity_window.* into v_window
    from public.quantum_weekly_activity_windows as activity_window
    where activity_window.id = v_proposal.window_id for update;
    if not found or v_window.revision <> v_proposal.window_revision
       or v_window.school_scope_key <> v_proposal.school_scope_key
       or v_window.status <> 'recruiting'
       or v_window.application_closes_at > current_timestamp
       or v_window.starts_at <= current_timestamp then
      raise exception 'weekly_allocation_snapshot_stale';
    end if;
    select coalesce(pg_catalog.max(occurrence.room_number), 0)
    into v_room_number
    from public.quantum_event_occurrences as occurrence
    where occurrence.event_id = v_window.activity_id
      and occurrence.starts_at = v_window.starts_at;

    for v_room in select value from pg_catalog.jsonb_array_elements(v_proposal.assignment_plan)
    loop
      if pg_catalog.jsonb_typeof(v_room -> 'applications') <> 'array' then
        raise exception 'invalid_weekly_assignment_plan';
      end if;
      v_room_number := v_room_number + 1;
      v_occurrence_id := pg_catalog.gen_random_uuid();
      v_room_code := pg_catalog.upper(pg_catalog.substr(
        pg_catalog.replace(v_occurrence_id::text, '-', ''), 1, 6
      ));
      insert into public.quantum_event_occurrences (
        id, event_id, event_mode, starts_at, ends_at, application_closes_at,
        location_name, male_capacity, female_capacity, required_total, status,
        room_number, room_code
      ) values (
        v_occurrence_id, v_window.activity_id, 'scheduled', v_window.starts_at,
        v_window.ends_at, v_window.application_closes_at, v_window.location_name,
        3, 2, 5, 'recruiting', v_room_number, v_room_code
      );

      for v_application in
        select value from pg_catalog.jsonb_array_elements(v_room -> 'applications')
      loop
        perform public.assign_weekly_party_for_service(
          (v_application ->> 'application_id')::uuid,
          v_window.id,
          v_occurrence_id,
          (v_application ->> 'expected_revision')::integer,
          (v_application ->> 'assignment_idempotency_key')::uuid
        );
      end loop;

      select
        pg_catalog.count(*)::integer,
        pg_catalog.count(*) filter (where room_person.gender = 'male')::integer,
        pg_catalog.count(*) filter (where room_person.gender = 'female')::integer
      into v_room_people, v_room_male, v_room_female
      from private.quantum_event_room_people(v_occurrence_id) as room_person;
      if v_room_people <> 5 or v_room_male <> 3 or v_room_female <> 2 then
        raise exception 'weekly_room_composition_invalid';
      end if;
      v_receipts := v_receipts || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'occurrence_id', v_occurrence_id,
          'room_number', v_room_number,
          'room_code', v_room_code,
          'people_count', v_room_people
        )
      );
    end loop;

    update public.quantum_weekly_activity_windows
    set status = 'assigned', revision = revision + 1,
        updated_at = current_timestamp
    where id = v_window.id and revision = v_proposal.window_revision;
    if not found then raise exception 'weekly_allocation_snapshot_stale'; end if;
    update quantum_private.weekly_allocation_proposals
    set status = 'completed', revision = revision + 1,
        receipt = pg_catalog.jsonb_build_object(
          'proposal_id', p_proposal_id, 'rooms', v_receipts, 'replayed', false
        ), completed_at = current_timestamp, updated_at = current_timestamp
    where id = p_proposal_id and revision = p_expected_revision;
    if not found then raise exception 'stale_weekly_allocation_proposal'; end if;
    insert into quantum_private.weekly_allocation_proposal_commands (
      proposal_id, actor_user_id, actor_kind, action, prior_revision,
      resulting_revision, idempotency_key, request_hash
    ) values (
      p_proposal_id, null, 'service', 'complete', p_expected_revision,
      p_expected_revision + 1, p_idempotency_key,
      pg_catalog.md5(pg_catalog.jsonb_build_object(
        'proposal_id', p_proposal_id, 'action', 'complete',
        'expected_revision', p_expected_revision
      )::text)
    );
    return pg_catalog.jsonb_build_object(
      'proposal_id', p_proposal_id, 'rooms', v_receipts, 'replayed', false
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    update quantum_private.weekly_allocation_proposals
    set status = case when v_error = 'weekly_allocation_snapshot_stale' then 'stale' else 'failed' end,
        error_code = v_error, revision = revision + 1, updated_at = current_timestamp
    where id = p_proposal_id and revision = p_expected_revision;
    if found then
      insert into quantum_private.weekly_allocation_proposal_commands (
        proposal_id, actor_user_id, actor_kind, action, prior_revision,
        resulting_revision, idempotency_key, request_hash
      ) values (
        p_proposal_id, null, 'service', 'fail', p_expected_revision,
        p_expected_revision + 1, p_idempotency_key,
        pg_catalog.md5(pg_catalog.jsonb_build_object(
          'proposal_id', p_proposal_id, 'action', 'fail',
          'expected_revision', p_expected_revision, 'error', v_error
        )::text)
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'proposal_id', p_proposal_id, 'error', v_error,
      'status', case when v_error = 'weekly_allocation_snapshot_stale' then 'stale' else 'failed' end
    );
  end;
end
$$;

revoke all on function public.service_execute_weekly_allocation_batch(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.service_execute_weekly_allocation_batch(uuid, integer, uuid)
  to service_role;

comment on function quantum_private.get_member_department_identity(uuid) is
  'Private normalized signup identity. No row means the caller must fail closed; this is not a catalog verification.';
comment on function public.get_my_tonight_participation_summary(uuid) is
  'Exact same-school active Tonight applicant totals. No participant identities are returned.';
comment on function public.service_execute_weekly_allocation_batch(uuid, integer, uuid) is
  'Service-only transaction: all planned rooms and accepted parties commit together or all allocation writes roll back.';
-- END SOURCE g3-g4-schema.sql

-- BEGIN SOURCE g7-g8-schema.sql
-- G7/G8 integration draft. Parent integration must place this after the shared
-- department identity contract that defines:
--   quantum_private.get_member_department_identity(uuid)
-- This file is intentionally not a migration and has not been applied to a DB.

alter table public.activity_meetups
  add column scope_type text not null default 'school',
  add column school_scope_key text,
  add column department_key text,
  add column department_label text,
  add column activity_key text,
  add column ends_at timestamptz,
  add column revision integer not null default 0,
  add column shared_guide_step text,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancel_reason text;

alter table public.activity_meetups
  add constraint activity_meetups_scope_type_check check (scope_type in ('school', 'department')),
  add constraint activity_meetups_department_scope_check check (
    (scope_type = 'school' and school_scope_key is null and department_key is null and department_label is null)
    or
    (scope_type = 'department' and school_scope_key is not null and department_key is not null and department_label is not null)
  ),
  add constraint activity_meetups_end_time_check check (ends_at is null or ends_at > scheduled_at),
  add constraint activity_meetups_revision_check check (revision >= 0),
  add constraint activity_meetups_shared_guide_step_check check (
    shared_guide_step is null or shared_guide_step in ('prepare', 'gather', 'greet', 'start', 'activity', 'wrap', 'next')
  ),
  add constraint activity_meetups_cancel_reason_check check (
    cancel_reason is null or pg_catalog.char_length(pg_catalog.btrim(cancel_reason)) between 2 and 240
  );

alter table public.activity_meetup_members
  add column school_scope_key_snapshot text,
  add column department_key_snapshot text,
  add column membership_revision integer not null default 0;

create table public.activity_meetup_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  meetup_id uuid not null references public.activity_meetups(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (action in ('created', 'member_joined', 'member_left', 'schedule_changed', 'cancelled', 'completed', 'shared_guide_advanced')),
  request_hash text not null check (pg_catalog.char_length(request_hash) between 32 and 128),
  idempotency_key uuid not null,
  prior_revision integer not null check (prior_revision >= 0),
  resulting_revision integer not null check (resulting_revision >= prior_revision),
  public_payload jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(public_payload) = 'object'),
  result jsonb not null check (pg_catalog.jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_user_id, idempotency_key)
);

create table public.activity_meetup_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  meetup_id uuid not null references public.activity_meetups(id) on delete restrict,
  sender_user_id uuid not null references public.users(id) on delete restrict,
  idempotency_key uuid not null,
  message text not null check (pg_catalog.char_length(pg_catalog.btrim(message)) between 1 and 1000),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (meetup_id, sender_user_id, idempotency_key)
);

create table public.activity_meetup_guide_progress (
  meetup_id uuid not null references public.activity_meetups(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  acknowledged_step text check (acknowledged_step is null or acknowledged_step in ('prepare', 'gather', 'greet', 'start', 'activity', 'wrap', 'next')),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (meetup_id, user_id)
);

create table public.activity_meetup_personal_actions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  meetup_id uuid not null references public.activity_meetups(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (action in ('acknowledge', 'report_late', 'request_help', 'take_break')),
  note text not null default '' check (pg_catalog.char_length(note) <= 240),
  scene_id text,
  idempotency_key uuid not null,
  resulting_personal_revision integer not null check (resulting_personal_revision >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_user_id, idempotency_key)
);

create table public.department_challenges (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school text not null,
  school_scope_key text not null,
  category text not null check (category in ('soccer', 'gaming')),
  title text not null check (pg_catalog.char_length(pg_catalog.btrim(title)) between 4 and 80),
  rules text not null default '' check (pg_catalog.char_length(rules) <= 2000),
  team_capacity smallint not null check (team_capacity between 2 and 20),
  status text not null default 'recruiting' check (status in ('recruiting', 'opponent_pending', 'scheduled', 'result_pending', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  ends_at timestamptz,
  place_name text check (place_name is null or pg_catalog.char_length(pg_catalog.btrim(place_name)) between 2 and 80),
  first_score integer check (first_score between 0 and 999),
  second_score integer check (second_score between 0 and 999),
  revision integer not null default 0 check (revision >= 0),
  created_by uuid not null references public.users(id) on delete restrict,
  cancelled_by uuid references public.users(id) on delete restrict,
  cancel_reason text check (cancel_reason is null or pg_catalog.char_length(pg_catalog.btrim(cancel_reason)) between 2 and 240),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check ((scheduled_at is null and ends_at is null and place_name is null) or (scheduled_at is not null and ends_at > scheduled_at and place_name is not null)),
  check ((status = 'completed') = (first_score is not null and second_score is not null))
);

create table public.department_challenge_teams (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  side text not null check (side in ('challenger', 'opponent')),
  department_key text not null,
  department_label text not null check (pg_catalog.char_length(pg_catalog.btrim(department_label)) between 1 and 120),
  captain_user_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'accepted' check (status in ('accepted', 'cancelled')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (challenge_id, side),
  unique (challenge_id, department_key)
);

create table public.department_challenge_roster (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  team_id uuid not null references public.department_challenge_teams(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  status text not null check (status in ('requested', 'accepted', 'declined', 'left')),
  department_key_snapshot text not null,
  revision integer not null default 0 check (revision >= 0),
  requested_at timestamptz not null default pg_catalog.clock_timestamp(),
  accepted_at timestamptz,
  left_at timestamptz,
  unique (challenge_id, user_id)
);

create table public.department_challenge_schedule_confirmations (
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  team_id uuid not null references public.department_challenge_teams(id) on delete restrict,
  captain_user_id uuid not null references public.users(id) on delete restrict,
  scheduled_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > scheduled_at),
  place_name text not null check (pg_catalog.char_length(pg_catalog.btrim(place_name)) between 2 and 80),
  idempotency_key uuid not null,
  confirmed_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (challenge_id, team_id)
);

create table public.department_challenge_result_confirmations (
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  team_id uuid not null references public.department_challenge_teams(id) on delete restrict,
  captain_user_id uuid not null references public.users(id) on delete restrict,
  own_score integer not null check (own_score between 0 and 999),
  opponent_score integer not null check (opponent_score between 0 and 999),
  idempotency_key uuid not null,
  confirmed_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (challenge_id, team_id)
);

create table public.department_challenge_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (action in ('created', 'opponent_accepted', 'roster_requested', 'roster_accepted', 'roster_left', 'schedule_confirmed', 'cancelled', 'result_confirmed')),
  request_hash text not null check (pg_catalog.char_length(request_hash) between 32 and 128),
  idempotency_key uuid not null,
  prior_revision integer not null check (prior_revision >= 0),
  resulting_revision integer not null check (resulting_revision >= prior_revision),
  result jsonb not null check (pg_catalog.jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_user_id, idempotency_key)
);

create index activity_meetup_messages_page_idx on public.activity_meetup_messages (meetup_id, created_at, id);
create index activity_meetup_events_page_idx on public.activity_meetup_events (meetup_id, created_at, id);
create index activity_meetup_personal_actions_actor_idx on public.activity_meetup_personal_actions (meetup_id, actor_user_id, created_at);
create index department_challenges_school_status_idx on public.department_challenges (school, status, created_at desc);
create index department_challenge_roster_team_status_idx on public.department_challenge_roster (team_id, status, requested_at);

alter table public.activity_meetup_events enable row level security;
alter table public.activity_meetup_messages enable row level security;
alter table public.activity_meetup_guide_progress enable row level security;
alter table public.activity_meetup_personal_actions enable row level security;
alter table public.department_challenges enable row level security;
alter table public.department_challenge_teams enable row level security;
alter table public.department_challenge_roster enable row level security;
alter table public.department_challenge_schedule_confirmations enable row level security;
alter table public.department_challenge_result_confirmations enable row level security;
alter table public.department_challenge_events enable row level security;

revoke all on table public.activity_meetup_events from public, anon, authenticated, service_role;
revoke all on table public.activity_meetup_messages from public, anon, authenticated, service_role;
revoke all on table public.activity_meetup_guide_progress from public, anon, authenticated, service_role;
revoke all on table public.activity_meetup_personal_actions from public, anon, authenticated, service_role;
revoke all on table public.department_challenges from public, anon, authenticated, service_role;
revoke all on table public.department_challenge_teams from public, anon, authenticated, service_role;
revoke all on table public.department_challenge_roster from public, anon, authenticated, service_role;
revoke all on table public.department_challenge_schedule_confirmations from public, anon, authenticated, service_role;
revoke all on table public.department_challenge_result_confirmations from public, anon, authenticated, service_role;
revoke all on table public.department_challenge_events from public, anon, authenticated, service_role;

create or replace function quantum_private.activity_meetup_scope_eligible(p_meetup_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_meetup public.activity_meetups%rowtype;
  v_school text;
  v_school_scope_key text;
  v_department_key text;
begin
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  if v_meetup.id is null then return false; end if;
  select identity.school into v_school from quantum_private.get_community_identity(p_user_id) as identity;
  if v_school is distinct from v_meetup.school then return false; end if;
  if v_meetup.scope_type = 'school' then return true; end if;
  select identity.school_scope_key, identity.department_key
    into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(p_user_id) as identity;
  return v_school_scope_key is not null
    and v_department_key is not null
    and v_school_scope_key = v_meetup.school_scope_key
    and v_department_key = v_meetup.department_key;
end
$$;

create or replace function quantum_private.department_challenge_projection(
  p_challenge_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_challenge public.department_challenges%rowtype;
  v_school_scope_key text;
  v_department_key text;
  v_participant boolean;
begin
  select challenge.* into v_challenge
  from public.department_challenges as challenge where challenge.id = p_challenge_id;
  select identity.school_scope_key, identity.department_key
    into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(p_actor) as identity;
  if v_challenge.id is null or v_school_scope_key is null or v_department_key is null
     or v_challenge.school_scope_key <> v_school_scope_key then
    raise exception 'department_challenge_not_found';
  end if;
  select exists (
    select 1 from public.department_challenge_roster as roster
    where roster.challenge_id = p_challenge_id and roster.user_id = p_actor and roster.status = 'accepted'
  ) into v_participant;
  return pg_catalog.jsonb_build_object(
    'id', v_challenge.id,
    'category', v_challenge.category,
    'title', v_challenge.title,
    'rules', v_challenge.rules,
    'status', v_challenge.status,
    'revision', v_challenge.revision,
    'team_capacity', v_challenge.team_capacity,
    'scheduled_at', v_challenge.scheduled_at,
    'ends_at', v_challenge.ends_at,
    'place_name', v_challenge.place_name,
    'can_accept_opponent', v_challenge.status = 'recruiting'
      and not exists (select 1 from public.department_challenge_teams as team where team.challenge_id = p_challenge_id and team.side = 'opponent')
      and not exists (select 1 from public.department_challenge_teams as team where team.challenge_id = p_challenge_id and team.department_key = v_department_key),
    'is_captain', exists (
      select 1 from public.department_challenge_teams as team
      where team.challenge_id = p_challenge_id and team.captain_user_id = p_actor and team.status = 'accepted'
    ),
    'teams', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', team.id,
        'side', team.side,
        'department_label', team.department_label,
        'accepted_count', (
          select pg_catalog.count(*) from public.department_challenge_roster as counted
          where counted.team_id = team.id and counted.status = 'accepted'
        ),
        'capacity', v_challenge.team_capacity,
        'is_captain', team.captain_user_id = p_actor,
        'may_request_roster', v_challenge.status not in ('completed', 'cancelled') and team.department_key = v_department_key,
        'roster', (
          select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', roster.id,
            'alias', quantum_private.activity_meetup_alias(roster.user_id),
            'status', roster.status,
            'is_me', roster.user_id = p_actor
          ) order by roster.requested_at, roster.id), '[]'::jsonb)
          from public.department_challenge_roster as roster
          where roster.team_id = team.id
            and (
              team.captain_user_id = p_actor
              or (v_participant and roster.status = 'accepted')
              or roster.user_id = p_actor
            )
        )
      ) order by team.side), '[]'::jsonb)
      from public.department_challenge_teams as team
      where team.challenge_id = p_challenge_id and team.status = 'accepted'
    ),
    'result', case when v_challenge.status = 'completed' then pg_catalog.jsonb_build_object(
      'first_score', v_challenge.first_score, 'second_score', v_challenge.second_score
    ) else null end
  );
end
$$;

revoke all on function quantum_private.department_challenge_projection(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.create_department_challenge(
  p_category text,
  p_title text,
  p_rules text,
  p_team_capacity integer,
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
  v_school text;
  v_school_scope_key text;
  v_department_key text;
  v_department_label text;
  v_challenge_id uuid;
  v_team_id uuid;
  v_event public.department_challenge_events%rowtype;
  v_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_category not in ('soccer', 'gaming')
     or p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 4 and 80
     or p_rules is null or pg_catalog.char_length(p_rules) > 2000
     or p_team_capacity is null or p_team_capacity not between 2 and 20 then raise exception 'invalid_challenge_input'; end if;
  v_hash := pg_catalog.md5(pg_catalog.concat_ws('|', p_category, pg_catalog.btrim(p_title), p_rules, p_team_capacity::text));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'department-challenge:' || v_actor::text || ':' || p_idempotency_key::text, 0
  ));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'created' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select identity.school into v_school from quantum_private.get_community_identity(v_actor) as identity;
  select identity.school_scope_key, identity.department_key into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  select pg_catalog.btrim(profile.department) into v_department_label
  from quantum_private.community_member_profiles as profile
  where profile.user_id = v_actor;
  if v_school is null or v_school_scope_key is null or v_department_key is null or v_department_label is null then
    raise exception 'department_identity_required';
  end if;
  insert into public.department_challenges (
    school, school_scope_key, category, title, rules, team_capacity, status, created_by
  ) values (
    v_school, v_school_scope_key, p_category, pg_catalog.btrim(p_title), p_rules, p_team_capacity, 'recruiting', v_actor
  ) returning id into v_challenge_id;
  insert into public.department_challenge_teams (
    challenge_id, side, department_key, department_label, captain_user_id
  ) values (v_challenge_id, 'challenger', v_department_key, v_department_label, v_actor)
  returning id into v_team_id;
  insert into public.department_challenge_roster (
    challenge_id, team_id, user_id, status, department_key_snapshot, accepted_at
  ) values (v_challenge_id, v_team_id, v_actor, 'accepted', v_department_key, pg_catalog.clock_timestamp());
  v_result := quantum_private.department_challenge_projection(v_challenge_id, v_actor);
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (v_challenge_id, v_actor, 'created', v_hash, p_idempotency_key, 0, 0, v_result);
  return v_result;
end
$$;

create or replace function public.accept_department_challenge_roster_request(
  p_challenge_id uuid,
  p_roster_id uuid,
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
  v_candidate uuid;
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_roster public.department_challenge_roster%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_actor_school_scope_key text;
  v_actor_department_key text;
  v_candidate_school_scope_key text;
  v_candidate_department_key text;
  v_accepted_count integer;
  v_hash text := pg_catalog.md5(p_challenge_id::text || ':' || p_roster_id::text || ':accept');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null then raise exception 'invalid_idempotency_key'; end if;
  select roster.user_id into v_candidate
  from public.department_challenge_roster as roster
  where roster.id = p_roster_id and roster.challenge_id = p_challenge_id;
  if v_candidate is null then raise exception 'roster_not_found'; end if;
  if v_actor::text < v_candidate::text then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_candidate::text, 0));
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_candidate::text, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  end if;
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'roster_accepted' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  select roster.* into v_roster from public.department_challenge_roster as roster
  where roster.id = p_roster_id and roster.challenge_id = p_challenge_id for update;
  select team.* into v_team from public.department_challenge_teams as team where team.id = v_roster.team_id;
  if v_challenge.id is null or v_roster.id is null or v_team.captain_user_id <> v_actor then raise exception 'roster_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status in ('completed', 'cancelled') or v_roster.status <> 'requested' then raise exception 'roster_not_pending'; end if;
  select identity.school_scope_key, identity.department_key
    into v_actor_school_scope_key, v_actor_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_actor_school_scope_key is null or v_actor_department_key is null
     or v_actor_school_scope_key <> v_challenge.school_scope_key
     or v_actor_department_key <> v_team.department_key then
    raise exception 'department_identity_changed';
  end if;
  select identity.school_scope_key, identity.department_key
    into v_candidate_school_scope_key, v_candidate_department_key
  from quantum_private.get_member_department_identity(v_candidate) as identity;
  if v_candidate_school_scope_key is null or v_candidate_department_key is null
     or v_candidate_school_scope_key <> v_challenge.school_scope_key
     or v_candidate_department_key <> v_team.department_key
     or v_candidate_department_key <> v_roster.department_key_snapshot then
    raise exception 'department_identity_changed';
  end if;
  select pg_catalog.count(*)::integer into v_accepted_count
  from public.department_challenge_roster as roster
  where roster.team_id = v_team.id and roster.status = 'accepted';
  if v_accepted_count >= v_challenge.team_capacity then raise exception 'team_full'; end if;
  update public.department_challenge_roster as roster
  set status = 'accepted', accepted_at = pg_catalog.clock_timestamp(), left_at = null,
      revision = roster.revision + 1
  where roster.id = p_roster_id;
  update public.department_challenges as challenge
  set revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object(
    'roster_id', p_roster_id, 'status', 'accepted',
    'accepted_count', v_accepted_count + 1, 'team_capacity', v_challenge.team_capacity,
    'revision', v_challenge.revision + 1
  );
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'roster_accepted', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.leave_my_department_challenge_roster(
  p_challenge_id uuid,
  p_team_id uuid,
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
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_roster public.department_challenge_roster%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_hash text := pg_catalog.md5(p_challenge_id::text || ':' || p_team_id::text || ':leave');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null then raise exception 'invalid_idempotency_key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'roster_left' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  select team.* into v_team from public.department_challenge_teams as team where team.id = p_team_id and team.challenge_id = p_challenge_id;
  select roster.* into v_roster from public.department_challenge_roster as roster
  where roster.challenge_id = p_challenge_id and roster.team_id = p_team_id and roster.user_id = v_actor for update;
  if v_challenge.id is null or v_team.id is null or v_roster.id is null then raise exception 'roster_not_found'; end if;
  if v_team.captain_user_id = v_actor then raise exception 'captain_cannot_leave'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status in ('completed', 'cancelled') or v_roster.status not in ('requested', 'accepted') then raise exception 'roster_not_active'; end if;
  update public.department_challenge_roster as roster
  set status = 'left', left_at = pg_catalog.clock_timestamp(), revision = roster.revision + 1
  where roster.id = v_roster.id;
  update public.department_challenges as challenge
  set revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object('roster_id', v_roster.id, 'status', 'left', 'revision', v_challenge.revision + 1);
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'roster_left', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.confirm_my_department_challenge_schedule(
  p_challenge_id uuid,
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
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_first public.department_challenge_schedule_confirmations%rowtype;
  v_second public.department_challenge_schedule_confirmations%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_actor_school_scope_key text;
  v_actor_department_key text;
  v_hash text;
  v_published boolean := false;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null
     or p_scheduled_at is null or p_ends_at is null
     or p_scheduled_at < pg_catalog.clock_timestamp() + interval '30 minutes'
     or p_ends_at < p_scheduled_at + interval '30 minutes'
     or p_ends_at > p_scheduled_at + interval '12 hours'
     or p_place_name is null or pg_catalog.char_length(pg_catalog.btrim(p_place_name)) not between 2 and 80 then
    raise exception 'invalid_challenge_schedule';
  end if;
  v_hash := pg_catalog.md5(pg_catalog.concat_ws('|', p_challenge_id::text, p_scheduled_at::text, p_ends_at::text, pg_catalog.btrim(p_place_name)));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'schedule_confirmed' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  select team.* into v_team from public.department_challenge_teams as team
  where team.challenge_id = p_challenge_id and team.captain_user_id = v_actor and team.status = 'accepted';
  if v_challenge.id is null or v_team.id is null then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  select identity.school_scope_key, identity.department_key
    into v_actor_school_scope_key, v_actor_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_actor_school_scope_key is null or v_actor_department_key is null
     or v_actor_school_scope_key <> v_challenge.school_scope_key
     or v_actor_department_key <> v_team.department_key then
    raise exception 'department_identity_changed';
  end if;
  if v_challenge.status not in ('opponent_pending', 'scheduled')
     or (select pg_catalog.count(*) from public.department_challenge_teams as team where team.challenge_id = p_challenge_id and team.status = 'accepted') <> 2 then
    raise exception 'challenge_schedule_not_available';
  end if;
  insert into public.department_challenge_schedule_confirmations (
    challenge_id, team_id, captain_user_id, scheduled_at, ends_at, place_name, idempotency_key, confirmed_at
  ) values (
    p_challenge_id, v_team.id, v_actor, p_scheduled_at, p_ends_at, pg_catalog.btrim(p_place_name), p_idempotency_key, pg_catalog.clock_timestamp()
  ) on conflict (challenge_id, team_id) do update
    set captain_user_id = excluded.captain_user_id, scheduled_at = excluded.scheduled_at,
        ends_at = excluded.ends_at, place_name = excluded.place_name,
        idempotency_key = excluded.idempotency_key, confirmed_at = excluded.confirmed_at;
  select confirmation.* into v_first
  from public.department_challenge_schedule_confirmations as confirmation
  join public.department_challenge_teams as team on team.id = confirmation.team_id
  where confirmation.challenge_id = p_challenge_id and team.side = 'challenger';
  select confirmation.* into v_second
  from public.department_challenge_schedule_confirmations as confirmation
  join public.department_challenge_teams as team on team.id = confirmation.team_id
  where confirmation.challenge_id = p_challenge_id and team.side = 'opponent';
  v_published := v_first.team_id is not null and v_second.team_id is not null
    and v_first.scheduled_at = v_second.scheduled_at
    and v_first.ends_at = v_second.ends_at
    and v_first.place_name = v_second.place_name;
  update public.department_challenges as challenge
  set status = case when v_published then 'scheduled' else 'opponent_pending' end,
      scheduled_at = case when v_published then p_scheduled_at else null end,
      ends_at = case when v_published then p_ends_at else null end,
      place_name = case when v_published then pg_catalog.btrim(p_place_name) else null end,
      revision = challenge.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object(
    'status', case when v_published then 'scheduled' else 'opponent_pending' end,
    'published', v_published, 'revision', v_challenge.revision + 1
  );
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'schedule_confirmed', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.cancel_my_department_challenge(
  p_challenge_id uuid,
  p_reason text,
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
  v_challenge public.department_challenges%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_hash text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null or p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 2 and 240 then raise exception 'invalid_cancel_reason'; end if;
  v_hash := pg_catalog.md5(p_challenge_id::text || ':' || pg_catalog.btrim(p_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'cancelled' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  if v_challenge.id is null or not exists (
    select 1 from public.department_challenge_teams as team
    where team.challenge_id = p_challenge_id and team.captain_user_id = v_actor and team.status = 'accepted'
  ) then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status in ('completed', 'cancelled') then raise exception 'challenge_closed'; end if;
  update public.department_challenges as challenge
  set status = 'cancelled', cancelled_by = v_actor, cancel_reason = pg_catalog.btrim(p_reason),
      revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object('status', 'cancelled', 'revision', v_challenge.revision + 1);
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'cancelled', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.confirm_my_department_challenge_result(
  p_challenge_id uuid,
  p_own_score integer,
  p_opponent_score integer,
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
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_first public.department_challenge_result_confirmations%rowtype;
  v_second public.department_challenge_result_confirmations%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_actor_school_scope_key text;
  v_actor_department_key text;
  v_hash text := pg_catalog.md5(pg_catalog.concat_ws('|', p_challenge_id::text, p_own_score::text, p_opponent_score::text));
  v_confirmed boolean := false;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null or p_own_score is null or p_opponent_score is null
     or p_own_score not between 0 and 999 or p_opponent_score not between 0 and 999 then raise exception 'invalid_challenge_result'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'result_confirmed' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  select team.* into v_team from public.department_challenge_teams as team
  where team.challenge_id = p_challenge_id and team.captain_user_id = v_actor and team.status = 'accepted';
  if v_challenge.id is null or v_team.id is null then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  select identity.school_scope_key, identity.department_key
    into v_actor_school_scope_key, v_actor_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_actor_school_scope_key is null or v_actor_department_key is null
     or v_actor_school_scope_key <> v_challenge.school_scope_key
     or v_actor_department_key <> v_team.department_key then
    raise exception 'department_identity_changed';
  end if;
  if v_challenge.status not in ('scheduled', 'result_pending') or v_challenge.ends_at > pg_catalog.clock_timestamp() then
    raise exception 'challenge_result_not_available';
  end if;
  insert into public.department_challenge_result_confirmations (
    challenge_id, team_id, captain_user_id, own_score, opponent_score, idempotency_key, confirmed_at
  ) values (
    p_challenge_id, v_team.id, v_actor, p_own_score, p_opponent_score, p_idempotency_key, pg_catalog.clock_timestamp()
  ) on conflict (challenge_id, team_id) do update
    set captain_user_id = excluded.captain_user_id, own_score = excluded.own_score,
        opponent_score = excluded.opponent_score, idempotency_key = excluded.idempotency_key,
        confirmed_at = excluded.confirmed_at;
  select confirmation.* into v_first
  from public.department_challenge_result_confirmations as confirmation
  join public.department_challenge_teams as team on team.id = confirmation.team_id
  where confirmation.challenge_id = p_challenge_id and team.side = 'challenger';
  select confirmation.* into v_second
  from public.department_challenge_result_confirmations as confirmation
  join public.department_challenge_teams as team on team.id = confirmation.team_id
  where confirmation.challenge_id = p_challenge_id and team.side = 'opponent';
  v_confirmed := v_first.team_id is not null and v_second.team_id is not null
    and v_first.own_score = v_second.opponent_score
    and v_first.opponent_score = v_second.own_score;
  update public.department_challenges as challenge
  set status = case when v_confirmed then 'completed' else 'result_pending' end,
      first_score = case when v_confirmed then v_first.own_score else null end,
      second_score = case when v_confirmed then v_first.opponent_score else null end,
      revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object(
    'status', case when v_confirmed then 'completed' else 'result_pending' end,
    'published', v_confirmed,
    'result', case when v_confirmed then pg_catalog.jsonb_build_object('first_score', v_first.own_score, 'second_score', v_first.opponent_score) else null end,
    'revision', v_challenge.revision + 1
  );
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'result_confirmed', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.list_my_department_challenges()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_scope_key text;
  v_department_key text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select identity.school_scope_key, identity.department_key into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_school_scope_key is null or v_department_key is null then raise exception 'department_identity_required'; end if;
  return query
  select quantum_private.department_challenge_projection(challenge.id, v_actor)
  from public.department_challenges as challenge
  where challenge.school_scope_key = v_school_scope_key
  order by challenge.created_at desc
  limit 50;
end
$$;

create or replace function public.get_my_department_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  return quantum_private.department_challenge_projection(p_challenge_id, v_actor);
end
$$;

create or replace function public.accept_department_challenge_opponent(
  p_challenge_id uuid,
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
  v_challenge public.department_challenges%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_school_scope_key text;
  v_department_key text;
  v_department_label text;
  v_team_id uuid;
  v_hash text := pg_catalog.md5(p_challenge_id::text || ':opponent');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null then raise exception 'invalid_idempotency_key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'opponent_accepted' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select identity.school_scope_key, identity.department_key into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  select pg_catalog.btrim(profile.department) into v_department_label
  from quantum_private.community_member_profiles as profile
  where profile.user_id = v_actor;
  if v_school_scope_key is null or v_department_key is null or v_department_label is null then raise exception 'department_identity_required'; end if;
  select challenge.* into v_challenge from public.department_challenges as challenge
  where challenge.id = p_challenge_id for update;
  if v_challenge.id is null or v_challenge.school_scope_key <> v_school_scope_key then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status <> 'recruiting' or exists (
    select 1 from public.department_challenge_teams as team
    where team.challenge_id = p_challenge_id and (team.side = 'opponent' or team.department_key = v_department_key)
  ) then raise exception 'opponent_not_available'; end if;
  insert into public.department_challenge_teams (
    challenge_id, side, department_key, department_label, captain_user_id
  ) values (p_challenge_id, 'opponent', v_department_key, v_department_label, v_actor)
  returning id into v_team_id;
  insert into public.department_challenge_roster (
    challenge_id, team_id, user_id, status, department_key_snapshot, accepted_at
  ) values (p_challenge_id, v_team_id, v_actor, 'accepted', v_department_key, pg_catalog.clock_timestamp());
  update public.department_challenges as challenge
  set status = 'opponent_pending', revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := quantum_private.department_challenge_projection(p_challenge_id, v_actor);
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'opponent_accepted', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function public.request_department_challenge_roster(
  p_challenge_id uuid,
  p_team_id uuid,
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
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_event public.department_challenge_events%rowtype;
  v_school_scope_key text;
  v_department_key text;
  v_roster_id uuid;
  v_hash text := pg_catalog.md5(p_challenge_id::text || ':' || p_team_id::text || ':request');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_expected_revision is null then raise exception 'invalid_idempotency_key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_actor::text, 0));
  select event.* into v_event from public.department_challenge_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'roster_requested' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select identity.school_scope_key, identity.department_key into v_school_scope_key, v_department_key
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_school_scope_key is null or v_department_key is null then raise exception 'department_identity_required'; end if;
  select challenge.* into v_challenge from public.department_challenges as challenge where challenge.id = p_challenge_id for update;
  select team.* into v_team from public.department_challenge_teams as team where team.id = p_team_id and team.challenge_id = p_challenge_id;
  if v_challenge.id is null or v_team.id is null or v_challenge.school_scope_key <> v_school_scope_key then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status in ('completed', 'cancelled') or v_team.department_key <> v_department_key then raise exception 'department_restricted'; end if;
  if exists (
    select 1 from public.department_challenge_roster as roster
    where roster.challenge_id = p_challenge_id and roster.user_id = v_actor and roster.status in ('requested', 'accepted')
  ) then raise exception 'roster_already_active'; end if;
  insert into public.department_challenge_roster (
    challenge_id, team_id, user_id, status, department_key_snapshot
  ) values (p_challenge_id, p_team_id, v_actor, 'requested', v_department_key)
  on conflict (challenge_id, user_id) do update
    set team_id = excluded.team_id, status = 'requested', department_key_snapshot = excluded.department_key_snapshot,
        revision = public.department_challenge_roster.revision + 1,
        requested_at = pg_catalog.clock_timestamp(), accepted_at = null, left_at = null
  returning id into v_roster_id;
  update public.department_challenges as challenge
  set revision = challenge.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where challenge.id = p_challenge_id;
  v_result := pg_catalog.jsonb_build_object('roster_id', v_roster_id, 'status', 'requested', 'revision', v_challenge.revision + 1);
  insert into public.department_challenge_events (
    challenge_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, result
  ) values (
    p_challenge_id, v_actor, 'roster_requested', v_hash, p_idempotency_key,
    v_challenge.revision, v_challenge.revision + 1, v_result
  );
  return v_result;
end
$$;

create or replace function quantum_private.activity_meetup_alias(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select identity.display_name
  from quantum_private.get_community_identity(p_user_id) as identity
  limit 1
$$;

create or replace function quantum_private.meetup_activity_key_valid(p_category text, p_activity_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_activity_key is null or (p_category, p_activity_key) in (
    ('running', 'oncheon-running'),
    ('badminton', 'evening-badminton'),
    ('basketball', 'night-basketball'),
    ('tennis', 'campus-tennis'),
    ('board_game', 'board-game-round'),
    ('gaming', 'team-gaming'),
    ('hiking', 'geumjeongsan-hiking'),
    ('dining', 'campus-cafe-chat'),
    ('other', 'campus-small-shop'),
    ('walking', 'evening-neighborhood-walk'),
    ('dining', 'evening-dining'),
    ('study', 'major-foundation-study'),
    ('study', 'language-speaking-study'),
    ('study', 'career-certificate-study'),
    ('study', 'portfolio-project-study')
  )
$$;

revoke all on function quantum_private.activity_meetup_scope_eligible(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function quantum_private.activity_meetup_alias(uuid) from public, anon, authenticated, service_role;
revoke all on function quantum_private.meetup_activity_key_valid(text, text) from public, anon, authenticated, service_role;

create or replace function public.create_activity_meetup_v3(
  p_category text,
  p_title text,
  p_description text,
  p_place_name text,
  p_scheduled_at timestamptz,
  p_capacity integer,
  p_gender_mode text,
  p_ends_at timestamptz,
  p_scope_type text,
  p_activity_key text,
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
  v_existing public.activity_meetup_events%rowtype;
  v_hash text;
  v_result jsonb;
  v_meetup_id uuid;
  v_school_scope_key text;
  v_department_key text;
  v_department_label text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_scope_type not in ('school', 'department') then raise exception 'invalid_meetup_scope'; end if;
  if p_ends_at is null or p_scheduled_at is null or p_ends_at < p_scheduled_at + interval '30 minutes' or p_ends_at > p_scheduled_at + interval '24 hours' then
    raise exception 'invalid_end_time';
  end if;
  if not quantum_private.meetup_activity_key_valid(p_category, p_activity_key) then raise exception 'invalid_activity_key'; end if;
  v_hash := pg_catalog.md5(pg_catalog.concat_ws('|', p_category, p_title, p_description, p_place_name, p_scheduled_at::text, p_capacity::text, p_gender_mode, p_ends_at::text, p_scope_type, coalesce(p_activity_key, '')));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-create:' || v_actor::text || ':' || p_idempotency_key::text, 0));
  select event.* into v_existing from public.activity_meetup_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_existing.id is not null then
    if v_existing.action <> 'created' or v_existing.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_existing.result;
  end if;
  if p_scope_type = 'department' then
    select identity.school_scope_key, identity.department_key into v_school_scope_key, v_department_key
    from quantum_private.get_member_department_identity(v_actor) as identity;
    if v_school_scope_key is null or v_department_key is null then raise exception 'department_identity_required'; end if;
    select pg_catalog.btrim(profile.department) into v_department_label
    from quantum_private.community_member_profiles as profile
    where profile.user_id = v_actor;
    if v_department_label is null then raise exception 'department_identity_required'; end if;
  end if;
  v_result := public.create_activity_meetup_v2(p_category, p_title, p_description, p_place_name, p_scheduled_at, p_capacity, p_gender_mode);
  v_meetup_id := (v_result ->> 'id')::uuid;
  update public.activity_meetups as meetup
  set scope_type = p_scope_type,
      school_scope_key = v_school_scope_key,
      department_key = v_department_key,
      department_label = v_department_label,
      activity_key = p_activity_key,
      ends_at = p_ends_at,
      -- NULL lets the read model derive the initial scene from server time.
      -- A host action sets this only when the group explicitly advances it.
      shared_guide_step = null,
      updated_at = pg_catalog.clock_timestamp()
  where meetup.id = v_meetup_id;
  update public.activity_meetup_members as member
  set school_scope_key_snapshot = v_school_scope_key, department_key_snapshot = v_department_key
  where member.meetup_id = v_meetup_id and member.user_id = v_actor;
  v_result := v_result || pg_catalog.jsonb_build_object(
    'scope_type', p_scope_type,
    'department_label', v_department_label,
    'activity_key', p_activity_key,
    'ends_at', p_ends_at,
    'revision', 0
  );
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, public_payload, result
  ) values (
    v_meetup_id, v_actor, 'created', v_hash, p_idempotency_key,
    0, 0, pg_catalog.jsonb_build_object('scope_type', p_scope_type), v_result
  );
  return v_result;
end
$$;

create or replace function public.get_my_activity_meetup_chat(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_joined boolean;
  v_phase text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  select exists (
    select 1 from public.activity_meetup_members as member
    where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
  ) into v_joined;
  if v_meetup.id is null or not v_joined or not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor) then
    raise exception 'meetup_not_found';
  end if;
  v_phase := case when v_meetup.status in ('open', 'full') then 'send' else 'read_only' end;
  return pg_catalog.jsonb_build_object(
    'phase', v_phase,
    'messages', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', message.id,
        'sender_alias', quantum_private.activity_meetup_alias(message.sender_user_id),
        'message', message.message,
        'created_at', message.created_at
      ) order by message.created_at, message.id), '[]'::jsonb)
      from public.activity_meetup_messages as message
      where message.meetup_id = p_meetup_id
        and not exists (
          select 1 from public.friendships as friendship
          where friendship.status = 'blocked'
            and ((friendship.user_id = v_actor and friendship.friend_user_id = message.sender_user_id)
              or (friendship.user_id = message.sender_user_id and friendship.friend_user_id = v_actor))
        )
    )
  );
end
$$;

create or replace function public.send_my_activity_meetup_chat_message(
  p_meetup_id uuid,
  p_message text,
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
  v_message public.activity_meetup_messages%rowtype;
  v_text text := pg_catalog.btrim(p_message);
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or v_text is null or pg_catalog.char_length(v_text) not between 1 and 1000 then
    raise exception 'invalid_chat_message';
  end if;
  if v_text ~* '(https?://|www[.]|[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|instagram|insta[[:space:]_-]*gram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)'
     or pg_catalog.regexp_replace(v_text, '[^0-9]', '', 'g') ~ '01[016789][0-9]{7,8}' then
    raise exception 'contact_sharing_not_allowed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-meetup-chat:' || v_actor::text || ':' || p_idempotency_key::text, 0
  ));
  select message.* into v_message
  from public.activity_meetup_messages as message
  where message.meetup_id = p_meetup_id and message.sender_user_id = v_actor
    and message.idempotency_key = p_idempotency_key
  for update;
  if v_message.id is not null then
    if v_message.message <> v_text then raise exception 'idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object(
      'id', v_message.id, 'sender_alias', quantum_private.activity_meetup_alias(v_actor),
      'message', v_message.message, 'created_at', v_message.created_at, 'phase', 'send', 'reused', true
    );
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  if v_meetup.id is null or v_meetup.status not in ('open', 'full')
     or not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor)
     or not exists (
       select 1 from public.activity_meetup_members as member
       where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
     ) then
    raise exception 'meetup_chat_not_writable';
  end if;
  insert into public.activity_meetup_messages (meetup_id, sender_user_id, idempotency_key, message)
  values (p_meetup_id, v_actor, p_idempotency_key, v_text)
  returning * into v_message;
  return pg_catalog.jsonb_build_object(
    'id', v_message.id, 'sender_alias', quantum_private.activity_meetup_alias(v_actor),
    'message', v_message.message, 'created_at', v_message.created_at, 'phase', 'send', 'reused', false
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

create or replace function public.get_my_activity_meetup_personal_actions(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor)
     or not exists (
       select 1 from public.activity_meetup_members as member
       where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
     ) then raise exception 'meetup_not_found'; end if;
  return pg_catalog.jsonb_build_object(
    'actions', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'action', action.action, 'note', action.note, 'created_at', action.created_at
      ) order by action.created_at, action.id), '[]'::jsonb)
      from public.activity_meetup_personal_actions as action
      where action.meetup_id = p_meetup_id and action.actor_user_id = v_actor
        and action.action <> 'acknowledge'
    )
  );
end
$$;

create or replace function public.record_my_activity_meetup_personal_action(
  p_meetup_id uuid,
  p_action text,
  p_note text,
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
  v_action public.activity_meetup_personal_actions%rowtype;
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or p_action not in ('report_late', 'request_help', 'take_break') or pg_catalog.char_length(v_note) > 240 then
    raise exception 'invalid_personal_action';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-personal:' || v_actor::text || ':' || p_idempotency_key::text, 0));
  select action.* into v_action from public.activity_meetup_personal_actions as action
  where action.actor_user_id = v_actor and action.idempotency_key = p_idempotency_key for update;
  if v_action.id is not null then
    if v_action.meetup_id <> p_meetup_id or v_action.action <> p_action or v_action.note <> v_note then raise exception 'idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object('action', v_action.action, 'created_at', v_action.created_at, 'reused', true);
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  if v_meetup.id is null or v_meetup.status not in ('open', 'full')
     or not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor)
     or not exists (
       select 1 from public.activity_meetup_members as member
       where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined'
     ) then raise exception 'meetup_personal_action_not_allowed'; end if;
  insert into public.activity_meetup_personal_actions (
    meetup_id, actor_user_id, action, note, scene_id, idempotency_key, resulting_personal_revision
  ) values (p_meetup_id, v_actor, p_action, v_note, null, p_idempotency_key, 0)
  returning * into v_action;
  return pg_catalog.jsonb_build_object('action', v_action.action, 'created_at', v_action.created_at, 'reused', false);
end
$$;

create or replace function public.list_activity_meetups_v3(
  p_category text,
  p_limit integer,
  p_gender_mode text,
  p_scope_type text
)
returns table (
  id uuid, category text, title text, description text, place_name text,
  scheduled_at timestamptz, ends_at timestamptz, capacity smallint, status text,
  member_count bigint, joined boolean, is_host boolean, created_at timestamptz,
  gender_mode text, gender_eligibility text, scope_type text, department_label text,
  activity_key text, revision integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_scope_type is not null and p_scope_type not in ('school', 'department') then raise exception 'invalid_scope_type'; end if;
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
    meetup.scope_type, meetup.department_label, meetup.activity_key, meetup.revision
  from public.activity_meetups as meetup
  where meetup.school = v_school
    and meetup.status in ('open', 'full')
    and meetup.scheduled_at > pg_catalog.clock_timestamp()
    and (p_category is null or meetup.category = p_category)
    and (p_gender_mode is null or meetup.gender_mode = p_gender_mode)
    and (p_scope_type is null or meetup.scope_type = p_scope_type)
    and quantum_private.activity_meetup_scope_eligible(meetup.id, v_actor)
  order by meetup.scheduled_at, meetup.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 30));
end
$$;

create or replace function public.get_my_activity_meetup_detail(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_joined boolean;
  v_scope_eligible boolean;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id;
  v_scope_eligible := quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor);
  if v_meetup.id is null or (not v_scope_eligible and v_meetup.host_user_id <> v_actor) then raise exception 'meetup_not_found'; end if;
  select exists (select 1 from public.activity_meetup_members as member where member.meetup_id = p_meetup_id and member.user_id = v_actor and member.status = 'joined') into v_joined;
  return pg_catalog.jsonb_build_object(
    'id', v_meetup.id,
    'category', v_meetup.category,
    'activity_key', v_meetup.activity_key,
    'title', v_meetup.title,
    'description', v_meetup.description,
    'place_name', v_meetup.place_name,
    'scheduled_at', v_meetup.scheduled_at,
    'ends_at', v_meetup.ends_at,
    'capacity', v_meetup.capacity,
    'status', v_meetup.status,
    'gender_mode', v_meetup.gender_mode,
    'scope_type', v_meetup.scope_type,
    'department_label', v_meetup.department_label,
    'revision', v_meetup.revision,
    'joined', v_joined,
    'is_host', v_meetup.host_user_id = v_actor,
    'scope_eligibility', case when v_scope_eligible then 'eligible' else 'department_restricted' end,
    'member_count', (select pg_catalog.count(*) from public.activity_meetup_members as member where member.meetup_id = p_meetup_id and member.status = 'joined' and quantum_private.activity_meetup_scope_eligible(p_meetup_id, member.user_id)),
    'members', case when v_joined or v_meetup.host_user_id = v_actor then (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'alias', quantum_private.activity_meetup_alias(member.user_id),
        'role', member.role
      ) order by member.joined_at, member.user_id), '[]'::jsonb)
      from public.activity_meetup_members as member
      where member.meetup_id = p_meetup_id and member.status = 'joined'
        and quantum_private.activity_meetup_scope_eligible(p_meetup_id, member.user_id)
    ) else '[]'::jsonb end,
    'events', case when v_joined or v_meetup.host_user_id = v_actor then (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'action', event.action,
        'created_at', event.created_at,
        'resulting_revision', event.resulting_revision,
        'public_payload', event.public_payload
      ) order by event.created_at, event.id), '[]'::jsonb)
      from public.activity_meetup_events as event where event.meetup_id = p_meetup_id
    ) else '[]'::jsonb end
  );
end
$$;

-- Existing clients keep these public signatures. The replacement closes the
-- department scope at the database boundary and serializes capacity changes.
create or replace function public.join_activity_meetup(p_meetup_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_member public.activity_meetup_members%rowtype;
  v_member_count integer;
  v_gender_eligibility text;
  v_school_scope_key text;
  v_department_key text;
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
  if v_meetup.id is null or not quantum_private.activity_meetup_scope_eligible(p_meetup_id, v_actor) then
    raise exception 'meetup_not_found';
  end if;
  if v_meetup.status not in ('open', 'full') or v_meetup.scheduled_at <= pg_catalog.clock_timestamp() then
    raise exception 'meetup_closed';
  end if;
  v_gender_eligibility := quantum_private.meetup_gender_eligibility(v_actor, v_meetup.gender_mode);
  if v_gender_eligibility = 'gender_required' then raise exception 'meetup_gender_required'; end if;
  if v_gender_eligibility <> 'eligible' then raise exception 'meetup_gender_restricted'; end if;

  select member.* into v_member
  from public.activity_meetup_members as member
  where member.meetup_id = p_meetup_id and member.user_id = v_actor
  for update;
  if v_member.status = 'joined' then
    return pg_catalog.jsonb_build_object('joined', true, 'reused', true, 'revision', v_meetup.revision);
  end if;
  select pg_catalog.count(*)::integer into v_member_count
  from public.activity_meetup_members as member
  where member.meetup_id = p_meetup_id and member.status = 'joined'
    and quantum_private.activity_meetup_scope_eligible(p_meetup_id, member.user_id);
  if v_member_count >= v_meetup.capacity then raise exception 'meetup_full'; end if;

  if v_meetup.scope_type = 'department' then
    select identity.school_scope_key, identity.department_key
      into v_school_scope_key, v_department_key
    from quantum_private.get_member_department_identity(v_actor) as identity;
    if v_school_scope_key is null or v_department_key is null then raise exception 'department_identity_required'; end if;
  end if;
  insert into public.activity_meetup_members (
    meetup_id, user_id, role, status, joined_at, left_at,
    school_scope_key_snapshot, department_key_snapshot, membership_revision
  ) values (
    p_meetup_id, v_actor, 'member', 'joined', pg_catalog.clock_timestamp(), null,
    v_school_scope_key, v_department_key, 0
  ) on conflict (meetup_id, user_id) do update
    set role = 'member', status = 'joined', joined_at = excluded.joined_at, left_at = null,
        school_scope_key_snapshot = excluded.school_scope_key_snapshot,
        department_key_snapshot = excluded.department_key_snapshot,
        membership_revision = public.activity_meetup_members.membership_revision + 1;

  v_prior_revision := v_meetup.revision;
  v_member_count := v_member_count + 1;
  update public.activity_meetups as meetup
  set status = case when v_member_count >= meetup.capacity then 'full' else 'open' end,
      revision = meetup.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object(
    'joined', true, 'reused', false, 'member_count', v_member_count,
    'revision', v_prior_revision + 1
  );
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key,
    prior_revision, resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'member_joined', pg_catalog.md5(v_actor::text || ':' || (v_prior_revision + 1)::text), pg_catalog.gen_random_uuid(),
    v_prior_revision, v_prior_revision + 1, '{}'::jsonb, v_result
  );
  return v_result;
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
        when meetup.status = 'full' and meetup.scheduled_at > pg_catalog.clock_timestamp() then 'open'
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
  set scheduled_at = p_scheduled_at, ends_at = p_ends_at, place_name = pg_catalog.btrim(p_place_name),
      revision = meetup.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object(
    'id', p_meetup_id, 'scheduled_at', p_scheduled_at, 'ends_at', p_ends_at,
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

create or replace function public.cancel_my_activity_meetup(
  p_meetup_id uuid,
  p_reason text,
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
  if p_idempotency_key is null or p_expected_revision is null or p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 2 and 240 then raise exception 'invalid_cancel_reason'; end if;
  v_hash := pg_catalog.md5(pg_catalog.concat_ws('|', p_meetup_id::text, pg_catalog.btrim(p_reason)));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-meetup-mutation:' || v_actor::text || ':' || p_idempotency_key::text, 0));
  select event.* into v_event from public.activity_meetup_events as event
  where event.actor_user_id = v_actor and event.idempotency_key = p_idempotency_key for update;
  if v_event.id is not null then
    if v_event.action <> 'cancelled' or v_event.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return v_event.result;
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id = p_meetup_id for update;
  if v_meetup.id is null or v_meetup.host_user_id <> v_actor then raise exception 'meetup_not_found'; end if;
  if v_meetup.status not in ('open', 'full') then raise exception 'meetup_closed'; end if;
  if v_meetup.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  update public.activity_meetups as meetup
  set status = 'cancelled', cancel_reason = pg_catalog.btrim(p_reason), cancelled_at = pg_catalog.clock_timestamp(),
      revision = meetup.revision + 1, updated_at = pg_catalog.clock_timestamp()
  where meetup.id = p_meetup_id;
  v_result := pg_catalog.jsonb_build_object('id', p_meetup_id, 'status', 'cancelled', 'revision', v_meetup.revision + 1);
  insert into public.activity_meetup_events (
    meetup_id, actor_user_id, action, request_hash, idempotency_key, prior_revision,
    resulting_revision, public_payload, result
  ) values (
    p_meetup_id, v_actor, 'cancelled', v_hash, p_idempotency_key, v_meetup.revision,
    v_meetup.revision + 1, pg_catalog.jsonb_build_object('reason', pg_catalog.btrim(p_reason)), v_result
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

-- RPCs are the only public surface. Direct tables remain closed above.
revoke all on function public.create_activity_meetup_v3(text, text, text, text, timestamptz, integer, text, timestamptz, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_activity_meetups_v3(text, integer, text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_my_activity_meetup_detail(uuid) from public, anon, authenticated, service_role;
revoke all on function public.join_activity_meetup(uuid) from public, anon, authenticated, service_role;
revoke all on function public.leave_activity_meetup(uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_my_activity_meetup_schedule(uuid, timestamptz, timestamptz, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancel_my_activity_meetup(uuid, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.complete_my_activity_meetup(uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_my_activity_meetup_chat(uuid) from public, anon, authenticated, service_role;
revoke all on function public.send_my_activity_meetup_chat_message(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_my_activity_meetup_guide(uuid) from public, anon, authenticated, service_role;
revoke all on function public.acknowledge_my_activity_meetup_guide(uuid, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.advance_my_activity_meetup_shared_guide(uuid, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_my_activity_meetup_personal_actions(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_my_activity_meetup_personal_action(uuid, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_department_challenge(text, text, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_my_department_challenges() from public, anon, authenticated, service_role;
revoke all on function public.get_my_department_challenge(uuid) from public, anon, authenticated, service_role;
revoke all on function public.accept_department_challenge_opponent(uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.request_department_challenge_roster(uuid, uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.accept_department_challenge_roster_request(uuid, uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.leave_my_department_challenge_roster(uuid, uuid, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.confirm_my_department_challenge_schedule(uuid, timestamptz, timestamptz, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancel_my_department_challenge(uuid, text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.confirm_my_department_challenge_result(uuid, integer, integer, integer, uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_activity_meetup_v3(text, text, text, text, timestamptz, integer, text, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.list_activity_meetups_v3(text, integer, text, text) to authenticated;
grant execute on function public.get_my_activity_meetup_detail(uuid) to authenticated;
grant execute on function public.join_activity_meetup(uuid) to authenticated;
grant execute on function public.leave_activity_meetup(uuid) to authenticated;
grant execute on function public.update_my_activity_meetup_schedule(uuid, timestamptz, timestamptz, text, integer, uuid) to authenticated;
grant execute on function public.cancel_my_activity_meetup(uuid, text, integer, uuid) to authenticated;
grant execute on function public.complete_my_activity_meetup(uuid, integer, uuid) to authenticated;
grant execute on function public.get_my_activity_meetup_chat(uuid) to authenticated;
grant execute on function public.send_my_activity_meetup_chat_message(uuid, text, uuid) to authenticated;
grant execute on function public.get_my_activity_meetup_guide(uuid) to authenticated;
grant execute on function public.acknowledge_my_activity_meetup_guide(uuid, text, integer, uuid) to authenticated;
grant execute on function public.advance_my_activity_meetup_shared_guide(uuid, text, integer, uuid) to authenticated;
grant execute on function public.get_my_activity_meetup_personal_actions(uuid) to authenticated;
grant execute on function public.record_my_activity_meetup_personal_action(uuid, text, text, uuid) to authenticated;
grant execute on function public.create_department_challenge(text, text, text, integer, uuid) to authenticated;
grant execute on function public.list_my_department_challenges() to authenticated;
grant execute on function public.get_my_department_challenge(uuid) to authenticated;
grant execute on function public.accept_department_challenge_opponent(uuid, integer, uuid) to authenticated;
grant execute on function public.request_department_challenge_roster(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.accept_department_challenge_roster_request(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.leave_my_department_challenge_roster(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.confirm_my_department_challenge_schedule(uuid, timestamptz, timestamptz, text, integer, uuid) to authenticated;
grant execute on function public.cancel_my_department_challenge(uuid, text, integer, uuid) to authenticated;
grant execute on function public.confirm_my_department_challenge_result(uuid, integer, integer, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
-- END SOURCE g7-g8-schema.sql

-- BEGIN SOURCE g5-notification-prelude.sql
-- Extend the installed check expression without losing kinds introduced by earlier migrations.
do $$declare rule text;begin
 select pg_get_expr(conbin,conrelid) into rule from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_kind_check';
 if rule is null then raise exception 'notification_kind_contract_missing';end if;
 alter table public.notifications drop constraint notifications_kind_check;
 execute format('alter table public.notifications add constraint notifications_kind_check check ((%s) or kind = %L)',rule,'community_voice');
end;$$;
create unique index notifications_community_voice_event on public.notifications(user_id,(payload->>'roomId'),(payload->>'revision')) where kind='community_voice';
-- END SOURCE g5-notification-prelude.sql

-- BEGIN SOURCE g5-g6-schema.sql
-- Forward-only voice ledger. No external media, account or payment action is performed by this DDL.

create table quantum_private.voice_policy_ack(user_id uuid primary key references public.users(id) on delete cascade,version text not null,acknowledged_at timestamptz not null default now());
create table quantum_private.voice_restrictions(user_id uuid primary key references public.users(id) on delete cascade,until_at timestamptz not null,reason_code text not null,created_by uuid references public.users(id));
create table quantum_private.voice_rooms(
 id uuid primary key default gen_random_uuid(),created_by uuid not null references public.users(id),school_scope text not null,
 title text not null check(length(title) between 3 and 80),description text not null check(length(description)<=600),
 topic text not null check(topic in ('worries','social','baseball','department')),kind text not null default 'group' check(kind in ('group','random','friend')),
 scope text not null check(scope in ('school','department')),department_key text,capacity int not null check(capacity between 2 and 24),
 starts_at timestamptz not null,ends_at timestamptz not null,status text not null default 'scheduled' check(status in ('scheduled','open','ended','cancelled','delayed')),
 source_url text,source_revision text,source_event_key text,schedule_notice text,schedule_changed_at timestamptz,
 revision int not null default 0,created_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '8 hours'),check(scope<>'department' or department_key is not null),
 check(kind<>'group' or topic<>'baseball' or (source_url ~ '^https://(www\.)?koreabaseball\.com/' and length(source_url)<=500 and length(source_revision) between 3 and 120 and source_event_key ~ '^[a-z0-9][a-z0-9:_-]{2,119}$')),
 check(kind<>'group' or topic='baseball' or source_event_key is null),check(schedule_notice is null or length(schedule_notice) between 3 and 500)
);
create unique index voice_one_active_official_room_per_event on quantum_private.voice_rooms(
 school_scope,scope,coalesce(department_key,''),lower(source_event_key)
) where kind='group' and topic='baseball' and status not in ('ended','cancelled');
create table quantum_private.voice_sessions(
 id uuid primary key default gen_random_uuid(),room_id uuid not null references quantum_private.voice_rooms(id) on delete cascade,
 state text not null check(state in ('proposed','active','ended')),revision int not null default 0,expires_at timestamptz not null,created_at timestamptz not null default now()
);
create unique index voice_one_live_session_per_room on quantum_private.voice_sessions(room_id) where state<>'ended';
create table quantum_private.voice_members(
 session_id uuid not null references quantum_private.voice_sessions(id) on delete cascade,user_id uuid not null references public.users(id) on delete cascade,
 identity uuid not null unique default gen_random_uuid(),generation int not null default 1,mode text not null check(mode in ('listen','speak')),
 accepted_at timestamptz,active boolean not null default true,connected boolean not null default false,disconnected_at timestamptz default now(),provider_sid text,last_provider_event bigint not null default 0,
 joined_at timestamptz not null default now(),left_at timestamptz,primary key(session_id,user_id)
);
create unique index voice_one_active_membership on quantum_private.voice_members(user_id) where active;
create table quantum_private.voice_queue(user_id uuid primary key references public.users(id) on delete cascade,school_scope text not null,topic text not null,search_id uuid not null,created_at timestamptz not null default now(),expires_at timestamptz not null);
create table quantum_private.voice_skips(user_id uuid references public.users(id) on delete cascade,peer_id uuid references public.users(id) on delete cascade,search_id uuid not null,expires_at timestamptz not null,primary key(user_id,peer_id,search_id));
create table quantum_private.voice_searches(user_id uuid primary key references public.users(id) on delete cascade,search_id uuid not null);
create table quantum_private.voice_friend_invitations(id uuid primary key default gen_random_uuid(),sender_id uuid not null references public.users(id) on delete cascade,recipient_id uuid not null references public.users(id) on delete cascade,status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','expired')),session_id uuid references quantum_private.voice_sessions(id),expires_at timestamptz not null,created_at timestamptz not null default now(),check(sender_id<>recipient_id));
create table quantum_private.voice_commands(user_id uuid references public.users(id) on delete cascade,idempotency_key uuid,operation text not null,payload jsonb not null,response jsonb not null,created_at timestamptz not null default now(),primary key(user_id,idempotency_key));
create table quantum_private.voice_media_outbox(id uuid primary key default gen_random_uuid(),room_name text not null,identity text,user_id uuid references public.users(id) on delete set null,action text not null check(action in ('remove','delete_room')),revoked_at timestamptz not null default now(),claim_token uuid,claimed_at timestamptz,attempts int not null default 0,completed_at timestamptz);
create index voice_media_pending on quantum_private.voice_media_outbox(revoked_at) where completed_at is null;
create table quantum_private.voice_webhook_events(id text primary key,received_at timestamptz not null default now());
create table quantum_private.voice_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid references public.users(id) on delete set null,room_id uuid references quantum_private.voice_rooms(id),target_user_id uuid references public.users(id) on delete set null,target_identity uuid,reason text not null check(length(reason) between 3 and 1000),status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),resolution text,reviewer_id uuid references public.users(id),created_at timestamptz not null default now(),resolved_at timestamptz);

create function quantum_private.voice_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from quantum_private.resolve_profile_readiness(p_user) where minimum_signup_complete)
 and exists(select 1 from auth.users where id=p_user and deleted_at is null and (banned_until is null or banned_until<=now()))
 and not exists(select 1 from quantum_private.voice_restrictions where user_id=p_user and until_at>now());
$$;
create function quantum_private.voice_are_friends(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.friendships f join public.friend_requests r on r.id=f.created_from_request_id
 where f.user_id=least(a,b) and f.friend_user_id=greatest(a,b) and f.status='active' and r.status='accepted'
 and least(r.sender_user_id,r.receiver_user_id)=least(a,b) and greatest(r.sender_user_id,r.receiver_user_id)=greatest(a,b));
$$;
create function quantum_private.voice_rules_current(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from quantum_private.voice_policy_ack where user_id=p_user and version='2026-09-07-v1');
$$;
create function quantum_private.voice_room_scope_allows(p_room quantum_private.voice_rooms,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from quantum_private.community_member_profiles p
   where p.user_id=p_user and p.school_scope=p_room.school_scope
     and (p_room.scope='school' or quantum_private.canonical_department_key(p.department)=p_room.department_key)
 );
$$;
create function quantum_private.voice_room_participant_current(p_room quantum_private.voice_rooms,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select quantum_private.voice_eligible(p_user)
   and quantum_private.voice_rules_current(p_user)
   and quantum_private.voice_room_scope_allows(p_room,p_user);
$$;
create function quantum_private.voice_operator_can_manage(p_room quantum_private.voice_rooms,p_user uuid,p_role text) returns boolean language sql immutable security definer set search_path='' as $$
 select p_role='super_admin' or (p_role='admin' and p_room.created_by=p_user);
$$;
create function quantum_private.voice_operator_moderation_json(p_room quantum_private.voice_rooms) returns jsonb language sql stable security definer set search_path='' as $$
 select case when s.id is null then null else jsonb_build_object(
   'sessionId',s.id,'revision',s.revision,
   'participants',coalesce((select jsonb_agg(jsonb_build_object(
     'identity',m.identity,'displayName',p.display_name,'mode',m.mode,'connected',m.connected
   ) order by m.joined_at,m.identity)
   from quantum_private.voice_members m
   join quantum_private.community_member_profiles p on p.user_id=m.user_id
   where m.session_id=s.id and m.active and (m.connected or m.disconnected_at>now()-interval '2 minutes') and quantum_private.voice_room_participant_current(p_room,m.user_id)),'[]'::jsonb)
 ) end
 from (select v.id,v.revision from quantum_private.voice_sessions v where v.room_id=p_room.id and v.state<>'ended' order by v.created_at desc limit 1) s;
$$;
create function quantum_private.voice_emit_room_notice(p_room_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare n integer:=0;
begin
 insert into public.notifications(user_id,kind,payload)
 select distinct m.user_id,'community_voice',jsonb_build_object('roomId',r.id,'status',r.status,'revision',r.revision)
 from quantum_private.voice_rooms r
 join quantum_private.voice_sessions s on s.room_id=r.id
 join quantum_private.voice_members m on m.session_id=s.id
 where r.id=p_room_id;
 get diagnostics n=row_count;
 return n;
end;$$;
create function quantum_private.voice_summary(p_scope text,p_basis text,p_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('scopeId',p_scope,'asOf',now(),'basis',p_basis,'disclosureBasis','all_valid_participants','policyVersion','2026-09-07-mandatory-aggregate-v1',
 'totalPeople',count(*),'genderBreakdown',jsonb_build_object('malePeople',count(*) filter(where community_gender='male'),'femalePeople',count(*) filter(where community_gender='female'),'otherOrUnspecifiedPeople',count(*) filter(where community_gender not in ('male','female'))))
 from quantum_private.community_member_profiles where user_id=any(coalesce(p_ids,'{}'::uuid[]));
$$;
create function quantum_private.voice_room_json(r quantum_private.voice_rooms) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'title',r.title,'description',r.description,'topic',r.topic,'scope',r.scope,'departmentKey',r.department_key,'capacity',r.capacity,'startsAt',r.starts_at,'endsAt',r.ends_at,'status',r.status,'revision',r.revision,'sourceUrl',r.source_url,'sourceRevision',r.source_revision,'sourceEventKey',r.source_event_key,'scheduleNotice',r.schedule_notice,'scheduleChangedAt',r.schedule_changed_at,
 'connected',quantum_private.voice_summary(r.id::text,'connected_to_voice',array(select m.user_id from quantum_private.voice_members m join quantum_private.voice_sessions s on s.id=m.session_id where s.room_id=r.id and s.state='active' and m.active and m.connected and quantum_private.voice_room_participant_current(r,m.user_id))),
 'waiting',quantum_private.voice_summary(r.id::text,'waiting_for_voice',array(select m.user_id from quantum_private.voice_members m join quantum_private.voice_sessions s on s.id=m.session_id where s.room_id=r.id and s.state<>'ended' and m.active and not m.connected and m.disconnected_at>now()-interval '2 minutes' and quantum_private.voice_room_participant_current(r,m.user_id))));
$$;
create function quantum_private.voice_revoke_member(p_session uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare m quantum_private.voice_members%rowtype;
begin
 update quantum_private.voice_members set active=false,connected=false,disconnected_at=now(),left_at=now(),generation=generation+1 where session_id=p_session and user_id=p_user and active returning * into m;
 if found then insert into quantum_private.voice_media_outbox(room_name,identity,user_id,action) values('qv-'||p_session::text,m.identity::text,m.user_id,'remove');end if;
end;$$;
create function quantum_private.voice_end_session(p_session uuid) returns void language plpgsql security definer set search_path='' as $$
declare m record;
begin
 for m in select user_id from quantum_private.voice_members where session_id=p_session and active loop perform quantum_private.voice_revoke_member(p_session,m.user_id);end loop;
 update quantum_private.voice_sessions set state='ended',revision=revision+1 where id=p_session and state<>'ended';
 if found then insert into quantum_private.voice_media_outbox(room_name,action) values('qv-'||p_session::text,'delete_room');end if;
end;$$;
create function quantum_private.voice_session_json(p_session uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('session',jsonb_build_object('id',s.id,'roomId',r.id,'kind',r.kind,'state',case when m.active then s.state else 'ended' end,'revision',s.revision,'generation',m.generation,'mode',m.mode,'accepted',m.accepted_at is not null,'peerAccepted',not exists(select 1 from quantum_private.voice_members peer where peer.session_id=s.id and peer.active and peer.accepted_at is null),
 'participants',case when m.active then coalesce((select jsonb_agg(jsonb_build_object('identity',v.identity,'displayName',case when r.kind='friend' then coalesce(p.friend_recognition_name,p.display_name) else p.display_name end,'mode',v.mode,'isModerator',r.kind='group' and v.user_id=r.created_by)) from quantum_private.voice_members v join quantum_private.community_member_profiles p on p.user_id=v.user_id where v.session_id=s.id and v.active and (v.connected or v.disconnected_at>now()-interval '2 minutes') and quantum_private.voice_room_participant_current(r,v.user_id)),'[]'::jsonb) else '[]'::jsonb end), 'room',quantum_private.voice_room_json(r))
 from quantum_private.voice_sessions s join quantum_private.voice_rooms r on r.id=s.room_id join quantum_private.voice_members m on m.session_id=s.id and m.user_id=p_user where s.id=p_session;
$$;

create function public.community_voice_command(p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); profile quantum_private.community_member_profiles%rowtype; role_name text; op boolean;
 r quantum_private.voice_rooms%rowtype;s quantum_private.voice_sessions%rowtype;m quantum_private.voice_members%rowtype;
 other quantum_private.voice_queue%rowtype;inv quantum_private.voice_friend_invitations%rowtype;cmd quantum_private.voice_commands%rowtype;
 key uuid; rid uuid;sid uuid;friend uuid;target uuid;action text;mode text;rev int;result jsonb;search uuid;v_source text;
 can_manage boolean:=false;operator_management boolean:=false;cleanup_operation boolean:=false;new_start timestamptz;new_end timestamptz;notice text;new_source_revision text;
begin
 if u is null then raise exception 'not_authenticated';end if;
 select access_role into role_name from public.get_access_context();op:=coalesce(role_name in ('admin','super_admin'),false);
 operator_management:=op and (
   p_operation in ('operator_rooms','create_room','room','review_reports','resolve_report')
   or (p_operation='room_command' and p_payload->>'action' in ('open','delay','cancel','close','reschedule'))
   or (p_operation='session_command' and p_payload->>'action'='kick')
 );
 cleanup_operation:=(p_operation='session_command' and p_payload->>'action'='leave')
   or (p_operation='queue_command' and p_payload->>'action'='leave');
 if exists(select 1 from quantum_private.voice_restrictions where user_id=u and until_at>now())
    and not operator_management
    and not cleanup_operation
 then raise exception 'voice_restricted';end if;
 if not quantum_private.voice_eligible(u)
    and not operator_management
    and not cleanup_operation
 then raise exception 'minimum_signup_required';end if;
 select * into profile from quantum_private.community_member_profiles where user_id=u;
 if p_operation not in ('list_rooms','room','session','queue_status','friend_invitations','operator_rooms','token_context','review_reports','acknowledge_rules') then
   key:=(p_payload->>'idempotencyKey')::uuid;if key is null then raise exception 'invalid_input';end if;
   -- One global arbitration lock makes cross-user queue/membership/block transitions deterministic.
   perform pg_advisory_xact_lock(hashtextextended('quantum-voice-ledger-v1',0));
   select * into cmd from quantum_private.voice_commands where user_id=u and idempotency_key=key;
   if found then if cmd.operation<>p_operation or cmd.payload<>p_payload then raise exception 'idempotency_conflict';end if;return cmd.response;end if;
   if (select count(*) from quantum_private.voice_commands where user_id=u and created_at>now()-interval '1 minute')>=30 then raise exception 'rate_limited';end if;
 end if;
 if p_operation='acknowledge_rules' then
   insert into quantum_private.voice_policy_ack(user_id,version) values(u,'2026-09-07-v1') on conflict(user_id) do update set version=excluded.version,acknowledged_at=now();return jsonb_build_object('acknowledged',true);
 elsif p_operation in ('list_rooms','operator_rooms') then
   if p_operation='operator_rooms' and not op then raise exception 'forbidden';end if;
   return jsonb_build_object('rooms',coalesce((select jsonb_agg(quantum_private.voice_room_json(x) order by x.starts_at) from (select * from quantum_private.voice_rooms v where kind='group'
   and ((p_operation='operator_rooms' and quantum_private.voice_operator_can_manage(v,u,role_name)) or (p_operation='list_rooms' and quantum_private.voice_room_scope_allows(v,u)))
   and (ends_at>now()-interval '1 day') order by starts_at limit 100) x),'[]'::jsonb));
 elsif p_operation='create_room' then
   if not op then raise exception 'forbidden';end if;
   if profile.user_id is null or nullif(btrim(profile.school_scope),'') is null then raise exception 'minimum_signup_required';end if;
   if p_payload->>'scope' not in ('school','department') then raise exception 'invalid_input';end if;
   insert into quantum_private.voice_rooms(created_by,school_scope,title,description,topic,scope,department_key,capacity,starts_at,ends_at,source_url,source_revision,source_event_key)
   values(u,profile.school_scope,btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),p_payload->>'topic',p_payload->>'scope',quantum_private.canonical_department_key(p_payload->>'departmentKey'),(p_payload->>'capacity')::int,(p_payload->>'startsAt')::timestamptz,(p_payload->>'endsAt')::timestamptz,p_payload->>'sourceUrl',p_payload->>'sourceRevision',lower(btrim(p_payload->>'sourceEventKey'))) returning * into r;
   result:=jsonb_build_object('room',quantum_private.voice_room_json(r));
 elsif p_operation in ('room','room_command') then
   rid:=(p_payload->>'roomId')::uuid;select * into r from quantum_private.voice_rooms where id=rid for update;
   if not found then raise exception 'not_found';end if;
   can_manage:=quantum_private.voice_operator_can_manage(r,u,role_name);
   if not can_manage and not quantum_private.voice_room_scope_allows(r,u) then raise exception 'not_found';end if;
   if r.kind<>'group' then raise exception 'not_found';end if;
   if p_operation='room' then return jsonb_build_object('room',quantum_private.voice_room_json(r),'moderation',case when can_manage then quantum_private.voice_operator_moderation_json(r) else null end);end if;
   action:=p_payload->>'action';rev:=(p_payload->>'expectedRevision')::int;
   if rev is null or rev<>r.revision then raise exception 'stale_revision';end if;
   if action='join' then
     if r.status<>'open' or now()<r.starts_at or now()>=r.ends_at then raise exception 'room_closed';end if;
     if not exists(select 1 from quantum_private.voice_policy_ack where user_id=u and version='2026-09-07-v1') then raise exception 'voice_rules_required';end if;
     if exists(select 1 from quantum_private.voice_members where user_id=u and active) or exists(select 1 from quantum_private.voice_queue where user_id=u and expires_at>now()) then raise exception 'already_in_voice';end if;
     mode:=p_payload->>'mode';if mode is null or mode not in ('listen','speak') then raise exception 'invalid_input';end if;
     select * into s from quantum_private.voice_sessions where room_id=r.id and state<>'ended' for update;
     if not found then insert into quantum_private.voice_sessions(room_id,state,expires_at) values(r.id,'active',r.ends_at) returning * into s;end if;
     if (select count(*) from quantum_private.voice_members where session_id=s.id and active)>=r.capacity then raise exception 'room_full';end if;
     if exists(select 1 from quantum_private.voice_members where session_id=s.id and active and quantum_private.tonight_invite_pair_is_blocked(u,user_id)) then raise exception 'blocked_pair';end if;
     if exists(select 1 from quantum_private.voice_media_outbox e where e.user_id=u and e.completed_at is null) then raise exception 'media_cleanup_pending';end if;
     insert into quantum_private.voice_members(session_id,user_id,mode,accepted_at) values(s.id,u,mode,now()) on conflict(session_id,user_id) do update set identity=gen_random_uuid(),generation=quantum_private.voice_members.generation+1,mode=excluded.mode,accepted_at=now(),active=true,connected=false,disconnected_at=now(),left_at=null,joined_at=now(),last_provider_event=0,provider_sid=null;
     update quantum_private.voice_sessions set revision=revision+1 where id=s.id;update quantum_private.voice_rooms set revision=revision+1 where id=r.id;
     result:=jsonb_build_object('sessionId',s.id,'roomId',r.id);
   elsif action in ('open','delay','cancel','close','reschedule') then
     if not can_manage then raise exception 'forbidden';end if;
     if r.status in ('ended','cancelled') then raise exception 'room_closed';end if;
     if action in ('cancel','close','delay','reschedule') then for s in select * from quantum_private.voice_sessions where room_id=r.id and state<>'ended' loop perform quantum_private.voice_end_session(s.id);end loop;end if;
     if action='reschedule' then
       new_start:=(p_payload->>'startsAt')::timestamptz;new_end:=(p_payload->>'endsAt')::timestamptz;notice:=btrim(coalesce(p_payload->>'scheduleNotice',''));new_source_revision:=btrim(coalesce(p_payload->>'sourceRevision',r.source_revision));
       if new_start is null or new_end is null or new_end<=new_start or new_end>new_start+interval '8 hours' or length(notice) not between 3 and 500 then raise exception 'invalid_input';end if;
       if r.topic='baseball' and length(new_source_revision)<3 then raise exception 'invalid_input';end if;
       update quantum_private.voice_rooms set starts_at=new_start,ends_at=new_end,status='scheduled',schedule_notice=notice,schedule_changed_at=now(),source_revision=new_source_revision,revision=revision+1 where id=r.id returning * into r;
     else
       notice:=nullif(btrim(p_payload->>'scheduleNotice'),'');
       if action='delay' and coalesce(length(notice),0) not between 3 and 500 then raise exception 'invalid_input';end if;
       update quantum_private.voice_rooms set status=case action when 'open' then 'open' when 'delay' then 'delayed' when 'cancel' then 'cancelled' else 'ended' end,schedule_notice=case when action='delay' then notice else schedule_notice end,schedule_changed_at=case when action='delay' then now() else schedule_changed_at end,revision=revision+1 where id=r.id returning * into r;
     end if;
     if action in ('delay','reschedule','cancel','close') then perform quantum_private.voice_emit_room_notice(r.id);end if;
     result:=jsonb_build_object('room',quantum_private.voice_room_json(r));
   else raise exception 'invalid_input';end if;
 elsif p_operation in ('session','session_command','token_context') then
   sid:=(p_payload->>'sessionId')::uuid;select * into s from quantum_private.voice_sessions where id=sid for update;
   if s.id is null then raise exception 'not_found';end if;
   select * into r from quantum_private.voice_rooms where id=s.room_id;
   can_manage:=quantum_private.voice_operator_can_manage(r,u,role_name);
   select * into m from quantum_private.voice_members where session_id=sid and user_id=u;
   if p_operation='session' then
     if m.user_id is null or not m.active or (not m.connected and m.disconnected_at<=now()-interval '2 minutes') or not quantum_private.voice_room_participant_current(r,u) then raise exception 'not_found';end if;
     return quantum_private.voice_session_json(sid,u);
   end if;
   if p_operation='token_context' then
     if m.user_id is null or not quantum_private.voice_room_participant_current(r,u) then raise exception 'not_found';end if;
     if s.state<>'active' or not m.active or m.accepted_at is null or s.expires_at<=now() or r.status<>'open' or (not m.connected and m.disconnected_at<=now()-interval '2 minutes') then raise exception 'acceptance_required';end if;
     if exists(select 1 from quantum_private.voice_members v where v.session_id=sid and v.active and (not quantum_private.voice_room_participant_current(r,v.user_id) or quantum_private.tonight_invite_pair_is_blocked(u,v.user_id))) then raise exception 'blocked_pair';end if;
     if r.kind='friend' and exists(select 1 from quantum_private.voice_members v where v.session_id=sid and v.user_id<>u and not quantum_private.voice_are_friends(u,v.user_id)) then raise exception 'forbidden';end if;
     if exists(select 1 from quantum_private.voice_media_outbox e where e.user_id=u and e.completed_at is null) then raise exception 'media_cleanup_pending';end if;
     return jsonb_build_object('identity',m.identity,'roomName','qv-'||sid::text,'generation',m.generation,'mode',m.mode,'displayName',case when r.kind='friend' then coalesce(profile.friend_recognition_name,profile.display_name) else profile.display_name end);
   end if;
   action:=p_payload->>'action';rev:=(p_payload->>'expectedRevision')::int;
   if rev is null or rev<>s.revision then raise exception 'stale_revision';end if;
   if action='kick' then
     if r.kind<>'group' or not can_manage then raise exception 'forbidden';end if;
     target:=(p_payload->>'targetIdentity')::uuid;select user_id into friend from quantum_private.voice_members where session_id=sid and identity=target and active;
     if friend is null then raise exception 'not_found';end if;
     perform quantum_private.voice_revoke_member(sid,friend);
   else
     if m.user_id is null then raise exception 'not_found';end if;
     if not m.active or s.state='ended' then raise exception 'room_closed';end if;
     if action<>'leave' and not quantum_private.voice_room_participant_current(r,u) then raise exception 'forbidden';end if;
   if action='accept' then
     if s.expires_at<=now() then raise exception 'room_closed';end if;
     if exists(select 1 from quantum_private.voice_members v where v.session_id=sid and v.active and (not quantum_private.voice_room_participant_current(r,v.user_id) or quantum_private.tonight_invite_pair_is_blocked(u,v.user_id))) then raise exception 'blocked_pair';end if;
     update quantum_private.voice_members set accepted_at=now() where session_id=sid and user_id=u;
     if not exists(select 1 from quantum_private.voice_members where session_id=sid and active and accepted_at is null) then update quantum_private.voice_sessions set state='active',expires_at=r.ends_at where id=sid;end if;
   elsif action in ('leave','next') then
     if action='next' and r.kind<>'random' then raise exception 'invalid_input';end if;
     if r.kind='group' then perform quantum_private.voice_revoke_member(sid,u);
     else
       if action='next' then insert into quantum_private.voice_skips(user_id,peer_id,search_id,expires_at) select u,v.user_id,q.search_id,now()+interval '1 hour' from quantum_private.voice_members v cross join quantum_private.voice_searches q where v.session_id=sid and v.user_id<>u and q.user_id=u on conflict do nothing;end if;
       perform quantum_private.voice_end_session(sid);
     end if;
   elsif action='mode' then
     mode:=p_payload->>'mode';if mode is null or mode not in ('listen','speak') then raise exception 'invalid_input';end if;
     insert into quantum_private.voice_media_outbox(room_name,identity,user_id,action) values('qv-'||sid::text,m.identity::text,u,'remove');
     update quantum_private.voice_members set mode=p_payload->>'mode',identity=gen_random_uuid(),generation=generation+1,connected=false,disconnected_at=now(),provider_sid=null,last_provider_event=0 where session_id=sid and user_id=u;
   else raise exception 'invalid_input';end if;
   end if;
   update quantum_private.voice_sessions set revision=revision+1 where id=sid;
   result:=case when action='kick' then jsonb_build_object('moderation',quantum_private.voice_operator_moderation_json(r)) else quantum_private.voice_session_json(sid,u) end;
 elsif p_operation in ('queue_status','queue_command') then
   if p_operation='queue_command' then
     action:=p_payload->>'action';search:=(p_payload->>'searchId')::uuid;
     if action='leave' then
       delete from quantum_private.voice_queue where user_id=u and search_id=search;
       if not found and exists(select 1 from quantum_private.voice_queue where user_id=u and expires_at>now()) then raise exception 'stale_revision';end if;
     elsif action='join' then
       if not quantum_private.voice_rules_current(u) then raise exception 'voice_rules_required';end if;
       if p_payload->>'topic' not in ('worries','social','baseball','department') or search is null then raise exception 'invalid_input';end if;
       if exists(select 1 from quantum_private.voice_members where user_id=u and active) then raise exception 'already_in_voice';end if;
       if exists(select 1 from quantum_private.voice_media_outbox e where e.user_id=u and e.completed_at is null) then raise exception 'media_cleanup_pending';end if;
       delete from quantum_private.voice_queue where expires_at<=now();
       insert into quantum_private.voice_searches values(u,search) on conflict(user_id) do update set search_id=excluded.search_id;
       insert into quantum_private.voice_queue(user_id,school_scope,topic,search_id,created_at,expires_at) values(u,profile.school_scope,p_payload->>'topic',search,now(),now()+interval '5 minutes') on conflict(user_id) do update set school_scope=excluded.school_scope,topic=excluded.topic,search_id=excluded.search_id,created_at=excluded.created_at,expires_at=excluded.expires_at;
       select * into other from quantum_private.voice_queue q where q.user_id<>u and q.school_scope=profile.school_scope and q.topic=p_payload->>'topic' and q.expires_at>now() and quantum_private.voice_eligible(q.user_id) and quantum_private.voice_rules_current(q.user_id)
        and exists(select 1 from quantum_private.community_member_profiles qp where qp.user_id=q.user_id and qp.school_scope=q.school_scope)
        and not exists(select 1 from quantum_private.voice_members vm where vm.user_id=q.user_id and vm.active)
        and not quantum_private.tonight_invite_pair_is_blocked(u,q.user_id)
        and not exists(select 1 from quantum_private.voice_skips k where k.expires_at>now() and ((k.user_id=u and k.peer_id=q.user_id and k.search_id=search) or (k.user_id=q.user_id and k.peer_id=u and k.search_id=q.search_id)))
       order by q.created_at,q.user_id limit 1 for update;
       if found then
         insert into quantum_private.voice_rooms(created_by,school_scope,title,description,topic,kind,scope,capacity,starts_at,ends_at,status) values(u,profile.school_scope,'둘이 나누는 이야기','서로 수락한 뒤 목소리로 만나요.',p_payload->>'topic','random','school',2,now(),now()+interval '1 hour','open') returning * into r;
         insert into quantum_private.voice_sessions(room_id,state,expires_at) values(r.id,'proposed',now()+interval '45 seconds') returning * into s;
         insert into quantum_private.voice_members(session_id,user_id,mode) values(s.id,u,'speak'),(s.id,other.user_id,'speak');
         delete from quantum_private.voice_queue where user_id in (u,other.user_id);
         update quantum_private.voice_friend_invitations set status='cancelled' where status='pending' and expires_at>now() and (sender_id in (u,other.user_id) or recipient_id in (u,other.user_id));
       end if;
     else raise exception 'invalid_input';end if;
   end if;
   select vm.* into m from quantum_private.voice_members vm join quantum_private.voice_sessions vs on vs.id=vm.session_id join quantum_private.voice_rooms vr on vr.id=vs.room_id where vm.user_id=u and vm.active and quantum_private.voice_room_participant_current(vr,u);
   result:=jsonb_build_object('sessionId',m.session_id,'queued',exists(select 1 from quantum_private.voice_queue where user_id=u and expires_at>now()),
     'waiting',quantum_private.voice_summary('random:'||profile.school_scope,'waiting_for_voice',array(select user_id from quantum_private.voice_queue where school_scope=profile.school_scope and expires_at>now() and quantum_private.voice_eligible(user_id) and quantum_private.voice_rules_current(user_id))));
 elsif p_operation in ('friend_invitations','invite_friend','accept_friend') then
   if p_operation='friend_invitations' then return jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'fromUserId',i.sender_id,'displayName',coalesce(p.friend_recognition_name,p.display_name),'expiresAt',i.expires_at)) from quantum_private.voice_friend_invitations i join quantum_private.community_member_profiles p on p.user_id=i.sender_id where i.recipient_id=u and i.status='pending' and i.expires_at>now() and p.school_scope=profile.school_scope and quantum_private.voice_are_friends(u,i.sender_id) and quantum_private.voice_eligible(i.sender_id) and quantum_private.voice_rules_current(i.sender_id)),'[]'::jsonb));end if;
   if p_operation='invite_friend' then
     friend:=(p_payload->>'friendUserId')::uuid;
     if not quantum_private.voice_rules_current(u) then raise exception 'voice_rules_required';end if;
     if not quantum_private.voice_are_friends(u,friend) or not quantum_private.voice_eligible(friend) or not exists(select 1 from quantum_private.community_member_profiles p where p.user_id=friend and p.school_scope=profile.school_scope) then raise exception 'forbidden';end if;
     if exists(select 1 from quantum_private.voice_members where user_id in (u,friend) and active) or exists(select 1 from quantum_private.voice_queue where user_id in (u,friend) and expires_at>now()) then raise exception 'already_in_voice';end if;
     if exists(select 1 from quantum_private.voice_media_outbox e where e.user_id in (u,friend) and e.completed_at is null) then raise exception 'media_cleanup_pending';end if;
     if exists(select 1 from quantum_private.voice_friend_invitations where sender_id=u and status='pending' and expires_at>now()) then raise exception 'rate_limited';end if;
     insert into quantum_private.voice_friend_invitations(sender_id,recipient_id,expires_at) values(u,friend,now()+interval '1 minute') returning * into inv;
     result:=jsonb_build_object('invitationId',inv.id,'status','pending','expiresAt',inv.expires_at);
   else
     select * into inv from quantum_private.voice_friend_invitations where id=(p_payload->>'invitationId')::uuid and recipient_id=u for update;
     if not found or inv.status<>'pending' or inv.expires_at<=now() then raise exception 'not_found';end if;
     if not quantum_private.voice_rules_current(u) or not quantum_private.voice_rules_current(inv.sender_id) then raise exception 'voice_rules_required';end if;
     if not quantum_private.voice_are_friends(u,inv.sender_id) or not quantum_private.voice_eligible(inv.sender_id) or not exists(select 1 from quantum_private.community_member_profiles p where p.user_id=inv.sender_id and p.school_scope=profile.school_scope) then raise exception 'forbidden';end if;
     if exists(select 1 from quantum_private.voice_members where user_id in (u,inv.sender_id) and active) or exists(select 1 from quantum_private.voice_queue where user_id in (u,inv.sender_id) and expires_at>now()) then raise exception 'already_in_voice';end if;
     if exists(select 1 from quantum_private.voice_media_outbox e where e.user_id in (u,inv.sender_id) and e.completed_at is null) then raise exception 'media_cleanup_pending';end if;
     insert into quantum_private.voice_rooms(created_by,school_scope,title,description,topic,kind,scope,capacity,starts_at,ends_at,status) values(inv.sender_id,profile.school_scope,'친구와 이야기','친구가 수락한 통화예요.','social','friend','school',2,now(),now()+interval '2 hours','open') returning * into r;
     insert into quantum_private.voice_sessions(room_id,state,expires_at) values(r.id,'active',r.ends_at) returning * into s;
     insert into quantum_private.voice_members(session_id,user_id,mode,accepted_at) values(s.id,u,'speak',now()),(s.id,inv.sender_id,'speak',now());
     update quantum_private.voice_friend_invitations set status='accepted',session_id=s.id where id=inv.id;
     update quantum_private.voice_friend_invitations set status='cancelled' where id<>inv.id and status='pending' and (sender_id in (u,inv.sender_id) or recipient_id in (u,inv.sender_id));
     result:=jsonb_build_object('sessionId',s.id,'roomId',r.id);
   end if;
 elsif p_operation='report' then
   sid:=(p_payload->>'sessionId')::uuid;target:=(p_payload->>'targetIdentity')::uuid;
   select * into m from quantum_private.voice_members where session_id=sid and user_id=u;
   select user_id into friend from quantum_private.voice_members where session_id=sid and identity=target;
   if m.user_id is null or friend is null or friend=u then raise exception 'not_found';end if;
   if length(btrim(coalesce(p_payload->>'reason',''))) not between 3 and 1000 then raise exception 'invalid_input';end if;
   select * into s from quantum_private.voice_sessions where id=sid;
   insert into quantum_private.voice_reports(reporter_id,room_id,target_user_id,target_identity,reason) values(u,s.room_id,friend,target,btrim(p_payload->>'reason')) returning id into rid;
   if coalesce((p_payload->>'block')::boolean,false) then
     perform set_config('app.bypass_friendships_guard','on',true);
     insert into public.friendships(user_id,friend_user_id,status,blocked_by,blocked_at) values(least(u,friend),greatest(u,friend),'blocked',u,now())
     on conflict(user_id,friend_user_id) do update set status='blocked',blocked_by=case when public.friendships.status='blocked' then public.friendships.blocked_by else u end,blocked_at=coalesce(public.friendships.blocked_at,now());
     perform set_config('app.bypass_friendships_guard','off',true);
     -- INSERT of a new blocked pair has no UPDATE trigger; revoke the blocker's own membership explicitly.
     select * into r from quantum_private.voice_rooms where id=s.room_id;
     if r.kind='group' then perform quantum_private.voice_revoke_member(sid,u);else perform quantum_private.voice_end_session(sid);end if;
   end if;
   result:=jsonb_build_object('reportId',rid,'status','open');
 elsif p_operation='review_reports' then
   if not op then raise exception 'forbidden';end if;
   return jsonb_build_object('reports',coalesce((select jsonb_agg(to_jsonb(v)) from(select report.id,report.room_id,report.reason,report.status,report.created_at,report.resolution from quantum_private.voice_reports report join quantum_private.voice_rooms room on room.id=report.room_id where role_name='super_admin' or (role_name='admin' and room.created_by=u) order by report.created_at desc limit 100)v),'[]'::jsonb));
 elsif p_operation='resolve_report' then
   if not op then raise exception 'forbidden';end if;
   if p_payload->>'status' not in ('reviewing','resolved','dismissed') or length(btrim(coalesce(p_payload->>'resolution',''))) not between 3 and 1000 then raise exception 'invalid_input';end if;
   update quantum_private.voice_reports report set status=p_payload->>'status',resolution=btrim(p_payload->>'resolution'),reviewer_id=u,resolved_at=case when p_payload->>'status' in ('resolved','dismissed') then now() else null end from quantum_private.voice_rooms room where report.id=(p_payload->>'reportId')::uuid and room.id=report.room_id and (role_name='super_admin' or (role_name='admin' and room.created_by=u)) and report.status in ('open','reviewing') returning report.id into rid;
   if rid is null then raise exception 'not_found';end if;
   result:=jsonb_build_object('reportId',rid,'status',p_payload->>'status');
 else raise exception 'invalid_input';end if;
 if key is not null then insert into quantum_private.voice_commands values(u,key,p_operation,p_payload,result,now());end if;
 return result;
end;$$;

-- Outbox leases prevent concurrent workers from treating another worker's result as their own.
create function public.claim_voice_media_effects(p_limit int default 25,p_session_id uuid default null,p_room_id uuid default null) returns setof quantum_private.voice_media_outbox language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden';end if;
 return query update quantum_private.voice_media_outbox e set claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1 where e.id in(
   select pending.id from quantum_private.voice_media_outbox pending
   where pending.completed_at is null and (pending.claimed_at is null or pending.claimed_at<now()-interval '1 minute')
     and (p_session_id is null or pending.room_name='qv-'||p_session_id::text)
     and (p_room_id is null or exists(select 1 from quantum_private.voice_sessions scoped where scoped.room_id=p_room_id and pending.room_name='qv-'||scoped.id::text))
   order by pending.revoked_at limit least(greatest(p_limit,1),50) for update skip locked
 ) returning e.*;
end;$$;
create function public.finish_voice_media_effect(p_id uuid,p_claim_token uuid,p_success boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden';end if;
 update quantum_private.voice_media_outbox set completed_at=case when p_success then now() else null end,claimed_at=case when p_success then claimed_at else now()-interval '45 seconds' end where id=p_id and claim_token=p_claim_token and completed_at is null;
 return found;
end;$$;
create function public.apply_voice_provider_event(p_event_id text,p_event text,p_room text,p_identity uuid,p_sid text,p_created_at bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare m quantum_private.voice_members%rowtype;s quantum_private.voice_sessions%rowtype;r quantum_private.voice_rooms%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum-voice-ledger-v1',0));
 insert into quantum_private.voice_webhook_events(id) values(p_event_id) on conflict do nothing;if not found then return jsonb_build_object('replayed',true);end if;
 select * into m from quantum_private.voice_members where identity=p_identity for update;select * into s from quantum_private.voice_sessions where id=m.session_id;select * into r from quantum_private.voice_rooms where id=s.room_id;
 if m.user_id is null then
   if p_event='participant_joined' and p_room ~ '^qv-[0-9a-f-]{36}$' then insert into quantum_private.voice_media_outbox(room_name,identity,action) values(p_room,p_identity::text,'remove');end if;
   return jsonb_build_object('ignored',true);
 end if;
 if p_room<>'qv-'||m.session_id::text then return jsonb_build_object('ignored',true);end if;
 if p_created_at<m.last_provider_event then return jsonb_build_object('ignored',true);end if;
 if p_event='participant_joined' then
   if p_created_at=m.last_provider_event and not m.connected and m.provider_sid is not distinct from p_sid then return jsonb_build_object('ignored',true);end if;
   if not m.active or s.state<>'active' or s.expires_at<=now() or r.status<>'open' or (not m.connected and m.disconnected_at<=now()-interval '2 minutes') or not quantum_private.voice_room_participant_current(r,m.user_id)
      or exists(select 1 from quantum_private.voice_members v where v.session_id=m.session_id and v.active and quantum_private.tonight_invite_pair_is_blocked(m.user_id,v.user_id)) then
     if m.active then
       if r.kind='group' then perform quantum_private.voice_revoke_member(m.session_id,m.user_id);else perform quantum_private.voice_end_session(m.session_id);end if;
     else insert into quantum_private.voice_media_outbox(room_name,identity,action) values(p_room,p_identity::text,'remove');end if;
     return jsonb_build_object('revoked',true);
   end if;
   update quantum_private.voice_members set connected=true,disconnected_at=null,provider_sid=p_sid,last_provider_event=p_created_at where identity=p_identity;
 elsif p_event in ('participant_left','participant_connection_aborted') and (m.provider_sid=p_sid or m.provider_sid is null) then
   update quantum_private.voice_members set connected=false,disconnected_at=now(),last_provider_event=p_created_at where identity=p_identity;
 end if;
 return jsonb_build_object('accepted',true);
end;$$;

-- Membership revocation is synchronous with a user block. The blocker leaves; other participants are not globally kicked.
create function quantum_private.voice_friendship_revoke_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare m record;caller uuid:=auth.uid();
begin
 if new.status is distinct from old.status and new.status<>'active' then
   perform pg_advisory_xact_lock(hashtextextended('quantum-voice-ledger-v1',0));
   for m in select a.session_id,r.kind from quantum_private.voice_members a join quantum_private.voice_members b on b.session_id=a.session_id join quantum_private.voice_sessions s on s.id=a.session_id join quantum_private.voice_rooms r on r.id=s.room_id
     where a.user_id=new.user_id and b.user_id=new.friend_user_id and a.active and b.active loop
     if m.kind in ('random','friend') then perform quantum_private.voice_end_session(m.session_id);
     elsif new.status='blocked' and caller in(new.user_id,new.friend_user_id) then perform quantum_private.voice_revoke_member(m.session_id,caller);end if;
   end loop;
 end if;return new;
end;$$;
create trigger voice_friendship_revoke after update of status on public.friendships for each row execute function quantum_private.voice_friendship_revoke_trigger();

create function public.sweep_voice_sessions() returns jsonb language plpgsql security definer set search_path='' as $$
declare s record;m record;n int:=0;g int:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum-voice-ledger-v1',0));
 for s in select id from quantum_private.voice_sessions where state<>'ended' and expires_at<=now() loop perform quantum_private.voice_end_session(s.id);n:=n+1;end loop;
 for m in select v.session_id,v.user_id,r.kind from quantum_private.voice_members v join quantum_private.voice_sessions vsess on vsess.id=v.session_id join quantum_private.voice_rooms r on r.id=vsess.room_id where v.active and not v.connected and v.disconnected_at<=now()-interval '2 minutes' loop
   if m.kind='group' then perform quantum_private.voice_revoke_member(m.session_id,m.user_id);else perform quantum_private.voice_end_session(m.session_id);end if;g:=g+1;
 end loop;
 for m in select v.session_id,v.user_id,r.kind from quantum_private.voice_members v join quantum_private.voice_sessions vsess on vsess.id=v.session_id join quantum_private.voice_rooms r on r.id=vsess.room_id where v.active and not quantum_private.voice_room_participant_current(r,v.user_id) loop
   if m.kind='group' then perform quantum_private.voice_revoke_member(m.session_id,m.user_id);else perform quantum_private.voice_end_session(m.session_id);end if;
 end loop;
 delete from quantum_private.voice_queue q where q.expires_at<=now() or not quantum_private.voice_eligible(q.user_id) or not quantum_private.voice_rules_current(q.user_id) or not exists(select 1 from quantum_private.community_member_profiles p where p.user_id=q.user_id and p.school_scope=q.school_scope);
 update quantum_private.voice_friend_invitations set status='expired' where status='pending' and expires_at<=now();
 update quantum_private.voice_friend_invitations i set status='cancelled' where i.status='pending' and (
   not quantum_private.voice_eligible(i.sender_id) or not quantum_private.voice_eligible(i.recipient_id)
   or not quantum_private.voice_rules_current(i.sender_id)
   or not quantum_private.voice_are_friends(i.sender_id,i.recipient_id)
   or not exists(select 1 from quantum_private.community_member_profiles a join quantum_private.community_member_profiles b on b.user_id=i.recipient_id where a.user_id=i.sender_id and a.school_scope=b.school_scope)
 );
 update quantum_private.voice_rooms set status='ended',revision=revision+1 where status in ('open','scheduled','delayed') and ends_at<=now();
 delete from quantum_private.voice_skips where expires_at<=now();
 delete from quantum_private.voice_webhook_events where received_at<now()-interval '7 days';
 delete from quantum_private.voice_commands where created_at<now()-interval '7 days';
 return jsonb_build_object('expiredSessions',n,'expiredDisconnectedMembers',g);
end;$$;

do $$declare t text; f record;begin
 foreach t in array array['voice_policy_ack','voice_restrictions','voice_rooms','voice_sessions','voice_members','voice_queue','voice_skips','voice_searches','voice_friend_invitations','voice_commands','voice_media_outbox','voice_webhook_events','voice_reports'] loop
 execute format('alter table quantum_private.%I enable row level security',t);execute format('revoke all on quantum_private.%I from public,anon,authenticated,service_role',t);end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='quantum_private' and p.proname like 'voice_%' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end;$$;
revoke all on function public.community_voice_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.community_voice_command(text,jsonb) to authenticated;
revoke all on function public.claim_voice_media_effects(int,uuid,uuid),public.finish_voice_media_effect(uuid,uuid,boolean),public.apply_voice_provider_event(text,text,text,uuid,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.claim_voice_media_effects(int,uuid,uuid),public.finish_voice_media_effect(uuid,uuid,boolean),public.apply_voice_provider_event(text,text,text,uuid,text,bigint) to service_role;
revoke all on function public.sweep_voice_sessions() from public,anon,authenticated,service_role;
grant execute on function public.sweep_voice_sessions() to service_role;
-- END SOURCE g5-g6-schema.sql

-- BEGIN SOURCE g5-sports-events.sql
-- Operator-entered sports schedule ledger. This records manual review; it is not an external API verification.

create table quantum_private.community_sports_events(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.users(id),school_scope text not null,
 sport text not null check(sport='baseball'),league text not null check(league='KBO'),event_key text not null check(event_key ~ '^[a-z0-9][a-z0-9:_-]{2,119}$'),
 home_team text not null check(length(home_team) between 1 and 80 and home_team !~ '[[:cntrl:]]'),away_team text not null check(length(away_team) between 1 and 80 and away_team !~ '[[:cntrl:]]'),
 starts_at timestamptz not null check(starts_at not in ('infinity'::timestamptz,'-infinity'::timestamptz)),status text not null check(status in ('scheduled','delayed','cancelled','completed')),
 source_url text not null check(source_url ~ '^https://(www\.)?koreabaseball\.com/' and length(source_url)<=500 and source_url !~ '[[:cntrl:]]'),source_revision text not null check(length(source_revision) between 3 and 120 and source_revision !~ '[[:cntrl:]]'),
 source_label text not null default 'operator_manual_review' check(source_label='operator_manual_review'),checked_at timestamptz not null default now(),
 revision int not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,school_scope,event_key),check(lower(home_team)<>lower(away_team))
);
create index community_sports_events_schedule on quantum_private.community_sports_events(school_scope,starts_at desc);
create table quantum_private.community_sports_event_revisions(
 event_id uuid not null references quantum_private.community_sports_events(id) on delete cascade,revision int not null,actor_id uuid not null references public.users(id),
 snapshot jsonb not null,change_note text not null check(length(change_note) between 3 and 500 and change_note !~ '[[:cntrl:]]'),recorded_at timestamptz not null default now(),primary key(event_id,revision)
);
create table quantum_private.community_sports_event_commands(
 user_id uuid not null references public.users(id) on delete cascade,idempotency_key uuid not null,operation text not null,payload jsonb not null,response jsonb not null,created_at timestamptz not null default now(),primary key(user_id,idempotency_key)
);

create function quantum_private.community_sports_event_snapshot(e quantum_private.community_sports_events) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'schoolScope',e.school_scope,'sport',e.sport,'league',e.league,'eventKey',e.event_key,'homeTeam',e.home_team,'awayTeam',e.away_team,'startsAt',e.starts_at,'status',e.status,'sourceUrl',e.source_url,'sourceRevision',e.source_revision,'sourceLabel',e.source_label,'checkedAt',e.checked_at,'revision',e.revision);
$$;
create function quantum_private.community_sports_event_json(e quantum_private.community_sports_events) returns jsonb language sql stable security definer set search_path='' as $$
 select quantum_private.community_sports_event_snapshot(e)||jsonb_build_object('history',coalesce((select jsonb_agg(jsonb_build_object('revision',h.revision,'changeNote',h.change_note,'recordedAt',h.recorded_at,'snapshot',h.snapshot) order by h.revision desc) from (select * from quantum_private.community_sports_event_revisions where event_id=e.id order by revision desc limit 20) h),'[]'::jsonb));
$$;

create function public.community_sports_event_command(p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid();role_name text;profile quantum_private.community_member_profiles%rowtype;e quantum_private.community_sports_events%rowtype;
 cmd quantum_private.community_sports_event_commands%rowtype;key uuid;event_id uuid;expected int;input jsonb;result jsonb;note text;
begin
 if u is null then raise exception 'not_authenticated';end if;
 select access_role into role_name from public.get_access_context();if coalesce(role_name,'') not in ('admin','super_admin') then raise exception 'forbidden';end if;
 select * into profile from quantum_private.community_member_profiles where user_id=u;
 if p_operation='list' then
   return jsonb_build_object('events',coalesce((select jsonb_agg(quantum_private.community_sports_event_json(v) order by v.starts_at desc) from (select * from quantum_private.community_sports_events where role_name='super_admin' or (owner_id=u and profile.user_id is not null and school_scope=profile.school_scope) order by starts_at desc limit 100)v),'[]'::jsonb));
 end if;
 if p_operation not in ('create','update') then raise exception 'invalid_input';end if;
 key:=(p_payload->>'idempotencyKey')::uuid;expected:=(p_payload->>'expectedRevision')::int;input:=p_payload->'event';note:=btrim(coalesce(input->>'reviewNote',''));
 if key is null or expected is null or expected<0 or jsonb_typeof(input)<>'object' or length(note) not between 3 and 500 then raise exception 'invalid_input';end if;
 perform pg_advisory_xact_lock(hashtextextended('community-sports-event-ledger-v1',0));
 select * into cmd from quantum_private.community_sports_event_commands where user_id=u and idempotency_key=key;
 if found then
   if cmd.operation<>p_operation or cmd.payload<>p_payload then raise exception 'idempotency_conflict';end if;
   event_id:=(cmd.response#>>'{event,id}')::uuid;
   select * into e from quantum_private.community_sports_events where id=event_id;
   if not found or (role_name<>'super_admin' and (e.owner_id<>u or profile.user_id is null or e.school_scope<>profile.school_scope)) then raise exception 'not_found';end if;
   return cmd.response;
 end if;
 if (select count(*) from quantum_private.community_sports_event_commands where user_id=u and created_at>now()-interval '1 minute')>=30 then raise exception 'rate_limited';end if;
 if p_operation='create' then
   if expected<>0 then raise exception 'invalid_input';end if;
   if profile.user_id is null or nullif(btrim(profile.school_scope),'') is null then raise exception 'minimum_signup_required';end if;
   if exists(select 1 from quantum_private.community_sports_events where owner_id=u and school_scope=profile.school_scope and event_key=lower(btrim(input->>'eventKey'))) then raise exception 'sports_event_exists';end if;
   insert into quantum_private.community_sports_events(owner_id,school_scope,sport,league,event_key,home_team,away_team,starts_at,status,source_url,source_revision)
   values(u,profile.school_scope,input->>'sport',input->>'league',lower(btrim(input->>'eventKey')),btrim(input->>'homeTeam'),btrim(input->>'awayTeam'),(input->>'startsAt')::timestamptz,input->>'status',input->>'sourceUrl',btrim(input->>'sourceRevision')) returning * into e;
 else
   event_id:=(p_payload->>'eventId')::uuid;select * into e from quantum_private.community_sports_events where id=event_id for update;
   if not found or (role_name<>'super_admin' and (e.owner_id<>u or profile.user_id is null or e.school_scope<>profile.school_scope)) then raise exception 'not_found';end if;
   if expected<>e.revision then raise exception 'stale_revision';end if;
   if input->>'sport'<>e.sport or input->>'league'<>e.league or lower(btrim(input->>'eventKey'))<>e.event_key then raise exception 'invalid_input';end if;
   update quantum_private.community_sports_events set home_team=btrim(input->>'homeTeam'),away_team=btrim(input->>'awayTeam'),starts_at=(input->>'startsAt')::timestamptz,status=input->>'status',source_url=input->>'sourceUrl',source_revision=btrim(input->>'sourceRevision'),checked_at=now(),updated_at=now(),revision=revision+1 where id=e.id returning * into e;
 end if;
 insert into quantum_private.community_sports_event_revisions(event_id,revision,actor_id,snapshot,change_note) values(e.id,e.revision,u,quantum_private.community_sports_event_snapshot(e),note);
 result:=jsonb_build_object('event',quantum_private.community_sports_event_json(e));
 insert into quantum_private.community_sports_event_commands values(u,key,p_operation,p_payload,result,now());
 return result;
end;$$;

-- Scheduled/open official baseball voice rooms must refer to the creator's current, recently rechecked manual ledger row.
create function quantum_private.voice_sports_event_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare e quantum_private.community_sports_events%rowtype;
begin
 if new.kind<>'group' or new.topic<>'baseball' or new.status not in ('scheduled','open') then return new;end if;
 select * into e from quantum_private.community_sports_events where owner_id=new.created_by and school_scope=new.school_scope and event_key=lower(new.source_event_key);
 if not found then raise exception 'sports_event_not_found';end if;
 if e.starts_at<>new.starts_at or e.source_url<>new.source_url or e.source_revision<>new.source_revision then raise exception 'sports_event_mismatch';end if;
 if e.status<>'scheduled' then raise exception 'sports_event_not_ready';end if;
 if e.checked_at<now()-interval '15 minutes' then raise exception 'sports_event_stale_review';end if;
 return new;
end;$$;
create trigger voice_sports_event_guard before insert or update of status,starts_at,source_url,source_revision,source_event_key on quantum_private.voice_rooms for each row execute function quantum_private.voice_sports_event_guard();

alter table quantum_private.community_sports_events enable row level security;
alter table quantum_private.community_sports_event_revisions enable row level security;
alter table quantum_private.community_sports_event_commands enable row level security;
revoke all on table quantum_private.community_sports_events,quantum_private.community_sports_event_revisions,quantum_private.community_sports_event_commands from public,anon,authenticated,service_role;
revoke all on function quantum_private.community_sports_event_snapshot(quantum_private.community_sports_events),quantum_private.community_sports_event_json(quantum_private.community_sports_events),quantum_private.voice_sports_event_guard() from public,anon,authenticated,service_role;
revoke all on function public.community_sports_event_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.community_sports_event_command(text,jsonb) to authenticated;
-- END SOURCE g5-sports-events.sql

-- BEGIN SOURCE g9-schema.sql
-- G9 integration draft. Parent task converts this into the timestamped migration
-- after G1/G2 and G5/G6. Do not apply this draft directly to any database.

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
-- END SOURCE g9-schema.sql

-- BEGIN SOURCE g9-preservation-bridge.sql
-- Legacy scheduled jobs may finish an event, but never create a new friendship.
-- Existing friendships and provenance are intentionally left untouched.
create or replace function public.connect_completed_quantum_event_match(p_match_id uuid)
returns integer language sql volatile security definer set search_path='' as $$select 0$$;
revoke all on function public.connect_completed_quantum_event_match(uuid) from public,anon,authenticated,service_role;
grant execute on function public.connect_completed_quantum_event_match(uuid) to service_role;

create or replace function public.complete_due_quantum_couple_matches(p_now timestamptz default now())
returns integer language plpgsql volatile security definer set search_path='' as $$
declare
 m public.quantum_couple_matches%rowtype;
 n int:=0;
 previous_notifications_guard text:=pg_catalog.current_setting('app.bypass_notifications_guard',true);
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden';end if;
 perform pg_catalog.set_config('app.bypass_notifications_guard','on',true);
 for m in select * from public.quantum_couple_matches where status='confirmed' and starts_at+interval '150 minutes'<=p_now order by starts_at for update skip locked loop
   update public.quantum_couple_matches set status='completed',completed_at=p_now where id=m.id;
   update public.quantum_couple_parties set status='completed',updated_at=p_now where id in(m.pair_a_id,m.pair_b_id);
   insert into public.notifications(user_id,kind,payload)
   select member.user_id,'couple_party_completed',jsonb_build_object('couple_match_id',m.id,'event_id','scheduled-couple-double-date','friendship_created',false)
   from(select leader_user_id as user_id from public.quantum_couple_parties where id in(m.pair_a_id,m.pair_b_id)
        union select partner_user_id from public.quantum_couple_parties where id in(m.pair_a_id,m.pair_b_id))member;
    n:=n+1;
 end loop;
 perform pg_catalog.set_config('app.bypass_notifications_guard',coalesce(previous_notifications_guard,''),true);
 return n;
exception when others then
 perform pg_catalog.set_config('app.bypass_notifications_guard',coalesce(previous_notifications_guard,''),true);
 raise;
end;$$;
revoke all on function public.complete_due_quantum_couple_matches(timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.complete_due_quantum_couple_matches(timestamptz) to service_role;

-- Old auto-written a_agreed/b_agreed values are not proof of manual phone consent.
-- Keep the DTO stable while removing GET writes and contact disclosure. Use accepted-friend messaging instead.
create or replace function public.get_match_connections(p_match_id uuid)
returns table(target_user_id uuid,target_display_name text,contact_revealed_at timestamptz,scheduled_reveal_at timestamptz,target_phone text)
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();m public.matches%rowtype;mine uuid;other_group uuid;
begin
 if u is null then raise exception 'not_authenticated';end if;
 if quantum_private.account_deletion_blocks_access(u) then raise exception 'forbidden';end if;
 if exists(select 1 from public.quantum_event_match_members where match_id=p_match_id) then raise exception 'event_match_contact_hidden';end if;
 select * into m from public.matches where id=p_match_id;if not found then raise exception 'match_not_found';end if;
 select group_id into mine from public.group_members where user_id=u and left_at is null and group_id in(m.group_a_id,m.group_b_id) limit 1;
 if mine is null then raise exception 'not_match_participant';end if;
 if m.status not in('confirmed','completed') then return;end if;
 other_group:=case when mine=m.group_a_id then m.group_b_id else m.group_a_id end;
 return query select gm.user_id,p.display_name,null::timestamptz,null::timestamptz,null::text
 from public.group_members gm left join public.profiles p on p.user_id=gm.user_id
 where gm.group_id=other_group and gm.left_at is null and gm.user_id<>u
 and not quantum_private.tonight_invite_pair_is_blocked(u,gm.user_id)
 and not quantum_private.account_deletion_blocks_access(gm.user_id);
end;$$;
revoke all on function public.get_match_connections(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_match_connections(uuid) to authenticated;

create or replace function quantum_private.voice_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from quantum_private.resolve_profile_readiness(p_user) where minimum_signup_complete)
 and exists(select 1 from auth.users where id=p_user and deleted_at is null and (banned_until is null or banned_until<=now()))
 and not exists(select 1 from quantum_private.voice_restrictions where user_id=p_user and until_at>now())
 and not quantum_private.account_deletion_blocks_access(p_user);
$$;
revoke all on function quantum_private.voice_eligible(uuid) from public,anon,authenticated,service_role;
-- END SOURCE g9-preservation-bridge.sql

commit;
