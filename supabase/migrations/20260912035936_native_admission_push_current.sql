-- Native study/mentoring applications use their current source ledger, not the
-- old general-meetup resolver. Existing dispatch, keys and delivery state remain.
begin;
alter function quantum_private.common_web_push_notification_current(uuid)rename to common_web_push_notification_before_native_admission;
create function quantum_private.common_web_push_notification_current(nid uuid)returns boolean
language plpgsql volatile security definer set search_path='' as $$declare n public.notifications%rowtype;begin
 select * into n from public.notifications where id=nid;
 if not found or n.read_at is not null or n.created_at<clock_timestamp()-interval '24 hours' or not quantum_private.common_push_user_current(n.user_id)then return false;end if;
 if n.kind='social_activity'and n.payload->>'domain'in('study_room','mentoring')and n.payload->>'entity_type'in('admission','admission_notice')then
  return quantum_private.native_admission_notification_current(nid,n.user_id);
 end if;
 return quantum_private.common_web_push_notification_before_native_admission(nid);
end $$;
revoke all on function quantum_private.common_web_push_notification_before_native_admission(uuid),quantum_private.common_web_push_notification_current(uuid)from public,anon,authenticated,service_role;
commit;
