begin;

-- Forward-only extension. Existing categories, matches and operator moderation remain intact.
create table quantum_private.challenge_journey_formats(
 challenge_id uuid primary key references public.department_challenges(id) on delete cascade,
 sport text not null check(sport in('lol','futsal','football'))
);
create table quantum_private.challenge_journey_requests(
 actor_id uuid not null references public.users(id) on delete cascade,
 idempotency_key uuid not null,request_hash text not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,idempotency_key)
);
alter table quantum_private.challenge_journey_formats enable row level security;
alter table quantum_private.challenge_journey_requests enable row level security;
revoke all on quantum_private.challenge_journey_formats,quantum_private.challenge_journey_requests from public,anon,authenticated,service_role;
alter table quantum_private.challenge_skill_profiles add column slot_key text;
alter table quantum_private.challenge_match_players add column slot_key text;

create function quantum_private.challenge_slot_position(p_sport text,p_slot text)returns text
language sql immutable set search_path='' as $$
 select case
 when p_sport='lol' and p_slot in('top','jungle','mid','adc','support')then p_slot
 when p_sport in('futsal','football') and p_slot='gk'then 'goalkeeper'
 when p_sport='futsal' and p_slot in('ld','rd')then 'defender'
 when p_sport='futsal' and p_slot in('lm','rm')then 'midfielder'
 when p_sport='futsal' and p_slot='st'then 'forward'
 when p_sport='football' and p_slot in('lb','lcb','rcb','rb')then 'defender'
 when p_sport='football' and p_slot in('lcm','cm','rcm')then 'midfielder'
 when p_sport='football' and p_slot in('lw','st','rw')then 'forward' end
$$;
create function quantum_private.challenge_journey_sport(p_challenge uuid)returns text
language sql stable security definer set search_path='' as $$
 select coalesce(f.sport,case when c.category='gaming' and c.team_capacity=5 then 'lol' when c.category='soccer' and c.team_capacity=6 then 'futsal' when c.category='soccer' and c.team_capacity=11 then 'football' end)
 from public.department_challenges c left join quantum_private.challenge_journey_formats f on f.challenge_id=c.id where c.id=p_challenge
$$;
create function quantum_private.challenge_journey_slot_guard()returns trigger
language plpgsql security definer set search_path='' as $$
declare roster public.department_challenge_roster%rowtype;profile quantum_private.challenge_skill_profiles%rowtype;sport text;begin
 if tg_table_name='challenge_skill_profiles' then
  select * into roster from public.department_challenge_roster where id=new.roster_id;
  profile:=new;
 else
  if new.status<>'accepted' or(tg_op='UPDATE' and old.status='accepted')then return new;end if;
  roster:=new;select * into profile from quantum_private.challenge_skill_profiles where roster_id=new.id;
 end if;
 select f.sport into sport from quantum_private.challenge_journey_formats f where f.challenge_id=roster.challenge_id;
 if sport is null then return new;end if;
 perform 1 from public.department_challenges where id=roster.challenge_id for update;
 if tg_table_name='challenge_skill_profiles' and profile.slot_key is null then return new;end if;
 if profile.slot_key is null or quantum_private.challenge_slot_position(sport,profile.slot_key) is distinct from profile.position then raise exception 'invalid_slot_profile';end if;
 if exists(select 1 from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=roster.team_id and r.id<>roster.id and r.status='accepted' and p.slot_key=profile.slot_key)then raise exception 'slot_occupied';end if;
 if tg_table_name='challenge_skill_profiles' then
  update quantum_private.challenge_team_preferences set waiting=false where team_id=roster.team_id;
  delete from quantum_private.challenge_pair_proposals where from_team=roster.team_id or to_team=roster.team_id;
 end if;
 return new;
end$$;
create trigger challenge_journey_profile_guard before insert or update on quantum_private.challenge_skill_profiles for each row execute function quantum_private.challenge_journey_slot_guard();
create trigger challenge_journey_roster_guard before insert or update on public.department_challenge_roster for each row execute function quantum_private.challenge_journey_slot_guard();

alter function quantum_private.challenge_team_ready(uuid)rename to challenge_team_ready_pre_journey;
create function quantum_private.challenge_team_ready(p_team uuid)returns boolean
language plpgsql stable security definer set search_path='' as $$
declare sport text;capacity integer;begin
 if not quantum_private.challenge_team_ready_pre_journey(p_team)then return false;end if;
 select quantum_private.challenge_journey_sport(c.id),c.team_capacity into sport,capacity from public.department_challenge_teams t join public.department_challenges c on c.id=t.challenge_id where t.id=p_team;
 if sport is null then return true;end if;
 -- Inferred legacy 6/11-player teams must declare their exact pitch slots too.
 -- LoL's old unique position is already an exact slot, unlike broad soccer roles.
 return(select count(distinct coalesce(p.slot_key,case when sport='lol'then p.position end))=capacity and bool_and(quantum_private.challenge_slot_position(sport,coalesce(p.slot_key,case when sport='lol'then p.position end))=p.position)
 from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=p_team and r.status='accepted');
end$$;
create function quantum_private.challenge_journey_capture()returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.status='scheduled' and old.status<>'scheduled' then
  update quantum_private.challenge_match_players snapshot set slot_key=coalesce(profile.slot_key,case when new.category='gaming' then profile.position end)
  from public.department_challenge_roster roster join quantum_private.challenge_skill_profiles profile on profile.roster_id=roster.id
  where snapshot.challenge_id=new.id and roster.challenge_id=new.id and snapshot.team_id=roster.team_id and snapshot.user_id=roster.user_id;
 end if;return new;
end$$;
create trigger challenge_journey_capture after update on public.department_challenges for each row execute function quantum_private.challenge_journey_capture();

create function quantum_private.challenge_journey_records(p_school text,p_sport text,p_monthly boolean)returns jsonb
language sql stable security definer set search_path='' as $$
 with confirmed as(
  select ta.department_label a_department,tb.department_label b_department,ch.first_score a_score,ch.second_score b_score
  from public.department_challenges ch join public.department_challenge_teams ta on ta.challenge_id=ch.id and ta.side='challenger' join public.department_challenge_teams tb on tb.challenge_id=ch.id and tb.side='opponent'
  join public.department_challenge_result_confirmations ca on ca.challenge_id=ch.id and ca.team_id=ta.id join public.department_challenge_result_confirmations cb on cb.challenge_id=ch.id and cb.team_id=tb.id
  where ch.school_scope_key=p_school and quantum_private.challenge_journey_sport(ch.id)=p_sport and ch.status='completed'
  and ca.own_score=cb.opponent_score and ca.opponent_score=cb.own_score and ca.own_score=ch.first_score and cb.own_score=ch.second_score
  and(not p_monthly or(greatest(ca.confirmed_at,cb.confirmed_at)>=date_trunc('month',now()at time zone 'Asia/Seoul')at time zone 'Asia/Seoul' and greatest(ca.confirmed_at,cb.confirmed_at)<(date_trunc('month',now()at time zone 'Asia/Seoul')+interval '1 month')at time zone 'Asia/Seoul'))
 ),results as(select a_department department,a_score own,b_score other from confirmed union all select b_department,b_score,a_score from confirmed),totals as(
  select department,count(*)played,count(*)filter(where own>other)wins,count(*)filter(where own<other)losses,count(*)filter(where own=other)draws from results group by department
 )select coalesce(jsonb_agg(to_jsonb(totals)order by department),'[]'::jsonb)from totals
$$;

create function quantum_private.department_league_journey(p_action text,p_args jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();sport text:=p_args->>'sport';school_key text;dept_key text;dept_label text;capacity integer;position text;
 c public.department_challenges%rowtype;t public.department_challenge_teams%rowtype;roster public.department_challenge_roster%rowtype;
 response jsonb;rows jsonb;teams jsonb;players jsonb;challenge_rows jsonb:='[]'::jsonb;existing quantum_private.challenge_journey_requests%rowtype;key uuid;hash text;target_id uuid;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 perform quantum_private.assert_activity_room_access(actor);
 if p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>6000 then raise exception 'invalid_journey_input';end if;
 select i.school_scope_key,i.department_key into school_key,dept_key from quantum_private.get_member_department_identity(actor)i;
 if school_key is null or dept_key is null then raise exception 'department_identity_required';end if;
 select btrim(department)into dept_label from quantum_private.community_member_profiles where user_id=actor;
 if p_action='report_targets' then
  rows:=quantum_private.department_league_action('report_targets',p_args);
  return(select coalesce(jsonb_agg(item.value||jsonb_build_object('slot',snapshot.slot_key)),'[]'::jsonb)from jsonb_array_elements(rows)item(value)join quantum_private.challenge_match_players snapshot on snapshot.id=(item.value->>'id')::uuid);
 end if;
 if sport is null or sport not in('lol','futsal','football')then raise exception 'invalid_sport';end if;
 capacity:=case sport when 'lol'then 5 when 'futsal'then 6 else 11 end;
 if p_action='overview' then
  for c in select ch.* from public.department_challenges ch where ch.school_scope_key=school_key and quantum_private.challenge_journey_sport(ch.id)=sport and ch.status<>'cancelled'
   and not exists(select 1 from public.department_challenge_roster blocked where blocked.challenge_id=ch.id and blocked.status='accepted' and quantum_private.tonight_invite_pair_is_blocked(actor,blocked.user_id))
   order by ch.created_at desc,ch.id limit 50 loop
   teams:='[]'::jsonb;
   for t in select * from public.department_challenge_teams where challenge_id=c.id and status='accepted' order by side loop
    select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'alias',quantum_private.activity_meetup_alias(r.user_id),'status',r.status,'is_me',r.user_id=actor,'slot',coalesce(p.slot_key,case when sport='lol'then p.position end),'position',p.position,'tier',p.tier)order by r.requested_at,r.id),'[]'::jsonb)into players
    from public.department_challenge_roster r left join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=t.id and(r.status='accepted'or r.status='requested'and(r.user_id=actor or t.captain_user_id=actor));
    teams:=teams||jsonb_build_array(jsonb_build_object('id',t.id,'department',t.department_label,'is_mine',exists(select 1 from public.department_challenge_roster r where r.team_id=t.id and r.user_id=actor and r.status in('accepted','requested')),'is_captain',t.captain_user_id=actor,
     'may_join',c.status='recruiting'and t.department_key=dept_key and(select count(*)from public.department_challenge_roster r where r.team_id=t.id and r.status='accepted')<capacity and not exists(select 1 from public.department_challenge_roster r where r.challenge_id=c.id and r.user_id=actor and r.status in('accepted','requested')),
     'ready',quantum_private.challenge_team_ready(t.id),'waiting',coalesce((select waiting from quantum_private.challenge_team_preferences where team_id=t.id),false),'gap',coalesce((select allowed_gap from quantum_private.challenge_team_preferences where team_id=t.id),200),
     'score',case when quantum_private.challenge_team_ready(t.id)then(select round(avg(quantum_private.challenge_skill_score(p.tier))*.7+max(quantum_private.challenge_skill_score(p.tier))*.3)from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=t.id and r.status='accepted')end,'players',players));
   end loop;
   challenge_rows:=challenge_rows||jsonb_build_array(jsonb_build_object('id',c.id,'title',c.title,'status',c.status,'revision',c.revision,'scheduled_at',c.scheduled_at,'ends_at',c.ends_at,'place_name',c.place_name,'teams',teams,
    'schedule_proposals',case when exists(select 1 from public.department_challenge_roster participant where participant.challenge_id=c.id and participant.user_id=actor and participant.status='accepted')then
     (select coalesce(jsonb_agg(jsonb_build_object('team_id',proposal.team_id,'is_mine',exists(select 1 from public.department_challenge_roster participant where participant.team_id=proposal.team_id and participant.user_id=actor and participant.status='accepted'),'scheduled_at',proposal.scheduled_at,'ends_at',proposal.ends_at,'place_name',proposal.place_name)order by proposal.confirmed_at),'[]'::jsonb)from public.department_challenge_schedule_confirmations proposal where proposal.challenge_id=c.id)
     else '[]'::jsonb end,
    'result',case when c.status='completed'then jsonb_build_object('first_score',c.first_score,'second_score',c.second_score)end));
  end loop;
  return jsonb_build_object('sport',sport,'my_department',dept_label,'month',to_char(now()at time zone 'Asia/Seoul','YYYY-MM'),'standings',quantum_private.challenge_journey_records(school_key,sport,false),'monthly_standings',quantum_private.challenge_journey_records(school_key,sport,true),'challenges',challenge_rows);
 end if;
 if p_action not in('create','join','profile')then raise exception 'invalid_journey_action';end if;
 perform quantum_private.challenge_assert_player(actor);
 position:=quantum_private.challenge_slot_position(sport,p_args->>'slot');
 if position is null or p_args->>'tier' is null or(sport='lol'and p_args->>'tier'not in('iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger'))or(sport<>'lol'and p_args->>'tier'not in('beginner','intermediate','advanced'))then raise exception 'invalid_slot_profile';end if;
 key:=(p_args->>'idempotency_key')::uuid;if key is null then raise exception 'invalid_idempotency_key';end if;
 hash:=md5(p_action||':'||p_args::text);
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||actor::text,0));
 select * into existing from quantum_private.challenge_journey_requests where actor_id=actor and idempotency_key=key;
 if existing.actor_id is not null then if existing.request_hash<>hash then raise exception 'idempotency_key_reused';end if;return existing.result;end if;
 if p_action='create' then
  response:=public.create_department_challenge(case when sport='lol'then 'gaming'else 'soccer'end,p_args->>'title','',capacity,key);
  select * into c from public.department_challenges where id=(response->>'id')::uuid for update;
  select * into t from public.department_challenge_teams where challenge_id=c.id and captain_user_id=actor;
 else
  select * into c from public.department_challenges where id=(p_args->>'challenge_id')::uuid for update;
  select * into t from public.department_challenge_teams where id=(p_args->>'team_id')::uuid and challenge_id=c.id;
  if c.id is null or t.id is null or c.school_scope_key<>school_key or t.department_key<>dept_key then raise exception 'team_membership_required';end if;
  if quantum_private.challenge_journey_sport(c.id) is distinct from sport then raise exception 'invalid_sport';end if;
  if c.revision is distinct from(p_args->>'expected_revision')::integer then raise exception 'stale_revision';end if;
  if c.status<>'recruiting'then raise exception 'fair_roster_locked_conflict';end if;
  if p_action='join' then response:=public.request_department_challenge_roster(c.id,t.id,c.revision,key);end if;
 end if;
 select * into roster from public.department_challenge_roster where team_id=t.id and user_id=actor and status=case when p_action='join'then 'requested'else 'accepted'end;
 if roster.id is null then raise exception 'team_membership_required';end if;
 insert into quantum_private.challenge_journey_formats(challenge_id,sport)values(c.id,sport)on conflict(challenge_id)do nothing;
 insert into quantum_private.challenge_skill_profiles(roster_id,position,tier,slot_key)values(roster.id,position,p_args->>'tier',p_args->>'slot')
 on conflict(roster_id)do update set position=excluded.position,tier=excluded.tier,slot_key=excluded.slot_key,self_reported_at=clock_timestamp();
 if p_action='profile'then update public.department_challenges set revision=revision+1 where id=c.id;end if;
 response:=jsonb_build_object('challenge_id',c.id,'team_id',t.id,'roster_id',roster.id,'revision',(select revision from public.department_challenges where id=c.id));
 insert into quantum_private.challenge_journey_requests(actor_id,idempotency_key,request_hash,result)values(actor,key,hash,response);
 return response;
end$$;
create function public.department_league_journey(p_action text,p_args jsonb)returns jsonb
language sql security invoker set search_path='' as $$select quantum_private.department_league_journey(p_action,p_args)$$;
revoke all on function quantum_private.challenge_slot_position(text,text),quantum_private.challenge_journey_sport(uuid),quantum_private.challenge_journey_slot_guard(),quantum_private.challenge_team_ready_pre_journey(uuid),quantum_private.challenge_team_ready(uuid),quantum_private.challenge_journey_capture(),quantum_private.challenge_journey_records(text,text,boolean),quantum_private.department_league_journey(text,jsonb),public.department_league_journey(text,jsonb)from public,anon,authenticated,service_role;
grant execute on function quantum_private.department_league_journey(text,jsonb),public.department_league_journey(text,jsonb)to authenticated;
comment on table quantum_private.challenge_journey_formats is 'Explicit LoL 5, futsal 6 and football 11 positional recruitment. Existing legacy formats are preserved.';
commit;
