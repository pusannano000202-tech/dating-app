-- New Supabase projects do not automatically expose public tables through the
-- Data API. Grant only the operations already protected by authenticated RLS
-- policies; service-only and policy-less tables remain inaccessible.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON TABLE
  public.admins,
  public.app_config,
  public.appearance_score_audits,
  public.attendances,
  public.connections,
  public.deposit_refund_requests,
  public.deposits,
  public.friend_requests,
  public.friendships,
  public.group_invites,
  public.group_members,
  public.groups,
  public.match_card_submissions,
  public.match_chat_messages,
  public.match_continuation_choices,
  public.match_pool,
  public.matches,
  public.notifications,
  public.photos,
  public.pre_match_card_drafts,
  public.profile_display_name_claims,
  public.profiles,
  public.reviews,
  public.users,
  public.worldcup_choice_logs
TO authenticated;

GRANT INSERT ON TABLE
  public.attendances,
  public.connections,
  public.deposit_refund_requests,
  public.deposits,
  public.friend_requests,
  public.friendships,
  public.group_invites,
  public.group_members,
  public.match_card_submissions,
  public.match_chat_messages,
  public.match_continuation_choices,
  public.notifications,
  public.photos,
  public.pre_match_card_drafts,
  public.profiles,
  public.reviews,
  public.users,
  public.worldcup_choice_logs
TO authenticated;

GRANT UPDATE ON TABLE
  public.attendances,
  public.connections,
  public.deposit_refund_requests,
  public.deposits,
  public.friend_requests,
  public.friendships,
  public.group_invites,
  public.group_members,
  public.match_card_submissions,
  public.match_chat_messages,
  public.match_continuation_choices,
  public.notifications,
  public.photos,
  public.pre_match_card_drafts,
  public.profiles,
  public.users
TO authenticated;

GRANT DELETE ON TABLE
  public.connections,
  public.deposit_refund_requests,
  public.deposits,
  public.friendships,
  public.group_invites,
  public.match_chat_messages,
  public.match_continuation_choices,
  public.notifications,
  public.photos,
  public.pre_match_card_drafts,
  public.profiles,
  public.users
TO authenticated;

GRANT SELECT ON TABLE public.profiles_public TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.worldcup_choice_logs_id_seq TO authenticated;
