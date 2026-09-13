import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import {LEAGUE_SPORTS,sportTiers} from '../../lib/meetups/challenge-journey.ts'
const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8')
test('focused league uses real full images with interactive occupant slots and every declared skill tier',async()=>{
 const source=await read('components/community/department/DepartmentLeagueJourney.tsx'),css=await read('components/community/department/department-league-journey.module.css')
 const tree=ts.createSourceFile('journey.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX),journey=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='DepartmentLeagueJourney')
 assert.ok(journey?.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))
 assert.ok(ts.isObjectBindingPattern(journey.parameters[0].name))
 const props=journey.parameters[0].name.elements.map(element=>element.name.getText(tree))
 for(const name of ['demo','initialSport','initialChallengeId','initialTeamId','initialReview'])assert.ok(props.includes(name),name)
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
 const ids=[],stages=[],routes=[]
 const go=new Function('selected','setSelectedId','setNotice','setStage','demo','coordinationOnly','router',script+';return go')({id:'old-own-team'},id=>ids.push(id),()=>{},stage=>stages.push(stage),false,false,{push:url=>routes.push(url)})
 go('match','accepted-match');go('result','completed-match');go('report')
 assert.deepEqual(routes,['/chat/rooms/league_match/accepted-match'])
 assert.deepEqual(ids,['completed-match','old-own-team'])
 assert.deepEqual(stages,['result','report'])
 assert.match(source,/go\(c\.status==='completed'\?'result':'match',c\.id\)/)
 assert.match(source,/onPaired=\{id=>\{if\(id\)\{activeDetail\.current=id;setSelectedId\(id\);if\(!demo\)void load\(\)\}setNotice\(''\);go\('match',id\)\}\}/)
})
