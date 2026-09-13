import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'

const valid = { sourceKey:'visit:pnu:pasta:api-test',kind:'visit',category:'pasta',title:'내 파스타 1위',winnerId:'a',candidates:[{id:'a',name:'A'},{id:'b',name:'B'}],selections:[{winnerId:'a',loserId:'b'}],completedAt:null }
const id='11111111-1111-4111-8111-111111111111'

// Execute the actual handlers/security helpers; only the external auth/RPC transport is substituted.
function harness() {
  const calls=[]
  const state={user:{id},authError:null,rpcError:null,data:{...valid,id,savedAt:'2026-09-09T00:00:00Z',note:'',revision:1}}
  const cache=new Map()
  function load(path) {
    const absolute=resolve(path)
    if(cache.has(absolute))return cache.get(absolute).exports
    const module={exports:{}}
    cache.set(absolute,module)
    const source=readFileSync(absolute,'utf8')
    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
    const require=(name)=>{
      if(name==='server-only')return {}
      if(name==='next/server')return {NextResponse:{json:(data,init)=>Response.json(data,init)}}
      if(name==='@/lib/utils')return {getPublicAppOrigin:()=> 'https://quantum.test'}
      if(name==='@/lib/supabase-request')return {createSupabaseRequestClient:()=>({auth:{getUser:async()=>({data:{user:state.user},error:state.authError})},rpc:async(name,args)=>{calls.push({name,args});return {data:state.data,error:state.rpcError}}})}
      if(name.startsWith('@/'))return load(name.slice(2)+'.ts')
      if(name.startsWith('.'))return load(resolve(dirname(absolute),name)+'.ts')
      throw new Error(`Unexpected test dependency: ${name}`)
    }
    new Function('require','module','exports',js)(require,module,module.exports)
    return module.exports
  }
  return {state,calls,collection:load('app/api/content-history/route.ts'),record:load('app/api/content-history/[recordId]/route.ts')}
}
function request(method='GET',body,headers={},suffix='') {
  return new Request(`https://quantum.test/api/content-history${suffix}`,{method,headers:{...(method==='GET'?{}:{'Content-Type':'application/json',Origin:'https://quantum.test','X-Expected-Account':id}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})})
}

test('changed account cookies cannot save another account screen draft or reach any record mutation',async()=>{
  const h=harness(),context={params:Promise.resolve({recordId:id})}
  h.state.user={id:'22222222-2222-4222-8222-222222222222'}
  assert.equal((await h.collection.POST(request('POST',valid))).status,403)
  assert.equal((await h.record.PATCH(request('PATCH',{note:'A 초안'},{'If-Match':'1'}),context)).status,403)
  assert.equal((await h.record.DELETE(request('DELETE',undefined,{'If-Match':'1'}),context)).status,403)
  assert.equal((await h.collection.GET(request('GET',undefined,{'X-Expected-Account':id}))).status,403)
  h.state.user={id}
  assert.equal((await h.collection.POST(request('POST',valid,{'X-Expected-Account':''}))).status,403)
  assert.equal(h.calls.length,0)
})
test('actual history API writes a strict private snapshot without owner injection',async()=>{
  const h=harness()
  const response=await h.collection.POST(request('POST',valid))
  assert.equal(response.status,200)
  assert.equal(response.headers.get('cache-control'),'private, no-store')
  assert.deepEqual(h.calls,[{name:'save_my_content_record',args:{p_snapshot:valid}}])
  assert.equal((await h.collection.POST(request('POST',{...valid,owner_id:'other'}))).status,400)
  assert.equal(h.calls.length,1)
})
test('cross-origin, missing authentication and oversized bodies never reach private writes',async()=>{
  const h=harness()
  assert.equal((await h.collection.POST(request('POST',valid,{Origin:'https://evil.test'}))).status,403)
  h.state.user=null
  assert.equal((await h.collection.POST(request('POST',valid))).status,401)
  h.state.user={id}
  assert.equal((await h.collection.POST(request('POST',{...valid,title:'x'.repeat(200001)}))).status,413)
  assert.equal(h.calls.length,0)
})
test('outage and database details are sanitized, not shown as an empty successful account',async()=>{
  const h=harness()
  h.state.user=null;h.state.authError={status:503,message:'secret-provider-detail'}
  const auth=await h.collection.GET(request())
  assert.equal(auth.status,503);assert.doesNotMatch(await auth.text(),/secret-provider-detail/)
  h.state.user={id};h.state.authError=null;h.state.rpcError={message:'private-table-secret'}
  const db=await h.collection.GET(request())
  assert.equal(db.status,503);assert.doesNotMatch(await db.text(),/private-table-secret/)
})
test('an auth error never authorizes a stale user object',async()=>{
  const h=harness();h.state.authError={status:401,message:'invalid-token'}
  assert.equal((await h.collection.GET(request())).status,401)
  assert.equal(h.calls.length,0)
})
test('record mutation requires exact id and revision and delegates only bounded note fields',async()=>{
  const h=harness(),context={params:Promise.resolve({recordId:id})}
  assert.equal((await h.record.PATCH(request('PATCH',{note:'안녕'}),context)).status,400)
  const response=await h.record.PATCH(request('PATCH',{note:' 내 메모 '},{'If-Match':'1'}),context)
  assert.equal(response.status,200)
  assert.deepEqual(h.calls,[{name:'update_my_content_record_note',args:{p_id:id,p_note:'내 메모',p_revision:1}}])
  h.state.rpcError={message:'revision_conflict'}
  assert.equal((await h.record.DELETE(request('DELETE',undefined,{'If-Match':'1'}),context)).status,409)
  assert.equal((await h.record.GET(request(),{params:Promise.resolve({recordId:'../other'})})).status,400)
})
