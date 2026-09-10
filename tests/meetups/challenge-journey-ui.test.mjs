import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import {LEAGUE_SPORTS,sportTiers} from '../../lib/meetups/challenge-journey.ts'
const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8')
test('focused league uses real full images with interactive occupant slots and every declared skill tier',async()=>{
 const source=await read('components/community/department/DepartmentLeagueJourney.tsx'),css=await read('components/community/department/department-league-journey.module.css')
 assert.match(source,/export function DepartmentLeagueJourney\(\{demo=false,initialSport,demoRanking='empty',demoFlow='league',initialInviteId,initialChallengeId\}/)
 assert.match(source,/<LeagueHonors rows=\{rows\} monthly=\{monthly\} onJoin=\{\(\)=>go\('recruitment'\)\}/)
 assert.match(source,/<Image src=\{definition\.image\}/);assert.match(source,/definition\.slots\.map\(slot=>/)
 assert.match(source,/onClick=\{readOnly\?undefined:\(\)=>onSelect\(slot\.key\)\}/);assert.match(source,/occupant\?\.alias/);assert.match(source,/occupant\?\.tier/)
 assert.match(css,/\.map>img\{object-fit:contain\}/);assert.doesNotMatch(source,/<svg|<canvas/)
 assert.match(source,/sportTiers\(sport\)\.map/);assert.ok(sportTiers('lol').includes('grandmaster'));assert.ok(sportTiers('lol').includes('challenger'))
 assert.deepEqual(sportTiers('football'),['beginner','intermediate','advanced'])
 assert.equal(LEAGUE_SPORTS.lol.image,'/social-scenes/league-lol-map.png');assert.equal(LEAGUE_SPORTS.football.image,'/social-scenes/league-football-pitch.png')
 assert.match(source,/leagueTeamSum\(team\)/)
 assert.match(source,/c\.status==='completed'\?'result':'match'/);assert.match(source,/go\('report'\)/)
 assert.match(source,/selectJourneyChallenge\(data,selectedId,draft\)/)
 assert.match(source,/selected\.schedule_proposals\.map/);assert.match(source,/onClick=\{\(\)=>void adoptSchedule\(proposal\)\}/)
 assert.match(source,/scheduled_at:proposal\.scheduled_at,ends_at:proposal\.ends_at,place_name:proposal\.place_name/)
})
test('live connection failure cannot be displayed as fetched zero matches and the dedicated route stays authenticated',async()=>{
 const source=await read('components/community/department/DepartmentLeagueJourney.tsx'),route=await read('app/api/community/department/league/journey/route.ts')
 assert.match(source,/setData\(null\);setLiveDetail\(null\);setConnection\('error'\)/)
 assert.match(source,/journey\.policyOnly/);assert.match(source,/journey\.pointsProposal/)
 assert.match(source,/setData\(makeLeagueDemo\(sport,demoRanking,demoFlow==='invites'\)\);setConnection\('ready'\);return\}/)
 assert.match(route,/assertTrustedMutationOrigin\(request\)/);assert.match(route,/client\.auth\.getUser\(\)/)
 assert.match(route,/if\(authError\).*503/);assert.match(route,/if\(!user\).*401/)
 assert.match(route,/validateJourneyCommand\(action,args\)/);assert.doesNotMatch(route,/demo|service_role|SERVICE_ROLE/)
})
test('captain selected gap reaches queue request instead of silently reusing old persisted gap',async()=>{
 const journey=await read('components/community/department/DepartmentLeagueJourney.tsx'),lobby=await read('components/community/department/LeagueLobby.tsx')
 assert.match(journey,/<LeagueLobby sport=\{sport\} gap=\{gap\}/)
 assert.match(journey,/disabled=\{busy\|\|!team\.is_captain\|\|\(!demo&&team\.waiting\)\}/)
 assert.match(lobby,/args:\{team_id:own\.id,gap,waiting\}/)
 assert.doesNotMatch(lobby,/args:\{team_id:own\.id,gap:own\.gap,waiting\}/)
})
test('pending applicants browse the public lobby without claiming accepted team context',async()=>{
 const lobby=await read('components/community/department/LeagueLobby.tsx')
 assert.match(lobby,/viewerAccepted=!!own\?\.players\.some\(player=>player\.is_me&&player\.status==='accepted'\)/)
 assert.match(lobby,/acceptedTeamId=viewerAccepted\?own\?\.id\?\?null:null/)
 assert.match(lobby,/acceptedTeamId\?\{team_id:acceptedTeamId\}:\{\}/)
 assert.doesNotMatch(lobby,/own\?\.is_mine\?\{team_id:own\.id\}/)
})
test('opening an explicitly selected match or result never reuses another current team',async()=>{
 const source=await read('components/community/department/DepartmentLeagueJourney.tsx')
 const transition=source.split('\n').find(line=>line.trim().startsWith('function go('))
 const script=ts.transpileModule(transition,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 const ids=[],stages=[]
 const go=new Function('selected','setSelectedId','setNotice','setStage',script+';return go')({id:'old-own-team'},id=>ids.push(id),()=>{},stage=>stages.push(stage))
 go('match','accepted-match');go('result','completed-match');go('report')
 assert.deepEqual(ids,['accepted-match','completed-match','old-own-team'])
 assert.deepEqual(stages,['match','result','report'])
 assert.match(source,/go\(c\.status==='completed'\?'result':'match',c\.id\)/)
 assert.match(source,/onPaired=\{id=>\{if\(id\)\{activeDetail\.current=id;setSelectedId\(id\);if\(!demo\)void load\(\)\}setNotice\(''\);setStage\('match'\)\}\}/)
})
