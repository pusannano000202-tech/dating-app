-- LOCAL CANDIDATE. No PG checkout/webhook, live payment, refund or push delivery.
-- A trusted service receipt is a boundary, NOT a payment verification implementation.
-- Keep checkoutEnabled=false and policies unseeded until a verified provider adapter exists.
begin;

create table quantum_private.activity_meetup_admission_deposits(
 id uuid primary key default gen_random_uuid(),
 intent_id uuid not null unique,
 meetup_id uuid references public.activity_meetups(id) on delete set null,
 user_id uuid references public.users(id) on delete set null,
 amount_krw integer not null check(amount_krw>0),currency text not null default 'KRW' check(currency='KRW'),
 provider text not null check(provider ~ '^[a-z0-9_-]{2,40}$'),
 receipt_ref text not null check(char_length(receipt_ref) between 1 and 200),
 policy_version text not null,policy_summary text not null,policy_conditions text[] not null,
 state text not null default 'held' check(state in('held','refund_due','refunded')),
 confirmed_at timestamptz not null default clock_timestamp(),unique(provider,receipt_ref)
);
-- Unpaid intents still cascade on account deletion. Paid allocations are separate,
-- retain no introductions/contact data, and survive deletion with nullable references.
create table quantum_private.activity_meetup_admissions(
 id uuid primary key default gen_random_uuid(),
 meetup_id uuid not null references public.activity_meetups(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 deposit_id uuid not null unique references quantum_private.activity_meetup_admission_deposits(id),
 intro text not null check(char_length(intro) between 1 and 80),
 strength text not null default '' check(char_length(strength)<=120),
 state text not null default 'pending' check(state in('pending','accepted','declined','cancelled')),
 revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create unique index activity_meetup_admission_active on quantum_private.activity_meetup_admissions(user_id,meetup_id)where state in('pending','accepted');
create index activity_meetup_admission_host_queue on quantum_private.activity_meetup_admissions(meetup_id,created_at desc,id desc);
create table quantum_private.activity_meetup_admission_notices(
 id uuid primary key default gen_random_uuid(),meetup_id uuid not null references public.activity_meetups(id)on delete cascade,
 application_id uuid references quantum_private.activity_meetup_admissions(id)on delete set null,
 kind text not null check(kind in('application_received','application_accepted','application_closed')),
 text text not null,created_at timestamptz not null default clock_timestamp(),unique(application_id,kind)
);
create table quantum_private.activity_meetup_admission_refund_outbox(
 deposit_id uuid primary key references quantum_private.activity_meetup_admission_deposits(id),
 reason text not null,created_at timestamptz not null default clock_timestamp(),
 state text not null default 'pending' check(state in('pending','processing','completed','failed'))
);
alter table quantum_private.activity_meetup_admission_deposits enable row level security;
alter table quantum_private.activity_meetup_admissions enable row level security;
alter table quantum_private.activity_meetup_admission_notices enable row level security;
alter table quantum_private.activity_meetup_admission_refund_outbox enable row level security;
revoke all on quantum_private.activity_meetup_admission_deposits,quantum_private.activity_meetup_admissions,quantum_private.activity_meetup_admission_notices,quantum_private.activity_meetup_admission_refund_outbox from public,anon,authenticated,service_role;

create function quantum_private.admission_refund_due(p_deposit uuid,p_reason text)returns void
language plpgsql security definer set search_path='' as $$begin
 update quantum_private.activity_meetup_admission_deposits set state='refund_due'where id=p_deposit and state='held';
 insert into quantum_private.activity_meetup_admission_refund_outbox(deposit_id,reason)
 select id,p_reason from quantum_private.activity_meetup_admission_deposits where id=p_deposit and state='refund_due'
 on conflict(deposit_id)do nothing;
end$$;
create function quantum_private.admission_delete_refund()returns trigger
language plpgsql security definer set search_path='' as $$begin
 perform quantum_private.admission_refund_due(old.deposit_id,'account_or_room_removed');return old;
end$$;
create trigger admission_retention_before_delete before delete on quantum_private.activity_meetup_admissions for each row execute function quantum_private.admission_delete_refund();

create function quantum_private.admission_pair_clear(p_meetup uuid,p_user uuid)returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.activity_meetup_members m where m.meetup_id=p_meetup and m.status='joined'
  and quantum_private.tonight_invite_pair_is_blocked(m.user_id,p_user))
$$;
create function quantum_private.emit_admission_room_notice(p_notice uuid,p_applicant uuid)returns void
language plpgsql security definer set search_path='' as $$declare n quantum_private.activity_meetup_admission_notices%rowtype;recipient uuid;nid uuid;host uuid;begin
 select * into n from quantum_private.activity_meetup_admission_notices where id=p_notice;
 select host_user_id into host from public.activity_meetups where id=n.meetup_id;
 if n.id is null or n.kind<>'application_received'then raise exception 'invalid_admission_notice';end if;
 for recipient in select user_id from public.activity_meetup_members where meetup_id=n.meetup_id and status='joined'and user_id<>host loop
  if not quantum_private.social_notification_scope('meetup',n.meetup_id,recipient,null,'admission_notice')
   or quantum_private.tonight_invite_pair_is_blocked(p_applicant,recipient)then continue;end if;
  nid:=gen_random_uuid();
  insert into quantum_private.social_notification_events(notification_id,domain,entity_id,entity_type,source_id,source_version,event,actor_id,recipient_id)
   values(nid,'meetup',n.meetup_id,'admission_notice',n.id,'notice','application_notice',null,recipient)
   on conflict(domain,entity_id,source_id,source_version,event,recipient_id)do nothing returning notification_id into nid;
  if nid is null then continue;end if;
  insert into public.notifications(id,user_id,kind,payload)values(nid,recipient,'social_activity',jsonb_build_object(
   'version',1,'domain','meetup','event','application_notice','entity_id',n.meetup_id,'entity_type','admission_notice','audience','participant',
   'title','모임에 새 참가 신청이 왔어요','body','방장이 신청 내용을 확인하고 있어요. 모임 채팅에서 소식을 확인해 주세요.',
   'context_label','모임','status','current','href','/chat/rooms/meetup/'||n.meetup_id::text));
 end loop;
end$$;
create function quantum_private.admission_status_json(p_id uuid,p_viewer uuid)returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'admission',a.state,'payment',d.state,'amountKrw',d.amount_krw,'revision',a.revision,
 'chatHref',case when a.state='accepted'and d.state='held'and quantum_private.activity_meetup_scope_eligible(a.meetup_id,a.user_id)
  and quantum_private.admission_pair_clear(a.meetup_id,a.user_id)
  and exists(select 1 from public.activity_meetup_members m where m.meetup_id=a.meetup_id and m.user_id=a.user_id and m.status='joined')
  then '/chat/rooms/meetup/'||a.meetup_id::text end)
 from quantum_private.activity_meetup_admissions a join quantum_private.activity_meetup_admission_deposits d on d.id=a.deposit_id
 where a.id=p_id and(a.user_id=p_viewer or exists(select 1 from public.activity_meetups m where m.id=a.meetup_id and m.host_user_id=p_viewer))
$$;

create function public.confirm_activity_meetup_admission_payment_for_service(p_intent_id uuid,p_provider text,p_receipt_ref text,p_amount_krw integer)returns jsonb
language plpgsql security definer set search_path='' as $$
declare i quantum_private.activity_meetup_admission_intents%rowtype;d quantum_private.activity_meetup_admission_deposits%rowtype;
 a quantum_private.activity_meetup_admissions%rowtype;room public.activity_meetups%rowtype;problem text;notice_id uuid;
begin
 -- ACL plus server JWT role; this is intentionally not callable by authenticated users.
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')is distinct from 'service_role' then raise exception 'service_only';end if;
 if p_provider is null or p_provider!~'^[a-z0-9_-]{2,40}$'or p_receipt_ref is null or char_length(p_receipt_ref)not between 1 and 200
  or p_receipt_ref~'[[:cntrl:]]'or p_amount_krw is null or p_amount_krw<=0 then raise exception 'deposit_receipt_mismatch';end if;
 select * into i from quantum_private.activity_meetup_admission_intents where id=p_intent_id;
 if i.id is null then raise exception 'admission_intent_not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||i.user_id::text,0));
 select * into room from public.activity_meetups where id=i.meetup_id for update;
 select * into i from quantum_private.activity_meetup_admission_intents where id=p_intent_id for update;
 if i.id is null then raise exception 'admission_intent_not_found';end if;
 if p_amount_krw<>i.amount_krw then raise exception 'deposit_receipt_mismatch';end if;
 perform pg_advisory_xact_lock(hashtextextended('meetup-admission-receipt:'||p_provider||':'||p_receipt_ref,0));
 select * into d from quantum_private.activity_meetup_admission_deposits where provider=p_provider and receipt_ref=p_receipt_ref for update;
 if d.id is not null and d.intent_id<>i.id then raise exception 'deposit_receipt_reused';end if;
 if d.id is null then select * into d from quantum_private.activity_meetup_admission_deposits where intent_id=i.id for update;end if;
 if d.id is not null then
  if d.provider<>p_provider or d.receipt_ref<>p_receipt_ref or d.amount_krw<>p_amount_krw then raise exception 'deposit_receipt_mismatch';end if;
  select * into a from quantum_private.activity_meetup_admissions where deposit_id=d.id;
  if a.id is null then raise exception 'admission_reconciliation_required';end if;
  return quantum_private.admission_status_json(a.id,i.user_id);
 end if;
 -- A provider already received money: admission becoming impossible records refund_due,
 -- not an exception that loses the financial receipt and not a false refund success.
 begin
  perform quantum_private.assert_meetup_admission_access(i.user_id,i.meetup_id);
  if not quantum_private.admission_pair_clear(i.meetup_id,i.user_id)then raise exception 'admission_pair_blocked';end if;
  if i.preparation_state<>'prepared'or i.expires_at<=clock_timestamp()then raise exception 'deposit_quote_expired';end if;
  if exists(select 1 from quantum_private.activity_meetup_admissions where user_id=i.user_id and meetup_id=i.meetup_id and state in('pending','accepted'))then raise exception 'admission_exists';end if;
  if not exists(select 1 from quantum_private.activity_meetup_admission_policies p where p.meetup_id=i.meetup_id and p.enabled and p.amount_krw=i.amount_krw
   and p.policy_version=i.policy_version and p.summary=i.policy_summary and p.conditions=i.policy_conditions)then raise exception 'deposit_policy_changed';end if;
 exception when others then
  if sqlerrm in('not_authenticated','activity_room_forbidden','account_deletion_pending','profile_required','meetup_not_found','meetup_closed','meetup_full','meetup_already_joined','meetup_gender_required','meetup_gender_restricted','admission_pair_blocked','deposit_quote_expired','admission_exists','deposit_policy_changed')then problem:=sqlerrm;else raise;end if;
 end;
 insert into quantum_private.activity_meetup_admission_deposits(intent_id,meetup_id,user_id,amount_krw,provider,receipt_ref,policy_version,policy_summary,policy_conditions)
 values(i.id,i.meetup_id,i.user_id,i.amount_krw,p_provider,p_receipt_ref,i.policy_version,i.policy_summary,i.policy_conditions)returning * into d;
 insert into quantum_private.activity_meetup_admissions(meetup_id,user_id,deposit_id,intro,strength,state)
 values(i.meetup_id,i.user_id,d.id,i.request_snapshot->>'intro',coalesce(i.request_snapshot->>'strength',''),case when problem is null then 'pending'else 'cancelled'end)returning * into a;
 update quantum_private.activity_meetup_admission_intents set preparation_state='expired'where id=i.id;
 -- A consumed quote must not be offered to a later reapplication (quote_id is unique).
 update quantum_private.activity_meetup_admission_quotes set expires_at=least(expires_at,clock_timestamp())where id=i.quote_id;
 if problem is not null then perform quantum_private.admission_refund_due(d.id,problem);
 else
  insert into quantum_private.activity_meetup_admission_notices(meetup_id,application_id,kind,text)values(i.meetup_id,a.id,'application_received','새 참가 신청이 도착했어요. 방장이 신청 내용을 확인하고 있어요.')returning id into notice_id;
  perform quantum_private.emit_admission_room_notice(notice_id,i.user_id);
  perform quantum_private.emit_social_notification('meetup',i.meetup_id,null,'admission',a.id,'pending',i.user_id,room.host_user_id,'application_received','organizer');
 end if;
 return quantum_private.admission_status_json(a.id,i.user_id);
end$$;

create function public.get_my_activity_meetup_admission(p_meetup_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare actor uuid:=auth.uid();aid uuid;begin
 perform quantum_private.assert_activity_room_access(actor);
 select id into aid from quantum_private.activity_meetup_admissions where meetup_id=p_meetup_id and user_id=actor order by(state in('pending','accepted'))desc,created_at desc,id desc limit 1;
 return jsonb_build_object('application',quantum_private.admission_status_json(aid,actor));
end$$;

create function public.get_activity_meetup_admissions(p_meetup_id uuid,p_before uuid default null)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();room public.activity_meetups%rowtype;host boolean;items jsonb:='[]';notices jsonb;boundary timestamptz;more boolean:=false;next_id uuid;
begin
 perform quantum_private.assert_activity_room_access(actor);
 select * into room from public.activity_meetups where id=p_meetup_id;
 if room.id is null or not quantum_private.activity_meetup_scope_eligible(p_meetup_id,actor)
  or not exists(select 1 from public.activity_meetup_members where meetup_id=p_meetup_id and user_id=actor and status='joined')then raise exception 'meetup_not_found';end if;
 host:=room.host_user_id=actor;
 if p_before is not null then select created_at into boundary from quantum_private.activity_meetup_admissions where id=p_before and meetup_id=p_meetup_id;if not host or boundary is null then raise exception 'invalid_admission_cursor';end if;end if;
 if host then
  with page as(select a.id,a.state,a.revision,a.created_at,d.state payment,
   case when quantum_private.social_notification_scope('meetup',p_meetup_id,a.user_id,null,'admission')and quantum_private.admission_pair_clear(p_meetup_id,a.user_id)then a.intro else ''end intro,
   case when quantum_private.social_notification_scope('meetup',p_meetup_id,a.user_id,null,'admission')and quantum_private.admission_pair_clear(p_meetup_id,a.user_id)then a.strength else ''end strength,
   row_number()over(order by a.created_at desc,a.id desc)rn
   from quantum_private.activity_meetup_admissions a join quantum_private.activity_meetup_admission_deposits d on d.id=a.deposit_id
   where a.meetup_id=p_meetup_id and(p_before is null or(a.created_at,a.id)<(boundary,p_before))order by a.created_at desc,a.id desc limit 51)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'alias','신청자','intro',intro,'strength',strength,'admission',state,'payment',payment,'revision',revision,'createdAt',created_at)order by created_at desc,id desc)filter(where rn<=50),'[]'),count(*)>50,
   (array_agg(id order by created_at desc,id desc)filter(where rn<=50))[50] into items,more,next_id from page;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'text',text,'createdAt',created_at)order by created_at,id),'[]')into notices
 from(select * from quantum_private.activity_meetup_admission_notices where meetup_id=p_meetup_id order by created_at desc,id desc limit 50)n;
 return jsonb_build_object('room',jsonb_build_object('id',room.id,'title',room.title,'memberCount',(select count(*)from public.activity_meetup_members m where meetup_id=p_meetup_id and status='joined'and quantum_private.activity_meetup_scope_eligible(p_meetup_id,m.user_id)),'capacity',room.capacity),
  'isHost',host,'pendingCount',(select count(*)from quantum_private.activity_meetup_admissions where meetup_id=p_meetup_id and state='pending'),
  'applications',items,'notices',notices,'hasMore',more,'nextCursor',case when more then next_id end);
end$$;

create function public.decide_activity_meetup_admission(p_meetup_id uuid,p_application_id uuid,p_action text,p_revision integer)returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();a quantum_private.activity_meetup_admissions%rowtype;room public.activity_meetups%rowtype;
 d quantum_private.activity_meetup_admission_deposits%rowtype;person uuid;school_key text;department_key text;members integer;
begin
 perform quantum_private.assert_activity_room_access(actor);
 if p_action is null or p_action not in('approve','decline')or p_revision is null or p_revision<0 then raise exception 'invalid_admission_action';end if;
 select * into a from quantum_private.activity_meetup_admissions where id=p_application_id and meetup_id=p_meetup_id;
 if a.id is null then raise exception 'admission_not_found';end if;
 -- Both users are locked in canonical order before room/member locks.
 for person in select u from unnest(array[actor,a.user_id])u order by u loop perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||person::text,0));end loop;
 select * into room from public.activity_meetups where id=p_meetup_id for update;
 if room.host_user_id is distinct from actor or not quantum_private.activity_meetup_scope_eligible(p_meetup_id,actor)
  or not exists(select 1 from public.activity_meetup_members where meetup_id=p_meetup_id and user_id=actor and status='joined')then raise exception 'admission_host_required';end if;
 select * into a from quantum_private.activity_meetup_admissions where id=p_application_id for update;
 select * into d from quantum_private.activity_meetup_admission_deposits where id=a.deposit_id for update;
 if a.state<>'pending'then
  if((a.state='accepted'and p_action='approve')or(a.state='declined'and p_action='decline'))and p_revision=a.revision-1 then return quantum_private.admission_status_json(a.id,actor);end if;
  raise exception 'admission_state_conflict';
 end if;
 if a.revision<>p_revision then raise exception 'admission_state_conflict';end if;
 if d.state<>'held'then raise exception 'deposit_not_held';end if;
 if p_action='approve'then
  perform quantum_private.assert_meetup_admission_access(a.user_id,p_meetup_id);
  if not quantum_private.admission_pair_clear(p_meetup_id,a.user_id)then raise exception 'admission_pair_blocked';end if;
  if room.scope_type='department'then select i.school_scope_key,i.department_key into school_key,department_key from quantum_private.get_member_department_identity(a.user_id)i;end if;
  insert into public.activity_meetup_members(meetup_id,user_id,role,status,joined_at,left_at,school_scope_key_snapshot,department_key_snapshot,membership_revision)
  values(p_meetup_id,a.user_id,'member','joined',clock_timestamp(),null,school_key,department_key,0)
  on conflict(meetup_id,user_id)do update set role='member',status='joined',joined_at=excluded.joined_at,left_at=null,
   school_scope_key_snapshot=excluded.school_scope_key_snapshot,department_key_snapshot=excluded.department_key_snapshot,membership_revision=public.activity_meetup_members.membership_revision+1;
  select count(*)into members from public.activity_meetup_members m where meetup_id=p_meetup_id and status='joined'and quantum_private.activity_meetup_scope_eligible(p_meetup_id,m.user_id);
  update public.activity_meetups set status=case when members>=capacity then 'full'else 'open'end,revision=revision+1,updated_at=clock_timestamp()where id=p_meetup_id;
  update quantum_private.activity_meetup_admissions set state='accepted',revision=revision+1,updated_at=clock_timestamp()where id=a.id;
  insert into quantum_private.activity_meetup_admission_notices(meetup_id,application_id,kind,text)values(p_meetup_id,a.id,'application_accepted','새 참가자가 합류했어요. 이전 대화를 확인하고 함께 인사해 주세요.');
  perform quantum_private.emit_social_notification('meetup',p_meetup_id,null,'admission',a.id,'accepted',actor,a.user_id,'application_accepted','participant');
 else
  update quantum_private.activity_meetup_admissions set state='declined',revision=revision+1,updated_at=clock_timestamp()where id=a.id;
  perform quantum_private.admission_refund_due(d.id,'application_declined');
  insert into quantum_private.activity_meetup_admission_notices(meetup_id,application_id,kind,text)values(p_meetup_id,a.id,'application_closed','참가 신청 검토가 완료됐어요. 현재 모집 현황을 확인해 주세요.');
  perform quantum_private.emit_social_notification('meetup',p_meetup_id,null,'admission',a.id,'declined',actor,a.user_id,'application_declined','participant');
 end if;
 return quantum_private.admission_status_json(a.id,actor);
end$$;

create function public.cancel_my_activity_meetup_admission(p_meetup_id uuid,p_application_id uuid,p_revision integer)returns jsonb
language plpgsql security definer set search_path='' as $$declare actor uuid:=auth.uid();a quantum_private.activity_meetup_admissions%rowtype;begin
 perform quantum_private.assert_activity_room_access(actor);
 if p_revision is null or p_revision<0 then raise exception 'invalid_admission_action';end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||actor::text,0));
 perform 1 from public.activity_meetups where id=p_meetup_id for update;
 select * into a from quantum_private.activity_meetup_admissions where id=p_application_id and meetup_id=p_meetup_id and user_id=actor for update;
 if a.id is null then raise exception 'admission_not_found';end if;
 if a.state='cancelled'and p_revision=a.revision-1 then return quantum_private.admission_status_json(a.id,actor);end if;
 if a.state='accepted'then raise exception 'admission_already_accepted';end if;
 if a.state<>'pending'or a.revision<>p_revision then raise exception 'admission_state_conflict';end if;
 update quantum_private.activity_meetup_admissions set state='cancelled',revision=revision+1,updated_at=clock_timestamp()where id=a.id;
 perform quantum_private.admission_refund_due(a.deposit_id,'applicant_cancelled');
 insert into quantum_private.activity_meetup_admission_notices(meetup_id,application_id,kind,text)values(p_meetup_id,a.id,'application_closed','참가 신청이 취소됐어요. 현재 모집 현황을 확인해 주세요.');
 return quantum_private.admission_status_json(a.id,actor);
end$$;

create function quantum_private.admission_room_closed()returns trigger
language plpgsql security definer set search_path='' as $$declare a record;begin
 if new.status in('cancelled','completed')and old.status is distinct from new.status then
  for a in select id,deposit_id from quantum_private.activity_meetup_admissions where meetup_id=new.id and state='pending'for update loop
   update quantum_private.activity_meetup_admissions set state='cancelled',revision=revision+1,updated_at=clock_timestamp()where id=a.id;
   perform quantum_private.admission_refund_due(a.deposit_id,'room_closed');
  end loop;
 end if;return new;
end$$;
create trigger admission_room_closed after update of status on public.activity_meetups for each row execute function quantum_private.admission_room_closed();

create function quantum_private.admission_member_left()returns trigger
language plpgsql security definer set search_path='' as $$declare a record;begin
 if old.status='joined'and new.status='left'then
  for a in select id,deposit_id from quantum_private.activity_meetup_admissions where meetup_id=new.meetup_id and user_id=new.user_id and state='accepted'for update loop
   update quantum_private.activity_meetup_admissions set state='cancelled',revision=revision+1,updated_at=clock_timestamp()where id=a.id;
   -- Refund requires policy/provider review; leaving never fabricates a completed refund.
   perform quantum_private.admission_refund_due(a.deposit_id,'membership_ended_review_required');
  end loop;
 end if;return new;
end$$;
create trigger admission_member_left after update of status on public.activity_meetup_members for each row execute function quantum_private.admission_member_left();

-- Used both by authenticated click resolution and service-only push claim rechecks.
-- Return no applicant data: only whether this recipient can still act on this event.
create function quantum_private.meetup_admission_notification_current(p_notification_id uuid,p_recipient uuid)returns boolean
language plpgsql stable security definer set search_path='' as $$
declare x quantum_private.social_notification_events%rowtype;a quantum_private.activity_meetup_admissions%rowtype;room public.activity_meetups%rowtype;begin
 select * into x from quantum_private.social_notification_events where notification_id=p_notification_id and recipient_id=p_recipient and domain='meetup'and entity_type in('admission','admission_notice');
 if x.notification_id is null or not quantum_private.social_notification_scope('meetup',x.entity_id,p_recipient,null,'admission')then return false;end if;
 select * into a from quantum_private.activity_meetup_admissions where id=case when x.entity_type='admission_notice'then(select application_id from quantum_private.activity_meetup_admission_notices where id=x.source_id and meetup_id=x.entity_id)else x.source_id end and meetup_id=x.entity_id;
 select * into room from public.activity_meetups where id=x.entity_id;
 if a.id is null or room.id is null then return false;end if;
 if x.entity_type='admission_notice'and x.event='application_notice'then
  return a.state='pending'and room.status in('open','full')and room.host_user_id<>p_recipient
   and exists(select 1 from public.activity_meetup_members where meetup_id=room.id and user_id=p_recipient and status='joined')
   and quantum_private.admission_pair_clear(room.id,a.user_id);
 elsif x.event='application_received'then
  return a.state='pending'and room.status in('open','full')and room.host_user_id=p_recipient
   and exists(select 1 from public.activity_meetup_members where meetup_id=room.id and user_id=p_recipient and status='joined')
   and quantum_private.social_notification_scope('meetup',room.id,a.user_id,null,'admission')
   and quantum_private.admission_pair_clear(room.id,a.user_id);
 elsif x.event='application_accepted'then
  return a.user_id=p_recipient and a.state='accepted'and room.status in('open','full')
   and exists(select 1 from public.activity_meetup_members where meetup_id=room.id and user_id=p_recipient and status='joined')
   and exists(select 1 from quantum_private.activity_meetup_admission_deposits where id=a.deposit_id and state='held')
   and quantum_private.admission_pair_clear(room.id,p_recipient);
 elsif x.event='application_declined'then return a.user_id=p_recipient and a.state='declined';end if;
 return false;
end$$;
create function public.get_activity_meetup_admission_notification(p_notification_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();x quantum_private.social_notification_events%rowtype;link text;begin
 perform quantum_private.assert_activity_room_access(actor);
 if not exists(select 1 from public.notifications where id=p_notification_id and user_id=actor)then raise exception 'notification_not_found';end if;
 select * into x from quantum_private.social_notification_events where notification_id=p_notification_id and recipient_id=actor and domain='meetup'and entity_type in('admission','admission_notice');
 if x.notification_id is null then return public.resolve_my_social_notification(p_notification_id);end if;
 if not quantum_private.meetup_admission_notification_current(p_notification_id,actor)then return jsonb_build_object('status','ended','href',null);end if;
 link:=case x.event when 'application_received'then '/meetups/'||x.entity_id::text||'/applications'
  when 'application_accepted'then '/chat/rooms/meetup/'||x.entity_id::text
  when 'application_notice'then '/chat/rooms/meetup/'||x.entity_id::text
  else '/meetups/'||x.entity_id::text||'/apply' end;
 return jsonb_build_object('status','current','href',link);
end$$;

revoke all on function quantum_private.admission_refund_due(uuid,text),quantum_private.admission_delete_refund(),quantum_private.admission_pair_clear(uuid,uuid),quantum_private.admission_status_json(uuid,uuid),quantum_private.admission_room_closed(),quantum_private.admission_member_left()from public,anon,authenticated,service_role;
revoke all on function quantum_private.emit_admission_room_notice(uuid,uuid)from public,anon,authenticated,service_role;
revoke all on function quantum_private.meetup_admission_notification_current(uuid,uuid),public.get_activity_meetup_admission_notification(uuid)from public,anon,authenticated,service_role;
grant execute on function public.get_activity_meetup_admission_notification(uuid)to authenticated;
revoke all on function public.confirm_activity_meetup_admission_payment_for_service(uuid,text,text,integer),public.get_my_activity_meetup_admission(uuid),public.get_activity_meetup_admissions(uuid,uuid),public.decide_activity_meetup_admission(uuid,uuid,text,integer),public.cancel_my_activity_meetup_admission(uuid,uuid,integer)from public,anon,authenticated,service_role;
grant execute on function public.confirm_activity_meetup_admission_payment_for_service(uuid,text,text,integer)to service_role;
grant execute on function public.get_my_activity_meetup_admission(uuid),public.get_activity_meetup_admissions(uuid,uuid),public.decide_activity_meetup_admission(uuid,uuid,text,integer),public.cancel_my_activity_meetup_admission(uuid,uuid,integer)to authenticated;
commit;
