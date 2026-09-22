import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const compile=file=>ts.transpileModule(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
function pure(file){const out={};new Function('exports',compile(file))(out);return out}
const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[node]
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]))
const id='10000000-0000-4000-8000-000000000001',messageId='20000000-0000-4000-8000-000000000001'
function fixture(){
 const slots=[],effects=new Map(),requests=[];let index=0,dirty=true,tree,alive=true
 const react={useState(initial){const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{if(alive){slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true}}]},useRef(initial){return(slots[index++]??={value:{current:initial}}).value},useCallback(fn,deps){const i=index++;if(!same(slots[i]?.deps,deps))slots[i]={value:fn,deps};return slots[i].value},useMemo(fn,deps){const i=index++;if(!same(slots[i]?.deps,deps))slots[i]={value:fn(),deps};return slots[i].value},useEffect(fn,deps){const i=index++;if(!slots[i])slots[i]={};if(!same(slots[i].deps,deps))effects.set(i,{fn,deps})}}
 const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'next/link':{default:'link'},'next/navigation':{useRouter:()=>({push(){},replace(){}})},'lucide-react':{},'@/lib/chat/useSocialChatRead':{useSocialChatRead(){}},'@/lib/chat/social-room-presentation':{socialChatHref:()=>'/chat'},'@/components/places/PlaceLinks':{default:'places'},'@/components/chat-polls/ActivityRoomPolls':{default:'polls'},'@/components/chat-polls/ChatComposerActions':{default:'actions'},'@/components/chat/SocialMessenger':{default:'messenger',SocialChatComposer:'composer'},'@/lib/chat/social-messenger-state':pure('lib/chat/social-messenger-state.ts'),'@/lib/community/catalog':{getMeetupCategoryLabel:()=> '모임'},'@/lib/community/meetup-gender':{MEETUP_GENDER_LABELS:{all:'누구나'}},'@/lib/community/meetup-place':{projectLegacyMeetupPlace:()=>null},'./LiveActivityGuide':{default:'guide'},'./MeetupApplications':{default:'applications'},'./MeetupCreatedNotice':{default:'created'}}
 deps['@/lib/meetups/create-context']={getMeetupDetailBackLink(){throw new Error('chat-only room must not derive a detail return link')}}
 const detail={id,category:'dining',title:'정한 모임',description:'',activity_key:null,place_name:null,scheduled_at:null,ends_at:null,schedule_status:'schedule_pending',capacity:5,member_count:2,status:'open',gender_mode:'all',scope_type:'school',department_label:null,revision:0,joined:true,is_host:true,scope_eligibility:'eligible',members:[],events:[]}
 const saved={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document}
 globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,reply(body,status=200){resolve({ok:status===200,status,json:async()=>body})}}))
 globalThis.window={setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){}};globalThis.document={visibilityState:'visible'}
 const module={};new Function('exports','require',compile('components/meetups/MeetupDetailExperience.tsx'))(module,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]})
 function flush(){for(let n=0;dirty||effects.size;n++){assert.ok(n<30);if(dirty){index=0;dirty=false;tree=module.default({meetupId:id,chatOnly:true})}const now=[...effects];effects.clear();for(const[i,{fn,deps}]of now){slots[i].cleanup?.();slots[i]={deps,cleanup:fn()}}}}
 async function settle(){for(let n=0;n<20;n++){await Promise.resolve();flush()}}
 flush()
 return{requests,settle,flush,get messenger(){return flatten(tree).find(n=>n?.type==='messenger')?.props},async start(chatStatus=200,guide=null){requests[0].reply({meetup:detail});await settle();requests.find(r=>r.url.endsWith('/chat')).reply(chatStatus===200?{chat:{phase:'send',messages:[{id:messageId,sender_alias:'별친구',message:'반가워요',created_at:'2026-09-13T00:00:00Z',is_me:true}]}}:{error:'unavailable'},chatStatus);requests.find(r=>r.url.endsWith('/guide')).reply({guide});await settle()},close(){alive=false;for(const slot of slots)slot?.cleanup?.();Object.assign(globalThis,saved)}}
}
test('meetup mounts shared messenger with server authorship and independent chat failure/retry',async()=>{
 const f=fixture();try{await f.start(503);assert.ok(f.messenger,'actual room must mount shared messenger');assert.ok(f.messenger.error);assert.equal(f.messenger.readOnly,false,'fetch failure is not ended participation');assert.equal(typeof f.messenger.onRetry,'function');const before=f.requests.length;f.messenger.onRetry();await f.settle();assert.equal(f.requests.length,before+1);assert.ok(f.requests.at(-1).url.endsWith('/chat'));f.requests.at(-1).reply({chat:{phase:'send',messages:[{id:messageId,sender_alias:'동일한 별명',message:'내 대화',created_at:'2026-09-13T00:00:00Z',is_me:true}]}});await f.settle();assert.equal(f.messenger.messages[0].isMe,true);assert.ok(!f.messenger.error)}finally{f.close()}
})
test('uncertain sends reuse identity key and an acknowledged older send preserves a newer draft',async()=>{
 const f=fixture();try{await f.start();assert.ok(f.messenger);let composer=f.messenger.composer.props;composer.onChange('A');f.flush();f.messenger.composer.props.onSend();await f.settle();let sent=f.requests.find(r=>r.options?.method==='POST');const key=JSON.parse(sent.options.body).idempotency_key;sent.reply({error:'uncertain'},503);await f.settle();assert.equal(f.messenger.composer.props.value,'A');f.messenger.composer.props.onSend();await f.settle();sent=f.requests.filter(r=>r.options?.method==='POST').at(-1);assert.equal(JSON.parse(sent.options.body).idempotency_key,key);f.messenger.composer.props.onChange('B');f.flush();sent.reply({message:{id:messageId,sender_alias:'나',message:'A',created_at:'2026-09-13T00:00:00Z'}});await f.settle();assert.equal(f.messenger.composer.props.value,'B')}finally{f.close()}
})
test('a malformed successful HTTP response cannot acknowledge a meetup draft',async()=>{
 const f=fixture();try{await f.start();f.messenger.composer.props.onChange('보존할 초안');f.flush();f.messenger.composer.props.onSend();await f.settle();f.requests.find(r=>r.options?.method==='POST').reply({});await f.settle();assert.equal(f.messenger.composer.props.value,'보존할 초안');assert.ok(f.messenger.error)}finally{f.close()}
})

test('chat-only guide closes management to return to the conversation without a dead DOM target',async()=>{
 const f=fixture();try{await f.start(200,{personal_revision:0});let closed=0;assert.equal(typeof f.messenger.management,'function');const managed=f.messenger.management(()=>{closed++}),guide=flatten(managed).find(n=>n?.type==='guide');assert.ok(guide);await guide.props.onAction('open_chat','prepare');assert.equal(closed,1);assert.equal(f.requests.some(r=>r.options?.method==='POST'),false)}finally{f.close()}
})
