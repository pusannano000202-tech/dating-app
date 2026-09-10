import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

// Execute the real route, validators and HTTP helpers. Only the authenticated
// transport is replaced; these tests never connect to Supabase or send notices.
async function load(path,dependencies={}){
 const source=await readFile(new URL('../../'+path,import.meta.url),'utf8')
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={}
 new Function('exports','require',output)(exports,name=>{assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name]})
 return exports
}
const input=await load('lib/server/tonight/api-contract.ts')
const origin=await load('lib/auth/trusted-origin.ts',{
 './api-request-auth':await load('lib/auth/api-request-auth.ts'),
 './strict-app-origin':await load('lib/auth/strict-app-origin.ts'),
})
const http=await load('lib/meetups/http.ts',{'../server/tonight/api-contract':input,'../auth/trusted-origin':origin})
const contract=await load('lib/meetups/league-recruitment.ts',{'./challenge-journey':await load('lib/meetups/challenge-journey.ts')})
const id='10000000-0000-4000-8000-000000000001'
const url='https://quantum.example/api/community/department/league/recruitment'
const emptyPage={sport:'lol',my_department:'기계공학과',total_count:0,next_cursor:null,teams:[]}

async function harness(options={}){
 const calls=[]
 const state={configured:true,authError:null,user:{id},rpcError:null,data:emptyPage,...options}
 const server=await load('lib/meetups/league-recruitment-server.ts',{
  '@/lib/meetups/league-recruitment':contract,
  '@/lib/meetups/http':http,
  '@/lib/utils':{isSupabaseConfigured:()=>state.configured},
  '@/lib/supabase-request':{createSupabaseRequestClient:request=>{
   calls.push(['client',request])
   return {auth:{getUser:async()=>({data:{user:state.user},error:state.authError})},rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:state.data,error:state.rpcError}}}
  }},
 })
 const route=await load('app/api/community/department/league/recruitment/route.ts',{
  '@/lib/auth/trusted-origin':{assertTrustedMutationOrigin:request=>origin.assertTrustedMutationOrigin(request,'https://quantum.example')},
  '@/lib/meetups/http':http,
  '@/lib/meetups/league-recruitment-server':server,
  '@/lib/server/tonight/api-contract':input,
 })
 return {route,state,calls}
}
const post=(body,requestOrigin='https://quantum.example')=>new Request(url,{method:'POST',headers:{'Content-Type':'application/json',...(requestOrigin?{Origin:requestOrigin}:{})},body:typeof body==='string'?body:JSON.stringify(body)})
const close={action:'close',args:{sport:'lol',team_id:id,expected_revision:0,idempotency_key:id}}

test('browse defaults to a private non-cached response and sends only validated scope to RPC',async()=>{
 const {route,calls}=await harness()
 const response=await route.GET(new Request(url+'?sport=lol'))
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store')
 assert.deepEqual(await response.json(),{recruitment:emptyPage})
 assert.deepEqual(calls.filter(c=>c[0]==='rpc'),[['rpc','department_league_recruitment',{p_action:'browse',p_args:{sport:'lol',cursor:null}}]])
})

test('malformed GET scope cannot reach the authenticated transport',async()=>{
 for(const query of ['sport=lol&sport=football','sport=lol&action=publish','sport=lol&department=other','sport=lol&cursor=bad','action=detail&sport=lol&challenge_id=bad','sport=bad']){
  const {route,calls}=await harness()
  assert.equal((await route.GET(new Request(url+'?'+query))).status,400,query)
  assert.deepEqual(calls,[],query)
 }
})

test('cookie mutations reject absent or foreign origin before authentication',async()=>{
 for(const requestOrigin of [null,'https://attacker.example']){
  const {route,calls}=await harness()
  assert.equal((await route.POST(post(close,requestOrigin))).status,403)
  assert.deepEqual(calls,[])
 }
})

test('strict POST shapes reject forged authority and unsupported actions without any RPC',async()=>{
 for(const body of ['{',[],{...close,captain_user_id:id},{...close,action:'approve'},{...close,args:{...close.args,department:'다른학과'}},{...close,args:{...close.args,expected_revision:-1}}]){
  const {route,calls}=await harness()
  assert.equal((await route.POST(post(body))).status,400)
  assert.deepEqual(calls,[])
 }
})

test('missing configuration, auth outage and signed-out users fail closed without RPC',async()=>{
 for(const [options,status]of [[{configured:false},503],[{authError:{message:'unavailable'}},503],[{user:null},401]]){
  for(const method of ['GET','POST']){
   const {route,calls}=await harness(options)
   const response=await route[method](method==='GET'?new Request(url+'?sport=lol'):post(close))
   assert.equal(response.status,status)
   assert.equal(calls.filter(c=>c[0]==='rpc').length,0)
   if(options.configured===false)assert.deepEqual(calls,[])
  }
 }
})

test('stale state, department restrictions and missing schema preserve actionable error status',async()=>{
 for(const [message,status]of [['stale_revision',409],['department_restricted',403],['captain_required',403],['function does not exist',503]]){
  const {route}=await harness({rpcError:{message},data:null})
  const response=await route.POST(post(close))
  assert.equal(response.status,status)
  assert.equal(response.headers.get('cache-control'),'private, no-store')
 }
})

test('invalid RPC read data is not represented as a successful empty team list',async()=>{
 const {route}=await harness({data:{...emptyPage,total_count:'0'}})
 const response=await route.GET(new Request(url+'?sport=lol'))
 assert.equal(response.status,503)
 assert.deepEqual(await response.json(),{error:'community_request_failed'})
})

test('a malformed notice write response must not be reported as saved',async()=>{
 const {route}=await harness({data:{}})
 const response=await route.POST(post(close))
 assert.equal(response.status,503)
})
