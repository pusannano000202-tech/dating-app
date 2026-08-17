ALTER TABLE public.pre_match_card_drafts
  DROP CONSTRAINT IF EXISTS pre_match_card_drafts_completed_items_check;

ALTER TABLE public.pre_match_card_drafts
  ADD CONSTRAINT pre_match_card_drafts_completed_items_check
  CHECK (completed_items BETWEEN 0 AND 7);
