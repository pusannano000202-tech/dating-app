import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {isAppTabActive} from '../../lib/navigation/app-tabs.ts'
import {chatListHref,parseChatTab} from '../../lib/navigation/chat-navigation.ts'
const tabs=['/','/match','/meetups','/community','/chat','/profile/edit']
test('chat list selection survives a room return and rejects an unknown tab',()=>{
 for(const tab of ['friends','matching','social'])assert.equal(parseChatTab(new URL(chatListHref(tab),'http://localhost').searchParams.get('tab')),tab)
 for(const tab of [null,'','invalid','/profile','<script>'])assert.equal(parseChatTab(tab),'social')
})
test('community content and saved result descendants never activate another product tab',()=>{
 for(const route of ['/community/content','/community/stories','/community/hot','/community/mbti','/community/voice/random','/community/voice/session/abc','/community/places','/community/campus-eats','/community/content-history','/community/content-history/abc']){
  assert.deepEqual(tabs.filter(tab=>isAppTabActive(route,tab)),['/community'],route)
 }
})
test('actual friend and matching chat rooms belong to chat, league remains meetups',()=>{
 for(const route of ['/friends/alice/chat','/match/abc/chat','/chat/league-team/abc','/chat/rooms/meetup/abc']){
  assert.deepEqual(tabs.filter(tab=>isAppTabActive(route,tab)),['/chat'],route)
 }
 for(const route of ['/community/department','/meetups/league'])assert.deepEqual(tabs.filter(tab=>isAppTabActive(route,tab)),['/meetups'])
 assert.deepEqual(tabs.filter(tab=>isAppTabActive('/match/abc',tab)),['/match'])
})
test('saved community result links and recovery stay in their own section',()=>{
 const read=f=>readFileSync(new URL('../../'+f,import.meta.url),'utf8')
 const saved=read('components/content-history/SaveContentRecord.tsx')
 assert.match(saved,/\/community\/content-history/)
 assert.doesNotMatch(saved,/href=\{\x60\/profile\/content-history/)
 assert.doesNotMatch(read('components/community/CommunityComingSoon.tsx'),/href="\/match"/)
 assert.doesNotMatch(read('components/community/mbti/MbtiHub.tsx'),/href="\/profile\/edit"/)
})
test('recruitment loading failure is not rendered as a successful empty directory',()=>{
 const source=readFileSync(new URL('../../components/community/department/LeagueRecruitment.tsx',import.meta.url),'utf8')
 const ast=ts.createSourceFile('component.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX)
 const helper=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='recruitmentDirectoryState')
 assert.ok(helper,'explicit query status separates failed and empty lists')
 const js=ts.transpileModule(helper.getText().replace('export ',''),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 const state=new Function(js+';return recruitmentDirectoryState')()
 assert.equal(state({demo:false,loading:false,error:'offline',hasPage:false}),'error')
 assert.equal(state({demo:false,loading:true,error:'',hasPage:false}),'loading')
 assert.equal(state({demo:false,loading:false,error:'',hasPage:true}),'ready')
 assert.equal(state({demo:true,loading:false,error:'',hasPage:false}),'ready')
})
test('live league match navigation opens canonical CHAT and keeps schedule controls in that room',()=>{
 const read=f=>readFileSync(new URL('../../'+f,import.meta.url),'utf8')
 const source=read('components/community/department/DepartmentLeagueJourney.tsx')
 const ast=ts.createSourceFile('journey.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX)
 const component=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='DepartmentLeagueJourney')
 const go=component.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='go')
 const js=ts.transpileModule(go.getText(),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 const routes=[];const id='20000000-0000-4000-8000-000000000001'
 const navigate=new Function('router','selected','demo','coordinationOnly','sport','setSelectedId','setNotice','setStage',js+';return go')({push:url=>routes.push(url)},{id},false,false,'lol',()=>{},()=>{},()=>{})
 navigate('match',id)
 assert.deepEqual(routes,['/chat/rooms/league_match/'+id])
 assert.match(read('components/chat/SocialChatRoomPage.tsx'),/DepartmentLeagueJourney[^>]*coordinationOnly/)
})
