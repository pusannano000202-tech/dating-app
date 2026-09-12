import test from 'node:test'
import assert from 'node:assert/strict'
import {createDemoBoard,applyDemoAction,demoIncoming,demoJoined} from '../../lib/meetups/candidate-board-demo.ts'
import {parseCandidateBoard,candidatePositions} from '../../lib/meetups/candidate-board-contract.ts'

const scopes=[{kind:'league',key:'lol'},{kind:'league',key:'football'},{kind:'league',key:'futsal'},{kind:'mentoring',key:'courses'},{kind:'study',key:'pnu:AN1600527'},{kind:'meetup',key:'evening-dining'}]
const key='91000000-0000-4000-8000-000000000099'
const input=(board,more={})=>({scope_kind:board.scope.kind,scope_key:board.scope.key,positions:candidatePositions(board.scope).slice(0,2),tier:board.scope.kind==='league'?board.scope.key==='lol'?'gold':'intermediate':null,intro:'서로 편하게 이야기해요',availability:'수요일 저녁',consent:true,expected_revision:board.mine?.revision??null,idempotency_key:key,...more})
const register=(board,more={})=>applyDemoAction(board,'register',input(board,more))
const command=(board,invite,more={})=>({scope_kind:board.scope.kind,scope_key:board.scope.key,invite_id:invite.id,expected_revision:invite.revision,idempotency_key:key,...more})
const valid=board=>{assert.ok(parseCandidateBoard(board),'Every demo result must satisfy the real DTO contract');return board}

test('each deterministic synthetic board starts with30 distinct available people and a3-person preview',()=>{
 for(const scope of scopes){const board=valid(createDemoBoard(scope));assert.equal(board.total_count,30);assert.equal(board.filtered_count,30);assert.equal(board.candidates.length,3);assert.equal(board.mine,null);assert.equal(board.next_cursor,board.candidates.at(-1).id);assert.deepEqual(board,createDemoBoard(scope));assert.ok(board.candidates.every(c=>!c.is_me&&c.status==='waiting'));}
})
test('synthetic registered candidacy is pinned once, and editing never adds a second person',()=>{
 for(const scope of scopes){const before=createDemoBoard(scope),unchanged=structuredClone(before),first=valid(register(before));assert.deepEqual(before,unchanged);assert.equal(first.total_count,31);assert.equal(first.mine.status,'waiting');assert.equal(first.mine.next_href,null);assert.equal(first.candidates[0].id,first.mine.id);assert.equal(first.candidates.filter(c=>c.is_me).length,1);assert.equal(first.result.checkout_enabled,false);const edit=valid(register(first,{intro:'고친 소개'}));assert.equal(edit.total_count,31);assert.equal(edit.mine.id,first.mine.id);assert.equal(edit.mine.intro,'고친 소개');assert.equal(edit.mine.revision,first.mine.revision+1);}
})
test('multiple preferred positions never mean multiple people or occupied team slots',()=>{
 for(const scope of scopes){const board=valid(register(createDemoBoard(scope),{positions:candidatePositions(scope)}));assert.equal(board.total_count,31);assert.equal(board.candidates.filter(c=>c.is_me).length,1);if(scope.kind==='study'){assert.deepEqual(board.mine.positions,[]);assert.equal(board.mine.tier,null)}}
})
test('incoming invitation alone leaves candidacy public; accepting one hides it without payment or membership claims',()=>{
 for(const scope of scopes){const waiting=register(createDemoBoard(scope)),incoming=valid(demoIncoming(waiting));assert.equal(incoming.incoming.length,1);assert.equal(incoming.total_count,31);assert.equal(incoming.mine.status,'waiting');assert.deepEqual(demoIncoming(incoming),incoming);const invite=incoming.incoming[0],joining=valid(applyDemoAction(incoming,'accept',command(incoming,invite)));assert.equal(joining.mine.status,'joining');assert.equal(joining.total_count,30);assert.ok(!joining.candidates.some(c=>c.is_me));assert.equal(joining.result.status,'joining');assert.equal(joining.result.checkout_enabled,false);assert.equal(joining.incoming[0].status,'joining');assert.ok(joining.mine.next_href);assert.equal(joining.mine.joining_until,joining.incoming[0].joining_until);assert.deepEqual(joining.host_rooms,incoming.host_rooms);}
})
test('only an explicit joining rehearsal can become joined; release restores just this valid candidate',()=>{
 for(const scope of scopes){let board=register(createDemoBoard(scope));assert.deepEqual(demoJoined(board),board);board=demoIncoming(board);const joining=applyDemoAction(board,'accept',command(board,board.incoming[0]));const released=valid(applyDemoAction(joining,'release',command(joining,joining.incoming[0])));assert.equal(released.total_count,31);assert.equal(released.mine.status,'waiting');assert.equal(released.mine.next_href,null);assert.equal(released.incoming[0].status,'pending');const joined=valid(demoJoined(joining));assert.equal(joined.total_count,30);assert.equal(joined.mine.status,'joined');assert.ok(joined.mine.next_href.startsWith('/chat/'));assert.equal(joined.incoming[0].status,'joined');assert.equal(joined.result.checkout_enabled,false);assert.ok(!joined.candidates.some(c=>c.is_me));assert.deepEqual(demoJoined(joined),joined);assert.throws(()=>applyDemoAction(joined,'release',command(joined,joined.incoming[0])),/conflict/);}
})
test('declining an invite does not withdraw registration; cancellation invalidates incoming invitations',()=>{
 let board=demoIncoming(register(createDemoBoard(scopes[0])));board=valid(applyDemoAction(board,'decline',command(board,board.incoming[0])));assert.equal(board.mine.status,'waiting');assert.equal(board.total_count,31);assert.equal(board.incoming[0].status,'declined');board=demoIncoming(board);const previous=board.incoming.find(i=>i.status==='pending');assert.ok(previous);const cancelled=valid(applyDemoAction(board,'cancel',{expected_revision:board.mine.revision}));assert.equal(cancelled.total_count,30);assert.equal(cancelled.mine.status,'cancelled');assert.ok(!cancelled.candidates.some(c=>c.is_me));assert.ok(cancelled.incoming.every(i=>i.status!=='pending'&&i.status!=='joining'));assert.deepEqual(demoIncoming(cancelled),cancelled);assert.throws(()=>applyDemoAction(cancelled,'accept',command(cancelled,previous)),/conflict|unavailable/);assert.equal(valid(register(cancelled)).total_count,31)
})
test('stale edits, cancellation and invitation choices never mutate another current revision',()=>{
 const board=demoIncoming(register(createDemoBoard(scopes[0]))),saved=structuredClone(board);assert.throws(()=>register(board,{expected_revision:board.mine.revision+1}),/revision|conflict/);assert.throws(()=>applyDemoAction(board,'cancel',{expected_revision:99}),/revision|conflict/);assert.throws(()=>applyDemoAction(board,'accept',command(board,board.incoming[0],{expected_revision:99})),/revision|conflict/);assert.deepEqual(board,saved)
})
test('more shows additional unique fixture candidates without exceeding the public20-row contract',()=>{
 for(const mine of [false,true]){let board=createDemoBoard(scopes[0]);if(mine)board=register(board);const firstIds=board.candidates.map(c=>c.id);board=valid(applyDemoAction(board,'more',{}));assert.equal(board.candidates.length,firstIds.length+3);assert.ok(firstIds.every(id=>board.candidates.some(c=>c.id===id)));for(let i=0;i<12;i++)board=valid(applyDemoAction(board,'more',{}));assert.ok(board.candidates.length<=20);assert.equal(new Set(board.candidates.map(c=>c.id)).size,board.candidates.length);assert.equal(board.total_count,mine?31:30);if(mine)assert.equal(board.candidates[0].id,board.mine.id)}
})
test('captain invitation binds a current candidate to one compatible exact slot and never hides the candidate',()=>{
 for(const scope of scopes){const board=createDemoBoard(scope),candidate=board.candidates[0],room=board.host_rooms[0];assert.ok(room);const slot=scope.kind==='league'?scope.key==='lol'?candidate.positions[0]:candidate.positions[0]==='goalkeeper'?'gk':candidate.positions[0]==='defender'?scope.key==='futsal'?'ld':'lb':candidate.positions[0]==='midfielder'?scope.key==='futsal'?'lm':'cm':'st':scope.kind==='mentoring'?candidate.positions[0]:null;const args={candidate_id:candidate.id,candidate_revision:candidate.revision,room_id:room.id,room_revision:room.revision,slot,idempotency_key:key};const invited=valid(applyDemoAction(board,'invite',args));assert.equal(invited.outgoing.length,1);assert.equal(invited.outgoing[0].slot,slot);assert.equal(invited.outgoing[0].is_sender,true);assert.equal(invited.total_count,30);assert.deepEqual(invited.candidates,board.candidates);assert.equal(applyDemoAction(invited,'invite',args).outgoing.length,1);assert.throws(()=>applyDemoAction(board,'invite',{...args,candidate_revision:99}),/revision|conflict/);}
})
test('invalid role, tier, foreign scope or unsupported action cannot produce success-shaped state',()=>{
 const board=createDemoBoard(scopes[0]);for(const patch of [{positions:['mid','mid']},{positions:['admin']},{tier:'fake'},{consent:false},{scope_kind:'study'},{positions:[]}])assert.throws(()=>register(board,patch),/invalid|consent|scope/);assert.throws(()=>applyDemoAction(board,'paid',{}),/invalid/);assert.deepEqual(demoIncoming(board),board)
})
test('registering in one activity never changes a different activity or leaks its invitation destination',()=>{
 const lol=createDemoBoard(scopes[0]),study=createDemoBoard(scopes[4]),saved=structuredClone(study),joining=applyDemoAction(demoIncoming(register(lol)),'accept',command(demoIncoming(register(lol)),demoIncoming(register(lol)).incoming[0]));assert.deepEqual(study,saved);assert.notEqual(lol.owner_id,study.owner_id);assert.ok(joining.mine.next_href.startsWith('/chat/league-team/'));assert.equal(study.mine,null)
})

test('role filtering counts people, preserves compatible pinned self and does not change total availability',()=>{
 let board=register(createDemoBoard(scopes[0]),{positions:['mid','support']});board=valid(applyDemoAction(board,'overview',{filter:'mid'}));assert.equal(board.total_count,31);assert.equal(board.filtered_count,13);assert.equal(board.candidates[0].id,board.mine.id);assert.ok(board.candidates.every(c=>c.positions.includes('mid')));board=valid(applyDemoAction(board,'more',{filter:'mid'}));assert.equal(board.filtered_count,13);assert.ok(board.candidates.every(c=>c.positions.includes('mid')));const top=valid(applyDemoAction(board,'overview',{filter:'top'}));assert.equal(top.filtered_count,12);assert.equal(top.mine.status,'waiting');assert.ok(top.candidates.every(c=>c.positions.includes('top')&&!c.is_me));assert.throws(()=>applyDemoAction(board,'overview',{filter:'admin'}),/invalid/)
})

test('an invitation for a removed role becomes unavailable instead of silently reassigning that role',()=>{
 const incoming=demoIncoming(register(createDemoBoard(scopes[0]),{positions:['top','mid']})),invite=incoming.incoming[0];assert.equal(invite.slot,'top');const edited=valid(register(incoming,{positions:['support']}));assert.equal(edited.incoming[0].status,'unavailable');assert.equal(edited.total_count,31);assert.throws(()=>applyDemoAction(edited,'accept',command(edited,edited.incoming[0])),/conflict|unavailable/);const newInvite=valid(demoIncoming(edited));assert.equal(newInvite.incoming.at(-1).slot,'support')
})

test('a claimed room revision, full room, foreign room or incompatible field slot cannot send an invite',()=>{
 for(const scope of scopes.slice(0,3)){const board=createDemoBoard(scope),candidate=board.candidates[0],room=board.host_rooms[0],slot=scope.key==='lol'?'top':'gk',args={candidate_id:candidate.id,candidate_revision:candidate.revision,room_id:room.id,room_revision:room.revision,slot};assert.throws(()=>applyDemoAction(board,'invite',{...args,room_revision:99}),/revision/);assert.throws(()=>applyDemoAction(board,'invite',{...args,room_id:key}),/unavailable/);assert.throws(()=>applyDemoAction(board,'invite',{...args,slot:scope.key==='lol'?'support':'st'}),/invalid/);const full=structuredClone(board);full.host_rooms[0].member_count=room.capacity;assert.throws(()=>applyDemoAction(full,'invite',args),/invalid/);assert.equal(board.outgoing.length,0)}
})

test('strict primitive inputs cannot smuggle success-shaped invalid DTO data through String coercion',()=>{
 const board=createDemoBoard(scopes[0]);for(const patch of [{tier:{toString:()=> 'gold'}},{tier:['gold']},{intro:'bad\u0000text'},{availability:''},{availability:' day '},{intro:'a'.repeat(201)}])assert.throws(()=>register(board,patch),/invalid/)
})

test('cancelling preparation invalidates the selected invitation and cannot restore it through a late release',()=>{
 let board=demoIncoming(register(createDemoBoard(scopes[0])));board=applyDemoAction(board,'accept',command(board,board.incoming[0]));const cancelled=valid(applyDemoAction(board,'cancel',{expected_revision:board.mine.revision}));assert.equal(cancelled.mine.status,'cancelled');assert.equal(cancelled.total_count,30);assert.equal(cancelled.incoming[0].status,'unavailable');assert.throws(()=>applyDemoAction(cancelled,'release',command(cancelled,cancelled.incoming[0])),/conflict/);assert.deepEqual(demoJoined(cancelled),cancelled)
})

test('two demo teams can invite but joining one closes the other without double membership',()=>{
 const invited=valid(demoIncoming(register(createDemoBoard(scopes[0])),2))
 assert.equal(invited.incoming.length,2)
 assert.notEqual(invited.incoming[0].room_id,invited.incoming[1].room_id)
 const a=invited.incoming[0],b=invited.incoming[1]
 const joining=applyDemoAction(invited,'accept',command(invited,a))
 assert.throws(()=>applyDemoAction(joining,'accept',command(joining,b)),/conflict/)
 const joined=valid(demoJoined(joining))
 assert.equal(joined.incoming[0].status,'joined');assert.equal(joined.incoming[1].status,'unavailable')
 assert.equal(joined.total_count,30);assert.ok(!joined.candidates.some(c=>c.is_me))
 assert.throws(()=>applyDemoAction(joined,'accept',command(joined,b)),/conflict/)
})

test('repeating the two-team demo after a decline never duplicates the remaining team',()=>{
 let board=demoIncoming(register(createDemoBoard(scopes[0])),2)
 board=applyDemoAction(board,'decline',command(board,board.incoming[0]))
 board=valid(demoIncoming(board,2))
 const pending=board.incoming.filter(i=>i.status==='pending')
 assert.equal(pending.length,2);assert.equal(new Set(pending.map(i=>i.room_id)).size,2)
 const b=pending.find(i=>i.room_title.startsWith('B팀'))
 board=valid(demoJoined(applyDemoAction(board,'accept',command(board,b))))
 assert.ok(board.incoming.find(i=>i.status==='joined').room_title.startsWith('B팀'))
 assert.ok(board.incoming.filter(i=>i.status==='unavailable').every(i=>!i.room_title.startsWith('B팀')))
})
