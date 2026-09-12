import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import ts from 'typescript'

const require=createRequire(import.meta.url)
const {NextRequest,NextResponse}=require('next/server')
const root=fileURLToPath(new URL('../../',import.meta.url))
const origin='https://quantum.example'
const ownerId='10000000-0000-4000-8000-000000000001'
const notificationId='20000000-0000-4000-8000-000000000002'
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText

// Production handlers, parser, origin checks and Next request/response objects are
// executed unchanged. Only the request-scoped database client is substituted.
function loadModule(file,deps={},cache=new Map()){
 if(cache.has(file))return cache.get(file).exports
 const module={exports:{}}
 cache.set(file,module)
 new Function('exports','module','require',compile(readFileSync(file,'utf8')))(module.exports,module,specifier=>{
  if(Object.hasOwn(deps,specifier))return deps[specifier]
  if(specifier.startsWith('.'))return loadModule(path.resolve(path.dirname(file),specifier+'.ts'),deps,cache)
  throw new Error('Unexpected dependency: '+specifier)
 })
 return module.exports
}
const contract=loadModule(path.join(root,'lib/notifications/common-contract.ts'))
const trustedOrigin=loadModule(path.join(root,'lib/auth/trusted-origin.ts'))

function harness(options={}){
 const state={user:{id:ownerId},authError:null,authThrows:false,rpcError:null,rpcThrows:false,data:true,configuredOrigin:origin,...options}
 const calls=[],clients=[]
 const deps={
  'next/server':{NextRequest,NextResponse},
  '@/lib/notifications/common-contract':contract,
  '@/lib/auth/trusted-origin':{...trustedOrigin,assertTrustedMutationOrigin:req=>trustedOrigin.assertTrustedMutationOrigin(req,state.configuredOrigin)},
  '@/lib/supabase-request':{createSupabaseRequestClient:req=>{
   clients.push(req)
   return{
    auth:{getUser:async()=>{
     if(state.authThrows)throw new Error('auth transport unavailable')
     return{data:{user:state.user},error:state.authError}
    }},
    rpc:async(name,args)=>{
     calls.push({name,args})
     if(state.rpcThrows)throw new Error('rpc transport unavailable')
     return{data:state.data,error:state.rpcError}
    },
   }
  }},
 }
 const read=loadModule(path.join(root,'app/api/notifications/read/route.ts'),deps)
 const count=loadModule(path.join(root,'app/api/notifications/unread-count/route.ts'),deps)
 return{
  state,calls,clients,
  post:(body,request={})=>{
   const headers=new Headers({'Content-Type':'application/json'})
   if(request.origin!==null)headers.set('Origin',request.origin??origin)
   if(request.authorization)headers.set('Authorization',request.authorization)
   return read.POST(new NextRequest(origin+'/api/notifications/read',{method:'POST',headers,body:request.raw??JSON.stringify(body)}))
  },
  get:()=>count.GET(new NextRequest(origin+'/api/notifications/unread-count')),
 }
}
async function responseBody(response,status){
 assert.equal(response.status,status)
 assert.equal(response.headers.get('Cache-Control'),'private, no-store')
 return response.json()
}

test('read parser accepts only an explicit UUID or all:true, never malformed, empty or ambiguous input',()=>{
 for(const value of [undefined,null,[],['all'],true,1,'all',{}, {all:false},{all:'true'},{all:1},{notification_id:''},{notification_id:'bad'},{notification_id:[notificationId]},{notification_id:notificationId,all:true},{notification_id:notificationId,all:false},{all:true,extra:1}]){
  assert.equal(contract.parseReadRequest(value),null,JSON.stringify(value))
 }
 assert.deepEqual(contract.parseReadRequest({notification_id:notificationId}),{notification_id:notificationId})
 assert.deepEqual(contract.parseReadRequest({all:true}),{all:true})
})

test('invalid JSON and invalid read bodies do not create a client or invoke any read RPC',async()=>{
 for(const raw of ['', '{', '{"all":', 'null', '[]', '{}', 'true', '"all"', '{"all":false}', '{"all":"true"}', '{"notification_id":"bad"}',JSON.stringify({notification_id:notificationId,all:true}),JSON.stringify({all:true,extra:'ignored?'})]){
  const f=harness(),response=await f.post(undefined,{raw})
  assert.deepEqual(await responseBody(response,400),{error:'invalid_read_request'},raw)
  assert.deepEqual(f.calls,[],raw);assert.equal(f.clients.length,0,raw)
 }
})

test('foreign or missing browser origin and invalid security configuration never reach read RPCs',async()=>{
 for(const [options,request,status]of [
  [{},{origin:'https://foreign.example'},403],
  [{},{origin:null},403],
  [{},{origin:'https://quantum.example.evil.test'},403],
  [{},{origin:'https://foreign.example',authorization:'Bearer fixture-token'},403],
  [{},{authorization:'Basic fixture-token'},401],
  [{configuredOrigin:''},{},503],
 ]){
  for(const body of [{all:true},{notification_id:notificationId}]){
   const f=harness(options)
   assert.deepEqual(await responseBody(await f.post(body,request),status),{error:'request_not_allowed'})
   assert.deepEqual(f.calls,[]);assert.equal(f.clients.length,0)
  }
 }
})

test('missing authentication and authentication failures never mark one or all notifications',async()=>{
 for(const [options,status]of [[{user:null},401],[{authError:{message:'unavailable'}},401],[{authThrows:true},503]]){
  for(const body of [{all:true},{notification_id:notificationId}]){
   const f=harness(options),result=await responseBody(await f.post(body),status)
   assert.equal(typeof result.error,'string');assert.deepEqual(f.calls,[])
  }
 }
})

test('one valid notification calls only mark_notification_read with the exact ID',async()=>{
 const f=harness(),response=await f.post({notification_id:notificationId})
 assert.deepEqual(await responseBody(response,200),{ok:true})
 assert.deepEqual(f.calls,[{name:'mark_notification_read',args:{p_notification_id:notificationId}}])
 assert.equal(f.clients.length,1)
})

test('a false or nonboolean single-read RPC result is not found, never a fallback to read-all',async()=>{
 for(const data of [false,null,undefined,0,1,'true',{},[]]){
  const f=harness({data})
  assert.deepEqual(await responseBody(await f.post({notification_id:notificationId}),404),{error:'notification_not_found'})
  assert.deepEqual(f.calls,[{name:'mark_notification_read',args:{p_notification_id:notificationId}}])
 }
})

test('only explicit all:true invokes mark_all_notifications_read, including zero updates',async()=>{
 for(const data of [0,7]){
  const f=harness({data})
  assert.deepEqual(await responseBody(await f.post({all:true}),200),{ok:true,updated:data})
  assert.deepEqual(f.calls,[{name:'mark_all_notifications_read',args:undefined}])
 }
})

test('a native bearer request may omit Origin but still requires authenticated ownership',async()=>{
 const f=harness()
 assert.deepEqual(await responseBody(await f.post({notification_id:notificationId},{origin:null,authorization:'Bearer fixture-token'}),200),{ok:true})
 assert.deepEqual(f.calls,[{name:'mark_notification_read',args:{p_notification_id:notificationId}}])
 const signedOut=harness({user:null})
 await responseBody(await signedOut.post({all:true},{origin:null,authorization:'Bearer fixture-token'}),401)
 assert.deepEqual(signedOut.calls,[])
})

test('read RPC errors and transport failures return 503, without success or alternate mutations',async()=>{
 for(const options of [{rpcError:{message:'down'},data:0},{rpcThrows:true}]){
  for(const body of [{all:true},{notification_id:notificationId}]){
   const f=harness(options)
   assert.deepEqual(await responseBody(await f.post(body),503),{error:'notification_read_unavailable'})
   assert.equal(f.calls.length,1)
   assert.equal(f.calls[0].name,'all' in body?'mark_all_notifications_read':'mark_notification_read')
  }
 }
})

test('unread count returns a scalar nonnegative safe integer bound to the authenticated owner',async()=>{
 for(const count of [0,1,37,Number.MAX_SAFE_INTEGER]){
  const f=harness({data:count})
  assert.deepEqual(await responseBody(await f.get(),200),{count,owner_id:ownerId})
  assert.deepEqual(f.calls,[{name:'count_unread_notifications',args:undefined}])
 }
})

test('unread count rejects invalid scalar results and RPC outages instead of fabricating zero',async()=>{
 for(const options of [
  ...[undefined,null,false,'0',[],{},-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1].map(data=>({data})),
  {data:0,rpcError:{message:'down'}},{rpcThrows:true},{authThrows:true},
 ]){
  const f=harness(options),body=await responseBody(await f.get(),503)
  assert.deepEqual(body,{error:'notification_count_unavailable'})
  assert.equal(Object.hasOwn(body,'count'),false)
  assert.ok(f.calls.every(call=>call.name==='count_unread_notifications'))
 }
})

test('unread count does not call any RPC when authentication is absent or unavailable',async()=>{
 for(const options of [{user:null},{authError:{message:'auth unavailable'}}]){
  const f=harness(options)
  assert.deepEqual(await responseBody(await f.get(),401),{error:'auth_required'})
  assert.deepEqual(f.calls,[])
 }
})
