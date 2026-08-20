BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION private.quantum_text_is_safe(
  p_value TEXT,
  p_min_length INTEGER,
  p_max_length INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_value TEXT;
  v_compact TEXT;
  v_phone_compact TEXT;
BEGIN
  IF p_value IS NULL OR p_min_length < 0 OR p_max_length < p_min_length THEN
    RETURN FALSE;
  END IF;

  v_value := pg_catalog.btrim(pg_catalog.regexp_replace(
    normalize(p_value, NFKC),
    U&'[\200B\200C\200D\2060\FEFF]',
    '',
    'g'
  ));
  v_compact := pg_catalog.regexp_replace(v_value, '[[:space:]]+', '', 'g');
  v_phone_compact := pg_catalog.regexp_replace(v_compact, '[()./-]', '', 'g');

  IF pg_catalog.char_length(v_value) NOT BETWEEN p_min_length AND p_max_length THEN
    RETURN FALSE;
  END IF;

  RETURN NOT (
    v_value ~* '(https?://|www\.)'
    OR v_compact ~* '(https?://|www\.)'
    OR pg_catalog.strpos(v_compact, '@') > 0
    OR v_value ~* '(^|[^0-9])01[016789][ ./-]?[0-9]{3,4}[ ./-]?[0-9]{4}([^0-9]|$)'
    OR v_value ~* '(^|[^0-9])0(2|[3-6][0-9]|70)[ ./-]?[0-9]{3,4}[ ./-]?[0-9]{4}([^0-9]|$)'
    OR v_phone_compact ~ '(^|[^0-9])\+?[0-9]{10,15}([^0-9]|$)'
    OR v_compact ~* '(카카오|카톡|오픈채팅|인스타|instagram|텔레그램|telegram|연락처|전화번호|이메일|학번|contact|phone|message(me)?)'
    OR v_compact ~* '(연락(주세요|줘요?|바랍니다|가능|해요?|부탁|하자)|번호(알려줄게|줄게))'
    OR v_compact ~* '([가-힣]{1,12}(공학|학과|학부|전공)|department|studentid|schoolid|computerscience|mechanicalengineering)'
  );
END;
$$;

REVOKE ALL ON FUNCTION private.quantum_text_is_safe(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.quantum_text_is_safe(TEXT, INTEGER, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION private.quantum_profile_preference_payload_is_safe(
  p_payload JSONB,
  p_question_bank_version INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_interest JSONB;
  v_answer JSONB;
  v_interest_count INTEGER;
  v_distinct_interest_count INTEGER;
  v_answer_count INTEGER;
  v_distinct_answer_count INTEGER;
BEGIN
  IF p_payload IS NULL
     OR p_question_bank_version IS NULL
     OR p_question_bank_version <> 1
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR NOT p_payload ?& ARRAY[
       'schemaVersion', 'mbti', 'conversationEnergy', 'planStyle',
       'interests', 'favoriteMusic', 'debateAnswers',
       'questionBankVersion', 'updatedAt'
     ]
     OR p_payload - ARRAY[
       'schemaVersion', 'mbti', 'relationshipBoundary',
       'conversationEnergy', 'planStyle', 'interests', 'favoriteMusic',
       'debateAnswers', 'questionBankVersion', 'updatedAt'
     ]::TEXT[] <> '{}'::JSONB
     OR pg_catalog.jsonb_typeof(p_payload -> 'schemaVersion') <> 'number'
     OR p_payload -> 'schemaVersion' <> '2'::JSONB
     OR NOT (
       p_payload -> 'mbti' = 'null'::JSONB
       OR p_payload ->> 'mbti' IN (
         'ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP',
         'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
       )
     )
     OR p_payload ->> 'conversationEnergy' NOT IN ('listener', 'balanced', 'speaker')
     OR p_payload ->> 'planStyle' NOT IN ('planner', 'balanced', 'spontaneous')
     OR pg_catalog.jsonb_typeof(p_payload -> 'interests') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload -> 'interests') NOT BETWEEN 3 AND 5
     OR pg_catalog.jsonb_typeof(p_payload -> 'favoriteMusic') <> 'string'
     OR NOT private.quantum_text_is_safe(p_payload ->> 'favoriteMusic', 1, 120)
     OR pg_catalog.jsonb_typeof(p_payload -> 'debateAnswers') <> 'array'
     OR pg_catalog.jsonb_array_length(p_payload -> 'debateAnswers') > 20
     OR pg_catalog.jsonb_typeof(p_payload -> 'questionBankVersion') <> 'string'
     OR p_payload ->> 'questionBankVersion' <> 'quantum-debate-v1'
     OR NOT (
       p_payload -> 'updatedAt' = 'null'::JSONB
       OR (
         pg_catalog.jsonb_typeof(p_payload -> 'updatedAt') = 'string'
         AND pg_catalog.char_length(p_payload ->> 'updatedAt') <= 64
         AND p_payload ->> 'updatedAt'
           ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$'
       )
     )
     OR (
       p_payload ? 'relationshipBoundary'
       AND NOT (
         p_payload -> 'relationshipBoundary' = 'null'::JSONB
         OR (
           pg_catalog.jsonb_typeof(p_payload -> 'relationshipBoundary') = 'string'
           AND private.quantum_text_is_safe(
             p_payload ->> 'relationshipBoundary', 1, 160
           )
         )
       )
     ) THEN
    RETURN FALSE;
  END IF;

  FOR v_interest IN
    SELECT interest.value
    FROM pg_catalog.jsonb_array_elements(p_payload -> 'interests') AS interest(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_interest) <> 'string'
       OR NOT private.quantum_text_is_safe(v_interest #>> '{}', 1, 32) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(DISTINCT interest.value #>> '{}')::INTEGER
  INTO v_interest_count, v_distinct_interest_count
  FROM pg_catalog.jsonb_array_elements(p_payload -> 'interests') AS interest(value);

  IF v_interest_count <> v_distinct_interest_count THEN
    RETURN FALSE;
  END IF;

  FOR v_answer IN
    SELECT answer.value
    FROM pg_catalog.jsonb_array_elements(p_payload -> 'debateAnswers') AS answer(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_answer) <> 'object'
       OR NOT v_answer ?& ARRAY['questionId', 'choice', 'shareOnCard']
       OR v_answer - ARRAY['questionId', 'choice', 'shareOnCard']::TEXT[] <> '{}'::JSONB
       OR v_answer ->> 'questionId' NOT IN (
         'jjajang-jjamppong',
         'tangsuyuk',
         'mint-chocolate',
         'naengmyeon',
         'perilla-leaf',
         'shrimp-peeling',
         'padding-zipper',
         'bluetooth-history',
         'friend-drinking',
         'surprise-contact',
         'hotdog-bite'
       )
       OR v_answer ->> 'choice' NOT IN ('A', 'B', 'SKIP')
       OR pg_catalog.jsonb_typeof(v_answer -> 'shareOnCard') <> 'boolean' THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(DISTINCT answer.value ->> 'questionId')::INTEGER
  INTO v_answer_count, v_distinct_answer_count
  FROM pg_catalog.jsonb_array_elements(p_payload -> 'debateAnswers') AS answer(value);

  RETURN v_answer_count = v_distinct_answer_count;
END;
$$;

REVOKE ALL ON FUNCTION private.quantum_profile_preference_payload_is_safe(JSONB, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_meeting_moment_payload_is_safe(
  p_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE((
    pg_catalog.jsonb_typeof(p_payload) = 'object'
    AND p_payload ?& ARRAY['occurrenceKey', 'mood', 'expectation', 'activityChoice']
    AND p_payload - ARRAY[
      'occurrenceKey', 'mood', 'expectation', 'activityChoice'
    ]::TEXT[] = '{}'::JSONB
    AND p_payload ->> 'occurrenceKey'
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND p_payload ->> 'mood' IN ('calm', 'bright', 'curious', 'energetic')
    AND p_payload ->> 'expectation' IN (
      'conversation', 'activity', 'new_people', 'easy_company'
    )
    AND pg_catalog.jsonb_typeof(p_payload -> 'activityChoice') = 'string'
    AND private.quantum_text_is_safe(p_payload ->> 'activityChoice', 1, 80)
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION private.quantum_meeting_moment_payload_is_safe(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_public_profile_preference(
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'mbti', p_payload -> 'mbti',
    'conversation_energy', p_payload -> 'conversationEnergy',
    'plan_style', p_payload -> 'planStyle',
    'interests', p_payload -> 'interests',
    'favorite_music', p_payload -> 'favoriteMusic',
    'debate_answers', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'question_id', shared_answer.value -> 'questionId',
          'choice', shared_answer.value -> 'choice'
        )
        ORDER BY shared_answer.position
      )
      FROM (
        SELECT answer.value, answer.position
        FROM pg_catalog.jsonb_array_elements(p_payload -> 'debateAnswers')
          WITH ORDINALITY AS answer(value, position)
        WHERE answer.value ->> 'shareOnCard' = 'true'
        ORDER BY answer.position
        LIMIT 3
      ) AS shared_answer
    ), '[]'::JSONB)
  );
$$;

REVOKE ALL ON FUNCTION private.quantum_public_profile_preference(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_public_meeting_moment(
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'mood', p_payload -> 'mood',
    'expectation', p_payload -> 'expectation',
    'activity_choice', p_payload -> 'activityChoice'
  );
$$;

REVOKE ALL ON FUNCTION private.quantum_public_meeting_moment(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_public_snapshot_payload_is_safe(
  p_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_profile JSONB;
  v_moment JSONB;
  v_interest JSONB;
  v_answer JSONB;
  v_interest_count INTEGER;
  v_distinct_interest_count INTEGER;
  v_answer_count INTEGER;
  v_distinct_answer_count INTEGER;
BEGIN
  IF p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR NOT p_payload ?& ARRAY['profile_preference', 'meeting_moment']
     OR p_payload - ARRAY['profile_preference', 'meeting_moment']::TEXT[] <> '{}'::JSONB THEN
    RETURN FALSE;
  END IF;

  v_profile := p_payload -> 'profile_preference';
  v_moment := p_payload -> 'meeting_moment';

  IF pg_catalog.jsonb_typeof(v_profile) <> 'object'
     OR NOT v_profile ?& ARRAY[
       'mbti', 'conversation_energy', 'plan_style', 'interests',
       'favorite_music', 'debate_answers'
     ]
     OR v_profile - ARRAY[
       'mbti', 'conversation_energy', 'plan_style', 'interests',
       'favorite_music', 'debate_answers'
     ]::TEXT[] <> '{}'::JSONB
     OR NOT (
       v_profile -> 'mbti' = 'null'::JSONB
       OR (
         pg_catalog.jsonb_typeof(v_profile -> 'mbti') = 'string'
         AND v_profile ->> 'mbti' IN (
           'ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP',
           'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
         )
       )
     )
     OR pg_catalog.jsonb_typeof(v_profile -> 'conversation_energy') <> 'string'
     OR v_profile ->> 'conversation_energy' NOT IN ('listener', 'balanced', 'speaker')
     OR pg_catalog.jsonb_typeof(v_profile -> 'plan_style') <> 'string'
     OR v_profile ->> 'plan_style' NOT IN ('planner', 'balanced', 'spontaneous')
     OR pg_catalog.jsonb_typeof(v_profile -> 'interests') <> 'array'
     OR pg_catalog.jsonb_array_length(v_profile -> 'interests') NOT BETWEEN 3 AND 5
     OR pg_catalog.jsonb_typeof(v_profile -> 'favorite_music') <> 'string'
     OR NOT private.quantum_text_is_safe(v_profile ->> 'favorite_music', 1, 120)
     OR pg_catalog.jsonb_typeof(v_profile -> 'debate_answers') <> 'array'
     OR pg_catalog.jsonb_array_length(v_profile -> 'debate_answers') > 3 THEN
    RETURN FALSE;
  END IF;

  FOR v_interest IN
    SELECT interest.value
    FROM pg_catalog.jsonb_array_elements(v_profile -> 'interests') AS interest(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_interest) <> 'string'
       OR NOT private.quantum_text_is_safe(v_interest #>> '{}', 1, 32) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(DISTINCT interest.value #>> '{}')::INTEGER
  INTO v_interest_count, v_distinct_interest_count
  FROM pg_catalog.jsonb_array_elements(v_profile -> 'interests') AS interest(value);

  IF v_interest_count <> v_distinct_interest_count THEN
    RETURN FALSE;
  END IF;

  FOR v_answer IN
    SELECT answer.value
    FROM pg_catalog.jsonb_array_elements(v_profile -> 'debate_answers') AS answer(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_answer) <> 'object'
       OR NOT v_answer ?& ARRAY['question_id', 'choice']
       OR v_answer - ARRAY['question_id', 'choice']::TEXT[] <> '{}'::JSONB
       OR pg_catalog.jsonb_typeof(v_answer -> 'question_id') <> 'string'
       OR v_answer ->> 'question_id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
       OR pg_catalog.jsonb_typeof(v_answer -> 'choice') <> 'string'
       OR v_answer ->> 'choice' NOT IN ('A', 'B', 'SKIP') THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(DISTINCT answer.value ->> 'question_id')::INTEGER
  INTO v_answer_count, v_distinct_answer_count
  FROM pg_catalog.jsonb_array_elements(v_profile -> 'debate_answers') AS answer(value);

  IF v_answer_count <> v_distinct_answer_count THEN
    RETURN FALSE;
  END IF;

  RETURN (
    pg_catalog.jsonb_typeof(v_moment) = 'object'
    AND v_moment ?& ARRAY['mood', 'expectation', 'activity_choice']
    AND v_moment - ARRAY['mood', 'expectation', 'activity_choice']::TEXT[] = '{}'::JSONB
    AND pg_catalog.jsonb_typeof(v_moment -> 'mood') = 'string'
    AND v_moment ->> 'mood' IN ('calm', 'bright', 'curious', 'energetic')
    AND pg_catalog.jsonb_typeof(v_moment -> 'expectation') = 'string'
    AND v_moment ->> 'expectation' IN (
      'conversation', 'activity', 'new_people', 'easy_company'
    )
    AND pg_catalog.jsonb_typeof(v_moment -> 'activity_choice') = 'string'
    AND private.quantum_text_is_safe(v_moment ->> 'activity_choice', 1, 80)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.quantum_public_snapshot_payload_is_safe(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.quantum_public_snapshot_payload_is_safe(JSONB)
  TO service_role;

CREATE TABLE IF NOT EXISTS private.quantum_profile_preferences (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  question_bank_version INTEGER NOT NULL CHECK (question_bank_version BETWEEN 1 AND 10000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CHECK (private.quantum_profile_preference_payload_is_safe(payload, question_bank_version)),
  CHECK (
    (is_active AND invalidated_at IS NULL AND invalidation_reason IS NULL)
    OR (
      NOT is_active
      AND invalidated_at IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(invalidation_reason)) BETWEEN 1 AND 64
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS quantum_profile_preferences_one_active_user
  ON private.quantum_profile_preferences(user_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS quantum_profile_preferences_user_history_idx
  ON private.quantum_profile_preferences(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS private.quantum_event_meeting_moment_drafts (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  occurrence_id UUID NOT NULL
    REFERENCES public.quantum_event_occurrences(id) ON DELETE CASCADE,
  participant_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL CHECK (event_key IN (
    'tonight-onsenjjang-run', 'tonight-board-game',
    'tonight-casual-drinks', 'tonight-late-dinner',
    'scheduled-board-game', 'scheduled-jogging',
    'scheduled-dinner', 'scheduled-walk'
  )),
  occurrence_key TEXT NOT NULL CHECK (
    occurrence_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  payload JSONB NOT NULL CHECK (private.quantum_meeting_moment_payload_is_safe(payload)),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CHECK (
    (is_active AND invalidated_at IS NULL AND invalidation_reason IS NULL)
    OR (
      NOT is_active
      AND invalidated_at IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(invalidation_reason)) BETWEEN 1 AND 64
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS quantum_event_meeting_moment_drafts_one_active
  ON private.quantum_event_meeting_moment_drafts(occurrence_id, participant_user_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS quantum_event_meeting_moment_drafts_participant_history_idx
  ON private.quantum_event_meeting_moment_drafts(participant_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS private.quantum_event_secret_role_assignments (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  occurrence_id UUID NOT NULL
    REFERENCES public.quantum_event_occurrences(id) ON DELETE CASCADE,
  participant_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seat_label TEXT NOT NULL CHECK (
    pg_catalog.char_length(pg_catalog.btrim(seat_label)) BETWEEN 1 AND 24
  ),
  role_key TEXT NOT NULL CHECK (
    role_key IN ('explorer', 'reactor', 'observer', 'bridge', 'pace_maker')
  ),
  changed_once BOOLEAN NOT NULL DEFAULT FALSE,
  changed_at TIMESTAMPTZ,
  role_confirmed_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CHECK (
    (NOT changed_once AND changed_at IS NULL)
    OR (changed_once AND changed_at IS NOT NULL)
  ),
  CHECK (role_confirmed_at IS NULL OR role_confirmed_at >= assigned_at),
  CHECK (
    (is_active AND invalidated_at IS NULL AND invalidation_reason IS NULL)
    OR (
      NOT is_active
      AND invalidated_at IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(invalidation_reason)) BETWEEN 1 AND 64
    )
  )
);

ALTER TABLE private.quantum_event_secret_role_assignments
  ADD COLUMN IF NOT EXISTS role_confirmed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS quantum_event_secret_role_assignments_one_active_user
  ON private.quantum_event_secret_role_assignments(occurrence_id, participant_user_id)
  WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS quantum_event_secret_role_assignments_one_active_role
  ON private.quantum_event_secret_role_assignments(occurrence_id, role_key)
  WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS quantum_event_secret_role_assignments_one_active_seat
  ON private.quantum_event_secret_role_assignments(occurrence_id, seat_label)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS quantum_event_secret_role_assignments_participant_history_idx
  ON private.quantum_event_secret_role_assignments(
    participant_user_id, assigned_at DESC
  );

CREATE TABLE IF NOT EXISTS private.quantum_event_role_guesses (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  occurrence_id UUID NOT NULL
    REFERENCES public.quantum_event_occurrences(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  guesser_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  guessed_role TEXT NOT NULL CHECK (
    guessed_role IN ('explorer', 'reactor', 'observer', 'bridge', 'pace_maker')
  ),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CHECK (guesser_user_id <> target_user_id),
  CHECK (
    (is_active AND invalidated_at IS NULL AND invalidation_reason IS NULL)
    OR (
      NOT is_active
      AND invalidated_at IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(invalidation_reason)) BETWEEN 1 AND 64
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS quantum_event_role_guesses_one_active_target
  ON private.quantum_event_role_guesses(match_id, guesser_user_id, target_user_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS quantum_event_role_guesses_occurrence_active_idx
  ON private.quantum_event_role_guesses(occurrence_id, match_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS quantum_event_role_guesses_target_idx
  ON private.quantum_event_role_guesses(target_user_id, submitted_at DESC);

ALTER TABLE private.quantum_profile_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quantum_event_meeting_moment_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quantum_event_secret_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quantum_event_role_guesses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.quantum_profile_preferences
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.quantum_event_meeting_moment_drafts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.quantum_event_secret_role_assignments
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.quantum_event_role_guesses
  FROM PUBLIC, anon, authenticated, service_role;

-- Keep the legacy helper signature for older room-entry functions, but replace
-- its source of truth. Direct callers cannot execute it, and no B-card data is
-- consulted after this forward migration.
CREATE OR REPLACE FUNCTION private.quantum_event_precard_ready(
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM private.quantum_profile_preferences AS preference
    WHERE preference.user_id = p_user_id
      AND preference.is_active
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION private.quantum_event_precard_ready(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.quantum_event_room_card_snapshots
  ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE public.quantum_event_room_card_snapshots
  ALTER COLUMN schema_version SET DEFAULT 2;

ALTER TABLE public.quantum_event_room_card_snapshots
  DROP CONSTRAINT IF EXISTS quantum_event_room_card_snapshots_safe_payload_check;
ALTER TABLE public.quantum_event_room_card_snapshots
  DROP CONSTRAINT IF EXISTS quantum_event_room_card_snapshots_schema_version_check;
ALTER TABLE public.quantum_event_room_card_snapshots
  ADD CONSTRAINT quantum_event_room_card_snapshots_schema_version_check
  CHECK (
    schema_version = 1
    OR (
      schema_version = 2
      AND private.quantum_public_snapshot_payload_is_safe(safe_payload)
    )
  );

CREATE OR REPLACE FUNCTION private.quantum_event_assignment_people(
  p_occurrence_id UUID
)
RETURNS TABLE (
  participant_user_id UUID
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT member.user_id
  FROM public.quantum_event_match_members AS member
  WHERE member.occurrence_id = p_occurrence_id
  UNION
  SELECT room_person.participant_user_id
  FROM private.quantum_event_room_people(p_occurrence_id) AS room_person
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.quantum_event_match_members AS finalized_member
    WHERE finalized_member.occurrence_id = p_occurrence_id
  );
$$;

REVOKE ALL ON FUNCTION private.quantum_event_assignment_people(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_event_private_seat_label(
  p_occurrence_id UUID,
  p_participant_user_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH room_people AS MATERIALIZED (
    SELECT person.participant_user_id
    FROM private.quantum_event_room_people(p_occurrence_id) AS person
  ), known_seats AS MATERIALIZED (
    SELECT
      person.participant_user_id,
      COALESCE(assignment.seat_label, snapshot.event_alias) AS seat_label
    FROM room_people AS person
    LEFT JOIN private.quantum_event_secret_role_assignments AS assignment
      ON assignment.occurrence_id = p_occurrence_id
     AND assignment.participant_user_id = person.participant_user_id
     AND assignment.is_active
    LEFT JOIN public.quantum_event_room_card_snapshots AS snapshot
      ON snapshot.occurrence_id = p_occurrence_id
     AND snapshot.participant_user_id = person.participant_user_id
  ), unseated_people AS (
    SELECT
      known.participant_user_id,
      pg_catalog.row_number() OVER (ORDER BY known.participant_user_id) AS position
    FROM known_seats AS known
    WHERE known.seat_label IS NULL
  ), available_seats AS (
    SELECT
      '참가자 ' || pg_catalog.chr(64 + candidate.seat_number) AS seat_label,
      pg_catalog.row_number() OVER (ORDER BY candidate.seat_number) AS position
    FROM pg_catalog.generate_series(1, 5) AS candidate(seat_number)
    WHERE NOT EXISTS (
      SELECT 1
      FROM known_seats AS used
      WHERE used.seat_label =
        '참가자 ' || pg_catalog.chr(64 + candidate.seat_number)
    )
  ), resolved_seats AS (
    SELECT known.participant_user_id, known.seat_label
    FROM known_seats AS known
    WHERE known.seat_label IS NOT NULL
    UNION ALL
    SELECT unseated.participant_user_id, available.seat_label
    FROM unseated_people AS unseated
    JOIN available_seats AS available USING (position)
  )
  SELECT resolved.seat_label
  FROM resolved_seats AS resolved
  WHERE resolved.participant_user_id = p_participant_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.quantum_event_private_seat_label(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.snapshot_quantum_event_room_member_card(
  p_occurrence_id UUID,
  p_participant_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_gender TEXT;
  v_preference_payload JSONB;
  v_moment_payload JSONB;
  v_public_preference JSONB;
  v_public_moment JSONB;
  v_source_updated_at TIMESTAMPTZ;
  v_alias TEXT;
  v_alias_number INTEGER;
BEGIN
  IF p_occurrence_id IS NULL
     OR p_participant_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM private.quantum_event_assignment_people(p_occurrence_id) AS person
       WHERE person.participant_user_id = p_participant_user_id
     ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quantum_event_room_card_snapshots AS snapshot
    WHERE snapshot.occurrence_id = p_occurrence_id
      AND snapshot.participant_user_id = p_participant_user_id
      AND snapshot.schema_version = 2
  ) THEN
    RETURN;
  END IF;

  SELECT profile.gender
  INTO v_gender
  FROM public.profiles AS profile
  WHERE profile.user_id = p_participant_user_id;

  IF v_gender NOT IN ('male', 'female') THEN
    RETURN;
  END IF;

  SELECT preference.payload, preference.updated_at
  INTO v_preference_payload, v_source_updated_at
  FROM private.quantum_profile_preferences AS preference
  WHERE preference.user_id = p_participant_user_id
    AND preference.is_active
  ORDER BY preference.created_at DESC
  LIMIT 1;

  SELECT moment.payload
  INTO v_moment_payload
  FROM private.quantum_event_meeting_moment_drafts AS moment
  WHERE moment.occurrence_id = p_occurrence_id
    AND moment.participant_user_id = p_participant_user_id
    AND moment.is_active
  ORDER BY moment.created_at DESC
  LIMIT 1;

  IF v_preference_payload IS NULL OR v_moment_payload IS NULL THEN
    RETURN;
  END IF;

  v_public_preference := private.quantum_public_profile_preference(
    v_preference_payload
  );
  v_public_moment := private.quantum_public_meeting_moment(v_moment_payload);

  PERFORM 1
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = p_occurrence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT private.quantum_event_private_seat_label(
    p_occurrence_id,
    p_participant_user_id
  )
  INTO v_alias
  ;

  IF v_alias IS NULL THEN
    SELECT snapshot.event_alias
    INTO v_alias
    FROM public.quantum_event_room_card_snapshots AS snapshot
    WHERE snapshot.occurrence_id = p_occurrence_id
      AND snapshot.participant_user_id = p_participant_user_id;
  END IF;

  IF v_alias IS NULL THEN
    SELECT candidate.alias_number
    INTO v_alias_number
    FROM pg_catalog.generate_series(1, 5) AS candidate(alias_number)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.quantum_event_room_card_snapshots AS snapshot
      WHERE snapshot.occurrence_id = p_occurrence_id
        AND snapshot.event_alias =
          '참가자 ' || pg_catalog.chr(64 + candidate.alias_number)
    )
    ORDER BY candidate.alias_number
    LIMIT 1;

    IF v_alias_number IS NULL THEN
      RAISE EXCEPTION 'event_seat_capacity_exhausted' USING ERRCODE = 'P0001';
    END IF;
    v_alias := '참가자 ' || pg_catalog.chr(64 + v_alias_number);
  END IF;

  INSERT INTO public.quantum_event_room_card_snapshots AS existing_snapshot (
    occurrence_id,
    participant_user_id,
    event_alias,
    gender,
    safe_payload,
    source_updated_at,
    schema_version
  ) VALUES (
    p_occurrence_id,
    p_participant_user_id,
    v_alias,
    v_gender,
    pg_catalog.jsonb_build_object(
      'profile_preference', v_public_preference,
      'meeting_moment', v_public_moment
    ),
    v_source_updated_at,
    2
  )
  ON CONFLICT (occurrence_id, participant_user_id) DO UPDATE
  SET gender = EXCLUDED.gender,
      safe_payload = EXCLUDED.safe_payload,
      source_updated_at = EXCLUDED.source_updated_at,
      schema_version = 2
  WHERE existing_snapshot.schema_version = 1;
END;
$$;

REVOKE ALL ON FUNCTION private.snapshot_quantum_event_room_member_card(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.ensure_quantum_event_secret_role_assignments(
  p_occurrence_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_roles TEXT[] := ARRAY[
    'explorer', 'reactor', 'observer', 'bridge', 'pace_maker'
  ]::TEXT[];
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_participant_count INTEGER;
  v_person RECORD;
  v_recent_role TEXT;
  v_selected_role TEXT;
  v_seat_label TEXT;
  v_seat_number INTEGER;
  v_active_count INTEGER;
BEGIN
  SELECT occurrence.*
  INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = p_occurrence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_occurrence_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_participant_count
  FROM private.quantum_event_assignment_people(p_occurrence_id);

  IF v_participant_count NOT BETWEEN 1 AND 5 THEN
    RETURN 0;
  END IF;

  UPDATE private.quantum_event_secret_role_assignments AS assignment
  SET is_active = FALSE,
      invalidated_at = pg_catalog.now(),
      invalidation_reason = 'room_membership_changed',
      updated_at = pg_catalog.now()
  WHERE assignment.occurrence_id = p_occurrence_id
    AND assignment.is_active
    AND NOT EXISTS (
      SELECT 1
      FROM private.quantum_event_assignment_people(p_occurrence_id) AS person
      WHERE person.participant_user_id = assignment.participant_user_id
    );

  FOR v_person IN
    SELECT person.participant_user_id
    FROM private.quantum_event_assignment_people(p_occurrence_id) AS person
    WHERE NOT EXISTS (
      SELECT 1
      FROM private.quantum_event_secret_role_assignments AS active_assignment
      WHERE active_assignment.occurrence_id = p_occurrence_id
        AND active_assignment.participant_user_id = person.participant_user_id
        AND active_assignment.is_active
    )
    ORDER BY person.participant_user_id
  LOOP
    SELECT participant_history.role_key
    INTO v_recent_role
    FROM private.quantum_event_secret_role_assignments AS participant_history
    WHERE participant_history.participant_user_id = v_person.participant_user_id
      AND participant_history.occurrence_id <> p_occurrence_id
    ORDER BY participant_history.assigned_at DESC, participant_history.id DESC
    LIMIT 1;

    SELECT candidate.role_key
    INTO v_selected_role
    FROM pg_catalog.unnest(v_roles)
      WITH ORDINALITY AS candidate(role_key, role_order)
    WHERE NOT EXISTS (
      SELECT 1
      FROM private.quantum_event_secret_role_assignments AS used_role
      WHERE used_role.occurrence_id = p_occurrence_id
        AND used_role.role_key = candidate.role_key
        AND used_role.is_active
    )
    ORDER BY
      CASE WHEN candidate.role_key = v_recent_role THEN 1 ELSE 0 END,
      (
        SELECT pg_catalog.count(*)
        FROM private.quantum_event_secret_role_assignments AS participant_history
        WHERE participant_history.participant_user_id = v_person.participant_user_id
          AND participant_history.role_key = candidate.role_key
      ),
      pg_catalog.md5(
        p_occurrence_id::TEXT
        || v_person.participant_user_id::TEXT
        || candidate.role_key
      ),
      candidate.role_order
    LIMIT 1;

    IF v_selected_role IS NULL THEN
      RAISE EXCEPTION 'secret_role_capacity_exhausted' USING ERRCODE = 'P0001';
    END IF;

    SELECT snapshot.event_alias
    INTO v_seat_label
    FROM public.quantum_event_room_card_snapshots AS snapshot
    WHERE snapshot.occurrence_id = p_occurrence_id
      AND snapshot.participant_user_id = v_person.participant_user_id;

    IF v_seat_label IS NULL THEN
      SELECT candidate.seat_number
      INTO v_seat_number
      FROM pg_catalog.generate_series(1, 5) AS candidate(seat_number)
      WHERE NOT EXISTS (
        SELECT 1
        FROM private.quantum_event_secret_role_assignments AS assigned_seat
        WHERE assigned_seat.occurrence_id = p_occurrence_id
          AND assigned_seat.seat_label =
            '참가자 ' || pg_catalog.chr(64 + candidate.seat_number)
          AND assigned_seat.is_active
      )
        AND NOT EXISTS (
          SELECT 1
          FROM public.quantum_event_room_card_snapshots AS snapshot
          WHERE snapshot.occurrence_id = p_occurrence_id
            AND snapshot.event_alias =
              '참가자 ' || pg_catalog.chr(64 + candidate.seat_number)
        )
      ORDER BY candidate.seat_number
      LIMIT 1;

      IF v_seat_number IS NULL THEN
        RAISE EXCEPTION 'event_seat_capacity_exhausted' USING ERRCODE = 'P0001';
      END IF;
      v_seat_label := '참가자 ' || pg_catalog.chr(64 + v_seat_number);
    END IF;

    INSERT INTO private.quantum_event_secret_role_assignments (
      occurrence_id,
      participant_user_id,
      seat_label,
      role_key
    ) VALUES (
      p_occurrence_id,
      v_person.participant_user_id,
      v_seat_label,
      v_selected_role
    );
  END LOOP;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_active_count
  FROM private.quantum_event_secret_role_assignments AS assignment
  WHERE assignment.occurrence_id = p_occurrence_id
    AND assignment.is_active;

  IF v_participant_count = 5
     AND (
       v_active_count <> 5
       OR (
         SELECT pg_catalog.count(DISTINCT assignment.role_key)
         FROM private.quantum_event_secret_role_assignments AS assignment
         WHERE assignment.occurrence_id = p_occurrence_id
           AND assignment.is_active
       ) <> 5
     ) THEN
    RAISE EXCEPTION 'secret_role_assignment_incomplete' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_active_count;
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_quantum_event_secret_role_assignments(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_event_role_confirmations_complete(
  p_occurrence_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT
      occurrence.required_total BETWEEN 1 AND 5
      AND pg_catalog.count(*) = occurrence.required_total
      AND pg_catalog.count(assignment.id) = occurrence.required_total
      AND pg_catalog.count(assignment.id) FILTER (
        WHERE assignment.role_confirmed_at IS NOT NULL
      ) = occurrence.required_total
    FROM public.quantum_event_occurrences AS occurrence
    CROSS JOIN LATERAL private.quantum_event_room_people(
      occurrence.id
    ) AS room_person
    LEFT JOIN private.quantum_event_secret_role_assignments AS assignment
      ON assignment.occurrence_id = occurrence.id
     AND assignment.participant_user_id = room_person.participant_user_id
     AND assignment.is_active
    WHERE occurrence.id = p_occurrence_id
    GROUP BY occurrence.required_total
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION private.quantum_event_role_confirmations_complete(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_quantum_profile_preference()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT preference.payload
  INTO v_result
  FROM private.quantum_profile_preferences AS preference
  WHERE preference.user_id = v_user_id
    AND preference.is_active
  ORDER BY preference.created_at DESC
  LIMIT 1;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_my_quantum_profile_preference(
  p_payload JSONB,
  p_question_bank_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_payload JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum-preference|' || v_user_id::TEXT, 0)
  );
  IF NOT private.quantum_profile_preference_payload_is_safe(
    p_payload,
    p_question_bank_version
  ) THEN
    RAISE EXCEPTION 'invalid_profile_preference' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM private.quantum_profile_preferences AS preference
  WHERE preference.user_id = v_user_id
    AND preference.is_active
  FOR UPDATE;

  UPDATE private.quantum_profile_preferences
  SET is_active = FALSE,
      invalidated_at = v_now,
      invalidation_reason = 'preference_replaced',
      updated_at = v_now
  WHERE user_id = v_user_id
    AND is_active;

  v_payload := p_payload || pg_catalog.jsonb_build_object(
    'updatedAt',
    pg_catalog.to_char(
      pg_catalog.timezone('UTC', v_now),
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
  );

  INSERT INTO private.quantum_profile_preferences (
    user_id,
    payload,
    question_bank_version,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_payload,
    p_question_bank_version,
    v_now,
    v_now
  );

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_my_quantum_event_meeting_moment(
  p_event_key TEXT,
  p_occurrence_key TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_occurrence_id UUID;
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_event_key IS NULL
     OR p_occurrence_key IS NULL
     OR p_occurrence_key !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_payload IS NULL
     OR p_event_key NOT IN (
    'tonight-onsenjjang-run', 'tonight-board-game',
    'tonight-casual-drinks', 'tonight-late-dinner',
    'scheduled-board-game', 'scheduled-jogging',
    'scheduled-dinner', 'scheduled-walk'
  ) OR NOT private.quantum_meeting_moment_payload_is_safe(p_payload) THEN
    RAISE EXCEPTION 'invalid_meeting_moment' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_occurrence_id := p_occurrence_key::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_occurrence_key' USING ERRCODE = '22023';
  END;

  IF p_payload ->> 'occurrenceKey' <> v_occurrence_id::TEXT THEN
    RAISE EXCEPTION 'occurrence_key_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT occurrence.*
  INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = v_occurrence_id
    AND occurrence.event_id = p_event_key
  FOR UPDATE;

  IF NOT FOUND
     OR v_occurrence.status NOT IN ('recruiting', 'confirmed')
     OR v_now >= v_occurrence.starts_at
     OR NOT EXISTS (
       SELECT 1
       FROM private.quantum_event_assignment_people(v_occurrence_id) AS person
       WHERE person.participant_user_id = v_user_id
     ) THEN
    RAISE EXCEPTION 'meeting_moment_not_available' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM private.quantum_event_meeting_moment_drafts AS moment
  WHERE moment.occurrence_id = v_occurrence_id
    AND moment.participant_user_id = v_user_id
    AND moment.is_active
  FOR UPDATE;

  UPDATE private.quantum_event_meeting_moment_drafts
  SET is_active = FALSE,
      invalidated_at = v_now,
      invalidation_reason = 'meeting_moment_replaced',
      updated_at = v_now
  WHERE occurrence_id = v_occurrence_id
    AND participant_user_id = v_user_id
    AND is_active;

  INSERT INTO private.quantum_event_meeting_moment_drafts (
    occurrence_id,
    participant_user_id,
    event_key,
    occurrence_key,
    payload,
    created_at,
    updated_at
  ) VALUES (
    v_occurrence_id,
    v_user_id,
    p_event_key,
    v_occurrence_id::TEXT,
    p_payload,
    v_now,
    v_now
  );

  PERFORM private.snapshot_quantum_event_room_member_card(
    v_occurrence_id,
    v_user_id
  );
  PERFORM private.ensure_quantum_event_secret_role_assignments(v_occurrence_id);

  RETURN p_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_my_quantum_event_meeting_moment_and_participate(
  p_event_key TEXT,
  p_event_mode TEXT,
  p_party_type TEXT,
  p_group_id UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_participation JSONB;
  v_occurrence_id UUID;
  v_validation_payload JSONB;
  v_moment_payload JSONB;
  v_secret_role JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR NOT p_payload ?& ARRAY['mood', 'expectation', 'activityChoice']
     OR p_payload - ARRAY[
       'mood', 'expectation', 'activityChoice'
     ]::TEXT[] <> '{}'::JSONB THEN
    RAISE EXCEPTION 'invalid_meeting_moment' USING ERRCODE = '22023';
  END IF;

  v_validation_payload := p_payload || pg_catalog.jsonb_build_object(
    'occurrenceKey', '00000000-0000-4000-8000-000000000000'
  );
  IF NOT private.quantum_meeting_moment_payload_is_safe(v_validation_payload) THEN
    RAISE EXCEPTION 'invalid_meeting_moment' USING ERRCODE = '22023';
  END IF;
  IF NOT private.quantum_event_precard_ready(v_user_id) THEN
    RAISE EXCEPTION 'profile_preference_required' USING ERRCODE = 'P0001';
  END IF;

  -- set_my_quantum_event_participation resolves and locks the catalog room.
  -- Calling it inside this function keeps participation and moment writes in
  -- one transaction; any later validation error rolls the participation back.
  BEGIN
    v_participation := public.set_my_quantum_event_participation(
      p_event_key,
      p_event_mode,
      p_party_type,
      p_group_id
    );
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'pre_match_card_required' THEN
        RAISE EXCEPTION 'profile_preference_required' USING ERRCODE = 'P0001';
      END IF;
      RAISE;
  END;

  IF pg_catalog.jsonb_typeof(v_participation) <> 'object'
     OR v_participation ->> 'event_id' IS DISTINCT FROM p_event_key
     OR v_participation ->> 'event_mode' IS DISTINCT FROM p_event_mode
     OR v_participation ->> 'occurrence_id' IS NULL THEN
    RAISE EXCEPTION 'participation_response_invalid' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_occurrence_id := (v_participation ->> 'occurrence_id')::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'participation_response_invalid' USING ERRCODE = 'P0001';
  END;

  v_moment_payload := p_payload || pg_catalog.jsonb_build_object(
    'occurrenceKey', v_occurrence_id::TEXT
  );
  v_moment_payload := public.save_my_quantum_event_meeting_moment(
    p_event_key,
    v_occurrence_id::TEXT,
    v_moment_payload
  );
  v_secret_role := public.get_my_quantum_event_secret_role(v_occurrence_id);

  IF pg_catalog.jsonb_typeof(v_secret_role) <> 'object'
     OR pg_catalog.jsonb_typeof(v_secret_role -> 'role_confirmed') <> 'boolean'
     OR pg_catalog.jsonb_typeof(v_secret_role -> 'application_confirmed') <> 'boolean'
     OR (v_secret_role ->> 'role_confirmed')::BOOLEAN
       IS DISTINCT FROM (v_secret_role ->> 'application_confirmed')::BOOLEAN THEN
    RAISE EXCEPTION 'secret_role_response_invalid' USING ERRCODE = 'P0001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'participation', v_participation,
    'meeting_moment', v_moment_payload,
    'secret_role', v_secret_role,
    'role_confirmation_required',
      NOT (v_secret_role ->> 'role_confirmed')::BOOLEAN,
    'application_confirmed',
      (v_secret_role ->> 'role_confirmed')::BOOLEAN
  );
END;
$$;

-- The four-argument entry point cannot satisfy the new meeting readiness
-- contract. Keep it only as an internal implementation detail of the atomic
-- RPC above so clients cannot bypass the moment write.
REVOKE ALL ON FUNCTION public.set_my_quantum_event_participation(
  TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_quantum_event_meeting_moment(
  p_event_key TEXT,
  p_occurrence_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_occurrence_id UUID;
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_payload JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_event_key IS NULL
     OR p_occurrence_key IS NULL
     OR p_occurrence_key !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_event_key NOT IN (
       'tonight-onsenjjang-run', 'tonight-board-game',
       'tonight-casual-drinks', 'tonight-late-dinner',
       'scheduled-board-game', 'scheduled-jogging',
       'scheduled-dinner', 'scheduled-walk'
     ) THEN
    RAISE EXCEPTION 'invalid_meeting_moment_lookup' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_occurrence_id := p_occurrence_key::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_occurrence_key' USING ERRCODE = '22023';
  END;

  SELECT occurrence.*
  INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = v_occurrence_id
    AND occurrence.event_id = p_event_key;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM private.quantum_event_assignment_people(v_occurrence_id) AS person
    WHERE person.participant_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'meeting_moment_not_available' USING ERRCODE = '42501';
  END IF;

  SELECT moment.payload
  INTO v_payload
  FROM private.quantum_event_meeting_moment_drafts AS moment
  WHERE moment.occurrence_id = v_occurrence.id
    AND moment.event_key = p_event_key
    AND moment.occurrence_key = v_occurrence.id::TEXT
    AND moment.participant_user_id = v_user_id
    AND moment.is_active
  ORDER BY moment.created_at DESC
  LIMIT 1;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_quantum_event_room_participants()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_occurrence UUID;
  v_caller_school TEXT;
  v_school_mismatch_count INTEGER := 0;
  v_member RECORD;
  v_result JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT membership.occurrence_id
  INTO v_occurrence
  FROM (
    SELECT participation.occurrence_id
    FROM public.quantum_event_participations AS participation
    WHERE participation.user_id = v_caller
      AND participation.status IN ('recruiting', 'confirmed')
    UNION
    SELECT participation.occurrence_id
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id
     AND member.user_id = v_caller
     AND member.left_at IS NULL
    WHERE participation.party_type = 'friends'
      AND participation.status IN ('recruiting', 'confirmed')
  ) AS membership
  LIMIT 1;

  IF v_occurrence IS NULL THEN
    RAISE EXCEPTION 'room_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.school
  INTO v_caller_school
  FROM public.profiles AS profile
  WHERE profile.user_id = v_caller;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_school_mismatch_count
  FROM private.quantum_event_room_people(v_occurrence) AS room_person
  WHERE pg_catalog.lower(pg_catalog.btrim(room_person.school))
    IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(v_caller_school));

  IF v_school_mismatch_count > 0 THEN
    RAISE EXCEPTION 'room_school_mismatch' USING ERRCODE = '42501';
  END IF;

  FOR v_member IN
    SELECT room_person.participant_user_id
    FROM private.quantum_event_room_people(v_occurrence) AS room_person
    ORDER BY room_person.participant_user_id
  LOOP
    PERFORM private.snapshot_quantum_event_room_member_card(
      v_occurrence,
      v_member.participant_user_id
    );
  END LOOP;

  WITH caller_participation AS (
    SELECT participation.group_id, participation.party_type
    FROM public.quantum_event_participations AS participation
    WHERE participation.user_id = v_caller
      AND participation.occurrence_id = v_occurrence
      AND participation.status IN ('recruiting', 'confirmed')
    UNION ALL
    SELECT participation.group_id, participation.party_type
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id
     AND member.user_id = v_caller
     AND member.left_at IS NULL
    WHERE participation.occurrence_id = v_occurrence
      AND participation.status IN ('recruiting', 'confirmed')
    LIMIT 1
  ), my_party AS (
    SELECT v_caller AS participant_user_id
    UNION
    SELECT member.user_id
    FROM caller_participation
    JOIN public.group_members AS member
      ON member.group_id = caller_participation.group_id
     AND member.left_at IS NULL
    WHERE caller_participation.party_type = 'friends'
    UNION
    SELECT CASE
      WHEN invite.inviter_user_id = v_caller THEN invite.invited_user_id
      ELSE invite.inviter_user_id
    END
    FROM public.quantum_event_room_invites AS invite
    WHERE invite.occurrence_id = v_occurrence
      AND invite.status = 'accepted'
      AND (
        invite.inviter_user_id = v_caller
        OR invite.invited_user_id = v_caller
      )
  ), room_members AS (
    SELECT
      room_person.participant_user_id,
      room_person.gender,
      private.quantum_event_private_seat_label(
        v_occurrence,
        room_person.participant_user_id
      ) AS seat_label
    FROM private.quantum_event_room_people(v_occurrence) AS room_person
    WHERE NOT EXISTS (
      SELECT 1
      FROM my_party
      WHERE my_party.participant_user_id = room_person.participant_user_id
    )
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'seat_label', room_member.seat_label,
      'gender', room_member.gender,
      'ready', CASE
        WHEN snapshot.schema_version = 2 THEN TRUE
        ELSE FALSE
      END,
      'profile_preference', CASE
        WHEN snapshot.schema_version = 2
          THEN snapshot.safe_payload -> 'profile_preference'
        ELSE NULL
      END,
      'meeting_moment', CASE
        WHEN snapshot.schema_version = 2
          THEN snapshot.safe_payload -> 'meeting_moment'
        ELSE NULL
      END
    )
    ORDER BY room_member.seat_label
  ), '[]'::JSONB)
  INTO v_result
  FROM room_members AS room_member
  LEFT JOIN public.quantum_event_room_card_snapshots AS snapshot
    ON snapshot.occurrence_id = v_occurrence
   AND snapshot.participant_user_id = room_member.participant_user_id
   AND snapshot.schema_version = 2;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_quantum_event_secret_role();

CREATE OR REPLACE FUNCTION public.get_my_quantum_event_secret_role(
  p_occurrence_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_assignment private.quantum_event_secret_role_assignments%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'secret_role_unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT occurrence.*
  INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = p_occurrence_id
    AND (
      (
        occurrence.status IN ('recruiting', 'confirmed')
        AND EXISTS (
          SELECT 1
          FROM private.quantum_event_room_people(occurrence.id) AS room_person
          WHERE room_person.participant_user_id = v_user_id
        )
      )
      OR (
        occurrence.status = 'completed'
        AND EXISTS (
          SELECT 1
          FROM public.quantum_event_match_members AS member
          WHERE member.occurrence_id = occurrence.id
            AND member.user_id = v_user_id
        )
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'secret_role_unavailable' USING ERRCODE = '42501';
  END IF;

  PERFORM private.ensure_quantum_event_secret_role_assignments(v_occurrence.id);

  SELECT assignment.*
  INTO v_assignment
  FROM private.quantum_event_secret_role_assignments AS assignment
  WHERE assignment.occurrence_id = v_occurrence.id
    AND assignment.participant_user_id = v_user_id
    AND assignment.is_active
  ORDER BY assignment.assigned_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'secret_role_unavailable' USING ERRCODE = 'P0001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'role', v_assignment.role_key,
    'occurrence_id', v_occurrence.id,
    'event_key', v_occurrence.event_id,
    'can_change', (
      v_occurrence.status = 'recruiting'
      AND pg_catalog.now() < v_occurrence.starts_at
      AND NOT v_assignment.changed_once
      AND v_assignment.role_confirmed_at IS NULL
    ),
    'role_confirmed', v_assignment.role_confirmed_at IS NOT NULL,
    'application_confirmed', v_assignment.role_confirmed_at IS NOT NULL,
    'starts_at', v_occurrence.starts_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_my_quantum_event_secret_role(
  p_occurrence_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_assignment private.quantum_event_secret_role_assignments%ROWTYPE;
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_match_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'secret_role_unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT occurrence.*
  INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = p_occurrence_id
    AND occurrence.status IN ('recruiting', 'confirmed')
    AND EXISTS (
      SELECT 1
      FROM private.quantum_event_room_people(occurrence.id) AS room_person
      WHERE room_person.participant_user_id = v_user_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'secret_role_unavailable' USING ERRCODE = '42501';
  END IF;
  IF v_occurrence.status = 'recruiting' AND v_now >= v_occurrence.starts_at THEN
    RAISE EXCEPTION 'role_confirmation_closed' USING ERRCODE = 'P0001';
  END IF;

  PERFORM private.ensure_quantum_event_secret_role_assignments(v_occurrence.id);

  SELECT assignment.*
  INTO v_assignment
  FROM private.quantum_event_secret_role_assignments AS assignment
  WHERE assignment.occurrence_id = v_occurrence.id
    AND assignment.participant_user_id = v_user_id
    AND assignment.is_active
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'secret_role_unavailable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.quantum_event_secret_role_assignments AS assignment
  SET role_confirmed_at = COALESCE(assignment.role_confirmed_at, v_now),
      updated_at = v_now
  WHERE assignment.id = v_assignment.id
    AND assignment.occurrence_id = v_occurrence.id
    AND assignment.participant_user_id = v_user_id
    AND assignment.is_active
  RETURNING assignment.* INTO v_assignment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'secret_role_unavailable' USING ERRCODE = 'P0001';
  END IF;

  IF private.quantum_event_role_confirmations_complete(v_occurrence.id) THEN
    v_match_id := public.finalize_quantum_event_occurrence(v_occurrence.id);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'role', v_assignment.role_key,
    'occurrence_id', v_occurrence.id,
    'event_key', v_occurrence.event_id,
    'can_change', FALSE,
    'role_confirmed', TRUE,
    'application_confirmed', TRUE,
    'starts_at', v_occurrence.starts_at
  );
END;
$$;

DROP FUNCTION IF EXISTS public.change_my_quantum_event_secret_role();

CREATE OR REPLACE FUNCTION public.change_my_quantum_event_secret_role(
  p_occurrence_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_mine private.quantum_event_secret_role_assignments%ROWTYPE;
  v_other private.quantum_event_secret_role_assignments%ROWTYPE;
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'secret_role_unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT occurrence.*
  INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = p_occurrence_id
    AND occurrence.status = 'recruiting'
    AND EXISTS (
      SELECT 1
      FROM private.quantum_event_room_people(occurrence.id) AS room_person
      WHERE room_person.participant_user_id = v_user_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'secret_role_unavailable' USING ERRCODE = '42501';
  END IF;

  PERFORM private.ensure_quantum_event_secret_role_assignments(v_occurrence.id);

  SELECT assignment.*
  INTO v_mine
  FROM private.quantum_event_secret_role_assignments AS assignment
  WHERE assignment.occurrence_id = v_occurrence.id
    AND assignment.participant_user_id = v_user_id
    AND assignment.is_active
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'secret_role_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF v_mine.role_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'role_change_closed' USING ERRCODE = 'P0001';
  END IF;
  IF v_mine.changed_once THEN
    RAISE EXCEPTION 'role_change_already_used' USING ERRCODE = 'P0001';
  END IF;
  IF v_now >= v_occurrence.starts_at THEN
    RAISE EXCEPTION 'role_change_closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT assignment.*
  INTO v_other
  FROM private.quantum_event_secret_role_assignments AS assignment
  WHERE assignment.occurrence_id = v_occurrence.id
    AND assignment.participant_user_id <> v_user_id
    AND assignment.is_active
    AND assignment.role_confirmed_at IS NULL
  ORDER BY pg_catalog.md5(
    assignment.id::TEXT || v_user_id::TEXT || v_occurrence.id::TEXT
  )
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_change_partner_unavailable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.quantum_event_secret_role_assignments
  SET is_active = FALSE,
      invalidated_at = v_now,
      invalidation_reason = 'private_role_swap',
      updated_at = v_now
  WHERE id IN (v_mine.id, v_other.id);

  INSERT INTO private.quantum_event_secret_role_assignments (
    occurrence_id,
    participant_user_id,
    seat_label,
    role_key,
    changed_once,
    changed_at,
    assigned_at,
    created_at,
    updated_at
  ) VALUES (
    v_occurrence.id,
    v_mine.participant_user_id,
    v_mine.seat_label,
    v_other.role_key,
    TRUE,
    v_now,
    v_now,
    v_now,
    v_now
  );

  INSERT INTO private.quantum_event_secret_role_assignments (
    occurrence_id,
    participant_user_id,
    seat_label,
    role_key,
    changed_once,
    changed_at,
    assigned_at,
    created_at,
    updated_at
  ) VALUES (
    v_occurrence.id,
    v_other.participant_user_id,
    v_other.seat_label,
    v_mine.role_key,
    v_other.changed_once,
    v_other.changed_at,
    v_now,
    v_now,
    v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'role', v_other.role_key,
    'occurrence_id', v_occurrence.id,
    'event_key', v_occurrence.event_id,
    'can_change', FALSE,
    'role_confirmed', FALSE,
    'application_confirmed', FALSE,
    'starts_at', v_occurrence.starts_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_quantum_event_role_guess_state(
  p_match_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_match public.matches%ROWTYPE;
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_participant_count INTEGER;
  v_assignment_count INTEGER;
  v_expected_guess_count INTEGER;
  v_actual_guess_count INTEGER;
  v_submitted_count INTEGER;
  v_reveal_at TIMESTAMPTZ;
  v_reveal_available BOOLEAN;
  v_status TEXT;
  v_targets JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_match_id IS NULL THEN
    RAISE EXCEPTION 'invalid_match' USING ERRCODE = '22023';
  END IF;

  SELECT occurrence.*
  INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.match_id = p_match_id
    AND EXISTS (
      SELECT 1
      FROM public.quantum_event_match_members AS caller_membership
      WHERE caller_membership.match_id = p_match_id
        AND caller_membership.occurrence_id = occurrence.id
        AND caller_membership.user_id = v_user_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_guessing_not_available' USING ERRCODE = '42501';
  END IF;

  SELECT match_row.*
  INTO v_match
  FROM public.matches AS match_row
  WHERE match_row.id = p_match_id;

  IF NOT FOUND
     OR v_match.status <> 'completed'
     OR v_match.completed_at IS NULL
     OR v_occurrence.status <> 'completed' THEN
    RAISE EXCEPTION 'role_guessing_not_available' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_participant_count
  FROM public.quantum_event_match_members AS member
  WHERE member.match_id = p_match_id
    AND member.occurrence_id = v_occurrence.id;

  IF v_participant_count NOT BETWEEN 3 AND 5 THEN
    RAISE EXCEPTION 'role_guessing_invalid_participant_count' USING ERRCODE = 'P0001';
  END IF;

  v_assignment_count := private.ensure_quantum_event_secret_role_assignments(
    v_occurrence.id
  );
  IF v_assignment_count <> v_participant_count THEN
    RAISE EXCEPTION 'role_guessing_participants_incomplete' USING ERRCODE = 'P0001';
  END IF;

  v_expected_guess_count := v_participant_count * (v_participant_count - 1);

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_actual_guess_count
  FROM private.quantum_event_role_guesses AS guess
  WHERE guess.match_id = p_match_id
    AND guess.occurrence_id = v_occurrence.id
    AND guess.is_active;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_submitted_count
  FROM private.quantum_event_role_guesses AS guess
  WHERE guess.match_id = p_match_id
    AND guess.occurrence_id = v_occurrence.id
    AND guess.guesser_user_id = v_user_id
    AND guess.is_active;

  v_reveal_at := v_occurrence.ends_at + INTERVAL '24 hours';
  v_reveal_available := (
    v_actual_guess_count >= v_expected_guess_count
    OR pg_catalog.now() >= v_reveal_at
  );
  v_status := CASE
    WHEN v_reveal_available THEN 'revealed'
    WHEN v_submitted_count = v_participant_count - 1 THEN 'submitted'
    ELSE 'open'
  END;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'seat_label', assignment.seat_label,
      'guessed_role', guess.guessed_role
    )
    || CASE
      WHEN v_reveal_available THEN pg_catalog.jsonb_build_object(
        'answer_role', assignment.role_key,
        'correct', COALESCE(guess.guessed_role = assignment.role_key, FALSE)
      )
      ELSE '{}'::JSONB
    END
    ORDER BY assignment.seat_label
  ), '[]'::JSONB)
  INTO v_targets
  FROM private.quantum_event_secret_role_assignments AS assignment
  LEFT JOIN private.quantum_event_role_guesses AS guess
    ON guess.match_id = p_match_id
   AND guess.occurrence_id = v_occurrence.id
   AND guess.guesser_user_id = v_user_id
   AND guess.target_user_id = assignment.participant_user_id
   AND guess.is_active
  WHERE assignment.occurrence_id = v_occurrence.id
    AND assignment.participant_user_id <> v_user_id
    AND assignment.is_active;

  RETURN pg_catalog.jsonb_build_object(
    'status', v_status,
    'reveal_at', v_reveal_at,
    'submitted', v_submitted_count = v_participant_count - 1,
    'reveal_available', v_reveal_available,
    'targets', v_targets
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_my_quantum_event_role_guesses(
  p_match_id UUID,
  p_guesses JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_match public.matches%ROWTYPE;
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_participant_count INTEGER;
  v_assignment_count INTEGER;
  v_guess JSONB;
  v_seat_label TEXT;
  v_role_key TEXT;
  v_target_user_id UUID;
  v_seen_labels TEXT[] := ARRAY[]::TEXT[];
  v_inserted_count INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_match_id IS NULL OR pg_catalog.jsonb_typeof(p_guesses) <> 'array' THEN
    RAISE EXCEPTION 'invalid_role_guesses' USING ERRCODE = '22023';
  END IF;

  SELECT occurrence.*
  INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.match_id = p_match_id
    AND EXISTS (
      SELECT 1
      FROM public.quantum_event_match_members AS caller_membership
      WHERE caller_membership.match_id = p_match_id
        AND caller_membership.occurrence_id = occurrence.id
        AND caller_membership.user_id = v_user_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_guessing_not_available' USING ERRCODE = '42501';
  END IF;

  SELECT match_row.*
  INTO v_match
  FROM public.matches AS match_row
  WHERE match_row.id = p_match_id;

  IF NOT FOUND
     OR v_match.status <> 'completed'
     OR v_match.completed_at IS NULL
     OR v_occurrence.status <> 'completed' THEN
    RAISE EXCEPTION 'role_guessing_not_available' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_participant_count
  FROM public.quantum_event_match_members AS member
  WHERE member.match_id = p_match_id
    AND member.occurrence_id = v_occurrence.id;

  IF v_participant_count NOT BETWEEN 3 AND 5 THEN
    RAISE EXCEPTION 'role_guessing_invalid_participant_count' USING ERRCODE = 'P0001';
  END IF;

  v_assignment_count := private.ensure_quantum_event_secret_role_assignments(
    v_occurrence.id
  );
  IF v_assignment_count <> v_participant_count THEN
    RAISE EXCEPTION 'role_guessing_participants_incomplete' USING ERRCODE = 'P0001';
  END IF;

  IF pg_catalog.jsonb_array_length(p_guesses) <> v_participant_count - 1
     OR pg_catalog.jsonb_array_length(p_guesses) NOT BETWEEN 2 AND 4 THEN
    RAISE EXCEPTION 'invalid_role_guess_count' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.now() >= v_occurrence.ends_at + INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'role_guessing_closed' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.quantum_event_role_guesses AS existing_guess
    WHERE existing_guess.match_id = p_match_id
      AND existing_guess.guesser_user_id = v_user_id
      AND existing_guess.is_active
  ) THEN
    RAISE EXCEPTION 'role_guesses_already_submitted' USING ERRCODE = 'P0001';
  END IF;

  FOR v_guess IN
    SELECT guess.value
    FROM pg_catalog.jsonb_array_elements(p_guesses) AS guess(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_guess) <> 'object'
       OR NOT v_guess ?& ARRAY['seat_label', 'role']
       OR v_guess - ARRAY['seat_label', 'role']::TEXT[] <> '{}'::JSONB
       OR pg_catalog.jsonb_typeof(v_guess -> 'seat_label') <> 'string'
       OR pg_catalog.char_length(pg_catalog.btrim(v_guess ->> 'seat_label'))
         NOT BETWEEN 1 AND 24
       OR v_guess ->> 'role' NOT IN (
         'explorer', 'reactor', 'observer', 'bridge', 'pace_maker'
       ) THEN
      RAISE EXCEPTION 'invalid_role_guess' USING ERRCODE = '22023';
    END IF;

    v_seat_label := pg_catalog.btrim(v_guess ->> 'seat_label');
    v_role_key := v_guess ->> 'role';

    IF v_seat_label = ANY(v_seen_labels) THEN
      RAISE EXCEPTION 'duplicate_guess_target' USING ERRCODE = '22023';
    END IF;
    v_seen_labels := pg_catalog.array_append(v_seen_labels, v_seat_label);

    SELECT assignment.participant_user_id
    INTO v_target_user_id
    FROM private.quantum_event_secret_role_assignments AS assignment
    WHERE assignment.occurrence_id = v_occurrence.id
      AND assignment.seat_label = v_seat_label
      AND assignment.is_active
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_guess_target' USING ERRCODE = '22023';
    END IF;
    IF v_target_user_id = v_user_id THEN
      RAISE EXCEPTION 'self_guess_not_allowed' USING ERRCODE = '22023';
    END IF;

    INSERT INTO private.quantum_event_role_guesses (
      occurrence_id,
      match_id,
      guesser_user_id,
      target_user_id,
      guessed_role
    ) VALUES (
      v_occurrence.id,
      p_match_id,
      v_user_id,
      v_target_user_id,
      v_role_key
    );
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  IF v_inserted_count <> v_participant_count - 1 THEN
    RAISE EXCEPTION 'incomplete_role_guess_submission' USING ERRCODE = 'P0001';
  END IF;

  RETURN public.get_my_quantum_event_role_guess_state(p_match_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.invalidate_quantum_event_room_artifacts()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_affected_user_ids UUID[];
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF OLD.occurrence_id IS NULL
     OR OLD.status NOT IN ('recruiting', 'confirmed')
     OR NOT (
       OLD.occurrence_id IS DISTINCT FROM NEW.occurrence_id
       OR NEW.status NOT IN ('recruiting', 'confirmed')
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD.party_type = 'friends' AND OLD.group_id IS NOT NULL THEN
    SELECT pg_catalog.array_agg(affected.user_id)
    INTO v_affected_user_ids
    FROM (
      SELECT OLD.user_id AS user_id
      UNION
      SELECT member.user_id
      FROM public.group_members AS member
      WHERE member.group_id = OLD.group_id
        AND member.left_at IS NULL
    ) AS affected;
  ELSE
    v_affected_user_ids := ARRAY[OLD.user_id]::UUID[];
  END IF;

  DELETE FROM public.quantum_event_room_card_snapshots AS snapshot
  WHERE snapshot.occurrence_id = OLD.occurrence_id
    AND snapshot.participant_user_id = ANY(v_affected_user_ids);

  UPDATE private.quantum_event_meeting_moment_drafts AS moment
  SET is_active = FALSE,
      invalidated_at = v_now,
      invalidation_reason = 'room_membership_changed',
      updated_at = v_now
  WHERE moment.occurrence_id = OLD.occurrence_id
    AND moment.participant_user_id = ANY(v_affected_user_ids)
    AND moment.is_active;

  UPDATE private.quantum_event_secret_role_assignments AS assignment
  SET is_active = FALSE,
      invalidated_at = v_now,
      invalidation_reason = 'room_membership_changed',
      updated_at = v_now
  WHERE assignment.occurrence_id = OLD.occurrence_id
    AND assignment.participant_user_id = ANY(v_affected_user_ids)
    AND assignment.is_active;

  UPDATE private.quantum_event_role_guesses AS guess
  SET is_active = FALSE,
      invalidated_at = v_now,
      invalidation_reason = 'room_membership_changed',
      updated_at = v_now
  WHERE guess.occurrence_id = OLD.occurrence_id
    AND (
      guess.guesser_user_id = ANY(v_affected_user_ids)
      OR guess.target_user_id = ANY(v_affected_user_ids)
    )
    AND guess.is_active;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.invalidate_quantum_event_room_artifacts()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.invalidate_quantum_event_room_artifacts() IS
  'Trigger-only SECURITY DEFINER cleanup. OLD/NEW rows are the authorization context, so auth.uid() is inappropriate; direct EXECUTE is revoked from PUBLIC, anon, authenticated, and service_role.';

DROP TRIGGER IF EXISTS trg_quantum_event_artifact_invalidation
  ON public.quantum_event_participations;
CREATE TRIGGER trg_quantum_event_artifact_invalidation
  AFTER UPDATE OF occurrence_id, status, group_id, party_type
  ON public.quantum_event_participations
  FOR EACH ROW
  EXECUTE FUNCTION private.invalidate_quantum_event_room_artifacts();

DROP FUNCTION IF EXISTS public.cancel_my_quantum_event_participation();

CREATE OR REPLACE FUNCTION public.cancel_my_quantum_event_participation()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_candidate public.quantum_event_participations%ROWTYPE;
  v_participation public.quantum_event_participations%ROWTYPE;
  v_group_leader_id UUID;
  v_affected_user_ids UUID[];
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_cancelled BOOLEAN := FALSE;
  v_remaining_participation JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum-event-user|' || v_user_id::TEXT, 0)
  );

  SELECT participation.*
  INTO v_candidate
  FROM public.quantum_event_participations AS participation
  WHERE participation.user_id = v_user_id
    OR (
      participation.party_type = 'friends'
      AND EXISTS (
        SELECT 1
        FROM public.group_members AS member
        WHERE member.group_id = participation.group_id
          AND member.user_id = v_user_id
          AND member.left_at IS NULL
      )
    )
  ORDER BY
    CASE
      WHEN participation.status IN ('recruiting', 'confirmed') THEN 0
      WHEN participation.status = 'completed' THEN 1
      ELSE 2
    END,
    participation.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'cancelled', FALSE,
      'remaining_participation', NULL
    );
  END IF;

  IF v_candidate.occurrence_id IS NOT NULL THEN
    PERFORM 1
    FROM public.quantum_event_occurrences AS occurrence
    WHERE occurrence.id = v_candidate.occurrence_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'cancelled', FALSE,
        'remaining_participation', NULL
      );
    END IF;
  END IF;

  SELECT participation.*
  INTO v_participation
  FROM public.quantum_event_participations AS participation
  WHERE participation.user_id = v_candidate.user_id
    AND participation.occurrence_id IS NOT DISTINCT FROM v_candidate.occurrence_id
    AND participation.event_id = v_candidate.event_id
    AND participation.event_mode = v_candidate.event_mode
    AND participation.party_type = v_candidate.party_type
    AND participation.group_id IS NOT DISTINCT FROM v_candidate.group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'cancelled', FALSE,
      'remaining_participation', NULL
    );
  END IF;

  IF v_participation.party_type = 'friends' THEN
    SELECT event_group.leader_user_id
    INTO v_group_leader_id
    FROM public.groups AS event_group
    WHERE event_group.id = v_participation.group_id;

    IF v_participation.status IN ('recruiting', 'confirmed')
       AND v_group_leader_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'friend_party_leader_required' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_participation.status IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;

  IF v_participation.status <> 'recruiting' THEN
    RETURN pg_catalog.jsonb_build_object(
      'cancelled', FALSE,
      'remaining_participation', NULL
    );
  END IF;

  IF v_participation.party_type = 'friends' THEN
    SELECT pg_catalog.array_agg(affected.user_id)
    INTO v_affected_user_ids
    FROM (
      SELECT v_participation.user_id AS user_id
      UNION
      SELECT member.user_id
      FROM public.group_members AS member
      WHERE member.group_id = v_participation.group_id
        AND member.left_at IS NULL
    ) AS affected;
  ELSE
    v_affected_user_ids := ARRAY[v_user_id]::UUID[];
  END IF;

  UPDATE public.quantum_event_participations
  SET status = 'cancelled',
      cancel_reason = 'user_cancelled',
      updated_at = v_now
  WHERE user_id = v_participation.user_id
    AND occurrence_id IS NOT DISTINCT FROM v_participation.occurrence_id
    AND event_id = v_participation.event_id
    AND event_mode = v_participation.event_mode
    AND party_type = v_participation.party_type
    AND group_id IS NOT DISTINCT FROM v_participation.group_id
    AND status = 'recruiting';
  v_cancelled := FOUND;

  UPDATE public.quantum_event_room_invites AS invite
  SET status = 'cancelled',
      cancelled_at = v_now,
      updated_at = v_now
  WHERE invite.status IN ('pending', 'accepted')
    AND invite.occurrence_id = v_participation.occurrence_id
    AND (
      invite.inviter_user_id = ANY(v_affected_user_ids)
      OR invite.invited_user_id = ANY(v_affected_user_ids)
    );

  UPDATE public.notifications AS notification
  SET read_at = COALESCE(notification.read_at, v_now)
  WHERE notification.kind = 'quantum_event_room_invite'
    AND notification.payload ->> 'token' IN (
      SELECT notification_invite.token
      FROM public.quantum_event_room_invites AS notification_invite
      WHERE notification_invite.occurrence_id = v_participation.occurrence_id
        AND (
          notification_invite.inviter_user_id = ANY(v_affected_user_ids)
          OR notification_invite.invited_user_id = ANY(v_affected_user_ids)
        )
    );

  DELETE FROM public.quantum_event_room_card_snapshots AS snapshot
  WHERE snapshot.occurrence_id = v_participation.occurrence_id
    AND snapshot.participant_user_id = ANY(v_affected_user_ids);

  UPDATE private.quantum_event_meeting_moment_drafts AS moment
  SET is_active = FALSE,
      invalidated_at = v_now,
      invalidation_reason = 'participation_cancelled',
      updated_at = v_now
  WHERE moment.occurrence_id = v_participation.occurrence_id
    AND moment.participant_user_id = ANY(v_affected_user_ids)
    AND moment.is_active;

  UPDATE private.quantum_event_secret_role_assignments AS assignment
  SET is_active = FALSE,
      invalidated_at = v_now,
      invalidation_reason = 'participation_cancelled',
      updated_at = v_now
  WHERE assignment.occurrence_id = v_participation.occurrence_id
    AND assignment.participant_user_id = ANY(v_affected_user_ids)
    AND assignment.is_active;

  UPDATE private.quantum_event_role_guesses AS guess
  SET is_active = FALSE,
      invalidated_at = v_now,
      invalidation_reason = 'participation_cancelled',
      updated_at = v_now
  WHERE guess.occurrence_id = v_participation.occurrence_id
    AND (
      guess.guesser_user_id = ANY(v_affected_user_ids)
      OR guess.target_user_id = ANY(v_affected_user_ids)
    )
    AND guess.is_active;

  SELECT pg_catalog.jsonb_build_object(
    'event_id', participation.event_id,
    'event_mode', participation.event_mode,
    'party_type', participation.party_type,
    'status', participation.status,
    'updated_at', participation.updated_at
  )
  INTO v_remaining_participation
  FROM public.quantum_event_participations AS participation
  WHERE participation.status IN ('recruiting', 'confirmed')
    AND (
      participation.user_id = v_user_id
      OR (
        participation.party_type = 'friends'
        AND EXISTS (
          SELECT 1
          FROM public.group_members AS member
          WHERE member.group_id = participation.group_id
            AND member.user_id = v_user_id
            AND member.left_at IS NULL
        )
      )
    )
  ORDER BY participation.updated_at DESC
  LIMIT 1;

  RETURN pg_catalog.jsonb_build_object(
    'cancelled', v_cancelled,
    'remaining_participation', v_remaining_participation
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_quantum_event_capacity_reached()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.occurrence_id IS NOT NULL
     AND NEW.status = 'recruiting'
     AND private.quantum_event_role_confirmations_complete(NEW.occurrence_id) THEN
    PERFORM public.finalize_quantum_event_occurrence(NEW.occurrence_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_quantum_event_capacity_reached()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.handle_quantum_event_capacity_reached() IS
  'Trigger-only capacity gate. auth.uid() is inappropriate because trigger execution has no caller ownership contract; direct EXECUTE is revoked and NEW identifies the locked participation occurrence.';

REVOKE ALL ON FUNCTION public.get_my_quantum_profile_preference()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_my_quantum_profile_preference(JSONB, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_quantum_event_meeting_moment(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_my_quantum_event_meeting_moment(TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_my_quantum_event_meeting_moment_and_participate(
  TEXT, TEXT, TEXT, UUID, JSONB
)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_quantum_event_secret_role(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_my_quantum_event_secret_role(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.change_my_quantum_event_secret_role(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_my_quantum_event_role_guesses(UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_quantum_event_role_guess_state(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_quantum_event_room_participants()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_my_quantum_event_participation()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_quantum_profile_preference()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_quantum_profile_preference(JSONB, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_event_meeting_moment(TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_quantum_event_meeting_moment(TEXT, TEXT, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_quantum_event_meeting_moment_and_participate(
  TEXT, TEXT, TEXT, UUID, JSONB
)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_event_secret_role(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_my_quantum_event_secret_role(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_my_quantum_event_secret_role(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_quantum_event_role_guesses(UUID, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_event_role_guess_state(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_event_room_participants()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_quantum_event_participation()
  TO authenticated;

COMMIT;
