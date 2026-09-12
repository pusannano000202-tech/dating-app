import test from'node:test'
import assert from'node:assert/strict'
import{candidateFixture,ids}from'./candidate-board-fixture.mjs'
import{parseCandidateBoard}from'../../lib/meetups/candidate-board-contract.ts'
test('same-school candidates are opt-in, distinct people despite multiple positions, and current-scope private',async()=>{
 const f=await candidateFixture();try{
  assert.equal((await f.overview()).total_count,0)
  const one=await f.register();assert.equal(one.total_count,1);assert.equal(one.mine.status,'waiting');assert.ok(parseCandidateBoard(one))
  const key=crypto.randomUUID(),input={...f.scope,positions:['mid'],tier:'gold',intro:'소통해요',availability:'저녁',consent:true,expected_revision:0,idempotency_key:key}
  const changed=await f.board(ids[1],'register',input);assert.equal(changed.mine.revision,1);assert.equal((await f.board(ids[1],'register',input)).mine.revision,1)
  await assert.rejects(f.register(ids[1]),/stale_revision/)
  assert.equal((await f.overview(ids[1])).mine.revision,1)
  assert.equal((await f.overview(ids[2],f.scope,{filter:'support'})).filtered_count,0)
  assert.equal((await f.overview(ids[5])).total_count,0)
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[1],ids[2]]);assert.equal((await f.overview(ids[2])).total_count,0)
  await f.db.query("update quantum_private.community_member_profiles set department='다른학과'where user_id=$1",[ids[1]]);assert.equal((await f.overview(ids[2])).total_count,0)
  assert.equal((await f.overview(ids[1])).mine.status,'unavailable')
  await assert.rejects(f.board(ids[1],'register',{...input,owner_id:ids[2]}),/invalid_candidate_action/)
  await f.db.exec('set role authenticated');await assert.rejects(f.db.query('select *from quantum_private.meetup_candidates'),/permission denied/);await f.db.exec('reset role')
 }finally{await f.db.close()}
})

test('pagination counts distinct candidates and cancellation/deletion disappear without touching other scopes',async()=>{
 const f=await candidateFixture();try{
  await f.db.query("update quantum_private.community_member_profiles set department='기계공학과'where school_scope='pnu_self_selected'")
  for(const user of ids.slice(1,23))await f.register(user)
  const first=await f.overview(ids[0]);assert.equal(first.total_count,22);assert.equal(first.candidates.length,20);assert.ok(first.next_cursor)
  const second=await f.overview(ids[0],f.scope,{cursor:first.next_cursor});assert.equal(second.candidates.length,2);assert.equal(second.total_count,22);assert.equal(second.next_cursor,null)
  assert.equal(new Set([...first.candidates,...second.candidates].map(x=>x.id)).size,22)
  const mine=(await f.overview(ids[1])).mine
  await f.board(ids[1],'cancel',{...f.scope,expected_revision:mine.revision,idempotency_key:crypto.randomUUID()});assert.equal((await f.overview(ids[0])).total_count,21)
  await f.db.query('insert into quantum_private.test_deletions values($1)',[ids[2]]);assert.equal((await f.overview(ids[0])).total_count,20)
  await f.db.exec('set role anon');await assert.rejects(f.db.query("select public.meetup_candidate_board('overview',$1)",[JSON.stringify({...f.scope,filter:'all',cursor:null})]),/permission denied/);await f.db.exec('reset role')
 }finally{await f.db.close()}
})

test('expired joining lease restores discovery and closed/full targets cannot use cached invitations',async()=>{
 const f=await candidateFixture();try{
  const scope={scope_kind:'study',scope_key:'pnu:AN1600527'},room=await f.study(),c=(await f.register(ids[1],scope)).mine
  const sent=await f.board(ids[0],'invite',{...scope,candidate_id:c.id,candidate_revision:0,room_id:room.id,room_revision:0,slot:null,idempotency_key:crypto.randomUUID()})
  const iid=sent.outgoing[0].id
  const chosen=await f.board(ids[1],'accept',{...scope,invite_id:iid,expected_revision:0,idempotency_key:crypto.randomUUID()})
  await f.db.query("update quantum_private.meetup_candidates set joining_until=clock_timestamp()-interval '1 second'where id=$1",[c.id])
  await f.db.query("update quantum_private.candidate_board_invites set joining_until=clock_timestamp()-interval '1 second'where id=$1",[iid])
  assert.equal((await f.overview(ids[2],scope)).total_count,1)
  await f.db.query('update quantum_private.study_rooms set recruitment_closed=true where id=$1',[room.id])
  await assert.rejects(f.board(ids[1],'accept',{...scope,invite_id:iid,expected_revision:chosen.incoming[0].revision,idempotency_key:crypto.randomUUID()}),/candidate_invite_unavailable/)
  assert.equal((await f.overview(ids[1],scope)).incoming[0].status,'unavailable')
 }finally{await f.db.close()}
})

test('SQL registration rejects hidden formatting and malformed scalar inputs, not just the browser parser',async()=>{
 const f=await candidateFixture();try{
  await assert.rejects(f.register(ids[1],f.scope,{intro:'신청\u202e내용'}),/invalid_candidate_registration/)
  await assert.rejects(f.register(ids[1],f.scope,{positions:['mid','mid']}),/invalid_candidate_positions/)
  await assert.rejects(f.register(ids[1],f.scope,{tier:3}),/invalid_candidate_tier/)
 }finally{await f.db.close()}
})
test('nonfriend league invitation is only a proposal, no payment bypass or forged captain/slot',async()=>{
 const f=await candidateFixture();try{
  const room=await f.league(),candidate=(await f.register()).mine,team=room.team_id
  const input={...f.scope,candidate_id:candidate.id,candidate_revision:candidate.revision,room_id:team,room_revision:room.revision,slot:'mid',idempotency_key:crypto.randomUUID()}
  await assert.rejects(f.board(ids[2],'invite',input),/candidate_host_required/)
  await assert.rejects(f.board(ids[0],'invite',{...input,slot:'top'}),/candidate_slot_unavailable/)
  const sent=await f.board(ids[0],'invite',input);assert.equal(sent.outgoing.length,1);assert.ok(parseCandidateBoard(sent))
  const received=await f.overview(ids[1]);assert.equal(received.mine.status,'waiting');assert.equal(received.incoming.length,1)
  const i=received.incoming[0],accepted=await f.board(ids[1],'accept',{...f.scope,invite_id:i.id,expected_revision:i.revision,idempotency_key:crypto.randomUUID()})
  assert.equal(accepted.result.status,'preparation_required');assert.equal(accepted.result.checkout_enabled,false);assert.equal(accepted.mine.status,'waiting')
  assert.equal((await f.db.query("select count(*)::int n from public.department_challenge_roster where team_id=$1 and status='accepted'",[team])).rows[0].n,1)
  await assert.rejects(f.board(ids[2],'accept',{...f.scope,invite_id:i.id,expected_revision:i.revision,idempotency_key:crypto.randomUUID()}),/candidate_invite_not_found/)
 }finally{await f.db.close()}
})
test('study accept hides only temporarily, release restores waiting, paid membership closes exactly its scope',async()=>{
 const f=await candidateFixture();try{
  const scope={scope_kind:'study',scope_key:'pnu:AN1600527'},room=await f.study(),c=(await f.register(ids[1],scope)).mine
  await f.register(ids[1],{scope_kind:'mentoring',scope_key:'career'})
  const sent=await f.board(ids[0],'invite',{...scope,candidate_id:c.id,candidate_revision:0,room_id:room.id,room_revision:room.revision??0,slot:null,idempotency_key:crypto.randomUUID()})
  const i=sent.outgoing[0],args={...scope,invite_id:i.id,expected_revision:0,idempotency_key:crypto.randomUUID()}
  const chosen=await f.board(ids[1],'accept',args);assert.equal(chosen.mine.status,'joining');assert.equal(chosen.total_count,0);assert.equal(chosen.result.next_href,`/meetups/participation/study/${room.id}/apply`)
  assert.equal((await f.overview(ids[2],scope)).total_count,0)
  const released=await f.board(ids[1],'release',{...args,expected_revision:chosen.incoming[0].revision,idempotency_key:crypto.randomUUID()});assert.equal(released.mine.status,'waiting')
  const next=await f.board(ids[1],'accept',{...args,expected_revision:released.incoming[0].revision,idempotency_key:crypto.randomUUID()})
  await f.enable('study',room.id);const app=await f.confirm((await f.prepare(ids[1],'study',room.id,{})).intentId);await f.decide(ids[0],'study',room.id,app.id)
  const joined=await f.overview(ids[1],scope);assert.equal(joined.mine.status,'joined');assert.equal(joined.mine.next_href,`/chat/rooms/study_room/${room.id}`);assert.equal(joined.incoming[0].status,'joined')
  assert.equal((await f.overview(ids[1],{scope_kind:'mentoring',scope_key:'career'})).mine.status,'waiting')
  await assert.rejects(f.board(ids[1],'accept',{...args,expected_revision:next.incoming[0].revision,idempotency_key:crypto.randomUUID()}),/stale_revision|candidate_invite_unavailable/)
 }finally{await f.db.close()}
})
