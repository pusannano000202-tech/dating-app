import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const root=new URL('../../',import.meta.url),source=file=>readFileSync(new URL(file,root),'utf8')
const compile=file=>ts.transpileModule(source(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[node]
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]))
const id='10000000-0000-4000-8000-000000000001',messageId='20000000-0000-4000-8000-000000000001'
function fixture(){
 const slots=[],effects=new Map(),requests=[];let index=0,dirty=true,tree,alive=true
 const react={useState(initial){const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{if(alive){slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true}}]},useRef(initial){return(slots[index++]??={value:{current:initial}}).value},useCallback(fn,deps){const i=index++;if(!same(slots[i]?.deps,deps))slots[i]={value:fn,deps};return slots[i].value},useEffect(fn,deps){const i=index++;if(!slots[i])slots[i]={};if(!same(slots[i].deps,deps))effects.set(i,{fn,deps})}}
 react.useLayoutEffect=react.useEffect
 const helper={};new Function('exports',compile('lib/chat/social-messenger-state.ts'))(helper)
 const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'lucide-react':{},'@/lib/chat/useSocialChatRead':{useSocialChatRead(){}},'@/lib/chat/social-messenger-state':helper,'@/components/chat/SocialMessenger':{default:'messenger',SocialChatComposer:'composer'},'@/components/chat-polls/ActivityRoomPolls':{default:'polls'},'@/components/chat-polls/ChatComposerActions':{default:'actions'},'@/lib/chat-polls/offline-fixture':{createChatPollOfflineTransport(){}},'./league-match-chat.module.css':{default:new Proxy({},{get:(_,p)=>p})},'@/lib/meetups/league-lobby':{parseLeagueChatState:v=>v?.challenge_id===id&&Array.isArray(v.messages)?v:null,parseLeagueChatMessage:v=>v?.id&&typeof v.body==='string'&&typeof v.is_me==='boolean'?v:null}}
 const saved={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document}
 globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,reply(body,status=200){resolve({ok:status>=200&&status<300,status,json:async()=>body})}}))
 globalThis.window={setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout};globalThis.document={visibilityState:'visible'}
 const module={};new Function('exports','require',compile('components/community/department/LeagueMatchChat.tsx'))(module,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]})
 const onRefresh=async()=>{}
 function flush(){for(let n=0;dirty||effects.size;n++){assert.ok(n<30);if(dirty){index=0;dirty=false;tree=module.default({challengeId:id,demo:false,schedule:{type:'schedule',props:{}},onRefresh})}const now=[...effects];effects.clear();for(const[i,{fn,deps}]of now){slots[i].cleanup?.();slots[i]={deps,cleanup:fn()}}}}
 async function settle(){for(let n=0;n<20;n++){await Promise.resolve();flush()}}
 const chat={challenge_id:id,messages:[],writable:true,has_more:false,next_cursor:null}
 flush()
 return{requests,settle,flush,chat,get messenger(){return flatten(tree).find(n=>n?.type==='messenger')?.props},async start(){requests[0].reply({chat});await settle()},close(){alive=false;for(const slot of slots)slot?.cleanup?.();Object.assign(globalThis,saved)}}
}
test('match send preserves the next draft and moves schedule into separate messenger management',async()=>{
 const f=fixture();try{await f.start();assert.ok(f.messenger);assert.ok(f.messenger.management);f.messenger.composer.props.onChange('A');f.flush();f.messenger.composer.props.onSend();await f.settle();const sent=f.requests.find(r=>r.options?.method==='POST');assert.ok(sent);assert.equal(f.messenger.composer.props.disabled,false,'typing remains available while sending');f.messenger.composer.props.onChange('B');f.flush();sent.reply({message:{id:messageId,body:'A',alias:'같은 별명',is_me:true,created_at:'2026-09-13T00:00:00Z'}});await f.settle();assert.equal(f.messenger.composer.props.value,'B');assert.equal(f.messenger.messages.at(-1)?.isMe,true)}finally{f.close()}
})
test('malformed match acknowledgement preserves draft and retry identity',async()=>{
 const f=fixture();try{await f.start();assert.ok(f.messenger);f.messenger.composer.props.onChange('A');f.flush();f.messenger.composer.props.onSend();await f.settle();let sent=f.requests.find(r=>r.options?.method==='POST');const key=JSON.parse(sent.options.body).idempotency_key;sent.reply({message:{id:messageId,body:'다른 내용',is_me:true,created_at:'2026-09-13T00:00:00Z'}});await f.settle();assert.equal(f.messenger.composer.props.value,'A');assert.ok(f.messenger.error);f.messenger.onRetry();await f.settle();f.requests.at(-1).reply({chat:f.chat});await f.settle();f.messenger.composer.props.onChange('B');f.flush();f.messenger.composer.props.onChange('A');f.flush();f.messenger.composer.props.onSend();await f.settle();sent=f.requests.filter(r=>r.options?.method==='POST').at(-1);assert.equal(JSON.parse(sent.options.body).idempotency_key,key);sent.reply({},503);await f.settle()}finally{f.close()}
})
