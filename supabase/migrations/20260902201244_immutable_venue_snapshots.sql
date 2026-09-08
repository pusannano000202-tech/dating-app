-- Immutable, public-safe venue facts used by user journeys. Legacy venue
-- coordinates and map_url are deliberately not copied into verified fields.

BEGIN;

CREATE SCHEMA IF NOT EXISTS quantum_private;
REVOKE ALL ON SCHEMA quantum_private
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;

CREATE TABLE public.venue_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  snapshot_revision UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  venue_category TEXT NOT NULL CHECK (
    venue_category IN ('cafe', 'restaurant', 'bar', 'activity', 'public-meeting-point', 'other')
  ),
  area_label TEXT NOT NULL,
  address TEXT,
  address_evidence TEXT CHECK (
    address_evidence IS NULL
    OR address_evidence IN ('search-verified', 'provider-verified', 'operator-verified')
  ),
  address_verified_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  coordinate_evidence TEXT CHECK (
    coordinate_evidence IS NULL
    OR coordinate_evidence IN ('geocoded-address', 'provider-verified', 'operator-verified')
  ),
  coordinates_verified_at TIMESTAMPTZ,
  naver_url TEXT,
  naver_link_kind TEXT CHECK (naver_link_kind IS NULL OR naver_link_kind IN ('place', 'search')),
  kakao_url TEXT,
  kakao_link_kind TEXT CHECK (kakao_link_kind IS NULL OR kakao_link_kind IN ('place', 'search')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT venue_snapshots_revision_unique UNIQUE (venue_id, snapshot_revision),
  CONSTRAINT venue_snapshots_address_evidence_consistent CHECK (
    (address IS NULL AND address_evidence IS NULL AND address_verified_at IS NULL)
    OR (
      address IS NOT NULL
      AND address_evidence IS NOT NULL
      AND address_verified_at IS NOT NULL
    )
  ),
  CONSTRAINT venue_snapshots_coordinates_consistent CHECK (
    (latitude IS NULL AND longitude IS NULL AND coordinate_evidence IS NULL AND coordinates_verified_at IS NULL)
    OR (
      latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND coordinate_evidence IS NOT NULL
      AND coordinates_verified_at IS NOT NULL
    )
  ),
  CONSTRAINT venue_snapshots_naver_link_consistent CHECK (
    (naver_url IS NULL AND naver_link_kind IS NULL)
    OR (naver_url IS NOT NULL AND naver_link_kind IS NOT NULL)
  ),
  CONSTRAINT venue_snapshots_kakao_link_consistent CHECK (
    (kakao_url IS NULL AND kakao_link_kind IS NULL)
    OR (kakao_url IS NOT NULL AND kakao_link_kind IS NOT NULL)
  )
);

-- Creator identity is operational provenance, not a public place fact. Keep it
-- in the private schema so even a future public projection cannot accidentally
-- expose administrator identities alongside venue details.
CREATE TABLE quantum_private.venue_snapshot_provenance (
  snapshot_id UUID PRIMARY KEY REFERENCES public.venue_snapshots(id) ON DELETE RESTRICT,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

REVOKE ALL ON TABLE quantum_private.venue_snapshot_provenance
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

CREATE INDEX venue_snapshots_venue_created_lookup
  ON public.venue_snapshots (venue_id, created_at DESC);

ALTER TABLE public.venue_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.venue_snapshots
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.venue_snapshots
  TO service_role;

CREATE OR REPLACE FUNCTION quantum_private.prevent_venue_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'venue_snapshot_immutable';
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.prevent_venue_snapshot_mutation()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER venue_snapshots_immutable
  BEFORE DELETE OR UPDATE ON public.venue_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_venue_snapshot_mutation();

CREATE TRIGGER venue_snapshot_provenance_immutable
  BEFORE DELETE OR UPDATE ON quantum_private.venue_snapshot_provenance
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_venue_snapshot_mutation();

CREATE OR REPLACE FUNCTION public.create_venue_snapshot(
  p_venue_id UUID,
  p_address_evidence TEXT,
  p_address_verified_at TIMESTAMPTZ,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_coordinate_evidence TEXT DEFAULT NULL,
  p_coordinates_verified_at TIMESTAMPTZ DEFAULT NULL,
  p_naver_url TEXT DEFAULT NULL,
  p_naver_link_kind TEXT DEFAULT NULL,
  p_kakao_url TEXT DEFAULT NULL,
  p_kakao_link_kind TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_display_name TEXT;
  v_category TEXT;
  v_address TEXT;
  v_area_label TEXT;
  v_snapshot_id UUID;
  v_snapshot_revision UUID := gen_random_uuid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

  SELECT
    venue.name,
    venue.category,
    venue.address,
    COALESCE(
      NULLIF(pg_catalog.btrim(venue.area), ''),
      NULLIF(pg_catalog.btrim(venue.nearest_school), ''),
      venue.address
    )
  INTO
    v_display_name,
    v_category,
    v_address,
    v_area_label
  FROM public.venues AS venue
  WHERE venue.id = p_venue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  IF v_address IS NULL OR pg_catalog.btrim(v_address) = '' THEN
    RAISE EXCEPTION 'venue_address_required';
  END IF;
  IF p_address_evidence IS NULL
    OR p_address_evidence NOT IN ('search-verified', 'provider-verified', 'operator-verified')
    OR p_address_verified_at IS NULL
    OR p_address_verified_at > CURRENT_TIMESTAMP + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'verified_address_evidence_required';
  END IF;

  IF (p_latitude IS NULL) IS DISTINCT FROM (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'incomplete_coordinates';
  END IF;
  IF p_latitude IS NULL THEN
    IF p_coordinate_evidence IS NOT NULL OR p_coordinates_verified_at IS NOT NULL THEN
      RAISE EXCEPTION 'coordinate_evidence_without_coordinates';
    END IF;
  ELSE
    IF p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
      RAISE EXCEPTION 'invalid_coordinates';
    END IF;
    IF p_coordinate_evidence IS NULL OR p_coordinate_evidence NOT IN (
      'geocoded-address',
      'provider-verified',
      'operator-verified'
    ) OR p_coordinates_verified_at IS NULL THEN
      RAISE EXCEPTION 'verified_coordinate_evidence_required';
    END IF;
  END IF;

  IF (p_naver_url IS NULL) IS DISTINCT FROM (p_naver_link_kind IS NULL) THEN
    RAISE EXCEPTION 'incomplete_naver_link';
  END IF;
  IF p_naver_url IS NOT NULL AND (
    p_naver_link_kind NOT IN ('place', 'search')
    OR p_naver_url !~ '^https://(m\.)?map\.naver\.com(/|$)'
  ) THEN
    RAISE EXCEPTION 'invalid_naver_link';
  END IF;

  IF (p_kakao_url IS NULL) IS DISTINCT FROM (p_kakao_link_kind IS NULL) THEN
    RAISE EXCEPTION 'incomplete_kakao_link';
  END IF;
  IF p_kakao_url IS NOT NULL AND (
    p_kakao_link_kind NOT IN ('place', 'search')
    OR p_kakao_url !~ '^https://(place\.)?map\.kakao\.com(/|$)'
  ) THEN
    RAISE EXCEPTION 'invalid_kakao_link';
  END IF;

  INSERT INTO public.venue_snapshots AS snapshot (
    venue_id,
    snapshot_revision,
    display_name,
    venue_category,
    area_label,
    address,
    address_evidence,
    address_verified_at,
    latitude,
    longitude,
    coordinate_evidence,
    coordinates_verified_at,
    naver_url,
    naver_link_kind,
    kakao_url,
    kakao_link_kind
  )
  VALUES (
    p_venue_id,
    v_snapshot_revision,
    v_display_name,
    v_category,
    v_area_label,
    v_address,
    p_address_evidence,
    p_address_verified_at,
    p_latitude,
    p_longitude,
    p_coordinate_evidence,
    p_coordinates_verified_at,
    p_naver_url,
    p_naver_link_kind,
    p_kakao_url,
    p_kakao_link_kind
  )
  RETURNING snapshot.id INTO v_snapshot_id;

  INSERT INTO quantum_private.venue_snapshot_provenance (
    snapshot_id,
    venue_id,
    created_by
  )
  VALUES (v_snapshot_id, p_venue_id, v_caller);

  RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_venue_snapshot(
  UUID,
  TEXT,
  TIMESTAMPTZ,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) FROM /* explicit role boundary */ PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_venue_snapshot(
  UUID,
  TEXT,
  TIMESTAMPTZ,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO authenticated;

COMMENT ON TABLE public.venue_snapshots IS
  'Immutable public-safe place facts. Unknown legacy coordinates and map links are never promoted automatically.';
COMMENT ON FUNCTION public.create_venue_snapshot(
  UUID,
  TEXT,
  TIMESTAMPTZ,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) IS
  'Super-admin snapshot creation. Canonical venue address, coordinates, and provider links require explicit verification evidence before Tonight use.';

COMMIT;
