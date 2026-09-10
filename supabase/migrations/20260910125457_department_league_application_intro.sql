begin;

-- Introductions are application-scoped private data, never columns on a public
-- roster row or copied into notifications, events, match snapshots or chat.
create table quantum_private.challenge_application_intros(
 roster_id uuid primary key references public.department_challenge_roster(id)on delete cascade,
 aspiration text not null default '',strengths text not null default '',
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(char_length(aspiration)<=80 and char_length(strengths)<=120),
 check(aspiration !~ ('[[:cntrl:]'||chr(127)||'-'||chr(159)||chr(8203)||'-'||chr(8207)||chr(8232)||'-'||chr(8238)||chr(8288)||'-'||chr(8303)||chr(65279)||']')),
 check(replace(strengths,chr(10),'') !~ ('[[:cntrl:]'||chr(127)||'-'||chr(159)||chr(8203)||'-'||chr(8207)||chr(8232)||'-'||chr(8238)||chr(8288)||'-'||chr(8303)||chr(65279)||']'))
);
alter table quantum_private.challenge_application_intros enable row level security;
revoke all on quantum_private.challenge_application_intros from public,anon,authenticated,service_role;

create function quantum_private.challenge_application_intro_normalize(p_value jsonb,p_max integer)returns text
language plpgsql immutable set search_path='' as $$declare value text;begin
 if p_value is null then return '';end if;
 if jsonb_typeof(p_value)<>'string'then raise exception 'invalid_application_intro';end if;
 value:=p_value#>>'{}';
 if char_length(value)>p_max or(case when p_max=120 then replace(value,chr(10),'')else value end)~('[[:cntrl:]'||chr(127)||'-'||chr(159)||chr(8203)||'-'||chr(8207)||chr(8232)||'-'||chr(8238)||chr(8288)||'-'||chr(8303)||chr(65279)||']')then raise exception 'invalid_application_intro';end if;
 -- ECMAScript trim whitespace excluding control/format characters rejected above.
 return btrim(value,' '||chr(10)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8239)||chr(8287)||chr(12288));
end$$;

create function quantum_private.challenge_application_intro_for(p_roster uuid,p_actor uuid)returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('aspiration',note.aspiration,'strengths',note.strengths)
 from quantum_private.challenge_application_intros note join public.department_challenge_roster r on r.id=note.roster_id
 join public.department_challenge_teams t on t.id=r.team_id and t.challenge_id=r.challenge_id
 join public.department_challenges c on c.id=r.challenge_id
 cross join quantum_private.get_member_department_identity(p_actor)identity
 cross join quantum_private.get_member_department_identity(r.user_id)applicant_identity
 where note.roster_id=p_roster and p_actor=auth.uid()and r.status in('requested','accepted')and t.status='accepted'and c.status<>'cancelled'
 and identity.school_scope_key=c.school_scope_key and identity.department_key=t.department_key
 and applicant_identity.school_scope_key=c.school_scope_key and applicant_identity.department_key=t.department_key
 and(r.user_id=p_actor or(t.captain_user_id=p_actor and exists(select 1 from public.department_challenge_roster captain where captain.team_id=t.id and captain.user_id=p_actor and captain.status='accepted')))
 and not quantum_private.tonight_invite_pair_is_blocked(p_actor,r.user_id)
 and not quantum_private.account_deletion_blocks_access(p_actor)and not quantum_private.account_deletion_blocks_access(r.user_id)
 and exists(select 1 from auth.users u where u.id=p_actor and u.deleted_at is null and(u.banned_until is null or u.banned_until<=now()))
 and exists(select 1 from auth.users u where u.id=r.user_id and u.deleted_at is null and(u.banned_until is null or u.banned_until<=now()))
 and not exists(select 1 from quantum_private.challenge_restrictions s where s.user_id in(p_actor,r.user_id)and s.revoked_at is null and s.ends_at>now())
$$;

create function quantum_private.challenge_application_intro_projection(p_challenge jsonb,p_actor uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare teams jsonb;begin
 if p_actor is distinct from auth.uid()or p_actor is null then raise exception 'not_authenticated';end if;
 select coalesce(jsonb_agg(team.value||jsonb_build_object('players',(
  select coalesce(jsonb_agg((player.value-'application_intro')||case when note.value is not null then jsonb_build_object('application_intro',note.value)else '{}'::jsonb end order by player.ord),'[]')
  from jsonb_array_elements(team.value->'players')with ordinality player(value,ord)
  left join public.department_challenge_roster r on r.id=(player.value->>'id')::uuid and r.team_id=(team.value->>'id')::uuid and r.challenge_id=(p_challenge->>'id')::uuid
  left join lateral(select quantum_private.challenge_application_intro_for(r.id,p_actor)value)note on true
 ))order by team.ord),'[]')into teams from jsonb_array_elements(p_challenge->'teams')with ordinality team(value,ord);
 return jsonb_set(p_challenge,'{teams}',teams);
end$$;

create function quantum_private.challenge_application_intro_cleanup()returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.status in('left','declined')then delete from quantum_private.challenge_application_intros where roster_id=new.id;end if;return new;
end$$;
create trigger challenge_application_intro_cleanup after update of status on public.department_challenge_roster for each row execute function quantum_private.challenge_application_intro_cleanup();

alter function quantum_private.department_league_journey(text,jsonb)rename to department_league_journey_pre_application_intro;
create function quantum_private.department_league_journey(p_action text,p_args jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();args jsonb:=p_args;aspiration text;strengths text;result jsonb;rows jsonb;prior_exists boolean;v_roster_id uuid;
 required text[]:=array['sport','challenge_id','team_id','slot','tier','expected_revision','idempotency_key'];
begin
 if actor is null then raise exception 'not_authenticated';end if;
 if p_action='join'then
  perform quantum_private.challenge_assert_player(actor);
  if p_args is null or jsonb_typeof(p_args)<>'object'or octet_length(p_args::text)>6000
   or not(p_args?&required)or exists(select 1 from jsonb_object_keys(p_args)k where not(k=any(required||array['aspiration','strengths'])))then raise exception 'invalid_journey_action';end if;
  aspiration:=quantum_private.challenge_application_intro_normalize(p_args->'aspiration',80);
  strengths:=quantum_private.challenge_application_intro_normalize(p_args->'strengths',120);
  args:=p_args-'aspiration'-'strengths';
  -- Empty and omitted optional values retain the old-client request hash.
  if aspiration<>''or strengths<>''then args:=args||jsonb_build_object('aspiration',aspiration,'strengths',strengths);end if;
  perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||actor::text,0));
  select exists(select 1 from quantum_private.challenge_journey_requests r where r.actor_id=actor and r.idempotency_key=(args->>'idempotency_key')::uuid)into prior_exists;
  result:=quantum_private.department_league_journey_pre_application_intro(p_action,args);
  -- Replaying an old request is read-only, even after cancellation/reapplication.
  if not prior_exists then
   v_roster_id:=(result->>'roster_id')::uuid;
   if not exists(select 1 from public.department_challenge_roster r where r.id=v_roster_id and r.user_id=actor and r.team_id=(args->>'team_id')::uuid and r.challenge_id=(args->>'challenge_id')::uuid and r.status='requested')then raise exception 'team_membership_required';end if;
   if aspiration<>''or strengths<>''then
    insert into quantum_private.challenge_application_intros as stored(roster_id,aspiration,strengths)values(v_roster_id,aspiration,strengths)
    on conflict(roster_id)do update set aspiration=excluded.aspiration,strengths=excluded.strengths,updated_at=clock_timestamp();
   else delete from quantum_private.challenge_application_intros note where note.roster_id=v_roster_id;end if;
  end if;
  return result;
 end if;
 result:=quantum_private.department_league_journey_pre_application_intro(p_action,p_args);
 if p_action='overview'then
  select coalesce(jsonb_agg(quantum_private.challenge_application_intro_projection(item.value,actor)order by item.ord),'[]')into rows from jsonb_array_elements(result->'challenges')with ordinality item(value,ord);
  result:=jsonb_set(result,'{challenges}',rows);
 end if;return result;
end$$;

alter function quantum_private.challenge_recruitment_challenge(uuid,uuid,text)rename to challenge_recruitment_challenge_pre_application_intro;
create function quantum_private.challenge_recruitment_challenge(p_challenge uuid,p_actor uuid,p_sport text)returns jsonb
language sql stable security definer set search_path='' as $$
 select quantum_private.challenge_application_intro_projection(quantum_private.challenge_recruitment_challenge_pre_application_intro(p_challenge,p_actor,p_sport),p_actor)
$$;

revoke all on function quantum_private.challenge_application_intro_normalize(jsonb,integer),quantum_private.challenge_application_intro_for(uuid,uuid),quantum_private.challenge_application_intro_projection(jsonb,uuid),quantum_private.challenge_application_intro_cleanup(),quantum_private.department_league_journey_pre_application_intro(text,jsonb),quantum_private.department_league_journey(text,jsonb),quantum_private.challenge_recruitment_challenge_pre_application_intro(uuid,uuid,text),quantum_private.challenge_recruitment_challenge(uuid,uuid,text)from public,anon,authenticated,service_role;
grant execute on function quantum_private.department_league_journey(text,jsonb)to authenticated;
comment on table quantum_private.challenge_application_intros is 'Optional voluntary application introduction. Current author and own team captain only; removed on withdrawal/rejection. Never a public profile or notification payload.';
notify pgrst,'reload schema';
commit;
