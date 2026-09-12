import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import React from 'react'
import ts from 'typescript'
import * as mentoringContract from '../../lib/mentoring/hosted-contract.ts'
import * as applicationView from '../../lib/meetups/application-view.ts'

const require=createRequire(import.meta.url)
const owner='97000000-0000-4000-8000-000000000001',other='97000000-0000-4000-8000-000000000002'
const roomA='97000000-0000-4000-8000-000000000011',roomB='97000000-0000-4000-8000-000000000012'
const source=path=>ts.transpileModule(readFileSync(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
const detail=(account=owner,id=roomA)=>({data:{owner_id:account,room:{id,title:'우리 과 멘토링',topic:'campus',side_size:2,mentor_count:1,mentee_count:0,member_count:1,status:'open',joined:true,is_host:true,revision:0,expires_at:'2026-09-26T00:00:00Z',department_label:'기계공학과',my_role:'mentor',members:[{id:account,role:'mentor',label:'멘토 1',mine:true,is_host:true}],messages:[],meeting:null,report_targets:[]}}})

/** Same deterministic hook/effect harness as application-management-ui.test.mjs.
 * Executes the real hook/component source; network, browser events and hook
 * scheduling are controlled. This is not a browser/React DOM rendering proof. */
function harness({component=false}={}){
 let index=0,dirty=true,tree,account=owner,url='/resource/a',room=roomA,timerId=0,disposed=false
 const slots=[],effects=new Map(),intervals=new Map(),timeouts=new Map(),requests=[],routes=[]
 const listeners={window:new Map(),document:new Map()}
 const hooks={...React,
  useState(initial){const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true}}]},
  useRef(initial){const i=index++;if(!slots[i])slots[i]={value:{current:initial}};return slots[i].value},
  useCallback(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn},
  useEffect(fn,deps){const i=index++;if(!slots[i])slots[i]={deps:undefined};if(!same(slots[i].deps,deps))effects.set(i,{fn,deps})},
 }
 const eventTarget=map=>({addEventListener(name,fn){if(!map.has(name))map.set(name,new Set());map.get(name).add(fn)},removeEventListener(name,fn){map.get(name)?.delete(fn)}})
 const window=eventTarget(listeners.window),document={visibilityState:'visible',...eventTarget(listeners.document)}
 const setInterval=fn=>{intervals.set(++timerId,fn);return timerId},clearInterval=id=>intervals.delete(id)
 const setTimeout=fn=>{timeouts.set(++timerId,fn);return timerId},clearTimeout=id=>timeouts.delete(id)
 const abortSignal={timeout(){const controller=new AbortController();setTimeout(()=>controller.abort());return controller.signal}}
 const fetch=(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,reply(body,status=200){resolve({ok:status>=200&&status<300,json:async()=>body})},fail(error=Error('network unavailable')){reject(error)}}))
 const dependencies={react:hooks,'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{__esModule:true,default:'a'},'next/navigation':{useRouter:()=>({push:path=>routes.push(path)}),useSearchParams:()=>new URLSearchParams()},'lucide-react':require('lucide-react'),
  '@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>account},'@/lib/mentoring/hosted-contract':mentoringContract,'@/lib/meetups/application-view':applicationView,'@/lib/chat/useSocialChatRead':{useSocialChatRead(){}},
  './HostedRoomCards':{HostedConnection:()=>null},'./HostedMentoringLobby':{MENTORING_ROLES:{mentor:'경험 나눔',mentee:'도움 구함'},MENTORING_TOPICS:{courses:'공부',career:'진로',campus:'학교생활'}},
  './MeetupApplications':{__esModule:true,default:()=>null},'./hosted-rooms.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})},
 }
 const evaluate=path=>{const module={exports:{}};new Function('require','module','exports','fetch','window','document','setInterval','clearInterval','setTimeout','clearTimeout','AbortSignal',source(path))(name=>{assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name]},module,module.exports,fetch,window,document,setInterval,clearInterval,setTimeout,clearTimeout,abortSignal);return module.exports}
 const resource=evaluate('components/meetups/useHostedResource.ts');dependencies['./useHostedResource']=resource
 const view=component?evaluate('components/meetups/HostedMentoringRoom.tsx').default:null
 const parse=(body,current)=>body?.owner_id===current?body:null
 function flush(){if(disposed)return;for(let n=0;dirty||effects.size;n++){assert.ok(n<30,'hooks converge');if(dirty){index=0;dirty=false;tree=component?view({id:room,chatOnly:true}):resource.useHostedResource(url,parse)}const pending=[...effects];effects.clear();for(const[i,{fn,deps}]of pending){slots[i].cleanup?.();slots[i].deps=deps;slots[i].cleanup=fn()}}}
 async function settle(){for(let i=0;i<18;i++){await Promise.resolve();flush()}}
 flush()
 return{requests,routes,settle,get value(){flush();return tree},setAccount(value){account=value;dirty=true;flush()},setUrl(value){url=value;dirty=true;flush()},setRoom(value){room=value;dirty=true;flush()},poll(){for(const fn of [...intervals.values()])fn()},focus(){for(const fn of listeners.window.get('focus')??[])fn()},dispose(){disposed=true;for(const s of slots)s?.cleanup?.();effects.clear();intervals.clear();timeouts.clear()}}
}
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)]
const text=tree=>typeof tree==='string'?tree:!tree||typeof tree!=='object'?'':(Array.isArray(tree)?tree:[tree.props?.children]).map(text).join(' ')
const findButton=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n).includes(label))
const input=(tree,label)=>nodes(tree).find(n=>n.type==='textarea'&&n.props['aria-label']===label)

test('restricted mentoring detail hides participant counts and chat but keeps report and leave controls',async()=>{
 const h=harness({component:true});try{
  const body=detail();Object.assign(body.data.room,{participation_restricted:true,joined:false,is_host:false,status:'closed',mentor_count:0,mentee_count:0,member_count:0,revision:0,members:[],messages:[]})
  h.requests[0].reply(body);await h.settle()
  assert.ok(findButton(h.value,'모임 나가기'))
  assert.ok(findButton(h.value,'신고'))
  assert.ok(!nodes(h.value).some(n=>n.props?.role==='log'))
  assert.ok(!text(h.value).includes('최대'))
  assert.ok(!text(h.value).includes('보증금 확인 → 참가 신청'))
  assert.ok(text(h.value).includes('참여 관리'))
 }finally{h.dispose()}
})

test('exact URL and account changes clear data and ignore late GET responses even if aborted transport resolves',async()=>{
 const h=harness();try{
  const initial=h.requests[0];h.setUrl('/resource/b');assert.equal(initial.options.signal.aborted,true)
  h.requests[1].reply({owner_id:owner,marker:'B'});await h.settle();initial.reply({owner_id:owner,marker:'late A'});await h.settle();assert.equal(h.value.data.marker,'B')
  h.setAccount(other);assert.equal(h.value.data,null);h.requests[2].reply({owner_id:owner,marker:'old account'});await h.settle();assert.equal(h.value.data,null);assert.ok(h.value.error)
  const reload=h.value.load();h.requests[3].reply({owner_id:other,marker:'current account'});await reload;await h.settle();assert.equal(h.value.data.marker,'current account')
 }finally{h.dispose()}
})
test('mutations send an account fence, suppress polling while pending and do not claim success on server failure',async()=>{
 const h=harness();try{
  h.requests[0].reply({owner_id:owner});await h.settle()
  const promise=h.value.mutate('/mutate',{value:1},v=>v?.success===true?v:null);assert.equal(h.requests[1].options.headers['X-Quantum-Owner'],owner)
  h.poll();h.focus();assert.equal(h.requests.length,2);assert.equal(h.value.busy,true)
  h.requests[1].reply({error:'room_closed'},409);assert.equal(await promise,null);await h.settle();assert.equal(h.value.data,null);assert.equal(h.value.error,'room_closed');assert.equal(h.value.busy,false)
 }finally{h.dispose()}
})
test('a late mutation cannot claim success after an account or resource change',async()=>{
 for(const change of[h=>h.setAccount(other),h=>h.setUrl('/resource/other')]){
  const h=harness();try{
   h.requests[0].reply({owner_id:owner});await h.settle();const promise=h.value.mutate('/mutate',{},v=>v)
   change(h);h.requests[1].reply({success:true});assert.equal(await promise,null);await h.settle();assert.equal(h.value.data,null)
  }finally{h.dispose()}
 }
})
test('unmount aborts both active GET and active mutation requests',async()=>{
 const get=harness();get.dispose();assert.equal(get.requests[0].options.signal.aborted,true)
 const h=harness();h.requests[0].reply({owner_id:owner});await h.settle()
 const promise=h.value.mutate('/mutate',{},v=>v);const request=h.requests[1];h.dispose()
 request.reply({success:true});assert.equal(await promise,null)
 assert.equal(request.options.signal.aborted,true,'Unmount must abort the mutation request, not just ignore its late result')
})
test('failed mutation that supersedes a background GET does not permanently disable future polling',async()=>{
 const h=harness();try{
  h.requests[0].reply({owner_id:owner});await h.settle();h.poll();const background=h.requests[1]
  const promise=h.value.mutate('/mutate',{},v=>v);assert.equal(background.options.signal.aborted,true)
  background.fail(new DOMException('Aborted','AbortError'));h.requests[2].reply({error:'unavailable'},503);await promise;await h.settle()
  const previous=h.requests.length;h.poll();assert.equal(h.requests.length,previous+1,'Polling must recover after the aborted GET and failed mutation settle')
 }finally{h.dispose()}
})
test('changing room during post-send refresh cannot clear a new room draft',async()=>{
 const h=harness({component:true});try{
  h.requests[0].reply(detail());await h.settle();input(h.value,'멘토링 메시지').props.onChange({target:{value:'첫 방 메시지'}})
  const composer=nodes(h.value).find(n=>n.type==='form'&&nodes(n).some(child=>child.type==='textarea'&&child.props['aria-label']==='멘토링 메시지'))
  composer.props.onSubmit({preventDefault(){}});h.requests[1].reply(detail());await h.settle()
  const refresh=h.requests[2];assert.ok(refresh,'Successful mutation starts an authoritative refresh')
  h.setRoom(roomB);h.requests[3].reply(detail(owner,roomB));await h.settle();input(h.value,'멘토링 메시지').props.onChange({target:{value:'새 방에서 쓰던 메시지'}})
  refresh.reply(detail());await h.settle();assert.equal(input(h.value,'멘토링 메시지').props.value,'새 방에서 쓰던 메시지','Old send completion must not mutate the new room composer')
 }finally{h.dispose()}
})
test('failed leave never navigates',async()=>{
 const h=harness({component:true});try{
  h.requests[0].reply(detail());await h.settle();findButton(h.value,'모임 나가기').props.onClick();findButton(h.value,'확인하고 나가기').props.onClick()
  h.requests[1].reply({error:'unavailable'},503);await h.settle();assert.deepEqual(h.routes,[]);assert.ok(!text(h.value).includes('신고를 접수하고 모임에서 나왔어요'))
 }finally{h.dispose()}
})
test('failed report does not display a received notice',async()=>{
 const h=harness({component:true});try{
  const data=detail();data.data.room.report_targets=[{id:other,label:'이전에 함께한 멘티'}]
  h.requests[0].reply(data);await h.settle();findButton(h.value,'신고').props.onClick()
  nodes(h.value).find(n=>n.type==='select').props.onChange({target:{value:other}})
  nodes(h.value).find(n=>n.type==='textarea'&&n.props.rows===3).props.onChange({target:{value:'신고 내용과 근거'}})
  const report=nodes(h.value).find(n=>n.type==='form'&&text(n).includes('신고하고 나가기'));assert.ok(report)
  const submitted=report.props.onSubmit({preventDefault(){}});h.requests[1].reply({error:'unavailable'},503);await submitted;await h.settle()
  assert.ok(!text(h.value).includes('신고를 접수하고 모임에서 나왔어요'));assert.deepEqual(h.routes,[])
 }finally{h.dispose()}
})
test('confirmed report-and-leave preserves a visible final receipt even when the refreshed room is no longer joined',async()=>{
 const h=harness({component:true});try{
  const data=detail();data.data.room.report_targets=[{id:other,label:'이전에 함께한 멘티'}]
  h.requests[0].reply(data);await h.settle();findButton(h.value,'신고').props.onClick()
  nodes(h.value).find(n=>n.type==='select').props.onChange({target:{value:other}})
  nodes(h.value).find(n=>n.type==='textarea'&&n.props.rows===3).props.onChange({target:{value:'신고 내용과 근거'}})
  const report=nodes(h.value).find(n=>n.type==='form'&&text(n).includes('신고하고 나가기'));assert.ok(report,'The final action explicitly includes leaving')
  const submitted=report.props.onSubmit({preventDefault(){}})
  assert.equal(JSON.parse(h.requests[1].options.body).action,'report')
  const left=detail();Object.assign(left.data.room,{joined:false,is_host:false,status:'closed',mentor_count:0,member_count:0,members:[],messages:[],report_targets:[{id:other,label:'이전에 함께한 멘티'}]})
  h.requests[1].reply(left);await h.settle();assert.ok(h.requests[2],'Report success is followed by current server state')
  h.requests[2].reply(left);await submitted;await h.settle()
  assert.ok(text(h.value).includes('신고를 접수하고 모임에서 나왔어요'),'The receipt remains visible outside the joined-only chat section')
  assert.ok(!nodes(h.value).some(n=>n.props?.role==='log'),'The departed member cannot retain a readable chat area')
 }finally{h.dispose()}
})
test('a past member can apply again to an open room without treating the old deposit as paid admission',async()=>{
 const h=harness({component:true});try{
  const data=detail();Object.assign(data.data.room,{joined:false,is_host:false,my_role:'mentee',members:[],messages:[]})
  h.requests[0].reply(data);await h.settle()
  const apply=nodes(h.value).find(n=>n.type==='a'&&text(n).includes('보증금 조건 보고 신청'))
  assert.ok(apply,'Historical my_role must not hide the new explicit application entry')
  assert.ok(apply.props.href.includes('/apply?role=mentee'))
 }finally{h.dispose()}
})
test('changing account during a mutation starts a fresh GET without waiting for the cancelled old transport',async()=>{
 const h=harness();try{
  h.requests[0].reply({owner_id:owner});await h.settle();const old=h.value.mutate('/mutate',{},v=>v)
  h.setAccount(other)
  assert.equal(h.requests[1].options.signal.aborted,true)
  assert.equal(h.requests.length,3,'The new scope must start its own GET immediately after cancelling the previous mutation')
  h.requests[2].reply({owner_id:other,marker:'new account'});await h.settle()
  h.requests[1].reply({success:true});assert.equal(await old,null);await h.settle()
  assert.equal(h.value.data.marker,'new account')
  h.poll();assert.equal(h.requests.length,4,'The previous mutation must not leave the current scope polling blocked')
 }finally{h.dispose()}
})
