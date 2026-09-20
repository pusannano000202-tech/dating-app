import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const module={exports:{}}
const source=readFileSync(new URL('../../lib/meetups/league-navigation.ts',import.meta.url),'utf8')
new Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports)
const {readLeagueLocation,leagueLocationHref}=module.exports
const id='97000000-0000-4000-8000-000000000101'
test('sport picker survives reload without losing the previously selected sport',()=>{
 const state=readLeagueLocation(new URL(leagueLocationHref({sport:'lol',stage:'sport'}),'http://localhost').searchParams)
 assert.equal(state.stage,'sport');assert.equal(state.sport,'lol');assert.equal(state.challengeId,null)
})
test('legacy notification retains team, applications and position without a view',()=>{
 const state=readLeagueLocation(new URLSearchParams({sport:'lol',challenge:id,team:id,panel:'applications',slot:'mid'}))
 assert.equal(state.stage,'roster');assert.equal(state.challengeId,id);assert.equal(state.teamId,id);assert.equal(state.review,true);assert.equal(state.slot,'mid')
})
test('public browsing never inherits another team detail or application panel',()=>{
 const href=leagueLocationHref({sport:'lol',stage:'recruitment',challengeId:id,teamId:id,review:true})
 assert.equal(href,'/meetups/league?sport=lol&view=recruitment')
})
test('new team is a restorable draft rather than an existing selected team',()=>{
 const href=leagueLocationHref({sport:'football',stage:'roster',draft:true,challengeId:id})
 const state=readLeagueLocation(new URL(href,'http://localhost').searchParams)
 assert.equal(state.draft,true);assert.equal(state.challengeId,null);assert.equal(state.stage,'roster')
})
test('roster and opponent deep links preserve the actual team target',()=>{
 for(const stage of ['roster','opponents','publish','result','report']){
  const href=leagueLocationHref({sport:'lol',stage,challengeId:id,teamId:id})
  const result=readLeagueLocation(new URL(href,'http://localhost').searchParams)
  assert.equal(result.stage,stage);assert.equal(result.challengeId,id);assert.equal(result.teamId,id)
 }
})
test('invalid views and identifiers fail to safe browsing without interpreting paths',()=>{
 const state=readLeagueLocation(new URLSearchParams({category:'gaming',view:'https://evil.test',challenge:'../../',team:id,panel:'applications'}))
 assert.equal(state.sport,'lol');assert.equal(state.stage,'league');assert.equal(state.challengeId,null);assert.equal(state.teamId,null);assert.equal(state.review,false)
})
test('position invite and result legacy links remain addressable',()=>{
 assert.equal(readLeagueLocation(new URLSearchParams({sport:'lol',invite:id})).stage,'invite')
 assert.equal(readLeagueLocation(new URLSearchParams({sport:'lol',challenge:id,panel:'result'})).stage,'result')
})
