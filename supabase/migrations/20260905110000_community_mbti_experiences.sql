BEGIN;

CREATE SCHEMA IF NOT EXISTS quantum_private;

CREATE TABLE public.community_mbti_participants (
  owner_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  self_mbti TEXT NOT NULL CHECK (self_mbti IN (
    'ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP',
    'ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ'
  )),
  self_gender TEXT NOT NULL CHECK (self_gender IN (
    'male','female','other_or_undisclosed','unknown'
  )),
  consent_version TEXT NOT NULL CHECK (consent_version = 'community_mbti_v1'),
  consent_confirmed_at TIMESTAMPTZ NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.community_mbti_experiences (
  experience_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.community_mbti_participants(owner_user_id) ON DELETE CASCADE,
  self_mbti_snapshot TEXT NOT NULL CHECK (self_mbti_snapshot IN (
    'ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP',
    'ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ'
  )),
  partner_mbti TEXT NOT NULL CHECK (partner_mbti IN (
    'ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP',
    'ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ','UNKNOWN'
  )),
  partner_gender TEXT NOT NULL CHECK (partner_gender IN (
    'male','female','other_or_undisclosed','unknown'
  )),
  relationship_status TEXT NOT NULL CHECK (relationship_status IN ('past','current')),
  entry_mode TEXT NOT NULL CHECK (entry_mode IN ('count_only','detailed')),
  reported_count INTEGER NOT NULL CHECK (reported_count BETWEEN 1 AND 100),
  score SMALLINT CHECK (score BETWEEN 1 AND 5),
  matched_aspects TEXT[],
  client_mutation_id TEXT NOT NULL CHECK (client_mutation_id ~ '^[A-Za-z0-9:_-]{8,128}$'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (
    (entry_mode = 'count_only' AND score IS NULL AND matched_aspects IS NULL)
    OR
    (entry_mode = 'detailed' AND reported_count = 1)
  ),
  CHECK (
    matched_aspects IS NULL OR matched_aspects <@ ARRAY[
      'conversation','contact','conflict','lifestyle','values'
    ]::TEXT[]
  )
);

CREATE INDEX community_mbti_count_bundle_lookup
  ON public.community_mbti_experiences (
    owner_user_id,
    self_mbti_snapshot,
    partner_mbti,
    partner_gender,
    relationship_status
  )
  WHERE entry_mode = 'count_only';

CREATE UNIQUE INDEX community_mbti_experience_mutation_unique
  ON public.community_mbti_experiences (owner_user_id, client_mutation_id);

CREATE INDEX community_mbti_experiences_owner_page
  ON public.community_mbti_experiences (owner_user_id, experience_id);

CREATE INDEX community_mbti_experiences_expiry
  ON public.community_mbti_experiences (expires_at);

CREATE TABLE public.community_mbti_meeting_stats_consents (
  owner_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  self_mbti_snapshot TEXT NOT NULL CHECK (self_mbti_snapshot IN (
    'ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP',
    'ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ'
  )),
  self_gender_snapshot TEXT NOT NULL CHECK (self_gender_snapshot IN (
    'male','female','other_or_undisclosed','unknown'
  )),
  consent_version TEXT NOT NULL CHECK (consent_version = 'community_mbti_meeting_stats_v1'),
  consent_confirmed_at TIMESTAMPTZ NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX community_mbti_meeting_consent_expiry
  ON public.community_mbti_meeting_stats_consents (consent_confirmed_at);

CREATE TABLE quantum_private.community_mbti_idempotency_keys (
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_mutation_id TEXT NOT NULL CHECK (client_mutation_id ~ '^[A-Za-z0-9:_-]{8,128}$'),
  mutation_kind TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_envelope JSONB NOT NULL CHECK (jsonb_typeof(result_envelope) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (owner_user_id, client_mutation_id)
);

CREATE TABLE quantum_private.community_mbti_source_epoch (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  epoch BIGINT NOT NULL DEFAULT 0 CHECK (epoch >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

INSERT INTO quantum_private.community_mbti_source_epoch (singleton, epoch)
VALUES (TRUE, 0);

CREATE TABLE quantum_private.community_mbti_deletion_tombstones (
  tombstone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  deletion_scope TEXT NOT NULL CHECK (deletion_scope IN ('survey','experience','meeting_stats')),
  target_experience_id UUID,
  deleted_before TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp() + INTERVAL '30 days',
  CHECK ((deletion_scope = 'experience') = (target_experience_id IS NOT NULL))
);

CREATE INDEX community_mbti_tombstones_expiry
  ON quantum_private.community_mbti_deletion_tombstones (expires_at);

CREATE TABLE public.community_mbti_public_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  privacy_policy_version TEXT NOT NULL CHECK (privacy_policy_version = 'community_mbti_public_v1'),
  status TEXT NOT NULL CHECK (status IN ('published','insufficient_sample','suppressed')),
  self_reported JSONB NOT NULL,
  meeting_stats_status TEXT NOT NULL CHECK (meeting_stats_status IN ('unavailable','insufficient_sample','published')),
  meeting_stats JSONB,
  source_epoch BIGINT NOT NULL CHECK (source_epoch >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  CHECK (expires_at = generated_at + INTERVAL '24 hours'),
  CHECK (meeting_stats_status = 'published' OR meeting_stats IS NULL)
);

CREATE INDEX community_mbti_public_snapshot_latest
  ON public.community_mbti_public_snapshots (generated_at DESC);

ALTER TABLE public.community_mbti_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_mbti_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_mbti_meeting_stats_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_mbti_public_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.community_mbti_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.community_mbti_source_epoch ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.community_mbti_deletion_tombstones ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_mbti_participant_owner_select
  ON public.community_mbti_participants FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_user_id);
CREATE POLICY community_mbti_participant_owner_update
  ON public.community_mbti_participants FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_user_id)
  WITH CHECK ((select auth.uid()) = owner_user_id);
CREATE POLICY community_mbti_participant_owner_delete
  ON public.community_mbti_participants FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_user_id);

CREATE POLICY community_mbti_experience_owner_select
  ON public.community_mbti_experiences FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_user_id);
CREATE POLICY community_mbti_experience_owner_update
  ON public.community_mbti_experiences FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_user_id)
  WITH CHECK ((select auth.uid()) = owner_user_id);
CREATE POLICY community_mbti_experience_owner_delete
  ON public.community_mbti_experiences FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_user_id);

CREATE POLICY community_mbti_meeting_consent_owner_select
  ON public.community_mbti_meeting_stats_consents FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_user_id);
CREATE POLICY community_mbti_meeting_consent_owner_update
  ON public.community_mbti_meeting_stats_consents FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_user_id)
  WITH CHECK ((select auth.uid()) = owner_user_id);
CREATE POLICY community_mbti_meeting_consent_owner_delete
  ON public.community_mbti_meeting_stats_consents FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_user_id);

REVOKE ALL ON TABLE public.community_mbti_participants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.community_mbti_experiences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.community_mbti_meeting_stats_consents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.community_mbti_public_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE quantum_private.community_mbti_idempotency_keys FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE quantum_private.community_mbti_source_epoch FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE quantum_private.community_mbti_deletion_tombstones FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_mbti_participants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_mbti_experiences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_mbti_meeting_stats_consents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_mbti_public_snapshots TO service_role;

CREATE OR REPLACE FUNCTION quantum_private.bump_community_mbti_source_epoch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE quantum_private.community_mbti_source_epoch
  SET epoch = epoch + 1,
      updated_at = pg_catalog.statement_timestamp()
  WHERE singleton;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.bump_community_mbti_source_epoch()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER community_mbti_participants_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.community_mbti_participants
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_participants_update_source_epoch
AFTER UPDATE ON public.community_mbti_participants
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_experiences_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.community_mbti_experiences
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_experiences_update_source_epoch
AFTER UPDATE ON public.community_mbti_experiences
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_meeting_consents_insert_delete_source_epoch
AFTER INSERT OR DELETE ON public.community_mbti_meeting_stats_consents
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_meeting_consents_update_source_epoch
AFTER UPDATE ON public.community_mbti_meeting_stats_consents
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_eligibility_profile_insert_delete_source_epoch
AFTER INSERT OR DELETE ON quantum_private.community_member_profiles
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_eligibility_profile_update_source_epoch
AFTER UPDATE ON quantum_private.community_member_profiles
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE TRIGGER community_mbti_eligibility_auth_source_epoch
AFTER UPDATE OF phone, phone_confirmed_at ON auth.users
FOR EACH STATEMENT EXECUTE FUNCTION quantum_private.bump_community_mbti_source_epoch();

CREATE OR REPLACE FUNCTION quantum_private.community_mbti_existing_receipt(
  p_actor UUID,
  p_client_mutation_id TEXT,
  p_mutation_kind TEXT,
  p_request_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = quantum_private, pg_temp
AS $$
DECLARE
  v_key quantum_private.community_mbti_idempotency_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key
  FROM quantum_private.community_mbti_idempotency_keys
  WHERE owner_user_id = p_actor
    AND client_mutation_id = p_client_mutation_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_key.mutation_kind <> p_mutation_kind OR v_key.request_hash <> p_request_hash THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;
  RETURN v_key.result_envelope;
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.community_mbti_save_receipt(
  p_actor UUID,
  p_client_mutation_id TEXT,
  p_mutation_kind TEXT,
  p_request_hash TEXT,
  p_result_envelope JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = quantum_private, pg_temp
AS $$
BEGIN
  IF p_result_envelope IS NULL
     OR pg_catalog.jsonb_typeof(p_result_envelope) <> 'object'
     OR NOT (p_result_envelope ?& ARRAY['status','resource_id','resource_ids','revision'])
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_object_keys(p_result_envelope) AS key
       WHERE key <> ALL (ARRAY['status','resource_id','resource_ids','revision'])
     )
     OR p_result_envelope->>'status' NOT IN ('saved','deleted','expanded','withdrawn')
     OR pg_catalog.jsonb_typeof(p_result_envelope->'revision') <> 'number'
     OR (p_result_envelope->>'revision') !~ '^[0-9]+$'
     OR pg_catalog.jsonb_typeof(p_result_envelope->'resource_ids') <> 'array'
     OR (
       p_result_envelope->'resource_id' <> 'null'::JSONB
       AND pg_catalog.jsonb_typeof(p_result_envelope->'resource_id') <> 'string'
     )
  THEN
    RAISE EXCEPTION 'invalid_idempotency_result_envelope';
  END IF;

  INSERT INTO quantum_private.community_mbti_idempotency_keys (
    owner_user_id, client_mutation_id, mutation_kind, request_hash, result_envelope
  ) VALUES (
    p_actor, p_client_mutation_id, p_mutation_kind, p_request_hash,
    p_result_envelope
  );
EXCEPTION WHEN unique_violation THEN
  IF quantum_private.community_mbti_existing_receipt(
    p_actor, p_client_mutation_id, p_mutation_kind, p_request_hash
  ) IS NULL THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.community_mbti_existing_receipt(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.community_mbti_save_receipt(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION quantum_private.community_mbti_require_minimum_signup(
  p_member_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM quantum_private.resolve_profile_readiness(p_member_user_id) AS readiness
    WHERE readiness.minimum_signup_complete
  ) THEN
    RAISE EXCEPTION 'minimum_signup_required';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.community_mbti_require_minimum_signup(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.community_mbti_get_my_state(
  p_limit INTEGER DEFAULT 25,
  p_cursor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_owner_user_id UUID := (select auth.uid());
  v_participant JSONB;
  v_experiences JSONB;
  v_next_cursor UUID;
  v_meeting_consent JSONB;
  v_experience public.community_mbti_experiences%ROWTYPE;
BEGIN
  IF v_owner_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN RAISE EXCEPTION 'invalid_limit'; END IF;

  SELECT to_jsonb(participant) INTO v_participant
  FROM public.community_mbti_participants AS participant
  WHERE participant.owner_user_id = v_owner_user_id
    AND participant.consent_confirmed_at + INTERVAL '90 days' > statement_timestamp();

  v_experiences := '[]'::JSONB;
  FOR v_experience IN
    SELECT experience.*
    FROM public.community_mbti_experiences AS experience
    JOIN public.community_mbti_participants AS participant
      ON participant.owner_user_id = experience.owner_user_id
    WHERE experience.owner_user_id = v_owner_user_id
      AND (p_cursor IS NULL OR experience.experience_id > p_cursor)
      AND experience.expires_at > statement_timestamp()
      AND participant.consent_confirmed_at + INTERVAL '90 days' > statement_timestamp()
    ORDER BY experience.experience_id
    LIMIT p_limit
  LOOP
    v_experiences := v_experiences || jsonb_build_array(to_jsonb(v_experience));
  END LOOP;

  SELECT experience_id INTO v_next_cursor
  FROM public.community_mbti_experiences
  WHERE owner_user_id = v_owner_user_id
    AND (p_cursor IS NULL OR experience_id > p_cursor)
    AND expires_at > statement_timestamp()
  ORDER BY experience_id
  OFFSET p_limit - 1 LIMIT 1;
  IF v_next_cursor IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.community_mbti_experiences
    WHERE owner_user_id = v_owner_user_id
      AND experience_id > v_next_cursor
      AND expires_at > statement_timestamp()
  ) THEN
    v_next_cursor := NULL;
  END IF;

  SELECT to_jsonb(consent) INTO v_meeting_consent
  FROM public.community_mbti_meeting_stats_consents AS consent
  WHERE consent.owner_user_id = v_owner_user_id
    AND consent.consent_confirmed_at + INTERVAL '90 days' > statement_timestamp();

  RETURN jsonb_build_object(
    'participant', v_participant,
    'experiences', v_experiences,
    'next_cursor', v_next_cursor,
    'meeting_stats_consent', v_meeting_consent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mbti_upsert_participant(
  p_self_mbti TEXT,
  p_self_gender TEXT,
  p_consent_version TEXT,
  p_expected_revision INTEGER,
  p_client_mutation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_owner_user_id UUID := (select auth.uid());
  v_existing public.community_mbti_participants%ROWTYPE;
  v_saved public.community_mbti_participants%ROWTYPE;
  v_hash TEXT;
  v_receipt JSONB;
BEGIN
  IF v_owner_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_self_mbti NOT IN ('ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP','ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ') THEN RAISE EXCEPTION 'invalid_self_mbti'; END IF;
  IF p_self_gender NOT IN ('male','female','other_or_undisclosed','unknown') THEN RAISE EXCEPTION 'invalid_self_gender'; END IF;
  IF p_consent_version <> 'community_mbti_v1' THEN RAISE EXCEPTION 'invalid_consent_version'; END IF;
  v_hash := md5(jsonb_build_array(p_self_mbti, p_self_gender, p_consent_version, p_expected_revision)::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended('community-mbti-owner:' || v_owner_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_user_id::TEXT || ':' || p_client_mutation_id, 0));
  v_receipt := quantum_private.community_mbti_existing_receipt(v_owner_user_id, p_client_mutation_id, 'participant_upsert', v_hash);
  IF v_receipt IS NOT NULL THEN RETURN v_receipt; END IF;
  PERFORM quantum_private.community_mbti_require_minimum_signup(v_owner_user_id);

  SELECT * INTO v_existing FROM public.community_mbti_participants
  WHERE owner_user_id = v_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_revision <> 0 THEN RAISE EXCEPTION 'stale_revision'; END IF;
    INSERT INTO public.community_mbti_participants (
      owner_user_id, self_mbti, self_gender, consent_version, consent_confirmed_at, revision
    ) VALUES (
      v_owner_user_id, p_self_mbti, p_self_gender, p_consent_version, statement_timestamp(), 1
    ) RETURNING * INTO v_saved;
  ELSE
    IF v_existing.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
    UPDATE public.community_mbti_participants SET
      self_mbti = p_self_mbti,
      self_gender = p_self_gender,
      consent_version = p_consent_version,
      consent_confirmed_at = statement_timestamp(),
      revision = revision + 1,
      updated_at = statement_timestamp()
    WHERE owner_user_id = v_owner_user_id AND revision = p_expected_revision
    RETURNING * INTO v_saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;
  END IF;
  v_receipt := jsonb_build_object(
    'status', 'saved',
    'resource_id', NULL,
    'resource_ids', '[]'::JSONB,
    'revision', v_saved.revision
  );
  PERFORM quantum_private.community_mbti_save_receipt(v_owner_user_id, p_client_mutation_id, 'participant_upsert', v_hash, v_receipt);
  RETURN v_receipt;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mbti_create_experience(
  p_self_mbti_snapshot TEXT,
  p_partner_mbti TEXT,
  p_partner_gender TEXT,
  p_relationship_status TEXT,
  p_entry_mode TEXT,
  p_reported_count INTEGER,
  p_score SMALLINT,
  p_matched_aspects TEXT[],
  p_client_mutation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_owner_user_id UUID := (select auth.uid());
  v_participant public.community_mbti_participants%ROWTYPE;
  v_saved public.community_mbti_experiences%ROWTYPE;
  v_hash TEXT;
  v_receipt JSONB;
BEGIN
  IF v_owner_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_partner_mbti NOT IN ('ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP','ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ','UNKNOWN') THEN RAISE EXCEPTION 'invalid_partner_mbti'; END IF;
  IF p_partner_gender NOT IN ('male','female','other_or_undisclosed','unknown') THEN RAISE EXCEPTION 'invalid_partner_gender'; END IF;
  IF p_relationship_status NOT IN ('past','current') THEN RAISE EXCEPTION 'invalid_relationship_status'; END IF;
  IF p_entry_mode NOT IN ('count_only','detailed') OR p_reported_count < 1 OR p_reported_count > 100 THEN RAISE EXCEPTION 'invalid_entry'; END IF;
  IF p_entry_mode = 'count_only' AND (p_score IS NOT NULL OR p_matched_aspects IS NOT NULL) THEN RAISE EXCEPTION 'invalid_count_only_detail'; END IF;
  IF p_entry_mode = 'detailed' AND p_reported_count <> 1 THEN RAISE EXCEPTION 'invalid_detailed_count'; END IF;
  IF p_score IS NOT NULL AND (p_score < 1 OR p_score > 5) THEN RAISE EXCEPTION 'invalid_score'; END IF;
  IF p_matched_aspects IS NOT NULL AND NOT (p_matched_aspects <@ ARRAY['conversation','contact','conflict','lifestyle','values']::TEXT[]) THEN RAISE EXCEPTION 'invalid_matched_aspects'; END IF;
  IF p_matched_aspects IS NOT NULL AND cardinality(p_matched_aspects) <> (
    SELECT count(DISTINCT aspect) FROM unnest(p_matched_aspects) AS aspect
  ) THEN RAISE EXCEPTION 'duplicate_matched_aspects'; END IF;

  v_hash := md5(jsonb_build_array(p_self_mbti_snapshot, p_partner_mbti, p_partner_gender, p_relationship_status, p_entry_mode, p_reported_count, p_score, p_matched_aspects)::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended('community-mbti-owner:' || v_owner_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_user_id::TEXT || ':' || p_client_mutation_id, 0));
  v_receipt := quantum_private.community_mbti_existing_receipt(v_owner_user_id, p_client_mutation_id, 'experience_create', v_hash);
  IF v_receipt IS NOT NULL THEN RETURN v_receipt; END IF;
  PERFORM quantum_private.community_mbti_require_minimum_signup(v_owner_user_id);

  SELECT * INTO v_participant FROM public.community_mbti_participants
  WHERE owner_user_id = v_owner_user_id
    AND consent_confirmed_at + INTERVAL '90 days' > statement_timestamp()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_participant_required'; END IF;
  IF p_self_mbti_snapshot <> v_participant.self_mbti THEN RAISE EXCEPTION 'self_mbti_snapshot_mismatch'; END IF;

  INSERT INTO public.community_mbti_experiences (
    owner_user_id, self_mbti_snapshot, partner_mbti, partner_gender,
    relationship_status, entry_mode, reported_count, score,
    matched_aspects, client_mutation_id, expires_at
  ) VALUES (
    v_owner_user_id, p_self_mbti_snapshot, p_partner_mbti, p_partner_gender,
    p_relationship_status, p_entry_mode, p_reported_count, p_score,
    CASE WHEN p_matched_aspects IS NULL THEN NULL ELSE ARRAY(SELECT DISTINCT unnest(p_matched_aspects)) END,
    p_client_mutation_id,
    LEAST(v_participant.consent_confirmed_at + INTERVAL '90 days', statement_timestamp() + INTERVAL '90 days')
  ) RETURNING * INTO v_saved;
  v_receipt := jsonb_build_object(
    'status', 'saved',
    'resource_id', v_saved.experience_id,
    'resource_ids', jsonb_build_array(v_saved.experience_id),
    'revision', v_saved.revision
  );
  PERFORM quantum_private.community_mbti_save_receipt(
    v_owner_user_id, p_client_mutation_id, 'experience_create', v_hash,
    v_receipt
  );
  RETURN v_receipt;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mbti_update_experience(
  p_experience_id UUID,
  p_expected_revision INTEGER,
  p_patch JSONB,
  p_client_mutation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_owner_user_id UUID := (select auth.uid());
  v_experience public.community_mbti_experiences%ROWTYPE;
  v_saved public.community_mbti_experiences%ROWTYPE;
  v_hash TEXT;
  v_receipt JSONB;
  v_self_mbti_snapshot TEXT;
  v_reported_count INTEGER;
  v_partner_gender TEXT;
  v_relationship_status TEXT;
  v_score SMALLINT;
  v_aspects TEXT[];
BEGIN
  IF v_owner_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::JSONB THEN RAISE EXCEPTION 'invalid_patch'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS key
    WHERE key NOT IN (
      'self_mbti_snapshot','confirm_self_snapshot_change','reported_count',
      'partner_gender','relationship_status','score','matched_aspects'
    )
  ) THEN RAISE EXCEPTION 'invalid_patch_field'; END IF;
  IF (p_patch ? 'self_mbti_snapshot') <> (p_patch ? 'confirm_self_snapshot_change')
    OR ((p_patch ? 'confirm_self_snapshot_change') AND p_patch->'confirm_self_snapshot_change' <> 'true'::JSONB)
  THEN RAISE EXCEPTION 'self_mbti_snapshot_change_requires_confirmation'; END IF;
  v_hash := md5(jsonb_build_array(p_experience_id, p_expected_revision, p_patch)::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended('community-mbti-owner:' || v_owner_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_user_id::TEXT || ':' || p_client_mutation_id, 0));
  v_receipt := quantum_private.community_mbti_existing_receipt(v_owner_user_id, p_client_mutation_id, 'experience_update', v_hash);
  IF v_receipt IS NOT NULL THEN RETURN v_receipt; END IF;
  PERFORM quantum_private.community_mbti_require_minimum_signup(v_owner_user_id);

  SELECT * INTO v_experience FROM public.community_mbti_experiences
  WHERE experience_id = p_experience_id AND owner_user_id = v_owner_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'experience_not_found'; END IF;
  IF v_experience.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;

  v_self_mbti_snapshot := CASE WHEN p_patch ? 'self_mbti_snapshot' THEN p_patch->>'self_mbti_snapshot' ELSE v_experience.self_mbti_snapshot END;
  v_reported_count := CASE WHEN p_patch ? 'reported_count' THEN (p_patch->>'reported_count')::INTEGER ELSE v_experience.reported_count END;
  v_partner_gender := CASE WHEN p_patch ? 'partner_gender' THEN p_patch->>'partner_gender' ELSE v_experience.partner_gender END;
  v_relationship_status := CASE WHEN p_patch ? 'relationship_status' THEN p_patch->>'relationship_status' ELSE v_experience.relationship_status END;
  v_score := CASE WHEN p_patch ? 'score' THEN (p_patch->>'score')::SMALLINT ELSE v_experience.score END;
  IF p_patch ? 'matched_aspects' THEN
    IF p_patch->'matched_aspects' = 'null'::JSONB THEN
      v_aspects := NULL;
    ELSIF jsonb_typeof(p_patch->'matched_aspects') = 'array' THEN
      SELECT ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_patch->'matched_aspects')) INTO v_aspects;
    ELSE
      RAISE EXCEPTION 'invalid_matched_aspects';
    END IF;
  ELSE
    v_aspects := v_experience.matched_aspects;
  END IF;
  IF v_self_mbti_snapshot NOT IN ('ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP','ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ') THEN RAISE EXCEPTION 'invalid_self_mbti_snapshot'; END IF;
  IF v_reported_count < 1 OR v_reported_count > 100 THEN RAISE EXCEPTION 'invalid_reported_count'; END IF;
  IF v_partner_gender NOT IN ('male','female','other_or_undisclosed','unknown') THEN RAISE EXCEPTION 'invalid_partner_gender'; END IF;
  IF v_relationship_status NOT IN ('past','current') THEN RAISE EXCEPTION 'invalid_relationship_status'; END IF;
  IF v_score IS NOT NULL AND (v_score < 1 OR v_score > 5) THEN RAISE EXCEPTION 'invalid_score'; END IF;
  IF v_aspects IS NOT NULL AND NOT (v_aspects <@ ARRAY['conversation','contact','conflict','lifestyle','values']::TEXT[]) THEN RAISE EXCEPTION 'invalid_matched_aspects'; END IF;
  IF v_experience.entry_mode = 'count_only' AND (v_score IS NOT NULL OR v_aspects IS NOT NULL) THEN RAISE EXCEPTION 'expand_before_rating'; END IF;
  IF v_experience.entry_mode = 'detailed' AND v_reported_count <> 1 THEN RAISE EXCEPTION 'invalid_detailed_count'; END IF;

  UPDATE public.community_mbti_experiences SET
    self_mbti_snapshot = v_self_mbti_snapshot,
    reported_count = v_reported_count,
    partner_gender = v_partner_gender,
    relationship_status = v_relationship_status,
    score = v_score,
    matched_aspects = v_aspects,
    client_mutation_id = p_client_mutation_id,
    revision = revision + 1,
    updated_at = statement_timestamp(),
    expires_at = LEAST(
      statement_timestamp() + INTERVAL '90 days',
      (SELECT consent_confirmed_at + INTERVAL '90 days' FROM public.community_mbti_participants WHERE owner_user_id = v_owner_user_id)
    )
  WHERE experience_id = p_experience_id AND owner_user_id = v_owner_user_id AND revision = p_expected_revision
  RETURNING * INTO v_saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;
  v_receipt := jsonb_build_object(
    'status', 'saved',
    'resource_id', v_saved.experience_id,
    'resource_ids', jsonb_build_array(v_saved.experience_id),
    'revision', v_saved.revision
  );
  PERFORM quantum_private.community_mbti_save_receipt(
    v_owner_user_id, p_client_mutation_id, 'experience_update', v_hash,
    v_receipt
  );
  RETURN v_receipt;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'count_bundle_conflict';
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mbti_delete_experience(
  p_experience_id UUID,
  p_expected_revision INTEGER,
  p_client_mutation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_owner_user_id UUID := (select auth.uid());
  v_experience public.community_mbti_experiences%ROWTYPE;
  v_hash TEXT := md5(jsonb_build_array(p_experience_id, p_expected_revision)::TEXT);
  v_receipt JSONB;
BEGIN
  IF v_owner_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('community-mbti-owner:' || v_owner_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_user_id::TEXT || ':' || p_client_mutation_id, 0));
  v_receipt := quantum_private.community_mbti_existing_receipt(v_owner_user_id, p_client_mutation_id, 'experience_delete', v_hash);
  IF v_receipt IS NOT NULL THEN RETURN v_receipt; END IF;
  SELECT * INTO v_experience FROM public.community_mbti_experiences
  WHERE experience_id = p_experience_id AND owner_user_id = v_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'experience_not_found'; END IF;
  IF v_experience.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
  INSERT INTO quantum_private.community_mbti_deletion_tombstones (
    owner_user_id, deletion_scope, target_experience_id
  ) VALUES (
    v_owner_user_id, 'experience', p_experience_id
  );
  DELETE FROM public.community_mbti_experiences
  WHERE experience_id = p_experience_id AND owner_user_id = v_owner_user_id AND revision = p_expected_revision;
  v_receipt := jsonb_build_object(
    'status', 'deleted',
    'resource_id', p_experience_id,
    'resource_ids', jsonb_build_array(p_experience_id),
    'revision', p_expected_revision
  );
  PERFORM quantum_private.community_mbti_save_receipt(v_owner_user_id, p_client_mutation_id, 'experience_delete', v_hash, v_receipt);
  RETURN v_receipt;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mbti_expand_experience(
  p_experience_id UUID,
  p_expected_revision INTEGER,
  p_client_mutation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_owner_user_id UUID := (select auth.uid());
  v_experience public.community_mbti_experiences%ROWTYPE;
  v_batch_count INTEGER;
  v_created_ids JSONB;
  v_hash TEXT := md5(jsonb_build_array(p_experience_id, p_expected_revision)::TEXT);
  v_receipt JSONB;
BEGIN
  IF v_owner_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('community-mbti-owner:' || v_owner_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_user_id::TEXT || ':' || p_client_mutation_id, 0));
  v_receipt := quantum_private.community_mbti_existing_receipt(v_owner_user_id, p_client_mutation_id, 'experience_expand', v_hash);
  IF v_receipt IS NOT NULL THEN RETURN v_receipt; END IF;
  PERFORM quantum_private.community_mbti_require_minimum_signup(v_owner_user_id);
  SELECT * INTO v_experience FROM public.community_mbti_experiences
  WHERE experience_id = p_experience_id AND owner_user_id = v_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'experience_not_found'; END IF;
  IF v_experience.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
  IF v_experience.entry_mode <> 'count_only' THEN RAISE EXCEPTION 'count_only_required'; END IF;
  v_batch_count := LEAST(v_experience.reported_count, 100);

  IF v_experience.reported_count = v_batch_count THEN
    DELETE FROM public.community_mbti_experiences
    WHERE experience_id = p_experience_id
      AND owner_user_id = v_owner_user_id
      AND revision = p_expected_revision;
  ELSE
    UPDATE public.community_mbti_experiences
    SET reported_count = reported_count - v_batch_count,
        revision = revision + 1,
        updated_at = statement_timestamp()
    WHERE experience_id = p_experience_id
      AND owner_user_id = v_owner_user_id
      AND revision = p_expected_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;
  END IF;
  WITH inserted AS (
    INSERT INTO public.community_mbti_experiences (
      owner_user_id, self_mbti_snapshot, partner_mbti, partner_gender,
      relationship_status, entry_mode, reported_count, score,
      matched_aspects, client_mutation_id, expires_at
    )
    SELECT
      v_owner_user_id, v_experience.self_mbti_snapshot, v_experience.partner_mbti,
      v_experience.partner_gender, v_experience.relationship_status,
      'detailed', 1, NULL, NULL,
      left(p_client_mutation_id, 96) || ':' || sequence_no::TEXT,
      v_experience.expires_at
    FROM generate_series(1, v_batch_count) AS sequence_no
    RETURNING *
  )
  SELECT COALESCE(jsonb_agg(inserted.experience_id ORDER BY inserted.experience_id), '[]'::JSONB)
  INTO v_created_ids FROM inserted;
  v_receipt := jsonb_build_object(
    'status', 'expanded',
    'resource_id', p_experience_id,
    'resource_ids', v_created_ids,
    'revision', p_expected_revision + 1
  );
  PERFORM quantum_private.community_mbti_save_receipt(
    v_owner_user_id, p_client_mutation_id, 'experience_expand', v_hash,
    v_receipt
  );
  RETURN v_receipt;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mbti_withdraw(
  p_expected_revision INTEGER,
  p_client_mutation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_owner_user_id UUID := (select auth.uid());
  v_participant public.community_mbti_participants%ROWTYPE;
  v_hash TEXT := md5(jsonb_build_array(p_expected_revision)::TEXT);
  v_receipt JSONB;
BEGIN
  IF v_owner_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('community-mbti-owner:' || v_owner_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_user_id::TEXT || ':' || p_client_mutation_id, 0));
  v_receipt := quantum_private.community_mbti_existing_receipt(v_owner_user_id, p_client_mutation_id, 'survey_withdraw', v_hash);
  IF v_receipt IS NOT NULL THEN RETURN v_receipt; END IF;
  SELECT * INTO v_participant FROM public.community_mbti_participants
  WHERE owner_user_id = v_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'participant_not_found'; END IF;
  IF v_participant.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
  INSERT INTO quantum_private.community_mbti_deletion_tombstones (owner_user_id, deletion_scope)
  VALUES (v_owner_user_id, 'survey');
  DELETE FROM public.community_mbti_participants
  WHERE owner_user_id = v_owner_user_id AND revision = p_expected_revision;
  v_receipt := jsonb_build_object(
    'status', 'withdrawn',
    'resource_id', NULL,
    'resource_ids', '[]'::JSONB,
    'revision', p_expected_revision
  );
  PERFORM quantum_private.community_mbti_save_receipt(v_owner_user_id, p_client_mutation_id, 'survey_withdraw', v_hash, v_receipt);
  RETURN v_receipt;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mbti_get_meeting_stats_consent()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_owner_user_id UUID := (select auth.uid());
  v_result JSONB;
BEGIN
  IF v_owner_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT to_jsonb(consent) INTO v_result
  FROM public.community_mbti_meeting_stats_consents AS consent
  WHERE owner_user_id = v_owner_user_id
    AND consent_confirmed_at + INTERVAL '90 days' > statement_timestamp();
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mbti_put_meeting_stats_consent(
  p_self_mbti TEXT,
  p_self_gender TEXT,
  p_consent_version TEXT,
  p_expected_revision INTEGER,
  p_client_mutation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_owner_user_id UUID := (select auth.uid());
  v_existing public.community_mbti_meeting_stats_consents%ROWTYPE;
  v_saved public.community_mbti_meeting_stats_consents%ROWTYPE;
  v_hash TEXT;
  v_receipt JSONB;
BEGIN
  IF v_owner_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_self_mbti NOT IN ('ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP','ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ') THEN RAISE EXCEPTION 'invalid_self_mbti'; END IF;
  IF p_self_gender NOT IN ('male','female','other_or_undisclosed','unknown') THEN RAISE EXCEPTION 'invalid_self_gender'; END IF;
  IF p_consent_version <> 'community_mbti_meeting_stats_v1' THEN RAISE EXCEPTION 'invalid_consent_version'; END IF;
  v_hash := md5(jsonb_build_array(p_self_mbti, p_self_gender, p_consent_version, p_expected_revision)::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended('community-mbti-owner:' || v_owner_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_user_id::TEXT || ':' || p_client_mutation_id, 0));
  v_receipt := quantum_private.community_mbti_existing_receipt(v_owner_user_id, p_client_mutation_id, 'meeting_consent_put', v_hash);
  IF v_receipt IS NOT NULL THEN RETURN v_receipt; END IF;
  PERFORM quantum_private.community_mbti_require_minimum_signup(v_owner_user_id);
  SELECT * INTO v_existing FROM public.community_mbti_meeting_stats_consents
  WHERE owner_user_id = v_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_revision <> 0 THEN RAISE EXCEPTION 'stale_revision'; END IF;
    INSERT INTO public.community_mbti_meeting_stats_consents (
      owner_user_id, self_mbti_snapshot, self_gender_snapshot,
      consent_version, consent_confirmed_at, revision
    ) VALUES (
      v_owner_user_id, p_self_mbti, p_self_gender, p_consent_version, statement_timestamp(), 1
    ) RETURNING * INTO v_saved;
  ELSE
    IF v_existing.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
    UPDATE public.community_mbti_meeting_stats_consents SET
      self_mbti_snapshot = p_self_mbti,
      self_gender_snapshot = p_self_gender,
      consent_version = p_consent_version,
      consent_confirmed_at = statement_timestamp(),
      revision = revision + 1,
      updated_at = statement_timestamp()
    WHERE owner_user_id = v_owner_user_id AND revision = p_expected_revision
    RETURNING * INTO v_saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;
  END IF;
  v_receipt := jsonb_build_object(
    'status', 'saved',
    'resource_id', NULL,
    'resource_ids', '[]'::JSONB,
    'revision', v_saved.revision
  );
  PERFORM quantum_private.community_mbti_save_receipt(v_owner_user_id, p_client_mutation_id, 'meeting_consent_put', v_hash, v_receipt);
  RETURN v_receipt;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mbti_withdraw_meeting_stats_consent(
  p_expected_revision INTEGER,
  p_client_mutation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_owner_user_id UUID := (select auth.uid());
  v_existing public.community_mbti_meeting_stats_consents%ROWTYPE;
  v_hash TEXT := md5(jsonb_build_array(p_expected_revision)::TEXT);
  v_receipt JSONB;
BEGIN
  IF v_owner_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('community-mbti-owner:' || v_owner_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_user_id::TEXT || ':' || p_client_mutation_id, 0));
  v_receipt := quantum_private.community_mbti_existing_receipt(v_owner_user_id, p_client_mutation_id, 'meeting_consent_withdraw', v_hash);
  IF v_receipt IS NOT NULL THEN RETURN v_receipt; END IF;
  SELECT * INTO v_existing FROM public.community_mbti_meeting_stats_consents
  WHERE owner_user_id = v_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'meeting_consent_not_found'; END IF;
  IF v_existing.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
  INSERT INTO quantum_private.community_mbti_deletion_tombstones (owner_user_id, deletion_scope)
  VALUES (v_owner_user_id, 'meeting_stats');
  DELETE FROM public.community_mbti_meeting_stats_consents
  WHERE owner_user_id = v_owner_user_id AND revision = p_expected_revision;
  v_receipt := jsonb_build_object(
    'status', 'withdrawn',
    'resource_id', NULL,
    'resource_ids', '[]'::JSONB,
    'revision', p_expected_revision
  );
  PERFORM quantum_private.community_mbti_save_receipt(v_owner_user_id, p_client_mutation_id, 'meeting_consent_withdraw', v_hash, v_receipt);
  RETURN v_receipt;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_purge_expired_community_mbti()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, quantum_private, pg_temp
AS $$
DECLARE
  v_experiences INTEGER;
  v_participants INTEGER;
  v_consents INTEGER;
  v_tombstones INTEGER;
BEGIN
  IF current_setting('request.jwt.claim.role', TRUE) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  INSERT INTO quantum_private.community_mbti_deletion_tombstones (
    owner_user_id, deletion_scope, target_experience_id, deleted_before
  )
  SELECT owner_user_id, 'experience', experience_id, statement_timestamp()
  FROM public.community_mbti_experiences
  WHERE expires_at <= statement_timestamp();
  INSERT INTO quantum_private.community_mbti_deletion_tombstones (
    owner_user_id, deletion_scope, deleted_before
  )
  SELECT owner_user_id, 'survey', statement_timestamp()
  FROM public.community_mbti_participants
  WHERE consent_confirmed_at + INTERVAL '90 days' <= statement_timestamp();
  INSERT INTO quantum_private.community_mbti_deletion_tombstones (
    owner_user_id, deletion_scope, deleted_before
  )
  SELECT owner_user_id, 'meeting_stats', statement_timestamp()
  FROM public.community_mbti_meeting_stats_consents
  WHERE consent_confirmed_at + INTERVAL '90 days' <= statement_timestamp();
  DELETE FROM public.community_mbti_experiences WHERE expires_at <= statement_timestamp();
  GET DIAGNOSTICS v_experiences = ROW_COUNT;
  DELETE FROM public.community_mbti_participants
  WHERE consent_confirmed_at + INTERVAL '90 days' <= statement_timestamp();
  GET DIAGNOSTICS v_participants = ROW_COUNT;
  DELETE FROM public.community_mbti_meeting_stats_consents
  WHERE consent_confirmed_at + INTERVAL '90 days' <= statement_timestamp();
  GET DIAGNOSTICS v_consents = ROW_COUNT;
  DELETE FROM quantum_private.community_mbti_deletion_tombstones WHERE expires_at <= statement_timestamp();
  GET DIAGNOSTICS v_tombstones = ROW_COUNT;
  RETURN jsonb_build_object(
    'experiences', v_experiences,
    'participants', v_participants,
    'meeting_consents', v_consents,
    'tombstones', v_tombstones,
    'aggregation_boundary', clock_timestamp()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_list_eligible_community_mbti_owner_ids(
  p_after_owner_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (owner_user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', TRUE) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  RETURN QUERY
  SELECT participant.owner_user_id
  FROM public.community_mbti_participants AS participant
  CROSS JOIN LATERAL quantum_private.resolve_profile_readiness(participant.owner_user_id) AS readiness
  WHERE (p_after_owner_user_id IS NULL OR participant.owner_user_id > p_after_owner_user_id)
    AND readiness.minimum_signup_complete
  ORDER BY participant.owner_user_id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_get_fresh_community_mbti_snapshot(
  p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_snapshot JSONB;
  v_current_epoch BIGINT;
BEGIN
  IF current_setting('request.jwt.claim.role', TRUE) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_now IS NULL THEN RAISE EXCEPTION 'invalid_now'; END IF;
  SELECT epoch INTO STRICT v_current_epoch
  FROM quantum_private.community_mbti_source_epoch
  WHERE singleton
  FOR SHARE;
  SELECT to_jsonb(snapshot) INTO v_snapshot
  FROM public.community_mbti_public_snapshots AS snapshot
  WHERE snapshot.generated_at <= p_now
    AND snapshot.generated_at > p_now - INTERVAL '24 hours'
    AND snapshot.expires_at > p_now
    AND snapshot.source_epoch = v_current_epoch
    AND NOT EXISTS (
      SELECT 1
      FROM quantum_private.community_mbti_deletion_tombstones AS tombstone
      WHERE tombstone.deleted_before >= snapshot.generated_at
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_mbti_participants AS participant
      WHERE participant.consent_confirmed_at + INTERVAL '90 days' <= p_now
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_mbti_experiences AS experience
      WHERE experience.expires_at <= p_now
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_mbti_meeting_stats_consents AS consent
      WHERE consent.consent_confirmed_at + INTERVAL '90 days' <= p_now
    )
  ORDER BY snapshot.generated_at DESC
  LIMIT 1;
  RETURN v_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_get_community_mbti_source_epoch()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_epoch BIGINT;
BEGIN
  IF current_setting('request.jwt.claim.role', TRUE) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  SELECT epoch INTO STRICT v_epoch
  FROM quantum_private.community_mbti_source_epoch
  WHERE singleton;
  RETURN v_epoch;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_publish_community_mbti_snapshot(
  p_expected_source_epoch BIGINT,
  p_generated_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_privacy_policy_version TEXT,
  p_status TEXT,
  p_self_reported JSONB,
  p_meeting_stats_status TEXT,
  p_meeting_stats JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_epoch BIGINT;
  v_snapshot public.community_mbti_public_snapshots%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claim.role', TRUE) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_expected_source_epoch IS NULL OR p_expected_source_epoch < 0 THEN
    RAISE EXCEPTION 'invalid_source_epoch';
  END IF;
  SELECT epoch INTO STRICT v_current_epoch
  FROM quantum_private.community_mbti_source_epoch
  WHERE singleton
  FOR UPDATE;
  IF v_current_epoch <> p_expected_source_epoch THEN
    RAISE EXCEPTION 'source_epoch_changed';
  END IF;
  INSERT INTO public.community_mbti_public_snapshots (
    generated_at,
    expires_at,
    privacy_policy_version,
    status,
    self_reported,
    meeting_stats_status,
    meeting_stats,
    source_epoch
  ) VALUES (
    p_generated_at,
    p_expires_at,
    p_privacy_policy_version,
    p_status,
    p_self_reported,
    p_meeting_stats_status,
    p_meeting_stats,
    v_current_epoch
  ) RETURNING * INTO v_snapshot;
  RETURN to_jsonb(v_snapshot);
END;
$$;

REVOKE ALL ON FUNCTION public.community_mbti_get_my_state(INTEGER, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.community_mbti_get_my_state(INTEGER, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.community_mbti_upsert_participant(TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.community_mbti_upsert_participant(TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.community_mbti_create_experience(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, SMALLINT, TEXT[], TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.community_mbti_create_experience(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, SMALLINT, TEXT[], TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.community_mbti_update_experience(UUID, INTEGER, JSONB, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.community_mbti_update_experience(UUID, INTEGER, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.community_mbti_delete_experience(UUID, INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.community_mbti_delete_experience(UUID, INTEGER, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.community_mbti_expand_experience(UUID, INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.community_mbti_expand_experience(UUID, INTEGER, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.community_mbti_withdraw(INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.community_mbti_withdraw(INTEGER, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.community_mbti_get_meeting_stats_consent() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.community_mbti_get_meeting_stats_consent() TO authenticated;
REVOKE ALL ON FUNCTION public.community_mbti_put_meeting_stats_consent(TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.community_mbti_put_meeting_stats_consent(TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.community_mbti_withdraw_meeting_stats_consent(INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.community_mbti_withdraw_meeting_stats_consent(INTEGER, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.service_purge_expired_community_mbti() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_purge_expired_community_mbti() TO service_role;
REVOKE ALL ON FUNCTION public.service_list_eligible_community_mbti_owner_ids(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_list_eligible_community_mbti_owner_ids(UUID, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.service_get_fresh_community_mbti_snapshot(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_fresh_community_mbti_snapshot(TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.service_get_community_mbti_source_epoch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_community_mbti_source_epoch() TO service_role;
REVOKE ALL ON FUNCTION public.service_publish_community_mbti_snapshot(BIGINT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, JSONB, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_publish_community_mbti_snapshot(BIGINT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, JSONB, TEXT, JSONB)
  TO service_role;

COMMIT;
