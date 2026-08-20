-- Synthetic, human-approved calibration anchors are public inputs for the
-- internal OpenAI service. User profile photos remain in the private `photos`
-- bucket and are not affected by this migration.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'appearance-anchors',
  'appearance-anchors',
  TRUE,
  10485760,
  ARRAY['image/png']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET public = TRUE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
