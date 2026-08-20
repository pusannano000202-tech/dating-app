CREATE TABLE public.community_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  author_alias TEXT NOT NULL DEFAULT '익명' CHECK (char_length(author_alias) BETWEEN 1 AND 20),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX community_post_comments_post_created_idx
  ON public.community_post_comments(post_id, created_at ASC)
  WHERE status = 'published';

CREATE INDEX community_post_comments_author_idx
  ON public.community_post_comments(author_user_id);

ALTER TABLE public.community_post_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.community_post_comments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_post_comments TO service_role;

DROP FUNCTION IF EXISTS public.list_community_posts(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.list_hot_community_posts(INTEGER);

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
  comment_count BIGINT
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
    (SELECT count(*) FROM public.community_post_likes AS liked WHERE liked.post_id = post.id),
    EXISTS (
      SELECT 1 FROM public.community_post_likes AS liked
      WHERE liked.post_id = post.id AND liked.user_id = v_user_id
    ),
    (
      SELECT count(*) FROM public.community_post_comments AS comment
      WHERE comment.post_id = post.id AND comment.status = 'published'
    )
  FROM public.community_posts AS post
  WHERE post.school = v_school
    AND post.category = p_category
    AND post.status = 'published'
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
  liked_by_me BOOLEAN,
  comment_count BIGINT
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
    (SELECT count(*) FROM public.community_post_likes AS liked WHERE liked.post_id = post.id),
    EXISTS (
      SELECT 1 FROM public.community_post_likes AS liked
      WHERE liked.post_id = post.id AND liked.user_id = v_user_id
    ),
    (
      SELECT count(*) FROM public.community_post_comments AS comment
      WHERE comment.post_id = post.id AND comment.status = 'published'
    )
  FROM public.community_posts AS post
  WHERE post.school = v_school
    AND post.status = 'published'
    AND post.created_at >= now() - interval '7 days'
  ORDER BY
    (SELECT count(*) FROM public.community_post_likes AS liked WHERE liked.post_id = post.id) DESC,
    post.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

CREATE FUNCTION public.get_community_post(p_post_id UUID)
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
  comment_count BIGINT
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
    (SELECT count(*) FROM public.community_post_likes AS liked WHERE liked.post_id = post.id),
    EXISTS (
      SELECT 1 FROM public.community_post_likes AS liked
      WHERE liked.post_id = post.id AND liked.user_id = v_user_id
    ),
    (
      SELECT count(*) FROM public.community_post_comments AS comment
      WHERE comment.post_id = post.id AND comment.status = 'published'
    )
  FROM public.community_posts AS post
  WHERE post.id = p_post_id
    AND post.school = v_school
    AND post.status = 'published';
END;
$$;

CREATE FUNCTION public.list_community_post_comments(
  p_post_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  post_id UUID,
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

  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts AS post
    WHERE post.id = p_post_id
      AND post.school = v_school
      AND post.status = 'published'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'post_not_found';
  END IF;

  RETURN QUERY
  SELECT
    comment.id,
    comment.post_id,
    comment.body,
    comment.author_alias,
    comment.author_user_id = v_user_id,
    comment.created_at
  FROM public.community_post_comments AS comment
  WHERE comment.post_id = p_post_id
    AND comment.status = 'published'
  ORDER BY comment.created_at ASC
  LIMIT greatest(1, least(coalesce(p_limit, 100), 100));
END;
$$;

CREATE FUNCTION public.create_community_post_comment(p_post_id UUID, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_school TEXT;
  v_comment public.community_post_comments%ROWTYPE;
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
  IF char_length(btrim(coalesce(p_body, ''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_comment';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts AS post
    WHERE post.id = p_post_id
      AND post.school = v_school
      AND post.status = 'published'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'post_not_found';
  END IF;

  INSERT INTO public.community_post_comments (post_id, author_user_id, body)
  VALUES (p_post_id, v_user_id, btrim(p_body))
  RETURNING * INTO v_comment;

  RETURN jsonb_build_object(
    'id', v_comment.id,
    'post_id', v_comment.post_id,
    'body', v_comment.body,
    'author_alias', v_comment.author_alias,
    'is_author', true,
    'created_at', v_comment.created_at
  );
END;
$$;

CREATE FUNCTION public.delete_community_post_comment(p_post_id UUID, p_comment_id UUID)
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

  UPDATE public.community_post_comments
  SET status = 'deleted', updated_at = now()
  WHERE id = p_comment_id
    AND post_id = p_post_id
    AND author_user_id = v_user_id
    AND status = 'published';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.list_community_posts(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hot_community_posts(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_community_post(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_community_post_comments(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_community_post_comment(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_community_post_comment(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_community_posts(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hot_community_posts(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_post(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_community_post_comments(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_post_comment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_community_post_comment(UUID, UUID) TO authenticated;

COMMENT ON TABLE public.community_post_comments IS
  'Anonymous school-scoped comments exposed only through authenticated RPCs.';
