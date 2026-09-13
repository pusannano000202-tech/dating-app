import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import ts from 'typescript'
import React from 'react'

const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(import.meta.url),cache=new Map()
const read=file=>readFileSync(path.join(root,file),'utf8')
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
function load(file){
 if(cache.has(file))return cache.get(file).exports
 const module={exports:{}};cache.set(file,module)
 new Function('require','module','exports',compile(readFileSync(file,'utf8')))(specifier=>{
  if(specifier==='@/components/content-history/useHistoryAccount')return{useHistoryAccount:()=>undefined}
  if(specifier.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}
  if(specifier.startsWith('@/')||specifier.startsWith('.')){const base=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(path.dirname(file),specifier);return load(path.extname(base)?base:existsSync(base+'.tsx')?base+'.tsx':base+'.ts')}
  return require(specifier)
 },module,module.exports)
 return module.exports
}
const ui=load(path.join(root,'components/community/department/LeagueTeamChat.tsx')),contract=load(path.join(root,'lib/chat/league-team-contract.ts'))
const source=read('components/community/department/LeagueTeamChat.tsx'),invites=read('components/community/department/LeaguePositionInvites.tsx'),journey=read('components/community/department/DepartmentLeagueJourney.tsx')
const uuid=n=>`90000000-0000-4000-8000-${String(n).padStart(12,'0')}`,owner=uuid(1),recipient=uuid(2),team=uuid(3)
const room={team_id:team,challenge_id:uuid(4),title:'금요일 미드 모여라',department:'기계공학부',sport:'lol',member_count:1,writable:true}
const message=(n,body='대화 '+n)=>({id:uuid(n),body,alias:'하루',is_me:true,created_at:new Date(1770000000000+n*1000).toISOString()})
const chat=(messages,has_more=false)=>({...room,messages,has_more,next_cursor:has_more?messages[0].id:null})
function functionText(text,name){let result;const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)result=node.getText();ts.forEachChild(node,visit)};visit(ts.createSourceFile('ui.tsx',text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX));assert.ok(result,`${name} exists`);return result.replace(/^export /,'')}

test('a captain chats at 1/5; late accepted recipient reads the same team history under their own identity',async()=>{
 const store=new Map(),first=ui.createLeagueTeamChatDemoTransport(store,owner,room,'하루',true),signal=new AbortController().signal
 const initial=await first.read(undefined,signal);assert.equal(initial.chat.member_count,1);assert.equal(initial.chat.messages.length,0)
 const sent=await first.send('금요일 저녁에 어떠세요?',uuid(10),signal)
 const joined=ui.createLeagueTeamChatDemoTransport(store,recipient,{...room,member_count:2},'라임',true),received=await joined.read(undefined,signal)
 assert.equal(received.owner_id,recipient);assert.equal(received.chat.messages[0].id,sent.message.id);assert.equal(received.chat.messages[0].is_me,false)
 const reply=await joined.send('좋아요. 7시 가능해요.',uuid(11),signal),captainView=await first.read(undefined,signal)
 assert.equal(captainView.chat.messages[1].id,reply.message.id);assert.equal(captainView.chat.messages[1].alias,'라임');assert.equal(captainView.chat.messages[1].is_me,false)
 const other=ui.createLeagueTeamChatDemoTransport(store,recipient,{...room,team_id:uuid(30)},'라임',true)
 assert.equal((await other.read(undefined,signal)).chat.messages.length,0)
})

test('pending outsiders cannot read or send; replay and pagination use the same validated API envelope',async()=>{
 const store=new Map(),signal=new AbortController().signal,blocked=ui.createLeagueTeamChatDemoTransport(store,recipient,room,'라임',false)
 await assert.rejects(()=>blocked.read(undefined,signal),/membership/);await assert.rejects(()=>blocked.send('비공개',uuid(10),signal),/membership/)
 const transport=ui.createLeagueTeamChatDemoTransport(store,owner,room,'하루',true),sent=await transport.send('첫 메시지',uuid(10),signal),replay=await transport.send('첫 메시지',uuid(10),signal)
 assert.equal(sent.message.id,replay.message.id);await assert.rejects(()=>transport.send('바뀐 본문',uuid(10),signal),/idempotency/)
 for(let i=0;i<50;i++)await transport.send(`추가 ${i}`,uuid(100+i),signal)
 const newest=await transport.read(undefined,signal);assert.ok(contract.parseLeagueTeamChatResponse(newest,owner,team));assert.equal(newest.chat.messages.length,50);assert.equal(newest.chat.has_more,true)
 const older=await transport.read(newest.chat.next_cursor,signal);assert.ok(contract.parseLeagueTeamChatResponse(older,owner,team));assert.equal(older.chat.messages.length,1);assert.equal(older.chat.has_more,false)
})

test('history pagination preserves current messages and newest polling keeps the oldest cursor only with proven overlap',()=>{
 const newest=chat([message(51),message(52)],true),older=chat([message(49),message(50)],true)
 const combined=ui.mergeLeagueTeamPage(newest,older,message(51).id)
 assert.deepEqual(combined.messages.map(m=>m.id),[49,50,51,52].map(uuid));assert.equal(combined.next_cursor,uuid(49))
 const polled=ui.mergeLeagueTeamPage(combined,{...chat([message(52),message(53)],true),title:'바뀐 팀 이름',member_count:3})
 assert.equal(polled.messages.length,5);assert.equal(polled.next_cursor,uuid(49));assert.equal(polled.title,'바뀐 팀 이름');assert.equal(polled.member_count,3)
 const gap=chat([message(100),message(101)],true)
 assert.deepEqual(ui.mergeLeagueTeamPage(combined,gap),gap)
 const authoritative=chat([message(53)])
 assert.deepEqual(ui.mergeLeagueTeamPage(combined,authoritative),authoritative)
})

test('acceptance opens the exact invited team immediately and a decline never enters chat',async()=>{
 const invite={id:uuid(9),challenge_id:uuid(4),team_id:team,revision:2},calls=[]
 function respond(status){return new Function('invite','controller','tier','setOutcome','onJoined',compile(functionText(invites,'respond'))+';return respond')(invite,{command:async()=>({status})},'gold',value=>calls.push(['status',value]),(...args)=>calls.push(['joined',...args]))}
 await respond('accepted')(true);assert.deepEqual(calls,[['status','accepted'],['joined',uuid(4),team]])
 calls.length=0;await respond('declined')(false);assert.deepEqual(calls,[['status','declined']])
 assert.match(invites,/onJoined\(invite\.challenge_id,invite\.team_id\)/)
 assert.match(journey,/onJoined=\{openTeamChat\}/);assert.match(journey,/isTeamMember&&team&&selected/)
 assert.match(journey,/setStage\(inviteDemo\.viewer==='recipient'\?'team-map':'roster'\)/)
})

test('a confirmed accept returns immediately even when old invitation and journey refreshes would never resolve',async()=>{
 const result={id:uuid(9),challenge_id:uuid(4),team_id:team,slot:'top',status:'accepted',revision:3,replayed:false},calls=[],mutation={current:false},pending={current:null}
 const forever=()=>{calls.push('obsolete refresh');return new Promise(()=>{})}
 const command=new Function('mutation','sport','setError','demo','onDemo','challengeId','setBusy','scope','pending','fetch','endpoint','load','onJourneyRefresh','leagueInviteError',compile(functionText(invites,'command'))+';return command')(mutation,'lol',()=>{},false,()=>{},uuid(4),()=>{},{current:0},pending,async()=>({ok:true,json:async()=>({invite:result})}),'/api/community/department/league/invites',forever,forever,String)
 const accepted=await Promise.race([command('accept',{invite_id:result.id,expected_revision:2,tier:'gold'},{type:'accept',inviteId:result.id,tier:'gold'}),new Promise(resolve=>setTimeout(()=>resolve('hung'),100))])
 assert.deepEqual(accepted,result);assert.deepEqual(calls,[]);assert.equal(mutation.current,false);assert.equal(pending.current,null)
})

test('an uncertain send retains draft and retry key; a newer draft survives an older successful response',async()=>{
 const pendingKeys={current:new Map()},calls=[],scope={current:0},alive={current:true},generation={current:0},mutation={current:false}
 let currentBody='가능한 시간 알려 주세요',currentPage=chat([]),fail=true,release
 const transport={send:async(body,key)=>{calls.push({body,key});if(fail)throw Error('connection lost');await new Promise(resolve=>{release=resolve});return{owner_id:owner,message:message(70,body)}}}
 const setBody=update=>{currentBody=typeof update==='function'?update(currentBody):update},setPage=update=>{currentPage=typeof update==='function'?update(currentPage):update}
 const make=()=>new Function('body','page','error','mutation','setBusy','generation','readController','reading','setLoading','pendingKeys','scope','sendController','window','transport','ownerId','parseLeagueTeamMessageResponse','alive','setBody','clearSentDraft','setPage','mergeLeagueTeamMessages','setError',compile(functionText(source,'send'))+';return send')(currentBody,currentPage,'',mutation,()=>{},generation,{current:null},{current:false},()=>{},pendingKeys,scope,{current:null},{setTimeout:()=>1,clearTimeout:()=>{}},transport,owner,contract.parseLeagueTeamMessageResponse,alive,setBody,(current,sent)=>current.trim()===sent?'':current,setPage,ui.mergeLeagueTeamMessages,()=>{})
 await make()({preventDefault(){}});assert.equal(currentBody,'가능한 시간 알려 주세요');assert.equal(currentPage,null);assert.equal(pendingKeys.current.size,1)
 fail=false;currentPage=chat([]);const retry=make()({preventDefault(){}});currentBody='새로 작성 중';release();await retry
 assert.equal(calls[0].key,calls[1].key);assert.equal(currentBody,'새로 작성 중');assert.equal(currentPage.messages.length,1);assert.equal(pendingKeys.current.size,0)
})

test('a send resolved after its session scope was invalidated cannot expose old messages or erase current drafts',async()=>{
 const scope={current:0},updates=[],pendingKeys={current:new Map()},signalRef={current:null};let release
 const transport={send:async body=>{await new Promise(resolve=>{release=resolve});return{owner_id:owner,message:message(80,body)}}}
 const send=new Function('body','page','error','mutation','setBusy','generation','readController','reading','setLoading','pendingKeys','scope','sendController','window','transport','ownerId','parseLeagueTeamMessageResponse','alive','setBody','clearSentDraft','setPage','mergeLeagueTeamMessages','setError',compile(functionText(source,'send'))+';return send')('이전 계정 초안',chat([]),'',{current:false},()=>{},{current:0},{current:null},{current:false},()=>{},pendingKeys,scope,signalRef,{setTimeout:()=>1,clearTimeout:()=>{}},transport,owner,contract.parseLeagueTeamMessageResponse,{current:true},()=>updates.push('draft'),(current,sent)=>current.trim()===sent?'':current,()=>updates.push('messages'),ui.mergeLeagueTeamMessages,()=>updates.push('error'))
 const pending=send({preventDefault(){}});scope.current++;release();await pending
 assert.deepEqual(updates,[]);assert.equal(pendingKeys.current.size,1)
})

test('account or room changes remount private state and live reads are fenced by both owner and team',()=>{
 assert.match(source,/useHistoryAccount\(\)/);assert.match(source,/key=\{`\$\{account\}:\$\{teamId\}`\}/)
 assert.match(source,/parseLeagueTeamChatResponse\(await transport\.read\(before,controller\.signal\),ownerId,teamId\)/)
 assert.match(source,/if\(!alive\.current\|\|lifecycle!==scope\.current\)return/)
 assert.match(source,/setTimeout\(\(\)=>controller\.abort\(\),12000\)/)
 const left=React.createElement(ui.default,{teamId:team,demo:{ownerId:owner,transport:{},onBack(){},onMap(){}}})
 const right=ui.default(left.props);assert.equal(right.key,`${owner}:${team}`)
 assert.doesNotMatch(source,/localStorage|sessionStorage/)
 assert.match(source,/<ActivityRoomPolls roomKind="league-teams"/)
 assert.match(source,/<SocialChatComposer value=\{body\}/);assert.match(source,/disabled=\{!page\?\.writable\|\|!!error\}/)
 assert.match(source,/header=\{\{kind:'league_team'/);assert.match(source,/href="\/chat"/);assert.match(source,/createdAt:message\.created_at,isMe:message\.is_me/);assert.match(source,/<LeagueRecruitmentNotices teamId=\{teamId\} ownerId=\{ownerId\}/)
})
