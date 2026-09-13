import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=readFileSync('lib/meetups/activity-room-api.ts','utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
function harness(){let calls=0;const exports={};const deps={
 '@/lib/supabase-request':{createSupabaseRequestClient:()=>({auth:{getUser:async()=>({data:{user:{id:'owner-A'}},error:null})},rpc:async()=>{calls++;return {data:{items:[],has_more:false},error:null}}})},
 '@/lib/auth/trusted-origin':{assertTrustedMutationOrigin:()=>{},TrustedOriginError:Error},'@/lib/utils':{isSupabaseConfigured:()=>true},'@/lib/community-feature':{isCommunityFeatureEnabled:()=>true},'./http':{meetupJson:(data,status=200)=>({data,status})},
 };new Function('exports','require',compiled)(exports,name=>{assert.ok(name in deps,name);return deps[name]});return {...exports,calls:()=>calls}}
test('home enrichment rejects a stale account header before reading rooms',async()=>{const h=harness();const r=await h.activityRoomRpc(new Request('http://localhost/api/meetups/mine',{headers:{'X-Expected-Account':'owner-B'}}),'get_my_home_meetups',{});assert.equal(r.status,401);assert.equal(h.calls(),0)})
test('current-account and old clients both retain the existing read contract',async()=>{for(const headers of [{},{'X-Expected-Account':'owner-A'}]){const h=harness();const r=await h.activityRoomRpc(new Request('http://localhost/api/meetups/mine',{headers}),'get_my_home_meetups',{});assert.equal(r.status,200);assert.equal(h.calls(),1)}})
