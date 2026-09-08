-- Private meeting proof and participant album source.
-- A photo is evidence metadata only. It never changes a deposit by itself.

CREATE TABLE public.meeting_photo_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  uploader_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  file_sha256 TEXT NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 12582912),
  captured_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  dispute_hold BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'accepted', 'rejected', 'deleted')),
  UNIQUE (match_id, file_sha256),
  UNIQUE (match_id, uploader_user_id)
);

CREATE INDEX idx_meeting_photo_evidence_match_submitted
  ON public.meeting_photo_evidence(match_id, submitted_at DESC)
  WHERE status IN ('submitted', 'accepted');

CREATE INDEX idx_meeting_photo_evidence_retention
  ON public.meeting_photo_evidence(retention_until)
  WHERE dispute_hold = FALSE AND status <> 'deleted';

ALTER TABLE public.meeting_photo_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.meeting_photo_evidence FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meeting_photo_evidence TO service_role;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'meeting-evidence',
  'meeting-evidence',
  FALSE,
  12582912,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE public.meeting_photo_evidence IS
  'Private meeting evidence. Server-authorized participants receive short-lived signed album URLs.';
COMMENT ON COLUMN public.meeting_photo_evidence.retention_until IS
  'Normal deletion eligibility. dispute_hold may preserve evidence for an active dispute.';
