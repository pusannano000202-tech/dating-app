-- Migration: store pre-match card drafts before queue entry.
-- Date: 2026-06-22
--
-- Purpose:
--   match_card_submissions requires a match_id, so it only works after a
--   provisional match exists. The queue readiness flow needs a user-level
--   card draft before entering the pool.

CREATE TABLE IF NOT EXISTS public.pre_match_card_drafts (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  content_text TEXT NOT NULL CHECK (char_length(btrim(content_text)) BETWEEN 10 AND 500),
  completed_items SMALLINT NOT NULL CHECK (completed_items BETWEEN 0 AND 6),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pre_match_card_drafts_submitted_at
  ON public.pre_match_card_drafts(submitted_at);

ALTER TABLE public.pre_match_card_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pre_match_card_drafts_select_self
  ON public.pre_match_card_drafts;
DROP POLICY IF EXISTS pre_match_card_drafts_insert_self
  ON public.pre_match_card_drafts;
DROP POLICY IF EXISTS pre_match_card_drafts_update_self
  ON public.pre_match_card_drafts;
DROP POLICY IF EXISTS pre_match_card_drafts_delete_self
  ON public.pre_match_card_drafts;

CREATE POLICY pre_match_card_drafts_select_self
  ON public.pre_match_card_drafts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY pre_match_card_drafts_insert_self
  ON public.pre_match_card_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY pre_match_card_drafts_update_self
  ON public.pre_match_card_drafts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY pre_match_card_drafts_delete_self
  ON public.pre_match_card_drafts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_pre_match_card_draft_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pre_match_card_drafts_touch_updated_at
  ON public.pre_match_card_drafts;

CREATE TRIGGER trg_pre_match_card_drafts_touch_updated_at
  BEFORE UPDATE ON public.pre_match_card_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_pre_match_card_draft_updated_at();

CREATE OR REPLACE FUNCTION public.get_group_pre_match_card_readiness(
  p_group_id UUID
)
RETURNS TABLE (
  user_id UUID,
  has_pre_match_card BOOLEAN,
  completed_items SMALLINT,
  submitted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_is_member BOOLEAN;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.group_members gm
     WHERE gm.group_id = p_group_id
       AND gm.user_id = v_caller
       AND gm.left_at IS NULL
  )
  INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'not_group_member';
  END IF;

  RETURN QUERY
  SELECT
    gm.user_id,
    (d.user_id IS NOT NULL AND d.completed_items >= 4) AS has_pre_match_card,
    d.completed_items,
    d.submitted_at
  FROM public.group_members gm
  LEFT JOIN public.pre_match_card_drafts d
    ON d.user_id = gm.user_id
  WHERE gm.group_id = p_group_id
    AND gm.left_at IS NULL
  ORDER BY gm.joined_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_pre_match_card_readiness(UUID) TO authenticated;

COMMENT ON TABLE public.pre_match_card_drafts IS
  'User-level pre-match card draft saved before queue entry. Full match cards remain in match_card_submissions after a match exists.';
COMMENT ON FUNCTION public.get_group_pre_match_card_readiness(UUID) IS
  'Returns only readiness metadata for active group members, without exposing draft content_text.';
