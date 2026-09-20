import {accountFinanceDependencies,erasureMigration} from '../account/admission-finance-fixture.mjs'
import {readFile} from 'node:fs/promises'

// Existing retention policy, with only unrelated legacy-table adapters. Every
// database is an isolated in-memory PGlite instance, never the local Supabase DB.
export async function installCalendarErasurePolicy(f) {
  const dependencies=(await accountFinanceDependencies())
    .replace('create table public.photos(id uuid,user_id uuid);','alter table public.photos add id uuid default gen_random_uuid();')
    .replace(/create or replace function private\.current_request_role\(\)[^;]+;/,'')
  await f.db.exec(dependencies)
  await f.db.exec(`create table quantum_private.meetup_admission_checkout_orders(user_id uuid,intent_id uuid,state text);
    create table quantum_private.activity_meetup_admission_deposits(id uuid,user_id uuid,intent_id uuid,state text);
    create table quantum_private.activity_meetup_admission_refund_outbox(deposit_id uuid,state text);`)
  await f.db.exec(await readFile(erasureMigration,'utf8'))
  await f.db.exec(`alter table public.users add foreign key(id) references auth.users(id) on delete cascade;
    alter table quantum_private.relationship_states drop constraint relationship_states_user_id_fkey;
    alter table quantum_private.relationship_states add foreign key(user_id) references public.users(id) on delete cascade;`)
}
