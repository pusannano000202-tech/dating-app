-- The table predates the B precard and may still contain legacy four-key
-- snapshots. Keep those rows untouched, but enforce the B shape for every new
-- or updated snapshot. A later cleanup can validate the constraint after all
-- legacy rows have naturally refreshed.

ALTER TABLE public.quantum_event_room_card_snapshots
  DROP CONSTRAINT IF EXISTS quantum_event_room_card_snapshots_safe_payload_check;

ALTER TABLE public.quantum_event_room_card_snapshots
  ADD CONSTRAINT quantum_event_room_card_snapshots_safe_payload_check CHECK (
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
    AND safe_payload ->> 'meetup_role' IN (
      'question_starter', 'mood_connector', 'good_listener', 'activity_lead'
    )
  ) NOT VALID;
