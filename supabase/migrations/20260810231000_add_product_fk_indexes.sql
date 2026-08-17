CREATE INDEX IF NOT EXISTS activity_meetups_host_user_id_idx
  ON public.activity_meetups (host_user_id);

CREATE INDEX IF NOT EXISTS community_post_likes_user_id_idx
  ON public.community_post_likes (user_id);

CREATE INDEX IF NOT EXISTS community_posts_meetup_id_idx
  ON public.community_posts (meetup_id);
