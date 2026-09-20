import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import ts from 'typescript'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(import.meta.url),cache=new Map()
function load(file){
 if(cache.has(file))return cache.get(file).exports
 const module={exports:{}};cache.set(file,module)
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
 new Function('require','module','exports',source)(specifier=>{
  if(specifier.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}
  if(specifier.startsWith('@/')||specifier.startsWith('.')){
   const base=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(path.dirname(file),specifier)
   return load(path.extname(base)?base:existsSync(base+'.ts')?base+'.ts':base+'.tsx')
  }
  return require(specifier)
 },module,module.exports)
 return module.exports
}
const ui=load(path.join(root,'components/community/department/LeagueRecruitment.tsx'))
const team={team_id:'team-a',challenge_id:'challenge-a',team_name:'석탄에너지',title:'예전 모집 제목',department:'기계공학부',sport:'lol',status:'recruiting',revision:1,capacity:5,accepted_count:3,empty_slots:['jungle'],reserved_slots:['support'],is_captain:false,my_status:'none',may_join:true,notice:null}
const notice={id:'notice-a',...team,summary:'정글 한 분을 찾아요.',preferred_at:'2026-09-10T15:05:00.000Z',status:'open',expires_at:'2026-09-10T15:05:00.000Z',created_at:'2026-09-10T00:00:00.000Z',updated_at:'2026-09-10T00:00:00.000Z',href:'/unused'}
function buttons(node){if(!node||typeof node!=='object')return[];return[...(node.type==='button'?[node]:[]),...React.Children.toArray(node.props?.children).flatMap(buttons)]}

test('preferred date is compact Korean time with an explicit wish label, independent of host timezone',()=>{
 assert.equal(typeof ui.formatRecruitmentPreferredAt,'function')
 const result=ui.formatRecruitmentPreferredAt(notice.preferred_at)
 assert.match(result,/9\. 11/);assert.match(result,/00:05/);assert.match(result,/희망/);assert.doesNotMatch(result,/2026|:00:00/)
 assert.equal(ui.formatRecruitmentPreferredAt('bad-date'),'희망 시각 확인 필요')
})
test('team card preserves exact confirmed count and keeps reserved slots separate from vacancies',()=>{
 assert.equal(typeof ui.LeagueRecruitmentTeamCard,'function')
 const selected=[],props={sport:'lol',team,onSelect:id=>selected.push(id),featured:true}
 const html=renderToStaticMarkup(React.createElement(ui.LeagueRecruitmentTeamCard,props))
 assert.match(html,/석탄에너지/);assert.doesNotMatch(html,/예전 모집 제목/)
 assert.match(html,/3\/5명 확정/);assert.match(html,/정글 · JUNGLE/);assert.match(html,/1자리 모집/)
 assert.match(html,/초대 중/);assert.match(html,/서포터 · SUPPORT/);assert.match(html,/인원 확정 전/)
 assert.doesNotMatch(html,/4\/5명 확정|인증|평점/)
 buttons(ui.LeagueRecruitmentTeamCard(props))[0].props.onClick();assert.deepEqual(selected,['challenge-a'])
})
test('notice cards retain terminal status and only open the same map with the original notice context',()=>{
 assert.equal(typeof ui.LeagueRecruitmentNoticeCard,'function')
 for(const [status,empty,expectedSlot]of [['open',['jungle'],'jungle'],['closed',['jungle'],undefined],['filled',[],undefined]]){
  const selected=[],props={sport:'lol',notice:{...notice,status,empty_slots:empty},onSelect:(...args)=>selected.push(args)}
  const html=renderToStaticMarkup(React.createElement(ui.LeagueRecruitmentNoticeCard,props))
  assert.match(html,/3\/5명 확정/);assert.match(html,/희망/)
  if(status==='closed'){assert.match(html,/모집 마감/);assert.doesNotMatch(html,/1자리 모집/)}
  if(status==='filled')assert.match(html,/빈자리 모두 초대 중/)
  buttons(ui.LeagueRecruitmentNoticeCard(props))[0].props.onClick()
  assert.deepEqual(selected,[['challenge-a',true,expectedSlot]])
 }
})
test('compact directory prioritizes actual team cards, scoped counts and candidate navigation without invented identity data',()=>{
 const {makeLeagueRecruitmentDemo}=load(path.join(root,'lib/meetups/league-recruitment-demo.ts'))
 for(const sport of ['lol','futsal','football']){
  const sample=makeLeagueRecruitmentDemo(sport),props={sport,demo:true,...sample,reservations:[],onSelect(){},onCreate(){},onBack(){}}
  const html=renderToStaticMarkup(React.createElement(ui.default,props))
  assert.match(html,/불러온 목록에서 검색/);assert.match(html,/불러온 팀 이름 검색/)
  assert.match(html,/주장이 승인/);assert.match(html,/함께할 우리 과 팀/)
  assert.match(html,new RegExp('kind=league&amp;key='+sport))
  assert.doesNotMatch(html,/종목 공통 이미지|sportBanner/)
  assert.doesNotMatch(html,/평점|학교 인증|공식 팀|확정 일정/)
 }
})
test('owned and pending team cards name the user action instead of inviting an existing member to join again',()=>{
 for(const [status,label]of [['accepted','우리 팀 열기'],['requested','내 신청 확인'],['none','빈자리 보기']]){
  const html=renderToStaticMarkup(React.createElement(ui.LeagueRecruitmentTeamCard,{sport:'lol',team:{...team,my_status:status},onSelect(){}}))
  assert.match(html,new RegExp(label))
 }
})

test('one recruitment list embeds the existing pitch and time with a department mascot',()=>{
 const html=renderToStaticMarkup(React.createElement(ui.LeagueRecruitmentTeamCard,{sport:'lol',team:{...team,notice},onSelect(){}}))
 assert.match(html,/정글 한 분을 찾아요/)
 assert.match(html,/희망 9\. 11/)
 assert.match(html,/data-department-mascot="기계공학부"/)
 const source=readFileSync(path.join(root,'components/community/department/LeagueRecruitment.tsx'),'utf8')
 assert.doesNotMatch(source,/>우리 과 모집 소식<|>모집 중인 팀</)
})

test('my teams preserves exact team/chat attribution and current sport when browsing again',()=>{
 const chooser=load(path.join(root,'components/community/department/LeagueMyTeams.tsx')).default
 for(const sport of ['lol','football','futsal']){
  const teams=[{id:'team-a',challengeId:'challenge-a',sport,title:'우리 팀 A',department:'건축학과',memberCount:3,href:'/meetups/league?team=team-a',chatHref:'/chat/league-team/team-a'},{id:'team-b',challengeId:'challenge-b',sport,title:'우리 팀 B',department:'건축학과',memberCount:2,href:'/meetups/league?team=team-b',chatHref:'/chat/league-team/team-b'}]
  const html=renderToStaticMarkup(React.createElement(chooser,{sport,membership:{status:'member',teams},retry(){}}))
  assert.match(html,/참여 중인 팀 2/)
  assert.match(html,/href="\/chat\/league-team\/team-a"/)
  assert.match(html,/href="\/chat\/league-team\/team-b"/)
  assert.match(html,new RegExp(`href="/meetups/league\\?sport=${sport}&amp;view=recruitment"`))
 }
})
