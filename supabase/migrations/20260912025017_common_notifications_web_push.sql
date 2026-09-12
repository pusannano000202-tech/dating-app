-- Local candidate. No keys, scheduler, remote migration or actual push is enabled.
begin;
create table quantum_private.common_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 endpoint text not null unique,
 p256dh text not null,auth_secret text not null,consent_version text not null,
 revision bigint not null default 1,created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),revoked_at timestamptz
);
create index common_push_active_owner on quantum_private.common_push_subscriptions(user_id)where revoked_at is null;
create table quantum_private.common_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.notifications(id)on delete cascade,
 subscription_id uuid not null references quantum_private.common_push_subscriptions(id)on delete cascade,
 subscription_revision bigint not null,
 state text not null default 'pending'check(state in('pending','leased','retry','provider_accepted','failed','cancelled')),
 attempt integer not null default 0 check(attempt between 0 and 6),revision bigint not null default 0,
 next_attempt_at timestamptz not null default clock_timestamp(),lease_until timestamptz,
 last_error text,created_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 unique(notification_id,subscription_id)
);
create index common_push_dispatch_due on quantum_private.common_push_deliveries(next_attempt_at,id)where state in('pending','retry','leased');
alter table quantum_private.common_push_subscriptions enable row level security;
alter table quantum_private.common_push_deliveries enable row level security;
revoke all on quantum_private.common_push_subscriptions,quantum_private.common_push_deliveries from public,anon,authenticated,service_role;

create function quantum_private.common_push_user_current(u uuid)returns boolean
language sql stable security definer set search_path='' as $$
 select u is not null and exists(select 1 from public.users p join auth.users a on a.id=p.id where p.id=u and a.deleted_at is null and(a.banned_until is null or a.banned_until<=clock_timestamp()))
 and not quantum_private.account_deletion_blocks_access(u)
$$;
create function quantum_private.common_push_endpoint_allowed(e text)returns boolean
language sql immutable set search_path='' as $$
 select e is not null and length(e)<=2048 and e~'^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/[^[:space:]#\\]+$'
$$;
create function public.upsert_my_common_push_subscription(p_endpoint text,p_p256dh text,p_auth_secret text,p_consent_version text)returns uuid
language plpgsql security definer set search_path='' as $$declare u uuid:=auth.uid();s quantum_private.common_push_subscriptions%rowtype;begin
 if u is null then raise exception 'not_authenticated'using errcode='42501';end if;
 if not quantum_private.common_push_user_current(u)then raise exception 'forbidden'using errcode='42501';end if;
 if not quantum_private.common_push_endpoint_allowed(p_endpoint)or p_p256dh is null or p_p256dh!~'^B[A-Za-z0-9_-]{86}$'or p_auth_secret is null or p_auth_secret!~'^[A-Za-z0-9_-]{22}$'or p_consent_version is distinct from '2026-09-12-common-alerts-v1'then raise exception 'invalid_push_subscription';end if;
 -- User quota and global endpoint ownership serialize independently.
 perform pg_advisory_xact_lock(hashtextextended('common-push-user:'||u::text,0));
 perform pg_advisory_xact_lock(hashtextextended('common-push-endpoint:'||p_endpoint,0));
 select * into s from quantum_private.common_push_subscriptions where endpoint=p_endpoint for update;
 if found and s.user_id<>u then raise exception 'subscription_owned_by_another_user'using errcode='42501';end if;
 if s.id is null or s.revoked_at is not null then
  if(select count(*)from quantum_private.common_push_subscriptions where user_id=u and revoked_at is null)>=5 then raise exception 'push_subscription_limit_reached';end if;
 end if;
 if s.id is null and(select count(*)from quantum_private.common_push_subscriptions where user_id=u and created_at>clock_timestamp()-interval '1 day')>=20 then raise exception 'push_subscription_limit_reached';end if;
 if s.id is not null then
  update quantum_private.common_push_subscriptions set p256dh=p_p256dh,auth_secret=p_auth_secret,consent_version=p_consent_version,revoked_at=null,updated_at=clock_timestamp(),
   revision=revision+case when p256dh is distinct from p_p256dh or auth_secret is distinct from p_auth_secret or revoked_at is not null then 1 else 0 end where id=s.id;
  return s.id;
 end if;
 insert into quantum_private.common_push_subscriptions(user_id,endpoint,p256dh,auth_secret,consent_version)values(u,p_endpoint,p_p256dh,p_auth_secret,p_consent_version)returning id into s.id;
 return s.id;
end$$;
create function public.delete_my_common_push_subscription(p_endpoint text)returns boolean
language plpgsql security definer set search_path='' as $$declare changed integer;begin
 if auth.uid()is null then raise exception 'not_authenticated'using errcode='42501';end if;
 update quantum_private.common_push_subscriptions set revoked_at=clock_timestamp(),revision=revision+1 where user_id=auth.uid()and endpoint=p_endpoint and revoked_at is null;
 get diagnostics changed=row_count;return changed>0;
end$$;
create function public.get_my_common_push_subscription(p_endpoint text)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare s quantum_private.common_push_subscriptions%rowtype;begin
 if auth.uid()is null then raise exception 'not_authenticated'using errcode='42501';end if;
 if not quantum_private.common_push_user_current(auth.uid())then raise exception 'forbidden'using errcode='42501';end if;
 select * into s from quantum_private.common_push_subscriptions where user_id=auth.uid()and endpoint=p_endpoint and revoked_at is null;
 return jsonb_build_object('registered',found,'owner_id',auth.uid(),'consent_version',case when s.id is not null then s.consent_version end);
end$$;

create function quantum_private.common_web_push_notification_current(nid uuid)returns boolean
language plpgsql stable security definer set search_path='' as $$declare n public.notifications%rowtype;x quantum_private.social_notification_events%rowtype;begin
 select * into n from public.notifications where id=nid;
 if not found or n.read_at is not null or n.created_at<clock_timestamp()-interval '24 hours' or not quantum_private.common_push_user_current(n.user_id)
  or n.kind in('tonight_journey','campus_seven_guide','phone_revealed')then return false;end if;
 if n.kind='social_activity'then
  if n.payload->>'entity_type'in('admission','admission_notice')then return quantum_private.meetup_admission_notification_current(nid,n.user_id);end if;
  select * into x from quantum_private.social_notification_events where notification_id=nid and recipient_id=n.user_id;
  if not found or not quantum_private.social_notification_scope(x.domain,x.entity_id,n.user_id,x.team_id,x.entity_type)
   or(x.actor_id is not null and(not quantum_private.common_push_user_current(x.actor_id)or quantum_private.tonight_invite_pair_is_blocked(x.actor_id,n.user_id)))then return false;end if;
 end if;
 -- This gate protects recipient identity and scope; click targets are resolved
 -- again by the owner-authenticated notification center, never payload.href.
 return true;
end$$;
create function quantum_private.enqueue_common_web_push()returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.kind in('tonight_journey','campus_seven_guide','phone_revealed')or new.read_at is not null then return new;end if;
 insert into quantum_private.common_push_deliveries(notification_id,subscription_id,subscription_revision)
 select new.id,s.id,s.revision from quantum_private.common_push_subscriptions s where s.user_id=new.user_id and s.revoked_at is null and s.consent_version='2026-09-12-common-alerts-v1'
 on conflict(notification_id,subscription_id)do nothing;
 return new;
end$$;
create trigger common_web_push_after_notification after insert on public.notifications for each row execute function quantum_private.enqueue_common_web_push();

create function quantum_private.common_web_push_claim_json(d quantum_private.common_push_deliveries)returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('delivery_id',d.id,'revision',d.revision,'notification_id',d.notification_id,'subscription_id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth_secret',s.auth_secret)
 from quantum_private.common_push_subscriptions s where s.id=d.subscription_id
$$;
create function public.claim_common_web_push_deliveries(p_limit integer default 20)returns jsonb
language plpgsql security definer set search_path='' as $$declare d quantum_private.common_push_deliveries%rowtype;s quantum_private.common_push_subscriptions%rowtype;result jsonb:='[]';begin
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'invalid_push_limit';end if;
 for d in select * from quantum_private.common_push_deliveries where(state in('pending','retry')and next_attempt_at<=clock_timestamp())or(state='leased'and lease_until<=clock_timestamp())
 order by next_attempt_at,id limit p_limit for update skip locked loop
  select * into s from quantum_private.common_push_subscriptions where id=d.subscription_id;
  if s.id is null or s.revoked_at is not null or s.revision<>d.subscription_revision or not quantum_private.common_web_push_notification_current(d.notification_id)
   or not exists(select 1 from public.notifications n where n.id=d.notification_id and n.user_id=s.user_id)then
   update quantum_private.common_push_deliveries set state='cancelled',finished_at=clock_timestamp(),lease_until=null where id=d.id;continue;
  end if;
  if d.attempt>=6 then update quantum_private.common_push_deliveries set state='failed',finished_at=clock_timestamp(),lease_until=null,last_error='retry_exhausted'where id=d.id;continue;end if;
  update quantum_private.common_push_deliveries set state='leased',attempt=attempt+1,revision=revision+1,lease_until=clock_timestamp()+interval '2 minutes'where id=d.id returning * into d;
  result:=result||jsonb_build_array(quantum_private.common_web_push_claim_json(d));
 end loop;return result;
end$$;
create function public.get_common_web_push_delivery(p_delivery_id uuid,p_revision bigint)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare d quantum_private.common_push_deliveries%rowtype;begin
 select x.* into d from quantum_private.common_push_deliveries x join quantum_private.common_push_subscriptions s on s.id=x.subscription_id
 join public.notifications n on n.id=x.notification_id and n.user_id=s.user_id
 where x.id=p_delivery_id and x.revision=p_revision and x.state='leased'and x.lease_until>clock_timestamp()and s.revoked_at is null and s.revision=x.subscription_revision;
 if not found or not quantum_private.common_web_push_notification_current(d.notification_id)then return null;end if;
 return quantum_private.common_web_push_claim_json(d);
end$$;
create function public.complete_common_web_push_delivery(p_delivery_id uuid,p_revision bigint,p_outcome text,p_error text default null)returns boolean
language plpgsql security definer set search_path='' as $$declare d quantum_private.common_push_deliveries%rowtype;begin
 if p_outcome not in('provider_accepted','retry','expired','failed','cancelled')or p_outcome is null then raise exception 'invalid_push_outcome';end if;
 if p_error is not null and p_error not in('endpoint_expired','rate_limited','provider_auth_failed','provider_rejected','provider_unavailable','transport_failed','invalid_endpoint','retry_exhausted')then raise exception 'invalid_push_error';end if;
 select * into d from quantum_private.common_push_deliveries where id=p_delivery_id and revision=p_revision and state='leased'and lease_until>clock_timestamp()for update;
 if not found then return false;end if;
 if p_outcome='expired'then update quantum_private.common_push_subscriptions set revoked_at=clock_timestamp(),revision=revision+1 where id=d.subscription_id and revision=d.subscription_revision;end if;
 update quantum_private.common_push_deliveries set
  state=case when p_outcome='expired'then 'failed'when p_outcome='retry'and attempt>=6 then 'failed'else p_outcome end,
  next_attempt_at=case when p_outcome='retry'then clock_timestamp()+least(3600,30*power(2,attempt)::integer)*interval '1 second'else next_attempt_at end,
  finished_at=case when p_outcome<>'retry'or attempt>=6 then clock_timestamp()end,lease_until=null,last_error=p_error where id=d.id;
 return true;
end$$;
revoke all on function quantum_private.common_push_user_current(uuid),quantum_private.common_push_endpoint_allowed(text),quantum_private.common_web_push_notification_current(uuid),quantum_private.enqueue_common_web_push(),quantum_private.common_web_push_claim_json(quantum_private.common_push_deliveries),
 public.upsert_my_common_push_subscription(text,text,text,text),public.delete_my_common_push_subscription(text),public.get_my_common_push_subscription(text),public.claim_common_web_push_deliveries(integer),public.get_common_web_push_delivery(uuid,bigint),public.complete_common_web_push_delivery(uuid,bigint,text,text)from public,anon,authenticated,service_role;
grant execute on function public.upsert_my_common_push_subscription(text,text,text,text),public.delete_my_common_push_subscription(text),public.get_my_common_push_subscription(text)to authenticated;
grant execute on function public.claim_common_web_push_deliveries(integer),public.get_common_web_push_delivery(uuid,bigint),public.complete_common_web_push_delivery(uuid,bigint,text,text)to service_role;
comment on table quantum_private.common_push_deliveries is 'Provider acceptance is not phone display or user read proof. Same notification+subscription is idempotent; delivery may retry after an uncertain provider response.';
commit;
