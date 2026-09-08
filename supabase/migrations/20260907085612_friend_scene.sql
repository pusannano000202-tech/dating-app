-- Evidence-backed friend scene labels and consent-preserving department-team invites.
-- A match id, meetup co-membership, or department membership never creates a friend.
begin;

create or replace function quantum_private.is_active_accepted_friend_pair(
  p_first_user_id uuid,
  p_second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_first_user_id is not null
    and p_second_user_id is not null
    and p_first_user_id <> p_second_user_id
    and exists (
      select 1
      from public.friendships as friendship
      join public.friend_requests as request
        on request.id = friendship.created_from_request_id
      where friendship.user_id = least(p_first_user_id, p_second_user_id)
        and friendship.friend_user_id = greatest(p_first_user_id, p_second_user_id)
        and friendship.status = 'active'
        and request.status = 'accepted'
        and request.receiver_user_id is not null
        and least(request.sender_user_id, request.receiver_user_id) = friendship.user_id
        and greatest(request.sender_user_id, request.receiver_user_id) = friendship.friend_user_id
    )
$$;

revoke all on function quantum_private.is_active_accepted_friend_pair(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_friend_summaries()
returns table (
  user_id uuid,
  display_name text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when friendship.user_id = auth.uid()
      then friendship.friend_user_id else friendship.user_id end,
    profile.display_name,
    friendship.status::text
  from public.friendships as friendship
  join public.friend_requests as request
    on request.id = friendship.created_from_request_id
  left join public.profiles as profile
    on profile.user_id = case when friendship.user_id = auth.uid()
      then friendship.friend_user_id else friendship.user_id end
  where auth.uid() is not null
    and friendship.status = 'active'
    and request.status = 'accepted'
    and request.receiver_user_id is not null
    and least(request.sender_user_id, request.receiver_user_id) = friendship.user_id
    and greatest(request.sender_user_id, request.receiver_user_id) = friendship.friend_user_id
    and auth.uid() in (friendship.user_id, friendship.friend_user_id)
  order by profile.display_name nulls last, friendship.created_at, friendship.user_id;
$$;

revoke all on function public.get_friend_summaries()
  from public, anon, authenticated, service_role;
grant execute on function public.get_friend_summaries() to authenticated;

create or replace function public.get_friend_profile_summary(
  p_friend_user_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  age integer,
  school text,
  department text,
  year integer,
  height integer,
  body_type text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.user_id,
    profile.display_name,
    profile.age,
    profile.school,
    profile.department,
    profile.year,
    profile.height,
    profile.body_type
  from public.profiles as profile
  where auth.uid() is not null
    and p_friend_user_id is not null
    and profile.user_id = p_friend_user_id
    and quantum_private.is_active_accepted_friend_pair(auth.uid(), p_friend_user_id)
$$;

revoke all on function public.get_friend_profile_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_friend_profile_summary(uuid) to authenticated;

create or replace function public.get_my_friend_scene_summaries()
returns table (
  friend_user_id uuid,
  scene_kind text,
  evidence_kind text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  select
    case when friendship.user_id = v_actor
      then friendship.friend_user_id else friendship.user_id end as friend_user_id,
    case
      when exists (
        select 1
        from public.friend_invites as invite
        where invite.friend_request_id = friendship.created_from_request_id
          and invite.status = 'accepted'
          and invite.claimed_by_user_id is not null
          and least(invite.inviter_user_id, invite.claimed_by_user_id) = friendship.user_id
          and greatest(invite.inviter_user_id, invite.claimed_by_user_id) = friendship.friend_user_id
      ) then 'acquaintance'::text
      when friendship.source_match_id is not null then 'app_met'::text
      else 'unclassified'::text
    end as scene_kind,
    case
      when exists (
        select 1
        from public.friend_invites as invite
        where invite.friend_request_id = friendship.created_from_request_id
          and invite.status = 'accepted'
          and invite.claimed_by_user_id is not null
          and least(invite.inviter_user_id, invite.claimed_by_user_id) = friendship.user_id
          and greatest(invite.inviter_user_id, invite.claimed_by_user_id) = friendship.friend_user_id
      ) then 'direct_invite'::text
      when friendship.source_match_id is not null then 'matching'::text
      else 'unknown'::text
    end as evidence_kind
  from public.friendships as friendship
  join public.friend_requests as request
    on request.id = friendship.created_from_request_id
  where friendship.user_id = least(v_actor,
          case when friendship.user_id = v_actor then friendship.friend_user_id else friendship.user_id end)
    and friendship.friend_user_id = greatest(v_actor,
          case when friendship.user_id = v_actor then friendship.friend_user_id else friendship.user_id end)
    and v_actor in (friendship.user_id, friendship.friend_user_id)
    and friendship.status = 'active'
    and request.status = 'accepted'
    and request.receiver_user_id is not null
    and least(request.sender_user_id, request.receiver_user_id) = friendship.user_id
    and greatest(request.sender_user_id, request.receiver_user_id) = friendship.friend_user_id
  order by friend_user_id;
end
$$;

revoke all on function public.get_my_friend_scene_summaries()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_friend_scene_summaries() to authenticated;

create table public.department_challenge_friend_invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.department_challenges(id) on delete restrict,
  team_id uuid not null references public.department_challenge_teams(id) on delete restrict,
  inviter_user_id uuid not null references public.users(id) on delete restrict,
  invitee_user_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  create_idempotency_key uuid not null,
  decision_idempotency_key uuid,
  request_hash text not null check (char_length(request_hash) = 32),
  resulting_revision integer not null check (resulting_revision >= 0),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '7 days'),
  responded_at timestamptz,
  check (inviter_user_id <> invitee_user_id),
  check (expires_at > created_at),
  unique (inviter_user_id, create_idempotency_key)
);

create unique index department_challenge_friend_invites_pending_idx
  on public.department_challenge_friend_invites(challenge_id, invitee_user_id)
  where status = 'pending';
create unique index department_challenge_friend_invites_decision_idempotency_idx
  on public.department_challenge_friend_invites(invitee_user_id, decision_idempotency_key)
  where decision_idempotency_key is not null;
create index department_challenge_friend_invites_incoming_idx
  on public.department_challenge_friend_invites(invitee_user_id, status, created_at desc);
create index department_challenge_friend_invites_team_idx
  on public.department_challenge_friend_invites(team_id, status, created_at);

alter table public.department_challenge_friend_invites enable row level security;
revoke all on table public.department_challenge_friend_invites
  from public, anon, authenticated, service_role;

create or replace function public.get_my_department_challenge_invite_state(
  p_challenge_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_challenge public.department_challenges%rowtype;
  v_actor_school text;
  v_actor_department text;
  v_actor_team public.department_challenge_teams%rowtype;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_challenge_id is null then raise exception 'invalid_challenge_id'; end if;

  select identity.school_scope_key, identity.department_key
    into v_actor_school, v_actor_department
  from quantum_private.get_member_department_identity(v_actor) as identity;
  if v_actor_school is null or v_actor_department is null then
    raise exception 'department_identity_required';
  end if;

  select challenge.* into v_challenge
  from public.department_challenges as challenge
  where challenge.id = p_challenge_id
    and challenge.school_scope_key = v_actor_school;
  if v_challenge.id is null then raise exception 'department_challenge_not_found'; end if;

  select team.* into v_actor_team
  from public.department_challenge_teams as team
  where team.challenge_id = p_challenge_id
    and team.captain_user_id = v_actor
    and team.status = 'accepted'
  order by team.id
  limit 1;

  return jsonb_build_object(
    'challenge_id', v_challenge.id,
    'revision', v_challenge.revision,
    'candidates', case when v_actor_team.id is null
      or v_actor_team.department_key <> v_actor_department
      or v_challenge.status not in ('recruiting', 'opponent_pending', 'scheduled')
      or (select count(*) from public.department_challenge_roster as roster
          where roster.team_id = v_actor_team.id and roster.status = 'accepted') >= v_challenge.team_capacity
      then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', candidate.friend_user_id,
        'display_name', coalesce(profile.friend_recognition_name, profile.display_name, '친구')
      ) order by coalesce(profile.friend_recognition_name, profile.display_name, '친구'), candidate.friend_user_id), '[]'::jsonb)
      from (
        select case when friendship.user_id = v_actor
          then friendship.friend_user_id else friendship.user_id end as friend_user_id
        from public.friendships as friendship
        join public.friend_requests as request
          on request.id = friendship.created_from_request_id
        where v_actor in (friendship.user_id, friendship.friend_user_id)
          and friendship.status = 'active'
          and request.status = 'accepted'
          and request.receiver_user_id is not null
          and least(request.sender_user_id, request.receiver_user_id) = friendship.user_id
          and greatest(request.sender_user_id, request.receiver_user_id) = friendship.friend_user_id
      ) as candidate
      join quantum_private.community_member_profiles as profile
        on profile.user_id = candidate.friend_user_id
      cross join lateral quantum_private.get_member_department_identity(candidate.friend_user_id) as identity
      where identity.school_scope_key = v_actor_school
        and identity.department_key = v_actor_team.department_key
        and not exists (
          select 1 from public.department_challenge_roster as roster
          where roster.challenge_id = p_challenge_id
            and roster.user_id = candidate.friend_user_id
            and roster.status in ('requested', 'accepted')
        )
        and not exists (
          select 1 from public.department_challenge_friend_invites as invite
          where invite.challenge_id = p_challenge_id
            and invite.invitee_user_id = candidate.friend_user_id
            and invite.status = 'pending'
            and invite.expires_at > current_timestamp
        )
    ) end,
    'sent', case when v_actor_team.id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'invite_id', invite.id,
        'user_id', invite.invitee_user_id,
        'display_name', case
          when quantum_private.is_active_accepted_friend_pair(v_actor, invite.invitee_user_id)
            then coalesce(profile.friend_recognition_name, profile.display_name, '친구')
          else '친구 정보 비공개'
        end,
        'status', case when invite.status = 'pending' and invite.expires_at <= current_timestamp
          then 'expired' else invite.status end,
        'expires_at', invite.expires_at
      ) order by invite.created_at, invite.id), '[]'::jsonb)
      from public.department_challenge_friend_invites as invite
      join quantum_private.community_member_profiles as profile
        on profile.user_id = invite.invitee_user_id
      where invite.challenge_id = p_challenge_id
        and invite.inviter_user_id = v_actor
    ) end,
    'incoming', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'invite_id', invite.id,
        'team_id', invite.team_id,
        'display_name', case
          when quantum_private.is_active_accepted_friend_pair(v_actor, invite.inviter_user_id)
            then coalesce(profile.friend_recognition_name, profile.display_name, '친구')
          else '친구 정보 비공개'
        end,
        'status', case when invite.status = 'pending' and invite.expires_at <= current_timestamp
          then 'expired' else invite.status end,
        'expires_at', invite.expires_at
      ) order by invite.created_at, invite.id), '[]'::jsonb)
      from public.department_challenge_friend_invites as invite
      join quantum_private.community_member_profiles as profile
        on profile.user_id = invite.inviter_user_id
      where invite.challenge_id = p_challenge_id
        and invite.invitee_user_id = v_actor
        and invite.status = 'pending'
        and invite.expires_at > current_timestamp
    )
  );
end
$$;

create or replace function public.invite_friend_to_department_challenge(
  p_challenge_id uuid,
  p_team_id uuid,
  p_friend_user_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_hash text;
  v_existing public.department_challenge_friend_invites%rowtype;
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_actor_school text;
  v_actor_department text;
  v_friend_school text;
  v_friend_department text;
  v_invite_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_challenge_id is null or p_team_id is null or p_friend_user_id is null
     or p_expected_revision is null or p_idempotency_key is null
     or p_friend_user_id = v_actor then raise exception 'invalid_friend_invite'; end if;

  v_low := least(v_actor, p_friend_user_id);
  v_high := greatest(v_actor, p_friend_user_id);
  v_hash := md5(p_challenge_id::text || ':' || p_team_id::text || ':' || p_friend_user_id::text);
  -- Both mutable department identities are protected in UUID order. Existing
  -- single-user profile writers share these keys and cannot change either
  -- identity between validation and commit.
  perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:' || v_low::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:' || v_high::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('friend-pair|' || v_low::text || '|' || v_high::text, 0));

  select invite.* into v_existing
  from public.department_challenge_friend_invites as invite
  where invite.inviter_user_id = v_actor
    and invite.create_idempotency_key = p_idempotency_key
  for update;
  if v_existing.id is not null then
    if v_existing.request_hash <> v_hash then raise exception 'idempotency_key_reused'; end if;
    return jsonb_build_object(
      'invite_id', v_existing.id,
      'status', v_existing.status,
      'revision', v_existing.resulting_revision,
      'replayed', true
    );
  end if;

  select challenge.* into v_challenge
  from public.department_challenges as challenge
  where challenge.id = p_challenge_id
  for update;
  if v_challenge.id is null then raise exception 'department_challenge_not_found'; end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status not in ('recruiting', 'opponent_pending', 'scheduled') then raise exception 'department_challenge_closed'; end if;

  select team.* into v_team
  from public.department_challenge_teams as team
  where team.id = p_team_id
    and team.challenge_id = p_challenge_id
    and team.status = 'accepted'
  for update;
  if v_team.id is null or v_team.captain_user_id <> v_actor then raise exception 'captain_required'; end if;

  select identity.school_scope_key, identity.department_key
    into v_actor_school, v_actor_department
  from quantum_private.get_member_department_identity(v_actor) as identity;
  select identity.school_scope_key, identity.department_key
    into v_friend_school, v_friend_department
  from quantum_private.get_member_department_identity(p_friend_user_id) as identity;
  if v_actor_school is null or v_actor_department is null
     or v_friend_school is null or v_friend_department is null then
    raise exception 'department_identity_required';
  end if;
  if v_actor_school <> v_challenge.school_scope_key
     or v_friend_school <> v_challenge.school_scope_key then raise exception 'wrong_school'; end if;
  if v_actor_department <> v_team.department_key
     or v_friend_department <> v_team.department_key then raise exception 'department_restricted'; end if;

  perform 1
  from public.friendships as friendship
  join public.friend_requests as request
    on request.id = friendship.created_from_request_id
  where friendship.user_id = v_low
    and friendship.friend_user_id = v_high
    and friendship.status = 'active'
    and request.status = 'accepted'
    and request.receiver_user_id is not null
    and least(request.sender_user_id, request.receiver_user_id) = v_low
    and greatest(request.sender_user_id, request.receiver_user_id) = v_high
  for update of friendship;
  if not found then raise exception 'active_friendship_required' using errcode = '42501'; end if;

  if (select count(*) from public.department_challenge_roster as roster
      where roster.team_id = p_team_id and roster.status = 'accepted') >= v_challenge.team_capacity then
    raise exception 'department_challenge_team_full';
  end if;
  if exists (
    select 1 from public.department_challenge_roster as roster
    where roster.challenge_id = p_challenge_id
      and roster.user_id = p_friend_user_id
      and roster.status in ('requested', 'accepted')
  ) then raise exception 'friend_already_on_challenge'; end if;
  if exists (
    select 1 from public.department_challenge_friend_invites as invite
    where invite.challenge_id = p_challenge_id
      and invite.invitee_user_id = p_friend_user_id
      and invite.status = 'pending'
      and invite.expires_at > clock_timestamp()
  ) then raise exception 'friend_invite_already_pending'; end if;

  update public.department_challenge_friend_invites as invite
  set status = 'expired', responded_at = clock_timestamp()
  where invite.challenge_id = p_challenge_id
    and invite.invitee_user_id = p_friend_user_id
    and invite.status = 'pending'
    and invite.expires_at <= clock_timestamp();

  insert into public.department_challenge_friend_invites (
    challenge_id, team_id, inviter_user_id, invitee_user_id,
    create_idempotency_key, request_hash, resulting_revision
  ) values (
    p_challenge_id, p_team_id, v_actor, p_friend_user_id,
    p_idempotency_key, v_hash, v_challenge.revision + 1
  ) returning id into v_invite_id;
  update public.department_challenges as challenge
  set revision = challenge.revision + 1,
      updated_at = clock_timestamp()
  where challenge.id = p_challenge_id;

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'status', 'pending',
    'revision', v_challenge.revision + 1,
    'replayed', false
  );
end
$$;

create or replace function public.accept_my_department_challenge_invite(
  p_invite_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_seed public.department_challenge_friend_invites%rowtype;
  v_invite public.department_challenge_friend_invites%rowtype;
  v_low uuid;
  v_high uuid;
  v_challenge public.department_challenges%rowtype;
  v_team public.department_challenge_teams%rowtype;
  v_actor_school text;
  v_actor_department text;
  v_captain_school text;
  v_captain_department text;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_invite_id is null or p_expected_revision is null or p_idempotency_key is null then
    raise exception 'invalid_friend_invite_decision';
  end if;

  select invite.* into v_seed
  from public.department_challenge_friend_invites as invite
  where invite.id = p_invite_id;
  if v_seed.id is null or v_seed.invitee_user_id <> v_actor then
    raise exception 'department_challenge_invite_not_found';
  end if;
  v_low := least(v_actor, v_seed.inviter_user_id);
  v_high := greatest(v_actor, v_seed.inviter_user_id);
  perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:' || v_low::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('quantum:minimum-signup:user:' || v_high::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('friend-pair|' || v_low::text || '|' || v_high::text, 0));

  select challenge.* into v_challenge
  from public.department_challenges as challenge
  where challenge.id = v_seed.challenge_id
  for update;
  if v_challenge.id is null then raise exception 'department_challenge_not_found'; end if;

  if exists (
    select 1
    from public.department_challenge_friend_invites as invite
    where invite.invitee_user_id = v_actor
      and invite.decision_idempotency_key = p_idempotency_key
      and invite.id <> p_invite_id
  ) then raise exception 'idempotency_key_reused'; end if;

  select invite.* into v_invite
  from public.department_challenge_friend_invites as invite
  where invite.id = p_invite_id
  for update;
  if v_invite.id is null or v_invite.invitee_user_id <> v_actor then
    raise exception 'department_challenge_invite_not_found';
  end if;
  if v_invite.status = 'accepted'
     and v_invite.decision_idempotency_key = p_idempotency_key then
    return jsonb_build_object(
      'invite_id', v_invite.id,
      'status', 'accepted',
      'revision', v_invite.resulting_revision,
      'replayed', true
    );
  end if;
  if v_invite.status <> 'pending' then raise exception 'department_challenge_invite_not_pending'; end if;
  if v_invite.expires_at <= clock_timestamp() then
    raise exception 'department_challenge_invite_expired';
  end if;
  if v_challenge.revision <> p_expected_revision then raise exception 'stale_revision'; end if;
  if v_challenge.status not in ('recruiting', 'opponent_pending', 'scheduled') then raise exception 'department_challenge_closed'; end if;

  select team.* into v_team
  from public.department_challenge_teams as team
  where team.id = v_invite.team_id
    and team.challenge_id = v_invite.challenge_id
    and team.status = 'accepted'
  for update;
  if v_team.id is null or v_team.captain_user_id <> v_invite.inviter_user_id then
    raise exception 'captain_changed';
  end if;

  select identity.school_scope_key, identity.department_key
    into v_actor_school, v_actor_department
  from quantum_private.get_member_department_identity(v_actor) as identity;
  select identity.school_scope_key, identity.department_key
    into v_captain_school, v_captain_department
  from quantum_private.get_member_department_identity(v_invite.inviter_user_id) as identity;
  if v_actor_school is null or v_actor_department is null
     or v_captain_school is null or v_captain_department is null then
    raise exception 'department_identity_required';
  end if;
  if v_actor_school <> v_challenge.school_scope_key
     or v_captain_school <> v_challenge.school_scope_key then raise exception 'wrong_school'; end if;
  if v_actor_department <> v_team.department_key
     or v_captain_department <> v_team.department_key then raise exception 'department_identity_changed'; end if;

  perform 1
  from public.friendships as friendship
  join public.friend_requests as request
    on request.id = friendship.created_from_request_id
  where friendship.user_id = v_low
    and friendship.friend_user_id = v_high
    and friendship.status = 'active'
    and request.status = 'accepted'
    and request.receiver_user_id is not null
    and least(request.sender_user_id, request.receiver_user_id) = v_low
    and greatest(request.sender_user_id, request.receiver_user_id) = v_high
  for update of friendship;
  if not found then raise exception 'active_friendship_required' using errcode = '42501'; end if;

  if (select count(*) from public.department_challenge_roster as roster
      where roster.team_id = v_team.id and roster.status = 'accepted') >= v_challenge.team_capacity then
    raise exception 'department_challenge_team_full';
  end if;
  if exists (
    select 1 from public.department_challenge_roster as roster
    where roster.challenge_id = v_challenge.id
      and roster.user_id = v_actor
      and roster.status in ('requested', 'accepted')
      and roster.team_id <> v_team.id
  ) then raise exception 'already_on_other_team'; end if;

  insert into public.department_challenge_roster (
    challenge_id, team_id, user_id, status, department_key_snapshot, accepted_at
  ) values (
    v_challenge.id, v_team.id, v_actor, 'accepted', v_actor_department, clock_timestamp()
  )
  on conflict (challenge_id, user_id) do update
  set team_id = excluded.team_id,
      status = 'accepted',
      department_key_snapshot = excluded.department_key_snapshot,
      revision = public.department_challenge_roster.revision + 1,
      requested_at = clock_timestamp(),
      accepted_at = excluded.accepted_at,
      left_at = null
  where public.department_challenge_roster.status in ('declined', 'left');
  if not found then raise exception 'already_on_challenge'; end if;

  update public.department_challenges as challenge
  set revision = challenge.revision + 1,
      updated_at = clock_timestamp()
  where challenge.id = v_challenge.id;
  update public.department_challenge_friend_invites as invite
  set status = 'accepted',
      decision_idempotency_key = p_idempotency_key,
      responded_at = clock_timestamp(),
      resulting_revision = v_challenge.revision + 1
  where invite.id = v_invite.id;

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'status', 'accepted',
    'revision', v_challenge.revision + 1,
    'replayed', false
  );
end
$$;

revoke all on function public.get_my_department_challenge_invite_state(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.invite_friend_to_department_challenge(uuid, uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_my_department_challenge_invite(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_department_challenge_invite_state(uuid) to authenticated;
grant execute on function public.invite_friend_to_department_challenge(uuid, uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.accept_my_department_challenge_invite(uuid, integer, uuid) to authenticated;

comment on function public.get_my_friend_scene_summaries() is
  'Accepted active friends only. Returns coarse evidence labels without source ids; meetup co-membership is never inferred.';
comment on table public.department_challenge_friend_invites is
  'Explicit friend-to-team invitations. Team acceptance never creates or restores friendship.';

notify pgrst, 'reload schema';
commit;
