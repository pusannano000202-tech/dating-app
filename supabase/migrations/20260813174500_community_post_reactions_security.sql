BEGIN;

ALTER TABLE public.community_post_likes
  ADD COLUMN IF NOT EXISTS reaction TEXT NOT NULL DEFAULT 'like';

ALTER TABLE public.community_post_likes
  DROP CONSTRAINT IF EXISTS community_post_likes_reaction_check;
ALTER TABLE public.community_post_likes
  ADD CONSTRAINT community_post_likes_reaction_check
  CHECK (reaction IN ('like', 'dislike'));

DROP INDEX IF EXISTS public.community_post_likes_post_idx;
CREATE INDEX IF NOT EXISTS community_post_reactions_post_idx
  ON public.community_post_likes(post_id, reaction, created_at DESC);

CREATE TABLE IF NOT EXISTS public.community_action_rate_limits (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('post_create', 'comment_create', 'reaction_toggle')),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action_count INTEGER NOT NULL DEFAULT 1 CHECK (action_count >= 1),
  PRIMARY KEY (user_id, action)
);

ALTER TABLE public.community_action_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.community_action_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_action_rate_limits TO service_role;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.consume_community_action_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_limit INTEGER,
  p_window INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL
    OR p_action NOT IN ('post_create', 'comment_create', 'reaction_toggle')
    OR p_limit < 1
    OR p_window <= interval '0 seconds'
  THEN
    RETURN false;
  END IF;

  INSERT INTO public.community_action_rate_limits (
    user_id,
    action,
    window_started_at,
    action_count
  ) VALUES (
    p_user_id,
    p_action,
    now(),
    1
  )
  ON CONFLICT (user_id, action) DO UPDATE
  SET
    window_started_at = CASE
      WHEN public.community_action_rate_limits.window_started_at <= now() - p_window
        THEN now()
      ELSE public.community_action_rate_limits.window_started_at
    END,
    action_count = CASE
      WHEN public.community_action_rate_limits.window_started_at <= now() - p_window
        THEN 1
      ELSE least(public.community_action_rate_limits.action_count + 1, p_limit + 1)
    END
  RETURNING action_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_community_action_rate_limit(UUID, TEXT, INTEGER, INTERVAL)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.list_community_posts(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.list_hot_community_posts(INTEGER);
DROP FUNCTION IF EXISTS public.get_community_post(UUID);

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
  dislike_count BIGINT,
  disliked_by_me BOOLEAN,
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
    (SELECT count(*) FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.reaction = 'like'),
    EXISTS (SELECT 1 FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.user_id = v_user_id AND reaction.reaction = 'like'),
    (SELECT count(*) FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.reaction = 'dislike'),
    EXISTS (SELECT 1 FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.user_id = v_user_id AND reaction.reaction = 'dislike'),
    (SELECT count(*) FROM public.community_post_comments AS comment
      WHERE comment.post_id = post.id AND comment.status = 'published')
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
  dislike_count BIGINT,
  disliked_by_me BOOLEAN,
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
    (SELECT count(*) FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.reaction = 'like') AS like_count,
    EXISTS (SELECT 1 FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.user_id = v_user_id AND reaction.reaction = 'like'),
    (SELECT count(*) FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.reaction = 'dislike') AS dislike_count,
    EXISTS (SELECT 1 FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.user_id = v_user_id AND reaction.reaction = 'dislike'),
    (SELECT count(*) FROM public.community_post_comments AS comment
      WHERE comment.post_id = post.id AND comment.status = 'published')
  FROM public.community_posts AS post
  WHERE post.school = v_school
    AND post.status = 'published'
    AND post.created_at >= now() - interval '7 days'
  ORDER BY
    (
      (SELECT count(*) FROM public.community_post_likes AS reaction
        WHERE reaction.post_id = post.id AND reaction.reaction = 'like')
      -
      (SELECT count(*) FROM public.community_post_likes AS reaction
        WHERE reaction.post_id = post.id AND reaction.reaction = 'dislike')
    ) DESC,
    (SELECT count(*) FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.reaction = 'like') DESC,
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
  dislike_count BIGINT,
  disliked_by_me BOOLEAN,
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
    (SELECT count(*) FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.reaction = 'like'),
    EXISTS (SELECT 1 FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.user_id = v_user_id AND reaction.reaction = 'like'),
    (SELECT count(*) FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.reaction = 'dislike'),
    EXISTS (SELECT 1 FROM public.community_post_likes AS reaction
      WHERE reaction.post_id = post.id AND reaction.user_id = v_user_id AND reaction.reaction = 'dislike'),
    (SELECT count(*) FROM public.community_post_comments AS comment
      WHERE comment.post_id = post.id AND comment.status = 'published')
  FROM public.community_posts AS post
  WHERE post.id = p_post_id
    AND post.school = v_school
    AND post.status = 'published';
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_community_post_reaction(
  p_post_id UUID,
  p_reaction TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_school TEXT;
  v_existing TEXT;
  v_current TEXT;
  v_like_count BIGINT;
  v_dislike_count BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;
  IF p_reaction NOT IN ('like', 'dislike') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_reaction';
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
  IF NOT private.consume_community_action_rate_limit(
    v_user_id,
    'reaction_toggle',
    30,
    interval '1 minute'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rate_limited';
  END IF;

  SELECT reaction INTO v_existing
  FROM public.community_post_likes
  WHERE post_id = p_post_id AND user_id = v_user_id
  FOR UPDATE;

  IF v_existing = p_reaction THEN
    DELETE FROM public.community_post_likes
    WHERE post_id = p_post_id
      AND user_id = v_user_id
      AND reaction = p_reaction;
    v_current := NULL;
  ELSE
    INSERT INTO public.community_post_likes (post_id, user_id, reaction)
    VALUES (p_post_id, v_user_id, p_reaction)
    ON CONFLICT (post_id, user_id)
    DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now();
    v_current := p_reaction;
  END IF;

  SELECT
    count(*) FILTER (WHERE reaction = 'like'),
    count(*) FILTER (WHERE reaction = 'dislike')
  INTO v_like_count, v_dislike_count
  FROM public.community_post_likes
  WHERE post_id = p_post_id;

  RETURN jsonb_build_object(
    'reaction', v_current,
    'liked', v_current = 'like',
    'disliked', v_current = 'dislike',
    'like_count', v_like_count,
    'dislike_count', v_dislike_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_community_post_like(p_post_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.toggle_community_post_reaction(p_post_id, 'like');
$$;

CREATE OR REPLACE FUNCTION public.create_community_post_comment(p_post_id UUID, p_body TEXT)
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
  IF NOT private.consume_community_action_rate_limit(
    v_user_id,
    'comment_create',
    6,
    interval '1 minute'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rate_limited';
  END IF;

  INSERT INTO public.community_post_comments (post_id, author_user_id, body, author_alias)
  VALUES (p_post_id, v_user_id, btrim(p_body), '익명')
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
  IF NOT private.consume_community_action_rate_limit(
    v_user_id,
    'post_create',
    3,
    interval '10 minutes'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rate_limited';
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
    'dislike_count', 0,
    'disliked_by_me', false,
    'comment_count', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_community_posts(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_hot_community_posts(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_community_post(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.toggle_community_post_reaction(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.toggle_community_post_like(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_community_post_comment(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_community_post(TEXT, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_community_posts(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_hot_community_posts(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_post(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_community_post_reaction(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_community_post_like(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_post_comment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_post(TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON COLUMN public.community_post_likes.reaction IS
  'One mutually exclusive like or dislike reaction per authenticated user and post.';
COMMENT ON TABLE public.community_action_rate_limits IS
  'Server-owned fixed-window counters for community write abuse prevention.';

COMMIT;
