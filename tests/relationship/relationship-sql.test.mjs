import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migration = new URL('../../supabase/migrations/20260909165649_private_relationship_state_guard.sql', import.meta.url)
const A = '10000000-0000-4000-8000-000000000001', B = '10000000-0000-4000-8000-000000000002'
const C = '10000000-0000-4000-8000-000000000003', D = '10000000-0000-4000-8000-000000000004'
const G = '20000000-0000-4000-8000-000000000001', H = '20000000-0000-4000-8000-000000000002'
async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema quantum_private;
    create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
    create table public.users(id uuid primary key references auth.users on delete cascade);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    create function quantum_private.account_deletion_blocks_access(uuid) returns boolean language sql stable as $$ select false $$;
    create table public.groups(id uuid primary key,status text);
    create table public.group_members(group_id uuid,user_id uuid,left_at timestamptz);
    create table public.match_pool(id uuid default gen_random_uuid(),group_id uuid,status text);
    create table public.matches(id uuid default gen_random_uuid(),group_a_id uuid,group_b_id uuid,status text);
    create table public.tonight_applications(id uuid primary key,round_id uuid,user_id uuid,bundle_id uuid,status text);
    create table public.tonight_team_members(team_id uuid,application_id uuid,user_id uuid,member_status text);
    create table public.quantum_weekly_applications(id uuid primary key,user_id uuid,status text);
    create table public.quantum_weekly_application_members(application_id uuid,participant_user_id uuid,consent_status text,lifecycle_status text);
    create table public.quantum_event_participations(user_id uuid primary key,group_id uuid,occurrence_id uuid,status text);
    create table public.quantum_event_match_members(match_id uuid,user_id uuid);
    create table public.quantum_continuation_join_proposals(id uuid primary key,candidate_user_id uuid,series_id uuid,target_program_day integer,status text);
    create table public.quantum_continuation_join_proposal_members(proposal_id uuid,participant_user_id uuid,member_role text);
    create table public.quantum_continuation_join_consents(proposal_id uuid,participant_user_id uuid,decision text);
    create table public.quantum_continuation_transitions(series_id uuid,target_program_day integer);
    create table quantum_private.fixture_inputs(kind text primary key,payload jsonb);
    create function public.service_get_tonight_allocator_input(uuid) returns jsonb language sql as $$ select payload from quantum_private.fixture_inputs where kind='tonight' $$;
    create function public.service_get_weekly_allocator_input(uuid) returns jsonb language sql as $$ select payload from quantum_private.fixture_inputs where kind='weekly' $$;
  `)
  for (const id of [A,B,C,D]) {await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into public.users values($1)',[id])}
  await db.exec(await readFile(migration,'utf8'))
  // Other modules expose selected private-schema RPCs. Security must still hold
  // when schema USAGE is present; it cannot depend on namespace invisibility.
  await db.exec('grant usage on schema quantum_private to anon,authenticated,service_role')
  async function actor(user,sql,args=[]) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)",[user??''])
    await db.exec('set role authenticated')
    try {return (await db.query(sql,args)).rows[0]?.value} finally {await db.exec('reset role')}
  }
  const get = user => actor(user,'select public.get_my_relationship_state() as value')
  const set = (user,status) => actor(user,'select public.set_my_relationship_state($1) as value',[status])
  return {db,actor,get,set}
}

test('private default, real-change 720 hour lock, no-op idempotency, exact boundary and account deletion',async()=>{
  const {db,get,set,actor}=await fixture()
  try {
    const initial=await get(A)
    assert.equal(initial.status,'single');assert.equal(initial.changed_at,null);assert.equal(initial.can_change,true)
    assert.deepEqual(Object.keys(initial).sort(),['can_change','changed_at','next_change_at','server_now','status'])
    assert.equal((await set(A,'single')).changed_at,null)
    const changed=await set(A,'in_relationship')
    assert.equal(Date.parse(changed.next_change_at)-Date.parse(changed.changed_at),30*24*3600*1000)
    assert.equal(changed.can_change,false)
    assert.equal((await set(A,'in_relationship')).changed_at,changed.changed_at)
    await assert.rejects(set(A,'single'),/relationship_change_locked/)
    await db.query("update quantum_private.relationship_states set changed_at=clock_timestamp()-interval '720 hours'+interval '10 seconds' where user_id=$1",[A])
    await assert.rejects(set(A,'single'),/relationship_change_locked/)
    await db.query("update quantum_private.relationship_states set changed_at=clock_timestamp()-interval '720 hours' where user_id=$1",[A])
    assert.equal((await set(A,'single')).status,'single')
    assert.equal((await get(B)).status,'single')
    await assert.rejects(set(B,'married'),/invalid_relationship_status/)
    await assert.rejects(get(null),/relationship_not_authenticated/)
    await assert.rejects(actor(B,'select * from quantum_private.relationship_states'),/permission denied/)
    await assert.rejects(actor(B,'select quantum_private.relationship_user_eligible($1) as value',[A]),/permission denied/)
    for(const role of ['anon','authenticated','service_role']) {
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',[role,'quantum_private.relationship_states','SELECT'])).rows[0].allowed,false)
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',[role,'quantum_private.my_relationship_state(text)','EXECUTE'])).rows[0].allowed,false)
    }
    await db.query('delete from auth.users where id=$1',[A])
    assert.equal((await db.query('select count(*)::int as n from quantum_private.relationship_states where user_id=$1',[A])).rows[0].n,0)
    await assert.rejects(get(A),/relationship_forbidden/)
  } finally {await db.close()}
})

test('new intake and stale-pending allocation fail closed; existing confirmed updates and cancellation survive',async()=>{
  const {db,set}=await fixture()
  try {
    await db.query("insert into tonight_applications values($1,$2,$3,$4,'submitted')",[G,H,A,G])
    await db.query("insert into tonight_team_members values($1,$2,$3,'assigned')",[G,G,A])
    await db.query("insert into quantum_weekly_applications values($1,$2,'active')",[G,A])
    await db.query("insert into quantum_weekly_application_members values($1,$2,'accepted','active')",[G,B])
    await db.query("insert into quantum_event_participations values($1,null,$2,'recruiting')",[A,G])
    await set(A,'in_relationship')
    await assert.rejects(db.query("insert into tonight_applications values($1,$2,$3,$4,'submitted')",[H,H,A,H]),/dating_participation_unavailable/)
    await assert.rejects(db.query("update tonight_applications set status='allocated' where id=$1",[G]),/dating_participation_unavailable/)
    await assert.rejects(db.query("insert into tonight_team_members values($1,$2,$3,'assigned')",[H,G,A]),/dating_participation_unavailable/)
    await assert.rejects(db.query("update quantum_weekly_applications set status='assigned' where id=$1",[G]),/dating_participation_unavailable/)
    await assert.rejects(db.query("update quantum_event_participations set status='confirmed' where user_id=$1",[A]),/dating_participation_unavailable/)
    await assert.rejects(db.query('insert into quantum_event_match_members values($1,$2)',[G,A]),/dating_participation_unavailable/)
    await db.query("update tonight_team_members set member_status='confirmed' where user_id=$1",[A])
    await db.query("update tonight_applications set status='waitlisted' where id=$1",[G])
    await db.query("update tonight_applications set status='withdrawn' where id=$1",[G])
    await db.query("update quantum_weekly_applications set status='cancelled' where id=$1",[G])
    await db.query("update quantum_event_participations set status='cancelled' where user_id=$1",[A])
    await db.exec('alter table quantum_private.relationship_states rename to unavailable_relationship_states')
    await assert.rejects(db.query("insert into tonight_applications values($1,$2,$3,$4,'submitted')",[H,H,C,H]),/relationship_states/)
  } finally {await db.close()}
})

test('group and accepted companion admission guards are private, without blocking ordinary group formation',async()=>{
  const {db,set}=await fixture()
  try {
    await db.query("insert into groups values($1,'forming'),($2,'forming')",[G,H])
    await set(A,'in_relationship')
    await db.query('insert into group_members values($1,$2,null),($3,$4,null)',[G,A,H,B])
    await assert.rejects(db.query("insert into match_pool(group_id,status) values($1,'waiting')",[G]),/dating_participation_unavailable/)
    await assert.rejects(db.query("insert into matches(group_a_id,group_b_id,status) values($1,$2,'pending')",[G,H]),/dating_participation_unavailable/)
    await db.query("insert into match_pool(group_id,status) values($1,'waiting')",[H])
    await assert.rejects(db.query('insert into group_members values($1,$2,null)',[H,A]),/dating_participation_unavailable/)
    await db.query("insert into quantum_weekly_applications values($1,$2,'active')",[G,B])
    await db.query("insert into quantum_weekly_application_members values($1,$2,'pending','awaiting_consents')",[G,A])
    await assert.rejects(db.query("update quantum_weekly_application_members set consent_status='accepted' where application_id=$1",[G]),/dating_participation_unavailable/)
    await db.query("update quantum_weekly_application_members set consent_status='withdrawn' where application_id=$1",[G])
    await assert.rejects(db.query("insert into quantum_weekly_application_members values($1,$2,'accepted','active')",[G,A]),/dating_participation_unavailable/)
  } finally {await db.close()}
})

test('allocator input excludes whole ineligible companion bundles/parties instead of stopping other applicants',async()=>{
  const {db,set}=await fixture()
  try {
    const appIds=[G,H,'20000000-0000-4000-8000-000000000003']
    for (let i=0;i<3;i++) await db.query("insert into tonight_applications values($1,$2,$3,$4,'submitted')",[appIds[i],G,[A,B,C][i],i<2?G:H])
    const tonight={round:{id:G},activities:[],capacities:[],applications:appIds.map((id,i)=>({application_id:id,bundle_id:i<2?G:H,bundle_size:i<2?2:1}))}
    const weekly={window:{window_id:G},applications:[{application_id:G,members:[{participant_user_id:A},{participant_user_id:B}]},{application_id:H,members:[{participant_user_id:C}]}]}
    for(const [kind,payload] of [['tonight',tonight],['weekly',weekly]]) await db.query('insert into quantum_private.fixture_inputs values($1,$2)',[kind,JSON.stringify(payload)])
    await set(A,'in_relationship')
    await db.exec("select set_config('request.jwt.claim.role','service_role',false); set role service_role")
    const t=(await db.query('select public.service_get_tonight_allocator_input($1) as v',[G])).rows[0].v
    const w=(await db.query('select public.service_get_weekly_allocator_input($1) as v',[G])).rows[0].v
    assert.equal(t.applications.length,1);assert.equal(t.applications[0].application_id,appIds[2]);assert.equal(w.applications.length,1);assert.equal(w.applications[0].application_id,H)
    await db.exec('reset role')
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false);set role authenticated")
    await assert.rejects(db.query('select public.service_get_weekly_allocator_input($1)',[G]),/permission denied/)
  } finally {await db.exec('reset role');await db.close()}
})

test('external continuation newcomers are rechecked, existing appointments are not cancelled',async()=>{
  const {db,set}=await fixture()
  try {
    await db.query("insert into quantum_continuation_join_proposals values($1,$2,$3,2,'accepted')",[G,A,H])
    await db.query("insert into quantum_continuation_join_proposal_members values($1,$2,'candidate')",[G,A])
    await set(A,'in_relationship')
    await assert.rejects(db.query("insert into quantum_continuation_join_consents values($1,$2,'accept')",[G,A]),/dating_participation_unavailable/)
    await assert.rejects(db.query('insert into quantum_continuation_transitions values($1,2)',[H]),/dating_participation_unavailable/)
    await db.query("insert into quantum_continuation_join_consents values($1,$2,'reject')",[G,A])
    await db.query('insert into quantum_continuation_transitions values($1,3)',[H])
  } finally {await db.close()}
})

test('queued conflicting requests cannot bypass cooldown; same-state retries do not move the timestamp',async()=>{
  const {db,get}=await fixture()
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[A])
    await db.exec('set role authenticated')
    // PGlite serializes one connection. This exercises concurrent callers, not
    // a claim of real multi-connection PostgreSQL lock-contention verification.
    const responses=await Promise.allSettled([
      db.query("select public.set_my_relationship_state('in_relationship') as v"),
      db.query("select public.set_my_relationship_state('single') as v"),
    ])
    assert.equal(responses[0].status,'fulfilled');assert.equal(responses[1].status,'rejected')
    const again=await Promise.all([
      db.query("select public.set_my_relationship_state('in_relationship') as v"),
      db.query("select public.set_my_relationship_state('in_relationship') as v"),
    ])
    assert.equal(again[0].rows[0].v.changed_at,again[1].rows[0].v.changed_at)
    await db.exec('reset role')
    await db.query("update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=$1",[B])
    await assert.rejects(get(B),/relationship_forbidden/)
    await assert.rejects(db.query("insert into tonight_applications values($1,$2,$3,$4,'submitted')",[G,G,B,G]),/dating_participation_unavailable/)
    assert.equal((await db.query('select count(*)::int as n from quantum_private.relationship_states where user_id=$1',[B])).rows[0].n,0)
  } finally {await db.exec('reset role');await db.close()}
})
