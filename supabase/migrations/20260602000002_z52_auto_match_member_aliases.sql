-- Migration: automatically create anonymous counterpart aliases for each match.
-- Date: 2026-06-02

CREATE OR REPLACE FUNCTION public.populate_match_member_aliases(
  p_match_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_alias_pool TEXT[] := ARRAY['오소리', '꿀벌', '개구리', '고래', '다람쥐', '여우'];
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  INSERT INTO match_member_aliases (
    match_id,
    viewer_group_id,
    target_user_id,
    alias,
    alias_theme,
    sort_order
  )
  SELECT
    p_match_id,
    v_match.group_a_id,
    ranked.user_id,
    v_alias_pool[ranked.rn],
    'animals',
    ranked.rn - 1
  FROM (
    SELECT
      gm.user_id,
      (ROW_NUMBER() OVER (ORDER BY gm.user_id))::INT AS rn
    FROM group_members gm
    WHERE gm.group_id = v_match.group_b_id
      AND gm.left_at IS NULL
  ) ranked
  WHERE ranked.rn <= array_length(v_alias_pool, 1)
  ON CONFLICT (match_id, viewer_group_id, target_user_id) DO NOTHING;

  INSERT INTO match_member_aliases (
    match_id,
    viewer_group_id,
    target_user_id,
    alias,
    alias_theme,
    sort_order
  )
  SELECT
    p_match_id,
    v_match.group_b_id,
    ranked.user_id,
    v_alias_pool[ranked.rn],
    'animals',
    ranked.rn - 1
  FROM (
    SELECT
      gm.user_id,
      (ROW_NUMBER() OVER (ORDER BY gm.user_id))::INT AS rn
    FROM group_members gm
    WHERE gm.group_id = v_match.group_a_id
      AND gm.left_at IS NULL
  ) ranked
  WHERE ranked.rn <= array_length(v_alias_pool, 1)
  ON CONFLICT (match_id, viewer_group_id, target_user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_match_member_aliases_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.populate_match_member_aliases(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_populate_member_aliases ON public.matches;

CREATE TRIGGER trg_matches_populate_member_aliases
  AFTER INSERT ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_match_member_aliases_after_insert();

DO $$
DECLARE
  v_match_id UUID;
BEGIN
  FOR v_match_id IN SELECT id FROM public.matches LOOP
    PERFORM public.populate_match_member_aliases(v_match_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.populate_match_member_aliases(UUID) TO authenticated;

COMMENT ON FUNCTION public.populate_match_member_aliases(UUID) IS
  'Creates stable anonymous aliases for both viewer groups in a match.';
COMMENT ON TRIGGER trg_matches_populate_member_aliases ON public.matches IS
  'Creates counterpart aliases whenever a provisional match is inserted.';
