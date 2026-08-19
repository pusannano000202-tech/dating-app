-- Keep the deployed room-card snapshot contract aligned with the B precard.
-- Existing B snapshots remain immutable. Legacy snapshots are refreshed only
-- after the participant has saved a complete B card.

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

  SELECT profile.school
  INTO v_caller_school
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
    AND snapshot.safe_payload ?& ARRAY[
      'intro', 'mbti', 'conversation_energy', 'plan_style', 'interests',
      'music', 'mint_chocolate', 'naengmyeon', 'meetup_role'
    ]
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
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_event_room_participants()
  TO authenticated;
