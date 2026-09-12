import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {candidateFixture,ids} from '../meetups/candidate-board-fixture.mjs'

const source=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
const scope={scope_kind:'mentoring',scope_key:'career'}
async function setup(){
 const f=await candidateFixture();try{
  await f.db.exec(await source('20260912135440_candidate_board_notifications.sql'))
  await f.db.exec(await source('20260912152047_candidate_join_result_notifications.sql'))
  const notes=async user=>(await f.db.query("select *from public.notifications where user_id=$1 and payload->>'entity_type'='candidate_join_result'order by created_at,id",[user])).rows
  const resolve=(user,id)=>f.rpc(user,'get_activity_meetup_admission_notification',[id])
  const current=id=>f.value('select quantum_private.common_web_push_notification_current($1)as value',[id])
  const subscribe=user=>f.rpc(user,'upsert_my_common_push_subscription',['https://fcm.googleapis.com/candidate-results/'+user,'B'+'a'.repeat(86),'b'.repeat(22),'2026-09-12-common-alerts-v1'])
  async function proposals(){
   const a=(await f.create(ids[0],{title:'A 진로 준비 모임'})).room.id,b=(await f.create(ids[2],{title:'B 진로 이야기'})).room.id
   const c=(await f.register(ids[1],scope,{positions:['mentor','mentee']})).mine
   const offer=(sender,room,slot)=>f.board(sender,'invite',{...scope,candidate_id:c.id,candidate_revision:c.revision,room_id:room,room_revision:0,slot,idempotency_key:crypto.randomUUID()})
   await offer(ids[0],a,'mentee');await offer(ids[2],b,'mentor');await offer(ids[2],b,'mentee')
   return {a,b,c}
  }
  async function join(a){await f.enable('mentoring',a);const application=await f.confirm((await f.prepare(ids[1],'mentoring',a,{role:'mentee'})).intentId);await f.decide(ids[0],'mentoring',a,application.id);return application}
  return {...f,notes,resolve,current,subscribe,proposals,join}
 }catch(error){await f.db.close();throw error}
}

test('actual membership gives its owner one named result and each other inviter one private actionable closure',async()=>{
 const f=await setup();try{
  await f.subscribe(ids[1]);await f.subscribe(ids[2]);const {a,b,c}=await f.proposals()
  assert.equal((await f.notes(ids[1])).length,0);assert.equal((await f.notes(ids[2])).length,0)
  await f.join(a)
  const owner=await f.notes(ids[1]),other=await f.notes(ids[2]);assert.equal(owner.length,1,'joined candidate needs a result notice');assert.equal(other.length,1,'same sender with multiple roles needs only one closure')
  assert.equal(owner[0].payload.event,'candidate_joined');assert.equal(owner[0].payload.room_title,'A 진로 준비 모임');assert.equal(owner[0].payload.body,'A 진로 준비 모임에 합류했어요. 다른 참가 제안은 종료됐어요.')
  assert.deepEqual(await f.resolve(ids[1],owner[0].id),{status:'current',href:'/chat/rooms/mentoring/'+a})
  assert.equal(other[0].payload.event,'candidate_recruitment_closed');assert.equal(other[0].payload.body,'초대한 사람의 모집이 종료됐어요. 다른 대기자를 찾아보세요.')
  for(const secret of [a,b,c.id,ids[1],'A 진로 준비 모임','B 진로 이야기'])assert.equal(JSON.stringify(other[0].payload).includes(secret),false,secret)
  assert.deepEqual(await f.resolve(ids[2],other[0].id),{status:'current',href:'/meetups/candidates?kind=mentoring&key=career'})
  assert.equal((await f.notes(ids[0])).length,0,'winning inviter retains its existing accepted notice')
  for(const n of [...owner,...other]){assert.equal(await f.current(n.id),true);assert.equal((await f.db.query('select count(*)::int n from quantum_private.common_push_deliveries where notification_id=$1',[n.id])).rows[0].n,1)}
  await f.db.query('update quantum_private.group_mentoring_members set accepted=accepted where session_id=$1 and user_id=$2',[a,ids[1]])
  assert.equal((await f.notes(ids[1])).length,1);assert.equal((await f.notes(ids[2])).length,1)
  await assert.rejects(f.resolve(ids[3],other[0].id),/notification_not_found/)
  const forged=(await f.db.query("insert into public.notifications(user_id,kind,payload)values($1,'social_activity',$2::jsonb)returning id",[ids[2],JSON.stringify(other[0].payload)])).rows[0].id
  assert.equal(await f.current(forged),false);assert.deepEqual(await f.resolve(ids[2],forged),{status:'ended',href:null})
  await f.act(ids[1],'leave',{session_id:a})
  assert.deepEqual(await f.resolve(ids[1],owner[0].id),{status:'current',href:'/meetups/candidates?kind=mentoring&key=career'},'historical result keeps a safe scope destination')
  assert.deepEqual(await f.resolve(ids[2],other[0].id),{status:'current',href:'/meetups/candidates?kind=mentoring&key=career'})
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[1],ids[2]])
  assert.equal(await f.current(other[0].id),false);assert.deepEqual(await f.resolve(ids[2],other[0].id),{status:'ended',href:null})
  await f.db.query('update public.notifications set read_at=clock_timestamp()where id=$1',[owner[0].id]);assert.equal(await f.current(owner[0].id),false)
  assert.equal((await f.resolve(ids[1],owner[0].id)).status,'current','reading does not erase historical navigation')
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await f.db.query("select has_table_privilege($1,'quantum_private.candidate_join_notification_sources','select')x",[role])).rows[0].x,false)
   assert.equal((await f.db.query("select has_function_privilege($1,'quantum_private.emit_candidate_join_result(uuid,uuid,text)','execute')x",[role])).rows[0].x,false)
  }
 }finally{await f.db.close()}
})

test('league candidate result waits for actual roster approval, preserves other scopes and keeps the joined team private',async()=>{
 const f=await setup();try{
  const league={scope_kind:'league',scope_key:'lol'},a=await f.league(),b=await f.rpc(ids[2],'department_league_journey',['create',JSON.stringify({sport:'lol',title:'B 리그 팀',slot:'top',tier:'gold',idempotency_key:crypto.randomUUID()})])
  const c=(await f.register(ids[1],league)).mine;await f.register(ids[1],{scope_kind:'league',scope_key:'futsal'})
  const offer=(sender,team,slot)=>f.board(sender,'invite',{...league,candidate_id:c.id,candidate_revision:c.revision,room_id:team.team_id,room_revision:team.revision,slot,idempotency_key:crypto.randomUUID()})
  await offer(ids[0],a,'mid');await offer(ids[0],a,'support');await offer(ids[2],b,'mid')
  const pending=(await f.overview(ids[1],league)).incoming.find(i=>i.room_id===a.team_id&&i.slot==='mid')
  const accepted=await f.board(ids[1],'accept',{...league,invite_id:pending.id,expected_revision:pending.revision,idempotency_key:crypto.randomUUID()})
  assert.equal(accepted.result.status,'preparation_required');assert.equal((await f.notes(ids[1])).length,0)
  const request=await f.rpc(ids[1],'department_league_journey',['join',JSON.stringify({sport:'lol',challenge_id:a.challenge_id,team_id:a.team_id,slot:'mid',tier:'gold',expected_revision:a.revision,idempotency_key:crypto.randomUUID()})])
  await f.rpc(ids[0],'accept_department_challenge_roster_request',[a.challenge_id,request.roster_id,request.revision,crypto.randomUUID()])
  const owner=(await f.notes(ids[1]))[0],other=await f.notes(ids[2]);assert.ok(owner);assert.equal(owner.payload.room_title,'함께 하는 팀');assert.equal(other.length,1)
  assert.deepEqual(await f.resolve(ids[1],owner.id),{status:'current',href:'/chat/league-team/'+a.team_id})
  assert.deepEqual(await f.resolve(ids[2],other[0].id),{status:'current',href:'/meetups/candidates?kind=league&key=lol'})
  assert.equal((await f.notes(ids[0])).length,0,'extra slot from winning captain does not get a losing-captain notice')
  assert.equal((await f.overview(ids[1],{scope_kind:'league',scope_key:'futsal'})).mine.status,'waiting')
  assert.equal(JSON.stringify(other[0].payload).includes(a.team_id),false);assert.equal(JSON.stringify(other[0].payload).includes('함께 하는 팀'),false)
 }finally{await f.db.close()}
})

test('contact-looking room names are never copied into a durable candidate result',async()=>{
 const f=await setup();try{
  const {a}=await f.proposals();await f.db.query("update quantum_private.group_mentoring_sessions set title='연락 01012345678'where id=$1",[a]);await f.join(a)
  const [owner]=await f.notes(ids[1]);assert.equal(owner.payload.room_title,'선택한 모임');assert.equal(JSON.stringify(owner.payload).includes('01012345678'),false)
 }finally{await f.db.close()}
})

test('declining or withdrawing candidates does not falsely announce another-room joining',async()=>{
 const f=await setup();try{
  const {c}=await f.proposals(),board=await f.overview(ids[1],scope),i=board.incoming[0]
  await f.board(ids[1],'decline',{...scope,invite_id:i.id,expected_revision:i.revision,idempotency_key:crypto.randomUUID()})
  await f.board(ids[1],'cancel',{...scope,expected_revision:c.revision,idempotency_key:crypto.randomUUID()})
  assert.equal((await f.notes(ids[1])).length,0);assert.equal((await f.notes(ids[2])).length,0)
 }finally{await f.db.close()}
})
