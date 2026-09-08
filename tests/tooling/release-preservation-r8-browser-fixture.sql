-- PROPOSAL ONLY: persistent local browser fixture for R8 Day 1 and Day 3.
--
-- Apply only to the disposable non-production Supabase container after the
-- c660 release-preservation fixture and the R8 migration have been reviewed.
-- This script intentionally COMMITs so the existing test02 login can inspect:
--   /match/series/d8100000-0000-4000-8000-000000000120
--   /match/occurrences/d8100000-0000-4000-8000-000000000140 (Day 1)
--   /match/occurrences/d8100000-0000-4000-8000-000000000141 (Day 3)
--
-- Safety boundaries:
--   * test02 and the four c660 synthetic profiles are read-only prerequisites;
--   * only new d810 source/series/transition/occurrence rows are inserted;
--   * no UPDATE or ON CONFLICT can change an existing fixture;
--   * this is synthetic local UI evidence, never production or real-user proof.
-- Day 3 click flow: practice scores all 0 -> confirm the server team -> main
-- scores all 0 -> last-frame scores all 0 -> give every tied team a one-ball
-- score. This reaches each restored phase without pre-writing runtime state.

\set ON_ERROR_STOP on

begin;

do $fixture$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_test02_user_id constant uuid := 'd964b372-ef61-4dce-aadd-214fa6f98a43';
  v_roster_user_ids constant uuid[] := array[
    'd964b372-ef61-4dce-aadd-214fa6f98a43'::uuid,
    'c6600000-0000-4000-8000-000000000001'::uuid,
    'c6600000-0000-4000-8000-000000000002'::uuid,
    'c6600000-0000-4000-8000-000000000003'::uuid,
    'c6600000-0000-4000-8000-000000000004'::uuid
  ];
  v_source_occurrence_id constant uuid := 'd8100000-0000-4000-8000-000000000100';
  v_source_id constant uuid := 'd8100000-0000-4000-8000-000000000110';
  v_series_id constant uuid := 'd8100000-0000-4000-8000-000000000120';
  v_day1_transition_id constant uuid := 'd8100000-0000-4000-8000-000000000130';
  v_day3_transition_id constant uuid := 'd8100000-0000-4000-8000-000000000131';
  v_day1_occurrence_id constant uuid := 'd8100000-0000-4000-8000-000000000140';
  v_day3_occurrence_id constant uuid := 'd8100000-0000-4000-8000-000000000141';
begin
  if not exists (
    select 1 from auth.users as auth_user
    where auth_user.id = v_test02_user_id and auth_user.phone = '821000000002'
  ) or (
    select pg_catalog.count(*)
    from public.profiles as profile
    where profile.user_id = any(v_roster_user_ids)
  ) <> 5 or (
    select pg_catalog.count(*) filter (where profile.gender = 'male')
    from public.profiles as profile
    where profile.user_id = any(v_roster_user_ids)
  ) <> 3 or (
    select pg_catalog.count(*) filter (where profile.gender = 'female')
    from public.profiles as profile
    where profile.user_id = any(v_roster_user_ids)
  ) <> 2 then
    raise exception 'r8_browser_fixture_c660_roster_prerequisite_missing';
  end if;

  if exists (
    select 1 from public.quantum_event_occurrences as occurrence
    where occurrence.id = v_source_occurrence_id or occurrence.room_code = 'D810L01'
  ) or exists (
    select 1 from public.quantum_continuation_sources as source
    where source.id = v_source_id
       or source.idempotency_key = 'd8100000-0000-4000-8000-000000000111'
  ) or exists (
    select 1 from public.quantum_continuation_series as series
    where series.id = v_series_id
  ) or exists (
    select 1 from public.quantum_continuation_transitions as transition
    where transition.id in (v_day1_transition_id, v_day3_transition_id)
       or transition.open_idempotency_key in (
         'd8100000-0000-4000-8000-000000000132',
         'd8100000-0000-4000-8000-000000000133'
       )
  ) or exists (
    select 1 from public.quantum_continuation_occurrences as occurrence
    where occurrence.id in (v_day1_occurrence_id, v_day3_occurrence_id)
       or occurrence.schedule_idempotency_key in (
         'd8100000-0000-4000-8000-000000000142',
         'd8100000-0000-4000-8000-000000000143'
       )
  ) then
    raise exception 'r8_browser_fixture_d810_id_collision';
  end if;

  insert into public.quantum_event_occurrences(
    id, event_id, event_mode, starts_at, ends_at, application_closes_at,
    location_name, male_capacity, female_capacity, required_total, status,
    room_number, room_code, roster_revision
  ) values (
    v_source_occurrence_id, 'local-review-walk-d810', 'scheduled',
    v_now - interval '4 days', v_now - interval '3 days 22 hours',
    v_now - interval '5 days', '[로컬 검수] 첫 만남 산책',
    3, 2, 5, 'completed', 1, 'D810L01', 1
  );
  insert into public.quantum_continuation_sources(
    id, source_kind, scheduled_event_occurrence_id, activity_kind,
    activity_snapshot, roster_revision, attendance_revision, snapshot_hash,
    source_completed_at, status, idempotency_key
  ) values (
    v_source_id, 'scheduled_event_occurrence', v_source_occurrence_id, 'walk',
    '{"title":"[로컬 검수] 다른 첫 활동","fixture":true}'::jsonb,
    1, 1, 'd810d810d810d810d810d810d810d810',
    v_now - interval '3 days 22 hours', 'ready',
    'd8100000-0000-4000-8000-000000000111'
  );
  insert into public.quantum_continuation_source_members(
    source_id, participant_user_id, seat_number, attendance_status,
    roster_revision, attendance_revision, joined_at
  )
  select v_source_id, roster.participant_user_id, roster.seat_number,
         'present', 1, 1, v_now - interval '4 days'
  from unnest(v_roster_user_ids) with ordinality as roster(participant_user_id, seat_number);

  insert into public.quantum_continuation_series(
    id, source_id, start_program_day, maximum_physical_meeting_no,
    status, revision, created_at, updated_at
  ) values (v_series_id, v_source_id, 1, 6, 'active', 0, v_now, v_now);
  insert into public.quantum_continuation_transitions(
    id, series_id, transition_index, target_program_day, roster_revision,
    open_idempotency_key, status, closes_at, revision, created_at, updated_at
  ) values
    (
      v_day1_transition_id, v_series_id, 0, 1, 1,
      'd8100000-0000-4000-8000-000000000132', 'scheduled',
      v_now + interval '1 day', 0, v_now, v_now
    ),
    (
      v_day3_transition_id, v_series_id, 2, 3, 1,
      'd8100000-0000-4000-8000-000000000133', 'scheduled',
      v_now + interval '1 day', 0, v_now, v_now
    );
  insert into public.quantum_continuation_transition_members(
    transition_id, participant_user_id, roster_revision,
    source_program_day, fee_waived, created_at
  )
  select transition_id, participant_user_id, 1, 1, true, v_now
  from (
    select v_day1_transition_id as transition_id, unnest(v_roster_user_ids) as participant_user_id
    union all
    select v_day3_transition_id, unnest(v_roster_user_ids)
  ) as fixture;

  -- The synthetic overlap makes both screens reachable during one local review.
  insert into public.quantum_continuation_occurrences(
    id, series_id, transition_id, schedule_idempotency_key, program_day,
    physical_meeting_no, transition_index, status, starts_at, ends_at,
    chat_opens_at, chat_send_closes_at, content_state, content_revision,
    location_snapshot, revision, created_at, updated_at
  ) values
    (
      v_day1_occurrence_id, v_series_id, v_day1_transition_id,
      'd8100000-0000-4000-8000-000000000142', 1, 2, 0, 'in_progress',
      v_now - interval '82 minutes', v_now + interval '68 minutes',
      v_now - interval '97 minutes', v_now + interval '68 minutes',
      '{}'::jsonb, 0,
      '{"confirmed":true,"name":"[로컬 검수] Day 1 보드게임","fixture":true}'::jsonb,
      0, v_now, v_now
    ),
    (
      v_day3_occurrence_id, v_series_id, v_day3_transition_id,
      'd8100000-0000-4000-8000-000000000143', 3, 4, 2, 'in_progress',
      v_now - interval '30 minutes', v_now + interval '150 minutes',
      v_now - interval '45 minutes', v_now + interval '150 minutes',
      '{}'::jsonb, 0,
      '{"confirmed":true,"name":"[로컬 검수] Day 3 볼링","fixture":true}'::jsonb,
      0, v_now, v_now
    );
  insert into public.quantum_continuation_occurrence_members(
    occurrence_id, participant_user_id, alias, attendance_status,
    attendance_revision, roster_revision, visible_from_program_day, created_at
  )
  select fixture.occurrence_id, fixture.participant_user_id,
         ('참가자 ' || fixture.seat_number)::text,
         'present', 1, 1, 1, v_now
  from (
    select v_day1_occurrence_id as occurrence_id, roster.participant_user_id, roster.seat_number
    from unnest(v_roster_user_ids) with ordinality as roster(participant_user_id, seat_number)
    union all
    select v_day3_occurrence_id, roster.participant_user_id, roster.seat_number
    from unnest(v_roster_user_ids) with ordinality as roster(participant_user_id, seat_number)
  ) as fixture;

  if (select pg_catalog.count(*) from public.quantum_continuation_source_members
      where source_id = v_source_id) <> 5
     or (select pg_catalog.count(*) from public.quantum_continuation_occurrence_members
         where occurrence_id in (v_day1_occurrence_id, v_day3_occurrence_id)) <> 10 then
    raise exception 'r8_browser_fixture_postcondition_failed';
  end if;

  raise notice '[로컬 검수] R8 fixture ready for test02=%', v_test02_user_id;
  raise notice 'series=/match/series/%', v_series_id;
  raise notice 'day1=/match/occurrences/%', v_day1_occurrence_id;
  raise notice 'day3=/match/occurrences/%', v_day3_occurrence_id;
end
$fixture$;

commit;
