import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const read=file=>readFile(new URL('../../'+file,import.meta.url),'utf8')
const journey=await read('components/community/department/DepartmentLeagueJourney.tsx'),recruitment=await read('components/community/department/LeagueRecruitment.tsx')
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
function declaration(source,name){return ts.createSourceFile('ui.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX).statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText().replace(/^export /,'')}
function journeyLoader(readDetail){
 const lines=journey.split('\n'),start=lines.findIndex(line=>line.includes('const load=useCallback(async')),end=lines.findIndex((line,index)=>index>start&&line.includes('},[sport,demo])'))
 const expression=lines.slice(start,end+1).join('\n').trim().replace('const load=useCallback(','const load=').replace(/,\[sport,demo\]\)$/,'')
 const active={current:'outside-first-50'},generation={current:0},events={data:[],details:[],connection:[]},overview={sport:'lol',challenges:[{id:'another-own-team'}]}
 const load=new Function('sport','demo','setConnection','detailGeneration','activeDetail','parseJourneyState','readResponse','fetch','endpoint','readLeagueRecruitmentDetail','setLiveDetail','setData',compile(expression)+';return load')('lol',false,value=>events.connection.push(value),generation,active,value=>value,async()=>overview,async()=>({}),'/journey',readDetail,value=>events.details.push(value),value=>events.data.push(value))
 return{load,active,events}
}
test('a team outside the first fifty is loaded and refreshed by exact ID, never by overview fallback',async()=>{
 let revision=1;const calls=[]
 const run=journeyLoader(async(sport,id)=>{calls.push({sport,id});return{challenge:{id,revision}}})
 await run.load();revision=2;await run.load(undefined,true)
 assert.deepEqual(calls,[{sport:'lol',id:'outside-first-50'},{sport:'lol',id:'outside-first-50'}])
 assert.equal(run.events.data.at(-1).challenges[0].id,'outside-first-50')
 assert.equal(run.events.data.at(-1).challenges[0].revision,2)
 assert.equal(run.events.connection.at(-1),'ready')
})
test('detail denial clears actionable state and a stale response cannot replace a newly selected team',async()=>{
 const denied=journeyLoader(async()=>{throw new Error('forbidden')})
 await denied.load();assert.equal(denied.events.data.at(-1),null);assert.equal(denied.events.details.at(-1),null);assert.equal(denied.events.connection.at(-1),'error')
 let resolveOld;const delayed=new Promise(resolve=>{resolveOld=resolve})
 const run=journeyLoader(async(sport,id)=>id==='outside-first-50'?delayed:{challenge:{id}})
 const first=run.load();await new Promise(resolve=>setTimeout(resolve,0));run.active.current='selected-second';await run.load();resolveOld({challenge:{id:'outside-first-50'}});await first
 assert.equal(run.events.data.at(-1).challenges[0].id,'selected-second')
})
test('detail transport rejects mismatched or denied responses before returning a map',async()=>{
 const script=compile(declaration(recruitment,'readLeagueRecruitmentDetail'))
 for(const [ok,id]of [[true,'different-team'],[false,'exact-team']]){
  const urls=[],readDetail=new Function('fetch','endpoint','parseLeagueRecruitmentDetail',script+';return readLeagueRecruitmentDetail')(async url=>{urls.push(url);return{ok,json:async()=>({recruitment:{sport:'lol',challenge:{id}}})}},'/recruitment',value=>value)
  await assert.rejects(readDetail('lol','exact-team'))
  assert.match(urls[0],/action=detail&sport=lol&challenge_id=exact-team/)
 }
})
test('self-application and notices reuse the team map with consent and pending-slot guards',()=>{
 assert.match(journey,/onJoin=\{\(\)=>go\('recruitment'\)\}/)
 assert.match(journey,/selected&&me\?\.status!=='accepted'&&!team\?\.may_join/)
 assert.match(journey,/detail\?\.reserved_slots\.includes\(selectedSlot\)&&me\?\.slot!==selectedSlot/)
 assert.match(journey,/noticeClosed=fromNotice&&isRecruitmentNoticeClosed\(detail\?\.notice\)/)
 assert.match(journey,/참가 신청 취소/);assert.match(journey,/예시 주장으로 신청 검토/)
 assert.match(journey,/challengeCommand\('\/roster',\{team_id:team\.id\},'DELETE'\)/)
 assert.match(journey,/leagueRecruitmentCommand\('reject',\{sport,team_id:team\.id,roster_id:player\.id,expected_revision:selected\.revision\}/)
 assert.match(recruitment,/onSelect\(notice\.challenge_id,true/)
 assert.match(recruitment,/expected_revision:detail\.challenge\.revision/)
 assert.match(recruitment,/if\(demo\)onDemo/)
 assert.doesNotMatch(recruitment,/service_role|create.*[Rr]oom|\/chat.*POST/)
})

test('accepting a match switches detail refresh to the server returned canonical challenge ID',()=>{
 const transition=journey.match(/onPaired=\{(id=>\{[^\n]*?\})\} onRefresh=/)?.[1]
 assert.ok(transition)
 const active={current:'old-receiver-challenge'},ids=[],loads=[],stages=[]
 const onPaired=new Function('activeDetail','setSelectedId','demo','load','setNotice','setStage',compile('const onPaired='+transition)+';return onPaired')(active,id=>ids.push(id),false,()=>{loads.push(active.current)},()=>{},stage=>stages.push(stage))
 onPaired('server-paired-challenge')
 assert.equal(active.current,'server-paired-challenge');assert.deepEqual(ids,['server-paired-challenge']);assert.deepEqual(loads,['server-paired-challenge']);assert.deepEqual(stages,['match'])
})

test('a notice that expires while its map is open cannot submit, while ordinary team application remains allowed',async()=>{
 const tree=ts.createSourceFile('journey.tsx',journey,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX)
 let saveSource;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='saveSlot')saveSource=node.getText();ts.forEachChild(node,visit)}visit(tree)
 const helperNode=ts.createSourceFile('recruitment.tsx',recruitment,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX).statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='isRecruitmentNoticeClosed')
 const closed=helperNode?new Function(compile(helperNode.getText().replace(/^export /,''))+';return isRecruitmentNoticeClosed')():()=>false
 for(const origin of [true,false]){
  const requests=[],refreshes=[],context={sport:'lol',selectedSlot:'jungle',tier:'gold',noticeClosed:false,detail:{reserved_slots:[],notice:{status:'open',expires_at:new Date(Date.now()-1000).toISOString()}},fromNotice:origin,selected:{id:'team-challenge',revision:1},team:{may_join:true},me:undefined,demo:true,data:{},busy:false,slotMutation:{current:false},detailGeneration:{current:0},activeDetail:{current:'team-challenge'},isRecruitmentNoticeClosed:closed,setNotice:()=>{},setNoticeTick:()=>{},setBusy:()=>{},refresh:async()=>refreshes.push(true),simulate:action=>requests.push(action)}
  const save=new Function('applicationIntro',...Object.keys(context),compile(saveSource)+';return saveSlot')({aspiration:'',strengths:''},...Object.values(context))
  await save({preventDefault(){}})
  assert.equal(requests.length,origin?0:1)
 }
})

test('notice application rechecks server closure and discards failed or navigation-stale preflight without joining',async()=>{
 const tree=ts.createSourceFile('journey.tsx',journey,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX)
 let saveSource;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='saveSlot')saveSource=node.getText();ts.forEachChild(node,visit)}visit(tree)
 const closed=new Function(compile(declaration(recruitment,'isRecruitmentNoticeClosed'))+';return isRecruitmentNoticeClosed')()
 for(const outcome of ['closed','expired-during-read','read-failure','navigated']){
  const requests=[],details=[],notices=[],busy=[],active={current:'team-challenge'},context={sport:'lol',selectedSlot:'jungle',tier:'gold',detail:{reserved_slots:[],notice:{status:'open',expires_at:new Date(Date.now()+60000).toISOString()}},fromNotice:true,selected:{id:'team-challenge',revision:1},team:{id:'team',may_join:true},me:undefined,demo:false,data:{},busy:false,slotMutation:{current:false},detailGeneration:{current:0},activeDetail:active,isRecruitmentNoticeClosed:closed,setNotice:value=>notices.push(value),setNoticeTick:()=>{},setBusy:value=>busy.push(value),refresh:async()=>{},readLeagueRecruitmentDetail:async()=>{if(outcome==='read-failure')throw new Error('forbidden');if(outcome==='navigated')active.current='new-team';return{challenge:{id:'team-challenge',revision:1},notice:{status:outcome==='closed'?'closed':'open',expires_at:new Date(Date.now()+(outcome==='expired-during-read'?-1000:60000)).toISOString()}}},setLiveDetail:value=>details.push(value),setData:()=>{},journeyCommand:async(...args)=>requests.push(args),recruitmentError:()=> '다시 확인'}
  const save=new Function('applicationIntro',...Object.keys(context),compile(saveSource)+';return saveSlot')({aspiration:'',strengths:''},...Object.values(context))
  await save({preventDefault(){}})
  assert.equal(requests.length,0,outcome);assert.deepEqual(busy,[true,false]);assert.equal(context.slotMutation.current,false)
  if(outcome==='closed'){assert.equal(details[0].notice.status,'closed');assert.match(notices[0],/마감/)}
  if(outcome==='navigated')assert.equal(details.length,0)
 }
})

test('notice deadline schedules one refresh and UI update, and cancels its timer on leaving',()=>{
 const line=journey.split('\n').find(line=>line.includes('useEffect(()=>{if(!noticeDeadline)return;'))
 const script=compile(line.trim().replace('useEffect(','const effect=').replace(/,\[noticeDeadline,noticeTick,demo,refresh\]\)$/,''))
 const timers=[],cleared=[],ticks=[],refreshes=[]
 const make=deadline=>new Function('noticeDeadline','window','setNoticeTick','demo','refresh',script+';return effect')(deadline,{setTimeout:(callback,delay)=>{timers.push({callback,delay});return 7},clearTimeout:id=>cleared.push(id)},update=>ticks.push(update(0)),false,()=>refreshes.push(true))
 assert.equal(make(null)(),undefined);assert.equal(timers.length,0)
 const cleanup=make(new Date(Date.now()+10000).toISOString())()
 assert.equal(timers.length,1);assert.ok(timers[0].delay>0&&timers[0].delay<=10025)
 timers[0].callback();assert.deepEqual(ticks,[1]);assert.deepEqual(refreshes,[true]);cleanup();assert.deepEqual(cleared,[7])
})
