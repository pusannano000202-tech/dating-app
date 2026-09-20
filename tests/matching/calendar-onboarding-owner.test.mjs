import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

async function load(path,deps={}) {
  const compiled=ts.transpileModule(await readFile(new URL('../../'+path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText
  const exports={}
  new Function('exports','require',compiled)(exports,name=>{
    assert.ok(Object.hasOwn(deps,name),`Unexpected dependency ${name}`)
    return deps[name]
  })
  return exports
}

async function fixture() {
  const owner='93f7e5e3-682c-41d8-9e12-0b6cb7d8f9c1',calls=[]
  const profile={display_name:'검증사용자',gender:'male',worldcup_completed_at:'2026-09-01T00:00:00Z',appearance_type:'hidden',big5_openness:0.75}
  const transport={createSupabaseRequestClient:()=>({
    auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},
    from(table) {
      calls.push({table})
      const query={select(fields){calls.push({fields});return query},eq(field,id){assert.equal(field,'user_id');assert.equal(id,owner);return query},
        maybeSingle:async()=>({data:profile,error:null}),then(resolve,reject){return Promise.resolve({count:1,error:null}).then(resolve,reject)}}
      return query
    },
    rpc(name) {
      calls.push({rpc:name})
      if(name==='get_my_appearance_score_status')return {maybeSingle:async()=>({data:{status:'ready',photo_revision:'revision',score_raw:99},error:null})}
      assert.equal(name,'get_my_profile_readiness')
      return Promise.resolve({data:[{minimum_signup_complete:true,profile_onboarding_complete:true,matching_ready:true,missing_reasons:[]}],error:null})
    },
  })}
  const resolver=await load('lib/profile/onboarding-status.ts')
  const route=await load('app/api/profile/onboarding/route.ts',{'next/server':{NextResponse:{json:Response.json}},
    '@/lib/profile/onboarding-status':resolver,'@/lib/supabase-request':transport})
  return {owner,calls,route}
}

test('a mismatched readiness owner is rejected before any profile or private status query',async()=>{
  const f=await fixture()
  const response=await f.route.GET(new Request('https://quantum.test/api/profile/onboarding',{headers:{'X-Quantum-Owner':'b7854cfb-0c67-430d-ab71-ebfb89f06934'}}))
  assert.equal(response.status,409)
  assert.deepEqual(await response.json(),{error:'account_changed'})
  assert.deepEqual(f.calls,[])
  assert.match(response.headers.get('cache-control'),/no-store/)
})

test('the matched account gets only readiness, without private score or profile vectors',async()=>{
  const f=await fixture()
  const response=await f.route.GET(new Request('https://quantum.test/api/profile/onboarding',{headers:{'X-Quantum-Owner':f.owner}}))
  assert.equal(response.status,200)
  const payload=await response.json()
  assert.equal(payload.matching_ready,true)
  assert.equal(payload.appearance_status,'ready')
  assert.equal(payload.next_step,'complete')
  for(const field of ['score_raw','score_effective','score_normalized','appearance_type','big5_openness','photo_revision'])assert.ok(!JSON.stringify(payload).includes(field))
  for(const call of f.calls.filter(call=>call.fields))assert.ok(!/score_raw|score_effective|score_normalized/.test(call.fields))
})

test('calendar readiness parsing fails closed and keeps only a safe next-step link',async()=>{
  const {parseCalendarReadiness}=await load('components/matching/calendar-readiness.ts')
  const ready={availability:'ready',matching_ready:true,appearance_status:'ready',missing_reasons:[],next_step:'complete',score_raw:99}
  assert.deepEqual(parseCalendarReadiness(ready),{status:'ready',profileHref:'/match/calendar/prepare'})
  assert.equal(parseCalendarReadiness({...ready,appearance_status:'unavailable'}),null)
  assert.equal(parseCalendarReadiness({...ready,appearance_status:'stale'}),null)
  assert.equal(parseCalendarReadiness({...ready,matching_ready:'true'}),null)
  assert.deepEqual(parseCalendarReadiness({...ready,matching_ready:false,appearance_status:'stale',next_step:'photos'}),{status:'missing',profileHref:'/profile/photos'})
  assert.equal(parseCalendarReadiness({...ready,next_step:'https://attacker.test'}).profileHref,'/match/calendar/prepare')
  for(const appearance_status of ['not_requested','pending','stale','failed']) {
    assert.deepEqual(parseCalendarReadiness({...ready,matching_ready:false,appearance_status}),{status:'missing',profileHref:'/match/calendar/prepare'})
  }
})
