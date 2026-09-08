import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'

// Embedded Postgres with explicit Auth/readiness fixtures; NOT live Supabase/RLS or device proof.
async function setup(){
 const db=new PGlite()
 await db.exec(`
 create role anon;create role authenticated;create role service_role;create schema auth;create schema quantum_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
 create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
 create table public.users(id uuid primary key references auth.users(id));
 create table public.friend_requests(id uuid primary key,sender_user_id uuid,receiver_user_id uuid,status text);
 create table public.friendships(user_id uuid,friend_user_id uuid,status text,created_from_request_id uuid,blocked_by uuid,blocked_at timestamptz,primary key(user_id,friend_user_id));
 create table public.notifications(user_id uuid,kind text,payload jsonb);
 create table quantum_private.community_member_profiles(user_id uuid primary key,school_scope text,department text,community_gender text,display_name text,friend_recognition_name text);
 create function public.get_access_context() returns table(access_role text) language sql stable as $$select coalesce(nullif(current_setting('test.access_role',true),''),'user')$$;
 create function quantum_private.resolve_profile_readiness(p_user uuid) returns table(minimum_signup_complete boolean) language sql stable as $$select exists(select 1 from quantum_private.community_member_profiles where user_id=p_user)$$;
 create function quantum_private.tonight_invite_pair_is_blocked(a uuid,b uuid) returns boolean language sql stable as $$select exists(select 1 from public.friendships where user_id=least(a,b) and friend_user_id=greatest(a,b) and status='blocked')$$;
 create function quantum_private.canonical_department_key(v text) returns text language sql immutable as $$select nullif(lower(regexp_replace(btrim(v),'[[:space:]]+','','g')),'')$$;
 create function quantum_private.get_member_department_key(u uuid) returns text language sql stable as $$select quantum_private.canonical_department_key(department) from quantum_private.community_member_profiles where user_id=u$$;
 `)
 await db.exec(await readFile(new URL('../../docs/implementation/community-voice/g5-g6-schema.sql',import.meta.url),'utf8'))
 const users=[randomUUID(),randomUUID(),randomUUID(),randomUUID()]
 for(let i=0;i<users.length;i++){
  await db.query('insert into auth.users(id) values($1)',[users[i]])
  await db.query('insert into public.users(id) values($1)',[users[i]])
  await db.query('insert into quantum_private.community_member_profiles values($1,$2,$3,$4,$5,$6)',[users[i],i===3?'other_school':'pnu_self_selected','기계공학과',i===0?'female':'male','별칭'+i,'친구이름'+i])
 }
 async function as(user,role='user'){await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.access_role',$2,false),set_config('request.jwt.claim.role','authenticated',false)",[user,role])}
 async function call(op,payload={}){return(await db.query('select public.community_voice_command($1,$2::jsonb) as value',[op,JSON.stringify(payload)])).rows[0].value}
 const command=(action,expectedRevision,extra={})=>({action,expectedRevision,idempotencyKey:randomUUID(),...extra})
 async function room(){await as(users[0],'admin');return(await call('create_room',{title:'마음 편히 고민을 나눠요',description:'천천히 듣고 이야기해요',topic:'worries',scope:'school',capacity:3,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),idempotencyKey:randomUUID()})).room}
 return{db,users,as,call,command,room}
}
test('voice SQL creates with private grants and forbids ordinary user room creation',async()=>{
 const f=await setup();try{await f.as(f.users[0]);await assert.rejects(()=>f.call('create_room',{idempotencyKey:randomUUID()}),/forbidden/);const rows=await f.db.query("select has_table_privilege('authenticated','quantum_private.voice_members','SELECT') as exposed,has_function_privilege('anon','public.community_voice_command(text,jsonb)','EXECUTE') as callable");assert.deepEqual(rows.rows[0],{exposed:false,callable:false});await f.db.query('delete from quantum_private.community_member_profiles where user_id=$1',[f.users[0]]);await assert.rejects(()=>f.room(),/minimum_signup_required/)}finally{await f.db.close()}
})
test('group state, exact one-person counts, idempotency, cross-school denial, and stale revision',async()=>{
 const f=await setup();try{
  let r=await f.room();await f.call('room_command',{roomId:r.id,...f.command('open',r.revision)});await f.as(f.users[0]);await f.call('acknowledge_rules');
  const join={roomId:r.id,...f.command('join',1,{mode:'listen'})};const a=await f.call('room_command',join);assert.deepEqual(await f.call('room_command',join),a)
  const session=await f.call('session',{sessionId:a.sessionId});assert.equal(session.session.state,'active');assert.equal(session.room.waiting.totalPeople,1);assert.equal(session.room.waiting.genderBreakdown.femalePeople,1)
  const token=await f.call('token_context',{sessionId:a.sessionId});assert.equal(token.mode,'listen');assert.equal(token.displayName,'별칭0')
  await f.as(f.users[3]);await assert.rejects(()=>f.call('room',{roomId:r.id}),/not_found/)
  await f.as(f.users[1]);await f.call('acknowledge_rules');await assert.rejects(()=>f.call('room_command',{roomId:r.id,...f.command('join',0,{mode:'speak'})}),/stale_revision/)
 }finally{await f.db.close()}
})
test('random proposal keeps its topic, requires both accept, permits same department, and terminates before next',async()=>{
 const f=await setup();try{
  const searches=[randomUUID(),randomUUID()];for(let i=0;i<2;i++){await f.as(f.users[i]);await f.call('acknowledge_rules');await f.call('queue_command',{action:'join',topic:'baseball',searchId:searches[i],idempotencyKey:randomUUID()})}
  const q=await f.call('queue_status');assert.ok(q.sessionId);await assert.rejects(()=>f.call('token_context',{sessionId:q.sessionId}),/acceptance_required/)
  assert.equal((await f.call('session',{sessionId:q.sessionId})).room.topic,'baseball')
  await f.call('session_command',{sessionId:q.sessionId,...f.command('accept',0)});await f.as(f.users[0]);await f.call('session_command',{sessionId:q.sessionId,...f.command('accept',1)})
  assert.ok((await f.call('token_context',{sessionId:q.sessionId})).identity)
  await f.call('session_command',{sessionId:q.sessionId,...f.command('next',2)});await assert.rejects(()=>f.call('token_context',{sessionId:q.sessionId}),/acceptance_required/)
  await assert.rejects(()=>f.call('queue_command',{action:'join',topic:'worries',searchId:searches[0],idempotencyKey:randomUUID()}),/media_cleanup_pending/)
 }finally{await f.db.close()}
})
test('signed-provider event boundary counts joined only; duplicate and out-of-order leave do not inflate',async()=>{
 const f=await setup();try{
  const r=await f.room();await f.call('room_command',{roomId:r.id,...f.command('open',0)});await f.call('acknowledge_rules');const join=await f.call('room_command',{roomId:r.id,...f.command('join',1,{mode:'listen'})});const token=await f.call('token_context',{sessionId:join.sessionId})
  await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)");const event=(id,type,time)=>f.db.query('select public.apply_voice_provider_event($1,$2,$3,$4,$5,$6)',[id,type,token.roomName,token.identity,'provider-sid',time])
  await event('a','participant_joined',100);await event('b','participant_left',101);await event('c','participant_joined',100);await event('a','participant_joined',100)
  await f.as(f.users[0]);const detail=await f.call('room',{roomId:r.id});assert.equal(detail.room.connected.totalPeople,0)
 }finally{await f.db.close()}
})

test('provider reconnect ignores an old SID, while expired and orphan joins are synchronously revoked',async()=>{
 const f=await setup();try{
  const r=await f.room();await f.call('room_command',{roomId:r.id,...f.command('open',0)});await f.call('acknowledge_rules');const join=await f.call('room_command',{roomId:r.id,...f.command('join',1,{mode:'listen'})});const token=await f.call('token_context',{sessionId:join.sessionId})
  await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)")
  const event=(id,type,sid,time,identity=token.identity)=>f.db.query('select public.apply_voice_provider_event($1,$2,$3,$4,$5,$6) as value',[id,type,token.roomName,identity,sid,time])
  await event('join-1','participant_joined','sid-old',100)
  await event('join-2','participant_joined','sid-current',101)
  await event('leave-old','participant_left','sid-old',102)
  assert.equal((await f.db.query('select connected from quantum_private.voice_members where identity=$1',[token.identity])).rows[0].connected,true)
  await f.db.query("update quantum_private.voice_sessions set expires_at=now()-interval '1 second' where id=$1",[join.sessionId])
  assert.equal((await event('join-expired','participant_joined','sid-current',103)).rows[0].value.revoked,true)
  assert.equal((await f.db.query('select active from quantum_private.voice_members where identity=$1',[token.identity])).rows[0].active,false)
  const orphan=randomUUID();assert.equal((await event('join-orphan','participant_joined','sid-orphan',104,orphan)).rows[0].value.ignored,true)
  assert.equal((await f.db.query("select count(*)::int as n from quantum_private.voice_media_outbox where identity=$1 and action='remove'",[orphan])).rows[0].n,1)
 }finally{await f.db.close()}
})

test('disconnected members expire after grace, while reconnects and connected members stay active',async()=>{
 const f=await setup();try{
  const r=await f.room();await f.call('room_command',{roomId:r.id,...f.command('open',0)});await f.call('acknowledge_rules');const first=await f.call('room_command',{roomId:r.id,...f.command('join',1,{mode:'listen'})});const firstToken=await f.call('token_context',{sessionId:first.sessionId})
  let member=(await f.db.query('select active,connected,disconnected_at from quantum_private.voice_members where identity=$1',[firstToken.identity])).rows[0]
  assert.equal(member.active,true);assert.equal(member.connected,false);assert.ok(member.disconnected_at)
  await f.db.query("update quantum_private.voice_members set disconnected_at=now()-interval '3 minutes' where identity=$1",[firstToken.identity])
  assert.equal((await f.call('room',{roomId:r.id})).room.waiting.totalPeople,0)
  await assert.rejects(()=>f.call('token_context',{sessionId:first.sessionId}),/acceptance_required/)
  await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)");await f.db.query('select public.sweep_voice_sessions()')
  member=(await f.db.query('select active from quantum_private.voice_members where identity=$1',[firstToken.identity])).rows[0];assert.equal(member.active,false)

  await f.as(f.users[1]);await f.call('acknowledge_rules');const second=await f.call('room_command',{roomId:r.id,...f.command('join',2,{mode:'listen'})});const secondToken=await f.call('token_context',{sessionId:second.sessionId})
  await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)")
  const event=(id,type,sid,time)=>f.db.query('select public.apply_voice_provider_event($1,$2,$3,$4,$5,$6)',[id,type,secondToken.roomName,secondToken.identity,sid,time])
  await event('grace-join-1','participant_joined','sid-1',200)
  member=(await f.db.query('select active,connected,disconnected_at from quantum_private.voice_members where identity=$1',[secondToken.identity])).rows[0]
  assert.equal(member.active,true);assert.equal(member.connected,true);assert.equal(member.disconnected_at,null)
  await event('grace-left-1','participant_left','sid-1',201)
  member=(await f.db.query('select connected,disconnected_at from quantum_private.voice_members where identity=$1',[secondToken.identity])).rows[0]
  assert.equal(member.connected,false);assert.ok(member.disconnected_at)
  // LiveKit timestamps can share a second; a new SID must still be allowed to reconnect.
  await event('grace-join-2','participant_joined','sid-2',201)
  member=(await f.db.query('select active,connected,disconnected_at from quantum_private.voice_members where identity=$1',[secondToken.identity])).rows[0]
  assert.equal(member.active,true);assert.equal(member.connected,true);assert.equal(member.disconnected_at,null)
  await f.db.query("update quantum_private.voice_members set disconnected_at=now()-interval '3 minutes' where identity=$1",[secondToken.identity]);await f.db.query('select public.sweep_voice_sessions()')
  member=(await f.db.query('select active,connected from quantum_private.voice_members where identity=$1',[secondToken.identity])).rows[0]
  assert.equal(member.active,true);assert.equal(member.connected,true)
 }finally{await f.db.close()}
})

test('targeted media claims bypass an older global backlog for both session and room scopes',async()=>{
 const f=await setup();try{
  const room=await f.room();await f.call('room_command',{roomId:room.id,...f.command('open',0)});await f.call('acknowledge_rules');const joined=await f.call('room_command',{roomId:room.id,...f.command('join',1,{mode:'listen'})})
  await f.db.exec("insert into quantum_private.voice_media_outbox(room_name,identity,action,revoked_at) select 'qv-'||gen_random_uuid()::text,gen_random_uuid()::text,'remove',now()-interval '10 minutes' from generate_series(1,25)")
  const targetOne=randomUUID();await f.db.query("insert into quantum_private.voice_media_outbox(room_name,identity,user_id,action) values($1,$2,$3,'remove')",['qv-'+joined.sessionId,targetOne,f.users[0]])
  await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)")
  let claimed=(await f.db.query('select identity from public.claim_voice_media_effects($1,$2::uuid,$3::uuid)',[25,joined.sessionId,null])).rows
  assert.deepEqual(claimed.map((row)=>row.identity),[targetOne])
  const targetTwo=randomUUID();await f.db.query("insert into quantum_private.voice_media_outbox(room_name,identity,user_id,action) values($1,$2,$3,'remove')",['qv-'+joined.sessionId,targetTwo,f.users[0]])
  claimed=(await f.db.query('select identity from public.claim_voice_media_effects($1,$2::uuid,$3::uuid)',[25,null,room.id])).rows
  assert.deepEqual(claimed.map((row)=>row.identity),[targetTwo])
  assert.equal((await f.db.query('select count(*)::int as n from public.claim_voice_media_effects(1)')).rows[0].n,1)
 }finally{await f.db.close()}
})

test('active voice restrictions return a distinct error but preserve scoped operator moderation',async()=>{
 const f=await setup();try{
  const room=await f.room();await f.call('acknowledge_rules');await f.db.query("insert into quantum_private.voice_restrictions(user_id,until_at,reason_code) values($1,now()+interval '1 hour','safety_review')",[f.users[0]])
  await f.as(f.users[0]);await assert.rejects(()=>f.call('list_rooms'),/voice_restricted/)
  await f.as(f.users[0],'admin');assert.equal((await f.call('operator_rooms')).rooms.length,1)
  await f.call('room_command',{roomId:room.id,...f.command('open',0)})
  await assert.rejects(()=>f.call('room_command',{roomId:room.id,...f.command('join',1,{mode:'listen'})}),/voice_restricted/)
  await f.as(f.users[1]);await f.call('acknowledge_rules');const search=randomUUID();await f.call('queue_command',{action:'join',topic:'worries',searchId:search,idempotencyKey:randomUUID()})
  await f.db.query("insert into quantum_private.voice_restrictions(user_id,until_at,reason_code) values($1,now()+interval '1 hour','safety_review')",[f.users[1]])
  const left=await f.call('queue_command',{action:'leave',topic:'worries',searchId:search,idempotencyKey:randomUUID()});assert.equal(left.queued,false)
 }finally{await f.db.close()}
})

test('random participants cannot kick while the creating operator can moderate only their own group room',async()=>{
 const f=await setup();try{
  const searches=[randomUUID(),randomUUID()]
  for(let i=0;i<2;i++){await f.as(f.users[i]);await f.call('acknowledge_rules');await f.call('queue_command',{action:'join',topic:'worries',searchId:searches[i],idempotencyKey:randomUUID()})}
  const random=await f.call('queue_status')
  const randomState=await f.call('session',{sessionId:random.sessionId})
  const peer=randomState.session.participants.find((p)=>p.displayName!=='별칭1')
  await assert.rejects(
    ()=>f.call('session_command',{sessionId:random.sessionId,...f.command('kick',0,{targetIdentity:peer.identity})}),
    /forbidden/,
  )
  await f.call('session_command',{sessionId:random.sessionId,...f.command('leave',0)})
  await f.db.query('update quantum_private.voice_media_outbox set completed_at=now()')

  const room=await f.room()
  await f.call('room_command',{roomId:room.id,...f.command('open',0)})
  await f.as(f.users[1]);await f.call('acknowledge_rules')
  const joined=await f.call('room_command',{roomId:room.id,...f.command('join',1,{mode:'listen'})})
  await f.as(f.users[0],'admin')
  const owned=await f.call('room',{roomId:room.id})
  assert.equal(owned.moderation.sessionId,joined.sessionId)
  assert.equal(owned.moderation.participants.length,1)

  await f.as(f.users[2],'admin')
  assert.equal((await f.call('operator_rooms')).rooms.some((row)=>row.id===room.id),false)
  assert.equal((await f.call('room',{roomId:room.id})).moderation,null)

  await f.as(f.users[2],'super_admin')
  const global=await f.call('room',{roomId:room.id})
  assert.equal(global.moderation.participants.length,1)

  await f.as(f.users[0],'admin')
  await f.call('session_command',{sessionId:joined.sessionId,...f.command('kick',1,{targetIdentity:owned.moderation.participants[0].identity})})
  const membership=await f.db.query('select active from quantum_private.voice_members where session_id=$1 and user_id=$2',[joined.sessionId,f.users[1]])
  assert.equal(membership.rows[0].active,false)
 }finally{await f.db.close()}
})

test('current department scope is rechecked for session, token, count, webhook, and sweep',async()=>{
 const f=await setup();try{
  await f.as(f.users[0],'admin')
  const created=await f.call('create_room',{title:'기계공학과 이야기방',description:'같은 학과 안에서만 이야기해요',topic:'department',scope:'department',departmentKey:'기계공학과',capacity:3,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),idempotencyKey:randomUUID()})
  await f.call('room_command',{roomId:created.room.id,...f.command('open',0)})
  await f.as(f.users[1]);await f.call('acknowledge_rules')
  const joined=await f.call('room_command',{roomId:created.room.id,...f.command('join',1,{mode:'listen'})})
  const token=await f.call('token_context',{sessionId:joined.sessionId})
  await f.db.query("update quantum_private.community_member_profiles set department='화학공학과' where user_id=$1",[f.users[1]])
  await assert.rejects(()=>f.call('session',{sessionId:joined.sessionId}),/not_found/)
  await assert.rejects(()=>f.call('token_context',{sessionId:joined.sessionId}),/not_found|forbidden|acceptance_required/)

  await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)")
  const event=await f.db.query('select public.apply_voice_provider_event($1,$2,$3,$4,$5,$6) as value',[randomUUID(),'participant_joined',token.roomName,token.identity,'provider-sid',100])
  assert.equal(event.rows[0].value.revoked,true)
  await f.db.query('select public.sweep_voice_sessions()')
  const membership=await f.db.query('select active from quantum_private.voice_members where session_id=$1 and user_id=$2',[joined.sessionId,f.users[1]])
  assert.equal(membership.rows[0].active,false)

  await f.as(f.users[0],'admin')
  const detail=await f.call('room',{roomId:created.room.id})
  assert.equal(detail.room.waiting.totalPeople,0)
 }finally{await f.db.close()}
})

test('queue replacement refreshes every search field and stale tabs cannot cancel a newer search',async()=>{
 const f=await setup();try{
  await f.as(f.users[0]);await f.call('acknowledge_rules')
  const first=randomUUID(),second=randomUUID()
  await f.call('queue_command',{action:'join',topic:'worries',searchId:first,idempotencyKey:randomUUID()})
  await f.call('queue_command',{action:'join',topic:'social',searchId:second,idempotencyKey:randomUUID()})
  const row=(await f.db.query('select school_scope,topic,search_id from quantum_private.voice_queue where user_id=$1',[f.users[0]])).rows[0]
  assert.equal(row.topic,'social');assert.equal(row.search_id,second)
  await assert.rejects(()=>f.call('queue_command',{action:'leave',topic:'worries',searchId:first,idempotencyKey:randomUUID()}),/stale_revision/)
  assert.equal((await f.db.query('select count(*)::int as n from quantum_private.voice_queue where user_id=$1',[f.users[0]])).rows[0].n,1)
 }finally{await f.db.close()}
})

test('friend voice requires current rules and availability for both users',async()=>{
 const f=await setup();try{
  const request=randomUUID()
  await f.db.query("insert into public.friend_requests values($1,$2,$3,'accepted')",[request,f.users[0],f.users[1]])
  await f.db.query("insert into public.friendships select least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),'active',$3,null,null",[f.users[0],f.users[1],request])
  await f.as(f.users[0])
  await assert.rejects(()=>f.call('invite_friend',{friendUserId:f.users[1],idempotencyKey:randomUUID()}),/voice_rules_required/)
  await f.call('acknowledge_rules')
  await f.as(f.users[1]);await f.call('acknowledge_rules')
  const search=randomUUID();await f.call('queue_command',{action:'join',topic:'social',searchId:search,idempotencyKey:randomUUID()})
  await f.as(f.users[0])
  await assert.rejects(()=>f.call('invite_friend',{friendUserId:f.users[1],idempotencyKey:randomUUID()}),/already_in_voice/)
  await f.as(f.users[1]);await f.call('queue_command',{action:'leave',topic:'social',searchId:search,idempotencyKey:randomUUID()})
  await f.as(f.users[0]);const invitation=await f.call('invite_friend',{friendUserId:f.users[1],idempotencyKey:randomUUID()})
  await f.db.query("insert into quantum_private.voice_media_outbox(room_name,identity,user_id,action) values('qv-test',$1,$2,'remove')",[randomUUID(),f.users[1]])
  await f.as(f.users[1])
  await assert.rejects(()=>f.call('accept_friend',{invitationId:invitation.invitationId,idempotencyKey:randomUUID()}),/media_cleanup_pending/)
  await f.db.query('delete from quantum_private.voice_media_outbox')
  await f.db.query("update public.friendships set status='blocked',blocked_by=$1,blocked_at=now()",[f.users[0]])
  await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)")
  await f.db.query('select public.sweep_voice_sessions()')
  assert.equal((await f.db.query('select status from quantum_private.voice_friend_invitations where id=$1',[invitation.invitationId])).rows[0].status,'cancelled')
 }finally{await f.db.close()}
})

test('official baseball rooms are unique by event and reschedule emits one notice per prior participant',async()=>{
 const f=await setup();try{
  await f.as(f.users[0],'admin')
  const input={title:'공식 야구 응원방',description:'중계는 각자 보고 함께 응원해요',topic:'baseball',scope:'school',departmentKey:null,capacity:12,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),sourceUrl:'https://www.koreabaseball.com/Schedule/Schedule.aspx',sourceRevision:'2026-09-07 확인',sourceEventKey:'kbo:2026-09-08-lg-lotte-1'}
  const created=await f.call('create_room',{...input,idempotencyKey:randomUUID()})
  await assert.rejects(()=>f.call('create_room',{...input,idempotencyKey:randomUUID()}))
  await f.call('room_command',{roomId:created.room.id,...f.command('open',0)})
  await f.as(f.users[1]);await f.call('acknowledge_rules')
  await f.call('room_command',{roomId:created.room.id,...f.command('join',1,{mode:'listen'})})
  await f.as(f.users[0],'admin')
  const startsAt=new Date(Date.now()+7200000).toISOString(),endsAt=new Date(Date.now()+10800000).toISOString()
  const changed=await f.call('room_command',{roomId:created.room.id,...f.command('reschedule',2,{startsAt,endsAt,scheduleNotice:'우천 예보로 시작 시각이 변경됐어요.',sourceRevision:'2026-09-08 재확인'})})
  assert.equal(changed.room.scheduleNotice,'우천 예보로 시작 시각이 변경됐어요.')
  assert.equal(changed.room.status,'scheduled')
  const notices=await f.db.query("select user_id,payload from public.notifications where kind='community_voice'")
  assert.equal(notices.rows.length,1);assert.equal(notices.rows[0].user_id,f.users[1]);assert.equal(notices.rows[0].payload.roomId,created.room.id)
 }finally{await f.db.close()}
})

test('reports retain a private stable target while ordinary operators see only reports for rooms they created',async()=>{
 const f=await setup();try{
  const room=await f.room();await f.call('room_command',{roomId:room.id,...f.command('open',0)})
  await f.as(f.users[1]);await f.call('acknowledge_rules');const first=await f.call('room_command',{roomId:room.id,...f.command('join',1,{mode:'listen'})})
  await f.as(f.users[2]);await f.call('acknowledge_rules');await f.call('room_command',{roomId:room.id,...f.command('join',2,{mode:'listen'})})
  await f.as(f.users[1]);const state=await f.call('session',{sessionId:first.sessionId});const target=state.session.participants.find((p)=>p.displayName==='별칭2')
  const report=await f.call('report',{sessionId:first.sessionId,targetIdentity:target.identity,reason:'반복적인 개인정보 요구가 있었어요.',block:false,idempotencyKey:randomUUID()})
  await f.as(f.users[2]);await f.call('session_command',{sessionId:first.sessionId,...f.command('mode',2,{mode:'speak'})})
  const stored=(await f.db.query('select target_user_id,target_identity from quantum_private.voice_reports where id=$1',[report.reportId])).rows[0]
  assert.equal(stored.target_user_id,f.users[2]);assert.equal(stored.target_identity,target.identity)
  await f.as(f.users[1],'admin');assert.equal((await f.call('review_reports')).reports.length,0)
  await f.as(f.users[0],'admin');assert.equal((await f.call('review_reports')).reports.length,1)
  await f.as(f.users[3],'super_admin');assert.equal((await f.call('review_reports')).reports.length,1)
 }finally{await f.db.close()}
})
