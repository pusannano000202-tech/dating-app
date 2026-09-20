-- get_my_relationship_state() intentionally locks relationship state. These
-- calendar callers must not promise STABLE/read-only execution to PostgREST.
-- Supabase .rpc() uses POST; the application's GET HTTP contract is unchanged.
-- Keep function bodies, signatures, ownership, grants and security settings.
begin;
alter function quantum_private.calendar_actor() volatile;
alter function public.get_my_event_calendar(date,text) volatile;
alter function public.get_my_calendar_couple_party(uuid) volatile;
alter function public.get_my_calendar_single_application(uuid) volatile;
-- PostgREST caches volatility when choosing the transaction access mode.
notify pgrst, 'reload schema';
commit;
