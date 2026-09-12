import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const id='67000000-0000-4000-8000-000000000001',other='67000000-0000-4000-8000-000000000002'
async function load(path,deps={}){const exports={};new Function('exports','require',ts.transpileModule(await readFile(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]});return exports}
const contract=await load('lib/meetups/candidate-board-contract.ts')
const access=await load('lib/auth/access-context.ts')
const origin=await load('lib/auth/trusted-origin.ts',{'./api-request-auth':await load('lib/auth/api-request-auth.ts'),'./strict-app-origin':await load('lib/auth/strict-app-origin.ts')})
const board={owner_id:id,scope:{kind:'league',key:'lol'},department_label:'기계공학과',total_count:0,filtered_count:0,candidates:[],next_cursor:null,mine:null,incoming:[],outgoing:[],host_rooms:[],result:null}
const args={scope_kind:'league',scope_key:'lol',positions:['top','mid'],tier:'gold',intro:'함께 연습해요',availability:'월수 저녁',consent:true,expected_revision:null,idempotency_key:id}
const command={action:'register',args}
const get=(query='scope_kind=league&scope_key=lol')=>new Request('https://quantum.example/api/meetups/candidates?'+query)
const post=(body=command,headers={})=>new Request('https://quantum.example/api/meetups/candidates',{method:'POST',headers:{'Content-Type':'application/json','X-Quantum-Owner':id,Origin:'https://quantum.example',...headers},body:typeof body==='string'?body:JSON.stringify(body)})
async function harness(extra={}) {
 const state={owner:id,data:board,error:null,enabled:true,...extra},calls=[]
 const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
 const client={auth:{getUser:async()=>({data:{user:state.denied===401?null:{id:state.owner}},error:state.authError??null})},rpc:async(name,value)=>{
  if(name==='get_server_access_context')return{data:[{access_role:'user',partner_venue_ids:[]}],error:state.contextError??null}
  calls.push({name,args:value});if(state.throwRpc)throw new Error('private transport secret');return{data:state.data,error:state.error}
 }}
 const guard=await load('lib/auth/server-guards.ts',{'../supabase-request':{createSupabaseRequestClient:()=>client},'../utils':{isSupabaseConfigured:()=>true,getPublicAppOrigin:()=> 'https://quantum.example'},'./access-context':access,'./trusted-origin':origin})
 // Run actual current-user, live-context and trusted-origin guards; only transport is simulated.
 const module=await load('lib/meetups/candidate-board-server.ts',{
  '@/lib/auth/server-guards':{...guard,requireRequestAccess:async request=>{if(state.denied===403)throw new guard.RequestGuardError(403);return guard.requireRequestAccess(request)}},
  '@/lib/supabase-request':{createSupabaseRequestClient:()=>client},
  '@/lib/community-feature':{isCommunityFeatureEnabled:()=>state.enabled},'./http':{meetupJson:json},'./candidate-board-contract':contract,
 })
 return{state,calls,run:module.candidateBoardRequest}
}
test('candidate overview normalizes exact query and returns only an owned noncached board',async()=>{
 const f=await harness(),response=await f.run(get());assert.equal(response.status,200);assert.deepEqual(await response.json(),{data:board});assert.equal(response.headers.get('Cache-Control'),'private, no-store')
 assert.deepEqual(f.calls,[{name:'meetup_candidate_board',args:{p_action:'overview',p_args:{scope_kind:'league',scope_key:'lol',filter:'all',cursor:null}}}])
 for(const data of [{...board,owner_id:other},{...board,scope:{kind:'league',key:'futsal'}},{...board,result:{status:'joining',checkout_enabled:false,next_href:'https://evil.test'}}]){const x=await harness({data});assert.equal((await x.run(get())).status,503)}
})
test('registration has explicit owner fence and sends role consent without accepting foreign identity or money',async()=>{
 const f=await harness(),response=await f.run(post());assert.equal(response.status,200);assert.deepEqual(f.calls[0],{name:'meetup_candidate_board',args:{p_action:'register',p_args:args}})
 for(const bad of [{...command,owner_id:id},{...command,args:{...args,user_id:other}},{...command,args:{...args,paid:true}},{...command,args:{...args,amount:1}},{...command,args:{...args,consent:false}},{...command,args:{...args,positions:['mid','mid']}}]){const x=await harness();assert.equal((await x.run(post(bad))).status,400);assert.equal(x.calls.length,0)}
})
test('unknown/duplicate query, invalid filters or cursor never reach the RPC',async()=>{
 for(const query of ['scope_kind=league&scope_key=lol&scope_key=lol','scope_kind=league&scope_key=lol&owner_id='+id,'scope_kind=league&scope_key=lol&filter=admin','scope_kind=league&scope_key=lol&cursor=bad','scope_kind=league&scope_key=lol&cursor=','scope_kind=mentoring&scope_key=unknown','scope_kind=league']){
  const f=await harness();assert.equal((await f.run(get(query))).status,400,query);assert.equal(f.calls.length,0)
 }
})
test('foreign origin, stale account, sign-out and closed feature cannot mutate or disclose a board',async()=>{
 for(const [options,request,status]of [[{},post(command,{Origin:'https://evil.test'}),403],[{},post(command,{'X-Quantum-Owner':other}),409],[{},post(command,{'X-Quantum-Owner':''}),409],[{denied:401},get(),401],[{denied:403},post(),403],[{enabled:false},get(),503]]){
  const f=await harness(options),response=await f.run(request);assert.equal(response.status,status);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(f.calls.length,0)
 }
})
test('real live-auth and access-context failures do not become empty successful boards',async()=>{
 for(const options of [{authError:{message:'auth outage'}},{contextError:{message:'live context unavailable'}}]){const f=await harness(options),response=await f.run(get());assert.equal(response.status,503);assert.equal(f.calls.length,0)}
 const missingOrigin=post();missingOrigin.headers.delete('Origin');const f=await harness();assert.equal((await f.run(missingOrigin)).status,403);assert.equal(f.calls.length,0)
 const invalidBearer=post(command,{Authorization:'Bearer token,other'}),g=await harness();assert.equal((await g.run(invalidBearer)).status,401);assert.equal(g.calls.length,0)
})
test('bounded strict JSON rejects malformed body, wrong type and oversized streamed bytes',async()=>{
 for(const [request,status]of [[post('not json'),400],[post('[]'),400],[post('{}'),400],[post(command,{'Content-Type':'text/plain'}),400],[post(command,{'Content-Length':'-1'}),400],[post(command,{'Content-Length':'9000'}),413],[post('x'.repeat(4097)),413]]){
  const f=await harness(),response=await f.run(request);assert.equal(response.status,status);assert.equal(f.calls.length,0)
 }
 const f=await harness(),stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('가'.repeat(1400)));controller.close()}})
 const request=new Request('https://quantum.example/api/meetups/candidates',{method:'POST',headers:{Origin:'https://quantum.example','X-Quantum-Owner':id,'Content-Type':'application/json'},body:stream,duplex:'half'})
 assert.equal((await f.run(request)).status,413);assert.equal(f.calls.length,0)
})
test('idempotent invitation actions keep exact scope and keys and never expose raw database failures',async()=>{
 for(const action of ['accept','decline','release']){const f=await harness(),a={scope_kind:'league',scope_key:'lol',invite_id:other,expected_revision:2,idempotency_key:id};assert.equal((await f.run(post({action,args:a}))).status,200);assert.deepEqual(f.calls[0].args.p_args,a)}
 for(const options of [{error:{message:'database secret account phone',code:'XX000'}},{throwRpc:true},{data:{...board,extra:'private source'}},{data:'x'.repeat(200001)}]){const f=await harness(options),response=await f.run(get());assert.equal(response.status,503);assert.equal(JSON.stringify(await response.json()).includes('secret'),false)}
 const f=await harness({error:{message:'candidate_conflict'}});assert.equal((await f.run(post())).status,409)
})
test('route entry delegates GET/POST to the same guarded handler without bypass mode',async()=>{
 const calls=[],route=await load('app/api/meetups/candidates/route.ts',{'@/lib/meetups/candidate-board-server':{candidateBoardRequest:async r=>{calls.push(r.method);return Response.json({ok:true})}}})
 await route.GET(get());await route.POST(post());assert.deepEqual(calls,['GET','POST']);assert.equal(route.dynamic,'force-dynamic')
 const source=await readFile(new URL('../../lib/meetups/candidate-board-server.ts',import.meta.url),'utf8');assert.ok(source.includes('requireRequestAccess(request)'));assert.equal(source.includes('checkMutationOrigin:false'),false)
})
