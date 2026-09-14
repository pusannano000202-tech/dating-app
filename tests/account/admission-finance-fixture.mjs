import {readFile} from 'node:fs/promises'

export const erasureMigration = new URL('../../supabase/migrations/20260914032828_account_admission_erasure_guard.sql', import.meta.url)

// Explicit legacy-table fixtures, plus actual current account request/job schema
// and role/access helpers. This does not pretend to implement Supabase Auth.
export async function accountFinanceDependencies() {
  const source = await readFile(new URL('../../supabase/migrations/20260906181225_community_social_integrated.sql', import.meta.url), 'utf8')
  const extract = name => {
    const tail = source.slice(source.indexOf(`create or replace function ${name}(`))
    return tail.slice(0, tail.indexOf('$$;') + 3)
  }
  return `
    create schema if not exists private;
    create or replace function private.current_request_role() returns text language sql stable as $$select null::text$$;
    create table public.deposits(user_id uuid);
    create table public.deposit_refund_requests(user_id uuid);
    create table public.campus_seven_deposit_holds(user_id uuid);
    create table public.campus_seven_deposit_reviews(user_id uuid);
    create table public.tonight_deposits(user_id uuid);
    create table public.tonight_deposit_refund_requests(requested_by uuid);
    create table public.quantum_continuation_fee_orders(owner_user_id uuid,target_user_id uuid);
    create table public.photos(id uuid,user_id uuid);
    create table public.meeting_photo_evidence(uploader_user_id uuid,dispute_hold boolean,status text);
    create table public.quantum_continuation_album_photos(uploader_user_id uuid,status text);
    create table public.campus_seven_enrollments(id uuid,user_id uuid);
    create table public.campus_seven_attendance_evidence(enrollment_id uuid,deleted_at timestamptz);
    ${source.slice(source.indexOf('create table quantum_private.account_deletion_requests ('), source.indexOf('alter table quantum_private.account_deletion_requests enable row level security;'))}
    ${extract('quantum_private.account_current_request_role')}
    ${extract('quantum_private.account_require_service')}
    ${extract('quantum_private.account_deletion_blocks_access')}
    ${extract('public.approve_account_legal_retention_for_service')}
  `
}
