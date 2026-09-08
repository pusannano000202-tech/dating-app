-- COALESCE is a PostgreSQL conditional expression, not a pg_catalog function.
-- Fix both the readiness gate and B-card snapshot path that run during room entry.

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
      AND snapshot.safe_payload ?& ARRAY[
        'intro', 'mbti', 'conversation_energy', 'plan_style', 'interests',
        'music', 'mint_chocolate', 'naengmyeon', 'meetup_role'
      ]
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
    FROM pg_catalog.regexp_split_to_table(
      COALESCE(v_interests_section, ''),
      '[[:space:]]*·[[:space:]]*'
    ) WITH ORDINALITY AS split_interest(value, position)
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
  IF v_meetup_role NOT IN (
    'question_starter', 'mood_connector', 'good_listener', 'activity_lead'
  ) THEN
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

  INSERT INTO public.quantum_event_room_card_snapshots AS existing_snapshot (
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
  ON CONFLICT (occurrence_id, participant_user_id) DO UPDATE
  SET gender = EXCLUDED.gender,
      safe_payload = EXCLUDED.safe_payload,
      source_updated_at = EXCLUDED.source_updated_at
  WHERE NOT (existing_snapshot.safe_payload ?& ARRAY[
    'intro', 'mbti', 'conversation_energy', 'plan_style', 'interests',
    'music', 'mint_chocolate', 'naengmyeon', 'meetup_role'
  ]);
END;
$$;

REVOKE ALL ON FUNCTION private.snapshot_quantum_event_room_member_card(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
