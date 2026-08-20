-- Verified meetup reviews are tied to a user's own finished activity participation.

ALTER TABLE public.community_posts
  ADD COLUMN meetup_id UUID REFERENCES public.activity_meetups(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX community_posts_one_review_per_meetup_idx
  ON public.community_posts(author_user_id, meetup_id)
  WHERE category = 'meetup-review'
    AND meetup_id IS NOT NULL
    AND status = 'published';

DROP FUNCTION IF EXISTS public.list_community_posts(TEXT, INTEGER);

CREATE FUNCTION public.list_community_posts(
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
  created_at TIMESTAMPTZ,
  like_count BIGINT,
  liked_by_me BOOLEAN,
  meetup_id UUID,
  meetup_title TEXT
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
    post.author_user_id = v_user_id,
    post.created_at,
    count(liked.user_id),
    coalesce(bool_or(liked.user_id = v_user_id), false),
    post.meetup_id,
    meetup.title
  FROM public.community_posts AS post
  LEFT JOIN public.community_post_likes AS liked ON liked.post_id = post.id
  LEFT JOIN public.activity_meetups AS meetup ON meetup.id = post.meetup_id
  WHERE post.school = v_school
    AND post.category = p_category
    AND post.status = 'published'
    AND (post.category <> 'meetup-review' OR post.meetup_id IS NOT NULL)
  GROUP BY post.id, meetup.title
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
  IF p_category = 'meetup-review' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'verified_participation_required';
  END IF;
  IF p_category IS NULL OR p_category NOT IN ('feedback', 'relationship-advice', 'relationship-coach') THEN
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
    'created_at', v_post.created_at,
    'like_count', 0,
    'liked_by_me', false,
    'meetup_id', null,
    'meetup_title', null
  );
END;
$$;

CREATE FUNCTION public.list_reviewable_meetups(p_limit INTEGER DEFAULT 30)
RETURNS TABLE (
  id UUID,
  title TEXT,
  category TEXT,
  place_name TEXT,
  scheduled_at TIMESTAMPTZ
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
  SELECT meetup.id, meetup.title, meetup.category, meetup.place_name, meetup.scheduled_at
  FROM public.activity_meetup_members AS member
  JOIN public.activity_meetups AS meetup ON meetup.id = member.meetup_id
  WHERE member.user_id = v_user_id
    AND member.status = 'joined'
    AND meetup.school = v_school
    AND meetup.status <> 'cancelled'
    AND meetup.scheduled_at <= now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_posts AS post
      WHERE post.author_user_id = v_user_id
        AND post.meetup_id = meetup.id
        AND post.category = 'meetup-review'
        AND post.status = 'published'
    )
  ORDER BY meetup.scheduled_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

CREATE FUNCTION public.create_meetup_review(
  p_meetup_id UUID,
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
  v_meetup public.activity_meetups%ROWTYPE;
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
  IF p_meetup_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_meetup';
  END IF;
  IF char_length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_title';
  END IF;
  IF char_length(btrim(coalesce(p_body, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_body';
  END IF;

  SELECT meetup.* INTO v_meetup
  FROM public.activity_meetups AS meetup
  JOIN public.activity_meetup_members AS member
    ON member.meetup_id = meetup.id
   AND member.user_id = v_user_id
   AND member.status = 'joined'
  WHERE meetup.id = p_meetup_id
    AND meetup.school = v_school
    AND meetup.status <> 'cancelled'
    AND meetup.scheduled_at <= now();

  IF v_meetup.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'verified_participation_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.community_posts AS post
    WHERE post.author_user_id = v_user_id
      AND post.meetup_id = p_meetup_id
      AND post.category = 'meetup-review'
      AND post.status = 'published'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'review_already_exists';
  END IF;

  INSERT INTO public.community_posts (
    author_user_id, school, category, title, body, meetup_id
  ) VALUES (
    v_user_id, v_school, 'meetup-review', btrim(p_title), btrim(p_body), p_meetup_id
  )
  RETURNING * INTO v_post;

  RETURN jsonb_build_object(
    'id', v_post.id,
    'category', v_post.category,
    'title', v_post.title,
    'body', v_post.body,
    'author_alias', v_post.author_alias,
    'is_author', true,
    'created_at', v_post.created_at,
    'like_count', 0,
    'liked_by_me', false,
    'meetup_id', v_meetup.id,
    'meetup_title', v_meetup.title
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'review_already_exists';
END;
$$;

REVOKE ALL ON FUNCTION public.list_community_posts(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_community_post(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_reviewable_meetups(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_meetup_review(UUID, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_community_posts(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_post(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_reviewable_meetups(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_meetup_review(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON COLUMN public.community_posts.meetup_id IS
  'Verified source meetup for a meetup-review. Null for other community categories.';
