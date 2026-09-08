-- Keep Quantum event participants anonymous until the meeting is completed.

CREATE OR REPLACE FUNCTION public.populate_quantum_event_match_aliases(
  p_match_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_male_group_id UUID;
  v_female_group_id UUID;
BEGIN
  IF p_match_id IS NULL THEN
    RAISE EXCEPTION 'invalid_match' USING ERRCODE = '22023';
  END IF;

  SELECT occurrence.male_group_id, occurrence.female_group_id
    INTO v_male_group_id, v_female_group_id
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.match_id = p_match_id;

  IF NOT FOUND OR v_male_group_id IS NULL OR v_female_group_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.match_member_aliases (
    match_id,
    viewer_group_id,
    target_user_id,
    alias,
    alias_theme,
    sort_order
  )
  SELECT
    p_match_id,
    CASE ranked.gender
      WHEN 'male' THEN v_female_group_id
      ELSE v_male_group_id
    END,
    ranked.user_id,
    '참가자 ' || pg_catalog.chr(64 + ranked.rn),
    'event-aliases-v1',
    ranked.rn - 1
  FROM (
    SELECT
      event_member.user_id,
      event_member.gender,
      pg_catalog.row_number() OVER (
        PARTITION BY event_member.gender
        ORDER BY event_member.user_id
      )::INTEGER AS rn
    FROM public.quantum_event_match_members AS event_member
    WHERE event_member.match_id = p_match_id
  ) AS ranked
  ON CONFLICT (match_id, viewer_group_id, target_user_id)
  DO UPDATE SET
    alias = EXCLUDED.alias,
    alias_theme = EXCLUDED.alias_theme,
    sort_order = EXCLUDED.sort_order;
END;
$$;

REVOKE ALL ON FUNCTION public.populate_quantum_event_match_aliases(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.populate_quantum_event_match_aliases(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.handle_quantum_event_match_aliases()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.populate_quantum_event_match_aliases(NEW.match_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_quantum_event_match_aliases()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_quantum_event_match_aliases
  ON public.quantum_event_match_members;

CREATE CONSTRAINT TRIGGER trg_quantum_event_match_aliases
  AFTER INSERT OR UPDATE OF match_id, user_id, gender
  ON public.quantum_event_match_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_quantum_event_match_aliases();

DO $$
DECLARE
  v_match_id UUID;
BEGIN
  FOR v_match_id IN
    SELECT DISTINCT event_member.match_id
    FROM public.quantum_event_match_members AS event_member
  LOOP
    PERFORM public.populate_quantum_event_match_aliases(v_match_id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.populate_quantum_event_match_aliases(UUID) IS
  'Creates stable event-only aliases without exposing participant profile data.';
