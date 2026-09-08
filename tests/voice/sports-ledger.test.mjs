import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'

// Embedded Postgres with explicit Auth/readiness fixtures; not live Supabase/RLS or KBO verification.
async function setup(){
 const db=new PGlite()
 await db.exec(`
 create role anon;create role authenticated;create role service_role;create schema auth;create schema quantum_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
 create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);create table public.users(id uuid primary key references auth.users(id));
 create table public.friend_requests(id uuid primary key,sender_user_id uuid,receiver_user_id uuid,status text);create table public.friendships(user_id uuid,friend_user_id uuid,status text,created_from_request_id uuid,blocked_by uuid,blocked_at timestamptz,primary key(user_id,friend_user_id));
 create table public.notifications(user_id uuid,kind text,payload jsonb);create table quantum_private.community_member_profiles(user_id uuid primary key,school_scope text,department text,community_gender text,display_name text,friend_recognition_name text);
 create function public.get_access_context() returns table(access_role text) language sql stable as $$select coalesce(nullif(current_setting('test.access_role',true),''),'user')$$;
 create function quantum_private.resolve_profile_readiness(p_user uuid) returns table(minimum_signup_complete boolean) language sql stable as $$select exists(select 1 from quantum_private.community_member_profiles where user_id=p_user)$$;
 create function quantum_private.tonight_invite_pair_is_blocked(a uuid,b uuid) returns boolean language sql stable as $$select false$$;
 create function quantum_private.canonical_department_key(v text) returns text language sql immutable as $$select nullif(lower(regexp_replace(btrim(v),'[[:space:]]+','','g')),'')$$;
 create function quantum_private.get_member_department_key(u uuid) returns text language sql stable as $$select quantum_private.canonical_department_key(department) from quantum_private.community_member_profiles where user_id=u$$;
 `)
 await db.exec(await readFile(new URL('../../docs/implementation/community-voice/g5-g6-schema.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../../docs/implementation/community-voice/g5-sports-events.sql',import.meta.url),'utf8'))
 const users=[randomUUID(),randomUUID(),randomUUID(),randomUUID()]
 for(let i=0;i<users.length;i++){await db.query('insert into auth.users(id) values($1)',[users[i]]);await db.query('insert into public.users(id) values($1)',[users[i]]);await db.query('insert into quantum_private.community_member_profiles values($1,$2,$3,$4,$5,$6)',[users[i],i===3?'other_school':'pnu_self_selected','기계공학과',i%2?'male':'female','별칭'+i,'친구이름'+i])}
 const as=(user,role='user')=>db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.access_role',$2,false),set_config('request.jwt.claim.role','authenticated',false)",[user,role])
 const sports=(op,payload={})=>db.query('select public.community_sports_event_command($1,$2::jsonb) as value',[op,JSON.stringify(payload)]).then(r=>r.rows[0].value)
 const voice=(op,payload={})=>db.query('select public.community_voice_command($1,$2::jsonb) as value',[op,JSON.stringify(payload)]).then(r=>r.rows[0].value)
 return {db,users,as,sports,voice}
}
function eventInput(overrides={}){return {sport:'baseball',league:'KBO',eventKey:'kbo:2026-09-08-lotte-lg-1',homeTeam:'LG 트윈스',awayTeam:'롯데 자이언츠',startsAt:new Date(Date.now()-60000).toISOString(),status:'scheduled',sourceUrl:'https://www.koreabaseball.com/Schedule/Schedule.aspx',sourceRevision:'2026-09-07 21:00 운영자 재확인',reviewNote:'KBO 공식 일정 페이지를 직접 확인함',...overrides}}
function mutation(event,extra={}){return {event,expectedRevision:0,idempotencyKey:randomUUID(),...extra}}

test('manual sports records are private, school scoped, owner scoped, and idempotent',async()=>{
 const f=await setup();try{
  await f.as(f.users[0]);await assert.rejects(()=>f.sports('list'),/forbidden/)
  await f.as(f.users[0],'admin');const payload=mutation(eventInput());const created=await f.sports('create',payload);assert.deepEqual(await f.sports('create',payload),created);assert.equal(created.event.sourceLabel,'operator_manual_review');assert.equal(created.event.history.length,1)
  const own=await f.sports('list');assert.equal(own.events.length,1);assert.equal(own.events[0].schoolScope,'pnu_self_selected')
  await f.as(f.users[1],'admin');assert.equal((await f.sports('list')).events.length,0);await assert.rejects(()=>f.sports('update',mutation(eventInput(),{eventId:created.event.id,idempotencyKey:randomUUID()})),/not_found/)
  await f.as(f.users[2],'admin');await f.db.query('delete from quantum_private.community_member_profiles where user_id=$1',[f.users[2]]);await assert.rejects(()=>f.sports('create',mutation(eventInput({eventKey:'kbo:2026-09-10-lotte-lg-1'}))),/minimum_signup_required/)
  await f.db.query('update quantum_private.community_member_profiles set school_scope=$2 where user_id=$1',[f.users[0],'other_school']);await f.as(f.users[0],'admin');assert.equal((await f.sports('list')).events.length,0);await assert.rejects(()=>f.sports('create',payload),/not_found/);await assert.rejects(()=>f.sports('update',mutation(eventInput(),{eventId:created.event.id})),/not_found/)
  await f.as(f.users[3],'super_admin');assert.equal((await f.sports('list')).events.length,1)
  const grants=await f.db.query("select has_table_privilege('authenticated','quantum_private.community_sports_events','SELECT') as exposed,has_function_privilege('anon','public.community_sports_event_command(text,jsonb)','EXECUTE') as callable");assert.deepEqual(grants.rows[0],{exposed:false,callable:false})
 }finally{await f.db.close()}
})

test('manual corrections use revision CAS and retain an append-only review history',async()=>{
 const f=await setup();try{
  await f.as(f.users[0],'admin');const created=await f.sports('create',mutation(eventInput()))
  await assert.rejects(()=>f.sports('create',mutation(eventInput({eventKey:'kbo:invalid-time',startsAt:'infinity'}))),/community_sports_events_starts_at_check/)
  await assert.rejects(()=>f.sports('create',mutation(eventInput({eventKey:'kbo:invalid-source',sourceRevision:'검수 기록\n위조'}))),/community_sports_events_source_revision_check/)
  const delayedPayload=mutation(eventInput({status:'delayed',reviewNote:'우천으로 경기 시작 지연을 공식 일정에서 재확인'}),{eventId:created.event.id,expectedRevision:0});const delayed=await f.sports('update',delayedPayload);assert.equal(delayed.event.revision,1);assert.deepEqual(await f.sports('update',delayedPayload),delayed)
  await assert.rejects(()=>f.sports('update',mutation(eventInput({status:'cancelled'}),{eventId:created.event.id,expectedRevision:0})),/stale_revision/)
  const cancelled=await f.sports('update',mutation(eventInput({status:'cancelled',reviewNote:'우천 취소를 공식 일정에서 최종 확인'}),{eventId:created.event.id,expectedRevision:1}));assert.equal(cancelled.event.revision,2);assert.deepEqual(cancelled.event.history.map(v=>v.revision),[2,1,0])
 }finally{await f.db.close()}
})

test('baseball voice rooms require a fresh matching manual record and recheck status before open',async()=>{
 const f=await setup();try{
  await f.as(f.users[0],'admin');const input=eventInput();const event=await f.sports('create',mutation(input))
  const base={title:'공식 야구 응원방',description:'중계는 각자 보고 함께 응원해요',topic:'baseball',scope:'school',departmentKey:null,capacity:12,startsAt:input.startsAt,endsAt:new Date(Date.parse(input.startsAt)+3*3600000).toISOString(),sourceUrl:input.sourceUrl,sourceRevision:input.sourceRevision,sourceEventKey:input.eventKey}
  await assert.rejects(()=>f.voice('create_room',{...base,startsAt:new Date(Date.parse(input.startsAt)+60000).toISOString(),idempotencyKey:randomUUID()}),/sports_event_mismatch/)
  const room=(await f.voice('create_room',{...base,idempotencyKey:randomUUID()})).room
  const delayed=await f.sports('update',mutation({...input,status:'delayed',reviewNote:'경기 지연을 운영자가 다시 확인함'},{eventId:event.event.id,expectedRevision:0}));await assert.rejects(()=>f.voice('room_command',{roomId:room.id,action:'open',expectedRevision:0,idempotencyKey:randomUUID()}),/sports_event_not_ready/)
  await f.sports('update',mutation({...input,status:'scheduled',reviewNote:'새 공지 후 정상 시작을 다시 확인함'},{eventId:event.event.id,expectedRevision:delayed.event.revision}));assert.equal((await f.voice('room_command',{roomId:room.id,action:'open',expectedRevision:0,idempotencyKey:randomUUID()})).room.status,'open')
  const staleInput=eventInput({eventKey:'kbo:2026-09-09-lotte-lg-1'});await f.sports('create',mutation(staleInput));await f.db.query("update quantum_private.community_sports_events set checked_at=now()-interval '16 minutes' where event_key=$1",[staleInput.eventKey]);await assert.rejects(()=>f.voice('create_room',{...base,startsAt:staleInput.startsAt,sourceUrl:staleInput.sourceUrl,sourceRevision:staleInput.sourceRevision,sourceEventKey:staleInput.eventKey,idempotencyKey:randomUUID()}),/sports_event_stale_review/)
 }finally{await f.db.close()}
})
