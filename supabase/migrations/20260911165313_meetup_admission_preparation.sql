-- LOCAL CANDIDATE: unpaid preparation only. No provider order, charge, membership,
-- approval, carryover, refund, or settlement function is enabled by this migration.
-- No policy rows are seeded: amounts and legal/policy terms require owner decisions.
-- These are unpaid drafts, not financial records. Account/room deletion must clean
-- them without blocking the existing account cascade. Any future paid lifecycle
-- requires a separate retention/deletion contract before relaxing the unpaid checks.
begin;

create function quantum_private.admission_policy_conditions_valid(p_conditions text[])
returns boolean language sql immutable set search_path='' as $$
 select coalesce(pg_catalog.cardinality(p_conditions) between 1 and 12
  and pg_catalog.array_ndims(p_conditions)=1
  and (select pg_catalog.bool_and(item is not null and pg_catalog.char_length(pg_catalog.btrim(item)) between 1 and 1000)
       from pg_catalog.unnest(p_conditions) item),false)
$$;

create table quantum_private.activity_meetup_admission_policies (
 meetup_id uuid primary key references public.activity_meetups(id) on delete cascade,
 amount_krw integer not null check(amount_krw>0),
 policy_version text not null check(char_length(policy_version) between 1 and 80 and policy_version=btrim(policy_version)),
 summary text not null check(char_length(btrim(summary)) between 1 and 1000),
 conditions text[] not null check(quantum_private.admission_policy_conditions_valid(conditions)),
 enabled boolean not null default false,
 created_at timestamptz not null default clock_timestamp()
);
create table quantum_private.activity_meetup_admission_quotes (
 id uuid primary key default gen_random_uuid(),
 meetup_id uuid not null references public.activity_meetups(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 amount_krw integer not null check(amount_krw>0),
 policy_version text not null,
 policy_summary text not null,
 policy_conditions text[] not null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null
);
create index activity_meetup_admission_quotes_actor_room on quantum_private.activity_meetup_admission_quotes(user_id,meetup_id,created_at desc);
create table quantum_private.activity_meetup_admission_intents (
 id uuid primary key default gen_random_uuid(),
 meetup_id uuid not null references public.activity_meetups(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 quote_id uuid not null unique references quantum_private.activity_meetup_admission_quotes(id) on delete cascade,
 idempotency_key uuid not null,
 request_snapshot jsonb not null,
 amount_krw integer not null check(amount_krw>0),
 policy_version text not null,
 policy_summary text not null,
 policy_conditions text[] not null,
 consented_at timestamptz not null default clock_timestamp(),
 payment_method text not null default 'new' check(payment_method='new'),
 preparation_state text not null default 'prepared' check(preparation_state in ('prepared','expired')),
 admission_state text not null default 'draft' check(admission_state='draft'),
 payment_state text not null default 'unpaid' check(payment_state='unpaid'),
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(user_id,idempotency_key)
);
create unique index activity_meetup_admission_one_preparation on quantum_private.activity_meetup_admission_intents(user_id,meetup_id) where preparation_state='prepared';
alter table quantum_private.activity_meetup_admission_policies enable row level security;
alter table quantum_private.activity_meetup_admission_quotes enable row level security;
alter table quantum_private.activity_meetup_admission_intents enable row level security;
revoke all on table quantum_private.activity_meetup_admission_policies,quantum_private.activity_meetup_admission_quotes,quantum_private.activity_meetup_admission_intents from public,anon,authenticated,service_role;

-- All entry points use the same user -> room lock order as current membership work.
-- Recheck existing auth/profile/deletion/scope/gender gates; preparation reserves no seat.
create function quantum_private.assert_meetup_admission_access(p_actor uuid,p_meetup_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_meetup public.activity_meetups%rowtype;v_gender text;v_count integer;
begin
 if p_actor is null then raise exception 'not_authenticated';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:'||p_actor::text,0));
 perform 1 from quantum_private.assert_activity_room_access(p_actor);
 select * into v_meetup from public.activity_meetups where id=p_meetup_id for update;
 if v_meetup.id is null or not quantum_private.activity_meetup_scope_eligible(p_meetup_id,p_actor) then raise exception 'meetup_not_found';end if;
 if v_meetup.status not in ('open','full') or v_meetup.scheduled_at<=pg_catalog.clock_timestamp() then raise exception 'meetup_closed';end if;
 v_gender:=quantum_private.meetup_gender_eligibility(p_actor,v_meetup.gender_mode);
 if v_gender='gender_required' then raise exception 'meetup_gender_required';end if;
 if v_gender is distinct from 'eligible' then raise exception 'meetup_gender_restricted';end if;
 if v_meetup.host_user_id=p_actor or exists(select 1 from public.activity_meetup_members where meetup_id=p_meetup_id and user_id=p_actor and status='joined') then raise exception 'meetup_already_joined';end if;
 select pg_catalog.count(*)::integer into v_count from public.activity_meetup_members member
 where member.meetup_id=p_meetup_id and member.status='joined' and quantum_private.activity_meetup_scope_eligible(p_meetup_id,member.user_id);
 if v_count>=v_meetup.capacity then raise exception 'meetup_full';end if;
end
$$;

create function public.get_activity_meetup_admission_context(p_meetup_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_policy quantum_private.activity_meetup_admission_policies%rowtype;
 v_quote quantum_private.activity_meetup_admission_quotes%rowtype;v_room jsonb;
begin
 perform quantum_private.assert_meetup_admission_access(v_actor,p_meetup_id);
 v_room:=pg_catalog.jsonb_build_object('kind','custom_meetup','id',p_meetup_id);
 select * into v_policy from quantum_private.activity_meetup_admission_policies where meetup_id=p_meetup_id for share;
 if v_policy.meetup_id is null or not v_policy.enabled then
  return pg_catalog.jsonb_build_object('room',v_room,'quote',null,'policy',null,'checkoutEnabled',false,'preparationOnly',true);
 end if;
 select * into v_quote from quantum_private.activity_meetup_admission_quotes
 where user_id=v_actor and meetup_id=p_meetup_id and expires_at>pg_catalog.clock_timestamp()
  and amount_krw=v_policy.amount_krw and policy_version=v_policy.policy_version
  and policy_summary=v_policy.summary and policy_conditions=v_policy.conditions
 order by created_at desc limit 1;
 if v_quote.id is null then
  insert into quantum_private.activity_meetup_admission_quotes(meetup_id,user_id,amount_krw,policy_version,policy_summary,policy_conditions,expires_at)
  values(p_meetup_id,v_actor,v_policy.amount_krw,v_policy.policy_version,v_policy.summary,v_policy.conditions,pg_catalog.clock_timestamp()+interval '15 minutes') returning * into v_quote;
 end if;
 return pg_catalog.jsonb_build_object('room',v_room,'checkoutEnabled',false,'preparationOnly',true,
  'policy',pg_catalog.jsonb_build_object('summary',v_quote.policy_summary,'conditions',v_quote.policy_conditions),
  'quote',pg_catalog.jsonb_build_object('id',v_quote.id,'room',v_room,'amountKrw',v_quote.amount_krw,'currency','KRW',
   'policyVersion',v_quote.policy_version,'expiresAt',pg_catalog.to_char(v_quote.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'paymentMethods',pg_catalog.jsonb_build_array('new')));
end
$$;

create function public.prepare_activity_meetup_admission(p_meetup_id uuid,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_policy quantum_private.activity_meetup_admission_policies%rowtype;
 v_quote quantum_private.activity_meetup_admission_quotes%rowtype;v_intent quantum_private.activity_meetup_admission_intents%rowtype;
 v_quote_id uuid;v_key uuid;v_intro text;v_strength text;v_snapshot jsonb;v_reused boolean:=false;
 v_uuid_pattern text:='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
 v_controls text:=U&'[\0001-\001f\007f-\009f\200b-\200f\2028-\202e\2060-\206f\feff]';
begin
 perform quantum_private.assert_meetup_admission_access(v_actor,p_meetup_id);
 if p_input is null or pg_catalog.jsonb_typeof(p_input)<>'object' then raise exception 'invalid_input';end if;
 if exists(select 1 from pg_catalog.jsonb_object_keys(p_input) key where key not in ('intro','strength','paymentMethod','consent','policyVersion','quoteId','idempotencyKey')) then raise exception 'unknown_field';end if;
 if pg_catalog.jsonb_typeof(p_input->'intro') is distinct from 'string' or pg_catalog.btrim(p_input->>'intro')='' then raise exception 'intro_required';end if;
 if pg_catalog.char_length(p_input->>'intro')>80 then raise exception 'intro_too_long';end if;
 if (p_input->>'intro')~v_controls then raise exception 'invalid_intro';end if;
 if p_input?'strength' and (pg_catalog.jsonb_typeof(p_input->'strength') is distinct from 'string' or pg_catalog.char_length(p_input->>'strength')>120 or pg_catalog.replace(p_input->>'strength',E'\n','')~v_controls) then raise exception 'invalid_strength';end if;
 if p_input->'consent' is distinct from 'true'::jsonb then raise exception 'deposit_consent_required';end if;
 if p_input->>'paymentMethod' is distinct from 'new' then raise exception 'deposit_payment_method_unavailable';end if;
 if pg_catalog.jsonb_typeof(p_input->'policyVersion') is distinct from 'string' or pg_catalog.char_length(p_input->>'policyVersion') not between 1 and 80 or p_input->>'policyVersion'<>pg_catalog.btrim(p_input->>'policyVersion') then raise exception 'invalid_policy_version';end if;
 if pg_catalog.jsonb_typeof(p_input->'quoteId') is distinct from 'string' or (p_input->>'quoteId')!~v_uuid_pattern then raise exception 'invalid_quote_id';end if;
 if pg_catalog.jsonb_typeof(p_input->'idempotencyKey') is distinct from 'string' or (p_input->>'idempotencyKey')!~v_uuid_pattern then raise exception 'invalid_idempotency_key';end if;
 v_quote_id:=(p_input->>'quoteId')::uuid;v_key:=(p_input->>'idempotencyKey')::uuid;
 v_intro:=pg_catalog.btrim(p_input->>'intro');v_strength:=pg_catalog.btrim(coalesce(p_input->>'strength',''));
 v_snapshot:=pg_catalog.jsonb_build_object('intro',v_intro,'strength',v_strength,'paymentMethod','new','consent',true,'policyVersion',p_input->>'policyVersion','quoteId',v_quote_id);
 select * into v_policy from quantum_private.activity_meetup_admission_policies where meetup_id=p_meetup_id for share;
 if v_policy.meetup_id is null or not v_policy.enabled then raise exception 'deposit_policy_unavailable';end if;
 select * into v_quote from quantum_private.activity_meetup_admission_quotes where id=v_quote_id and user_id=v_actor and meetup_id=p_meetup_id for update;
 if v_quote.id is null then raise exception 'deposit_quote_mismatch';end if;
 if v_quote.expires_at<=pg_catalog.clock_timestamp() then raise exception 'deposit_quote_expired';end if;
 if v_quote.amount_krw<>v_policy.amount_krw or v_quote.policy_version<>v_policy.policy_version or v_quote.policy_summary<>v_policy.summary
  or v_quote.policy_conditions<>v_policy.conditions or p_input->>'policyVersion'<>v_quote.policy_version then raise exception 'deposit_policy_changed';end if;
 select * into v_intent from quantum_private.activity_meetup_admission_intents where user_id=v_actor and idempotency_key=v_key for update;
 if v_intent.id is not null then
  if v_intent.meetup_id<>p_meetup_id or v_intent.request_snapshot<>v_snapshot then raise exception 'idempotency_key_reused';end if;
  if v_intent.preparation_state<>'prepared' or v_intent.expires_at<=pg_catalog.clock_timestamp() then raise exception 'deposit_quote_expired';end if;
  v_reused:=true;
 else
  update quantum_private.activity_meetup_admission_intents set preparation_state='expired'
   where user_id=v_actor and meetup_id=p_meetup_id and preparation_state='prepared' and expires_at<=pg_catalog.clock_timestamp();
  if exists(select 1 from quantum_private.activity_meetup_admission_intents where user_id=v_actor and meetup_id=p_meetup_id and preparation_state='prepared') then raise exception 'admission_preparation_exists';end if;
  insert into quantum_private.activity_meetup_admission_intents(meetup_id,user_id,quote_id,idempotency_key,request_snapshot,amount_krw,policy_version,policy_summary,policy_conditions,expires_at)
   values(p_meetup_id,v_actor,v_quote_id,v_key,v_snapshot,v_quote.amount_krw,v_quote.policy_version,v_quote.policy_summary,v_quote.policy_conditions,v_quote.expires_at) returning * into v_intent;
 end if;
 return pg_catalog.jsonb_build_object('applicationId',null,'intentId',v_intent.id,'admission','draft','payment','unpaid','preparation','prepared','checkoutEnabled',false,'reused',v_reused);
end
$$;

revoke all on function quantum_private.admission_policy_conditions_valid(text[]),quantum_private.assert_meetup_admission_access(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_activity_meetup_admission_context(uuid),public.prepare_activity_meetup_admission(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_activity_meetup_admission_context(uuid),public.prepare_activity_meetup_admission(uuid,jsonb) to authenticated;
-- Exact existing custom-meetup signature: closes direct-RPC free-join bypass.
-- Existing members, creation/host membership, chat, leave and other room kinds are unchanged.
revoke execute on function public.join_activity_meetup(uuid) from public,anon,authenticated;
commit;
