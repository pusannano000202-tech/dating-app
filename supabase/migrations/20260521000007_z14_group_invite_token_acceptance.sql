-- RPC helpers for accepting group invite links.
-- Table RLS stays strict; this exposes only the token acceptance transition.

CREATE OR REPLACE FUNCTION public.get_group_invite_by_token(
  p_token TEXT
)
RETURNS TABLE (
  invite_id UUID,
  group_id UUID,
  group_name TEXT,
  group_size INT,
  group_status TEXT,
  invite_status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gi.id,
    gi.group_id,
    g.name,
    g.size,
    g.status,
    gi.status,
    gi.expires_at
  FROM group_invites gi
  JOIN groups g ON g.id = gi.group_id
  WHERE gi.token = p_token
    AND gi.status = 'pending'
    AND gi.expires_at > NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_group_invite_by_token(
  p_token TEXT
)
RETURNS TABLE (
  invite_id UUID,
  group_id UUID,
  member_user_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite group_invites%ROWTYPE;
  v_group groups%ROWTYPE;
  v_active_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_invite
    FROM group_invites
   WHERE token = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_not_pending';
  END IF;

  IF v_invite.expires_at <= NOW() THEN
    PERFORM set_config('app.bypass_group_invites_guard', 'on', TRUE);

    UPDATE group_invites
       SET status = 'expired'
     WHERE id = v_invite.id;

    PERFORM set_config('app.bypass_group_invites_guard', 'off', TRUE);
    RAISE EXCEPTION 'invite_expired';
  END IF;

  IF v_invite.invited_user_id IS NOT NULL
     AND v_invite.invited_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'invite_not_for_user';
  END IF;

  SELECT *
    INTO v_group
    FROM groups
   WHERE id = v_invite.group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_not_open';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM group_members gm
   WHERE gm.group_id = v_invite.group_id
     AND gm.left_at IS NULL;

  IF v_active_count >= v_group.size THEN
    RAISE EXCEPTION 'group_full';
  END IF;

  PERFORM set_config('app.bypass_group_invites_guard', 'on', TRUE);

  UPDATE group_invites
     SET status = 'accepted',
         invited_user_id = COALESCE(invited_user_id, auth.uid())
   WHERE id = v_invite.id;

  PERFORM set_config('app.bypass_group_invites_guard', 'off', TRUE);

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_invite.group_id, auth.uid(), 'member');

  RETURN QUERY
  SELECT v_invite.id, v_invite.group_id, auth.uid(), 'accepted'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_group_invites_update()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.bypass_group_invites_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.group_id            IS DISTINCT FROM OLD.group_id
     OR NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id
     OR NEW.invited_phone      IS DISTINCT FROM OLD.invited_phone
     OR NEW.invited_user_id    IS DISTINCT FROM OLD.invited_user_id
     OR NEW.token              IS DISTINCT FROM OLD.token
     OR NEW.expires_at         IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at         IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'group_invites: users may only change status';
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'group_invites: only pending invites may be changed by users';
  END IF;

  IF OLD.invited_user_id IS DISTINCT FROM auth.uid()
     OR NEW.status NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'group_invites: invitee may only accept or decline';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_group_invite_by_token(TEXT) IS
  'Returns safe pending group invite details for an invite token.';

COMMENT ON FUNCTION public.accept_group_invite_by_token(TEXT) IS
  'Accepts a pending group invite token for auth.uid() and inserts group_members.';
