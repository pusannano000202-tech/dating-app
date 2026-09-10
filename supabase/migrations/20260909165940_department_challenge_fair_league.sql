begin;

-- Extend existing teams and bilateral schedule/result engine. No production
-- ranks, Riot account assertions, inferred MMR, or automatic moderation.
alter table public.department_challenges add column fair_league boolean not null default false;
alter table public.department_challenges alter column fair_league set default true;

create table quantum_private.challenge_skill_profiles (
  roster_id uuid primary key references public.department_challenge_roster(id) on delete cascade,
  position text not null check(position in ('top','jungle','mid','adc','support','goalkeeper','defender','midfielder','forward')),
  tier text not null check(tier in ('iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger','beginner','intermediate','advanced')),
  self_reported_at timestamptz not null default clock_timestamp()
);
create table quantum_private.challenge_team_preferences (
  team_id uuid primary key references public.department_challenge_teams(id) on delete cascade,
  waiting boolean not null default false,
  allowed_gap integer not null default 200 check(allowed_gap in (200,300)),
  updated_at timestamptz not null default clock_timestamp()
);
create table quantum_private.challenge_pair_proposals (
  from_team uuid not null references public.department_challenge_teams(id) on delete cascade,
  to_team uuid not null references public.department_challenge_teams(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(from_team,to_team),check(from_team<>to_team)
);
create table quantum_private.challenge_linked_recruitments (
  source_challenge uuid primary key references public.department_challenges(id) on delete cascade,
  source_team uuid not null references public.department_challenge_teams(id) on delete cascade,
  destination_challenge uuid not null references public.department_challenges(id) on delete restrict,
  linked_at timestamptz not null default clock_timestamp(),check(source_challenge<>destination_challenge)
);
create table quantum_private.challenge_match_players (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.department_challenges(id) on delete cascade,
  team_id uuid not null references public.department_challenge_teams(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  alias text not null,position text not null,tier text not null,
  unique(challenge_id,user_id)
);
create table quantum_private.challenge_fair_reports (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.department_challenges(id) on delete cascade,
  reporter_id uuid references public.users(id) on delete set null,
  target_player_id uuid not null references quantum_private.challenge_match_players(id) on delete cascade,
  reason text not null check(char_length(btrim(reason)) between 10 and 1000),
  status text not null default 'pending' check(status in ('pending','dismissed','restricted')),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,review_note text,
  unique(challenge_id,reporter_id,target_player_id)
);
create table quantum_private.challenge_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  report_id uuid not null unique references quantum_private.challenge_fair_reports(id) on delete cascade,
  duration_days integer not null check(duration_days in (14,21)),
  starts_at timestamptz not null default clock_timestamp(),ends_at timestamptz not null,
  reason text not null check(char_length(btrim(reason)) between 10 and 1000),
  created_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,revoked_by uuid references public.users(id) on delete set null,restore_reason text,
  appeal_text text check(appeal_text is null or char_length(btrim(appeal_text)) between 10 and 1000),
  appeal_status text not null default 'none' check(appeal_status in ('none','pending','reviewed')),
  appeal_response text,check(ends_at>starts_at)
);
create table quantum_private.challenge_moderation_audit (
  id uuid primary key default gen_random_uuid(),actor_id uuid references public.users(id) on delete set null,
  report_id uuid references quantum_private.challenge_fair_reports(id) on delete set null,
  action text not null check(action in ('dismiss','restrict','restore','appeal_review')),
  note text not null,created_at timestamptz not null default clock_timestamp()
);
create index challenge_restrictions_active_idx on quantum_private.challenge_restrictions(user_id,ends_at) where revoked_at is null;
create index challenge_reports_pending_idx on quantum_private.challenge_fair_reports(status,created_at);
create index challenge_match_players_user_idx on quantum_private.challenge_match_players(user_id,challenge_id);

do $$ declare t text;begin
 foreach t in array array['challenge_skill_profiles','challenge_team_preferences','challenge_pair_proposals','challenge_linked_recruitments','challenge_match_players','challenge_fair_reports','challenge_restrictions','challenge_moderation_audit'] loop
 execute format('alter table quantum_private.%I enable row level security',t);
 execute format('revoke all on quantum_private.%I from public,anon,authenticated,service_role',t);
 end loop;end$$;

create function quantum_private.challenge_skill_score(p_tier text) returns integer
language sql immutable set search_path='' as $$
 select case p_tier when 'iron' then 100 when 'bronze' then 200 when 'silver' then 300 when 'gold' then 400 when 'platinum' then 500 when 'emerald' then 600 when 'diamond' then 700 when 'master' then 900 when 'grandmaster' then 1000 when 'challenger' then 1100 when 'beginner' then 100 when 'intermediate' then 300 when 'advanced' then 500 end
$$;
create function quantum_private.challenge_assert_player(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 perform quantum_private.assert_activity_room_access(p_user);
 if exists(select 1 from quantum_private.challenge_restrictions where user_id=p_user and revoked_at is null and ends_at>clock_timestamp()) then raise exception 'challenge_restricted_forbidden';end if;
end$$;

create function quantum_private.challenge_team_ready(p_team uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare t public.department_challenge_teams%rowtype;c public.department_challenges%rowtype;r record;n integer:=0;positions text[]:='{}';
begin
 select * into t from public.department_challenge_teams where id=p_team;
 select * into c from public.department_challenges where id=t.challenge_id;
 if t.id is null or t.status<>'accepted' or c.status in ('completed','cancelled') or(c.category='gaming' and c.team_capacity<>5) then return false;end if;
 for r in select roster.user_id,profile.position,profile.tier from public.department_challenge_roster roster left join quantum_private.challenge_skill_profiles profile on profile.roster_id=roster.id where roster.team_id=p_team and roster.status='accepted' loop
  if r.position is null or r.tier is null then return false;end if;
  if c.category='gaming' and(r.position not in ('top','jungle','mid','adc','support') or r.tier not in ('iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger') or r.position=any(positions)) then return false;end if;
  if c.category='soccer' and(r.position not in ('goalkeeper','defender','midfielder','forward') or r.tier not in ('beginner','intermediate','advanced')) then return false;end if;
  if not exists(select 1 from quantum_private.get_member_department_identity(r.user_id) i where i.school_scope_key=c.school_scope_key and i.department_key=t.department_key) then return false;end if;
  if quantum_private.account_deletion_blocks_access(r.user_id) or not exists(select 1 from auth.users u where u.id=r.user_id and u.deleted_at is null and(u.banned_until is null or u.banned_until<=now())) or exists(select 1 from quantum_private.challenge_restrictions s where s.user_id=r.user_id and s.revoked_at is null and s.ends_at>now()) then return false;end if;
  positions:=array_append(positions,r.position);n:=n+1;
 end loop;
 return n=c.team_capacity and not exists(select 1 from public.department_challenge_roster a join public.department_challenge_roster b on a.team_id=b.team_id and a.user_id<b.user_id where a.team_id=p_team and a.status='accepted' and b.status='accepted' and quantum_private.tonight_invite_pair_is_blocked(a.user_id,b.user_id));
end$$;

create function quantum_private.challenge_teams_compatible(p_first uuid,p_second uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with scores as(select r.team_id,round(avg(quantum_private.challenge_skill_score(p.tier))*.7+max(quantum_private.challenge_skill_score(p.tier))*.3) compatibility,max(quantum_private.challenge_skill_score(p.tier)) peak
 from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id in(p_first,p_second) and r.status='accepted' group by r.team_id)
 select coalesce((select abs(a.compatibility-b.compatibility)<=least(coalesce(pa.allowed_gap,200),coalesce(pb.allowed_gap,200)) and abs(a.peak-b.peak)<=least(coalesce(pa.allowed_gap,200),coalesce(pb.allowed_gap,200))
 from scores a join scores b on a.team_id=p_first and b.team_id=p_second left join quantum_private.challenge_team_preferences pa on pa.team_id=p_first left join quantum_private.challenge_team_preferences pb on pb.team_id=p_second),false)
 and not exists(select 1 from public.department_challenge_roster a cross join public.department_challenge_roster b where a.team_id=p_first and b.team_id=p_second and a.status='accepted' and b.status='accepted' and(a.user_id=b.user_id or quantum_private.tonight_invite_pair_is_blocked(a.user_id,b.user_id)))
$$;

create function quantum_private.challenge_guard_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare t uuid; c public.department_challenges%rowtype; other_user uuid;a uuid;b uuid;
begin
 if tg_table_name='department_challenges' then
  if tg_op='INSERT' then
   perform quantum_private.challenge_assert_player(new.created_by);
   if new.category='gaming' and new.team_capacity<>5 then raise exception 'invalid_lol_capacity';end if;
  elsif new.status in('scheduled','result_pending','completed') and new.status is distinct from old.status and new.fair_league then
   select id into a from public.department_challenge_teams where challenge_id=new.id and side='challenger' and status='accepted';
   select id into b from public.department_challenge_teams where challenge_id=new.id and side='opponent' and status='accepted';
   if a is null or b is null or not quantum_private.challenge_team_ready(a) or not quantum_private.challenge_team_ready(b) or not quantum_private.challenge_teams_compatible(a,b) then raise exception 'fair_team_required';end if;
  end if;
  return new;
 end if;
 if new.status in('requested','accepted') then
  perform quantum_private.challenge_assert_player(new.user_id);
  select * into c from public.department_challenges where id=new.challenge_id;
  if c.fair_league and c.status<>'recruiting' and(tg_op='INSERT' or old.status is distinct from new.status or old.team_id is distinct from new.team_id) then raise exception 'fair_roster_locked_conflict';end if;
  if exists(select 1 from public.department_challenge_roster r where r.challenge_id=new.challenge_id and r.user_id<>new.user_id and r.status='accepted' and quantum_private.tonight_invite_pair_is_blocked(r.user_id,new.user_id)) then raise exception 'challenge_blocked_forbidden';end if;
 end if;
 -- Roster or skill changes revoke queue consent. Existing invitations cannot
 -- silently change the five people both captains agreed to play with.
 if tg_op='INSERT' or old.status is distinct from new.status or old.team_id is distinct from new.team_id then
  update quantum_private.challenge_team_preferences set waiting=false where team_id=new.team_id;
  delete from quantum_private.challenge_pair_proposals where from_team=new.team_id or to_team=new.team_id;
 end if;
 return new;
end$$;
create trigger challenge_fair_creation_guard before insert or update on public.department_challenges for each row execute function quantum_private.challenge_guard_write();
create trigger challenge_fair_roster_guard before insert or update on public.department_challenge_roster for each row execute function quantum_private.challenge_guard_write();

create function quantum_private.challenge_capture_match() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.status='scheduled' and old.status<>'scheduled' then
  insert into quantum_private.challenge_match_players(challenge_id,team_id,user_id,alias,position,tier)
  select new.id,r.team_id,r.user_id,quantum_private.activity_meetup_alias(r.user_id),p.position,p.tier from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.challenge_id=new.id and r.status='accepted'
  on conflict(challenge_id,user_id) do nothing;
 end if;return new;
end$$;
create trigger challenge_capture_match after update on public.department_challenges for each row execute function quantum_private.challenge_capture_match();

create function quantum_private.department_league_action(p_action text,p_args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();school_key text;dept_key text;dept_label text;v_category text:=p_args->>'category';
 t public.department_challenge_teams%rowtype;o public.department_challenge_teams%rowtype;c public.department_challenges%rowtype;oc public.department_challenges%rowtype;
v_roster_id uuid;pos text;v_tier text;gap integer;answer jsonb;rows jsonb;player quantum_private.challenge_match_players%rowtype;v_report_id uuid;s quantum_private.challenge_restrictions%rowtype;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 perform quantum_private.assert_activity_room_access(actor);
 if p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>6000 then raise exception 'invalid_league_input';end if;
 select i.school_scope_key,i.department_key into school_key,dept_key from quantum_private.get_member_department_identity(actor)i;
 if school_key is null or dept_key is null then raise exception 'department_identity_required';end if;
 select btrim(department) into dept_label from quantum_private.community_member_profiles where user_id=actor;
 -- Serialize this small campus league across queue, moderation and pairing.
 -- Existing per-challenge locks remain the authority for team mutations.
 perform pg_advisory_xact_lock(hashtextextended('quantum:challenge-league:'||school_key,0));

 if p_action='overview' then
  if v_category is null or v_category not in('gaming','soccer') then raise exception 'invalid_category';end if;
  with completed as(
   select ch.*,ta.department_key a_key,ta.department_label a_label,tb.department_key b_key,tb.department_label b_label
   from public.department_challenges ch join public.department_challenge_teams ta on ta.challenge_id=ch.id and ta.side='challenger' join public.department_challenge_teams tb on tb.challenge_id=ch.id and tb.side='opponent'
   join public.department_challenge_result_confirmations ca on ca.challenge_id=ch.id and ca.team_id=ta.id
   join public.department_challenge_result_confirmations cb on cb.challenge_id=ch.id and cb.team_id=tb.id
   where ch.school_scope_key=school_key and ch.category=v_category and ch.status='completed' and ca.own_score=cb.opponent_score and ca.opponent_score=cb.own_score and ca.own_score=ch.first_score and cb.own_score=ch.second_score
  ),results as(select a_key key,a_label label,first_score own,second_score other from completed union all select b_key,b_label,second_score,first_score from completed),aggregate as(
   select key,max(label) department,count(*) played,count(*) filter(where own>other) wins,count(*) filter(where own<other) losses,count(*) filter(where own=other) draws from results group by key
  ),ranked as(select *,dense_rank() over(order by wins*3+draws desc,wins desc,losses asc) rank from aggregate)
  select coalesce(jsonb_agg(jsonb_build_object('department',department,'played',played,'wins',wins,'losses',losses,'draws',draws,'rank',rank,'is_me',key=dept_key) order by rank,department),'[]') into rows from(select * from ranked order by rank,department limit 200)bounded;
  answer:=jsonb_build_object('category',v_category,'my_department',dept_label,'standings',rows);
  select coalesce(jsonb_agg(value),'[]') into rows from(
   select jsonb_build_object('team_id',tm.id,'challenge_id',tm.challenge_id,'department',tm.department_label,'status',ch.status,'is_captain',tm.captain_user_id=actor,'waiting',coalesce(pref.waiting,false),'gap',coalesce(pref.allowed_gap,200),'ready',quantum_private.challenge_team_ready(tm.id),
   'players',(select coalesce(jsonb_agg(jsonb_build_object('roster_id',r.id,'alias',quantum_private.activity_meetup_alias(r.user_id),'position',p.position,'tier',p.tier,'is_me',r.user_id=actor) order by r.requested_at,r.id),'[]') from public.department_challenge_roster r left join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=tm.id and r.status='accepted'),
   'prior_polls',(select coalesce(jsonb_agg(poll_value),'[]') from(select jsonb_build_object('id',poll.id,'title',poll.title,'status',poll.status,'options',(select coalesce(jsonb_agg(jsonb_build_object('label',opt.label,'votes',(select count(*) from quantum_private.activity_room_poll_ballot_choices vote where vote.option_id=opt.id)) order by opt.position),'[]')from quantum_private.activity_room_poll_options opt where opt.poll_id=poll.id))poll_value
    from quantum_private.challenge_linked_recruitments link join quantum_private.activity_room_polls poll on poll.room_kind='department_challenge' and poll.room_id=link.source_challenge where link.source_team=tm.id order by poll.created_at desc limit 20)archive))value
   from public.department_challenge_teams tm join public.department_challenges ch on ch.id=tm.challenge_id left join quantum_private.challenge_team_preferences pref on pref.team_id=tm.id
   where ch.school_scope_key=school_key and ch.category=v_category and ch.status not in('completed','cancelled') and exists(select 1 from public.department_challenge_roster me where me.team_id=tm.id and me.user_id=actor and me.status='accepted')
   and not exists(select 1 from public.department_challenge_roster other_r where other_r.team_id=tm.id and other_r.status='accepted' and quantum_private.tonight_invite_pair_is_blocked(actor,other_r.user_id)) order by ch.created_at desc limit 50
  )mine;
  answer:=answer||jsonb_build_object('my_teams',rows);
  select coalesce(jsonb_agg(value),'[]') into rows from(select jsonb_build_object('id',id,'status',status,'created_at',created_at)value from quantum_private.challenge_fair_reports where reporter_id=actor order by created_at desc limit 50)mine;
  answer:=answer||jsonb_build_object('reports',rows);
  select coalesce(jsonb_agg(value),'[]') into rows from(select jsonb_build_object('id',id,'ends_at',ends_at,'reason',reason,'appeal_status',appeal_status,'appeal_response',appeal_response,'revoked',revoked_at is not null)value from quantum_private.challenge_restrictions where user_id=actor order by starts_at desc limit 50)mine;
  return answer||jsonb_build_object('restrictions',rows);
 end if;
 if p_action='appeal' then
  select * into s from quantum_private.challenge_restrictions where id=(p_args->>'restriction_id')::uuid and user_id=actor for update;
  if s.id is null then raise exception 'restriction_not_found';end if;
  if s.appeal_status<>'none' then raise exception 'appeal_already_submitted';end if;
  if char_length(btrim(coalesce(p_args->>'reason',''))) not between 10 and 1000 then raise exception 'invalid_appeal_reason';end if;
  update quantum_private.challenge_restrictions set appeal_text=btrim(p_args->>'reason'),appeal_status='pending' where id=s.id;
  return jsonb_build_object('status','pending');
 end if;
 if p_action in('report_targets','report') then
  select * into c from public.department_challenges where id=(p_args->>'challenge_id')::uuid and school_scope_key=school_key;
  if c.id is null or c.status not in('scheduled','result_pending','completed') or c.scheduled_at>clock_timestamp() then raise exception 'match_not_available';end if;
  select snapshot.* into player from quantum_private.challenge_match_players snapshot join public.department_challenge_roster roster on roster.challenge_id=snapshot.challenge_id and roster.team_id=snapshot.team_id and roster.user_id=snapshot.user_id
  where snapshot.challenge_id=c.id and snapshot.user_id=actor and roster.accepted_at<=c.scheduled_at and(roster.left_at is null or roster.left_at>=c.scheduled_at);
  if player.id is null then raise exception 'match_participant_required';end if;
  if p_action='report_targets' then
   select coalesce(jsonb_agg(jsonb_build_object('id',snapshot.id,'alias',snapshot.alias,'position',snapshot.position) order by snapshot.position,snapshot.id),'[]') into rows from quantum_private.challenge_match_players snapshot join public.department_challenge_roster roster on roster.challenge_id=snapshot.challenge_id and roster.team_id=snapshot.team_id and roster.user_id=snapshot.user_id
   where snapshot.challenge_id=c.id and snapshot.team_id<>player.team_id and snapshot.user_id is not null and roster.accepted_at<=c.scheduled_at and(roster.left_at is null or roster.left_at>=c.scheduled_at);
   return rows;
  end if;
  if not exists(select 1 from quantum_private.challenge_match_players snapshot join public.department_challenge_roster roster on roster.challenge_id=snapshot.challenge_id and roster.team_id=snapshot.team_id and roster.user_id=snapshot.user_id where snapshot.id=(p_args->>'target_player_id')::uuid and snapshot.challenge_id=c.id and snapshot.team_id<>player.team_id and snapshot.user_id is not null and roster.accepted_at<=c.scheduled_at and(roster.left_at is null or roster.left_at>=c.scheduled_at)) then raise exception 'opponent_participant_required';end if;
  if char_length(btrim(coalesce(p_args->>'reason',''))) not between 10 and 1000 then raise exception 'invalid_report_reason';end if;
  if (select count(*) from quantum_private.challenge_fair_reports where reporter_id=actor and created_at>now()-interval '1 day')>=20 then raise exception 'report_limit_conflict';end if;
  insert into quantum_private.challenge_fair_reports(challenge_id,reporter_id,target_player_id,reason)values(c.id,actor,(p_args->>'target_player_id')::uuid,btrim(p_args->>'reason'))on conflict(challenge_id,reporter_id,target_player_id) do nothing returning id into v_report_id;
  if v_report_id is null then select id into v_report_id from quantum_private.challenge_fair_reports where challenge_id=c.id and reporter_id=actor and target_player_id=(p_args->>'target_player_id')::uuid;end if;
  return jsonb_build_object('id',v_report_id,'status',(select status from quantum_private.challenge_fair_reports where id=v_report_id));
 end if;
 if p_action not in('profile','queue','candidates','propose','accept') then raise exception 'invalid_league_action';end if;
 if p_action<>'queue' or coalesce((p_args->>'waiting')::boolean,true) then perform quantum_private.challenge_assert_player(actor);end if;
 select * into t from public.department_challenge_teams where id=(p_args->>'team_id')::uuid and status='accepted';
 select * into c from public.department_challenges where id=t.challenge_id;
 if t.id is null or c.school_scope_key<>school_key or t.department_key<>dept_key or not exists(select 1 from public.department_challenge_roster where team_id=t.id and user_id=actor and status='accepted') then raise exception 'team_membership_required';end if;
 if p_action in('propose','accept') then
  select * into o from public.department_challenge_teams where id=(p_args->>'opponent_team_id')::uuid and status='accepted';
  select * into oc from public.department_challenges where id=o.challenge_id;
  if o.id is null or oc.school_scope_key<>school_key or oc.category<>c.category or oc.team_capacity<>c.team_capacity or o.department_key=t.department_key or c.id=oc.id then raise exception 'opponent_not_available';end if;
  perform 1 from public.department_challenges where id in(c.id,oc.id) order by id for update;
  select * into c from public.department_challenges where id=t.challenge_id;select * into oc from public.department_challenges where id=o.challenge_id;
 else perform 1 from public.department_challenges where id=c.id for update;select * into c from public.department_challenges where id=c.id;
 end if;
 if c.status in('completed','cancelled') then raise exception 'challenge_closed';end if;
 if p_action='profile' then
  if c.status<>'recruiting' then raise exception 'skill_profile_locked_conflict';end if;
  pos:=p_args->>'position';v_tier:=p_args->>'tier';
  if pos is null or v_tier is null or(c.category='gaming' and(pos not in('top','jungle','mid','adc','support') or v_tier not in('iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger')))or(c.category='soccer' and(pos not in('goalkeeper','defender','midfielder','forward')or v_tier not in('beginner','intermediate','advanced')))then raise exception 'invalid_skill_profile';end if;
  select id into v_roster_id from public.department_challenge_roster where team_id=t.id and user_id=actor and status='accepted';
  if c.category='gaming' and exists(select 1 from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=t.id and r.status='accepted' and r.id<>v_roster_id and p.position=pos)then raise exception 'position_conflict';end if;
  insert into quantum_private.challenge_skill_profiles values(v_roster_id,pos,v_tier,clock_timestamp())on conflict on constraint challenge_skill_profiles_pkey do update set position=excluded.position,tier=excluded.tier,self_reported_at=excluded.self_reported_at;
  update quantum_private.challenge_team_preferences set waiting=false where team_id=t.id;
  delete from quantum_private.challenge_pair_proposals where from_team=t.id or to_team=t.id;
  return jsonb_build_object('saved',true);
 end if;
 if t.captain_user_id<>actor then raise exception 'captain_required';end if;
 if p_action='queue' then
  gap:=(p_args->>'gap')::integer;
  if gap is null or gap not in(200,300) or jsonb_typeof(p_args->'waiting')<>'boolean' then raise exception 'invalid_queue';end if;
  if(p_args->>'waiting')::boolean and(c.status<>'recruiting' or not quantum_private.challenge_team_ready(t.id))then raise exception 'fair_team_required';end if;
  insert into quantum_private.challenge_team_preferences(team_id,waiting,allowed_gap)values(t.id,(p_args->>'waiting')::boolean,gap)on conflict(team_id)do update set waiting=excluded.waiting,allowed_gap=excluded.allowed_gap,updated_at=clock_timestamp();
  delete from quantum_private.challenge_pair_proposals where from_team=t.id or to_team=t.id;
  return jsonb_build_object('saved',true);
 end if;
 if c.status<>'recruiting' or not quantum_private.challenge_team_ready(t.id) or not exists(select 1 from quantum_private.challenge_team_preferences where team_id=t.id and waiting)then raise exception 'team_not_available';end if;
 if p_action='candidates' then
  select coalesce(jsonb_agg(value),'[]') into rows from(
   select jsonb_build_object('team_id',tm.id,'challenge_id',ch.id,'department',tm.department_label,'gap',pref.allowed_gap,'incoming',exists(select 1 from quantum_private.challenge_pair_proposals where from_team=tm.id and to_team=t.id),'outgoing',exists(select 1 from quantum_private.challenge_pair_proposals where from_team=t.id and to_team=tm.id))value
   from public.department_challenge_teams tm join public.department_challenges ch on ch.id=tm.challenge_id join quantum_private.challenge_team_preferences pref on pref.team_id=tm.id
   where tm.id<>t.id and ch.id<>c.id and tm.department_key<>t.department_key and ch.school_scope_key=school_key and ch.category=c.category and ch.team_capacity=c.team_capacity and ch.status='recruiting' and tm.side='challenger' and tm.status='accepted' and pref.waiting and quantum_private.challenge_team_ready(tm.id) and quantum_private.challenge_teams_compatible(t.id,tm.id)
   order by pref.updated_at,tm.id limit 30
  )candidates;return rows;
 end if;
 if oc.status<>'recruiting' or not quantum_private.challenge_team_ready(o.id) or not exists(select 1 from quantum_private.challenge_team_preferences where team_id=o.id and waiting)or not quantum_private.challenge_teams_compatible(t.id,o.id)then raise exception 'opponent_not_available';end if;
 if p_action='propose' then
  insert into quantum_private.challenge_pair_proposals(from_team,to_team)values(t.id,o.id)on conflict do nothing;return jsonb_build_object('status','pending');
 end if;
 if not exists(select 1 from quantum_private.challenge_pair_proposals where from_team=o.id and to_team=t.id)then raise exception 'proposal_not_available';end if;
 -- The proposing team's challenge remains the match; accepting team's prior
 -- recruitment remains archived. Existing team/roster IDs and reports survive.
 insert into quantum_private.challenge_linked_recruitments(source_challenge,source_team,destination_challenge)values(c.id,t.id,oc.id);
 update public.department_challenge_teams set challenge_id=oc.id,side='opponent' where id=t.id;
 update public.department_challenge_roster set challenge_id=oc.id where team_id=t.id;
 update public.department_challenge_friend_invites set status='cancelled',responded_at=clock_timestamp()where challenge_id in(c.id,oc.id) and status='pending';
 update public.department_challenges set status='cancelled',cancelled_by=actor,cancel_reason='paired_to_existing_challenge',revision=revision+1 where id=c.id;
 update public.department_challenges set status='opponent_pending',revision=revision+1 where id=oc.id;
 update quantum_private.challenge_team_preferences set waiting=false where team_id in(t.id,o.id);
 delete from quantum_private.challenge_pair_proposals where from_team in(t.id,o.id) or to_team in(t.id,o.id);
 return jsonb_build_object('status','opponent_pending','challenge_id',oc.id);
end$$;

create function public.department_league_action(p_action text,p_args jsonb)returns jsonb
language sql security invoker set search_path='' as $$select quantum_private.department_league_action(p_action,p_args)$$;

create function quantum_private.department_league_moderate(p_action text,p_args jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r quantum_private.challenge_fair_reports%rowtype;s quantum_private.challenge_restrictions%rowtype;target uuid;days integer;note text;rows jsonb;
begin
 perform quantum_private.require_recent_super_admin_auth(actor);
 if not public.verify_admin_aal2_session() then raise exception 'mfa_required';end if;
 if p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>6000 then raise exception 'invalid_moderation_input';end if;
 if p_action='list' then
  select coalesce(jsonb_agg(value),'[]')into rows from(select jsonb_build_object('id',report_row.id,'challenge_id',report_row.challenge_id,'reason',report_row.reason,'status',report_row.status,'created_at',report_row.created_at,'target_alias',p.alias,'position',p.position,'self_reported_tier',p.tier,'restriction_id',restriction_row.id,'ends_at',restriction_row.ends_at,'revoked',restriction_row.revoked_at is not null,'appeal_text',restriction_row.appeal_text,'appeal_status',restriction_row.appeal_status)value
  from quantum_private.challenge_fair_reports report_row join quantum_private.challenge_match_players p on p.id=report_row.target_player_id left join quantum_private.challenge_restrictions restriction_row on restriction_row.report_id=report_row.id order by(report_row.status='pending' or restriction_row.appeal_status='pending')desc,report_row.created_at desc limit 100)queue;
  return rows;
 end if;
 note:=btrim(coalesce(p_args->>'note',''));if char_length(note)not between 10 and 1000 then raise exception 'invalid_review_note';end if;
  select * into r from quantum_private.challenge_fair_reports where id=(p_args->>'report_id')::uuid for update;
  if r.id is null then raise exception 'report_not_found';end if;
  perform pg_advisory_xact_lock(hashtextextended('quantum:challenge-league:'||(select school_scope_key from public.department_challenges where id=r.challenge_id),0));
 select user_id into target from quantum_private.challenge_match_players where id=r.target_player_id;
 if target=actor or r.reporter_id=actor then raise exception 'independent_operator_required';end if;
 if p_action in('dismiss','restrict') then
  if r.status<>'pending' then raise exception 'report_already_reviewed';end if;
  if p_action='restrict' then
   days:=(p_args->>'days')::integer;if days is null or days not in(14,21)then raise exception 'invalid_restriction_duration';end if;
   if target is null then raise exception 'target_not_available';end if;
   insert into quantum_private.challenge_restrictions(user_id,report_id,duration_days,ends_at,reason,created_by)values(target,r.id,days,clock_timestamp()+make_interval(days=>days),note,actor);
   update quantum_private.challenge_team_preferences set waiting=false where team_id in(select team_id from public.department_challenge_roster where user_id=target and status='accepted');
   delete from quantum_private.challenge_pair_proposals where from_team in(select team_id from public.department_challenge_roster where user_id=target)or to_team in(select team_id from public.department_challenge_roster where user_id=target);
  end if;
  update quantum_private.challenge_fair_reports set status=case when p_action='restrict' then 'restricted' else 'dismissed' end,reviewed_by=actor,reviewed_at=clock_timestamp(),review_note=note where id=r.id;
 elsif p_action in('restore','appeal_review')then
  select * into s from quantum_private.challenge_restrictions where report_id=r.id for update;
  if s.id is null then raise exception 'restriction_not_found';end if;
  if p_action='restore' then
   if s.revoked_at is not null then raise exception 'restriction_already_restored';end if;
   update quantum_private.challenge_restrictions set revoked_at=clock_timestamp(),revoked_by=actor,restore_reason=note,appeal_status=case when appeal_status='pending' then 'reviewed' else appeal_status end,appeal_response=note where id=s.id;
  else
   if s.appeal_status<>'pending' then raise exception 'appeal_not_pending';end if;
   update quantum_private.challenge_restrictions set appeal_status='reviewed',appeal_response=note where id=s.id;
  end if;
 else raise exception 'invalid_moderation_action';end if;
 insert into quantum_private.challenge_moderation_audit(actor_id,report_id,action,note)values(actor,r.id,p_action,note);
 return jsonb_build_object('saved',true);
end$$;
create function public.department_league_moderate(p_action text,p_args jsonb)returns jsonb
language sql security invoker set search_path='' as $$select quantum_private.department_league_moderate(p_action,p_args)$$;

alter function quantum_private.department_challenge_projection(uuid,uuid) rename to department_challenge_projection_pre_league;
create function quantum_private.department_challenge_projection(p_challenge_id uuid,p_actor uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base jsonb;is_fair boolean;destination uuid;begin
 base:=quantum_private.department_challenge_projection_pre_league(p_challenge_id,p_actor);
  select fair_league into is_fair from public.department_challenges where id=p_challenge_id;
  select destination_challenge into destination from quantum_private.challenge_linked_recruitments where source_challenge=p_challenge_id;
  if is_fair and base->>'status'<>'recruiting' then
   base:=jsonb_set(base,'{teams}',(select coalesce(jsonb_agg(team.value||jsonb_build_object('may_request_roster',false) order by team.ordinality),'[]'::jsonb) from jsonb_array_elements(base->'teams') with ordinality team(value,ordinality)));
  end if;
  return base||jsonb_build_object('fair_league',is_fair,'can_accept_opponent',case when is_fair then false else (base->>'can_accept_opponent')::boolean end,'paired_challenge_id',destination);
end$$;
revoke all on function quantum_private.department_challenge_projection(uuid,uuid),quantum_private.department_challenge_projection_pre_league(uuid,uuid)from public,anon,authenticated,service_role;

-- Old public RPC must not let an arbitrary solo opponent reserve a fair team's
-- match and bypass the bilateral full-team proposal path hidden by the UI.
alter function public.accept_department_challenge_opponent(uuid,integer,uuid) set schema quantum_private;
alter function quantum_private.accept_department_challenge_opponent(uuid,integer,uuid) rename to accept_department_challenge_opponent_pre_league;
create function public.accept_department_challenge_opponent(p_challenge_id uuid,p_expected_revision integer,p_idempotency_key uuid)returns jsonb
language plpgsql security definer set search_path='' as $$begin
 perform quantum_private.challenge_assert_player(auth.uid());
 if exists(select 1 from public.department_challenges where id=p_challenge_id and fair_league)then raise exception 'fair_pairing_required';end if;
 return quantum_private.accept_department_challenge_opponent_pre_league(p_challenge_id,p_expected_revision,p_idempotency_key);
end$$;
revoke all on function quantum_private.accept_department_challenge_opponent_pre_league(uuid,integer,uuid),public.accept_department_challenge_opponent(uuid,integer,uuid)from public,anon,authenticated,service_role;
grant execute on function public.accept_department_challenge_opponent(uuid,integer,uuid)to authenticated;

revoke all on function quantum_private.challenge_skill_score(text),quantum_private.challenge_assert_player(uuid),quantum_private.challenge_team_ready(uuid),quantum_private.challenge_teams_compatible(uuid,uuid),quantum_private.challenge_guard_write(),quantum_private.challenge_capture_match() from public,anon,authenticated,service_role;
revoke all on function quantum_private.department_league_action(text,jsonb),quantum_private.department_league_moderate(text,jsonb),public.department_league_action(text,jsonb),public.department_league_moderate(text,jsonb)from public,anon,authenticated,service_role;
grant usage on schema quantum_private to authenticated;
grant execute on function quantum_private.department_league_action(text,jsonb),quantum_private.department_league_moderate(text,jsonb),public.department_league_action(text,jsonb),public.department_league_moderate(text,jsonb)to authenticated;
comment on table quantum_private.challenge_skill_profiles is 'User-declared recruitment preferences only. No Riot account verification, LP/MMR inference, or individual skill ranking.';
comment on table quantum_private.challenge_restrictions is 'Challenge-only 14/21-day restrictions issued by independently authenticated super-admin after review. Report counts never impose penalties.';
commit;
