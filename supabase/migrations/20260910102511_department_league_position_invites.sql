begin;

-- Slot invitations share the existing author/recipient consent ledger. Existing
-- invitations with no sport/slot remain legacy invitations and cannot use this RPC.
alter table public.department_challenge_friend_invites
 add column sport text check(sport in('lol','futsal','football')),
 add column slot_key text,
 add constraint department_challenge_invite_slot_check check(
  (sport is null and slot_key is null) or
  (sport is not null and slot_key is not null and quantum_private.challenge_slot_position(sport,slot_key) is not null));
create unique index department_challenge_one_pending_slot_invite
 on public.department_challenge_friend_invites(team_id,sport,slot_key)
 where status='pending' and slot_key is not null;
create table quantum_private.challenge_position_invite_requests(
 actor_id uuid not null references public.users(id) on delete cascade,
 idempotency_key uuid not null,request_hash text not null,
 invite_id uuid not null references public.department_challenge_friend_invites(id) on delete restrict,
 result jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,idempotency_key)
);
alter table quantum_private.challenge_position_invite_requests enable row level security;
revoke all on quantum_private.challenge_position_invite_requests from public,anon,authenticated,service_role;

-- Preserve every previously allowed notification kind, including future kinds
-- added by earlier migrations; this migration only widens that established check.
do $$declare rule text;begin
 select pg_get_expr(conbin,conrelid) into rule from pg_constraint
 where conrelid='public.notifications'::regclass and conname='notifications_kind_check';
 if rule is null then raise exception 'notifications_kind_contract_missing';end if;
 alter table public.notifications drop constraint notifications_kind_check;
 execute format('alter table public.notifications add constraint notifications_kind_check check ((%s) or kind = %L)',rule,'department_league_invite');
end$$;
create unique index notifications_department_league_invite_unique
 on public.notifications(user_id,(payload->>'invite_id')) where kind='department_league_invite';

create function quantum_private.challenge_position_invite_notification_state()returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.sport is not null and new.status is distinct from old.status then
  update public.notifications set payload=jsonb_set(payload,'{status}',to_jsonb(new.status)),
   read_at=case when new.status<>'pending' then coalesce(read_at,clock_timestamp())else read_at end
  where kind='department_league_invite' and user_id=new.invitee_user_id and payload->>'invite_id'=new.id::text;
 end if;return new;
end$$;
create trigger challenge_position_invite_notification_state after update of status
 on public.department_challenge_friend_invites for each row execute function quantum_private.challenge_position_invite_notification_state();

create function quantum_private.challenge_position_invites_invalidate()returns trigger
language plpgsql security definer set search_path='' as $$
declare v_challenge uuid;v_team uuid;v_slot text;begin
 if tg_table_name='challenge_journey_formats' then
  if tg_op='DELETE' or new.sport is distinct from old.sport then
   update public.department_challenge_friend_invites set status='cancelled',responded_at=clock_timestamp()
   where challenge_id=old.challenge_id and slot_key is not null and status='pending';
  end if;
 elsif tg_table_name='department_challenges' then
  if (new.status<>'recruiting' and new.status is distinct from old.status)
    or new.team_capacity is distinct from old.team_capacity or new.category is distinct from old.category then
   update public.department_challenge_friend_invites set status='cancelled',responded_at=clock_timestamp()
   where challenge_id=new.id and slot_key is not null and status='pending';
  end if;
 else
  if tg_table_name='department_challenge_roster' then
   if new.status<>'accepted' then return new;end if;
   select new.challenge_id,new.team_id,p.slot_key into v_challenge,v_team,v_slot
   from quantum_private.challenge_skill_profiles p where p.roster_id=new.id;
  else
   select r.challenge_id,r.team_id,new.slot_key into v_challenge,v_team,v_slot
   from public.department_challenge_roster r where r.id=new.roster_id and r.status='accepted';
  end if;
  if v_slot is not null then
   update public.department_challenge_friend_invites set status='cancelled',responded_at=clock_timestamp()
   where challenge_id=v_challenge and team_id=v_team and slot_key=v_slot and status='pending';
  end if;
 end if;
 if tg_op='DELETE'then return old;end if;return new;
end$$;
create trigger challenge_position_invites_format after update or delete on quantum_private.challenge_journey_formats
 for each row execute function quantum_private.challenge_position_invites_invalidate();
create trigger challenge_position_invites_challenge after update on public.department_challenges
 for each row execute function quantum_private.challenge_position_invites_invalidate();
create trigger challenge_position_invites_roster after insert or update on public.department_challenge_roster
 for each row execute function quantum_private.challenge_position_invites_invalidate();
create trigger challenge_position_invites_profile after insert or update on quantum_private.challenge_skill_profiles
 for each row execute function quantum_private.challenge_position_invites_invalidate();

create function quantum_private.challenge_position_friend_available(p_captain uuid,p_friend uuid,p_team uuid)returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.department_challenge_teams t join public.department_challenges c on c.id=t.challenge_id
  join auth.users a on a.id=p_friend and a.deleted_at is null and(a.banned_until is null or a.banned_until<=clock_timestamp())
  cross join lateral quantum_private.get_member_department_identity(p_friend)i
  where t.id=p_team and t.captain_user_id=p_captain and t.status='accepted' and c.status='recruiting'
  and i.school_scope_key=c.school_scope_key and i.department_key=t.department_key
  and quantum_private.is_active_accepted_friend_pair(p_captain,p_friend)
  and not quantum_private.account_deletion_blocks_access(p_friend)
  and not exists(select 1 from quantum_private.challenge_restrictions s where s.user_id=p_friend and s.revoked_at is null and s.ends_at>clock_timestamp())
  and not exists(select 1 from public.department_challenge_roster r where r.challenge_id=c.id and r.user_id=p_friend and r.status in('requested','accepted'))
  and not exists(select 1 from public.department_challenge_roster r where r.team_id=t.id and r.status='accepted' and quantum_private.tonight_invite_pair_is_blocked(r.user_id,p_friend))
  and not exists(select 1 from public.department_challenge_friend_invites x where x.challenge_id=c.id and x.invitee_user_id=p_friend and x.status='pending' and x.expires_at>clock_timestamp())
  and(select count(*) from public.department_challenge_roster r where r.team_id=t.id and r.status='accepted')<c.team_capacity
 )
$$;

create function quantum_private.challenge_position_invite_projection(p_invite uuid,p_actor uuid)returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'challenge_id',i.challenge_id,'team_id',i.team_id,'title',c.title,'department',t.department_label,
  'sport',i.sport,'slot',i.slot_key,'inviter_name',case when quantum_private.is_active_accepted_friend_pair(i.inviter_user_id,i.invitee_user_id)then coalesce(quantum_private.activity_meetup_alias(i.inviter_user_id),'친구')else '친구 정보 비공개'end,
  'invitee_name',case when quantum_private.is_active_accepted_friend_pair(i.inviter_user_id,i.invitee_user_id)then coalesce(quantum_private.activity_meetup_alias(i.invitee_user_id),'친구')else '친구 정보 비공개'end,
  'status',case when i.status='pending' and i.expires_at<=clock_timestamp()then 'expired'else i.status end,
  'expires_at',i.expires_at,'revision',c.revision,'is_recipient',i.invitee_user_id=p_actor,
  'can_cancel',i.inviter_user_id=p_actor and t.captain_user_id=p_actor and i.status='pending' and i.expires_at>clock_timestamp())
 from public.department_challenge_friend_invites i join public.department_challenges c on c.id=i.challenge_id
 join public.department_challenge_teams t on t.id=i.team_id
 where i.id=p_invite and p_actor in(i.inviter_user_id,i.invitee_user_id) and i.sport is not null
$$;

create function quantum_private.department_league_invites(p_action text,p_args jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();sport_key text;allowed text[];v_challenge uuid;v_team uuid;v_friend uuid;v_invite uuid;v_slot text;v_position text;
 low_user uuid;high_user uuid;command_key uuid;command_hash text;school_key text;dept_key text;other_school text;other_dept text;
 c public.department_challenges%rowtype;t public.department_challenge_teams%rowtype;i public.department_challenge_friend_invites%rowtype;
 r public.department_challenge_roster%rowtype;prior quantum_private.challenge_position_invite_requests%rowtype;
 candidates jsonb:='[]';incoming jsonb:='[]';sent jsonb:='[]';preview jsonb:=null;result jsonb;is_captain boolean:=false;
begin
 if actor is null then raise exception 'not_authenticated' using errcode='42501';end if;
 allowed:=case p_action
  when 'overview'then array['sport','challenge_id']
  when 'invite'then array['sport','challenge_id','team_id','friend_user_id','slot','expected_revision','idempotency_key']
  when 'accept'then array['sport','invite_id','tier','expected_revision','idempotency_key']
  when 'decline'then array['sport','invite_id','expected_revision','idempotency_key']
  when 'cancel'then array['sport','invite_id','expected_revision','idempotency_key']end;
 if allowed is null or jsonb_typeof(p_args)is distinct from'object' then raise exception 'invalid_invite_action';end if;
 if not(p_args ?& allowed)or(select count(*)from jsonb_object_keys(p_args))<>cardinality(allowed)then raise exception 'invalid_invite_action';end if;
 sport_key:=p_args->>'sport';
 if sport_key is null or sport_key not in('lol','futsal','football')then raise exception 'invalid_sport';end if;
 perform quantum_private.challenge_assert_player(actor);
 select d.school_scope_key,d.department_key into school_key,dept_key from quantum_private.get_member_department_identity(actor)d;
 if school_key is null or dept_key is null then raise exception 'department_identity_required';end if;

 if p_action='overview'then
  v_challenge:=(p_args->>'challenge_id')::uuid;
  -- Reading one's inbox resolves elapsed invitations without any remote delivery.
  -- This does not admit users or increment a recruitment's roster revision.
  update public.department_challenge_friend_invites set status='expired',responded_at=clock_timestamp()
  where actor in(inviter_user_id,invitee_user_id) and sport=sport_key and status='pending' and expires_at<=clock_timestamp();
  if v_challenge is not null then
   select * into c from public.department_challenges where id=v_challenge and school_scope_key=school_key;
   if c.id is null then raise exception 'department_challenge_not_found';end if;
   -- A terminal invitation remains readable as a receipt; its old format cannot
   -- grant access to a newly changed team's current formation.
   if quantum_private.challenge_journey_sport(c.id)is distinct from sport_key and not exists(
    select 1 from public.department_challenge_friend_invites x where x.challenge_id=c.id and x.sport=sport_key and actor in(x.inviter_user_id,x.invitee_user_id)
   )then raise exception 'invalid_sport';end if;
   select tm.* into t from public.department_challenge_teams tm where tm.challenge_id=c.id and tm.status='accepted' and(
    tm.captain_user_id=actor or exists(select 1 from public.department_challenge_roster me where me.team_id=tm.id and me.user_id=actor and me.status='accepted')
    or exists(select 1 from public.department_challenge_friend_invites x where x.team_id=tm.id and x.sport=sport_key and actor in(x.inviter_user_id,x.invitee_user_id)))
   order by(tm.captain_user_id=actor)desc,tm.id limit 1;
   if t.id is null then raise exception 'team_membership_required';end if;
   is_captain:=t.captain_user_id=actor and exists(select 1 from public.department_challenge_roster me where me.team_id=t.id and me.user_id=actor and me.status='accepted');
   if is_captain and t.department_key=dept_key and c.status='recruiting' then
    select coalesce(jsonb_agg(x.value order by x.value->>'display_name'),'[]')into candidates from(
     select jsonb_build_object('user_id',p.user_id,'display_name',coalesce(quantum_private.activity_meetup_alias(p.user_id),'친구'))value
     from (select case when f.user_id=actor then f.friend_user_id else f.user_id end user_id
      from public.friendships f where actor in(f.user_id,f.friend_user_id) and f.status='active')p
     where quantum_private.challenge_position_friend_available(actor,p.user_id,t.id)
     order by p.user_id limit 100)x;
   end if;
   if quantum_private.challenge_journey_sport(c.id)=sport_key and c.status<>'cancelled' and t.department_key=dept_key and(
    is_captain or exists(select 1 from public.department_challenge_roster me where me.team_id=t.id and me.user_id=actor and me.status='accepted')
    or exists(select 1 from public.department_challenge_friend_invites x where x.team_id=t.id and x.invitee_user_id=actor and x.sport=sport_key and x.status='pending' and x.expires_at>clock_timestamp()
     and t.captain_user_id=x.inviter_user_id and quantum_private.is_active_accepted_friend_pair(actor,x.inviter_user_id))
   )and not exists(select 1 from public.department_challenge_roster blocked where blocked.team_id=t.id and blocked.status='accepted' and quantum_private.tonight_invite_pair_is_blocked(actor,blocked.user_id))then
    select jsonb_build_object('challenge_id',c.id,'team_id',t.id,'title',c.title,'department',t.department_label,'capacity',c.team_capacity,
     'players',coalesce(jsonb_agg(jsonb_build_object('id',rr.id,'alias',coalesce(quantum_private.activity_meetup_alias(rr.user_id),'선수'),'status','accepted','is_me',rr.user_id=actor,
      'slot',coalesce(p.slot_key,case when sport_key='lol'then p.position end),'position',p.position,'tier',p.tier)order by rr.requested_at,rr.id)filter(where rr.id is not null),'[]'))into preview
    from public.department_challenge_roster rr join quantum_private.challenge_skill_profiles p on p.roster_id=rr.id where rr.team_id=t.id and rr.status='accepted';
   end if;
  end if;
  select coalesce(jsonb_agg(x.value),'[]')into incoming from(
   select quantum_private.challenge_position_invite_projection(inv.id,actor)value from public.department_challenge_friend_invites inv
   where inv.invitee_user_id=actor and inv.sport=sport_key and(v_challenge is null or inv.challenge_id=v_challenge)
   order by(inv.status='pending')desc,inv.created_at desc,inv.id limit 100)x;
  if v_challenge is not null then
   select coalesce(jsonb_agg(x.value),'[]')into sent from(
    select quantum_private.challenge_position_invite_projection(inv.id,actor)value from public.department_challenge_friend_invites inv
    where inv.inviter_user_id=actor and inv.sport=sport_key and inv.challenge_id=v_challenge
    order by(inv.status='pending')desc,inv.created_at desc,inv.id limit 100)x;
  end if;
  return jsonb_build_object('sport',sport_key,'challenge_id',v_challenge,'revision',c.revision,'candidates',candidates,'incoming',incoming,'sent',sent,'preview',preview);
 end if;

 if jsonb_typeof(p_args->'expected_revision')is distinct from'number' or (p_args->>'expected_revision')!~'^[0-9]+$'
  or(p_args->>'expected_revision')::numeric>2147483647 then raise exception 'invalid_revision';end if;
 command_key:=(p_args->>'idempotency_key')::uuid;if command_key is null then raise exception 'invalid_idempotency_key';end if;
 command_hash:=md5(p_action||':'||p_args::text);
 if p_action='invite'then
  v_challenge:=(p_args->>'challenge_id')::uuid;v_team:=(p_args->>'team_id')::uuid;v_friend:=(p_args->>'friend_user_id')::uuid;v_slot:=p_args->>'slot';
  if v_challenge is null or v_team is null or v_friend is null or v_friend=actor then raise exception 'invalid_friend_invite';end if;
  v_position:=quantum_private.challenge_slot_position(sport_key,v_slot);if v_position is null then raise exception 'invalid_slot';end if;
 else
  v_invite:=(p_args->>'invite_id')::uuid;
  select * into i from public.department_challenge_friend_invites where id=v_invite and sport is not null;
  if i.id is null or actor not in(i.inviter_user_id,i.invitee_user_id)then raise exception 'league_invite_not_found';end if;
  if p_action in('accept','decline') and actor<>i.invitee_user_id then raise exception 'league_invite_not_found';end if;
  if p_action='cancel' and actor<>i.inviter_user_id then raise exception 'captain_required';end if;
  v_challenge:=i.challenge_id;v_team:=i.team_id;v_friend:=case when actor=i.inviter_user_id then i.invitee_user_id else i.inviter_user_id end;
 end if;
 low_user:=least(actor,v_friend);high_user:=greatest(actor,v_friend);
 -- Match the existing identity/friendship lock protocol before serializing the
 -- challenge row. Recipient declarations, capacity and slots commit together.
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||low_user::text,0));
 perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||high_user::text,0));
 perform pg_advisory_xact_lock(hashtextextended('friend-pair|'||low_user::text||'|'||high_user::text,0));
 perform pg_advisory_xact_lock(hashtextextended('league-position-invite|'||actor::text||'|'||command_key::text,0));
 select * into c from public.department_challenges where id=v_challenge for update;
 select * into t from public.department_challenge_teams where id=v_team and challenge_id=c.id for update;
 if c.id is null or t.id is null or c.school_scope_key<>school_key then raise exception 'department_challenge_not_found';end if;
 select * into prior from quantum_private.challenge_position_invite_requests where actor_id=actor and idempotency_key=command_key;
 if prior.actor_id is not null then
  if prior.request_hash<>command_hash then raise exception 'idempotency_key_reused';end if;
  select * into i from public.department_challenge_friend_invites where id=prior.invite_id;
  return prior.result||jsonb_build_object('status',i.status,'revision',c.revision,'replayed',true);
 end if;
 if p_action<>'invite'then
  select * into i from public.department_challenge_friend_invites where id=v_invite for update;
  if i.sport<>sport_key then raise exception 'invalid_sport';end if;
  if i.status<>'pending'then raise exception 'league_invite_not_pending';end if;
  if i.expires_at<=clock_timestamp()then raise exception 'league_invite_expired_conflict';end if;
 end if;
 if c.revision<>(p_args->>'expected_revision')::integer then raise exception 'stale_revision';end if;
 if c.status<>'recruiting' or t.status<>'accepted'then raise exception 'department_challenge_closed';end if;
 if quantum_private.challenge_journey_sport(c.id)is distinct from sport_key then raise exception 'invalid_sport';end if;
 if p_action in('invite','cancel')then
  if t.captain_user_id<>actor or not exists(select 1 from public.department_challenge_roster me where me.team_id=t.id and me.user_id=actor and me.status='accepted')then raise exception 'captain_required';end if;
 elsif t.captain_user_id<>i.inviter_user_id then raise exception 'captain_changed_conflict';end if;

 if p_action in('invite','accept')then
  perform quantum_private.challenge_assert_player(actor);
  perform quantum_private.challenge_assert_player(v_friend);
  select d.school_scope_key,d.department_key into school_key,dept_key from quantum_private.get_member_department_identity(actor)d;
  select d.school_scope_key,d.department_key into other_school,other_dept from quantum_private.get_member_department_identity(v_friend)d;
  if school_key is null or dept_key is null or other_school is null or other_dept is null then raise exception 'department_identity_required';end if;
  if school_key<>c.school_scope_key or other_school<>c.school_scope_key then raise exception 'wrong_school';end if;
  if dept_key<>t.department_key or other_dept<>t.department_key then raise exception 'department_restricted';end if;
  perform 1 from public.friendships f join public.friend_requests q on q.id=f.created_from_request_id
   where f.user_id=low_user and f.friend_user_id=high_user and f.status='active' and q.status='accepted'
    and least(q.sender_user_id,q.receiver_user_id)=low_user and greatest(q.sender_user_id,q.receiver_user_id)=high_user and q.receiver_user_id is not null for update of f;
  if not found then raise exception 'active_friendship_required';end if;
  if exists(select 1 from public.department_challenge_roster member where member.team_id=t.id and member.status='accepted'
   and quantum_private.tonight_invite_pair_is_blocked(case when p_action='invite'then v_friend else actor end,member.user_id))then raise exception 'challenge_blocked_forbidden';end if;
  if(select count(*)from public.department_challenge_roster member where member.team_id=t.id and member.status='accepted')>=c.team_capacity then raise exception 'department_challenge_team_full';end if;
  if p_action='accept'then v_slot:=i.slot_key;v_position:=quantum_private.challenge_slot_position(sport_key,v_slot);end if;
  if exists(select 1 from public.department_challenge_roster member join quantum_private.challenge_skill_profiles profile on profile.roster_id=member.id
   where member.team_id=t.id and member.status='accepted' and coalesce(profile.slot_key,case when sport_key='lol'then profile.position end)=v_slot)then raise exception 'slot_occupied_conflict';end if;
 end if;

 if p_action='invite'then
  if exists(select 1 from public.department_challenge_roster member where member.challenge_id=c.id and member.user_id=v_friend and member.status in('requested','accepted'))then raise exception 'already_on_challenge';end if;
  update public.department_challenge_friend_invites set status='expired',responded_at=clock_timestamp()
   where challenge_id=c.id and status='pending' and expires_at<=clock_timestamp();
  if exists(select 1 from public.department_challenge_friend_invites x where x.challenge_id=c.id and x.invitee_user_id=v_friend and x.status='pending')then raise exception 'already_invited';end if;
  if exists(select 1 from public.department_challenge_friend_invites x where x.team_id=t.id and x.sport=sport_key and x.slot_key=v_slot and x.status='pending')then raise exception 'slot_invite_pending_conflict';end if;
  insert into public.department_challenge_friend_invites(challenge_id,team_id,inviter_user_id,invitee_user_id,create_idempotency_key,request_hash,resulting_revision,sport,slot_key)
   values(c.id,t.id,actor,v_friend,command_key,command_hash,c.revision+1,sport_key,v_slot)returning * into i;
  insert into public.notifications(user_id,kind,payload)values(v_friend,'department_league_invite',jsonb_build_object(
   'invite_id',i.id,'challenge_id',c.id,'team_id',t.id,'sport',sport_key,'slot',v_slot,'title',c.title,
   'inviter_display_name',coalesce(quantum_private.activity_meetup_alias(actor),'친구'),'status','pending','expires_at',i.expires_at,
   'href','/meetups/league?sport='||sport_key||'&invite='||i.id::text||'&challenge='||c.id::text));
 elsif p_action='accept'then
  if p_args->>'tier' is null or(sport_key='lol'and p_args->>'tier'not in('iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger'))
   or(sport_key<>'lol'and p_args->>'tier'not in('beginner','intermediate','advanced'))then raise exception 'invalid_tier';end if;
  if exists(select 1 from public.department_challenge_roster member where member.challenge_id=c.id and member.user_id=actor and member.status in('requested','accepted'))then raise exception 'already_on_challenge';end if;
  -- Stage the recipient's declaration while still requested, so the existing
  -- accepted-slot guard validates the final admission. No captain re-approval.
  insert into public.department_challenge_roster(challenge_id,team_id,user_id,status,department_key_snapshot)
   values(c.id,t.id,actor,'requested',dept_key)
   on conflict(challenge_id,user_id)do update set team_id=excluded.team_id,status='requested',department_key_snapshot=excluded.department_key_snapshot,
    revision=public.department_challenge_roster.revision+1,requested_at=clock_timestamp(),accepted_at=null,left_at=null
   where public.department_challenge_roster.status in('declined','left')returning * into r;
  if r.id is null then raise exception 'already_on_challenge';end if;
  insert into quantum_private.challenge_skill_profiles(roster_id,position,tier,slot_key)values(r.id,v_position,p_args->>'tier',v_slot)
   on conflict(roster_id)do update set position=excluded.position,tier=excluded.tier,slot_key=excluded.slot_key,self_reported_at=clock_timestamp();
  update public.department_challenge_friend_invites set status='accepted',responded_at=clock_timestamp(),decision_idempotency_key=command_key,resulting_revision=c.revision+1 where id=i.id returning * into i;
  update public.department_challenge_roster set status='accepted',accepted_at=clock_timestamp(),revision=revision+1 where id=r.id;
 else
  update public.department_challenge_friend_invites set status=case when p_action='decline'then 'declined'else 'cancelled'end,
   responded_at=clock_timestamp(),resulting_revision=c.revision+1 where id=i.id returning * into i;
 end if;
 update public.department_challenges set revision=revision+1,updated_at=clock_timestamp()where id=c.id returning * into c;
 result:=jsonb_build_object('id',i.id,'challenge_id',c.id,'team_id',t.id,'slot',i.slot_key,'status',i.status,'revision',c.revision,'replayed',false);
 insert into quantum_private.challenge_position_invite_requests(actor_id,idempotency_key,request_hash,invite_id,result)values(actor,command_key,command_hash,i.id,result);
 return result;
end$$;

-- The older endpoint has no recipient skill fields. Preserve its original
-- implementation privately, and expose it only for invitations that were never
-- slot-specific. This also covers inferred LoL teams without a journey format.
alter function public.accept_my_department_challenge_invite(uuid,integer,uuid)
 rename to accept_department_challenge_legacy_invite;
alter function public.accept_department_challenge_legacy_invite(uuid,integer,uuid)
 set schema quantum_private;
revoke all on function quantum_private.accept_department_challenge_legacy_invite(uuid,integer,uuid)
 from public,anon,authenticated,service_role;

create function public.accept_my_department_challenge_invite(p_invite_id uuid,p_expected_revision integer,p_idempotency_key uuid)returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501';end if;
 if exists(select 1 from public.department_challenge_friend_invites
  where id=p_invite_id and invitee_user_id=auth.uid() and(sport is not null or slot_key is not null))then
  raise exception 'position_invite_profile_required';
 end if;
 return quantum_private.accept_department_challenge_legacy_invite(p_invite_id,p_expected_revision,p_idempotency_key);
end$$;
revoke all on function public.accept_my_department_challenge_invite(uuid,integer,uuid)from public,anon,authenticated,service_role;
grant execute on function public.accept_my_department_challenge_invite(uuid,integer,uuid)to authenticated;

create function public.department_league_invites(p_action text,p_args jsonb)returns jsonb
language sql security definer set search_path='' as $$select quantum_private.department_league_invites(p_action,p_args)$$;
revoke all on function quantum_private.challenge_position_invite_notification_state(),quantum_private.challenge_position_invites_invalidate(),
 quantum_private.challenge_position_friend_available(uuid,uuid,uuid),quantum_private.challenge_position_invite_projection(uuid,uuid),
 quantum_private.department_league_invites(text,jsonb),public.department_league_invites(text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.department_league_invites(text,jsonb)to authenticated;

comment on function public.department_league_invites(text,jsonb)is 'Member-authored exact-slot invites. Recipient self-declares skill and accepts atomically; notifications are in-app only, never browser push delivery.';
notify pgrst,'reload schema';
commit;
