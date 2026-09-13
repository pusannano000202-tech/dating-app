import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

test('creation header clears old department immediately and discards stale profile responses after an account switch',async()=>{
 const slots=[],effects=new Map(),requests=[];let index=0,dirty=true,tree,account
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
 const react={useState(initial){const i=index++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true}]},useRef(initial){return(slots[index++]??={value:{current:initial}}).value},useMemo(fn,deps){const i=index++;if(!same(slots[i]?.deps,deps))slots[i]={value:fn(),deps};return slots[i].value},useEffect(fn,deps){const i=index++;slots[i]??={};if(!same(slots[i].deps,deps))effects.set(i,{fn,deps})}}
 const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'next/image':{default:'image'},'next/link':{default:'a'},'next/navigation':{useRouter:()=>({}),useSearchParams:()=>new URLSearchParams('scope=department')},'lucide-react':{},'@/components/i18n/QuantumLocaleProvider':{useQuantumLocale:()=>({t:x=>x})},'@/components/i18n/LanguagePicker':{default:'language'},'@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>account},'@/lib/meetups/create-flow':{getMeetupCreateBackHref:()=>'/meetups/department',meetupKoreanDateInput:()=>''},'@/lib/meetups/study-catalog':{getStudyCourse:()=>null,searchStudyCourses:()=>[]},'@/lib/meetups/contracts':{},'@/lib/community/catalog':{featuredMeetupIdeas:[],meetupDiscoveryGroups:[],studyTopicGroups:[],getMeetupDiscoveryCategories:()=>[],getMeetupCapacityRecommendation:()=>5,getMeetupCategoryLabel:()=> '러닝'},'@/lib/community/contracts':{isMeetupCategory:()=>false},'@/lib/community/meetup-gender':{isMeetupGenderMode:()=>false,MEETUP_GENDER_MODES:[],MEETUP_GENDER_LABELS:{}},'@/lib/meetups/idempotency':{},'@/lib/meetups/create-draft':{},'./create-meetup.module.css':{default:{}}}
 const code=ts.transpileModule(readFileSync(new URL('../../components/meetups/CreateMeetupForm.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const module={};new Function('exports','require',code)(module,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]})
 const originalFetch=globalThis.fetch
 globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,reply(label){resolve({ok:true,json:async()=>({profile:{department:label}})})}}))
 const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[node]
 const text=()=>flatten(tree).filter(v=>typeof v==='string').join(' ')
 function render(){index=0;dirty=false;tree=module.default()}
 function flush(){for(let n=0;dirty||effects.size;n++){assert.ok(n<30);if(dirty)render();const queued=[...effects];effects.clear();for(const[i,{fn,deps}]of queued){slots[i].cleanup?.();slots[i]={deps,cleanup:fn()}}}}
 async function settle(){for(let n=0;n<20;n++){await Promise.resolve();flush()}}
 try{
  flush();assert.equal(requests.length,0);account='account-a';dirty=true;flush();assert.equal(requests.length,1);requests[0].reply('수학과');await settle();assert.match(text(),/수학과/)
  account='account-b';render();assert.doesNotMatch(text(),/수학과/,'no render with the previous account label');flush();assert.equal(requests.length,2)
  account='account-c';dirty=true;flush();assert.equal(requests.length,3);assert.equal(requests[1].options.signal.aborted,true)
  requests[1].reply('전 계정 학과');await settle();assert.doesNotMatch(text(),/전 계정 학과/)
  requests[2].reply('컴퓨터공학전공');await settle();assert.match(text(),/컴퓨터공학전공/)
  account=null;render();assert.doesNotMatch(text(),/컴퓨터공학전공/);flush();assert.equal(requests.length,3)
 }finally{for(const slot of slots)slot?.cleanup?.();globalThis.fetch=originalFetch}
})
