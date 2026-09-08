-- Complete the partner setup round payload without changing its authentication,
-- own-venue filtering, capacity defaults, or execute boundary.

BEGIN;

CREATE OR REPLACE FUNCTION public.partner_get_tonight_setup(
  p_round_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_round public.tonight_rounds%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT * INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'round', pg_catalog.jsonb_build_object(
      'id', v_round.id,
      'market_code', v_round.market_code,
      'service_date', v_round.service_date,
      'status', v_round.status,
      'signup_close_at', v_round.signup_close_at,
      'capacity_lock_at', v_round.capacity_lock_at,
      'allocation_publish_at', v_round.allocation_publish_at,
      'deposit_due_at', v_round.deposit_due_at,
      'partner_acceptance_due_at', v_round.partner_acceptance_due_at,
      'reveal_at', v_round.reveal_at,
      'arrival_at', v_round.arrival_at,
      'starts_at', v_round.starts_at
    ),
    'activities', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', activity.id,
          'slot', activity.slot,
          'title', activity.title,
          'kind', activity.activity_kind,
          'duration_minutes', activity.duration_minutes
        ) ORDER BY activity.slot
      )
      FROM public.tonight_round_activities AS activity
      WHERE activity.round_id = p_round_id
        AND EXISTS (
          SELECT 1
          FROM public.venue_partner_memberships AS membership
          JOIN LATERAL (
            SELECT snapshot_row.venue_category
            FROM public.venue_snapshots AS snapshot_row
            WHERE snapshot_row.venue_id = membership.venue_id
            ORDER BY snapshot_row.created_at DESC, snapshot_row.id DESC
            LIMIT 1
          ) AS snapshot ON TRUE
          WHERE membership.user_id = v_caller
            AND membership.revoked_at IS NULL
            AND snapshot.venue_category = ANY(activity.allowed_venue_categories)
        )
    ), '[]'::JSONB),
    'venues', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'venue_id', membership.venue_id,
          'membership_role', membership.role,
          'snapshot', pg_catalog.jsonb_build_object(
            'id', snapshot.id,
            'display_name', snapshot.display_name,
            'category', snapshot.venue_category,
            'area_label', snapshot.area_label,
            'address', snapshot.address,
            'address_evidence', snapshot.address_evidence,
            'address_verified_at', snapshot.address_verified_at,
            'latitude', snapshot.latitude,
            'longitude', snapshot.longitude,
            'coordinate_evidence', snapshot.coordinate_evidence,
            'coordinates_verified_at', snapshot.coordinates_verified_at,
            'naver_url', snapshot.naver_url,
            'kakao_url', snapshot.kakao_url
          ),
          'capacities', COALESCE((
            SELECT pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', COALESCE(capacity.id, activity.id),
                'activity_id', activity.id,
                'team_capacity', COALESCE(capacity.team_capacity, 0),
                'reserved_team_count', COALESCE(capacity.reserved_team_count, 0),
                'max_team_headcount', COALESCE(capacity.max_team_headcount, 5),
                'status', COALESCE(capacity.status, 'open'),
                'revision', COALESCE(capacity.revision, 0)
              ) ORDER BY activity.slot
            )
            FROM public.tonight_round_activities AS activity
            LEFT JOIN public.tonight_venue_capacities AS capacity
              ON capacity.round_id = p_round_id
              AND capacity.activity_id = activity.id
              AND capacity.venue_id = membership.venue_id
              AND capacity.venue_snapshot_id = snapshot.id
            WHERE activity.round_id = p_round_id
              AND snapshot.venue_category = ANY(activity.allowed_venue_categories)
          ), '[]'::JSONB)
        ) ORDER BY membership.venue_id
      )
      FROM public.venue_partner_memberships AS membership
      JOIN LATERAL (
        SELECT snapshot_row.*
        FROM public.venue_snapshots AS snapshot_row
        WHERE snapshot_row.venue_id = membership.venue_id
        ORDER BY snapshot_row.created_at DESC, snapshot_row.id DESC
        LIMIT 1
      ) AS snapshot ON TRUE
      WHERE membership.user_id = v_caller
        AND membership.revoked_at IS NULL
    ), '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_get_tonight_setup(UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_get_tonight_setup(UUID) TO authenticated;

COMMENT ON FUNCTION public.partner_get_tonight_setup(UUID) IS
  'Returns the complete round schedule and only activities/capacities compatible with the caller current own-venue snapshots.';

COMMIT;
