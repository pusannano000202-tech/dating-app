import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
function load(path,deps={}){
 const source=readFileSync(new URL('../../'+path,import.meta.url),'utf8')
 const exports={};new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]});return exports
}
const id='10000000-0000-4000-8000-000000000001'
const cursor=JSON.stringify([null,'2026-09-11T00:00:00+00:00',id])
function harness({user={id},data=[],error=null}={}){
 const calls=[]
 const route=load('app/api/meetups/route.ts',{
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  '@/lib/community/contracts':{isMeetupCategory:v=>v==='dining',parseCommunityListLimit:v=>Math.max(1,Math.min(Number(v)||30,30))},
  '@/lib/community/department-rooms':{parseMeetupScope:v=>['school','department'].includes(v)?v:null},
  '@/lib/community/meetup-gender':{isMeetupGenderMode:v=>['all','male_only','female_only'].includes(v)},
  '@/lib/meetups/contracts':{},'@/lib/meetups/list-page':load('lib/meetups/list-page.ts'),
  '@/lib/meetups/http':{meetupRpcErrorResponse:()=>Response.json({error:'failed'},{status:400})},
  '@/lib/supabase-request':{createSupabaseRequestClient:()=>({auth:{getUser:async()=>({data:{user}})},rpc:async(name,args)=>{calls.push({name,args});return{data,error}}})},
  '@/lib/auth/trusted-origin':{},'@/lib/utils':{isSupabaseConfigured:()=>true},
 })
 return{calls,get:query=>route.GET({nextUrl:new URL('https://example.test/api/meetups?'+query)})}
}
test('listing keeps array consumers and returns the last visible keyset cursor, not the sentinel',async()=>{
 const first={id,list_cursor:cursor},sentinel={id:'20000000-0000-4000-8000-000000000001',list_cursor:JSON.stringify([null,'2026-09-10T00:00:00Z','20000000-0000-4000-8000-000000000001'])}
 const f=harness({data:[first,sentinel]}),res=await f.get('limit=1&category=dining&scope_type=school&gender_mode=female_only&cursor='+encodeURIComponent(cursor))
 assert.equal(res.status,200)
 assert.deepEqual(await res.json(),{meetups:[{id}],availability:'ready',has_more:true,next_cursor:cursor})
 assert.deepEqual(f.calls,[{name:'list_activity_meetups_v4',args:{p_category:'dining',p_limit:2,p_gender_mode:'female_only',p_scope_type:'school',p_cursor:cursor}}])
})
test('malformed cursor and unauthenticated queries cannot call listing RPC',async()=>{
 for(const value of ['bad','[]',JSON.stringify([null,'Infinity',id]),JSON.stringify([null,'2026-09-11',id]),'x'.repeat(301)]){
  const f=harness();assert.equal((await f.get('cursor='+encodeURIComponent(value))).status,400);assert.deepEqual(f.calls,[])
 }
 const f=harness({user:null});const result=await(await f.get('')).json();assert.equal(result.availability,'auth_required');assert.deepEqual(f.calls,[])
})
test('short final page has no cursor and malformed backend cursors fail closed',async()=>{
 const f=harness({data:[{id,list_cursor:cursor}]});assert.deepEqual(await(await f.get('')).json(),{meetups:[{id}],availability:'ready',has_more:false,next_cursor:null})
 const invalid=harness({data:[{id,list_cursor:'bad'}]});assert.equal((await invalid.get('')).status,503)
})
