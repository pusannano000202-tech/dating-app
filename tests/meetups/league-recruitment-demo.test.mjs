import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')
const read=file=>readFile(new URL('../../lib/meetups/'+file,import.meta.url),'utf8')
const journeyUrl=moduleUrl(await read('challenge-journey.ts')),leagueUrl=moduleUrl(await read('challenge-league.ts'))
const demoUrl=moduleUrl((await read('challenge-journey-demo.ts')).replaceAll("'./challenge-journey'",JSON.stringify(journeyUrl)).replaceAll("'./challenge-league'",JSON.stringify(leagueUrl)))
const source=(await read('league-recruitment-demo.ts')).replaceAll("'./challenge-journey'",JSON.stringify(journeyUrl)).replaceAll("'./challenge-journey-demo'",JSON.stringify(demoUrl)).replaceAll("'./challenge-league'",JSON.stringify(leagueUrl))
const demo=await import(moduleUrl(source)),{LEAGUE_SPORTS,selectJourneyChallenge}=await import(journeyUrl)
const {advanceLeagueDemo}=await import(demoUrl)

test('application introduction survives captain review and cancellation clears it before a fresh application',()=>{
 let state=demo.makeLeagueRecruitmentDemo('lol'),id=state.journey.challenges[0].id
 state.journey=advanceLeagueDemo(state.journey,{type:'request',slot:'jungle',tier:'silver',aspiration:'  끝까지 즐겁게 뛰어요  ',strengths:'팀원 콜을 잘 들어요'},id)
 const intro={aspiration:'끝까지 즐겁게 뛰어요',strengths:'팀원 콜을 잘 들어요'}
 assert.deepEqual(state.journey.challenges[0].teams[0].players.find(p=>p.is_me).application_intro,intro)
 state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'view_captain',challengeId:id})
 assert.deepEqual(state.journey.challenges[0].teams[0].players.find(p=>p.status==='requested').application_intro,intro)
 state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'view_member',challengeId:id})
 state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'cancel_request',challengeId:id})
 state.journey=advanceLeagueDemo(state.journey,{type:'request',slot:'jungle',tier:'silver'},id)
 assert.deepEqual(state.journey.challenges[0].teams[0].players.find(p=>p.is_me).application_intro,{aspiration:'',strengths:''})
})
test('recruitment starts with two other captains teams and a notice pointing to the same incomplete team',()=>{
 for(const sport of ['lol','futsal','football']){
  const {journey,recruitment}=demo.makeLeagueRecruitmentDemo(sport),teams=journey.challenges.filter(c=>c.teams[0].department===journey.my_department)
  assert.equal(teams.length,2);assert.ok(teams.every(c=>!c.teams[0].is_mine&&!c.teams[0].is_captain&&c.teams[0].may_join))
  assert.equal(teams[0].teams[0].players.length,LEAGUE_SPORTS[sport].capacity-1)
  assert.equal(teams[1].teams[0].players.length,LEAGUE_SPORTS[sport].capacity-2)
  assert.equal(recruitment.notices[0].challenge_id,teams[0].id)
 }
})
test('an explicit missing team selection never falls back to another team',()=>{
 const {journey}=demo.makeLeagueRecruitmentDemo('lol')
 assert.equal(selectJourneyChallenge(journey,'missing',false),null)
})

test('self-application remains pending until the separate captain approves and supports cancellation or rejection',()=>{
 for(const outcome of ['approve','reject','cancel_request']){
  let state=demo.makeLeagueRecruitmentDemo('lol'),id=state.journey.challenges[0].id
  state.journey=advanceLeagueDemo(state.journey,{type:'request',slot:'jungle',tier:'silver'},id)
  assert.equal(state.journey.challenges[0].teams[0].players.filter(p=>p.status==='accepted').length,4)
  assert.throws(()=>demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'approve',challengeId:id}),/captain_required/)
  if(outcome!=='cancel_request')state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'view_captain',challengeId:id})
  state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:outcome,challengeId:id})
  const team=state.journey.challenges[0].teams[0]
  assert.equal(team.players.filter(p=>p.status==='accepted').length,outcome==='approve'?5:4)
  assert.equal(team.ready,outcome==='approve')
  if(outcome==='approve')assert.equal(demo.recruitmentDemoRows(state.journey,state.recruitment).notices[0].status,'filled')
 }
})

test('approving a partly filled B team does not make it ready or change A team',()=>{
 let state=demo.makeLeagueRecruitmentDemo('lol'),id=state.journey.challenges[1].id,first=structuredClone(state.journey.challenges[0])
 state.journey=advanceLeagueDemo(state.journey,{type:'request',slot:'jungle',tier:'gold'},id)
 state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'view_captain',challengeId:id})
 state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'approve',challengeId:id})
 assert.equal(state.journey.challenges[1].teams[0].ready,false)
 assert.equal(state.journey.challenges[1].teams[0].players.length,4)
 assert.deepEqual(state.journey.challenges[0],first)
})

test('captain can publish, edit and close one notice without creating another team or room',()=>{
 let state=demo.makeLeagueRecruitmentDemo('lol')
 state.journey=advanceLeagueDemo(state.journey,{type:'create_team',slot:'mid',tier:'gold',title:'A팀'})
 const id=state.journey.challenges[0].id,count=state.journey.challenges.length,preferredAt=new Date(Date.now()+7200000).toISOString()
 for(const summary of ['오늘 대회 네 분 모집','초보도 함께해요'])state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'publish',challengeId:id,preferredAt,summary})
 const notices=demo.recruitmentDemoRows(state.journey,state.recruitment).notices.filter(n=>n.challenge_id===id)
 assert.equal(notices.length,1);assert.equal(notices[0].summary,'초보도 함께해요');assert.equal(notices[0].team_name,'A팀')
 assert.equal(state.journey.challenges.length,count)
 state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'close',challengeId:id})
 assert.equal(demo.recruitmentDemoDetail(state.journey,state.recruitment,id).notice.status,'closed')
 assert.throws(()=>demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'publish',challengeId:id,preferredAt:'2020-01-01',summary:'지난 모집'}),/invalid_notice/)
})

test('reserved invitations are not accepted members or open recruitment slots and expiration closes a notice',()=>{
 const state=demo.makeLeagueRecruitmentDemo('lol'),team=state.journey.challenges[0].teams[0],rows=demo.recruitmentDemoRows(state.journey,state.recruitment,[{team_id:team.id,slot:'jungle'}])
 assert.equal(rows.teams[0].accepted_count,4);assert.deepEqual(rows.teams[0].empty_slots,[]);assert.deepEqual(rows.teams[0].reserved_slots,['jungle']);assert.equal(rows.teams[0].may_join,false)
 assert.equal(rows.notices[0].status,'filled')
 assert.equal(demo.recruitmentDemoRows(state.journey,state.recruitment).notices[0].status,'open')
 state.recruitment.notices[0].expires_at=new Date(Date.now()-1000).toISOString()
 assert.equal(demo.recruitmentDemoRows(state.journey,state.recruitment).notices[0].status,'expired')
 assert.doesNotMatch(source,/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/)
})

test('a previously filled notice stays closed after a departure until the captain republishes it',()=>{
 let state=demo.makeLeagueRecruitmentDemo('lol'),id=state.journey.challenges[0].id
 state.journey=advanceLeagueDemo(state.journey,{type:'request',slot:'jungle',tier:'gold'},id)
 state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'view_captain',challengeId:id})
 state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'approve',challengeId:id})
 const team=state.journey.challenges[0].teams[0]
 team.players=team.players.filter(p=>p.slot!=='support');team.ready=false;team.may_join=true
 assert.equal(demo.recruitmentDemoRows(state.journey,state.recruitment).notices[0].status,'filled')
 state=demo.advanceRecruitmentDemo(state.journey,state.recruitment,{type:'publish',challengeId:id,preferredAt:new Date(Date.now()+7200000).toISOString(),summary:'서포터 한 분 다시 모집해요'})
 assert.equal(demo.recruitmentDemoRows(state.journey,state.recruitment).notices[0].status,'open')
 assert.deepEqual(demo.recruitmentDemoRows(state.journey,state.recruitment).notices[0].empty_slots,['support'])
})
