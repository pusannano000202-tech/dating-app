BEGIN;

CREATE SCHEMA IF NOT EXISTS quantum_private;
REVOKE ALL ON SCHEMA quantum_private FROM PUBLIC, anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION quantum_private.match_setup_ready(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT
      p.personality_preference_completed_at IS NOT NULL
      AND CASE
        WHEN jsonb_typeof(p.available_timeslots -> 'slots') = 'array'
        THEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p.available_timeslots -> 'slots') AS slot_value(slot)
          WHERE jsonb_typeof(slot_value.slot) = 'object'
            AND btrim(slot_value.slot ->> 'day') <> ''
            AND btrim(slot_value.slot ->> 'start') <> ''
            AND btrim(slot_value.slot ->> 'end') <> ''
        )
        ELSE FALSE
      END
      AND CASE
        WHEN jsonb_typeof(p.preference_weights) = 'object'
          AND p.preference_weights ?& ARRAY[
            'appearance', 'personality', 'height', 'body_type'
          ]::TEXT[]
          AND jsonb_typeof(p.preference_weights -> 'appearance') = 'number'
          AND jsonb_typeof(p.preference_weights -> 'personality') = 'number'
          AND jsonb_typeof(p.preference_weights -> 'height') = 'number'
          AND jsonb_typeof(p.preference_weights -> 'body_type') = 'number'
        THEN
          (SELECT count(*) = 4 FROM jsonb_object_keys(p.preference_weights))
          AND (p.preference_weights ->> 'appearance')::NUMERIC >= 0
          AND (p.preference_weights ->> 'personality')::NUMERIC >= 0
          AND (p.preference_weights ->> 'height')::NUMERIC >= 0
          AND (p.preference_weights ->> 'body_type')::NUMERIC >= 0
          AND abs(
            (p.preference_weights ->> 'appearance')::NUMERIC
            + (p.preference_weights ->> 'personality')::NUMERIC
            + (p.preference_weights ->> 'height')::NUMERIC
            + (p.preference_weights ->> 'body_type')::NUMERIC
            - 1.0
          ) <= 0.01
        ELSE FALSE
      END
    FROM public.profiles AS p
    WHERE p.user_id = p_user_id
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION quantum_private.match_setup_ready(UUID)
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.match_card_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_card_submissions_select_participants
  ON public.match_card_submissions;
DROP POLICY IF EXISTS match_card_submissions_select_self
  ON public.match_card_submissions;

CREATE POLICY match_card_submissions_select_self
  ON public.match_card_submissions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.match_card_submissions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.match_card_submissions
  TO authenticated;
GRANT ALL ON TABLE public.match_card_submissions TO service_role;

ALTER TABLE public.match_member_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS match_member_aliases_select_viewer_group_members
  ON public.match_member_aliases;
REVOKE ALL ON TABLE public.match_member_aliases
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.match_member_aliases TO service_role;

ALTER TABLE public.match_daily_card_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS match_daily_card_schedule_select_viewer_group_members
  ON public.match_daily_card_schedule;
REVOKE ALL ON TABLE public.match_daily_card_schedule
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.match_daily_card_schedule TO service_role;

CREATE OR REPLACE FUNCTION public.create_group_with_leader(
  p_name TEXT,
  p_size INTEGER
)
RETURNS SETOF public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_gender TEXT;
  v_group public.groups%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_size IS NULL OR p_size NOT IN (2, 3) THEN
    RAISE EXCEPTION 'invalid_group_size';
  END IF;

  PERFORM 1
  FROM public.users AS app_user
  WHERE app_user.id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.group_members AS member
    WHERE member.user_id = v_uid
      AND member.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'already_in_group';
  END IF;

  SELECT profile.gender::TEXT
  INTO v_gender
  FROM public.profiles AS profile
  WHERE profile.user_id = v_uid;

  IF v_gender IS NULL OR v_gender NOT IN ('male', 'female') THEN
    RAISE EXCEPTION 'profile_gender_required';
  END IF;

  INSERT INTO public.groups (leader_user_id, name, size, gender, status)
  VALUES (
    v_uid,
    CASE
      WHEN p_name IS NULL OR btrim(p_name) = '' THEN NULL
      ELSE btrim(p_name)
    END,
    p_size,
    v_gender,
    'forming'
  )
  RETURNING *
  INTO v_group;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group.id, v_uid, 'leader');

  RETURN NEXT v_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_group_size(
  p_group_id UUID,
  p_size INTEGER
)
RETURNS SETOF public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_group public.groups%ROWTYPE;
  v_member_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_size IS NULL OR p_size NOT IN (2, 3) THEN
    RAISE EXCEPTION 'invalid_group_size';
  END IF;

  SELECT group_row.*
  INTO v_group
  FROM public.groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;
  IF v_group.leader_user_id <> v_uid THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;
  IF v_group.status <> 'forming' THEN
    RAISE EXCEPTION 'group_not_editable';
  END IF;

  SELECT count(*)
  INTO v_member_count
  FROM public.group_members AS member
  WHERE member.group_id = p_group_id
    AND member.left_at IS NULL;

  IF v_member_count > p_size THEN
    RAISE EXCEPTION 'group_size_below_member_count';
  END IF;

  UPDATE public.groups
  SET size = p_size,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_group_id
  RETURNING *
  INTO v_group;

  RETURN NEXT v_group;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group_with_leader(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_group_size(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_with_leader(TEXT, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_group_size(UUID, INTEGER)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.enter_match_pool(p_group_id UUID)
RETURNS TABLE (
  pool_id UUID,
  group_id UUID,
  group_status TEXT,
  pool_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_group public.groups%ROWTYPE;
  v_member_count INTEGER;
  v_pool_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT group_row.*
  INTO v_group
  FROM public.groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;
  IF v_group.leader_user_id <> v_uid THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;
  IF v_group.status <> 'forming' THEN
    RAISE EXCEPTION 'group_not_open';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members AS member
    WHERE member.group_id = p_group_id
      AND member.user_id = v_uid
      AND member.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'group_membership_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_pool AS pool
    WHERE pool.group_id = p_group_id
      AND pool.status IN ('waiting', 'rolled_over')
  ) THEN
    RAISE EXCEPTION 'already_in_queue';
  END IF;

  SELECT count(*)
  INTO v_member_count
  FROM public.group_members AS member
  WHERE member.group_id = p_group_id
    AND member.left_at IS NULL;

  IF v_member_count < 2 THEN
    RAISE EXCEPTION 'not_enough_members';
  END IF;
  IF v_member_count <> v_group.size THEN
    RAISE EXCEPTION 'group_not_full';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.group_members AS member
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL
      AND NOT quantum_private.match_setup_ready(member.user_id)
  ) THEN
    RAISE EXCEPTION 'member_match_setup_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.group_members AS member
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.pre_match_card_drafts AS draft
        WHERE draft.user_id = member.user_id
          AND draft.completed_items >= 4
      )
  ) THEN
    RAISE EXCEPTION 'member_pre_match_card_incomplete';
  END IF;

  UPDATE public.groups
  SET status = 'ready',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_group_id;

  INSERT INTO public.match_pool (group_id, status, rollover_count, batch_id)
  VALUES (p_group_id, 'waiting', 0, NULL)
  RETURNING id
  INTO v_pool_id;

  RETURN QUERY
  SELECT v_pool_id, p_group_id, 'ready'::TEXT, 'waiting'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.enter_match_pool(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enter_match_pool(UUID) TO authenticated;

DROP POLICY IF EXISTS "groups_leader_write" ON public.groups;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.groups
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "match_pool_member_insert" ON public.match_pool;
DROP POLICY IF EXISTS "match_pool_member_cancel_update" ON public.match_pool;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.match_pool
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.populate_match_member_aliases(UUID)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.handle_match_member_aliases_after_insert()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.assign_match_daily_card_schedule(UUID)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.expire_missed_match_daily_cards(UUID)
  SET search_path TO pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.populate_match_member_aliases(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_match_member_aliases_after_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_match_daily_card_schedule(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_missed_match_daily_cards(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.populate_match_member_aliases(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_match_daily_card_schedule(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_missed_match_daily_cards(UUID)
  TO service_role;

ALTER FUNCTION public.get_match_daily_cards(UUID)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.pick_match_daily_card(UUID, SMALLINT)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.get_group_pre_match_card_readiness(UUID)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.cancel_match_pool(UUID)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.leave_group(UUID)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.disband_group(UUID)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.transfer_group_leadership(UUID, UUID)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.remove_group_member(UUID, UUID)
  SET search_path TO pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.get_match_daily_cards(UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pick_match_daily_card(UUID, SMALLINT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_group_pre_match_card_readiness(UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_match_pool(UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_group(UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disband_group(UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_group_leadership(UUID, UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_group_member(UUID, UUID)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_match_daily_cards(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pick_match_daily_card(UUID, SMALLINT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_pre_match_card_readiness(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_match_pool(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_group(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.disband_group(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_group_leadership(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID)
  TO authenticated;

COMMIT;
