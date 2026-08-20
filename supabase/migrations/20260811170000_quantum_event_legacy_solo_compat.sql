-- Keep the currently deployed three-argument client working for solo events
-- while friend applications move to the group-bound four-argument contract.

create or replace function public.set_my_quantum_event_participation(
  p_event_id text,
  p_event_mode text,
  p_party_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_party_type <> 'solo' then
    raise exception 'friend_group_required' using errcode = '22023';
  end if;

  return public.set_my_quantum_event_participation(
    p_event_id,
    p_event_mode,
    p_party_type,
    null
  );
end;
$$;

revoke execute on function public.set_my_quantum_event_participation(text, text, text) from public, anon;
grant execute on function public.set_my_quantum_event_participation(text, text, text) to authenticated;

comment on function public.set_my_quantum_event_participation(text, text, text) is
  'Temporary solo-only compatibility wrapper for clients deployed before friend group binding.';
