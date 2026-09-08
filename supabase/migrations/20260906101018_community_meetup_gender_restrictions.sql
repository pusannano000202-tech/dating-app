-- Admission restrictions for general community activities, not dating groups.
-- Legacy rows/clients remain unrestricted. No existing membership is removed.
BEGIN;

ALTER TABLE public.activity_meetups
  ADD COLUMN gender_mode TEXT NOT NULL DEFAULT 'all'
  CONSTRAINT activity_meetups_gender_mode_check
    CHECK (gender_mode IN ('all', 'male_only', 'female_only'));

-- This private companion is the current community profile. Never fall back to
-- profiles.gender or JWT metadata: those may contain a different, older value.
CREATE FUNCTION quantum_private.meetup_gender_eligibility(p_user_id UUID, p_mode TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_mode = 'all' THEN 'eligible'
    WHEN p_mode NOT IN ('male_only', 'female_only') OR p_mode IS NULL THEN 'gender_restricted'
    WHEN companion.community_gender IS NULL
      OR companion.community_gender NOT IN ('male', 'female') THEN 'gender_required'
    WHEN (p_mode = 'male_only' AND companion.community_gender = 'male')
      OR (p_mode = 'female_only' AND companion.community_gender = 'female') THEN 'eligible'
    ELSE 'gender_restricted'
  END
  FROM (SELECT 1) AS singleton
  LEFT JOIN quantum_private.community_member_profiles AS companion ON companion.user_id = p_user_id;
$$;
REVOKE ALL ON FUNCTION quantum_private.meetup_gender_eligibility(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

-- New name avoids ambiguity with the preserved six-argument legacy RPC.
CREATE FUNCTION public.create_activity_meetup_v2(
  p_category TEXT, p_title TEXT, p_description TEXT, p_place_name TEXT,
  p_scheduled_at TIMESTAMPTZ, p_capacity INTEGER, p_gender_mode TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_eligibility TEXT;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;
  IF p_gender_mode IS NULL OR p_gender_mode NOT IN ('all', 'male_only', 'female_only') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_gender_mode';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_user_id::TEXT, 0)
  );
  v_eligibility := quantum_private.meetup_gender_eligibility(v_user_id, p_gender_mode);
  IF v_eligibility = 'gender_required' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meetup_gender_required';
  ELSIF v_eligibility <> 'eligible' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meetup_gender_restricted';
  END IF;
  -- Reuse existing school, activity, date, capacity and host-membership checks.
  -- Updating the newly inserted row in this transaction is atomic to clients.
  v_result := public.create_activity_meetup(
    p_category, p_title, p_description, p_place_name, p_scheduled_at, p_capacity
  );
  UPDATE public.activity_meetups SET gender_mode = p_gender_mode
  WHERE id = (v_result->>'id')::UUID;
  RETURN v_result || jsonb_build_object('gender_mode', p_gender_mode, 'gender_eligibility', 'eligible');
END;
$$;

CREATE FUNCTION public.list_activity_meetups_v2(p_category TEXT, p_limit INTEGER, p_gender_mode TEXT)
RETURNS TABLE (
  id UUID, category TEXT, title TEXT, description TEXT, place_name TEXT,
  scheduled_at TIMESTAMPTZ, capacity SMALLINT, status TEXT, member_count BIGINT,
  joined BOOLEAN, is_host BOOLEAN, created_at TIMESTAMPTZ,
  gender_mode TEXT, gender_eligibility TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID := auth.uid(); v_school TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;
  IF p_gender_mode IS NOT NULL AND p_gender_mode NOT IN ('all', 'male_only', 'female_only') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_gender_mode';
  END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'profile_required'; END IF;
  RETURN QUERY
  SELECT meetup.id, meetup.category, meetup.title, meetup.description, meetup.place_name,
    meetup.scheduled_at, meetup.capacity, meetup.status,
    count(member.user_id) FILTER (WHERE member.status = 'joined'),
    coalesce(bool_or(member.user_id = v_user_id AND member.status = 'joined'), false),
    meetup.host_user_id = v_user_id, meetup.created_at,
    meetup.gender_mode, quantum_private.meetup_gender_eligibility(v_user_id, meetup.gender_mode)
  FROM public.activity_meetups AS meetup
  LEFT JOIN public.activity_meetup_members AS member ON member.meetup_id = meetup.id
  WHERE meetup.school = v_school AND meetup.status IN ('open', 'full')
    AND meetup.scheduled_at > now() AND (p_category IS NULL OR meetup.category = p_category)
    AND (p_gender_mode IS NULL OR meetup.gender_mode = p_gender_mode)
  GROUP BY meetup.id
  ORDER BY meetup.scheduled_at, meetup.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

-- Keep the original join signature guarded, including old/direct RPC clients.
CREATE OR REPLACE FUNCTION public.join_activity_meetup(p_meetup_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid(); v_school TEXT;
  v_meetup public.activity_meetups%ROWTYPE; v_member_count INTEGER; v_eligibility TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required'; END IF;
  -- Match profile-save locking, always user lock before the meetup row lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum:minimum-signup:user:' || v_user_id::TEXT, 0)
  );
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'profile_required'; END IF;
  SELECT * INTO v_meetup FROM public.activity_meetups WHERE activity_meetups.id = p_meetup_id FOR UPDATE;
  IF v_meetup.id IS NULL OR v_meetup.school IS DISTINCT FROM v_school THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'meetup_not_found';
  END IF;
  IF v_meetup.status NOT IN ('open','full') OR v_meetup.scheduled_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meetup_closed';
  END IF;
  v_eligibility := quantum_private.meetup_gender_eligibility(v_user_id, v_meetup.gender_mode);
  IF v_eligibility = 'gender_required' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meetup_gender_required';
  ELSIF v_eligibility <> 'eligible' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meetup_gender_restricted';
  END IF;
  -- Eligible repeats stay idempotent. A profile edit never silently evicts an
  -- existing member; leaving remains available, but every join call is checked.
  IF EXISTS (SELECT 1 FROM public.activity_meetup_members WHERE meetup_id=p_meetup_id AND user_id=v_user_id AND status='joined') THEN
    RETURN jsonb_build_object('joined',true,'reused',true);
  END IF;
  SELECT count(*) INTO v_member_count FROM public.activity_meetup_members WHERE meetup_id=p_meetup_id AND status='joined';
  IF v_member_count >= v_meetup.capacity THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meetup_full'; END IF;
  INSERT INTO public.activity_meetup_members (meetup_id,user_id,role,status,joined_at,left_at)
  VALUES (p_meetup_id,v_user_id,'member','joined',now(),NULL)
  ON CONFLICT (meetup_id,user_id) DO UPDATE SET role='member',status='joined',joined_at=now(),left_at=NULL;
  v_member_count := v_member_count + 1;
  UPDATE public.activity_meetups SET status=CASE WHEN v_member_count>=capacity THEN 'full' ELSE 'open' END,updated_at=now() WHERE id=p_meetup_id;
  RETURN jsonb_build_object('joined',true,'reused',false,'member_count',v_member_count);
END;
$$;

REVOKE ALL ON FUNCTION public.create_activity_meetup_v2(TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,INTEGER,TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_activity_meetups_v2(TEXT,INTEGER,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_activity_meetup_v2(TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,INTEGER,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_activity_meetups_v2(TEXT,INTEGER,TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.join_activity_meetup(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_activity_meetup(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
