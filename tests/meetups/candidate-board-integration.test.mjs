import test from'node:test'
import assert from'node:assert/strict'
import{candidateFixture,ids}from'./candidate-board-fixture.mjs'
import{parseCandidateBoard}from'../../lib/meetups/candidate-board-contract.ts'
test('last mentoring role occupied after an invitation cannot be claimed by cached acceptance',async()=>{
 const f=await candidateFixture();try{
  const scope={scope_kind:'mentoring',scope_key:'career'},room=(await f.create()).room.id,c=(await f.register(ids[1],scope,{positions:['mentor']})).mine
  const sent=await f.board(ids[0],'invite',{...scope,candidate_id:c.id,candidate_revision:0,room_id:room,room_revision:0,slot:'mentor',idempotency_key:crypto.randomUUID()})
  await f.enable('mentoring',room)
  const other=await f.confirm((await f.prepare(ids[2],'mentoring',room,{role:'mentor'})).intentId);await f.decide(ids[0],'mentoring',room,other.id)
  await assert.rejects(f.board(ids[1],'accept',{...scope,invite_id:sent.outgoing[0].id,expected_revision:0,idempotency_key:crypto.randomUUID()}),/candidate_invite_unavailable/)
  const board=await f.overview(ids[1],scope);assert.equal(board.mine.status,'waiting');assert.equal(board.incoming[0].status,'unavailable');assert.ok(parseCandidateBoard(board))
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.group_mentoring_members where session_id=$1 and user_id=$2 and accepted and left_at is null',[room,ids[1]])).rows[0].n,0)
 }finally{await f.db.close()}
})

test('general meetup proposal uses existing held-deposit approval and preserves unrelated candidacy',async()=>{
 const f=await candidateFixture();try{
  const scope={scope_kind:'meetup',scope_key:'campus-cafe-chat'},room=crypto.randomUUID()
  await f.db.query("insert into public.activity_meetups(id,host_user_id,school,category,title,place_name,scheduled_at,capacity,activity_key)values($1,$2,'부산대','dining','함께 카페 가요','정문 카페',clock_timestamp()+interval '3 days',5,'campus-cafe-chat')",[room,ids[0]])
  await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role,status)values($1,$2,'host','joined')",[room,ids[0]])
  const candidate=(await f.register(ids[5],scope)).mine // Other department, same school.
  await f.register(ids[5],{scope_kind:'mentoring',scope_key:'career'})
  const inviteArgs={...scope,candidate_id:candidate.id,candidate_revision:0,room_id:room,room_revision:0,slot:null,idempotency_key:crypto.randomUUID()}
  await f.db.query("update public.activity_meetup_members set status='left'where meetup_id=$1 and user_id=$2",[room,ids[0]])
  await assert.rejects(f.board(ids[0],'invite',inviteArgs),/candidate_host_required/)
  await f.db.query("update public.activity_meetup_members set status='joined'where meetup_id=$1 and user_id=$2",[room,ids[0]])
  const sent=await f.board(ids[0],'invite',inviteArgs)
  const start=await f.board(ids[5],'accept',{...scope,invite_id:sent.outgoing[0].id,expected_revision:0,idempotency_key:crypto.randomUUID()})
  assert.equal(start.result.next_href,`/meetups/${room}/apply`);assert.ok(parseCandidateBoard(start))
  await f.db.query("insert into quantum_private.activity_meetup_admission_policies(meetup_id,amount_krw,policy_version,summary,conditions,enabled)values($1,17000,'fixture','가상 정책',array['실제 돈 없음'],true)",[room])
  const quote=(await f.rpc(ids[5],'get_activity_meetup_admission_context',[room])).quote
  const prepared=await f.rpc(ids[5],'prepare_activity_meetup_admission',[room,JSON.stringify({intro:'함께해요',paymentMethod:'new',consent:true,policyVersion:quote.policyVersion,quoteId:quote.id,idempotencyKey:crypto.randomUUID()})])
  await f.db.exec("set role service_role;select set_config('request.jwt.claim.role','service_role',false)")
  let app;try{app=await f.value('select public.confirm_activity_meetup_admission_payment_for_service($1,$2,$3,$4)as value',[prepared.intentId,'fixture-provider',crypto.randomUUID(),17000])}finally{await f.db.exec('reset role')}
  await f.rpc(ids[0],'decide_activity_meetup_admission',[room,app.id,'approve',0])
  const joined=await f.overview(ids[5],scope);assert.equal(joined.mine.status,'joined');assert.equal(joined.mine.next_href,`/chat/rooms/meetup/${room}`);assert.equal(joined.incoming[0].status,'joined')
  assert.equal((await f.overview(ids[5],{scope_kind:'mentoring',scope_key:'career'})).mine.status,'waiting')
 }finally{await f.db.close()}
})

test('original friend-only invitation still rejects nonfriends and stale candidate revisions cannot invite',async()=>{
 const f=await candidateFixture();try{
  const room=await f.league(),c=(await f.register()).mine
  await assert.rejects(f.rpc(ids[0],'department_league_invites',['invite',JSON.stringify({sport:'lol',challenge_id:room.challenge_id,team_id:room.team_id,friend_user_id:ids[1],slot:'mid',expected_revision:0,idempotency_key:crypto.randomUUID()})]),/active_friendship_required/)
  await f.register(ids[1],f.scope,{expected_revision:0,positions:['support']})
  await assert.rejects(f.board(ids[0],'invite',{...f.scope,candidate_id:c.id,candidate_revision:0,room_id:room.team_id,room_revision:0,slot:'mid',idempotency_key:crypto.randomUUID()}),/stale_revision/)
 }finally{await f.db.close()}
})

test('only the actually admitted mentoring role completes a same-room multi-role invitation',async()=>{
 const f=await candidateFixture();try{
  const scope={scope_kind:'mentoring',scope_key:'career'},room=(await f.create()).room.id,c=(await f.register(ids[1],scope,{positions:['mentor','mentee']})).mine
  const args={...scope,candidate_id:c.id,candidate_revision:0,room_id:room,room_revision:0}
  await f.board(ids[0],'invite',{...args,slot:'mentor',idempotency_key:crypto.randomUUID()})
  const sent=await f.board(ids[0],'invite',{...args,slot:'mentee',idempotency_key:crypto.randomUUID()})
  const invite=sent.outgoing.find(x=>x.slot==='mentor')
  await f.board(ids[1],'accept',{...scope,invite_id:invite.id,expected_revision:0,idempotency_key:crypto.randomUUID()})
  await f.enable('mentoring',room)
  const app=await f.confirm((await f.prepare(ids[1],'mentoring',room,{role:'mentor'})).intentId);await f.decide(ids[0],'mentoring',room,app.id)
  const rows=(await f.db.query('select slot,status from quantum_private.candidate_board_invites where candidate_id=$1 order by slot',[c.id])).rows
  assert.deepEqual(rows,[{slot:'mentee',status:'cancelled'},{slot:'mentor',status:'joined'}])
  assert.equal((await f.db.query("select count(*)::int n from quantum_private.candidate_board_notification_sources where event='invitation_accepted'and recipient_id=$1",[ids[0]])).rows[0].n,1)
 }finally{await f.db.close()}
})
