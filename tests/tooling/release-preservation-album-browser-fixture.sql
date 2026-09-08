-- PROPOSAL ONLY: additive local album/browser-review fixture.
--
-- Prerequisite: tests/tooling/release-preservation-browser-fixture.sql has
-- already been applied to the same disposable non-production container.
-- Apply this file only after owner review. It intentionally COMMITs one missing
-- Day 3 transition/occurrence so test02 can review the calendar gap and upload
-- a private album photo within the occurrence's 24-hour upload window.
--
-- This fixture does not UPDATE existing rows, use ON CONFLICT, prove payment,
-- or represent a real operating schedule. Its dates are intentionally local-QA
-- examples. The existing test02 profile and c660 roster remain unchanged.

\set ON_ERROR_STOP on

begin;

do $fixture$
declare
  v_test02_user_id constant uuid := 'd964b372-ef61-4dce-aadd-214fa6f98a43';
  v_source_occurrence_id constant uuid := 'c6600000-0000-4000-8000-000000000100';
  v_source_id constant uuid := 'c6600000-0000-4000-8000-000000000110';
  v_series_id constant uuid := 'c6600000-0000-4000-8000-000000000120';
  v_day2_transition_id constant uuid := 'c6600000-0000-4000-8000-000000000130';
  v_day4_transition_id constant uuid := 'c6600000-0000-4000-8000-000000000131';
  v_day3_transition_id constant uuid := 'c6600000-0000-4000-8000-000000000134';
  v_day2_occurrence_id constant uuid := 'c6600000-0000-4000-8000-000000000140';
  v_day4_occurrence_id constant uuid := 'c6600000-0000-4000-8000-000000000141';
  v_day3_occurrence_id constant uuid := 'c6600000-0000-4000-8000-000000000144';
  v_day3_schedule_key constant uuid := 'c6600000-0000-4000-8000-000000000145';
  v_day3_open_key constant uuid := 'c6600000-0000-4000-8000-000000000146';
  v_now timestamptz := clock_timestamp();
  v_expected_participant_ids uuid[];
  v_album_context jsonb;
begin
  if not exists (
    select 1
    from auth.users as auth_user
    join public.profiles as profile on profile.user_id = auth_user.id
    where auth_user.id = v_test02_user_id
      and auth_user.phone = '821000000002'
      and profile.gender = 'female'
  ) then
    raise exception 'album_fixture_test02_identity_mismatch';
  end if;

  v_expected_participant_ids := array[
    v_test02_user_id,
    'c6600000-0000-4000-8000-000000000001'::uuid,
    'c6600000-0000-4000-8000-000000000002'::uuid,
    'c6600000-0000-4000-8000-000000000003'::uuid,
    'c6600000-0000-4000-8000-000000000004'::uuid
  ];

  if not exists (
    select 1
    from public.quantum_continuation_series as series
    join public.quantum_continuation_sources as source
      on source.id = series.source_id
    join public.quantum_event_occurrences as source_occurrence
      on source_occurrence.id = source.scheduled_event_occurrence_id
    where series.id = v_series_id
      and series.source_id = v_source_id
      and series.start_program_day = 2
      and series.maximum_physical_meeting_no = 5
      and series.status = 'active'
      and source.id = v_source_id
      and source.source_kind = 'scheduled_event_occurrence'
      and source.activity_kind = 'board_game'
      and source.status = 'ready'
      and source_occurrence.id = v_source_occurrence_id
      and source_occurrence.status = 'completed'
  ) then
    raise exception 'album_fixture_c660_series_prerequisite_mismatch';
  end if;

  if (select count(*)
      from public.quantum_continuation_source_members as member
      where member.source_id = v_source_id
        and member.participant_user_id = any(v_expected_participant_ids)
        and member.attendance_status = 'present') <> 5
     or exists (
       select 1
       from public.quantum_continuation_source_members as member
       where member.source_id = v_source_id
         and (
           member.participant_user_id <> all(v_expected_participant_ids)
           or member.attendance_status <> 'present'
         )
     ) then
    raise exception 'album_fixture_c660_source_roster_mismatch';
  end if;

  if not exists (
    select 1
    from public.quantum_continuation_transitions as transition
    where transition.id = v_day2_transition_id
      and transition.series_id = v_series_id
      and transition.transition_index = 0
      and transition.target_program_day = 2
      and transition.open_idempotency_key = 'c6600000-0000-4000-8000-000000000132'
  ) or not exists (
    select 1
    from public.quantum_continuation_transitions as transition
    where transition.id = v_day4_transition_id
      and transition.series_id = v_series_id
      and transition.transition_index = 2
      and transition.target_program_day = 4
      and transition.open_idempotency_key = 'c6600000-0000-4000-8000-000000000133'
  ) then
    raise exception 'album_fixture_c660_transition_prerequisite_mismatch';
  end if;

  if not exists (
    select 1
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = v_day2_occurrence_id
      and occurrence.series_id = v_series_id
      and occurrence.transition_id = v_day2_transition_id
      and occurrence.schedule_idempotency_key = 'c6600000-0000-4000-8000-000000000142'
      and occurrence.program_day = 2
      and occurrence.physical_meeting_no = 2
      and occurrence.transition_index = 0
  ) or not exists (
    select 1
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = v_day4_occurrence_id
      and occurrence.series_id = v_series_id
      and occurrence.transition_id = v_day4_transition_id
      and occurrence.schedule_idempotency_key = 'c6600000-0000-4000-8000-000000000143'
      and occurrence.program_day = 4
      and occurrence.physical_meeting_no = 4
      and occurrence.transition_index = 2
  ) then
    raise exception 'album_fixture_c660_occurrence_prerequisite_mismatch';
  end if;

  if (select count(*)
      from public.quantum_continuation_occurrence_members as member
      where member.occurrence_id = v_day2_occurrence_id
        and member.participant_user_id = any(v_expected_participant_ids)
        and member.attendance_status = 'present') <> 5
     or exists (
       select 1
       from public.quantum_continuation_occurrence_members as member
       where member.occurrence_id = v_day2_occurrence_id
         and (
           member.participant_user_id <> all(v_expected_participant_ids)
           or member.attendance_status <> 'present'
         )
     )
     or not exists (
       select 1
       from public.quantum_continuation_occurrence_members as member
       where member.occurrence_id = v_day2_occurrence_id
         and member.participant_user_id = v_test02_user_id
         and member.alias = '참가자 1'
     ) then
    raise exception 'album_fixture_c660_day2_roster_mismatch';
  end if;

  if exists (
    select 1
    from public.quantum_continuation_transitions as transition
    where transition.id = v_day3_transition_id
       or transition.open_idempotency_key = v_day3_open_key
       or (
         transition.series_id = v_series_id
         and (
           transition.transition_index = 1
           or transition.target_program_day = 3
         )
       )
  ) or exists (
    select 1
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = v_day3_occurrence_id
       or occurrence.schedule_idempotency_key = v_day3_schedule_key
       or (
         occurrence.series_id = v_series_id
         and (
           occurrence.program_day = 3
           or occurrence.physical_meeting_no = 3
           or occurrence.transition_index = 1
         )
       )
  ) then
    raise exception 'album_fixture_c660_day3_collision';
  end if;

  insert into public.quantum_continuation_transitions (
    id, series_id, transition_index, target_program_day, roster_revision,
    open_idempotency_key, status, closes_at, revision, created_at, updated_at
  ) values (
    v_day3_transition_id, v_series_id, 1, 3, 1,
    v_day3_open_key, 'scheduled', v_now - interval '5 hours',
    0, v_now - interval '5 hours', v_now - interval '1 hour'
  );

  insert into public.quantum_continuation_transition_members (
    transition_id, participant_user_id, roster_revision,
    source_program_day, fee_waived, created_at
  )
  select v_day3_transition_id, day2_member.participant_user_id,
         1, 2, true, v_now - interval '5 hours'
  from public.quantum_continuation_occurrence_members as day2_member
  where day2_member.occurrence_id = v_day2_occurrence_id
    and day2_member.participant_user_id = any(v_expected_participant_ids)
    and day2_member.attendance_status = 'present';

  insert into public.quantum_continuation_occurrences (
    id, series_id, transition_id, schedule_idempotency_key, program_day,
    physical_meeting_no, transition_index, status, starts_at, ends_at,
    chat_opens_at, chat_send_closes_at, content_state, content_revision,
    location_snapshot, revision, created_at, updated_at
  ) values (
    v_day3_occurrence_id, v_series_id, v_day3_transition_id,
    v_day3_schedule_key, 3, 3, 1, 'completed',
    v_now - interval '4 hours', v_now - interval '1 hour',
    v_now - interval '5 hours', v_now - interval '1 hour',
    '{}'::jsonb, 0,
    '{"confirmed":true,"name":"[로컬 검수] Day 3 앨범 장소","fixture":true}'::jsonb,
    0, v_now - interval '5 hours', v_now - interval '1 hour'
  );

  insert into public.quantum_continuation_occurrence_members (
    occurrence_id, participant_user_id, alias, attendance_status,
    attendance_revision, roster_revision, visible_from_program_day, created_at
  )
  select v_day3_occurrence_id, day2_member.participant_user_id,
         day2_member.alias, 'present', 1, 1, 2, v_now - interval '5 hours'
  from public.quantum_continuation_occurrence_members as day2_member
  where day2_member.occurrence_id = v_day2_occurrence_id
    and day2_member.participant_user_id = any(v_expected_participant_ids)
    and day2_member.attendance_status = 'present';

  if (select count(*)
      from public.quantum_continuation_transition_members as member
      where member.transition_id = v_day3_transition_id
        and member.source_program_day = 2) <> 5
     or (select count(*)
         from public.quantum_continuation_occurrence_members as member
         where member.occurrence_id = v_day3_occurrence_id
           and member.attendance_status = 'present') <> 5 then
    raise exception 'album_fixture_c660_day3_postcondition_failed';
  end if;

  v_album_context := quantum_private.continuation_album_target_context(
    v_test02_user_id,
    v_series_id,
    'occurrence',
    v_day3_occurrence_id
  );
  if coalesce((v_album_context ->> 'can_upload')::boolean, false) is distinct from true
     or (v_album_context ->> 'program_day')::integer <> 3
     or (v_album_context ->> 'physical_meeting_no')::integer <> 3 then
    raise exception 'album_fixture_c660_upload_window_not_open';
  end if;

  raise notice '[로컬 검수] Day 3 album fixture ready for test02=%', v_test02_user_id;
  raise notice 'series=/match/series/%', v_series_id;
  raise notice 'day3=/match/occurrences/%', v_day3_occurrence_id;
end
$fixture$;

commit;
