import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import {resolveSocialLink} from '../../lib/notifications/common-contract.ts'
const id='67000000-0000-4000-8000-000000000001'
async function load(path,deps={}){const exports={};new Function('exports','require',ts.transpileModule(await readFile(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]});return exports}
test('candidate and existing native-admission destinations pass both exact internal allowlists',async()=>{
 const server=await load('lib/notifications/social-server.ts',{'@/lib/supabase-request':{},'@/lib/utils':{}})
 for(const href of [`/meetups/candidates?kind=league&key=lol&invite=${id}`,`/meetups/candidates?kind=study&key=pnu%3Amath&invite=${id}`,`/meetups/candidates?kind=mentoring&key=courses&invite=${id}`,`/meetups/candidates?kind=meetup&key=campus-walk&invite=${id}`,`/meetups/participation/study/${id}/applications`,`/meetups/participation/mentoring/${id}/apply`]){
  assert.equal(server.isSocialResolvedHref(href),true,href);assert.equal(resolveSocialLink({status:'current',href}),href)
 }
 for(const href of [`/meetups/candidates?kind=league&key=lol&invite=${id}&next=https://evil.test`,`/meetups/candidates?kind=league&key=lol&invite=${id}&invite=${id}`,`/meetups/candidates?kind=league&key=lol%26admin&invite=${id}`,`/meetups/candidates?kind=league&key=..&invite=${id}`,`/meetups/candidates?kind=admin&key=lol&invite=${id}`,`/meetups/candidates?kind=league&key=lol&invite=${id}#x`,`/meetups/participation/study/${id}/applications?user=${id}`,`/meetups/participation/matching/${id}/apply`]){
  assert.equal(server.isSocialResolvedHref(href),false,href);assert.equal(resolveSocialLink({status:'current',href}),null,href)
 }
})
test('candidate notice presentation never echoes introduction, alias, account or payload URL',async()=>{
 const module=await load('lib/notifications/common-presentation.ts',{'./league-invite-presentation':{leagueInviteNotificationPresentation:()=>null},'./continuation-presentation':{continuationNotificationPresentation:()=>null}})
 const note={id,kind:'social_activity',created_at:'2026-09-12T00:00:00Z',read_at:null,payload:{entity_type:'candidate_invite',domain:'league',event:'invitation_received',context_label:'민감 닉네임',body:'비공개 자기소개',href:'https://evil.test',user_id:id}}
 const view=module.notificationPresentation(note)
 assert.equal(view.href,null);assert.equal(view.requiresAction,true);assert.equal(view.action,'초대 확인하기')
 for(const secret of ['민감 닉네임','비공개 자기소개','evil.test',id])assert.equal(JSON.stringify(view).includes(secret),false)
 const accepted=module.notificationPresentation({...note,payload:{...note.payload,event:'invitation_accepted'}})
 assert.equal(accepted.requiresAction,false);assert.equal(JSON.stringify(accepted).includes('친구'),false);assert.equal(JSON.stringify(accepted).includes('참가 확정'),false)
})

test('completed recruitment links open exactly the same candidate scope without an active invitation',async()=>{
 const server=await load('lib/notifications/social-server.ts',{'@/lib/supabase-request':{},'@/lib/utils':{}})
 for(const href of ['/meetups/candidates?kind=league&key=lol','/meetups/candidates?kind=study&key=pnu%3AAN1600527','/meetups/candidates?kind=mentoring&key=career']){
  assert.equal(server.isSocialResolvedHref(href),true,href);assert.equal(resolveSocialLink({status:'current',href}),href)
 }
 for(const href of ['/meetups/candidates?kind=league&key=lol&next=https://evil.test','/meetups/candidates?kind=league&key=lol&key=futsal','/meetups/candidates?kind=league&key=lol#other']){
  assert.equal(server.isSocialResolvedHref(href),false);assert.equal(resolveSocialLink({status:'current',href}),null)
 }
})

test('joined owner gets its safe room name while every other inviter sees only generic closed recruitment copy',async()=>{
 const module=await load('lib/notifications/common-presentation.ts',{'./league-invite-presentation':{leagueInviteNotificationPresentation:()=>null},'./continuation-presentation':{continuationNotificationPresentation:()=>null}})
 const note={id,kind:'social_activity',created_at:'2026-09-12T00:00:00Z',read_at:null,payload:{entity_type:'candidate_join_result',event:'candidate_joined',room_title:'A 진로 모임',href:'https://evil.test',body:'민감 자기소개'}}
 const owner=module.notificationPresentation(note)
 assert.equal(owner.summary,'A 진로 모임에 합류했어요. 다른 참가 제안은 종료됐어요.');assert.equal(owner.href,null);assert.equal(owner.requiresAction,false)
 const other=module.notificationPresentation({...note,payload:{...note.payload,event:'candidate_recruitment_closed'}})
 assert.equal(other.summary,'초대한 사람의 모집이 종료됐어요. 다른 대기자를 찾아보세요.');assert.equal(other.action,'다른 대기자 보기')
 for(const secret of ['A 진로 모임','민감 자기소개','evil.test'])assert.equal(JSON.stringify(other).includes(secret),false)
 for(const room_title of ['전화 01012345678','https://example.test','카톡 아이디','test@example.test']){
  const value=module.notificationPresentation({...note,payload:{...note.payload,room_title}})
  assert.equal(value.summary,'선택한 모임에 합류했어요. 다른 참가 제안은 종료됐어요.')
 }
})
