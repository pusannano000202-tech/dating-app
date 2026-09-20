import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import ts from 'typescript'
import {calendarFixture,source} from './event-calendar-fixture.mjs'
import {installCalendarErasurePolicy} from './calendar-erasure-fixture.mjs'
import {installActualCalendarRelationshipReads,postgrestCalendarRpc,volatilityMigration} from './calendar-rpc-transport-fixture.mjs'
async function load(path,deps={}){
 const exports={}
 const compiled=ts.transpileModule(await source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('exports','require','fetch',compiled)(exports,name=>{
  assert.ok(Object.hasOwn(deps,name),`Unexpected dependency ${name}`);return deps[name]
 },()=>assert.fail('External network is outside this fixture'))
 return exports
}
async function httpFixture(){
 const f=await calendarFixture(),identities=new WeakMap(),calls=[]
 await installCalendarErasurePolicy(f)
 await installActualCalendarRelationshipReads(f)
 await f.db.exec(await source(volatilityMigration))
 class RequestGuardError extends Error{constructor(status){super();this.status=status}}
 const guard={RequestGuardError,requestGuardErrorResponse:e=>Response.json({error:'request_not_allowed'},{status:e.status}),
  requireRequestAccess:async(request,options)=>{
   assert.deepEqual(options.allowedRoles,['user'])
   if(!identities.get(request))throw new RequestGuardError(401)
   if(request.method!=='GET'&&request.headers.get('origin')!=='https://quantum.test')throw new RequestGuardError(403)
  }}
 const transport={createSupabaseRequestClient:request=>({auth:{getUser:async()=>({data:{user:identities.get(request)?{id:identities.get(request)}:null},error:null})},rpc:async(name,args)=>{
  calls.push(name)
  try{return {data:await postgrestCalendarRpc(f,identities.get(request),name,args),error:null}}
  catch(error){return {data:null,error:{message:error.message}}}
 }})}
 const contract=await load('lib/matching/event-calendar.ts')
 const input=await load('lib/server/tonight/api-contract.ts')
 const deps={'@/lib/auth/server-guards':guard,'@/lib/supabase-request':transport,'@/lib/server/tonight/api-contract':input,'./event-calendar':contract,'@/lib/matching/event-calendar':contract,
  '@/lib/payments/calendar-provider':{calendarPaymentConfig:()=>({ready:false})},'@/lib/supabase-admin':{getSupabaseAdminKeyStatus:()=>({ok:false})},'@/lib/utils':{getPublicAppOrigin:()=>null}}
 const http=await load('lib/matching/event-calendar-http.ts',deps)
 deps['@/lib/matching/event-calendar-http']=http
 const routes={list:await load('app/api/match/calendar/route.ts',deps),apply:await load('app/api/match/calendar/[eventId]/apply/route.ts',deps),
  application:await load('app/api/match/calendar/[eventId]/application/route.ts',deps),accept:await load('app/api/match/couple-parties/accept/route.ts',deps)}
 const request=(actor,path,{method='GET',body,origin='https://quantum.test',expectedOwner}={})=>{
  const r=new Request('https://quantum.test'+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(expectedOwner?{'X-Quantum-Owner':expectedOwner}:{})},...(body?{body:JSON.stringify(body)}:{})})
  identities.set(r,actor);return r
 }
 const context={params:Promise.resolve({eventId:f.ids.event})}
 return {...f,contract,calls,routes,request,context}
}
test('HTTP handlers and real new SQL connect date selection, invitation, acceptance, own status and cancellation',async()=>{
 const f=await httpFixture();try{
  let response=await f.routes.list.GET(f.request(f.ids.leader,`/api/match/calendar?month=${f.month.slice(0,7)}&audience=couple`))
  assert.equal(response.status,200);assert.equal((await response.json()).events[0].depositAmountKrw,10000)
  response=await f.routes.apply.POST(f.request(f.ids.leader,'/apply',{method:'POST',body:{audience:'couple',partnerUserId:f.ids.partner,idempotencyKey:randomUUID(),participationConsent:true}}),f.context)
  assert.equal(response.status,201)
  const {application:p}=await response.json();assert.equal(p.status,'pending_partner');assert.equal(p.applicationFinalized,false)
  response=await f.routes.application.GET(f.request(f.ids.partner,'/application?audience=couple'),f.context)
  assert.equal((await response.json()).application.myConsent,false)
  response=await f.routes.accept.POST(f.request(f.ids.partner,'/accept',{method:'POST',body:{party_id:p.entryId,partner_consent:true}}))
  assert.equal(response.status,200);assert.equal((await response.json()).party.status,'payment_pending')
  response=await f.routes.application.GET(f.request(f.ids.outsider,'/application?audience=couple'),f.context)
  assert.deepEqual(await response.json(),{application:null})
  response=await f.routes.application.DELETE(f.request(f.ids.leader,'/application',{method:'DELETE',body:{audience:'couple',entryId:p.entryId}}),f.context)
  assert.equal(response.status,200);assert.equal((await response.json()).cancelled,true)
 }finally{await f.db.close()}
})
test('HTTP refuses anonymous/cross-origin/amount injection/no consent before application writes',async()=>{
 const f=await httpFixture();try{
  const body={audience:'couple',partnerUserId:f.ids.partner,idempotencyKey:randomUUID(),participationConsent:true}
  for(const [actor,origin,input,status]of [[null,'https://quantum.test',body,401],[f.ids.leader,'https://evil.test',body,403],[f.ids.leader,'https://quantum.test',{...body,paid:true},400],[f.ids.leader,'https://quantum.test',{...body,participationConsent:false},400]]){
   const r=await f.routes.apply.POST(f.request(actor,'/apply',{method:'POST',body:input,origin}),f.context);assert.equal(r.status,status)
  }
  assert.equal(f.calls.length,0)
 }finally{await f.db.close()}
})
test('calendar response parser fails closed on invalid counts and strips identity extras',async()=>{
 const f=await httpFixture();try{
  const payload=await f.rpc(f.ids.leader,'get_my_event_calendar',{p_month:f.month,p_audience:'couple'})
  payload.events[0].user_id=f.ids.partner;payload.secret='not a response field'
  const clean=f.contract.parseEventCalendar(payload,'couple')
  assert.ok(clean);assert.ok(!JSON.stringify(clean).includes(f.ids.partner));assert.ok(!('secret'in clean))
  payload.events[0].applicantCount=-1;assert.equal(f.contract.parseEventCalendar(payload,'couple'),null)
  assert.equal(f.contract.parseEventCalendar({serverNow:payload.serverNow,relationshipStatus:'single'},'single'),null)
  assert.equal(f.contract.parseCalendarQuery('https://quantum.test/api/match/calendar?month=2026-13&audience=couple'),null)
  assert.equal(f.contract.parseCalendarQuery('https://quantum.test/api/match/calendar?month=2026-09&audience=couple&audience=single'),null)
 }finally{await f.db.close()}
})

test('application owner mismatch fails before an RPC; matched owner resumes the selected date',async()=>{
 const f=await httpFixture();try{
  const body={audience:'single',idempotencyKey:randomUUID(),participationConsent:true}
  const context={params:Promise.resolve({eventId:f.ids.window})}
  let response=await f.routes.apply.POST(f.request(f.ids.single,'/apply',{method:'POST',body,expectedOwner:f.ids.leader}),context)
  assert.equal(response.status,409)
  assert.deepEqual(await response.json(),{error:'account_changed'})
  assert.deepEqual(f.calls,[])
  response=await f.routes.apply.POST(f.request(f.ids.single,'/apply',{method:'POST',body,expectedOwner:f.ids.single}),context)
  assert.equal(response.status,201)
  const {application}=await response.json()
  assert.equal(application.eventId,f.ids.window)
  assert.equal(application.audience,'single')
  assert.equal(application.applicationFinalized,false)
 }finally{await f.db.close()}
})
