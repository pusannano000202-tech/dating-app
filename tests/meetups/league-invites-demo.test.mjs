import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')
const read=file=>readFile(new URL('../../lib/meetups/'+file,import.meta.url),'utf8')
const journeyUrl=moduleUrl(await read('challenge-journey.ts')),leagueUrl=moduleUrl(await read('challenge-league.ts'))
const demoUrl=moduleUrl((await read('challenge-journey-demo.ts')).replaceAll("'./challenge-journey'",JSON.stringify(journeyUrl)).replaceAll("'./challenge-league'",JSON.stringify(leagueUrl)))
const{makeLeagueDemo,advanceLeagueDemo}=await import(demoUrl)
const{makeLeagueInviteDemo,advanceLeagueInviteDemo,leagueInviteDemoSnapshot}=await import(moduleUrl((await read('league-invites-demo.ts')).replaceAll("'./challenge-journey'",JSON.stringify(journeyUrl)).replaceAll("'./challenge-league'",JSON.stringify(leagueUrl))))
const{LEAGUE_SPORTS}=await import(journeyUrl)
function create(sport){
 const slot=LEAGUE_SPORTS[sport].slots[0].key,tier=sport==='lol'?'gold':'intermediate'
 const journey=advanceLeagueDemo(makeLeagueDemo(sport,'empty',true),{type:'create_team',slot,tier,title:'친구들과 첫 경기'})
 return {journey,invites:makeLeagueInviteDemo(),tier}
}
test('fresh teams start with only the creator, and a position invite never counts as acceptance',()=>{
 for(const sport of ['lol','futsal','football']){
  let state=create(sport);const team=state.journey.challenges[0].teams[0],slot=LEAGUE_SPORTS[sport].slots[1].key
  assert.equal(team.players.length,1);assert.equal(team.players[0].is_me,true);assert.equal(team.is_captain,true)
  state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'invite',challengeId:state.journey.challenges[0].id,slot,friendId:state.invites.friends[0].user_id})
  assert.equal(state.journey.challenges[0].teams[0].players.length,1)
  const snapshot=leagueInviteDemoSnapshot(state.journey,state.invites,state.journey.challenges[0].id)
  assert.equal(snapshot.sent[0].slot,slot);assert.equal(snapshot.sent[0].status,'pending');assert.equal(snapshot.preview.players.length,1)
  assert.throws(()=>advanceLeagueInviteDemo(state.journey,state.invites,{type:'accept',inviteId:snapshot.sent[0].id,tier:state.tier}),/demo_recipient_required/)
  state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'view_recipient',inviteId:snapshot.sent[0].id})
  state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'accept',inviteId:snapshot.sent[0].id,tier:sport==='lol'?'silver':'beginner'})
  assert.equal(state.journey.challenges[0].teams[0].players.length,2)
  assert.equal(state.journey.challenges[0].teams[0].players[1].status,'accepted')
  assert.equal(state.journey.challenges[0].teams[0].players[1].slot,slot)
 }
})
test('decline, cancel, expiry and a newly occupied position do not admit the recipient',()=>{
 for(const failure of ['decline','cancel','expire','occupied']){
  let state=create('lol'),challengeId=state.journey.challenges[0].id
  state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'invite',challengeId,slot:'jungle',friendId:state.invites.friends[0].user_id})
  const inviteId=state.invites.records[0].id
  if(failure==='cancel'||failure==='expire')state=advanceLeagueInviteDemo(state.journey,state.invites,{type:failure,inviteId})
  state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'view_recipient',inviteId})
  if(failure==='decline')state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'decline',inviteId})
  if(failure==='occupied')state.journey.challenges[0].teams[0].players.push({id:'91000000-0000-4000-8000-000000001111',alias:'먼저 참가한 팀원',slot:'jungle',position:'jungle',tier:'gold',status:'accepted',is_me:false})
  const before=structuredClone(state.journey)
  assert.throws(()=>advanceLeagueInviteDemo(state.journey,state.invites,{type:'accept',inviteId,tier:'gold'}),/demo_invite_unavailable|demo_slot_unavailable/)
  assert.deepEqual(state.journey,before)
 }
})
test('receiver supplies their own valid tier and repeated acceptance cannot duplicate a participant',()=>{
 let state=create('futsal'),challengeId=state.journey.challenges[0].id
 state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'invite',challengeId,slot:'ld',friendId:state.invites.friends[0].user_id})
 const inviteId=state.invites.records[0].id
 state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'view_recipient',inviteId})
 assert.throws(()=>advanceLeagueInviteDemo(state.journey,state.invites,{type:'accept',inviteId,tier:'gold'}),/demo_invalid_tier/)
 state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'accept',inviteId,tier:'advanced'})
 assert.equal(state.journey.challenges[0].teams[0].players[1].tier,'advanced')
 assert.throws(()=>advanceLeagueInviteDemo(state.journey,state.invites,{type:'accept',inviteId,tier:'advanced'}),/demo_invite_unavailable/)
 assert.equal(state.journey.challenges[0].teams[0].players.length,2)
})
test('invitation rehearsal uses the existing seven-day server invitation lifetime',()=>{
 let state=create('lol'),challengeId=state.journey.challenges[0].id
 const before=Date.now()
 state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'invite',challengeId,slot:'jungle',friendId:state.invites.friends[0].user_id})
 const expiry=Date.parse(state.invites.records[0].expires_at)
 assert.ok(expiry>=before+7*86400000)
 assert.ok(expiry<=Date.now()+7*86400000)
})
test('creating another fresh team retains the first team under a distinct challenge ID',()=>{
 const first=create('lol').journey,firstTeam=structuredClone(first.challenges[0])
 const second=advanceLeagueDemo(first,{type:'create_team',slot:'mid',tier:'silver',title:'두 번째 친구 팀'})
 assert.notEqual(second.challenges[0].id,firstTeam.id)
 assert.deepEqual(second.challenges.find(challenge=>challenge.id===firstTeam.id),firstTeam)
 assert.equal(new Set(second.challenges.map(challenge=>challenge.id)).size,second.challenges.length)
})

test('recipient team previews close after decline, cancellation or expiry but remain for accepted members',()=>{
 for(const terminal of ['decline','cancel','expire','elapsed','accept']){
  let state=create('futsal'),challengeId=state.journey.challenges[0].id
  state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'invite',challengeId,slot:'ld',friendId:state.invites.friends[0].user_id})
  const inviteId=state.invites.records[0].id
  if(terminal==='cancel'||terminal==='expire')state=advanceLeagueInviteDemo(state.journey,state.invites,{type:terminal,inviteId})
  state=advanceLeagueInviteDemo(state.journey,state.invites,{type:'view_recipient',inviteId})
  if(terminal==='decline'||terminal==='accept')state=advanceLeagueInviteDemo(state.journey,state.invites,{type:terminal,inviteId,tier:'beginner'})
  if(terminal==='elapsed')state.invites.records[0].expires_at=new Date(Date.now()-1000).toISOString()
  const snapshot=leagueInviteDemoSnapshot(state.journey,state.invites,challengeId)
  if(terminal==='accept')assert.equal(snapshot.preview.players.length,2)
  else assert.equal(snapshot.preview,null,terminal)
 }
})
