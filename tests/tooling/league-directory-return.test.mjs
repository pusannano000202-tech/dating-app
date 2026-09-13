import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname,resolve} from 'node:path'
import test from 'node:test'
import React from 'react'
import ts from 'typescript'

const root=resolve(import.meta.dirname,'../..'),nodeRequire=createRequire(import.meta.url)
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)]
const text=tree=>typeof tree==='string'||typeof tree==='number'?String(tree):!tree||typeof tree!=='object'?'':(Array.isArray(tree)?tree:[tree.props?.children]).map(text).join(' ')
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&text(node).includes(label))
const cards=tree=>nodes(tree).filter(node=>node.type?.name==='LeagueRecruitmentTeamCard')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}

// Execute the actual component and contract parsers. Only React's scheduler,
// browser surfaces and HTTP responses are simulated; no source is rewritten.
function mount(options={},browser={}){
 const slots=[],cache=new Map(),frames=[];let cursor=0,dirty=true,tree,disposed=false,pending=[]
 let props={sport:'lol',demo:false,journey:{my_department:'기계공학과'},recruitment:{},reservations:[],onSelect(){},onCreate(){},onBack(){},browseState:{tab:'teams',search:'',loadedPages:1},...options}
 const changes=[],scrolls=[]
 props.onBrowseStateChange=view=>{changes.push(view);props={...props,browseState:view};dirty=true}
 const equal=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]))
 const hooks={...React,
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]={value:typeof initial==='function'?initial():initial};return[slots[index].value,next=>{slots[index].value=typeof next==='function'?next(slots[index].value):next;dirty=true}]},
  useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index]},
  useCallback(fn,deps){const index=cursor++;if(!slots[index]||!equal(slots[index].deps,deps))slots[index]={value:fn,deps};return slots[index].value},
  useEffect(fn,deps){const index=cursor++,prior=slots[index];if(!prior||!equal(prior.deps,deps)){slots[index]={deps,cleanup:prior?.cleanup};pending.push(()=>{slots[index].cleanup?.();slots[index].cleanup=fn()})}},
 }
 function load(path){
  if(cache.has(path))return cache.get(path)
  const module={exports:{}};cache.set(path,module.exports)
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
  const require=name=>{
   if(name==='react')return hooks
   if(name==='next/image')return{__esModule:true,default:'img'}
   if(name.endsWith('.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}
   if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?resolve(root,name.slice(2)):resolve(dirname(path),name);return load([base,base+'.ts',base+'.tsx'].find(candidate=>existsSync(candidate)))}
   return nodeRequire(name)
  }
  new Function('require','module','exports',code)(require,module,module.exports);cache.set(path,module.exports);return module.exports
 }
 const Component=load(resolve(root,'components/community/department/LeagueRecruitment.tsx')).default
 const priorWindow=global.window,priorFrame=global.requestAnimationFrame,priorCancel=global.cancelAnimationFrame
 global.window={scrollY:1400,scrollTo:value=>scrolls.push(value),setTimeout,clearTimeout,...browser}
 global.requestAnimationFrame=fn=>{frames.push(fn);return frames.length}
 global.cancelAnimationFrame=id=>{frames[id-1]=null}
 function render(){cursor=0;pending=[];dirty=false;tree=Component(props);const effects=pending;pending=[];effects.forEach(fn=>fn());return tree}
 render()
 return{
  get tree(){return tree},get view(){return props.browseState},changes,scrolls,
  setProps(next){props={...props,...next};dirty=true},
  async flush(){for(let i=0;i<12;i++){await tick();if(disposed)return;if(dirty)render();const scheduled=frames.splice(0);scheduled.forEach(fn=>fn?.());if(!dirty&&i>1)return}},
  dispose(){disposed=true;slots.forEach(slot=>slot?.cleanup?.());global.window=priorWindow;global.requestAnimationFrame=priorFrame;global.cancelAnimationFrame=priorCancel},
 }
}
const uuid=index=>`97000000-0000-4000-8000-${String(index).padStart(12,'0')}`
function team(index,name,sport='lol'){
 return{team_id:uuid(index),challenge_id:uuid(index+100),team_name:name,title:name,department:'기계공학과',sport,status:'recruiting',revision:0,capacity:sport==='football'?11:sport==='futsal'?6:5,accepted_count:1,empty_slots:[sport==='lol'?'jungle':'st'],reserved_slots:[],is_captain:false,my_status:'none',may_join:true,notice:null}
}
const page=(teams,next=null,sport='lol')=>({sport,my_department:'기계공학과',total_count:21,next_cursor:next,teams})
const ok=recruitment=>({ok:true,status:200,json:async()=>({recruitment})})

test('two-page search returns through fresh cursors and scrolls only after full restoration',async()=>{
 const originalFetch=global.fetch,requests=[];let second=deferred(),phase='browse',runner
 global.fetch=async url=>{requests.push(String(url));const cursor=new URL(url,'http://localhost').searchParams.get('cursor');if(!cursor)return ok(page([team(1,'첫 페이지 팀')],phase==='browse'?uuid(20):uuid(30)));if(phase==='restore')return second.promise;return ok(page([team(2,'찾던팀')]))}
 try{
  runner=mount();await runner.flush();button(runner.tree,'다음 목록 더 보기').props.onClick();await runner.flush()
  nodes(runner.tree).find(node=>node.type==='input').props.onChange({target:{value:'찾던팀'}});await runner.flush()
  assert.equal(cards(runner.tree).length,1);cards(runner.tree)[0].props.onSelect(uuid(102));await runner.flush()
  const saved=runner.view;assert.equal(saved.loadedPages,2);assert.equal(saved.scrollY,1400)
  assert.ok(!('teams'in saved)&&!('page'in saved),'only the page count, not private rows, leaves the component')
  runner.dispose();phase='restore';requests.length=0;runner=mount({browseState:saved});await runner.flush()
  assert.equal(requests.length,2);assert.match(requests[1],new RegExp('cursor='+uuid(30)))
  assert.equal(cards(runner.tree).length,0);assert.doesNotMatch(text(runner.tree),/검색에 맞는 팀이 없어요/);assert.equal(runner.scrolls.length,0)
  second.resolve(ok(page([team(2,'찾던팀 새 정보')])));await runner.flush()
  assert.equal(cards(runner.tree)[0].props.team.team_name,'찾던팀 새 정보');assert.equal(runner.view.loadedPages,2)
  assert.deepEqual(runner.scrolls,[{top:1400,behavior:'instant'}])
 }finally{runner?.dispose();global.fetch=originalFetch}
})

test('a denied restoration is an error, not an empty result or a partly restored private list',async()=>{
 const originalFetch=global.fetch;let runner
 global.fetch=async url=>new URL(url,'http://localhost').searchParams.has('cursor')?{ok:false,status:403,json:async()=>({error:'forbidden'})}:ok(page([team(1,'찾던팀 이전 권한')],uuid(20)))
 try{
  runner=mount({browseState:{tab:'teams',search:'찾던팀',loadedPages:2,scrollY:1400}});await runner.flush()
  assert.equal(cards(runner.tree).length,0);assert.ok(nodes(runner.tree).some(node=>node.props?.role==='alert'))
  assert.doesNotMatch(text(runner.tree),/검색에 맞는 팀이 없어요|아직 우리 과 모집팀/);assert.equal(runner.scrolls.length,0)
 }finally{runner?.dispose();global.fetch=originalFetch}
})

test('changing tabs cancels restoration and ignores its late second page',async()=>{
 const originalFetch=global.fetch,late=deferred(),requests=[];let runner
 global.fetch=async url=>{requests.push(String(url));const query=new URL(url,'http://localhost').searchParams;if(query.get('action')==='notices')return ok({sport:'lol',my_department:'기계공학과',total_count:0,next_cursor:null,notices:[]});return query.has('cursor')?late.promise:ok(page([team(1,'이전 탭 팀')],uuid(20)))}
 try{
  runner=mount({browseState:{tab:'teams',search:'',loadedPages:2,scrollY:1400}});await runner.flush()
  assert.equal(requests.length,2);button(runner.tree,'우리 과 모집 소식').props.onClick();await runner.flush()
  assert.equal(runner.view.loadedPages,1);assert.equal(runner.view.scrollY,0);assert.equal(runner.view.tab,'notices')
  late.resolve(ok(page([team(2,'늦은 팀')]))) ;await runner.flush()
  assert.equal(cards(runner.tree).length,0);assert.equal(runner.scrolls.length,0);assert.match(text(runner.tree),/아직 우리 과 학생 모집 소식/)
  assert.equal(requests.filter(url=>url.includes('action=notices')).length,1)
 }finally{runner?.dispose();global.fetch=originalFetch}
})

test('changing sport resets the restored depth and fences the previous sport response',async()=>{
 const originalFetch=global.fetch,late=deferred(),requests=[];let runner
 global.fetch=async url=>{requests.push(String(url));const query=new URL(url,'http://localhost').searchParams;if(query.get('sport')==='football')return ok(page([team(3,'축구 팀','football')],uuid(40),'football'));return query.has('cursor')?late.promise:ok(page([team(1,'게임 팀')],uuid(20)))}
 try{
  runner=mount({browseState:{tab:'teams',search:'',loadedPages:2,scrollY:1400}});await runner.flush()
  runner.setProps({sport:'football'});await runner.flush();late.resolve(ok(page([team(2,'늦은 게임 팀')])));await runner.flush()
  assert.equal(runner.view.loadedPages,1);assert.equal(runner.view.scrollY,0)
  assert.deepEqual(cards(runner.tree).map(node=>node.props.team.sport),['football'])
  assert.equal(requests.filter(url=>url.includes('sport=football')).length,1);assert.equal(runner.scrolls.length,0)
 }finally{runner?.dispose();global.fetch=originalFetch}
})

test('a shorter fresh directory stops at its new end instead of reusing an old cursor or rows',async()=>{
 const originalFetch=global.fetch,requests=[];let runner
 global.fetch=async url=>{requests.push(String(url));return ok(page([team(3,'현재 남은 팀')]))}
 try{
  runner=mount({browseState:{tab:'teams',search:'',loadedPages:3,scrollY:1400}});await runner.flush()
  assert.equal(requests.length,1);assert.equal(runner.view.loadedPages,1)
  assert.deepEqual(cards(runner.tree).map(node=>node.props.team.team_name),['현재 남은 팀'])
  assert.equal(button(runner.tree,'다음 목록 더 보기'),undefined);assert.equal(runner.scrolls.length,1)
 }finally{runner?.dispose();global.fetch=originalFetch}
})

test('losing permission while loading more clears earlier rows and retry reloads the remembered range',async()=>{
 const originalFetch=global.fetch,requests=[];let runner,denied=false
 global.fetch=async url=>{requests.push(String(url));const cursor=new URL(url,'http://localhost').searchParams.get('cursor');if(cursor&&denied)return{ok:false,status:401,json:async()=>({error:'unauthorized'})};return cursor?ok(page([team(2,'두 번째 팀')],uuid(30))):ok(page([team(1,'첫 번째 팀')],uuid(20)))}
 try{
  runner=mount();await runner.flush();button(runner.tree,'다음 목록 더 보기').props.onClick();await runner.flush()
  assert.equal(runner.view.loadedPages,2);denied=true;button(runner.tree,'다음 목록 더 보기').props.onClick();await runner.flush()
  assert.equal(cards(runner.tree).length,0);assert.ok(nodes(runner.tree).some(node=>node.props?.role==='alert'))
  assert.doesNotMatch(text(runner.tree),/아직 우리 과 모집팀/)
  denied=false;requests.length=0;button(runner.tree,'새로고침').props.onClick();await runner.flush()
  assert.equal(requests.length,2);assert.equal(cards(runner.tree).length,2);assert.equal(runner.view.loadedPages,2)
 }finally{runner?.dispose();global.fetch=originalFetch}
})

test('department changes abort the old request and never mix its cards with the new heading',async()=>{
 const originalFetch=global.fetch,late=deferred(),requests=[];let runner
 global.fetch=async(url,options)=>{requests.push({url:String(url),signal:options.signal});return requests.length===1?late.promise:ok({...page([{...team(2,'컴퓨터 팀'),department:'컴퓨터공학과'}]),my_department:'컴퓨터공학과'})}
 try{
  runner=mount({browseState:{tab:'teams',search:'',loadedPages:2,scrollY:1400}});await runner.flush()
  runner.setProps({journey:{my_department:'컴퓨터공학과'}});await runner.flush()
  assert.equal(requests.length,2);assert.equal(requests[0].signal.aborted,true)
  late.resolve(ok(page([team(1,'이전 학과 팀')])));await runner.flush()
  assert.deepEqual(cards(runner.tree).map(node=>node.props.team.department),['컴퓨터공학과'])
  assert.equal(runner.view.loadedPages,1);assert.equal(runner.scrolls.length,0)
 }finally{runner?.dispose();global.fetch=originalFetch}
})

test('the first response must belong to the current department before any rows become actionable',async()=>{
 const originalFetch=global.fetch;let runner
 global.fetch=async()=>ok(page([team(1,'다른 학과 팀')]))
 try{
  runner=mount({journey:{my_department:'컴퓨터공학과'}});await runner.flush()
  assert.equal(cards(runner.tree).length,0);assert.ok(nodes(runner.tree).some(node=>node.props?.role==='alert'))
  assert.doesNotMatch(text(runner.tree),/아직 우리 과 모집팀/)
 }finally{runner?.dispose();global.fetch=originalFetch}
})

test('a timeout while reading the JSON body becomes a retryable error rather than perpetual loading',async()=>{
 const originalFetch=global.fetch,timers=[];let runner
 global.fetch=async(_url,{signal})=>({ok:true,status:200,json:()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('AbortError')),{once:true}))})
 try{
  runner=mount({}, {setTimeout:(callback,delay)=>{timers.push({callback,delay});return timers.length},clearTimeout(){}});await runner.flush()
  assert.equal(timers[0].delay,12000);timers[0].callback();await runner.flush()
  assert.ok(nodes(runner.tree).some(node=>node.props?.role==='alert'));assert.equal(cards(runner.tree).length,0)
  assert.doesNotMatch(text(runner.tree),/우리 과 팀을 확인하고 있어요/);assert.equal(button(runner.tree,'새로고침').props.disabled,false)
  global.fetch=async()=>ok(page([team(1,'재연결한 팀')]))
  button(runner.tree,'새로고침').props.onClick();await runner.flush()
  assert.equal(cards(runner.tree)[0].props.team.team_name,'재연결한 팀')
 }finally{runner?.dispose();global.fetch=originalFetch}
})
