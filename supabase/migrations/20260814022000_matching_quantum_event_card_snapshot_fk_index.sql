BEGIN;

CREATE INDEX IF NOT EXISTS quantum_event_room_card_snapshots_participant_idx
  ON public.quantum_event_room_card_snapshots (participant_user_id);

COMMIT;
