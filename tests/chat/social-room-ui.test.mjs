import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const owner = '10000000-0000-4000-8000-000000000001'
const roomId = '20000000-0000-4000-8000-000000000001'
const jsx = (type, props, key) => ({type, props: props ?? {}, key})
const flatten = value => !value ? [] : Array.isArray(value) ? value.flatMap(flatten) : typeof value === 'object' ? [value, ...flatten(value.props?.children)] : [value]
async function moduleAt(path, dependencies) {
  const source = await readFile(new URL('../../' + path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText
  const exports = {}
  new Function('exports', 'require', compiled)(exports, name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: 'fragment'}
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  })
  return exports
}
function hooks() {
  const values = [], cleanups = [], effects = []; let index = 0
  const memo = (factory, deps) => {const i = index++; if (!values[i] || deps.some((v,j) => v !== values[i].deps[j])) values[i] = {value: factory(), deps}; return values[i].value}
  return {
    react: {
      useState(initial) {const i = index++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], next => {values[i] = typeof next === 'function' ? next(values[i]) : next}]},
      useRef(initial) {const i = index++; return values[i] ??= {current: initial}},
      useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
      useEffect(fn, deps) {const i = index++; if (!values[i] || deps.some((v,j) => v !== values[i][j])) {values[i] = deps; effects.push(() => {cleanups[i]?.(); cleanups[i] = fn()})}},
    },
    render(fn, props) {index = 0; return fn(props)},
    flush() {effects.splice(0).forEach(fn => fn())},
    cleanup() {cleanups.forEach(fn => fn?.())},
  }
}
test('home and meetup resume destinations use canonical CHAT without changing public creation detail', async () => {
  const {myMeetupHref}=await moduleAt('lib/home/my-meetups.ts',{})
  assert.equal(myMeetupHref({kind:'activity_room',id:roomId}),'/chat/rooms/activity_room/'+roomId)
  assert.equal(myMeetupHref({kind:'scheduled',id:roomId}),'/chat/rooms/meetup/'+roomId)
  const {createdMeetupHref}=await moduleAt('lib/meetups/create-flow.ts',{})
  assert.equal(createdMeetupHref({meetup:{id:roomId}}),'/meetups/'+roomId+'?created=1')
})
async function wrapperHarness() {
  const h = hooks(), state = {owner}, pending = [], children = {}
  const contract = await moduleAt('lib/chat/social-rooms-contract.ts', {})
  for (const name of ['MeetupDetailExperience','ActivityRoomChat','StudyRoomExperience','MentoringExperience','HostedMentoringRoom']) children[`@/components/meetups/${name}`] = {default: name}
  children['@/components/community/department/LeagueMatchChat'] = {default: 'LeagueMatchChat'}
  children['@/components/community/department/DepartmentLeagueJourney'] = {default: 'DepartmentLeagueJourney'}
  const module = await moduleAt('components/chat/SocialChatRoomPage.tsx', {
    react: h.react, 'next/link': {default: 'a'}, '@/components/content-history/useHistoryAccount': {useHistoryAccount: () => state.owner},
    '@/lib/chat/social-rooms-contract': contract,
    '@/lib/chat/social-room-presentation': {socialRoomDetailHref: ({kind,id}) => `/detail/${kind}/${id}`},
    '@/lib/social/activity-presentation': {getSocialActivityPresentation:()=>({categoryLabel:'모임'})},
    '@/components/chat/SocialMessenger': {SocialChatRoomContext:{Provider:'RoomContext'}}, './chat-belonging.module.css':{default:{}}, ...children,
  })
  const original = {fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document}
  globalThis.fetch = (_url, init) => new Promise(resolve => pending.push({resolve, signal: init?.signal}))
  globalThis.window = {addEventListener(){}, removeEventListener(){}, setInterval(){return 1}, clearInterval(){}}
  globalThis.document = {visibilityState: 'visible'}
  const props = {kind: 'meetup', id: roomId}
  const room = {kind: 'meetup', id: roomId, title:'우리 모임', affiliation:'모임 참가자', member_count:2, writable:true, updated_at:'2026-09-11T00:00:00Z'}
  return {...h, state, pending, props, room, render: () => h.render(module.default, props),
    async answer(data = {owner_id:state.owner, rooms:[room], has_more:false, next_cursor:null}, status = 200) {pending.shift().resolve({ok:status === 200, status, json:async()=>data}); await new Promise(resolve => setImmediate(resolve))},
    close(){h.cleanup(); Object.assign(globalThis, original)},
  }
}
test('CHAT room mounts no conversation until exact current-owner metadata passes', async () => {
  const f = await wrapperHarness()
  try {assert.ok(!flatten(f.render()).some(n => n.type === 'MeetupDetailExperience')); f.flush(); await f.answer(); const tree = flatten(f.render()); assert.equal(tree.find(n => n.type === 'RoomContext')?.props.value.title,f.room.title); assert.ok(tree.some(n => n.type === 'MeetupDetailExperience' && n.props.chatOnly && n.props.meetupId === roomId))} finally {f.close()}
})
test('CHAT room immediately hides old-account children and ignores late account response', async () => {
  const f = await wrapperHarness()
  try {f.render(); f.flush(); await f.answer(); f.render(); f.state.owner = '10000000-0000-4000-8000-000000000002'; assert.ok(!flatten(f.render()).some(n => n.type === 'MeetupDetailExperience')); f.flush(); await f.answer({owner_id:owner, rooms:[f.room],has_more:false,next_cursor:null}); assert.ok(!flatten(f.render()).some(n => n.type === 'MeetupDetailExperience'))} finally {f.close()}
})
test('canonical activity chat does not link its room menu back to the duplicate legacy chat',async()=>{
 const f=await wrapperHarness()
 try{f.props.kind='activity_room';f.room.kind='activity_room';f.render();f.flush();await f.answer();const tree=flatten(f.render());assert.equal(tree.find(n=>n?.type==='RoomContext')?.props.value.detailHref,null);assert.ok(tree.some(n=>n?.type==='ActivityRoomChat'&&n.props.embedded))}finally{f.close()}
})
test('CHAT room denies wrong-room, wrong-kind, ambiguous and failed metadata', async () => {
  for (const transform of [r => [{...r,id:owner}], r => [{...r,kind:'study_room'}], r => [r,{...r,id:owner}], () => []]) {
    const f = await wrapperHarness()
    try {f.render();f.flush();await f.answer({owner_id:owner,rooms:transform(f.room),has_more:false,next_cursor:null}); assert.ok(!flatten(f.render()).some(n => n.type === 'MeetupDetailExperience'))} finally {f.close()}
  }
})
test('CHAT routes reuse each existing store adapter and propagate read-only metadata', async () => {
  for (const [kind, component, prop] of [['activity_room','ActivityRoomChat','roomId'],['study_room','StudyRoomExperience','fixedRoomId'],['mentoring','MentoringExperience','fixedSessionId'],['league_match','LeagueMatchChat','challengeId']]) {
    const f = await wrapperHarness()
    try {f.props.kind = kind; f.room.kind = kind; f.room.writable = false; f.render(); f.flush(); await f.answer(); const child = flatten(f.render()).find(n=>n.type === component); assert.equal(child?.props[prop], roomId); if (kind !== 'league_match') assert.equal(child.props.readOnly,true); else assert.equal(child.props.scheduled,undefined)} finally {f.close()}
  }
})
test('CHAT URL change fences a pending old-room response before effects run', async () => {
  const f = await wrapperHarness()
  try {f.render(); f.flush(); f.props.id = owner; f.render(); await f.answer(); assert.ok(!flatten(f.render()).some(n=>n.type === 'MeetupDetailExperience')); f.flush(); await f.answer({owner_id:owner,rooms:[{...f.room,id:owner}],has_more:false,next_cursor:null}); assert.equal(flatten(f.render()).find(n=>n.type === 'MeetupDetailExperience')?.props.meetupId,owner)} finally {f.close()}
})

test('denied study and mentoring chat keeps a safe exact-room participation-management exit without mounting conversation',async()=>{
 for(const kind of ['study_room','mentoring']){
  const f=await wrapperHarness()
  try{
   f.props.kind=kind;f.room.kind=kind;f.render();f.flush();await f.answer({error:'forbidden'},403)
   const tree=flatten(f.render()),href=kind==='study_room'?`/meetups/study?room=${roomId}`:`/meetups/mentoring-rooms/${roomId}`
   assert.ok(tree.some(n=>n?.type==='a'&&n.props.href===href))
   assert.ok(!tree.some(n=>['StudyRoomExperience','MentoringExperience','HostedMentoringRoom'].includes(n?.type)))
  }finally{f.close()}
 }
})

test('hosted mentoring uses its own adapter only after current membership metadata, while legacy remains separate',async()=>{
 const f=await wrapperHarness()
 try{f.props.kind='mentoring';f.room.kind='mentoring';f.room.recruitment_mode='hosted';f.render();f.flush();await f.answer();const tree=flatten(f.render());assert.equal(tree.find(n=>n?.type==='HostedMentoringRoom')?.props.id,roomId);assert.ok(!tree.some(n=>n?.type==='MentoringExperience'))}finally{f.close()}
})
test('CHAT signed-out account does not request private metadata', async () => {
  const f = await wrapperHarness()
  try {f.state.owner=null; const tree=flatten(f.render()); f.flush(); assert.equal(f.pending.length,0); assert.ok(tree.includes('로그인이 필요해요')); assert.ok(!tree.some(n=>n.type === 'MeetupDetailExperience'))} finally {f.close()}
})
test('study CHAT shows existing conversation first and collapses planning, preserving leave/report', async () => {
  const h = hooks()
  const panel = await moduleAt('components/meetups/StudySessionPanel.tsx', {
    '@/components/chat-polls/ActivityRoomPolls':{default:'ActivityRoomPolls'},
    '@/components/chat/SocialMessenger':{default:'SocialMessenger',SocialChatComposer:'SocialChatComposer'},
    '@/lib/chat/social-messenger-state':await moduleAt('lib/chat/social-messenger-state.ts',{}),
    '@/lib/chat/useSocialChatRead':{useSocialChatRead(){}},
    react:h.react, 'next/image':{default:'img'}, 'lucide-react':new Proxy({}, {get:(_,name)=>String(name)}),
    '@/lib/meetups/study-catalog':{getStudyCourse:()=>null,getStudyCoursePhoto:()=>({src:'/photo',description:'study'})},
    '@/lib/meetups/study-guide':{getStudyGuide:()=>null},
    '@/lib/meetups/study-venues':{STUDY_VENUE_SOURCE:{},STUDY_VENUE_SUGGESTIONS:[]},
    '@/lib/meetups/study-room-client-state':{clearAcknowledgedDraft:()=>'',formatStudyTime:value=>value}, './study-room.module.css':{default:{}},
  })
  const room = {id:roomId,current_session:1,status:'active',course_name:'물리',course_id:'physics',level:'beginner',room_number:1,member_count:1,members:[],messages:[{id:owner,sender_alias:'별명',message:'기존 대화',created_at:'2026-09-11'}],sessions:[{session_number:1,status:'planning',my_attendance:'pending',recaps:[],proposals:[]}]}
  const tree = h.render(panel.default,{room,busy:false,chatOnly:true,onAction:async()=>true,onLeave:async()=>{},onOlderMessages:async()=>{}})
  assert.equal(tree.type,'SocialMessenger')
  assert.equal(tree.props.messages[0].text,'기존 대화')
  const management=flatten(tree.props.management)
  assert.ok(management.includes('날짜·장소 투표'));assert.ok(management.includes('모임 나가기'));assert.ok(management.includes('신고하고 나가기'))
  assert.ok(!flatten(tree).includes('날짜·장소 투표'),'management is not appended to the message scroll area')
  const readonly = flatten(h.render(panel.default,{room,busy:false,chatOnly:true,readOnly:true,onAction:async()=>true,onLeave:async()=>{},onOlderMessages:async()=>{}}))
  assert.equal(readonly.find(n=>n?.type==='SocialMessenger').props.composer.props.disabled,true)
  const polls=h.render(panel.default,{room,busy:false,chatOnly:true,readTrackingEnabled:true,onAction:async()=>true,onLeave:async()=>{},onOlderMessages:async()=>{}})
  assert.equal(polls.props.tools.props.roomKind,'study-rooms');assert.equal(polls.props.tools.props.roomId,roomId,'poll belongs to the study room, not the selected session')
  assert.equal(typeof polls.props.composer.props.onCreatePoll,'function')
  const ended=h.render(panel.default,{room:{...room,status:'completed'},busy:false,chatOnly:true,readTrackingEnabled:true,onAction:async()=>true,onLeave:async()=>{},onOlderMessages:async()=>{}})
  assert.equal(ended.props.tools.props.readOnly,true);assert.equal(ended.props.composer.props.onCreatePoll,undefined)
})

test('mentoring fixed CHAT session ignores query targets and never reveals a different active session', async () => {
  const demo = await moduleAt('lib/mentoring/group-demo.ts',{})
  const contract = await moduleAt('lib/mentoring/group-contract.ts',{})
  const notification = await moduleAt('lib/notifications/common-contract.ts',{})
  let snapshot = demo.createMentoringDemo()
  for (const [action,args] of [['join',{role:'mentee',side_size:2,friend_ids:[]}],['demo_offer',{}],['accept',{}],['demo_all_accept',{}]]) snapshot=demo.advanceMentoringDemo(snapshot,{action,args})
  assert.ok(contract.parseGroupMentoringSnapshot(snapshot))
  for (const match of [true,false]) {
    const h=hooks(),requests=[],navigation=[], router={push:url=>navigation.push(url)}
    const module=await moduleAt('components/meetups/MentoringExperience.tsx',{
      '@/lib/chat/useSocialChatRead':{useSocialChatRead(){}},
      './HostedMentoringLobby':{default:'HostedMentoringLobby'},
      '@/components/chat/SocialMessenger':{default:'SocialMessenger',SocialChatComposer:'SocialChatComposer'},
      react:{...h.react,Suspense:'suspense'}, 'next/image':{default:'img'}, 'next/link':{default:'a'}, 'next/navigation':{useRouter:()=>router,useSearchParams:()=>new URLSearchParams({session:owner,party:owner})},
      'lucide-react':new Proxy({}, {get:(_,name)=>String(name)}), '@/components/i18n/QuantumLocaleProvider':{useQuantumLocale:()=>({locale:'ko',t:key=>key})},
      '@/lib/supabase':{createClient:()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})},
      '@/lib/chat/social-room-presentation':{socialChatHref:({kind,id})=>`/chat/rooms/${kind}/${id}`},
      '@/lib/notifications/common-contract':notification,'@/lib/mentoring/group-contract':contract,'@/lib/mentoring/group-demo':demo,'./mentoring.module.css':{default:{}},
    })
    const saved={fetch:globalThis.fetch,window:globalThis.window}
    globalThis.window={setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){}}
    globalThis.fetch=async(url)=>{requests.push(url);return{ok:true,json:async()=>({data:snapshot})}}
    try {
      const props={chatOnly:true,fixedSessionId:match?snapshot.session_id:roomId}
      const content=module.default(props).props.children.type
      h.render(content,props);h.flush();await new Promise(resolve=>setImmediate(resolve));const nodes=flatten(h.render(content,props))
      assert.deepEqual(requests,['/api/mentoring']); assert.equal(navigation.length,0)
      const messenger=nodes.find(n=>n?.type==='SocialMessenger')
      assert.ok(messenger)
      assert.equal(messenger.props.composer.props.disabled,!match)
      assert.ok(!nodes.includes('mentor.invitation'));assert.ok(!nodes.includes('mentor.chooseSize'))
      const management=flatten(messenger.props.management)
      if(match){assert.deepEqual(messenger.props.messages.map(m=>m.isMe),snapshot.messages.map(m=>m.mine));assert.ok(management.includes('mentor.report'));assert.ok(management.includes('mentor.plan'));assert.ok(management.includes('mentor.end'))} else {assert.deepEqual(messenger.props.messages,[]);assert.ok(management.some(n=>typeof n==='string'&&n.includes('다른 멘토링 방으로 자동 이동하지 않아요')))}
    } finally {h.cleanup();Object.assign(globalThis,saved)}
  }
})

test('meetup quiet polling updates chat while preserving the host schedule drafts', async () => {
  const h=hooks(),ticks=[],writes=[],router={push(){},replace(){}},saved={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document}
  const detail={id:roomId,category:'cafe',activity_key:null,title:'모임',description:'',place_name:'기존 장소',scheduled_at:'2026-09-15T03:00:00Z',ends_at:'2026-09-15T05:00:00Z',capacity:5,member_count:2,status:'open',gender_mode:'mixed',scope_type:'school',department_label:null,revision:1,joined:true,is_host:true,scope_eligibility:'eligible',members:[],events:[]}
  let latestMessage='처음 대화'
  const module=await moduleAt('components/meetups/MeetupDetailExperience.tsx',{
    '@/components/chat/SocialMessenger':{default:'SocialMessenger',SocialChatComposer:'SocialChatComposer'},
    '@/lib/chat/social-messenger-state':await moduleAt('lib/chat/social-messenger-state.ts',{}),
    '@/lib/meetups/create-context':{getMeetupDetailBackLink(){throw new Error('chat-only room must not derive a detail return link')}},
    './MeetupCreatedNotice':{default:'MeetupCreatedNotice'},
    '@/lib/chat/useSocialChatRead':{useSocialChatRead(){}},
    react:h.react,'next/link':{default:'a'},'next/navigation':{useRouter:()=>router},'lucide-react':new Proxy({}, {get:(_,name)=>String(name)}),
    '@/lib/chat/social-room-presentation':{socialChatHref:({kind,id})=>`/chat/rooms/${kind}/${id}`},
    '@/components/places/PlaceLinks':{default:'PlaceLinks'},'@/components/chat-polls/ActivityRoomPolls':{default:'ActivityRoomPolls'},'@/components/chat-polls/ChatComposerActions':{default:'ChatComposerActions'},
    '@/lib/community/catalog':{getMeetupCategoryLabel:()=> '모임'},'@/lib/community/meetup-gender':{MEETUP_GENDER_LABELS:{mixed:'성별 무관'}},'@/lib/community/meetup-place':{projectLegacyMeetupPlace:()=>null},'./LiveActivityGuide':{default:'LiveActivityGuide'},
    './MeetupApplications':{default:'MeetupApplications'},
  })
  globalThis.window={setInterval:fn=>{ticks.push(fn);return ticks.length},clearInterval(){},addEventListener(){},removeEventListener(){}}
  globalThis.document={visibilityState:'visible'}
  globalThis.fetch=async (url,init)=>{if(init?.method==='POST')writes.push({url,body:JSON.parse(init.body)});return{ok:true,json:async()=>url.endsWith('/chat')?{chat:{phase:'send',messages:[{id:owner,sender_alias:'친구',message:latestMessage,created_at:'2026-09-11T00:00:00Z'}]}}:url.endsWith('/guide')?{guide:null}:{meetup:{...detail}}}}
  const props={meetupId:roomId,chatOnly:true}
  try {
    h.render(module.default,props);h.flush();await new Promise(resolve=>setImmediate(resolve))
    const messenger=h.render(module.default,props)
    assert.equal(messenger.type,'SocialMessenger')
    assert.equal(messenger.props.messages[0].text,'처음 대화')
    const nodes=flatten(messenger.props.management(()=>{}))
    assert.ok(nodes.some(node=>node?.type==='a'&&node.props.href===`/meetups/${roomId}/applications`),'host application management remains reachable inside CHAT management')
    for(const [label,value] of [['새 시작 시간','2026-09-16T12:30'],['새 종료 시간','2026-09-16T14:30'],['새 장소','편집 중인 장소']]) nodes.find(n=>n?.props?.['aria-label']===label).props.onChange({target:{value}})
    h.render(module.default,props);latestMessage='갱신된 대화';detail.revision=2;ticks[0]();await new Promise(resolve=>setImmediate(resolve))
    const nextMessenger=h.render(module.default,props),refreshed=flatten(nextMessenger.props.management(()=>{}))
    assert.equal(refreshed.find(n=>n?.props?.['aria-label']==='새 시작 시간').props.value,'2026-09-16T12:30')
    assert.equal(refreshed.find(n=>n?.props?.['aria-label']==='새 종료 시간').props.value,'2026-09-16T14:30')
    assert.equal(refreshed.find(n=>n?.props?.['aria-label']==='새 장소').props.value,'편집 중인 장소')
    assert.equal(nextMessenger.props.messages[0].text,'갱신된 대화')
    refreshed.find(n=>n?.type==='button'&&flatten(n).includes('일정 변경 저장')).props.onClick()
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(writes[0]?.body.expected_revision,1,'quiet polling must not silently rebase an older schedule draft')
    assert.equal(writes[0]?.body.place_name,'편집 중인 장소')
  } finally {h.cleanup();Object.assign(globalThis,saved)}
})
