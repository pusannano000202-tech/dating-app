-- Forward-only league policy: membership in one team does not end discovery.
-- No existing candidate is republished, no financial state changes, no RLS grants.
-- New publication remains gated by candidate_deposit_publication_guard.
begin;

-- Do not use "most recent team" as evidence for a particular team's membership.
create function quantum_private.candidate_room_member(k text,q text,u uuid,r uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when k='league'then exists(
  select 1 from public.department_challenge_roster m
  join public.department_challenges c on c.id=m.challenge_id
  where m.team_id=r and m.user_id=u and m.status='accepted'
   and c.status in('recruiting','opponent_pending','scheduled')
   and quantum_private.challenge_journey_sport(c.id)=q
   and quantum_private.league_team_chat_access(m.team_id,u))
 else coalesce(quantum_private.candidate_scope_member(k,q,u)=r,false)end
$$;

-- Same-team duplicates and joining the opposing side of the same challenge stay
-- forbidden. Independent teams from other challenges are not a conflict.
create function quantum_private.candidate_target_available(k text,q text,u uuid,r uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when k='league'then not exists(
  select 1 from public.department_challenge_roster m
  join public.department_challenge_teams target on target.id=r
  where m.challenge_id=target.challenge_id and m.user_id=u
   and m.status in('requested','accepted'))
 else quantum_private.candidate_scope_member(k,q,u)is null end
$$;

create or replace function quantum_private.candidate_row(cid uuid,viewer uuid)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c quantum_private.meetup_candidates%rowtype;state text;next_link text:=null;begin
 select *into c from quantum_private.meetup_candidates where id=cid;if c.id is null then return null;end if;
 state:=quantum_private.candidate_state(cid);
 if c.owner_id=viewer and state='joined'and quantum_private.candidate_room_member(c.scope_kind,c.scope_key,c.owner_id,c.last_room_id) then next_link:=quantum_private.candidate_chat_href(c.scope_kind,c.last_room_id);
 elsif c.owner_id=viewer and state='joining'then select quantum_private.candidate_apply_href(c.scope_kind,i.room_id,i.slot)into next_link from quantum_private.candidate_board_invites i where i.candidate_id=cid and i.status='joining'and i.joining_until>clock_timestamp()and quantum_private.candidate_invite_current(i.id,viewer)limit 1;end if;
 return jsonb_build_object('id',c.id,'alias',coalesce(quantum_private.activity_meetup_alias(c.owner_id),'합류 후보'),'positions',c.positions,'tier',c.tier,'intro',c.intro,'availability',c.availability,'status',state,'revision',c.revision,'is_me',c.owner_id=viewer,'joining_until',case when state='joining'then c.joining_until end,'next_href',next_link);
end$$;

create or replace function quantum_private.candidate_invite_current(iid uuid,viewer uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare i quantum_private.candidate_board_invites%rowtype;c quantum_private.meetup_candidates%rowtype;t jsonb;
begin
 select *into i from quantum_private.candidate_board_invites where id=iid;
 select *into c from quantum_private.meetup_candidates where id=i.candidate_id;
 if i.id is null or viewer not in(i.sender_id,c.owner_id)or not quantum_private.candidate_current(c.id,viewer)then return false;end if;
 if i.status='joined'then return quantum_private.candidate_room_member(c.scope_kind,c.scope_key,c.owner_id,i.room_id)
  and(c.scope_kind<>'league'or quantum_private.league_team_chat_access(i.room_id,viewer));end if;
 if c.status not in('waiting','joining')or not quantum_private.candidate_target_available(c.scope_kind,c.scope_key,c.owner_id,i.room_id)then return false;end if;
 t:=quantum_private.candidate_room(c.scope_kind,c.scope_key,i.room_id,c.owner_id);
 return t is not null and(t->>'host_user_id')::uuid=i.sender_id and(i.slot is null or t->'slots'?i.slot);
end$$;

create or replace function quantum_private.candidate_invite_row(iid uuid,viewer uuid)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare i quantum_private.candidate_board_invites%rowtype;c quantum_private.meetup_candidates%rowtype;t jsonb;state text;link text;begin
 select *into i from quantum_private.candidate_board_invites where id=iid;select *into c from quantum_private.meetup_candidates where id=i.candidate_id;
 if i.id is null or viewer not in(i.sender_id,c.owner_id)then return null;end if;
 state:=case when not quantum_private.candidate_invite_current(iid,viewer)then 'unavailable'when i.status='joining'and i.joining_until<=clock_timestamp()then 'pending'else i.status end;
 if state='joined'and c.scope_kind='league'then
  -- Authorized membership, not an open recruiting slot, controls joined-room identity.
  if quantum_private.candidate_room_member(c.scope_kind,c.scope_key,c.owner_id,i.room_id)
   and quantum_private.league_team_chat_access(i.room_id,viewer)then
   select jsonb_build_object('title',team_name)into t from public.department_challenge_teams where id=i.room_id;
  else state:='unavailable';end if;
 elsif state<>'unavailable'then t:=quantum_private.candidate_room(c.scope_kind,c.scope_key,i.room_id,viewer);end if;
 if c.owner_id=viewer and state='joining'then link:=quantum_private.candidate_apply_href(c.scope_kind,i.room_id,i.slot);
 elsif c.owner_id=viewer and state='joined'then link:=quantum_private.candidate_chat_href(c.scope_kind,i.room_id);end if;
 return jsonb_build_object('id',i.id,'candidate_id',c.id,'candidate_alias',case when state='unavailable'then '합류 후보'else coalesce(quantum_private.activity_meetup_alias(c.owner_id),'합류 후보')end,
 'room_id',i.room_id,'room_title',coalesce(t->>'title','참가 제안'),'slot',i.slot,'status',state,'revision',i.revision,'is_sender',i.sender_id=viewer,
 'joining_until',case when state='joining'then i.joining_until end,'next_href',link,'checkout_enabled',false);
end$$;

create or replace function quantum_private.meetup_candidate_board(p_action text,p_args jsonb)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();k text:=p_args->>'scope_kind';q text:=p_args->>'scope_key';allowed text[];ident record;
 c quantum_private.meetup_candidates%rowtype;i quantum_private.candidate_board_invites%rowtype;prior quantum_private.candidate_board_requests%rowtype;
cid uuid;iid uuid;v_room_id uuid;key uuid;hash text;person uuid;other uuid;role_value text;t jsonb;positions_value text[];expected integer;result_status text:='updated';next_link text:=null;begin
 if actor is null then raise exception 'not_authenticated';end if;
 if p_args is null or jsonb_typeof(p_args)<>'object'or octet_length(p_args::text)>4096 or not quantum_private.candidate_scope_valid(k,q)then raise exception 'invalid_candidate_scope';end if;
 allowed:=array['scope_kind','scope_key']||case p_action when 'overview'then array['filter','cursor']when 'register'then array['positions','tier','intro','availability','consent','expected_revision','idempotency_key']when 'cancel'then array['expected_revision','idempotency_key']when 'invite'then array['candidate_id','candidate_revision','room_id','room_revision','slot','idempotency_key']when 'accept'then array['invite_id','expected_revision','idempotency_key']when 'decline'then array['invite_id','expected_revision','idempotency_key']when 'release'then array['invite_id','expected_revision','idempotency_key']end;
 if allowed is null or not(p_args?&allowed)or(select count(*)from jsonb_object_keys(p_args))<>cardinality(allowed)then raise exception 'invalid_candidate_action';end if;
 if not quantum_private.candidate_person_current(actor)then raise exception 'candidate_account_unavailable';end if;
 select *into ident from quantum_private.get_member_department_identity(actor);if ident.school_scope_key is null then raise exception 'department_identity_required';end if;
 if p_action='overview'then
  if p_args->>'filter'<>'all'and not(p_args->>'filter'=any(quantum_private.candidate_positions(k,q)))then raise exception 'invalid_candidate_filter';end if;
  return quantum_private.candidate_board_projection(k,q,actor,p_args->>'filter',(p_args->>'cursor')::uuid);
 end if;
 key:=(p_args->>'idempotency_key')::uuid;if key is null then raise exception 'invalid_idempotency_key';end if;hash:=md5(p_action||':'||p_args::text);
 if p_action='invite'then cid:=(p_args->>'candidate_id')::uuid;select owner_id into other from quantum_private.meetup_candidates where id=cid;v_room_id:=(p_args->>'room_id')::uuid;
 elsif p_action in('accept','decline','release')then iid:=(p_args->>'invite_id')::uuid;select *into i from quantum_private.candidate_board_invites where id=iid;cid:=i.candidate_id;other:=i.sender_id;v_room_id:=i.room_id;
 else select id into cid from quantum_private.meetup_candidates where owner_id=actor and scope_kind=k and scope_key=q;end if;
 -- Same global->ordered-user->room->candidate ordering as native membership.
 if k='mentoring'then perform quantum_private.native_admission_global_lock(k);end if;
 for person in select distinct x from(select unnest(array[actor,other])x
  union select user_id from quantum_private.study_room_members where k='study'and room_id=v_room_id and left_at is null
  union select user_id from quantum_private.group_mentoring_members where k='mentoring'and session_id=v_room_id and left_at is null
  union select user_id from public.department_challenge_roster where k='league'and team_id=v_room_id and status='accepted'
  union select user_id from public.activity_meetup_members where k='meetup'and meetup_id=v_room_id and status='joined')people where x is not null order by x loop perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||person::text,0));end loop;
 perform pg_advisory_xact_lock(hashtextextended('candidate-request:'||actor::text||':'||key::text,0));
 if v_room_id is not null then
  if k='league'then perform 1 from public.department_challenges ch join public.department_challenge_teams tm on tm.challenge_id=ch.id where tm.id=v_room_id for update of ch,tm;
  elsif k='study'then perform quantum_private.native_admission_room_lock(k,v_room_id);
  elsif k='mentoring'then perform quantum_private.hosted_mentoring_lock(v_room_id,actor);
  else perform 1 from public.activity_meetups where id=v_room_id for update;end if;
 end if;
 -- A parallel first registration can have committed while this actor lock waited.
 -- Re-read its identity under that lock before evaluating the expected revision.
 if p_action in('register','cancel')then select id into cid from quantum_private.meetup_candidates where owner_id=actor and scope_kind=k and scope_key=q;end if;
 select *into c from quantum_private.meetup_candidates where id=cid for update;
 if iid is not null then select *into i from quantum_private.candidate_board_invites where id=iid for update;end if;
 if not quantum_private.candidate_person_current(actor)then raise exception 'candidate_account_unavailable';end if;
 select *into ident from quantum_private.get_member_department_identity(actor);if ident.school_scope_key is null then raise exception 'department_identity_required';end if;
 select *into prior from quantum_private.candidate_board_requests where actor_id=actor and idempotency_key=key;
 if prior.actor_id is not null then
  if prior.request_hash<>hash then raise exception 'idempotency_key_reused';end if;
  if prior.result_status='joining'and prior.invite_id is not null and quantum_private.candidate_invite_current(prior.invite_id,actor)then
   select quantum_private.candidate_apply_href(k,x.room_id,x.slot)into next_link from quantum_private.candidate_board_invites x where x.id=prior.invite_id and x.status='joining'and x.joining_until>clock_timestamp();end if;
  return quantum_private.candidate_board_projection(k,q,actor,'all',null,jsonb_build_object('status',case when next_link is not null then 'joining'when prior.result_status='preparation_required'then prior.result_status else 'updated'end,'next_href',next_link,'checkout_enabled',false));
 end if;
 if c.id is not null and(c.scope_kind<>k or c.scope_key<>q)then raise exception 'candidate_not_found';end if;
 if p_action='register'then
  if c.id is null and p_args->'expected_revision'<>'null'::jsonb or c.id is not null and(p_args->>'expected_revision')::integer is distinct from c.revision then raise exception 'stale_revision';end if;
  if k<>'league'and quantum_private.candidate_scope_member(k,q,actor)is not null then raise exception 'candidate_already_joined';end if;
  if c.status='joining'and c.joining_until>clock_timestamp()then raise exception 'candidate_joining';end if;
  if jsonb_typeof(p_args->'positions')<>'array'or jsonb_array_length(p_args->'positions')>5 then raise exception 'invalid_candidate_positions';end if;
  select array_agg(x),count(distinct x)into positions_value,expected from jsonb_array_elements_text(p_args->'positions')x;
  positions_value:=coalesce(positions_value,'{}');
  if cardinality(positions_value)<>expected or not positions_value<@quantum_private.candidate_positions(k,q)or(cardinality(quantum_private.candidate_positions(k,q))=0)<>(cardinality(positions_value)=0)then raise exception 'invalid_candidate_positions';end if;
  if(k='league'and not coalesce(p_args->>'tier'=any(case q when 'lol'then array['iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger']else array['beginner','intermediate','advanced']end),false))or(k<>'league'and p_args->'tier'<>'null'::jsonb)then raise exception 'invalid_candidate_tier';end if;
  if p_args->'consent'<>'true'::jsonb or jsonb_typeof(p_args->'intro')<>'string'or char_length(p_args->>'intro')>200 or jsonb_typeof(p_args->'availability')<>'string'or char_length(btrim(p_args->>'availability'))not between 1 and 100 or ((p_args->>'intro')||(p_args->>'availability'))~U&'[[:cntrl:]\007F-\009F\200B-\200F\2028-\202E\2060-\206F\FEFF]'then raise exception 'invalid_candidate_registration';end if;
  insert into quantum_private.meetup_candidates(owner_id,scope_kind,scope_key,school_key,department_key,positions,tier,intro,availability)
  values(actor,k,q,ident.school_scope_key,case when k<>'meetup'then ident.department_key end,positions_value,p_args->>'tier',btrim(p_args->>'intro'),btrim(p_args->>'availability'))
  on conflict(owner_id,scope_kind,scope_key)do update set school_key=excluded.school_key,department_key=excluded.department_key,positions=excluded.positions,tier=excluded.tier,intro=excluded.intro,availability=excluded.availability,status='waiting',joining_until=null,last_room_id=null,revision=meetup_candidates.revision+1,updated_at=clock_timestamp()returning *into c;
  -- Editing a league introduction/availability must not withdraw compatible offers.
  -- Football positions are broad roles, whereas invitations carry exact pitch slots.
  update quantum_private.candidate_board_invites set status='cancelled',revision=revision+1,joining_until=null
  where candidate_id=c.id and status in('pending','joining')
   and(k<>'league'or not coalesce(quantum_private.challenge_slot_position(q,slot)=any(positions_value),false));
 elsif p_action='cancel'then
  if c.id is null or c.owner_id<>actor then raise exception 'candidate_not_found';end if;
  if c.revision is distinct from(p_args->>'expected_revision')::integer then raise exception 'stale_revision';end if;
  update quantum_private.meetup_candidates set status='cancelled',joining_until=null,revision=revision+1,updated_at=clock_timestamp()where id=c.id;
  update quantum_private.candidate_board_invites set status='cancelled',revision=revision+1,joining_until=null where candidate_id=c.id and status in('pending','joining');
 elsif p_action='invite'then
  if c.id is null or c.owner_id=actor or not quantum_private.candidate_current(c.id,actor)or quantum_private.candidate_state(c.id)<>'waiting'or not quantum_private.candidate_target_available(k,q,c.owner_id,v_room_id)then raise exception 'candidate_not_available';end if;
  if c.revision is distinct from(p_args->>'candidate_revision')::integer then raise exception 'stale_revision';end if;
  t:=quantum_private.candidate_room(k,q,v_room_id,c.owner_id);
  if t is null or(t->>'host_user_id')::uuid<>actor then raise exception 'candidate_host_required';end if;
  if(t->>'revision')::integer is distinct from(p_args->>'room_revision')::integer then raise exception 'stale_revision';end if;
  role_value:=case when k='league'then quantum_private.challenge_slot_position(q,p_args->>'slot')when k='mentoring'then p_args->>'slot'end;
  if k in('league','mentoring')then
   if role_value is null or not(role_value=any(c.positions))or not(t->'slots'?(p_args->>'slot'))then raise exception 'candidate_slot_unavailable';end if;
  elsif p_args->'slot'<>'null'::jsonb then raise exception 'invalid_candidate_slot';end if;
  if exists(select 1 from quantum_private.candidate_board_invites x where x.candidate_id=c.id and x.room_id=v_room_id and coalesce(x.slot,'')=coalesce(p_args->>'slot','')and x.status in('pending','joining'))then raise exception 'candidate_already_invited';end if;
  if(select count(*)from quantum_private.candidate_board_invites where sender_id=actor and created_at>clock_timestamp()-interval '1 hour')>=30 then raise exception 'candidate_rate_limited';end if;
  insert into quantum_private.candidate_board_invites(candidate_id,sender_id,room_id,slot)values(c.id,actor,v_room_id,p_args->>'slot')returning *into i;iid:=i.id;
  perform quantum_private.emit_candidate_board_notification(iid,'invitation_received',c.owner_id);
 else
  if i.id is null or c.owner_id<>actor then raise exception 'candidate_invite_not_found';end if;
  if i.revision is distinct from(p_args->>'expected_revision')::integer then raise exception 'stale_revision';end if;
  if p_action='accept'then
   if i.status not in('pending','joining')or not quantum_private.candidate_invite_current(iid,actor)then raise exception 'candidate_invite_unavailable';end if;
   if c.status='joining'and c.joining_until>clock_timestamp()and not(i.status='joining'and i.joining_until=c.joining_until)then raise exception 'candidate_joining';end if;
   if k='league'then result_status:='preparation_required';
   else
    update quantum_private.candidate_board_invites set status='pending',revision=revision+1,joining_until=null where candidate_id=c.id and status='joining';
    update quantum_private.candidate_board_invites set status='joining',revision=revision+1,joining_until=clock_timestamp()+interval '15 minutes'where id=iid returning *into i;
    update quantum_private.meetup_candidates set status='joining',joining_until=i.joining_until,revision=revision+1,updated_at=clock_timestamp()where id=c.id;
    result_status:='joining';next_link:=quantum_private.candidate_apply_href(k,i.room_id,i.slot);
   end if;
  elsif p_action='decline'then
   if i.status not in('pending','joining')then raise exception 'candidate_invite_unavailable';end if;
   update quantum_private.candidate_board_invites set status='declined',revision=revision+1,joining_until=null where id=iid;
   if i.status='joining'and c.joining_until=i.joining_until then update quantum_private.meetup_candidates set status='waiting',joining_until=null,revision=revision+1,updated_at=clock_timestamp()where id=c.id;end if;
   perform quantum_private.emit_candidate_board_notification(iid,'invitation_declined',i.sender_id);
  else
   if i.status<>'joining'then raise exception 'candidate_invite_unavailable';end if;
   update quantum_private.candidate_board_invites set status='pending',revision=revision+1,joining_until=null where id=iid;
   if c.status='joining'and c.joining_until=i.joining_until then update quantum_private.meetup_candidates set status='waiting',joining_until=null,revision=revision+1,updated_at=clock_timestamp()where id=c.id;end if;
  end if;
 end if;
 insert into quantum_private.candidate_board_requests(actor_id,idempotency_key,request_hash,invite_id,result_status)values(actor,key,hash,iid,result_status);
 return quantum_private.candidate_board_projection(k,q,actor,'all',null,jsonb_build_object('status',result_status,'next_href',next_link,'checkout_enabled',false));
end$$;

create or replace function quantum_private.emit_candidate_join_result(cid uuid,recipient uuid,ev text) returns void
language plpgsql security definer set search_path='' as $$
declare c quantum_private.meetup_candidates%rowtype;nid uuid:=gen_random_uuid();room_name text;heading text;copy text;begin
 select *into c from quantum_private.meetup_candidates where id=cid;
 if c.id is null or c.last_room_id is null or not(c.status='joined'or(c.scope_kind='league'and c.status='waiting'and ev='candidate_joined'and quantum_private.candidate_room_member(c.scope_kind,c.scope_key,c.owner_id,c.last_room_id)))
  or not quantum_private.candidate_current(c.id,recipient)then return;end if;
 if ev='candidate_joined'then
  if recipient<>c.owner_id then return;end if;
  if c.scope_kind='league'then select team_name into room_name from public.department_challenge_teams where id=c.last_room_id;
  elsif c.scope_kind='study'then select title into room_name from quantum_private.study_rooms where id=c.last_room_id;
  elsif c.scope_kind='mentoring'then select title into room_name from quantum_private.group_mentoring_sessions where id=c.last_room_id;
  else select title into room_name from public.activity_meetups where id=c.last_room_id;end if;
  room_name:=left(btrim(regexp_replace(coalesce(room_name,''),'[[:cntrl:]'||chr(173)||chr(847)||chr(1564)||chr(6158)||chr(8203)||'-'||chr(8207)||chr(8232)||'-'||chr(8238)||chr(8288)||'-'||chr(8303)||chr(65279)||']','','g')),80);
  if room_name=''or room_name~*'(https?://|www[.]|[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|instagram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)'
   or regexp_replace(room_name,'[^0-9]','','g')~'[0-9]{7,}'then room_name:='선택한 모임';end if;
  heading:='합류가 확정됐어요';copy:=room_name||case when c.scope_kind='league'then '에 합류했어요. 합류 대기와 다른 팀의 제안은 유지돼요.'else '에 합류했어요. 다른 참가 제안은 종료됐어요.'end;
 elsif ev='candidate_recruitment_closed'then
  if recipient=c.owner_id then return;end if;
  heading:='초대한 사람의 모집이 종료됐어요';copy:='초대한 사람의 모집이 종료됐어요. 다른 대기자를 찾아보세요.';
 else return;end if;
 insert into quantum_private.candidate_join_notification_sources(notification_id,candidate_id,join_revision,recipient_id,event,joined_room_id,scope_kind,scope_key)
 values(nid,c.id,c.revision,recipient,ev,c.last_room_id,c.scope_kind,c.scope_key)
 on conflict(candidate_id,join_revision,recipient_id)do nothing returning notification_id into nid;
 if nid is null then return;end if;
 -- No candidate identifier, alias, winning-room identifier or title is sent to
 -- another inviter. The source ledger, not a stored URL, resolves navigation.
 insert into public.notifications(id,user_id,kind,payload)values(nid,recipient,'social_activity',jsonb_strip_nulls(jsonb_build_object(
  'version',1,'domain',case c.scope_kind when 'study'then 'study_room'else c.scope_kind end,
  'entity_type','candidate_join_result','event',ev,'title',heading,'body',copy,'room_title',room_name)));
end$$;

create or replace function quantum_private.candidate_join_result_href(nid uuid,recipient uuid)returns text
language plpgsql stable security definer set search_path='' as $$declare s quantum_private.candidate_join_notification_sources%rowtype;begin
 if not quantum_private.candidate_join_result_current(nid,recipient)then return null;end if;
 select *into s from quantum_private.candidate_join_notification_sources where notification_id=nid and recipient_id=recipient;
 if s.event='candidate_joined'and quantum_private.candidate_room_member(s.scope_kind,s.scope_key,recipient,s.joined_room_id) then
  return quantum_private.candidate_chat_href(s.scope_kind,s.joined_room_id);
 end if;
 return '/meetups/candidates?kind='||s.scope_kind||'&key='||replace(s.scope_key,':','%3A');
end$$;

-- Keep the original non-league trigger and its single-membership lifecycle.
-- Only the league trigger adopts independent waiting and per-team invitation state.
create function quantum_private.candidate_membership_confirmed_league()
returns trigger language plpgsql security definer set search_path='' as $$
declare q text;granted_slot text;c record;i record;
begin
 if new.status<>'accepted' then return new;end if;
 if tg_op='UPDATE'and old.status='accepted'and old.team_id=new.team_id then return new;end if;
 q:=quantum_private.challenge_journey_sport(new.challenge_id);
 select coalesce(p.slot_key,case when q='lol'then p.position end)into granted_slot
 from quantum_private.challenge_skill_profiles p where p.roster_id=new.id;
 for c in update quantum_private.meetup_candidates
  set status='waiting',last_room_id=new.team_id,joining_until=null,revision=revision+1,updated_at=clock_timestamp()
  where owner_id=new.user_id and scope_kind='league'and scope_key=q and status in('waiting','joining')
  returning id loop
  -- Close only alternative slots for THIS team. Other team proposals remain pending.
  for i in update quantum_private.candidate_board_invites
   set status=case when slot=granted_slot then 'joined'else 'cancelled'end,joining_until=null,revision=revision+1
   where candidate_id=c.id and room_id=new.team_id and status in('pending','joining')
   returning id,sender_id,status loop
   if i.status='joined'then perform quantum_private.emit_candidate_board_notification(i.id,'invitation_accepted',i.sender_id);end if;
  end loop;
  perform quantum_private.emit_candidate_join_result(c.id,new.user_id,'candidate_joined');
 end loop;
 return new;
end$$;
drop trigger candidate_league_joined on public.department_challenge_roster;
create trigger candidate_league_joined after insert or update of status on public.department_challenge_roster
 for each row execute function quantum_private.candidate_membership_confirmed_league();

revoke all on function quantum_private.candidate_room_member(text,text,uuid,uuid),
 quantum_private.candidate_target_available(text,text,uuid,uuid),
 quantum_private.candidate_row(uuid,uuid),
 quantum_private.candidate_invite_current(uuid,uuid),
 quantum_private.candidate_invite_row(uuid,uuid),
 quantum_private.meetup_candidate_board(text,jsonb),
 quantum_private.emit_candidate_join_result(uuid,uuid,text),
 quantum_private.candidate_join_result_href(uuid,uuid),
 quantum_private.candidate_membership_confirmed_league()
 from public,anon,authenticated,service_role;
commit;
