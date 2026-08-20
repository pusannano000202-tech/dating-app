CREATE TABLE public.community_post_likes (
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.activity_meetups
  DROP CONSTRAINT IF EXISTS activity_meetups_category_check;
ALTER TABLE public.activity_meetups
  ADD CONSTRAINT activity_meetups_category_check CHECK (category IN (
    'baseball', 'soccer', 'basketball', 'badminton', 'tennis', 'running',
    'board_game', 'walking', 'dining', 'study', 'other'
  ));

CREATE INDEX community_post_likes_post_idx
  ON public.community_post_likes(post_id, created_at DESC);

ALTER TABLE public.community_post_likes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.community_post_likes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_post_likes TO service_role;

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
  liked_by_me BOOLEAN
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
    coalesce(bool_or(liked.user_id = v_user_id), false)
  FROM public.community_posts AS post
  LEFT JOIN public.community_post_likes AS liked ON liked.post_id = post.id
  WHERE post.school = v_school
    AND post.category = p_category
    AND post.status = 'published'
  GROUP BY post.id
  ORDER BY post.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

CREATE FUNCTION public.list_hot_community_posts(p_limit INTEGER DEFAULT 30)
RETURNS TABLE (
  id UUID,
  category TEXT,
  title TEXT,
  body TEXT,
  author_alias TEXT,
  is_author BOOLEAN,
  created_at TIMESTAMPTZ,
  like_count BIGINT,
  liked_by_me BOOLEAN
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
    coalesce(bool_or(liked.user_id = v_user_id), false)
  FROM public.community_posts AS post
  LEFT JOIN public.community_post_likes AS liked ON liked.post_id = post.id
  WHERE post.school = v_school
    AND post.status = 'published'
    AND post.created_at >= now() - interval '7 days'
  GROUP BY post.id
  ORDER BY count(liked.user_id) DESC, post.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

CREATE FUNCTION public.toggle_community_post_like(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_school TEXT;
  v_liked BOOLEAN;
  v_count BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  SELECT profile.school INTO v_school
  FROM public.profiles AS profile
  WHERE profile.user_id = v_user_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts AS post
    WHERE post.id = p_post_id
      AND post.school = v_school
      AND post.status = 'published'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'post_not_found';
  END IF;

  DELETE FROM public.community_post_likes
  WHERE post_id = p_post_id AND user_id = v_user_id;

  IF FOUND THEN
    v_liked := false;
  ELSE
    INSERT INTO public.community_post_likes (post_id, user_id)
    VALUES (p_post_id, v_user_id)
    ON CONFLICT DO NOTHING;
    v_liked := true;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.community_post_likes
  WHERE post_id = p_post_id;

  RETURN jsonb_build_object('liked', v_liked, 'like_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.list_community_posts(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_hot_community_posts(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.toggle_community_post_like(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_community_posts(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hot_community_posts(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_community_post_like(UUID) TO authenticated;
