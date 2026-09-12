import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const owner='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001',app='30000000-0000-4000-8000-000000000001'
async function load(path,deps={}){const code=ts.transpileModule(await readFile(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={};new Function('exports','require',code)(exports,n=>{assert.ok(Object.hasOwn(deps,n),n);return deps[n]});return exports}
const baseContract=await load('lib/meetups/admission-contract.ts'),baseServer=await load('lib/meetups/admission-server.ts',{'./admission-contract':baseContract})
const baseLifecycle=await load('lib/meetups/admission-lifecycle.ts',{'./admission-contract':baseContract,'./admission-server':baseServer})
const contract=await load('lib/meetups/native-admission-contract.ts',{'./admission-contract':baseContract,'./admission-lifecycle':baseLifecycle})
const server=await load('lib/meetups/native-admission-server.ts',{'./admission-server':baseServer,'./admission-lifecycle':baseLifecycle,'./native-admission-contract':contract})
async function harness(options={}){
 const state={configured:true,user:{id:owner},authError:null,result:{id:app,admission:'accepted',payment:'held',amountKrw:17000,revision:1,chatHref:`/chat/rooms/study_room/${id}`},...options},calls=[]
 const json={meetupJson:(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}}),meetupInputErrorResponse:error=>Response.json({error:error.code??'request_not_allowed'},{status:error.status??403})}
 const baseHttp=await load('lib/meetups/admission-http.ts',{'./admission-contract':baseContract,'./admission-server':baseServer,'./http':json,'@/lib/auth/trusted-origin':{assertTrustedMutationOrigin:r=>{if(r.method!=='GET'&&r.headers.get('origin')!=='https://quantum.example')throw new baseServer.AdmissionServerError('request_not_allowed',403)}},'@/lib/utils':{isSupabaseConfigured:()=>state.configured},'@/lib/supabase-request':{createSupabaseRequestClient:()=>({auth:{getUser:async()=>({data:{user:state.user},error:state.authError})},rpc:async(name,args)=>{calls.push([name,args]);return{data:state.result,error:null}}})}})
 const http=await load('lib/meetups/native-admission-http.ts',{'./admission-http':baseHttp,'./admission-server':baseServer,'./native-admission-contract':contract})
 const deps={'@/lib/meetups/native-admission-http':http,'@/lib/meetups/native-admission-server':server,'@/lib/meetups/http':json},prefix='app/api/meetups/participation/[kind]/[id]/'
 return{calls,management:await load(prefix+'applications/route.ts',deps),application:await load(prefix+'application/route.ts',deps),status:await load(prefix+'application/status/route.ts',deps),cancel:await load(prefix+'application/cancel/route.ts',deps)}
}
const ctx=(kind='study')=>({params:Promise.resolve({kind,id})})
const request=(body,options={})=>new Request(`https://quantum.example/api/meetups/participation/study/${id}/applications`,{method:'PATCH',headers:{origin:'https://quantum.example','content-type':'application/json','x-quantum-owner':owner,...options.headers},body:JSON.stringify(body),...Object.fromEntries(Object.entries(options).filter(([k])=>k!=='headers'))})
test('native HTTP binds account+kind+room+revision, never forwards browser money',async()=>{
 const f=await harness(),r=await f.management.PATCH(request({applicationId:app,action:'approve',revision:0}),ctx())
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(f.calls,[['decide_native_meetup_admission',{p_kind:'study',p_room_id:id,p_application_id:app,p_action:'approve',p_revision:0}]])
 for(const patch of [{paid:true},{role:'mentor'},{amountKrw:0},{userId:owner}]){const g=await harness();assert.equal((await g.management.PATCH(request({applicationId:app,action:'approve',revision:0,...patch}),ctx())).status,400);assert.equal(g.calls.length,0)}
})
test('account switch/missing owner, cross-origin, invalid kind and chunked oversize do not mutate',async()=>{
 for(const [options,kind,status]of [[{headers:{'x-quantum-owner':''}},'study',409],[{headers:{'x-quantum-owner':id}},'study',409],[{headers:{origin:'https://evil.example'}},'study',403],[{},'custom_meetup',400]]){const f=await harness();assert.equal((await f.management.PATCH(request({applicationId:app,action:'approve',revision:0},options),ctx(kind))).status,status);assert.equal(f.calls.length,0)}
 const f=await harness();assert.equal((await f.management.PATCH(request({intro:'a'.repeat(2500)}),ctx())).status,413);assert.equal(f.calls.length,0)
})
test('native context retains checkout-off and account fence while policy is unavailable',async()=>{
 const data={room:{kind:'mentoring',id},metadata:{role:'mentee'},roomDetails:{title:'우리 과 진로 이야기',memberCount:1,capacity:4},quote:null,policy:null,checkoutEnabled:false,preparationOnly:true}
 const f=await harness({result:data});const response=await f.application.GET(new Request('https://quantum.example/application?role=mentee'),ctx('mentoring'))
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{accountKey:owner,...data});assert.deepEqual(f.calls,[['get_native_meetup_admission_context',{p_kind:'mentoring',p_room_id:id,p_metadata:{role:'mentee'}}]])
 const missing=await harness();assert.equal((await missing.application.GET(new Request('https://quantum.example/application'),ctx('mentoring'))).status,400);assert.equal(missing.calls.length,0)
})
