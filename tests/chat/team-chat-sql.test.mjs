import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {fixture,ids} from '../meetups/challenge-league-fixture.mjs'
import {setup} from './social-chat-fixture.mjs'

const migration=new URL('../../supabase/migrations/20260910162823_team_chat_social_index.sql',import.meta.url)
test('approved team-private chat has a callable authenticated database entry point',async()=>{
 const f=await fixture()
 try {
  await f.db.exec(await readFile(migration,'utf8'))
  assert.equal((await f.db.query("select to_regprocedure('public.league_team_chat(text,jsonb)') is not null present")).rows[0].present,true,'team chat RPC must exist independently of opponent chat')
 }finally{await f.db.close()}
})

test('captain chats during recruitment; only accepted current teammates read history after real invitation acceptance',async()=>{
 const f=await setup();try{
  const c=await f.create(),key=crypto.randomUUID(),read={team_id:c.team_id,before:null}
  const initial=await f.chat(ids[0],'read',read);assert.equal(initial.chat.member_count,1);assert.equal(initial.chat.writable,true)
  const send={team_id:c.team_id,body:'초대 수락 뒤 함께 볼 작전',idempotency_key:key}
  const message=await f.chat(ids[0],'send',send)
  const invitation=await f.invite(c)
  for(const user of [null,ids[1],ids[2],ids[5]])await assert.rejects(f.chat(user,'read',read),/not_authenticated|membership_required/)
  await assert.rejects(f.chat(ids[1],'send',{...send,idempotency_key:crypto.randomUUID()}),/membership_required/)
  await f.accept(c,invitation)
  const joined=await f.chat(ids[1],'read',read);assert.equal(joined.chat.member_count,2);assert.equal(joined.chat.messages[0].id,message.message.id);assert.equal(joined.chat.messages[0].is_me,false)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.challenge_match_chat_messages')).rows[0].n,0)
  await assert.rejects(f.rpc(ids[1],'department_league_lobby',['chat_read',JSON.stringify({challenge_id:c.challenge_id,before:null})]),/match_chat_membership_required/)
  await f.db.query("update public.department_challenge_roster set status='left',left_at=now() where team_id=$1 and user_id=$2",[c.team_id,ids[1]])
  await assert.rejects(f.chat(ids[1],'read',read),/membership_required/)
  assert.equal((await f.rooms(ids[1])).rooms.length,0)
 }finally{await f.db.close()}
})

test('duplicate sends, pagination, rate limit, blocked members, account deletion and completed writes fail safely',async()=>{
 const f=await setup();try{
  const c=await f.create(),read={team_id:c.team_id,before:null},send={team_id:c.team_id,body:'한 번 저장',idempotency_key:crypto.randomUUID()}
  const first=await f.chat(ids[0],'send',send);assert.deepEqual(await f.chat(ids[0],'send',send),first)
  await assert.rejects(f.chat(ids[0],'send',{...send,body:'다른 본문'}),/idempotency_key_reused/)
  for(const body of ['', 'a'.repeat(1001),'unsafe\u0001'])await assert.rejects(f.chat(ids[0],'send',{...send,body,idempotency_key:crypto.randomUUID()}),/invalid_message/)
  await f.db.query("insert into quantum_private.league_team_chat_messages(team_id,sender_id,idempotency_key,alias,body,created_at)select $1,$2,gen_random_uuid(),'별친구','역사 '||n,now()-interval '1 hour'+n*interval '1 second' from generate_series(1,55)n",[c.team_id,ids[0]])
  const page=await f.chat(ids[0],'read',read);assert.equal(page.chat.messages.length,50);assert.equal(page.chat.has_more,true)
  const older=await f.chat(ids[0],'read',{...read,before:page.chat.next_cursor});assert.equal(older.chat.messages.length,6);assert.equal(older.chat.has_more,false)
  assert.equal(new Set([...page.chat.messages,...older.chat.messages].map(m=>m.id)).size,56)
  await assert.rejects(f.chat(ids[0],'read',{...read,before:crypto.randomUUID()}),/invalid_cursor/)
  await f.db.query("update quantum_private.league_team_chat_messages set created_at=now() where team_id=$1",[c.team_id])
  const replay=await f.chat(ids[0],'send',send);assert.equal(replay.message.id,first.message.id);assert.equal(replay.message.body,first.message.body)
  await assert.rejects(f.chat(ids[0],'send',{...send,idempotency_key:crypto.randomUUID()}),/rate_limited/)
  const invitation=await f.invite(c);await f.accept(c,invitation)
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]])
  await assert.rejects(f.chat(ids[1],'read',read),/membership_required/);assert.equal((await f.rooms(ids[0])).rooms.length,0)
  await f.db.exec('delete from quantum_private.test_blocks')
  await f.db.query('insert into quantum_private.test_deletions values($1)',[ids[0]])
  await assert.rejects(f.chat(ids[0],'read',read),/account_deletion_pending/)
  await f.db.exec('delete from quantum_private.test_deletions')
  const privileges=(await f.db.query("select has_table_privilege('authenticated','quantum_private.league_team_chat_messages','select') direct,has_function_privilege('anon','public.league_team_chat(text,jsonb)','execute') anon,has_function_privilege('service_role','public.social_chat_rooms(jsonb)','execute') service")).rows[0]
  assert.deepEqual(privileges,{direct:false,anon:false,service:false})
  const fk=(await f.db.query("select confdeltype from pg_constraint where conrelid='quantum_private.league_team_chat_messages'::regclass and confrelid='public.users'::regclass")).rows[0];assert.equal(fk.confdeltype,'c')
  await f.db.query("insert into quantum_private.league_team_chat_messages(team_id,sender_id,idempotency_key,alias,body)values($1,$2,gen_random_uuid(),'탈퇴 테스트','내 메시지만 삭제')",[c.team_id,ids[20]])
  await f.db.query('delete from public.users where id=$1',[ids[20]])
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.league_team_chat_messages where sender_id=$1',[ids[20]])).rows[0].n,0)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.league_team_chat_messages where sender_id=$1',[ids[0]])).rows[0].n,56)
 }finally{await f.db.close()}
})

test('team ID, private history and membership survive real opponent pairing; completed room is read only',async()=>{
 const f=await setup();try{
  const a=await f.team(0),b=await f.team(5)
  const send={team_id:b.team,body:'상대에게 보여 주지 않는 우리 팀 작전',idempotency_key:crypto.randomUUID()}
  const first=await f.chat(b.actor,'send',send)
  for(const t of[a,b])await f.act(t.actor,'queue',{team_id:t.team,waiting:true,gap:200})
  await f.act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team})
  await f.act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team})
  const after=await f.chat(b.actor,'read',{team_id:b.team,before:null})
  assert.equal(after.chat.challenge_id,a.id);assert.equal(after.chat.messages[0].id,first.message.id)
  await assert.rejects(f.chat(a.actor,'read',{team_id:b.team,before:null}),/membership_required/)
  const match=await f.rpc(a.actor,'department_league_lobby',['chat_read',JSON.stringify({challenge_id:a.id,before:null})])
  assert.equal(match.messages.length,0)
  const entries=(await f.rooms(b.actor)).rooms;assert.equal(entries.filter(r=>r.kind==='league_team').length,1);assert.equal(entries.filter(r=>r.kind==='league_match').length,1)
  for (const entry of entries) { assert.equal(entry.sport,'lol');assert.equal(entry.challenge_id,a.id) }
  assert.equal(entries.find(r=>r.kind==='league_team').id,b.team)
  assert.equal(entries.find(r=>r.kind==='league_match').id,a.id)
  await f.db.query("update public.department_challenges set status='completed',first_score=1,second_score=0 where id=$1",[a.id])
  assert.equal((await f.chat(b.actor,'read',{team_id:b.team,before:null})).chat.writable,false)
  await assert.rejects(f.chat(b.actor,'send',send),/team_chat_closed/)
 }finally{await f.db.close()}
})

test('activity, study and mentoring list only their currently authorized domain rooms',async()=>{
 const f=await setup(),{db}=f;try{
  const pool=(await db.query("insert into quantum_private.activity_room_pools(school_scope,activity_key,category,gender_mode,capacity)values('pnu_self_selected','campus-walk','walking','all',5)returning id")).rows[0].id
  const activity=(await db.query('insert into quantum_private.activity_room_rooms(pool_id,room_number)values($1,1)returning id',[pool])).rows[0].id
  await db.query("insert into quantum_private.activity_room_members(pool_id,room_id,user_id,school_scope_snapshot,community_gender_snapshot)values($1,$2,$3,'pnu_self_selected','male')",[pool,activity,ids[0]])
  const studyPool=(await db.query("insert into quantum_private.study_room_pools(school_key,department_key,department_label,course_id,course_name,level)select school_scope_key,department_key,'기계공학과','custom:sample','함께 공부','beginner'from quantum_private.get_member_department_identity($1)returning id",[ids[0]])).rows[0].id
  const study=(await db.query('insert into quantum_private.study_rooms(pool_id,room_number)values($1,1)returning id',[studyPool])).rows[0].id
  await db.query("insert into quantum_private.study_room_members(pool_id,room_id,user_id,alias,joined_session)values($1,$2,$3,'별친구',1)",[studyPool,study,ids[0]])
  const session=(await db.query("insert into quantum_private.group_mentoring_sessions(side_size,school_key,department_key,status,expires_at)select 2,school_scope_key,department_key,'active',now()+interval '1 day'from quantum_private.get_member_department_identity($1)returning id",[ids[0]])).rows[0].id
  for(let i=0;i<4;i++){
   const role=i<2?'mentor':'mentee'
   const party=(await db.query("insert into quantum_private.group_mentoring_parties(owner_id,role,side_size,school_key,department_key,status,client_id,request_args,session_id,expires_at)select $1,$2,2,school_scope_key,department_key,'active',gen_random_uuid(),'{}',$3,now()+interval '1 day'from quantum_private.get_member_department_identity($1)returning id",[ids[i],role,session])).rows[0].id
   await db.query('insert into quantum_private.group_mentoring_party_members values($1,$2,true,true)',[party,ids[i]])
   await db.query("insert into quantum_private.group_mentoring_members(session_id,party_id,user_id,role,alias,accepted)values($1,$2,$3,$4,'멤버',true)",[session,party,ids[i],role])
  }
  let rooms=(await f.rooms(ids[0])).rooms;assert.deepEqual(new Set(rooms.map(r=>r.kind)),new Set(['activity_room','study_room','mentoring']))
  for(const room of rooms){const exact=await f.rooms(ids[0],{kind:room.kind,id:room.id,cursor:null});assert.equal(exact.rooms.length,1);await assert.rejects(f.rooms(ids[5],{kind:room.kind,id:room.id,cursor:null}),/membership_required/)}
  await db.query('update quantum_private.study_rooms set completed=true where id=$1',[study])
  assert.equal((await f.rooms(ids[0],{kind:'study_room',id:study,cursor:null})).rooms[0].writable,true,'retain existing study post-program chat policy')
  await db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]])
  rooms=(await f.rooms(ids[0])).rooms;assert.ok(!rooms.some(r=>r.kind==='mentoring'))
  await db.exec('delete from quantum_private.test_blocks')
  await db.query("update quantum_private.group_mentoring_sessions set status='ended'where id=$1",[session])
  assert.ok(!(await f.rooms(ids[0])).rooms.some(r=>r.kind==='mentoring'))
  await db.query("update quantum_private.activity_room_rooms set status='retired'where id=$1",[activity])
  await db.query('update quantum_private.study_room_members set left_at=now()where room_id=$1',[study])
  assert.equal((await f.rooms(ids[0])).rooms.length,0)
 }finally{await db.close()}
})

test('membership index includes old rooms past public latest fifty, stable pagination, exact names and denies matching kinds',async()=>{
 const f=await setup();try{
  await f.db.query("insert into public.activity_meetups(host_user_id,school,category,title,place_name,scheduled_at,capacity,created_at) select $1,'부산대','study','오래된 모임 '||n,'도서관',now(),5,now()-n*interval '1 day' from generate_series(1,65)n",[ids[0]])
  await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role)select id,$1,'host' from public.activity_meetups",[ids[0]])
  const page=await f.rooms(ids[0]);assert.equal(page.rooms.length,50);assert.equal(page.has_more,true)
  const page2=await f.rooms(ids[0],{kind:null,id:null,cursor:page.next_cursor});assert.equal(page2.rooms.length,15);assert.equal(page2.has_more,false)
  const all=[...page.rooms,...page2.rooms];assert.equal(new Set(all.map(r=>r.id)).size,65);assert.ok(all.some(r=>r.title==='오래된 모임 65'))
  const target=page2.rooms[0];await f.db.query('update public.activity_meetups set title=$2 where id=$1',[target.id,'이름 변경 확인'])
  const exact=await f.rooms(ids[0],{kind:'meetup',id:target.id,cursor:null});assert.equal(exact.rooms[0].title,'이름 변경 확인');assert.equal(exact.has_more,false)
  await assert.rejects(f.rooms(ids[1],{kind:'meetup',id:target.id,cursor:null}),/membership_required/)
  await assert.rejects(f.rooms(ids[0],{kind:'match',id:target.id,cursor:null}),/invalid_request/)
  await assert.rejects(f.rooms(ids[0],{kind:'occurrence',id:target.id,cursor:null}),/invalid_request/)
  await f.db.query("update public.activity_meetup_members set status='left' where meetup_id=$1",[target.id])
  await assert.rejects(f.rooms(ids[0],{kind:'meetup',id:target.id,cursor:null}),/membership_required/)
 }finally{await f.db.close()}
})

test('unsupported legacy one-to-one mentoring is absent from the directory while its records stay intact',async()=>{
 const f=await setup(),{db}=f;try{
  const session=(await db.query("insert into quantum_private.mentoring_sessions(mentor_id,mentee_id,school_key,department_key,topic,status,mentor_accepted,mentee_accepted,mentor_alias,mentee_alias,expires_at)select $1,$2,school_scope_key,department_key,'career','active',true,true,'선배','후배',now()+interval '1 day'from quantum_private.get_member_department_identity($1)returning id",[ids[0],ids[1]])).rows[0].id
  await db.query("insert into quantum_private.mentoring_waiters(user_id,role,topic,school_key,department_key,status,session_id,expires_at)select $1,'mentor','career',school_scope_key,department_key,'active',$2,now()+interval '1 day'from quantum_private.get_member_department_identity($1)",[ids[0],session])
  await db.query("insert into quantum_private.mentoring_messages(session_id,author_id,client_id,body)values($1,$2,gen_random_uuid(),'보존할 기존 대화')",[session,ids[0]])
  assert.equal((await f.rooms(ids[0])).rooms.length,0,'current group-only UI cannot open legacy one-to-one sessions')
  await assert.rejects(f.rooms(ids[0],{kind:'mentoring',id:session,cursor:null}),/membership_required/)
  const preserved=(await db.query('select s.status,m.body from quantum_private.mentoring_sessions s join quantum_private.mentoring_messages m on m.session_id=s.id where s.id=$1',[session])).rows
  assert.deepEqual(preserved,[{status:'active',body:'보존할 기존 대화'}])
 }finally{await db.close()}
})
