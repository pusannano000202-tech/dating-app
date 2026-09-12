import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=file=>readFileSync(new URL('../../'+file,import.meta.url),'utf8')
const compile=file=>ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
function pure(file){const m={exports:{}};new Function('exports','module',compile(file))(m.exports,m);return m.exports}
const contract=pure('lib/chat/social-rooms-contract.ts'),presentation=pure('lib/chat/social-room-presentation.ts')
const owner='10000000-0000-4000-8000-000000000001'
const row=n=>({kind:'meetup',id:'20000000-0000-4000-8000-'+String(n).padStart(12,'0'),title:'모임 '+n,affiliation:'우리 학교',member_count:2,writable:true,updated_at:'2026-09-11T00:00:00Z'})
const payload=(rooms,more=false)=>({owner_id:owner,rooms,has_more:more,next_cursor:more?'meetup:'+rooms.at(-1).id:null})
const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[node]
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
// Executes the unchanged component with a deferred hook scheduler, not a browser or auth service.
function harness(){
 let index=0,dirty=true,mounted=true,output,timer=0
 const slots=[],effects=new Map(),requests=[],timers=new Map()
 const react={
  useState(initial){const i=index++;if(!slots[i])slots[i]={value:initial};const set=v=>{if(mounted){const next=typeof v==='function'?v(slots[i].value):v;if(next!==slots[i].value){slots[i].value=next;dirty=true}}};return[slots[i].value,set]},
  useRef(initial){const i=index++;return(slots[i]??={value:{current:initial}}).value},
  useCallback(fn,deps){const i=index++;if(!same(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn},
  useEffect(fn,deps){const i=index++;if(!slots[i])slots[i]={};if(!same(slots[i].deps,deps))effects.set(i,{fn,deps})}
 }
 const window={setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms,type:'timeout'});return timer},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{timers.set(++timer,{fn,ms,type:'interval'});return timer},clearInterval:id=>timers.delete(id),addEventListener(){},removeEventListener(){}}
 const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}}
 const fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,reply(body,status=200){resolve({ok:status===200,json:async()=>body})}}))
 const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'next/link':{default:'link'},'@/lib/chat/social-rooms-contract':contract,'@/lib/chat/social-room-presentation':presentation,'./SocialChatDirectory':{default:'directory'},'./chat-belonging.module.css':{default:{}}}
 const m={exports:{}}
 new Function('exports','module','require','fetch','window','document',compile('components/chat/SocialRoomsSection.tsx'))(m.exports,m,name=>{assert.ok(name in deps,name);return deps[name]},fetch,window,document)
 function flush(){for(let rounds=0;dirty||effects.size;rounds++){assert.ok(rounds<30);if(dirty){index=0;dirty=false;output=m.exports.default({ownerId:owner})}const pending=[...effects];effects.clear();for(const[i,{fn,deps}]of pending){slots[i].cleanup?.();slots[i]={fn,deps,cleanup:fn()}}}}
 async function settle(){for(let i=0;i<24;i++){await Promise.resolve();flush()}}
 flush()
 return{requests,settle,document,get tree(){return flatten(output)},get rooms(){return flatten(output).find(n=>n?.type==='directory')?.props.rooms??[]},
  replayEffects(){for(const slot of slots)if(slot?.cleanup){slot.cleanup();slot.cleanup=slot.fn()}flush()},
  poll(){for(const value of timers.values())if(value.type==='interval')value.fn()},
  more(){const button=flatten(output).find(n=>n?.type==='button'&&n.props.children==='참여한 대화 더 보기');assert.ok(button);button.props.onClick();flush()},
  close(){mounted=false;for(const slot of slots)slot?.cleanup?.()}
 }
}
test('StrictMode effect replay cancels first load and still starts the replacement load',async()=>{
 const f=harness()
 try{f.replayEffects();assert.equal(f.requests.length,2);assert.equal(f.requests[0].options.signal.aborted,true)
  f.requests[1].reply(payload([row(2)]));await f.settle();assert.deepEqual(f.rooms.map(r=>r.id),[row(2).id])
  f.requests[0].reply(payload([row(1)]));await f.settle();assert.deepEqual(f.rooms.map(r=>r.id),[row(2).id])
 }finally{f.close()}
})
test('all loaded membership pages refresh authoritatively so departed old rooms disappear',async()=>{
 const f=harness(),first=Array.from({length:50},(_,i)=>row(i+1))
 try{f.requests[0].reply(payload(first,true));await f.settle();f.more();assert.ok(f.requests[1].url.includes('cursor='))
  f.requests[1].reply(payload([row(51)]));await f.settle();assert.equal(f.rooms.length,51)
  f.poll();f.requests[2].reply(payload(first.slice(1).concat(row(52)),true));await f.settle()
  f.requests[3].reply(payload([row(53)]));await f.settle();assert.equal(f.rooms.length,51);assert.ok(!f.rooms.some(r=>r.id===row(1).id||r.id===row(51).id))
 }finally{f.close()}
})
test('owner mismatch and server error hide private rows and show a failure, not empty membership',async()=>{
 const f=harness()
 try{f.requests[0].reply(payload([row(1)]));await f.settle();f.poll()
  f.requests[1].reply({...payload([row(2)]),owner_id:row(3).id});await f.settle()
  assert.equal(f.rooms.length,0);assert.ok(f.tree.some(n=>n?.props?.role==='alert'))
  f.poll();f.requests[2].reply({error:'unavailable'},503);await f.settle();assert.ok(f.tree.some(n=>n?.props?.role==='alert'))
 }finally{f.close()}
})
test('unmounted and hidden pages do not expose delayed responses or launch periodic requests',async()=>{
 const f=harness();f.document.visibilityState='hidden';f.poll();assert.equal(f.requests.length,1);f.close()
 f.requests[0].reply(payload([row(1)]));await f.settle();assert.equal(f.rooms.length,0)
})
test('chat hub account key isolates social, matching and friend subtrees without changing match gates',()=>{
 const source=read('components/chat/ChatHub.tsx'),matching=read('components/chat/MatchingRoomsSection.tsx')
 assert.match(source,/<OwnedChatHub key=\{account\} ownerId=\{account\}/)
 assert.ok(source.includes("['matching','매칭']"));assert.ok(source.includes("['social','팀·모임']"))
 assert.ok(matching.includes("fetch('/api/matches'"));assert.ok(matching.includes("+'/chat'"))
 assert.ok(!matching.includes('/api/chat/league-team'));assert.ok(!matching.includes('opens_at'))
})
