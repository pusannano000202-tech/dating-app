-- Operator-entered sports schedule ledger. This records manual review; it is not an external API verification.
begin;
create table quantum_private.community_sports_events(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.users(id),school_scope text not null,
 sport text not null check(sport='baseball'),league text not null check(league='KBO'),event_key text not null check(event_key ~ '^[a-z0-9][a-z0-9:_-]{2,119}$'),
 home_team text not null check(length(home_team) between 1 and 80 and home_team !~ '[[:cntrl:]]'),away_team text not null check(length(away_team) between 1 and 80 and away_team !~ '[[:cntrl:]]'),
 starts_at timestamptz not null check(starts_at not in ('infinity'::timestamptz,'-infinity'::timestamptz)),status text not null check(status in ('scheduled','delayed','cancelled','completed')),
 source_url text not null check(source_url ~ '^https://(www\.)?koreabaseball\.com/' and length(source_url)<=500 and source_url !~ '[[:cntrl:]]'),source_revision text not null check(length(source_revision) between 3 and 120 and source_revision !~ '[[:cntrl:]]'),
 source_label text not null default 'operator_manual_review' check(source_label='operator_manual_review'),checked_at timestamptz not null default now(),
 revision int not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,school_scope,event_key),check(lower(home_team)<>lower(away_team))
);
create index community_sports_events_schedule on quantum_private.community_sports_events(school_scope,starts_at desc);
create table quantum_private.community_sports_event_revisions(
 event_id uuid not null references quantum_private.community_sports_events(id) on delete cascade,revision int not null,actor_id uuid not null references public.users(id),
 snapshot jsonb not null,change_note text not null check(length(change_note) between 3 and 500 and change_note !~ '[[:cntrl:]]'),recorded_at timestamptz not null default now(),primary key(event_id,revision)
);
create table quantum_private.community_sports_event_commands(
 user_id uuid not null references public.users(id) on delete cascade,idempotency_key uuid not null,operation text not null,payload jsonb not null,response jsonb not null,created_at timestamptz not null default now(),primary key(user_id,idempotency_key)
);

create function quantum_private.community_sports_event_snapshot(e quantum_private.community_sports_events) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'schoolScope',e.school_scope,'sport',e.sport,'league',e.league,'eventKey',e.event_key,'homeTeam',e.home_team,'awayTeam',e.away_team,'startsAt',e.starts_at,'status',e.status,'sourceUrl',e.source_url,'sourceRevision',e.source_revision,'sourceLabel',e.source_label,'checkedAt',e.checked_at,'revision',e.revision);
$$;
create function quantum_private.community_sports_event_json(e quantum_private.community_sports_events) returns jsonb language sql stable security definer set search_path='' as $$
 select quantum_private.community_sports_event_snapshot(e)||jsonb_build_object('history',coalesce((select jsonb_agg(jsonb_build_object('revision',h.revision,'changeNote',h.change_note,'recordedAt',h.recorded_at,'snapshot',h.snapshot) order by h.revision desc) from (select * from quantum_private.community_sports_event_revisions where event_id=e.id order by revision desc limit 20) h),'[]'::jsonb));
$$;

create function public.community_sports_event_command(p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid();role_name text;profile quantum_private.community_member_profiles%rowtype;e quantum_private.community_sports_events%rowtype;
 cmd quantum_private.community_sports_event_commands%rowtype;key uuid;event_id uuid;expected int;input jsonb;result jsonb;note text;
begin
 if u is null then raise exception 'not_authenticated';end if;
 select access_role into role_name from public.get_access_context();if coalesce(role_name,'') not in ('admin','super_admin') then raise exception 'forbidden';end if;
 select * into profile from quantum_private.community_member_profiles where user_id=u;
 if p_operation='list' then
   return jsonb_build_object('events',coalesce((select jsonb_agg(quantum_private.community_sports_event_json(v) order by v.starts_at desc) from (select * from quantum_private.community_sports_events where role_name='super_admin' or (owner_id=u and profile.user_id is not null and school_scope=profile.school_scope) order by starts_at desc limit 100)v),'[]'::jsonb));
 end if;
 if p_operation not in ('create','update') then raise exception 'invalid_input';end if;
 key:=(p_payload->>'idempotencyKey')::uuid;expected:=(p_payload->>'expectedRevision')::int;input:=p_payload->'event';note:=btrim(coalesce(input->>'reviewNote',''));
 if key is null or expected is null or expected<0 or jsonb_typeof(input)<>'object' or length(note) not between 3 and 500 then raise exception 'invalid_input';end if;
 perform pg_advisory_xact_lock(hashtextextended('community-sports-event-ledger-v1',0));
 select * into cmd from quantum_private.community_sports_event_commands where user_id=u and idempotency_key=key;
 if found then
   if cmd.operation<>p_operation or cmd.payload<>p_payload then raise exception 'idempotency_conflict';end if;
   event_id:=(cmd.response#>>'{event,id}')::uuid;
   select * into e from quantum_private.community_sports_events where id=event_id;
   if not found or (role_name<>'super_admin' and (e.owner_id<>u or profile.user_id is null or e.school_scope<>profile.school_scope)) then raise exception 'not_found';end if;
   return cmd.response;
 end if;
 if (select count(*) from quantum_private.community_sports_event_commands where user_id=u and created_at>now()-interval '1 minute')>=30 then raise exception 'rate_limited';end if;
 if p_operation='create' then
   if expected<>0 then raise exception 'invalid_input';end if;
   if profile.user_id is null or nullif(btrim(profile.school_scope),'') is null then raise exception 'minimum_signup_required';end if;
   if exists(select 1 from quantum_private.community_sports_events where owner_id=u and school_scope=profile.school_scope and event_key=lower(btrim(input->>'eventKey'))) then raise exception 'sports_event_exists';end if;
   insert into quantum_private.community_sports_events(owner_id,school_scope,sport,league,event_key,home_team,away_team,starts_at,status,source_url,source_revision)
   values(u,profile.school_scope,input->>'sport',input->>'league',lower(btrim(input->>'eventKey')),btrim(input->>'homeTeam'),btrim(input->>'awayTeam'),(input->>'startsAt')::timestamptz,input->>'status',input->>'sourceUrl',btrim(input->>'sourceRevision')) returning * into e;
 else
   event_id:=(p_payload->>'eventId')::uuid;select * into e from quantum_private.community_sports_events where id=event_id for update;
   if not found or (role_name<>'super_admin' and (e.owner_id<>u or profile.user_id is null or e.school_scope<>profile.school_scope)) then raise exception 'not_found';end if;
   if expected<>e.revision then raise exception 'stale_revision';end if;
   if input->>'sport'<>e.sport or input->>'league'<>e.league or lower(btrim(input->>'eventKey'))<>e.event_key then raise exception 'invalid_input';end if;
   update quantum_private.community_sports_events set home_team=btrim(input->>'homeTeam'),away_team=btrim(input->>'awayTeam'),starts_at=(input->>'startsAt')::timestamptz,status=input->>'status',source_url=input->>'sourceUrl',source_revision=btrim(input->>'sourceRevision'),checked_at=now(),updated_at=now(),revision=revision+1 where id=e.id returning * into e;
 end if;
 insert into quantum_private.community_sports_event_revisions(event_id,revision,actor_id,snapshot,change_note) values(e.id,e.revision,u,quantum_private.community_sports_event_snapshot(e),note);
 result:=jsonb_build_object('event',quantum_private.community_sports_event_json(e));
 insert into quantum_private.community_sports_event_commands values(u,key,p_operation,p_payload,result,now());
 return result;
end;$$;

-- Scheduled/open official baseball voice rooms must refer to the creator's current, recently rechecked manual ledger row.
create function quantum_private.voice_sports_event_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare e quantum_private.community_sports_events%rowtype;
begin
 if new.kind<>'group' or new.topic<>'baseball' or new.status not in ('scheduled','open') then return new;end if;
 select * into e from quantum_private.community_sports_events where owner_id=new.created_by and school_scope=new.school_scope and event_key=lower(new.source_event_key);
 if not found then raise exception 'sports_event_not_found';end if;
 if e.starts_at<>new.starts_at or e.source_url<>new.source_url or e.source_revision<>new.source_revision then raise exception 'sports_event_mismatch';end if;
 if e.status<>'scheduled' then raise exception 'sports_event_not_ready';end if;
 if e.checked_at<now()-interval '15 minutes' then raise exception 'sports_event_stale_review';end if;
 return new;
end;$$;
create trigger voice_sports_event_guard before insert or update of status,starts_at,source_url,source_revision,source_event_key on quantum_private.voice_rooms for each row execute function quantum_private.voice_sports_event_guard();

alter table quantum_private.community_sports_events enable row level security;
alter table quantum_private.community_sports_event_revisions enable row level security;
alter table quantum_private.community_sports_event_commands enable row level security;
revoke all on table quantum_private.community_sports_events,quantum_private.community_sports_event_revisions,quantum_private.community_sports_event_commands from public,anon,authenticated,service_role;
revoke all on function quantum_private.community_sports_event_snapshot(quantum_private.community_sports_events),quantum_private.community_sports_event_json(quantum_private.community_sports_events),quantum_private.voice_sports_event_guard() from public,anon,authenticated,service_role;
revoke all on function public.community_sports_event_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.community_sports_event_command(text,jsonb) to authenticated;
commit;
