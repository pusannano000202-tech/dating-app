BEGIN;

ALTER TABLE public.community_post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID
    REFERENCES public.community_post_comments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS depth SMALLINT NOT NULL DEFAULT 0
    CHECK (depth BETWEEN 0 AND 2);

ALTER TABLE public.community_post_comments
  ALTER COLUMN author_user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS community_post_comments_author_user_id_fkey,
  ADD CONSTRAINT community_post_comments_author_user_id_fkey
    FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS community_post_comments_parent_idx
  ON public.community_post_comments(parent_comment_id, created_at ASC);

CREATE TABLE public.community_comment_reactions (
  comment_id UUID NOT NULL REFERENCES public.community_post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.community_comment_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.community_comment_reactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.community_comment_reactions TO service_role;

CREATE FUNCTION private.guard_community_comment_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_parent public.community_post_comments%ROWTYPE;
BEGIN
  IF NEW.parent_comment_id IS NULL THEN
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  SELECT * INTO v_parent
  FROM public.community_post_comments AS parent
  WHERE parent.id = NEW.parent_comment_id
  FOR SHARE;

  IF NOT FOUND
     OR v_parent.post_id <> NEW.post_id
     OR v_parent.status <> 'published'
     OR v_parent.depth >= 2 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_parent_comment';
  END IF;

  NEW.depth := v_parent.depth + 1;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_community_comment_thread()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS community_comment_thread_guard
  ON public.community_post_comments;
CREATE TRIGGER community_comment_thread_guard
  BEFORE INSERT OR UPDATE OF post_id, parent_comment_id, depth
  ON public.community_post_comments
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_community_comment_thread();

CREATE FUNCTION private.anonymize_deleted_user_community_comments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.community_post_comments
  SET status = 'deleted', body = '삭제된 댓글입니다.', author_alias = '익명'
  WHERE author_user_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.anonymize_deleted_user_community_comments()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS anonymize_deleted_user_community_comments
  ON public.users;
CREATE TRIGGER anonymize_deleted_user_community_comments
  BEFORE DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.anonymize_deleted_user_community_comments();

DROP FUNCTION IF EXISTS public.list_community_post_comments(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.create_community_post_comment(UUID, TEXT);

CREATE FUNCTION public.list_community_post_comments(
  p_post_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  post_id UUID,
  parent_comment_id UUID,
  depth SMALLINT,
  body TEXT,
  author_alias TEXT,
  is_author BOOLEAN,
  is_deleted BOOLEAN,
  created_at TIMESTAMPTZ,
  like_count BIGINT,
  liked_by_me BOOLEAN,
  dislike_count BIGINT,
  disliked_by_me BOOLEAN
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.community_posts AS post
    WHERE post.id = p_post_id
      AND post.school = v_school
      AND post.status = 'published'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'post_not_found';
  END IF;

  RETURN QUERY
  WITH RECURSIVE visible_comments AS (
    SELECT comment.id, comment.parent_comment_id
    FROM public.community_post_comments AS comment
    WHERE comment.post_id = p_post_id
      AND comment.status = 'published'
    UNION
    SELECT parent.id, parent.parent_comment_id
    FROM public.community_post_comments AS parent
    JOIN visible_comments AS child ON child.parent_comment_id = parent.id
    WHERE parent.post_id = p_post_id
      AND parent.status = 'deleted'
  )
  SELECT
    comment.id,
    comment.post_id,
    comment.parent_comment_id,
    comment.depth,
    CASE WHEN comment.status = 'deleted' THEN '삭제된 댓글입니다.' ELSE comment.body END,
    CASE WHEN comment.status = 'deleted' THEN '익명' ELSE comment.author_alias END,
    comment.status = 'published' AND comment.author_user_id = v_user_id,
    comment.status = 'deleted',
    comment.created_at,
    CASE WHEN comment.status = 'deleted' THEN 0 ELSE (
      SELECT count(*) FROM public.community_comment_reactions AS reaction
      WHERE reaction.comment_id = comment.id AND reaction.reaction = 'like'
    ) END,
    comment.status = 'published' AND EXISTS (
      SELECT 1 FROM public.community_comment_reactions AS reaction
      WHERE reaction.comment_id = comment.id
        AND reaction.user_id = v_user_id
        AND reaction.reaction = 'like'
    ),
    CASE WHEN comment.status = 'deleted' THEN 0 ELSE (
      SELECT count(*) FROM public.community_comment_reactions AS reaction
      WHERE reaction.comment_id = comment.id AND reaction.reaction = 'dislike'
    ) END,
    comment.status = 'published' AND EXISTS (
      SELECT 1 FROM public.community_comment_reactions AS reaction
      WHERE reaction.comment_id = comment.id
        AND reaction.user_id = v_user_id
        AND reaction.reaction = 'dislike'
    )
  FROM public.community_post_comments AS comment
  JOIN visible_comments AS visible ON visible.id = comment.id
  ORDER BY comment.created_at ASC
  LIMIT greatest(1, least(coalesce(p_limit, 100), 100));
END;
$$;

CREATE FUNCTION public.create_community_post_comment(
  p_post_id UUID,
  p_body TEXT,
  p_parent_comment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_school TEXT;
  v_comment public.community_post_comments%ROWTYPE;
  parent public.community_post_comments%ROWTYPE;
  v_depth SMALLINT := 0;
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

  IF p_parent_comment_id IS NOT NULL THEN
    SELECT * INTO parent
    FROM public.community_post_comments AS candidate
    WHERE candidate.id = p_parent_comment_id
    FOR SHARE;

    IF NOT FOUND OR parent.post_id <> p_post_id OR parent.status <> 'published' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_parent_comment';
    END IF;
    IF parent.depth >= 2 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reply_depth_exceeded';
    END IF;
    v_depth := parent.depth + 1;
  END IF;

  IF NOT private.consume_community_action_rate_limit(
    v_user_id,
    'comment_create',
    6,
    interval '1 minute'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rate_limited';
  END IF;

  INSERT INTO public.community_post_comments (
    post_id,
    author_user_id,
    parent_comment_id,
    depth,
    body,
    author_alias
  ) VALUES (
    p_post_id,
    v_user_id,
    p_parent_comment_id,
    v_depth,
    btrim(p_body),
    '익명'
  )
  RETURNING * INTO v_comment;

  RETURN jsonb_build_object(
    'id', v_comment.id,
    'post_id', v_comment.post_id,
    'parent_comment_id', v_comment.parent_comment_id,
    'depth', v_comment.depth,
    'body', v_comment.body,
    'author_alias', v_comment.author_alias,
    'is_author', true,
    'is_deleted', false,
    'created_at', v_comment.created_at,
    'like_count', 0,
    'liked_by_me', false,
    'dislike_count', 0,
    'disliked_by_me', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_community_comment_reaction(
  p_post_id UUID,
  p_comment_id UUID,
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

  IF v_school IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'profile_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.community_post_comments AS comment
    JOIN public.community_posts AS post ON post.id = comment.post_id
    WHERE comment.id = p_comment_id
      AND comment.post_id = p_post_id
      AND comment.status = 'published'
      AND post.school = v_school
      AND post.status = 'published'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'comment_not_found';
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
  FROM public.community_comment_reactions
  WHERE comment_id = p_comment_id AND user_id = v_user_id
  FOR UPDATE;

  IF v_existing = p_reaction THEN
    DELETE FROM public.community_comment_reactions
    WHERE comment_id = p_comment_id
      AND user_id = v_user_id
      AND reaction = p_reaction;
    v_current := NULL;
  ELSE
    INSERT INTO public.community_comment_reactions (comment_id, user_id, reaction)
    VALUES (p_comment_id, v_user_id, p_reaction)
    ON CONFLICT (comment_id, user_id)
    DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now();
    v_current := p_reaction;
  END IF;

  SELECT
    count(*) FILTER (WHERE reaction = 'like'),
    count(*) FILTER (WHERE reaction = 'dislike')
  INTO v_like_count, v_dislike_count
  FROM public.community_comment_reactions
  WHERE comment_id = p_comment_id;

  RETURN jsonb_build_object(
    'reaction', v_current,
    'liked', v_current = 'like',
    'disliked', v_current = 'dislike',
    'like_count', v_like_count,
    'dislike_count', v_dislike_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_community_post_comments(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_community_post_comment(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.toggle_community_comment_reaction(UUID, UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_community_post_comments(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_post_comment(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_community_comment_reaction(UUID, UUID, TEXT) TO authenticated;

COMMENT ON COLUMN public.community_post_comments.parent_comment_id IS
  'Optional parent comment. Replies are limited to depth 2 (three visual levels).';
COMMENT ON TABLE public.community_comment_reactions IS
  'One mutually exclusive like or dislike reaction per authenticated user and comment.';

COMMIT;
