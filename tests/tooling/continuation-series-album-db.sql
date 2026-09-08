\set ON_ERROR_STOP on

-- Synthetic-only executable regression for the optional continuation album.
-- All fixture rows and assertions are removed by the final ROLLBACK.
BEGIN;
SET LOCAL client_min_messages TO warning;

CREATE TEMP TABLE continuation_album_assertions (
  label TEXT PRIMARY KEY
) ON COMMIT DROP;
GRANT SELECT, INSERT ON TABLE continuation_album_assertions TO service_role;

CREATE FUNCTION pg_temp.assert_true(p_condition BOOLEAN, p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_condition IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'XX000', MESSAGE = 'assertion_failed:' || p_label;
  END IF;
  INSERT INTO pg_temp.continuation_album_assertions(label) VALUES (p_label);
END;
$$;

CREATE FUNCTION pg_temp.assert_raises(p_sql TEXT, p_message TEXT, p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_message TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message IS DISTINCT FROM p_message THEN
      RAISE EXCEPTION USING
        ERRCODE = 'XX000',
        MESSAGE = 'assertion_failed:' || p_label || ':expected=' || p_message || ':actual=' || coalesce(v_message, '<null>');
    END IF;
    INSERT INTO pg_temp.continuation_album_assertions(label) VALUES (p_label);
    RETURN;
  END;
  RAISE EXCEPTION USING ERRCODE = 'XX000', MESSAGE = 'assertion_failed:' || p_label || ':expected_error_not_raised';
END;
$$;

SELECT pg_temp.assert_true(
  to_regclass('public.quantum_continuation_album_photos') IS NOT NULL,
  'schema.album_table_exists'
);
SELECT pg_temp.assert_true(
  (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.quantum_continuation_album_photos'::regclass),
  'security.album_table_has_rls'
);
SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'public.quantum_continuation_album_photos', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('anon', 'public.quantum_continuation_album_photos', 'SELECT,INSERT,UPDATE,DELETE'),
  'security.client_roles_have_no_direct_table_access'
);
SELECT pg_temp.assert_true(
  to_regprocedure('public.get_continuation_series_album_for_service(uuid,uuid)') IS NOT NULL
    AND to_regprocedure('public.get_continuation_series_album_upload_target_for_service(uuid,uuid,text,uuid)') IS NOT NULL
    AND to_regprocedure('public.reserve_continuation_series_album_upload_for_service(uuid,uuid,text,uuid,uuid,uuid,text,uuid)') IS NOT NULL
    AND to_regprocedure('public.finalize_continuation_series_album_upload_for_service(uuid,uuid,uuid,uuid,integer)') IS NOT NULL
    AND to_regprocedure('public.reserve_continuation_series_album_delete_for_service(uuid,uuid,uuid)') IS NOT NULL
    AND to_regprocedure('public.finalize_continuation_series_album_delete_for_service(uuid,uuid,uuid)') IS NOT NULL,
  'rpc.service_signatures_exist'
);
SELECT pg_temp.assert_true(
  NOT has_function_privilege('authenticated', 'public.get_continuation_series_album_for_service(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.get_continuation_series_album_for_service(uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.get_continuation_series_album_for_service(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.get_continuation_series_album_upload_target_for_service(uuid,uuid,text,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.get_continuation_series_album_upload_target_for_service(uuid,uuid,text,uuid)', 'EXECUTE'),
  'security.album_projection_is_service_only'
);
SELECT pg_catalog.set_config('request.jwt.claim.role', '', true);
SELECT pg_temp.assert_raises(
  $call$SELECT public.get_continuation_series_album_for_service(NULL,NULL)$call$,
  'service_role_required',
  'security.missing_service_claim_is_denied'
);

INSERT INTO auth.users (
  id, aud, role, email, phone, email_confirmed_at, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('b5100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'series-album-01@example.invalid', '821088880001', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b5100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'series-album-02@example.invalid', '821088880002', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b5100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'series-album-03@example.invalid', '821088880003', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b5100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'series-album-04@example.invalid', '821088880004', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.quantum_event_occurrences (
  id, event_id, event_mode, starts_at, ends_at, application_closes_at,
  location_name, male_capacity, female_capacity, required_total, status, room_number, room_code
)
VALUES (
  'b5200000-0000-4000-8000-000000000001', 'synthetic-series-album-source', 'scheduled',
  now() - interval '4 hours', now() - interval '2 hours', now() - interval '5 hours',
  'Synthetic rollback location', 2, 3, 5, 'completed', 1, 'R5T001'
);

INSERT INTO public.quantum_continuation_sources (
  id, source_kind, scheduled_event_occurrence_id, activity_kind, activity_snapshot,
  roster_revision, attendance_revision, snapshot_hash, source_completed_at, status, idempotency_key
)
VALUES (
  'b5300000-0000-4000-8000-000000000001', 'scheduled_event_occurrence',
  'b5200000-0000-4000-8000-000000000001', 'board_game', '{"title":"Synthetic board game"}',
  1, 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1 hour', 'ready',
  'b5300000-0000-4000-8000-000000000002'
);

INSERT INTO public.quantum_continuation_source_members (
  source_id, participant_user_id, seat_number, attendance_status, roster_revision, attendance_revision
)
VALUES
  ('b5300000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000001', 1, 'present', 1, 1),
  ('b5300000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000002', 2, 'present', 1, 1),
  ('b5300000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000003', 3, 'absent', 1, 1),
  ('b5300000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000004', 4, 'present', 1, 1);

INSERT INTO public.quantum_continuation_series (
  id, source_id, start_program_day, maximum_physical_meeting_no, status
)
VALUES (
  'b5400000-0000-4000-8000-000000000001', 'b5300000-0000-4000-8000-000000000001', 2, 5, 'active'
);

INSERT INTO public.quantum_continuation_transitions (
  id, series_id, transition_index, target_program_day, roster_revision,
  open_idempotency_key, status, closes_at
)
VALUES (
  'b5500000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001',
  0, 2, 1, 'b5500000-0000-4000-8000-000000000002', 'scheduled', now() + interval '1 day'
);

INSERT INTO public.quantum_continuation_transition_members (
  transition_id, participant_user_id, roster_revision, source_program_day
)
VALUES
  ('b5500000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000001', 1, 1),
  ('b5500000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000002', 1, 1),
  ('b5500000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000003', 1, 1),
  ('b5500000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000004', 1, 1);

INSERT INTO public.quantum_continuation_occurrences (
  id, series_id, transition_id, schedule_idempotency_key, program_day, physical_meeting_no,
  transition_index, status, starts_at, ends_at, chat_opens_at, chat_send_closes_at,
  location_snapshot
)
VALUES (
  'b5600000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001',
  'b5500000-0000-4000-8000-000000000001', 'b5600000-0000-4000-8000-000000000002',
  2, 2, 0, 'in_progress', now() - interval '30 minutes', now() + interval '30 minutes',
  now() - interval '1 hour', now() + interval '15 minutes', '{"name":"Synthetic rollback location"}'
);

INSERT INTO public.quantum_continuation_occurrence_members (
  occurrence_id, participant_user_id, alias, attendance_status, attendance_revision,
  roster_revision, visible_from_program_day
)
VALUES
  ('b5600000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000001', '참가자 1', 'present', 1, 1, 2),
  ('b5600000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000002', '참가자 2', 'present', 1, 1, 2),
  ('b5600000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000003', '참가자 3', 'present', 1, 1, 2),
  ('b5600000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000004', '참가자 4', 'present', 1, 1, 3);

SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  v_album JSONB;
  v_reserved JSONB;
  v_replayed JSONB;
BEGIN
  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    jsonb_array_length(v_album->'days') = 2
      AND v_album->'days'->0->>'target_kind' = 'source'
      AND (v_album->'days'->0->>'program_day')::integer = 1
      AND (v_album->'days'->0->>'physical_meeting_no')::integer = 1
      AND v_album->'days'->1->>'target_kind' = 'occurrence'
      AND (v_album->'days'->1->>'program_day')::integer = 2,
    'projection.board_source_and_occurrence_keep_distinct_day_axes'
  );
  PERFORM pg_temp.assert_true(
    (v_album->'days'->0->>'can_upload')::boolean
      AND (v_album->'days'->1->>'can_upload')::boolean,
    'projection.explicit_completion_windows_are_open'
  );

  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000003', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    jsonb_array_length(v_album->'days') = 1
      AND v_album->'days'->0->>'target_kind' = 'occurrence',
    'projection.source_requires_present_plus_series_access'
  );
  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000004', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    jsonb_array_length(v_album->'days') = 1
      AND v_album->'days'->0->>'target_kind' = 'source',
    'projection.visible_from_program_day_is_enforced'
  );

  v_reserved := public.reserve_continuation_series_album_upload_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001',
    'source', 'b5300000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000001', 'b5700000-0000-4000-8000-000000000002',
    repeat('a', 64), 'b5700000-0000-4000-8000-000000000003'
  );
  PERFORM pg_temp.assert_true(
    v_reserved->>'status' = 'uploading'
      AND (v_reserved->>'owns_processing')::boolean
      AND NOT (v_reserved->>'replayed')::boolean,
    'upload.first_reservation_owns_processing'
  );
  v_replayed := public.reserve_continuation_series_album_upload_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001',
    'source', 'b5300000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000009', 'b5700000-0000-4000-8000-000000000002',
    repeat('a', 64), 'b5700000-0000-4000-8000-000000000004'
  );
  PERFORM pg_temp.assert_true(
    v_replayed->>'photo_id' = v_reserved->>'photo_id'
      AND (v_replayed->>'replayed')::boolean
      AND NOT (v_replayed->>'owns_processing')::boolean,
    'upload.active_lease_retry_keeps_photo_identity_without_takeover'
  );
  PERFORM pg_temp.assert_true(
    (SELECT processing_token = 'b5700000-0000-4000-8000-000000000003'
     FROM public.quantum_continuation_album_photos
     WHERE id = 'b5700000-0000-4000-8000-000000000001'),
    'upload.active_lease_retry_does_not_rotate_token'
  );
  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    jsonb_array_length(v_album->'pending_uploads') = 1
      AND v_album->'pending_uploads'->0->>'photo_id' = 'b5700000-0000-4000-8000-000000000001'
      AND v_album->'pending_uploads'->0->>'target_kind' = 'source'
      AND v_album->'pending_uploads'->0->>'target_id' = 'b5300000-0000-4000-8000-000000000001'
      AND NOT (v_album->'pending_uploads'->0->>'can_cancel')::boolean
      AND NOT (v_album->'pending_uploads'->0 ? 'storage_path')
      AND NOT (v_album->'pending_uploads'->0 ? 'processing_token')
      AND NOT (v_album->'pending_uploads'->0 ? 'source_sha256')
      AND NOT (v_album->'pending_uploads'->0 ? 'upload_idempotency_key'),
    'upload.owner_projection_is_safe_and_active_lease_is_not_cancelable'
  );
  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000002', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    v_album->'pending_uploads' = '[]'::jsonb,
    'upload.other_member_cannot_see_owner_pending_upload'
  );
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.reserve_continuation_series_album_upload_for_service('b5100000-0000-4000-8000-000000000001','b5400000-0000-4000-8000-000000000001','source','b5300000-0000-4000-8000-000000000001','b5700000-0000-4000-8000-000000000010','b5700000-0000-4000-8000-000000000002',repeat('b',64),'b5700000-0000-4000-8000-000000000011')$call$,
    'idempotency_key_reused',
    'upload.same_key_different_payload_is_rejected'
  );
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.reserve_continuation_series_album_delete_for_service('b5100000-0000-4000-8000-000000000001','b5400000-0000-4000-8000-000000000001','b5700000-0000-4000-8000-000000000001')$call$,
    'series_album_upload_busy',
    'delete.active_upload_lease_is_not_raced'
  );
END;
$test$;

RESET ROLE;

UPDATE public.quantum_continuation_album_photos
SET processing_lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
WHERE id = 'b5700000-0000-4000-8000-000000000001';

SET LOCAL ROLE service_role;
DO $test$
DECLARE
  v_album JSONB;
  v_replayed JSONB;
  v_finalized JSONB;
BEGIN
  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    (v_album->'pending_uploads'->0->>'can_cancel')::boolean,
    'upload.expired_lease_is_cancelable_after_reload'
  );
  v_replayed := public.reserve_continuation_series_album_upload_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001',
    'source', 'b5300000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000009', 'b5700000-0000-4000-8000-000000000002',
    repeat('a', 64), 'b5700000-0000-4000-8000-000000000005'
  );
  PERFORM pg_temp.assert_true(
    v_replayed->>'photo_id' = 'b5700000-0000-4000-8000-000000000001'
      AND (v_replayed->>'replayed')::boolean
      AND (v_replayed->>'owns_processing')::boolean,
    'upload.expired_lease_retry_takes_over_same_photo'
  );
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.finalize_continuation_series_album_upload_for_service('b5100000-0000-4000-8000-000000000001','b5400000-0000-4000-8000-000000000001','b5700000-0000-4000-8000-000000000001','b5700000-0000-4000-8000-000000000003',1024)$call$,
    'series_album_processing_conflict',
    'upload.previous_owner_token_cannot_finalize_after_takeover'
  );
  v_finalized := public.finalize_continuation_series_album_upload_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000001', 'b5700000-0000-4000-8000-000000000005', 1024
  );
  PERFORM pg_temp.assert_true(v_finalized->>'status' = 'active', 'upload.takeover_owner_finalizes_photo');
END;
$test$;

RESET ROLE;

UPDATE public.quantum_continuation_sources
SET source_completed_at = now() - interval '2 days'
WHERE id = 'b5300000-0000-4000-8000-000000000001';

SET LOCAL ROLE service_role;
DO $test$
DECLARE
  v_replayed JSONB;
BEGIN
  v_replayed := public.reserve_continuation_series_album_upload_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001',
    'source', 'b5300000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000012', 'b5700000-0000-4000-8000-000000000002',
    repeat('a', 64), 'b5700000-0000-4000-8000-000000000013'
  );
  PERFORM pg_temp.assert_true(
    v_replayed->>'status' = 'active' AND (v_replayed->>'replayed')::boolean,
    'upload.finalized_retry_is_stable_after_window_close'
  );
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.reserve_continuation_series_album_upload_for_service('b5100000-0000-4000-8000-000000000001','b5400000-0000-4000-8000-000000000001','source','b5300000-0000-4000-8000-000000000001','b5700000-0000-4000-8000-000000000014','b5700000-0000-4000-8000-000000000015',repeat('c',64),'b5700000-0000-4000-8000-000000000016')$call$,
    'series_album_upload_closed',
    'upload.new_photo_is_rejected_after_24_hours'
  );
END;
$test$;

RESET ROLE;

-- An expired uploading row can be canceled without racing the active uploader.
SET LOCAL ROLE service_role;
DO $test$
DECLARE
  v_reserved JSONB;
BEGIN
  v_reserved := public.reserve_continuation_series_album_upload_for_service(
    'b5100000-0000-4000-8000-000000000002', 'b5400000-0000-4000-8000-000000000001',
    'occurrence', 'b5600000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000030', 'b5700000-0000-4000-8000-000000000031',
    repeat('3', 64), 'b5700000-0000-4000-8000-000000000032'
  );
  PERFORM pg_temp.assert_true(
    v_reserved->>'status' = 'uploading' AND (v_reserved->>'owns_processing')::boolean,
    'delete_race.fixture_upload_is_reserved'
  );
END;
$test$;
RESET ROLE;

UPDATE public.quantum_continuation_album_photos
SET processing_lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
WHERE id = 'b5700000-0000-4000-8000-000000000030';

SET LOCAL ROLE service_role;
DO $test$
DECLARE
  v_result JSONB;
  v_album JSONB;
BEGIN
  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000002', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    v_album->'pending_uploads'->0->>'photo_id' = 'b5700000-0000-4000-8000-000000000030'
      AND (v_album->'pending_uploads'->0->>'can_cancel')::boolean,
    'delete_race.expired_upload_is_recoverable_after_reload'
  );
  v_result := public.reserve_continuation_series_album_delete_for_service(
    'b5100000-0000-4000-8000-000000000002', 'b5400000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000030'
  );
  PERFORM pg_temp.assert_true(
    v_result->>'status' = 'delete_pending',
    'delete_race.expired_upload_can_enter_delete_pending'
  );
  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000002', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    v_album->'pending_uploads' = '[]'::jsonb
      AND v_album->'pending_deletion_photo_ids' = '["b5700000-0000-4000-8000-000000000030"]'::jsonb,
    'delete_race.cleanup_stays_observable_until_storage_removal'
  );
  -- Model the first delete request removing an object that was not written yet.
  v_result := public.finalize_continuation_series_album_delete_for_service(
    'b5100000-0000-4000-8000-000000000002', 'b5400000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000030'
  );
  PERFORM pg_temp.assert_true(v_result->>'status' = 'deleted', 'delete_race.initial_delete_can_finalize');
  -- The expired uploader now finishes its object write and reports with its old token.
  v_result := public.finalize_continuation_series_album_upload_for_service(
    'b5100000-0000-4000-8000-000000000002', 'b5400000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000030', 'b5700000-0000-4000-8000-000000000032', 1024
  );
  PERFORM pg_temp.assert_true(
    v_result->>'status' = 'delete_pending'
      AND (v_result->>'cleanup_required')::boolean
      AND v_result->>'storage_path' = 'continuation-series/b5400000-0000-4000-8000-000000000001/occurrence/b5600000-0000-4000-8000-000000000001/b5700000-0000-4000-8000-000000000030.jpg',
    'delete_race.late_finalize_reopens_observable_terminal_cleanup'
  );
  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000002', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    v_album->'pending_deletion_photo_ids' = '["b5700000-0000-4000-8000-000000000030"]'::jsonb,
    'delete_race.failed_late_cleanup_can_be_retried_after_reload'
  );
  -- The SQL fixture has no object; this models successful late-object removal before strict finalize.
  v_result := public.finalize_continuation_series_album_delete_for_service(
    'b5100000-0000-4000-8000-000000000002', 'b5400000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000030'
  );
  PERFORM pg_temp.assert_true(v_result->>'status' = 'deleted', 'delete_race.cleanup_finalize_marks_deleted');
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1 FROM public.quantum_continuation_album_photos
      WHERE id = 'b5700000-0000-4000-8000-000000000030'
        AND status in ('uploading', 'active', 'delete_pending')
    ),
    'delete_race.deleted_reservation_releases_quota'
  );
END;
$test$;
RESET ROLE;

-- Reserved rows count toward both limits. Direct synthetic rows avoid object uploads.
INSERT INTO public.quantum_continuation_album_photos (
  id, series_id, source_id, uploader_user_id, upload_idempotency_key, storage_path,
  source_sha256, content_type, byte_size, status, activated_at
)
SELECT
  generated.id,
  'b5400000-0000-4000-8000-000000000001',
  'b5300000-0000-4000-8000-000000000001',
  'b5100000-0000-4000-8000-000000000001',
  pg_catalog.gen_random_uuid(),
  'continuation-series/b5400000-0000-4000-8000-000000000001/source/b5300000-0000-4000-8000-000000000001/' || generated.id::text || '.jpg',
  repeat('d', 64), 'image/jpeg', 100, 'active', now()
FROM (SELECT pg_catalog.gen_random_uuid() AS id FROM generate_series(1, 9)) AS generated;

UPDATE public.quantum_continuation_sources
SET source_completed_at = now() - interval '1 hour'
WHERE id = 'b5300000-0000-4000-8000-000000000001';

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_raises(
  $call$SELECT public.reserve_continuation_series_album_upload_for_service('b5100000-0000-4000-8000-000000000001','b5400000-0000-4000-8000-000000000001','source','b5300000-0000-4000-8000-000000000001','b5700000-0000-4000-8000-000000000017','b5700000-0000-4000-8000-000000000018',repeat('e',64),'b5700000-0000-4000-8000-000000000019')$call$,
  'series_album_user_limit',
  'limits.reservations_and_active_rows_count_toward_user_ten'
);
RESET ROLE;

-- Keep the owner's finalized photo and add 40 rows so the target reaches 50.
INSERT INTO public.quantum_continuation_album_photos (
  id, series_id, source_id, uploader_user_id, upload_idempotency_key, storage_path,
  source_sha256, content_type, byte_size, status, activated_at
)
SELECT
  generated.id,
  'b5400000-0000-4000-8000-000000000001',
  'b5300000-0000-4000-8000-000000000001',
  'b5100000-0000-4000-8000-000000000002',
  pg_catalog.gen_random_uuid(),
  'continuation-series/b5400000-0000-4000-8000-000000000001/source/b5300000-0000-4000-8000-000000000001/' || generated.id::text || '.jpg',
  repeat('f', 64), 'image/jpeg', 100, 'active', now()
FROM (SELECT pg_catalog.gen_random_uuid() AS id FROM generate_series(1, 40)) AS generated;

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_raises(
  $call$SELECT public.reserve_continuation_series_album_upload_for_service('b5100000-0000-4000-8000-000000000004','b5400000-0000-4000-8000-000000000001','source','b5300000-0000-4000-8000-000000000001','b5700000-0000-4000-8000-000000000020','b5700000-0000-4000-8000-000000000021',repeat('0',64),'b5700000-0000-4000-8000-000000000022')$call$,
  'series_album_target_limit',
  'limits.reservations_and_active_rows_count_toward_target_fifty'
);
SELECT pg_temp.assert_raises(
  $call$SELECT public.reserve_continuation_series_album_delete_for_service('b5100000-0000-4000-8000-000000000002','b5400000-0000-4000-8000-000000000001','b5700000-0000-4000-8000-000000000001')$call$,
  'forbidden',
  'delete.other_member_cannot_delete_owner_photo'
);

DO $test$
DECLARE
  v_result JSONB;
  v_album JSONB;
BEGIN
  v_result := public.reserve_continuation_series_album_delete_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(v_result->>'status' = 'delete_pending', 'delete.owner_can_reserve_delete');
  PERFORM pg_temp.assert_true(
    (SELECT deletion_requested_at IS NOT NULL AND deleted_at IS NULL
     FROM public.quantum_continuation_album_photos
     WHERE id = 'b5700000-0000-4000-8000-000000000001'),
    'delete.reserve_records_request_time_only'
  );
  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_album->'days') AS day,
      jsonb_array_elements(day->'photos') AS photo
      WHERE photo->>'id' = 'b5700000-0000-4000-8000-000000000001'
    ),
    'delete.pending_photo_is_hidden_from_projection'
  );
  PERFORM pg_temp.assert_true(
    v_album->'pending_deletion_photo_ids' = '["b5700000-0000-4000-8000-000000000001"]'::jsonb,
    'delete.owner_projection_exposes_only_pending_id'
  );
  v_album := public.get_continuation_series_album_for_service(
    'b5100000-0000-4000-8000-000000000002', 'b5400000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    v_album->'pending_deletion_photo_ids' = '[]'::jsonb,
    'delete.other_member_cannot_see_pending_id'
  );
  v_result := public.finalize_continuation_series_album_delete_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(v_result->>'status' = 'deleted', 'delete.owner_finalize_marks_deleted');
  PERFORM pg_temp.assert_true(
    (SELECT deletion_requested_at IS NOT NULL AND deleted_at IS NOT NULL
     FROM public.quantum_continuation_album_photos
     WHERE id = 'b5700000-0000-4000-8000-000000000001'),
    'delete.finalize_records_deletion_time'
  );
  v_result := public.finalize_continuation_series_album_delete_for_service(
    'b5100000-0000-4000-8000-000000000001', 'b5400000-0000-4000-8000-000000000001',
    'b5700000-0000-4000-8000-000000000001'
  );
  PERFORM pg_temp.assert_true(
    v_result->>'status' = 'deleted' AND (v_result->>'replayed')::boolean,
    'delete.finalize_retry_is_idempotent'
  );
END;
$test$;
RESET ROLE;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.quantum_continuation_album_photos
    WHERE status = 'delete_pending'
      AND id = 'b5700000-0000-4000-8000-000000000001'
  ),
  'delete.finalized_row_is_not_left_pending'
);

SELECT 'continuation_series_album_assertions=' || count(*) AS synthetic_test_summary
FROM pg_temp.continuation_album_assertions;

ROLLBACK;
