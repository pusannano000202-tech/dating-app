ALTER TABLE public.pre_match_card_drafts
  DROP CONSTRAINT IF EXISTS pre_match_card_drafts_content_text_check;

ALTER TABLE public.pre_match_card_drafts
  ADD CONSTRAINT pre_match_card_drafts_content_text_check
  CHECK (char_length(btrim(content_text)) BETWEEN 10 AND 900);
