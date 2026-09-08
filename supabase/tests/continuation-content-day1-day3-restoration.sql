-- Run only after 20260906130854_continuation_day1_vote_day3_tiebreak.sql is
-- applied to the parent-owned disposable local database. Everything rolls back.
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(8);

select extensions.has_table(
  'public', 'quantum_continuation_day1_game_votes',
  'Day 1 private game vote storage exists'
);
select extensions.ok(
  (select class.relrowsecurity
   from pg_catalog.pg_class as class
   where class.oid = 'public.quantum_continuation_day1_game_votes'::regclass),
  'Day 1 vote storage has RLS enabled'
);
select extensions.table_privs_are(
  'public', 'quantum_continuation_day1_game_votes', 'authenticated',
  array[]::text[], 'participants cannot query raw votes'
);
select extensions.table_privs_are(
  'public', 'quantum_continuation_day1_game_votes', 'service_role',
  array[]::text[], 'service role has no direct raw-vote grant'
);
select extensions.function_privs_are(
  'public', 'get_my_continuation_occurrence_content', array['uuid'],
  'authenticated', array['EXECUTE'], 'the public GET signature stays executable'
);
select extensions.function_privs_are(
  'public', 'apply_my_continuation_content_action',
  array['uuid', 'text', 'jsonb', 'integer', 'uuid'],
  'authenticated', array['EXECUTE'], 'the public action signature stays executable'
);
select extensions.function_privs_are(
  'public', 'get_my_continuation_occurrence_content_legacy_20260906130854', array['uuid'],
  'authenticated', array[]::text[], 'the renamed GET implementation is private by grant'
);
select extensions.function_privs_are(
  'public', 'apply_my_continuation_content_action_legacy_20260906130854',
  array['uuid', 'text', 'jsonb', 'integer', 'uuid'],
  'authenticated', array[]::text[], 'the renamed action implementation is private by grant'
);

do $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_event_id uuid := '00000000-0000-4000-8000-000000008001';
  v_source_id uuid := '00000000-0000-4000-8000-000000008002';
  v_series_id uuid := '00000000-0000-4000-8000-000000008003';
  v_day1_transition_id uuid := '00000000-0000-4000-8000-000000008004';
  v_day3_transition_id uuid := '00000000-0000-4000-8000-000000008005';
  v_day1_occurrence_id uuid := '00000000-0000-4000-8000-000000008006';
  v_day3_occurrence_id uuid := '00000000-0000-4000-8000-000000008007';
  v_actor_one uuid := '00000000-0000-4000-8000-000000008101';
  v_actor_two uuid := '00000000-0000-4000-8000-000000008102';
  v_outsider uuid := '00000000-0000-4000-8000-000000008107';
  v_payload jsonb;
  v_calculation jsonb;
  v_count integer;
begin
  insert into auth.users(id, email)
  values
    ('00000000-0000-4000-8000-000000008101', 'r8-8101@example.invalid'),
    ('00000000-0000-4000-8000-000000008102', 'r8-8102@example.invalid'),
    ('00000000-0000-4000-8000-000000008103', 'r8-8103@example.invalid'),
    ('00000000-0000-4000-8000-000000008104', 'r8-8104@example.invalid'),
    ('00000000-0000-4000-8000-000000008105', 'r8-8105@example.invalid'),
    ('00000000-0000-4000-8000-000000008106', 'r8-8106@example.invalid'),
    ('00000000-0000-4000-8000-000000008107', 'r8-8107@example.invalid');

  insert into public.profiles(user_id, gender, age, school)
  values
    ('00000000-0000-4000-8000-000000008101', 'male', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000008102', 'male', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000008103', 'male', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000008104', 'female', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000008105', 'female', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000008106', 'female', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000008107', 'female', 22, 'pnu');

  insert into public.quantum_event_occurrences(
    id, event_id, event_mode, starts_at, ends_at, application_closes_at,
    location_name, male_capacity, female_capacity, required_total, status,
    room_number, room_code
  ) values (
    v_event_id, 'r8-source-event', 'scheduled', v_now - interval '2 days',
    v_now - interval '2 days' + interval '2 hours', v_now - interval '3 days',
    '공개 테스트 장소', 3, 2, 5, 'completed', 1, 'R8T001'
  );
  insert into public.quantum_continuation_sources(
    id, source_kind, scheduled_event_occurrence_id, activity_kind,
    activity_snapshot, roster_revision, attendance_revision, snapshot_hash,
    source_completed_at, status, idempotency_key
  ) values (
    v_source_id, 'scheduled_event_occurrence', v_event_id, 'walk', '{}'::jsonb,
    0, 0, pg_catalog.repeat('8', 32), v_now - interval '2 days', 'ready',
    '00000000-0000-4000-8000-000000008008'
  );
  insert into public.quantum_continuation_series(
    id, source_id, start_program_day, maximum_physical_meeting_no, status
  ) values (v_series_id, v_source_id, 1, 6, 'active');
  insert into public.quantum_continuation_transitions(
    id, series_id, transition_index, target_program_day, roster_revision,
    open_idempotency_key, status, closes_at
  ) values
    (v_day1_transition_id, v_series_id, 0, 1, 0, '00000000-0000-4000-8000-000000008009', 'scheduled', v_now + interval '1 day'),
    (v_day3_transition_id, v_series_id, 2, 3, 0, '00000000-0000-4000-8000-000000008010', 'scheduled', v_now + interval '1 day');
  insert into public.quantum_continuation_occurrences(
    id, series_id, transition_id, schedule_idempotency_key, program_day,
    physical_meeting_no, transition_index, status, starts_at, ends_at,
    chat_opens_at, chat_send_closes_at, content_state, content_revision,
    location_snapshot, revision
  ) values
    (
      v_day1_occurrence_id, v_series_id, v_day1_transition_id,
      '00000000-0000-4000-8000-000000008011', 1, 2, 0, 'confirmed',
      v_now - interval '82 minutes', v_now + interval '68 minutes',
      v_now - interval '97 minutes', v_now + interval '68 minutes',
      '{}'::jsonb, 0, '{"confirmed":true,"name":"공개 보드게임 장소"}'::jsonb, 0
    ),
    (
      v_day3_occurrence_id, v_series_id, v_day3_transition_id,
      '00000000-0000-4000-8000-000000008012', 3, 4, 2, 'confirmed',
      v_now - interval '30 minutes', v_now + interval '150 minutes',
      v_now - interval '45 minutes', v_now + interval '150 minutes',
      '{"bowling_teams":[{"alias":"참가자 1","team":"A"},{"alias":"참가자 4","team":"A"},{"alias":"참가자 2","team":"B"},{"alias":"참가자 5","team":"B"},{"alias":"참가자 3","team":"C"},{"alias":"참가자 6","team":"C"}]}'::jsonb,
      0, '{"confirmed":true,"name":"공개 볼링장"}'::jsonb, 0
    );

  insert into public.quantum_continuation_occurrence_members(
    occurrence_id, participant_user_id, alias, attendance_status,
    attendance_revision, roster_revision, visible_from_program_day
  )
  select occurrence_id, participant_user_id, alias, 'present', 0, 0, 1
  from (
    values
      (v_day1_occurrence_id, '00000000-0000-4000-8000-000000008101'::uuid, '참가자 1'),
      (v_day1_occurrence_id, '00000000-0000-4000-8000-000000008102'::uuid, '참가자 2'),
      (v_day1_occurrence_id, '00000000-0000-4000-8000-000000008103'::uuid, '참가자 3'),
      (v_day1_occurrence_id, '00000000-0000-4000-8000-000000008104'::uuid, '참가자 4'),
      (v_day1_occurrence_id, '00000000-0000-4000-8000-000000008105'::uuid, '참가자 5'),
      (v_day1_occurrence_id, '00000000-0000-4000-8000-000000008106'::uuid, '참가자 6'),
      (v_day3_occurrence_id, '00000000-0000-4000-8000-000000008101'::uuid, '참가자 1'),
      (v_day3_occurrence_id, '00000000-0000-4000-8000-000000008102'::uuid, '참가자 2'),
      (v_day3_occurrence_id, '00000000-0000-4000-8000-000000008103'::uuid, '참가자 3'),
      (v_day3_occurrence_id, '00000000-0000-4000-8000-000000008104'::uuid, '참가자 4'),
      (v_day3_occurrence_id, '00000000-0000-4000-8000-000000008105'::uuid, '참가자 5'),
      (v_day3_occurrence_id, '00000000-0000-4000-8000-000000008106'::uuid, '참가자 6')
  ) as fixture(occurrence_id, participant_user_id, alias);

  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  v_payload := quantum_private.continuation_day1_private_game_runtime(
    v_day1_occurrence_id, v_actor_one, v_now + interval '4 minutes'
  );
  if v_payload ->> 'selected_game' <> 'dalmuti' then
    raise exception 'day1_zero_vote_dalmuti_fallback_failed';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_outsider::text, true);
  begin
    perform public.apply_my_continuation_content_action(
      v_day1_occurrence_id, 'vote_day1_game', '{"choice":"dalmuti"}'::jsonb, 0,
      '00000000-0000-4000-8000-000000008201'
    );
    raise exception 'day1_outsider_vote_was_not_rejected';
  exception when others then
    if sqlerrm not like '%continuation_occurrence_not_found%' then raise; end if;
  end;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor_one::text, true);
  v_payload := public.apply_my_continuation_content_action(
    v_day1_occurrence_id, 'vote_day1_game', '{"choice":"halligalli"}'::jsonb, 0,
    '00000000-0000-4000-8000-000000008202'
  );
  if v_payload #>> '{runtime,my_vote}' <> 'halligalli'
     or (v_payload #>> '{runtime,result_available}')::boolean is distinct from false
     or pg_catalog.jsonb_array_length(v_payload -> 'commands') <> 0 then
    raise exception 'day1_vote_privacy_projection_failed';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor_two::text, true);
  perform public.apply_my_continuation_content_action(
    v_day1_occurrence_id, 'vote_day1_game', '{"choice":"one-card"}'::jsonb, 0,
    '00000000-0000-4000-8000-000000008203'
  );
  v_payload := public.get_my_continuation_occurrence_content(v_day1_occurrence_id);
  if v_payload #>> '{runtime,my_vote}' <> 'one-card'
     or v_payload #>> '{runtime,selected_game}' is not null then
    raise exception 'day1_caller_only_vote_failed';
  end if;

  insert into public.quantum_continuation_content_commands(
    occurrence_id, actor_user_id, action, payload, prior_revision,
    resulting_revision, idempotency_key
  ) values (
    v_day1_occurrence_id, v_actor_two, 'select_game', '{"game_id":"halligalli"}'::jsonb,
    0, 1, '00000000-0000-4000-8000-000000008204'
  );
  update public.quantum_continuation_occurrences
  set content_state = pg_catalog.jsonb_build_object(
    'selected_game', 'halligalli',
    'last_action', 'select_game',
    'last_payload', '{"game_id":"halligalli"}'::jsonb,
    'last_actor_alias', '참가자 2'
  )
  where id = v_day1_occurrence_id;
  v_payload := public.get_my_continuation_occurrence_content(v_day1_occurrence_id);
  if v_payload #> '{content_state,selected_game}' is not null
     or v_payload #> '{content_state,last_payload}' is not null
     or v_payload::text like '%"game_id"%'
     or v_payload::text like '%"select_game"%' then
    raise exception 'day1_legacy_selection_projection_leaked';
  end if;
  perform public.apply_my_continuation_content_action(
    v_day1_occurrence_id, 'select_game', '{"game_id":"halligalli"}'::jsonb, 0,
    '00000000-0000-4000-8000-000000008204'
  );
  begin
    perform public.apply_my_continuation_content_action(
      v_day1_occurrence_id, 'select_game', '{"game_id":"one-card"}'::jsonb, 0,
      '00000000-0000-4000-8000-000000008205'
    );
    raise exception 'fresh_shared_game_selection_was_not_rejected';
  exception when others then
    if sqlerrm not like '%content_runtime_action_replaced_not_allowed%' then raise; end if;
  end;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor_one::text, true);
  perform public.apply_my_continuation_content_action(
    v_day1_occurrence_id, 'start_game', '{}'::jsonb, 0,
    '00000000-0000-4000-8000-000000008206'
  );
  perform public.apply_my_continuation_content_action(
    v_day1_occurrence_id, 'finish_game', '{}'::jsonb, 1,
    '00000000-0000-4000-8000-000000008207'
  );
  begin
    perform public.apply_my_continuation_content_action(
      v_day1_occurrence_id, 'finish_occurrence', '{}'::jsonb, 2,
      '00000000-0000-4000-8000-000000008208'
    );
    raise exception 'day1_early_finish_was_not_rejected';
  exception when others then
    if sqlerrm not like '%content_action_time_closed%' then raise; end if;
  end;

  update public.quantum_continuation_occurrences
  set starts_at = v_now - interval '146 minutes',
      ends_at = v_now + interval '4 minutes',
      chat_opens_at = v_now - interval '161 minutes',
      chat_send_closes_at = v_now + interval '4 minutes'
  where id = v_day1_occurrence_id;
  v_payload := public.get_my_continuation_occurrence_content(v_day1_occurrence_id);
  if v_payload #>> '{runtime,selected_game}' <> 'dalmuti'
     or (v_payload #>> '{runtime,can_finish}')::boolean is distinct from true then
    raise exception 'day1_tie_fallback_or_finish_window_failed';
  end if;
  perform public.apply_my_continuation_content_action(
    v_day1_occurrence_id, 'finish_occurrence', '{}'::jsonb, 2,
    '00000000-0000-4000-8000-000000008209'
  );

  update public.quantum_continuation_occurrence_members
  set attendance_status = 'cancelled'
  where occurrence_id = v_day3_occurrence_id
    and participant_user_id = '00000000-0000-4000-8000-000000008103';
  update public.quantum_continuation_occurrences
  set content_state = '{"bowling_teams":[{"alias":"참가자 1","team":"A"},{"alias":"참가자 4","team":"A"},{"alias":"참가자 2","team":"B"},{"alias":"참가자 5","team":"B"},{"alias":"참가자 6","team":"B"}]}'::jsonb
  where id = v_day3_occurrence_id;
  v_calculation := quantum_private.continuation_day3_tiebreak_calculation(
    v_day3_occurrence_id,
    '[{"alias":"참가자 1","score":100},{"alias":"참가자 4","score":100},{"alias":"참가자 2","score":75},{"alias":"참가자 5","score":100},{"alias":"참가자 6","score":100}]'::jsonb,
    null
  );
  if v_calculation ->> 'phase' <> 'resolved'
     or v_calculation #>> '{result,0,team}' <> 'B' then
    raise exception 'day3_five_person_raw_sum_tiebreak_failed';
  end if;
  v_calculation := quantum_private.continuation_day3_tiebreak_calculation(
    v_day3_occurrence_id,
    '[{"alias":"참가자 1","score":200,"last_frame_score":5},{"alias":"참가자 4","score":0,"last_frame_score":5},{"alias":"참가자 2","score":0,"last_frame_score":4},{"alias":"참가자 5","score":100,"last_frame_score":4},{"alias":"참가자 6","score":100,"last_frame_score":4}]'::jsonb,
    null
  );
  if v_calculation ->> 'phase' <> 'resolved'
     or v_calculation #>> '{result,0,team}' <> 'B' then
    raise exception 'day3_five_person_last_frame_sum_tiebreak_failed';
  end if;
  update public.quantum_continuation_occurrence_members
  set attendance_status = 'present'
  where occurrence_id = v_day3_occurrence_id
    and participant_user_id = '00000000-0000-4000-8000-000000008103';
  update public.quantum_continuation_occurrences
  set content_state = '{"bowling_teams":[{"alias":"참가자 1","team":"A"},{"alias":"참가자 4","team":"A"},{"alias":"참가자 2","team":"B"},{"alias":"참가자 5","team":"B"},{"alias":"참가자 3","team":"C"},{"alias":"참가자 6","team":"C"}]}'::jsonb
  where id = v_day3_occurrence_id;

  v_calculation := quantum_private.continuation_day3_tiebreak_calculation(
    v_day3_occurrence_id,
    '[{"alias":"참가자 1","score":100},{"alias":"참가자 4","score":100},{"alias":"참가자 2","score":130},{"alias":"참가자 5","score":80},{"alias":"참가자 3","score":50},{"alias":"참가자 6","score":50}]'::jsonb,
    null
  );
  if v_calculation ->> 'phase' <> 'resolved'
     or v_calculation #>> '{result,0,team}' <> 'B' then
    raise exception 'day3_raw_score_tiebreak_failed';
  end if;

  begin
    perform public.apply_my_continuation_content_action(
      v_day3_occurrence_id, 'save_bowling_one_ball_scores',
      '{"team_scores":[{"team":"A","score":8},{"team":"B","score":8}]}'::jsonb,
      0, '00000000-0000-4000-8000-000000008300'
    );
    raise exception 'day3_one_ball_without_phase_was_accepted';
  exception when others then
    if sqlerrm not like '%content_sequence_not_ready%' then raise; end if;
  end;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor_one::text, true);
  v_payload := public.apply_my_continuation_content_action(
    v_day3_occurrence_id, 'save_game_scores',
    '{"scores":[{"alias":"참가자 1","score":100},{"alias":"참가자 4","score":100},{"alias":"참가자 2","score":100},{"alias":"참가자 5","score":100},{"alias":"참가자 3","score":50},{"alias":"참가자 6","score":50}]}'::jsonb,
    0, '00000000-0000-4000-8000-000000008301'
  );
  if v_payload #>> '{runtime,tie_break_phase}' <> 'needs_last_frame' then
    raise exception 'day3_last_frame_phase_missing';
  end if;
  begin
    perform public.apply_my_continuation_content_action(
      v_day3_occurrence_id, 'save_game_scores',
      '{"scores":[{"alias":"참가자 1","score":100,"last_frame_score":10},{"alias":"참가자 4","score":100,"last_frame_score":10},{"alias":"참가자 2","score":100,"last_frame_score":10},{"alias":"참가자 5","score":100,"last_frame_score":10},{"alias":"참가자 3","score":50,"last_frame_score":5},{"alias":"참가자 6","score":50,"last_frame_score":5}]}'::jsonb,
      0, '00000000-0000-4000-8000-000000008301'
    );
    raise exception 'day3_changed_full_payload_replay_was_accepted';
  exception when others then
    if sqlerrm not like '%idempotency_key_reused%' then raise; end if;
  end;
  begin
    perform public.apply_my_continuation_content_action(
      v_day3_occurrence_id, 'save_bowling_last_frame_scores',
      '{"scores":[{"alias":"참가자 1","score":10}]}'::jsonb,
      1, '00000000-0000-4000-8000-000000008302'
    );
    raise exception 'day3_partial_last_frame_was_accepted';
  exception when others then
    if sqlerrm not like '%content_sequence_not_ready%' then raise; end if;
  end;
  v_payload := public.apply_my_continuation_content_action(
    v_day3_occurrence_id, 'save_bowling_last_frame_scores',
    '{"scores":[{"alias":"참가자 1","score":10},{"alias":"참가자 2","score":10},{"alias":"참가자 3","score":5},{"alias":"참가자 4","score":10},{"alias":"참가자 5","score":10},{"alias":"참가자 6","score":5}]}'::jsonb,
    1, '00000000-0000-4000-8000-000000008303'
  );
  if v_payload #>> '{runtime,tie_break_phase}' <> 'needs_one_ball'
     or v_payload #> '{runtime,tied_teams}' <> '["A","B"]'::jsonb then
    raise exception 'day3_one_ball_phase_missing';
  end if;
  begin
    perform public.apply_my_continuation_content_action(
      v_day3_occurrence_id, 'finish_occurrence', '{}'::jsonb, 2,
      '00000000-0000-4000-8000-000000008304'
    );
    raise exception 'day3_unresolved_finish_was_accepted';
  exception when others then
    if sqlerrm not like '%content_sequence_not_ready%' then raise; end if;
  end;
  begin
    perform public.apply_my_continuation_content_action(
      v_day3_occurrence_id, 'save_bowling_one_ball_scores',
      '{"team_scores":[{"team":"A"},{"team":"B","score":8}]}'::jsonb,
      2, '00000000-0000-4000-8000-000000008307'
    );
    raise exception 'day3_one_ball_missing_score_was_accepted';
  exception when others then
    if sqlerrm not like '%content_sequence_not_ready%' then raise; end if;
  end;
  v_payload := public.apply_my_continuation_content_action(
    v_day3_occurrence_id, 'save_bowling_one_ball_scores',
    '{"team_scores":[{"team":"A","score":8},{"team":"B","score":8}]}'::jsonb,
    2, '00000000-0000-4000-8000-000000008305'
  );
  if v_payload #>> '{runtime,tie_break_phase}' <> 'resolved' then
    raise exception 'day3_one_ball_resolution_failed';
  end if;
  select pg_catalog.count(*)::integer into v_count
  from pg_catalog.jsonb_array_elements(v_payload #> '{content_state,bowling_result}') as result(value)
  where (result.value ->> 'tied')::boolean;
  if v_count <> 2 then raise exception 'day3_shared_rank_not_preserved'; end if;
  perform public.apply_my_continuation_content_action(
    v_day3_occurrence_id, 'finish_occurrence', '{}'::jsonb, 3,
    '00000000-0000-4000-8000-000000008306'
  );
end
$$;

select * from extensions.finish();
rollback;
