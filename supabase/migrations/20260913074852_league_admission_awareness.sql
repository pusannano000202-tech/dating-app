-- Source candidate only. Apply only with separate database authorization.
begin;

create table quantum_private.league_admission_room_notices (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.department_challenge_teams(id) on delete cascade,
 source_id uuid not null references public.department_challenge_roster(id) on delete cascade,
 source_version text not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(source_id,source_version)
);
alter table quantum_private.league_admission_room_notices enable row level security;
revoke all on quantum_private.league_admission_room_notices from public,anon,authenticated,service_role;
create index league_admission_room_notices_history on quantum_private.league_admission_room_notices(team_id,created_at desc,id desc);

create function quantum_private.league_admission_notice_current(p_notice uuid,p_actor uuid)returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from quantum_private.league_admission_room_notices n
  join public.department_challenge_roster r on r.id=n.source_id
  join public.department_challenge_teams t on t.id=n.team_id
  join public.department_challenges c on c.id=t.challenge_id
  where n.id=p_notice and r.team_id=t.id and r.status='requested' and r.revision::text=n.source_version
   and c.status='recruiting' and quantum_private.league_team_chat_access(t.id,p_actor)
   and quantum_private.social_notification_scope('league',c.id,p_actor,t.id,null)
   and quantum_private.social_notification_scope('league',c.id,r.user_id,t.id,null)
   and not quantum_private.tonight_invite_pair_is_blocked(p_actor,r.user_id))
$$;

create function quantum_private.league_admission_room_transition()returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.department_challenge_roster%rowtype;t public.department_challenge_teams%rowtype;notice uuid;person uuid;nid uuid;
begin
 if new.status<>'requested' or (tg_op='UPDATE' and new.status is not distinct from old.status)then return new;end if;
 -- Inspect the final row: accepting a friend invite temporarily creates a request.
 select * into r from public.department_challenge_roster where id=new.id;
 if r.id is null or r.status<>'requested' or r.revision<>new.revision then return new;end if;
 select * into t from public.department_challenge_teams where id=r.team_id;
 if not quantum_private.social_notification_scope('league',t.challenge_id,r.user_id,t.id,null)then return new;end if;
 insert into quantum_private.league_admission_room_notices(team_id,source_id,source_version)
 values(t.id,r.id,r.revision::text)on conflict(source_id,source_version)do nothing returning id into notice;
 if notice is null then return new;end if;
 -- Captain receives the existing application_received notification. Other current
 -- members receive only generic recruitment news, never applicant text or identity.
 for person in select user_id from public.department_challenge_roster where team_id=t.id and status='accepted' and user_id<>t.captain_user_id loop
  if not quantum_private.league_admission_notice_current(notice,person)then continue;end if;
  nid:=gen_random_uuid();
  insert into quantum_private.social_notification_events(notification_id,domain,entity_id,team_id,entity_type,source_id,source_version,event,actor_id,recipient_id)
  values(nid,'league',t.challenge_id,t.id,'league_admission_notice',notice,'requested','application_notice',r.user_id,person);
  insert into public.notifications(id,user_id,kind,payload)values(nid,person,'social_activity',jsonb_build_object(
   'version',1,'domain','league','event','application_notice','entity_type','league_admission_notice','entity_id',t.challenge_id,'team_id',t.id,
   'audience','participant','title','우리 팀에 새 신청이 왔어요','body','팀 채팅에서 모집 소식을 확인해 주세요. 참가 수락은 주장이 결정해요.',
   'href','/chat/league-team/'||t.id::text,'status','current'));
 end loop;
 return new;
end$$;
create constraint trigger league_admission_room_notice after insert or update on public.department_challenge_roster
 deferrable initially deferred for each row execute function quantum_private.league_admission_room_transition();

create function public.get_my_league_recruitment_notices(p_team_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();rows jsonb;
begin
 perform quantum_private.assert_activity_room_access(actor);
 if not quantum_private.league_team_chat_access(p_team_id,actor)then raise exception 'team_chat_membership_required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'kind','application_received',
  'state',case when quantum_private.league_admission_notice_current(n.id,actor)then 'pending'else 'reviewed'end,
  'body',case when quantum_private.league_admission_notice_current(n.id,actor)then '새 참가 신청이 도착했어요. 주장이 확인하고 있어요.'else '이 참가 신청의 검토가 끝났어요.'end,
  'created_at',n.created_at)order by n.created_at,n.id),'[]')into rows
 from(select note.* from quantum_private.league_admission_room_notices note
  join public.department_challenge_roster r on r.id=note.source_id
  where note.team_id=p_team_id and not quantum_private.tonight_invite_pair_is_blocked(actor,r.user_id)
  order by note.created_at desc,note.id desc limit 50)n;
 return jsonb_build_object('owner_id',actor,'team_id',p_team_id,'notices',rows);
end$$;

-- Preserve all previous notification domains, source-cycle checks and permissions.
alter function public.resolve_my_social_notification(uuid)rename to resolve_my_social_notification_before_league_awareness;
create function public.resolve_my_social_notification(p_notification_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();x quantum_private.social_notification_events%rowtype;result jsonb;
begin
 if actor is null then raise exception 'not_authenticated'using errcode='42501';end if;
 select * into x from quantum_private.social_notification_events where notification_id=p_notification_id and recipient_id=actor;
 if x.domain='league'and x.entity_type='league_admission_notice'and x.event='application_notice'then
  if quantum_private.league_admission_notice_current(x.source_id,actor)then return jsonb_build_object('status','current','href','/chat/league-team/'||x.team_id::text);end if;
  return jsonb_build_object('status','ended','href',null);
 end if;
 result:=public.resolve_my_social_notification_before_league_awareness(p_notification_id);
 if x.domain='league'and x.event='application_accepted'and result->>'status'='current'then
  if not quantum_private.league_team_chat_access(x.team_id,actor)then return jsonb_build_object('status','ended','href',null);end if;
  return jsonb_build_object('status','current','href','/chat/league-team/'||x.team_id::text);
 end if;
 return result;
end$$;

alter function quantum_private.common_web_push_notification_current(uuid)rename to common_web_push_notification_before_league_awareness;
create function quantum_private.common_web_push_notification_current(nid uuid)returns boolean
language plpgsql stable security definer set search_path='' as $$
declare x quantum_private.social_notification_events%rowtype;
begin
 select * into x from quantum_private.social_notification_events where notification_id=nid;
 if x.domain='league'and x.entity_type='league_admission_notice'and x.event='application_notice'then
  return quantum_private.league_admission_notice_current(x.source_id,x.recipient_id);
 end if;
 return quantum_private.common_web_push_notification_before_league_awareness(nid);
end$$;

revoke all on function quantum_private.league_admission_notice_current(uuid,uuid),quantum_private.league_admission_room_transition(),
 public.get_my_league_recruitment_notices(uuid),public.resolve_my_social_notification_before_league_awareness(uuid),public.resolve_my_social_notification(uuid),
 quantum_private.common_web_push_notification_before_league_awareness(uuid),quantum_private.common_web_push_notification_current(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.get_my_league_recruitment_notices(uuid),public.resolve_my_social_notification(uuid)to authenticated;
commit;
