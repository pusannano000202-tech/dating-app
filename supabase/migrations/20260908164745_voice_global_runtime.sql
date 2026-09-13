begin;

-- Read one persisted voice ownership state for the authenticated account. This
-- deliberately reuses the existing 5 minute queue and 45 second offer contracts;
-- a later remote migration may change those durations only after device evidence.
create function quantum_private.voice_global_runtime_json(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile quantum_private.community_member_profiles%rowtype;
  member quantum_private.voice_members%rowtype;
  session quantum_private.voice_sessions%rowtype;
  room quantum_private.voice_rooms%rowtype;
  advice_queue quantum_private.voice_advice_queue%rowtype;
  random_queue quantum_private.voice_queue%rowtype;
  detail jsonb;
  waiting jsonb;
  revision bigint;
begin
  if p_user is null then raise exception 'not_authenticated'; end if;
  select * into profile
  from quantum_private.community_member_profiles current_profile
  where current_profile.user_id = p_user;
  if profile.user_id is null then raise exception 'minimum_signup_required'; end if;

  select current_member.* into member
  from quantum_private.voice_members current_member
  join quantum_private.voice_sessions current_session on current_session.id = current_member.session_id
  join quantum_private.voice_rooms current_room on current_room.id = current_session.room_id
  where current_member.user_id = p_user
    and current_member.active
    and current_session.state <> 'ended'
  order by current_session.created_at desc
  limit 1;

  if member.user_id is not null then
    select * into session
    from quantum_private.voice_sessions current_session
    where current_session.id = member.session_id;
    select * into room
    from quantum_private.voice_rooms current_room
    where current_room.id = session.room_id;
    if session.expires_at <= now()
      or room.status <> 'open'
      or not quantum_private.voice_room_participant_current(room, p_user)
      or (not member.connected and member.disconnected_at <= now() - interval '2 minutes')
    then
      -- The caller retains only their own cleanup handle, never old room or
      -- participant details after expiry or loss of eligibility.
      return jsonb_build_object(
        'status', 'cleanup_required', 'revision', session.revision,
        'queue', null, 'session', null, 'room', null, 'sessionConnected', false,
        'cleanup', jsonb_build_object('sessionId', session.id, 'revision', session.revision)
      );
    end if;
    detail := quantum_private.voice_session_json(session.id, p_user);
    return jsonb_build_object(
      'status', case
        when session.state = 'active' and member.connected then 'connected'
        else 'offered'
      end,
      'revision', session.revision,
      'queue', null,
      'session', detail -> 'session',
      'room', detail -> 'room',
      'sessionConnected', session.state = 'active' and member.connected
    );
  end if;

  select * into advice_queue
  from quantum_private.voice_advice_queue current_queue
  where current_queue.user_id = p_user
    and current_queue.school_scope = profile.school_scope
    and current_queue.expires_at > now()
    and quantum_private.voice_eligible(current_queue.user_id)
    and quantum_private.voice_rules_current(current_queue.user_id)
  limit 1;

  if advice_queue.user_id is not null then
    waiting := quantum_private.voice_advice_status_json(p_user, advice_queue.advice_topic) -> 'waiting';
    revision := abs(hashtextextended(advice_queue.search_id::text, 0) % 9007199254740991::bigint);
    return jsonb_build_object(
      'status', 'waiting',
      'revision', revision,
      'queue', jsonb_build_object(
        'kind', 'advice',
        'role', advice_queue.role,
        'adviceTopic', advice_queue.advice_topic,
        'topic', 'worries',
        'waitUntil', advice_queue.expires_at,
        'waiting', waiting,
        'talkers', (waiting ->> 'talkers')::integer,
        'listeners', (waiting ->> 'listeners')::integer
      ),
      'session', null,
      'room', null,
      'sessionConnected', false
    );
  end if;

  select * into random_queue
  from quantum_private.voice_queue current_queue
  where current_queue.user_id = p_user
    and current_queue.school_scope = profile.school_scope
    and current_queue.expires_at > now()
    and quantum_private.voice_eligible(current_queue.user_id)
    and quantum_private.voice_rules_current(current_queue.user_id)
  limit 1;

  if random_queue.user_id is not null then
    waiting := quantum_private.voice_summary(
      'random:' || profile.school_scope || ':' || random_queue.topic,
      'waiting_for_voice',
      array(
        select peer.user_id
        from quantum_private.voice_queue peer
        where peer.school_scope = profile.school_scope
          and peer.topic = random_queue.topic
          and peer.expires_at > now()
          and quantum_private.voice_eligible(peer.user_id)
          and quantum_private.voice_rules_current(peer.user_id)
          and exists(
            select 1
            from quantum_private.community_member_profiles current_profile
            where current_profile.user_id = peer.user_id
              and current_profile.school_scope = peer.school_scope
          )
      )
    );
    revision := abs(hashtextextended(random_queue.search_id::text, 0) % 9007199254740991::bigint);
    return jsonb_build_object(
      'status', 'waiting',
      'revision', revision,
      'queue', jsonb_build_object(
        'kind', 'random',
        'role', null,
        'adviceTopic', null,
        'topic', random_queue.topic,
        'waitUntil', random_queue.expires_at,
        'waiting', waiting
      ),
      'session', null,
      'room', null,
      'sessionConnected', false
    );
  end if;

  return jsonb_build_object(
    'status', 'idle',
    'revision', 0,
    'queue', null,
    'session', null,
    'room', null,
    'sessionConnected', false
  );
end;
$$;

create function public.community_voice_runtime_command(
  p_operation text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  command quantum_private.voice_commands%rowtype;
  key uuid;
  expected_revision bigint;
  actual_revision bigint;
  result jsonb;
begin
  if actor is null then raise exception 'not_authenticated'; end if;

  if p_operation = 'status' then
    if p_payload <> '{}'::jsonb then raise exception 'invalid_input'; end if;
    return quantum_private.voice_global_runtime_json(actor);
  end if;

  if p_operation <> 'cancel_waiting' then raise exception 'invalid_input'; end if;
  if jsonb_typeof(p_payload) <> 'object'
    or coalesce(p_payload ->> 'action', '') <> 'cancel_waiting'
    or not (p_payload ? 'expectedRevision')
    or not (p_payload ? 'idempotencyKey')
    or p_payload - array['action', 'expectedRevision', 'idempotencyKey']::text[] <> '{}'::jsonb
    or coalesce(p_payload ->> 'expectedRevision', '') !~ '^[0-9]{1,16}$'
    or coalesce(p_payload ->> 'idempotencyKey', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'invalid_input'; end if;
  if (p_payload ->> 'expectedRevision')::numeric > 9007199254740991
  then raise exception 'invalid_input'; end if;
  key := (p_payload ->> 'idempotencyKey')::uuid;
  expected_revision := (p_payload ->> 'expectedRevision')::bigint;
  if key is null or expected_revision is null then raise exception 'invalid_input'; end if;

  perform pg_advisory_xact_lock(hashtextextended('quantum-voice-ledger-v1', 0));
  select * into command
  from quantum_private.voice_commands current_command
  where current_command.user_id = actor
    and current_command.idempotency_key = key;
  if found then
    if command.operation <> 'runtime_cancel_waiting' or command.payload <> p_payload then
      raise exception 'idempotency_conflict';
    end if;
    return command.response;
  end if;
  if (
    select count(*)
    from quantum_private.voice_commands current_command
    where current_command.user_id = actor
      and current_command.created_at > now() - interval '1 minute'
  ) >= 30 then raise exception 'rate_limited'; end if;

  select abs(hashtextextended(current_queue.search_id::text, 0) % 9007199254740991::bigint)
    into actual_revision
  from quantum_private.voice_advice_queue current_queue
  where current_queue.user_id = actor and current_queue.expires_at > now();
  if actual_revision is null then
    select abs(hashtextextended(current_queue.search_id::text, 0) % 9007199254740991::bigint)
      into actual_revision
    from quantum_private.voice_queue current_queue
    where current_queue.user_id = actor and current_queue.expires_at > now();
  end if;
  if actual_revision is null then raise exception 'not_found'; end if;
  if actual_revision <> expected_revision then raise exception 'stale_revision'; end if;

  delete from quantum_private.voice_advice_queue where user_id = actor;
  delete from quantum_private.voice_queue where user_id = actor;
  result := quantum_private.voice_global_runtime_json(actor);
  insert into quantum_private.voice_commands(
    user_id, idempotency_key, operation, payload, response
  ) values (
    actor, key, 'runtime_cancel_waiting', p_payload, result
  );
  return result;
end;
$$;

revoke all on function quantum_private.voice_global_runtime_json(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.community_voice_runtime_command(text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.community_voice_runtime_command(text,jsonb)
  to authenticated;

comment on function public.community_voice_runtime_command(text,jsonb) is
  'Authenticated global voice ownership snapshot and revision-checked waiting cancellation. No provider token, peer account id, microphone permission, or native push capability is returned.';

commit;
