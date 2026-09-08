-- Restore the approved Day 1 private game ballot and Day 3 bowling tiebreak
-- without exposing private votes or replacing the existing public RPC wire.

create table public.quantum_continuation_day1_game_votes (
  occurrence_id uuid not null references public.quantum_continuation_occurrences(id) on delete restrict,
  participant_user_id uuid not null references public.users(id) on delete restrict,
  choice text not null check (choice in ('dalmuti', 'halligalli', 'one-card')),
  voted_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (occurrence_id, participant_user_id),
  foreign key (occurrence_id, participant_user_id)
    references public.quantum_continuation_occurrence_members(occurrence_id, participant_user_id)
    on delete restrict
);

alter table public.quantum_continuation_day1_game_votes enable row level security;
revoke all on table public.quantum_continuation_day1_game_votes
  from public, anon, authenticated, service_role;

create or replace function quantum_private.continuation_day1_private_game_runtime(
  p_occurrence_id uuid,
  p_actor uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_attendance_status text;
  v_vote_open boolean;
  v_result_available boolean;
  v_my_vote text;
  v_selected_game text;
  v_top_vote_count integer;
begin
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id;
  select member.attendance_status into v_attendance_status
  from public.quantum_continuation_occurrence_members as member
  where member.occurrence_id = p_occurrence_id
    and member.participant_user_id = p_actor
    and member.visible_from_program_day <= 1;
  if v_occurrence.id is null or v_occurrence.program_day <> 1
     or v_attendance_status is null or v_attendance_status = 'cancelled' then
    raise exception 'continuation_occurrence_not_found';
  end if;

  v_vote_open := v_occurrence.status in ('confirmed', 'in_progress')
    and p_now >= v_occurrence.starts_at + interval '80 minutes'
    and p_now < v_occurrence.starts_at + interval '85 minutes';
  v_result_available := p_now >= v_occurrence.starts_at + interval '85 minutes';

  select vote.choice into v_my_vote
  from public.quantum_continuation_day1_game_votes as vote
  where vote.occurrence_id = p_occurrence_id
    and vote.participant_user_id = p_actor;

  if v_result_available then
    select pg_catalog.max(grouped.vote_count) into v_top_vote_count
    from (
      select vote.choice, pg_catalog.count(*)::integer as vote_count
      from public.quantum_continuation_day1_game_votes as vote
      where vote.occurrence_id = p_occurrence_id
      group by vote.choice
    ) as grouped;
    if v_top_vote_count is not null then
      select case
        when pg_catalog.count(*) filter (where grouped.vote_count = v_top_vote_count) > 1 then 'dalmuti'
        else pg_catalog.max(grouped.choice) filter (where grouped.vote_count = v_top_vote_count)
      end into v_selected_game
      from (
        select vote.choice, pg_catalog.count(*)::integer as vote_count
        from public.quantum_continuation_day1_game_votes as vote
        where vote.occurrence_id = p_occurrence_id
        group by vote.choice
      ) as grouped;
    end if;
    -- The approved local rule resolves every tie, including zero submitted
    -- votes, to Dalmuti without making voting mandatory.
    v_selected_game := coalesce(v_selected_game, 'dalmuti');
  end if;

  return pg_catalog.jsonb_build_object(
    'kind', 'day1',
    'vote_open', v_vote_open,
    'can_vote', v_vote_open and v_attendance_status in ('confirmed', 'present'),
    'result_available', v_result_available,
    'my_vote', v_my_vote,
    'selected_game', case when v_result_available then v_selected_game else null end,
    'can_finish', v_occurrence.status in ('confirmed', 'in_progress')
      and v_attendance_status in ('confirmed', 'present')
      and p_now >= v_occurrence.ends_at - interval '5 minutes'
      and coalesce((v_occurrence.content_state ->> 'game_finished')::boolean, false)
  );
end
$$;

revoke all on function quantum_private.continuation_day1_private_game_runtime(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function quantum_private.continuation_day3_tiebreak_calculation(
  p_occurrence_id uuid,
  p_scores jsonb,
  p_one_ball_scores jsonb default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_member_count integer;
  v_has_last_frame boolean;
  v_metrics jsonb;
  v_tied_teams text[] := array[]::text[];
  v_phase text;
  v_result jsonb;
begin
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id;
  if v_occurrence.id is null or v_occurrence.program_day <> 3 then
    raise exception 'continuation_occurrence_not_found';
  end if;
  select pg_catalog.count(*)::integer into v_member_count
  from public.quantum_continuation_occurrence_members as member
  where member.occurrence_id = p_occurrence_id
    and member.attendance_status <> 'cancelled';

  if v_member_count in (3, 4) then
    return pg_catalog.jsonb_build_object(
      'phase', 'resolved',
      'tied_teams', '[]'::jsonb,
      'result', '[]'::jsonb
    );
  end if;
  if v_member_count not in (5, 6)
     or pg_catalog.jsonb_typeof(v_occurrence.content_state -> 'bowling_teams') <> 'array'
     or pg_catalog.jsonb_typeof(p_scores) <> 'array' then
    raise exception 'bowling_roster_not_supported';
  end if;

  v_has_last_frame := not exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_scores) as score(value)
    where not (score.value ? 'last_frame_score')
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'team', calculated.team_name,
    'adjusted_metric', calculated.adjusted_metric,
    'raw_metric', calculated.raw_metric,
    'last_frame_metric', calculated.last_frame_metric
  ) order by calculated.team_name), '[]'::jsonb)
  into v_metrics
  from (
    select team.value ->> 'team' as team_name,
           pg_catalog.sum(
             (score.value ->> 'score')::numeric
             * case when profile.gender = 'female' then 1.5 else 1 end
           ) / case when v_member_count = 5 then pg_catalog.count(*) else 1 end as adjusted_metric,
           pg_catalog.sum((score.value ->> 'score')::numeric) as raw_metric,
           case when v_has_last_frame
             then pg_catalog.sum((score.value ->> 'last_frame_score')::numeric)
             else null
           end as last_frame_metric
    from pg_catalog.jsonb_array_elements(v_occurrence.content_state -> 'bowling_teams') as team(value)
    join pg_catalog.jsonb_array_elements(p_scores) as score(value)
      on score.value ->> 'alias' = team.value ->> 'alias'
    join public.quantum_continuation_occurrence_members as member
      on member.occurrence_id = p_occurrence_id
     and member.alias = team.value ->> 'alias'
     and member.attendance_status <> 'cancelled'
    join public.profiles as profile on profile.user_id = member.participant_user_id
    group by team.value ->> 'team'
  ) as calculated;

  if pg_catalog.jsonb_array_length(v_metrics) not in (2, 3) then
    raise exception 'bowling_roster_not_supported';
  end if;

  select coalesce(pg_catalog.array_agg(distinct left_metric.value ->> 'team'
    order by left_metric.value ->> 'team'), array[]::text[])
  into v_tied_teams
  from pg_catalog.jsonb_array_elements(v_metrics) as left_metric(value)
  where exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_metrics) as right_metric(value)
    where right_metric.value ->> 'team' <> left_metric.value ->> 'team'
      and (right_metric.value ->> 'adjusted_metric')::numeric
        = (left_metric.value ->> 'adjusted_metric')::numeric
      and (right_metric.value ->> 'raw_metric')::numeric
        = (left_metric.value ->> 'raw_metric')::numeric
      and (not v_has_last_frame or
        (right_metric.value ->> 'last_frame_metric')::numeric
          = (left_metric.value ->> 'last_frame_metric')::numeric)
  );

  if pg_catalog.array_length(v_tied_teams, 1) is not null and not v_has_last_frame then
    return pg_catalog.jsonb_build_object(
      'phase', 'needs_last_frame',
      'tied_teams', pg_catalog.to_jsonb(v_tied_teams),
      'result', '[]'::jsonb
    );
  end if;
  if pg_catalog.array_length(v_tied_teams, 1) is not null and p_one_ball_scores is null then
    return pg_catalog.jsonb_build_object(
      'phase', 'needs_one_ball',
      'tied_teams', pg_catalog.to_jsonb(v_tied_teams),
      'result', '[]'::jsonb
    );
  end if;
  v_phase := 'resolved';

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'team', ranked.team_name,
    'total', pg_catalog.round(ranked.adjusted_metric, 1),
    'rank', ranked.team_rank,
    'tied', ranked.same_score_count > 1
  ) order by ranked.team_rank, ranked.team_name), '[]'::jsonb)
  into v_result
  from (
    select ordered.team_name,
           ordered.adjusted_metric,
           pg_catalog.rank() over (
             order by ordered.adjusted_metric desc, ordered.raw_metric desc,
                      ordered.last_frame_metric desc nulls last, ordered.one_ball desc
           )::integer as team_rank,
           pg_catalog.count(*) over (
             partition by ordered.adjusted_metric, ordered.raw_metric,
                          ordered.last_frame_metric, ordered.one_ball
           )::integer as same_score_count
    from (
      select metric.value ->> 'team' as team_name,
             (metric.value ->> 'adjusted_metric')::numeric as adjusted_metric,
             (metric.value ->> 'raw_metric')::numeric as raw_metric,
             (metric.value ->> 'last_frame_metric')::numeric as last_frame_metric,
             coalesce((one_ball.value ->> 'score')::integer, 0) as one_ball
      from pg_catalog.jsonb_array_elements(v_metrics) as metric(value)
      left join lateral (
        select score.value
        from pg_catalog.jsonb_array_elements(coalesce(p_one_ball_scores, '[]'::jsonb)) as score(value)
        where score.value ->> 'team' = metric.value ->> 'team'
        limit 1
      ) as one_ball on true
    ) as ordered
  ) as ranked;

  return pg_catalog.jsonb_build_object(
    'phase', v_phase,
    'tied_teams', '[]'::jsonb,
    'result', v_result
  );
end
$$;

revoke all on function quantum_private.continuation_day3_tiebreak_calculation(uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create or replace function quantum_private.continuation_day3_tiebreak_runtime(p_occurrence_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_phase text;
  v_tied_teams jsonb;
begin
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id;
  if v_occurrence.id is null or v_occurrence.program_day <> 3 then
    raise exception 'continuation_occurrence_not_found';
  end if;
  if not (v_occurrence.content_state ? 'game_scores') then
    v_phase := 'none';
    v_tied_teams := '[]'::jsonb;
  elsif v_occurrence.content_state ->> 'day3_tiebreak_phase'
      in ('needs_last_frame', 'needs_one_ball', 'resolved')
      and pg_catalog.jsonb_typeof(v_occurrence.content_state -> 'day3_tied_teams') = 'array' then
    v_phase := v_occurrence.content_state ->> 'day3_tiebreak_phase';
    v_tied_teams := v_occurrence.content_state -> 'day3_tied_teams';
  else
    -- Previously stored score states remain finishable and replayable.
    v_phase := 'resolved';
    v_tied_teams := '[]'::jsonb;
  end if;
  return pg_catalog.jsonb_build_object(
    'kind', 'day3',
    'tie_break_phase', v_phase,
    'tied_teams', v_tied_teams
  );
end
$$;

revoke all on function quantum_private.continuation_day3_tiebreak_runtime(uuid)
  from public, anon, authenticated, service_role;

alter function public.get_my_continuation_occurrence_content(uuid)
  rename to get_my_continuation_occurrence_content_legacy_20260906130854;
alter function public.apply_my_continuation_content_action(uuid, text, jsonb, integer, uuid)
  rename to apply_my_continuation_content_action_legacy_20260906130854;

revoke all on function public.get_my_continuation_occurrence_content_legacy_20260906130854(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_my_continuation_content_action_legacy_20260906130854(uuid, text, jsonb, integer, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_continuation_occurrence_content(p_occurrence_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_base jsonb;
  v_program_day integer;
  v_now timestamptz;
  v_runtime jsonb;
  v_content_state jsonb;
  v_commands jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  v_base := public.get_my_continuation_occurrence_content_legacy_20260906130854(p_occurrence_id);
  v_program_day := (v_base ->> 'program_day')::integer;
  v_now := (v_base ->> 'server_now')::timestamptz;

  if v_program_day = 1 then
    v_runtime := quantum_private.continuation_day1_private_game_runtime(p_occurrence_id, v_actor, v_now);
    v_content_state := (v_base -> 'content_state') - 'selected_game';
    if v_content_state ->> 'last_action' = 'select_game' then
      v_content_state := v_content_state - 'last_action' - 'last_payload' - 'last_actor_alias';
    end if;
    select coalesce(pg_catalog.jsonb_agg(command.value order by command.ordinality), '[]'::jsonb)
    into v_commands
    from pg_catalog.jsonb_array_elements(v_base -> 'commands') with ordinality as command(value, ordinality)
    where command.value ->> 'action' <> 'select_game';
    v_base := pg_catalog.jsonb_set(
      v_base,
      '{content_state}',
      v_content_state
    );
    v_base := pg_catalog.jsonb_set(v_base, '{commands}', v_commands);
  elsif v_program_day = 3 then
    v_runtime := quantum_private.continuation_day3_tiebreak_runtime(p_occurrence_id);
  else
    v_runtime := v_base -> 'runtime';
  end if;

  return v_base || pg_catalog.jsonb_build_object('runtime', v_runtime);
end
$$;

revoke all on function public.get_my_continuation_occurrence_content(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_continuation_occurrence_content(uuid)
  to authenticated;

create or replace function public.apply_my_continuation_content_action(
  p_occurrence_id uuid,
  p_action text,
  p_payload jsonb,
  p_expected_content_revision integer,
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
  v_action text;
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_attendance_status text;
  v_existing_runtime public.quantum_continuation_content_runtime_commands%rowtype;
  v_existing_legacy public.quantum_continuation_content_commands%rowtype;
  v_now timestamptz;
  v_member_count integer;
  v_scores jsonb;
  v_calculation jsonb;
  v_tied_teams jsonb;
  v_resulting_revision integer;
begin
  v_action := pg_catalog.btrim(p_action);
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_occurrence_id is null or p_action is null
     or pg_catalog.char_length(v_action) not between 1 and 80
     or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or pg_catalog.octet_length(p_payload::text) > 12000
     or p_expected_content_revision is null or p_expected_content_revision < 0
     or p_idempotency_key is null then
    raise exception 'invalid_content_action';
  end if;

  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  join public.quantum_continuation_occurrence_members as member
    on member.occurrence_id = occurrence.id
   and member.participant_user_id = v_actor
   and member.attendance_status <> 'cancelled'
  where occurrence.id = p_occurrence_id;
  if v_occurrence.id is null then raise exception 'continuation_occurrence_not_found'; end if;
  select member.attendance_status into v_attendance_status
  from public.quantum_continuation_occurrence_members as member
  where member.occurrence_id = p_occurrence_id
    and member.participant_user_id = v_actor;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'continuation-runtime-command:' || v_actor::text || ':' || p_idempotency_key::text,
    0
  ));
  select command.* into v_existing_runtime
  from public.quantum_continuation_content_runtime_commands as command
  where command.actor_user_id = v_actor
    and command.idempotency_key = p_idempotency_key;
  if v_existing_runtime.actor_user_id is not null then
    if v_existing_runtime.occurrence_id <> p_occurrence_id
       or v_existing_runtime.action <> v_action
       or v_existing_runtime.payload <> p_payload
       or v_existing_runtime.prior_content_revision <> p_expected_content_revision then
      raise exception 'idempotency_key_reused';
    end if;
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  select command.* into v_existing_legacy
  from public.quantum_continuation_content_commands as command
  where command.actor_user_id = v_actor
    and command.idempotency_key = p_idempotency_key;
  if v_existing_legacy.id is not null then
    if v_existing_legacy.occurrence_id <> p_occurrence_id
       or v_existing_legacy.action <> v_action
       or v_existing_legacy.payload <> p_payload
       or v_existing_legacy.prior_revision <> p_expected_content_revision then
      raise exception 'idempotency_key_reused';
    end if;
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  if v_occurrence.program_day = 1 and v_action = 'select_game' then
    raise exception 'content_runtime_action_replaced_not_allowed';
  end if;

  if v_action = 'vote_day1_game' then
    if v_occurrence.program_day <> 1 then raise exception 'content_action_not_allowed_for_day'; end if;
    if p_payload - 'choice' <> '{}'::jsonb
       or not (p_payload ? 'choice')
       or p_payload ->> 'choice' not in ('dalmuti', 'halligalli', 'one-card') then
      raise exception 'invalid_content_payload';
    end if;
    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    select member.attendance_status into v_attendance_status
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
    for share;
    v_now := pg_catalog.clock_timestamp();
    if v_attendance_status not in ('confirmed', 'present')
       or v_occurrence.status not in ('confirmed', 'in_progress') then
      raise exception 'content_action_locked';
    end if;
    if v_now < v_occurrence.starts_at + interval '80 minutes'
       or v_now >= v_occurrence.starts_at + interval '85 minutes' then
      raise exception 'content_action_time_closed';
    end if;
    if v_occurrence.content_revision <> p_expected_content_revision then
      raise exception 'stale_content_revision';
    end if;
    insert into public.quantum_continuation_day1_game_votes(
      occurrence_id, participant_user_id, choice, voted_at
    ) values (
      p_occurrence_id, v_actor, p_payload ->> 'choice', v_now
    ) on conflict (occurrence_id, participant_user_id) do update
      set choice = excluded.choice,
          voted_at = excluded.voted_at;
    insert into public.quantum_continuation_content_runtime_commands(
      actor_user_id, idempotency_key, occurrence_id, action, payload,
      prior_content_revision, resulting_content_revision, resulting_runtime_version
    ) values (
      v_actor, p_idempotency_key, p_occurrence_id, v_action, p_payload,
      p_expected_content_revision, p_expected_content_revision, 0
    );
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  if v_occurrence.program_day = 1 and v_action = 'start_game' then
    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    if v_occurrence.content_revision <> p_expected_content_revision then
      raise exception 'stale_content_revision';
    end if;
    if not coalesce((v_occurrence.content_state ->> 'game_started')::boolean, false) then
      update public.quantum_continuation_occurrences as occurrence
      set content_state = occurrence.content_state || pg_catalog.jsonb_build_object('selected_game', 'dalmuti')
      where occurrence.id = p_occurrence_id;
    end if;
    return public.apply_my_continuation_content_action_legacy_20260906130854(
      p_occurrence_id, v_action, p_payload, p_expected_content_revision, p_idempotency_key
    );
  end if;

  if v_occurrence.program_day = 1 and v_action = 'finish_occurrence' then
    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    if pg_catalog.clock_timestamp() < v_occurrence.ends_at - interval '5 minutes' then
      raise exception 'content_action_time_closed';
    end if;
    return public.apply_my_continuation_content_action_legacy_20260906130854(
      p_occurrence_id, v_action, p_payload, p_expected_content_revision, p_idempotency_key
    );
  end if;

  if v_action = 'save_game_scores' and v_occurrence.program_day = 3 then
    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    select member.attendance_status into v_attendance_status
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
    for share;
    if v_attendance_status not in ('confirmed', 'present') then raise exception 'content_action_locked'; end if;
    if v_occurrence.content_revision <> p_expected_content_revision then raise exception 'stale_content_revision'; end if;
    select pg_catalog.count(*)::integer into v_member_count
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id and member.attendance_status <> 'cancelled';
    if p_payload - 'scores' <> '{}'::jsonb
       or not (p_payload ? 'scores')
       or pg_catalog.jsonb_typeof(p_payload -> 'scores') <> 'array'
       or pg_catalog.jsonb_array_length(p_payload -> 'scores') <> v_member_count
       or exists (
         select 1
         from pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)
         where pg_catalog.jsonb_typeof(score.value) <> 'object'
           or score.value - 'alias' - 'score' - 'last_frame_score' <> '{}'::jsonb
           or not (score.value ?& array['alias', 'score'])
           or pg_catalog.jsonb_typeof(score.value -> 'alias') <> 'string'
           or pg_catalog.jsonb_typeof(score.value -> 'score') <> 'number'
           or score.value ->> 'score' !~ '^[0-9]{1,3}$'
           or (score.value ->> 'score')::integer not between 0 and 300
           or ((score.value ? 'last_frame_score') and (
             pg_catalog.jsonb_typeof(score.value -> 'last_frame_score') <> 'number'
             or score.value ->> 'last_frame_score' !~ '^[0-9]{1,2}$'
             or (score.value ->> 'last_frame_score')::integer not between 0 and 30
           ))
           or not exists (
             select 1
             from public.quantum_continuation_occurrence_members as member
             where member.occurrence_id = p_occurrence_id
               and member.attendance_status <> 'cancelled'
               and member.alias = score.value ->> 'alias'
           )
       )
       or (select pg_catalog.count(distinct score.value ->> 'alias')
           from pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)) <> v_member_count
       or (select pg_catalog.count(*)
           from pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)
           where score.value ? 'last_frame_score') not in (0, v_member_count) then
      raise exception 'content_sequence_not_ready';
    end if;
    select pg_catalog.jsonb_agg(score.value - 'last_frame_score' order by score.ordinality)
    into v_scores
    from pg_catalog.jsonb_array_elements(p_payload -> 'scores') with ordinality as score(value, ordinality);
    perform public.apply_my_continuation_content_action_legacy_20260906130854(
      p_occurrence_id,
      v_action,
      pg_catalog.jsonb_build_object('scores', v_scores),
      p_expected_content_revision,
      p_idempotency_key
    );
    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    v_calculation := quantum_private.continuation_day3_tiebreak_calculation(
      p_occurrence_id, p_payload -> 'scores', null
    );
    update public.quantum_continuation_occurrences as occurrence
    set content_state = occurrence.content_state
      || pg_catalog.jsonb_build_object(
        'game_scores', p_payload -> 'scores',
        'bowling_result', v_calculation -> 'result',
        'day3_tiebreak_phase', v_calculation ->> 'phase',
        'day3_tied_teams', v_calculation -> 'tied_teams'
      ) - 'bowling_one_ball_scores',
        updated_at = pg_catalog.clock_timestamp()
    where occurrence.id = p_occurrence_id;
    insert into public.quantum_continuation_content_runtime_commands(
      actor_user_id, idempotency_key, occurrence_id, action, payload,
      prior_content_revision, resulting_content_revision, resulting_runtime_version
    ) values (
      v_actor, p_idempotency_key, p_occurrence_id, v_action, p_payload,
      p_expected_content_revision, p_expected_content_revision + 1, p_expected_content_revision + 1
    );
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  if v_action = 'save_bowling_last_frame_scores' then
    if v_occurrence.program_day <> 3 then raise exception 'content_action_not_allowed_for_day'; end if;
    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    select member.attendance_status into v_attendance_status
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
    for share;
    if v_attendance_status not in ('confirmed', 'present')
       or v_occurrence.status not in ('confirmed', 'in_progress') then
      raise exception 'content_action_locked';
    end if;
    v_now := pg_catalog.clock_timestamp();
    if v_now < v_occurrence.starts_at - interval '15 minutes'
       or v_now > v_occurrence.ends_at + interval '6 hours' then
      raise exception 'content_action_time_closed';
    end if;
    if v_occurrence.content_revision <> p_expected_content_revision then raise exception 'stale_content_revision'; end if;
    if v_occurrence.content_state ->> 'day3_tiebreak_phase' is distinct from 'needs_last_frame' then
      raise exception 'content_sequence_not_ready';
    end if;
    select pg_catalog.count(*)::integer into v_member_count
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id and member.attendance_status <> 'cancelled';
    if p_payload - 'scores' <> '{}'::jsonb
       or not (p_payload ? 'scores')
       or pg_catalog.jsonb_typeof(p_payload -> 'scores') <> 'array'
       or pg_catalog.jsonb_array_length(p_payload -> 'scores') <> v_member_count
       or exists (
         select 1
         from pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)
         where pg_catalog.jsonb_typeof(score.value) <> 'object'
           or score.value - 'alias' - 'score' <> '{}'::jsonb
           or not (score.value ?& array['alias', 'score'])
           or pg_catalog.jsonb_typeof(score.value -> 'alias') <> 'string'
           or pg_catalog.jsonb_typeof(score.value -> 'score') <> 'number'
           or score.value ->> 'score' !~ '^[0-9]{1,2}$'
           or (score.value ->> 'score')::integer not between 0 and 30
           or not exists (
             select 1 from public.quantum_continuation_occurrence_members as member
             where member.occurrence_id = p_occurrence_id
               and member.attendance_status <> 'cancelled'
               and member.alias = score.value ->> 'alias'
           )
       )
       or (select pg_catalog.count(distinct score.value ->> 'alias')
           from pg_catalog.jsonb_array_elements(p_payload -> 'scores') as score(value)) <> v_member_count then
      raise exception 'content_sequence_not_ready';
    end if;
    select pg_catalog.jsonb_agg(
      stored.value || pg_catalog.jsonb_build_object('last_frame_score', submitted.value -> 'score')
      order by stored.ordinality
    ) into v_scores
    from pg_catalog.jsonb_array_elements(v_occurrence.content_state -> 'game_scores') with ordinality as stored(value, ordinality)
    join pg_catalog.jsonb_array_elements(p_payload -> 'scores') as submitted(value)
      on submitted.value ->> 'alias' = stored.value ->> 'alias';
    v_calculation := quantum_private.continuation_day3_tiebreak_calculation(p_occurrence_id, v_scores, null);
    if v_calculation ->> 'phase' not in ('needs_one_ball', 'resolved') then
      raise exception 'content_sequence_not_ready';
    end if;
    v_resulting_revision := p_expected_content_revision + 1;
    update public.quantum_continuation_occurrences as occurrence
    set content_state = occurrence.content_state
      || pg_catalog.jsonb_build_object(
        'game_scores', v_scores,
        'bowling_result', v_calculation -> 'result',
        'day3_tiebreak_phase', v_calculation ->> 'phase',
        'day3_tied_teams', v_calculation -> 'tied_teams',
        'last_action', v_action,
        'last_payload', p_payload,
        'last_actor_alias', (
          select member.alias from public.quantum_continuation_occurrence_members as member
          where member.occurrence_id = p_occurrence_id and member.participant_user_id = v_actor
        ),
        'completed', false
      ),
        content_revision = occurrence.content_revision + 1,
        status = 'in_progress',
        revision = occurrence.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where occurrence.id = p_occurrence_id
      and occurrence.content_revision = p_expected_content_revision;
    if not found then raise exception 'stale_content_revision'; end if;
    insert into public.quantum_continuation_content_commands(
      occurrence_id, actor_user_id, action, payload, prior_revision,
      resulting_revision, idempotency_key
    ) values (
      p_occurrence_id, v_actor, v_action, p_payload, p_expected_content_revision,
      v_resulting_revision, p_idempotency_key
    );
    insert into public.quantum_continuation_content_runtime_commands(
      actor_user_id, idempotency_key, occurrence_id, action, payload,
      prior_content_revision, resulting_content_revision, resulting_runtime_version
    ) values (
      v_actor, p_idempotency_key, p_occurrence_id, v_action, p_payload,
      p_expected_content_revision, v_resulting_revision, v_resulting_revision
    );
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  if v_action = 'save_bowling_one_ball_scores' then
    if v_occurrence.program_day <> 3 then raise exception 'content_action_not_allowed_for_day'; end if;
    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    select member.attendance_status into v_attendance_status
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
    for share;
    if v_attendance_status not in ('confirmed', 'present')
       or v_occurrence.status not in ('confirmed', 'in_progress') then
      raise exception 'content_action_locked';
    end if;
    v_now := pg_catalog.clock_timestamp();
    if v_now < v_occurrence.starts_at - interval '15 minutes'
       or v_now > v_occurrence.ends_at + interval '6 hours' then
      raise exception 'content_action_time_closed';
    end if;
    if v_occurrence.content_revision <> p_expected_content_revision then raise exception 'stale_content_revision'; end if;
    if v_occurrence.content_state ->> 'day3_tiebreak_phase' is distinct from 'needs_one_ball'
       or pg_catalog.jsonb_typeof(v_occurrence.content_state -> 'day3_tied_teams') <> 'array' then
      raise exception 'content_sequence_not_ready';
    end if;
    v_tied_teams := v_occurrence.content_state -> 'day3_tied_teams';
    if p_payload - 'team_scores' <> '{}'::jsonb
       or not (p_payload ? 'team_scores')
       or pg_catalog.jsonb_typeof(p_payload -> 'team_scores') <> 'array'
       or pg_catalog.jsonb_array_length(p_payload -> 'team_scores') <> pg_catalog.jsonb_array_length(v_tied_teams)
       or exists (
         select 1
         from pg_catalog.jsonb_array_elements(p_payload -> 'team_scores') as score(value)
         where pg_catalog.jsonb_typeof(score.value) <> 'object'
           or score.value - 'team' - 'score' <> '{}'::jsonb
           or not (score.value ?& array['team', 'score'])
           or score.value ->> 'team' not in ('A', 'B', 'C')
           or not (v_tied_teams ? (score.value ->> 'team'))
           or pg_catalog.jsonb_typeof(score.value -> 'score') <> 'number'
           or score.value ->> 'score' !~ '^(10|[0-9])$'
           or (score.value ->> 'score')::integer not between 0 and 10
       )
       or (select pg_catalog.count(distinct score.value ->> 'team')
           from pg_catalog.jsonb_array_elements(p_payload -> 'team_scores') as score(value))
          <> pg_catalog.jsonb_array_length(v_tied_teams) then
      raise exception 'content_sequence_not_ready';
    end if;
    v_calculation := quantum_private.continuation_day3_tiebreak_calculation(
      p_occurrence_id,
      v_occurrence.content_state -> 'game_scores',
      p_payload -> 'team_scores'
    );
    if v_calculation ->> 'phase' <> 'resolved' then raise exception 'content_sequence_not_ready'; end if;
    v_resulting_revision := p_expected_content_revision + 1;
    update public.quantum_continuation_occurrences as occurrence
    set content_state = occurrence.content_state
      || pg_catalog.jsonb_build_object(
        'bowling_one_ball_scores', p_payload -> 'team_scores',
        'bowling_result', v_calculation -> 'result',
        'day3_tiebreak_phase', 'resolved',
        'day3_tied_teams', '[]'::jsonb,
        'last_action', v_action,
        'last_payload', p_payload,
        'last_actor_alias', (
          select member.alias from public.quantum_continuation_occurrence_members as member
          where member.occurrence_id = p_occurrence_id and member.participant_user_id = v_actor
        ),
        'completed', false
      ),
        content_revision = occurrence.content_revision + 1,
        status = 'in_progress',
        revision = occurrence.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where occurrence.id = p_occurrence_id
      and occurrence.content_revision = p_expected_content_revision;
    if not found then raise exception 'stale_content_revision'; end if;
    insert into public.quantum_continuation_content_commands(
      occurrence_id, actor_user_id, action, payload, prior_revision,
      resulting_revision, idempotency_key
    ) values (
      p_occurrence_id, v_actor, v_action, p_payload, p_expected_content_revision,
      v_resulting_revision, p_idempotency_key
    );
    insert into public.quantum_continuation_content_runtime_commands(
      actor_user_id, idempotency_key, occurrence_id, action, payload,
      prior_content_revision, resulting_content_revision, resulting_runtime_version
    ) values (
      v_actor, p_idempotency_key, p_occurrence_id, v_action, p_payload,
      p_expected_content_revision, v_resulting_revision, v_resulting_revision
    );
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  if v_occurrence.program_day = 3 and v_action = 'finish_occurrence' then
    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    if v_occurrence.content_revision <> p_expected_content_revision then
      raise exception 'stale_content_revision';
    end if;
    if v_occurrence.content_state ->> 'day3_tiebreak_phase'
       in ('needs_last_frame', 'needs_one_ball') then
      raise exception 'content_sequence_not_ready';
    end if;
    return public.apply_my_continuation_content_action_legacy_20260906130854(
      p_occurrence_id, v_action, p_payload, p_expected_content_revision, p_idempotency_key
    );
  end if;

  if v_action in ('vote_day1_game', 'save_bowling_last_frame_scores', 'save_bowling_one_ball_scores') then
    raise exception 'content_action_not_allowed_for_day';
  end if;

  return public.apply_my_continuation_content_action_legacy_20260906130854(
    p_occurrence_id, v_action, p_payload, p_expected_content_revision, p_idempotency_key
  );
end
$$;

revoke all on function public.apply_my_continuation_content_action(uuid, text, jsonb, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_my_continuation_content_action(uuid, text, jsonb, integer, uuid)
  to authenticated;
