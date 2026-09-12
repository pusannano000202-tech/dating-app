import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {setup as chatSetup,ids} from '../chat/social-chat-fixture.mjs'
const sql=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
async function setup(){
 const f=await chatSetup();try{
  await f.db.exec(await sql('20260911141714_social_chat_read_positions.sql'))
  await f.db.exec(`create table quantum_private.social_notification_events(notification_id uuid primary key,domain text,entity_id uuid,recipient_id uuid,team_id uuid,entity_type text,actor_id uuid);
   create function quantum_private.social_notification_scope(text,uuid,uuid,uuid,text)returns boolean language sql stable as $$select true$$;`)
  await f.db.exec(await sql('20260912025017_common_notifications_web_push.sql'))
  await f.db.exec(await sql('20260912025919_social_chat_message_notifications.sql'))
  const notes=async user=>(await f.db.query("select * from public.notifications where kind='social_chat_message'and user_id=$1 order by created_at,id",[user])).rows
  const subscribe=user=>f.rpc(user,'upsert_my_common_push_subscription',['https://fcm.googleapis.com/test/'+user,'B'+'a'.repeat(86),'b'.repeat(22),'2026-09-12-common-alerts-v1'])
  const claim=async()=>{await f.db.exec('set role service_role');try{return(await f.db.query('select public.claim_common_web_push_deliveries(20) rows')).rows[0].rows}finally{await f.db.exec('reset role')}}
  return {...f,notes,subscribe,claim}
 }catch(e){await f.db.close();throw e}
}
test('real team chat RPC creates one owner-scoped alert for accepted peers, never sender or pending invite',async()=>{
 const f=await setup();try{
  const c=await f.create(),invitation=await f.invite(c)
  await f.chat(ids[0],'send',{team_id:c.team_id,body:'대기 초대에게 보이면 안 됨',idempotency_key:crypto.randomUUID()});assert.equal((await f.notes(ids[1])).length,0)
  await f.accept(c,invitation);await f.subscribe(ids[1])
  const args={team_id:c.team_id,body:'내일 세 시 실제 메시지 비공개',idempotency_key:crypto.randomUUID()}
  const msg=await f.chat(ids[0],'send',args);await f.chat(ids[0],'send',args)
  const notes=await f.notes(ids[1]);assert.equal(notes.length,1);assert.equal((await f.notes(ids[0])).length,0);assert.equal((await f.notes(ids[2])).length,0)
  assert.ok(!JSON.stringify(notes[0].payload).includes('실제 메시지'));assert.ok(!JSON.stringify(notes[0].payload).includes(ids[0]))
  const current=await f.rpc(ids[1],'resolve_my_social_chat_notification',[notes[0].id]);assert.equal(current.href,'/chat/league-team/'+c.team_id)
  await assert.rejects(f.rpc(ids[2],'resolve_my_social_chat_notification',[notes[0].id]),/notification_not_found/)
  assert.equal((await f.claim()).length,1)
  await f.rpc(ids[1],'mark_social_chat_read',['league_team',c.team_id,[msg.message.id]])
  assert.ok((await f.notes(ids[1]))[0].read_at)
  assert.equal((await f.db.query('select quantum_private.common_web_push_notification_current($1) c',[notes[0].id])).rows[0].c,false)
 }finally{await f.db.close()}
})
test('departure/block after a message cancels queued push and the old alert cannot open that room',async()=>{
 const f=await setup();try{
  const c=await f.create(),invitation=await f.invite(c);await f.accept(c,invitation);await f.subscribe(ids[1])
  await f.chat(ids[0],'send',{team_id:c.team_id,body:'작전',idempotency_key:crypto.randomUUID()});const note=(await f.notes(ids[1]))[0]
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]])
  assert.equal((await f.claim()).length,0);assert.equal((await f.rpc(ids[1],'resolve_my_social_chat_notification',[note.id])).status,'ended')
  await f.db.exec('delete from quantum_private.test_blocks');await f.db.query("update public.department_challenge_roster set status='left',left_at=clock_timestamp()where team_id=$1 and user_id=$2",[c.team_id,ids[1]])
  assert.equal((await f.rpc(ids[1],'resolve_my_social_chat_notification',[note.id])).status,'ended')
 }finally{await f.db.close()}
})
test('all six actual social message tables are connected; private helper grants cannot bypass room access',async()=>{
 const f=await setup();try{
  const tables=(await f.db.query("select c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid where t.tgname='notify_social_chat_message'order by c.relname")).rows.map(r=>r.relname)
  assert.deepEqual(tables,['activity_meetup_messages','activity_room_messages','challenge_match_chat_messages','group_mentoring_messages','league_team_chat_messages','study_room_messages'])
  const rights=(await f.db.query("select has_function_privilege('authenticated','quantum_private.social_chat_notification_current(uuid,uuid,boolean)','execute')h,has_table_privilege('authenticated','quantum_private.social_chat_notification_events','select')t,has_function_privilege('anon','public.resolve_my_social_chat_notification(uuid)','execute')a")).rows[0]
  assert.deepEqual(rights,{h:false,t:false,a:false})
 }finally{await f.db.close()}
})
test('meetup, automatic activity, study and mentoring real message tables fan out only to current same-room members',async()=>{
 const f=await setup(),{db}=f;try{
  const meetup=(await db.query("insert into public.activity_meetups(host_user_id,school,category,title,place_name,scheduled_at,capacity)values($1,'부산대','study','함께 공부 모임','도서관',now(),5)returning id",[ids[0]])).rows[0].id
  for(const user of ids.slice(0,2))await db.query("insert into public.activity_meetup_members(meetup_id,user_id,role)values($1,$2,$3)",[meetup,user,user===ids[0]?'host':'member'])
  await db.query("insert into public.activity_meetup_messages(meetup_id,sender_user_id,idempotency_key,message)values($1,$2,gen_random_uuid(),'원문 비공개')",[meetup,ids[0]])
  const pool=(await db.query("insert into quantum_private.activity_room_pools(school_scope,activity_key,category,gender_mode,capacity)values('pnu_self_selected','campus-walk','walking','all',5)returning id")).rows[0].id
  const activity=(await db.query('insert into quantum_private.activity_room_rooms(pool_id,room_number)values($1,1)returning id',[pool])).rows[0].id
  for(const user of ids.slice(0,2))await db.query("insert into quantum_private.activity_room_members(pool_id,room_id,user_id,school_scope_snapshot,community_gender_snapshot)values($1,$2,$3,'pnu_self_selected','male')",[pool,activity,user])
  await db.query("insert into quantum_private.activity_room_messages(room_id,sender_user_id,idempotency_key,message)values($1,$2,gen_random_uuid(),'원문 비공개')",[activity,ids[0]])
  const studyPool=(await db.query("insert into quantum_private.study_room_pools(school_key,department_key,department_label,course_id,course_name,level)select school_scope_key,department_key,'기계공학과','custom:sample','함께 공부','beginner'from quantum_private.get_member_department_identity($1)returning id",[ids[0]])).rows[0].id
  const study=(await db.query('insert into quantum_private.study_rooms(pool_id,room_number)values($1,1)returning id',[studyPool])).rows[0].id
  for(const user of ids.slice(0,2))await db.query("insert into quantum_private.study_room_members(pool_id,room_id,user_id,alias,joined_session)values($1,$2,$3,'친구',1)",[studyPool,study,user])
  await db.query("insert into quantum_private.study_room_messages(room_id,user_id,sender_alias,message,idempotency_key)values($1,$2,'친구','원문 비공개',gen_random_uuid())",[study,ids[0]])
  const session=(await db.query("insert into quantum_private.group_mentoring_sessions(side_size,school_key,department_key,status,expires_at)select 2,school_scope_key,department_key,'active',now()+interval '1 day'from quantum_private.get_member_department_identity($1)returning id",[ids[0]])).rows[0].id
  for(let i=0;i<4;i++){
   const role=i<2?'mentor':'mentee',party=(await db.query("insert into quantum_private.group_mentoring_parties(owner_id,role,side_size,school_key,department_key,status,client_id,request_args,session_id,expires_at)select $1,$2,2,school_scope_key,department_key,'active',gen_random_uuid(),'{}',$3,now()+interval '1 day'from quantum_private.get_member_department_identity($1)returning id",[ids[i],role,session])).rows[0].id
   await db.query('insert into quantum_private.group_mentoring_party_members values($1,$2,true,true)',[party,ids[i]])
   await db.query("insert into quantum_private.group_mentoring_members(session_id,party_id,user_id,role,alias,accepted)values($1,$2,$3,$4,'멤버',true)",[session,party,ids[i],role])
  }
  await db.query("insert into quantum_private.group_mentoring_messages(session_id,author_id,client_id,body)values($1,$2,gen_random_uuid(),'원문 비공개')",[session,ids[0]])
  const notes=await f.notes(ids[1]);assert.deepEqual(new Set(notes.map(n=>n.payload.room_kind)),new Set(['meetup','activity_room','study_room','mentoring']))
  assert.equal((await f.notes(ids[0])).length,0);assert.equal((await f.notes(ids[5])).length,0)
  for(const note of notes){assert.ok(!JSON.stringify(note.payload).includes('원문'));assert.equal((await f.rpc(ids[1],'resolve_my_social_chat_notification',[note.id])).status,'current')}
 }finally{await db.close()}
})
test('paired opponent chat preserves team privacy while notifying both currently accepted teams',async()=>{
 const f=await setup();try{
  const a=await f.team(0),b=await f.team(5)
  for(const t of[a,b])await f.act(t.actor,'queue',{team_id:t.team,waiting:true,gap:200})
  await f.act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});await f.act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team})
  await f.db.query("insert into quantum_private.challenge_match_chat_messages(challenge_id,sender_id,body)values($1,$2,'공통 일정')",[a.id,a.actor])
  assert.equal((await f.notes(a.actor)).length,0)
  for(const user of ids.slice(1,10)){const notes=await f.notes(user);assert.equal(notes.length,1);assert.equal(notes[0].payload.room_kind,'league_match');assert.equal((await f.rpc(user,'resolve_my_social_chat_notification',[notes[0].id])).href,'/chat/rooms/league_match/'+a.id)}
  assert.equal((await f.notes(ids[10])).length,0)
 }finally{await f.db.close()}
})
