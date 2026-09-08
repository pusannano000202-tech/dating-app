\set ON_ERROR_STOP on

-- Synthetic-only regression contract for community meetup gender admission.
-- Every row, helper, and assertion log is rolled back at the end of this file.
BEGIN;
SET LOCAL client_min_messages TO warning;

CREATE TEMP TABLE meetup_gender_test_assertions (
  label TEXT PRIMARY KEY
) ON COMMIT DROP;

GRANT SELECT, INSERT ON TABLE meetup_gender_test_assertions
  TO anon, authenticated, service_role;

CREATE FUNCTION pg_temp.assert_true(p_condition BOOLEAN, p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_condition IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = 'XX000',
      MESSAGE = 'assertion_failed:' || p_label;
  END IF;
  INSERT INTO pg_temp.meetup_gender_test_assertions(label) VALUES (p_label);
END;
$$;

CREATE FUNCTION pg_temp.assert_raises(
  p_sql TEXT,
  p_expected_state TEXT,
  p_expected_message TEXT,
  p_label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_state TEXT;
  v_message TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
    IF v_state IS DISTINCT FROM p_expected_state THEN
      RAISE EXCEPTION USING
        ERRCODE = 'XX000',
        MESSAGE = 'assertion_failed:' || p_label || ':expected_state=' || p_expected_state || ':actual_state=' || coalesce(v_state, '<null>');
    END IF;
    IF p_expected_message IS NOT NULL AND v_message IS DISTINCT FROM p_expected_message THEN
      RAISE EXCEPTION USING
        ERRCODE = 'XX000',
        MESSAGE = 'assertion_failed:' || p_label || ':expected_message=' || p_expected_message || ':actual_message=' || coalesce(v_message, '<null>');
    END IF;
    INSERT INTO pg_temp.meetup_gender_test_assertions(label) VALUES (p_label);
    RETURN;
  END;

  RAISE EXCEPTION USING
    ERRCODE = 'XX000',
    MESSAGE = 'assertion_failed:' || p_label || ':expected_error_not_raised';
END;
$$;

-- Schema, signatures, privilege boundaries, and lock ordering.
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.activity_meetups'::regclass
      AND attname = 'gender_mode'
      AND attnotnull
      AND NOT attisdropped
  ),
  'schema.gender_mode_not_null'
);

SELECT pg_temp.assert_true(
  pg_catalog.pg_get_expr(def.adbin, def.adrelid) = '''all''::text',
  'schema.gender_mode_default_all'
)
FROM pg_catalog.pg_attrdef AS def
JOIN pg_catalog.pg_attribute AS attr
  ON attr.attrelid = def.adrelid AND attr.attnum = def.adnum
WHERE def.adrelid = 'public.activity_meetups'::regclass
  AND attr.attname = 'gender_mode';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.activity_meetups'::regclass
      AND contype = 'c'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%gender_mode%all%male_only%female_only%'
  ),
  'schema.gender_mode_check_exact_values'
);

SELECT pg_temp.assert_true(
  to_regprocedure('public.create_activity_meetup_v2(text,text,text,text,timestamptz,integer,text)') IS NOT NULL,
  'rpc.create_v2_exact_signature_exists'
);

SELECT pg_temp.assert_true(
  (
    SELECT pg_catalog.pg_get_function_identity_arguments(oid)
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.create_activity_meetup_v2(text,text,text,text,timestamptz,integer,text)'::regprocedure
  ) = 'p_category text, p_title text, p_description text, p_place_name text, p_scheduled_at timestamp with time zone, p_capacity integer, p_gender_mode text',
  'rpc.create_v2_argument_names_preserved'
);

SELECT pg_temp.assert_true(
  (
    SELECT pg_catalog.pg_get_function_result(oid)
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.create_activity_meetup_v2(text,text,text,text,timestamptz,integer,text)'::regprocedure
  ) = 'jsonb',
  'rpc.create_v2_returns_jsonb'
);

SELECT pg_temp.assert_true(
  to_regprocedure('public.list_activity_meetups_v2(text,integer,text)') IS NOT NULL,
  'rpc.list_v2_exact_signature_exists'
);

SELECT pg_temp.assert_true(
  (
    SELECT pg_catalog.pg_get_function_identity_arguments(oid)
    FROM pg_catalog.pg_proc
    WHERE oid = 'public.list_activity_meetups_v2(text,integer,text)'::regprocedure
  ) = 'p_category text, p_limit integer, p_gender_mode text',
  'rpc.list_v2_argument_names_preserved'
);

SELECT pg_temp.assert_true(
  to_regprocedure('public.create_activity_meetup(text,text,text,text,timestamptz,integer)') IS NOT NULL,
  'rpc.legacy_create_signature_preserved'
);

SELECT pg_temp.assert_true(
  (
    SELECT count(*)
    FROM pg_catalog.pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'join_activity_meetup'
      AND pg_catalog.pg_get_function_identity_arguments(oid) = 'p_meetup_id uuid'
  ) = 1,
  'rpc.join_uuid_signature_preserved_once'
);

SELECT pg_temp.assert_true(
  to_regprocedure('quantum_private.meetup_gender_eligibility(uuid,text)') IS NOT NULL,
  'private.gender_helper_exists'
);

SELECT pg_temp.assert_true(
  (
    SELECT bool_and(prosecdef)
    FROM pg_catalog.pg_proc
    WHERE oid IN (
      'public.create_activity_meetup_v2(text,text,text,text,timestamptz,integer,text)'::regprocedure,
      'public.list_activity_meetups_v2(text,integer,text)'::regprocedure,
      'public.join_activity_meetup(uuid)'::regprocedure,
      'quantum_private.meetup_gender_eligibility(uuid,text)'::regprocedure
    )
  ),
  'security.rpcs_and_private_helper_are_security_definer'
);

SELECT pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.create_activity_meetup_v2(text,text,text,text,timestamptz,integer,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.list_activity_meetups_v2(text,integer,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.join_activity_meetup(uuid)', 'EXECUTE'),
  'security.authenticated_rpc_execute_granted'
);

SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon', 'public.create_activity_meetup_v2(text,text,text,text,timestamptz,integer,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.list_activity_meetups_v2(text,integer,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.join_activity_meetup(uuid)', 'EXECUTE'),
  'security.anon_rpc_execute_revoked'
);

SELECT pg_temp.assert_true(
  NOT has_function_privilege('authenticated', 'quantum_private.meetup_gender_eligibility(uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'quantum_private.meetup_gender_eligibility(uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'quantum_private.meetup_gender_eligibility(uuid,text)', 'EXECUTE'),
  'security.private_helper_execute_revoked_from_client_roles'
);

SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'public.activity_meetups', 'INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.activity_meetup_members', 'INSERT,UPDATE,DELETE'),
  'security.direct_table_writes_not_granted'
);

DO $test$
DECLARE
  v_create_source TEXT;
  v_join_source TEXT;
  v_helper_source TEXT;
BEGIN
  SELECT lower(pg_catalog.pg_get_functiondef('public.create_activity_meetup_v2(text,text,text,text,timestamptz,integer,text)'::regprocedure))
    INTO v_create_source;
  SELECT lower(pg_catalog.pg_get_functiondef('public.join_activity_meetup(uuid)'::regprocedure))
    INTO v_join_source;
  SELECT lower(pg_catalog.pg_get_functiondef('quantum_private.meetup_gender_eligibility(uuid,text)'::regprocedure))
    INTO v_helper_source;

  PERFORM pg_temp.assert_true(
    position('quantum:minimum-signup:user:' IN v_create_source) > 0
      AND position('pg_advisory_xact_lock' IN v_create_source) > 0,
    'locking.create_v2_uses_profile_user_advisory_lock'
  );
  PERFORM pg_temp.assert_true(
    position('quantum:minimum-signup:user:' IN v_join_source) > 0
      AND position('pg_advisory_xact_lock' IN v_join_source) > 0,
    'locking.join_uses_profile_user_advisory_lock'
  );
  PERFORM pg_temp.assert_true(
    position('for update' IN v_join_source) > 0,
    'locking.join_keeps_meetup_row_for_update'
  );
  PERFORM pg_temp.assert_true(
    position('pg_advisory_xact_lock' IN v_join_source) < position('for update' IN v_join_source),
    'locking.user_lock_precedes_meetup_row_lock'
  );
  PERFORM pg_temp.assert_true(
    position('meetup_gender_eligibility' IN v_join_source) < position('if exists' IN v_join_source),
    'locking.gender_check_precedes_idempotent_join_check'
  );
  PERFORM pg_temp.assert_true(
    position('quantum_private.community_member_profiles' IN v_helper_source) > 0
      AND position('public.profiles' IN v_helper_source) = 0
      AND position('auth.jwt' IN v_helper_source) = 0
      AND position('raw_user_meta_data' IN v_helper_source) = 0,
    'privacy.helper_uses_only_private_companion_gender'
  );
END;
$test$;

-- Synthetic accounts. Fixed test-only identifiers make failures reproducible.
INSERT INTO auth.users (
  id, aud, role, email, phone, email_confirmed_at, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('a1100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'meetup-gender-test-01@example.invalid', '821099990001', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'meetup-gender-test-02@example.invalid', '821099990002', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'meetup-gender-test-03@example.invalid', '821099990003', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1100000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'meetup-gender-test-04@example.invalid', '821099990004', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1100000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'meetup-gender-test-05@example.invalid', '821099990005', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1100000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'meetup-gender-test-06@example.invalid', '821099990006', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1100000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'meetup-gender-test-07@example.invalid', '821099990007', now(), now(), '{"provider":"email","providers":["email"]}', '{"gender":"male"}', now(), now()),
  ('a1100000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'meetup-gender-test-08@example.invalid', '821099990008', now(), now(), '{"provider":"email","providers":["email"]}', '{"gender":"male"}', now(), now()),
  ('a1100000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'meetup-gender-test-09@example.invalid', '821099990009', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1100000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'meetup-gender-test-10@example.invalid', '821099990010', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1100000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'meetup-gender-test-11@example.invalid', '821099990011', now(), now(), '{"provider":"email","providers":["email"]}', '{"gender":"male"}', now(), now()),
  ('a1100000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'meetup-gender-test-12@example.invalid', '821099990012', now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, gender, age, school, display_name)
VALUES
  ('a1100000-0000-0000-0000-000000000002', 'male', 25, 'Synthetic legacy conflict school', 'Legacy Conflict'),
  ('a1100000-0000-0000-0000-000000000007', 'male', 25, '부산대학교', 'Legacy Host'),
  ('a1100000-0000-0000-0000-000000000008', 'male', 25, 'Synthetic Other University', 'Other School'),
  ('a1100000-0000-0000-0000-00000000000b', 'male', 25, '부산대학교', 'Legacy Joiner');

INSERT INTO quantum_private.community_member_profiles (
  user_id, birth_date, school_scope, department, community_gender,
  display_name, alias_claimed_at, phone_verified_at
)
VALUES
  ('a1100000-0000-0000-0000-000000000001', '2000-01-01', 'pnu_self_selected', 'Synthetic Testing', 'male', 'MG Test 01', now(), now()),
  ('a1100000-0000-0000-0000-000000000002', '2000-01-02', 'pnu_self_selected', 'Synthetic Testing', 'female', 'MG Test 02', now(), now()),
  ('a1100000-0000-0000-0000-000000000003', '2000-01-03', 'pnu_self_selected', 'Synthetic Testing', 'male', 'MG Test 03', now(), now()),
  ('a1100000-0000-0000-0000-000000000004', '2000-01-04', 'pnu_self_selected', 'Synthetic Testing', 'female', 'MG Test 04', now(), now()),
  ('a1100000-0000-0000-0000-000000000005', '2000-01-05', 'pnu_self_selected', 'Synthetic Testing', 'other', 'MG Test 05', now(), now()),
  ('a1100000-0000-0000-0000-000000000006', '2000-01-06', 'pnu_self_selected', 'Synthetic Testing', 'prefer_not_to_say', 'MG Test 06', now(), now()),
  ('a1100000-0000-0000-0000-000000000009', '2000-01-09', 'pnu_self_selected', 'Synthetic Testing', 'male', 'MG Test 09', now(), now()),
  ('a1100000-0000-0000-0000-00000000000a', '2000-01-10', 'pnu_self_selected', 'Synthetic Testing', 'male', 'MG Test 10', now(), now()),
  ('a1100000-0000-0000-0000-00000000000c', '2000-01-12', 'pnu_self_selected', 'Synthetic Testing', 'unknown', 'MG Test 12', now(), now());

CREATE TEMP TABLE meetup_gender_test_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON TABLE meetup_gender_test_state TO authenticated;

-- Creation behavior, exact errors, old default, and companion-source priority.
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000001', true);
  v_result := public.create_activity_meetup_v2(
    'tennis', 'Synthetic male meetup', 'Synthetic rollback fixture', 'Test court',
    now() + interval '31 minutes', 2, 'male_only'
  );
  INSERT INTO pg_temp.meetup_gender_test_state VALUES ('male', v_result);
  PERFORM pg_temp.assert_true(
    v_result->>'gender_mode' = 'male_only'
      AND v_result->>'gender_eligibility' = 'eligible'
      AND (SELECT count(*) FROM jsonb_object_keys(v_result)) = 14
      AND NOT (v_result ?| ARRAY['community_gender', 'user_gender', 'gender']),
    'create.male_can_create_male_only_with_safe_dto'
  );
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.create_activity_meetup_v2('tennis','Synthetic blocked female','Synthetic rollback fixture','Test court',now()+interval '2 days',4,'female_only')$call$,
    'P0001', 'meetup_gender_restricted', 'create.male_cannot_create_female_only'
  );
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.create_activity_meetup_v2('tennis','Synthetic invalid mode','Synthetic rollback fixture','Test court',now()+interval '2 days',4,'mixed')$call$,
    '22023', 'invalid_gender_mode', 'create.invalid_mode_rejected'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000002', true);
  v_result := public.create_activity_meetup_v2(
    'tennis', 'Synthetic female meetup', 'Synthetic rollback fixture', 'Test court',
    now() + interval '32 minutes', 4, 'female_only'
  );
  INSERT INTO pg_temp.meetup_gender_test_state VALUES ('female', v_result);
  PERFORM pg_temp.assert_true(
    v_result->>'gender_mode' = 'female_only' AND v_result->>'gender_eligibility' = 'eligible',
    'create.companion_female_overrides_public_male'
  );
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.create_activity_meetup_v2('tennis','Synthetic blocked male','Synthetic rollback fixture','Test court',now()+interval '2 days',4,'male_only')$call$,
    'P0001', 'meetup_gender_restricted', 'create.companion_female_cannot_create_male_only'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000005', true);
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.create_activity_meetup_v2('tennis','Synthetic other blocked','Synthetic rollback fixture','Test court',now()+interval '2 days',4,'male_only')$call$,
    'P0001', 'meetup_gender_required', 'create.other_gender_requires_binary_selection'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000006', true);
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.create_activity_meetup_v2('tennis','Synthetic prefer blocked','Synthetic rollback fixture','Test court',now()+interval '2 days',4,'male_only')$call$,
    'P0001', 'meetup_gender_required', 'create.prefer_not_to_say_requires_binary_selection'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-00000000000c', true);
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.create_activity_meetup_v2('tennis','Synthetic unknown blocked','Synthetic rollback fixture','Test court',now()+interval '2 days',4,'male_only')$call$,
    'P0001', 'meetup_gender_required', 'create.unknown_gender_requires_binary_selection'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000007', true);
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.create_activity_meetup_v2('tennis','Synthetic legacy blocked','Synthetic rollback fixture','Test court',now()+interval '2 days',5,'male_only')$call$,
    'P0001', 'meetup_gender_required', 'create.legacy_profile_and_jwt_gender_never_authorize_restricted_mode'
  );
  v_result := public.create_activity_meetup_v2(
    'tennis', 'Synthetic legacy all v2', 'Synthetic rollback fixture', 'Test court',
    now() + interval '33 minutes', 5, 'all'
  );
  INSERT INTO pg_temp.meetup_gender_test_state VALUES ('legacy_all_v2', v_result);
  PERFORM pg_temp.assert_true(
    v_result->>'gender_mode' = 'all' AND v_result->>'gender_eligibility' = 'eligible',
    'create.all_mode_does_not_require_community_gender'
  );

  v_result := public.create_activity_meetup(
    'tennis', 'Synthetic legacy old all', 'Synthetic rollback fixture', 'Test court',
    now() + interval '34 minutes', 5
  );
  INSERT INTO pg_temp.meetup_gender_test_state VALUES ('legacy_old', v_result);
  PERFORM pg_temp.assert_true(
    NOT (v_result ? 'gender_mode') AND NOT (v_result ? 'gender_eligibility')
      AND (SELECT count(*) FROM jsonb_object_keys(v_result)) = 12,
    'create.legacy_six_argument_dto_unchanged'
  );
END;
$test$;
RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT gender_mode = 'male_only' FROM public.activity_meetups WHERE id = ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'male')->>'id')::UUID)
    AND (SELECT gender_mode = 'female_only' FROM public.activity_meetups WHERE id = ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'female')->>'id')::UUID)
    AND (SELECT gender_mode = 'all' FROM public.activity_meetups WHERE id = ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'legacy_all_v2')->>'id')::UUID)
    AND (SELECT gender_mode = 'all' FROM public.activity_meetups WHERE id = ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'legacy_old')->>'id')::UUID),
  'create.persisted_modes_and_legacy_default_are_exact'
);

SELECT pg_temp.assert_true(
  (
    SELECT school = '부산대학교'
    FROM public.activity_meetups
    WHERE id = ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'female')->>'id')::UUID
  ),
  'create.companion_identity_precedes_conflicting_public_profile'
);

INSERT INTO public.activity_meetups (
  id, host_user_id, school, category, title, description, place_name,
  scheduled_at, capacity, status, gender_mode
)
VALUES (
  'a1200000-0000-0000-0000-000000000001',
  'a1100000-0000-0000-0000-000000000001',
  '부산대학교', 'tennis', 'Synthetic past meetup', 'Synthetic rollback fixture',
  'Test court', now() - interval '1 hour', 3, 'open', 'male_only'
);
INSERT INTO public.activity_meetup_members (meetup_id, user_id, role)
VALUES ('a1200000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000001', 'host');

-- List filtering is applied before LIMIT; DTO exposes eligibility, never raw gender.
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_male_id UUID := ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'male')->>'id')::UUID;
  v_female_id UUID := ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'female')->>'id')::UUID;
  v_legacy_all_v2_id UUID := ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'legacy_all_v2')->>'id')::UUID;
  v_legacy_old_id UUID := ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'legacy_old')->>'id')::UUID;
  v_row JSONB;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000001', true);

  SELECT to_jsonb(result) INTO v_row
  FROM public.list_activity_meetups_v2('tennis', 1, 'female_only') AS result;
  PERFORM pg_temp.assert_true(
    (v_row->>'id')::UUID = v_female_id
      AND v_row->>'gender_mode' = 'female_only'
      AND v_row->>'gender_eligibility' = 'gender_restricted',
    'list.gender_filter_runs_before_limit'
  );
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM jsonb_object_keys(v_row)) = 14
      AND NOT (v_row ?| ARRAY['community_gender', 'user_gender', 'gender'])
      AND v_row ?& ARRAY[
        'id', 'category', 'title', 'description', 'place_name', 'scheduled_at',
        'capacity', 'status', 'member_count', 'joined', 'is_host', 'created_at',
        'gender_mode', 'gender_eligibility'
      ],
    'list.dto_adds_only_mode_and_eligibility_without_raw_gender'
  );
  PERFORM pg_temp.assert_true(
    (
      SELECT count(DISTINCT result.id) = 4
      FROM public.list_activity_meetups_v2('tennis', 50, NULL) AS result
      WHERE result.id IN (v_male_id, v_female_id, v_legacy_all_v2_id, v_legacy_old_id)
    ),
    'list.null_filter_includes_all_modes'
  );
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1 FROM public.list_activity_meetups_v2('tennis', 50, 'all') AS result
      WHERE result.id = v_legacy_old_id
    )
      AND NOT EXISTS (
        SELECT 1 FROM public.list_activity_meetups_v2('tennis', 50, 'all') AS result
        WHERE result.gender_mode <> 'all'
      ),
    'list.all_filter_means_unrestricted_mode_only'
  );
  SELECT to_jsonb(result) INTO v_row
  FROM public.list_activity_meetups_v2('tennis', 50, 'male_only') AS result
  WHERE result.id = v_male_id;
  PERFORM pg_temp.assert_true(
    v_row->>'gender_eligibility' = 'eligible',
    'list.male_viewer_is_eligible_for_male_only'
  );
  PERFORM pg_temp.assert_raises(
    $call$SELECT * FROM public.list_activity_meetups_v2('tennis',30,'mixed')$call$,
    '22023', 'invalid_gender_mode', 'list.invalid_mode_rejected'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000002', true);
  SELECT to_jsonb(result) INTO v_row
  FROM public.list_activity_meetups_v2('tennis', 50, 'male_only') AS result
  WHERE result.id = v_male_id;
  PERFORM pg_temp.assert_true(
    v_row->>'gender_eligibility' = 'gender_restricted',
    'list.female_viewer_is_restricted_from_male_only'
  );
  SELECT to_jsonb(result) INTO v_row
  FROM public.list_activity_meetups_v2('tennis', 50, 'female_only') AS result
  WHERE result.id = v_female_id;
  PERFORM pg_temp.assert_true(
    v_row->>'gender_eligibility' = 'eligible',
    'list.companion_female_is_eligible_despite_public_male'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000005', true);
  SELECT to_jsonb(result) INTO v_row
  FROM public.list_activity_meetups_v2('tennis', 50, 'male_only') AS result
  WHERE result.id = v_male_id;
  PERFORM pg_temp.assert_true(
    v_row->>'gender_eligibility' = 'gender_required',
    'list.other_gender_reports_required'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-00000000000b', true);
  SELECT to_jsonb(result) INTO v_row
  FROM public.list_activity_meetups_v2('tennis', 50, 'male_only') AS result
  WHERE result.id = v_male_id;
  PERFORM pg_temp.assert_true(
    v_row->>'gender_eligibility' = 'gender_required',
    'list.legacy_profile_and_jwt_gender_do_not_supply_eligibility'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000008', true);
  PERFORM pg_temp.assert_true(
    NOT EXISTS (SELECT 1 FROM public.list_activity_meetups_v2('tennis', 50, NULL)),
    'list.school_scope_hides_other_school_meetups'
  );
END;
$test$;
RESET ROLE;

-- Join, capacity, school, deadline, idempotence, profile edits, leave, and rejoin.
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_male_id UUID := ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'male')->>'id')::UUID;
  v_female_id UUID := ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'female')->>'id')::UUID;
  v_legacy_old_id UUID := ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'legacy_old')->>'id')::UUID;
  v_result JSONB;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000003', true);
  v_result := public.join_activity_meetup(v_male_id);
  PERFORM pg_temp.assert_true(
    (v_result->>'joined')::BOOLEAN AND NOT (v_result->>'reused')::BOOLEAN
      AND (v_result->>'member_count')::INTEGER = 2,
    'join.eligible_male_joins_male_only_and_fills_capacity'
  );
  v_result := public.join_activity_meetup(v_male_id);
  PERFORM pg_temp.assert_true(
    (v_result->>'joined')::BOOLEAN AND (v_result->>'reused')::BOOLEAN,
    'join.eligible_duplicate_is_idempotent'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000004', true);
  PERFORM pg_temp.assert_raises(
    pg_catalog.format('SELECT public.join_activity_meetup(%L::uuid)', v_male_id),
    'P0001', 'meetup_gender_restricted', 'join.female_cannot_join_male_only_before_capacity_check'
  );
  v_result := public.join_activity_meetup(v_female_id);
  PERFORM pg_temp.assert_true(
    (v_result->>'joined')::BOOLEAN AND NOT (v_result->>'reused')::BOOLEAN,
    'join.female_can_join_female_only'
  );
  v_result := public.join_activity_meetup(v_female_id);
  PERFORM pg_temp.assert_true(
    (v_result->>'joined')::BOOLEAN AND (v_result->>'reused')::BOOLEAN,
    'join.eligible_female_duplicate_is_idempotent'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000005', true);
  PERFORM pg_temp.assert_raises(
    pg_catalog.format('SELECT public.join_activity_meetup(%L::uuid)', v_male_id),
    'P0001', 'meetup_gender_required', 'join.other_gender_requires_binary_selection'
  );
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000006', true);
  PERFORM pg_temp.assert_raises(
    pg_catalog.format('SELECT public.join_activity_meetup(%L::uuid)', v_male_id),
    'P0001', 'meetup_gender_required', 'join.prefer_not_to_say_requires_binary_selection'
  );
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-00000000000c', true);
  PERFORM pg_temp.assert_raises(
    pg_catalog.format('SELECT public.join_activity_meetup(%L::uuid)', v_male_id),
    'P0001', 'meetup_gender_required', 'join.unknown_gender_requires_binary_selection'
  );
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-00000000000b', true);
  PERFORM pg_temp.assert_raises(
    pg_catalog.format('SELECT public.join_activity_meetup(%L::uuid)', v_male_id),
    'P0001', 'meetup_gender_required', 'join.legacy_profile_and_jwt_gender_never_authorize_restricted_mode'
  );
  v_result := public.join_activity_meetup(v_legacy_old_id);
  PERFORM pg_temp.assert_true(
    (v_result->>'joined')::BOOLEAN AND NOT (v_result->>'reused')::BOOLEAN,
    'join.all_mode_allows_legacy_profile_without_companion_gender'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000009', true);
  PERFORM pg_temp.assert_raises(
    pg_catalog.format('SELECT public.join_activity_meetup(%L::uuid)', v_male_id),
    'P0001', 'meetup_full', 'join.capacity_guard_preserved_for_eligible_user'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000008', true);
  PERFORM pg_temp.assert_raises(
    pg_catalog.format('SELECT public.join_activity_meetup(%L::uuid)', v_legacy_old_id),
    'P0002', 'meetup_not_found', 'join.cross_school_meetup_is_not_found'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-00000000000a', true);
  PERFORM pg_temp.assert_raises(
    $call$SELECT public.join_activity_meetup('a1200000-0000-0000-0000-000000000001'::uuid)$call$,
    'P0001', 'meetup_closed', 'join.deadline_guard_precedes_admission'
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000001', true);
  PERFORM pg_temp.assert_raises(
    pg_catalog.format('SELECT public.leave_activity_meetup(%L::uuid)', v_male_id),
    'P0001', 'host_cannot_leave', 'leave.host_rejection_preserved'
  );
END;
$test$;
RESET ROLE;

UPDATE quantum_private.community_member_profiles
SET community_gender = 'female', updated_at = now()
WHERE user_id = 'a1100000-0000-0000-0000-000000000003';

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.activity_meetup_members
    WHERE meetup_id = ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'male')->>'id')::UUID
      AND user_id = 'a1100000-0000-0000-0000-000000000003'
      AND status = 'joined'
  ),
  'profile_change.existing_membership_is_not_auto_removed'
);

SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_male_id UUID := ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'male')->>'id')::UUID;
  v_result JSONB;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000003', true);
  PERFORM pg_temp.assert_raises(
    pg_catalog.format('SELECT public.join_activity_meetup(%L::uuid)', v_male_id),
    'P0001', 'meetup_gender_restricted', 'profile_change.join_recheck_blocks_now_ineligible_existing_member'
  );
  v_result := public.leave_activity_meetup(v_male_id);
  PERFORM pg_temp.assert_true(
    NOT (v_result->>'joined')::BOOLEAN AND NOT (v_result->>'reused')::BOOLEAN,
    'profile_change.ineligible_existing_member_can_leave'
  );
  PERFORM pg_temp.assert_raises(
    pg_catalog.format('SELECT public.join_activity_meetup(%L::uuid)', v_male_id),
    'P0001', 'meetup_gender_restricted', 'profile_change.left_member_cannot_rejoin_wrong_gender_mode'
  );
END;
$test$;
RESET ROLE;

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.activity_meetup_members
    WHERE meetup_id = ((SELECT value FROM pg_temp.meetup_gender_test_state WHERE key = 'male')->>'id')::UUID
      AND user_id = 'a1100000-0000-0000-0000-000000000003'
      AND status = 'left'
      AND left_at IS NOT NULL
  ),
  'profile_change.leave_persists_left_state_inside_transaction'
);

-- Exercise privilege denial under the actual client roles, not only catalog ACLs.
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000001', true);
END;
$test$;
SELECT pg_temp.assert_raises(
  $call$SELECT quantum_private.meetup_gender_eligibility('a1100000-0000-0000-0000-000000000001'::uuid,'male_only')$call$,
  '42501', NULL, 'security.authenticated_cannot_call_private_helper'
);
SELECT pg_temp.assert_raises(
  $call$INSERT INTO public.activity_meetups(host_user_id,school,category,title,description,place_name,scheduled_at,capacity,gender_mode) VALUES ('a1100000-0000-0000-0000-000000000001','부산대학교','tennis','Synthetic direct write','Synthetic rollback fixture','Test court',now()+interval '2 days',4,'male_only')$call$,
  '42501', NULL, 'security.authenticated_cannot_insert_meetup_table'
);
SELECT pg_temp.assert_raises(
  $call$UPDATE public.activity_meetup_members SET status='left' WHERE user_id='a1100000-0000-0000-0000-000000000004'::uuid$call$,
  '42501', NULL, 'security.authenticated_cannot_update_member_table'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.assert_raises(
  $call$SELECT * FROM public.list_activity_meetups_v2(NULL,30,NULL)$call$,
  '42501', NULL, 'security.anon_cannot_call_list_v2'
);
SELECT pg_temp.assert_raises(
  $call$SELECT public.create_activity_meetup_v2('tennis','Synthetic anon blocked','Synthetic rollback fixture','Test court',now()+interval '2 days',4,'all')$call$,
  '42501', NULL, 'security.anon_cannot_call_create_v2'
);
SELECT pg_temp.assert_raises(
  $call$SELECT public.join_activity_meetup('a1200000-0000-0000-0000-000000000001'::uuid)$call$,
  '42501', NULL, 'security.anon_cannot_call_join'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_raises(
  $call$SELECT quantum_private.meetup_gender_eligibility('a1100000-0000-0000-0000-000000000001'::uuid,'male_only')$call$,
  '42501', NULL, 'security.service_role_cannot_call_private_helper'
);
RESET ROLE;

SELECT
  'MEETUP_GENDER_DB_TESTS_OK' AS status,
  count(*)::INTEGER AS assertion_count,
  true AS synthetic_fixtures,
  'ROLLBACK' AS cleanup
FROM pg_temp.meetup_gender_test_assertions;

ROLLBACK;
