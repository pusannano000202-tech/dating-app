begin;

-- PostgREST sets request.jwt.claims. auth.role() reads that modern claim and
-- retains compatibility with direct jobs that set request.jwt.claim.role.
create or replace function quantum_private.continuation_album_require_service()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
end
$$;

revoke all on function quantum_private.continuation_album_require_service()
  from public, anon, authenticated, service_role;

-- Preserve the reviewed allocator body from 20260906114007 without duplicating
-- it. Only the guarded public entry point remains executable by service_role.
alter function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  set schema quantum_private;
alter function quantum_private.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  rename to assign_weekly_party_for_service_impl_20260906114007;

revoke all on function quantum_private.assign_weekly_party_for_service_impl_20260906114007(
  uuid, uuid, uuid, integer, uuid
) from public, anon, authenticated, service_role;

create function public.assign_weekly_party_for_service(
  p_application_id uuid,
  p_window_id uuid,
  p_occurrence_id uuid,
  p_expected_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  return quantum_private.assign_weekly_party_for_service_impl_20260906114007(
    p_application_id,
    p_window_id,
    p_occurrence_id,
    p_expected_revision,
    p_idempotency_key
  );
end
$$;

revoke all on function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_weekly_party_for_service(uuid, uuid, uuid, integer, uuid)
  to service_role;

commit;
