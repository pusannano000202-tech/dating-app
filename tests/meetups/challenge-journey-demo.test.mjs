import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')
const contract=moduleUrl(await readFile(new URL('../../lib/meetups/challenge-journey.ts',import.meta.url),'utf8'))
const league=moduleUrl(await readFile(new URL('../../lib/meetups/challenge-league.ts',import.meta.url),'utf8'))
const source=(await readFile(new URL('../../lib/meetups/challenge-journey-demo.ts',import.meta.url),'utf8')).replaceAll("'./challenge-journey'",JSON.stringify(contract)).replaceAll("'./challenge-league'",JSON.stringify(league))
const{makeLeagueDemo,advanceLeagueDemo,leagueDemoLobby}=await import(moduleUrl(source))
const{selectJourneyChallenge,sportTiers,parseJourneyState}=await import(contract)
const{isCompatible,LOL_TIERS,SOCCER_LEVELS}=await import(league)
function becomeCaptain(state){
 state=advanceLeagueDemo(state,{type:'captain_request_to_me'})
 assert.equal(state.challenges[0].teams[0].is_captain,false)
 return advanceLeagueDemo(state,{type:'captain_accept'})
}
function agreeOpponent(state,opponentTeamId=state.challenges[1].teams[0].id){
 state=becomeCaptain(state)
 state=advanceLeagueDemo(state,{type:'propose',opponentTeamId})
 assert.equal(state.challenges[0].status,'recruiting')
 return advanceLeagueDemo(state,{type:'accept_proposal'})
}

const journeyForRanking=await import(contract)
test('ranking examples are opt-in, retain all tied ranks, and never change the default empty rehearsal',()=>{
 assert.deepEqual(makeLeagueDemo('lol').standings,[])
 const sample=makeLeagueDemo('lol','leaders')
 assert.equal(sample.standings.length,4)
 assert.ok(sample.standings.every(row=>row.played>0&&Number.isFinite(row.rating)))
 const {buildLeagueRows}=journeyForRanking
 assert.deepEqual(buildLeagueRows([],sample.standings,'기계공학부',true).map(row=>row.rank),[1,2,3,4])
 const tied=makeLeagueDemo('lol','ties')
 assert.deepEqual(buildLeagueRows([],tied.standings,'기계공학부',true).map(row=>row.rank),[1,1,2,3])
 sample.standings[0].rating=9999
 assert.notEqual(makeLeagueDemo('lol','leaders').standings[0].rating,9999)
 assert.deepEqual(makeLeagueDemo('lol').monthly_standings,[])
})

test('offline rehearsal completes all three formats, scores chosen tiers, and waits for both results',()=>{
 for(const sport of ['lol','futsal','football']){
  let state=makeLeagueDemo(sport)
  const slot=sport==='lol'?'mid':sport==='futsal'?'lm':'cm',tier=sport==='lol'?'grandmaster':'advanced'
  state=advanceLeagueDemo(state,{type:'request',slot,tier});assert.equal(state.challenges[0].teams[0].ready,false)
  state=advanceLeagueDemo(state,{type:'approve'});const own=state.challenges[0].teams[0],other=state.challenges[1].teams[0]
  assert.equal(own.ready,true);assert.ok(own.score>(sport==='lol'?400:300));assert.equal(own.score,other.score)
  assert.equal(own.players.find(p=>p.is_me).tier,tier)
  state=agreeOpponent(state)
  state=advanceLeagueDemo(state,{type:'schedule',startsAt:new Date(Date.now()+7200000).toISOString(),endsAt:new Date(Date.now()+10800000).toISOString(),place:'교내 체육시설'})
  state=advanceLeagueDemo(state,{type:'finish'});state=advanceLeagueDemo(state,{type:'result',own:2,opponent:1})
  assert.deepEqual(state.monthly_standings,[])
  assert.throws(()=>advanceLeagueDemo(state,{type:'confirm',own:3,opponent:1}),/demo_result_mismatch/)
  state=advanceLeagueDemo(state,{type:'confirm',own:2,opponent:1})
  assert.equal(state.challenges[0].status,'completed');assert.equal(state.monthly_standings.length,2)
  const selected=selectJourneyChallenge(state,null,false)
  assert.equal(selected.id,state.challenges[0].id);assert.equal(selected.status,'completed')
  assert.ok(selected.teams[1].players.every(p=>p.slot))
 }
})
test('three complete sample opponents have distinct internal scores and pairing honors the selected team',()=>{
 let state=makeLeagueDemo('lol');state=advanceLeagueDemo(state,{type:'request',slot:'mid',tier:'emerald'});state=advanceLeagueDemo(state,{type:'approve'})
 const candidates=state.challenges.slice(1).map(c=>c.teams[0]);assert.equal(candidates.length,3)
 assert.ok(candidates.every(team=>team.ready&&team.players.length===5));assert.equal(new Set(candidates.map(team=>team.score)).size,3)
 const selected=candidates[2];state=agreeOpponent(state,selected.id)
 assert.equal(state.challenges.length,1);assert.equal(state.challenges[0].teams[1].id,selected.id)
})
test('all selectable tiers retain three samples within both the 200-point team and strongest-player caps',()=>{
 for(const sport of ['lol','futsal','football'])for(const tier of sportTiers(sport)){
  let state=makeLeagueDemo(sport);state=advanceLeagueDemo(state,{type:'request',slot:sport==='lol'?'mid':sport==='futsal'?'lm':'cm',tier});state=advanceLeagueDemo(state,{type:'approve'})
  const scores=team=>team.players.map(p=>({...LOL_TIERS,...SOCCER_LEVELS})[p.tier]),own=state.challenges[0].teams[0]
  const candidates=state.challenges.slice(1).map(c=>c.teams[0]);assert.equal(new Set(candidates.map(t=>t.score)).size,3)
  assert.ok(candidates.every(team=>isCompatible(scores(own),scores(team),200,team.gap)))
 }
})
test('offline rehearsal rejects invalid tiers and never contains network calls',()=>{
 assert.throws(()=>advanceLeagueDemo(makeLeagueDemo('lol'),{type:'request',slot:'mid',tier:'advanced'}),/demo_invalid_tier/)
 assert.doesNotMatch(source,/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/)
})
test('proposal requires a complete team, captain consent and explicit opponent acceptance; cancel and decline do not pair',()=>{
 let state=makeLeagueDemo('lol'),opponentTeamId=state.challenges[1].teams[0].id
 assert.throws(()=>advanceLeagueDemo(state,{type:'propose',opponentTeamId}),/demo_team_required/)
 state=advanceLeagueDemo(state,{type:'request',slot:'mid',tier:'gold'})
 state=advanceLeagueDemo(state,{type:'approve'})
 assert.throws(()=>advanceLeagueDemo(state,{type:'propose',opponentTeamId}),/demo_captain_required/)
 state=becomeCaptain(state)
 assert.throws(()=>advanceLeagueDemo(state,{type:'accept_proposal'}),/demo_proposal_required/)
 state=advanceLeagueDemo(state,{type:'propose',opponentTeamId})
 state=advanceLeagueDemo(state,{type:'cancel_proposal'})
 assert.equal(state.challenges[0].status,'recruiting')
 assert.throws(()=>advanceLeagueDemo(state,{type:'accept_proposal'}),/demo_proposal_required/)
 state=advanceLeagueDemo(state,{type:'propose',opponentTeamId})
 state=advanceLeagueDemo(state,{type:'decline_proposal'})
 assert.equal(state.challenges[0].teams.length,1)
})
test('captain delegation keeps the current captain until recipient consent and supports decline',()=>{
 let state=makeLeagueDemo('lol')
 state=advanceLeagueDemo(state,{type:'request',slot:'mid',tier:'gold'})
 state=advanceLeagueDemo(state,{type:'approve'})
 state=becomeCaptain(state)
 const recipient=state.challenges[0].teams[0].players.find(p=>!p.is_me)
 state=advanceLeagueDemo(state,{type:'captain_offer',recipientRosterId:recipient.id})
 assert.equal(state.challenges[0].teams[0].is_captain,true)
 state=advanceLeagueDemo(state,{type:'captain_decline'})
 assert.equal(state.challenges[0].teams[0].is_captain,true)
 state=advanceLeagueDemo(state,{type:'captain_offer',recipientRosterId:recipient.id})
 state=advanceLeagueDemo(state,{type:'captain_accept'})
 assert.equal(state.challenges[0].teams[0].is_captain,false)
})
test('post-pair captain transfer clears pending confirmations while retaining the confirmed schedule',()=>{
 let state=makeLeagueDemo('lol')
 state=advanceLeagueDemo(state,{type:'request',slot:'mid',tier:'gold'})
 state=advanceLeagueDemo(state,{type:'approve'})
 state=agreeOpponent(state)
 const team=state.challenges[0].teams[0],recipient=team.players.find(p=>!p.is_me)
 state.challenges[0].schedule_proposals=[{team_id:team.id,is_mine:true,scheduled_at:'2026-09-11T10:00:00.000Z',ends_at:'2026-09-11T11:00:00.000Z',place_name:'교내 체육관'}]
 state=advanceLeagueDemo(state,{type:'captain_offer',recipientRosterId:recipient.id})
 state=advanceLeagueDemo(state,{type:'captain_accept'})
 assert.equal(state.challenges[0].status,'opponent_pending')
 assert.deepEqual(state.challenges[0].schedule_proposals,[])
 state=advanceLeagueDemo(state,{type:'captain_request_to_me'})
 state=advanceLeagueDemo(state,{type:'captain_accept'})
 state=advanceLeagueDemo(state,{type:'schedule',startsAt:'2026-09-11T10:00:00.000Z',endsAt:'2026-09-11T11:00:00.000Z',place:'교내 체육관'})
 state=advanceLeagueDemo(state,{type:'result',own:2,opponent:1})
 state=advanceLeagueDemo(state,{type:'captain_offer',recipientRosterId:recipient.id})
 state=advanceLeagueDemo(state,{type:'captain_accept'})
 assert.equal(state.challenges[0].status,'scheduled')
 assert.equal(state.challenges[0].result,null)
 assert.equal(state.challenges[0].scheduled_at,'2026-09-11T10:00:00.000Z')
 assert.equal(state.challenges[0].ends_at,'2026-09-11T11:00:00.000Z')
 assert.equal(state.challenges[0].place_name,'교내 체육관')
})

test('two own teams retain independent profiles and reject an unknown selected challenge',()=>{
 let state=advanceLeagueDemo(makeLeagueDemo('lol','empty',true),{type:'create_team',slot:'top',tier:'gold',title:'첫 번째 친구 팀'})
 const firstId=state.challenges[0].id
 state=advanceLeagueDemo(state,{type:'create_team',slot:'mid',tier:'silver',title:'두 번째 친구 팀'})
 const second=structuredClone(state.challenges[0]),secondId=second.id
 state=advanceLeagueDemo(state,{type:'profile',slot:'top',tier:'diamond'},firstId)
 assert.equal(state.challenges.find(c=>c.id===firstId).teams[0].players[0].tier,'diamond')
 assert.deepEqual(state.challenges.find(c=>c.id===secondId),second)
 const first=structuredClone(state.challenges.find(c=>c.id===firstId))
 state=advanceLeagueDemo(state,{type:'profile',slot:'mid',tier:'platinum'},secondId)
 assert.equal(state.challenges.find(c=>c.id===secondId).teams[0].players[0].tier,'platinum')
 assert.deepEqual(state.challenges.find(c=>c.id===firstId),first)
 assert.throws(()=>advanceLeagueDemo(state,{type:'profile',slot:'mid',tier:'gold'},'missing-challenge'),/demo_challenge_required/)
})

test('captain proposals and paired match changes stay attached to the explicitly selected team',()=>{
 let state=makeLeagueDemo('lol')
 state=advanceLeagueDemo(state,{type:'request',slot:'mid',tier:'gold'});state=advanceLeagueDemo(state,{type:'approve'});state=becomeCaptain(state)
 const firstId=state.challenges[0].id,opponentTeamId=state.challenges[1].teams[0].id
 state=advanceLeagueDemo(state,{type:'create_team',slot:'top',tier:'silver',title:'두 번째 친구 팀'})
 const second=structuredClone(state.challenges[0]),secondId=second.id
 state=advanceLeagueDemo(state,{type:'captain_request_to_me'},firstId)
 assert.ok(leagueDemoLobby(state,firstId).transfer)
 assert.equal(leagueDemoLobby(state,secondId).transfer,null)
 assert.throws(()=>advanceLeagueDemo(state,{type:'captain_accept'},secondId),/demo_transfer_required/)
 state=advanceLeagueDemo(state,{type:'captain_decline'},firstId)
 state=advanceLeagueDemo(state,{type:'propose',opponentTeamId},firstId)
 assert.equal(leagueDemoLobby(state,secondId).proposal,null)
 state=advanceLeagueDemo(state,{type:'accept_proposal'},firstId)
 state=advanceLeagueDemo(state,{type:'schedule',startsAt:'2026-09-11T10:00:00.000Z',endsAt:'2026-09-11T11:00:00.000Z',place:'교내 체육관'},firstId)
 state=advanceLeagueDemo(state,{type:'finish'},firstId)
 state=advanceLeagueDemo(state,{type:'result',own:2,opponent:1},firstId)
 state=advanceLeagueDemo(state,{type:'confirm',own:2,opponent:1},firstId)
 assert.equal(state.challenges.find(c=>c.id===firstId).status,'completed')
 assert.deepEqual(state.challenges.find(c=>c.id===secondId),second)
})

test('team names have an independent validated field that remains with both paired teams',()=>{
 let state=makeLeagueDemo('lol')
 state.challenges[0].teams[0].team_name='기계공 A팀'
 state.challenges[1].teams[0].team_name='전자공 번개팀'
 assert.ok(parseJourneyState(state))
 const malformed=structuredClone(state);malformed.challenges[0].teams[0].team_name={spoof:true}
 assert.equal(parseJourneyState(malformed),null)
 state=advanceLeagueDemo(state,{type:'request',slot:'mid',tier:'gold'});state=advanceLeagueDemo(state,{type:'approve'});state=agreeOpponent(state)
 assert.deepEqual(state.challenges[0].teams.map(team=>team.team_name),['기계공 A팀','전자공 번개팀'])
 const created=advanceLeagueDemo(makeLeagueDemo('lol','empty',true),{type:'create_team',slot:'top',tier:'gold',title:'자유로운 친구 팀'})
 assert.equal(created.challenges[0].teams[0].team_name,'자유로운 친구 팀')
})
