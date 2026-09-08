-- Restored from the original friend-chat capability, adapted to consent evidence
-- and retry-safe writes. Does not alter friendships, legacy records or payments.
begin;

create table public.friend_direct_messages (
  id uuid primary key default gen_random_uuid(),
  friendship_user_id uuid not null,
  friendship_friend_user_id uuid not null,
  sender_user_id uuid not null references public.users(id) on delete cascade,
  idempotency_key uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key (friendship_user_id, friendship_friend_user_id)
    references public.friendships(user_id, friend_user_id) on delete cascade,
  check (friendship_user_id < friendship_friend_user_id),
  check (sender_user_id in (friendship_user_id, friendship_friend_user_id)),
  unique (sender_user_id, idempotency_key)
);
create index friend_direct_messages_pair_created_idx on public.friend_direct_messages
  (friendship_user_id, friendship_friend_user_id, created_at desc, id desc);
create index friend_direct_messages_sender_rate_idx on public.friend_direct_messages(sender_user_id, created_at desc);
alter table public.friend_direct_messages enable row level security;
revoke all on table public.friend_direct_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.friend_direct_messages to service_role;

create function public.get_my_friend_direct_messages(p_friend_user_id uuid, p_limit integer default 50)
returns table (id uuid, is_mine boolean, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_caller uuid := auth.uid(); v_low uuid; v_high uuid;
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_friend_user_id is null or p_friend_user_id=v_caller then raise exception 'invalid_friend_user_id'; end if;
  v_low := least(v_caller,p_friend_user_id); v_high := greatest(v_caller,p_friend_user_id);
  if not exists (
    select 1 from public.friendships friendship
    join public.friend_requests request on request.id=friendship.created_from_request_id
    where friendship.user_id=v_low and friendship.friend_user_id=v_high
      and friendship.status = 'active' and request.status = 'accepted'
      and request.receiver_user_id is not null
      and least(request.sender_user_id,request.receiver_user_id)=v_low
      and greatest(request.sender_user_id,request.receiver_user_id)=v_high
  ) then raise exception 'active_friendship_required' using errcode='42501'; end if;
  return query select recent.id,recent.sender_user_id=v_caller,recent.body,recent.created_at from (
    select message.id,message.sender_user_id,message.body,message.created_at
    from public.friend_direct_messages message
    where message.friendship_user_id=v_low and message.friendship_friend_user_id=v_high
    order by message.created_at desc,message.id desc limit least(greatest(coalesce(p_limit,50),1),100)
  ) recent order by recent.created_at,recent.id;
end;
$$;

create function public.send_my_friend_direct_message(p_friend_user_id uuid, p_body text, p_idempotency_key uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_caller uuid := auth.uid(); v_low uuid; v_high uuid; v_body text;
  v_existing public.friend_direct_messages%rowtype; v_message_id uuid;
begin
  if v_caller is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_friend_user_id is null or p_friend_user_id=v_caller then raise exception 'invalid_friend_user_id'; end if;
  if p_idempotency_key is null then raise exception 'invalid_idempotency_key'; end if;
  -- Match the browser trim contract at the RPC boundary as well. Direct RPC
  -- callers must not store Unicode-whitespace-only messages.
  v_body := btrim(regexp_replace(coalesce(p_body,''), E'\r\n?', E'\n', 'g'),
    E' \t\n\r\v\f' || chr(160) || chr(5760) || chr(8192) || chr(8193)
    || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198)
    || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232)
    || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279));
  if v_body='' or char_length(v_body)>1000 or replace(replace(v_body,E'\n',''),E'\t','') ~ '[[:cntrl:]]'
    then raise exception 'invalid_friend_chat_message'; end if;
  v_low := least(v_caller,p_friend_user_id); v_high := greatest(v_caller,p_friend_user_id);
  -- One sender lock serializes the global rate check and idempotency key even
  -- across different friend rooms. Row locking also serializes block/remove.
  perform pg_advisory_xact_lock(hashtextextended('friend-chat-sender|'||v_caller::text,0));
  perform 1 from public.friendships friendship
    join public.friend_requests request on request.id=friendship.created_from_request_id
    where friendship.user_id=v_low and friendship.friend_user_id=v_high
      and friendship.status = 'active' and request.status = 'accepted'
      and request.receiver_user_id is not null
      and least(request.sender_user_id,request.receiver_user_id)=v_low
      and greatest(request.sender_user_id,request.receiver_user_id)=v_high
    for update of friendship;
  if not found then raise exception 'active_friendship_required' using errcode='42501'; end if;
  select * into v_existing from public.friend_direct_messages message
    where message.sender_user_id=v_caller and message.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.friendship_user_id<>v_low or v_existing.friendship_friend_user_id<>v_high or v_existing.body<>v_body
      then raise exception 'idempotency_conflict'; end if;
    return v_existing.id;
  end if;
  if (select count(*) from public.friend_direct_messages message where message.sender_user_id=v_caller
      and message.created_at>=now()-interval '1 minute')>=12 then raise exception 'friend_chat_rate_limited'; end if;
  if (select count(*) from public.friend_direct_messages message
      where message.friendship_user_id=v_low and message.friendship_friend_user_id=v_high)>=10000
    then raise exception 'friend_chat_capacity_reached'; end if;
  insert into public.friend_direct_messages(friendship_user_id,friendship_friend_user_id,sender_user_id,idempotency_key,body)
    values(v_low,v_high,v_caller,p_idempotency_key,v_body) returning id into v_message_id;
  return v_message_id;
end;
$$;
revoke all on function public.get_my_friend_direct_messages(uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.send_my_friend_direct_message(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_friend_direct_messages(uuid,integer) to authenticated;
grant execute on function public.send_my_friend_direct_message(uuid,text,uuid) to authenticated;
commit;
