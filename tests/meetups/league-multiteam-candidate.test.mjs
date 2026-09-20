import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {candidateFixture,ids} from './candidate-board-fixture.mjs'

const source=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
const migration='20260919172319_league_multiteam_candidate_independence.sql'
async function setup(){
 const f=await candidateFixture()
 try{
  await f.db.exec(await source('20260912135440_candidate_board_notifications.sql'))
  await f.db.exec(await source('20260912152047_candidate_join_result_notifications.sql'))
  await f.db.exec(await source(migration))
  const create=(user,title)=>f.rpc(user,'department_league_journey',['create',JSON.stringify({sport:'lol',title,slot:'top',tier:'gold',idempotency_key:crypto.randomUUID()})])
  const offer=(sender,c,room,slot='mid')=>f.board(sender,'invite',{...f.scope,candidate_id:c.id,candidate_revision:c.revision,room_id:room.team_id,room_revision:room.revision,slot,idempotency_key:crypto.randomUUID()})
  const join=async(user,captain,room,slot='mid')=>{
   const revision=(await f.db.query('select revision from public.department_challenges where id=$1',[room.challenge_id])).rows[0].revision
   const request=await f.rpc(user,'department_league_journey',['join',JSON.stringify({sport:'lol',challenge_id:room.challenge_id,team_id:room.team_id,slot,tier:'gold',expected_revision:revision,idempotency_key:crypto.randomUUID()})])
   await f.rpc(captain,'accept_department_challenge_roster_request',[room.challenge_id,request.roster_id,request.revision,crypto.randomUUID()])
   return request
  }
  const notes=async user=>(await f.db.query("select *from public.notifications where user_id=$1 and payload->>'entity_type'='candidate_join_result'order by created_at,id",[user])).rows
  return {...f,create,offer,join,notes}
 }catch(e){await f.db.close();throw e}
}

test('joining A keeps league waiting and B offer, then joining B keeps both exact team chat links',async()=>{
 const f=await setup();try{
  const a=await f.create(ids[0],'A 리그 팀'),b=await f.create(ids[2],'B 리그 팀'),c=(await f.register()).mine
  await f.offer(ids[0],c,a);await f.offer(ids[0],c,a,'support');await f.offer(ids[2],c,b)
  await f.join(ids[1],ids[0],a)
  let board=await f.overview()
  assert.equal(board.mine.status,'waiting','membership must not close an independently published league listing')
  assert.equal(board.total_count,1)
  assert.equal(board.incoming.find(i=>i.room_id===a.team_id&&i.slot==='mid').status,'joined')
  assert.equal(board.incoming.find(i=>i.room_id===b.team_id).status,'pending')
  assert.equal((await f.notes(ids[2])).length,0,'other captain must not get false recruitment-ended notification')
  await f.join(ids[1],ids[2],b)
  board=await f.overview()
  assert.equal(board.mine.status,'waiting')
  for(const room of [a,b])assert.equal(board.incoming.find(i=>i.room_id===room.team_id&&i.slot==='mid').next_href,'/chat/league-team/'+room.team_id)
  const ownerNotes=await f.notes(ids[1]);assert.equal(ownerNotes.length,2)
  assert.ok(ownerNotes.every(n=>!n.payload.body.includes('종료')))
  for(const [index,room]of [a,b].entries())assert.deepEqual(await f.rpc(ids[1],'get_activity_meetup_admission_notification',[ownerNotes[index].id]),{status:'current',href:'/chat/league-team/'+room.team_id})
  await f.db.query("update public.department_challenge_roster set status=status where user_id=$1 and status='accepted'",[ids[1]])
  assert.equal((await f.notes(ids[1])).length,2,'no duplicate result for a no-op roster write')
  const rooms=(await f.rooms(ids[1])).rooms
  for(const room of [a,b])assert.ok(rooms.some(r=>r.kind==='league_team'&&r.id===room.team_id),'both actor-owned chat rooms remain available')
 }finally{await f.db.close()}
})

test('existing team does not prevent opted-in candidate registration or another team invitation',async()=>{
 const f=await setup();try{
  const own=await f.create(ids[1],'기존 리그 팀'),other=await f.create(ids[0],'새 리그 팀')
  const c=(await f.register()).mine
  assert.equal(c.status,'waiting')
  const sent=await f.offer(ids[0],c,other);assert.equal(sent.outgoing[0].status,'pending')
  await assert.rejects(f.offer(ids[1],c,own),/candidate_not_available/)
  await f.join(ids[1],ids[0],other)
  const revision=(await f.db.query('select revision from public.department_challenges where id=$1',[other.challenge_id])).rows[0].revision
  await assert.rejects(f.rpc(ids[1],'department_league_journey',['join',JSON.stringify({sport:'lol',challenge_id:other.challenge_id,team_id:other.team_id,slot:'support',tier:'gold',expected_revision:revision,idempotency_key:crypto.randomUUID()})]),/already|roster|conflict/)
 }finally{await f.db.close()}
})

test('multi-team publication does not bypass deposit preparation, identity or actor authorization',async()=>{
 const f=await setup();try{
  const c=(await f.register()).mine,a=await f.create(ids[0],'같이 할 팀')
  await f.db.exec(await source('20260912152443_candidate_deposit_preparation_guard.sql'))
  await f.join(ids[1],ids[0],a)
  const after=(await f.overview()).mine
  assert.equal(after.status,'waiting')
  const changed=(await f.register(ids[1],f.scope,{expected_revision:after.revision,intro:'팀에 있어도 찾고 있어요'})).mine
  assert.equal(changed.status,'waiting')
  await assert.rejects(f.register(ids[2]),/candidate_deposit_unavailable/)
  const context=await f.rpc(ids[2],'get_meetup_candidate_deposit_context',['league','lol'])
  assert.equal(context.checkout_enabled,false)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.activity_meetup_admission_deposits')).rows[0].n,0)
  await f.board(ids[1],'cancel',{...f.scope,expected_revision:changed.revision,idempotency_key:crypto.randomUUID()})
  await assert.rejects(f.register(ids[1],f.scope,{expected_revision:changed.revision+1}),/candidate_deposit_unavailable/)
  assert.equal((await f.overview()).mine.status,'cancelled')
  assert.equal((await f.db.query("select count(*)::int n from public.department_challenge_roster where user_id=$1 and status='accepted'",[ids[1]])).rows[0].n,1,'pausing listing does not leave any team')
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await f.db.query("select has_function_privilege($1,'quantum_private.candidate_membership_confirmed_league()','execute')allowed",[role])).rows[0].allowed,false)
  }
 }finally{await f.db.close()}
})

test('friend slot invitations across teams preserve each invitation, its slot and all actor-owned chat rooms',async()=>{
 const f=await setup();try{
  const a=await f.create(ids[0],'첫 번째 친구 팀'),b=await f.create(ids[0],'두 번째 친구 팀')
  const request=crypto.randomUUID()
  await f.db.query("insert into public.friend_requests values($1,$2,$3,'accepted')",[request,ids[0],ids[1]])
  await f.db.query("insert into public.friendships(user_id,friend_user_id,status,created_from_request_id)values($1,$2,'active',$3)",[ids[0],ids[1],request])
  const revision=async room=>(await f.db.query('select revision from public.department_challenges where id=$1',[room.challenge_id])).rows[0].revision
  const call=(user,action,args)=>f.rpc(user,'department_league_invites',[action,JSON.stringify(args)])
  const invites=[]
  for(const room of [a,b])invites.push(await call(ids[0],'invite',{sport:'lol',challenge_id:room.challenge_id,team_id:room.team_id,friend_user_id:ids[1],slot:'mid',expected_revision:await revision(room),idempotency_key:crypto.randomUUID()}))
  await call(ids[1],'accept',{sport:'lol',invite_id:invites[0].id,tier:'gold',expected_revision:await revision(a),idempotency_key:crypto.randomUUID()})
  const remaining=await call(ids[1],'overview',{sport:'lol',challenge_id:null})
  assert.equal(remaining.incoming.find(i=>i.id===invites[1].id).status,'pending')
  await call(ids[1],'accept',{sport:'lol',invite_id:invites[1].id,tier:'gold',expected_revision:await revision(b),idempotency_key:crypto.randomUUID()})
  const memberships=(await f.db.query("select r.team_id,p.slot_key from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.user_id=$1 and r.status='accepted'",[ids[1]])).rows
  assert.equal(memberships.length,2);assert.ok(memberships.every(r=>r.slot_key==='mid'))
  await assert.rejects(call(ids[0],'invite',{sport:'lol',challenge_id:a.challenge_id,team_id:a.team_id,friend_user_id:ids[1],slot:'support',expected_revision:await revision(a),idempotency_key:crypto.randomUUID()}),/already_on_challenge/)
  for(const room of [a,b])assert.ok((await f.rooms(ids[1])).rooms.some(r=>r.kind==='league_team'&&r.id===room.team_id))
 }finally{await f.db.close()}
})

test('two candidate invitation accepts stay preparation-only without creating or reusing any deposit pledge',async()=>{
 const f=await setup();try{
  const a=await f.create(ids[0],'A 준비 팀'),b=await f.create(ids[2],'B 준비 팀'),c=(await f.register()).mine
  await f.offer(ids[0],c,a);await f.offer(ids[2],c,b)
  await f.db.exec(await source('20260912152443_candidate_deposit_preparation_guard.sql'))
  const invitations=(await f.overview()).incoming
  for(const i of invitations){
   const result=await f.board(ids[1],'accept',{...f.scope,invite_id:i.id,expected_revision:i.revision,idempotency_key:crypto.randomUUID()})
   assert.deepEqual(result.result,{status:'preparation_required',next_href:null,checkout_enabled:false})
   assert.equal(result.mine.status,'waiting');assert.ok(result.incoming.every(x=>x.status==='pending'))
  }
  for(const table of ['activity_meetup_admission_intents','activity_meetup_admission_deposits'])assert.equal((await f.db.query(`select count(*)::int n from quantum_private.${table}`)).rows[0].n,0)
  assert.equal((await f.db.query('select count(*)::int n from public.department_challenge_roster where user_id=$1',[ids[1]])).rows[0].n,0)
 }finally{await f.db.close()}
})

test('same-challenge opponent duplicates and overlapping team rosters remain ineligible for pairing',async()=>{
 const f=await setup();try{
  const a=await f.create(ids[0],'한 팀'),b=await f.create(ids[0],'다른 팀')
  for(const room of [a,b])for(const [index,slot]of ['jungle','mid','adc','support'].entries())await f.join(ids[index+1],ids[0],room,slot)
  for(const room of [a,b])assert.equal((await f.db.query('select quantum_private.challenge_team_ready($1)ready',[room.team_id])).rows[0].ready,true)
  assert.equal((await f.db.query('select quantum_private.challenge_teams_compatible($1,$2)compatible',[a.team_id,b.team_id])).rows[0].compatible,false)
  const opponent=(await f.db.query("insert into public.department_challenge_teams(challenge_id,side,department_key,department_label,captain_user_id)values($1,'opponent','다른학과','다른학과',$2)returning id",[a.challenge_id,ids[10]])).rows[0].id
  assert.equal((await f.db.query("select quantum_private.candidate_target_available('league','lol',$1,$2)available",[ids[1],opponent])).rows[0].available,false)
  await assert.rejects(f.db.query("insert into public.department_challenge_roster(challenge_id,team_id,user_id,status,department_key_snapshot)values($1,$2,$3,'requested','다른학과')",[a.challenge_id,opponent,ids[1]]),/unique|duplicate/)
  assert.equal((await f.db.query("select count(*)::int n from public.department_challenge_roster where user_id=$1 and status='accepted'",[ids[1]])).rows[0].n,2)
 }finally{await f.db.close()}
})

test('study retains its existing single-membership lifecycle after the league-only migration',async()=>{
 const f=await setup();try{
  const scope={scope_kind:'study',scope_key:'pnu:AN1600527'},a=await f.study(),b=await f.study(ids[2]),c=(await f.register(ids[1],scope)).mine
  for(const [sender,room]of [[ids[0],a],[ids[2],b]])await f.board(sender,'invite',{...scope,candidate_id:c.id,candidate_revision:c.revision,room_id:room.id,room_revision:0,slot:null,idempotency_key:crypto.randomUUID()})
  await f.enable('study',a.id);const application=await f.confirm((await f.prepare(ids[1],'study',a.id,{})).intentId)
  await f.decide(ids[0],'study',a.id,application.id)
  const board=await f.overview(ids[1],scope)
  assert.equal(board.mine.status,'joined');assert.equal(board.total_count,0)
  assert.equal((await f.db.query('select status from quantum_private.candidate_board_invites where room_id=$1',[b.id])).rows[0].status,'cancelled')
  assert.equal((await f.notes(ids[2])).length,1)
  assert.ok((await f.notes(ids[1]))[0].payload.body.includes('다른 참가 제안은 종료'))
 }finally{await f.db.close()}
})

test('other-team proposals still require exact actor, live revision, capacity and current unblocked identity',async()=>{
 const f=await setup();try{
  const a=await f.create(ids[0],'A 신청'),b=await f.create(ids[2],'B 신청'),c=(await f.register()).mine
  await f.join(ids[1],ids[0],a)
  const mine=(await f.overview()).mine
  await assert.rejects(f.offer(ids[2],c,b),/stale_revision/)
  const sent=await f.offer(ids[2],mine,b),i=sent.outgoing[0]
  await assert.rejects(f.offer(ids[2],mine,b),/candidate_already_invited/)
  await assert.rejects(f.board(ids[3],'accept',{...f.scope,invite_id:i.id,expected_revision:i.revision,idempotency_key:crypto.randomUUID()}),/candidate_invite_not_found/)
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[1],ids[2]])
  assert.equal((await f.overview()).incoming.find(x=>x.id===i.id).status,'unavailable')
  await assert.rejects(f.board(ids[1],'accept',{...f.scope,invite_id:i.id,expected_revision:i.revision,idempotency_key:crypto.randomUUID()}),/candidate_invite_unavailable/)
  await f.db.exec('delete from quantum_private.test_blocks')
  for(const [user,slot]of [[ids[3],'jungle'],[ids[4],'adc']])await f.join(user,ids[2],b,slot)
  await f.db.query("update quantum_private.community_member_profiles set department='기계공학과'where user_id=$1",[ids[5]])
  await f.join(ids[5],ids[2],b,'support')
  await f.db.query("update quantum_private.community_member_profiles set department='기계공학과'where user_id=$1",[ids[6]])
  await f.join(ids[6],ids[2],b,'mid')
  assert.equal((await f.overview()).incoming.find(x=>x.id===i.id).status,'unavailable')
  await assert.rejects(f.board(ids[1],'accept',{...f.scope,invite_id:i.id,expected_revision:i.revision,idempotency_key:crypto.randomUUID()}),/candidate_invite_unavailable/)
  await f.db.query("update quantum_private.community_member_profiles set department='다른학과'where user_id=$1",[ids[1]])
  assert.equal((await f.overview()).mine.status,'unavailable')
 }finally{await f.db.close()}
})

test('editing a league waiting intro preserves A/B offers and changing positions ends only incompatible slots',async()=>{
 const f=await setup();try{
  const a=await f.create(ids[0],'A 편집 팀'),b=await f.create(ids[2],'B 편집 팀'),c=(await f.register()).mine
  await f.offer(ids[0],c,a,'mid');await f.offer(ids[2],c,b,'support')
  await f.db.exec(await source('20260912152443_candidate_deposit_preparation_guard.sql'))
  const edited=await f.register(ids[1],f.scope,{expected_revision:c.revision,intro:'자기소개만 수정했어요'})
  assert.equal(edited.incoming.find(i=>i.room_id===a.team_id).status,'pending')
  assert.equal(edited.incoming.find(i=>i.room_id===b.team_id).status,'pending')
  const changed=await f.register(ids[1],f.scope,{expected_revision:edited.mine.revision,positions:['mid']})
  assert.equal(changed.incoming.find(i=>i.room_id===a.team_id).status,'pending')
  assert.equal(changed.incoming.find(i=>i.room_id===b.team_id).status,'cancelled')
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.activity_meetup_admission_deposits')).rows[0].n,0)
 }finally{await f.db.close()}
})

test('editing a league waiting football role preserves matching exact slots and nonleague edits retain old closure',async()=>{
 const f=await setup();try{
  const scope={scope_kind:'league',scope_key:'football'}
  const create=user=>f.rpc(user,'department_league_journey',['create',JSON.stringify({sport:'football',title:'축구 대기 테스트',slot:'gk',tier:'beginner',idempotency_key:crypto.randomUUID()})])
  const a=await create(ids[0]),b=await create(ids[2]),c=(await f.register(ids[1],scope,{positions:['defender','forward']})).mine
  for(const [sender,room,slot]of [[ids[0],a,'lb'],[ids[2],b,'st']])await f.board(sender,'invite',{...scope,candidate_id:c.id,candidate_revision:c.revision,room_id:room.team_id,room_revision:room.revision,slot,idempotency_key:crypto.randomUUID()})
  const edited=await f.register(ids[1],scope,{expected_revision:c.revision,positions:['defender','forward'],intro:'소개만 바꿔요'})
  assert.ok(edited.incoming.every(i=>i.status==='pending'))
  const changed=await f.register(ids[1],scope,{expected_revision:edited.mine.revision,positions:['defender']})
  assert.equal(changed.incoming.find(i=>i.slot==='lb').status,'pending')
  assert.equal(changed.incoming.find(i=>i.slot==='st').status,'cancelled')
  const study={scope_kind:'study',scope_key:'pnu:AN1600527'},room=await f.study(),candidate=(await f.register(ids[1],study)).mine
  await f.board(ids[0],'invite',{...study,candidate_id:candidate.id,candidate_revision:candidate.revision,room_id:room.id,room_revision:0,slot:null,idempotency_key:crypto.randomUUID()})
  const oldPolicy=await f.register(ids[1],study,{expected_revision:candidate.revision,intro:'스터디 수정'})
  assert.equal(oldPolicy.incoming[0].status,'cancelled')
 }finally{await f.db.close()}
})

test('joined league offers keep their exact team name when full without exposing it to departed or blocked people',async()=>{
 const f=await setup();try{
  const a=await f.create(ids[0],'정확한 A 팀 이름'),c=(await f.register()).mine
  await f.offer(ids[0],c,a,'mid');await f.join(ids[1],ids[0],a)
  for(const [user,slot]of [[ids[2],'jungle'],[ids[3],'adc'],[ids[4],'support']])await f.join(user,ids[0],a,slot)
  const owner=(await f.overview()).incoming.find(i=>i.room_id===a.team_id)
  assert.equal(owner.status,'joined');assert.equal(owner.room_title,'정확한 A 팀 이름')
  assert.equal(owner.next_href,'/chat/league-team/'+a.team_id)
  assert.equal((await f.overview(ids[0])).outgoing.find(i=>i.room_id===a.team_id).room_title,'정확한 A 팀 이름')
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[1],ids[0]])
  assert.equal((await f.overview()).incoming.find(i=>i.room_id===a.team_id).room_title,'참가 제안')
  await f.db.exec('delete from quantum_private.test_blocks')
  await f.db.query('update public.department_challenge_teams set captain_user_id=$1 where id=$2',[ids[2],a.team_id])
  const senderRevision=(await f.db.query('select revision from public.department_challenges where id=$1',[a.challenge_id])).rows[0].revision
  await f.rpc(ids[0],'leave_my_department_challenge_roster',[a.challenge_id,a.team_id,senderRevision,crypto.randomUUID()])
  const formerSender=(await f.overview(ids[0])).outgoing.find(i=>i.room_id===a.team_id)
  assert.equal(formerSender.status,'unavailable');assert.equal(formerSender.room_title,'참가 제안')
  assert.equal((await f.overview()).incoming.find(i=>i.room_id===a.team_id).room_title,'정확한 A 팀 이름')
  const revision=(await f.db.query('select revision from public.department_challenges where id=$1',[a.challenge_id])).rows[0].revision
  await f.rpc(ids[1],'leave_my_department_challenge_roster',[a.challenge_id,a.team_id,revision,crypto.randomUUID()])
  const departed=(await f.overview()).incoming.find(i=>i.room_id===a.team_id)
  assert.equal(departed.status,'unavailable');assert.equal(departed.room_title,'참가 제안');assert.equal(departed.next_href,null)
 }finally{await f.db.close()}
})
