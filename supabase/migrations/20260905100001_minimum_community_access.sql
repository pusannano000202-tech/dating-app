-- Forward-only compatibility for minimum community members who deliberately
-- have no legacy male/female matching profile row.

BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.get_community_identity(p_user_id UUID)
RETURNS TABLE (school TEXT, display_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT candidate.school, candidate.display_name
  FROM (
    SELECT '부산대학교'::TEXT AS school, companion.display_name, 0 AS priority
    FROM quantum_private.community_member_profiles AS companion
    CROSS JOIN quantum_private.resolve_profile_readiness(p_user_id) AS readiness
    WHERE companion.user_id = p_user_id AND readiness.minimum_signup_complete
    UNION ALL
    SELECT profile.school, profile.display_name, 1 AS priority
    FROM public.profiles AS profile
    WHERE profile.user_id = p_user_id
      AND pg_catalog.length(pg_catalog.btrim(profile.school)) > 0
  ) AS candidate
  ORDER BY candidate.priority
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION quantum_private.get_community_identity(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_activity_meetups(
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID, category TEXT, title TEXT, description TEXT, place_name TEXT,
  scheduled_at TIMESTAMPTZ, capacity SMALLINT, status TEXT, member_count BIGINT,
  joined BOOLEAN, is_host BOOLEAN, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID := auth.uid(); v_school TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'profile_required'; END IF;
  RETURN QUERY
  SELECT meetup.id, meetup.category, meetup.title, meetup.description, meetup.place_name,
    meetup.scheduled_at, meetup.capacity, meetup.status,
    count(member.user_id) FILTER (WHERE member.status = 'joined'),
    bool_or(member.user_id = v_user_id AND member.status = 'joined'),
    meetup.host_user_id = v_user_id, meetup.created_at
  FROM public.activity_meetups AS meetup
  LEFT JOIN public.activity_meetup_members AS member ON member.meetup_id = meetup.id
  WHERE meetup.school = v_school AND meetup.status IN ('open', 'full')
    AND meetup.scheduled_at > now() AND (p_category IS NULL OR meetup.category = p_category)
  GROUP BY meetup.id
  ORDER BY meetup.scheduled_at, meetup.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 50));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_activity_meetup(
  p_category TEXT, p_title TEXT, p_description TEXT, p_place_name TEXT,
  p_scheduled_at TIMESTAMPTZ, p_capacity INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID := auth.uid(); v_school TEXT; v_meetup public.activity_meetups%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'profile_required'; END IF;
  IF p_category IS NULL OR p_category NOT IN (
    'baseball','soccer','basketball','badminton','tennis','running','board_game',
    'gaming','hiking','walking','dining','study','other'
  ) THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_category'; END IF;
  IF char_length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 60 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_title'; END IF;
  IF char_length(btrim(coalesce(p_description, ''))) > 500 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_description'; END IF;
  IF char_length(btrim(coalesce(p_place_name, ''))) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_place'; END IF;
  IF p_capacity IS NULL OR p_capacity NOT BETWEEN 2 AND 20 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_capacity'; END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at < now() + interval '30 minutes' THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'schedule_too_soon'; END IF;
  INSERT INTO public.activity_meetups (host_user_id, school, category, title, description, place_name, scheduled_at, capacity)
  VALUES (v_user_id, v_school, p_category, btrim(p_title), btrim(coalesce(p_description, '')), btrim(p_place_name), p_scheduled_at, p_capacity)
  RETURNING * INTO v_meetup;
  INSERT INTO public.activity_meetup_members (meetup_id, user_id, role) VALUES (v_meetup.id, v_user_id, 'host');
  RETURN jsonb_build_object('id',v_meetup.id,'category',v_meetup.category,'title',v_meetup.title,
    'description',v_meetup.description,'place_name',v_meetup.place_name,'scheduled_at',v_meetup.scheduled_at,
    'capacity',v_meetup.capacity,'status',v_meetup.status,'member_count',1,'joined',true,'is_host',true,'created_at',v_meetup.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_activity_meetup(p_meetup_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID := auth.uid(); v_school TEXT; v_meetup public.activity_meetups%ROWTYPE; v_member_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'profile_required'; END IF;
  SELECT * INTO v_meetup FROM public.activity_meetups WHERE activity_meetups.id = p_meetup_id FOR UPDATE;
  IF v_meetup.id IS NULL OR v_meetup.school IS DISTINCT FROM v_school THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'meetup_not_found'; END IF;
  IF v_meetup.status NOT IN ('open','full') OR v_meetup.scheduled_at <= now() THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meetup_closed'; END IF;
  IF EXISTS (SELECT 1 FROM public.activity_meetup_members WHERE meetup_id=p_meetup_id AND user_id=v_user_id AND status='joined') THEN
    RETURN jsonb_build_object('joined',true,'reused',true);
  END IF;
  SELECT count(*) INTO v_member_count FROM public.activity_meetup_members WHERE meetup_id=p_meetup_id AND status='joined';
  IF v_member_count >= v_meetup.capacity THEN
    UPDATE public.activity_meetups SET status='full',updated_at=now() WHERE id=p_meetup_id;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'meetup_full';
  END IF;
  INSERT INTO public.activity_meetup_members (meetup_id,user_id,role,status,joined_at,left_at)
  VALUES (p_meetup_id,v_user_id,'member','joined',now(),NULL)
  ON CONFLICT (meetup_id,user_id) DO UPDATE SET role='member',status='joined',joined_at=now(),left_at=NULL;
  v_member_count := v_member_count + 1;
  UPDATE public.activity_meetups SET status=CASE WHEN v_member_count>=capacity THEN 'full' ELSE 'open' END,updated_at=now() WHERE id=p_meetup_id;
  RETURN jsonb_build_object('joined',true,'reused',false,'member_count',v_member_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_community_posts(p_category TEXT, p_limit INTEGER DEFAULT 30)
RETURNS TABLE (
  id UUID, category TEXT, title TEXT, body TEXT, author_alias TEXT, is_author BOOLEAN,
  created_at TIMESTAMPTZ, like_count BIGINT, liked_by_me BOOLEAN,
  dislike_count BIGINT, disliked_by_me BOOLEAN, comment_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID := auth.uid(); v_school TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='profile_required'; END IF;
  RETURN QUERY SELECT post.id,post.category,post.title,post.body,post.author_alias,
    post.author_user_id=v_user_id,post.created_at,
    (SELECT count(*) FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.reaction='like'),
    EXISTS(SELECT 1 FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.user_id=v_user_id AND reaction.reaction='like'),
    (SELECT count(*) FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.reaction='dislike'),
    EXISTS(SELECT 1 FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.user_id=v_user_id AND reaction.reaction='dislike'),
    (SELECT count(*) FROM public.community_post_comments comment WHERE comment.post_id=post.id AND comment.status='published')
  FROM public.community_posts post
  WHERE post.school=v_school AND post.category=p_category AND post.status='published'
  ORDER BY post.created_at DESC LIMIT greatest(1,least(coalesce(p_limit,30),50));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hot_community_posts(p_limit INTEGER DEFAULT 30)
RETURNS TABLE (
  id UUID, category TEXT, title TEXT, body TEXT, author_alias TEXT, is_author BOOLEAN,
  created_at TIMESTAMPTZ, like_count BIGINT, liked_by_me BOOLEAN,
  dislike_count BIGINT, disliked_by_me BOOLEAN, comment_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID := auth.uid(); v_school TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='profile_required'; END IF;
  RETURN QUERY SELECT post.id,post.category,post.title,post.body,post.author_alias,
    post.author_user_id=v_user_id,post.created_at,
    (SELECT count(*) FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.reaction='like') AS like_count,
    EXISTS(SELECT 1 FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.user_id=v_user_id AND reaction.reaction='like'),
    (SELECT count(*) FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.reaction='dislike') AS dislike_count,
    EXISTS(SELECT 1 FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.user_id=v_user_id AND reaction.reaction='dislike'),
    (SELECT count(*) FROM public.community_post_comments comment WHERE comment.post_id=post.id AND comment.status='published')
  FROM public.community_posts post
  WHERE post.school=v_school AND post.status='published' AND post.created_at>=now()-interval '7 days'
  ORDER BY
    ((SELECT count(*) FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.reaction='like')
      -(SELECT count(*) FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.reaction='dislike')) DESC,
    (SELECT count(*) FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.reaction='like') DESC,
    post.created_at DESC
  LIMIT greatest(1,least(coalesce(p_limit,30),50));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_community_post(p_post_id UUID)
RETURNS TABLE (
  id UUID, category TEXT, title TEXT, body TEXT, author_alias TEXT, is_author BOOLEAN,
  created_at TIMESTAMPTZ, like_count BIGINT, liked_by_me BOOLEAN,
  dislike_count BIGINT, disliked_by_me BOOLEAN, comment_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID := auth.uid(); v_school TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='profile_required'; END IF;
  RETURN QUERY SELECT post.id,post.category,post.title,post.body,post.author_alias,
    post.author_user_id=v_user_id,post.created_at,
    (SELECT count(*) FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.reaction='like'),
    EXISTS(SELECT 1 FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.user_id=v_user_id AND reaction.reaction='like'),
    (SELECT count(*) FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.reaction='dislike'),
    EXISTS(SELECT 1 FROM public.community_post_likes reaction WHERE reaction.post_id=post.id AND reaction.user_id=v_user_id AND reaction.reaction='dislike'),
    (SELECT count(*) FROM public.community_post_comments comment WHERE comment.post_id=post.id AND comment.status='published')
  FROM public.community_posts post
  WHERE post.id=p_post_id AND post.school=v_school AND post.status='published';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_community_post(p_category TEXT,p_title TEXT,p_body TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID := auth.uid(); v_school TEXT; v_post public.community_posts%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='profile_required'; END IF;
  IF p_category IS NULL OR p_category NOT IN ('feedback','meetup-review','relationship-advice','relationship-coach') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_category'; END IF;
  IF char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 4 AND 80 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_title'; END IF;
  IF char_length(btrim(coalesce(p_body,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_body'; END IF;
  IF NOT private.consume_community_action_rate_limit(v_user_id,'post_create',3,interval '10 minutes') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='rate_limited'; END IF;
  INSERT INTO public.community_posts(author_user_id,school,category,title,body)
  VALUES(v_user_id,v_school,p_category,btrim(p_title),btrim(p_body)) RETURNING * INTO v_post;
  RETURN jsonb_build_object('id',v_post.id,'category',v_post.category,'title',v_post.title,'body',v_post.body,
    'author_alias',v_post.author_alias,'is_author',true,'created_at',v_post.created_at,
    'like_count',0,'liked_by_me',false,'dislike_count',0,'disliked_by_me',false,'comment_count',0);
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_community_post_reaction(p_post_id UUID,p_reaction TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID:=auth.uid(); v_school TEXT; v_existing TEXT; v_current TEXT; v_like_count BIGINT; v_dislike_count BIGINT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  IF p_reaction NOT IN ('like','dislike') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_reaction'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='profile_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.community_posts post WHERE post.id=p_post_id AND post.school=v_school AND post.status='published') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='post_not_found'; END IF;
  IF NOT private.consume_community_action_rate_limit(v_user_id,'reaction_toggle',30,interval '1 minute') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='rate_limited'; END IF;
  SELECT reaction INTO v_existing FROM public.community_post_likes WHERE post_id=p_post_id AND user_id=v_user_id FOR UPDATE;
  IF v_existing=p_reaction THEN
    DELETE FROM public.community_post_likes WHERE post_id=p_post_id AND user_id=v_user_id AND reaction=p_reaction; v_current:=NULL;
  ELSE
    INSERT INTO public.community_post_likes(post_id,user_id,reaction) VALUES(p_post_id,v_user_id,p_reaction)
    ON CONFLICT(post_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction,created_at=now(); v_current:=p_reaction;
  END IF;
  SELECT count(*) FILTER(WHERE reaction='like'),count(*) FILTER(WHERE reaction='dislike')
  INTO v_like_count,v_dislike_count FROM public.community_post_likes WHERE post_id=p_post_id;
  RETURN jsonb_build_object('reaction',v_current,'liked',v_current='like','disliked',v_current='dislike','like_count',v_like_count,'dislike_count',v_dislike_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_community_post_comments(p_post_id UUID,p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  id UUID, post_id UUID, parent_comment_id UUID, depth SMALLINT, body TEXT,
  author_alias TEXT, is_author BOOLEAN, is_deleted BOOLEAN, created_at TIMESTAMPTZ,
  like_count BIGINT, liked_by_me BOOLEAN, dislike_count BIGINT, disliked_by_me BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID:=auth.uid(); v_school TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='profile_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.community_posts post WHERE post.id=p_post_id AND post.school=v_school AND post.status='published') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='post_not_found'; END IF;
  RETURN QUERY
  WITH RECURSIVE visible_comments AS (
    SELECT comment.id,comment.parent_comment_id FROM public.community_post_comments comment
    WHERE comment.post_id=p_post_id AND comment.status='published'
    UNION
    SELECT parent.id,parent.parent_comment_id FROM public.community_post_comments parent
    JOIN visible_comments child ON child.parent_comment_id=parent.id
    WHERE parent.post_id=p_post_id AND parent.status='deleted'
  )
  SELECT comment.id,comment.post_id,comment.parent_comment_id,comment.depth,
    CASE WHEN comment.status='deleted' THEN '삭제된 댓글입니다.' ELSE comment.body END,
    CASE WHEN comment.status='deleted' THEN '익명' ELSE comment.author_alias END,
    comment.status='published' AND comment.author_user_id=v_user_id,comment.status='deleted',comment.created_at,
    CASE WHEN comment.status='deleted' THEN 0 ELSE (SELECT count(*) FROM public.community_comment_reactions reaction WHERE reaction.comment_id=comment.id AND reaction.reaction='like') END,
    comment.status='published' AND EXISTS(SELECT 1 FROM public.community_comment_reactions reaction WHERE reaction.comment_id=comment.id AND reaction.user_id=v_user_id AND reaction.reaction='like'),
    CASE WHEN comment.status='deleted' THEN 0 ELSE (SELECT count(*) FROM public.community_comment_reactions reaction WHERE reaction.comment_id=comment.id AND reaction.reaction='dislike') END,
    comment.status='published' AND EXISTS(SELECT 1 FROM public.community_comment_reactions reaction WHERE reaction.comment_id=comment.id AND reaction.user_id=v_user_id AND reaction.reaction='dislike')
  FROM public.community_post_comments comment JOIN visible_comments visible ON visible.id=comment.id
  ORDER BY comment.created_at LIMIT greatest(1,least(coalesce(p_limit,100),100));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_community_post_comment(
  p_post_id UUID,p_body TEXT,p_parent_comment_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id UUID:=auth.uid(); v_school TEXT; v_comment public.community_post_comments%ROWTYPE;
  parent public.community_post_comments%ROWTYPE; v_depth SMALLINT:=0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='profile_required'; END IF;
  IF char_length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_comment'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.community_posts post WHERE post.id=p_post_id AND post.school=v_school AND post.status='published') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='post_not_found'; END IF;
  IF p_parent_comment_id IS NOT NULL THEN
    SELECT * INTO parent FROM public.community_post_comments candidate WHERE candidate.id=p_parent_comment_id FOR SHARE;
    IF NOT FOUND OR parent.post_id<>p_post_id OR parent.status<>'published' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_parent_comment'; END IF;
    IF parent.depth>=2 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reply_depth_exceeded'; END IF;
    v_depth:=parent.depth+1;
  END IF;
  IF NOT private.consume_community_action_rate_limit(v_user_id,'comment_create',6,interval '1 minute') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='rate_limited'; END IF;
  INSERT INTO public.community_post_comments(post_id,author_user_id,parent_comment_id,depth,body,author_alias)
  VALUES(p_post_id,v_user_id,p_parent_comment_id,v_depth,btrim(p_body),'익명') RETURNING * INTO v_comment;
  RETURN jsonb_build_object('id',v_comment.id,'post_id',v_comment.post_id,'parent_comment_id',v_comment.parent_comment_id,
    'depth',v_comment.depth,'body',v_comment.body,'author_alias',v_comment.author_alias,'is_author',true,
    'is_deleted',false,'created_at',v_comment.created_at,'like_count',0,'liked_by_me',false,'dislike_count',0,'disliked_by_me',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_community_comment_reaction(p_post_id UUID,p_comment_id UUID,p_reaction TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID:=auth.uid(); v_school TEXT; v_existing TEXT; v_current TEXT; v_like_count BIGINT; v_dislike_count BIGINT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  IF p_reaction NOT IN ('like','dislike') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_reaction'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='profile_required'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.community_post_comments comment JOIN public.community_posts post ON post.id=comment.post_id
    WHERE comment.id=p_comment_id AND comment.post_id=p_post_id AND comment.status='published'
      AND post.school=v_school AND post.status='published'
  ) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='comment_not_found'; END IF;
  IF NOT private.consume_community_action_rate_limit(v_user_id,'reaction_toggle',30,interval '1 minute') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='rate_limited'; END IF;
  SELECT reaction INTO v_existing FROM public.community_comment_reactions WHERE comment_id=p_comment_id AND user_id=v_user_id FOR UPDATE;
  IF v_existing=p_reaction THEN
    DELETE FROM public.community_comment_reactions WHERE comment_id=p_comment_id AND user_id=v_user_id AND reaction=p_reaction; v_current:=NULL;
  ELSE
    INSERT INTO public.community_comment_reactions(comment_id,user_id,reaction) VALUES(p_comment_id,v_user_id,p_reaction)
    ON CONFLICT(comment_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction,created_at=now(); v_current:=p_reaction;
  END IF;
  SELECT count(*) FILTER(WHERE reaction='like'),count(*) FILTER(WHERE reaction='dislike')
  INTO v_like_count,v_dislike_count FROM public.community_comment_reactions WHERE comment_id=p_comment_id;
  RETURN jsonb_build_object('reaction',v_current,'liked',v_current='like','disliked',v_current='dislike','like_count',v_like_count,'dislike_count',v_dislike_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_reviewable_meetups(p_limit INTEGER DEFAULT 30)
RETURNS TABLE(id UUID,title TEXT,category TEXT,place_name TEXT,scheduled_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID:=auth.uid(); v_school TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='profile_required'; END IF;
  RETURN QUERY SELECT meetup.id,meetup.title,meetup.category,meetup.place_name,meetup.scheduled_at
  FROM public.activity_meetup_members member JOIN public.activity_meetups meetup ON meetup.id=member.meetup_id
  WHERE member.user_id=v_user_id AND member.status='joined' AND meetup.school=v_school
    AND meetup.status<>'cancelled' AND meetup.scheduled_at<=now()
    AND NOT EXISTS(SELECT 1 FROM public.community_posts post WHERE post.author_user_id=v_user_id
      AND post.meetup_id=meetup.id AND post.category='meetup-review' AND post.status='published')
  ORDER BY meetup.scheduled_at DESC LIMIT greatest(1,least(coalesce(p_limit,30),50));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_meetup_review(p_meetup_id UUID,p_title TEXT,p_body TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id UUID:=auth.uid(); v_school TEXT; v_meetup public.activity_meetups%ROWTYPE; v_post public.community_posts%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
  SELECT identity.school INTO v_school FROM quantum_private.get_community_identity(v_user_id) AS identity;
  IF v_school IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='profile_required'; END IF;
  IF p_meetup_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_meetup'; END IF;
  IF char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 4 AND 80 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_title'; END IF;
  IF char_length(btrim(coalesce(p_body,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_body'; END IF;
  SELECT meetup.* INTO v_meetup FROM public.activity_meetups meetup
  JOIN public.activity_meetup_members member ON member.meetup_id=meetup.id AND member.user_id=v_user_id AND member.status='joined'
  WHERE meetup.id=p_meetup_id AND meetup.school=v_school AND meetup.status<>'cancelled' AND meetup.scheduled_at<=now();
  IF v_meetup.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='verified_participation_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.community_posts post WHERE post.author_user_id=v_user_id AND post.meetup_id=p_meetup_id AND post.category='meetup-review' AND post.status='published') THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='review_already_exists'; END IF;
  INSERT INTO public.community_posts(author_user_id,school,category,title,body,meetup_id)
  VALUES(v_user_id,v_school,'meetup-review',btrim(p_title),btrim(p_body),p_meetup_id) RETURNING * INTO v_post;
  RETURN jsonb_build_object('id',v_post.id,'category',v_post.category,'title',v_post.title,'body',v_post.body,
    'author_alias',v_post.author_alias,'is_author',true,'created_at',v_post.created_at,
    'like_count',0,'liked_by_me',false,'meetup_id',v_meetup.id,'meetup_title',v_meetup.title);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='review_already_exists';
END;
$$;

REVOKE ALL ON FUNCTION public.list_activity_meetups(TEXT,INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_activity_meetup(TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.join_activity_meetup(UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_community_posts(TEXT,INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_hot_community_posts(INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_community_post(UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_community_post(TEXT,TEXT,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.toggle_community_post_reaction(UUID,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_community_post_comments(UUID,INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_community_post_comment(UUID,TEXT,UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.toggle_community_comment_reaction(UUID,UUID,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_reviewable_meetups(INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_meetup_review(UUID,TEXT,TEXT) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.list_activity_meetups(TEXT,INTEGER),public.create_activity_meetup(TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,INTEGER),public.join_activity_meetup(UUID),public.list_community_posts(TEXT,INTEGER),public.list_hot_community_posts(INTEGER),public.get_community_post(UUID),public.create_community_post(TEXT,TEXT,TEXT),public.toggle_community_post_reaction(UUID,TEXT),public.list_community_post_comments(UUID,INTEGER),public.create_community_post_comment(UUID,TEXT,UUID),public.toggle_community_comment_reaction(UUID,UUID,TEXT),public.list_reviewable_meetups(INTEGER),public.create_meetup_review(UUID,TEXT,TEXT) TO authenticated;

COMMIT;
