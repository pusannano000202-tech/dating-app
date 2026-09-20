import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import ts from 'typescript'
import * as roomsContract from '../../lib/chat/social-rooms-contract.ts'
import {createDemoBoard,applyDemoAction,demoIncoming,demoJoined} from '../../lib/meetups/candidate-board-demo.ts'

const require=createRequire(import.meta.url)
const owner='97000000-0000-4000-8000-000000000001',other='97000000-0000-4000-8000-000000000002'
const id=n=>`96000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const team=(n,sport='lol')=>({kind:'league_team',id:id(n),title:`팀 ${n}`,affiliation:'건축학과',member_count:2,writable:true,updated_at:'2026-09-20T00:00:00Z',sport,challenge_id:id(n+1000)})
const response=(rooms,has_more=false,owner_id=owner)=>({owner_id,rooms,has_more,next_cursor:has_more?`league_team:${rooms.at(-1).id}`:null})
function harness(){
 let account=owner,index=0,dirty=true,output,expectedOwner,expectedEnabled=true
 const slots=[],effects=new Map(),requests=[],events=new Map(),timers=new Map();let timer=0
 const equal=(a,b)=>a?.length===b?.length&&a?.every((v,i)=>Object.is(v,b[i]))
 const hooks={
  useState(initial){const i=index++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;dirty=true}]},
  useRef(value){const i=index++;slots[i]??={value:{current:value}};return slots[i].value},
  useCallback(fn,deps){const i=index++;if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={value:fn,deps};return slots[i].value},
  useEffect(fn,deps){const i=index++;slots[i]??={};if(!equal(slots[i].deps,deps))effects.set(i,{fn,deps})},
 }
 const fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,reply(body,ok=true){resolve({ok,json:async()=>body})}}))
 const env={addEventListener(k,fn){events.set(k,fn)},removeEventListener(k){events.delete(k)},visibilityState:'visible'}
 const deps={react:hooks,'./useHostedResource':{},'@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>account},'@/lib/chat/social-rooms-contract':roomsContract,'@/lib/meetups/league-navigation':{leagueLocationHref:({sport,challengeId,teamId})=>`/meetups/league?sport=${sport}&challenge=${challengeId}&team=${teamId}`}}
 const source=ts.transpileModule(readFileSync(new URL('../../components/meetups/useCandidateLeagueMembership.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const m={exports:{}};new Function('require','module','exports','fetch','window','document','setInterval','clearInterval','setTimeout','clearTimeout',source)(name=>{assert.ok(name in deps,name);return deps[name]},m,m.exports,fetch,env,env,fn=>{timers.set(++timer,fn);return timer},id=>timers.delete(id),fn=>{timers.set(++timer,fn);return timer},id=>timers.delete(id))
 assert.equal(typeof m.exports.useMyLeagueTeams,'function','The shared hook must expose all owned teams')
 function flush(){for(let n=0;dirty||effects.size;n++){assert.ok(n<30);if(dirty){dirty=false;index=0;output=m.exports.useMyLeagueTeams(expectedOwner,expectedEnabled)}const pending=[...effects];effects.clear();for(const[i,{fn,deps}]of pending){slots[i].cleanup?.();slots[i].deps=deps;slots[i].cleanup=fn()}}}
 async function settle(){for(let i=0;i<30;i++){await Promise.resolve();flush()}}
 flush();return{requests,settle,get state(){flush();return output.membership},setAccount(value){account=value;dirty=true;flush()},setExpected(value){expectedOwner=value;dirty=true;flush()},retry(){output.retry();flush()},wake(){events.get('focus')?.();flush()},dispose(){slots.forEach(s=>s?.cleanup?.())}}
}
test('all pages and sports form one exact actor-owned team collection',async()=>{
 const h=harness();try{const first=Array.from({length:50},(_,i)=>team(i+1));h.requests[0].reply(response(first,true));await h.settle();assert.equal(h.state.status,'loading');assert.match(h.requests[1].url,/cursor=/);h.requests[1].reply(response([team(51,'football')]));await h.settle();assert.equal(h.state.status,'member');assert.equal(h.state.teams.length,51);assert.equal(h.state.teams.at(-1).sport,'football');assert.equal(h.state.teams.at(-1).chatHref,`/chat/league-team/${id(51)}`)}finally{h.dispose()}
})
test('later foreign-owner page and missing legacy metadata never assert complete membership',async()=>{
 for(const malformed of [response([team(51)],false,other),response([{...team(51),challenge_id:undefined}])]){const h=harness();try{h.requests[0].reply(response(Array.from({length:50},(_,i)=>team(i+1)),true));await h.settle();h.requests[1].reply(malformed);await h.settle();assert.equal(h.state.status,'unavailable')}finally{h.dispose()}}
})
test('account switch aborts stale membership and late responses cannot disclose the previous teams',async()=>{
 const h=harness();try{const old=h.requests[0];h.setAccount(other);assert.equal(old.options.signal.aborted,true);h.requests[1].reply(response([],false,other));await h.settle();old.reply(response([team(1)]));await h.settle();assert.equal(h.state.status,'none');h.setExpected(owner);assert.equal(h.state.status,'loading')}finally{h.dispose()}
})
test('overlapping cursor rows are deduplicated and repeated cursors fail closed',async()=>{
 const h=harness();try{const first=Array.from({length:50},(_,i)=>team(i+1));h.requests[0].reply(response(first,true));await h.settle();h.requests[1].reply(response([team(50),team(51)]));await h.settle();assert.equal(h.state.teams.length,51)}finally{h.dispose()}
 const loop=harness();try{const page=response(Array.from({length:50},(_,i)=>team(i+1)),true);loop.requests[0].reply(page);await loop.settle();loop.requests[1].reply(page);await loop.settle();assert.equal(loop.state.status,'unavailable');assert.equal(loop.requests.length,2)}finally{loop.dispose()}
})

test('background refresh preserves same-account verified teams while manual retry shows loading and failures expire the snapshot',async()=>{
 const h=harness();try{
  h.requests[0].reply(response([team(1)]));await h.settle();assert.equal(h.state.status,'member')
  h.wake();assert.equal(h.requests.length,2);assert.equal(h.state.status,'member');assert.equal(h.state.teams.length,1)
  h.wake();assert.equal(h.requests.length,2,'Do not overlap automatic refreshes')
  h.requests[1].reply(response([team(1),team(2)]));await h.settle();assert.equal(h.state.teams.length,2)
  h.retry();assert.equal(h.state.status,'loading');h.requests[2].reply(response([team(1)]));await h.settle()
  h.wake();assert.equal(h.state.status,'member');h.requests[3].reply({},false);await h.settle();assert.equal(h.state.status,'unavailable')
  h.wake();assert.equal(h.state.status,'loading');h.requests[4].reply(response([team(1)]));await h.settle()
  h.setAccount(other);assert.equal(h.state.status,'loading');h.requests[5].reply(response([],false,other));await h.settle();assert.equal(h.state.status,'none')
  h.wake();assert.equal(h.state.status,'none');h.requests[6].reply(response([],false,other));await h.settle();assert.equal(h.state.status,'none')
 }finally{h.dispose()}
})

test('multi-team rehearsal links open supported example recruitment routes, never fake real teams',()=>{
 const source=readFileSync(new URL('../../components/qa/CandidateBoardRehearsal.tsx',import.meta.url),'utf8')
 assert.match(source,/dev-flow\?scene=league&design=multiteam&flow=recruitment&sport=/)
 assert.doesNotMatch(source,/dev-flow\?[^`\s]*flow=roster/)
})
test('league joining preserves the waiting post and other team invitation, allowing a second team',()=>{
 let board=createDemoBoard({kind:'league',key:'lol'});board=applyDemoAction(board,'register',{positions:['mid'],tier:'gold',intro:'같이해요',availability:'수요일 저녁',consent:true,expected_revision:null});board=demoIncoming(board,2)
 for(let index=0;index<2;index++){const invite=board.incoming[index];board=applyDemoAction(board,'accept',{invite_id:invite.id,expected_revision:invite.revision});board=demoJoined(board);assert.equal(board.mine.status,'waiting');assert.equal(board.total_count,31);assert.equal(board.incoming[index].status,'joined');if(index===0)assert.equal(board.incoming[1].status,'pending')}
 assert.equal(board.incoming.filter(i=>i.status==='joined').length,2);const again=demoIncoming(board,2);assert.equal(again.incoming.length,2,'Joined team cannot re-invite the same member')
})
