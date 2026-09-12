-- Shared, target-bound admission ledger. LOCAL ONLY; no policies seeded, PG off.
-- Receipts remain globally unique across custom/study/mentoring. No money is copied.
begin;
alter table quantum_private.activity_meetup_admission_policies add column id uuid not null default gen_random_uuid();
alter table quantum_private.activity_meetup_admission_policies drop constraint activity_meetup_admission_policies_pkey;
alter table quantum_private.activity_meetup_admission_policies add primary key(id),add unique(meetup_id);
do $$declare name text;begin
 foreach name in array array['activity_meetup_admission_policies','activity_meetup_admission_quotes','activity_meetup_admission_intents','activity_meetup_admission_deposits','activity_meetup_admissions','activity_meetup_admission_notices']loop
  execute format('alter table quantum_private.%I alter column meetup_id drop not null, add column study_room_id uuid references quantum_private.study_rooms(id) on delete %s, add column mentoring_session_id uuid references quantum_private.group_mentoring_sessions(id) on delete %s',name,case when name='activity_meetup_admission_deposits'then 'set null'else 'cascade'end,case when name='activity_meetup_admission_deposits'then 'set null'else 'cascade'end);
  execute format('alter table quantum_private.%I add constraint %I check(num_nonnulls(meetup_id,study_room_id,mentoring_session_id)%s)',name,name||'_target_check',case when name='activity_meetup_admission_deposits'then '<=1'else '=1'end);
 end loop;
 foreach name in array array['activity_meetup_admission_quotes','activity_meetup_admission_intents','activity_meetup_admission_deposits','activity_meetup_admissions']loop
  execute format('alter table quantum_private.%I add column metadata jsonb not null default ''{}''::jsonb check(jsonb_typeof(metadata)=''object'' and octet_length(metadata::text)<=200)',name);
 end loop;
end$$;
-- Immutable, non-personal origin survives nullable target/user FK deletion.
-- Older already-orphaned custom deposits cannot be reconstructed and stay null.
alter table quantum_private.activity_meetup_admission_deposits
 add column source_kind text not null default 'custom_meetup'check(source_kind in('custom_meetup','study','mentoring')),
 add column source_room_id uuid;
update quantum_private.activity_meetup_admission_deposits set source_room_id=meetup_id where meetup_id is not null;
create function quantum_private.native_admission_deposit_origin()returns trigger
language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT'then
  if num_nonnulls(new.meetup_id,new.study_room_id,new.mentoring_session_id)<>1 then raise exception 'deposit_target_required';end if;
  new.source_kind:=case when new.meetup_id is not null then 'custom_meetup'when new.study_room_id is not null then 'study'else 'mentoring'end;
  new.source_room_id:=coalesce(new.meetup_id,new.study_room_id,new.mentoring_session_id);
 elsif new.source_kind is distinct from old.source_kind or new.source_room_id is distinct from old.source_room_id then raise exception 'deposit_origin_immutable';end if;
 return new;
end$$;
create trigger native_deposit_origin before insert or update of source_kind,source_room_id on quantum_private.activity_meetup_admission_deposits for each row execute function quantum_private.native_admission_deposit_origin();
create unique index admission_policy_study on quantum_private.activity_meetup_admission_policies(study_room_id)where study_room_id is not null;
create unique index admission_policy_mentoring on quantum_private.activity_meetup_admission_policies(mentoring_session_id)where mentoring_session_id is not null;
create unique index admission_prepared_study on quantum_private.activity_meetup_admission_intents(user_id,study_room_id)where preparation_state='prepared'and study_room_id is not null;
create unique index admission_prepared_mentoring on quantum_private.activity_meetup_admission_intents(user_id,mentoring_session_id)where preparation_state='prepared'and mentoring_session_id is not null;
create unique index admission_active_study on quantum_private.activity_meetup_admissions(user_id,study_room_id)where state in('pending','accepted')and study_room_id is not null;
create unique index admission_active_mentoring on quantum_private.activity_meetup_admissions(user_id,mentoring_session_id)where state in('pending','accepted')and mentoring_session_id is not null;
create index admission_queue_study on quantum_private.activity_meetup_admissions(study_room_id,created_at desc,id desc)where study_room_id is not null;
create index admission_queue_mentoring on quantum_private.activity_meetup_admissions(mentoring_session_id,created_at desc,id desc)where mentoring_session_id is not null;

create function quantum_private.native_admission_metadata_valid(k text,m jsonb)returns boolean
language sql immutable set search_path='' as $$select coalesce(case when k='study'then m='{}'::jsonb when k='mentoring'then jsonb_typeof(m)='object'and m->>'role'in('mentor','mentee')and m=jsonb_build_object('role',m->>'role')else false end,false)$$;
create function quantum_private.native_admission_global_lock(k text)returns void
language plpgsql security definer set search_path='' as $$begin
 if k is null or k not in('study','mentoring')then raise exception 'invalid_room_kind';end if;
 if k='mentoring'then perform pg_advisory_xact_lock(hashtextextended('group-mentoring:v1',0));perform pg_advisory_xact_lock(hashtextextended('quantum:mentoring:v1',0));end if;
end$$;
create function quantum_private.native_admission_room_lock(k text,r uuid)returns void
language plpgsql security definer set search_path='' as $$declare p quantum_private.study_room_pools%rowtype;begin
 if k='study'then
  select pool.*into p from quantum_private.study_rooms room join quantum_private.study_room_pools pool on pool.id=room.pool_id where room.id=r;
  if p.id is null then raise exception 'study_room_not_found';end if;
  perform pg_advisory_xact_lock(hashtextextended('study-pool|'||p.school_key||'|'||p.department_key||'|'||p.course_id||'|'||p.level,0));
  perform 1 from quantum_private.study_rooms where id=r for update;
 elsif k='mentoring'then perform 1 from quantum_private.group_mentoring_sessions where id=r for update;
 else raise exception 'invalid_room_kind';end if;
end$$;
create function quantum_private.native_admission_target(k text,r uuid,u uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if k='study'then return quantum_private.hosted_study_target(r,u);
 elsif k='mentoring'then result:=quantum_private.hosted_mentoring_target(r,u);if result is null then raise exception 'mentoring_not_found';end if;return result;end if;raise exception 'invalid_room_kind';end$$;
create function quantum_private.native_admission_lock(k text,r uuid,people uuid[])returns void
language plpgsql security definer set search_path='' as $$declare person uuid;begin
 perform quantum_private.native_admission_global_lock(k);
 -- Same canonical readiness-lock set/order as hosted mentoring mutations. Include
 -- current members before the room row, plus applicant/organizer for decisions.
 for person in select distinct u from(select unnest(people)u union select user_id from quantum_private.study_room_members where k='study'and room_id=r and left_at is null
 union select user_id from quantum_private.group_mentoring_members where k='mentoring'and session_id=r and left_at is null)x where u is not null order by u loop
  perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||person::text,0));
 end loop;
 perform quantum_private.native_admission_room_lock(k,r);
end$$;
create function quantum_private.native_admission_member_current(k text,r uuid,u uuid)returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 if k='study'then return quantum_private.hosted_study_member_current(r,u);
 elsif k='mentoring'then return quantum_private.hosted_mentoring_member_current(r,u);end if;return false;end$$;
create function quantum_private.native_admission_visible(k text,r uuid,u uuid)returns boolean
language plpgsql stable security definer set search_path='' as $$begin perform quantum_private.native_admission_target(k,r,u);return true;
 exception when others then return false;end$$;
create function quantum_private.native_admission_available(k text,r uuid,u uuid,m jsonb)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare t jsonb;begin
 if not quantum_private.native_admission_metadata_valid(k,m)then raise exception 'invalid_admission_metadata';end if;
 t:=quantum_private.native_admission_target(k,r,u);
 if coalesce((t->>'joined')::boolean,false)then raise exception 'meetup_already_joined';end if;
 if t->>'status'='closed'then raise exception 'meetup_closed';end if;
 if t->>'status'='full'or(t->>'member_count')::integer>=(t->>'capacity')::integer then raise exception 'meetup_full';end if;
 if k='mentoring'and(t->>(case m->>'role'when 'mentor'then 'mentor_count'else 'mentee_count'end))::integer>=(t->>'role_capacity')::integer then raise exception 'mentoring_role_full';end if;
 if k='mentoring'then
 if exists(select 1 from quantum_private.group_mentoring_members member join quantum_private.group_mentoring_sessions room on room.id=member.session_id
  where member.user_id=u and member.accepted and member.left_at is null and room.recruitment_mode='hosted'and room.status='active'and room.expires_at>clock_timestamp())
  or exists(select 1 from quantum_private.group_mentoring_party_members member join quantum_private.group_mentoring_parties party on party.id=member.party_id where member.user_id=u and member.active and party.status in('friends','waiting','offered','active')and party.expires_at>clock_timestamp())
  or exists(select 1 from quantum_private.mentoring_waiters where user_id=u and status in('offered','active')and expires_at>clock_timestamp())then raise exception 'mentoring_already_active';end if;
 end if;
 if k='study'and exists(select 1 from quantum_private.study_room_members member join quantum_private.study_rooms room on room.pool_id=member.pool_id where room.id=r and member.user_id=u and member.left_at is null)then raise exception 'study_room_already_joined';end if;
 return t;
end$$;
create function quantum_private.native_admission_chat_href(k text,r uuid)returns text
language sql immutable set search_path='' as $$select '/chat/rooms/'||case k when 'study'then 'study_room'when 'mentoring'then 'mentoring'end||'/'||r::text$$;
create function quantum_private.native_admission_status(aid uuid,viewer uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare a quantum_private.activity_meetup_admissions%rowtype;d quantum_private.activity_meetup_admission_deposits%rowtype;k text;r uuid;t jsonb;allowed boolean;begin
 select *into a from quantum_private.activity_meetup_admissions where id=aid;
 if a.id is null then return null;end if;
 k:=case when a.study_room_id is not null then 'study'when a.mentoring_session_id is not null then 'mentoring'end;r:=coalesce(a.study_room_id,a.mentoring_session_id);
 if k is null then return null;end if;
 allowed:=a.user_id=viewer;
 if not allowed then t:=quantum_private.native_admission_target(k,r,viewer);allowed:=t->>'host_user_id'=viewer::text and quantum_private.native_admission_member_current(k,r,viewer);end if;
 if not coalesce(allowed,false)then return null;end if;
 select *into d from quantum_private.activity_meetup_admission_deposits where id=a.deposit_id;
 return jsonb_build_object('id',a.id,'admission',a.state,'payment',d.state,'amountKrw',d.amount_krw,'revision',a.revision,
 'chatHref',case when a.state='accepted'and d.state='held'and quantum_private.native_admission_member_current(k,r,a.user_id)then quantum_private.native_admission_chat_href(k,r)end);
end$$;

create function public.get_native_meetup_admission_context(p_kind text,p_room_id uuid,p_metadata jsonb default '{}'::jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$declare actor uuid:=auth.uid();policy quantum_private.activity_meetup_admission_policies%rowtype;q quantum_private.activity_meetup_admission_quotes%rowtype;room jsonb;t jsonb;details jsonb;begin
 perform quantum_private.assert_activity_room_access(actor);perform quantum_private.native_admission_global_lock(p_kind);
 perform quantum_private.native_admission_lock(p_kind,p_room_id,array[actor]);
 t:=quantum_private.native_admission_available(p_kind,p_room_id,actor,p_metadata);room:=jsonb_build_object('kind',p_kind,'id',p_room_id);
 details:=jsonb_build_object('title',t->>'title','memberCount',(t->>'member_count')::integer,'capacity',(t->>'capacity')::integer);
 select *into policy from quantum_private.activity_meetup_admission_policies where(p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id)for share;
 if policy.id is null or not policy.enabled then return jsonb_build_object('room',room,'roomDetails',details,'metadata',p_metadata,'quote',null,'policy',null,'checkoutEnabled',false,'preparationOnly',true);end if;
 select *into q from quantum_private.activity_meetup_admission_quotes where user_id=actor and((p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id))
 and metadata=p_metadata and expires_at>clock_timestamp()and amount_krw=policy.amount_krw and policy_version=policy.policy_version and policy_summary=policy.summary and policy_conditions=policy.conditions
 order by created_at desc limit 1;
 if q.id is null then insert into quantum_private.activity_meetup_admission_quotes(study_room_id,mentoring_session_id,user_id,amount_krw,policy_version,policy_summary,policy_conditions,expires_at,metadata)
 values(case when p_kind='study'then p_room_id end,case when p_kind='mentoring'then p_room_id end,actor,policy.amount_krw,policy.policy_version,policy.summary,policy.conditions,clock_timestamp()+interval '15 minutes',p_metadata)returning *into q;end if;
 return jsonb_build_object('room',room,'roomDetails',details,'metadata',p_metadata,'checkoutEnabled',false,'preparationOnly',true,'policy',jsonb_build_object('summary',q.policy_summary,'conditions',q.policy_conditions),
 'quote',jsonb_build_object('id',q.id,'room',room,'amountKrw',q.amount_krw,'currency','KRW','policyVersion',q.policy_version,'expiresAt',to_char(q.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'paymentMethods',jsonb_build_array('new')));
end$$;
create function public.prepare_native_meetup_admission(p_kind text,p_room_id uuid,p_input jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();q quantum_private.activity_meetup_admission_quotes%rowtype;i quantum_private.activity_meetup_admission_intents%rowtype;p quantum_private.activity_meetup_admission_policies%rowtype;
 qid uuid;key uuid;snapshot jsonb;reused boolean:=false;controls text:=U&'[\0001-\001f\007f-\009f\200b-\200f\2028-\202e\2060-\206f\feff]';
begin
 perform quantum_private.assert_activity_room_access(actor);perform quantum_private.native_admission_global_lock(p_kind);
 if p_input is null or jsonb_typeof(p_input)<>'object'or octet_length(p_input::text)>2048 then raise exception 'invalid_input';end if;
 if exists(select 1 from jsonb_object_keys(p_input)k where k not in('intro','strength','paymentMethod','consent','policyVersion','quoteId','idempotencyKey','metadata'))then raise exception 'unknown_field';end if;
 if jsonb_typeof(p_input->'intro')is distinct from 'string'or char_length(btrim(p_input->>'intro'))not between 1 and 80 or(p_input->>'intro')~controls then raise exception 'invalid_intro';end if;
 if p_input?'strength'and(jsonb_typeof(p_input->'strength')is distinct from 'string'or char_length(p_input->>'strength')>120 or replace(p_input->>'strength',E'\n','')~controls)then raise exception 'invalid_strength';end if;
 if p_input->'consent'is distinct from 'true'::jsonb then raise exception 'deposit_consent_required';end if;
 if p_input->>'paymentMethod'is distinct from 'new'then raise exception 'deposit_payment_method_unavailable';end if;
 if not quantum_private.native_admission_metadata_valid(p_kind,p_input->'metadata')then raise exception 'invalid_admission_metadata';end if;
 begin qid:=(p_input->>'quoteId')::uuid;key:=(p_input->>'idempotencyKey')::uuid;exception when invalid_text_representation then raise exception 'invalid_input';end;
 if qid is null or key is null then raise exception 'invalid_input';end if;
 perform quantum_private.native_admission_lock(p_kind,p_room_id,array[actor]);
 perform quantum_private.native_admission_available(p_kind,p_room_id,actor,p_input->'metadata');
 snapshot:=jsonb_build_object('intro',btrim(p_input->>'intro'),'strength',btrim(coalesce(p_input->>'strength','')),'paymentMethod','new','consent',true,'policyVersion',p_input->>'policyVersion','quoteId',qid,'metadata',p_input->'metadata');
 select *into p from quantum_private.activity_meetup_admission_policies where(p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id)for share;
 if p.id is null or not p.enabled then raise exception 'deposit_policy_unavailable';end if;
 select *into q from quantum_private.activity_meetup_admission_quotes where id=qid and user_id=actor and((p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id))for update;
 if q.id is null or q.metadata<>p_input->'metadata'then raise exception 'deposit_quote_mismatch';end if;
 if q.expires_at<=clock_timestamp()then raise exception 'deposit_quote_expired';end if;
 if q.amount_krw<>p.amount_krw or q.policy_version<>p.policy_version or q.policy_summary<>p.summary or q.policy_conditions<>p.conditions or p_input->>'policyVersion'is distinct from q.policy_version then raise exception 'deposit_policy_changed';end if;
 select *into i from quantum_private.activity_meetup_admission_intents where user_id=actor and idempotency_key=key for update;
 if i.id is not null then
  if i.study_room_id is distinct from q.study_room_id or i.mentoring_session_id is distinct from q.mentoring_session_id or i.meetup_id is not null or i.request_snapshot<>snapshot then raise exception 'idempotency_key_reused';end if;
  if i.preparation_state<>'prepared'or i.expires_at<=clock_timestamp()then raise exception 'deposit_quote_expired';end if;reused:=true;
 else
  update quantum_private.activity_meetup_admission_intents set preparation_state='expired'where user_id=actor and((p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id))and preparation_state='prepared'and expires_at<=clock_timestamp();
  if exists(select 1 from quantum_private.activity_meetup_admission_intents where user_id=actor and((p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id))and preparation_state='prepared')then raise exception 'admission_preparation_exists';end if;
  insert into quantum_private.activity_meetup_admission_intents(study_room_id,mentoring_session_id,user_id,quote_id,idempotency_key,request_snapshot,amount_krw,policy_version,policy_summary,policy_conditions,expires_at,metadata)
  values(q.study_room_id,q.mentoring_session_id,actor,q.id,key,snapshot,q.amount_krw,q.policy_version,q.policy_summary,q.policy_conditions,q.expires_at,q.metadata)returning *into i;
 end if;
 return jsonb_build_object('applicationId',null,'intentId',i.id,'admission','draft','payment','unpaid','preparation','prepared','checkoutEnabled',false,'reused',reused);
end$$;

-- Payloads deliberately exclude applicant identity, introduction, role and financial data.
create function quantum_private.emit_native_admission_event(aid uuid,ev text,recipient uuid,notice_id uuid default null)returns void
language plpgsql security definer set search_path='' as $$
declare a quantum_private.activity_meetup_admissions%rowtype;k text;r uuid;domain_value text;link text;nid uuid;heading text;body_text text;begin
 select *into a from quantum_private.activity_meetup_admissions where id=aid;k:=case when a.study_room_id is not null then 'study'else 'mentoring'end;r:=coalesce(a.study_room_id,a.mentoring_session_id);
 if a.id is null or not quantum_private.native_admission_visible(k,r,recipient)then return;end if;
 domain_value:=case k when 'study'then 'study_room'else 'mentoring'end;
 link:=case ev when 'application_received'then '/meetups/participation/'||k||'/'||r::text||'/applications'when 'application_accepted'then quantum_private.native_admission_chat_href(k,r)when 'application_notice'then quantum_private.native_admission_chat_href(k,r)else '/meetups/participation/'||k||'/'||r::text||'/apply'end;
 heading:=case ev when 'application_received'then '참가 신청이 도착했어요'when 'application_accepted'then '참가 신청이 승인됐어요'when 'application_declined'then '참가 신청 결과가 도착했어요'when 'application_notice'then '모임에 새 참가 신청이 왔어요'end;
 body_text:=case ev when 'application_received'then '신청 내용을 확인하고 승인 여부를 선택해 주세요.'when 'application_accepted'then '모임 채팅에서 기존 약속을 확인하고 인사해 주세요.'when 'application_declined'then '신청 결과와 보증금 반환 처리 상태를 확인해 주세요.'else '개설자가 신청 내용을 확인하고 있어요. 모임 채팅에서 소식을 확인해 주세요.'end;
 if heading is null then raise exception 'invalid_social_event';end if;nid:=gen_random_uuid();
 insert into quantum_private.social_notification_events(notification_id,domain,entity_id,entity_type,source_id,source_version,event,actor_id,recipient_id)
 values(nid,domain_value,r,case when ev='application_notice'then 'admission_notice'else 'admission'end,coalesce(notice_id,a.id),a.state,ev,null,recipient)
 on conflict(domain,entity_id,source_id,source_version,event,recipient_id)do nothing returning notification_id into nid;if nid is null then return;end if;
 insert into public.notifications(id,user_id,kind,payload)values(nid,recipient,'social_activity',jsonb_build_object('version',1,'domain',domain_value,'event',ev,'entity_id',r,'entity_type',case when ev='application_notice'then 'admission_notice'else 'admission'end,'audience',case when ev='application_received'then 'organizer'else 'participant'end,'title',heading,'body',body_text,'context_label',case k when 'study'then '스터디'else '멘토링'end,'status','current','href',link));
end$$;
create function quantum_private.native_admission_notice(aid uuid,notice_kind text,notice_text text)returns void
language plpgsql security definer set search_path='' as $$declare a quantum_private.activity_meetup_admissions%rowtype;k text;r uuid;t jsonb;nid uuid;recipient uuid;begin
 select *into a from quantum_private.activity_meetup_admissions where id=aid;k:=case when a.study_room_id is not null then 'study'else 'mentoring'end;r:=coalesce(a.study_room_id,a.mentoring_session_id);
 insert into quantum_private.activity_meetup_admission_notices(study_room_id,mentoring_session_id,application_id,kind,text)values(a.study_room_id,a.mentoring_session_id,a.id,notice_kind,notice_text)on conflict(application_id,kind)do nothing returning id into nid;
 if nid is null or notice_kind<>'application_received'then return;end if;
 t:=quantum_private.native_admission_target(k,r,a.user_id);
 perform quantum_private.emit_native_admission_event(a.id,'application_received',(t->>'host_user_id')::uuid);
 for recipient in select user_id from quantum_private.study_room_members where k='study'and room_id=r and left_at is null
 union select user_id from quantum_private.group_mentoring_members where k='mentoring'and session_id=r and left_at is null loop
  if recipient::text=t->>'host_user_id'or not quantum_private.native_admission_member_current(k,r,recipient)then continue;end if;
  perform quantum_private.emit_native_admission_event(a.id,'application_notice',recipient,nid);
 end loop;
end$$;
create function public.confirm_native_meetup_admission_payment_for_service(p_intent_id uuid,p_provider text,p_receipt_ref text,p_amount_krw integer)returns jsonb
language plpgsql security definer set search_path='' as $$
declare i quantum_private.activity_meetup_admission_intents%rowtype;d quantum_private.activity_meetup_admission_deposits%rowtype;a quantum_private.activity_meetup_admissions%rowtype;k text;r uuid;problem text;
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')is distinct from 'service_role'then raise exception 'service_only';end if;
 if p_provider is null or p_provider!~'^[a-z0-9_-]{2,40}$'or p_receipt_ref is null or char_length(p_receipt_ref)not between 1 and 200 or p_receipt_ref~'[[:cntrl:]]'or p_amount_krw is null or p_amount_krw<=0 then raise exception 'deposit_receipt_mismatch';end if;
 select *into i from quantum_private.activity_meetup_admission_intents where id=p_intent_id;
 if i.id is null then raise exception 'admission_intent_not_found';end if;
 if i.meetup_id is not null then raise exception 'invalid_room_kind';end if;
 k:=case when i.study_room_id is not null then 'study'else 'mentoring'end;r:=coalesce(i.study_room_id,i.mentoring_session_id);
 perform quantum_private.native_admission_lock(k,r,array[i.user_id]);
 select *into i from quantum_private.activity_meetup_admission_intents where id=p_intent_id for update;if i.id is null then raise exception 'admission_intent_not_found';end if;
 if p_amount_krw<>i.amount_krw then raise exception 'deposit_receipt_mismatch';end if;
 perform pg_advisory_xact_lock(hashtextextended('meetup-admission-receipt:'||p_provider||':'||p_receipt_ref,0));
 select *into d from quantum_private.activity_meetup_admission_deposits where provider=p_provider and receipt_ref=p_receipt_ref for update;
 if d.id is not null and d.intent_id<>i.id then raise exception 'deposit_receipt_reused';end if;
 if d.id is null then select *into d from quantum_private.activity_meetup_admission_deposits where intent_id=i.id for update;end if;
 if d.id is not null then
  if d.provider<>p_provider or d.receipt_ref<>p_receipt_ref or d.amount_krw<>p_amount_krw then raise exception 'deposit_receipt_mismatch';end if;
  select *into a from quantum_private.activity_meetup_admissions where deposit_id=d.id;if a.id is null then raise exception 'admission_reconciliation_required';end if;
  return quantum_private.native_admission_status(a.id,i.user_id);
 end if;
 begin
  perform quantum_private.native_admission_available(k,r,i.user_id,i.metadata);
  if i.preparation_state<>'prepared'or i.expires_at<=clock_timestamp()then raise exception 'deposit_quote_expired';end if;
  if exists(select 1 from quantum_private.activity_meetup_admissions where user_id=i.user_id and((k='study'and study_room_id=r)or(k='mentoring'and mentoring_session_id=r))and state in('pending','accepted'))then raise exception 'admission_exists';end if;
  if not exists(select 1 from quantum_private.activity_meetup_admission_policies p where((k='study'and p.study_room_id=r)or(k='mentoring'and p.mentoring_session_id=r))and p.enabled and p.amount_krw=i.amount_krw and p.policy_version=i.policy_version and p.summary=i.policy_summary and p.conditions=i.policy_conditions)then raise exception 'deposit_policy_changed';end if;
 exception when others then
  if sqlerrm in('not_authenticated','activity_room_forbidden','account_deletion_pending','profile_required','study_room_not_found','study_room_closed','study_room_already_joined','mentoring_not_found','mentoring_forbidden','mentoring_closed','mentoring_already_active','mentoring_conflict','mentoring_full','mentoring_role_full','meetup_closed','meetup_full','meetup_already_joined','admission_pair_blocked','deposit_quote_expired','admission_exists','deposit_policy_changed')then problem:=sqlerrm;else raise;end if;
 end;
 insert into quantum_private.activity_meetup_admission_deposits(intent_id,study_room_id,mentoring_session_id,user_id,amount_krw,provider,receipt_ref,policy_version,policy_summary,policy_conditions,metadata)
 values(i.id,i.study_room_id,i.mentoring_session_id,i.user_id,i.amount_krw,p_provider,p_receipt_ref,i.policy_version,i.policy_summary,i.policy_conditions,i.metadata)returning *into d;
 insert into quantum_private.activity_meetup_admissions(study_room_id,mentoring_session_id,user_id,deposit_id,intro,strength,state,metadata)
 values(i.study_room_id,i.mentoring_session_id,i.user_id,d.id,i.request_snapshot->>'intro',coalesce(i.request_snapshot->>'strength',''),case when problem is null then 'pending'else 'cancelled'end,i.metadata)returning *into a;
 update quantum_private.activity_meetup_admission_intents set preparation_state='expired'where id=i.id;update quantum_private.activity_meetup_admission_quotes set expires_at=least(expires_at,clock_timestamp())where id=i.quote_id;
 if problem is not null then perform quantum_private.admission_refund_due(d.id,problem);
 else perform quantum_private.native_admission_notice(a.id,'application_received','새 참가 신청이 도착했어요. 개설자가 신청 내용을 확인하고 있어요.');end if;
 return quantum_private.native_admission_status(a.id,i.user_id);
end$$;

create function public.get_my_native_meetup_admission(p_kind text,p_room_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare actor uuid:=auth.uid();aid uuid;begin
 perform quantum_private.assert_activity_room_access(actor);if p_kind is null or p_kind not in('study','mentoring')then raise exception 'invalid_room_kind';end if;
 select id into aid from quantum_private.activity_meetup_admissions where user_id=actor and((p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id))order by(state in('pending','accepted'))desc,created_at desc,id desc limit 1;
 return jsonb_build_object('application',quantum_private.native_admission_status(aid,actor));
end$$;
create function public.get_native_meetup_admissions(p_kind text,p_room_id uuid,p_before uuid default null)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();t jsonb;host boolean;items jsonb:='[]';notices jsonb;boundary timestamptz;more boolean:=false;next_id uuid;
begin
 perform quantum_private.assert_activity_room_access(actor);t:=quantum_private.native_admission_target(p_kind,p_room_id,actor);
 if not quantum_private.native_admission_member_current(p_kind,p_room_id,actor)then raise exception 'admission_host_required';end if;
 host:=t->>'host_user_id'=actor::text;
 if p_before is not null then select created_at into boundary from quantum_private.activity_meetup_admissions where id=p_before and((p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id));if not host or boundary is null then raise exception 'invalid_admission_cursor';end if;end if;
 if host then
  with page as(select a.id,a.state,a.revision,a.created_at,d.state payment,a.metadata,
   case when quantum_private.native_admission_visible(p_kind,p_room_id,a.user_id)then a.intro else ''end intro,
   case when quantum_private.native_admission_visible(p_kind,p_room_id,a.user_id)then a.strength else ''end strength,row_number()over(order by a.created_at desc,a.id desc)rn
   from quantum_private.activity_meetup_admissions a join quantum_private.activity_meetup_admission_deposits d on d.id=a.deposit_id
   where((p_kind='study'and a.study_room_id=p_room_id)or(p_kind='mentoring'and a.mentoring_session_id=p_room_id))and(p_before is null or(a.created_at,a.id)<(boundary,p_before))order by a.created_at desc,a.id desc limit 51)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'alias','신청자','intro',intro,'strength',strength,'admission',state,'payment',payment,'revision',revision,'createdAt',created_at,'metadata',metadata)order by created_at desc,id desc)filter(where rn<=50),'[]'),count(*)>50,
  (array_agg(id order by created_at desc,id desc)filter(where rn<=50))[50]into items,more,next_id from page;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'text',text,'createdAt',created_at)order by created_at,id),'[]')into notices
 from(select *from quantum_private.activity_meetup_admission_notices where(p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id)order by created_at desc,id desc limit 50)n;
 return jsonb_build_object('room',jsonb_build_object('id',p_room_id,'title',t->>'title','memberCount',(t->>'member_count')::integer,'capacity',(t->>'capacity')::integer),'isHost',host,
 'pendingCount',(select count(*)from quantum_private.activity_meetup_admissions where((p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id))and state='pending'),
 'applications',items,'notices',notices,'hasMore',more,'nextCursor',case when more then next_id end);
end$$;
create function public.decide_native_meetup_admission(p_kind text,p_room_id uuid,p_application_id uuid,p_action text,p_revision integer)returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();a quantum_private.activity_meetup_admissions%rowtype;d quantum_private.activity_meetup_admission_deposits%rowtype;t jsonb;person uuid;
begin
 perform quantum_private.assert_activity_room_access(actor);perform quantum_private.native_admission_global_lock(p_kind);
 if p_action is null or p_action not in('approve','decline')or p_revision is null or p_revision<0 then raise exception 'invalid_admission_action';end if;
 select *into a from quantum_private.activity_meetup_admissions where id=p_application_id and((p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id));if a.id is null then raise exception 'admission_not_found';end if;
 perform quantum_private.native_admission_lock(p_kind,p_room_id,array[actor,a.user_id]);t:=quantum_private.native_admission_target(p_kind,p_room_id,actor);
 if t->>'host_user_id'is distinct from actor::text or not quantum_private.native_admission_member_current(p_kind,p_room_id,actor)then raise exception 'admission_host_required';end if;
 select *into a from quantum_private.activity_meetup_admissions where id=p_application_id for update;select *into d from quantum_private.activity_meetup_admission_deposits where id=a.deposit_id for update;
 if a.state<>'pending'then
  if((a.state='accepted'and p_action='approve')or(a.state='declined'and p_action='decline'))and p_revision=a.revision-1 then return quantum_private.native_admission_status(a.id,actor);end if;raise exception 'admission_state_conflict';
 end if;
 if a.revision<>p_revision then raise exception 'admission_state_conflict';end if;
 if d.state<>'held'or d.user_id is distinct from a.user_id or d.study_room_id is distinct from a.study_room_id or d.mentoring_session_id is distinct from a.mentoring_session_id or d.metadata<>a.metadata then raise exception 'deposit_not_held';end if;
 if p_action='approve'then
  perform quantum_private.native_admission_available(p_kind,p_room_id,a.user_id,a.metadata);
  if p_kind='study'then perform quantum_private.hosted_study_admit(p_room_id,a.user_id,a.metadata);else perform quantum_private.hosted_mentoring_admit(p_room_id,a.user_id,a.metadata);end if;
  update quantum_private.activity_meetup_admissions set state='accepted',revision=revision+1,updated_at=clock_timestamp()where id=a.id;
  perform quantum_private.native_admission_notice(a.id,'application_accepted','새 참가자가 합류했어요. 이전 대화를 확인하고 함께 인사해 주세요.');
  perform quantum_private.emit_native_admission_event(a.id,'application_accepted',a.user_id);
 else
  update quantum_private.activity_meetup_admissions set state='declined',revision=revision+1,updated_at=clock_timestamp()where id=a.id;perform quantum_private.admission_refund_due(d.id,'application_declined');
  perform quantum_private.native_admission_notice(a.id,'application_closed','참가 신청 검토가 완료됐어요. 현재 모집 현황을 확인해 주세요.');perform quantum_private.emit_native_admission_event(a.id,'application_declined',a.user_id);
 end if;return quantum_private.native_admission_status(a.id,actor);
end$$;
create function public.cancel_my_native_meetup_admission(p_kind text,p_room_id uuid,p_application_id uuid,p_revision integer)returns jsonb
language plpgsql security definer set search_path='' as $$declare actor uuid:=auth.uid();a quantum_private.activity_meetup_admissions%rowtype;begin
 perform quantum_private.assert_activity_room_access(actor);perform quantum_private.native_admission_global_lock(p_kind);
 if p_revision is null or p_revision<0 then raise exception 'invalid_admission_action';end if;
 perform quantum_private.native_admission_lock(p_kind,p_room_id,array[actor]);
 select *into a from quantum_private.activity_meetup_admissions where id=p_application_id and user_id=actor and((p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id))for update;
 if a.id is null then raise exception 'admission_not_found';end if;
 if a.state='cancelled'and p_revision=a.revision-1 then return quantum_private.native_admission_status(a.id,actor);end if;
 if a.state='accepted'then raise exception 'admission_already_accepted';end if;
 if a.state<>'pending'or a.revision<>p_revision then raise exception 'admission_state_conflict';end if;
 update quantum_private.activity_meetup_admissions set state='cancelled',revision=revision+1,updated_at=clock_timestamp()where id=a.id;perform quantum_private.admission_refund_due(a.deposit_id,'applicant_cancelled');
 perform quantum_private.native_admission_notice(a.id,'application_closed','참가 신청이 취소됐어요. 현재 모집 현황을 확인해 주세요.');return quantum_private.native_admission_status(a.id,actor);
end$$;

create function quantum_private.native_admission_room_closed()returns trigger
language plpgsql security definer set search_path='' as $$declare a record;k text;closed boolean;begin
 k:=case tg_table_name when 'study_rooms'then 'study'else 'mentoring'end;
 if k='study'then closed:=new.completed or new.recruitment_closed or new.host_user_id is null;
 else closed:=new.status in('ended','expired')or new.host_user_id is null;end if;
 if coalesce(to_jsonb(new)->>'admission_mode',to_jsonb(new)->>'recruitment_mode')<>'hosted'or not closed then return new;end if;
 for a in select id,deposit_id from quantum_private.activity_meetup_admissions where((k='study'and study_room_id=new.id)or(k='mentoring'and mentoring_session_id=new.id))and state in('pending','accepted')order by id for update loop
  update quantum_private.activity_meetup_admissions set state='cancelled',revision=revision+1,updated_at=clock_timestamp()where id=a.id;perform quantum_private.admission_refund_due(a.deposit_id,'native_room_closed_review_required');
 end loop;return new;
end$$;
create trigger native_study_admission_closed after update of completed,recruitment_closed,host_user_id on quantum_private.study_rooms for each row execute function quantum_private.native_admission_room_closed();
create trigger native_mentoring_admission_closed after update of status,host_user_id on quantum_private.group_mentoring_sessions for each row execute function quantum_private.native_admission_room_closed();
create function quantum_private.native_admission_member_left()returns trigger
language plpgsql security definer set search_path='' as $$declare a record;k text;r uuid;u uuid;is_host boolean;begin
 if tg_op='UPDATE'and(old.left_at is not null or new.left_at is null)then return new;end if;
 k:=case tg_table_name when 'study_room_members'then 'study'else 'mentoring'end;r:=case when k='study'then(to_jsonb(old)->>'room_id')::uuid else(to_jsonb(old)->>'session_id')::uuid end;u:=old.user_id;
 if k='study'then select host_user_id=u into is_host from quantum_private.study_rooms where id=r and admission_mode='hosted';if is_host then update quantum_private.study_rooms set recruitment_closed=true,revision=revision+1 where id=r;end if;
 else select host_user_id=u into is_host from quantum_private.group_mentoring_sessions where id=r and recruitment_mode='hosted';end if;
 for a in select id,deposit_id from quantum_private.activity_meetup_admissions where user_id=u and((k='study'and study_room_id=r)or(k='mentoring'and mentoring_session_id=r))and state='accepted'order by id for update loop
  update quantum_private.activity_meetup_admissions set state='cancelled',revision=revision+1,updated_at=clock_timestamp()where id=a.id;perform quantum_private.admission_refund_due(a.deposit_id,'membership_ended_review_required');
 end loop;
 if tg_op='DELETE'then return old;end if;return new;
end$$;
create trigger native_study_admission_left after update of left_at or delete on quantum_private.study_room_members for each row execute function quantum_private.native_admission_member_left();
create trigger native_mentoring_admission_left after update of left_at or delete on quantum_private.group_mentoring_members for each row execute function quantum_private.native_admission_member_left();

-- Preserve the old custom service endpoint; it may never process a native intent.
alter function public.confirm_activity_meetup_admission_payment_for_service(uuid,text,text,integer)set schema quantum_private;
create function public.confirm_activity_meetup_admission_payment_for_service(p_intent_id uuid,p_provider text,p_receipt_ref text,p_amount_krw integer)returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from quantum_private.activity_meetup_admission_intents where id=p_intent_id and meetup_id is not null)then raise exception 'admission_intent_not_found';end if;
 return quantum_private.confirm_activity_meetup_admission_payment_for_service(p_intent_id,p_provider,p_receipt_ref,p_amount_krw);
end$$;

create function quantum_private.native_admission_notification_current(p_notification_id uuid,p_recipient uuid)returns boolean
language plpgsql stable security definer set search_path='' as $$
declare x quantum_private.social_notification_events%rowtype;a quantum_private.activity_meetup_admissions%rowtype;k text;t jsonb;begin
 select *into x from quantum_private.social_notification_events where notification_id=p_notification_id and recipient_id=p_recipient and domain in('study_room','mentoring')and entity_type in('admission','admission_notice');if x.notification_id is null then return false;end if;
 k:=case x.domain when 'study_room'then 'study'else 'mentoring'end;
 if not quantum_private.native_admission_visible(k,x.entity_id,p_recipient)then return false;end if;
 select *into a from quantum_private.activity_meetup_admissions where id=case when x.entity_type='admission_notice'then(select application_id from quantum_private.activity_meetup_admission_notices where id=x.source_id)else x.source_id end
 and((k='study'and study_room_id=x.entity_id)or(k='mentoring'and mentoring_session_id=x.entity_id));if a.id is null then return false;end if;
 t:=quantum_private.native_admission_target(k,x.entity_id,p_recipient);
 if x.event in('application_received','application_notice')then return a.state='pending'and t->>'status'in('open','full')and quantum_private.native_admission_visible(k,x.entity_id,a.user_id)
 and quantum_private.native_admission_member_current(k,x.entity_id,p_recipient)and(case when x.event='application_received'then t->>'host_user_id'=p_recipient::text else t->>'host_user_id'<>p_recipient::text end);
 elsif x.event='application_accepted'then return a.user_id=p_recipient and a.state='accepted'and quantum_private.native_admission_member_current(k,x.entity_id,p_recipient)and exists(select 1 from quantum_private.activity_meetup_admission_deposits where id=a.deposit_id and state='held');
 elsif x.event='application_declined'then return a.user_id=p_recipient and a.state='declined';end if;return false;
end$$;
alter function public.get_activity_meetup_admission_notification(uuid)set schema quantum_private;
create function public.get_activity_meetup_admission_notification(p_notification_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare actor uuid:=auth.uid();x quantum_private.social_notification_events%rowtype;k text;link text;begin
 perform quantum_private.assert_activity_room_access(actor);
 if not exists(select 1 from public.notifications where id=p_notification_id and user_id=actor)then raise exception 'notification_not_found';end if;
 select *into x from quantum_private.social_notification_events where notification_id=p_notification_id and recipient_id=actor and domain in('study_room','mentoring')and entity_type in('admission','admission_notice');
 if x.notification_id is null then return quantum_private.get_activity_meetup_admission_notification(p_notification_id);end if;
 if not quantum_private.native_admission_notification_current(p_notification_id,actor)then return jsonb_build_object('status','ended','href',null);end if;
 k:=case x.domain when 'study_room'then 'study'else 'mentoring'end;
 link:=case x.event when 'application_received'then '/meetups/participation/'||k||'/'||x.entity_id::text||'/applications'when 'application_accepted'then quantum_private.native_admission_chat_href(k,x.entity_id)when 'application_notice'then quantum_private.native_admission_chat_href(k,x.entity_id)else '/meetups/participation/'||k||'/'||x.entity_id::text||'/apply'end;
 return jsonb_build_object('status','current','href',link);
end$$;
-- Private helpers have no caller grants; all public mutations re-derive auth.uid().
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='quantum_private'and(p.proname like 'native_admission_%'or p.proname in('emit_native_admission_event','confirm_activity_meetup_admission_payment_for_service','get_activity_meetup_admission_notification'))loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'and p.proname in('get_native_meetup_admission_context','prepare_native_meetup_admission','get_my_native_meetup_admission','get_native_meetup_admissions','decide_native_meetup_admission','cancel_my_native_meetup_admission','get_activity_meetup_admission_notification')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end$$;
revoke all on function public.confirm_native_meetup_admission_payment_for_service(uuid,text,text,integer),public.confirm_activity_meetup_admission_payment_for_service(uuid,text,text,integer)from public,anon,authenticated,service_role;
grant execute on function public.confirm_native_meetup_admission_payment_for_service(uuid,text,text,integer),public.confirm_activity_meetup_admission_payment_for_service(uuid,text,text,integer)to service_role;
commit;
