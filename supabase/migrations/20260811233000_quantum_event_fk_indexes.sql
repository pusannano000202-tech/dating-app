-- Cover the foreign keys introduced by the event finalization and evidence flows.

CREATE INDEX IF NOT EXISTS meeting_photo_evidence_uploader_user_id_idx
  ON public.meeting_photo_evidence (uploader_user_id);

CREATE INDEX IF NOT EXISTS quantum_event_match_members_party_group_id_idx
  ON public.quantum_event_match_members (party_group_id);

CREATE INDEX IF NOT EXISTS quantum_event_occurrences_male_group_id_idx
  ON public.quantum_event_occurrences (male_group_id);

CREATE INDEX IF NOT EXISTS quantum_event_occurrences_female_group_id_idx
  ON public.quantum_event_occurrences (female_group_id);

CREATE INDEX IF NOT EXISTS quantum_event_participations_match_id_idx
  ON public.quantum_event_participations (match_id);
