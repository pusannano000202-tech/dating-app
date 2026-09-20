import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import ts from 'typescript'

const owner='93f7e5e3-682c-41d8-9e12-0b6cb7d8f9c1'
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}
async function load(path,deps={},fetch=()=>assert.fail('Unexpected network call')) {
  const source=await readFile(new URL('../../'+path,import.meta.url),'utf8')
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
  const exports={}
  new Function('exports','require','fetch','process',compiled)(exports,name=>{
    assert.ok(Object.hasOwn(deps,name),`Unexpected dependency ${name}`);return deps[name]
  },fetch,{env:{NODE_ENV:'test'}})
  return exports
}
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)]
const visibleText=tree=>Array.isArray(tree)?tree.map(visibleText).join(''):typeof tree==='string'?tree:tree&&typeof tree==='object'?visibleText(tree.props?.children):''

test('calendar analysis gate stays idle until clicked, binds owner and calls readiness completion instead of legacy refresh',async()=>{
  const calls=[],states=[];let prepared=0,refreshed=0
  const gate=await load('components/matching/AppearanceScoreGate.tsx',{
    'react':{useState:initial=>[initial,value=>states.push(value)],useRef:initial=>({current:initial})},
    'react/jsx-runtime':jsx,'next/link':()=>null,'next/navigation':{useRouter:()=>({refresh:()=>refreshed++})},
    'lucide-react':{ArrowRight:()=>null,LoaderCircle:()=>null,ShieldCheck:()=>null},
  },async(path,options)=>{calls.push({path,options});return Response.json({status:'ok',self_appearance_score_persisted:true})})
  const tree=gate.default({expectedOwner:owner,onPrepared:async()=>{prepared++}})
  assert.equal(calls.length,0)
  const button=nodes(tree).find(node=>node.type==='button'&&node.props.onClick)
  assert.ok(button)
  await button.props.onClick()
  assert.equal(calls.length,1)
  assert.equal(calls[0].path,'/api/score')
  assert.equal(calls[0].options.headers['X-Quantum-Owner'],owner)
  assert.deepEqual(JSON.parse(calls[0].options.body),{trigger:'match_search'})
  assert.equal(prepared,1)
  assert.equal(refreshed,0)
})

async function scoreRoute() {
  let serviceCalls=0,reads=0
  const approved={modelVersion:'synthetic-model',promptVersion:'synthetic-prompt',anchorManifestVersion:'synthetic-anchor'}
  const state={status:'ready',photo_revision:'revision',analyzed_photo_revision:'revision',request_id:'request',score_raw:50,score_normalized:0.5,
    confidence_0_1:0.8,appearance_type:'warm',provider:'openai',model_version:approved.modelVersion,prompt_version:approved.promptVersion,
    anchor_version:approved.anchorManifestVersion,analyzed_at:'2026-09-01T00:00:00Z',error_code:null}
  const service={from(table){reads++;const query={select(){return query},eq(_field,id){assert.equal(id,owner);return query},order(){return query},
    limit:async()=>({data:[{storage_path:owner+'/photo.jpg',sort_order:0}],error:null}),maybeSingle:async()=>({data:state,error:null})};return query}}
  const route=await load('app/api/score/route.ts',{
    crypto:{randomUUID},'node:crypto':{randomUUID},'next/server':{NextResponse:{json:Response.json}},
    '@/lib/profile/appearance-score':{APPROVED_APPEARANCE_ANALYSIS_VERSION:approved,requestAppearanceScore:()=>assert.fail('No real analysis in tests')},
    '@/lib/profile/appearance-score-persistence':{mapAppearanceScoreCompletion:()=>assert.fail('No score writes in this test')},
    '@/lib/profile/appearance-score-storage':{APPEARANCE_PHOTO_BUCKET:'private',APPEARANCE_SCORE_TABLE:'private_appearance_scores',
      createAppearanceServiceClient:()=>{serviceCalls++;return service},isOwnedAppearanceStoragePath:path=>path.startsWith(owner+'/')},
    '@/lib/supabase-request':{createSupabaseRequestClient:()=>({auth:{getUser:async()=>({data:{user:{id:owner}},error:null})}})},
  })
  return {route,counts:()=>({serviceCalls,reads})}
}

test('score owner mismatch stops before service reads or analysis; same owner reuses private ready score',async()=>{
  const f=await scoreRoute()
  const request=expected=>new Request('https://quantum.test/api/score',{method:'POST',headers:{'Content-Type':'application/json',...(expected?{'X-Quantum-Owner':expected}:{})},body:JSON.stringify({trigger:'match_search'})})
  let response=await f.route.POST(request('another-account'))
  assert.equal(response.status,409)
  assert.equal((await response.json()).code,'account_changed')
  assert.deepEqual(f.counts(),{serviceCalls:0,reads:0})
  for(const expected of [owner,null]){
    response=await f.route.POST(request(expected));assert.equal(response.status,200)
    assert.deepEqual(await response.json(),{status:'ok',self_appearance_score_persisted:true,reused_existing_score:true})
  }
})

test('existing appearance gate callers keep their refresh behavior without calendar properties',async()=>{
  let refreshed=0,calls=0
  const gate=await load('components/matching/AppearanceScoreGate.tsx',{
    'react':{useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial})},
    'react/jsx-runtime':jsx,'next/link':()=>null,'next/navigation':{useRouter:()=>({refresh:()=>refreshed++})},
    'lucide-react':{ArrowRight:()=>null,LoaderCircle:()=>null,ShieldCheck:()=>null},
  },async(_path,options)=>{calls++;assert.ok(!('X-Quantum-Owner' in options.headers));return Response.json({self_appearance_score_persisted:true})})
  const tree=gate.default({})
  assert.equal(calls,0)
  await nodes(tree).find(node=>node.type==='button').props.onClick()
  assert.equal(calls,1);assert.equal(refreshed,1)
})

test('calendar completion requires a fresh readiness result and never applies or pays automatically',async()=>{
  let currentOwner=owner,checks=0,boundOwner
  const state={value:{status:'missing',profileHref:'/match/calendar/prepare'},check:async()=>{checks++;return state.value.status==='ready'}}
  const Score=()=>null,Readiness=()=>null,TonightReadiness=()=>null,Link=()=>null
  const component=await load('components/matching/CalendarMatchingPreparation.tsx',{
    'react/jsx-runtime':jsx,'@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>currentOwner},
    './AppearanceScoreGate':Score,'./CalendarReadinessGate':{__esModule:true,default:Readiness,useCalendarReadiness:(_enabled,owner)=>{boundOwner=owner;return state}},
    './calendar-readiness':{CALENDAR_PREPARATION_PATH:'/match/calendar/prepare'},
    'next/link':Link,'@/components/tonight/TonightPreparationGate':TonightReadiness,
  })
  let tree=component.default({expectedOwner:owner})
  assert.equal(tree.type,Score);assert.equal(tree.props.expectedOwner,owner);assert.equal(checks,0)
  await tree.props.onPrepared()
  assert.equal(checks,1)
  assert.equal(component.default({expectedOwner:owner}).type,Score)
  state.value={status:'ready',profileHref:'/match/calendar/prepare'}
  tree=component.default({expectedOwner:owner})
  assert.match(visibleText(tree),/기존 행사 탭으로 돌아가/)
  assert.ok(!nodes(tree).some(node=>node.type===Score||node.type==='button'||node.type==='form'))
  currentOwner='another-account'
  tree=component.default({expectedOwner:owner})
  assert.equal(boundOwner,null)
  assert.match(JSON.stringify(tree),/같은 계정으로 로그인/)
  state.value={status:'missing',profileHref:'/profile/photos'};currentOwner=owner
  tree=component.default({expectedOwner:owner})
  assert.ok(nodes(tree).some(node=>node.type===Readiness))
  assert.ok(!nodes(tree).some(node=>node.type===Score))
  tree=component.default({expectedOwner:owner,context:'tonight',returnTo:'/tonight/invite/resume'})
  assert.ok(nodes(tree).some(node=>node.type===TonightReadiness&&node.props.direct===true))
  state.value={status:'ready'}
  tree=component.default({expectedOwner:owner,context:'tonight',returnTo:'/tonight/invite/resume'})
  assert.ok(nodes(tree).some(node=>node.type===Link&&node.props.href==='/tonight/invite/resume'))
  assert.match(visibleText(tree),/받은 초대로 돌아가기/)
  assert.equal(checks,1,'Ready display must not apply, pay, analyze or recheck automatically')
})

test('calendar preparation server page requires user access and preserves official login and recovery returns',async()=>{
  class RequestGuardError extends Error {constructor(status){super();this.status=status}}
  let denial=null,guardCalls=0
  const Component=()=>null,client={}
  const page=await load('app/match/calendar/prepare/page.tsx',{
    'react/jsx-runtime':jsx,'next/navigation':{redirect:path=>{throw Error('redirect:'+path)},notFound:()=>{throw Error('not_found')}},
    '@/components/matching/CalendarMatchingPreparation':Component,
    '@/lib/supabase-server':{createSupabaseServerClient:async()=>client},
    '@/lib/auth/server-guards':{RequestGuardError,requireServerAccess:async(received,options)=>{
      guardCalls++;assert.equal(received,client);assert.deepEqual(options,{allowedRoles:['user']})
      if(denial)throw denial;return {userId:owner}
    }},
  })
  const tree=await page.default();assert.equal(tree.type,Component);assert.equal(tree.props.expectedOwner,owner)
  denial=new RequestGuardError(401)
  let loginUrl
  await assert.rejects(page.default(), error => {
    loginUrl = error.message.replace(/^redirect:/, '')
    return /^\/login\?redirect=%2Fmatch%2Fcalendar%2Fprepare$/.test(loginUrl)
  })
  const loginSource = await readFile(new URL('../../app/(auth)/login/page.tsx', import.meta.url), 'utf8')
  const consumer = loginSource.match(/const requestedRedirect = ([^\r\n]+)/)?.[1]
  assert.ok(consumer, 'The real login redirect reader must remain covered')
  const requestedRedirect = new Function('searchParams', `return ${consumer}`)(new URL(loginUrl, 'https://quantum.test').searchParams)
  assert.equal(requestedRedirect, '/match/calendar/prepare')
  const redirectContract = await load('lib/auth/redirect.ts')
  assert.equal(redirectContract.getPostLoginDestination({ requestedRedirect }), '/auth/continue?next=%2Fmatch%2Fcalendar%2Fprepare')
  denial=new RequestGuardError(403)
  await assert.rejects(page.default(),/not_found/)
  denial=new RequestGuardError(503)
  await assert.rejects(page.default(),/redirect:\/auth\/service-unavailable\?returnTo=%2Fmatch%2Fcalendar%2Fprepare$/)
  assert.equal(guardCalls,4)
})
