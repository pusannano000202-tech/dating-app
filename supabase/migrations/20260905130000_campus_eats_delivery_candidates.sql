-- Independent delivery catalog. Never imports visited-store fixtures as delivery proof.
BEGIN;
CREATE TABLE public.campus_eats_delivery_candidates (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,95}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.campus_eats_delivery_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campus_eats_delivery_candidates FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.admin_save_delivery_candidate(p_candidate jsonb, p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id text; v_revision integer; v_existing integer; v_key text; v_when timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.verify_recent_super_admin_session() THEN RAISE EXCEPTION 'reauthentication_required'; END IF;
  v_id := p_candidate->>'id';
  IF v_id IS NULL OR v_id !~ '^[a-z0-9][a-z0-9-]{2,95}$' OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR jsonb_typeof(p_candidate) <> 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_candidate)) <> 20
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_candidate) k WHERE k NOT IN
      ('id','storeName','menuName','region','menuPrice','mandatoryOptionPrice','minimumOrderPrice','deliveryFee','singleServing','membershipCondition','benefit','orderUrl','sourceUrl','verifiedAt','benefitVerifiedAt','expiresAt','imagePath','imageRights','publicationStatus','revision'))
    OR coalesce(p_candidate->>'publicationStatus','') NOT IN ('draft','verified','retired')
    OR coalesce(p_candidate->>'orderUrl','') !~ '^https://([a-zA-Z0-9-]+\.)*(coupangeats\.com|baemin\.com|yogiyo\.co\.kr)/'
    OR coalesce(p_candidate->>'sourceUrl','') !~ '^https://([a-zA-Z0-9-]+\.)*(coupangeats\.com|baemin\.com|yogiyo\.co\.kr)/'
    OR coalesce(length(p_candidate->>'storeName'),0) NOT BETWEEN 1 AND 200
    OR coalesce(length(p_candidate->>'menuName'),0) NOT BETWEEN 1 AND 200
    OR coalesce(length(p_candidate->>'region'),0) NOT BETWEEN 1 AND 200
    OR coalesce(length(p_candidate->>'membershipCondition'),0) NOT BETWEEN 1 AND 200
  THEN RAISE EXCEPTION 'invalid_delivery_candidate'; END IF;
  IF p_candidate->>'publicationStatus' = 'verified' AND (
    p_candidate->>'region' IS DISTINCT FROM '부산대 정문'
    OR coalesce(length(btrim(p_candidate->>'imagePath')),0) = 0
    OR coalesce(length(btrim(p_candidate->>'imageRights')),0) = 0
    OR p_candidate->>'sourceUrl' ~ '^https://[^/]+/?$'
    OR p_candidate->>'orderUrl' ~ '^https://[^/]+/?$'
  ) THEN RAISE EXCEPTION 'delivery_publication_evidence_required'; END IF;
  IF jsonb_typeof(p_candidate->'singleServing') <> 'boolean'
    OR jsonb_typeof(p_candidate->'revision') <> 'number'
    OR (p_candidate->>'revision')::integer <> p_expected_revision
  THEN RAISE EXCEPTION 'invalid_delivery_candidate'; END IF;
  FOREACH v_key IN ARRAY ARRAY['menuPrice','mandatoryOptionPrice','minimumOrderPrice','deliveryFee'] LOOP
    IF p_candidate->v_key <> 'null'::jsonb AND
      (jsonb_typeof(p_candidate->v_key) <> 'number' OR (p_candidate->>v_key)::numeric NOT BETWEEN 0 AND 1000000
       OR trunc((p_candidate->>v_key)::numeric) <> (p_candidate->>v_key)::numeric)
    THEN RAISE EXCEPTION 'invalid_delivery_candidate'; END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['verifiedAt','benefitVerifiedAt','expiresAt'] LOOP
    IF p_candidate->v_key <> 'null'::jsonb THEN
      IF jsonb_typeof(p_candidate->v_key) <> 'string' THEN RAISE EXCEPTION 'invalid_delivery_candidate'; END IF;
      v_when := (p_candidate->>v_key)::timestamptz;
      IF NOT isfinite(v_when) THEN RAISE EXCEPTION 'invalid_delivery_candidate'; END IF;
    END IF;
  END LOOP;
  IF (p_candidate->>'imagePath' IS NOT NULL AND
      (p_candidate->>'imagePath' !~ '^/campus-eats/delivery/[a-zA-Z0-9_-]+\.(webp|png|jpg)$'
       OR coalesce(length(p_candidate->>'imageRights'),0) NOT BETWEEN 1 AND 500))
    OR length(p_candidate->>'benefit') > 300
  THEN RAISE EXCEPTION 'invalid_delivery_candidate'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('delivery:' || v_id, 0));
  SELECT revision INTO v_existing FROM public.campus_eats_delivery_candidates WHERE id = v_id FOR UPDATE;
  IF coalesce(v_existing,0) <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
  v_revision := coalesce(v_existing,0) + 1;
  INSERT INTO public.campus_eats_delivery_candidates(id,payload,revision,updated_by)
    VALUES (v_id,jsonb_set(p_candidate,'{revision}',to_jsonb(v_revision)),v_revision,auth.uid())
    ON CONFLICT (id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  RETURN jsonb_build_object('id',v_id,'revision',v_revision);
END;
$$;

CREATE FUNCTION public.admin_list_delivery_candidates()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.verify_recent_super_admin_session() THEN RAISE EXCEPTION 'reauthentication_required'; END IF;
  RETURN coalesce((SELECT jsonb_agg(payload ORDER BY updated_at DESC) FROM public.campus_eats_delivery_candidates),'[]'::jsonb);
END;
$$;

CREATE FUNCTION public.list_public_delivery_candidates()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(payload),'[]'::jsonb) FROM public.campus_eats_delivery_candidates
  WHERE payload->>'publicationStatus'='verified'
    AND payload->>'region'='부산대 정문'
    AND coalesce(length(btrim(payload->>'imagePath')),0) > 0
    AND coalesce(length(btrim(payload->>'imageRights')),0) > 0
    AND payload->>'sourceUrl' !~ '^https://[^/]+/?$'
    AND payload->>'orderUrl' !~ '^https://[^/]+/?$'
    AND payload->>'singleServing'='true'
    AND (payload->>'menuPrice')::numeric + (payload->>'mandatoryOptionPrice')::numeric >= (payload->>'minimumOrderPrice')::numeric
    AND (payload->>'verifiedAt')::timestamptz <= current_timestamp
    AND (payload->>'verifiedAt')::timestamptz > current_timestamp - interval '7 days'
    AND (payload->>'expiresAt' IS NULL OR (payload->>'expiresAt')::timestamptz > current_timestamp)
    AND (payload->>'benefit' IS NULL OR ((payload->>'benefitVerifiedAt')::timestamptz <= current_timestamp
      AND (payload->>'benefitVerifiedAt')::timestamptz > current_timestamp - interval '24 hours'));
$$;
REVOKE ALL ON FUNCTION public.admin_save_delivery_candidate(jsonb,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_list_delivery_candidates() FROM PUBLIC,anon;
-- The server additionally verifies that a licensed photo file still exists.
-- No direct anonymous/authenticated RPC may bypass that projection.
REVOKE ALL ON FUNCTION public.list_public_delivery_candidates() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_delivery_candidate(jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_delivery_candidates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_delivery_candidates() TO service_role;
COMMIT;
