import assert from 'node:assert/strict'
import test from 'node:test'
import {fixture,ids} from './challenge-league-fixture.mjs'
import {LEAGUE_SPORTS,parseJourneyState} from '../../lib/meetups/challenge-journey.ts'
const migration=new URL('../../supabase/migrations/20260910035348_department_league_position_journey.sql',import.meta.url)
async function setup(){const f=await fixture([migration]);return {...f,journey:(user,action,args)=>f.rpc(user,'department_league_journey',[action,JSON.stringify(args)])}}
async function positionTeam(f,offset,sport,department){
 const{db,journey,rpc}=f,slots=LEAGUE_SPORTS[sport].slots,actor=ids[offset]
 for(let i=0;i<slots.length;i++)await db.query('update quantum_private.community_member_profiles set department=$2 where user_id=$1',[ids[offset+i],department])
 const tier=sport==='lol'?'gold':'intermediate'
 const made=await journey(actor,'create',{sport,title:`${department} ${sport}`,slot:slots[0].key,tier,idempotency_key:crypto.randomUUID()})
 let challenge=(await journey(actor,'overview',{sport})).challenges.find(c=>c.id===made.challenge_id),team=challenge.teams[0]
 for(let i=1;i<slots.length;i++){
  await journey(ids[offset+i],'join',{sport,challenge_id:challenge.id,team_id:team.id,slot:slots[i].key,tier,expected_revision:challenge.revision,idempotency_key:crypto.randomUUID()})
  challenge=(await journey(actor,'overview',{sport})).challenges.find(c=>c.id===challenge.id)
  const request=challenge.teams[0].players.find(p=>p.slot===slots[i].key&&p.status==='requested')
  await rpc(actor,'accept_department_challenge_roster_request',[challenge.id,request.id,challenge.revision,crypto.randomUUID()])
  challenge=(await journey(actor,'overview',{sport})).challenges.find(c=>c.id===challenge.id)
 }
 assert.equal(challenge.teams[0].ready,true);assert.equal(challenge.teams[0].players.length,slots.length)
 return {id:challenge.id,team:team.id,actor}
}
test('new journey creates an exact-format team with atomic selected slot and preserves idempotency',async()=>{
 const{db,journey}=await setup();try{
  const args={sport:'lol',title:'우리 학과 첫 팀',slot:'mid',tier:'gold',idempotency_key:crypto.randomUUID()}
  const created=await journey(ids[0],'create',args);assert.ok(created.challenge_id)
  assert.deepEqual(await journey(ids[0],'create',args),created)
  await assert.rejects(journey(ids[0],'create',{...args,slot:'top'}),/idempotency_key_reused/)
  const state=await journey(ids[0],'overview',{sport:'lol'});assert.ok(parseJourneyState(state));assert.equal(state.challenges.length,1)
  assert.equal(state.challenges[0].teams[0].players[0].slot,'mid');assert.equal(state.challenges[0].teams[0].ready,false)
  assert.deepEqual(state.standings,[]);assert.deepEqual(state.monthly_standings,[])
  await assert.rejects(journey(ids[0],'create',{...args,sport:'football',slot:'gk',idempotency_key:crypto.randomUUID()}),/invalid_slot_profile/)
  await assert.rejects(journey(ids[23],'overview',{sport:'lol'}),/department_identity_required/)
 }finally{await db.close()}
})
test('same accepted pitch slot cannot be occupied twice and joining still requires captain consent',async()=>{
 const{db,journey,rpc}=await setup();try{
  const created=await journey(ids[0],'create',{sport:'futsal',title:'우리 학과 풋살 팀',slot:'gk',tier:'intermediate',idempotency_key:crypto.randomUUID()})
  let c=(await journey(ids[0],'overview',{sport:'futsal'})).challenges[0];const team=c.teams[0]
  await assert.rejects(journey(ids[1],'join',{sport:'futsal',challenge_id:c.id,team_id:team.id,slot:'gk',tier:'advanced',expected_revision:c.revision,idempotency_key:crypto.randomUUID()}),/slot_occupied/)
  const join=async(user,slot)=>{c=(await journey(ids[0],'overview',{sport:'futsal'})).challenges[0];return journey(user,'join',{sport:'futsal',challenge_id:c.id,team_id:team.id,slot,tier:'intermediate',expected_revision:c.revision,idempotency_key:crypto.randomUUID()})}
  await join(ids[1],'ld');await join(ids[2],'ld');c=(await journey(ids[0],'overview',{sport:'futsal'})).challenges[0]
  assert.equal(c.teams[0].players.filter(p=>p.status==='accepted').length,1)
  const pending=c.teams[0].players.filter(p=>p.status==='requested')
  const accepted=await rpc(ids[0],'accept_department_challenge_roster_request',[c.id,pending[0].id,c.revision,crypto.randomUUID()])
  await assert.rejects(rpc(ids[0],'accept_department_challenge_roster_request',[c.id,pending[1].id,accepted.revision,crypto.randomUUID()]),/slot_occupied/)
  const own=(await journey(ids[1],'overview',{sport:'futsal'})).challenges[0]
  await assert.rejects(journey(ids[5],'profile',{sport:'futsal',challenge_id:c.id,team_id:team.id,slot:'rm',tier:'advanced',expected_revision:own.revision,idempotency_key:crypto.randomUUID()}),/team_membership_required/)
  assert.equal((await db.query('select team_capacity from public.department_challenges where id=$1',[created.challenge_id])).rows[0].team_capacity,6)
 }finally{await db.close()}
})
test('monthly and lifetime records include only bilateral confirmed scores and keep sports separate',async()=>{
 const{db,journey,act,team,rpc}=await setup();try{
  const a=await team(0),b=await team(5);await act(a.actor,'queue',{team_id:a.team,waiting:true,gap:200});await act(b.actor,'queue',{team_id:b.team,waiting:true,gap:200});await act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});const pair=await act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team})
  let rev=(await db.query('select revision from public.department_challenges where id=$1',[pair.challenge_id])).rows[0].revision
  const starts=new Date(Date.now()+7200000).toISOString(),ends=new Date(Date.now()+10800000).toISOString();const first=await rpc(a.actor,'confirm_my_department_challenge_schedule',[pair.challenge_id,starts,ends,'교내 PC방',rev,crypto.randomUUID()]);const second=await rpc(b.actor,'confirm_my_department_challenge_schedule',[pair.challenge_id,starts,ends,'교내 PC방',first.revision,crypto.randomUUID()])
  await db.query("update public.department_challenges set scheduled_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[pair.challenge_id])
  const result=await rpc(a.actor,'confirm_my_department_challenge_result',[pair.challenge_id,2,1,second.revision,crypto.randomUUID()]);assert.deepEqual((await journey(a.actor,'overview',{sport:'lol'})).monthly_standings,[])
  await rpc(b.actor,'confirm_my_department_challenge_result',[pair.challenge_id,1,2,result.revision,crypto.randomUUID()]);const state=await journey(a.actor,'overview',{sport:'lol'})
  assert.ok(parseJourneyState(state));assert.equal(state.standings.length,2);assert.equal(state.monthly_standings.length,2)
  await db.query("update public.department_challenge_result_confirmations set confirmed_at=now()-interval '2 months' where challenge_id=$1",[pair.challenge_id])
  const past=await journey(a.actor,'overview',{sport:'lol'});assert.equal(past.standings.length,2);assert.deepEqual(past.monthly_standings,[])
  assert.deepEqual((await journey(a.actor,'overview',{sport:'football'})).standings,[])
 }finally{await db.close()}
})

test('full football match snapshots all eleven exact slots before report projection and remains reportable after completion',async()=>{
 const f=await setup(),{db,journey,act,rpc}=f;try{
  const a=await positionTeam(f,0,'football','기계공학과'),b=await positionTeam(f,11,'football','전자공학과')
  await act(a.actor,'queue',{team_id:a.team,waiting:true,gap:200});await act(b.actor,'queue',{team_id:b.team,waiting:true,gap:300})
  assert.equal((await act(a.actor,'candidates',{team_id:a.team})).length,1)
  await act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});const pair=await act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team})
  let revision=(await db.query('select revision from public.department_challenges where id=$1',[pair.challenge_id])).rows[0].revision
  const starts=new Date(Date.now()+7200000).toISOString(),ends=new Date(Date.now()+10800000).toISOString()
  const first=await rpc(a.actor,'confirm_my_department_challenge_schedule',[pair.challenge_id,starts,ends,'부산대 운동장',revision,crypto.randomUUID()])
  const receiver=(await journey(b.actor,'overview',{sport:'football'})).challenges.find(c=>c.id===pair.challenge_id)
  assert.equal(receiver.schedule_proposals.length,1);assert.equal(receiver.schedule_proposals[0].is_mine,false)
  const proposal=receiver.schedule_proposals[0]
  assert.equal(Date.parse(proposal.scheduled_at),Date.parse(starts));assert.equal(proposal.place_name,'부산대 운동장')
  const observer=(await journey(ids[22],'overview',{sport:'football'})).challenges.find(c=>c.id===pair.challenge_id)
  assert.deepEqual(observer.schedule_proposals,[])
  const second=await rpc(b.actor,'confirm_my_department_challenge_schedule',[pair.challenge_id,proposal.scheduled_at,proposal.ends_at,proposal.place_name,receiver.revision,crypto.randomUUID()])
  const snapshots=(await db.query('select slot_key from quantum_private.challenge_match_players where challenge_id=$1',[pair.challenge_id])).rows
  assert.equal(snapshots.length,22);assert.ok(snapshots.every(p=>p.slot_key));assert.equal(snapshots.filter(p=>p.slot_key==='lw').length,2)
  const triggerNames=(await db.query("select tgname from pg_trigger where tgrelid='public.department_challenges'::regclass and tgname in('challenge_capture_match','challenge_journey_capture') order by tgname")).rows.map(r=>r.tgname)
  assert.deepEqual(triggerNames,['challenge_capture_match','challenge_journey_capture'])
  await db.query("update public.department_challenges set scheduled_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[pair.challenge_id])
  await db.query("update public.department_challenge_roster set accepted_at=now()-interval '3 hours' where challenge_id=$1",[pair.challenge_id])
  const targets=await journey(a.actor,'report_targets',{challenge_id:pair.challenge_id});assert.equal(targets.length,11)
  assert.equal(targets.find(p=>p.slot==='lw').position,'forward');assert.deepEqual(new Set(targets.map(p=>p.slot)),new Set(LEAGUE_SPORTS.football.slots.map(p=>p.key)))
  assert.ok(!JSON.stringify(targets).includes(b.actor))
  const result=await rpc(a.actor,'confirm_my_department_challenge_result',[pair.challenge_id,3,1,second.revision,crypto.randomUUID()])
  await rpc(b.actor,'confirm_my_department_challenge_result',[pair.challenge_id,1,3,result.revision,crypto.randomUUID()])
  assert.equal((await journey(a.actor,'report_targets',{challenge_id:pair.challenge_id})).length,11)
  const report=await act(a.actor,'report',{challenge_id:pair.challenge_id,target_player_id:targets.find(p=>p.slot==='lw').id,reason:'종료된 경기에서 해당 포지션 선수의 행동을 확인해 주세요.'});assert.equal(report.status,'pending')
  assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_restrictions')).rows[0].n,0)
 }finally{await db.close()}
})

test('legacy inferred futsal teams remain outside the new queue until all six exact slots are declared',async()=>{
 const f=await setup(),{db,rpc,act,journey}=f;try{
  for(let i=0;i<6;i++)await db.query('update quantum_private.community_member_profiles set department=$2 where user_id=$1',[ids[i],'기계공학과'])
  const made=await rpc(ids[0],'create_department_challenge',['soccer','이전 방식 풋살 팀','',6,crypto.randomUUID()]),teamId=made.teams[0].id
  let revision=made.revision
  for(let i=1;i<6;i++){const request=await rpc(ids[i],'request_department_challenge_roster',[made.id,teamId,revision,crypto.randomUUID()]);const accepted=await rpc(ids[0],'accept_department_challenge_roster_request',[made.id,request.roster_id,request.revision,crypto.randomUUID()]);revision=accepted.revision}
  for(let i=0;i<6;i++)await act(ids[i],'profile',{team_id:teamId,position:'goalkeeper',tier:'intermediate'})
  const before=(await journey(ids[0],'overview',{sport:'futsal'})).challenges.find(c=>c.id===made.id)
  assert.equal(before.teams[0].ready,false)
  await assert.rejects(act(ids[0],'queue',{team_id:teamId,waiting:true,gap:200}),/fair_team_required/)
  const other=await positionTeam(f,6,'futsal','전자공학과');await act(other.actor,'queue',{team_id:other.team,waiting:true,gap:200})
  await db.query('insert into quantum_private.challenge_team_preferences(team_id,waiting,allowed_gap)values($1,true,200)',[teamId])
  assert.deepEqual(await act(other.actor,'candidates',{team_id:other.team}),[])
  for(let i=0;i<6;i++){
   const state=(await journey(ids[i],'overview',{sport:'futsal'})).challenges.find(c=>c.id===made.id)
   await journey(ids[i],'profile',{sport:'futsal',challenge_id:made.id,team_id:teamId,slot:LEAGUE_SPORTS.futsal.slots[i].key,tier:'intermediate',expected_revision:state.revision,idempotency_key:crypto.randomUUID()})
  }
  const after=(await journey(ids[0],'overview',{sport:'futsal'})).challenges.find(c=>c.id===made.id);assert.equal(after.teams[0].ready,true)
  await act(ids[0],'queue',{team_id:teamId,waiting:true,gap:200});assert.equal((await act(other.actor,'candidates',{team_id:other.team})).length,1)
 }finally{await db.close()}
})

test('a ready futsal 6v6 team can never propose or accept a ready football 11v11 team',async()=>{
 const f=await setup(),{db,act}=f;try{
  const a=await positionTeam(f,0,'futsal','기계공학과'),b=await positionTeam(f,6,'football','전자공학과')
  await act(a.actor,'queue',{team_id:a.team,waiting:true,gap:300});await act(b.actor,'queue',{team_id:b.team,waiting:true,gap:300})
  assert.deepEqual(await act(a.actor,'candidates',{team_id:a.team}),[])
  await assert.rejects(act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team}),/opponent_not_available/)
  await assert.rejects(act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team}),/opponent_not_available/)
  assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_pair_proposals')).rows[0].n,0)
 }finally{await db.close()}
})
