import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
async function load(path,dependencies={}){
 const source=await readFile(new URL('../../'+path,import.meta.url),'utf8'),exports={}
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('exports','require',compiled)(exports,name=>{assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name]});return exports
}
const input=await load('lib/server/tonight/api-contract.ts'),contract=await load('lib/meetups/challenge-journey.ts')
const origin=await load('lib/auth/trusted-origin.ts',{'./api-request-auth':await load('lib/auth/api-request-auth.ts'),'./strict-app-origin':await load('lib/auth/strict-app-origin.ts')})
const http=await load('lib/meetups/http.ts',{'../server/tonight/api-contract':input,'../auth/trusted-origin':origin})
const id='10000000-0000-4000-8000-000000000001',url='https://quantum.example/api/community/department/league/journey'
const args={sport:'lol',challenge_id:id,team_id:id,slot:'top',tier:'gold',expected_revision:0,idempotency_key:id,aspiration:'열심히 함께할게요',strengths:'운영과\n소통'}
const result={challenge_id:id,team_id:id,roster_id:id,revision:1}
async function harness(options={}){
 const calls=[],state={configured:true,user:{id},authError:null,data:result,error:null,...options}
 const route=await load('app/api/community/department/league/journey/route.ts',{
  '@/lib/auth/trusted-origin':{assertTrustedMutationOrigin:request=>origin.assertTrustedMutationOrigin(request,'https://quantum.example')},'@/lib/meetups/challenge-journey':contract,'@/lib/meetups/http':http,'@/lib/server/tonight/api-contract':input,'@/lib/utils':{isSupabaseConfigured:()=>state.configured},
  '@/lib/supabase-request':{createSupabaseRequestClient:()=>({auth:{getUser:async()=>({data:{user:state.user},error:state.authError})},rpc:async(name,data)=>{calls.push({name,data});return{data:state.data,error:state.error}}})},
 });return{route,calls}
}
const request=(extra={},origin='https://quantum.example')=>new Request(url,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify({action:'join',args:{...args,...extra}})})
test('authenticated voluntary introduction reaches the existing RPC without changing the success envelope',async()=>{
 const{route,calls}=await harness(),response=await route.POST(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{journey:result});assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(calls,[{name:'department_league_journey',data:{p_action:'join',p_args:args}}])
})
test('invalid introduction and forged fields are rejected before any RPC',async()=>{
 for(const extra of[{aspiration:'x'.repeat(81)},{strengths:null},{aspiration:'숨김\u202e'},{application_intro:{aspiration:'위조',strengths:''}},{user_id:id}]){
  const{route,calls}=await harness();assert.equal((await route.POST(request(extra))).status,400);assert.deepEqual(calls,[])
 }
})
test('origin, authentication and missing configuration block introduction writes and stale requests remain conflicts',async()=>{
 for(const[options,status,originValue]of[[{},403,null],[{},403,'https://evil.example'],[{user:null},401,'https://quantum.example'],[{authError:{message:'offline'}},503,'https://quantum.example'],[{configured:false},503,'https://quantum.example']]){
  const{route,calls}=await harness(options);assert.equal((await route.POST(request({},originValue))).status,status);assert.deepEqual(calls,[])
 }
 const{route}=await harness({error:{message:'stale_revision'}});assert.equal((await route.POST(request())).status,409)
})
test('ambiguous read scope and invalid or unauthorized private overview DTOs fail closed',async()=>{
 const{route,calls}=await harness({data:{}});assert.equal((await route.GET(new Request(url+'?sport=lol&sport=football'))).status,400);assert.deepEqual(calls,[])
 assert.equal((await route.GET(new Request(url+'?sport=lol'))).status,503)
 const state={sport:'lol',my_department:'기계공학과',month:'2026-09',standings:[],monthly_standings:[],challenges:[{id,title:'우리 팀',status:'recruiting',revision:0,scheduled_at:null,ends_at:null,place_name:null,schedule_proposals:[],result:null,teams:[{id,department:'기계공학과',is_mine:false,is_captain:false,may_join:true,ready:false,waiting:false,gap:200,score:null,players:[{id,alias:'별친구',is_me:false,status:'accepted',slot:'top',position:'top',tier:'gold',application_intro:{aspiration:'노출 금지',strengths:''}}]}]}]}
 const unauthorized=await harness({data:state});assert.equal((await unauthorized.route.GET(new Request(url+'?sport=lol'))).status,503)
})
