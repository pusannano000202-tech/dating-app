BEGIN;

ALTER TABLE public.quantum_event_room_invites
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE public.quantum_event_room_invites
  DROP CONSTRAINT IF EXISTS quantum_event_room_invites_status_check;
ALTER TABLE public.quantum_event_room_invites
  ADD CONSTRAINT quantum_event_room_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired'));

ALTER TABLE public.quantum_event_room_invites
  DROP CONSTRAINT IF EXISTS quantum_event_room_invites_idempotency_key_check;
ALTER TABLE public.quantum_event_room_invites
  ADD CONSTRAINT quantum_event_room_invites_idempotency_key_check
  CHECK (
    idempotency_key IS NULL
    OR idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS quantum_event_room_invites_idempotency_unique
  ON public.quantum_event_room_invites (inviter_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'match_created', 'match_confirmed', 'match_completed',
    'phone_revealed', 'review_request',
    'friend_request_received', 'meeting_reminder',
    'continuation_choice_request', 'both_continue',
    'partner_paid_zero', 'refund_processed',
    'attendance_confirmed', 'no_show_confirmed',
    'daily_card_available', 'campus_seven_guide',
    'friend_date_proposal', 'friend_date_response',
    'couple_party_invite', 'couple_party_accepted',
    'couple_party_matched', 'couple_party_completed',
    'quantum_event_room_invite'
  ));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_quantum_event_room_invite_payload_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_quantum_event_room_invite_payload_check
  CHECK (
    kind <> 'quantum_event_room_invite'
    OR (
      pg_catalog.jsonb_typeof(payload) = 'object'
      AND payload ?& ARRAY[
        'token', 'event_id', 'event_mode', 'event_title', 'room_label',
        'expires_at', 'inviter_display_name'
      ]
      AND payload - ARRAY[
        'token', 'event_id', 'event_mode', 'event_title', 'room_label',
        'expires_at', 'inviter_display_name'
      ]::TEXT[] = '{}'::JSONB
      AND payload ->> 'token' ~ '^[0-9a-f]{32}$'
      AND payload ->> 'event_mode' IN ('tonight', 'scheduled')
      AND NULLIF(pg_catalog.btrim(payload ->> 'event_id'), '') IS NOT NULL
      AND NULLIF(pg_catalog.btrim(payload ->> 'event_title'), '') IS NOT NULL
      AND NULLIF(pg_catalog.btrim(payload ->> 'room_label'), '') IS NOT NULL
      AND NULLIF(pg_catalog.btrim(payload ->> 'expires_at'), '') IS NOT NULL
      AND NULLIF(pg_catalog.btrim(payload ->> 'inviter_display_name'), '') IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS notifications_quantum_event_room_invite_unique
  ON public.notifications (user_id, kind, ((payload ->> 'token')))
  WHERE kind = 'quantum_event_room_invite';

CREATE TABLE IF NOT EXISTS public.quantum_event_room_card_snapshots (
  occurrence_id UUID NOT NULL
    REFERENCES public.quantum_event_occurrences(id) ON DELETE CASCADE,
  participant_user_id UUID NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,
  event_alias TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  safe_payload JSONB NOT NULL,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (occurrence_id, participant_user_id),
  UNIQUE (occurrence_id, event_alias),
  CHECK (
    pg_catalog.jsonb_typeof(safe_payload) = 'object'
    AND safe_payload ?& ARRAY[
      'intro', 'mbti', 'conversation_energy', 'plan_style', 'interests',
      'music', 'mint_chocolate', 'naengmyeon', 'meetup_role'
    ]
    AND safe_payload - ARRAY[
      'intro', 'mbti', 'conversation_energy', 'plan_style', 'interests',
      'music', 'mint_chocolate', 'naengmyeon', 'meetup_role'
    ]::TEXT[] = '{}'::JSONB
    AND pg_catalog.jsonb_typeof(safe_payload -> 'intro') = 'string'
    AND (safe_payload -> 'mbti' = 'null'::JSONB OR safe_payload ->> 'mbti' IN (
      'ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP',
      'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
    ))
    AND safe_payload ->> 'conversation_energy' IN ('listener', 'balanced', 'talker')
    AND safe_payload ->> 'plan_style' IN ('planned', 'balanced', 'spontaneous')
    AND pg_catalog.jsonb_typeof(safe_payload -> 'interests') = 'array'
    AND pg_catalog.jsonb_array_length(safe_payload -> 'interests') BETWEEN 3 AND 5
    AND (safe_payload -> 'music' = 'null'::JSONB OR pg_catalog.jsonb_typeof(safe_payload -> 'music') = 'string')
    AND (safe_payload -> 'mint_chocolate' = 'null'::JSONB OR safe_payload ->> 'mint_chocolate' IN ('A', 'B'))
    AND (safe_payload -> 'naengmyeon' = 'null'::JSONB OR safe_payload ->> 'naengmyeon' IN ('A', 'B'))
    AND safe_payload ->> 'meetup_role' IN ('question_starter', 'mood_connector', 'good_listener', 'activity_lead')
  )
);

ALTER TABLE public.quantum_event_room_card_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quantum_event_room_card_snapshots
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.quantum_event_room_card_snapshots TO service_role;

CREATE OR REPLACE FUNCTION private.quantum_event_room_people(
  p_occurrence_id UUID
)
RETURNS TABLE (
  participant_user_id UUID,
  gender TEXT,
  school TEXT
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    participation.user_id,
    profile.gender,
    profile.school
  FROM public.quantum_event_participations AS participation
  JOIN public.profiles AS profile ON profile.user_id = participation.user_id
  WHERE participation.occurrence_id = p_occurrence_id
    AND participation.status IN ('recruiting', 'confirmed')
    AND participation.party_type = 'solo'
  UNION
  SELECT
    member.user_id,
    profile.gender,
    profile.school
  FROM public.quantum_event_participations AS participation
  JOIN public.group_members AS member
    ON member.group_id = participation.group_id
   AND member.left_at IS NULL
  JOIN public.profiles AS profile ON profile.user_id = member.user_id
  WHERE participation.occurrence_id = p_occurrence_id
    AND participation.status IN ('recruiting', 'confirmed')
    AND participation.party_type = 'friends';
$$;

REVOKE ALL ON FUNCTION private.quantum_event_room_people(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.expire_quantum_event_room_invites(
  p_now TIMESTAMPTZ DEFAULT pg_catalog.now()
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_expired INTEGER := 0;
BEGIN
  UPDATE public.quantum_event_room_invites
  SET status = 'expired',
      updated_at = p_now
  WHERE status = 'pending'
    AND expires_at <= p_now;

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION private.expire_quantum_event_room_invites(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_event_title(
  p_event_id TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_event_id
    WHEN 'tonight-onsenjjang-run' THEN '온천장 저녁 조깅'
    WHEN 'tonight-board-game' THEN '보드게임 한 판'
    WHEN 'tonight-casual-drinks' THEN '오늘 밤 한잔'
    WHEN 'tonight-late-dinner' THEN '금강공원 밤 산책'
    WHEN 'scheduled-board-game' THEN '보드게임 데이'
    WHEN 'scheduled-jogging' THEN '온천천 천천히 달리기'
    WHEN 'scheduled-dinner' THEN '금강공원 같이 걷기'
    WHEN 'scheduled-walk' THEN '주말 산책'
    ELSE 'Quantum 이벤트'
  END;
$$;

REVOKE ALL ON FUNCTION private.quantum_event_title(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_event_card_section(
  p_content TEXT,
  p_title TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_marker TEXT := '[' || p_title || ']';
  v_start INTEGER;
  v_rest TEXT;
  v_next INTEGER;
BEGIN
  IF p_content IS NULL OR p_title IS NULL THEN
    RETURN NULL;
  END IF;

  v_start := pg_catalog.strpos(p_content, v_marker);
  IF v_start = 0 THEN
    RETURN NULL;
  END IF;

  v_rest := pg_catalog.substr(p_content, v_start + pg_catalog.char_length(v_marker));
  v_next := pg_catalog.strpos(v_rest, E'\n\n[');
  IF v_next > 0 THEN
    v_rest := pg_catalog.substr(v_rest, 1, v_next - 1);
  END IF;

  RETURN NULLIF(pg_catalog.btrim(v_rest), '');
END;
$$;

REVOKE ALL ON FUNCTION private.quantum_event_card_section(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_event_safe_card_text(
  p_value TEXT,
  p_max_length INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_value TEXT := NULLIF(pg_catalog.btrim(p_value), '');
BEGIN
  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_value ~* '(https?://|www\.)'
     OR v_value ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
     OR v_value ~* '(^|[^0-9])01[016789][ -]?[0-9]{3,4}[ -]?[0-9]{4}([^0-9]|$)'
     OR v_value ~* '(^|[[:space:]])@[[:alnum:]_.]{2,}'
     OR v_value ~* '(카카오|카톡|오픈채팅|인스타|instagram|텔레그램|telegram|연락처|전화번호|학번|학과|대학교|대학|학교)' THEN
    RETURN NULL;
  END IF;

  v_value := pg_catalog.regexp_replace(v_value, '[[:cntrl:]]+', ' ', 'g');
  v_value := pg_catalog.regexp_replace(v_value, '[[:space:]]+', ' ', 'g');
  RETURN NULLIF(pg_catalog.left(pg_catalog.btrim(v_value), pg_catalog.greatest(1, p_max_length)), '');
END;
$$;

REVOKE ALL ON FUNCTION private.quantum_event_safe_card_text(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_event_precard_ready(
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT draft.completed_items = 7
      AND pg_catalog.strpos(draft.content_text, 'quantum-precard-b-v1') = 1
    FROM public.pre_match_card_drafts AS draft
    WHERE draft.user_id = p_user_id
  ), false);
$$;

REVOKE ALL ON FUNCTION private.quantum_event_precard_ready(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_event_music_summary(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN p_value ~* '(k[ -]?pop|케이팝|뉴진스|아이브|에스파|르세라핌|아이돌)' THEN 'K-pop'
    WHEN p_value ~* '(hip[ -]?hop|힙합|rap|랩|r&b|알앤비)' THEN '힙합 · R&B'
    WHEN p_value ~* '(rock|록|band|밴드|metal|메탈)' THEN '밴드 · 록'
    WHEN p_value ~* '(indie|인디|잔나비|새소년)' THEN '인디 음악'
    WHEN p_value ~* '(ballad|발라드|ost)' THEN '발라드 · OST'
    WHEN p_value ~* '(jazz|재즈|classic|클래식|연주곡)' THEN '재즈 · 클래식'
    WHEN p_value ~* '(pop|팝)' THEN '팝 음악'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION private.quantum_event_music_summary(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quantum_event_expectation_summary(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN p_value ~* '(운동|달리|조깅|활동|게임|보드게임)' THEN '같이 활동하며 자연스럽게 친해지기'
    WHEN p_value ~* '(새로운|처음|친구|사람.*알)' THEN '새로운 사람을 편하게 알아가기'
    WHEN p_value ~* '(웃|재미|즐겁|유쾌)' THEN '가볍게 웃으며 즐거운 시간 보내기'
    WHEN p_value ~* '(대화|이야기|질문|말)' THEN '부담 없이 대화 시작하기'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION private.quantum_event_expectation_summary(TEXT)
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
  v_content TEXT;
  v_source_updated_at TIMESTAMPTZ;
  v_gender TEXT;
  v_intro_section TEXT;
  v_intro TEXT;
  v_mbti TEXT;
  v_conversation_energy TEXT;
  v_plan_style TEXT;
  v_interests_section TEXT;
  v_interests JSONB := '[]'::JSONB;
  v_music TEXT;
  v_balance TEXT;
  v_mint_chocolate TEXT;
  v_naengmyeon TEXT;
  v_meetup_role TEXT;
  v_alias_number INTEGER;
BEGIN
  IF p_occurrence_id IS NULL OR p_participant_user_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quantum_event_room_card_snapshots AS snapshot
    WHERE snapshot.occurrence_id = p_occurrence_id
      AND snapshot.participant_user_id = p_participant_user_id
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

  SELECT draft.content_text, draft.updated_at
  INTO v_content, v_source_updated_at
  FROM public.pre_match_card_drafts AS draft
  WHERE draft.user_id = p_participant_user_id;

  IF v_content IS NULL OR pg_catalog.strpos(v_content, 'quantum-precard-b-v1') <> 1 THEN
    RETURN;
  END IF;

  v_intro_section := private.quantum_event_card_section(v_content, '나를 보여주는 한 문장');
  v_intro := private.quantum_event_safe_card_text(v_intro_section, 80);
  v_mbti := pg_catalog.upper(private.quantum_event_card_section(v_content, 'MBTI'));
  IF v_mbti = '선택 안 함' OR v_mbti NOT IN (
    'ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP',
    'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
  ) THEN
    v_mbti := NULL;
  END IF;

  v_conversation_energy := private.quantum_event_card_section(v_content, '대화 에너지');
  IF v_conversation_energy NOT IN ('listener', 'balanced', 'talker') THEN
    v_conversation_energy := NULL;
  END IF;

  v_plan_style := private.quantum_event_card_section(v_content, '약속 스타일');
  IF v_plan_style NOT IN ('planned', 'balanced', 'spontaneous') THEN
    v_plan_style := NULL;
  END IF;

  v_interests_section := private.quantum_event_card_section(v_content, '관심사');
  SELECT COALESCE(pg_catalog.jsonb_agg(safe_interest.interest), '[]'::JSONB)
  INTO v_interests
  FROM (
    SELECT private.quantum_event_safe_card_text(split_interest.value, 20) AS interest
    FROM pg_catalog.regexp_split_to_table(COALESCE(v_interests_section, ''), '[[:space:]]*·[[:space:]]*')
      WITH ORDINALITY AS split_interest(value, position)
    ORDER BY split_interest.position
    LIMIT 5
  ) AS safe_interest
  WHERE safe_interest.interest IS NOT NULL;

  v_music := private.quantum_event_safe_card_text(
    private.quantum_event_card_section(v_content, '요즘 가장 자주 듣는 음악'),
    60
  );

  v_balance := private.quantum_event_card_section(v_content, '밸런스 취향');
  v_mint_chocolate := CASE
    WHEN v_balance ~ '(^|;)mint=A(;|$)' THEN 'A'
    WHEN v_balance ~ '(^|;)mint=B(;|$)' THEN 'B'
    ELSE NULL
  END;
  v_naengmyeon := CASE
    WHEN v_balance ~ '(^|;)naengmyeon=A(;|$)' THEN 'A'
    WHEN v_balance ~ '(^|;)naengmyeon=B(;|$)' THEN 'B'
    ELSE NULL
  END;

  v_meetup_role := private.quantum_event_card_section(v_content, '오늘의 역할');
  IF v_meetup_role NOT IN ('question_starter', 'mood_connector', 'good_listener', 'activity_lead') THEN
    v_meetup_role := NULL;
  END IF;

  IF v_intro IS NULL
     OR v_conversation_energy IS NULL
     OR v_plan_style IS NULL
     OR pg_catalog.jsonb_array_length(v_interests) NOT BETWEEN 3 AND 5
     OR v_music IS NULL
     OR v_mint_chocolate IS NULL
     OR v_naengmyeon IS NULL
     OR v_meetup_role IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = p_occurrence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::INTEGER + 1
  INTO v_alias_number
  FROM public.quantum_event_room_card_snapshots AS snapshot
  WHERE snapshot.occurrence_id = p_occurrence_id;

  INSERT INTO public.quantum_event_room_card_snapshots (
    occurrence_id,
    participant_user_id,
    event_alias,
    gender,
    safe_payload,
    source_updated_at
  ) VALUES (
    p_occurrence_id,
    p_participant_user_id,
    '참가자 ' || pg_catalog.chr(64 + v_alias_number),
    v_gender,
    pg_catalog.jsonb_build_object(
      'intro', v_intro,
      'mbti', v_mbti,
      'conversation_energy', v_conversation_energy,
      'plan_style', v_plan_style,
      'interests', v_interests,
      'music', v_music,
      'mint_chocolate', v_mint_chocolate,
      'naengmyeon', v_naengmyeon,
      'meetup_role', v_meetup_role
    ),
    v_source_updated_at
  )
  ON CONFLICT (occurrence_id, participant_user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION private.snapshot_quantum_event_room_member_card(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.handle_quantum_event_room_card_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member RECORD;
BEGIN
  IF NEW.status NOT IN ('recruiting', 'confirmed') OR NEW.occurrence_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.party_type = 'friends' AND NEW.group_id IS NOT NULL THEN
    FOR v_member IN
      SELECT member.user_id
      FROM public.group_members AS member
      WHERE member.group_id = NEW.group_id
        AND member.left_at IS NULL
      ORDER BY member.joined_at, member.user_id
    LOOP
      PERFORM private.snapshot_quantum_event_room_member_card(
        NEW.occurrence_id,
        v_member.user_id
      );
    END LOOP;
  ELSE
    PERFORM private.snapshot_quantum_event_room_member_card(
      NEW.occurrence_id,
      NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.handle_quantum_event_room_card_snapshot()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_quantum_event_room_card_snapshot
  ON public.quantum_event_participations;
CREATE TRIGGER trg_quantum_event_room_card_snapshot
  AFTER INSERT OR UPDATE OF occurrence_id, status, group_id, party_type
  ON public.quantum_event_participations
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_quantum_event_room_card_snapshot();

DROP FUNCTION IF EXISTS public.assign_quantum_event_room(
  TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.assign_quantum_event_room(
  p_event_id TEXT,
  p_event_mode TEXT,
  p_incoming_gender TEXT,
  p_incoming_count INTEGER,
  p_group_id UUID,
  p_now TIMESTAMPTZ DEFAULT pg_catalog.now()
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_seed_id UUID;
  v_seed public.quantum_event_occurrences%ROWTYPE;
  v_room public.quantum_event_occurrences%ROWTYPE;
  v_incoming_user_ids UUID[];
  v_incoming_school TEXT;
  v_distinct_schools INTEGER;
  v_current_male INTEGER;
  v_current_female INTEGER;
  v_reserved_male INTEGER;
  v_reserved_female INTEGER;
  v_next_room_number INTEGER;
  v_room_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_incoming_gender NOT IN ('male', 'female') THEN
    RAISE EXCEPTION 'profile_gender_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_incoming_count < 1 OR p_incoming_count > 3 THEN
    RAISE EXCEPTION 'invalid_party_size' USING ERRCODE = '22023';
  END IF;

  IF p_group_id IS NULL THEN
    IF p_incoming_count <> 1 THEN
      RAISE EXCEPTION 'exact_group_id_required' USING ERRCODE = '22023';
    END IF;
    v_incoming_user_ids := ARRAY[v_caller];
  ELSE
    SELECT pg_catalog.array_agg(member.user_id ORDER BY member.user_id)
    INTO v_incoming_user_ids
    FROM public.group_members AS member
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL;
  END IF;

  IF pg_catalog.cardinality(v_incoming_user_ids) IS DISTINCT FROM p_incoming_count
     OR NOT (v_caller = ANY(v_incoming_user_ids)) THEN
    RAISE EXCEPTION 'invalid_party_members' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    pg_catalog.min(profile.school),
    pg_catalog.count(DISTINCT pg_catalog.lower(pg_catalog.btrim(profile.school)))::INTEGER
  INTO v_incoming_school, v_distinct_schools
  FROM pg_catalog.unnest(v_incoming_user_ids) AS incoming(user_id)
  JOIN public.profiles AS profile ON profile.user_id = incoming.user_id;

  IF NULLIF(pg_catalog.btrim(v_incoming_school), '') IS NULL
     OR v_distinct_schools <> 1 THEN
    RAISE EXCEPTION 'party_school_mismatch' USING ERRCODE = 'P0001';
  END IF;

  v_seed_id := public.get_or_create_quantum_event_occurrence(
    p_event_id,
    p_event_mode,
    p_now
  );

  SELECT occurrence.* INTO v_seed
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = v_seed_id;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id || '|' || v_seed.starts_at::TEXT, 0)
  );
  PERFORM private.expire_quantum_event_room_invites(p_now);

  FOR v_room IN
    SELECT occurrence.*
    FROM public.quantum_event_occurrences AS occurrence
    WHERE occurrence.event_id = p_event_id
      AND occurrence.starts_at = v_seed.starts_at
      AND occurrence.status = 'recruiting'
      AND occurrence.application_closes_at > p_now
    ORDER BY occurrence.room_number
    FOR UPDATE
  LOOP
    IF private.quantum_event_room_has_blocked_pair(v_room.id, v_incoming_user_ids) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM private.quantum_event_room_people(v_room.id) AS room_person
      WHERE pg_catalog.lower(pg_catalog.btrim(room_person.school))
        IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(v_incoming_school))
    ) THEN
      CONTINUE;
    END IF;

    SELECT
      pg_catalog.count(*) FILTER (WHERE room_person.gender = 'male')::INTEGER,
      pg_catalog.count(*) FILTER (WHERE room_person.gender = 'female')::INTEGER
    INTO v_current_male, v_current_female
    FROM private.quantum_event_room_people(v_room.id) AS room_person;

    SELECT
      pg_catalog.count(*) FILTER (WHERE profile.gender = 'male')::INTEGER,
      pg_catalog.count(*) FILTER (WHERE profile.gender = 'female')::INTEGER
    INTO v_reserved_male, v_reserved_female
    FROM public.quantum_event_room_invites AS invite
    JOIN public.profiles AS profile ON profile.user_id = invite.invited_user_id
    WHERE invite.occurrence_id = v_room.id
      AND invite.status = 'pending'
      AND invite.expires_at > p_now;

    IF p_incoming_gender = 'male'
       AND v_current_male + v_reserved_male + p_incoming_count <= v_room.male_capacity THEN
      RETURN v_room.id;
    END IF;
    IF p_incoming_gender = 'female'
       AND v_current_female + v_reserved_female + p_incoming_count <= v_room.female_capacity THEN
      RETURN v_room.id;
    END IF;
  END LOOP;

  SELECT pg_catalog.max(occurrence.room_number) + 1
  INTO v_next_room_number
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.event_id = p_event_id
    AND occurrence.starts_at = v_seed.starts_at;

  v_next_room_number := COALESCE(v_next_room_number, 1);
  IF v_next_room_number > 26 THEN
    RAISE EXCEPTION 'event_room_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.quantum_event_occurrences (
    event_id,
    event_mode,
    starts_at,
    ends_at,
    application_closes_at,
    location_name,
    male_capacity,
    female_capacity,
    required_total,
    status,
    room_number,
    room_code
  ) VALUES (
    v_seed.event_id,
    v_seed.event_mode,
    v_seed.starts_at,
    v_seed.ends_at,
    v_seed.application_closes_at,
    v_seed.location_name,
    v_seed.male_capacity,
    v_seed.female_capacity,
    v_seed.required_total,
    'recruiting',
    v_next_room_number,
    pg_catalog.upper(pg_catalog.substr(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''),
      1,
      6
    ))
  )
  RETURNING id INTO v_room_id;

  RETURN v_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_quantum_event_room(
  TEXT, TEXT, TEXT, INTEGER, UUID, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_my_quantum_event_participation(
  p_event_id TEXT,
  p_event_mode TEXT,
  p_party_type TEXT,
  p_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_group_leader_id UUID;
  v_group_status TEXT;
  v_incoming_gender TEXT;
  v_incoming_count INTEGER := 1;
  v_gender_mismatch_count INTEGER;
  v_school_mismatch_count INTEGER;
  v_occurrence_id UUID;
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_existing public.quantum_event_participations%ROWTYPE;
  v_current_total INTEGER := 0;
  v_current_male INTEGER := 0;
  v_current_female INTEGER := 0;
  v_party_member_conflicts INTEGER := 0;
  active_group_membership RECORD;
  v_member_lock RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum-event-user|' || v_user_id::TEXT, 0)
  );
  IF p_party_type NOT IN ('solo', 'friends') THEN
    RAISE EXCEPTION 'invalid_party_type' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    (p_event_mode = 'tonight' AND p_event_id IN (
      'tonight-onsenjjang-run', 'tonight-board-game',
      'tonight-casual-drinks', 'tonight-late-dinner'
    )) OR
    (p_event_mode = 'scheduled' AND p_event_id IN (
      'scheduled-board-game', 'scheduled-jogging',
      'scheduled-dinner', 'scheduled-walk'
    ))
  ) THEN
    RAISE EXCEPTION 'invalid_event' USING ERRCODE = '22023';
  END IF;
  IF p_party_type = 'solo' AND p_group_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_group_id' USING ERRCODE = '22023';
  END IF;
  IF p_party_type = 'solo' AND NOT private.quantum_event_precard_ready(v_user_id) THEN
    RAISE EXCEPTION 'pre_match_card_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    active_party.user_id AS owner_user_id,
    active_party.group_id,
    active_party.event_id,
    active_party.event_mode
  INTO active_group_membership
  FROM public.quantum_event_participations AS active_party
  JOIN public.group_members AS member
    ON member.group_id = active_party.group_id
   AND member.user_id = v_user_id
   AND member.left_at IS NULL
  WHERE active_party.party_type = 'friends'
    AND active_party.status IN ('recruiting', 'confirmed')
  ORDER BY active_party.updated_at DESC
  LIMIT 1
  FOR UPDATE OF active_party;

  IF FOUND AND active_group_membership.owner_user_id <> v_user_id THEN
    IF p_party_type = 'friends'
       AND active_group_membership.group_id IS NOT DISTINCT FROM p_group_id
       AND active_group_membership.event_id = p_event_id
       AND active_group_membership.event_mode = p_event_mode THEN
      RETURN public.get_my_quantum_event_lifecycle();
    END IF;
    RAISE EXCEPTION 'party_member_already_applied' USING ERRCODE = 'P0001';
  END IF;

  SELECT participation.* INTO v_existing
  FROM public.quantum_event_participations AS participation
  WHERE participation.user_id = v_user_id
  FOR UPDATE;

  IF FOUND AND v_existing.status IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;

  IF p_party_type = 'friends' THEN
    IF p_group_id IS NULL THEN
      RAISE EXCEPTION 'friend_group_required' USING ERRCODE = '22023';
    END IF;

    SELECT group_row.leader_user_id, group_row.status, group_row.gender
    INTO v_group_leader_id, v_group_status, v_incoming_gender
    FROM public.groups AS group_row
    JOIN public.group_members AS mine
      ON mine.group_id = group_row.id
     AND mine.user_id = v_user_id
     AND mine.left_at IS NULL
    WHERE group_row.id = p_group_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'friend_group_required' USING ERRCODE = 'P0001';
    END IF;
    IF v_group_leader_id <> v_user_id THEN
      RAISE EXCEPTION 'friend_group_leader_required' USING ERRCODE = 'P0001';
    END IF;
    IF v_group_status NOT IN ('forming', 'ready') THEN
      RAISE EXCEPTION 'friend_group_not_ready' USING ERRCODE = 'P0001';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER
    INTO v_incoming_count
    FROM public.group_members AS member
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL;

    IF v_incoming_count < 2 OR v_incoming_count > 3 THEN
      RAISE EXCEPTION 'friend_group_member_count' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.group_members AS member
      WHERE member.group_id = p_group_id
        AND member.left_at IS NULL
        AND NOT private.quantum_event_precard_ready(member.user_id)
    ) THEN
      RAISE EXCEPTION 'pre_match_card_required' USING ERRCODE = 'P0001';
    END IF;

    FOR v_member_lock IN
      SELECT member.user_id
      FROM public.group_members AS member
      WHERE member.group_id = p_group_id
        AND member.left_at IS NULL
        AND member.user_id <> v_user_id
      ORDER BY member.user_id
    LOOP
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'quantum-event-user|' || v_member_lock.user_id::TEXT,
          0
        )
      );
    END LOOP;
    IF v_incoming_gender IS NULL OR v_incoming_gender NOT IN ('male', 'female') THEN
      RAISE EXCEPTION 'friend_group_gender_mismatch' USING ERRCODE = 'P0001';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER
    INTO v_gender_mismatch_count
    FROM public.group_members AS member
    LEFT JOIN public.profiles AS profile ON profile.user_id = member.user_id
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL
      AND profile.gender IS DISTINCT FROM v_incoming_gender;

    IF v_gender_mismatch_count > 0 THEN
      RAISE EXCEPTION 'friend_group_gender_mismatch' USING ERRCODE = 'P0001';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER
    INTO v_school_mismatch_count
    FROM public.group_members AS member
    LEFT JOIN public.profiles AS profile ON profile.user_id = member.user_id
    JOIN public.profiles AS caller_profile ON caller_profile.user_id = v_user_id
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL
      AND pg_catalog.lower(pg_catalog.btrim(profile.school))
        IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(caller_profile.school));

    IF v_school_mismatch_count > 0 THEN
      RAISE EXCEPTION 'party_school_mismatch' USING ERRCODE = 'P0001';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER
    INTO v_party_member_conflicts
    FROM public.group_members AS member
    JOIN public.quantum_event_participations AS participation
      ON participation.user_id = member.user_id
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL
      AND member.user_id <> v_user_id
      AND participation.status IN ('recruiting', 'confirmed');

    IF v_party_member_conflicts > 0 THEN
      RAISE EXCEPTION 'party_member_already_applied' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT profile.gender
    INTO v_incoming_gender
    FROM public.profiles AS profile
    WHERE profile.user_id = v_user_id
      AND NULLIF(pg_catalog.btrim(profile.school), '') IS NOT NULL;

    IF v_incoming_gender IS NULL OR v_incoming_gender NOT IN ('male', 'female') THEN
      RAISE EXCEPTION 'profile_gender_required' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_existing.user_id IS NOT NULL
     AND v_existing.status = 'recruiting'
     AND v_existing.event_id = p_event_id
     AND v_existing.event_mode = p_event_mode
     AND v_existing.party_type = p_party_type
     AND v_existing.group_id IS NOT DISTINCT FROM p_group_id
     AND v_existing.occurrence_id IS NOT NULL THEN
    RETURN public.get_my_quantum_event_lifecycle();
  END IF;

  v_occurrence_id := public.assign_quantum_event_room(
    p_event_id,
    p_event_mode,
    v_incoming_gender,
    v_incoming_count,
    p_group_id,
    pg_catalog.now()
  );

  SELECT occurrence.* INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = v_occurrence_id
  FOR UPDATE;

  IF v_occurrence.status <> 'recruiting' THEN
    RAISE EXCEPTION 'event_not_recruiting' USING ERRCODE = 'P0001';
  END IF;
  IF pg_catalog.now() >= v_occurrence.application_closes_at THEN
    RAISE EXCEPTION 'application_closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (WHERE room_person.gender = 'male')::INTEGER,
    pg_catalog.count(*) FILTER (WHERE room_person.gender = 'female')::INTEGER
  INTO v_current_total, v_current_male, v_current_female
  FROM private.quantum_event_room_people(v_occurrence_id) AS room_person
  WHERE NOT (room_person.participant_user_id = ANY(
    CASE
      WHEN p_group_id IS NULL THEN ARRAY[v_user_id]
      ELSE ARRAY(
        SELECT member.user_id
        FROM public.group_members AS member
        WHERE member.group_id = p_group_id AND member.left_at IS NULL
      )
    END
  ));

  IF v_current_total + v_incoming_count > v_occurrence.required_total THEN
    RAISE EXCEPTION 'event_full' USING ERRCODE = 'P0001';
  END IF;
  IF v_incoming_gender = 'male'
     AND v_current_male + v_incoming_count > v_occurrence.male_capacity THEN
    RAISE EXCEPTION 'gender_capacity_full' USING ERRCODE = 'P0001';
  END IF;
  IF v_incoming_gender = 'female'
     AND v_current_female + v_incoming_count > v_occurrence.female_capacity THEN
    RAISE EXCEPTION 'gender_capacity_full' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.quantum_event_participations (
    user_id,
    event_id,
    event_mode,
    party_type,
    group_id,
    occurrence_id,
    status,
    match_id,
    cancel_reason,
    completed_at
  ) VALUES (
    v_user_id,
    p_event_id,
    p_event_mode,
    p_party_type,
    p_group_id,
    v_occurrence_id,
    'recruiting',
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET event_id = EXCLUDED.event_id,
      event_mode = EXCLUDED.event_mode,
      party_type = EXCLUDED.party_type,
      group_id = EXCLUDED.group_id,
      occurrence_id = EXCLUDED.occurrence_id,
      status = 'recruiting',
      match_id = NULL,
      cancel_reason = NULL,
      completed_at = NULL,
      updated_at = pg_catalog.now()
  WHERE public.quantum_event_participations.status IN ('recruiting', 'cancelled');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;

  RETURN public.get_my_quantum_event_lifecycle();
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_quantum_event_participation(
  TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_quantum_event_participation(
  TEXT, TEXT, TEXT, UUID
) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_my_quantum_event_participation()
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_status TEXT;
  v_cancelled BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum-event-user|' || v_user_id::TEXT, 0)
  );

  PERFORM private.expire_quantum_event_room_invites(pg_catalog.now());

  SELECT participation.status
  INTO v_status
  FROM public.quantum_event_participations AS participation
  WHERE participation.user_id = v_user_id
  FOR UPDATE;

  IF FOUND AND v_status IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;

  IF FOUND AND v_status = 'recruiting' THEN
    UPDATE public.quantum_event_participations
    SET status = 'cancelled',
        cancel_reason = 'user_cancelled',
        updated_at = pg_catalog.now()
    WHERE user_id = v_user_id
      AND status = 'recruiting';
    v_cancelled := FOUND;
  END IF;

  UPDATE public.quantum_event_room_invites AS invite
  SET status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE (
      invite.inviter_user_id = v_user_id
      OR invite.invited_user_id = v_user_id
    )
    AND invite.status IN ('pending', 'accepted');

  UPDATE public.notifications AS notification
  SET read_at = COALESCE(notification.read_at, pg_catalog.now())
  WHERE notification.kind = 'quantum_event_room_invite'
    AND notification.payload ->> 'token' IN (
      SELECT invite.token
      FROM public.quantum_event_room_invites AS invite
      WHERE invite.inviter_user_id = v_user_id
         OR invite.invited_user_id = v_user_id
    );

  RETURN v_cancelled;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_my_quantum_event_participation()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_quantum_event_participation()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_quantum_event_room_invite_candidates()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_occurrence_id UUID;
  v_gender TEXT;
  v_school TEXT;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM private.expire_quantum_event_room_invites(pg_catalog.now());

  SELECT participation.occurrence_id, profile.gender, profile.school
  INTO v_occurrence_id, v_gender, v_school
  FROM public.quantum_event_participations AS participation
  JOIN public.profiles AS profile ON profile.user_id = participation.user_id
  WHERE participation.user_id = v_user_id
    AND participation.status = 'recruiting'
    AND participation.party_type = 'solo';

  IF v_occurrence_id IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  WITH active_friends AS (
    SELECT CASE
      WHEN friendship.user_id = v_user_id THEN friendship.friend_user_id
      ELSE friendship.user_id
    END AS friend_user_id
    FROM public.friendships AS friendship
    WHERE friendship.status = 'active'
      AND (
        friendship.user_id = v_user_id
        OR friendship.friend_user_id = v_user_id
      )
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'user_id', profile.user_id,
      'display_name', COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''), '친구'),
      'avatar_url', NULL
    ) ORDER BY profile.display_name, profile.user_id
  ), '[]'::JSONB)
  INTO v_result
  FROM active_friends
  JOIN public.profiles AS profile ON profile.user_id = active_friends.friend_user_id
  WHERE profile.gender = v_gender
    AND pg_catalog.lower(pg_catalog.btrim(profile.school))
      = pg_catalog.lower(pg_catalog.btrim(v_school))
    AND NOT EXISTS (
      SELECT 1
      FROM public.quantum_event_participations AS participation
      WHERE participation.user_id = profile.user_id
        AND participation.status IN ('recruiting', 'confirmed')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.quantum_event_room_invites AS invite
      WHERE invite.invited_user_id = profile.user_id
        AND invite.status = 'pending'
        AND invite.expires_at > pg_catalog.now()
    );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_quantum_event_room_invite_candidates()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quantum_event_room_invite_candidates()
  TO authenticated;

DROP FUNCTION IF EXISTS public.create_quantum_event_room_invite(UUID);

CREATE OR REPLACE FUNCTION public.create_quantum_event_room_invite(
  p_invited_user_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_participation public.quantum_event_participations%ROWTYPE;
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_invite public.quantum_event_room_invites%ROWTYPE;
  v_existing public.quantum_event_room_invites%ROWTYPE;
  v_inviter_gender TEXT;
  v_friend_gender TEXT;
  v_inviter_school TEXT;
  v_friend_school TEXT;
  v_inviter_display_name TEXT;
  v_current_gender_count INTEGER := 0;
  v_reserved_gender_count INTEGER := 0;
  v_gender_capacity INTEGER;
  v_key TEXT := NULLIF(pg_catalog.btrim(p_idempotency_key), '');
  v_previous_notifications_guard TEXT :=
    pg_catalog.current_setting('app.bypass_notifications_guard', TRUE);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_invited_user_id IS NULL OR p_invited_user_id = v_user_id THEN
    RAISE EXCEPTION 'invalid_friend' USING ERRCODE = '22023';
  END IF;
  IF v_key IS NOT NULL AND v_key !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'quantum-event-user|' || LEAST(v_user_id::TEXT, p_invited_user_id::TEXT),
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'quantum-event-user|' || GREATEST(v_user_id::TEXT, p_invited_user_id::TEXT),
      0
    )
  );

  PERFORM private.expire_quantum_event_room_invites(pg_catalog.now());

  SELECT participation.* INTO v_participation
  FROM public.quantum_event_participations AS participation
  WHERE participation.user_id = v_user_id
    AND participation.status = 'recruiting'
    AND participation.party_type = 'solo'
  FOR UPDATE;

  IF NOT FOUND OR v_participation.occurrence_id IS NULL THEN
    RAISE EXCEPTION 'active_solo_room_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT occurrence.* INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = v_participation.occurrence_id
  FOR UPDATE;

  IF NOT FOUND OR v_occurrence.status <> 'recruiting'
     OR v_occurrence.application_closes_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'application_closed' USING ERRCODE = 'P0001';
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT invite.* INTO v_existing
    FROM public.quantum_event_room_invites AS invite
    WHERE invite.inviter_user_id = v_user_id
      AND invite.idempotency_key = v_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing.invited_user_id <> p_invited_user_id
         OR v_existing.occurrence_id <> v_occurrence.id THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
      END IF;
      IF v_existing.status = 'pending'
         AND v_existing.expires_at > pg_catalog.now() THEN
        RETURN pg_catalog.jsonb_build_object(
          'token', v_existing.token,
          'event_id', v_participation.event_id,
          'event_mode', v_participation.event_mode,
          'room_number', v_occurrence.room_number,
          'room_label', public.quantum_event_room_label(v_occurrence.room_number),
          'room_code', v_occurrence.room_code,
          'expires_at', v_existing.expires_at,
          'status', v_existing.status,
          'invited_user_id', v_existing.invited_user_id
        );
      END IF;
      RAISE EXCEPTION 'idempotency_replayed_terminal' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships AS friendship
    WHERE friendship.user_id = LEAST(v_user_id, p_invited_user_id)
      AND friendship.friend_user_id = GREATEST(v_user_id, p_invited_user_id)
      AND friendship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_friendship_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT profile.gender, profile.school, profile.display_name
  INTO v_inviter_gender, v_inviter_school, v_inviter_display_name
  FROM public.profiles AS profile
  WHERE profile.user_id = v_user_id;

  SELECT profile.gender, profile.school
  INTO v_friend_gender, v_friend_school
  FROM public.profiles AS profile
  WHERE profile.user_id = p_invited_user_id;

  IF v_inviter_gender NOT IN ('male', 'female') OR v_friend_gender IS NULL THEN
    RAISE EXCEPTION 'profile_gender_required' USING ERRCODE = 'P0001';
  END IF;
  IF v_friend_gender <> v_inviter_gender THEN
    RAISE EXCEPTION 'friend_gender_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF NULLIF(pg_catalog.btrim(v_inviter_school), '') IS NULL
     OR pg_catalog.lower(pg_catalog.btrim(v_friend_school))
       IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(v_inviter_school)) THEN
    RAISE EXCEPTION 'friend_school_mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quantum_event_participations AS participation
    WHERE participation.user_id = p_invited_user_id
      AND participation.status IN ('recruiting', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'friend_already_participating' USING ERRCODE = 'P0001';
  END IF;

  SELECT invite.* INTO v_existing
  FROM public.quantum_event_room_invites AS invite
  WHERE invite.occurrence_id = v_occurrence.id
    AND invite.inviter_user_id = v_user_id
    AND invite.invited_user_id = p_invited_user_id
    AND invite.status = 'pending'
    AND invite.expires_at > pg_catalog.now()
  FOR UPDATE;

  IF FOUND THEN
    IF v_key IS NOT NULL AND v_existing.idempotency_key IS NULL THEN
      UPDATE public.quantum_event_room_invites
      SET idempotency_key = v_key,
          updated_at = pg_catalog.now()
      WHERE id = v_existing.id
      RETURNING * INTO v_existing;
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'token', v_existing.token,
      'event_id', v_participation.event_id,
      'event_mode', v_participation.event_mode,
      'room_number', v_occurrence.room_number,
      'room_label', public.quantum_event_room_label(v_occurrence.room_number),
      'room_code', v_occurrence.room_code,
      'expires_at', v_existing.expires_at,
      'status', v_existing.status,
      'invited_user_id', v_existing.invited_user_id
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quantum_event_room_invites AS invite
    WHERE invite.invited_user_id = p_invited_user_id
      AND invite.status = 'pending'
      AND invite.expires_at > pg_catalog.now()
  ) THEN
    RAISE EXCEPTION 'friend_invite_pending' USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_current_gender_count
  FROM private.quantum_event_room_people(v_occurrence.id) AS room_person
  WHERE room_person.gender = v_friend_gender;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_reserved_gender_count
  FROM public.quantum_event_room_invites AS invite
  JOIN public.profiles AS profile ON profile.user_id = invite.invited_user_id
  WHERE invite.occurrence_id = v_occurrence.id
    AND invite.status = 'pending'
    AND invite.expires_at > pg_catalog.now()
    AND profile.gender = v_friend_gender;

  v_gender_capacity := CASE
    WHEN v_friend_gender = 'male' THEN v_occurrence.male_capacity
    ELSE v_occurrence.female_capacity
  END;
  IF v_current_gender_count + v_reserved_gender_count + 1 > v_gender_capacity THEN
    RAISE EXCEPTION 'friend_room_full' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.quantum_event_room_invites (
    occurrence_id,
    inviter_user_id,
    invited_user_id,
    idempotency_key
  ) VALUES (
    v_occurrence.id,
    v_user_id,
    p_invited_user_id,
    v_key
  )
  RETURNING * INTO v_invite;

  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO public.notifications (user_id, kind, payload)
  VALUES (
    p_invited_user_id,
    'quantum_event_room_invite',
    pg_catalog.jsonb_build_object(
      'token', v_invite.token,
      'event_id', v_participation.event_id,
      'event_mode', v_participation.event_mode,
      'event_title', private.quantum_event_title(v_participation.event_id),
      'room_label', public.quantum_event_room_label(v_occurrence.room_number),
      'expires_at', v_invite.expires_at,
      'inviter_display_name', COALESCE(
        NULLIF(pg_catalog.btrim(v_inviter_display_name), ''),
        '친구'
      )
    )
  )
  ON CONFLICT DO NOTHING;
  PERFORM pg_catalog.set_config(
    'app.bypass_notifications_guard',
    COALESCE(v_previous_notifications_guard, ''),
    TRUE
  );

  RETURN pg_catalog.jsonb_build_object(
    'token', v_invite.token,
    'event_id', v_participation.event_id,
    'event_mode', v_participation.event_mode,
    'room_number', v_occurrence.room_number,
    'room_label', public.quantum_event_room_label(v_occurrence.room_number),
    'room_code', v_occurrence.room_code,
    'expires_at', v_invite.expires_at,
    'status', v_invite.status,
    'invited_user_id', v_invite.invited_user_id
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_catalog.set_config(
      'app.bypass_notifications_guard',
      COALESCE(v_previous_notifications_guard, ''),
      TRUE
    );
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_quantum_event_room_invite(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quantum_event_room_invite(UUID, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_quantum_event_room_invites()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
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

  PERFORM private.expire_quantum_event_room_invites(pg_catalog.now());

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'token', invite.token,
      'role', CASE WHEN invite.inviter_user_id = v_user_id THEN 'inviter' ELSE 'invitee' END,
      'counterpart_user_id', CASE
        WHEN invite.inviter_user_id = v_user_id THEN invite.invited_user_id
        ELSE invite.inviter_user_id
      END,
      'counterpart_display_name', COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''), '친구'),
      'event_id', occurrence.event_id,
      'event_mode', occurrence.event_mode,
      'room_number', occurrence.room_number,
      'room_label', public.quantum_event_room_label(occurrence.room_number),
      'room_code', occurrence.room_code,
      'status', invite.status,
      'expires_at', invite.expires_at
    ) ORDER BY invite.created_at DESC
  ), '[]'::JSONB)
  INTO v_result
  FROM public.quantum_event_room_invites AS invite
  JOIN public.quantum_event_occurrences AS occurrence
    ON occurrence.id = invite.occurrence_id
  LEFT JOIN public.profiles AS profile ON profile.user_id = CASE
    WHEN invite.inviter_user_id = v_user_id THEN invite.invited_user_id
    ELSE invite.inviter_user_id
  END
  WHERE (invite.inviter_user_id = v_user_id OR invite.invited_user_id = v_user_id)
    AND invite.status IN ('pending', 'accepted')
    AND (invite.status = 'accepted' OR invite.expires_at > pg_catalog.now());

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_quantum_event_room_invites()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_event_room_invites()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_quantum_event_room_invite(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite public.quantum_event_room_invites%ROWTYPE;
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_existing public.quantum_event_participations%ROWTYPE;
  v_inviter_gender TEXT;
  v_invitee_gender TEXT;
  v_inviter_school TEXT;
  v_invitee_school TEXT;
  v_current_gender_count INTEGER := 0;
  v_reserved_gender_count INTEGER := 0;
  v_gender_capacity INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid_invite' USING ERRCODE = '22023';
  END IF;
  IF NOT private.quantum_event_precard_ready(v_user_id) THEN
    RAISE EXCEPTION 'pre_match_card_required' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum-event-user|' || v_user_id::TEXT, 0)
  );

  PERFORM private.expire_quantum_event_room_invites(pg_catalog.now());

  SELECT invite.* INTO v_invite
  FROM public.quantum_event_room_invites AS invite
  WHERE invite.token = p_token
    AND invite.invited_user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.status = 'accepted' THEN
    RETURN public.get_my_quantum_event_lifecycle();
  END IF;
  IF v_invite.status IN ('declined', 'cancelled', 'expired')
     OR v_invite.expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'invite_expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT occurrence.* INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = v_invite.occurrence_id
  FOR UPDATE;

  IF NOT FOUND OR v_occurrence.status <> 'recruiting'
     OR v_occurrence.application_closes_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'application_closed' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships AS friendship
    WHERE friendship.user_id = LEAST(v_invite.inviter_user_id, v_user_id)
      AND friendship.friend_user_id = GREATEST(v_invite.inviter_user_id, v_user_id)
      AND friendship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_friendship_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT profile.gender, profile.school
  INTO v_inviter_gender, v_inviter_school
  FROM public.profiles AS profile
  WHERE profile.user_id = v_invite.inviter_user_id;
  SELECT profile.gender, profile.school
  INTO v_invitee_gender, v_invitee_school
  FROM public.profiles AS profile
  WHERE profile.user_id = v_user_id;

  IF v_invitee_gender IS NULL OR v_invitee_gender <> v_inviter_gender THEN
    RAISE EXCEPTION 'friend_gender_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF pg_catalog.lower(pg_catalog.btrim(v_invitee_school))
     IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(v_inviter_school)) THEN
    RAISE EXCEPTION 'friend_school_mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT participation.* INTO v_existing
  FROM public.quantum_event_participations AS participation
  WHERE participation.user_id = v_user_id
  FOR UPDATE;

  IF FOUND AND v_existing.status IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;
  IF FOUND AND v_existing.status = 'recruiting'
     AND v_existing.occurrence_id <> v_occurrence.id THEN
    RAISE EXCEPTION 'active_event_conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_current_gender_count
  FROM private.quantum_event_room_people(v_occurrence.id) AS room_person
  WHERE room_person.gender = v_invitee_gender
    AND room_person.participant_user_id <> v_user_id;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_reserved_gender_count
  FROM public.quantum_event_room_invites AS invite
  JOIN public.profiles AS profile ON profile.user_id = invite.invited_user_id
  WHERE invite.occurrence_id = v_occurrence.id
    AND invite.id <> v_invite.id
    AND invite.status = 'pending'
    AND invite.expires_at > pg_catalog.now()
    AND profile.gender = v_invitee_gender;

  v_gender_capacity := CASE
    WHEN v_invitee_gender = 'male' THEN v_occurrence.male_capacity
    ELSE v_occurrence.female_capacity
  END;
  IF v_current_gender_count + v_reserved_gender_count + 1 > v_gender_capacity THEN
    RAISE EXCEPTION 'friend_room_full' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.quantum_event_participations (
    user_id, event_id, event_mode, party_type, group_id, occurrence_id,
    status, match_id, cancel_reason, completed_at
  ) VALUES (
    v_user_id, v_occurrence.event_id, v_occurrence.event_mode, 'solo', NULL,
    v_occurrence.id, 'recruiting', NULL, NULL, NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET event_id = EXCLUDED.event_id,
      event_mode = EXCLUDED.event_mode,
      party_type = 'solo',
      group_id = NULL,
      occurrence_id = EXCLUDED.occurrence_id,
      status = 'recruiting',
      match_id = NULL,
      cancel_reason = NULL,
      completed_at = NULL,
      updated_at = pg_catalog.now()
  WHERE public.quantum_event_participations.status IN ('recruiting', 'cancelled');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.quantum_event_room_invites AS invite
  SET status = 'accepted',
      accepted_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE invite.id = v_invite.id;

  UPDATE public.quantum_event_room_invites AS invite
  SET status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE invite.invited_user_id = v_user_id
    AND invite.id <> v_invite.id
    AND invite.status = 'pending';

  UPDATE public.notifications AS notification
  SET read_at = COALESCE(notification.read_at, pg_catalog.now())
  WHERE notification.user_id = v_user_id
    AND notification.kind = 'quantum_event_room_invite'
    AND notification.payload ->> 'token' = v_invite.token;

  PERFORM private.snapshot_quantum_event_room_member_card(v_occurrence.id, v_user_id);
  RETURN public.get_my_quantum_event_lifecycle();
END;
$$;

REVOKE ALL ON FUNCTION public.accept_quantum_event_room_invite(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_quantum_event_room_invite(TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_quantum_event_room_invite(
  p_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite public.quantum_event_room_invites%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid_invite' USING ERRCODE = '22023';
  END IF;

  PERFORM private.expire_quantum_event_room_invites(pg_catalog.now());
  SELECT invite.* INTO v_invite
  FROM public.quantum_event_room_invites AS invite
  WHERE invite.token = p_token
    AND invite.invited_user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.status = 'declined' THEN
    RETURN TRUE;
  END IF;
  IF v_invite.status = 'accepted' THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.status IN ('cancelled', 'expired') THEN
    RETURN FALSE;
  END IF;

  UPDATE public.quantum_event_room_invites AS invite
  SET status = 'declined',
      declined_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE invite.id = v_invite.id
    AND invite.status = 'pending';

  UPDATE public.notifications AS notification
  SET read_at = COALESCE(notification.read_at, pg_catalog.now())
  WHERE notification.user_id = v_user_id
    AND notification.kind = 'quantum_event_room_invite'
    AND notification.payload ->> 'token' = p_token;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_quantum_event_room_invite(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_quantum_event_room_invite(TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_quantum_event_room_invite(
  p_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite public.quantum_event_room_invites%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid_invite' USING ERRCODE = '22023';
  END IF;

  PERFORM private.expire_quantum_event_room_invites(pg_catalog.now());
  SELECT invite.* INTO v_invite
  FROM public.quantum_event_room_invites AS invite
  WHERE invite.token = p_token
    AND invite.inviter_user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.status = 'cancelled' THEN
    RETURN TRUE;
  END IF;
  IF v_invite.status = 'accepted' THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.status IN ('declined', 'expired') THEN
    RETURN FALSE;
  END IF;

  UPDATE public.quantum_event_room_invites AS invite
  SET status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE invite.id = v_invite.id
    AND invite.status = 'pending';

  UPDATE public.notifications AS notification
  SET read_at = COALESCE(notification.read_at, pg_catalog.now())
  WHERE notification.user_id = v_invite.invited_user_id
    AND notification.kind = 'quantum_event_room_invite'
    AND notification.payload ->> 'token' = p_token;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_quantum_event_room_invite(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_quantum_event_room_invite(TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_quantum_event_rooms(
  p_event_id TEXT,
  p_event_mode TEXT
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
  v_starts_at TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT member_room.occurrence_id, occurrence.starts_at
  INTO v_occurrence_id, v_starts_at
  FROM (
    SELECT participation.occurrence_id
    FROM public.quantum_event_participations AS participation
    WHERE participation.user_id = v_user_id
      AND participation.event_id = p_event_id
      AND participation.event_mode = p_event_mode
      AND participation.status IN ('recruiting', 'confirmed')
    UNION
    SELECT participation.occurrence_id
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id
     AND member.user_id = v_user_id
     AND member.left_at IS NULL
    WHERE participation.event_id = p_event_id
      AND participation.event_mode = p_event_mode
      AND participation.status IN ('recruiting', 'confirmed')
  ) AS member_room
  JOIN public.quantum_event_occurrences AS occurrence
    ON occurrence.id = member_room.occurrence_id
  LIMIT 1;

  IF v_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'room_membership_required' USING ERRCODE = '42501';
  END IF;

  WITH people_counts AS (
    SELECT
      occurrence.id AS occurrence_id,
      pg_catalog.count(room_person.participant_user_id)::INTEGER AS total,
      pg_catalog.count(room_person.participant_user_id)
        FILTER (WHERE room_person.gender = 'male')::INTEGER AS male,
      pg_catalog.count(room_person.participant_user_id)
        FILTER (WHERE room_person.gender = 'female')::INTEGER AS female
    FROM public.quantum_event_occurrences AS occurrence
    LEFT JOIN LATERAL private.quantum_event_room_people(occurrence.id)
      AS room_person ON TRUE
    WHERE occurrence.event_id = p_event_id
      AND occurrence.event_mode = p_event_mode
      AND occurrence.starts_at = v_starts_at
    GROUP BY occurrence.id
  ), reservation_counts AS (
    SELECT
      invite.occurrence_id,
      pg_catalog.count(*)::INTEGER AS total,
      pg_catalog.count(*) FILTER (WHERE profile.gender = 'male')::INTEGER AS male,
      pg_catalog.count(*) FILTER (WHERE profile.gender = 'female')::INTEGER AS female
    FROM public.quantum_event_room_invites AS invite
    JOIN public.profiles AS profile ON profile.user_id = invite.invited_user_id
    WHERE invite.status = 'pending'
      AND invite.expires_at > pg_catalog.now()
    GROUP BY invite.occurrence_id
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'occurrence_id', occurrence.id,
      'room_number', occurrence.room_number,
      'room_label', public.quantum_event_room_label(occurrence.room_number),
      'room_code', occurrence.room_code,
      'total', COALESCE(people_counts.total, 0),
      'male', COALESCE(people_counts.male, 0),
      'female', COALESCE(people_counts.female, 0),
      'reserved_total', COALESCE(reservation_counts.total, 0),
      'reserved_male', COALESCE(reservation_counts.male, 0),
      'reserved_female', COALESCE(reservation_counts.female, 0),
      'required_total', occurrence.required_total,
      'male_capacity', occurrence.male_capacity,
      'female_capacity', occurrence.female_capacity,
      'is_my_room', occurrence.id = v_occurrence_id
    ) ORDER BY occurrence.room_number
  ), '[]'::JSONB)
  INTO v_result
  FROM public.quantum_event_occurrences AS occurrence
  LEFT JOIN people_counts ON people_counts.occurrence_id = occurrence.id
  LEFT JOIN reservation_counts ON reservation_counts.occurrence_id = occurrence.id
  WHERE occurrence.event_id = p_event_id
    AND occurrence.event_mode = p_event_mode
    AND occurrence.starts_at = v_starts_at
    AND occurrence.status IN ('recruiting', 'confirmed');

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_quantum_event_rooms(TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_quantum_event_rooms(TEXT, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_quantum_event_room_participants()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_occurrence_id UUID;
  v_caller_school TEXT;
  v_school_mismatch_count INTEGER := 0;
  v_member RECORD;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT room_membership.occurrence_id
  INTO v_occurrence_id
  FROM (
    SELECT participation.occurrence_id
    FROM public.quantum_event_participations AS participation
    WHERE participation.user_id = v_user_id
      AND participation.status IN ('recruiting', 'confirmed')
    UNION
    SELECT participation.occurrence_id
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id
     AND member.user_id = v_user_id
     AND member.left_at IS NULL
    WHERE participation.status IN ('recruiting', 'confirmed')
  ) AS room_membership
  LIMIT 1;

  IF v_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'room_membership_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.school INTO v_caller_school
  FROM public.profiles AS profile
  WHERE profile.user_id = v_user_id;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_school_mismatch_count
  FROM private.quantum_event_room_people(v_occurrence_id) AS room_person
  WHERE pg_catalog.lower(pg_catalog.btrim(room_person.school))
    IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(v_caller_school));

  IF v_school_mismatch_count > 0 THEN
    RAISE EXCEPTION 'room_school_mismatch' USING ERRCODE = '42501';
  END IF;

  FOR v_member IN
    SELECT room_person.participant_user_id
    FROM private.quantum_event_room_people(v_occurrence_id) AS room_person
    ORDER BY room_person.participant_user_id
  LOOP
    PERFORM private.snapshot_quantum_event_room_member_card(
      v_occurrence_id,
      v_member.participant_user_id
    );
  END LOOP;

  WITH caller_participation AS (
    SELECT participation.group_id, participation.party_type
    FROM public.quantum_event_participations AS participation
    WHERE participation.user_id = v_user_id
      AND participation.occurrence_id = v_occurrence_id
      AND participation.status IN ('recruiting', 'confirmed')
    UNION ALL
    SELECT participation.group_id, participation.party_type
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id
     AND member.user_id = v_user_id
     AND member.left_at IS NULL
    WHERE participation.occurrence_id = v_occurrence_id
      AND participation.status IN ('recruiting', 'confirmed')
    LIMIT 1
  ), my_party AS (
    SELECT v_user_id AS participant_user_id
    UNION
    SELECT member.user_id
    FROM caller_participation
    JOIN public.group_members AS member
      ON member.group_id = caller_participation.group_id
     AND member.left_at IS NULL
    WHERE caller_participation.party_type = 'friends'
    UNION
    SELECT CASE
      WHEN invite.inviter_user_id = v_user_id THEN invite.invited_user_id
      ELSE invite.inviter_user_id
    END
    FROM public.quantum_event_room_invites AS invite
    WHERE invite.occurrence_id = v_occurrence_id
      AND invite.status = 'accepted'
      AND (invite.inviter_user_id = v_user_id OR invite.invited_user_id = v_user_id)
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'alias', snapshot.event_alias,
      'gender', snapshot.gender,
      'preference_card', snapshot.safe_payload
    ) ORDER BY snapshot.event_alias
  ), '[]'::JSONB)
  INTO v_result
  FROM public.quantum_event_room_card_snapshots AS snapshot
  WHERE snapshot.occurrence_id = v_occurrence_id
    AND snapshot.participant_user_id NOT IN (
      SELECT my_party.participant_user_id FROM my_party
    )
    AND EXISTS (
      SELECT 1
      FROM private.quantum_event_room_people(v_occurrence_id) AS active_member
      WHERE active_member.participant_user_id = snapshot.participant_user_id
    );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_quantum_event_room_participants()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_event_room_participants()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_quantum_event_lifecycle()
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

  WITH selected_participation AS (
    SELECT candidate.*
    FROM (
      SELECT participation.*, CASE
        WHEN participation.status IN ('recruiting', 'confirmed') THEN 1
        WHEN participation.status = 'completed' THEN 2
        ELSE 4
      END AS viewer_priority
      FROM public.quantum_event_participations AS participation
      WHERE participation.user_id = v_user_id
      UNION ALL
      SELECT participation.*, 0 AS viewer_priority
      FROM public.quantum_event_participations AS participation
      JOIN public.group_members AS member
        ON member.group_id = participation.group_id
       AND member.user_id = v_user_id
       AND member.left_at IS NULL
      WHERE participation.party_type = 'friends'
        AND participation.status IN ('recruiting', 'confirmed')
    ) AS candidate
    ORDER BY candidate.viewer_priority, candidate.updated_at DESC
    LIMIT 1
  ), mine AS (
    SELECT
      selected_participation.*,
      COALESCE(active_meeting.scheduled_start, occurrence.starts_at) AS starts_at,
      COALESCE(active_meeting.scheduled_end, occurrence.ends_at) AS ends_at,
      COALESCE(active_meeting.venue_name, occurrence.location_name) AS location_name,
      occurrence.required_total,
      occurrence.room_number,
      occurrence.room_code
    FROM selected_participation
    JOIN public.quantum_event_occurrences AS occurrence
      ON occurrence.id = selected_participation.occurrence_id
    LEFT JOIN LATERAL (
      SELECT meeting.scheduled_start, meeting.scheduled_end, venue.name AS venue_name
      FROM public.match_meetings AS meeting
      LEFT JOIN public.venues AS venue ON venue.id = meeting.venue_id
      WHERE meeting.match_id = selected_participation.match_id
        AND meeting.status = 'scheduled'
      ORDER BY meeting.scheduled_start, meeting.id
      LIMIT 1
    ) AS active_meeting ON TRUE
  ), occurrence_people AS (
    SELECT room_person.participant_user_id AS user_id, room_person.gender
    FROM mine
    JOIN LATERAL private.quantum_event_room_people(mine.occurrence_id)
      AS room_person ON TRUE
  ), my_party AS (
    SELECT v_user_id AS user_id
    UNION
    SELECT member.user_id
    FROM mine
    JOIN public.group_members AS member
      ON member.group_id = mine.group_id
     AND member.left_at IS NULL
    WHERE mine.party_type = 'friends'
    UNION
    SELECT CASE
      WHEN invite.inviter_user_id = v_user_id THEN invite.invited_user_id
      ELSE invite.inviter_user_id
    END
    FROM mine
    JOIN public.quantum_event_room_invites AS invite
      ON invite.occurrence_id = mine.occurrence_id
     AND invite.status = 'accepted'
     AND (invite.inviter_user_id = v_user_id OR invite.invited_user_id = v_user_id)
  )
  SELECT pg_catalog.jsonb_build_object(
    'occurrence_id', mine.occurrence_id,
    'event_id', mine.event_id,
    'event_mode', mine.event_mode,
    'party_type', mine.party_type,
    'group_id', mine.group_id,
    'status', mine.status,
    'starts_at', mine.starts_at,
    'ends_at', mine.ends_at,
    'chat_opens_at', mine.starts_at - INTERVAL '20 minutes',
    'server_now', pg_catalog.now(),
    'match_id', mine.match_id,
    'location_name', mine.location_name,
    'cancel_reason', mine.cancel_reason,
    'room_number', mine.room_number,
    'room_label', public.quantum_event_room_label(mine.room_number),
    'room_code', mine.room_code,
    'participant_counts', pg_catalog.jsonb_build_object(
      'total', (SELECT pg_catalog.count(*) FROM occurrence_people),
      'male', (SELECT pg_catalog.count(*) FROM occurrence_people WHERE gender = 'male'),
      'female', (SELECT pg_catalog.count(*) FROM occurrence_people WHERE gender = 'female'),
      'required_total', mine.required_total
    ),
    'party_members', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', my_party.user_id,
        'display_name', CASE WHEN my_party.user_id = v_user_id THEN '나' ELSE '내 친구' END,
        'avatar_url', NULL
      ) ORDER BY my_party.user_id)
      FROM my_party
    ), '[]'::JSONB),
    'review_required', mine.status = 'completed',
    'updated_at', mine.updated_at
  )
  INTO v_result
  FROM mine;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_quantum_event_lifecycle()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_event_lifecycle()
  TO authenticated;

COMMIT;
