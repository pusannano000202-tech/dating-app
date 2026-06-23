-- Phase 5 Category B: integrate Sungjun-origin meeting schema.
-- Source: origin/matching/group-engine:supabase/migrations/20260516_matching_add_venues_and_match_meetings.sql
-- Notes:
--   - Recreated with a current-branch timestamp because the original 20260516
--     migration predates this branch's public.matches table creation.
--   - No seed data is included in Phase 5.
--   - Existing SECURITY DEFINER RPCs expose intended meeting fields; direct
--     Data API access for anon/authenticated is intentionally not granted here.

DO $$
BEGIN
  IF to_regclass('public.venues') IS NOT NULL THEN
    RAISE EXCEPTION 'public.venues already exists; stop and reconcile Sungjun schema instead of overwriting';
  END IF;

  IF to_regclass('public.match_meetings') IS NOT NULL THEN
    RAISE EXCEPTION 'public.match_meetings already exists; stop and reconcile Sungjun schema instead of overwriting';
  END IF;
END;
$$;

CREATE TABLE public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cafe', 'restaurant', 'bar', 'other')),
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,

  area TEXT,
  nearest_school TEXT,

  min_group_size INT NOT NULL DEFAULT 2 CHECK (min_group_size >= 1),
  max_group_size INT NOT NULL DEFAULT 10 CHECK (max_group_size >= min_group_size),
  suitable_for_group_meeting BOOLEAN NOT NULL DEFAULT TRUE,

  price_level INT CHECK (price_level BETWEEN 1 AND 4),
  noise_level INT CHECK (noise_level BETWEEN 1 AND 5),
  privacy_level INT CHECK (privacy_level BETWEEN 1 AND 5),
  vibe_tags TEXT[] NOT NULL DEFAULT '{}',

  has_alcohol BOOLEAN NOT NULL DEFAULT FALSE,
  reservation_required BOOLEAN NOT NULL DEFAULT FALSE,
  phone TEXT,
  map_url TEXT,

  opening_hours JSONB,
  available_timeslots JSONB,

  checkin_radius_m INT NOT NULL DEFAULT 50 CHECK (checkin_radius_m > 0),

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'hidden')),
  admin_priority INT NOT NULL DEFAULT 0,
  quality_score FLOAT NOT NULL DEFAULT 0.5 CHECK (quality_score BETWEEN 0 AND 1),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.match_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id),

  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ,

  checkin_radius_m INT NOT NULL CHECK (checkin_radius_m > 0),

  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),

  assignment_reason JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_venues_status_meeting
  ON public.venues(status, suitable_for_group_meeting);

CREATE INDEX idx_venues_area_school
  ON public.venues(area, nearest_school);

CREATE INDEX idx_match_meetings_match_id
  ON public.match_meetings(match_id);

CREATE INDEX idx_match_meetings_venue_id
  ON public.match_meetings(venue_id);

CREATE INDEX idx_match_meetings_status_start
  ON public.match_meetings(status, scheduled_start);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_meetings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.venues FROM anon, authenticated;
REVOKE ALL ON public.match_meetings FROM anon, authenticated;

COMMENT ON TABLE public.venues IS
  'Sungjun-origin meeting venue schema imported into the current branch during Phase 5.';
COMMENT ON TABLE public.match_meetings IS
  'Sungjun-origin meeting schedule and venue assignment schema imported into the current branch during Phase 5.';
COMMENT ON COLUMN public.match_meetings.checkin_radius_m IS
  'Copied from venues.checkin_radius_m when a meeting is assigned so later venue edits do not alter existing check-in rules.';
