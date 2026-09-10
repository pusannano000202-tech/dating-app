begin;

-- Explicit bilateral matches own an immutable admission roster. Leaving or an
-- account restriction removes access; browsing and proposals never admit users.
create table quantum_private.challenge_match_chat_members(
 challenge_id uuid not null references public.department_challenges(id) on delete cascade,
 roster_id uuid not null references public.department_challenge_roster(id) on delete cascade,
 team_id uuid not null references public.department_challenge_teams(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 alias text not null,primary key(challenge_id,user_id)
);
create table quantum_private.challenge_match_chat_messages(
 id uuid primary key default gen_random_uuid(),
 challenge_id uuid not null references public.department_challenges(id) on delete cascade,
 sender_id uuid not null references public.users(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp()
);
create index challenge_match_chat_page_idx on quantum_private.challenge_match_chat_messages(challenge_id,created_at desc,id desc);
create table quantum_private.challenge_lobby_requests(
 actor_id uuid not null references public.users(id) on delete cascade,idempotency_key uuid not null,
 request_hash text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,idempotency_key)
);
create table quantum_private.challenge_captain_transfers(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.department_challenge_teams(id) on delete cascade,
 from_user_id uuid not null references public.users(id) on delete cascade,
 to_roster_id uuid not null references public.department_challenge_roster(id) on delete cascade,
 expected_revision integer not null,
 status text not null default 'pending' check(status in('pending','accepted','declined','cancelled')),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '24 hours',responded_at timestamptz
);
create unique index challenge_one_pending_captain_transfer on quantum_private.challenge_captain_transfers(team_id)where status='pending';
do $$declare name text;begin
 foreach name in array array['challenge_match_chat_members','challenge_match_chat_messages','challenge_lobby_requests','challenge_captain_transfers']loop
  execute format('alter table quantum_private.%I enable row level security',name);
  execute format('revoke all on quantum_private.%I from public,anon,authenticated,service_role',name);
 end loop;
end$$;

create function quantum_private.challenge_lobby_capture_members()returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.status='opponent_pending' and old.status='recruiting' and exists(select 1 from quantum_private.challenge_linked_recruitments where destination_challenge=new.id)then
  insert into quantum_private.challenge_match_chat_members(challenge_id,roster_id,team_id,user_id,alias)
  select new.id,r.id,r.team_id,r.user_id,t.department_label||' 선수 '||row_number()over(partition by r.team_id order by r.requested_at,r.id)
  from public.department_challenge_roster r join public.department_challenge_teams t on t.id=r.team_id
  where r.challenge_id=new.id and r.status='accepted' and t.status='accepted'
  on conflict do nothing;
 end if;return new;
end$$;
create trigger challenge_lobby_capture_members after update on public.department_challenges for each row execute function quantum_private.challenge_lobby_capture_members();

-- Admit existing explicitly accepted pairs, never unaccepted opponent candidates.
insert into quantum_private.challenge_match_chat_members(challenge_id,roster_id,team_id,user_id,alias)
select c.id,r.id,r.team_id,r.user_id,t.department_label||' 선수 '||row_number()over(partition by r.team_id order by r.requested_at,r.id)
from public.department_challenges c join public.department_challenge_roster r on r.challenge_id=c.id
join public.department_challenge_teams t on t.id=r.team_id
where c.status in('opponent_pending','scheduled','result_pending','completed')and r.status='accepted' and t.status='accepted'
and exists(select 1 from quantum_private.challenge_linked_recruitments where destination_challenge=c.id)
on conflict do nothing;

create function quantum_private.challenge_match_chat_access(p_challenge uuid,p_actor uuid,p_write boolean)returns boolean
language plpgsql security definer set search_path='' as $$declare c public.department_challenges%rowtype;begin
 perform quantum_private.challenge_assert_player(p_actor);
 select * into c from public.department_challenges where id=p_challenge;
 if c.id is null or c.status='cancelled' or(p_write and c.status='completed')or not exists(
  select 1 from quantum_private.challenge_match_chat_members m join public.department_challenge_roster r on r.id=m.roster_id
  where m.challenge_id=p_challenge and m.user_id=p_actor and r.challenge_id=p_challenge and r.team_id=m.team_id and r.user_id=p_actor and r.status='accepted'
 )then raise exception 'match_chat_membership_required';end if;
 if not exists(select 1 from quantum_private.get_member_department_identity(p_actor)i where i.school_scope_key=c.school_scope_key)then raise exception 'match_chat_forbidden';end if;
 if exists(select 1 from quantum_private.challenge_match_chat_members m where m.challenge_id=p_challenge and quantum_private.tonight_invite_pair_is_blocked(p_actor,m.user_id))then raise exception 'match_chat_forbidden';end if;
 return true;
end$$;

create function quantum_private.challenge_lobby_captain_guard()returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.captain_user_id is distinct from old.captain_user_id then
  if not exists(select 1 from public.department_challenge_roster r where r.team_id=new.id and r.challenge_id=new.challenge_id and r.user_id=new.captain_user_id and r.status='accepted')then raise exception 'captain_membership_required';end if;
  update quantum_private.challenge_team_preferences set waiting=false where team_id=new.id;
  delete from quantum_private.challenge_pair_proposals where from_team=new.id or to_team=new.id;
  -- Friend invitations belong to their author. Never impersonate the new
  -- captain or admit invitees when transferring; release stale invitations
  -- so the new captain can send fresh invitations with recipient consent.
  update public.department_challenge_friend_invites set status='cancelled',responded_at=clock_timestamp()
  where team_id=new.id and inviter_user_id=old.captain_user_id and status='pending';
 end if;return new;
end$$;
create trigger challenge_lobby_captain_guard before update on public.department_challenge_teams for each row execute function quantum_private.challenge_lobby_captain_guard();

create function quantum_private.department_league_lobby(p_action text,p_args jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();school_key text;dept_key text;sport text;keys text[];v_team_id uuid;opponent_id uuid;cursor_id uuid;v_challenge_id uuid;
 t public.department_challenge_teams%rowtype;o public.department_challenge_teams%rowtype;c public.department_challenges%rowtype;r public.department_challenge_roster%rowtype;
 transfer quantum_private.challenge_captain_transfers%rowtype;prior quantum_private.challenge_lobby_requests%rowtype;
 key uuid;hash text;response jsonb;rows jsonb;pending jsonb;all_count integer;next_id uuid;message_id uuid;message_body text;before_time timestamptz;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 perform quantum_private.assert_activity_room_access(actor);
 if p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>12000 then raise exception 'invalid_lobby_input';end if;
 keys:=case p_action
 when 'overview'then array['sport','team_id','cursor']
 when 'propose'then array['team_id','opponent_team_id','idempotency_key']
 when 'accept'then array['team_id','opponent_team_id','idempotency_key']
 when 'proposal_cancel'then array['team_id','opponent_team_id','idempotency_key']
 when 'proposal_decline'then array['team_id','opponent_team_id','idempotency_key']
 when 'transfer_propose'then array['team_id','recipient_roster_id','expected_revision','idempotency_key']
 when 'transfer_respond'then array['transfer_id','accept','idempotency_key']
 when 'transfer_cancel'then array['transfer_id','idempotency_key']
 when 'chat_read'then array['challenge_id','before']
 when 'chat_send'then array['challenge_id','body','idempotency_key']end;
 if keys is null or not(p_args ?& keys)or(p_args-keys)<>'{}'::jsonb then raise exception 'invalid_lobby_action';end if;
 select i.school_scope_key,i.department_key into school_key,dept_key from quantum_private.get_member_department_identity(actor)i;
 if school_key is null or dept_key is null then raise exception 'department_identity_required';end if;
 v_team_id:=(p_args->>'team_id')::uuid;opponent_id:=(p_args->>'opponent_team_id')::uuid;
 if p_action='overview'then
  sport:=p_args->>'sport';cursor_id:=(p_args->>'cursor')::uuid;
  if sport is null or sport not in('lol','futsal','football')then raise exception 'invalid_sport';end if;
  if v_team_id is not null then
   select tm.* into t from public.department_challenge_teams tm join public.department_challenges ch on ch.id=tm.challenge_id
   where tm.id=v_team_id and ch.school_scope_key=school_key and quantum_private.challenge_journey_sport(ch.id)=sport
   and exists(select 1 from public.department_challenge_roster me where me.team_id=tm.id and me.user_id=actor and me.status='accepted');
   if t.id is null then raise exception 'team_membership_required';end if;
  end if;
  with eligible as(
   select tm.*,ch.title,ch.team_capacity,coalesce(pref.allowed_gap,200)gap
   from public.department_challenge_teams tm join public.department_challenges ch on ch.id=tm.challenge_id
   join quantum_private.challenge_team_preferences pref on pref.team_id=tm.id and pref.waiting
   where ch.school_scope_key=school_key and quantum_private.challenge_journey_sport(ch.id)=sport and ch.status='recruiting'
   and tm.side='challenger' and tm.status='accepted' and quantum_private.challenge_team_ready(tm.id)
   and not exists(select 1 from public.department_challenge_roster other where other.team_id=tm.id and other.status='accepted' and quantum_private.tonight_invite_pair_is_blocked(actor,other.user_id))
  ),page as(select * from eligible where cursor_id is null or id>cursor_id order by id limit 101),display as(select * from page order by id limit 100)
  select(select count(*)from eligible),
  coalesce((select jsonb_agg(jsonb_build_object(
   'team_id',tm.id,'challenge_id',tm.challenge_id,'title',tm.title,'department',tm.department_label,'capacity',tm.team_capacity,'accepted_count',tm.team_capacity,
   'score_sum',(select sum(quantum_private.challenge_skill_score(p.tier))from public.department_challenge_roster rr join quantum_private.challenge_skill_profiles p on p.roster_id=rr.id where rr.team_id=tm.id and rr.status='accepted'),
   'compatibility_score',(select round(avg(quantum_private.challenge_skill_score(p.tier))*.7+max(quantum_private.challenge_skill_score(p.tier))*.3)from public.department_challenge_roster rr join quantum_private.challenge_skill_profiles p on p.roster_id=rr.id where rr.team_id=tm.id and rr.status='accepted'),
   'gap',tm.gap,'is_mine',exists(select 1 from public.department_challenge_roster me where me.team_id=tm.id and me.user_id=actor and me.status='accepted'),'is_captain',tm.captain_user_id=actor,
   'can_propose',coalesce(t.id is not null and t.id<>tm.id and t.challenge_id<>tm.challenge_id and t.department_key<>tm.department_key and t.captain_user_id=actor and exists(select 1 from eligible own where own.id=t.id)and quantum_private.challenge_teams_compatible(t.id,tm.id),false),
   'incoming',exists(select 1 from quantum_private.challenge_pair_proposals pp where pp.from_team=tm.id and pp.to_team=t.id),
   'outgoing',exists(select 1 from quantum_private.challenge_pair_proposals pp where pp.from_team=t.id and pp.to_team=tm.id),
   'players',(select jsonb_agg(jsonb_build_object('roster_id',rr.id,'alias',tm.department_label||' 선수 '||rr.number,'slot',coalesce(p.slot_key,case when sport='lol'then p.position end),'position',p.position,'tier',p.tier,'score',quantum_private.challenge_skill_score(p.tier),'is_captain',rr.user_id=tm.captain_user_id,'is_me',rr.user_id=actor)order by rr.number)
    from(select roster.*,row_number()over(order by roster.requested_at,roster.id)number from public.department_challenge_roster roster where roster.team_id=tm.id and roster.status='accepted')rr join quantum_private.challenge_skill_profiles p on p.roster_id=rr.id)
  )order by tm.id)from display tm),'[]'::jsonb),case when(select count(*)from page)>100 then(select id from display order by id desc limit 1)end into all_count,rows,next_id;
  select coalesce(jsonb_agg(value),'[]'::jsonb)into pending from(
   select jsonb_build_object('id',x.id,'team_id',x.team_id,'from_alias',quantum_private.activity_meetup_alias(x.from_user_id),'to_alias',quantum_private.activity_meetup_alias(recipient.user_id),'to_roster_id',x.to_roster_id,'is_recipient',recipient.user_id=actor,'can_cancel',x.from_user_id=actor,'expires_at',x.expires_at)value
   from quantum_private.challenge_captain_transfers x join public.department_challenge_teams tm on tm.id=x.team_id join public.department_challenges ch on ch.id=tm.challenge_id join public.department_challenge_roster recipient on recipient.id=x.to_roster_id
   where x.status='pending'and x.expires_at>clock_timestamp()and ch.status not in('completed','cancelled')and ch.school_scope_key=school_key and quantum_private.challenge_journey_sport(ch.id)=sport
   and x.expected_revision=ch.revision and tm.captain_user_id=x.from_user_id and recipient.status='accepted'
   and exists(select 1 from public.department_challenge_roster me where me.team_id=tm.id and me.user_id=actor and me.status='accepted')
   order by x.created_at desc limit 50
  )visible;
  return jsonb_build_object('sport',sport,'total_count',all_count,'teams',rows,'next_cursor',next_id,'transfers',pending);
 end if;
 perform quantum_private.challenge_assert_player(actor);
 -- Same ordering as the existing manual pairing engine; no background allocation.
 if p_action<>'chat_read'then perform pg_advisory_xact_lock(hashtextextended('quantum:challenge-league:'||school_key,0));end if;
 if p_action in('chat_read','chat_send')then
  v_challenge_id:=(p_args->>'challenge_id')::uuid;
  if p_action='chat_send'then perform 1 from public.department_challenges where id=v_challenge_id for update;end if;
  perform quantum_private.challenge_match_chat_access(v_challenge_id,actor,p_action='chat_send');
  if p_action='chat_read'then
   cursor_id:=(p_args->>'before')::uuid;
   if cursor_id is not null then select created_at into before_time from quantum_private.challenge_match_chat_messages where id=cursor_id and challenge_match_chat_messages.challenge_id=v_challenge_id;if before_time is null then raise exception 'invalid_cursor';end if;end if;
   with page as(select m.* from quantum_private.challenge_match_chat_messages m where m.challenge_id=v_challenge_id and(cursor_id is null or(m.created_at,m.id)<(before_time,cursor_id))order by m.created_at desc,m.id desc limit 51),display as(select * from page order by created_at desc,id desc limit 50)
   select coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'alias',member.alias,'is_me',m.sender_id=actor,'created_at',m.created_at)order by m.created_at,m.id)from display m join quantum_private.challenge_match_chat_members member on member.challenge_id=m.challenge_id and member.user_id=m.sender_id),'[]'::jsonb),(select count(*)from page),case when(select count(*)from page)>50 then(select id from display order by created_at,id limit 1)end into rows,all_count,next_id;
   return jsonb_build_object('challenge_id',v_challenge_id,'messages',rows,'has_more',all_count>50,'next_cursor',next_id,'writable',(select status<>'completed'from public.department_challenges where id=v_challenge_id));
  end if;
 end if;
 key:=(p_args->>'idempotency_key')::uuid;if key is null then raise exception 'invalid_idempotency_key';end if;
 hash:=md5(p_action||':'||(p_args-'idempotency_key')::text);
 select * into prior from quantum_private.challenge_lobby_requests where actor_id=actor and idempotency_key=key;
 if prior.actor_id is not null then if prior.request_hash<>hash then raise exception 'idempotency_key_reused';end if;return prior.result;end if;
 if p_action='chat_send'then
  message_body:=btrim(p_args->>'body');
  if jsonb_typeof(p_args->'body')<>'string'or message_body is null or char_length(message_body)not between 1 and 2000 or message_body~'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'then raise exception 'invalid_message';end if;
  insert into quantum_private.challenge_match_chat_messages(challenge_id,sender_id,body)values(v_challenge_id,actor,message_body)returning id into message_id;
  select jsonb_build_object('id',m.id,'body',m.body,'alias',member.alias,'is_me',true,'created_at',m.created_at)into response from quantum_private.challenge_match_chat_messages m join quantum_private.challenge_match_chat_members member on member.challenge_id=m.challenge_id and member.user_id=m.sender_id where m.id=message_id;
 elsif p_action in('propose','accept')then
  response:=quantum_private.department_league_action(p_action,jsonb_build_object('team_id',v_team_id,'opponent_team_id',opponent_id));
 elsif p_action in('proposal_cancel','proposal_decline','transfer_propose')then
  select * into t from public.department_challenge_teams where id=v_team_id;
  select * into c from public.department_challenges where id=t.challenge_id for update;
  if t.id is null or c.school_scope_key<>school_key or t.captain_user_id<>actor or not exists(select 1 from public.department_challenge_roster me where me.team_id=t.id and me.user_id=actor and me.status='accepted')then raise exception 'captain_required';end if;
  if c.status in('completed','cancelled')then raise exception 'challenge_closed';end if;
  if p_action in('proposal_cancel','proposal_decline')then
   delete from quantum_private.challenge_pair_proposals pp where pp.from_team=case when p_action='proposal_cancel'then v_team_id else opponent_id end and pp.to_team=case when p_action='proposal_cancel'then opponent_id else v_team_id end;
   response:=jsonb_build_object('saved',true);
  else
   if jsonb_typeof(p_args->'expected_revision')<>'number'or c.revision is distinct from(p_args->>'expected_revision')::integer then raise exception 'stale_revision';end if;
   select * into r from public.department_challenge_roster where id=(p_args->>'recipient_roster_id')::uuid and department_challenge_roster.team_id=t.id and status='accepted' and user_id<>actor;
   if r.id is null then raise exception 'recipient_membership_required';end if;
   perform quantum_private.challenge_assert_player(r.user_id);
   update quantum_private.challenge_captain_transfers set status='cancelled',responded_at=clock_timestamp()where challenge_captain_transfers.team_id=t.id and status='pending';
   insert into quantum_private.challenge_captain_transfers(team_id,from_user_id,to_roster_id,expected_revision)values(t.id,actor,r.id,c.revision)returning id into message_id;
   response:=jsonb_build_object('transfer_id',message_id,'status','pending');
  end if;
 elsif p_action in('transfer_respond','transfer_cancel')then
  select * into transfer from quantum_private.challenge_captain_transfers where id=(p_args->>'transfer_id')::uuid for update;
  select * into t from public.department_challenge_teams where id=transfer.team_id;
  select * into c from public.department_challenges where id=t.challenge_id for update;
  select * into r from public.department_challenge_roster where id=transfer.to_roster_id;
  if transfer.id is null or c.school_scope_key<>school_key then raise exception 'transfer_not_found';end if;
  if transfer.status<>'pending'or transfer.expires_at<=clock_timestamp()then raise exception 'transfer_not_pending';end if;
  if t.captain_user_id<>transfer.from_user_id or c.revision<>transfer.expected_revision then raise exception 'stale_revision';end if;
  if c.status in('completed','cancelled')then raise exception 'challenge_closed';end if;
  if p_action='transfer_cancel'then
   if actor<>transfer.from_user_id then raise exception 'captain_required';end if;
   update quantum_private.challenge_captain_transfers set status='cancelled',responded_at=clock_timestamp()where id=transfer.id;
   response:=jsonb_build_object('saved',true);
  else
   if jsonb_typeof(p_args->'accept')<>'boolean'then raise exception 'invalid_consent';end if;
   if r.user_id<>actor or r.status<>'accepted'or r.team_id<>t.id or r.challenge_id<>c.id then raise exception 'recipient_membership_required';end if;
   if(p_args->>'accept')::boolean then
    if not exists(select 1 from quantum_private.get_member_department_identity(actor)i where i.school_scope_key=c.school_scope_key and i.department_key=t.department_key)then raise exception 'department_identity_changed';end if;
    update public.department_challenge_teams set captain_user_id=actor where id=t.id;
    -- Existing confirmed schedule remains the team's plan. Pending confirmations
    -- require the current captains' fresh agreement; revision rejects stale clicks.
    if c.status='opponent_pending'then delete from public.department_challenge_schedule_confirmations where department_challenge_schedule_confirmations.challenge_id=c.id;end if;
    if c.status='result_pending'then delete from public.department_challenge_result_confirmations where department_challenge_result_confirmations.challenge_id=c.id;end if;
    update public.department_challenges set revision=revision+1,status=case when status='result_pending'then 'scheduled'else status end where id=c.id;
   end if;
   update quantum_private.challenge_captain_transfers set status=case when(p_args->>'accept')::boolean then 'accepted'else 'declined'end,responded_at=clock_timestamp()where id=transfer.id;
   response:=jsonb_build_object('status',case when(p_args->>'accept')::boolean then 'accepted'else 'declined'end,'team_id',t.id,'revision',(select revision from public.department_challenges where id=c.id));
  end if;
 else raise exception 'invalid_lobby_action';end if;
 insert into quantum_private.challenge_lobby_requests(actor_id,idempotency_key,request_hash,result)values(actor,key,hash,response);
 return response;
end$$;

create function public.department_league_lobby(p_action text,p_args jsonb)returns jsonb
language sql security invoker set search_path='' as $$select quantum_private.department_league_lobby(p_action,p_args)$$;
revoke all on function quantum_private.challenge_lobby_capture_members(),quantum_private.challenge_match_chat_access(uuid,uuid,boolean),quantum_private.challenge_lobby_captain_guard(),quantum_private.department_league_lobby(text,jsonb),public.department_league_lobby(text,jsonb)from public,anon,authenticated,service_role;
grant execute on function quantum_private.department_league_lobby(text,jsonb),public.department_league_lobby(text,jsonb)to authenticated;

-- Existing member-authored polls share the paired challenge's access boundary.
-- Preserve every other room's resolver and pre-match team polls unchanged.
do $install$begin
 if to_regprocedure('quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean)')is not null then
  alter function quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean)rename to resolve_chat_poll_room_pre_lobby;
  execute $ddl$create function quantum_private.resolve_chat_poll_room(p_room_kind text,p_room_ref_id uuid,p_actor uuid,p_require_writable boolean)returns uuid
  language plpgsql security definer set search_path='' as $fn$begin
   if p_room_kind='department_challenge'and exists(select 1 from quantum_private.challenge_match_chat_members where challenge_id=p_room_ref_id)then perform quantum_private.challenge_match_chat_access(p_room_ref_id,p_actor,p_require_writable);end if;
   return quantum_private.resolve_chat_poll_room_pre_lobby(p_room_kind,p_room_ref_id,p_actor,p_require_writable);
  end$fn$$ddl$;
  revoke all on function quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean),quantum_private.resolve_chat_poll_room_pre_lobby(text,uuid,uuid,boolean)from public,anon,authenticated,service_role;
 end if;
end$install$;
commit;
