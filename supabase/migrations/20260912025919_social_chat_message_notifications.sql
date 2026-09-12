-- Canonical persisted social chat -> in-app alert -> common push outbox.
-- Does not change dating match chat windows, contacts or friend-chat policy.
begin;
do $$declare rule text;begin
 select pg_get_expr(conbin,conrelid)into rule from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_kind_check';
 if rule is null then raise exception 'notification_kind_contract_missing';end if;
 alter table public.notifications drop constraint notifications_kind_check;
 execute format('alter table public.notifications add constraint notifications_kind_check check ((%s) or kind=%L)',rule,'social_chat_message');
end$$;
create table quantum_private.social_chat_notification_events(
 notification_id uuid primary key references public.notifications(id)on delete cascade deferrable initially deferred,
 room_kind text not null check(room_kind in('league_team','league_match','meetup','activity_room','study_room','mentoring')),
 room_id uuid not null,message_id uuid not null,
 sender_id uuid not null references public.users(id)on delete cascade,
 recipient_id uuid not null references public.users(id)on delete cascade,
 unique(room_kind,room_id,message_id,recipient_id)
);
alter table quantum_private.social_chat_notification_events enable row level security;
revoke all on quantum_private.social_chat_notification_events from public,anon,authenticated,service_role;

create function quantum_private.social_chat_notification_current(nid uuid,u uuid,only_unread boolean default false)returns boolean
language plpgsql volatile security definer set search_path='' as $$declare x quantum_private.social_chat_notification_events%rowtype;begin
 select * into x from quantum_private.social_chat_notification_events where notification_id=nid and recipient_id=u;
 if not found or not quantum_private.common_push_user_current(u)or not quantum_private.common_push_user_current(x.sender_id)
  or quantum_private.tonight_invite_pair_is_blocked(u,x.sender_id)then return false;end if;
 if quantum_private.social_chat_room_authorized_base(x.room_kind,x.room_id,u)is null then return false;end if;
 if not exists(select 1 from quantum_private.social_chat_message_rows(x.room_kind,x.room_id,u)m where m.id=x.message_id and m.author_id=x.sender_id)then return false;end if;
 if only_unread and exists(select 1 from quantum_private.social_chat_read_positions r where r.user_id=u and r.room_kind=x.room_kind and r.room_id=x.room_id and r.message_id=x.message_id)then return false;end if;
 return true;
end$$;
create function quantum_private.emit_social_chat_message_notification()returns trigger
language plpgsql security definer set search_path='' as $$declare item jsonb:=to_jsonb(new);k text;r uuid;sender uuid;candidate uuid;nid uuid;begin
 case tg_table_name
 when 'league_team_chat_messages'then k:='league_team';r:=(item->>'team_id')::uuid;sender:=(item->>'sender_id')::uuid;
 when 'challenge_match_chat_messages'then k:='league_match';r:=(item->>'challenge_id')::uuid;sender:=(item->>'sender_id')::uuid;
 when 'activity_meetup_messages'then k:='meetup';r:=(item->>'meetup_id')::uuid;sender:=(item->>'sender_user_id')::uuid;
 when 'activity_room_messages'then k:='activity_room';r:=(item->>'room_id')::uuid;sender:=(item->>'sender_user_id')::uuid;
 when 'study_room_messages'then k:='study_room';r:=(item->>'room_id')::uuid;sender:=(item->>'user_id')::uuid;
 when 'group_mentoring_messages'then k:='mentoring';r:=(item->>'session_id')::uuid;sender:=(item->>'author_id')::uuid;
 else raise exception 'invalid_chat_notification_source';end case;
 if not quantum_private.common_push_user_current(sender)then return new;end if;
 for candidate in
  select user_id from public.department_challenge_roster where k='league_team'and team_id=r and status='accepted'
  union select user_id from quantum_private.challenge_match_chat_members where k='league_match'and challenge_id=r
  union select user_id from public.activity_meetup_members where k='meetup'and meetup_id=r and status='joined'
  union select user_id from quantum_private.activity_room_members where k='activity_room'and room_id=r and status='joined'
  union select user_id from quantum_private.study_room_members where k='study_room'and room_id=r and left_at is null
  union select user_id from quantum_private.group_mentoring_members where k='mentoring'and session_id=r and accepted
 loop
  if candidate=sender or not quantum_private.common_push_user_current(candidate)or quantum_private.tonight_invite_pair_is_blocked(candidate,sender)then continue;end if;
  if quantum_private.social_chat_room_authorized_base(k,r,candidate)is null then continue;end if;
  if not exists(select 1 from quantum_private.social_chat_message_rows(k,r,candidate)m where m.id=new.id and m.author_id=sender)then continue;end if;
  nid:=gen_random_uuid();
  insert into quantum_private.social_chat_notification_events(notification_id,room_kind,room_id,message_id,sender_id,recipient_id)
   values(nid,k,r,new.id,sender,candidate)on conflict(room_kind,room_id,message_id,recipient_id)do nothing returning notification_id into nid;
  if nid is null then continue;end if;
  insert into public.notifications(id,user_id,kind,payload)values(nid,candidate,'social_chat_message',jsonb_build_object(
   'version',1,'room_kind',k,'room_id',r,'title','새 메시지가 도착했어요','body','참여 중인 대화에서 확인해 주세요.'));
 end loop;return new;
end$$;
create trigger notify_social_chat_message after insert on quantum_private.league_team_chat_messages for each row execute function quantum_private.emit_social_chat_message_notification();
create trigger notify_social_chat_message after insert on quantum_private.challenge_match_chat_messages for each row execute function quantum_private.emit_social_chat_message_notification();
create trigger notify_social_chat_message after insert on public.activity_meetup_messages for each row execute function quantum_private.emit_social_chat_message_notification();
create trigger notify_social_chat_message after insert on quantum_private.activity_room_messages for each row execute function quantum_private.emit_social_chat_message_notification();
create trigger notify_social_chat_message after insert on quantum_private.study_room_messages for each row execute function quantum_private.emit_social_chat_message_notification();
create trigger notify_social_chat_message after insert on quantum_private.group_mentoring_messages for each row execute function quantum_private.emit_social_chat_message_notification();
create function public.resolve_my_social_chat_notification(p_notification_id uuid)returns jsonb
language plpgsql volatile security definer set search_path='' as $$declare u uuid:=auth.uid();x quantum_private.social_chat_notification_events%rowtype;begin
 if u is null then raise exception 'not_authenticated'using errcode='42501';end if;
 select * into x from quantum_private.social_chat_notification_events where notification_id=p_notification_id and recipient_id=u;
 if not found then raise exception 'notification_not_found'using errcode='42501';end if;
 if not quantum_private.social_chat_notification_current(p_notification_id,u,false)then return jsonb_build_object('status','ended','href',null);end if;
 return jsonb_build_object('status','current','href',case when x.room_kind='league_team'then '/chat/league-team/'||x.room_id::text else '/chat/rooms/'||x.room_kind||'/'||x.room_id::text end);
end$$;

create or replace function quantum_private.common_web_push_notification_current(nid uuid)returns boolean
language plpgsql volatile security definer set search_path='' as $$declare n public.notifications%rowtype;x quantum_private.social_notification_events%rowtype;begin
 select * into n from public.notifications where id=nid;
 if not found or n.read_at is not null or n.created_at<clock_timestamp()-interval '24 hours'or not quantum_private.common_push_user_current(n.user_id)
  or n.kind in('tonight_journey','campus_seven_guide','phone_revealed')then return false;end if;
 if n.kind='social_chat_message'then return quantum_private.social_chat_notification_current(nid,n.user_id,true);end if;
 if n.kind='social_activity'then
  if n.payload->>'entity_type'in('admission','admission_notice')then return quantum_private.meetup_admission_notification_current(nid,n.user_id);end if;
  select * into x from quantum_private.social_notification_events where notification_id=nid and recipient_id=n.user_id;
  if not found or not quantum_private.social_notification_scope(x.domain,x.entity_id,n.user_id,x.team_id,x.entity_type)
   or(x.actor_id is not null and(not quantum_private.common_push_user_current(x.actor_id)or quantum_private.tonight_invite_pair_is_blocked(x.actor_id,n.user_id)))then return false;end if;
 end if;return true;
end$$;
revoke all on function quantum_private.social_chat_notification_current(uuid,uuid,boolean),quantum_private.emit_social_chat_message_notification(),public.resolve_my_social_chat_notification(uuid)from public,anon,authenticated,service_role;
grant execute on function public.resolve_my_social_chat_notification(uuid)to authenticated;
-- Reading the actual message also clears that same user's duplicate inbox alert.
create function quantum_private.read_social_chat_notification()returns trigger
language plpgsql security definer set search_path='' as $$begin
 update public.notifications n set read_at=coalesce(n.read_at,new.read_at)
 from quantum_private.social_chat_notification_events e where e.notification_id=n.id and e.recipient_id=new.user_id
  and e.room_kind=new.room_kind and e.room_id=new.room_id and e.message_id=new.message_id and n.user_id=new.user_id;
 return new;
end$$;
revoke all on function quantum_private.read_social_chat_notification()from public,anon,authenticated,service_role;
create trigger read_social_chat_notification after insert on quantum_private.social_chat_read_positions for each row execute function quantum_private.read_social_chat_notification();
commit;
