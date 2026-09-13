-- Record accepted applicants' refund liability when the host cancels a meetup.
-- Normal completion keeps accepted deposits held for the user's later decision.
-- This migration records refund_due only; it does not execute a provider refund.
BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.admission_room_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  a record;
BEGIN
  IF NEW.status IN ('cancelled', 'completed')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR a IN
      SELECT id, deposit_id
      FROM quantum_private.activity_meetup_admissions
      WHERE meetup_id = NEW.id
        AND (state = 'pending' OR (NEW.status = 'cancelled' AND state = 'accepted'))
      ORDER BY id
      FOR UPDATE
    LOOP
      UPDATE quantum_private.activity_meetup_admissions
      SET state = 'cancelled', revision = revision + 1,
          updated_at = clock_timestamp()
      WHERE id = a.id;
      PERFORM quantum_private.admission_refund_due(a.deposit_id, 'room_closed');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.admission_room_closed()
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
