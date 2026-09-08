CREATE OR REPLACE FUNCTION public.save_my_pre_match_card_draft(
  p_content_text TEXT,
  p_completed_items SMALLINT
)
RETURNS TABLE (
  user_id UUID,
  content_text TEXT,
  completed_items SMALLINT,
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_content_text TEXT := pg_catalog.btrim(p_content_text);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.char_length(v_content_text) NOT BETWEEN 10 AND 900 THEN
    RAISE EXCEPTION 'invalid_card_content' USING ERRCODE = '22023';
  END IF;
  IF p_completed_items NOT BETWEEN 0 AND 7 THEN
    RAISE EXCEPTION 'invalid_completed_items' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pre_match_card_drafts AS draft (
    user_id,
    content_text,
    completed_items,
    submitted_at
  )
  VALUES (
    v_user_id,
    v_content_text,
    p_completed_items,
    pg_catalog.now()
  )
  ON CONFLICT ON CONSTRAINT pre_match_card_drafts_pkey DO UPDATE
  SET
    content_text = EXCLUDED.content_text,
    completed_items = EXCLUDED.completed_items,
    submitted_at = EXCLUDED.submitted_at;

  RETURN QUERY
  SELECT
    saved.user_id,
    saved.content_text,
    saved.completed_items,
    saved.submitted_at,
    saved.updated_at
  FROM public.pre_match_card_drafts AS saved
  WHERE saved.user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_pre_match_card_draft(TEXT, SMALLINT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_my_pre_match_card_draft(TEXT, SMALLINT) TO authenticated;
