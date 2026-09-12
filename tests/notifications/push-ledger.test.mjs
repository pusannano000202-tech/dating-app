import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const migration=new URL('../../supabase/migrations/20260912025017_common_notifications_web_push.sql',import.meta.url)
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002']
const endpoint='https://fcm.googleapis.com/fcm/send/test-token',key='B'+'a'.repeat(86),secret='b'.repeat(22),consent='2026-09-12-common-alerts-v1'
async function fixture(){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema quantum_private;
 create table public.users(id uuid primary key);create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
 create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id) on delete cascade,kind text not null,payload jsonb default '{}',read_at timestamptz,created_at timestamptz not null default clock_timestamp());
 create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function quantum_private.account_deletion_blocks_access(uuid)returns boolean language sql stable as $$select false$$;
 create table quantum_private.social_notification_events(notification_id uuid primary key,domain text,entity_id uuid,recipient_id uuid,team_id uuid,entity_type text,actor_id uuid);
 create function quantum_private.social_notification_scope(text,uuid,uuid,uuid,text)returns boolean language sql stable as $$select true$$;
 create function quantum_private.tonight_invite_pair_is_blocked(uuid,uuid)returns boolean language sql stable as $$select false$$;`)
 for(const id of ids){await db.query('insert into public.users values($1)',[id]);await db.query('insert into auth.users(id) values($1)',[id])}
 await db.exec(await readFile(migration,'utf8'))
 const rpc=async(role,user,name,args=[])=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);await db.exec('set role '+role);try{return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value}finally{await db.exec('reset role')}}
 const subscribe=(who=ids[0],ep=endpoint)=>rpc('authenticated',who,'upsert_my_common_push_subscription',[ep,key,secret,consent])
 const note=async(kind='meetup_admission',user=ids[0])=>(await db.query('insert into public.notifications(user_id,kind)values($1,$2)returning id',[user,kind])).rows[0].id
 const claim=()=>rpc('service_role',null,'claim_common_web_push_deliveries',[20])
 const complete=(row,outcome='provider_accepted',code=null)=>rpc('service_role',null,'complete_common_web_push_delivery',[row.delivery_id,row.revision,outcome,code])
 return {db,rpc,subscribe,note,claim,complete}
}
test('common subscription contract exists before it can be advertised by the browser',async()=>{const f=await fixture();try{assert.ok((await f.db.query("select to_regprocedure('public.upsert_my_common_push_subscription(text,text,text,text)') p")).rows[0].p)}finally{await f.db.close()}})
test('explicit owner-bound subscription refuses anonymous, stale consent, hijack and SSRF endpoints',async()=>{const f=await fixture();try{
 await assert.rejects(f.rpc('authenticated',null,'upsert_my_common_push_subscription',[endpoint,key,secret,consent]),/not_authenticated/)
 await assert.rejects(f.rpc('authenticated',ids[0],'upsert_my_common_push_subscription',[endpoint,key,secret,'old']),/invalid_push_subscription/)
 await f.subscribe();await assert.rejects(f.subscribe(ids[1]),/subscription_owned_by_another_user/)
 assert.equal(await f.rpc('authenticated',ids[1],'delete_my_common_push_subscription',[endpoint]),false)
 for(const ep of ['https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://fcm.googleapis.com:443/a','https://fcm.googleapis.com/a#b'])await assert.rejects(f.subscribe(ids[0],ep),/invalid_push_subscription/)
 const privileges=(await f.db.query("select has_table_privilege('authenticated','quantum_private.common_push_subscriptions','select') s,has_function_privilege('authenticated','public.claim_common_web_push_deliveries(integer)','execute') c,has_function_privilege('anon','public.upsert_my_common_push_subscription(text,text,text,text)','execute') a")).rows[0]
 assert.deepEqual(privileges,{s:false,c:false,a:false})
 }finally{await f.db.close()}})
test('notification and outbox commit atomically, retry once per subscription, legacy pipelines excluded',async()=>{const f=await fixture();try{
 await f.subscribe();const id=await f.note();for(const kind of ['tonight_journey','campus_seven_guide','phone_revealed'])await f.note(kind)
 let rows=await f.claim();assert.equal(rows.length,1);assert.equal(rows[0].notification_id,id);assert.equal((await f.claim()).length,0)
 assert.equal(await f.complete(rows[0]),true);assert.equal(await f.complete(rows[0]),false)
 assert.equal((await f.db.query("select state from quantum_private.common_push_deliveries")).rows[0].state,'provider_accepted')
 assert.equal((await f.claim()).length,0)
 await f.db.exec('begin');await f.note();await f.db.exec('rollback');assert.equal((await f.claim()).length,0)
 }finally{await f.db.close()}})
test('stale revisions cannot complete newer leases; retry is bounded and expired endpoint is disabled',async()=>{const f=await fixture();try{
 await f.subscribe();await f.note();const first=(await f.claim())[0]
 await f.db.exec("update quantum_private.common_push_deliveries set lease_until=clock_timestamp()-interval '1 second'")
 const second=(await f.claim())[0];assert.ok(second.revision>first.revision);assert.equal(await f.complete(first),false)
 assert.equal(await f.complete(second,'retry','transport_failed'),true);assert.equal((await f.claim()).length,0)
 await f.db.exec("update quantum_private.common_push_deliveries set next_attempt_at=clock_timestamp()-interval '1 second'")
 const third=(await f.claim())[0];assert.equal(await f.complete(third,'expired','endpoint_expired'),true)
 await f.note();assert.equal((await f.claim()).length,0)
 assert.equal((await f.db.query('select revoked_at is not null b from quantum_private.common_push_subscriptions')).rows[0].b,true)
 }finally{await f.db.close()}})
test('read, banned, revoked and deleted recipients cannot produce an authorized send',async()=>{const f=await fixture();try{
 await f.subscribe();const id=await f.note();const row=(await f.claim())[0]
 assert.ok(await f.rpc('service_role',null,'get_common_web_push_delivery',[row.delivery_id,row.revision]))
 await f.db.query('update public.notifications set read_at=clock_timestamp()where id=$1',[id]);assert.equal(await f.rpc('service_role',null,'get_common_web_push_delivery',[row.delivery_id,row.revision]),null)
 await f.note();await f.db.query("update auth.users set banned_until=clock_timestamp()+interval '1 day'where id=$1",[ids[0]]);assert.equal((await f.claim()).length,0)
 await f.db.query('update auth.users set banned_until=null where id=$1',[ids[0]]);await f.rpc('authenticated',ids[0],'delete_my_common_push_subscription',[endpoint]);await f.note();assert.equal((await f.claim()).length,0)
 await f.db.query('delete from public.users where id=$1',[ids[0]]);assert.equal((await f.db.query('select count(*)::int n from quantum_private.common_push_subscriptions')).rows[0].n,0)
 }finally{await f.db.close()}})
test('new opt-in never sends a backlog; simultaneous device key update invalidates a claimed delivery',async()=>{const f=await fixture();try{
 await f.note();await f.subscribe();assert.equal((await f.claim()).length,0)
 await f.note();const row=(await f.claim())[0];await f.rpc('authenticated',ids[0],'upsert_my_common_push_subscription',[endpoint,key,'c'.repeat(22),consent])
 assert.equal(await f.rpc('service_role',null,'get_common_web_push_delivery',[row.delivery_id,row.revision]),null)
 assert.equal((await f.claim()).length,0)
 }finally{await f.db.close()}})
test('paid application and room-notice alerts delegate current recipient authority to the admission lifecycle',async()=>{const f=await fixture();try{
 await f.db.exec("create function quantum_private.meetup_admission_notification_current(uuid,uuid)returns boolean language sql as $$select false$$")
 for(const entity_type of['admission','admission_notice']){
  const id=(await f.db.query("insert into public.notifications(user_id,kind,payload)values($1,'social_activity',jsonb_build_object('entity_type',$2::text))returning id",[ids[0],entity_type])).rows[0].id
  assert.equal((await f.db.query('select quantum_private.common_web_push_notification_current($1)c',[id])).rows[0].c,false)
 }
 await f.db.exec("create or replace function quantum_private.meetup_admission_notification_current(uuid,uuid)returns boolean language sql as $$select true$$")
 assert.equal((await f.db.query("select bool_and(quantum_private.common_web_push_notification_current(id))c from public.notifications")).rows[0].c,true)
 }finally{await f.db.close()}})
