-- Local forward-only candidate. No external notification delivery is enabled here.
begin;

-- A result is historical, unlike an actionable pending invitation. Its source is
-- private and unique for one effective candidate join and one recipient.
create table quantum_private.candidate_join_notification_sources (
 notification_id uuid primary key references public.notifications(id) on delete cascade deferrable initially deferred,
 candidate_id uuid not null references quantum_private.meetup_candidates(id) on delete cascade,
 join_revision integer not null,
 recipient_id uuid not null references public.users(id) on delete cascade,
 event text not null check(event in('candidate_joined','candidate_recruitment_closed')),
 joined_room_id uuid not null,
 scope_kind text not null,
 scope_key text not null,
 unique(candidate_id,join_revision,recipient_id)
);
alter table quantum_private.candidate_join_notification_sources enable row level security;
revoke all on quantum_private.candidate_join_notification_sources from public,anon,authenticated,service_role;

create function quantum_private.emit_candidate_join_result(cid uuid,recipient uuid,ev text) returns void
language plpgsql security definer set search_path='' as $$
declare c quantum_private.meetup_candidates%rowtype;nid uuid:=gen_random_uuid();room_name text;heading text;copy text;begin
 select *into c from quantum_private.meetup_candidates where id=cid;
 if c.id is null or c.status<>'joined' or c.last_room_id is null
  or not quantum_private.candidate_current(c.id,recipient)then return;end if;
 if ev='candidate_joined'then
  if recipient<>c.owner_id then return;end if;
  if c.scope_kind='league'then select team_name into room_name from public.department_challenge_teams where id=c.last_room_id;
  elsif c.scope_kind='study'then select title into room_name from quantum_private.study_rooms where id=c.last_room_id;
  elsif c.scope_kind='mentoring'then select title into room_name from quantum_private.group_mentoring_sessions where id=c.last_room_id;
  else select title into room_name from public.activity_meetups where id=c.last_room_id;end if;
  room_name:=left(btrim(regexp_replace(coalesce(room_name,''),'[[:cntrl:]'||chr(173)||chr(847)||chr(1564)||chr(6158)||chr(8203)||'-'||chr(8207)||chr(8232)||'-'||chr(8238)||chr(8288)||'-'||chr(8303)||chr(65279)||']','','g')),80);
  if room_name=''or room_name~*'(https?://|www[.]|[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|instagram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)'
   or regexp_replace(room_name,'[^0-9]','','g')~'[0-9]{7,}'then room_name:='선택한 모임';end if;
  heading:='합류가 확정됐어요';copy:=room_name||'에 합류했어요. 다른 참가 제안은 종료됐어요.';
 elsif ev='candidate_recruitment_closed'then
  if recipient=c.owner_id then return;end if;
  heading:='초대한 사람의 모집이 종료됐어요';copy:='초대한 사람의 모집이 종료됐어요. 다른 대기자를 찾아보세요.';
 else return;end if;
 insert into quantum_private.candidate_join_notification_sources(notification_id,candidate_id,join_revision,recipient_id,event,joined_room_id,scope_kind,scope_key)
 values(nid,c.id,c.revision,recipient,ev,c.last_room_id,c.scope_kind,c.scope_key)
 on conflict(candidate_id,join_revision,recipient_id)do nothing returning notification_id into nid;
 if nid is null then return;end if;
 -- No candidate identifier, alias, winning-room identifier or title is sent to
 -- another inviter. The source ledger, not a stored URL, resolves navigation.
 insert into public.notifications(id,user_id,kind,payload)values(nid,recipient,'social_activity',jsonb_strip_nulls(jsonb_build_object(
  'version',1,'domain',case c.scope_kind when 'study'then 'study_room'else c.scope_kind end,
  'entity_type','candidate_join_result','event',ev,'title',heading,'body',copy,'room_title',room_name)));
end$$;

create function quantum_private.candidate_join_result_transition() returns trigger
language plpgsql security definer set search_path='' as $$declare c quantum_private.meetup_candidates%rowtype;begin
 if tg_table_name='meetup_candidates'then
  if new.status='joined'and old.status in('waiting','joining')then
   perform quantum_private.emit_candidate_join_result(new.id,new.owner_id,'candidate_joined');
  end if;
 elsif new.status='cancelled'and old.status in('pending','joining')then
  select *into c from quantum_private.meetup_candidates where id=new.candidate_id;
  -- Avoid telling the winning inviter to find somebody else when they offered
  -- multiple slots, including before the winning invite row has been updated.
  if c.status='joined'and not exists(select 1 from quantum_private.candidate_board_invites i
    where i.candidate_id=c.id and i.sender_id=new.sender_id and i.room_id=c.last_room_id)then
   perform quantum_private.emit_candidate_join_result(c.id,new.sender_id,'candidate_recruitment_closed');
  end if;
 end if;
 return new;
end$$;
create trigger candidate_join_result_owner after update of status on quantum_private.meetup_candidates
 for each row execute function quantum_private.candidate_join_result_transition();
create trigger candidate_join_result_other_inviter after update of status on quantum_private.candidate_board_invites
 for each row execute function quantum_private.candidate_join_result_transition();

create function quantum_private.candidate_join_result_current(nid uuid,recipient uuid)returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from quantum_private.candidate_join_notification_sources s
 join public.notifications n on n.id=s.notification_id and n.user_id=s.recipient_id
 where s.notification_id=nid and s.recipient_id=recipient and n.kind='social_activity'
  and n.payload->>'entity_type'='candidate_join_result'and n.payload->>'event'=s.event
  and quantum_private.candidate_current(s.candidate_id,recipient))
$$;
create function quantum_private.candidate_join_result_href(nid uuid,recipient uuid)returns text
language plpgsql stable security definer set search_path='' as $$declare s quantum_private.candidate_join_notification_sources%rowtype;begin
 if not quantum_private.candidate_join_result_current(nid,recipient)then return null;end if;
 select *into s from quantum_private.candidate_join_notification_sources where notification_id=nid and recipient_id=recipient;
 if s.event='candidate_joined'and quantum_private.candidate_scope_member(s.scope_kind,s.scope_key,recipient)=s.joined_room_id then
  return quantum_private.candidate_chat_href(s.scope_kind,s.joined_room_id);
 end if;
 return '/meetups/candidates?kind='||s.scope_kind||'&key='||replace(s.scope_key,':','%3A');
end$$;

alter function public.get_activity_meetup_admission_notification(uuid)rename to get_admission_notification_before_candidate_join_results;
alter function public.get_admission_notification_before_candidate_join_results(uuid)set schema quantum_private;
create function public.get_activity_meetup_admission_notification(p_notification_id uuid)returns jsonb
language plpgsql volatile security definer set search_path='' as $$declare actor uuid:=auth.uid();n public.notifications%rowtype;link text;begin
 if actor is null then raise exception 'not_authenticated';end if;
 perform quantum_private.assert_activity_room_access(actor);
 select *into n from public.notifications where id=p_notification_id and user_id=actor;
 if not found then raise exception 'notification_not_found';end if;
 if n.kind='social_activity'and n.payload->>'entity_type'='candidate_join_result'then
  link:=quantum_private.candidate_join_result_href(p_notification_id,actor);
  return jsonb_build_object('status',case when link is null then 'ended'else 'current'end,'href',link);
 end if;
 return quantum_private.get_admission_notification_before_candidate_join_results(p_notification_id);
end$$;
alter function quantum_private.common_web_push_notification_current(uuid)rename to common_web_push_notification_before_candidate_join_results;
create function quantum_private.common_web_push_notification_current(nid uuid)returns boolean
language plpgsql volatile security definer set search_path='' as $$declare n public.notifications%rowtype;begin
 select *into n from public.notifications where id=nid;
 if not found or n.read_at is not null or n.created_at<clock_timestamp()-interval '24 hours'
  or not quantum_private.common_push_user_current(n.user_id)then return false;end if;
 if n.kind='social_activity'and n.payload->>'entity_type'='candidate_join_result'then
  return quantum_private.candidate_join_result_current(nid,n.user_id);
 end if;
 return quantum_private.common_web_push_notification_before_candidate_join_results(nid);
end$$;
revoke all on function quantum_private.emit_candidate_join_result(uuid,uuid,text),quantum_private.candidate_join_result_transition(),
 quantum_private.candidate_join_result_current(uuid,uuid),quantum_private.candidate_join_result_href(uuid,uuid),
 quantum_private.get_admission_notification_before_candidate_join_results(uuid),public.get_activity_meetup_admission_notification(uuid),
 quantum_private.common_web_push_notification_before_candidate_join_results(uuid),quantum_private.common_web_push_notification_current(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.get_activity_meetup_admission_notification(uuid)to authenticated;
commit;
