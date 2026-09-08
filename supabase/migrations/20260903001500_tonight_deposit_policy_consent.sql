-- Persist the exact policy a user accepted before a real Tonight deposit can
-- be prepared. Acceptance is append-only and deposit inserts fail closed.

BEGIN;

CREATE TABLE quantum_private.tonight_deposit_policy_acceptances (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  policy_version TEXT NOT NULL CHECK (policy_version = '2026-09-03'),
  policy_hash TEXT NOT NULL CHECK (
    policy_hash = '8ba5296074f9f759980ddeec1f42b9be1b1aba8723a6430839ad4829a23919cc'
  ),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id, user_id)
    REFERENCES public.tonight_applications(id, user_id) ON DELETE RESTRICT
);

ALTER TABLE quantum_private.tonight_deposit_policy_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quantum_private.tonight_deposit_policy_acceptances
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE quantum_private.tonight_deposit_policy_acceptances
  TO service_role;

CREATE TRIGGER tonight_deposit_policy_acceptances_update_immutable
  BEFORE UPDATE ON quantum_private.tonight_deposit_policy_acceptances
  FOR EACH ROW EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE TRIGGER tonight_deposit_policy_acceptances_delete_immutable
  BEFORE DELETE ON quantum_private.tonight_deposit_policy_acceptances
  FOR EACH ROW EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

ALTER TABLE public.tonight_deposits
  ADD COLUMN deposit_policy_version TEXT,
  ADD COLUMN deposit_policy_accepted_at TIMESTAMPTZ,
  ADD CONSTRAINT tonight_deposits_policy_version_valid CHECK (
    deposit_policy_version IS NULL OR deposit_policy_version = '2026-09-03'
  ),
  ADD CONSTRAINT tonight_deposits_policy_pair CHECK (
    (deposit_policy_version IS NULL) = (deposit_policy_accepted_at IS NULL)
  );

CREATE OR REPLACE FUNCTION public.accept_tonight_deposit_policy(
  p_application_id UUID,
  p_policy_version TEXT,
  p_policy_hash TEXT,
  p_accepted BOOLEAN
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  application_row public.tonight_applications%ROWTYPE;
  round_row public.tonight_rounds%ROWTYPE;
  acceptance_row quantum_private.tonight_deposit_policy_acceptances%ROWTYPE;
BEGIN
  IF v_caller IS NULL OR (SELECT auth.role()) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF p_accepted IS NULL OR NOT p_accepted THEN
    RAISE EXCEPTION 'deposit_policy_acceptance_required';
  END IF;
  IF p_policy_version IS DISTINCT FROM '2026-09-03' THEN
    RAISE EXCEPTION 'deposit_policy_version_invalid';
  END IF;
  IF p_policy_hash IS DISTINCT FROM '8ba5296074f9f759980ddeec1f42b9be1b1aba8723a6430839ad4829a23919cc' THEN
    RAISE EXCEPTION 'deposit_policy_hash_invalid';
  END IF;

  SELECT application_value.* INTO application_row
  FROM public.tonight_applications AS application_value
  WHERE application_value.id = p_application_id
  FOR UPDATE OF application_value;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_application_not_found';
  END IF;
  IF application_row.user_id <> v_caller THEN
    RAISE EXCEPTION 'deposit_owner_mismatch';
  END IF;
  IF application_row.status <> 'allocated' THEN
    RAISE EXCEPTION 'deposit_application_not_allocated';
  END IF;

  SELECT round_value.* INTO round_row
  FROM public.tonight_rounds AS round_value
  WHERE round_value.id = application_row.round_id;
  IF round_row.status <> 'awaiting_deposits'
    OR CURRENT_TIMESTAMP >= round_row.deposit_due_at THEN
    RAISE EXCEPTION 'deposit_time_gate_closed';
  END IF;

  INSERT INTO quantum_private.tonight_deposit_policy_acceptances (
    application_id, user_id, policy_version, policy_hash, accepted_at
  ) VALUES (
    application_row.id, v_caller, p_policy_version, p_policy_hash, CURRENT_TIMESTAMP
  )
  ON CONFLICT (application_id) DO NOTHING
  RETURNING * INTO acceptance_row;

  IF acceptance_row.id IS NULL THEN
    SELECT acceptance.* INTO acceptance_row
    FROM quantum_private.tonight_deposit_policy_acceptances AS acceptance
    WHERE acceptance.application_id = application_row.id;
  END IF;
  IF acceptance_row.user_id <> v_caller
    OR acceptance_row.policy_version <> p_policy_version
    OR acceptance_row.policy_hash <> p_policy_hash THEN
    RAISE EXCEPTION 'deposit_policy_acceptance_conflict';
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'application',
    application_row.id,
    'deposit_policy_accepted',
    NULL,
    pg_catalog.jsonb_build_object(
      'policy_version', acceptance_row.policy_version,
      'policy_hash', acceptance_row.policy_hash,
      'accepted_at', acceptance_row.accepted_at
    ),
    'deposit-policy:' || application_row.id::TEXT || ':' || acceptance_row.policy_version
  );
  RETURN acceptance_row.accepted_at;
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.require_tonight_deposit_policy_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  acceptance_row quantum_private.tonight_deposit_policy_acceptances%ROWTYPE;
BEGIN
  SELECT acceptance.* INTO acceptance_row
  FROM quantum_private.tonight_deposit_policy_acceptances AS acceptance
  WHERE acceptance.application_id = NEW.application_id
    AND acceptance.user_id = NEW.user_id
    AND acceptance.policy_version = '2026-09-03'
    AND acceptance.policy_hash = '8ba5296074f9f759980ddeec1f42b9be1b1aba8723a6430839ad4829a23919cc';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit_policy_acceptance_required';
  END IF;
  NEW.deposit_policy_version := acceptance_row.policy_version;
  NEW.deposit_policy_accepted_at := acceptance_row.accepted_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tonight_deposits_require_policy_acceptance
  BEFORE INSERT ON public.tonight_deposits
  FOR EACH ROW EXECUTE FUNCTION quantum_private.require_tonight_deposit_policy_acceptance();

REVOKE ALL ON FUNCTION public.accept_tonight_deposit_policy(UUID, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_tonight_deposit_policy(UUID, TEXT, TEXT, BOOLEAN)
  TO authenticated;
REVOKE ALL ON FUNCTION quantum_private.require_tonight_deposit_policy_acceptance()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
