import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const compile=file=>ts.transpileModule(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
function pure(file){const exports={};new Function('exports',compile(file))(exports);return exports}
const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[node]
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
const row=n=>({id:'20000000-0000-4000-8000-'+String(n).padStart(12,'0'),title:'모임 '+n,category:'dining',member_count:1,capacity:3})
const cursor=n=>JSON.stringify([null,'2026-09-11T00:00:00Z',row(n).id])
const page=(rows,more=false)=>({meetups:rows,availability:'ready',has_more:more,next_cursor:more?cursor(Number(rows.at(-1).id.slice(-12))):null})
function harness(){
 let index=0,dirty=true,mounted=true,output,props={categories:['dining'],genderMode:'female_only',imageSrc:'/test.webp'}
 const slots=[],effects=new Map(),requests=[]
 const react={
  useState(initial){const i=index++;if(!slots[i])slots[i]={value:initial};return[slots[i].value,value=>{if(mounted){slots[i].value=typeof value==='function'?value(slots[i].value):value;dirty=true}}]},
  useRef(initial){const i=index++;return(slots[i]??={value:{current:initial}}).value},
  useCallback(fn,deps){const i=index++;if(!same(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn},
  useEffect(fn,deps){const i=index++;if(!slots[i])slots[i]={};if(!same(slots[i].deps,deps))effects.set(i,{fn,deps})},
 }
 const fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,reply(body,status=200){resolve({ok:status===200,status,json:async()=>body})}}))
 const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'next/link':{default:'link'},'next/image':{default:'image'},'lucide-react':{},'@/components/i18n/QuantumLocaleProvider':{useQuantumLocale:()=>({t:x=>x})},'@/lib/meetups/create-flow':pure('lib/meetups/create-flow.ts'),'@/lib/meetups/list-page':pure('lib/meetups/list-page.ts'),'@/lib/community/catalog':{featuredMeetupIdeas:[],getMeetupCategoryLabel:x=>x},'./meetup-discovery.module.css':{default:{}}}
 deps['@/lib/meetups/create-context']={buildContextualMeetupCreateHref:({category,genderMode})=>'/meetups/create?'+new URLSearchParams({category,gender_mode:genderMode})}
 const exports={};new Function('exports','require','fetch','window',compile('components/meetups/CustomMeetupShelf.tsx'))(exports,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]},fetch,{setTimeout:()=>1,clearTimeout(){}})
 function flush(){for(let turns=0;dirty||effects.size;turns++){assert.ok(turns<30);if(dirty){index=0;dirty=false;output=exports.default(props)}const pending=[...effects];effects.clear();for(const[i,{fn,deps}]of pending){slots[i].cleanup?.();slots[i]={fn,deps,cleanup:fn()}}}}
 async function settle(){for(let i=0;i<20;i++){await Promise.resolve();flush()}}
 const tree=()=>flatten(output)
 flush()
 return{requests,settle,get tree(){return tree()},get cards(){return tree().filter(n=>n?.type==='link'&&/^\/meetups\/[0-9]/.test(n.props.href))},
 more(){const button=tree().find(n=>n?.type==='button'&&n.props.children==='모임 더 보기');assert.ok(button);button.props.onClick();flush()},
 gender(value){props={...props,genderMode:value};dirty=true;flush()},
 close(){mounted=false;for(const slot of slots)slot?.cleanup?.()},
 }
}
test('custom shelf can reach the pending tail and retains female-only scope on every page',async()=>{
 const f=harness()
 try{
  f.requests[0].reply(page([row(1),row(2),row(3)],true));await f.settle();assert.equal(f.cards.length,3)
  f.more();const query=new URL(f.requests[1].url,'https://test').searchParams
  assert.equal(query.get('gender_mode'),'female_only');assert.equal(query.get('cursor'),cursor(3));assert.equal(query.get('scope_type'),'school')
  f.requests[1].reply(page([{...row(4),schedule_status:'schedule_pending',scheduled_at:null}]));await f.settle();assert.equal(f.cards.length,4)
  assert.ok(!f.tree.some(n=>n?.type==='button'&&n.props.children==='모임 더 보기'))
 }finally{f.close()}
})
test('page failure keeps visible cards and retries the same cursor, while filter changes discard late pages',async()=>{
 const f=harness()
 try{
  f.requests[0].reply(page([row(1),row(2),row(3)],true));await f.settle();f.more()
  f.requests[1].reply({error:'unavailable'},503);await f.settle();assert.equal(f.cards.length,3);f.more()
  assert.equal(f.requests[1].url,f.requests[2].url)
  f.gender('all');assert.equal(f.cards.length,0);assert.equal(f.requests[2].options.signal.aborted,true)
  f.requests[3].reply(page([row(5)]));await f.settle();f.requests[2].reply(page([row(4)]));await f.settle()
  assert.deepEqual(f.cards.map(n=>n.props.href),['/meetups/'+row(5).id])
 }finally{f.close()}
})
