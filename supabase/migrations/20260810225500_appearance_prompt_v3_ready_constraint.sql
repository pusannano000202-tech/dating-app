ALTER TABLE public.private_appearance_scores
  DROP CONSTRAINT IF EXISTS private_appearance_scores_check2;

ALTER TABLE public.private_appearance_scores
  ADD CONSTRAINT private_appearance_scores_check2 CHECK (
    status <> 'ready'
    OR (
      photo_revision IS NOT NULL
      AND analyzed_photo_revision = photo_revision
      AND request_id IS NOT NULL
      AND score_raw IS NOT NULL
      AND score_normalized IS NOT NULL
      AND confidence_0_1 IS NOT NULL
      AND appearance_type IS NOT NULL
      AND provider = 'openai'
      AND model_version = 'gpt-5.6-terra'
      AND prompt_version = 'appearance-anchor-v3'
      AND anchor_version = 'approved-v1'
      AND analyzed_at IS NOT NULL
      AND error_code IS NULL
    )
  );
