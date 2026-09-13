import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
async function load(path,deps={}){
 const output=ts.transpileModule(await readFile(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};new Function('exports','require',output)(exports,name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]});return exports
}
const input=await load('lib/server/tonight/api-contract.ts')
const origin=await load('lib/auth/trusted-origin.ts',{'./api-request-auth':await load('lib/auth/api-request-auth.ts'),'./strict-app-origin':await load('lib/auth/strict-app-origin.ts')})
const http=await load('lib/meetups/http.ts',{'../server/tonight/api-contract':input,'../auth/trusted-origin':origin})
const social=await load('lib/chat/social-rooms-contract.ts')
const team=await load('lib/chat/league-team-contract.ts',{'./social-rooms-contract':social})
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002'
const base='https://quantum.example/api/chat/'
const message={id,body:'우리 팀 일정',alias:'별친구',is_me:true,created_at:'2026-09-10T12:00:00Z'}
const room={kind:'league_team',id,title:'우리 팀',affiliation:'기계공학과',member_count:1,writable:true,updated_at:message.created_at}
const chat={team_id:id,challenge_id:other,title:'우리 팀',department:'기계공학과',sport:'lol',member_count:1,writable:true,messages:[message],has_more:false,next_cursor:null}
const list={owner_id:id,rooms:[room],has_more:false,next_cursor:null}
async function harness(options={}){
 const calls=[],state={enabled:true,configured:true,user:{id},authError:null,data:list,rpcError:null,...options}
 const server=await load('lib/chat/social-server.ts',{
  '@/lib/supabase-request':{createSupabaseRequestClient:()=>{calls.push('client');return {auth:{getUser:async()=>({data:{user:state.user},error:state.authError})},rpc:async(name,args)=>{calls.push([name,args]);return {data:state.data,error:state.rpcError}}}}},
  '@/lib/utils':{isSupabaseConfigured:()=>state.configured},'@/lib/community-feature':{isCommunityFeatureEnabled:()=>state.enabled},
  '@/lib/meetups/http':http,'./social-rooms-contract':social,'./league-team-contract':team,
  '@/lib/meetups/activity-room-contract':{getActivityRoomDefinition:key=>key==='campus-walk'?{title:'캠퍼스 산책'}:null},
 })
 const common={'@/lib/chat/social-rooms-contract':social,'@/lib/chat/social-server':server,'@/lib/meetups/http':http}
 const rooms=await load('app/api/chat/social-rooms/route.ts',common)
 const league=await load('app/api/chat/league-team/route.ts',{...common,'@/lib/chat/league-team-contract':team,'@/lib/server/tonight/api-contract':input,'@/lib/auth/trusted-origin':{assertTrustedMutationOrigin:r=>origin.assertTrustedMutationOrigin(r,'https://quantum.example')}})
 return {rooms,league,calls,state}
}
const post=(body,requestOrigin='https://quantum.example')=>new Request(base+'league-team',{method:'POST',headers:{'Content-Type':'application/json',...(requestOrigin?{Origin:requestOrigin}:{})},body:typeof body==='string'?body:JSON.stringify(body)})
test('list and exact metadata are owner checked, private, membership-scoped and use a stable cursor',async()=>{
 const {rooms,calls}=await harness();const res=await rooms.GET(new Request(base+'social-rooms?kind=league_team&id='+id))
 assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.deepEqual(await res.json(),list)
 assert.deepEqual(calls.at(-1),['social_chat_rooms',{p_args:{kind:'league_team',id,cursor:null}}])
})
test('invalid or forged GET authority never reaches transport, including matching kinds',async()=>{
 for(const query of ['kind=match&id='+id,'kind=occurrence&id='+id,'kind=meetup','cursor=oops','owner_id='+id,'kind=meetup&id='+id+'&cursor=meetup:'+id,'cursor=meetup:'+id+'&cursor=meetup:'+id]){
  const {rooms,calls}=await harness();assert.equal((await rooms.GET(new Request(base+'social-rooms?'+query))).status,400,query);assert.deepEqual(calls,[])
 }
 for(const query of ['team_id=bad','team_id='+id+'&owner_id='+other,'team_id='+id+'&before=bad']){
  const {league,calls}=await harness();assert.equal((await league.GET(new Request(base+'league-team?'+query))).status,400);assert.deepEqual(calls,[])
 }
})
test('trusted-origin and strict body checks happen before auth or RPC',async()=>{
 const valid={team_id:id,body:'일정 확인',idempotency_key:other}
 for(const o of [null,'https://foreign.example']){const h=await harness();assert.equal((await h.league.POST(post(valid,o))).status,403);assert.deepEqual(h.calls,[])}
 for(const body of ['{',[],{...valid,user_id:id},{...valid,body:' '},{...valid,body:'a'.repeat(1001)},{...valid,body:'bad\u0000'}, {...valid,idempotency_key:'bad'}]){
  const h=await harness();assert.equal((await h.league.POST(post(body))).status,400);assert.deepEqual(h.calls,[])
 }
})
test('team handlers validate both RPC response owner and exact room before returning any chat',async()=>{
 const h=await harness({data:{owner_id:id,chat}})
 assert.equal((await h.league.GET(new Request(base+'league-team?team_id='+id))).status,200)
 for(const data of [{owner_id:other,chat},{owner_id:id,chat:{...chat,team_id:other}},{owner_id:id,chat:{...chat,messages:[message,{...message}]}}]){
  h.state.data=data;const res=await h.league.GET(new Request(base+'league-team?team_id='+id));assert.equal(res.status,503);assert.equal(JSON.stringify(await res.json()).includes('우리 팀 일정'),false)
 }
 h.state.data={owner_id:id,message};const res=await h.league.POST(post({team_id:id,body:'  일정 확인  ',idempotency_key:other}));assert.equal(res.status,200)
 assert.deepEqual(h.calls.at(-1),['league_team_chat',{p_action:'send',p_args:{team_id:id,body:'일정 확인',idempotency_key:other}}])
})
test('auth absence, outages, disabled feature and malformed response fail closed',async()=>{
 for(const [options,status]of [[{user:null},401],[{authError:{status:401}},401],[{authError:{status:500}},503],[{enabled:false},503],[{configured:false},503],[{data:{...list,owner_id:other}},503],[{data:{...list,has_more:true}},503]]){
  const h=await harness(options);const res=await h.rooms.GET(new Request(base+'social-rooms'));assert.equal(res.status,status)
  if(options.data===undefined)assert.ok(!h.calls.some(Array.isArray))
 }
})
test('membership and rate failures remain actionable instead of looking like empty success',async()=>{
 for(const [message,status]of [['team_chat_membership_required',403],['team_chat_closed',409],['idempotency_key_reused',409],['rate_limited',429],['account_deletion_pending',403],['function does not exist',503]]){
  const h=await harness({rpcError:{message},data:null});const res=await h.league.POST(post({team_id:id,body:'대화',idempotency_key:other}));assert.equal(res.status,status,message);assert.ok((await res.json()).error)
 }
})
test('activity labels are canonical and the validated catalog key remains for the approved room photo',async()=>{
 const h=await harness({data:{...list,rooms:[{...room,kind:'activity_room',activity_key:'campus-walk',room_number:2}]}})
 const response=await h.rooms.GET(new Request(base+'social-rooms'));const result=await response.json()
 assert.equal(result.rooms[0].title,'캠퍼스 산책 · 2번 방');assert.equal(result.rooms[0].affiliation,'캠퍼스 산책');assert.equal(result.rooms[0].activity_key,'campus-walk');assert.equal('room_number'in result.rooms[0],false)
 // This is a bounded catalog key, not an arbitrary URL or private room field.
 for(const activity_key of ['https://other.example/photo','../private','x'.repeat(121)]){
  h.state.data={...list,rooms:[{...room,kind:'activity_room',activity_key,room_number:2}]}
  const denied=await h.rooms.GET(new Request(base+'social-rooms'))
  assert.equal(denied.status,503);assert.equal('rooms'in await denied.json(),false)
 }
})
test('league navigation metadata preserves exact sport and challenge while accepting older payloads',async()=>{
 assert.ok(social.parseSocialRoomsResponse(list,id))
 for(const kind of ['league_team','league_match']){
  const challenge_id=kind==='league_team'?other:id
  const data={...list,rooms:[{...room,kind,sport:'futsal',challenge_id}]}
  const h=await harness({data});const res=await h.rooms.GET(new Request(base+'social-rooms'))
  assert.equal(res.status,200);assert.deepEqual(await res.json(),data)
 }
 for(const extra of [{sport:'soccer'},{challenge_id:'wrong'},{kind:'meetup',sport:'lol'},{kind:'league_match',challenge_id:other}]){
  assert.equal(social.parseSocialRoomsResponse({...list,rooms:[{...room,...extra}]},id),null)
 }
})
