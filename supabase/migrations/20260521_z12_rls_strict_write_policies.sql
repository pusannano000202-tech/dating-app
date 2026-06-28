-- Migration: strict RLS write policies for friend/group/match queue tables
-- Owner: Chunhyun
-- Decision: Codex review #2 + 2026-05-21 PM follow-up
-- Date: 2026-05-21
--
-- This file intentionally uses the `_z...` prefix so it sorts after:
--   - 20260521_matching_create_core_tables.sql
--   - 20260521_profile_add_preference_vectors.sql
--
-- Goals:
--   1. Replace broad friend_requests update policy so a sender cannot mark
--      their own request as accepted.
--   2. Allow friendships insert only from an accepted friend request.
--   3. Allow group_members insert only through leader self-add or accepted
--      group invite paths, while preserving history via left_at.
--   4. Prevent inviter-side forged group invite acceptance.
--   5. Let users create/cancel queue entries without touching engine-owned
--      columns such as batch_id and rollover_count.
--
-- Longer-term preferred design: move all writes to SECURITY DEFINER RPCs.
-- This migration is the stricter table-policy bridge until that is built.

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER avoids self-recursive RLS when group_members policies need
-- to check membership in group_members.

CREATE OR REPLACE FUNCTION public.is_group_member(
  p_group_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_group_member(
  p_group_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = auth.uid()
      AND gm.left_at IS NULL
  );
$$;

-- Remove the self-referential read policy from the original migration.
DROP POLICY IF EXISTS "group_members_self_read" ON group_members;
CREATE POLICY "group_members_self_read" ON group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_group_member(group_id)
  );

-- ---------------------------------------------------------------------------
-- friend_requests
-- ---------------------------------------------------------------------------
-- Original policy allowed sender or receiver to update any request column.
-- That lets a sender forge status='accepted'. Replace it with role-specific
-- update policies plus a trigger that enforces status transitions.

DROP POLICY IF EXISTS "friend_requests_participant_update" ON friend_requests;

CREATE POLICY "friend_requests_sender_cancel_update" ON friend_requests
  FOR UPDATE TO authenticated
  USING (sender_user_id = auth.uid())
  WITH CHECK (sender_user_id = auth.uid());

CREATE POLICY "friend_requests_receiver_respond_update" ON friend_requests
  FOR UPDATE TO authenticated
  USING (receiver_user_id = auth.uid())
  WITH CHECK (receiver_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_friend_requests_update()
RETURNS TRIGGER AS $$
BEGIN
  -- service_role / direct DB maintenance has no user claim and may repair rows.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id               IS DISTINCT FROM OLD.id
     OR NEW.sender_user_id   IS DISTINCT FROM OLD.sender_user_id
     OR NEW.receiver_user_id IS DISTINCT FROM OLD.receiver_user_id
     OR NEW.receiver_phone   IS DISTINCT FROM OLD.receiver_phone
     OR NEW.token            IS DISTINCT FROM OLD.token
     OR NEW.message          IS DISTINCT FROM OLD.message
     OR NEW.expires_at       IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at       IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'friend_requests: users may only change status/responded_at';
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'friend_requests: only pending requests may be changed by users';
  END IF;

  IF OLD.sender_user_id = auth.uid() THEN
    IF NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'friend_requests: sender may only cancel';
    END IF;
  ELSIF OLD.receiver_user_id = auth.uid() THEN
    IF NEW.status NOT IN ('accepted', 'declined') THEN
      RAISE EXCEPTION 'friend_requests: receiver may only accept or decline';
    END IF;
  ELSE
    RAISE EXCEPTION 'friend_requests: update not allowed';
  END IF;

  NEW.responded_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_friend_requests_guard_update ON friend_requests;
CREATE TRIGGER trg_friend_requests_guard_update
  BEFORE UPDATE ON friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_friend_requests_update();

-- ---------------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------------
-- Client-created friendships must be tied to an accepted friend request.

DROP POLICY IF EXISTS "friendships_participant_insert" ON friendships;
DROP POLICY IF EXISTS "friendships_participant_update" ON friendships;
DROP POLICY IF EXISTS "friendships_participant_delete" ON friendships;

CREATE POLICY "friendships_via_accepted_request_insert" ON friendships
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() OR friend_user_id = auth.uid())
    AND created_from_request_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM friend_requests fr
      WHERE fr.id = friendships.created_from_request_id
        AND fr.status = 'accepted'
        AND (
          (fr.sender_user_id = friendships.user_id        AND fr.receiver_user_id = friendships.friend_user_id)
          OR
          (fr.sender_user_id = friendships.friend_user_id AND fr.receiver_user_id = friendships.user_id)
        )
    )
  );

CREATE POLICY "friendships_participant_update" ON friendships
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR friend_user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR friend_user_id = auth.uid());

CREATE POLICY "friendships_participant_delete" ON friendships
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR friend_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_friendships_update()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id                  IS DISTINCT FROM OLD.user_id
     OR NEW.friend_user_id          IS DISTINCT FROM OLD.friend_user_id
     OR NEW.created_from_request_id IS DISTINCT FROM OLD.created_from_request_id
     OR NEW.created_at              IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'friendships: users may only change status';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_friendships_guard_update ON friendships;
CREATE TRIGGER trg_friendships_guard_update
  BEFORE UPDATE ON friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_friendships_update();

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------
-- Insert paths:
--   1. group leader adds self as leader immediately after creating group
--   2. invitee with accepted invite adds self as member
--   3. leader adds an invited user after that user's invite was accepted

DROP POLICY IF EXISTS "group_members_self_or_leader_insert" ON group_members;
DROP POLICY IF EXISTS "group_members_self_or_leader_update" ON group_members;
DROP POLICY IF EXISTS "group_members_self_or_leader_delete" ON group_members;

CREATE POLICY "group_members_strict_insert" ON group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    left_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM groups g
      WHERE g.id = group_members.group_id
        AND g.status IN ('forming', 'ready')
    )
    AND (
      (
        role = 'leader'
        AND user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM groups g
          WHERE g.id = group_members.group_id
            AND g.leader_user_id = auth.uid()
        )
      )
      OR (
        role = 'member'
        AND user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM group_invites gi
          WHERE gi.group_id = group_members.group_id
            AND gi.invited_user_id = auth.uid()
            AND gi.status = 'accepted'
        )
      )
      OR (
        role = 'member'
        AND EXISTS (
          SELECT 1
          FROM groups g
          WHERE g.id = group_members.group_id
            AND g.leader_user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1
          FROM group_invites gi
          WHERE gi.group_id = group_members.group_id
            AND gi.invited_user_id = group_members.user_id
            AND gi.status = 'accepted'
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.guard_group_members_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_group_size INT;
  v_active_count INT;
BEGIN
  IF NEW.left_at IS NOT NULL THEN
    RAISE EXCEPTION 'group_members: new memberships must start active';
  END IF;

  SELECT g.size
    INTO v_group_size
    FROM groups g
   WHERE g.id = NEW.group_id
   FOR UPDATE;

  IF v_group_size IS NULL THEN
    RAISE EXCEPTION 'group_members: group not found';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM group_members gm
   WHERE gm.group_id = NEW.group_id
     AND gm.left_at IS NULL;

  IF v_active_count >= v_group_size THEN
    RAISE EXCEPTION 'group_members: group is already full';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_group_members_guard_insert ON group_members;
CREATE TRIGGER trg_group_members_guard_insert
  BEFORE INSERT ON group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_group_members_insert();

CREATE POLICY "group_members_self_or_leader_update" ON group_members
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM groups g
      WHERE g.id = group_members.group_id
        AND g.leader_user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM groups g
      WHERE g.id = group_members.group_id
        AND g.leader_user_id = auth.uid()
    )
  );

-- No client DELETE policy. Leave/kick keeps history by setting left_at.

CREATE OR REPLACE FUNCTION public.guard_group_members_update()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.group_id  IS DISTINCT FROM OLD.group_id
     OR NEW.user_id   IS DISTINCT FROM OLD.user_id
     OR NEW.role      IS DISTINCT FROM OLD.role
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'group_members: users may only change left_at';
  END IF;

  IF OLD.left_at IS NOT NULL OR NEW.left_at IS NULL THEN
    RAISE EXCEPTION 'group_members: users may only set left_at once';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_group_members_guard_update ON group_members;
CREATE TRIGGER trg_group_members_guard_update
  BEFORE UPDATE ON group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_group_members_update();

-- ---------------------------------------------------------------------------
-- group_invites
-- ---------------------------------------------------------------------------
-- Original insert policy did not know about left_at. Recreate it so former
-- members cannot keep issuing invites.

DROP POLICY IF EXISTS "group_invites_member_insert" ON group_invites;
DROP POLICY IF EXISTS "group_invites_participant_update" ON group_invites;
DROP POLICY IF EXISTS "group_invites_inviter_delete" ON group_invites;

CREATE POLICY "group_invites_active_member_insert" ON group_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by_user_id = auth.uid()
    AND public.is_active_group_member(group_id)
    AND EXISTS (
      SELECT 1
      FROM groups g
      WHERE g.id = group_invites.group_id
        AND g.status IN ('forming', 'ready')
    )
  );

CREATE POLICY "group_invites_invitee_respond_update" ON group_invites
  FOR UPDATE TO authenticated
  USING (invited_user_id = auth.uid())
  WITH CHECK (invited_user_id = auth.uid());

CREATE POLICY "group_invites_inviter_delete" ON group_invites
  FOR DELETE TO authenticated
  USING (invited_by_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_group_invites_update()
RETURNS TRIGGER AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_group_invites_guard_update ON group_invites;
CREATE TRIGGER trg_group_invites_guard_update
  BEFORE UPDATE ON group_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_group_invites_update();

-- ---------------------------------------------------------------------------
-- match_pool
-- ---------------------------------------------------------------------------
-- Users may create a waiting entry for their active group and may cancel it.
-- The matching engine owns matched/expired/rolled_over/batch fields.

DROP POLICY IF EXISTS "match_pool_member_insert" ON match_pool;
DROP POLICY IF EXISTS "match_pool_member_update" ON match_pool;
DROP POLICY IF EXISTS "match_pool_member_cancel_update" ON match_pool;

CREATE POLICY "match_pool_member_insert" ON match_pool
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'waiting'
    AND left_at IS NULL
    AND batch_id IS NULL
    AND rollover_count = 0
    AND public.is_active_group_member(group_id)
    AND EXISTS (
      SELECT 1
      FROM groups g
      WHERE g.id = match_pool.group_id
        AND g.status = 'ready'
    )
  );

CREATE POLICY "match_pool_member_cancel_update" ON match_pool
  FOR UPDATE TO authenticated
  USING (public.is_active_group_member(group_id))
  WITH CHECK (public.is_active_group_member(group_id));

CREATE OR REPLACE FUNCTION public.guard_match_pool_update()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      OLD.status IN ('waiting', 'rolled_over')
      AND NEW.status = 'cancelled'
    ) THEN
      RAISE EXCEPTION 'match_pool: users may only transition waiting/rolled_over -> cancelled';
    END IF;
  END IF;

  IF NEW.group_id        IS DISTINCT FROM OLD.group_id
     OR NEW.entered_at     IS DISTINCT FROM OLD.entered_at
     OR NEW.left_at        IS DISTINCT FROM OLD.left_at
     OR NEW.rollover_count IS DISTINCT FROM OLD.rollover_count
     OR NEW.batch_id       IS DISTINCT FROM OLD.batch_id
     OR NEW.notes          IS DISTINCT FROM OLD.notes THEN
    RAISE EXCEPTION 'match_pool: protected columns may only be set by service_role';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_match_pool_guard_update ON match_pool;
CREATE TRIGGER trg_match_pool_guard_update
  BEFORE UPDATE ON match_pool
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_match_pool_update();

COMMENT ON FUNCTION public.is_group_member(UUID) IS
  'RLS helper: true when auth.uid() has any historical membership in a group.';
COMMENT ON FUNCTION public.is_active_group_member(UUID) IS
  'RLS helper: true when auth.uid() has an active membership in a group.';
COMMENT ON FUNCTION public.guard_friend_requests_update() IS
  'Prevents request sender from forging accepted status; receiver may accept/decline only.';
COMMENT ON POLICY "friendships_via_accepted_request_insert" ON friendships IS
  'Allows friendship row creation only when tied to an accepted friend request.';
COMMENT ON FUNCTION public.guard_group_members_insert() IS
  'Enforces active group capacity using groups.size.';
COMMENT ON POLICY "group_members_strict_insert" ON group_members IS
  'Allows leader self-add and accepted-invite membership paths only.';
COMMENT ON POLICY "group_invites_invitee_respond_update" ON group_invites IS
  'Only invited_user can accept/decline a pending group invite.';
COMMENT ON POLICY "match_pool_member_insert" ON match_pool IS
  'Only active members of ready groups can create a new waiting queue entry.';
COMMENT ON FUNCTION public.guard_match_pool_update() IS
  'Users can only cancel queue entries; engine-owned columns remain service_role-only.';
