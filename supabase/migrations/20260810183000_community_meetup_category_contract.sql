-- Keep every activity category exposed by web and mobile aligned with the database.

ALTER TABLE public.activity_meetups
  DROP CONSTRAINT IF EXISTS activity_meetups_category_check;

ALTER TABLE public.activity_meetups
  ADD CONSTRAINT activity_meetups_category_check CHECK (category IN (
    'baseball', 'soccer', 'basketball', 'badminton', 'tennis',
    'running', 'board_game', 'gaming', 'hiking', 'walking',
    'dining', 'study', 'other'
  ));

CREATE OR REPLACE FUNCTION public.create_activity_meetup(
  p_category TEXT,
  p_title TEXT,
  p_description TEXT,
  p_place_name TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_capacity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_school TEXT;
  v_meetup public.activity_meetups%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  SELECT profile.school
    INTO v_school
  FROM public.profiles AS profile
  WHERE profile.user_id = v_user_id;

  IF v_school IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'profile_required';
  END IF;

  IF p_category IS NULL OR p_category NOT IN (
    'baseball', 'soccer', 'basketball', 'badminton', 'tennis',
    'running', 'board_game', 'gaming', 'hiking', 'walking',
    'dining', 'study', 'other'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_category';
  END IF;
  IF char_length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 60 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_title';
  END IF;
  IF char_length(btrim(coalesce(p_description, ''))) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_description';
  END IF;
  IF char_length(btrim(coalesce(p_place_name, ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_place';
  END IF;
  IF p_capacity IS NULL OR p_capacity NOT BETWEEN 2 AND 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_capacity';
  END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at < now() + interval '30 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'schedule_too_soon';
  END IF;

  INSERT INTO public.activity_meetups (
    host_user_id, school, category, title, description,
    place_name, scheduled_at, capacity
  ) VALUES (
    v_user_id, v_school, p_category, btrim(p_title), btrim(coalesce(p_description, '')),
    btrim(p_place_name), p_scheduled_at, p_capacity
  )
  RETURNING * INTO v_meetup;

  INSERT INTO public.activity_meetup_members (meetup_id, user_id, role)
  VALUES (v_meetup.id, v_user_id, 'host');

  RETURN jsonb_build_object(
    'id', v_meetup.id,
    'category', v_meetup.category,
    'title', v_meetup.title,
    'description', v_meetup.description,
    'place_name', v_meetup.place_name,
    'scheduled_at', v_meetup.scheduled_at,
    'capacity', v_meetup.capacity,
    'status', v_meetup.status,
    'member_count', 1,
    'joined', true,
    'is_host', true,
    'created_at', v_meetup.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_activity_meetup(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_activity_meetup(
  TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER
) TO authenticated;
