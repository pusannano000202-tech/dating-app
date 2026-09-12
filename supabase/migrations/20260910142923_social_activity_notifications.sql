-- Local candidate only. No browser push, external delivery, or chat impersonation.
begin;
do $$declare rule text;begin
 select pg_get_expr(conbin,conrelid) into rule from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_kind_check';
 if rule is null then raise exception 'notification_kind_contract_missing';end if;
 alter table public.notifications drop constraint notifications_kind_check;
 execute format('alter table public.notifications add constraint notifications_kind_check check ((%s) or kind=%L)',rule,'social_activity');
end$$;

create table quantum_private.social_notification_events(
 notification_id uuid primary key references public.notifications(id) on delete cascade deferrable initially deferred,
 domain text not null check(domain in('league','meetup','activity_room','study_room','mentoring')),
 entity_id uuid not null,team_id uuid,entity_type text,
 source_id uuid not null,source_version text not null,event text not null,
 actor_id uuid references public.users(id) on delete set null,
 recipient_id uuid not null references public.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 unique(domain,entity_id,source_id,source_version,event,recipient_id)
);
alter table quantum_private.social_notification_events enable row level security;
revoke all on quantum_private.social_notification_events from public,anon,authenticated,service_role;
create index social_notification_recipient on quantum_private.social_notification_events(recipient_id,created_at desc);

-- Scope checks do not grant chat access. Click resolution below additionally checks
-- current membership, the original request cycle, and terminal state.
create function quantum_private.social_notification_scope(d text,e uuid,u uuid,t uuid,kind text)returns boolean
language plpgsql stable security definer set search_path='' as $$declare allowed boolean:=false;begin
 if u is null or quantum_private.account_deletion_blocks_access(u)
  or not exists(select 1 from auth.users a where a.id=u and a.deleted_at is null and(a.banned_until is null or a.banned_until<=clock_timestamp()))
  or not exists(select 1 from quantum_private.resolve_profile_readiness(u) r where r.minimum_signup_complete)then return false;end if;
 if d='league'then
  select exists(select 1 from public.department_challenge_teams team join public.department_challenges c on c.id=team.challenge_id
   join quantum_private.get_member_department_identity(u)i on i.school_scope_key=c.school_scope_key and i.department_key=team.department_key
   where team.id=t and not exists(select 1 from quantum_private.challenge_restrictions s where s.user_id=u and s.revoked_at is null and s.ends_at>clock_timestamp()))into allowed;
 elsif d='meetup'then allowed:=quantum_private.activity_meetup_scope_eligible(e,u);
 elsif d='activity_room'then select quantum_private.activity_room_member_current(r.pool_id,u)into allowed from quantum_private.activity_room_rooms r where r.id=e;
 elsif d='study_room'then
  select exists(select 1 from quantum_private.study_rooms r join quantum_private.study_room_pools p on p.id=r.pool_id
   join quantum_private.get_member_department_identity(u)i on i.school_scope_key=p.school_key and i.department_key=p.department_key where r.id=e)into allowed;
 elsif d='mentoring'then
  if kind='party'then select quantum_private.mentoring_member_eligible(u,p.school_key,p.department_key)into allowed from quantum_private.group_mentoring_parties p where p.id=e;
  else select quantum_private.mentoring_member_eligible(u,s.school_key,s.department_key)into allowed from quantum_private.group_mentoring_sessions s where s.id=e;end if;
 end if;
 return coalesce(allowed,false);
end$$;

create function quantum_private.social_notification_href(d text,e uuid,t uuid,kind text)returns text
language plpgsql stable security definer set search_path='' as $$declare sport text;challenge uuid;begin
 if d='league'then
  select c.id,case when c.category='gaming'and c.team_capacity=5 then 'lol'when c.category='soccer'and c.team_capacity=6 then 'futsal'when c.category='soccer'and c.team_capacity=11 then 'football'end
   into challenge,sport from public.department_challenge_teams team join public.department_challenges c on c.id=team.challenge_id where team.id=t;
  if sport is null then return null;end if;
  return '/meetups/league?sport='||sport||'&challenge='||challenge::text||'&team='||t::text;
 elsif d='meetup'then return '/meetups/'||e::text;
 elsif d='activity_room'then return '/meetups/rooms/'||e::text;
 elsif d='study_room'then return '/meetups/study?room='||e::text;
 elsif d='mentoring'and kind in('party','session')then return '/meetups/department/mentoring?'||kind||'='||e::text;
 end if;return null;
end$$;

create function quantum_private.emit_social_notification(d text,e uuid,t uuid,kind text,source uuid,version text,actor uuid,recipient uuid,ev text,audience text)returns void
language plpgsql security definer set search_path='' as $$declare nid uuid:=gen_random_uuid();link text;heading text;copy text;context_label text;fallback_label text;begin
 if not quantum_private.social_notification_scope(d,e,recipient,t,kind)
  or(actor is not null and actor<>recipient and(not quantum_private.social_notification_scope(d,e,actor,t,kind)or quantum_private.tonight_invite_pair_is_blocked(actor,recipient)))then return;end if;
 if d='league'and audience='organizer'and not exists(select 1 from public.department_challenge_teams team join public.department_challenge_roster r on r.team_id=team.id and r.user_id=team.captain_user_id and r.status='accepted'where team.id=t and team.captain_user_id=recipient)then return;end if;
 link:=quantum_private.social_notification_href(d,e,t,kind);if link is null then return;end if;
 -- Snapshot only the already scoped entity label, never a profile/actor alias,
 -- application introduction or chat content. Stored labels describe this event.
 fallback_label:=case d when 'league'then '우리 학교 리그'when 'meetup'then '모임'when 'activity_room'then '활동 모임'when 'study_room'then '스터디'else '멘토링'end;
 if d='league'then select team.team_name into context_label from public.department_challenge_teams team where team.id=t;
 elsif d='meetup'then select m.title into context_label from public.activity_meetups m where m.id=e;
 elsif d='study_room'then select p.course_name into context_label from quantum_private.study_rooms r join quantum_private.study_room_pools p on p.id=r.pool_id where r.id=e;
 elsif d='activity_room'then
  select case p.activity_key when 'oncheon-running'then '온천천 러닝'when 'evening-badminton'then '저녁 배드민턴'when 'night-basketball'then '저녁 농구'when 'campus-tennis'then '캠퍼스 테니스'
   when 'board-game-round'then '보드게임 한 판'when 'team-gaming'then '팀 게임'when 'geumjeongsan-hiking'then '금정산 등산'when 'campus-cafe-chat'then '카페 대화'when 'campus-small-shop'then '소품샵 구경'
   when 'evening-neighborhood-walk'then '동네 산책'when 'evening-dining'then '저녁 식사'when 'major-foundation-study'then '전공 기초 스터디'when 'language-speaking-study'then '외국어 회화 스터디'
   when 'career-certificate-study'then '취업·자격증 스터디'when 'portfolio-project-study'then '포트폴리오 프로젝트'end
   into context_label from quantum_private.activity_room_rooms r join quantum_private.activity_room_pools p on p.id=r.pool_id where r.id=e;
 elsif kind='party'then select '멘토링 '||p.side_size::text||'대'||p.side_size::text into context_label from quantum_private.group_mentoring_parties p where p.id=e;
 else select '멘토링 '||s.side_size::text||'대'||s.side_size::text into context_label from quantum_private.group_mentoring_sessions s where s.id=e;end if;
 context_label:=btrim(regexp_replace(coalesce(context_label,''),'[[:cntrl:]'||chr(173)||chr(847)||chr(1564)||chr(6158)||chr(8203)||'-'||chr(8207)||chr(8232)||'-'||chr(8238)||chr(8288)||'-'||chr(8303)||chr(65279)||']','','g'));
 -- A user-written title may itself contain contact details. Do not replicate
 -- those into a durable notification; keep a generic domain label instead.
 if context_label=''or context_label~*'(https?://|www[.]|[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|instagram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)'
  or regexp_replace(context_label,'[^0-9]','','g')~'[0-9]{7,}'then context_label:=fallback_label;end if;
 context_label:=left(context_label,80);
 heading:=case ev when 'application_received'then '참가 신청이 도착했어요'when 'application_accepted'then '참가 신청이 승인됐어요'when 'application_declined'then '참가 신청 결과가 도착했어요'
  when 'invitation_received'then '참여 초대가 도착했어요'when 'invitation_accepted'then '초대를 수락했어요'when 'invitation_declined'then '초대 응답이 도착했어요'
  when 'member_joined'then '참가자가 합류했어요'when 'member_left'then '참가 인원이 변경됐어요'when 'room_ready'then '모두 모였어요'when 'participation_ended'then '참여가 종료됐어요'end;
 copy:=case ev when 'application_received'then '신청 내용을 확인하고 승인 여부를 선택해 주세요.'when 'application_accepted'then '확정된 자리와 다음 할 일을 확인해 주세요.'when 'application_declined'then '이번 신청은 승인되지 않았어요. 다른 모집도 살펴볼 수 있어요.'
  when 'invitation_received'then '내용을 확인하고 직접 참여 여부를 선택해 주세요.'when 'invitation_accepted'then '확정된 참가 현황을 확인해 주세요.'when 'invitation_declined'then '초대가 수락되지 않았어요. 현재 모집 현황을 확인해 주세요.'
  when 'member_joined'then '현재 참가 인원과 다음 할 일을 확인해 주세요.'when 'member_left'then '현재 인원과 모집 상태를 다시 확인해 주세요.'when 'room_ready'then '참가 현황을 확인하고 다음 단계를 함께 준비해 주세요.'when 'participation_ended'then '현재 참여 상태를 확인해 주세요.'end;
 if heading is null or audience not in('organizer','participant')or source is null or version is null then raise exception 'invalid_social_event';end if;
 -- The unique transition key, notification and ledger commit or roll back together.
 insert into quantum_private.social_notification_events(notification_id,domain,entity_id,team_id,entity_type,source_id,source_version,event,actor_id,recipient_id)
 values(nid,d,e,t,kind,source,version,ev,actor,recipient)on conflict(domain,entity_id,source_id,source_version,event,recipient_id)do nothing returning notification_id into nid;
 if nid is null then return;end if;
 insert into public.notifications(id,user_id,kind,payload)values(nid,recipient,'social_activity',jsonb_strip_nulls(jsonb_build_object(
  'version',1,'domain',d,'event',ev,'entity_id',e,'audience',audience,'title',heading,'body',copy,'context_label',context_label,'href',link,'status','current','team_id',t,'entity_type',kind,
  'sport',case when d='league'then split_part(split_part(link,'sport=',2),'&',1)end)));
end$$;

-- Deferred triggers see the committed end of a multi-step invitation acceptance.
-- They must not announce the temporary requested row used for self-declared tiers.
create function quantum_private.social_league_transition()returns trigger
language plpgsql security definer set search_path='' as $$declare team public.department_challenge_teams%rowtype;r public.department_challenge_roster%rowtype;
 person uuid;ev text;v text;capacity integer;full_version text;begin
 if tg_table_name='department_challenge_friend_invites'then
  if new.status not in('accepted','declined')or new.status is not distinct from old.status then return new;end if;
  select * into team from public.department_challenge_teams where id=new.team_id;
  perform quantum_private.emit_social_notification('league',team.challenge_id,team.id,null,new.id,new.status,new.invitee_user_id,team.captain_user_id,'invitation_'||new.status,'organizer');return new;
 end if;
 if tg_op='UPDATE'and new.status is not distinct from old.status then return new;end if;
 select * into r from public.department_challenge_roster where id=new.id;
 if r.id is null or r.status is distinct from new.status then return new;end if;
 select * into team from public.department_challenge_teams where id=r.team_id;
 v:=r.revision::text;
 if r.status='requested'then
  perform quantum_private.emit_social_notification('league',team.challenge_id,team.id,null,r.id,v,r.user_id,team.captain_user_id,'application_received','organizer');
 elsif r.status='declined'then
  perform quantum_private.emit_social_notification('league',team.challenge_id,team.id,null,r.id,v,team.captain_user_id,r.user_id,'application_declined','participant');
 elsif r.status='accepted'then
  if tg_op='UPDATE'and old.status='requested'and not exists(select 1 from public.department_challenge_friend_invites i where i.team_id=r.team_id and i.invitee_user_id=r.user_id and i.status='accepted'and i.responded_at>=transaction_timestamp())then
   perform quantum_private.emit_social_notification('league',team.challenge_id,team.id,null,r.id,v,team.captain_user_id,r.user_id,'application_accepted','participant');
  end if;
  select c.team_capacity into capacity from public.department_challenges c where c.id=team.challenge_id;
  if(select count(*)from public.department_challenge_roster x where x.team_id=team.id and x.status='accepted')=capacity and quantum_private.challenge_team_ready(team.id)then
   select md5(string_agg(x.id::text||':'||x.revision::text,','order by x.id))into full_version from public.department_challenge_roster x where x.team_id=team.id and x.status='accepted';
   for person in select user_id from public.department_challenge_roster where team_id=team.id and status='accepted'loop
    perform quantum_private.emit_social_notification('league',team.challenge_id,team.id,null,team.id,full_version,r.user_id,person,'room_ready',case when person=team.captain_user_id then 'organizer'else 'participant'end);
   end loop;
  end if;
 elsif r.status='left'and tg_op='UPDATE'and old.status='accepted'then
  for person in select user_id from public.department_challenge_roster where team_id=team.id and status='accepted'loop
   perform quantum_private.emit_social_notification('league',team.challenge_id,team.id,null,r.id,v,r.user_id,person,'member_left',case when person=team.captain_user_id then 'organizer'else 'participant'end);
  end loop;
 end if;return new;
end$$;
create constraint trigger social_league_roster after insert or update on public.department_challenge_roster deferrable initially deferred for each row execute function quantum_private.social_league_transition();
create constraint trigger social_league_invite after update on public.department_challenge_friend_invites deferrable initially deferred for each row execute function quantum_private.social_league_transition();

create function quantum_private.social_room_transition()returns trigger
language plpgsql security definer set search_path='' as $$declare d text;e uuid;person uuid;people uuid[];actor uuid:=new.user_id;
 source uuid;v text;ev text;owner uuid;capacity integer;fingerprint text;active boolean;previous boolean;ready boolean;begin
 if tg_table_name='study_room_members'then
  d:='study_room';e:=new.room_id;source:=new.id;v:=new.joined_at::text||':'||coalesce(new.left_at::text,'joined');active:=new.left_at is null;previous:=tg_op='UPDATE'and old.left_at is null;
  if not exists(select 1 from quantum_private.study_room_members m where m.id=new.id and m.left_at is not distinct from new.left_at)then return new;end if;
  select array_agg(user_id order by user_id),md5(string_agg(user_id::text||joined_at::text,','order by user_id))into people,fingerprint from quantum_private.study_room_members where room_id=e and left_at is null;capacity:=5;
 elsif tg_table_name='activity_room_members'then
  d:='activity_room';e:=new.room_id;source:=new.user_id;v:=new.joined_at::text||':'||coalesce(new.left_at::text,'joined');active:=new.status='joined';previous:=tg_op='UPDATE'and old.status='joined';
  if not exists(select 1 from quantum_private.activity_room_members m where m.room_id=e and m.user_id=actor and m.status=new.status)then return new;end if;
  select array_agg(user_id order by user_id),md5(string_agg(user_id::text||joined_at::text,','order by user_id))into people,fingerprint from quantum_private.activity_room_members where room_id=e and status='joined';
  select p.capacity into capacity from quantum_private.activity_room_rooms r join quantum_private.activity_room_pools p on p.id=r.pool_id where r.id=e;
 else
  d:='meetup';e:=new.meetup_id;source:=new.user_id;v:=new.membership_revision::text;active:=new.status='joined';previous:=tg_op='UPDATE'and old.status='joined';
  if not exists(select 1 from public.activity_meetup_members m where m.meetup_id=e and m.user_id=actor and m.status=new.status)then return new;end if;
  select array_agg(user_id order by user_id),md5(string_agg(user_id::text||membership_revision::text,','order by user_id))into people,fingerprint from public.activity_meetup_members where meetup_id=e and status='joined';
  select host_user_id,m.capacity into owner,capacity from public.activity_meetups m where id=e;
 end if;
 if tg_op='UPDATE'and active=previous then return new;end if;
 ev:=case when active then 'member_joined'else 'member_left'end;
 ready:=active and cardinality(people)=capacity
  and not exists(select 1 from unnest(people)p(u)where not quantum_private.social_notification_scope(d,e,p.u,null,null))
  and not exists(select 1 from unnest(people)a(u)cross join unnest(people)b(u)where a.u<b.u and quantum_private.tonight_invite_pair_is_blocked(a.u,b.u));
 foreach person in array coalesce(people,'{}'::uuid[])loop
  perform quantum_private.emit_social_notification(d,e,null,null,source,v,actor,person,ev,case when person=owner then 'organizer'else 'participant'end);
  if ready then perform quantum_private.emit_social_notification(d,e,null,null,e,fingerprint,actor,person,'room_ready',case when person=owner then 'organizer'else 'participant'end);end if;
 end loop;return new;
end$$;
create constraint trigger social_meetup_member after insert or update on public.activity_meetup_members deferrable initially deferred for each row execute function quantum_private.social_room_transition();
create constraint trigger social_activity_member after insert or update on quantum_private.activity_room_members deferrable initially deferred for each row execute function quantum_private.social_room_transition();
create constraint trigger social_study_member after insert or update on quantum_private.study_room_members deferrable initially deferred for each row execute function quantum_private.social_room_transition();

create function quantum_private.social_mentoring_transition()returns trigger
language plpgsql security definer set search_path='' as $$declare party quantum_private.group_mentoring_parties%rowtype;person uuid;ev text;begin
 if tg_table_name='group_mentoring_members'then
  if new.accepted and not old.accepted then
   for person in select user_id from quantum_private.group_mentoring_members where session_id=new.session_id and user_id<>new.user_id loop
    perform quantum_private.emit_social_notification('mentoring',new.session_id,null,'session',new.id,'accepted',new.user_id,person,'invitation_accepted','participant');
   end loop;
  end if;
 elsif tg_table_name='group_mentoring_party_members'then
  select * into party from quantum_private.group_mentoring_parties where id=new.party_id;
  if tg_op='INSERT'and not new.accepted and party.status='friends'then
   perform quantum_private.emit_social_notification('mentoring',party.id,null,'party',new.user_id,'invited',party.owner_id,new.user_id,'invitation_received','participant');
  elsif tg_op='UPDATE'and new.accepted and not old.accepted then
   perform quantum_private.emit_social_notification('mentoring',party.id,null,'party',new.user_id,'accepted',new.user_id,party.owner_id,'invitation_accepted','organizer');
  end if;
 elsif tg_table_name='group_mentoring_parties'then
  if new.status='cancelled'and old.status in('friends','waiting')and auth.uid()is distinct from new.owner_id
    and exists(select 1 from quantum_private.group_mentoring_party_members where party_id=new.id and user_id=auth.uid()and not accepted)then
   perform quantum_private.emit_social_notification('mentoring',new.id,null,'party',auth.uid(),'declined',auth.uid(),new.owner_id,'invitation_declined','organizer');
  end if;
 else
  if tg_op='UPDATE'and new.status is not distinct from old.status then return new;end if;
  ev:=case when new.status='offered'then 'invitation_received'when new.status='active'then 'room_ready'
   when new.status in('ended','expired')then 'participation_ended'end;
  if ev is null then return new;end if;
  for person in select user_id from quantum_private.group_mentoring_members where session_id=new.id loop
   perform quantum_private.emit_social_notification('mentoring',new.id,null,'session',new.id,new.status,null,person,ev,'participant');
  end loop;
 end if;return new;
end$$;
create constraint trigger social_mentoring_party_member after insert or update on quantum_private.group_mentoring_party_members deferrable initially deferred for each row execute function quantum_private.social_mentoring_transition();
create constraint trigger social_mentoring_accept after update on quantum_private.group_mentoring_members deferrable initially deferred for each row execute function quantum_private.social_mentoring_transition();
create constraint trigger social_mentoring_party after update on quantum_private.group_mentoring_parties deferrable initially deferred for each row execute function quantum_private.social_mentoring_transition();
create constraint trigger social_mentoring_session after insert or update on quantum_private.group_mentoring_sessions deferrable initially deferred for each row execute function quantum_private.social_mentoring_transition();

create function public.resolve_my_social_notification(p_notification_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare actor uuid:=auth.uid();x quantum_private.social_notification_events%rowtype;valid boolean:=false;link text;slot text;begin
 if actor is null then raise exception 'not_authenticated'using errcode='42501';end if;
 select * into x from quantum_private.social_notification_events where notification_id=p_notification_id and recipient_id=actor;
 if not found then raise exception 'notification_not_found'using errcode='42501';end if;
 if not quantum_private.social_notification_scope(x.domain,x.entity_id,actor,x.team_id,x.entity_type)
  or(x.actor_id is not null and x.actor_id<>actor and quantum_private.tonight_invite_pair_is_blocked(x.actor_id,actor))then return jsonb_build_object('href',null,'status','ended');end if;
 if x.domain='league'then
  if x.event='application_received'then
   select exists(select 1 from public.department_challenge_roster r join public.department_challenge_teams t on t.id=r.team_id join public.department_challenges c on c.id=t.challenge_id
    where r.id=x.source_id and r.revision::text=x.source_version and r.status='requested'and t.captain_user_id=actor and c.status='recruiting'
    and exists(select 1 from public.department_challenge_roster captain where captain.team_id=t.id and captain.user_id=actor and captain.status='accepted')
    and quantum_private.social_notification_scope('league',c.id,r.user_id,t.id,null))into valid;
  else select exists(select 1 from public.department_challenge_roster r join public.department_challenge_teams t on t.id=r.team_id join public.department_challenges c on c.id=t.challenge_id
   where r.team_id=x.team_id and r.user_id=actor and r.status='accepted'and c.status<>'cancelled')into valid;end if;
  valid:=valid and not exists(select 1 from public.department_challenge_roster r where r.team_id=x.team_id and r.status='accepted'and quantum_private.tonight_invite_pair_is_blocked(r.user_id,actor));
 elsif x.domain='meetup'then select exists(select 1 from public.activity_meetup_members m join public.activity_meetups r on r.id=m.meetup_id where r.id=x.entity_id and m.user_id=actor and m.status='joined'and r.status in('open','full')and(r.ends_at is null or r.ends_at>clock_timestamp()))
  and not exists(select 1 from public.activity_meetup_members m where m.meetup_id=x.entity_id and m.status='joined'and quantum_private.tonight_invite_pair_is_blocked(m.user_id,actor))into valid;
 elsif x.domain='activity_room'then select exists(select 1 from quantum_private.activity_room_members m join quantum_private.activity_room_rooms r on r.id=m.room_id where r.id=x.entity_id and m.user_id=actor and m.status='joined'and r.status<>'retired')
  and not exists(select 1 from quantum_private.activity_room_members m where m.room_id=x.entity_id and m.status='joined'and quantum_private.tonight_invite_pair_is_blocked(m.user_id,actor))into valid;
 elsif x.domain='study_room'then select exists(select 1 from quantum_private.study_room_members m join quantum_private.study_rooms r on r.id=m.room_id where r.id=x.entity_id and m.user_id=actor and m.left_at is null and not r.completed)
  and not exists(select 1 from quantum_private.study_room_members m where m.room_id=x.entity_id and m.left_at is null and quantum_private.tonight_invite_pair_is_blocked(m.user_id,actor))into valid;
 elsif x.domain='mentoring'then
  if x.entity_type='party'then
   select exists(select 1 from quantum_private.group_mentoring_parties p join quantum_private.group_mentoring_party_members m on m.party_id=p.id where p.id=x.entity_id and m.user_id=actor and p.status in('friends','waiting')and p.expires_at>clock_timestamp()
    and quantum_private.group_mentoring_clear(array[p.id])and(x.event<>'invitation_received'or not m.accepted)
    and not exists(select 1 from quantum_private.group_mentoring_party_members a where a.party_id=p.id and(not quantum_private.mentoring_member_eligible(a.user_id,p.school_key,p.department_key)or(a.user_id<>p.owner_id and not quantum_private.is_active_accepted_friend_pair(p.owner_id,a.user_id)))))into valid;
  else select exists(select 1 from quantum_private.group_mentoring_sessions s join quantum_private.group_mentoring_members m on m.session_id=s.id where s.id=x.entity_id and m.user_id=actor and s.status in('offered','active')and s.expires_at>clock_timestamp()
    and not exists(select 1 from quantum_private.group_mentoring_members a where a.session_id=s.id and not quantum_private.mentoring_member_eligible(a.user_id,s.school_key,s.department_key))
    and not exists(select 1 from quantum_private.group_mentoring_members a join quantum_private.group_mentoring_members b on b.session_id=a.session_id and b.user_id>a.user_id where a.session_id=s.id and quantum_private.group_mentoring_pair_excluded(a.user_id,b.user_id)))into valid;end if;
 end if;
 link:=case when valid then quantum_private.social_notification_href(x.domain,x.entity_id,x.team_id,x.entity_type)end;
 if link is not null and x.event='application_received'then
  select p.slot_key into slot from quantum_private.challenge_skill_profiles p where p.roster_id=x.source_id;
  link:=link||'&panel=applications'||case when slot is not null then '&slot='||slot else ''end;
 end if;
 return jsonb_build_object('href',link,'status',case when link is null then 'ended'else 'current'end);
end$$;
revoke all on function quantum_private.social_notification_scope(text,uuid,uuid,uuid,text),quantum_private.social_notification_href(text,uuid,uuid,text),
 quantum_private.emit_social_notification(text,uuid,uuid,text,uuid,text,uuid,uuid,text,text),quantum_private.social_league_transition(),quantum_private.social_room_transition(),quantum_private.social_mentoring_transition(),public.resolve_my_social_notification(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.resolve_my_social_notification(uuid)to authenticated;

create function public.get_my_notifications_page(p_limit integer default 50,p_before_created_at timestamptz default null,p_before_id uuid default null)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare actor uuid:=auth.uid();items jsonb;more boolean;cursor jsonb;begin
 if actor is null then raise exception 'not_authenticated'using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 or(p_before_created_at is null)<>(p_before_id is null)then raise exception 'invalid_notification_cursor';end if;
 if p_before_id is not null and not exists(select 1 from public.notifications where id=p_before_id and user_id=actor and created_at=p_before_created_at)then raise exception 'invalid_notification_cursor';end if;
 with page as(select n.*,row_number()over(order by n.created_at desc,n.id desc)rn from public.notifications n
  where n.user_id=actor and(p_before_id is null or(n.created_at,n.id)<(p_before_created_at,p_before_id))order by n.created_at desc,n.id desc limit p_limit+1)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'payload',payload,'read_at',read_at,'created_at',created_at)order by created_at desc,id desc)filter(where rn<=p_limit),'[]'),coalesce(bool_or(rn>p_limit),false)into items,more from page;
 if more then cursor:=jsonb_build_object('created_at',items->(jsonb_array_length(items)-1)->>'created_at','id',items->(jsonb_array_length(items)-1)->>'id');end if;
 return jsonb_build_object('notifications',items,'has_more',more,'next_cursor',cursor);
end$$;
revoke all on function public.get_my_notifications_page(integer,timestamptz,uuid)from public,anon,authenticated,service_role;
grant execute on function public.get_my_notifications_page(integer,timestamptz,uuid)to authenticated;
commit;
