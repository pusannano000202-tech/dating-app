-- Quantum activity meetups and school community posts.
-- These domains are intentionally separate from dating groups and matching reviews.

CREATE TABLE public.activity_meetups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'baseball', 'soccer', 'basketball', 'running', 'board_game',
    'walking', 'dining', 'study', 'other'
  )),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 4 AND 60),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  place_name TEXT NOT NULL CHECK (char_length(place_name) BETWEEN 2 AND 80),
  scheduled_at TIMESTAMPTZ NOT NULL,
  capacity SMALLINT NOT NULL CHECK (capacity BETWEEN 2 AND 20),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.activity_meetup_members (
  meetup_id UUID NOT NULL REFERENCES public.activity_meetups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('host', 'member')),
  status TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'left')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (meetup_id, user_id)
);

CREATE TABLE public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'feedback', 'meetup-review', 'relationship-advice', 'relationship-coach'
  )),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 4 AND 80),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  author_alias TEXT NOT NULL DEFAULT '익명' CHECK (char_length(author_alias) BETWEEN 1 AND 20),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_meetups_school_schedule_idx
  ON public.activity_meetups(school, scheduled_at)
  WHERE status IN ('open', 'full');

CREATE INDEX activity_meetup_members_user_idx
  ON public.activity_meetup_members(user_id)
  WHERE status = 'joined';

CREATE INDEX community_posts_school_category_created_idx
  ON public.community_posts(school, category, created_at DESC)
  WHERE status = 'published';

ALTER TABLE public.activity_meetups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_meetup_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.activity_meetups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.activity_meetup_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.community_posts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.activity_meetups TO service_role;
GRANT ALL ON TABLE public.activity_meetup_members TO service_role;
GRANT ALL ON TABLE public.community_posts TO service_role;

CREATE OR REPLACE FUNCTION public.list_activity_meetups(
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  title TEXT,
  description TEXT,
  place_name TEXT,
  scheduled_at TIMESTAMPTZ,
  capacity SMALLINT,
  status TEXT,
  member_count BIGINT,
  joined BOOLEAN,
  is_host BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_school TEXT;
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

  RETURN QUERY
  SELECT
    meetup.id,
    meetup.category,
    meetup.title,
    meetup.description,
    meetup.place_name,
    meetup.scheduled_at,
    meetup.capacity,
    meetup.status,
    count(member.user_id) FILTER (WHERE member.status = 'joined') AS member_count,
    bool_or(member.user_id = v_user_id AND member.status = 'joined') AS joined,
    meetup.host_user_id = v_user_id AS is_host,
    meetup.created_at
  FROM public.activity_meetups AS meetup
  LEFT JOIN public.activity_meetup_members AS member
    ON member.meetup_id = meetup.id
  WHERE meetup.school = v_school
    AND meetup.status IN ('open', 'full')
    AND meetup.scheduled_at > now()
    AND (p_category IS NULL OR meetup.category = p_category)
  GROUP BY meetup.id
  ORDER BY meetup.scheduled_at ASC, meetup.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

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
    'baseball', 'soccer', 'basketball', 'running', 'board_game',
    'walking', 'dining', 'study', 'other'
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

CREATE OR REPLACE FUNCTION public.join_activity_meetup(p_meetup_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_school TEXT;
  v_meetup public.activity_meetups%ROWTYPE;
  v_member_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  SELECT profile.school INTO v_user_school
  FROM public.profiles AS profile
  WHERE profile.user_id = v_user_id;

  SELECT * INTO v_meetup
  FROM public.activity_meetups
  WHERE activity_meetups.id = p_meetup_id
  FOR UPDATE;

  IF v_meetup.id IS NULL OR v_meetup.school IS DISTINCT FROM v_user_school THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'meetup_not_found';
  END IF;
  IF v_meetup.status NOT IN ('open', 'full') OR v_meetup.scheduled_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meetup_closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.activity_meetup_members
    WHERE meetup_id = p_meetup_id AND user_id = v_user_id AND status = 'joined'
  ) THEN
    RETURN jsonb_build_object('joined', true, 'reused', true);
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.activity_meetup_members
  WHERE meetup_id = p_meetup_id AND status = 'joined';

  IF v_member_count >= v_meetup.capacity THEN
    UPDATE public.activity_meetups SET status = 'full', updated_at = now()
    WHERE id = p_meetup_id;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meetup_full';
  END IF;

  INSERT INTO public.activity_meetup_members (meetup_id, user_id, role, status, joined_at, left_at)
  VALUES (p_meetup_id, v_user_id, 'member', 'joined', now(), NULL)
  ON CONFLICT (meetup_id, user_id) DO UPDATE
    SET role = 'member', status = 'joined', joined_at = now(), left_at = NULL;

  v_member_count := v_member_count + 1;
  UPDATE public.activity_meetups
    SET status = CASE WHEN v_member_count >= capacity THEN 'full' ELSE 'open' END,
        updated_at = now()
  WHERE id = p_meetup_id;

  RETURN jsonb_build_object('joined', true, 'reused', false, 'member_count', v_member_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_activity_meetup(p_meetup_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.activity_meetups
    WHERE id = p_meetup_id AND host_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'host_cannot_leave';
  END IF;

  UPDATE public.activity_meetup_members
    SET status = 'left', left_at = now()
  WHERE meetup_id = p_meetup_id AND user_id = v_user_id AND status = 'joined';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('joined', false, 'reused', true);
  END IF;

  UPDATE public.activity_meetups
    SET status = 'open', updated_at = now()
  WHERE id = p_meetup_id AND status = 'full' AND scheduled_at > now();

  RETURN jsonb_build_object('joined', false, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_community_posts(
  p_category TEXT,
  p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  title TEXT,
  body TEXT,
  author_alias TEXT,
  is_author BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_school TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  SELECT profile.school INTO v_school
  FROM public.profiles AS profile
  WHERE profile.user_id = v_user_id;

  IF v_school IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'profile_required';
  END IF;

  RETURN QUERY
  SELECT
    post.id,
    post.category,
    post.title,
    post.body,
    post.author_alias,
    post.author_user_id = v_user_id AS is_author,
    post.created_at
  FROM public.community_posts AS post
  WHERE post.school = v_school
    AND post.category = p_category
    AND post.status = 'published'
  ORDER BY post.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_community_post(
  p_category TEXT,
  p_title TEXT,
  p_body TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_school TEXT;
  v_post public.community_posts%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  SELECT profile.school INTO v_school
  FROM public.profiles AS profile
  WHERE profile.user_id = v_user_id;

  IF v_school IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'profile_required';
  END IF;
  IF p_category IS NULL OR p_category NOT IN ('feedback', 'meetup-review', 'relationship-advice', 'relationship-coach') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_category';
  END IF;
  IF char_length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_title';
  END IF;
  IF char_length(btrim(coalesce(p_body, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_body';
  END IF;

  INSERT INTO public.community_posts (author_user_id, school, category, title, body)
  VALUES (v_user_id, v_school, p_category, btrim(p_title), btrim(p_body))
  RETURNING * INTO v_post;

  RETURN jsonb_build_object(
    'id', v_post.id,
    'category', v_post.category,
    'title', v_post.title,
    'body', v_post.body,
    'author_alias', v_post.author_alias,
    'is_author', true,
    'created_at', v_post.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_community_post(p_post_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  UPDATE public.community_posts
    SET status = 'deleted', updated_at = now()
  WHERE id = p_post_id AND author_user_id = v_user_id AND status = 'published';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.list_activity_meetups(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_activity_meetup(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_activity_meetup(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_activity_meetup(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_community_posts(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_community_post(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_community_post(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_activity_meetups(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_activity_meetup(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_activity_meetup(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_activity_meetup(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_community_posts(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_post(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_community_post(UUID) TO authenticated;

COMMENT ON TABLE public.activity_meetups IS
  'User-created non-dating school activity rooms. Kept separate from matching groups.';
COMMENT ON TABLE public.community_posts IS
  'School community posts. Campus Eats remains a separate verified venue feature.';
