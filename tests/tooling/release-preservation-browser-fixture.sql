-- PROPOSAL ONLY: persistent local browser-review fixture.
--
-- Apply only to the disposable non-production Supabase container after review.
-- This script intentionally COMMITs so the existing test02 login can inspect:
--   /friends
--   /match/series/c6600000-0000-4000-8000-000000000120
--   /match/occurrences/c6600000-0000-4000-8000-000000000140 (Day 2)
--   /match/occurrences/c6600000-0000-4000-8000-000000000141 (Day 4)
--
-- Safety boundaries:
--   * the existing test02 auth user and profile are read-only prerequisites;
--   * every inserted identity and ledger id uses the reserved c660 fixture range;
--   * there is no ON CONFLICT or UPDATE, so stale fixture data fails closed;
--   * this is UI evidence only, not production, payment, deployment, or real-user proof.

\set ON_ERROR_STOP on

begin;

do $fixture$
declare
  v_expected_test02_user_id constant uuid := 'd964b372-ef61-4dce-aadd-214fa6f98a43';
  v_test02_user_id uuid;
  v_now timestamptz := clock_timestamp();
  v_synthetic_user_ids constant uuid[] := array[
    'c6600000-0000-4000-8000-000000000001'::uuid,
    'c6600000-0000-4000-8000-000000000002'::uuid,
    'c6600000-0000-4000-8000-000000000003'::uuid,
    'c6600000-0000-4000-8000-000000000004'::uuid
  ];
  v_source_occurrence_id constant uuid := 'c6600000-0000-4000-8000-000000000100';
  v_source_id constant uuid := 'c6600000-0000-4000-8000-000000000110';
  v_series_id constant uuid := 'c6600000-0000-4000-8000-000000000120';
  v_day2_transition_id constant uuid := 'c6600000-0000-4000-8000-000000000130';
  v_day4_transition_id constant uuid := 'c6600000-0000-4000-8000-000000000131';
  v_day2_occurrence_id constant uuid := 'c6600000-0000-4000-8000-000000000140';
  v_day4_occurrence_id constant uuid := 'c6600000-0000-4000-8000-000000000141';
begin
  select auth_user.id
  into v_test02_user_id
  from auth.users as auth_user
  where auth_user.id = v_expected_test02_user_id
    and auth_user.phone = '821000000002';

  if v_test02_user_id is null then
    raise exception 'release_fixture_test02_identity_mismatch';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.user_id = v_test02_user_id
      and profile.gender = 'female'
  ) then
    raise exception 'release_fixture_test02_female_profile_required';
  end if;

  -- Give collision failures a fixture-specific reason before any row is written.
  if exists (
    select 1 from auth.users as auth_user
    where auth_user.id = any(v_synthetic_user_ids)
       or auth_user.email in (
         'local-review-c660-01@example.invalid',
         'local-review-c660-02@example.invalid',
         'local-review-c660-03@example.invalid',
         'local-review-c660-04@example.invalid'
       )
       or auth_user.phone in (
         '821066000001', '821066000002', '821066000003', '821066000004'
       )
  ) or exists (
    select 1 from public.profiles as profile
    where profile.user_id = any(v_synthetic_user_ids)
       or public.normalize_profile_display_name(profile.display_name) in (
         public.normalize_profile_display_name('로컬검수 친구1'),
         public.normalize_profile_display_name('로컬검수 친구2'),
         public.normalize_profile_display_name('로컬검수 친구3'),
         public.normalize_profile_display_name('로컬검수 친구4')
       )
  ) or exists (
    -- Avoid the public.users signup trigger attaching any pre-existing invite
    -- to a synthetic phone number.
    select 1 from public.friend_requests as request
    where request.receiver_phone in (
      '821066000001', '821066000002', '821066000003', '821066000004'
    )
  ) or exists (
    select 1 from public.quantum_event_occurrences as occurrence
    where occurrence.id = v_source_occurrence_id
       or occurrence.room_code = 'C660L01'
  ) or exists (
    select 1 from public.quantum_continuation_sources as source
    where source.id = v_source_id
       or source.idempotency_key = 'c6600000-0000-4000-8000-000000000111'
  ) or exists (
    select 1 from public.quantum_continuation_series as series
    where series.id = v_series_id
  ) or exists (
    select 1 from public.quantum_continuation_transitions as transition
    where transition.id in (v_day2_transition_id, v_day4_transition_id)
       or transition.open_idempotency_key in (
         'c6600000-0000-4000-8000-000000000132',
         'c6600000-0000-4000-8000-000000000133'
       )
  ) or exists (
    select 1 from public.quantum_continuation_occurrences as occurrence
    where occurrence.id in (v_day2_occurrence_id, v_day4_occurrence_id)
       or occurrence.schedule_idempotency_key in (
         'c6600000-0000-4000-8000-000000000142',
         'c6600000-0000-4000-8000-000000000143'
       )
  ) or exists (
    select 1 from public.friend_requests as request
    where request.id in (
      'c6600000-0000-4000-8000-000000000200',
      'c6600000-0000-4000-8000-000000000201',
      'c6600000-0000-4000-8000-000000000202',
      'c6600000-0000-4000-8000-000000000203'
    ) or request.token in (
      'c660-local-review-friend-0001',
      'c660-local-review-friend-0002',
      'c660-local-review-friend-0003',
      'c660-local-review-friend-0004'
    )
  ) then
    raise exception 'release_fixture_c660_id_collision';
  end if;

  insert into auth.users (
    id, aud, role, email, phone, email_confirmed_at, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (
      v_synthetic_user_ids[1], 'authenticated', 'authenticated',
      'local-review-c660-01@example.invalid', '821066000001', v_now, v_now,
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, v_now, v_now
    ),
    (
      v_synthetic_user_ids[2], 'authenticated', 'authenticated',
      'local-review-c660-02@example.invalid', '821066000002', v_now, v_now,
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, v_now, v_now
    ),
    (
      v_synthetic_user_ids[3], 'authenticated', 'authenticated',
      'local-review-c660-03@example.invalid', '821066000003', v_now, v_now,
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, v_now, v_now
    ),
    (
      v_synthetic_user_ids[4], 'authenticated', 'authenticated',
      'local-review-c660-04@example.invalid', '821066000004', v_now, v_now,
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, v_now, v_now
    );

  -- test02 remains the second female participant. The synthetic roster supplies
  -- three male and one female profiles, producing the supported 3M/2F room.
  insert into public.profiles (
    user_id, gender, age, school, display_name, is_profile_complete
  ) values
    (v_synthetic_user_ids[1], 'male', 24, 'pnu', '로컬검수 친구1', true),
    (v_synthetic_user_ids[2], 'male', 24, 'pnu', '로컬검수 친구2', true),
    (v_synthetic_user_ids[3], 'male', 24, 'pnu', '로컬검수 친구3', true),
    (v_synthetic_user_ids[4], 'female', 24, 'pnu', '로컬검수 친구4', true);

  insert into public.friend_requests (
    id, sender_user_id, receiver_user_id, token, status, message,
    expires_at, responded_at, created_at
  ) values
    (
      'c6600000-0000-4000-8000-000000000200', v_test02_user_id,
      v_synthetic_user_ids[1], 'c660-local-review-friend-0001', 'accepted',
      '[로컬 검수] 합성 친구 연결', v_now + interval '365 days', v_now, v_now
    ),
    (
      'c6600000-0000-4000-8000-000000000201', v_test02_user_id,
      v_synthetic_user_ids[2], 'c660-local-review-friend-0002', 'accepted',
      '[로컬 검수] 합성 친구 연결', v_now + interval '365 days', v_now, v_now
    ),
    (
      'c6600000-0000-4000-8000-000000000202', v_test02_user_id,
      v_synthetic_user_ids[3], 'c660-local-review-friend-0003', 'accepted',
      '[로컬 검수] 합성 친구 연결', v_now + interval '365 days', v_now, v_now
    ),
    (
      'c6600000-0000-4000-8000-000000000203', v_test02_user_id,
      v_synthetic_user_ids[4], 'c660-local-review-friend-0004', 'accepted',
      '[로컬 검수] 합성 친구 연결', v_now + interval '365 days', v_now, v_now
    );

  insert into public.friendships (
    user_id, friend_user_id, status, created_from_request_id, created_at
  ) values
    (
      least(v_test02_user_id, v_synthetic_user_ids[1]),
      greatest(v_test02_user_id, v_synthetic_user_ids[1]),
      'active', 'c6600000-0000-4000-8000-000000000200', v_now
    ),
    (
      least(v_test02_user_id, v_synthetic_user_ids[2]),
      greatest(v_test02_user_id, v_synthetic_user_ids[2]),
      'active', 'c6600000-0000-4000-8000-000000000201', v_now
    ),
    (
      least(v_test02_user_id, v_synthetic_user_ids[3]),
      greatest(v_test02_user_id, v_synthetic_user_ids[3]),
      'active', 'c6600000-0000-4000-8000-000000000202', v_now
    ),
    (
      least(v_test02_user_id, v_synthetic_user_ids[4]),
      greatest(v_test02_user_id, v_synthetic_user_ids[4]),
      'active', 'c6600000-0000-4000-8000-000000000203', v_now
    );

  insert into public.quantum_event_occurrences (
    id, event_id, event_mode, starts_at, ends_at, application_closes_at,
    location_name, male_capacity, female_capacity, required_total, status,
    room_number, room_code, roster_revision
  ) values (
    v_source_occurrence_id, 'local-review-board-game-c660', 'scheduled',
    v_now - interval '4 days', v_now - interval '3 days 22 hours',
    v_now - interval '5 days', '[로컬 검수] 첫 만남 보드게임',
    3, 2, 5, 'completed', 1, 'C660L01', 1
  );

  insert into public.quantum_continuation_sources (
    id, source_kind, scheduled_event_occurrence_id, activity_kind,
    activity_snapshot, roster_revision, attendance_revision, snapshot_hash,
    source_completed_at, status, idempotency_key
  ) values (
    v_source_id, 'scheduled_event_occurrence', v_source_occurrence_id,
    'board_game',
    '{"title":"[로컬 검수] Day 1 보드게임","sourceDay":1,"fixture":true}'::jsonb,
    1, 1, 'c660c660c660c660c660c660c660c660',
    v_now - interval '3 days 22 hours', 'ready',
    'c6600000-0000-4000-8000-000000000111'
  );

  insert into public.quantum_continuation_source_members (
    source_id, participant_user_id, seat_number, attendance_status,
    roster_revision, attendance_revision, joined_at
  ) values
    (v_source_id, v_test02_user_id, 1, 'present', 1, 1, v_now - interval '4 days'),
    (v_source_id, v_synthetic_user_ids[1], 2, 'present', 1, 1, v_now - interval '4 days'),
    (v_source_id, v_synthetic_user_ids[2], 3, 'present', 1, 1, v_now - interval '4 days'),
    (v_source_id, v_synthetic_user_ids[3], 4, 'present', 1, 1, v_now - interval '4 days'),
    (v_source_id, v_synthetic_user_ids[4], 5, 'present', 1, 1, v_now - interval '4 days');

  insert into public.quantum_continuation_series (
    id, source_id, start_program_day, maximum_physical_meeting_no,
    status, revision, created_at, updated_at
  ) values (
    v_series_id, v_source_id, 2, 5, 'active', 0, v_now, v_now
  );

  insert into public.quantum_continuation_transitions (
    id, series_id, transition_index, target_program_day, roster_revision,
    open_idempotency_key, status, closes_at, revision, created_at, updated_at
  ) values
    (
      v_day2_transition_id, v_series_id, 0, 2, 1,
      'c6600000-0000-4000-8000-000000000132', 'scheduled',
      v_now + interval '1 day', 0, v_now, v_now
    ),
    (
      v_day4_transition_id, v_series_id, 2, 4, 1,
      'c6600000-0000-4000-8000-000000000133', 'scheduled',
      v_now + interval '1 day', 0, v_now, v_now
    );

  insert into public.quantum_continuation_transition_members (
    transition_id, participant_user_id, roster_revision,
    source_program_day, fee_waived, created_at
  )
  select fixture.transition_id, fixture.participant_user_id, 1, 1, true, v_now
  from (
    values
      (v_day2_transition_id, v_test02_user_id),
      (v_day2_transition_id, v_synthetic_user_ids[1]),
      (v_day2_transition_id, v_synthetic_user_ids[2]),
      (v_day2_transition_id, v_synthetic_user_ids[3]),
      (v_day2_transition_id, v_synthetic_user_ids[4]),
      (v_day4_transition_id, v_test02_user_id),
      (v_day4_transition_id, v_synthetic_user_ids[1]),
      (v_day4_transition_id, v_synthetic_user_ids[2]),
      (v_day4_transition_id, v_synthetic_user_ids[3]),
      (v_day4_transition_id, v_synthetic_user_ids[4])
  ) as fixture(transition_id, participant_user_id);

  -- Both content days are intentionally open at once for direct browser review.
  -- This synthetic overlap is not an operating schedule recommendation.
  insert into public.quantum_continuation_occurrences (
    id, series_id, transition_id, schedule_idempotency_key, program_day,
    physical_meeting_no, transition_index, status, starts_at, ends_at,
    chat_opens_at, chat_send_closes_at, content_state, content_revision,
    location_snapshot, revision, created_at, updated_at
  ) values
    (
      v_day2_occurrence_id, v_series_id, v_day2_transition_id,
      'c6600000-0000-4000-8000-000000000142', 2, 2, 0, 'in_progress',
      v_now - interval '20 minutes', v_now + interval '100 minutes',
      v_now - interval '35 minutes', v_now + interval '100 minutes',
      '{}'::jsonb, 0,
      '{"confirmed":true,"name":"[로컬 검수] Day 2 대화 장소","fixture":true}'::jsonb,
      0, v_now, v_now
    ),
    (
      v_day4_occurrence_id, v_series_id, v_day4_transition_id,
      'c6600000-0000-4000-8000-000000000143', 4, 4, 2, 'in_progress',
      v_now - interval '45 minutes', v_now + interval '75 minutes',
      v_now - interval '60 minutes', v_now + interval '75 minutes',
      '{}'::jsonb, 0,
      '{"confirmed":true,"name":"[로컬 검수] Day 4 같은 답 장소","fixture":true}'::jsonb,
      0, v_now, v_now
    );

  insert into public.quantum_continuation_occurrence_members (
    occurrence_id, participant_user_id, alias, attendance_status,
    attendance_revision, roster_revision, visible_from_program_day, created_at
  )
  select fixture.occurrence_id, fixture.participant_user_id, fixture.alias,
         'present', 1, 1, 2, v_now
  from (
    values
      (v_day2_occurrence_id, v_test02_user_id, '참가자 1'),
      (v_day2_occurrence_id, v_synthetic_user_ids[1], '참가자 2'),
      (v_day2_occurrence_id, v_synthetic_user_ids[2], '참가자 3'),
      (v_day2_occurrence_id, v_synthetic_user_ids[3], '참가자 4'),
      (v_day2_occurrence_id, v_synthetic_user_ids[4], '참가자 5'),
      (v_day4_occurrence_id, v_test02_user_id, '참가자 1'),
      (v_day4_occurrence_id, v_synthetic_user_ids[1], '참가자 2'),
      (v_day4_occurrence_id, v_synthetic_user_ids[2], '참가자 3'),
      (v_day4_occurrence_id, v_synthetic_user_ids[3], '참가자 4'),
      (v_day4_occurrence_id, v_synthetic_user_ids[4], '참가자 5')
  ) as fixture(occurrence_id, participant_user_id, alias);

  if (select count(*) from public.friendships as friendship
      where friendship.status = 'active'
        and v_test02_user_id in (friendship.user_id, friendship.friend_user_id)
        and (case when friendship.user_id = v_test02_user_id
                  then friendship.friend_user_id else friendship.user_id end) = any(v_synthetic_user_ids)) <> 4
     or (select count(*) from public.quantum_continuation_source_members as member
         where member.source_id = v_source_id and member.attendance_status = 'present') <> 5
     or (select count(*) from public.quantum_continuation_occurrence_members as member
         where member.occurrence_id in (v_day2_occurrence_id, v_day4_occurrence_id)) <> 10 then
    raise exception 'release_fixture_postcondition_failed';
  end if;

  raise notice '[로컬 검수] fixture ready for test02=%', v_test02_user_id;
  raise notice 'series=/match/series/%', v_series_id;
  raise notice 'day2=/match/occurrences/%', v_day2_occurrence_id;
  raise notice 'day4=/match/occurrences/%', v_day4_occurrence_id;
end
$fixture$;

commit;
