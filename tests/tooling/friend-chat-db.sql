\set ON_ERROR_STOP on
-- Synthetic fixtures and assertions are rolled back, including failed sessions.
begin;
set local client_min_messages to warning;
create temp table friend_chat_assertions(label text primary key) on commit drop;
grant select, insert on friend_chat_assertions to authenticated;
create function pg_temp.chat_assert(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'assertion_failed:%', label; end if;
  insert into pg_temp.friend_chat_assertions values(label);
end $$;
create function pg_temp.chat_raises(statement text, expected text, label text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual=message_text;
    if actual is distinct from expected then raise exception 'assertion_failed:%:actual=%', label, actual; end if;
    insert into pg_temp.friend_chat_assertions values(label); return;
  end;
  raise exception 'assertion_failed:%:expected_error_not_raised', label;
end $$;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('a4400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, 'authenticated','authenticated',
 'friend-chat-'||n||'@example.invalid','{}','{}',now(),now() from generate_series(1,3) n;
insert into public.friend_requests(id,sender_user_id,receiver_user_id,token,status,expires_at,responded_at)
values ('a4400000-0000-4000-8000-000000000010','a4400000-0000-4000-8000-000000000001',
 'a4400000-0000-4000-8000-000000000002','synthetic-friend-chat-rollback','accepted',now()+interval '1 day',now());
insert into public.friendships(user_id,friend_user_id,status,created_from_request_id)
values ('a4400000-0000-4000-8000-000000000001','a4400000-0000-4000-8000-000000000002','active','a4400000-0000-4000-8000-000000000010'),
 ('a4400000-0000-4000-8000-000000000001','a4400000-0000-4000-8000-000000000003','active',null);
select pg_temp.chat_assert(not has_table_privilege('authenticated','public.friend_direct_messages','SELECT'), 'no_raw_select');
select pg_temp.chat_assert(not has_table_privilege('authenticated','public.friend_direct_messages','INSERT'), 'no_raw_insert');
select pg_temp.chat_assert(not has_function_privilege('anon','public.get_my_friend_direct_messages(uuid,integer)','EXECUTE'), 'anon_no_read');
select pg_temp.chat_assert(not has_function_privilege('anon','public.send_my_friend_direct_message(uuid,text,uuid)','EXECUTE'), 'anon_no_send');
set local role authenticated;
select set_config('request.jwt.claim.sub','a4400000-0000-4000-8000-000000000001',true);
do $test$
declare uid uuid; replay uuid; i integer; total integer;
begin
  perform pg_temp.chat_raises($q$select public.send_my_friend_direct_message('a4400000-0000-4000-8000-000000000002',chr(12288)||chr(8192),'a4400000-0000-4000-8000-000000000020')$q$,
    'invalid_friend_chat_message','unicode_whitespace_rejected');
  perform pg_temp.chat_assert(btrim('vividv', E' \t\n\r\f' || chr(11))='vividv', 'expected_trim_preserves_letters');
  uid := public.send_my_friend_direct_message('a4400000-0000-4000-8000-000000000002',E'  hello\r\nworld  ','a4400000-0000-4000-8000-000000000021');
  replay := public.send_my_friend_direct_message('a4400000-0000-4000-8000-000000000002',E'hello\nworld','a4400000-0000-4000-8000-000000000021');
  perform pg_temp.chat_assert(uid=replay,'replay_same_message_id_and_line_normalization');
  perform pg_temp.chat_assert((select body=E'hello\nworld' and is_mine from public.get_my_friend_direct_messages('a4400000-0000-4000-8000-000000000002')),'sender_safe_projection');
  perform pg_temp.chat_raises($q$select public.send_my_friend_direct_message('a4400000-0000-4000-8000-000000000002','different','a4400000-0000-4000-8000-000000000021')$q$,'idempotency_conflict','key_payload_conflict');
  perform pg_temp.chat_raises($q$select public.send_my_friend_direct_message('a4400000-0000-4000-8000-000000000003','no consent','a4400000-0000-4000-8000-000000000022')$q$,'active_friendship_required','legacy_auto_friend_send_denied');
  perform pg_temp.chat_raises($q$select * from public.get_my_friend_direct_messages('a4400000-0000-4000-8000-000000000003')$q$,'active_friendship_required','legacy_auto_friend_read_denied');
  perform set_config('request.jwt.claim.sub','a4400000-0000-4000-8000-000000000002',true);
  perform pg_temp.chat_assert((select count(*)=1 and bool_and(not is_mine) from public.get_my_friend_direct_messages('a4400000-0000-4000-8000-000000000001')),'recipient_can_read');
  perform set_config('request.jwt.claim.sub','a4400000-0000-4000-8000-000000000003',true);
  perform pg_temp.chat_raises($q$select * from public.get_my_friend_direct_messages('a4400000-0000-4000-8000-000000000002')$q$,'active_friendship_required','outsider_denied');
  perform set_config('request.jwt.claim.sub','a4400000-0000-4000-8000-000000000001',true);
  for i in 1..11 loop
    perform public.send_my_friend_direct_message('a4400000-0000-4000-8000-000000000002','rate test '||i,gen_random_uuid());
  end loop;
  perform pg_temp.chat_raises($q$select public.send_my_friend_direct_message('a4400000-0000-4000-8000-000000000002','thirteenth',gen_random_uuid())$q$,'friend_chat_rate_limited','sender_rate_limit');
  perform pg_temp.chat_assert(public.send_my_friend_direct_message('a4400000-0000-4000-8000-000000000002',E'hello\nworld','a4400000-0000-4000-8000-000000000021')=uid,'replay_bypasses_rate_without_new_row');
end $test$;
select set_config('request.jwt.claim.sub','a4400000-0000-4000-8000-000000000002',true);
select public.remove_friend_and_exclude('a4400000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','a4400000-0000-4000-8000-000000000001',true);
select pg_temp.chat_raises($q$select * from public.get_my_friend_direct_messages('a4400000-0000-4000-8000-000000000002')$q$,'active_friendship_required','blocked_cannot_read');
select pg_temp.chat_raises($q$select public.send_my_friend_direct_message('a4400000-0000-4000-8000-000000000002',E'hello\nworld','a4400000-0000-4000-8000-000000000021')$q$,'active_friendship_required','blocked_cannot_replay');
reset role;
select pg_temp.chat_assert((select count(*)=12 from public.friend_direct_messages where sender_user_id='a4400000-0000-4000-8000-000000000001'),'exactly_twelve_stored');
select count(*) as passed_assertions from friend_chat_assertions;
rollback;
