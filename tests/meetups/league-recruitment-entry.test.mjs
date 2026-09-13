import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import {isLeagueSport} from '../../lib/meetups/challenge-journey.ts'

async function loadPage(path,dependencies){
 const source=await readFile(new URL('../../'+path,import.meta.url),'utf8')
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,jsxFactory:'element'}}).outputText
 const exports={}
 new Function('exports','require','element',output)(exports,name=>{assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name]},(type,props)=>({type,props}))
 return exports.default
}
test('recruitment rehearsal is explicitly selectable without bypassing the development-only gate',async()=>{
 const page=await loadPage('app/meetups/dev-flow/page.tsx',{
  'next/navigation':{notFound:()=>{throw new Error('NOT_FOUND')}},
  '@/components/qa/GuidedParticipationPreview':{default:'preview'},
  '@/lib/meetups/challenge-journey':{isLeagueSport},
 })
 const originalNode=process.env.NODE_ENV,originalMode=process.env.QUANTUM_LOCAL_RUNTIME_MODE
 try{
  process.env.NODE_ENV='development';process.env.QUANTUM_LOCAL_RUNTIME_MODE='offline-ui'
  const view=await page({searchParams:Promise.resolve({scene:'league',flow:'recruitment',sport:'football'})})
  assert.equal(view.props.flow,'recruitment');assert.equal(view.props.sport,'football')
  const invalid=await page({searchParams:Promise.resolve({scene:'league',flow:['recruitment'],sport:['football']})})
  assert.equal(invalid.props.flow,'league');assert.equal(invalid.props.sport,'lol')
  process.env.NODE_ENV='production'
  await assert.rejects(()=>page({searchParams:Promise.resolve({scene:'league',flow:'recruitment'})}),/NOT_FOUND/)
  process.env.NODE_ENV='development';delete process.env.QUANTUM_LOCAL_RUNTIME_MODE
  await assert.rejects(()=>page({searchParams:Promise.resolve({scene:'league',flow:'recruitment'})}),/NOT_FOUND/)
 }finally{if(originalNode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalNode;if(originalMode===undefined)delete process.env.QUANTUM_LOCAL_RUNTIME_MODE;else process.env.QUANTUM_LOCAL_RUNTIME_MODE=originalMode}
})
test('the normal team detail link validates the selected challenge independently of invitation presence',async()=>{
 const page=await loadPage('app/community/department/page.tsx',{
  '@/components/community/CommunityComingSoon':{default:'comingSoon'},
  '@/components/community/department/DepartmentLeagueJourney':{default:'journey'},
  '@/lib/meetups/challenge-journey':{isLeagueSport},
  '@/lib/community-feature':{isCommunityFeatureEnabled:()=>true},
 })
 const id='10000000-0000-7000-8000-000000000001'
 const view=await page({searchParams:Promise.resolve({sport:'lol',challenge:id})})
 assert.equal(view.props.initialChallengeId,id);assert.equal(view.props.initialInviteId,undefined)
 const unsafe=await page({searchParams:Promise.resolve({sport:'lol',challenge:'//outside.example'})})
 assert.equal(unsafe.props.initialChallengeId,undefined)
 for(const challenge of [[id],id+'/edit','10000000-0000-0000-0000-000000000001']){
  const invalid=await page({searchParams:Promise.resolve({sport:'lol',challenge})})
  assert.equal(invalid.props.initialChallengeId,undefined)
 }
})

test('team discovery does not bypass the normal community feature gate',async()=>{
 const page=await loadPage('app/community/department/page.tsx',{
  '@/components/community/CommunityComingSoon':{default:'comingSoon'},
  '@/components/community/department/DepartmentLeagueJourney':{default:'journey'},
  '@/lib/meetups/challenge-journey':{isLeagueSport},
  '@/lib/community-feature':{isCommunityFeatureEnabled:()=>false},
 })
 const view=await page({searchParams:Promise.resolve({sport:'lol',challenge:'10000000-0000-7000-8000-000000000001'})})
 assert.equal(view.type,'comingSoon');assert.equal(view.props.kind,'meetups')
})
