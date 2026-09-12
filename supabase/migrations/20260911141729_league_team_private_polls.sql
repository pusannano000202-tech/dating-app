begin;
alter table quantum_private.activity_room_polls drop constraint activity_room_polls_room_kind_check;
alter table quantum_private.activity_room_polls add constraint activity_room_polls_room_kind_check check(room_kind in('activity_room','meetup','friend','department_challenge','league_team'));
alter table quantum_private.activity_room_poll_agreements drop constraint activity_room_poll_agreements_room_kind_check;
alter table quantum_private.activity_room_poll_agreements add constraint activity_room_poll_agreements_room_kind_check check(room_kind in('activity_room','meetup','friend','department_challenge','league_team'));

-- Keep all existing scopes unchanged; the new scope keys the durable team ID,
-- never the shared challenge ID used by the opponent conversation.
alter function quantum_private.chat_poll_current_members(text,uuid) rename to chat_poll_current_members_existing;
create function quantum_private.chat_poll_current_members(p_room_kind text,p_room_id uuid) returns table(user_id uuid)
language sql stable security definer set search_path='' as $$
 select m.user_id from quantum_private.chat_poll_current_members_existing(p_room_kind,p_room_id)m where p_room_kind<>'league_team'
 union all select r.user_id from public.department_challenge_roster r
 join auth.users u on u.id=r.user_id
 where p_room_kind='league_team' and r.team_id=p_room_id and r.status='accepted'
 and u.deleted_at is null and(u.banned_until is null or u.banned_until<=clock_timestamp())
 and not quantum_private.account_deletion_blocks_access(r.user_id)
 and quantum_private.league_team_chat_access(p_room_id,r.user_id)
 order by user_id
$$;
alter function quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean) rename to resolve_chat_poll_room_existing;
create function quantum_private.resolve_chat_poll_room(p_room_kind text,p_room_ref_id uuid,p_actor uuid,p_require_writable boolean)returns uuid
language plpgsql stable security definer set search_path='' as $$
begin
 if p_room_kind is distinct from 'league_team' then return quantum_private.resolve_chat_poll_room_existing(p_room_kind,p_room_ref_id,p_actor,p_require_writable);end if;
 if not quantum_private.chat_poll_actor_is_live(p_actor) or not quantum_private.league_team_chat_access(p_room_ref_id,p_actor)
  or(p_require_writable and exists(select 1 from public.department_challenges c join public.department_challenge_teams t on t.challenge_id=c.id where t.id=p_room_ref_id and c.status in('completed','cancelled')))
 then raise exception 'activity_poll_forbidden' using errcode='42501';end if;
 return p_room_ref_id;
end
$$;
alter function quantum_private.lock_chat_poll_room(text,uuid,uuid,boolean) rename to lock_chat_poll_room_existing;
create function quantum_private.lock_chat_poll_room(p_room_kind text,p_room_ref_id uuid,p_actor uuid,p_require_writable boolean)returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare school_key text; member record;
begin
 if p_room_kind is distinct from 'league_team' then return quantum_private.lock_chat_poll_room_existing(p_room_kind,p_room_ref_id,p_actor,p_require_writable);end if;
 perform quantum_private.resolve_chat_poll_room(p_room_kind,p_room_ref_id,p_actor,p_require_writable);
 select i.school_scope_key into school_key from quantum_private.get_member_department_identity(p_actor)i;
 -- Same order as team chat and league membership changes: school, canonical
 -- challenge/team/roster, pair locks, then account-domain locks and final gate.
 perform pg_advisory_xact_lock(hashtextextended('quantum:challenge-league:'||school_key,0));
 perform 1 from public.department_challenges c join public.department_challenge_teams t on t.challenge_id=c.id where t.id=p_room_ref_id for update of c;
 perform 1 from public.department_challenge_teams where id=p_room_ref_id for update;
 perform 1 from public.department_challenge_roster where team_id=p_room_ref_id order by id for share;
 for member in select distinct user_id from public.department_challenge_roster where team_id=p_room_ref_id and status='accepted' and user_id<>p_actor order by user_id loop
  perform pg_advisory_xact_lock(quantum_private.friend_pair_lock_key(p_actor,member.user_id));
 end loop;
 for member in select distinct user_id from public.department_challenge_roster where team_id=p_room_ref_id and status='accepted' order by user_id loop
  perform pg_advisory_xact_lock(hashtextextended('account-delete|'||member.user_id::text,0));
  perform 1 from auth.users where id=member.user_id for share;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('chat-poll-room-write|league_team|'||p_room_ref_id::text,0));
 return quantum_private.resolve_chat_poll_room(p_room_kind,p_room_ref_id,p_actor,p_require_writable);
end
$$;
revoke all on function quantum_private.chat_poll_current_members_existing(text,uuid),quantum_private.chat_poll_current_members(text,uuid),
 quantum_private.resolve_chat_poll_room_existing(text,uuid,uuid,boolean),quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean),
 quantum_private.lock_chat_poll_room_existing(text,uuid,uuid,boolean),quantum_private.lock_chat_poll_room(text,uuid,uuid,boolean)from public,anon,authenticated,service_role;
commit;
