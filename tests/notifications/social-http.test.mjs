import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile}from'node:fs/promises'
import ts from'typescript'
const id='10000000-0000-4000-8000-000000000001'
async function harness(options={}){
 const state={configured:true,user:{id},authError:null,rpcError:null,data:{href:null,status:'ended'},...options},calls=[]
 const text=await readFile(new URL('../../lib/notifications/social-server.ts',import.meta.url),'utf8')
 const output=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={}
 const deps={'@/lib/utils':{isSupabaseConfigured:()=>state.configured},'@/lib/supabase-request':{createSupabaseRequestClient:()=>({auth:{getUser:async()=>({data:{user:state.user},error:state.authError})},rpc:async(name,args)=>{calls.push({name,args});return{data:state.data,error:state.rpcError}}})}}
 new Function('exports','require',output)(exports,name=>{assert.ok(name in deps,name);return deps[name]})
 return{state,calls,run:(query='',mode='resolve')=>exports.handleSocialNotificationRead(new Request('https://quantum.example/api/notifications/social?'+query),mode)}
}
test('social notification resolve is owner-authenticated, noncached and validates terminal results',async()=>{
 const f=await harness(),response=await f.run('id='+id)
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store')
 assert.deepEqual(await response.json(),{href:null,status:'ended',owner_id:id})
 assert.deepEqual(f.calls,[{name:'get_activity_meetup_admission_notification',args:{p_notification_id:id}}])
})
test('social malformed and duplicate inputs never reach RPC',async()=>{
 for(const [query,mode]of [['id=bad','resolve'],['id='+id+'&id='+id,'resolve'],['id='+id+'&user_id='+id,'resolve'],['before_id='+id,'page'],['limit=0','page'],['limit=1.5','page'],['before_created_at=invalid&before_id='+id,'page']]){
  const f=await harness();assert.equal((await f.run(query,mode)).status,400,query);assert.equal(f.calls.length,0)
 }
})
test('social outage, signed out and unconfigured states fail closed',async()=>{
 for(const [options,status]of [[{configured:false},503],[{authError:{message:'outage'}},503],[{user:null},401],[{rpcError:{message:'notification_not_found'}},404]]){
  const f=await harness(options);assert.equal((await f.run('id='+id)).status,status)
  if(!options.rpcError)assert.equal(f.calls.length,0)
 }
})
test('social RPC malformed responses and external destinations are never passed to the browser',async()=>{
 for(const data of [{},{href:'https://evil.example',status:'current'},{href:'//evil.example',status:'current'},{href:'/meetups/../admin',status:'current'},{href:null,status:'current'},{href:'/meetups/'+id,status:'ended'}]){
  const f=await harness({data});assert.equal((await f.run('id='+id)).status,503)
 }
})
test('social history returns only well-formed own cursor pages',async()=>{
 const page={notifications:[],has_more:false,next_cursor:null},f=await harness({data:page})
 const response=await f.run('limit=20','page');assert.equal(response.status,200);assert.deepEqual(await response.json(),{...page,owner_id:id})
 assert.deepEqual(f.calls[0],{name:'get_my_notifications_page',args:{p_limit:20,p_before_created_at:null,p_before_id:null}})
 for(const data of [{notifications:[],has_more:true,next_cursor:null},{notifications:[{id}],has_more:false,next_cursor:null}]){
  f.state.data=data;assert.equal((await f.run('','page')).status,503)
 }
})
test('chat notices use the current owner-bound chat resolver, not payload.href',async()=>{
 const f=await harness({data:{status:'current',href:'/chat/rooms/meetup/'+id}})
 const response=await f.run('id='+id,'chat')
 assert.equal(response.status,200)
 assert.equal((await response.json()).href,'/chat/rooms/meetup/'+id)
 assert.deepEqual(f.calls,[{name:'resolve_my_social_chat_notification',args:{p_notification_id:id}}])
})
