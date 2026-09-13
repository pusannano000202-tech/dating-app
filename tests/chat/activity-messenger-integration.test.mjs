import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const id='10000000-0000-4000-8000-000000000001',messageId='20000000-0000-4000-8000-000000000001'
const jsx=(type,props,key)=>({type,props:props??{},key})
const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[node]
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]))
function compile(file,deps){const exports={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,name=>{assert.ok(name in deps,name);return deps[name]});return exports}
function fixture({embedded=true}={}){
 const slots=[],effects=new Map(),requests=[];let index=0,dirty=true,tree,component,props,alive=true,account=id
 const react={useState(initial){const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{if(alive){slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true}}]},useRef(initial){return(slots[index++]??={value:{current:initial}}).value},useCallback(fn,deps){const i=index++;if(!same(slots[i]?.deps,deps))slots[i]={value:fn,deps};return slots[i].value},useEffect(fn,deps){const i=index++;if(!slots[i])slots[i]={};if(!same(slots[i].deps,deps))effects.set(i,{fn,deps})},useLayoutEffect(fn,deps){this.useEffect(fn,deps)}}
 const deps={react,'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'link'},'next/navigation':{useRouter:()=>({replace(){}})},'lucide-react':{},'@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>account},'@/lib/chat/useSocialChatRead':{useSocialChatRead(){}},'@/lib/meetups/activity-room-contract':{activityRoomErrorMessage:code=>code,getActivityRoomDefinition:()=>({title:'오픽 같이 연습해요',category:'language'}),parseActivityRoomDetail:value=>value,parseActivityRoomMessagePage:value=>value,mergeActivityRoomMessages:(a,b)=>[...new Map([...a,...b].map(m=>[m.id,m])).values()]},'@/lib/meetups/activity-room-client':{fetchActivityRoom:(url,options)=>new Promise(resolve=>requests.push({url,options,reply(payload,ok=true){resolve({ok,payload})}}))},'@/lib/community/meetup-gender':{MEETUP_GENDER_LABELS:{all:'누구나'}},'./activity-rooms.module.css':{default:{}},'@/components/chat-polls/ActivityRoomPolls':{default:'polls'},'@/components/chat-polls/ChatComposerActions':{default:'actions'},'./ActivityPromptDeck':{default:'guide'},'@/components/chat/SocialMessenger':{default:'messenger',SocialChatComposer:'composer'},'@/lib/chat/social-messenger-state':compile('lib/chat/social-messenger-state.ts',{}),'@/components/chat/chat-belonging.module.css':{default:{}}}
 react.useLayoutEffect=(fn,deps)=>react.useEffect(fn,deps)
 deps['@/lib/social/activity-presentation']={getSocialActivityPresentation(metadata){assert.equal(metadata.kind,'activity_room');assert.equal(metadata.activity_key,'opic');return{categoryLabel:'어학'}}}
 const module=compile('components/meetups/ActivityRoomChat.tsx',deps)
 const saved={window:globalThis.window,document:globalThis.document};globalThis.window={setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){},confirm:()=>true};globalThis.document={visibilityState:'visible'}
 const entry=module.default({roomId:id,embedded});component=typeof entry.type==='function'?entry.type:module.default;props=typeof entry.type==='function'?entry.props:{roomId:id,embedded}
 function flush(){for(let n=0;dirty||effects.size;n++){assert.ok(n<30);if(dirty){index=0;dirty=false;tree=component(props)}const pending=[...effects];effects.clear();for(const[i,{fn,deps}]of pending){slots[i].cleanup?.();slots[i]={deps,cleanup:fn()}}}}
 async function settle(){for(let n=0;n<20;n++){await Promise.resolve();flush()}}
 const room={id,activity_key:'opic',gender_mode:'all',room_number:1,member_count:2,capacity:5,joined:true,members:[{alias:'같은 별명',is_me:true},{alias:'같은 별명',is_me:false}],messages:[{id:messageId,sender_alias:'같은 별명',message:'반가워요',created_at:'2026-09-14T00:00:00Z',is_me:true}]}
 flush()
 return{requests,flush,settle,room,get messenger(){return flatten(tree).find(n=>n?.type==='messenger')?.props},async start(){requests[0].reply({data:room});await settle()},entry:()=>module.default({roomId:id,embedded:true}),switchAccount(next){account=next},close(){alive=false;for(const slot of slots)slot?.cleanup?.();Object.assign(globalThis,saved)}}
}
test('legacy activity chat uses shared messenger with server ownership, polls and leave in management',async()=>{
 const f=fixture();try{await f.start();assert.ok(f.messenger,'activity chat must use the same messenger');assert.equal(f.messenger.messages[0].isMe,true);assert.equal(f.messenger.tools.type,'polls');assert.ok(flatten(f.messenger.management).some(n=>n?.type==='button'&&flatten(n).includes('이 방 나가기')))}finally{f.close()}
})
test('standalone activity chat uses canonical category and labels its activity lobby destination',async()=>{
 const f=fixture({embedded:false});try{await f.start();assert.equal(f.messenger.header.categoryLabel,'어학');assert.equal(f.messenger.header.detailHref,'/meetups/activities/opic/rooms?gender_mode=all');assert.equal(f.messenger.header.detailLabel,'같은 활동 모집방 보기');assert.ok(f.messenger.tools);assert.ok(f.messenger.management)}finally{f.close()}
})
test('activity account change remounts the room and cannot preserve another account draft',async()=>{
 const f=fixture();try{const before=f.entry();f.switchAccount(messageId);assert.notEqual(f.entry().key,before.key)}finally{f.close()}
})
test('activity uncertain retry reuses key and successful send preserves a newer draft',async()=>{
 const f=fixture();try{await f.start();assert.ok(f.messenger);f.messenger.composer.props.onChange('A');f.flush();f.messenger.composer.props.onSend();await f.settle();const first=f.requests.at(-1),key=JSON.parse(first.options.body).idempotency_key;first.reply({error:'uncertain'},false);await f.settle();assert.equal(f.messenger.composer.props.value,'A');f.messenger.composer.props.onSend();await f.settle();const retry=f.requests.at(-1);assert.equal(JSON.parse(retry.options.body).idempotency_key,key);f.messenger.composer.props.onChange('B');f.flush();retry.reply({data:{id:messageId,message:'A',sender_alias:'같은 별명',created_at:'2026-09-14T00:00:00Z',is_me:true}});await f.settle();assert.equal(f.messenger.composer.props.value,'B');f.requests.at(-1).reply({data:f.room});await f.settle()}finally{f.close()}
})
