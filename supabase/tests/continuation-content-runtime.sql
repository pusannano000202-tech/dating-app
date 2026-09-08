-- Run only after 20260906114545_continuation_content_runtime.sql is applied to
-- the parent-owned disposable local database. All fixture changes roll back.
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(12);

select extensions.has_table('public', 'quantum_continuation_day2_prompt_states', 'Day 2 group prompt state exists');
select extensions.has_table('public', 'quantum_continuation_day4_shared_phone', 'Day 4 shared-phone state exists');
select extensions.has_table('public', 'quantum_continuation_content_runtime_commands', 'runtime idempotency ledger exists');

select extensions.table_privs_are('public', 'quantum_continuation_day2_prompt_states', 'authenticated', array[]::text[], 'Day 2 state is not directly readable');
select extensions.table_privs_are('public', 'quantum_continuation_day4_shared_phone', 'authenticated', array[]::text[], 'Day 4 state is not directly writable');
select extensions.table_privs_are('public', 'quantum_continuation_content_runtime_commands', 'authenticated', array[]::text[], 'runtime ledger is private');

select extensions.function_privs_are(
  'public', 'get_my_continuation_occurrence_content', array['uuid'],
  'authenticated', array['EXECUTE'], 'the existing GET RPC signature remains executable'
);
select extensions.function_privs_are(
  'public', 'apply_my_continuation_content_action', array['uuid', 'text', 'jsonb', 'integer', 'uuid'],
  'authenticated', array['EXECUTE'], 'the existing action RPC signature remains executable'
);
select extensions.function_privs_are(
  'public', 'get_my_continuation_occurrence_content_legacy_20260906114545', array['uuid'],
  'authenticated', array[]::text[], 'the renamed GET implementation is not directly executable'
);
select extensions.function_privs_are(
  'public', 'apply_my_continuation_content_action_legacy_20260906114545', array['uuid', 'text', 'jsonb', 'integer', 'uuid'],
  'authenticated', array[]::text[], 'the renamed action implementation is not directly executable'
);
select extensions.ok(
  (select class.relrowsecurity from pg_catalog.pg_class as class where class.oid = 'public.quantum_continuation_day4_shared_phone'::regclass),
  'shared-phone storage has RLS enabled'
);
select extensions.ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'quantum_continuation_day2_prompt_states',
        'quantum_continuation_day4_shared_phone',
        'quantum_continuation_content_runtime_commands'
      )
      and column_name in ('answer_text', 'answer_value', 'drank', 'alcohol_count', 'pass_count')
  ),
  'runtime storage has no private response or alcohol telemetry columns'
);

do $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_event_id uuid := '00000000-0000-4000-8000-000000002001';
  v_source_id uuid := '00000000-0000-4000-8000-000000002002';
  v_series_id uuid := '00000000-0000-4000-8000-000000002003';
  v_day2_transition_id uuid := '00000000-0000-4000-8000-000000002004';
  v_day4_transition_id uuid := '00000000-0000-4000-8000-000000002005';
  v_day2_occurrence_id uuid := '00000000-0000-4000-8000-000000002006';
  v_day4_occurrence_id uuid := '00000000-0000-4000-8000-000000002007';
  v_actor_one uuid := '00000000-0000-4000-8000-000000001001';
  v_actor_two uuid := '00000000-0000-4000-8000-000000001002';
  v_outsider uuid := '00000000-0000-4000-8000-000000001007';
  v_payload jsonb;
  v_runtime jsonb;
  v_card integer;
  v_count integer;
begin
  insert into auth.users(id, email)
  values
    ('00000000-0000-4000-8000-000000001001', 'runtime-1001@example.invalid'),
    ('00000000-0000-4000-8000-000000001002', 'runtime-1002@example.invalid'),
    ('00000000-0000-4000-8000-000000001003', 'runtime-1003@example.invalid'),
    ('00000000-0000-4000-8000-000000001004', 'runtime-1004@example.invalid'),
    ('00000000-0000-4000-8000-000000001005', 'runtime-1005@example.invalid'),
    ('00000000-0000-4000-8000-000000001006', 'runtime-1006@example.invalid'),
    ('00000000-0000-4000-8000-000000001007', 'runtime-1007@example.invalid');

  insert into public.profiles(user_id, gender, age, school)
  values
    ('00000000-0000-4000-8000-000000001001', 'male', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000001002', 'male', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000001003', 'male', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000001004', 'female', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000001005', 'female', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000001006', 'female', 22, 'pnu'),
    ('00000000-0000-4000-8000-000000001007', 'female', 22, 'pnu');

  insert into public.quantum_event_occurrences(
    id, event_id, event_mode, starts_at, ends_at, application_closes_at,
    location_name, male_capacity, female_capacity, required_total, status,
    room_number, room_code
  ) values (
    v_event_id, 'runtime-source-event', 'scheduled', v_now - interval '2 days',
    v_now - interval '2 days' + interval '2 hours', v_now - interval '3 days',
    '공개 테스트 장소', 3, 2, 5, 'completed', 1, 'R3T001'
  );
  insert into public.quantum_continuation_sources(
    id, source_kind, scheduled_event_occurrence_id, activity_kind,
    activity_snapshot, roster_revision, attendance_revision, snapshot_hash,
    source_completed_at, status, idempotency_key
  ) values (
    v_source_id, 'scheduled_event_occurrence', v_event_id, 'walk', '{}'::jsonb,
    0, 0, pg_catalog.repeat('a', 32), v_now - interval '2 days', 'ready',
    '00000000-0000-4000-8000-000000002008'
  );
  insert into public.quantum_continuation_series(
    id, source_id, start_program_day, maximum_physical_meeting_no, status
  ) values (v_series_id, v_source_id, 2, 6, 'active');
  insert into public.quantum_continuation_transitions(
    id, series_id, transition_index, target_program_day, roster_revision,
    open_idempotency_key, status, closes_at
  ) values
    (v_day2_transition_id, v_series_id, 0, 2, 0, '00000000-0000-4000-8000-000000002009', 'scheduled', v_now + interval '1 day'),
    (v_day4_transition_id, v_series_id, 1, 4, 0, '00000000-0000-4000-8000-000000002010', 'scheduled', v_now + interval '1 day');
  insert into public.quantum_continuation_occurrences(
    id, series_id, transition_id, schedule_idempotency_key, program_day,
    physical_meeting_no, transition_index, status, starts_at, ends_at,
    chat_opens_at, chat_send_closes_at, content_state, content_revision,
    location_snapshot, revision
  ) values
    (
      v_day2_occurrence_id, v_series_id, v_day2_transition_id,
      '00000000-0000-4000-8000-000000002011', 2, 2, 0, 'confirmed',
      v_now - interval '30 minutes', v_now + interval '90 minutes',
      v_now - interval '45 minutes', v_now + interval '90 minutes',
      '{}'::jsonb, 0, '{"confirmed":true,"name":"공개 산책로"}'::jsonb, 0
    ),
    (
      v_day4_occurrence_id, v_series_id, v_day4_transition_id,
      '00000000-0000-4000-8000-000000002012', 4, 3, 1, 'confirmed',
      v_now - interval '60 minutes', v_now + interval '60 minutes',
      v_now - interval '75 minutes', v_now + interval '60 minutes',
      '{}'::jsonb, 0, '{"confirmed":true,"name":"공개 식당"}'::jsonb, 0
    );

  insert into public.quantum_continuation_occurrence_members(
    occurrence_id, participant_user_id, alias, attendance_status,
    attendance_revision, roster_revision, visible_from_program_day
  )
  select occurrence_id, participant_user_id, alias, 'present', 0, 0, 2
  from (
    values
      (v_day2_occurrence_id, '00000000-0000-4000-8000-000000001001'::uuid, '참가자 1'),
      (v_day2_occurrence_id, '00000000-0000-4000-8000-000000001002'::uuid, '참가자 2'),
      (v_day2_occurrence_id, '00000000-0000-4000-8000-000000001003'::uuid, '참가자 3'),
      (v_day2_occurrence_id, '00000000-0000-4000-8000-000000001004'::uuid, '참가자 4'),
      (v_day2_occurrence_id, '00000000-0000-4000-8000-000000001005'::uuid, '참가자 5'),
      (v_day2_occurrence_id, '00000000-0000-4000-8000-000000001006'::uuid, '참가자 6'),
      (v_day4_occurrence_id, '00000000-0000-4000-8000-000000001001'::uuid, '참가자 1'),
      (v_day4_occurrence_id, '00000000-0000-4000-8000-000000001002'::uuid, '참가자 2'),
      (v_day4_occurrence_id, '00000000-0000-4000-8000-000000001003'::uuid, '참가자 3'),
      (v_day4_occurrence_id, '00000000-0000-4000-8000-000000001004'::uuid, '참가자 4'),
      (v_day4_occurrence_id, '00000000-0000-4000-8000-000000001005'::uuid, '참가자 5'),
      (v_day4_occurrence_id, '00000000-0000-4000-8000-000000001006'::uuid, '참가자 6')
  ) as fixture(occurrence_id, participant_user_id, alias);

  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor_one::text, true);
  v_payload := public.get_my_continuation_occurrence_content(v_day2_occurrence_id);
  if v_payload #>> '{runtime,kind}' <> 'day2'
     or (v_payload #>> '{runtime,ready}')::boolean is distinct from true
     or v_payload #> '{runtime,my_group,aliases}' <> '["참가자 1", "참가자 4"]'::jsonb
     or v_payload::text like '%"group_key"%'
     or v_payload::text like '%"gender"%' then
    raise exception 'day2_six_person_projection_failed';
  end if;

  update public.quantum_continuation_occurrence_members
  set attendance_status = 'absent'
  where occurrence_id = v_day2_occurrence_id
    and participant_user_id = '00000000-0000-4000-8000-000000001006';
  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor_two::text, true);
  v_payload := public.get_my_continuation_occurrence_content(v_day2_occurrence_id);
  if pg_catalog.jsonb_array_length(v_payload #> '{runtime,my_group,aliases}') <> 3
     or not (v_payload #> '{runtime,my_group,aliases}' @> '["참가자 2", "참가자 3", "참가자 5"]'::jsonb) then
    raise exception 'day2_three_male_two_female_trio_failed';
  end if;

  update public.quantum_continuation_occurrence_members
  set attendance_status = case
    when participant_user_id = '00000000-0000-4000-8000-000000001003' then 'absent'
    when participant_user_id = '00000000-0000-4000-8000-000000001006' then 'present'
    else attendance_status
  end
  where occurrence_id = v_day2_occurrence_id;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor_two::text, true);
  v_payload := public.get_my_continuation_occurrence_content(v_day2_occurrence_id);
  if (v_payload #>> '{runtime,ready}')::boolean is distinct from true
     or v_payload #>> '{runtime,mode}' <> 'pair_and_trio'
     or pg_catalog.jsonb_array_length(v_payload #> '{runtime,my_group,aliases}') <> 3
     or not (v_payload #> '{runtime,my_group,aliases}' @> '["참가자 2", "참가자 5", "참가자 6"]'::jsonb) then
    raise exception 'day2_two_male_three_female_trio_failed';
  end if;
  update public.quantum_continuation_occurrence_members
  set attendance_status = case
    when participant_user_id = '00000000-0000-4000-8000-000000001003' then 'present'
    when participant_user_id = '00000000-0000-4000-8000-000000001006' then 'absent'
    else attendance_status
  end
  where occurrence_id = v_day2_occurrence_id;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_outsider::text, true);
  begin
    perform public.get_my_continuation_occurrence_content(v_day2_occurrence_id);
    raise exception 'nonparticipant_get_was_not_rejected';
  exception when others then
    if sqlerrm not like '%continuation_occurrence_not_found%' then raise; end if;
  end;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor_one::text, true);
  begin
    perform public.apply_my_continuation_content_action(
      v_day2_occurrence_id, 'start_round', '{"round":1}'::jsonb, 0,
      '00000000-0000-4000-8000-000000003001'
    );
    raise exception 'legacy_day2_action_was_not_rejected';
  exception when others then
    if sqlerrm not like '%content_runtime_action_replaced%' then raise; end if;
  end;
  v_payload := public.apply_my_continuation_content_action(
    v_day2_occurrence_id, 'advance_group_prompt',
    '{"round":1,"expected_runtime_version":0}'::jsonb, 0,
    '00000000-0000-4000-8000-000000003002'
  );
  if (v_payload #>> '{runtime,prompt_version}')::integer <> 1 then
    raise exception 'day2_prompt_advance_failed';
  end if;
  perform public.apply_my_continuation_content_action(
    v_day2_occurrence_id, 'advance_group_prompt',
    '{"round":1,"expected_runtime_version":0}'::jsonb, 0,
    '00000000-0000-4000-8000-000000003002'
  );
  select pg_catalog.count(*)::integer into v_count
  from public.quantum_continuation_content_runtime_commands
  where actor_user_id = v_actor_one
    and idempotency_key = '00000000-0000-4000-8000-000000003002';
  if v_count <> 1 then raise exception 'day2_idempotent_replay_duplicated'; end if;
  begin
    perform public.apply_my_continuation_content_action(
      v_day2_occurrence_id, 'advance_group_prompt',
      '{"round":1,"expected_runtime_version":0}'::jsonb, 0,
      '00000000-0000-4000-8000-000000003003'
    );
    raise exception 'stale_day2_runtime_version_was_not_rejected';
  exception when others then
    if sqlerrm not like '%stale_runtime_version%' then raise; end if;
  end;
  begin
    perform public.apply_my_continuation_content_action(
      v_day2_occurrence_id, 'finish_occurrence', '{}'::jsonb, 0,
      '00000000-0000-4000-8000-000000003004'
    );
    raise exception 'day2_early_finish_was_not_rejected';
  exception when others then
    if sqlerrm not like '%content_sequence_not_ready%' then raise; end if;
  end;
  update public.quantum_continuation_occurrences
  set starts_at = v_now - interval '106 minutes',
      ends_at = v_now + interval '14 minutes',
      chat_opens_at = v_now - interval '121 minutes',
      chat_send_closes_at = v_now + interval '14 minutes'
  where id = v_day2_occurrence_id;
  perform public.apply_my_continuation_content_action(
    v_day2_occurrence_id, 'finish_occurrence', '{}'::jsonb, 0,
    '00000000-0000-4000-8000-000000003005'
  );
  if (select status from public.quantum_continuation_occurrences where id = v_day2_occurrence_id) <> 'completed' then
    raise exception 'day2_server_timed_finish_failed';
  end if;

  v_payload := public.get_my_continuation_occurrence_content(v_day4_occurrence_id);
  if v_payload #>> '{runtime,scene}' <> 'day4_free_conversation'
     or (v_payload #>> '{runtime,recommended_window_ended}')::boolean is distinct from true then
    raise exception 'day4_post_recommendation_recovery_missing';
  end if;
  v_payload := public.apply_my_continuation_content_action(
    v_day4_occurrence_id, 'claim_shared_phone', '{"expected_lease_version":0}'::jsonb, 0,
    '00000000-0000-4000-8000-000000004001'
  );
  if (v_payload #>> '{runtime,lease_version}')::integer <> 1
     or (v_payload #>> '{runtime,owner_is_me}')::boolean is distinct from true then
    raise exception 'day4_initial_claim_failed';
  end if;
  v_payload := public.apply_my_continuation_content_action(
    v_day4_occurrence_id, 'advance_shared_phone_card',
    '{"expected_lease_version":1,"expected_card_version":0,"card_id":1}'::jsonb, 0,
    '00000000-0000-4000-8000-000000004002'
  );
  perform public.apply_my_continuation_content_action(
    v_day4_occurrence_id, 'advance_shared_phone_card',
    '{"expected_lease_version":1,"expected_card_version":0,"card_id":1}'::jsonb, 0,
    '00000000-0000-4000-8000-000000004002'
  );
  if (v_payload #>> '{runtime,card_index}')::integer <> 1 then raise exception 'day4_first_card_failed'; end if;
  begin
    perform public.apply_my_continuation_content_action(
      v_day4_occurrence_id, 'draw_card', '{"card_id":"2"}'::jsonb, 1,
      '00000000-0000-4000-8000-000000004021'
    );
    raise exception 'legacy_day4_action_was_not_rejected';
  exception when others then
    if sqlerrm not like '%content_runtime_action_replaced%' then raise; end if;
  end;
  begin
    perform public.apply_my_continuation_content_action(
      v_day4_occurrence_id, 'finish_occurrence', '{}'::jsonb, 1,
      '00000000-0000-4000-8000-000000004003'
    );
    raise exception 'day4_one_card_finish_was_not_rejected';
  exception when others then
    if sqlerrm not like '%content_sequence_not_ready%' then raise; end if;
  end;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor_two::text, true);
  begin
    perform public.apply_my_continuation_content_action(
      v_day4_occurrence_id, 'claim_shared_phone', '{"expected_lease_version":1}'::jsonb, 1,
      '00000000-0000-4000-8000-000000004022'
    );
    raise exception 'active_day4_lease_was_taken_over';
  exception when others then
    if sqlerrm not like '%content_runtime_device_locked%' then raise; end if;
  end;

  update public.quantum_continuation_day4_shared_phone
  set lease_expires_at = v_now - interval '1 second'
  where occurrence_id = v_day4_occurrence_id;
  v_payload := public.apply_my_continuation_content_action(
    v_day4_occurrence_id, 'claim_shared_phone', '{"expected_lease_version":1}'::jsonb, 1,
    '00000000-0000-4000-8000-000000004004'
  );
  if (v_payload #>> '{runtime,lease_version}')::integer <> 2
     or (v_payload #>> '{runtime,owner_is_me}')::boolean is distinct from true then
    raise exception 'expired_day4_lease_takeover_failed';
  end if;
  perform public.apply_my_continuation_content_action(
    v_day4_occurrence_id, 'heartbeat_shared_phone', '{"expected_lease_version":2}'::jsonb, 0,
    '00000000-0000-4000-8000-000000004005'
  );
  select pg_catalog.jsonb_build_object(
    'lease_version', lease_version, 'card_version', card_version, 'card_index', card_index
  ) into v_runtime
  from public.quantum_continuation_day4_shared_phone
  where occurrence_id = v_day4_occurrence_id;
  if v_runtime <> '{"lease_version":2,"card_version":1,"card_index":1}'::jsonb then
    raise exception 'heartbeat_changed_card_or_lease_version';
  end if;

  for v_card in 2..10 loop
    perform public.apply_my_continuation_content_action(
      v_day4_occurrence_id, 'advance_shared_phone_card',
      pg_catalog.jsonb_build_object(
        'expected_lease_version', 2,
        'expected_card_version', v_card - 1,
        'card_id', v_card
      ),
      v_card - 1,
      ('00000000-0000-4000-8000-' || pg_catalog.lpad((4005 + v_card)::text, 12, '0'))::uuid
    );
  end loop;
  perform public.apply_my_continuation_content_action(
    v_day4_occurrence_id, 'finish_occurrence', '{}'::jsonb, 10,
    '00000000-0000-4000-8000-000000004020'
  );
  if (select status from public.quantum_continuation_occurrences where id = v_day4_occurrence_id) <> 'completed' then
    raise exception 'day4_ten_card_finish_failed';
  end if;
end
$$;

select * from extensions.finish();
rollback;
