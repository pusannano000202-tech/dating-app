import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import React from 'react'
import ts from 'typescript'
import * as contract from '../../lib/meetups/candidate-board-contract.ts'
import * as view from '../../lib/meetups/candidate-board-view.ts'
import {createDemoBoard,applyDemoAction,demoIncoming} from '../../lib/meetups/candidate-board-demo.ts'

const require=createRequire(import.meta.url)
const source=ts.transpileModule(readFileSync(new URL('../../components/meetups/CandidateBoard.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)]
const text=tree=>typeof tree==='string'||typeof tree==='number'?String(tree):!tree||typeof tree!=='object'?'':(Array.isArray(tree)?tree:[tree.props?.children]).map(text).join(' ')
const component=(tree,name)=>nodes(tree).find(node=>node.type?.name===name)
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&text(node).includes(label))

// The actual component runs with deterministic hooks. This is interaction and
// rendered-content coverage, not a browser, network or real payment test.
function harness({scope={kind:'league',key:'lol'},registered=true,incoming=false,filter='all',failed=false,live=false,demo=false,account='authenticated',href,membership={status:'none'}}={}){
 let board=createDemoBoard(scope)
 if(registered)board=applyDemoAction(board,'register',{positions:scope.key==='lol'?['mid','support']:['defender','forward'],tier:scope.key==='lol'?'gold':'intermediate',intro:'같이 즐겁게 경기해요',availability:'수요일 저녁',consent:true,expected_revision:null})
 if(incoming)board=demoIncoming(board)
 const calls=[],queries=[],slots=[],pending=[],popstate=new Set(),history=[href??`https://quantum.test/meetups/candidates?kind=${scope.kind}&key=${scope.key}`]
 let index=0,dirty=false,historyIndex=0,currentAccount=account
 const hooks={...React,useState(initial){const slot=index++;if(!(slot in slots))slots[slot]=typeof initial==='function'?initial():initial;return[slots[slot],next=>{const value=typeof next==='function'?next(slots[slot]):next;if(!Object.is(value,slots[slot])){slots[slot]=value;dirty=true}}]},useRef(initial){const slot=index++;if(!(slot in slots))slots[slot]={current:initial};return slots[slot]},useCallback(fn){return fn},useEffect(fn,deps){const slot=index++,saved=slots[slot];if(!saved||deps.some((value,i)=>!Object.is(value,saved.deps[i]))){slots[slot]={deps,cleanup:saved?.cleanup};pending.push(()=>{slots[slot].cleanup?.();slots[slot].cleanup=fn()})}}}
 const window={get location(){return new URL(history[historyIndex])},scrollTo(){},addEventListener(name,callback){if(name==='popstate')popstate.add(callback)},removeEventListener(name,callback){if(name==='popstate')popstate.delete(callback)},history:{state:null,pushState(_state,_unused,path){history.splice(++historyIndex);history.push(new URL(path,history[historyIndex-1]).href)},replaceState(_state,_unused,path){history[historyIndex]=new URL(path,history[historyIndex]).href}}}
 const deps={react:hooks,'react/jsx-runtime':require('react/jsx-runtime'),'next/image':{__esModule:true,default:'img'},'next/link':{__esModule:true,default:'a'},'lucide-react':require('lucide-react'),'@/lib/meetups/candidate-board-contract':contract,'@/lib/meetups/candidate-board-view':view,'@/lib/meetups/challenge-journey':{LEAGUE_SPORTS:{}},'@/lib/meetups/study-catalog':{getStudyCourse(){return null},getStudyCoursePhoto(){return{src:'/fixture'}}},'@/components/community/department/LeagueTier':{LeagueTierBadge:'tier-badge',LeagueTierPicker:'tier-picker'},'./useHostedResource':{useHostedResource(url){queries.push(url);return{data:failed?null:board,account:currentAccount,loading:false,busy:false,error:'',load(){}}}},'./CandidateDepositStep':{CandidateDepositStep(){},LiveCandidateDepositStep(){}},'./candidate-board.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}}
 deps['./useCandidateLeagueMembership']={useCandidateLeagueMembership:()=>({membership,retry(){calls.push(['membershipRetry'])}})}
 deps['@/components/community/department/DepartmentMascot']={__esModule:true,default:'department-mascot'}
 deps['@/components/community/department/LeagueMyTeams']={__esModule:true,default:'my-teams'}
 const module={exports:{}}
 new Function('require','module','exports','window',source)(name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]},module,module.exports,window)
 const props={scope,board,busy:false,error:'',filter,demo,leagueMembership:membership,onMembershipRetry(){calls.push(['membershipRetry'])},onFilter(value){calls.push(['filter',value])},onMore(){},onRefresh(){},async onAction(action,args){calls.push([action,args]);return null}}
 return{board,calls,queries,setAccount(next){currentAccount=next},get url(){return new URL(history[historyIndex])},back(){if(historyIndex>0){historyIndex--;for(const callback of popstate)callback()}},forward(){if(historyIndex<history.length-1){historyIndex++;for(const callback of popstate)callback()}},get tree(){let tree;for(let n=0;n===0||dirty||pending.length;n++){assert.ok(n<30,'hooks converge');index=0;dirty=false;tree=failed||live?module.exports.default({scope}):module.exports.CandidateBoardView(props);while(pending.length)pending.shift()()}return tree}}
}

test('public league tabs preserve the sport and return to explicit ranking or recruiting views',()=>{
 for(const key of ['lol','football','futsal']){
  const h=harness({scope:{kind:'league',key},registered:false})
  const tabs=component(h.tree,'DiscoveryTabs'),rendered=tabs.type(tabs.props)
  const links=nodes(rendered).filter(node=>node.type==='a')
  assert.deepEqual(links.map(link=>[text(link),link.props.href]),[['학과 순위',`/meetups/league?sport=${key}&view=league`],['모집 팀',`/meetups/league?sport=${key}&view=recruitment`]])
  assert.equal(nodes(rendered).find(node=>node.props?.['aria-current']==='page').props.children,'합류 대기판')
 }
})

test('demo league tabs stay in the supported multiteam preview and preserve the selected sport',()=>{
 for(const key of ['lol','football','futsal']){
  const h=harness({scope:{kind:'league',key},registered:false,demo:true})
  const tabs=component(h.tree,'DiscoveryTabs'),links=nodes(tabs.type(tabs.props)).filter(node=>node.type==='a')
  assert.deepEqual(links.map(link=>[text(link),link.props.href]),[['학과 순위',`/meetups/dev-flow?scene=league&design=multiteam&flow=league&sport=${key}`],['모집 팀',`/meetups/dev-flow?scene=league&design=multiteam&flow=recruitment&sport=${key}`]])
  assert.deepEqual(h.calls,[])
 }
})

test('waiting self summary keeps every selected position and edit reuses the same registration',()=>{
 const h=harness(),tree=h.tree,summary=nodes(tree).find(node=>node.props?.['aria-label']==='내 대기 등록')
 const own=component(summary,'CandidateCard'),rendered=own.type(own.props)
 assert.equal(own.props.compactMine,true)
 assert.ok(text(rendered).includes('내 대기 등록'));assert.ok(text(rendered).includes('공개 중'))
 for(const position of h.board.mine.positions)assert.ok(text(rendered).includes(view.positionLabel(position)))
 assert.equal(nodes(rendered).filter(node=>node.type==='img').length,0,'The contract contains no profile photo, so no avatar is fabricated')
 button(summary,'수정').props.onClick()
 const registration=component(h.tree,'Registration')
 assert.equal(registration.props.mine,h.board.mine)
 assert.deepEqual(h.calls,[],'Opening edit does not publish or mutate the registration')
})

test('received invitation shortcut uses current pending data and opens the existing inbox',()=>{
 const h=harness({incoming:true}),shortcut=button(h.tree,'받은 초대')
 assert.ok(shortcut)
 assert.ok(text(shortcut).includes(`${h.board.incoming.filter(invite=>['pending','joining'].includes(invite.status)).length} 개`))
 shortcut.props.onClick()
 assert.ok(text(h.tree).includes(h.board.incoming[0].room_title))
 assert.deepEqual(h.calls,[],'Looking at invitations never accepts one')
})

test('registration cancellation remains a separate revision-bound action with no implied refund',async()=>{
 const h=harness()
 button(h.tree,'대기 중단').props.onClick()
 assert.ok(text(h.tree).includes('자동 반환되지 않아요'))
 assert.ok(text(h.tree).includes('보증금 반환 신청'))
 assert.deepEqual(h.calls,[])
 await button(h.tree,'대기 등록 취소하기').props.onClick()
 assert.deepEqual(h.calls,[['cancel',{expected_revision:h.board.mine.revision}]])
})

test('count names the department and sport and remains separate from filtered and preview counts',()=>{
 const h=harness({filter:'mid'}),tree=h.tree
 assert.ok(text(tree).replace(/\s+/g,'').includes(`${h.board.department_label} · LoL 기준`.replace(/\s+/g,'')))
 assert.ok(text(tree).includes('내 등록 포함'))
 const total=nodes(tree).find(node=>node.props?.className==='leagueCount')
 assert.equal(text(total).replace(/\s+/g,'').trim(),`대기중${h.board.total_count}명`)
 assert.ok(h.board.total_count>nodes(tree).filter(node=>node.type?.name==='CandidateCard').length)
 const filters=nodes(tree).find(node=>node.props?.['aria-label']==='가능한 포지션 필터')
 button(filters,'서폿').props.onClick()
 assert.deepEqual(h.calls,[['filter','support']])
})

test('connection failure retains public navigation and never fabricates zero candidates',()=>{
 const tree=harness({failed:true}).tree
 assert.ok(component(tree,'DiscoveryTabs'))
 assert.ok(text(tree).includes('연결하지 못했어요'))
 assert.equal(nodes(tree).some(node=>node.props?.className==='leagueCount'),false)
 assert.ok(!text(tree).includes('대기 중 0명'))
})

test('registration, browser back and forward restore the same sport without any mutation',()=>{
 const scope={kind:'league',key:'football'},h=harness({scope,registered:false})
 button(h.tree,'나도 합류 대기 등록하기').props.onClick()
 assert.equal(h.url.searchParams.get('panel'),'register')
 assert.equal(h.url.searchParams.get('kind'),'league')
 assert.equal(h.url.searchParams.get('key'),'football')
 assert.ok(component(h.tree,'Registration'))
 h.back();assert.ok(component(h.tree,'DiscoveryTabs'));assert.equal(component(h.tree,'Registration'),undefined)
 h.forward();assert.ok(component(h.tree,'Registration'))
 const reload=harness({scope,registered:false,href:h.url.href})
 assert.ok(component(reload.tree,'Registration'))
 assert.deepEqual(h.calls,[])
})

test('inbox and exact invitation survive reload and back without accepting the invitation',()=>{
 const h=harness({incoming:true})
 button(h.tree,'받은 초대').props.onClick()
 assert.equal(h.url.searchParams.get('panel'),'inbox')
 button(h.tree,h.board.incoming[0].room_title).props.onClick()
 assert.equal(h.url.searchParams.get('invite'),h.board.incoming[0].id)
 const reload=harness({incoming:true,href:h.url.href})
 assert.equal(component(reload.tree,'InviteDetail').props.invite.id,h.board.incoming[0].id)
 h.back();assert.ok(text(h.tree).includes('함께하자는 초대가 왔어요'))
 h.forward();assert.equal(component(h.tree,'InviteDetail').props.invite.id,h.board.incoming[0].id)
 assert.deepEqual(h.calls,[])
})

test('private registration draft stays in memory and deposit reload recovers to registration',async()=>{
 const scope={kind:'league',key:'futsal'},h=harness({scope,registered:false})
 button(h.tree,'나도 합류 대기 등록하기').props.onClick()
 const draft={positions:['defender','forward'],tier:'intermediate',intro:'PRIVATE_INTRO',availability:'PRIVATE_TIME',consent:true,expected_revision:null}
 await component(h.tree,'Registration').props.onSubmit(draft)
 assert.ok(component(h.tree,'LiveCandidateDepositStep'))
 assert.equal(h.url.searchParams.get('panel'),'deposit')
 assert.deepEqual([...h.url.searchParams.keys()].sort(),['key','kind','panel'])
 h.back();assert.deepEqual(component(h.tree,'Registration').props.draft,draft)
 h.forward();assert.ok(component(h.tree,'LiveCandidateDepositStep'))
 const reload=harness({scope,registered:false,href:h.url.href})
 assert.ok(component(reload.tree,'Registration'))
 assert.equal(reload.url.searchParams.get('panel'),'register')
 assert.equal(component(reload.tree,'LiveCandidateDepositStep'),undefined)
 assert.deepEqual(h.calls,[])
})

test('candidate detail links preserve the exact candidate and return to the board',()=>{
 const h=harness(),other=nodes(h.tree).find(node=>node.type?.name==='CandidateCard'&&!node.props.row.is_me)
 other.props.onClick()
 assert.equal(h.url.searchParams.get('panel'),'detail')
 assert.equal(h.url.searchParams.get('candidate'),other.props.row.id)
 const reload=harness({href:h.url.href})
 assert.equal(component(reload.tree,'CandidateDetail').props.candidate.id,other.props.row.id)
 component(h.tree,'Header').props.onBack()
 assert.equal(h.url.searchParams.has('candidate'),false)
 assert.equal(h.url.searchParams.has('panel'),false)
 assert.ok(component(h.tree,'DiscoveryTabs'))
})

test('later-page candidate details preserve the page cursor and position filter for a fresh read',()=>{
 const cursor='97000000-0000-4000-8000-000000000042'
 const h=harness({href:`https://quantum.test/meetups/candidates?kind=league&key=lol&filter=mid&cursor=${cursor}`})
 const other=nodes(h.tree).find(node=>node.type?.name==='CandidateCard'&&!node.props.row.is_me)
 other.props.onClick()
 assert.equal(h.url.searchParams.get('cursor'),cursor)
 assert.equal(h.url.searchParams.get('filter'),'mid')
 const live=harness({live:true,account:null,href:h.url.href})
 assert.equal(live.tree.props.filter,'mid')
 live.setAccount('authenticated')
 assert.equal(live.tree.props.filter,'mid')
 assert.equal(new URL(live.queries.at(-1),'https://quantum.test').searchParams.get('cursor'),cursor)
 live.tree.props.onFilter('support')
 assert.equal(live.url.searchParams.get('filter'),'support')
 assert.equal(live.url.searchParams.has('cursor'),false)
 assert.equal(live.tree.props.filter,'support')
 live.back()
 assert.equal(live.tree.props.filter,'mid')
 assert.equal(new URL(live.queries.at(-1),'https://quantum.test').searchParams.get('cursor'),cursor)
 live.setAccount('different-account')
 assert.equal(live.tree.props.filter,'all')
 assert.equal(live.url.searchParams.has('cursor'),false)
 assert.equal(live.url.searchParams.has('filter'),false)
})

test('sign-in return preserves the public panel and correct sport but excludes private and unknown query fields',()=>{
 const scope={kind:'league',key:'football'}
 const h=harness({scope,failed:true,account:null,href:'https://quantum.test/meetups/candidates?kind=league&key=football&panel=register&intro=PRIVATE&availability=PRIVATE_TIME'})
 const login=nodes(h.tree).find(node=>node.type==='a'&&node.props.href.startsWith('/login?'))
 const resume=new URL(new URL(login.props.href,'https://quantum.test').searchParams.get('returnTo'),'https://quantum.test')
 assert.equal(resume.searchParams.get('panel'),'register')
 assert.equal(resume.searchParams.get('key'),'football')
 assert.deepEqual([...resume.searchParams.keys()].sort(),['key','kind','panel'])
})

test('malformed candidate ids and missing invitation ids recover without exposing an action target',()=>{
 const detail=harness({href:'https://quantum.test/meetups/candidates?kind=league&key=lol&panel=detail&candidate=bad'})
 assert.ok(component(detail.tree,'DiscoveryTabs'))
 assert.equal(component(detail.tree,'CandidateDetail'),undefined)
 const invite=harness({href:'https://quantum.test/meetups/candidates?kind=league&key=lol&panel=invite&invite=bad'})
 assert.ok(text(invite.tree).includes('아직 받은 초대가 없어요'))
 assert.equal(component(invite.tree,'InviteDetail'),undefined)
 assert.deepEqual(invite.calls,[])
})

test('only the programmatically focused league heading hides its outline; interactive focus remains visible',()=>{
 const css=readFileSync(new URL('../../components/meetups/candidate-board.module.css',import.meta.url),'utf8')
 assert.match(css,/\.leaguePage h1\[tabindex="-1"\]:focus\{outline:none\}/)
 assert.match(css,/\.page button:focus-visible,\.page a:focus-visible/)
})

test('accepted league members retain registration access while showing the exact owned team count',()=>{
 const teams=[{id:'a',href:'/team-a'},{id:'b',href:'/team-b'}]
 const h=harness({registered:false,membership:{status:'member',teams}})
 h.board.candidates=[];h.board.total_count=0;h.board.filtered_count=0
 const tree=h.tree
 assert.match(text(tree).replace(/\s/g,''),/참여중인팀2개/)
 button(tree,'나도 합류 대기 등록하기').props.onClick();assert.ok(component(h.tree,'Registration'))
 assert.deepEqual(h.calls,[])
})
test('membership loading and failure never block independently authorized registration, and never invent a team count',()=>{
 for(const status of ['loading','unavailable'])for(const panel of ['board','register','deposit']){
  const h=harness({registered:false,membership:{status},href:`https://quantum.test/meetups/candidates?kind=league&key=lol&panel=${panel}`}),tree=h.tree
  if(panel==='board'){assert.ok(button(tree,'나도 합류 대기 등록하기'));assert.doesNotMatch(text(tree).replace(/\s/g,''),/참여중인팀0개/)}else assert.ok(component(tree,'Registration'))
  assert.equal(component(tree,'LiveCandidateDepositStep'),undefined)
  if(panel==='board'&&status==='loading')assert.match(text(tree),/참여 중인 팀 확인 중/)
  if(panel==='board'&&status==='unavailable'){assert.match(text(tree),/참여 중인 팀을 불러오지 못했어요/);button(tree,'다시 확인').props.onClick();assert.deepEqual(h.calls,[['membershipRetry']])}
 }
})
test('confirmed absence permits registration while non-league registration stays independent of league lookup',()=>{
 const none=harness({registered:false,membership:{status:'none'}})
 button(none.tree,'나도 합류 대기 등록하기').props.onClick();assert.ok(component(none.tree,'Registration'))
 const study=harness({scope:{kind:'study',key:'pnu:AN1600527'},registered:false,membership:{status:'unavailable'}})
 button(study.tree,'나도 합류 대기 등록하기').props.onClick();assert.ok(component(study.tree,'Registration'))
})
