-- G1/G2 integration draft. Parent task converts this into the timestamped migration.
-- Raw invite capabilities never cross this database boundary.
begin;

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

commit;
