-- Candidate board invitations use one canonical notification and existing outbox.
-- Source eligibility is rechecked at click and dispatch; no external send here.
begin;
alter function public.get_activity_meetup_admission_notification(uuid)rename to get_admission_notification_before_candidate_board;
alter function public.get_admission_notification_before_candidate_board(uuid)set schema quantum_private;
create function public.get_activity_meetup_admission_notification(p_notification_id uuid)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();n public.notifications%rowtype;link text;begin
 if actor is null then raise exception 'not_authenticated';end if;
 perform quantum_private.assert_activity_room_access(actor);
 select *into n from public.notifications where id=p_notification_id and user_id=actor;
 if not found then raise exception 'notification_not_found';end if;
 if n.kind='social_activity'and n.payload->>'entity_type'='candidate_invite'then
  if quantum_private.candidate_notification_current(p_notification_id,actor)is not true then return jsonb_build_object('status','ended','href',null);end if;
  link:=quantum_private.candidate_notification_href(p_notification_id,actor);
  if link is null then return jsonb_build_object('status','ended','href',null);end if;
  return jsonb_build_object('status','current','href',link);
 end if;
 return quantum_private.get_admission_notification_before_candidate_board(p_notification_id);
end $$;

alter function quantum_private.common_web_push_notification_current(uuid)rename to common_web_push_notification_before_candidate_board;
create function quantum_private.common_web_push_notification_current(nid uuid)returns boolean
language plpgsql volatile security definer set search_path='' as $$declare n public.notifications%rowtype;begin
 select *into n from public.notifications where id=nid;
 if not found or n.read_at is not null or n.created_at<clock_timestamp()-interval '24 hours'
  or not quantum_private.common_push_user_current(n.user_id)then return false;end if;
 if n.kind='social_activity'and n.payload->>'entity_type'='candidate_invite'then
  return coalesce(quantum_private.candidate_notification_current(nid,n.user_id),false);
 end if;
 return quantum_private.common_web_push_notification_before_candidate_board(nid);
end $$;
revoke all on function quantum_private.get_admission_notification_before_candidate_board(uuid),public.get_activity_meetup_admission_notification(uuid),
 quantum_private.common_web_push_notification_before_candidate_board(uuid),quantum_private.common_web_push_notification_current(uuid)from public,anon,authenticated,service_role;
grant execute on function public.get_activity_meetup_admission_notification(uuid)to authenticated;
commit;
