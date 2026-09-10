import assert from 'node:assert/strict'
import test from 'node:test'
const journey=await import('../../lib/meetups/challenge-journey.ts').catch(()=>({}))

test('league sports expose exact unique selectable slots and keep unsupported sports closed',()=>{
 assert.equal(journey.LEAGUE_SPORTS?.lol?.slots.length,5)
 assert.equal(journey.LEAGUE_SPORTS?.futsal?.slots.length,6)
 assert.equal(journey.LEAGUE_SPORTS?.football?.slots.length,11)
 for(const sport of Object.values(journey.LEAGUE_SPORTS)){assert.equal(new Set(sport.slots.map(slot=>slot.key)).size,sport.capacity);assert.ok(sport.slots.every(slot=>slot.x>0&&slot.x<100&&slot.y>0&&slot.y<100))}
 assert.equal(journey.isLeagueSport('overwatch'),false);assert.equal(journey.isLeagueSport('pubg'),false)
})
test('all registry departments start at 1000 and only confirmed played departments enter the monthly ranking',()=>{
 assert.equal(typeof journey.buildLeagueRows,'function')
 const baseline=journey.buildLeagueRows(['기계공학부','전자공학전공','건축학과'],[],'기계공학부',false)
 assert.equal(baseline.length,3);assert.ok(baseline.every(row=>row.points===1000&&row.played===0&&row.rank===null))
 assert.deepEqual(journey.buildLeagueRows(['기계공학부','전자공학전공'],[],'기계공학부',true),[])
 const rows=journey.buildLeagueRows(['기계공학부','전자공학전공','건축학과'],[{department:'기계공학부',played:1,wins:1,losses:0,draws:0},{department:'전자공학전공',played:1,wins:0,losses:1,draws:0}],'기계공학부',true)
 assert.equal(rows.length,2);assert.equal(rows[0].department,'기계공학부');assert.equal(rows[0].points,1030);assert.equal(rows[1].points,970)
 const persisted=journey.buildLeagueRows(['기계공학부'],[{department:'기계공학부',played:2,wins:2,losses:0,draws:0,rating:1250}],'기계공학부',false)
 assert.equal(persisted[0].points,1250)
})
test('journey command validation rejects invalid sport-role pairs, spoofed identities and unconstrained capacity',()=>{
 assert.equal(typeof journey.validateJourneyCommand,'function')
 const id='10000000-0000-4000-8000-000000000001'
 assert.deepEqual(journey.validateJourneyCommand('create',{sport:'lol',title:'우리 학과 팀',slot:'mid',tier:'gold',idempotency_key:id}),{sport:'lol',title:'우리 학과 팀',slot:'mid',tier:'gold',idempotency_key:id})
 assert.throws(()=>journey.validateJourneyCommand('create',{sport:'lol',title:'우리 학과 팀',slot:'gk',tier:'gold',idempotency_key:id}))
 assert.throws(()=>journey.validateJourneyCommand('create',{sport:'football',title:'우리 학과 팀',slot:'gk',tier:'gold',idempotency_key:id}))
 assert.throws(()=>journey.validateJourneyCommand('create',{sport:'lol',title:'우리 학과 팀',slot:'mid',tier:'gold',idempotency_key:id,user_id:id}))
 assert.throws(()=>journey.validateJourneyCommand('create',{sport:'lol',title:'우리 학과 팀',slot:'mid',tier:'gold',idempotency_key:id,capacity:3}))
})
test('missing or malformed live league data cannot turn into a fabricated zero-match state',()=>{
 assert.equal(typeof journey.parseJourneyState,'function')
 for(const value of[null,{},[],{sport:'lol',challenges:[],standings:[]}])assert.equal(journey.parseJourneyState(value),null)
})
