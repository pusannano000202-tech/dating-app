import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile}from'node:fs/promises'
import ts from 'typescript'
const id='51000000-0000-4000-8000-000000000001',other='51000000-0000-4000-8000-000000000002'
const load=async(path,deps={})=>{const exports={};new Function('exports','require',ts.transpileModule(await readFile(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>{assert.ok(Object.hasOwn(deps,n),n);return deps[n]});return exports}
const contract=await load('lib/mentoring/hosted-contract.ts')
const bodySource=await readFile(new URL('../../lib/meetups/study-room-server.ts',import.meta.url),'utf8')
const bodyExports={};new Function('exports',ts.transpileModule(bodySource.slice(bodySource.indexOf('export async function readStudyRoomBody')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(bodyExports)
const room={id,title:'우리 과 이야기',topic:'campus',side_size:2,mentor_count:1,mentee_count:0,member_count:1,status:'open',joined:true,is_host:true,revision:0,expires_at:'2026-09-26T00:00:00Z',department_label:'기계공학과',my_role:'mentor',members:[{id,role:'mentor',label:'멘토 1',mine:true,is_host:true}],messages:[],meeting:null,report_targets:[]}
async function harness(extra={}) {
 const calls=[],state={userId:id,data:{owner_id:id,room},...extra}
 const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}})
 const server=await load('lib/mentoring/hosted-server.ts',{
  '@/lib/auth/server-guards':{requireRequestAccess:async req=>{if(state.denied)throw {status:403};if(req.method==='POST'&&req.headers.get('origin')!=='https://quantum.example')throw{status:403};return{userId:state.userId}},requestGuardErrorResponse:error=>json({error:'guard'},error.status??503)},
  '@/lib/supabase-request':{createSupabaseRequestClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:state.data,error:state.error??null}}})},
  '@/lib/community-feature':{isCommunityFeatureEnabled:()=>true},'@/lib/meetups/http':{meetupJson:json},'@/lib/meetups/study-room-server':bodyExports,'./hosted-contract':contract,
 })
 return{...server,calls,state}
}
const command={action:'create',args:{title:'우리 과 이야기',topic:'campus',role:'mentor',side_size:2,client_id:id}}
const post=(body=command,owner=id,origin='https://quantum.example')=>new Request('https://quantum.example/api/mentoring/rooms',{method:'POST',headers:{'Content-Type':'application/json','X-Quantum-Owner':owner,Origin:origin},body:typeof body==='string'?body:JSON.stringify(body)})
test('authenticated create uses one owner-bound RPC and verifies the returned owner and room',async()=>{
 const f=await harness(),res=await f.hostedMentoringRequest(post(),'create');assert.equal(res.status,200);assert.equal((await res.json()).data.owner_id,id);assert.equal(res.headers.get('Cache-Control'),'private, no-store');assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].args,{p_action:'create',p_args:command.args})
 for(const data of [{owner_id:other,room},{owner_id:id,room:{...room,id:other}}]){
  const g=await harness({data});assert.equal((await g.hostedMentoringRequest(new Request('https://quantum.example/'),'status',id)).status,503)
 }
})
test('foreign origin, account switch, invalid body, extra money/identity and oversized body never reach RPC',async()=>{
 for(const [req,status]of[[post(command,id,'https://evil.example'),403],[post(command,other),409],[post({...command,args:{...command.args,user_id:other}}),400],[post({...command,args:{...command.args,paid:true}}),400],[post('x'.repeat(17000)),400]]){
  const f=await harness();assert.equal((await f.hostedMentoringRequest(req,'create')).status,status);assert.equal(f.calls.length,0)
 }
 const f=await harness({denied:true});assert.equal((await f.hostedMentoringRequest(post(),'create')).status,403);assert.equal(f.calls.length,0)
})
test('route ID cannot be replaced by command ID, and errors do not expose private database detail',async()=>{
 const f=await harness();assert.equal((await f.hostedMentoringRequest(post({action:'leave',args:{session_id:other}}),'action',id)).status,400);assert.equal(f.calls.length,0)
 const g=await harness({error:{message:'postgres internal secret detail',code:'XX000'}}),res=await g.hostedMentoringRequest(post(),'create');assert.equal(res.status,503);assert.equal(JSON.stringify(await res.json()).includes('secret'),false)
 const source=await readFile(new URL('../../lib/mentoring/hosted-server.ts',import.meta.url),'utf8');assert.ok(source.includes('requireRequestAccess(request)'));assert.ok(!source.includes('checkMutationOrigin:false'))
})

test('list transports only owner-bound validated restricted recovery rows without accepting active recovery data',async()=>{
 const {my_role,members,messages,meeting,report_targets,...summary}=room
 const restricted={...summary,title:'참여 상태를 확인할 멘토링',department_label:'참여 관리',participation_restricted:true,joined:false,is_host:false,status:'closed',mentor_count:0,mentee_count:0,member_count:0}
 const req=()=>new Request('https://quantum.example/api/mentoring/rooms')
 const f=await harness({data:{owner_id:id,rooms:[restricted]}}),response=await f.hostedMentoringRequest(req(),'list')
 assert.equal(response.status,200);assert.equal((await response.json()).data.rooms[0].participation_restricted,true)
 assert.deepEqual(f.calls[0].args,{p_action:'list',p_args:{}})
 for(const data of [{owner_id:other,rooms:[restricted]},{owner_id:id,rooms:[{...restricted,status:'open'}]},{owner_id:id,rooms:[{...restricted,member_count:1,mentor_count:1}]}]) {
  const g=await harness({data});assert.equal((await g.hostedMentoringRequest(req(),'list')).status,503)
 }
})
