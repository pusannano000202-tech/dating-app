-- F12: user-created polls for the native persistent study room and hosted
-- mentoring session. This is source only until separately approved for apply.
-- Dependencies: activity_room_chat_polls, league_team_private_polls,
-- mentoring_hosted_recruitment, study_hosted_shared_admission, native_paid_admission.
begin;

alter table quantum_private.activity_room_polls
  drop constraint activity_room_polls_room_kind_check;
alter table quantum_private.activity_room_polls
  add constraint activity_room_polls_room_kind_check
  check (room_kind in ('activity_room','meetup','friend','department_challenge','league_team','study_room','mentoring'));
alter table quantum_private.activity_room_poll_agreements
  drop constraint activity_room_poll_agreements_room_kind_check;
alter table quantum_private.activity_room_poll_agreements
  add constraint activity_room_poll_agreements_room_kind_check
  check (room_kind in ('activity_room','meetup','friend','department_challenge','league_team','study_room','mentoring'));

-- Preserve the established scopes, including the league-team wrapper, by name.
-- No pre-existing public RPC signature or poll/vote locking logic changes.
alter function quantum_private.chat_poll_current_members(text,uuid)
  rename to chat_poll_current_members_before_native;
create function quantum_private.chat_poll_current_members(p_room_kind text,p_room_id uuid)
returns table(user_id uuid)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_room_kind='study_room' then
    return query select m.user_id from quantum_private.study_room_members m
      where m.room_id=p_room_id and m.left_at is null
        and quantum_private.chat_poll_actor_is_live(m.user_id)
        and quantum_private.hosted_study_member_current(p_room_id,m.user_id)
      order by m.user_id;
  elsif p_room_kind='mentoring' then
    return query select m.user_id from quantum_private.group_mentoring_members m
      where m.session_id=p_room_id and m.accepted and m.left_at is null
        and quantum_private.chat_poll_actor_is_live(m.user_id)
        and quantum_private.hosted_mentoring_member_current(p_room_id,m.user_id)
      order by m.user_id;
  else
    return query select m.user_id
      from quantum_private.chat_poll_current_members_before_native(p_room_kind,p_room_id) m;
  end if;
end
$$;

alter function quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean)
  rename to resolve_chat_poll_room_before_native;
create function quantum_private.resolve_chat_poll_room(
  p_room_kind text,p_room_ref_id uuid,p_actor uuid,p_require_writable boolean
) returns uuid
language plpgsql stable security definer set search_path='' as $$
begin
  if p_room_kind is null or p_room_kind not in ('study_room','mentoring') then
    return quantum_private.resolve_chat_poll_room_before_native(p_room_kind,p_room_ref_id,p_actor,p_require_writable);
  end if;
  if p_room_ref_id is null or not quantum_private.chat_poll_actor_is_live(p_actor) then
    raise exception 'activity_poll_forbidden' using errcode='42501';
  end if;
  if p_room_kind='study_room' then
    -- All ten sessions share this room ID. Past attendance/selected session is
    -- not permission to access a room after leaving it. Completed rooms retain
    -- results for current members but cannot create/change polls or agreements.
    if not quantum_private.hosted_study_member_current(p_room_ref_id,p_actor)
      or (p_require_writable and not exists (
        select 1 from quantum_private.study_rooms r where r.id=p_room_ref_id and not r.completed
      )) then raise exception 'activity_poll_forbidden' using errcode='42501'; end if;
  else
    -- The native predicate rejects legacy auto groups, expired/ended sessions,
    -- unaccepted/left users, school/department drift and pair exclusions.
    if not quantum_private.hosted_mentoring_member_current(p_room_ref_id,p_actor) then
      raise exception 'activity_poll_forbidden' using errcode='42501';
    end if;
  end if;
  return p_room_ref_id;
end
$$;

alter function quantum_private.lock_chat_poll_room(text,uuid,uuid,boolean)
  rename to lock_chat_poll_room_before_native;
create function quantum_private.lock_chat_poll_room(
  p_room_kind text,p_room_ref_id uuid,p_actor uuid,p_require_writable boolean
) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare
  v_kind text;
  v_member uuid;
  v_locked_members uuid[];
  v_current_members uuid[];
begin
  if p_room_kind is null or p_room_kind not in ('study_room','mentoring') then
    return quantum_private.lock_chat_poll_room_before_native(p_room_kind,p_room_ref_id,p_actor,p_require_writable);
  end if;
  -- Refuse guessed/nonmember targets before taking any user/domain locks.
  perform quantum_private.resolve_chat_poll_room(p_room_kind,p_room_ref_id,p_actor,p_require_writable);
  v_kind:=case p_room_kind when 'study_room' then 'study' else 'mentoring' end;
  -- Match native membership mutations: mentoring globals, sorted readiness,
  -- canonical study pool/room or mentoring room, then member and pair locks.
  perform quantum_private.native_admission_global_lock(v_kind);
  select coalesce(array_agg(m.user_id order by m.user_id),'{}'::uuid[]) into v_locked_members
  from (
    select p_actor user_id
    union select user_id from quantum_private.study_room_members
      where p_room_kind='study_room' and room_id=p_room_ref_id and left_at is null
    union select user_id from quantum_private.group_mentoring_members
      where p_room_kind='mentoring' and session_id=p_room_ref_id and accepted and left_at is null
  ) m;
  foreach v_member in array v_locked_members loop
    perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:'||v_member::text,0));
  end loop;
  perform quantum_private.native_admission_room_lock(v_kind,p_room_ref_id);
  -- Account deletion can already own the account row before cascading into a
  -- native room. Never wait for its account locks while holding native locks:
  -- abort this transaction and let the caller refresh/retry instead of creating
  -- an account -> room / room -> account lock inversion.
  foreach v_member in array v_locked_members loop
    if not pg_try_advisory_xact_lock(hashtextextended('account-delete|'||v_member::text,0)) then
      raise exception 'activity_poll_membership_changed';
    end if;
    begin
      perform 1 from auth.users where id=v_member for share nowait;
    exception when lock_not_available then
      raise exception 'activity_poll_membership_changed';
    end;
  end loop;
  if p_room_kind='study_room' then
    perform 1 from quantum_private.study_room_members where room_id=p_room_ref_id order by user_id for share;
  else
    perform 1 from quantum_private.group_mentoring_members where session_id=p_room_ref_id order by user_id for share;
  end if;
  select coalesce(array_agg(m.user_id order by m.user_id),'{}'::uuid[]) into v_current_members
  from (
    select p_actor user_id
    union select user_id from quantum_private.study_room_members
      where p_room_kind='study_room' and room_id=p_room_ref_id and left_at is null
    union select user_id from quantum_private.group_mentoring_members
      where p_room_kind='mentoring' and session_id=p_room_ref_id and accepted and left_at is null
  ) m;
  if v_current_members is distinct from v_locked_members then
    raise exception 'activity_poll_membership_changed';
  end if;
  -- Hosted mentoring also excludes blocked/reported pairs between other current
  -- members; lock every pair, rather than just the actor's own pairs.
  perform quantum_private.group_mentoring_lock_pairs(v_locked_members);
  perform pg_advisory_xact_lock(hashtextextended('chat-poll-room-write|'||p_room_kind||'|'||p_room_ref_id::text,0));
  -- Auth, scope, membership, room lifetime and blocks are authoritative only now.
  return quantum_private.resolve_chat_poll_room(p_room_kind,p_room_ref_id,p_actor,p_require_writable);
end
$$;

alter function quantum_private.chat_poll_creator_alias(text,uuid,uuid)
  rename to chat_poll_creator_alias_before_native;
create function quantum_private.chat_poll_creator_alias(p_room_kind text,p_room_id uuid,p_actor uuid)
returns text
language plpgsql stable security definer set search_path='' as $$
declare v_alias text;
begin
  if p_room_kind='study_room' then
    select btrim(m.alias) into v_alias from quantum_private.study_room_members m
      where m.room_id=p_room_id and m.user_id=p_actor and m.left_at is null;
  elsif p_room_kind='mentoring' then
    select btrim(m.alias) into v_alias from quantum_private.group_mentoring_members m
      where m.session_id=p_room_id and m.user_id=p_actor and m.accepted and m.left_at is null;
  else
    return quantum_private.chat_poll_creator_alias_before_native(p_room_kind,p_room_id,p_actor);
  end if;
  if v_alias is null or char_length(v_alias) not between 1 and 40 then
    raise exception 'activity_poll_forbidden' using errcode='42501';
  end if;
  return v_alias;
end
$$;

revoke all on function
  quantum_private.chat_poll_current_members_before_native(text,uuid),
  quantum_private.chat_poll_current_members(text,uuid),
  quantum_private.resolve_chat_poll_room_before_native(text,uuid,uuid,boolean),
  quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean),
  quantum_private.lock_chat_poll_room_before_native(text,uuid,uuid,boolean),
  quantum_private.lock_chat_poll_room(text,uuid,uuid,boolean),
  quantum_private.chat_poll_creator_alias_before_native(text,uuid,uuid),
  quantum_private.chat_poll_creator_alias(text,uuid,uuid)
from public,anon,authenticated,service_role;

comment on function quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean) is
  'Native study room / hosted mentoring poll adapter. Membership is checked independently of course selection or attendance. Existing scopes preserved.';
commit;
