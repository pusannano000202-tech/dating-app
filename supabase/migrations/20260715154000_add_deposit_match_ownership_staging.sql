-- Phase 12 payment ownership staging.
-- This migration only adds the nullable ownership link and performs mappings
-- that can be proven without guessing. The enforcement migration runs after
-- operators review any remaining active rows.

ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS match_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deposits_match_id_fkey'
      AND conrelid = 'public.deposits'::regclass
  ) THEN
    ALTER TABLE public.deposits
      ADD CONSTRAINT deposits_match_id_fkey
      FOREIGN KEY (match_id)
      REFERENCES public.matches(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.deposits
  VALIDATE CONSTRAINT deposits_match_id_fkey;

-- Refund requests are direct ownership evidence.
WITH unambiguous_links AS (
  SELECT deposit_id, MIN(match_id::TEXT)::UUID AS match_id
  FROM public.deposit_refund_requests
  GROUP BY deposit_id
  HAVING COUNT(DISTINCT match_id) = 1
)
UPDATE public.deposits AS d
SET match_id = links.match_id
FROM unambiguous_links AS links
WHERE d.id = links.deposit_id
  AND d.match_id IS NULL;

-- Group history alone is not ownership evidence. Any active deposit that is
-- still NULL must be reconciled manually before the enforcement migration.

CREATE INDEX IF NOT EXISTS deposits_match_id_idx
  ON public.deposits(match_id);

COMMENT ON COLUMN public.deposits.match_id IS
  'Exact match that owns this deposit. Active legacy NULL rows must be reconciled before Phase 12 enforcement.';
