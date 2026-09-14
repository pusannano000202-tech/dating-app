-- Preserve admission settlement context across the separate readiness RPC and
-- Auth deletion transaction. No provider call, refund approval or policy seed.
begin;

create or replace function quantum_private.account_has_legal_retention_candidates(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.deposits d where d.user_id=p_user_id)
    or exists(select 1 from public.deposit_refund_requests r where r.user_id=p_user_id)
    or exists(select 1 from public.campus_seven_deposit_holds h where h.user_id=p_user_id)
    or exists(select 1 from public.campus_seven_deposit_reviews r where r.user_id=p_user_id)
    or exists(select 1 from public.tonight_deposits d where d.user_id=p_user_id)
    or exists(select 1 from public.tonight_deposit_refund_requests r where r.requested_by=p_user_id)
    or exists(select 1 from public.quantum_continuation_fee_orders o
      where o.owner_user_id=p_user_id or o.target_user_id=p_user_id)
    or exists(select 1 from public.meeting_photo_evidence e
      where e.uploader_user_id=p_user_id and e.dispute_hold=true and e.status<>'deleted')
    or exists(select 1 from quantum_private.meetup_admission_checkout_orders o where o.user_id=p_user_id)
    or exists(select 1 from quantum_private.activity_meetup_admission_deposits d where d.user_id=p_user_id)
    or exists(select 1 from quantum_private.activity_meetup_admission_refund_outbox o
      join quantum_private.activity_meetup_admission_deposits d on d.id=o.deposit_id where d.user_id=p_user_id)
$$;

-- Volatile intentionally: a DELETE waiting for a ledger writer's owner-row lock
-- must inspect the newly committed ledger, not its earlier statement snapshot.
create function quantum_private.account_has_unresolved_meetup_payments(p_user_id uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
  select exists(
    select 1 from quantum_private.meetup_admission_checkout_orders o
    where o.user_id=p_user_id and (
      o.state not in ('confirmed','aborted')
      or (o.state='confirmed' and not exists(
        select 1 from quantum_private.activity_meetup_admission_deposits d
        where d.intent_id=o.intent_id and d.user_id=p_user_id and d.state='refunded'
      ))
    )
  ) or exists(
    select 1 from quantum_private.activity_meetup_admission_deposits d
    where d.user_id=p_user_id and d.state<>'refunded'
  ) or exists(
    select 1 from quantum_private.activity_meetup_admission_refund_outbox o
    join quantum_private.activity_meetup_admission_deposits d on d.id=o.deposit_id
    where d.user_id=p_user_id and o.state<>'completed'
  )
$$;

-- Applies to service reconciliation too: keep the owner alive while any ledger
-- mutation is committing. Do not check product-access revocation here, because a
-- deleting account still needs verified receipts and settlement recorded.
create function quantum_private.account_admission_finance_owner_lock()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare v_user_id uuid;
begin
  if tg_table_name='activity_meetup_admission_refund_outbox' then
    select d.user_id into v_user_id from quantum_private.activity_meetup_admission_deposits d
      where d.id=new.deposit_id;
  else
    v_user_id:=new.user_id;
  end if;
  -- Nullable retained receipts/orders remain writable after completed erasure.
  -- This also permits the FK's ON DELETE SET NULL update inside that transaction.
  if v_user_id is not null then
    perform 1 from public.users account where account.id=v_user_id for key share;
    if not found then raise exception 'account_financial_retention_pending' using errcode='55000'; end if;
  end if;
  return new;
end;
$$;

create trigger account_admission_owner_checkout
before insert or update on quantum_private.meetup_admission_checkout_orders
for each row execute function quantum_private.account_admission_finance_owner_lock();
create trigger account_admission_owner_deposit
before insert or update on quantum_private.activity_meetup_admission_deposits
for each row execute function quantum_private.account_admission_finance_owner_lock();
create trigger account_admission_owner_refund
before insert or update on quantum_private.activity_meetup_admission_refund_outbox
for each row execute function quantum_private.account_admission_finance_owner_lock();

create function quantum_private.guard_account_admission_erasure()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  -- DELETE already owns the public.users row lock. Never take native admission
  -- global/user/room advisory locks or ledger row locks here: receipt operations
  -- take those before writing, so doing so here would invert their lock order.
  if quantum_private.account_has_unresolved_meetup_payments(old.id) then
    raise exception 'account_financial_retention_pending' using errcode='55000';
  end if;
  -- An old automatic legal-ready flag is not a review of money that arrived
  -- later. Preserve the existing explicit evidence-hash review requirement.
  if quantum_private.account_has_legal_retention_candidates(old.id) and exists(
    select 1 from quantum_private.account_deletion_requests request
    where request.user_id=old.id and request.status not in ('completed','cancelled')
      and not exists(
        select 1 from quantum_private.account_legal_retention_reviews review
        where review.request_id=request.id and request.legal_retention_ready
          and review.review_reference_hash=request.legal_review_reference_hash
          and request.legal_reviewed_at is not null
      )
  ) then
    raise exception 'account_financial_retention_pending' using errcode='55000';
  end if;
  return old;
end;
$$;

create trigger account_admission_finance_before_delete
before delete on public.users for each row
execute function quantum_private.guard_account_admission_erasure();

create or replace function public.confirm_account_auth_delete_ready_for_service(
  p_request_id uuid,p_user_id uuid,p_worker_token uuid
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_ready boolean;
begin
  perform quantum_private.account_require_service();
  select request.legal_retention_ready and request.storage_cleanup_ready
    and request.status='auth_delete_pending'
    and not quantum_private.account_has_unresolved_meetup_payments(request.user_id)
    and (not quantum_private.account_has_legal_retention_candidates(request.user_id) or exists(
      select 1 from quantum_private.account_legal_retention_reviews review
      where review.request_id=request.id
        and review.review_reference_hash=request.legal_review_reference_hash
        and request.legal_reviewed_at is not null
    ))
    and not exists(select 1 from quantum_private.retention_cleanup_jobs pending
      where pending.request_id=request.id and pending.kind='storage_object' and pending.status<>'completed')
    and not exists(select 1 from public.photos photo where photo.user_id=request.user_id
      and not exists(select 1 from quantum_private.retention_cleanup_jobs job
        where job.source_kind='profile_photo' and job.source_record_id=photo.id and job.status='completed'))
    and not exists(select 1 from public.quantum_continuation_album_photos photo
      where photo.uploader_user_id=request.user_id and photo.status<>'deleted')
    and not exists(select 1 from public.meeting_photo_evidence evidence
      where evidence.uploader_user_id=request.user_id and evidence.status<>'deleted'
        and evidence.dispute_hold=false)
    and not exists(select 1 from public.campus_seven_attendance_evidence evidence
      join public.campus_seven_enrollments enrollment on enrollment.id=evidence.enrollment_id
      where enrollment.user_id=request.user_id and evidence.deleted_at is null)
  into v_ready
  from quantum_private.account_deletion_requests request
  join quantum_private.retention_cleanup_jobs auth_job on auth_job.request_id=request.id
    and auth_job.kind='auth_user' and auth_job.status='processing'
    and auth_job.claim_token=p_worker_token
  where request.id=p_request_id and request.user_id=p_user_id;
  return coalesce(v_ready,false);
end;
$$;

revoke all on function quantum_private.account_has_legal_retention_candidates(uuid),
  quantum_private.account_has_unresolved_meetup_payments(uuid),
  quantum_private.account_admission_finance_owner_lock(),
  quantum_private.guard_account_admission_erasure(),
  public.confirm_account_auth_delete_ready_for_service(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.confirm_account_auth_delete_ready_for_service(uuid,uuid,uuid) to service_role;

comment on function quantum_private.account_has_unresolved_meetup_payments(uuid) is
  'Prepared/confirming/reconciliation checkout or unreturned deposit/liability blocks erasure regardless of expiry or legal approval. Terminal records still follow legal retention review.';
commit;
