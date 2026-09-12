import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const compile=file=>ts.transpileModule(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const owner='10000000-0000-4000-8000-000000000001',room='10000000-0000-4000-8000-000000000002',a='10000000-0000-4000-8000-000000000003',b='10000000-0000-4000-8000-000000000004'
function fixture(){
 const module={exports:{}},contract={exports:{}},timers=new Map(),events=new Map(),requests=[],dispatch=[];let cleanup,callback,next=0
 new Function('module','exports',compile('lib/chat/social-rooms-contract.ts'))(contract,contract.exports)
 const document={visibilityState:'visible',addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)}
 const deps={'react':{useRef:value=>({current:value}),useEffect:fn=>{cleanup=fn()}},'@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>owner},'./social-rooms-contract':contract.exports}
 class Observer{constructor(fn){callback=fn}observe(){}disconnect(){}}
 new Function('module','exports','require','IntersectionObserver','document','window','setTimeout','clearTimeout','fetch',compile('lib/chat/useSocialChatRead.ts'))(module,module.exports,n=>deps[n],Observer,document,{dispatchEvent:event=>dispatch.push(event.type)},fn=>{timers.set(++next,fn);return next},id=>timers.delete(id),async(url,init)=>{requests.push({url,init});return{ok:true,json:async()=>({owner_id:owner,ok:true})}})
 const node=id=>({dataset:{socialMessageId:id}}),root={current:{querySelectorAll:()=>[node(a),node(b)]}}
 return{document,requests,dispatch,mount:(enabled=true)=>module.exports.useSocialChatRead('league_team',room,[{id:a},{id:b}],{root,enabled}),observe:(id,visible=true)=>callback([{target:node(id),isIntersecting:visible,intersectionRect:{height:visible?60:0},boundingClientRect:{height:60}}]),wake:()=>events.get('visibilitychange')?.(),flush:async()=>{const queued=[...timers.values()];timers.clear();queued.forEach(fn=>fn());for(let n=0;n<12;n++)await Promise.resolve()},close:()=>cleanup?.()}
}
test('only actually visible known message IDs are acknowledged and hidden documents do not mark',async()=>{
 const h=fixture();h.mount();h.observe(a);await h.flush();assert.deepEqual(JSON.parse(h.requests[0].init.body).message_ids,[a]);assert.equal(h.requests[0].init.headers['X-Expected-Account'],owner)
 h.document.visibilityState='hidden';h.observe(b);await h.flush();assert.equal(h.requests.length,1)
 h.document.visibilityState='visible';h.wake();await h.flush();assert.deepEqual(JSON.parse(h.requests[1].init.body).message_ids,[b]);h.close()
})
test('unmounted scope cannot send a queued read and demo-disabled hook never observes',async()=>{
 const h=fixture();h.mount();h.observe(a);h.close();await h.flush();assert.equal(h.requests.length,0)
 const demo=fixture();demo.mount(false);await demo.flush();assert.equal(demo.requests.length,0)
})
