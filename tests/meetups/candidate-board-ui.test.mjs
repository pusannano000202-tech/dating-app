import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import React from 'react'
import ts from 'typescript'
import * as contract from '../../lib/meetups/candidate-board-contract.ts'
import * as view from '../../lib/meetups/candidate-board-view.ts'
import {createDemoBoard,applyDemoAction,demoIncoming,demoJoined} from '../../lib/meetups/candidate-board-demo.ts'

const require=createRequire(import.meta.url),scope={kind:'league',key:'lol'},other='97000000-0000-4000-8000-000000000002'
const source=path=>ts.transpileModule(readFileSync(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
function fixture({mine=false,incoming=false,expanded=false}={}){
 let board=createDemoBoard(scope)
 if(mine)board=applyDemoAction(board,'register',{positions:['mid','support'],tier:'gold',intro:'편하게 함께해요',availability:'수요일 저녁',consent:true,expected_revision:null})
 if(incoming)board=demoIncoming(board)
 if(expanded)for(let i=0;i<8;i++)board=applyDemoAction(board,'more',{})
 assert.ok(contract.parseCandidateBoard(board))
 return board
}

/** Executes actual TS hooks/component/page source with deterministic hook scheduling.
 * Network, auth source, timers and browser events are simulated; not React DOM or
 * real-account proof. No files, credentials, push devices or remote state touched. */
function harness({live=false,board=fixture(),initialInviteId,onAction=async()=>null}={}){
 let index=0,dirty=true,tree,account=board.owner_id,currentScope=scope,timerId=0,disposed=false,more=0
 const slots=[],effects=new Map(),intervals=new Map(),timeouts=new Map(),requests=[]
 const listeners={window:new Map(),document:new Map()}
 let props={scope,board,busy:false,error:'',filter:'all',onFilter(){},onMore(){more++},onRefresh(){},onAction,initialInviteId}
 const hooks={...React,
  useState(initial){const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true}}]},
  useRef(initial){const i=index++;if(!slots[i])slots[i]={value:{current:initial}};return slots[i].value},
  useCallback(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn},
  useEffect(fn,deps){const i=index++;if(!slots[i])slots[i]={deps:undefined};if(!same(slots[i].deps,deps))effects.set(i,{fn,deps})},
 }
 const events=map=>({addEventListener(name,fn){if(!map.has(name))map.set(name,new Set());map.get(name).add(fn)},removeEventListener(name,fn){map.get(name)?.delete(fn)}})
 const window={scrollTo(){},...events(listeners.window)},document={visibilityState:'visible',...events(listeners.document)}
 const setInterval=fn=>{intervals.set(++timerId,fn);return timerId},clearInterval=id=>intervals.delete(id),setTimeout=fn=>{timeouts.set(++timerId,fn);return timerId},clearTimeout=id=>timeouts.delete(id)
 const fetch=(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,reply(body,status=200){resolve({ok:status>=200&&status<300,json:async()=>body})},fail(){reject(Error('network unavailable'))}}))
 const deps={react:hooks,'react/jsx-runtime':require('react/jsx-runtime'),'next/image':{__esModule:true,default:'img'},'next/link':{__esModule:true,default:'a'},'next/navigation':{notFound(){throw Error('not_found')}},'lucide-react':require('lucide-react'),
  '@/lib/meetups/candidate-board-contract':contract,'@/lib/meetups/candidate-board-view':view,'@/lib/meetups/challenge-journey':{LEAGUE_SPORTS:{}},'@/lib/meetups/study-catalog':{getStudyCourse(){return null},getStudyCoursePhoto(){return{src:'/fixture'}}},'@/components/community/department/LeagueTier':{LeagueTierBadge:'span',LeagueTierPicker:'select'},'@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>account},'./candidate-board.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})},
 }
 const evaluate=path=>{const m={exports:{}};new Function('require','module','exports','fetch','window','document','setInterval','clearInterval','setTimeout','clearTimeout',source(path))(name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]},m,m.exports,fetch,window,document,setInterval,clearInterval,setTimeout,clearTimeout);return m.exports}
 deps['./useHostedResource']=evaluate('components/meetups/useHostedResource.ts')
 deps['./candidate-board-contract']=contract
 deps['@/lib/meetups/candidate-deposit-contract']=evaluate('lib/meetups/candidate-deposit-contract.ts')
 deps['./CandidateDepositStep']=evaluate('components/meetups/CandidateDepositStep.tsx')
 const ui=evaluate('components/meetups/CandidateBoard.tsx')
 deps['@/components/meetups/CandidateBoard']={__esModule:true,default:ui.default}
 const page=evaluate('app/meetups/candidates/page.tsx').default
 function flush(){if(disposed)return;for(let n=0;dirty||effects.size;n++){assert.ok(n<40,'hooks converge');if(dirty){index=0;dirty=false;tree=live?ui.default({scope:currentScope,initialInviteId}):ui.CandidateBoardView(props)}const pending=[...effects];effects.clear();for(const[i,{fn,deps}]of pending){slots[i].cleanup?.();slots[i].deps=deps;slots[i].cleanup=fn()}}}
 async function settle(){for(let i=0;i<20;i++){await Promise.resolve();flush()}}
 flush()
 return{requests,page,settle,get tree(){flush();return tree},get more(){return more},setProps(next){props={...props,...next};dirty=true;flush()},setAccount(next){account=next;dirty=true;flush()},setScope(next){currentScope=next;dirty=true;flush()},poll(){for(const fn of intervals.values())fn()},dispose(){disposed=true;for(const slot of slots)slot?.cleanup?.();effects.clear();intervals.clear();timeouts.clear()}}
}
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)]
const text=tree=>typeof tree==='string'?tree:!tree||typeof tree!=='object'?'':(Array.isArray(tree)?tree:[tree.props?.children]).map(text).join(' ')
const component=(tree,name)=>nodes(tree).find(n=>n.type?.name===name)
const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n).includes(label))
const cards=tree=>nodes(tree).filter(n=>n.type?.name==='CandidateCard').map(n=>n.props.row.id)

test('initial discovery shows only three cards, with own registration pinned once and local expansion cumulative',()=>{
 for(const mine of [false,true]){const h=harness({board:fixture({mine,expanded:true})});try{
  const before=cards(h.tree);assert.equal(before.length,3);assert.equal(new Set(before).size,3)
  if(mine)assert.equal(component(h.tree,'CandidateCard').props.row.is_me,true)
  button(h.tree,'더 보기').props.onClick();const next=cards(h.tree);assert.equal(next.length,6);assert.ok(before.every(id=>next.includes(id)));assert.equal(h.more,0)
 }finally{h.dispose()}}
})

test('a server cursor transition is labelled as next people, not append to the same visible page',()=>{
 const page=fixture({expanded:true});page.next_cursor=page.candidates.at(-1).id
 const h=harness({board:page});try{
  for(let i=0;i<7&&button(h.tree,'더 보기');i++)button(h.tree,'더 보기').props.onClick()
  const next=button(h.tree,'다음 대기자 보기');assert.ok(next);next.props.onClick();assert.equal(h.more,1)
 }finally{h.dispose()}
})

test('preparation_required response has explicit non-joined feedback and does not remove the waiting candidate',async()=>{
 const board=fixture({mine:true,incoming:true}),invite=board.incoming[0]
 const h=harness({board,initialInviteId:invite.id,onAction:async()=>({...board,result:{status:'preparation_required',next_href:null,checkout_enabled:false}})});try{
  await component(h.tree,'InviteDetail').props.onAction('accept',invite);await h.settle()
  const alert=nodes(h.tree).find(n=>n.props?.role==='alert');assert.ok(alert);assert.ok(text(alert).includes('준비'));assert.ok(text(alert).includes('대기 등록과 초대는 유지'))
  assert.equal(component(h.tree,'InviteDetail').props.invite.status,'pending');assert.equal(board.mine.status,'waiting');assert.equal(board.total_count,31)
  assert.equal(nodes(h.tree).some(n=>n.type==='a'&&text(n).includes('채팅')),false)
 }finally{h.dispose()}
})

test('an incoming notification deep-link selects that exact current invitation and rejects another id',async()=>{
 const board=fixture({mine:true,incoming:true}),invite=board.incoming[0],h=harness({board,initialInviteId:invite.id});try{
  const page=await h.page({searchParams:Promise.resolve({...scope,invite:invite.id})});assert.equal(page.props.initialInviteId,invite.id)
  assert.equal(component(h.tree,'InviteDetail').props.invite.id,invite.id)
  const malformed=await h.page({searchParams:Promise.resolve({...scope,invite:['bad','id']})});assert.equal(malformed.props.initialInviteId,undefined)
 }finally{h.dispose()}
 const foreign=harness({board,initialInviteId:other});try{const detail=component(foreign.tree,'InviteDetail');assert.ok(text(detail.type(detail.props)).includes('현재 진행할 수 있는 초대가 아니에요'));assert.equal(button(detail.type(detail.props),'초대 수락'),undefined)}finally{foreign.dispose()}
})

test('a host notification opens its outgoing invitation status without offering recipient acceptance controls',()=>{
 const board=fixture({mine:true,incoming:true}),invite={...board.incoming[0],is_sender:true,status:'joined',next_href:'/chat/league-team/'+board.incoming[0].room_id};board.outgoing=[invite];board.incoming=[]
 const h=harness({board,initialInviteId:invite.id});try{
  assert.ok(text(h.tree).includes('내가 보낸 초대'),'Outgoing recipient must find its own sent invitation')
  assert.ok(text(h.tree).includes(invite.room_title));assert.ok(text(h.tree).includes('합류가 확정'))
  assert.equal(component(h.tree,'InviteDetail'),undefined);assert.equal(button(h.tree,'초대 수락'),undefined);assert.equal(button(h.tree,'거절'),undefined)
 }finally{h.dispose()}
})

test('a joined host can still open its sent-invitation notification instead of being forced back to discovery',()=>{
 const board=fixture({mine:true,incoming:true}),invite={...board.incoming[0],is_sender:true,status:'joined',next_href:'/chat/league-team/'+board.incoming[0].room_id}
 board.outgoing=[invite];board.incoming=[];board.mine={...board.mine,status:'joined',next_href:invite.next_href};board.candidates=board.candidates.filter(row=>!row.is_me);board.total_count--;board.filtered_count--
 assert.ok(contract.parseCandidateBoard(board))
 const h=harness({board,initialInviteId:invite.id});try{
  assert.ok(text(h.tree).includes('내가 보낸 초대'),'Current membership must not hide a host-owned notification detail')
  assert.ok(text(h.tree).includes('합류가 확정'));assert.equal(component(h.tree,'InviteDetail'),undefined)
 }finally{h.dispose()}
})

test('the live wrapper clears another account data and ignores late GET/mutation, using the real resource hook',async()=>{
 const board=fixture(),h=harness({live:true,board});try{
  h.requests[0].reply({data:board});await h.settle();assert.equal(h.tree.props.board.owner_id,board.owner_id)
  const action=h.tree.props.onAction('cancel',{expected_revision:0});const old=h.requests[1];assert.equal(old.options.headers['X-Quantum-Owner'],board.owner_id)
  h.poll();assert.equal(h.requests.length,2)
  h.setAccount(other);assert.equal(old.options.signal.aborted,true);assert.equal(h.tree.props.board,undefined)
  const changed={...board,owner_id:other};h.requests[2].reply({data:changed});await h.settle();old.reply({data:board});assert.equal(await action,null);await h.settle();assert.equal(h.tree.props.board.owner_id,other)
  h.tree.props.onRefresh();await h.settle();const oldGet=h.requests.at(-1);h.setScope({kind:'league',key:'futsal'});assert.equal(oldGet.options.signal.aborted,true);const current=h.requests.at(-1)
  current.reply({data:{...createDemoBoard({kind:'league',key:'futsal'}),owner_id:other}});await h.settle();oldGet.reply({data:changed});await h.settle();assert.equal(h.tree.props.board.scope.key,'futsal')
 }finally{h.dispose()}
})

test('the live wrapper never turns malformed successful mutation payloads into accepted UI state',async()=>{
 const board=fixture(),h=harness({live:true,board});try{
  h.requests[0].reply({data:board});await h.settle();const action=h.tree.props.onAction('cancel',{expected_revision:0})
  h.requests[1].reply({data:{...board,owner_id:other}});assert.equal(await action,null);await h.settle();assert.equal(h.tree.props.board,undefined)
  assert.ok(text(h.tree).includes('연결하지 못했어요'));assert.ok(!text(h.tree).includes('합류 완료'))
 }finally{h.dispose()}
})

test('changing account resets an owner-scoped cursor instead of permanently retrying another department page',async()=>{
 const board=fixture({expanded:true});board.next_cursor=board.candidates.at(-1).id
 const h=harness({live:true,board});try{
  h.requests[0].reply({data:board});await h.settle();h.tree.props.onMore();await h.settle()
  const oldPage=h.requests.at(-1);assert.ok(new URL(oldPage.url,'https://quantum.test').searchParams.has('cursor'))
  h.setAccount(other);await h.settle();const current=h.requests.at(-1)
  assert.equal(new URL(current.url,'https://quantum.test').searchParams.has('cursor'),false,'The new owner must not send the previous department candidate cursor')
  current.reply({data:{...board,owner_id:other}});await h.settle();oldPage.reply({data:board});await h.settle();assert.equal(h.tree.props.board.owner_id,other)
 }finally{h.dispose()}
})

test('sign-in recovery preserves the selected invitation from the notification link',()=>{
 const board=fixture({mine:true,incoming:true}),invite=board.incoming[0],h=harness({live:true,board,initialInviteId:invite.id});try{
  h.setAccount(null);const login=nodes(h.tree).find(n=>n.type==='a'&&n.props.href.startsWith('/login?'))
  assert.ok(login);const returnTo=new URL(login.props.href,'https://quantum.test').searchParams.get('returnTo')
  assert.equal(new URL(returnTo,'https://quantum.test').searchParams.get('invite'),invite.id)
 }finally{h.dispose()}
})

test('joined person sees its own team name and automatic closure, including ended invite history',()=>{
 let board=fixture({mine:true,incoming:true}),first=board.incoming[0]
 board.incoming.push({...first,id:other,room_id:other,room_title:'다른 팀 · 예시'})
 board=applyDemoAction(board,'accept',{invite_id:first.id,expected_revision:first.revision})
 board=demoJoined(board)
 const h=harness({board});try{
  assert.ok(text(h.tree).includes(`${first.room_title}에 합류했어요`))
  assert.ok(text(h.tree).includes('다른 팀의 초대는 자동으로 종료됐어요'))
  const header=component(h.tree,'Header');header.props.onInbox()
  assert.ok(text(h.tree).includes('지난 초대'))
  assert.ok(text(h.tree).includes('종료 · 더 이상 수락할 수 없어요'))
  assert.ok(!text(h.tree).includes('아직 받은 초대가 없어요'))
 }finally{h.dispose()}
})

test('ended host invitation offers discovery without leaking the joined team or accepting again',()=>{
 const board=fixture({mine:true,incoming:true}),invite={...board.incoming[0],is_sender:true,status:'unavailable',room_title:'모집 종료',candidate_alias:'대기 종료',next_href:null}
 board.incoming=[];board.outgoing=[invite]
 const h=harness({board,initialInviteId:invite.id});try{
  assert.ok(text(h.tree).includes('모집 상태를 다시 확인'))
  const discover=button(h.tree,'다른 대기자 찾아보기');assert.ok(discover)
  assert.equal(button(h.tree,'초대 수락'),undefined)
  discover.props.onClick();assert.ok(text(h.tree).includes('팀을 기다리는 친구들'))
 }finally{h.dispose()}
})

test('new registration moves to deposit review without publishing and back keeps the draft',async()=>{
 const calls=[],h=harness({onAction:async(...args)=>{calls.push(args);return null}})
 const draft={positions:['mid'],tier:'gold',intro:'즐겁게 함께해요',availability:'수요일 저녁',consent:true,expected_revision:null}
 try{
  button(h.tree,'나도 합류 대기 등록하기').props.onClick()
  await component(h.tree,'Registration').props.onSubmit(draft)
  assert.equal(calls.length,0,'No registration RPC before confirmed deposit')
  const step=component(h.tree,'LiveCandidateDepositStep');assert.ok(step)
  step.props.onBack();assert.deepEqual(component(h.tree,'Registration').props.draft,draft)
 }finally{h.dispose()}
})

test('demo deposit consent precedes publication and failure or cancel never posts a card',async()=>{
 const calls=[],h=harness({onAction:async(...args)=>{calls.push(args);return fixture({mine:true})}})
 const draft={positions:['mid'],tier:'gold',intro:'반가워요',availability:'수 저녁',consent:true,expected_revision:null}
 try{
  h.setProps({demo:true});button(h.tree,'나도 합류 대기 등록하기').props.onClick()
  await component(h.tree,'Registration').props.onSubmit(draft)
  let step=component(h.tree,'CandidateDepositStep');assert.ok(step)
  step.props.onPublish();await h.settle();assert.equal(calls.length,0)
  step.props.onFailure();step=component(h.tree,'CandidateDepositStep');assert.ok(step.props.error.includes('아직 공개되지 않았고'))
  step.props.onConsent(true);step=component(h.tree,'CandidateDepositStep');step.props.onPublish();await h.settle()
  assert.equal(calls.length,1);assert.equal(calls[0][0],'register');assert.deepEqual(calls[0][1],draft)
 }finally{h.dispose()}
 const cancel=harness({onAction:async(...args)=>{calls.push(args);return null}});try{
  cancel.setProps({demo:true});button(cancel.tree,'나도 합류 대기 등록하기').props.onClick();await component(cancel.tree,'Registration').props.onSubmit(draft)
  component(cancel.tree,'CandidateDepositStep').props.onCancel();assert.equal(component(cancel.tree,'Registration'),undefined);assert.equal(calls.length,1)
 }finally{cancel.dispose()}
})

test('refund copy requires a separate request and never treats withdrawal as completed repayment',async()=>{
 const h=harness();try{
  h.setProps({demo:true});button(h.tree,'나도 합류 대기 등록하기').props.onClick()
  await component(h.tree,'Registration').props.onSubmit({positions:['mid'],tier:'gold',intro:'',availability:'수 · 저녁',consent:true,expected_revision:null})
  const step=component(h.tree,'CandidateDepositStep')
  for(const demo of [false,true]){
   const copy=text(step.type({...step.props,demo}))
   assert.ok(copy.includes('보증금 반환 신청'),'The payment step explains request-based returns')
   assert.ok(copy.includes('자동 반환되지 않아요'))
   assert.ok(!copy.includes('처리 정책과 결제 연결을 준비 중'))
  }
 }finally{h.dispose()}
 const c=harness({board:fixture({mine:true})});try{
  button(c.tree,'대기 취소').props.onClick()
  assert.ok(text(c.tree).includes('보증금 반환 신청'))
  assert.ok(text(c.tree).includes('자동 반환되지 않아요'))
  assert.equal(button(c.tree,'보증금 반환 신청'),undefined,'No fake request button before refund integration')
  assert.ok(button(c.tree,'대기 등록 취소하기'))
 }finally{c.dispose()}
})
