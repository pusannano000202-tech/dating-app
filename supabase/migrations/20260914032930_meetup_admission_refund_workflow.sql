-- Forward-only local candidate. No provider calls, policy seeding or live activation.
-- refund_due is a liability, not permission to pay. The owner must request it,
-- a current super_admin must approve, and the service worker must verify the PG.
begin;

alter table quantum_private.activity_meetup_admission_refund_outbox
 add column request_id uuid unique,
 add column requested_by uuid,
 add column requested_at timestamptz,
 add column approved_by uuid,
 add column approved_at timestamptz,
 add column attempt_count integer not null default 0 check(attempt_count between 0 and 5),
 add column lease_id uuid,
 add column lease_expires_at timestamptz,
 add column next_attempt_at timestamptz,
 add column last_error_code text check(last_error_code in(
  'refund_provider_failed','provider_unavailable','provider_timeout','refund_proof_mismatch',
  'refund_reconciliation_required','refund_attempts_exhausted','refund_owner_unavailable')),
 add column completed_at timestamptz,
 add column provider_transaction_key text unique,
 add column refunded_amount_krw integer check(refunded_amount_krw>0),
 add constraint admission_refund_request_complete check(
  (request_id is null and requested_by is null and requested_at is null)
  or(request_id is not null and requested_by is not null and requested_at is not null)),
 add constraint admission_refund_approval_complete check(
  (approved_at is null and approved_by is null)
  or(approved_at is not null and approved_by is not null and request_id is not null));

create index admission_refund_worker_queue
 on quantum_private.activity_meetup_admission_refund_outbox(next_attempt_at,created_at,deposit_id)
 where requested_at is not null and approved_at is not null and state in('pending','processing');

-- This is the existing outbox's immutable action history, not another money ledger.
-- UUID actor snapshots survive account removal; no introduction/contact/provider key.
create table quantum_private.meetup_admission_refund_audit(
 id uuid primary key default gen_random_uuid(),
 deposit_id uuid not null references quantum_private.activity_meetup_admission_deposits(id),
 request_id uuid not null,
 event text not null check(event in('requested','approved','retried','claimed','released','completed')),
 actor_id uuid,
 lease_id uuid,
 attempt_count integer not null check(attempt_count between 0 and 5),
 error_code text,
 created_at timestamptz not null default clock_timestamp()
);
alter table quantum_private.meetup_admission_refund_audit enable row level security;
revoke all on quantum_private.meetup_admission_refund_audit from public,anon,authenticated,service_role;

create function quantum_private.admission_refund_audit_immutable()returns trigger
language plpgsql set search_path='' as $$begin
 raise exception 'refund_audit_immutable';
end$$;
create trigger admission_refund_audit_immutable before update or delete
 on quantum_private.meetup_admission_refund_audit for each row
 execute function quantum_private.admission_refund_audit_immutable();

create function quantum_private.assert_admission_refund_service()returns void
language plpgsql security definer set search_path='' as $$begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
  nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')is distinct from 'service_role'
 then raise exception 'service_only';end if;
end$$;

create function quantum_private.assert_admission_refund_operator(p_actor uuid)returns void
language plpgsql security definer set search_path='' as $$begin
 perform quantum_private.assert_admission_refund_service();
 -- is_super_admin() is auth.uid-bound and cannot be used for a service JWT.
 -- Lock the current authority through this transaction; the HTTP boundary also
 -- requires a verified actor, MFA and recent authentication before this RPC.
 perform 1 from public.admins where user_id=p_actor and role='super_admin'for share;
 if not found then raise exception 'super_admin_required';end if;
end$$;

create function quantum_private.admission_refund_summary(p_deposit_id uuid)returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'depositId',d.id,'room',jsonb_build_object('kind',d.source_kind,'id',d.source_room_id),
  'roomTitle',left(regexp_replace(case d.source_kind
   when 'custom_meetup'then(select title from public.activity_meetups where id=d.source_room_id)
   when 'study'then(select title from quantum_private.study_rooms where id=d.source_room_id)
   when 'mentoring'then(select title from quantum_private.group_mentoring_sessions where id=d.source_room_id)
   end,'[[:cntrl:]]','','g'),80),
  'amountKrw',d.amount_krw,'payment',d.state,'requestId',q.request_id,
  'refundState',case when d.state='held'then 'unavailable'when d.state='refunded'then 'completed'
   when q.request_id is null then 'available'when q.state='processing'then 'processing'
   when q.state='failed'or q.last_error_code is not null then 'failed'
   when q.approved_at is not null then 'approved'else 'requested'end,
  'requestedAt',q.requested_at,'approvedAt',q.approved_at,'completedAt',q.completed_at,
  'lastError',q.last_error_code)
 from quantum_private.activity_meetup_admission_deposits d
 left join quantum_private.activity_meetup_admission_refund_outbox q on q.deposit_id=d.id
 where d.id=p_deposit_id
$$;

-- A paid checkout is the sole provider linkage. All original bindings and the
-- historical amount must match; neither an operator nor an owner chooses them.
create function quantum_private.admission_refund_order(d quantum_private.activity_meetup_admission_deposits)
returns quantum_private.meetup_admission_checkout_orders
language sql stable security definer set search_path='' as $$
 select o from quantum_private.meetup_admission_checkout_orders o
 where d.provider='toss'and d.user_id is not null and o.state='confirmed'
  and o.intent_id=d.intent_id and o.user_id=d.user_id
  and o.payment_key=d.receipt_ref and o.payment_key is not null
  and o.amount_krw=d.amount_krw and o.currency=d.currency and o.policy_version=d.policy_version
  and o.room_kind=d.source_kind and o.room_id=d.source_room_id
$$;

create function public.list_my_meetup_admission_refunds()returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();result jsonb;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 select coalesce(jsonb_agg(quantum_private.admission_refund_summary(d.id)order by d.confirmed_at desc,d.id),'[]'::jsonb)
 into result from quantum_private.activity_meetup_admission_deposits d where d.user_id=actor;
 return result;
end$$;

create function public.request_my_meetup_admission_refund(p_deposit_id uuid)returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();d quantum_private.activity_meetup_admission_deposits%rowtype;
 q quantum_private.activity_meetup_admission_refund_outbox%rowtype;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||actor::text,0));
 select * into d from quantum_private.activity_meetup_admission_deposits where id=p_deposit_id and user_id=actor for update;
 if d.id is null then raise exception 'refund_not_found';end if;
 select * into q from quantum_private.activity_meetup_admission_refund_outbox where deposit_id=d.id for update;
 if q.request_id is not null then
  if q.requested_by is distinct from actor then raise exception 'refund_request_conflict';end if;
  return quantum_private.admission_refund_summary(d.id);
 end if;
 if d.state<>'refund_due'then raise exception 'refund_not_available';end if;
 if q.deposit_id is null then raise exception 'refund_reconciliation_required';end if;
 if q.state<>'pending'then raise exception 'refund_reconciliation_required';end if;
 update quantum_private.activity_meetup_admission_refund_outbox
 set request_id=gen_random_uuid(),requested_by=actor,requested_at=clock_timestamp()
 where deposit_id=d.id returning * into q;
 insert into quantum_private.meetup_admission_refund_audit(deposit_id,request_id,event,actor_id,attempt_count)
 values(d.id,q.request_id,'requested',actor,q.attempt_count);
 return quantum_private.admission_refund_summary(d.id);
end$$;

create function public.list_meetup_admission_refunds_for_service(p_actor uuid)returns jsonb
language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform quantum_private.assert_admission_refund_operator(p_actor);
 select coalesce(jsonb_agg(quantum_private.admission_refund_summary(d.id)||jsonb_build_object('ownerId',d.user_id)
  order by q.created_at,d.id),'[]'::jsonb)into result
 from quantum_private.activity_meetup_admission_refund_outbox q
 join quantum_private.activity_meetup_admission_deposits d on d.id=q.deposit_id;
 return result;
end$$;

create function public.review_meetup_admission_refund_for_service(p_actor uuid,p_deposit_id uuid,p_request_id uuid,p_action text)returns jsonb
language plpgsql security definer set search_path='' as $$
declare d quantum_private.activity_meetup_admission_deposits%rowtype;
 q quantum_private.activity_meetup_admission_refund_outbox%rowtype;event_name text;
begin
 perform quantum_private.assert_admission_refund_operator(p_actor);
 if p_action is null or p_action not in('approve','retry')then raise exception 'invalid_refund_action';end if;
 select * into d from quantum_private.activity_meetup_admission_deposits where id=p_deposit_id for update;
 if d.id is null then raise exception 'refund_not_found';end if;
 select * into q from quantum_private.activity_meetup_admission_refund_outbox where deposit_id=d.id for update;
 if p_request_id is null or q.request_id is distinct from p_request_id then raise exception 'refund_request_conflict';end if;
 if d.user_id is null or q.requested_by is distinct from d.user_id then raise exception 'refund_owner_unavailable';end if;
 if q.state='completed'and d.state='refunded'then return quantum_private.admission_refund_summary(d.id);end if;
 if d.state<>'refund_due'then raise exception 'refund_not_available';end if;
 if p_action='approve'then
  if q.approved_at is not null then return quantum_private.admission_refund_summary(d.id);end if;
  if q.state<>'pending'or q.requested_at is null then raise exception 'refund_state_conflict';end if;
  update quantum_private.activity_meetup_admission_refund_outbox
  set approved_by=p_actor,approved_at=clock_timestamp(),next_attempt_at=clock_timestamp()
  where deposit_id=d.id returning * into q;
  event_name:='approved';
 else
  if q.approved_at is null then raise exception 'refund_not_approved';end if;
  if q.attempt_count>=5 then raise exception 'refund_attempts_exhausted';end if;
  if q.state='pending'and q.last_error_code is null then return quantum_private.admission_refund_summary(d.id);end if;
  -- A retryable provider error is pending during backoff but is shown as failed
  -- in the public summary. An explicit operator retry may reschedule that same
  -- request now; it never resets attempts/approval or takes a processing lease.
  if q.state<>'failed'and not(q.state='pending'and q.last_error_code is not null)
  then raise exception 'refund_state_conflict';end if;
  update quantum_private.activity_meetup_admission_refund_outbox
  set state='pending',next_attempt_at=clock_timestamp(),last_error_code=null,lease_id=null,lease_expires_at=null
  where deposit_id=d.id returning * into q;
  event_name:='retried';
 end if;
 insert into quantum_private.meetup_admission_refund_audit(deposit_id,request_id,event,actor_id,attempt_count)
 values(d.id,q.request_id,event_name,p_actor,q.attempt_count);
 return quantum_private.admission_refund_summary(d.id);
end$$;

create function public.claim_meetup_admission_refunds_for_service(p_lease_id uuid,p_limit integer,p_provider_mode text)returns jsonb
language plpgsql security definer set search_path='' as $$
declare d quantum_private.activity_meetup_admission_deposits%rowtype;
 q quantum_private.activity_meetup_admission_refund_outbox%rowtype;
 o quantum_private.meetup_admission_checkout_orders%rowtype;result jsonb:='[]'::jsonb;
begin
 perform quantum_private.assert_admission_refund_service();
 if p_lease_id is null or p_limit is null or p_limit not between 1 and 50
  or p_provider_mode is null or p_provider_mode not in('test','live')then raise exception 'invalid_refund_claim';end if;
 -- All refund paths lock deposit -> outbox. SKIP LOCKED applies to deposits,
 -- so independent workers never invert queue/deposit order or claim one twice.
 for d in
  select dep.*from quantum_private.activity_meetup_admission_deposits dep
  join quantum_private.activity_meetup_admission_refund_outbox pending on pending.deposit_id=dep.id
  join lateral quantum_private.admission_refund_order(dep) checkout
   on checkout.order_id is not null and checkout.provider_mode=p_provider_mode
  where dep.state='refund_due'and dep.user_id is not null
   and pending.request_id is not null and pending.requested_by=dep.user_id and pending.approved_at is not null
   and((pending.state='pending'and coalesce(pending.next_attempt_at,'-infinity'::timestamptz)<=clock_timestamp())
    or(pending.state='processing'and pending.lease_expires_at<=clock_timestamp()))
  -- Bound the query itself: a PL/pgSQL cursor can otherwise pre-lock more rows
  -- than the loop consumes, starving a second worker even for limit=1.
  order by pending.created_at,dep.id limit p_limit for update of dep skip locked
 loop
  select * into q from quantum_private.activity_meetup_admission_refund_outbox where deposit_id=d.id for update;
  if q.request_id is null or q.requested_by is distinct from d.user_id or q.approved_at is null
   or not((q.state='pending'and coalesce(q.next_attempt_at,'-infinity'::timestamptz)<=clock_timestamp())
    or(q.state='processing'and q.lease_expires_at<=clock_timestamp()))then continue;end if;
  select * into o from quantum_private.admission_refund_order(d);
  if o.order_id is null or o.provider_mode<>p_provider_mode then continue;end if;
  if q.attempt_count>=5 then
   update quantum_private.activity_meetup_admission_refund_outbox
   set state='failed',last_error_code='refund_attempts_exhausted',lease_id=null,lease_expires_at=null,next_attempt_at=null
   where deposit_id=d.id;
   insert into quantum_private.meetup_admission_refund_audit(deposit_id,request_id,event,lease_id,attempt_count,error_code)
   values(d.id,q.request_id,'released',q.lease_id,q.attempt_count,'refund_attempts_exhausted');
   continue;
  end if;
  update quantum_private.activity_meetup_admission_refund_outbox
  set state='processing',lease_id=p_lease_id,lease_expires_at=clock_timestamp()+interval '120 seconds',
   attempt_count=attempt_count+1,last_error_code=null,next_attempt_at=null
  where deposit_id=d.id returning * into q;
  insert into quantum_private.meetup_admission_refund_audit(deposit_id,request_id,event,lease_id,attempt_count)
  values(d.id,q.request_id,'claimed',q.lease_id,q.attempt_count);
  result:=result||jsonb_build_array(jsonb_build_object('depositId',d.id,'requestId',q.request_id,'orderId',o.order_id,
   'intentId',d.intent_id,'ownerId',d.user_id,'room',jsonb_build_object('kind',d.source_kind,'id',d.source_room_id),
   'paymentKey',o.payment_key,'providerMode',o.provider_mode,'amountKrw',d.amount_krw,'leaseId',q.lease_id));
  exit when jsonb_array_length(result)>=p_limit;
 end loop;
 return result;
end$$;

create function public.finalize_meetup_admission_refund_for_service(
 p_deposit_id uuid,p_request_id uuid,p_lease_id uuid,p_order_id text,p_payment_key text,
 p_provider_transaction_key text,p_refunded_amount integer)returns jsonb
language plpgsql security definer set search_path='' as $$
declare d quantum_private.activity_meetup_admission_deposits%rowtype;
 q quantum_private.activity_meetup_admission_refund_outbox%rowtype;
 o quantum_private.meetup_admission_checkout_orders%rowtype;
begin
 perform quantum_private.assert_admission_refund_service();
 select * into d from quantum_private.activity_meetup_admission_deposits where id=p_deposit_id for update;
 if d.id is null then raise exception 'refund_not_found';end if;
 select * into q from quantum_private.activity_meetup_admission_refund_outbox where deposit_id=d.id for update;
 if p_request_id is null or q.request_id is distinct from p_request_id then raise exception 'refund_request_conflict';end if;
 if p_lease_id is null or q.lease_id is distinct from p_lease_id then raise exception 'refund_lease_conflict';end if;
 if d.user_id is null or q.requested_by is distinct from d.user_id then raise exception 'refund_owner_unavailable';end if;
 select * into o from quantum_private.admission_refund_order(d);
 if o.order_id is null or o.order_id is distinct from p_order_id or o.payment_key is distinct from p_payment_key
  or p_refunded_amount is distinct from d.amount_krw or p_provider_transaction_key is null
  or char_length(p_provider_transaction_key)not between 1 and 200 or p_provider_transaction_key~'[[:cntrl:]]'
 then raise exception 'refund_proof_mismatch';end if;
 if q.state='completed'and d.state='refunded'then
  if q.provider_transaction_key is distinct from p_provider_transaction_key
   or q.refunded_amount_krw is distinct from p_refunded_amount then raise exception 'refund_proof_mismatch';end if;
  return quantum_private.admission_refund_summary(d.id);
 end if;
 if q.state<>'processing'or q.lease_expires_at is null or q.lease_expires_at<=clock_timestamp()
 then raise exception 'refund_lease_conflict';end if;
 if d.state<>'refund_due'or q.approved_at is null then raise exception 'refund_not_approved';end if;
 -- Caller verified a full, exact provider cancellation. Persist all effects in
 -- this transaction; a timeout is never converted into a fabricated completion.
 update quantum_private.activity_meetup_admission_deposits set state='refunded'where id=d.id;
 update quantum_private.activity_meetup_admission_refund_outbox
 set state='completed',completed_at=clock_timestamp(),provider_transaction_key=p_provider_transaction_key,
  refunded_amount_krw=p_refunded_amount,last_error_code=null,lease_expires_at=null,next_attempt_at=null
 where deposit_id=d.id;
 insert into quantum_private.meetup_admission_refund_audit(deposit_id,request_id,event,lease_id,attempt_count)
 values(d.id,q.request_id,'completed',q.lease_id,q.attempt_count);
 return quantum_private.admission_refund_summary(d.id);
end$$;

create function public.release_meetup_admission_refund_for_service(
 p_deposit_id uuid,p_request_id uuid,p_lease_id uuid,p_error_code text,p_retryable boolean)returns jsonb
language plpgsql security definer set search_path='' as $$
declare d quantum_private.activity_meetup_admission_deposits%rowtype;
 q quantum_private.activity_meetup_admission_refund_outbox%rowtype;safe_error text;retry boolean;
begin
 perform quantum_private.assert_admission_refund_service();
 select * into d from quantum_private.activity_meetup_admission_deposits where id=p_deposit_id for update;
 if d.id is null then raise exception 'refund_not_found';end if;
 select * into q from quantum_private.activity_meetup_admission_refund_outbox where deposit_id=d.id for update;
 if p_request_id is null or q.request_id is distinct from p_request_id then raise exception 'refund_request_conflict';end if;
 if q.state='completed'and d.state='refunded'then return quantum_private.admission_refund_summary(d.id);end if;
 if p_lease_id is null or q.lease_id is distinct from p_lease_id or q.state<>'processing'
  or q.lease_expires_at is null or q.lease_expires_at<=clock_timestamp()then raise exception 'refund_lease_conflict';end if;
 safe_error:=case when p_error_code in('provider_unavailable','provider_timeout','refund_proof_mismatch',
  'refund_reconciliation_required','refund_attempts_exhausted','refund_owner_unavailable')then p_error_code else 'refund_provider_failed'end;
 retry:=coalesce(p_retryable,false)and q.attempt_count<5
  and safe_error not in('refund_proof_mismatch','refund_reconciliation_required','refund_attempts_exhausted','refund_owner_unavailable');
 update quantum_private.activity_meetup_admission_refund_outbox
 set state=case when retry then 'pending'else 'failed'end,last_error_code=safe_error,
  next_attempt_at=case when retry then clock_timestamp()+make_interval(secs=>least(3600,30*power(2,q.attempt_count-1)::integer))end,
  lease_id=null,lease_expires_at=null
 where deposit_id=d.id;
 insert into quantum_private.meetup_admission_refund_audit(deposit_id,request_id,event,lease_id,attempt_count,error_code)
 values(d.id,q.request_id,'released',q.lease_id,q.attempt_count,safe_error);
 return quantum_private.admission_refund_summary(d.id);
end$$;

revoke all on function quantum_private.admission_refund_audit_immutable(),
 quantum_private.assert_admission_refund_service(),quantum_private.assert_admission_refund_operator(uuid),
 quantum_private.admission_refund_summary(uuid),
 quantum_private.admission_refund_order(quantum_private.activity_meetup_admission_deposits),
 public.list_my_meetup_admission_refunds(),public.request_my_meetup_admission_refund(uuid),
 public.list_meetup_admission_refunds_for_service(uuid),
 public.review_meetup_admission_refund_for_service(uuid,uuid,uuid,text),
 public.claim_meetup_admission_refunds_for_service(uuid,integer,text),
 public.finalize_meetup_admission_refund_for_service(uuid,uuid,uuid,text,text,text,integer),
 public.release_meetup_admission_refund_for_service(uuid,uuid,uuid,text,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.list_my_meetup_admission_refunds(),public.request_my_meetup_admission_refund(uuid)to authenticated;
grant execute on function public.list_meetup_admission_refunds_for_service(uuid),
 public.review_meetup_admission_refund_for_service(uuid,uuid,uuid,text),
 public.claim_meetup_admission_refunds_for_service(uuid,integer,text),
 public.finalize_meetup_admission_refund_for_service(uuid,uuid,uuid,text,text,text,integer),
 public.release_meetup_admission_refund_for_service(uuid,uuid,uuid,text,boolean)to service_role;
commit;
