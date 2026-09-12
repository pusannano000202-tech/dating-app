-- LOCAL PREPARATION ONLY. No money, policy amount, provider order, wallet,
-- reservation, transfer, refund or forfeiture is introduced by this migration.
begin;

create function quantum_private.candidate_deposit_context(p_scope_kind text,p_scope_key text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();ident record;
begin
 if actor is null then raise exception 'not_authenticated';end if;
 if not quantum_private.candidate_scope_valid(p_scope_kind,p_scope_key)then raise exception 'invalid_candidate_scope';end if;
 if not quantum_private.candidate_person_current(actor)then raise exception 'candidate_account_unavailable';end if;
 select *into ident from quantum_private.get_member_department_identity(actor);
 if ident.school_scope_key is null then raise exception 'department_identity_required';end if;
 -- Same current account and scope gates as candidate overview. Do not expose
 -- another account, board profiles, historical payment rows or a fabricated quote.
 return jsonb_build_object('owner_id',actor,'scope',jsonb_build_object('kind',p_scope_kind,'key',p_scope_key),
  'quote',null,'policy',null,'checkout_enabled',false,'preparation_only',true,'funding','unavailable');
end$$;

create function public.get_meetup_candidate_deposit_context(p_scope_kind text,p_scope_key text)
returns jsonb language sql stable security definer set search_path='' as $$
 select quantum_private.candidate_deposit_context(p_scope_kind,p_scope_key)
$$;

create function quantum_private.candidate_deposit_publication_guard()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.status not in('waiting','joining')then return new;end if;
 -- Existing active candidacy may be maintained, cancelled, or finish its existing
 -- invitation. Grandfathering is not proof of paid funding and cannot change scope.
 if tg_op='UPDATE' then
  if old.status in('waiting','joining')
   and new.owner_id=old.owner_id and new.scope_kind=old.scope_kind and new.scope_key=old.scope_key
   and new.school_key=old.school_key and new.department_key is not distinct from old.department_key
  then return new;end if;
 end if;
 -- Until a verified server funding adapter and its financial contract exist, both
 -- first publication and republication after cancellation/participation fail closed.
 raise exception 'candidate_deposit_unavailable';
end$$;

-- AFTER distinguishes a real insert from the INSERT attempt of ON CONFLICT DO
-- UPDATE. Raising still rolls the whole statement/transaction back, including notices.
create trigger candidate_deposit_publication_guard
after insert or update on quantum_private.meetup_candidates
for each row execute function quantum_private.candidate_deposit_publication_guard();

revoke all on function quantum_private.candidate_deposit_context(text,text),quantum_private.candidate_deposit_publication_guard()
 from public,anon,authenticated,service_role;
revoke all on function public.get_meetup_candidate_deposit_context(text,text)from public,anon,authenticated,service_role;
grant execute on function public.get_meetup_candidate_deposit_context(text,text)to authenticated;
commit;
