import { readFileSync, readdirSync } from 'node:fs'
const root = new URL('../../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

// Minimal synthetic schema for running the production matching refund SQL.
// PostgreSQL roles are cluster-wide, so creation is safe alongside sibling DBs.
export const schemaSql = `
  do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end$$;
  create schema auth;
  create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
  create table public.deposits(id uuid primary key,match_id uuid,group_id uuid,user_id uuid,
    amount int,status text,toss_order_id text,toss_payment_key text,refunded_amount int,
    retained_amount int,refunded_at timestamptz,notes text);
  create table public.deposit_refund_requests(id uuid primary key,deposit_id uuid,match_id uuid,user_id uuid,
    requested_refund_amount int,status text,processed_at timestamptz,created_at timestamptz default now(),
    settlement_version int default 1,provider text,provider_status text,settlement_key text,
    provider_request_key text,provider_payment_key text,provider_order_id text,settled_refund_amount int);
  create table public.matches(id uuid primary key,group_a_id uuid,group_b_id uuid);
  create table public.group_members(group_id uuid,user_id uuid,left_at timestamptz);
  create table public.notifications(user_id uuid,kind text,payload jsonb);
  create table public.deposit_carryovers(id uuid primary key,deposit_id uuid,user_id uuid,source_match_id uuid,
    target_match_id uuid,status text,applied_at timestamptz,created_at timestamptz default now());
  grant usage on schema public,auth to service_role;
  grant all on all tables in schema public to service_role;
  select set_config('request.jwt.claim.role','service_role',false);
`
export function migrationsSql() {
  const old = read('supabase/migrations/20260715155041_phase12_payment_ownership_refund_and_friend_safety.sql')
  const start = old.indexOf('CREATE OR REPLACE FUNCTION public.finalize_refund_request(')
  const carryover = read('supabase/migrations/20260812003000_deposit_carryover.sql')
  const guardStart = carryover.indexOf('CREATE OR REPLACE FUNCTION public.guard_refund_against_carryover()')
  const guardEnd = carryover.indexOf('FOR EACH ROW EXECUTE FUNCTION public.guard_refund_against_carryover();', guardStart)
    + 'FOR EACH ROW EXECUTE FUNCTION public.guard_refund_against_carryover();'.length
  return old.slice(start, old.indexOf('-- Automatic end-choice', start)) + '\n'
    + read('supabase/migrations/20260811234500_refund_settlement_worker.sql') + '\n'
    + carryover.slice(guardStart, guardEnd) + '\n'
    + readdirSync(new URL('supabase/migrations/', root))
      .filter(name => name.endsWith('_deposit_webhook_reconciliation.sql'))
      .map(name => read(`supabase/migrations/${name}`)).join('\n')
}
