import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const jsx=(type,props)=>({type,props:props??{}})
const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[node]
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]))
function load(file,deps){const exports={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,name=>{assert.ok(name in deps,name);return deps[name]});return exports}
function fixture(){
 const slots=[],contexts=[],effects=[],cleanups=[];let index=0
 const react={createContext(value){const context={value};context.Provider=context;contexts.push(context);return context},useContext:context=>context.value,useId:()=> 'room-menu-test',useRef(initial){const i=index++;return slots[i]??={current:initial}},useState(initial){const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next}]},useEffect(fn,deps){const i=index++;if(!same(slots[i]?.deps,deps)){slots[i]={deps};effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
 react.useLayoutEffect=react.useEffect
 const deps={react,'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'link'},'lucide-react':new Proxy({},{get:(_,p)=>p}),'./ChatAffiliationHeader':{default:'RoomHeader'},'@/components/chat-polls/ChatComposerActions':{default:'ComposerActions'},'@/lib/chat/social-messenger-state':load('lib/chat/social-messenger-state.ts',{}),'./social-messenger.module.css':{default:new Proxy({},{get:(_,p)=>p})}}
 const module=load('components/chat/SocialMessenger.tsx',deps)
 const saved={window:globalThis.window,document:globalThis.document};globalThis.window={getComputedStyle:()=>({borderTopWidth:'0.8px',borderBottomWidth:'0.8px'})};globalThis.document={addEventListener(){},removeEventListener(){}}
 return{module,contexts,render(component,props){index=0;return component(props)},flush(){effects.splice(0).forEach(fn=>fn())},close(){cleanups.forEach(fn=>fn?.());Object.assign(globalThis,saved)}}
}
test('top-right menu opens and closes while keeping poll and management draft subtrees mounted',()=>{
 const f=fixture(),tools=jsx('Polls',{draft:'보존할 투표 질문'}),management=jsx('Management',{draft:'보존할 일정'})
 const props={scope:'room-a',messages:[],composer:jsx('Composer',{}),tools,management,header:{title:'오픽 한 판',memberCount:3}}
 try{
  let tree=f.render(f.module.default,props);f.flush()
  const menu=tree=>flatten(tree).find(n=>n?.props?.className==='overlay')
  assert.equal(menu(tree).props.hidden,true)
  assert.equal(flatten(tree).filter(n=>n?.props?.role==='log').length,1)
  flatten(tree).find(n=>n?.type==='RoomHeader').props.onMenu()
  tree=f.render(f.module.default,props);f.flush();assert.equal(menu(tree).props.hidden,false)
  assert.ok(flatten(menu(tree)).includes(tools));assert.ok(flatten(menu(tree)).includes(management))
  flatten(tree).find(n=>n?.props?.['aria-label']==='방 메뉴 닫기').props.onClick()
  tree=f.render(f.module.default,props);f.flush();assert.equal(menu(tree).props.hidden,true)
  assert.ok(flatten(menu(tree)).includes(tools));assert.ok(flatten(menu(tree)).includes(management))
  flatten(tree).find(n=>n?.type==='RoomHeader').props.onMenu();tree=f.render(f.module.default,props);f.flush()
  tree=f.render(f.module.default,{...props,scope:'room-b'});f.flush();tree=f.render(f.module.default,{...props,scope:'room-b'})
  assert.equal(menu(tree).props.hidden,true,'a new room cannot inherit an open previous room menu')
 }finally{f.close()}
})
test('same aliases cannot determine ownership; unknown sender stays explicitly distinct',()=>{
 const f=fixture();try{
  const messages=[true,false,null].map((isMe,index)=>({id:String(index),isMe,alias:'같은 별명',text:'메시지',createdAt:'2026-09-14T00:00:00Z'}))
  const nodes=flatten(f.render(f.module.default,{scope:'room',messages,composer:null}))
  assert.deepEqual(nodes.filter(n=>n?.type==='article').map(n=>n.props['data-authorship']),['mine','other','unknown'])
  assert.ok(nodes.includes(' · 보낸 사람 확인 필요'))
 }finally{f.close()}
})
test('menu detail links use destination-specific labels and no link appears for a suppressed destination',()=>{
 const f=fixture(),header={title:'오픽 한 판',detailHref:'/meetups/activities/opic/rooms?gender_mode=all',detailLabel:'같은 활동 모집방 보기'}
 try{let nodes=flatten(f.render(f.module.default,{scope:'room',messages:[],composer:null,header}));const link=nodes.find(n=>n?.type==='link');assert.equal(link?.props.href,header.detailHref);assert.equal(link?.props.children,header.detailLabel);nodes=flatten(f.render(f.module.default,{scope:'room',messages:[],composer:null,header:{...header,detailHref:null}}));assert.ok(!nodes.some(n=>n?.type==='link'))}finally{f.close()}
})
test('composer plus action opens the menu before creating a poll',()=>{
 const f=fixture();let opened=0,created=0
 try{f.contexts[1].value=()=>opened++;const nodes=flatten(f.render(f.module.SocialChatComposer,{value:'',onChange(){},onSend(){},onCreatePoll(){created++}}));nodes.find(n=>n?.type==='ComposerActions').props.onCreatePoll();assert.equal(opened,1);assert.equal(created,1)}finally{f.close()}
})
test('composer includes border height and only scrolls after its multiline height limit',()=>{
 const f=fixture(),props={value:'',onChange(){},onSend(){}}
 try{
  let tree=f.render(f.module.SocialChatComposer,props),textarea=flatten(tree).find(n=>n?.type==='textarea')
  const element={scrollHeight:44,style:{}};textarea.props.ref.current=element;f.flush()
  assert.equal(element.style.height,'46px');assert.equal(element.style.overflowY,'hidden')
  element.scrollHeight=170;tree=f.render(f.module.SocialChatComposer,{...props,value:'여러 줄\n내용'});f.flush()
  assert.equal(element.style.height,'112px');assert.equal(element.style.overflowY,'auto')
  element.scrollHeight=44;tree=f.render(f.module.SocialChatComposer,props);f.flush()
  assert.equal(element.style.height,'46px');assert.equal(element.style.overflowY,'hidden')
 }finally{f.close()}
})
