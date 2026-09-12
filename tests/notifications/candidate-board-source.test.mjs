import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {candidateFixture,ids} from '../meetups/candidate-board-fixture.mjs'
import {parseCandidateBoard} from '../../lib/meetups/candidate-board-contract.ts'
import {commonPushPayload} from '../../lib/notifications/web-push-contract.ts'
const source=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
const scope={scope_kind:'mentoring',scope_key:'career'}
async function setup(){
 const f=await candidateFixture();try{
  await f.db.exec(await source('20260912135440_candidate_board_notifications.sql'))
  await f.db.exec(await source('20260912152047_candidate_join_result_notifications.sql'))
  const board=async(user,action='overview',args={filter:'all',cursor:null})=>{const result=await f.rpc(user,'meetup_candidate_board',[action,JSON.stringify({...scope,...args})]);assert.ok(parseCandidateBoard(result),'SQL board must satisfy the actual response contract');return result}
  const notices=async(user,event)=>(await f.db.query("select *from public.notifications where user_id=$1 and payload->>'entity_type'='candidate_invite' and payload->>'event'=$2 order by created_at,id",[user,event])).rows
  const subscribe=user=>f.rpc(user,'upsert_my_common_push_subscription',['https://fcm.googleapis.com/test/'+user,'B'+'a'.repeat(86),'b'.repeat(22),'2026-09-12-common-alerts-v1'])
  const offer=async()=>{
   const room=(await f.create()).room.id
   const registered=await board(ids[1],'register',{positions:['mentee'],tier:null,intro:'이름 대신 공개 소개만',availability:'수요일 오후',consent:true,expected_revision:null,idempotency_key:crypto.randomUUID()})
   const args={candidate_id:registered.mine.id,candidate_revision:registered.mine.revision,room_id:room,room_revision:0,slot:'mentee',idempotency_key:crypto.randomUUID()}
   const invited=await board(ids[0],'invite',args);return{room,args,invited,invite:invited.outgoing[0]}
  }
  const current=n=>f.value('select quantum_private.common_web_push_notification_current($1)as value',[n])
  const resolve=(user,n)=>f.rpc(user,'get_activity_meetup_admission_notification',[n])
  return{...f,board,notices,subscribe,offer,current,resolve}
 }catch(error){await f.db.close();throw error}
}
test('real candidate invitation emits one private canonical notice/outbox row and resolves only for its recipient',async()=>{
 const f=await setup();try{
  await f.subscribe(ids[1]);const{args,invite}=await f.offer();await f.board(ids[0],'invite',args)
  const notes=await f.notices(ids[1],'invitation_received');assert.equal(notes.length,1)
  const note=notes[0];assert.equal((await f.db.query('select count(*)::int n from quantum_private.common_push_deliveries where notification_id=$1',[note.id])).rows[0].n,1)
  assert.equal(await f.current(note.id),true)
  const resolved=await f.resolve(ids[1],note.id);assert.deepEqual(resolved,{status:'current',href:`/meetups/candidates?kind=mentoring&key=career&invite=${invite.id}`})
  await assert.rejects(f.resolve(ids[2],note.id),/notification_not_found/)
  for(const privateText of ['이름 대신 공개 소개만','수요일 오후',ids[0],ids[1]])assert.equal(JSON.stringify(note.payload).includes(privateText),false)
  assert.deepEqual(commonPushPayload(note.id),{title:'Quantum',body:'새 알림이 도착했어요. 앱에서 확인해 주세요.',url:'/notifications',notificationId:note.id})
  assert.equal((await f.db.query("select has_function_privilege('authenticated','quantum_private.candidate_notification_current(uuid,uuid)','execute')x")).rows[0].x,false)
  const forged=(await f.db.query("insert into public.notifications(user_id,kind,payload)values($1,'social_activity',$2::jsonb)returning id",[ids[1],JSON.stringify(note.payload)])).rows[0].id
  assert.equal(await f.current(forged),false)
  assert.deepEqual(await f.resolve(ids[1],forged),{status:'ended',href:null})
 }finally{await f.db.close()}
})
test('starting acceptance is not final joining, and cancellation/block removes pending push and click authority',async()=>{
 const f=await setup();try{
  const{invite}=await f.offer(),note=(await f.notices(ids[1],'invitation_received'))[0]
  const accepted=await f.board(ids[1],'accept',{invite_id:invite.id,expected_revision:invite.revision,idempotency_key:crypto.randomUUID()})
  assert.equal(accepted.result.status,'joining');assert.equal((await f.notices(ids[0],'invitation_accepted')).length,0);assert.equal(await f.current(note.id),false);assert.deepEqual(await f.resolve(ids[1],note.id),{status:'ended',href:null})
  const active=accepted.incoming.find(n=>n.id===invite.id)
  await f.board(ids[1],'release',{invite_id:invite.id,expected_revision:active.revision,idempotency_key:crypto.randomUUID()})
  assert.equal(await f.current(note.id),true)
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]])
  assert.equal(await f.current(note.id),false);assert.deepEqual(await f.resolve(ids[1],note.id),{status:'ended',href:null})
 }finally{await f.db.close()}
})
test('paid host-approved real membership closes candidacy and emits acceptance; leaving invalidates that notice',async()=>{
 const f=await setup();try{
  const{room,invite}=await f.offer();await f.subscribe(ids[0]);await f.enable('mentoring',room)
  await f.board(ids[1],'accept',{invite_id:invite.id,expected_revision:invite.revision,idempotency_key:crypto.randomUUID()})
  const application=await f.confirm((await f.prepare(ids[1],'mentoring',room,{role:'mentee'})).intentId)
  assert.equal((await f.notices(ids[0],'invitation_accepted')).length,0)
  const native=(await f.db.query("select id from public.notifications where user_id=$1 and payload->>'domain'='mentoring'and payload->>'entity_type'='admission'and payload->>'event'='application_received'",[ids[0]])).rows
  assert.equal(native.length,1)
  assert.deepEqual(await f.resolve(ids[0],native[0].id),{status:'current',href:`/meetups/participation/mentoring/${room}/applications`})
  assert.equal(await f.current(native[0].id),true)
  await f.decide(ids[0],'mentoring',room,application.id)
  const final=await f.board(ids[1]);assert.equal(final.mine.status,'joined');assert.equal(final.candidates.some(c=>c.id===final.mine.id),false)
  const notes=await f.notices(ids[0],'invitation_accepted');assert.equal(notes.length,1);assert.equal(await f.current(notes[0].id),true)
  assert.equal((await f.resolve(ids[0],notes[0].id)).status,'current')
  await f.act(ids[1],'leave',{session_id:room});assert.equal(await f.current(notes[0].id),false)
  assert.deepEqual(await f.resolve(ids[0],notes[0].id),{status:'ended',href:null})
 }finally{await f.db.close()}
})
test('read or old candidate notices cannot dispatch, while noncandidate resolution keeps the existing handler',async()=>{
 const f=await setup();try{
  await f.offer();const n=(await f.notices(ids[1],'invitation_received'))[0]
  await f.db.query("update public.notifications set created_at=clock_timestamp()-interval '25 hours'where id=$1",[n.id]);assert.equal(await f.current(n.id),false)
  await f.db.query('update public.notifications set created_at=clock_timestamp(),read_at=clock_timestamp()where id=$1',[n.id]);assert.equal(await f.current(n.id),false)
  const unrelated=(await f.db.query("insert into public.notifications(user_id,kind,payload)values($1,'social_activity','{}')returning id",[ids[1]])).rows[0].id
  await assert.rejects(f.resolve(ids[1],unrelated),/notification_not_found/)
  await assert.rejects(f.value('select quantum_private.get_admission_notification_before_candidate_board($1)as value',[unrelated]),/notification_not_found/)
 }finally{await f.db.close()}
})
