import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import ts from 'typescript'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(import.meta.url),cache=new Map(),t=key=>({'challenge.gold':'골드','challenge.emerald':'에메랄드','journey.approve':'승인','journey.emptySlot':'빈자리'}[key]??key)
const read=file=>readFileSync(path.join(root,file),'utf8')
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
function load(file){
 if(file.endsWith('.json'))return JSON.parse(readFileSync(file,'utf8'))
 if(cache.has(file))return cache.get(file).exports
 const module={exports:{}};cache.set(file,module)
 new Function('require','module','exports',compile(readFileSync(file,'utf8')))(specifier=>{
  if(specifier==='next/image')return{__esModule:true,default:({fill,priority,...props})=>React.createElement('img',props)}
  if(specifier==='@/components/i18n/QuantumLocaleProvider')return{useQuantumLocale:()=>({t,locale:'ko-KR'})}
  if(specifier.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}
  if(specifier.startsWith('@/')||specifier.startsWith('.')){const base=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(path.dirname(file),specifier);return load(path.extname(base)?base:existsSync(base+'.tsx')?base+'.tsx':base+'.ts')}
  return require(specifier)
 },module,module.exports)
 return module.exports
}
const statusPath=path.join(root,'components/community/department/LeagueRecruitmentStatus.tsx'),ui=existsSync(statusPath)?load(statusPath):{}
const demo=load(path.join(root,'lib/meetups/league-recruitment-demo.ts'))
const source=read('components/community/department/DepartmentLeagueJourney.tsx'),inviteSource=read('components/community/department/LeaguePositionInvites.tsx')
const player=(id,slot,status,is_me=false)=>({id,slot,status,is_me,alias:id,position:slot,tier:'gold',application_intro:{aspiration:'같이 즐겁게 경기하고 싶어요',strengths:'시야 확보를 잘해요'}})
const players=[player('captain','mid','accepted',true),player('a','jungle','requested'),player('b','jungle','requested'),player('left','top','accepted')]
const team={id:'team-a',department:'기계공학부',is_captain:true,is_mine:true,may_join:false,ready:false,waiting:false,gap:200,score:null,players}
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props))
function findNodes(node,predicate){if(!node||typeof node!=='object')return[];return[...(predicate(node)?[node]:[]),...React.Children.toArray(node.props?.children).flatMap(child=>findNodes(child,predicate))]}
function functionText(text,name){let result;const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)result=node.getText();ts.forEachChild(node,visit)};visit(ts.createSourceFile('ui.tsx',text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX));assert.ok(result,`${name} exists`);return result.replace(/^export /,'')}

test('compact recruitment status separates confirmed members, all pending requests and invited slots',()=>{
 assert.equal(typeof ui.leagueRecruitmentCounts,'function')
 assert.deepEqual(ui.leagueRecruitmentCounts(players,5,[{slot:'support'},{slot:'support'}]),{accepted:2,requested:2,invited:1,capacity:5,full:false})
 const html=render(ui.LeagueRecruitmentStatus,{team,capacity:5,pendingInvites:[{slot:'support'}],locked:false,onReview(){},onOpponent(){}})
 assert.match(html,/2\/5명 확정/);assert.match(html,/검토 대기/);assert.match(html,/초대 중/);assert.match(html,/신청 검토하기/)
 assert.doesNotMatch(html,/4\/5명 확정|자동 매칭/)
})

test('captain review shows every selected-slot applicant and prevents approval into occupied or full slots',()=>{
 assert.equal(typeof ui.LeagueRequestReview,'function')
 const props={sport:'lol',team,slot:'jungle',busy:false,onSelectAll(){},onClose(){},onDecide(){}}
 let tree;function Capture(){tree=ui.LeagueRequestReview(props);return tree}
 const html=render(Capture,{})
 assert.match(html,/같이 즐겁게 경기하고 싶어요/);assert.match(html,/시야 확보를 잘해요/);assert.match(html,/gold\.png/)
 const buttons=findNodes(tree,node=>node.type==='button')
 assert.equal(buttons.filter(button=>button.props['data-review-decision']==='approve').length,2)
 for(const blockedPlayers of [[...players,player('occupied','jungle','accepted')],[...players,player('p3','top','accepted'),player('p4','adc','accepted'),player('p5','support','accepted')]]){
  props.team={...team,players:blockedPlayers};render(Capture,{})
  assert.ok(findNodes(tree,node=>node.type==='button'&&node.props['data-review-decision']==='approve').every(button=>button.props.disabled))
  assert.ok(findNodes(tree,node=>node.type==='button'&&node.props['data-review-decision']==='reject').every(button=>!button.props.disabled))
 }
})

test('full teams prioritize manual opponent selection and an opened slot becomes recruitment again',()=>{
 assert.equal(typeof ui.LeagueRecruitmentStatus,'function')
 const fullPlayers=['top','jungle','mid','adc','support'].map((slot,i)=>player('p'+i,slot,'accepted',i===0)),props={team:{...team,players:fullPlayers},capacity:5,pendingInvites:[],locked:false,onReview(){},onOpponent(){}}
 const full=render(ui.LeagueRecruitmentStatus,props)
 assert.match(full,/5\/5명 확정/);assert.match(full,/상대 팀 고르기/);assert.doesNotMatch(full,/빈자리를 눌러 친구/)
 const reopened=render(ui.LeagueRecruitmentStatus,{...props,team:{...team,players:fullPlayers.slice(0,4)}})
 assert.match(reopened,/4\/5명 확정/);assert.match(reopened,/빈자리/);assert.doesNotMatch(reopened,/상대 팀 고르기/)
 const reserved=render(ui.LeagueRecruitmentStatus,{...props,team:{...team,players:fullPlayers.slice(0,4)},pendingInvites:[{slot:'support'}]})
 assert.doesNotMatch(reserved,/빈자리 1자리/);assert.match(reserved,/초대 중/)
})

test('a pending map slot resolves to captain review, never a friend invitation',()=>{
 const calls=[],select=new Function('team','locked','setSelectedSlot','setTier','setInviteSlot','setReviewOpen','openReview','leagueSlotState',compile(functionText(source,'selectRosterSlot'))+';return selectRosterSlot')(team,false,slot=>calls.push(['selected',slot]),()=>{},slot=>calls.push(['invite',slot]),()=>{},slot=>calls.push(['review',slot]),ui.leagueSlotState)
 select('jungle');assert.deepEqual(calls,[['selected','jungle'],['review','jungle']])
 calls.length=0;select('support');assert.deepEqual(calls,[['selected','support'],['invite','support']])
 const slot=ui.leagueSlotState(players,'jungle',[])
 assert.equal(slot.requests.length,2);assert.equal(slot.occupant,undefined)
})

test('after a decision, keep remaining requests visible or return to the status only after roster confirmation',()=>{
 assert.equal(typeof ui.leagueReviewNextStep,'function')
 assert.deepEqual(ui.leagueReviewNextStep(players,'a','jungle'),{state:'pending'})
 assert.deepEqual(ui.leagueReviewNextStep(players.filter(player=>player.id!=='a'),'a','jungle'),{state:'review',slot:'jungle'})
 assert.deepEqual(ui.leagueReviewNextStep([player('b','support','requested')],'a','jungle'),{state:'review',slot:null})
 assert.deepEqual(ui.leagueReviewNextStep([player('a','jungle','accepted')],'a','jungle'),{state:'status'})
 assert.deepEqual(ui.leagueReviewNextStep([],'a','jungle'),{state:'status'})
})

test('status return scrolls to the actual manual opponent CTA and respects reduced motion',()=>{
 assert.equal(typeof ui.focusLeagueRecruitmentStatus,'function')
 for(const reduceMotion of [true,false]){
  const calls=[],button={focus:options=>calls.push(['button focus',options])},section={scrollIntoView:options=>calls.push(['scroll',options]),querySelector:selector=>{assert.equal(selector,'[data-recruitment-action="opponent"]');return button},focus:()=>calls.push(['section focus'])}
  ui.focusLeagueRecruitmentStatus(section,reduceMotion)
  assert.deepEqual(calls,[['scroll',{block:'start',behavior:reduceMotion?'auto':'smooth'}],['button focus',{preventScroll:true}]])
 }
 const calls=[];ui.focusLeagueRecruitmentStatus({scrollIntoView:()=>{},querySelector:()=>null,focus:options=>calls.push(options)},true)
 assert.deepEqual(calls,[{preventScroll:true}])
 const full=['top','jungle','mid','adc','support'].map((slot,i)=>player('p'+i,slot,'accepted'))
 assert.match(render(ui.LeagueRecruitmentStatus,{team:{...team,players:full},capacity:5,pendingInvites:[],locked:false,onReview(){},onOpponent(){}}),/data-recruitment-action="opponent"/)
})

test('the actual post-decision effect closes an exhausted review but retains remaining applicants and cancels navigation-stale returns',()=>{
 let effectSource
 const visit=node=>{if(ts.isCallExpression(node)&&node.expression.getText()==='useEffect'&&node.arguments[0]?.getText().includes('if(!reviewDecision'))effectSource=node.arguments[0].getText();ts.forEachChild(node,visit)}
 visit(ts.createSourceFile('journey.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX));assert.ok(effectSource)
 const decision={challengeId:'challenge',teamId:team.id,playerId:'a'}
 function run({roster=players,busy=false,challengeId='challenge',stage='roster'}={}){
  const calls=[],record=key=>value=>calls.push([key,value])
  const effect=new Function('reviewDecision','busy','connection','stage','selected','team','locked','reviewSlot','leagueReviewNextStep','setReviewDecision','setReviewOpen','setReviewSlot','setStatusReturn',compile('const effect='+effectSource)+';return effect')(decision,busy,'ready',stage,{id:challengeId},{...team,players:roster},false,'jungle',ui.leagueReviewNextStep,record('decision'),record('open'),record('slot'),record('return'))
  effect();return calls
 }
 assert.deepEqual(run(),[]);assert.deepEqual(run({busy:true,roster:[]}),[])
 assert.deepEqual(run({roster:[]}),[['decision',null],['open',false],['slot',null],['return',{challengeId:'challenge',teamId:team.id}]])
 assert.deepEqual(run({roster:[player('b','support','requested')]}),[['decision',null],['open',true],['slot',null]])
 assert.deepEqual(run({roster:[],challengeId:'another-team'}),[['decision',null]])
 assert.deepEqual(run({roster:[],stage:'opponents'}),[['decision',null]])
})

test('the actual map distinguishes requested, accepted, invited and empty slots with accessible counts',()=>{
 const RosterMap=new Function('exports','require','useQuantumLocale','LEAGUE_SPORTS','leagueSlotState','styles','Image','LeagueTierBadge','Shirt','Plus',compile(functionText(source,'RosterMap'))+';return RosterMap')({},require,()=>({t}),load(path.join(root,'lib/meetups/challenge-journey.ts')).LEAGUE_SPORTS,ui.leagueSlotState,new Proxy({},{get:(_,key)=>String(key)}),({fill,priority,...props})=>React.createElement('img',props),load(path.join(root,'components/community/department/LeagueTier.tsx')).LeagueTierBadge,'i','i')
 const props={sport:'lol',players,selected:'jungle',onSelect(){},inviteMode:true,pendingInvites:[{slot:'support',alias:'초대 친구'}]}
 const html=render(RosterMap,props)
 assert.match(html,/data-slot-state="requested"[^>]*aria-label="JUNGLE · 검토 대기 2명"/)
 assert.match(html,/data-slot-state="accepted"/);assert.match(html,/data-slot-state="invited"/);assert.match(html,/data-slot-state="empty"/)
 assert.match(html,/초대 중 · 인원 확정 전/);assert.doesNotMatch(html,/aria-label="JUNGLE[^>]*친구 초대/)
 const filled=render(RosterMap,{...props,players:[...players,player('winner','jungle','accepted')]})
 assert.match(filled,/<em[^>]*>검토 2<\/em>/)
 const readOnly=render(RosterMap,{...props,readOnly:true})
 assert.doesNotMatch(readOnly,/<button/);assert.match(readOnly,/role="img"/)
})

test('demo captain can approve or reject the exact non-self applicant without touching another request',()=>{
 let sample=demo.makeLeagueRecruitmentDemo('lol'),challenge=sample.journey.challenges[1],id=challenge.id
 challenge.teams[0].players.push(player('a','jungle','requested'),player('b','support','requested'))
 sample=demo.advanceRecruitmentDemo(sample.journey,sample.recruitment,{type:'view_captain',challengeId:id})
 sample=demo.advanceRecruitmentDemo(sample.journey,sample.recruitment,{type:'approve',challengeId:id,rosterId:'b'})
 let roster=sample.journey.challenges.find(c=>c.id===id).teams[0].players
 assert.equal(roster.find(p=>p.id==='b').status,'accepted');assert.equal(roster.find(p=>p.id==='a').status,'requested')
 assert.throws(()=>demo.advanceRecruitmentDemo(sample.journey,sample.recruitment,{type:'approve',challengeId:id,rosterId:'b'}),/request|pending/)
 sample=demo.advanceRecruitmentDemo(sample.journey,sample.recruitment,{type:'reject',challengeId:id,rosterId:'a'})
 roster=sample.journey.challenges.find(c=>c.id===id).teams[0].players
 assert.equal(roster.some(p=>p.id==='a'),false);assert.equal(roster.find(p=>p.id==='b').status,'accepted')
})

test('leaving the demo captain role restores member ownership and allows a fresh application after rejection',()=>{
 let sample=demo.makeLeagueRecruitmentDemo('lol'),id=sample.journey.challenges[0].id
 sample.journey.challenges[0].teams[0].players.push(player('self','jungle','requested',true))
 sample.journey.challenges[0].teams[0].is_mine=true
 sample=demo.advanceRecruitmentDemo(sample.journey,sample.recruitment,{type:'view_captain',challengeId:id})
 sample=demo.advanceRecruitmentDemo(sample.journey,sample.recruitment,{type:'view_captain',challengeId:id})
 sample=demo.advanceRecruitmentDemo(sample.journey,sample.recruitment,{type:'reject',challengeId:id,rosterId:'self'})
 sample=demo.advanceRecruitmentDemo(sample.journey,sample.recruitment,{type:'view_member',challengeId:id})
 const restored=sample.journey.challenges[0].teams[0]
 assert.equal(restored.is_captain,false);assert.equal(restored.is_mine,false);assert.equal(restored.may_join,true)
})

test('notification entry validates sport, challenge, team and selected review slot without coercing arrays',async()=>{
 const module={exports:{}}
 new Function('require','module','exports',compile(read('app/community/department/page.tsx')))(specifier=>{
  if(specifier.includes('DepartmentLeagueJourney'))return{__esModule:true,default:'journey'}
  if(specifier.includes('CommunityComingSoon'))return{__esModule:true,default:'coming-soon'}
  if(specifier==='@/lib/community-feature')return{isCommunityFeatureEnabled:()=>true}
  if(specifier==='@/lib/meetups/challenge-journey')return load(path.join(root,'lib/meetups/challenge-journey.ts'))
  if(specifier==='@/lib/meetups/league-navigation')return load(path.join(root,'lib/meetups/league-navigation.ts'))
  return require(specifier)
 },module,module.exports)
 const id='90000000-0000-4000-8000-000000000001',teamId='90000000-0000-4000-8000-000000000002',route=module.exports.default
 const valid=await route({searchParams:Promise.resolve({sport:'lol',challenge:id,team:teamId,panel:'applications',slot:'jungle'})})
 assert.equal(valid.props.initialChallengeId,id);assert.equal(valid.props.initialTeamId,teamId);assert.equal(valid.props.initialReview,true);assert.equal(valid.props.initialReviewSlot,'jungle')
 for(const invalid of [{sport:['lol']},{challenge:[id]},{team:'not-a-team'},{panel:['applications']}]){
  const result=await route({searchParams:Promise.resolve({sport:'lol',challenge:id,team:teamId,panel:'applications',...invalid})})
  assert.equal(result.props.initialReview,false)
 }
 const invalidSlot=await route({searchParams:Promise.resolve({sport:'lol',challenge:id,team:teamId,panel:'applications',slot:'st'})})
 assert.equal(invalidSlot.props.initialReviewSlot,undefined)
})

test('an exact notification team never falls back to a different own team in the same challenge',()=>{
 const declarations=source.split('\n').filter(line=>/^ const (exactTeam|team|targetTeamMissing|ready)=/.test(line)).join('\n')
 const select=new Function('targetTeamId','initialChallengeId','selected','data','connection',compile(declarations)+';return {team,ready}')
 const other={...team,id:'other',is_mine:true},wanted={...team,id:'wanted',is_mine:false},selected={id:'challenge',teams:[other,wanted]}
 assert.equal(select('wanted','challenge',selected,{my_department:team.department},'ready').team.id,'wanted')
 assert.deepEqual(select('missing','challenge',selected,{my_department:team.department},'ready'),{team:null,ready:false})
 assert.equal(select('wanted','challenge',null,null,'error').ready,false)
})

test('approval uses the clicked roster, refreshes both views and rejects simultaneous repeat clicks',async()=>{
 const calls=[],pending={current:false};let release
 const command=()=>{calls.push('write');return new Promise(resolve=>{release=resolve})}
 const operation=new Function('operationMutation','busy','connection','setBusy','setNotice','recruitmentError',compile(functionText(source,'operation'))+';return operation')(pending,false,'ready',()=>{},()=>{},String)
 const decide=new Function('selected','team','sport','locked','demo','operation','simulateRecruitment','challengeCommand','leagueRecruitmentCommand','crypto','load','invites','setNotice','setReviewDecision',compile(functionText(source,'decideRequest'))+';return decideRequest')({id:'challenge',revision:4},team,'lol',false,false,operation,()=>{throw Error('live uses no demo')},(suffix)=>{calls.push(suffix);return command()},()=>{throw Error('approve uses existing roster route')},{randomUUID:()=>''},()=>calls.push('journey refresh'),{refresh:()=>calls.push('invite refresh')},message=>calls.push(message),value=>calls.push(['review decision',value]))
 const first=decide(players[1],true),second=decide(players[1],true)
 assert.equal(calls.filter(call=>call==='write').length,1);assert.ok(calls.includes('/roster/a/accept'))
 release();await Promise.all([first,second])
 assert.ok(calls.includes('journey refresh'));assert.ok(calls.includes('invite refresh'));assert.equal(pending.current,false)
 assert.ok(calls.some(call=>Array.isArray(call)&&call[0]==='review decision'&&call[1].playerId==='a'&&call[1].teamId===team.id))
 await decide({...players[1],status:'accepted'},true)
 assert.equal(calls.filter(call=>call==='write').length,1)
})

test('a requested member without invite context gets journey polling and immediate focus refresh',()=>{
 const tree=ts.createSourceFile('invites.tsx',inviteSource,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);let effectSource
 const visit=node=>{if(ts.isCallExpression(node)&&node.expression.getText()==='useEffect'&&node.arguments[0]?.getText().includes('setInterval'))effectSource=node.arguments[0].getText();ts.forEachChild(node,visit)};visit(tree)
 const events={},removed=[],loads=[],refreshes=[],intervals=[],document={visibilityState:'visible',addEventListener:(name,fn)=>events['document:'+name]=fn,removeEventListener:(name,fn)=>removed.push(['document:'+name,fn])},window={setInterval:(fn,ms)=>{intervals.push({fn,ms});return 4},clearInterval:id=>removed.push(['timer',id]),addEventListener:(name,fn)=>events[name]=fn,removeEventListener:(name,fn)=>removed.push([name,fn])}
 const effect=new Function('demo','sport','challengeId','setLive','setLoading','setBusy','mutation','pending','load','onJourneyRefresh','window','document','invalidate',compile('const effect='+effectSource)+';return effect')(false,'lol',null,()=>{},()=>{},()=>{},{current:false},{current:null},()=>loads.push(true),()=>refreshes.push(true),window,document,()=>{})
 const cleanup=effect();assert.equal(intervals[0].ms,10000);intervals[0].fn();assert.equal(refreshes.length,1)
 assert.equal(typeof events.focus,'function');events.focus();assert.equal(refreshes.length,2)
 document.visibilityState='hidden';intervals[0].fn();assert.equal(refreshes.length,2)
 cleanup();assert.ok(removed.some(([name])=>name==='focus'));assert.ok(removed.some(([name,id])=>name==='timer'&&id===4))
})
