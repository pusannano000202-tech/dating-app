begin;

-- A team keeps its original name even when pairing moves it to another challenge.
alter table public.department_challenges drop constraint department_challenges_title_check;
alter table public.department_challenges add constraint department_challenges_title_check check(char_length(btrim(title)) between 2 and 80);
alter table public.department_challenge_teams add column team_name text;
update public.department_challenge_teams t set team_name=left(btrim(regexp_replace(coalesce(
 (select c.title from quantum_private.challenge_linked_recruitments l join public.department_challenges c on c.id=l.source_challenge where l.source_team=t.id),
 (select c.title from public.department_challenges c where c.id=t.challenge_id)), '[[:cntrl:]' || chr(8203)||chr(8238)||chr(8288)||chr(65279)||']','','g')),80);
update public.department_challenge_teams set team_name='우리 팀' where team_name is null or char_length(btrim(team_name))<2;
alter table public.department_challenge_teams alter column team_name set not null;
alter table public.department_challenge_teams add constraint department_challenge_team_name_check check(char_length(btrim(team_name)) between 2 and 80 and team_name=btrim(team_name) and team_name !~ ('[[:cntrl:]'||chr(8203)||chr(8238)||chr(8288)||chr(65279)||']'));
create function quantum_private.challenge_recruitment_team_name()returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.team_name is null then
  select btrim(regexp_replace(title,'[[:cntrl:]'||chr(8203)||chr(8238)||chr(8288)||chr(65279)||']','','g'))into new.team_name from public.department_challenges where id=new.challenge_id;
  if char_length(new.team_name)<2 then new.team_name:='우리 팀';end if;
 end if;return new;
end$$;
create trigger challenge_recruitment_team_name before insert on public.department_challenge_teams for each row execute function quantum_private.challenge_recruitment_team_name();

create or replace function public.create_department_challenge(p_category text,p_title text,p_rules text,p_team_capacity integer,p_idempotency_key uuid)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();school text;school_key text;dept_key text;dept_label text;challenge_id uuid;team_id uuid;event public.department_challenge_events%rowtype;hash text;result jsonb;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 if p_idempotency_key is null or p_category is null or p_category not in('soccer','gaming') or p_title is null or char_length(btrim(p_title)) not between 2 and 80
 or p_title ~ ('[[:cntrl:]'||chr(8203)||chr(8238)||chr(8288)||chr(65279)||']') or p_rules is null or char_length(p_rules)>2000 or p_team_capacity is null or p_team_capacity not between 2 and 20 then raise exception 'invalid_challenge_input';end if;
 hash:=md5(concat_ws('|',p_category,btrim(p_title),p_rules,p_team_capacity::text));
 perform pg_advisory_xact_lock(hashtextextended('department-challenge:'||actor::text||':'||p_idempotency_key::text,0));
 select e.* into event from public.department_challenge_events e where e.actor_user_id=actor and e.idempotency_key=p_idempotency_key for update;
 if event.id is not null then if event.action<>'created' or event.request_hash<>hash then raise exception 'idempotency_key_reused';end if;return event.result;end if;
 select i.school into school from quantum_private.get_community_identity(actor)i;
 select i.school_scope_key,i.department_key into school_key,dept_key from quantum_private.get_member_department_identity(actor)i;
 select btrim(p.department)into dept_label from quantum_private.community_member_profiles p where p.user_id=actor;
 if school is null or school_key is null or dept_key is null or dept_label is null then raise exception 'department_identity_required';end if;
 insert into public.department_challenges(school,school_scope_key,category,title,rules,team_capacity,status,created_by)values(school,school_key,p_category,btrim(p_title),p_rules,p_team_capacity,'recruiting',actor)returning id into challenge_id;
 insert into public.department_challenge_teams(challenge_id,side,department_key,department_label,captain_user_id)values(challenge_id,'challenger',dept_key,dept_label,actor)returning id into team_id;
 insert into public.department_challenge_roster(challenge_id,team_id,user_id,status,department_key_snapshot,accepted_at)values(challenge_id,team_id,actor,'accepted',dept_key,clock_timestamp());
 result:=quantum_private.department_challenge_projection(challenge_id,actor);
 insert into public.department_challenge_events(challenge_id,actor_user_id,action,request_hash,idempotency_key,prior_revision,resulting_revision,result)values(challenge_id,actor,'created',hash,p_idempotency_key,0,0,result);
 return result;
end$$;

create table quantum_private.challenge_recruitment_notices(
 id uuid primary key default gen_random_uuid(),team_id uuid not null unique references public.department_challenge_teams(id)on delete cascade,
 sport text not null check(sport in('lol','futsal','football')),author_id uuid not null references public.users(id),
 preferred_at timestamptz not null,summary text not null check(char_length(btrim(summary))between 1 and 160 and summary !~ ('[[:cntrl:]'||chr(8203)||chr(8238)||chr(8288)||chr(65279)||']')),
 status text not null default 'open' check(status in('open','filled','closed','matched')),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table quantum_private.challenge_recruitment_requests(
 actor_id uuid not null references public.users(id)on delete cascade,idempotency_key uuid not null,request_hash text not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,idempotency_key)
);
alter table quantum_private.challenge_recruitment_notices enable row level security;
alter table quantum_private.challenge_recruitment_requests enable row level security;
revoke all on quantum_private.challenge_recruitment_notices,quantum_private.challenge_recruitment_requests from public,anon,authenticated,service_role;
create index challenge_recruitment_notices_page_idx on quantum_private.challenge_recruitment_notices(updated_at desc,id desc);

create function quantum_private.challenge_recruitment_slots(p_team uuid,p_sport text)returns jsonb language sql stable security definer set search_path='' as $$
 with slots as(select key,ord from unnest(case p_sport when 'lol'then array['top','jungle','mid','adc','support']when 'futsal'then array['gk','ld','rd','lm','rm','st']else array['gk','lb','lcb','rcb','rb','lcm','cm','rcm','lw','st','rw']end)with ordinality s(key,ord)),
 occupied as(select coalesce(p.slot_key,case when p_sport='lol'then p.position end)slot from public.department_challenge_roster r left join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=p_team and r.status='accepted'),
 reserved as(select i.slot_key slot from public.department_challenge_friend_invites i where i.team_id=p_team and i.sport=p_sport and i.status='pending'and i.expires_at>now())
 select jsonb_build_object('accepted_count',(select count(*)from occupied),'empty_slots',coalesce((select jsonb_agg(s.key order by s.ord)from slots s where not exists(select 1 from occupied o where o.slot=s.key)and not exists(select 1 from reserved r where r.slot=s.key)),'[]'::jsonb),
 'reserved_slots',coalesce((select jsonb_agg(s.key order by s.ord)from slots s where not exists(select 1 from occupied o where o.slot=s.key)and exists(select 1 from reserved r where r.slot=s.key)),'[]'::jsonb))
$$;

-- Public discovery never reveals pending invite identities. Current profile/access is checked at read time.
create function quantum_private.challenge_recruitment_visible(p_team uuid,p_actor uuid,p_sport text)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.department_challenge_teams t join public.department_challenges c on c.id=t.challenge_id
 cross join quantum_private.get_member_department_identity(p_actor)i cross join quantum_private.get_member_department_identity(t.captain_user_id)captain
 where t.id=p_team and t.status='accepted'and c.school_scope_key=i.school_scope_key and t.department_key=i.department_key
 and captain.school_scope_key=c.school_scope_key and captain.department_key=t.department_key and quantum_private.challenge_journey_sport(c.id)=p_sport
 and exists(select 1 from auth.users u where u.id=t.captain_user_id and u.deleted_at is null and(u.banned_until is null or u.banned_until<=now()))
 and not quantum_private.account_deletion_blocks_access(t.captain_user_id)
 and not exists(select 1 from quantum_private.challenge_restrictions s where s.user_id=t.captain_user_id and s.revoked_at is null and s.ends_at>now())
 and not exists(select 1 from public.department_challenge_roster r where r.challenge_id=c.id and r.status='accepted'and quantum_private.tonight_invite_pair_is_blocked(p_actor,r.user_id)))
$$;
create function quantum_private.challenge_recruitment_notice(p_team uuid,p_actor uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',n.id,'team_id',t.id,'challenge_id',c.id,'team_name',t.team_name,'department',t.department_label,'sport',n.sport,'capacity',c.team_capacity,
 'accepted_count',s->'accepted_count','empty_slots',s->'empty_slots','reserved_slots',s->'reserved_slots','preferred_at',n.preferred_at,'summary',n.summary,
 'status',case when c.status in('opponent_pending','scheduled','completed')then 'matched'when c.status='cancelled'then 'closed'when n.status<>'open'then n.status when n.preferred_at<=now()then 'expired'when jsonb_array_length(s->'empty_slots')=0 then 'filled'else 'open'end,
 'expires_at',n.preferred_at,'created_at',n.created_at,'updated_at',n.updated_at,'revision',c.revision,'is_captain',t.captain_user_id=p_actor,'href','/meetups/league?sport='||n.sport||'&challenge='||c.id::text)
 from quantum_private.challenge_recruitment_notices n join public.department_challenge_teams t on t.id=n.team_id join public.department_challenges c on c.id=t.challenge_id cross join lateral quantum_private.challenge_recruitment_slots(t.id,n.sport)s where t.id=p_team
$$;
create function quantum_private.challenge_recruitment_team(p_team uuid,p_actor uuid,p_sport text)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('team_id',t.id,'challenge_id',c.id,'team_name',t.team_name,'title',t.team_name,'department',t.department_label,'sport',p_sport,'status',c.status,'revision',c.revision,'capacity',c.team_capacity,
 'accepted_count',s->'accepted_count','empty_slots',s->'empty_slots','reserved_slots',s->'reserved_slots','is_captain',t.captain_user_id=p_actor,
 'my_status',coalesce((select r.status from public.department_challenge_roster r where r.team_id=t.id and r.user_id=p_actor and r.status in('accepted','requested')),'none'),
 'may_join',c.status='recruiting'and (s->>'accepted_count')::int<c.team_capacity and jsonb_array_length(s->'empty_slots')>0 and not exists(select 1 from public.department_challenge_roster r where r.challenge_id=c.id and r.user_id=p_actor and r.status in('accepted','requested')),
 'notice',quantum_private.challenge_recruitment_notice(t.id,p_actor))from public.department_challenge_teams t join public.department_challenges c on c.id=t.challenge_id cross join lateral quantum_private.challenge_recruitment_slots(t.id,p_sport)s where t.id=p_team
$$;

create function quantum_private.challenge_recruitment_challenge(p_challenge uuid,p_actor uuid,p_sport text)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.department_challenges%rowtype;t public.department_challenge_teams%rowtype;teams jsonb:='[]';players jsonb;mine boolean;dept text;slots jsonb;
begin
 select * into c from public.department_challenges where id=p_challenge;
 select i.department_key into dept from quantum_private.get_member_department_identity(p_actor)i;
 for t in select * from public.department_challenge_teams where challenge_id=c.id and status='accepted'order by side loop
  mine:=exists(select 1 from public.department_challenge_roster r where r.team_id=t.id and r.user_id=p_actor and r.status in('accepted','requested'));
  slots:=quantum_private.challenge_recruitment_slots(t.id,p_sport);
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'alias',quantum_private.activity_meetup_alias(r.user_id),'status',r.status,'is_me',r.user_id=p_actor,'slot',coalesce(p.slot_key,case when p_sport='lol'then p.position end),'position',p.position,'tier',p.tier)order by r.requested_at,r.id),'[]')into players
  from public.department_challenge_roster r left join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=t.id and(r.status='accepted'or(r.status='requested'and(r.user_id=p_actor or t.captain_user_id=p_actor)));
  teams:=teams||jsonb_build_array(jsonb_build_object('id',t.id,'team_name',t.team_name,'department',t.department_label,'is_mine',mine,'is_captain',t.captain_user_id=p_actor,
   'may_join',c.status='recruiting'and t.department_key=dept and (slots->>'accepted_count')::int<c.team_capacity and jsonb_array_length(slots->'empty_slots')>0 and not exists(select 1 from public.department_challenge_roster r where r.challenge_id=c.id and r.user_id=p_actor and r.status in('accepted','requested')),
   'ready',quantum_private.challenge_team_ready(t.id),'waiting',coalesce((select waiting from quantum_private.challenge_team_preferences where team_id=t.id),false),'gap',coalesce((select allowed_gap from quantum_private.challenge_team_preferences where team_id=t.id),200),
   'score',case when quantum_private.challenge_team_ready(t.id)then(select round(avg(quantum_private.challenge_skill_score(p.tier))*.7+max(quantum_private.challenge_skill_score(p.tier))*.3)from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=t.id and r.status='accepted')end,'players',players));
 end loop;
 return jsonb_build_object('id',c.id,'title',coalesce((select team_name from public.department_challenge_teams where challenge_id=c.id and side='challenger'),c.title),'status',c.status,'revision',c.revision,'scheduled_at',c.scheduled_at,'ends_at',c.ends_at,'place_name',c.place_name,'teams',teams,
 'schedule_proposals',case when exists(select 1 from public.department_challenge_roster r where r.challenge_id=c.id and r.user_id=p_actor and r.status='accepted')then(select coalesce(jsonb_agg(jsonb_build_object('team_id',p.team_id,'is_mine',exists(select 1 from public.department_challenge_roster r where r.team_id=p.team_id and r.user_id=p_actor and r.status='accepted'),'scheduled_at',p.scheduled_at,'ends_at',p.ends_at,'place_name',p.place_name)order by p.confirmed_at),'[]')from public.department_challenge_schedule_confirmations p where p.challenge_id=c.id)else '[]'::jsonb end,
 'result',case when c.status='completed'then jsonb_build_object('first_score',c.first_score,'second_score',c.second_score)end);
end$$;

create function quantum_private.challenge_recruitment_close()returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='department_challenge_roster'then
  if new.status='accepted'and(select count(*)from public.department_challenge_roster r where r.team_id=new.team_id and r.status='accepted')>=(select c.team_capacity from public.department_challenges c where c.id=new.challenge_id)then
   update quantum_private.challenge_recruitment_notices set status='filled',updated_at=clock_timestamp()where team_id=new.team_id and status='open';end if;
 elsif tg_table_name='department_challenge_teams'then
  if new.challenge_id is distinct from old.challenge_id then update quantum_private.challenge_recruitment_notices set status='matched',updated_at=clock_timestamp()where team_id=new.id;
  elsif new.captain_user_id is distinct from old.captain_user_id then update quantum_private.challenge_recruitment_notices set status='closed',updated_at=clock_timestamp()where team_id=new.id and status='open';end if;
 elsif new.status is distinct from old.status and new.status<>'recruiting'then
  update quantum_private.challenge_recruitment_notices set status=case when new.status='cancelled'then 'closed'else 'matched'end,updated_at=clock_timestamp()where team_id in(select id from public.department_challenge_teams where challenge_id=new.id);
 end if;return new;
end$$;
create trigger challenge_recruitment_close_roster after insert or update on public.department_challenge_roster for each row execute function quantum_private.challenge_recruitment_close();
create trigger challenge_recruitment_close_team after update on public.department_challenge_teams for each row execute function quantum_private.challenge_recruitment_close();
create trigger challenge_recruitment_close_challenge after update on public.department_challenges for each row execute function quantum_private.challenge_recruitment_close();

create function quantum_private.department_league_recruitment(p_action text,p_args jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();sport text:=p_args->>'sport';dept text;allowed text[];cursor_id uuid;target uuid;cursor_time timestamptz;total integer;rows jsonb:='[]';next_id uuid;item record;
 t public.department_challenge_teams%rowtype;c public.department_challenges%rowtype;r public.department_challenge_roster%rowtype;slots jsonb;key uuid;hash text;prior quantum_private.challenge_recruitment_requests%rowtype;result jsonb;preferred timestamptz;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 perform quantum_private.challenge_assert_player(actor);
 allowed:=case p_action when 'browse'then array['sport','cursor']when 'notices'then array['sport','cursor']when 'detail'then array['sport','challenge_id']when 'publish'then array['sport','team_id','preferred_at','summary','expected_revision','idempotency_key']when 'close'then array['sport','team_id','expected_revision','idempotency_key']when 'reject'then array['sport','team_id','roster_id','expected_revision','idempotency_key']end;
 if allowed is null or p_args is null or jsonb_typeof(p_args)<>'object'or octet_length(p_args::text)>4000 or(select count(*)from jsonb_object_keys(p_args))<>cardinality(allowed)or exists(select 1 from jsonb_object_keys(p_args)k where not(k=any(allowed)))then raise exception 'invalid_recruitment_action';end if;
 if sport is null or sport not in('lol','futsal','football')then raise exception 'invalid_sport';end if;
 select btrim(p.department)into dept from quantum_private.community_member_profiles p where p.user_id=actor;
 if not exists(select 1 from quantum_private.get_member_department_identity(actor)i where i.school_scope_key is not null and i.department_key is not null)then raise exception 'department_identity_required';end if;
 if p_action in('browse','notices')then
  cursor_id:=(p_args->>'cursor')::uuid;
  if cursor_id is not null then
   if p_action='browse'then select ch.created_at into cursor_time from public.department_challenge_teams tm join public.department_challenges ch on ch.id=tm.challenge_id where tm.id=cursor_id and ch.status='recruiting'and quantum_private.challenge_recruitment_visible(tm.id,actor,sport);
   else select n.updated_at into cursor_time from quantum_private.challenge_recruitment_notices n where n.id=cursor_id and n.sport=p_args->>'sport' and quantum_private.challenge_recruitment_visible(n.team_id,actor,p_args->>'sport');end if;
   if cursor_time is null then raise exception 'invalid_cursor';end if;
  end if;
  if p_action='browse'then
   select count(*)into total from public.department_challenge_teams tm join public.department_challenges ch on ch.id=tm.challenge_id where ch.status='recruiting'and quantum_private.challenge_recruitment_visible(tm.id,actor,sport);
   for item in select tm.id,ch.created_at from public.department_challenge_teams tm join public.department_challenges ch on ch.id=tm.challenge_id where ch.status='recruiting'and quantum_private.challenge_recruitment_visible(tm.id,actor,sport)and(cursor_id is null or(ch.created_at,tm.id)<(cursor_time,cursor_id))order by ch.created_at desc,tm.id desc limit 21 loop
    if jsonb_array_length(rows)=20 then next_id:=(rows->19->>'team_id')::uuid;exit;end if;rows:=rows||jsonb_build_array(quantum_private.challenge_recruitment_team(item.id,actor,sport));end loop;
  else
   select count(*)into total from quantum_private.challenge_recruitment_notices n where n.sport=p_args->>'sport' and quantum_private.challenge_recruitment_visible(n.team_id,actor,p_args->>'sport');
   for item in select n.id,n.team_id from quantum_private.challenge_recruitment_notices n where n.sport=p_args->>'sport' and quantum_private.challenge_recruitment_visible(n.team_id,actor,p_args->>'sport')and(cursor_id is null or(n.updated_at,n.id)<(cursor_time,cursor_id))order by n.updated_at desc,n.id desc limit 21 loop
    if jsonb_array_length(rows)=20 then next_id:=(rows->19->>'id')::uuid;exit;end if;rows:=rows||jsonb_build_array(quantum_private.challenge_recruitment_notice(item.team_id,actor));end loop;
  end if;
  return jsonb_build_object('sport',sport,'my_department',dept,'total_count',total,'next_cursor',next_id,case when p_action='browse'then 'teams'else 'notices'end,rows);
 end if;
 if p_action='detail'then
  select tm.* into t from public.department_challenge_teams tm join public.department_challenges ch on ch.id=tm.challenge_id where ch.id=(p_args->>'challenge_id')::uuid and ch.status<>'cancelled'and quantum_private.challenge_recruitment_visible(tm.id,actor,sport)order by tm.id limit 1;
  if t.id is null then raise exception 'recruitment_not_found';end if;
  slots:=quantum_private.challenge_recruitment_slots(t.id,sport);
  return jsonb_build_object('sport',sport,'my_department',dept,'team_id',t.id,'challenge',quantum_private.challenge_recruitment_challenge(t.challenge_id,actor,sport),'empty_slots',slots->'empty_slots','reserved_slots',slots->'reserved_slots','notice',quantum_private.challenge_recruitment_notice(t.id,actor));
 end if;
 key:=(p_args->>'idempotency_key')::uuid;target:=(p_args->>'team_id')::uuid;
 if key is null or target is null or jsonb_typeof(p_args->'expected_revision')<>'number'or(p_args->>'expected_revision')!~'^[0-9]+$'then raise exception 'invalid_recruitment_action';end if;
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('quantum:recruitment:'||actor::text||':'||key::text,0));
 perform quantum_private.challenge_assert_player(actor);
 hash:=md5(p_action||':'||p_args::text);
 select * into prior from quantum_private.challenge_recruitment_requests where actor_id=actor and idempotency_key=key;
 select * into t from public.department_challenge_teams where id=target;
 select * into c from public.department_challenges where id=t.challenge_id for update;
 select * into t from public.department_challenge_teams where id=target and challenge_id=c.id for update;
 if t.id is null or not quantum_private.challenge_recruitment_visible(t.id,actor,sport)then raise exception 'recruitment_not_found';end if;
 if t.captain_user_id<>actor then raise exception 'captain_required';end if;
 if prior.actor_id is not null then if prior.request_hash<>hash then raise exception 'idempotency_key_reused';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 if c.revision is distinct from(p_args->>'expected_revision')::integer then raise exception 'stale_revision';end if;
 if c.status<>'recruiting'then raise exception 'recruitment_closed_conflict';end if;
 if p_action='publish'then
  preferred:=(p_args->>'preferred_at')::timestamptz;
  if preferred is null or not isfinite(preferred)or preferred<=now()then raise exception 'invalid_preferred_at';end if;
  if jsonb_typeof(p_args->'summary')<>'string'or char_length(btrim(p_args->>'summary'))not between 1 and 160 or(p_args->>'summary')~('[[:cntrl:]'||chr(8203)||chr(8238)||chr(8288)||chr(65279)||']')then raise exception 'invalid_summary';end if;
  slots:=quantum_private.challenge_recruitment_slots(t.id,sport);
  if(slots->>'accepted_count')::int>=c.team_capacity or jsonb_array_length(slots->'empty_slots')=0 then raise exception 'recruitment_filled_conflict';end if;
  insert into quantum_private.challenge_recruitment_notices(team_id,sport,author_id,preferred_at,summary)values(t.id,sport,actor,preferred,btrim(p_args->>'summary'))on conflict(team_id)do update set sport=excluded.sport,author_id=actor,preferred_at=excluded.preferred_at,summary=excluded.summary,status='open',updated_at=clock_timestamp();
 elsif p_action='close'then
  update quantum_private.challenge_recruitment_notices set status='closed',updated_at=clock_timestamp()where team_id=t.id;
  if not found then raise exception 'recruitment_notice_not_found';end if;
 else
  select * into r from public.department_challenge_roster where id=(p_args->>'roster_id')::uuid and team_id=t.id and challenge_id=c.id for update;
  if r.id is null then raise exception 'roster_not_found';end if;
  if r.status<>'requested'then raise exception 'roster_not_pending_conflict';end if;
  update public.department_challenge_roster set status='declined',revision=revision+1 where id=r.id;
 end if;
 update public.department_challenges set revision=revision+1 where id=c.id returning * into c;
 result:=jsonb_build_object('team_id',t.id,'challenge_id',c.id,'revision',c.revision,'notice',quantum_private.challenge_recruitment_notice(t.id,actor),'replayed',false);
 insert into quantum_private.challenge_recruitment_requests(actor_id,idempotency_key,request_hash,result)values(actor,key,hash,result);
 return result;
end$$;
create function public.department_league_recruitment(p_action text,p_args jsonb)returns jsonb language sql security definer set search_path='' as $$select quantum_private.department_league_recruitment(p_action,p_args)$$;

-- Keep existing action semantics; only enrich views and guard new joins into reserved slots.
alter function quantum_private.department_league_journey(text,jsonb)rename to department_league_journey_pre_recruitment;
create function quantum_private.department_league_journey(p_action text,p_args jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;c uuid;rows jsonb;begin
 if auth.uid()is null then raise exception 'not_authenticated';end if;
 if p_action='join'then
  perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||auth.uid()::text,0));
  if not exists(select 1 from quantum_private.challenge_journey_requests where actor_id=auth.uid()and idempotency_key=(p_args->>'idempotency_key')::uuid)then
   select id into c from public.department_challenges where id=(p_args->>'challenge_id')::uuid for update;
   if not quantum_private.challenge_recruitment_visible((p_args->>'team_id')::uuid,auth.uid(),p_args->>'sport')then raise exception 'recruitment_not_found';end if;
   if exists(select 1 from public.department_challenge_friend_invites i where i.team_id=(p_args->>'team_id')::uuid and i.challenge_id=c and i.sport=p_args->>'sport'and i.slot_key=p_args->>'slot'and i.status='pending'and i.expires_at>now())then raise exception 'slot_reserved_conflict';end if;
  end if;
 end if;
 result:=quantum_private.department_league_journey_pre_recruitment(p_action,p_args);
 if p_action='overview'then
  select coalesce(jsonb_agg(item||jsonb_build_object('teams',(select coalesce(jsonb_agg(team||jsonb_build_object('team_name',t.team_name)),'[]')from jsonb_array_elements(item->'teams')team join public.department_challenge_teams t on t.id=(team->>'id')::uuid))),'[]')into rows from jsonb_array_elements(result->'challenges')item;
  result:=jsonb_set(result,'{challenges}',rows);
 end if;return result;
end$$;
alter function quantum_private.department_league_lobby(text,jsonb)rename to department_league_lobby_pre_recruitment;
create function quantum_private.department_league_lobby(p_action text,p_args jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 result:=quantum_private.department_league_lobby_pre_recruitment(p_action,p_args);
 if p_action='overview'then result:=jsonb_set(result,'{teams}',(select coalesce(jsonb_agg(item||jsonb_build_object('team_name',t.team_name)),'[]')from jsonb_array_elements(result->'teams')item join public.department_challenge_teams t on t.id=(item->>'team_id')::uuid));end if;return result;
end$$;
alter function quantum_private.challenge_position_invite_projection(uuid,uuid)rename to challenge_position_invite_projection_pre_recruitment;
create function quantum_private.challenge_position_invite_projection(p_invite uuid,p_actor uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select quantum_private.challenge_position_invite_projection_pre_recruitment(p_invite,p_actor)||jsonb_build_object('team_name',t.team_name)from public.department_challenge_friend_invites i join public.department_challenge_teams t on t.id=i.team_id where i.id=p_invite
$$;

revoke all on function quantum_private.challenge_recruitment_team_name(),quantum_private.challenge_recruitment_slots(uuid,text),quantum_private.challenge_recruitment_visible(uuid,uuid,text),quantum_private.challenge_recruitment_notice(uuid,uuid),quantum_private.challenge_recruitment_team(uuid,uuid,text),quantum_private.challenge_recruitment_challenge(uuid,uuid,text),quantum_private.challenge_recruitment_close(),quantum_private.department_league_recruitment(text,jsonb),public.department_league_recruitment(text,jsonb),quantum_private.department_league_journey_pre_recruitment(text,jsonb),quantum_private.department_league_journey(text,jsonb),quantum_private.department_league_lobby_pre_recruitment(text,jsonb),quantum_private.department_league_lobby(text,jsonb),quantum_private.challenge_position_invite_projection_pre_recruitment(uuid,uuid),quantum_private.challenge_position_invite_projection(uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.department_league_recruitment(text,jsonb),quantum_private.department_league_journey(text,jsonb),quantum_private.department_league_lobby(text,jsonb)to authenticated;
comment on function public.department_league_recruitment(text,jsonb)is 'Same-school, same-department, exact-sport discovery before pagination; captain-authored team notices and requested-only rejection. No new chat room or external notification.';
notify pgrst,'reload schema';
commit;
