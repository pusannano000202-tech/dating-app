-- Historical migration marker.
--
-- This version was recorded remotely after the event lifecycle objects already
-- existed, even though its timestamp sorts before their creation on a clean
-- database. Replaying the historical body here would therefore fail.
--
-- The exact recovered SQL is preserved in:
--   supabase/remote-migration-archive/
--     20260811133602_quantum_event_match_finalization_service_acl.sql
-- Its final, clean-replay-safe equivalent is applied by:
--   20260811222316_quantum_event_match_finalization.sql

select 1;
