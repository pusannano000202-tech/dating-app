-- Candidate source. No policy seeds, enabled flags or provider calls.
begin;
create table quantum_private.meetup_admission_checkout_orders (
 order_id text primary key,
 intent_id uuid not null unique,
 user_id uuid references public.users(id) on delete set null,
 room_kind text not null check(room_kind in('custom_meetup','study','mentoring')),
 room_id uuid not null,
 amount_krw integer not null check(amount_krw>0),
 currency text not null default 'KRW' check(currency='KRW'),
 policy_version text not null,
 provider_mode text not null check(provider_mode in('test','live')),
 metadata jsonb not null,
 expires_at timestamptz not null,
 state text not null default 'prepared' check(state in('prepared','confirming','reconciliation_required','confirmed','aborted')),
 payment_key text unique,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
alter table quantum_private.meetup_admission_checkout_orders enable row level security;
revoke all on quantum_private.meetup_admission_checkout_orders from public,anon,authenticated,service_role;
create index meetup_admission_checkout_actor on quantum_private.meetup_admission_checkout_orders(user_id,created_at desc);

create function quantum_private.meetup_checkout_json(o quantum_private.meetup_admission_checkout_orders)returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('orderId',o.order_id,'intentId',o.intent_id,'ownerId',o.user_id,'room',jsonb_build_object('kind',o.room_kind,'id',o.room_id),
  'amountKrw',o.amount_krw,'currency',o.currency,'policyVersion',o.policy_version,'providerMode',o.provider_mode,'metadata',o.metadata,'expiresAt',o.expires_at,'state',o.state,'paymentKey',o.payment_key)
$$;

create function public.prepare_meetup_admission_checkout_for_service(p_actor uuid,p_kind text,p_room_id uuid,p_intent_id uuid,p_provider_mode text)returns jsonb
language plpgsql security definer set search_path='' as $$
declare i quantum_private.activity_meetup_admission_intents%rowtype;o quantum_private.meetup_admission_checkout_orders%rowtype;
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')is distinct from 'service_role'then raise exception 'service_only';end if;
 if p_provider_mode is null or p_provider_mode not in('test','live')then raise exception 'checkout_provider_changed';end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||p_actor::text,0));
 select * into i from quantum_private.activity_meetup_admission_intents where id=p_intent_id and user_id=p_actor
  and((p_kind='custom_meetup'and meetup_id=p_room_id)or(p_kind='study'and study_room_id=p_room_id)or(p_kind='mentoring'and mentoring_session_id=p_room_id))for update;
 if i.id is null then raise exception 'checkout_order_not_found';end if;
 select * into o from quantum_private.meetup_admission_checkout_orders where intent_id=i.id;
 if o.order_id is not null and o.provider_mode<>p_provider_mode then raise exception 'checkout_provider_changed';end if;
 if o.order_id is not null and o.state<>'prepared'then return quantum_private.meetup_checkout_json(o);end if;
 if i.amount_krw<>10000 then raise exception 'deposit_amount_policy_changed';end if;
 if exists(select 1 from quantum_private.meetup_admission_checkout_orders where user_id=p_actor and room_kind=p_kind and room_id=p_room_id and intent_id<>i.id and state not in('confirmed','aborted'))then raise exception 'checkout_reconciliation_required';end if;
 perform quantum_private.assert_activity_room_access(p_actor);
 if i.preparation_state<>'prepared'or i.expires_at<=clock_timestamp()then raise exception 'deposit_quote_expired';end if;
 if not exists(select 1 from quantum_private.activity_meetup_admission_policies p where p.enabled
  and((p_kind='custom_meetup'and p.meetup_id=p_room_id)or(p_kind='study'and p.study_room_id=p_room_id)or(p_kind='mentoring'and p.mentoring_session_id=p_room_id))
  and p.amount_krw=i.amount_krw and p.policy_version=i.policy_version and p.summary=i.policy_summary and p.conditions=i.policy_conditions)then raise exception 'deposit_policy_changed';end if;
 if o.order_id is not null then return quantum_private.meetup_checkout_json(o);end if;
 insert into quantum_private.meetup_admission_checkout_orders(order_id,intent_id,user_id,room_kind,room_id,amount_krw,policy_version,provider_mode,metadata,expires_at)
 values('meetup_'||replace(i.id::text,'-',''),i.id,i.user_id,p_kind,p_room_id,i.amount_krw,i.policy_version,p_provider_mode,i.metadata,i.expires_at)returning * into o;
 return quantum_private.meetup_checkout_json(o);
end$$;

create function public.get_my_pending_meetup_admission_checkout(p_kind text,p_room_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();o quantum_private.meetup_admission_checkout_orders%rowtype;
begin
 perform quantum_private.assert_activity_room_access(actor);
 if p_kind is null or p_kind not in('custom_meetup','study','mentoring')or p_room_id is null then raise exception 'invalid_room';end if;
 select * into o from quantum_private.meetup_admission_checkout_orders where user_id=actor and room_kind=p_kind and room_id=p_room_id and state not in('confirmed','aborted')order by created_at limit 1;
 return jsonb_build_object('accountKey',actor,'order',case when o.order_id is null then null else jsonb_build_object('orderId',o.order_id,'state',o.state)end);
end$$;

create function public.get_meetup_admission_checkout_for_service(p_actor uuid,p_kind text,p_room_id uuid,p_order_id text)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o quantum_private.meetup_admission_checkout_orders%rowtype;
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')is distinct from 'service_role'then raise exception 'service_only';end if;
 select * into o from quantum_private.meetup_admission_checkout_orders where order_id=p_order_id and user_id=p_actor and room_kind=p_kind and room_id=p_room_id;
 if o.order_id is null then raise exception 'checkout_order_not_found';end if;
 return quantum_private.meetup_checkout_json(o);
end$$;

create function public.record_meetup_admission_checkout_for_service(p_actor uuid,p_kind text,p_room_id uuid,p_order_id text,p_state text,p_payment_key text,p_amount_krw integer)returns jsonb
language plpgsql security definer set search_path='' as $$
declare o quantum_private.meetup_admission_checkout_orders%rowtype;result jsonb;
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')is distinct from 'service_role'then raise exception 'service_only';end if;
 -- Match the receipt lifecycle's global -> sorted users -> room lock order.
 -- Taking the actor lock first can deadlock against hosted native admission.
 if p_kind in('study','mentoring')then perform quantum_private.native_admission_lock(p_kind,p_room_id,array[p_actor]);
 else perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||p_actor::text,0));end if;
 select * into o from quantum_private.meetup_admission_checkout_orders where order_id=p_order_id and user_id=p_actor and room_kind=p_kind and room_id=p_room_id for update;
 if o.order_id is null then raise exception 'checkout_order_not_found';end if;
 if p_state is null or p_state not in('confirming','reconciliation_required','confirmed','aborted')or p_amount_krw is distinct from o.amount_krw
  or p_payment_key is null or char_length(p_payment_key)not between 1 and 200 or p_payment_key~'[[:cntrl:]]'
  or(o.payment_key is not null and o.payment_key<>p_payment_key)then raise exception 'checkout_evidence_mismatch';end if;
 if o.state='aborted'then raise exception 'checkout_aborted';end if;
 if p_state='confirming'then
  if o.state='confirmed'then raise exception 'checkout_reconciliation_required';end if;
  if o.expires_at<=clock_timestamp()or not exists(select 1 from quantum_private.activity_meetup_admission_intents where id=o.intent_id and preparation_state='prepared'and expires_at>clock_timestamp())then raise exception 'deposit_quote_expired';end if;
 end if;
 if p_state='confirmed'then
  -- Only a provider-verified server adapter may reach this service-only endpoint.
  -- Existing lifecycle atomically persists receipt + pending admission, or refund_due
  -- when the paid attempt has expired/filled. It never fabricates membership/refund.
  if p_kind='custom_meetup'then result:=public.confirm_activity_meetup_admission_payment_for_service(o.intent_id,'toss',p_payment_key,o.amount_krw);
  else result:=public.confirm_native_meetup_admission_payment_for_service(o.intent_id,'toss',p_payment_key,o.amount_krw);end if;
  update quantum_private.meetup_admission_checkout_orders set state='confirmed',payment_key=p_payment_key,updated_at=clock_timestamp()where order_id=o.order_id;
  return result;
 end if;
 if o.state<>'confirmed'then update quantum_private.meetup_admission_checkout_orders set state=p_state,payment_key=p_payment_key,updated_at=clock_timestamp()where order_id=o.order_id returning * into o;end if;
 if o.state='aborted'then
  update quantum_private.activity_meetup_admission_intents set preparation_state='expired'where id=o.intent_id;
  update quantum_private.activity_meetup_admission_quotes set expires_at=least(expires_at,clock_timestamp())where id=(select quote_id from quantum_private.activity_meetup_admission_intents where id=o.intent_id);
 end if;
 return quantum_private.meetup_checkout_json(o);
end$$;

-- Called only after the trusted provider lookup returned exact NOT_FOUND_PAYMENT.
-- Absence cannot release anything that has ever entered the approval path.
create function public.abort_expired_unstarted_meetup_checkout_for_service(p_actor uuid,p_kind text,p_room_id uuid,p_order_id text,p_provider_mode text)returns jsonb
language plpgsql security definer set search_path='' as $$
declare o quantum_private.meetup_admission_checkout_orders%rowtype;
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')is distinct from 'service_role'then raise exception 'service_only';end if;
 if p_kind in('study','mentoring')then perform quantum_private.native_admission_lock(p_kind,p_room_id,array[p_actor]);
 else perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||p_actor::text,0));end if;
 select * into o from quantum_private.meetup_admission_checkout_orders where order_id=p_order_id and user_id=p_actor and room_kind=p_kind and room_id=p_room_id for update;
 if o.order_id is null then raise exception 'checkout_order_not_found';end if;
 if o.provider_mode is distinct from p_provider_mode then raise exception 'checkout_provider_changed';end if;
 if o.state='aborted'and o.payment_key is null then return quantum_private.meetup_checkout_json(o);end if;
 if o.state<>'prepared'or o.payment_key is not null or o.expires_at>clock_timestamp()
  or exists(select 1 from quantum_private.activity_meetup_admission_deposits where intent_id=o.intent_id)then raise exception 'checkout_reconciliation_required';end if;
 update quantum_private.meetup_admission_checkout_orders set state='aborted',updated_at=clock_timestamp()where order_id=o.order_id returning * into o;
 update quantum_private.activity_meetup_admission_intents set preparation_state='expired'where id=o.intent_id;
 update quantum_private.activity_meetup_admission_quotes set expires_at=least(expires_at,clock_timestamp())where id=(select quote_id from quantum_private.activity_meetup_admission_intents where id=o.intent_id);
 return quantum_private.meetup_checkout_json(o);
end$$;

revoke all on function quantum_private.meetup_checkout_json(quantum_private.meetup_admission_checkout_orders),public.get_my_pending_meetup_admission_checkout(text,uuid),
 public.prepare_meetup_admission_checkout_for_service(uuid,text,uuid,uuid,text),public.get_meetup_admission_checkout_for_service(uuid,text,uuid,text),
 public.record_meetup_admission_checkout_for_service(uuid,text,uuid,text,text,text,integer),public.abort_expired_unstarted_meetup_checkout_for_service(uuid,text,uuid,text,text)from public,anon,authenticated,service_role;
grant execute on function public.prepare_meetup_admission_checkout_for_service(uuid,text,uuid,uuid,text),public.get_meetup_admission_checkout_for_service(uuid,text,uuid,text),
 public.record_meetup_admission_checkout_for_service(uuid,text,uuid,text,text,text,integer),public.abort_expired_unstarted_meetup_checkout_for_service(uuid,text,uuid,text,text)to service_role;
grant execute on function public.get_my_pending_meetup_admission_checkout(text,uuid)to authenticated;
commit;
