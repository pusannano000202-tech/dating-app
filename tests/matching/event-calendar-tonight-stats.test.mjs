import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const roundId='11111111-1111-4111-8111-111111111111'
const otherId='22222222-2222-4222-8222-222222222222'
const source=path=>readFile(new URL('../../'+path,import.meta.url),'utf8')
async function load(path,deps={}){
 const exports={}
 const compiled=ts.transpileModule(await source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('exports','require',compiled)(exports,name=>{
  assert.ok(Object.hasOwn(deps,name),`Unexpected dependency ${name}`)
  return deps[name]
 })
 return exports
}
async function handler({stats={roundId,teamCount:1},statsError=false,summaryError=false,gateError=false,noRound=false,unauthorized=false}={}){
 const calls=[]
 class RequestGuardError extends Error{}
 const deps={
  '@/lib/auth/server-guards':{RequestGuardError,requireRequestAccess:async()=>{if(unauthorized)throw new RequestGuardError()},requestGuardErrorResponse:()=>Response.json({error:'unauthorized'},{status:401})},
  '@/lib/supabase-request':{createSupabaseRequestClient:()=>({rpc:(name,args)=>{
   const pending = Promise.resolve().then(() => {
   calls.push({name,args})
   if(name==='get_my_current_tonight_round')return {data:noRound?null:{round:{id:roundId,status:'open',signup_open_at:'2020-01-01T00:00:00Z',signup_close_at:'2099-01-01T00:00:00Z'},application:{id:otherId,status:'allocated'}},error:null}
   if(name==='get_my_tonight_participation_summary')return {data:{scopeId:`tonight:${roundId}`,genderBreakdown:{malePeople:3,femalePeople:2}},error:summaryError?{message:summaryError===true?'unavailable':summaryError}:null}
   if(name==='get_tonight_application_gate')return {data:true,error:gateError?{message:gateError===true?'unavailable':gateError}:null}
   if(name==='get_my_current_tonight_team_count')return {data:stats,error:statsError?{message:'missing_rpc'}:null}
   assert.fail(`Unexpected RPC ${name}`)
   })
   pending.abortSignal = () => pending
   return pending
  }})},
  '@/lib/matching/tonight-ranked/runtime':{getTonightFeatureState:()=>({visible:true,applicationsOpen:true})},
  '@/lib/matching/tonight-ranked/read-with-deadline':await load('lib/matching/tonight-ranked/read-with-deadline.ts'),
  '@/lib/server/tonight/api-contract':{privateJson:(body,status=200)=>Response.json(body,{status}),tonightRpcErrorResponse:error=>Response.json({error:'unavailable'},{status:error.message==='forbidden'?403:503})},
 }
 // The stats parser is a pure local module; no production imports or network.
 try{deps['@/lib/matching/event-calendar-stats']=await load('lib/matching/event-calendar-stats.ts')}catch(error){if(error.code!=='ENOENT')throw error}
 const route=await load('app/api/tonight/route.ts',deps)
 return {response:await route.GET(new Request('https://quantum.test/api/tonight')),calls}
}
test('current round returns actual aggregate values without identity fields',async()=>{
 const {response,calls}=await handler({stats:{roundId,maleApplicationCount:3,femaleApplicationCount:2,teamCount:1,userId:otherId}})
 assert.equal(response.status,200)
 assert.deepEqual((await response.json()).round_stats,{maleApplicationCount:3,femaleApplicationCount:2,teamCount:1})
 assert.deepEqual(calls.find(call=>call.name==='get_my_current_tonight_team_count').args,{p_round_id:roundId})
})
test('missing or failed aggregate is null, never a fabricated zero',async()=>{
 for(const options of [{stats:null},{statsError:true},{stats:{roundId:otherId,maleApplicationCount:0,femaleApplicationCount:0,teamCount:0}}]){
  const {response}=await handler(options)
  assert.equal(response.status,200)
  assert.deepEqual((await response.json()).round_stats,{maleApplicationCount:3,femaleApplicationCount:2,teamCount:null})
 }
})
test('empty current round does not query counts for other rounds',async()=>{
 const {response,calls}=await handler({noRound:true})
 assert.equal((await response.json()).round_stats,null)
 assert.equal(calls.some(call=>call.name==='get_my_current_tonight_team_count'),false)
})
test('unauthenticated request cannot query aggregate or round rows',async()=>{
 const {response,calls}=await handler({unauthorized:true})
 assert.equal(response.status,401)
 assert.equal(calls.length,0)
})

test('aggregate failures preserve owned application while the absent count remains unknown',async()=>{
 const {response}=await handler({summaryError:true})
 assert.equal(response.status,200)
 const body=await response.json()
 assert.equal(body.round.application.id,otherId)
 assert.equal(body.participation_summary,null)
 assert.equal(body.round_stats,null)
})

test('application gate failures keep owned participation visible and new admission closed',async()=>{
 const {response}=await handler({gateError:true})
 assert.equal(response.status,200)
 const body=await response.json()
 assert.equal(body.round.application.id,otherId)
 assert.equal(body.applications_open,false)
 assert.equal(body.applications_available,false)
})

test('access failures in secondary reads still stop private data delivery',async()=>{
 for(const options of [{summaryError:'forbidden'},{gateError:'forbidden'}]){
  const {response}=await handler(options)
  assert.equal(response.status,403)
  assert.equal((await response.json()).round,undefined)
 }
})
