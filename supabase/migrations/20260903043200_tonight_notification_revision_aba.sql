-- Enforce a monotonic revision on every notification state transition.  This
-- is a backstop for ordinary worker updates and terminal sweepers, while the
-- super-admin retry RPC continues to supply its explicit +1 CAS transition.

BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.advance_tonight_notification_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.revision >= 2147483647 THEN
    RAISE EXCEPTION 'notification_revision_exhausted';
  END IF;

  IF NEW.revision = OLD.revision THEN
    NEW.revision := OLD.revision + 1;
  ELSIF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'invalid_notification_revision_transition';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.advance_tonight_notification_revision()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tonight_notification_outbox_advance_revision
  BEFORE UPDATE ON public.tonight_notification_outbox
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.advance_tonight_notification_revision();

CREATE TRIGGER tonight_push_deliveries_advance_revision
  BEFORE UPDATE ON public.tonight_push_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.advance_tonight_notification_revision();

COMMENT ON FUNCTION quantum_private.advance_tonight_notification_revision() IS
  'Advances every notification state mutation by exactly one revision to prevent ABA.';

COMMIT;
