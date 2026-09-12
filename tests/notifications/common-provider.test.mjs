import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const read=file=>readFileSync(new URL('../../'+file,import.meta.url),'utf8')
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
const contractModule={exports:{}}
new Function('exports','module',compile(read('lib/notifications/common-contract.ts')))(contractModule.exports,contractModule)
const providerCode=compile(read('components/notifications/NotificationsProvider.tsx'))
const ownerA='10000000-0000-4000-8000-000000000001',ownerB='10000000-0000-4000-8000-000000000002'
const row=(n,read_at=null)=>({id:`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`,kind:'social_activity',payload:{team_name:'예시 '+n},created_at:new Date(Date.UTC(2026,8,10,12,0,n)).toISOString(),read_at})
const sameDeps=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]))

/** Minimal single-component hook scheduler. It executes the unmodified Provider,
 * with stable hook slots, memo dependencies, deferred effects and effect cleanup.
 * No real React renderer, browser, network, auth service or timer is used. */
function harness(initialAccount=ownerA){
 let account=initialAccount,index=0,dirty=true,mounted=true,output,timerId=0
 const slots=[],effects=new Map(),requests=[],timers=new Map(),windowEvents=new Map(),documentEvents=new Map()
 const add=(events,name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn)}
 const remove=(events,name,fn)=>events.get(name)?.delete(fn)
 const window={setInterval:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId},clearInterval:id=>timers.delete(id),addEventListener:(name,fn)=>add(windowEvents,name,fn),removeEventListener:(name,fn)=>remove(windowEvents,name,fn)}
 const document={visibilityState:'visible',addEventListener:(name,fn)=>add(documentEvents,name,fn),removeEventListener:(name,fn)=>remove(documentEvents,name,fn)}
 const react={
  createContext:value=>({Provider:'provider',current:value}),
  useContext:context=>context.current,
  useState:initial=>{
   const i=index++
   if(!slots[i]){
    const slot={kind:'state',value:typeof initial==='function'?initial():initial}
    slot.set=value=>{if(!mounted)return;const next=typeof value==='function'?value(slot.value):value;if(!Object.is(next,slot.value)){slot.value=next;dirty=true}}
    slots[i]=slot
   }
   assert.equal(slots[i].kind,'state')
   return[slots[i].value,slots[i].set]
  },
  useRef:initial=>{const i=index++;if(!slots[i])slots[i]={kind:'ref',value:{current:initial}};assert.equal(slots[i].kind,'ref');return slots[i].value},
  useCallback:(fn,deps)=>{const i=index++;if(!slots[i]||!sameDeps(slots[i].deps,deps))slots[i]={kind:'callback',fn,deps};assert.equal(slots[i].kind,'callback');return slots[i].fn},
  useEffect:(fn,deps)=>{
   const i=index++
   if(!slots[i])slots[i]={kind:'effect',deps:undefined,cleanup:undefined}
   assert.equal(slots[i].kind,'effect')
   if(!sameDeps(slots[i].deps,deps))effects.set(i,{fn,deps})
  },
 }
 const fetch=(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,settled:false,
  reply(body,status=200){assert.equal(this.settled,false,'each response settles once');this.settled=true;resolve({ok:status>=200&&status<300,status,json:async()=>body})},
  fail(){assert.equal(this.settled,false);this.settled=true;reject(Error('network unavailable'))},
 }))
 const module={exports:{}}
 const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>account},'@/lib/notifications/common-contract':contractModule.exports,'./PushNotificationSettings':{CommonPushAccountBoundary:'push-account-boundary'}}
 new Function('exports','module','require','fetch','window','document','AbortSignal',providerCode)(module.exports,module,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]},fetch,window,document,{timeout:()=>({testTimeout:true})})
 function render(){index=0;dirty=false;output=module.exports.default({children:null});module.exports.NotificationContext.current=output.props.value}
 function flush(){
  for(let turns=0;dirty||effects.size;turns++){
   assert.ok(turns<30,'hook state/effects converge')
   if(dirty)render()
   const pending=[...effects];effects.clear()
   for(const[i,{fn,deps}]of pending){slots[i].cleanup?.();slots[i].deps=deps;slots[i].cleanup=fn()}
  }
 }
 async function settle(){for(let i=0;i<24;i++){await Promise.resolve();flush()}}
 flush()
 return{
  get value(){return output.props.value},requests,timers,windowEvents,documentEvents,document,settle,
  setAccount(value,{commit=true}={}){account=value;dirty=true;render();if(commit)flush()},
  commit:flush,
  poll(){for(const timer of timers.values()){assert.equal(timer.ms,15000);timer.fn()}},
  focus(){for(const fn of windowEvents.get('focus')??[])fn()},
  unmount(){mounted=false;for(const slot of slots)if(slot?.kind==='effect')slot.cleanup?.();effects.clear();dirty=false},
 }
}
function refreshPair(f,excluded=[]){const pending=f.requests.filter(request=>!request.settled&&!excluded.includes(request));return{list:pending.find(request=>request.url.includes('/social/page')),count:pending.find(request=>request.url.endsWith('/unread-count'))}}
function answerPair(pair,{owner=ownerA,rows=[row(1)],unread=rows.filter(item=>!item.read_at).length,status=200,hasMore=false,cursor=null,countStatus=200}={}){
 assert.ok(pair.list&&pair.count,'refresh requests a list and count together')
 pair.list.reply({notifications:rows,owner_id:owner,has_more:hasMore,next_cursor:cursor},status)
 pair.count.reply(countStatus===200?{count:unread,owner_id:owner}:{error:'notification_count_unavailable'},countStatus)
}
async function ready(f,options){answerPair(refreshPair(f),options);await f.settle();assert.equal(f.value.status,'ready')}

test('first load is silent; a new unread arrival appears once and dismissed arrivals do not repeat',async()=>{
 const f=harness();await ready(f,{rows:[row(1)]})
 assert.equal(f.value.arrival,null);assert.equal(f.value.unread,1)
 f.poll();answerPair(refreshPair(f),{rows:[row(2),row(1)]});await f.settle()
 assert.equal(f.value.arrival.id,row(2).id);assert.equal(f.value.unread,2)
 f.value.dismissArrival();await f.settle();assert.equal(f.value.arrival,null)
 f.poll();answerPair(refreshPair(f),{rows:[row(2),row(1)]});await f.settle()
 assert.equal(f.value.arrival,null);assert.equal(f.value.items.length,2)
 f.unmount()
})

test('account switch hides previous items immediately and ignores both late previous-account responses',async()=>{
 const f=harness();await ready(f,{rows:[row(1)]})
 f.poll();const old=refreshPair(f)
 f.setAccount(ownerB,{commit:false})
 assert.deepEqual(f.value.items,[]);assert.equal(f.value.unread,null);assert.equal(f.value.arrival,null)
 // Render-time visibility already hides A, before B's account effect commits.
 f.commit();answerPair(refreshPair(f,[old.list,old.count]),{owner:ownerB,rows:[row(8)]});await f.settle()
 assert.equal(f.value.status,'ready')
 answerPair(old,{rows:[row(3),row(1)],unread:2});await f.settle()
 assert.equal(f.value.status,'ready');assert.equal(f.value.unread,1)
 assert.deepEqual(f.value.items.map(item=>item.id),[row(8).id]);assert.equal(f.value.arrival,null)
 f.unmount()
})

test('signed out and unavailable account states clear private data and do not fetch',async()=>{
 const f=harness();await ready(f)
 for(const account of [null,'unavailable']){
  const before=f.requests.length;f.setAccount(account);await f.settle()
  assert.deepEqual(f.value.items,[]);assert.equal(f.value.unread,null);assert.equal(f.value.arrival,null)
  assert.equal(f.value.status,account===null?'auth_required':'unavailable')
  f.poll();f.focus();await f.settle();assert.equal(f.requests.length,before)
  assert.equal(await f.value.markRead(row(1).id),false)
 }
 f.unmount()
})

test('mismatched account ownership in a response is rejected instead of displaying another account',async()=>{
 const f=harness();answerPair(refreshPair(f),{owner:ownerB,rows:[row(8)],unread:1});await f.settle()
 assert.equal(f.value.status,'unavailable');assert.deepEqual(f.value.items,[]);assert.equal(f.value.unread,null)
 f.unmount()
})

test('count API 503 preserves unknown count rather than displaying fabricated zero',async()=>{
 const f=harness();await ready(f)
 f.poll();answerPair(refreshPair(f),{rows:[row(2)],countStatus:503});await f.settle()
 assert.equal(f.value.status,'unavailable');assert.equal(f.value.unread,null);assert.equal(f.value.arrival,null)
 assert.deepEqual(f.value.items.map(item=>item.id),[row(1).id]);assert.ok(f.value.error)
 f.unmount()
})

test('markRead failure never optimistically changes the unread count or item read state',async()=>{
 const f=harness();await ready(f)
 const action=f.value.markRead(row(1).id),request=f.requests.at(-1)
 assert.equal(request.url,'/api/notifications/read');assert.deepEqual(JSON.parse(request.options.body),{notification_id:row(1).id})
 assert.equal(f.value.items[0].read_at,null);assert.equal(f.value.unread,1)
 request.reply({error:'notification_read_unavailable'},503)
 assert.equal(await action,false);await f.settle()
 assert.equal(f.value.items[0].read_at,null);assert.equal(f.value.unread,1);assert.ok(f.value.error)
 f.unmount()
})

test('successful read invalidates an older refresh so stale zero cannot overwrite newer unread state',async()=>{
 const f=harness();await ready(f)
 f.poll();const old=refreshPair(f)
 const action=f.value.markRead(row(1).id);f.requests.at(-1).reply({ok:true})
 assert.equal(await action,true);await f.settle()
 assert.ok(f.value.items[0].read_at);assert.equal(f.value.unread,0)
 const freshRequests=f.requests.filter(request=>!request.settled&&request!==old.list&&request!==old.count)
 const fresh={list:freshRequests.find(request=>request.url.includes('/social/page')),count:freshRequests.find(request=>request.url.endsWith('/unread-count'))}
 const readAt='2026-09-10T13:00:00.000Z'
 answerPair(fresh,{rows:[row(2),row(1,readAt)],unread:1});await f.settle()
 assert.equal(f.value.unread,1);assert.equal(f.value.arrival.id,row(2).id)
 answerPair(old,{rows:[row(1)],unread:0});await f.settle()
 assert.equal(f.value.unread,1);assert.equal(f.value.items.find(item=>item.id===row(1).id).read_at,readAt)
 assert.equal(f.value.arrival.id,row(2).id)
 f.unmount()
})

test('a read response from the previous account cannot acknowledge or refresh the next account',async()=>{
 const f=harness();await ready(f)
 const action=f.value.markRead(row(1).id),oldRead=f.requests.at(-1)
 f.setAccount(ownerB);await ready(f,{owner:ownerB,rows:[row(8)]})
 const before=f.requests.length;oldRead.reply({ok:true});assert.equal(await action,false);await f.settle()
 assert.equal(f.requests.length,before);assert.equal(f.value.unread,1);assert.equal(f.value.items[0].read_at,null)
 assert.deepEqual(f.value.items.map(item=>item.id),[row(8).id])
 f.unmount()
})

test('read-all is explicit and updates local items only after server acknowledgement',async()=>{
 const f=harness();await ready(f,{rows:[row(2),row(1)]})
 const action=f.value.markRead(),request=f.requests.at(-1)
 assert.deepEqual(JSON.parse(request.options.body),{all:true});assert.equal(f.value.unread,2)
 request.reply({ok:true,updated:2});assert.equal(await action,true);await f.settle()
 assert.equal(f.value.unread,0);assert.ok(f.value.items.every(item=>item.read_at));assert.equal(f.value.arrival,null)
 answerPair(refreshPair(f),{rows:[row(2,'2026-09-10T13:00:00Z'),row(1,'2026-09-10T13:00:00Z')],unread:0});await f.settle()
 assert.equal(f.value.unread,0)
 f.unmount()
})

test('visible poll/focus refresh is single-flight and cleanup removes timers and listeners',async()=>{
 const f=harness();assert.equal(f.requests.length,2)
 f.focus();f.poll();assert.equal(f.requests.length,2)
 await ready(f);f.document.visibilityState='hidden';f.poll();f.focus();assert.equal(f.requests.length,2)
 f.document.visibilityState='visible';f.focus();assert.equal(f.requests.length,4)
 const old=refreshPair(f);f.unmount()
 assert.equal(f.timers.size,0);assert.equal(f.windowEvents.get('focus').size,0);assert.equal(f.documentEvents.get('visibilitychange').size,0)
 answerPair(old,{rows:[row(2)],unread:1});await f.settle()
 assert.deepEqual(f.value.items.map(item=>item.id),[row(1).id]);assert.equal(f.value.arrival,null)
})
