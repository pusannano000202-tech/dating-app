-- Track automatic and manual sources for profiles.self_appearance_score.
-- The legacy self_appearance_score column remains the effective score used by matching.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS self_appearance_score_auto FLOAT CHECK (
    self_appearance_score_auto IS NULL
    OR (self_appearance_score_auto >= 0 AND self_appearance_score_auto <= 100)
  ),
  ADD COLUMN IF NOT EXISTS self_appearance_score_override FLOAT CHECK (
    self_appearance_score_override IS NULL
    OR (self_appearance_score_override >= 0 AND self_appearance_score_override <= 100)
  ),
  ADD COLUMN IF NOT EXISTS self_appearance_score_source TEXT CHECK (
    self_appearance_score_source IS NULL
    OR self_appearance_score_source IN ('auto', 'override', 'legacy')
  ),
  ADD COLUMN IF NOT EXISTS self_appearance_score_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.self_appearance_score IS
  'Effective 0-100 appearance score used by matching. Prefer override, then auto, then legacy value.';

COMMENT ON COLUMN profiles.self_appearance_score_auto IS
  'Automatic 0-100 appearance score returned by the AI photo scoring pipeline.';

COMMENT ON COLUMN profiles.self_appearance_score_override IS
  'Manual/admin 0-100 appearance score override. When present, it becomes the effective self_appearance_score.';

COMMENT ON COLUMN profiles.self_appearance_score_source IS
  'Source selected for the effective self_appearance_score: auto, override, or legacy.';

COMMENT ON COLUMN profiles.self_appearance_score_updated_at IS
  'Last time the effective or source appearance score fields were updated.';
