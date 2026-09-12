import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const id='67000000-0000-4000-8000-000000000001',other='67000000-0000-4000-8000-000000000002'
async function load(path,deps={}){const exports={};new Function('exports','require',ts.transpileModule(await readFile(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]});return exports}
const boardContract=await load('lib/meetups/candidate-board-contract.ts')
const contract=await load('lib/meetups/candidate-deposit-contract.ts',{'./candidate-board-contract':boardContract})
const access=await load('lib/auth/access-context.ts')
const origin=await load('lib/auth/trusted-origin.ts',{'./api-request-auth':await load('lib/auth/api-request-auth.ts'),'./strict-app-origin':await load('lib/auth/strict-app-origin.ts')})
const context={owner_id:id,scope:{kind:'league',key:'lol'},quote:null,policy:null,checkout_enabled:false,preparation_only:true,funding:'unavailable'}
const get=(query='scope_kind=league&scope_key=lol')=>new Request('https://quantum.example/api/meetups/candidates/deposit?'+query)
async function harness(extra={}){
 const state={owner:id,data:context,error:null,enabled:true,...extra},calls=[]
 const client={auth:{getUser:async()=>({data:{user:state.denied===401?null:{id:state.owner}},error:state.authError??null})},rpc:async(name,args)=>{
  if(name==='get_server_access_context')return{data:[{access_role:'user',partner_venue_ids:[]}],error:state.contextError??null}
  calls.push({name,args});if(state.throwRpc)throw new Error('private transport data');return{data:state.data,error:state.error}
 }}
 const guard=await load('lib/auth/server-guards.ts',{'../supabase-request':{createSupabaseRequestClient:()=>client},'../utils':{isSupabaseConfigured:()=>true,getPublicAppOrigin:()=> 'https://quantum.example'},'./access-context':access,'./trusted-origin':origin})
 const server=await load('lib/meetups/candidate-deposit-server.ts',{
  '@/lib/auth/server-guards':guard,'@/lib/supabase-request':{createSupabaseRequestClient:()=>client},
  '@/lib/community-feature':{isCommunityFeatureEnabled:()=>state.enabled},'./candidate-board-contract':boardContract,'./candidate-deposit-contract':contract,
  './http':{meetupJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}})},
 })
 return{calls,state,run:server.candidateDepositRequest}
}

test('deposit availability is owned, scoped and noncached while provider checkout and quote stay absent',async()=>{
 const f=await harness(),response=await f.run(get())
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{data:context});assert.equal(response.headers.get('Cache-Control'),'private, no-store')
 assert.deepEqual(f.calls,[{name:'get_meetup_candidate_deposit_context',args:{p_scope_kind:'league',p_scope_key:'lol'}}])
})

test('exact context contract rejects invented funding, money, identity and policy details',async()=>{
 assert.deepEqual(contract.parseCandidateDepositContext(context),context)
 for(const data of [{...context,paid:true},{...context,funding:'held'},{...context,checkout_enabled:true},{...context,quote:{amountKrw:10000}},{...context,policy:{}},{...context,owner_id:'bad'},{...context,preparation_only:false},{...context,scope:{kind:'league',key:'unknown'}},{...context,scope:{...context.scope,owner_id:id}}])assert.equal(contract.parseCandidateDepositContext(data),null)
 for(const data of [{...context,owner_id:other},{...context,scope:{kind:'league',key:'futsal'}},{...context,amount:10000},{...context,funding:'held'},{...context,quote:'x'.repeat(4100)}]){
  const f=await harness({data});assert.equal((await f.run(get())).status,503)
 }
})

test('unknown or duplicate query, client owner and payment claims never reach context RPC',async()=>{
 for(const query of ['scope_kind=league&scope_key=lol&scope_key=lol','scope_kind=league','scope_kind=league&scope_key=lol&owner_id='+other,'scope_kind=league&scope_key=lol&paid=true','scope_kind=league&scope_key=lol&amount=10000','scope_kind=study&scope_key=','scope_kind=mentoring&scope_key=unknown']){
  const f=await harness();assert.equal((await f.run(get(query))).status,400,query);assert.equal(f.calls.length,0)
 }
 const f=await harness(),request=new Request('https://quantum.example/api/meetups/candidates/deposit',{method:'POST',headers:{Origin:'https://quantum.example'}})
 assert.equal((await f.run(request)).status,405);assert.equal(f.calls.length,0)
})

test('signed-out, live identity failures and disabled feature cannot reveal availability',async()=>{
 for(const [extra,status]of [[{denied:401},401],[{authError:{message:'private auth failure'}},503],[{contextError:{message:'context outage'}},503],[{enabled:false},503]]){
  const f=await harness(extra),response=await f.run(get());assert.equal(response.status,status);assert.equal(f.calls.length,0);assert.equal(response.headers.get('Cache-Control'),'private, no-store')
 }
})

test('known privacy and preparation errors stay explicit while unknown failures remain private',async()=>{
 for(const [message,status]of [['not_authenticated',401],['candidate_account_unavailable',403],['department_identity_required',409],['invalid_candidate_scope',400],['candidate_deposit_unavailable',503],['secret payment database detail',503]]){
  const f=await harness({error:{message}}),response=await f.run(get());assert.equal(response.status,status)
  assert.equal((await response.json()).error,message==='secret payment database detail'?'candidate_deposit_unavailable':message)
 }
 const f=await harness({throwRpc:true}),response=await f.run(get());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private transport/)
})
