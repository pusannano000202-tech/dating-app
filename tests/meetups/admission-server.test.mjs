import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier==='./admission-contract'&&context.parentURL?.endsWith('/admission-server.ts')?'./admission-contract.ts':specifier,context)}})
const {getMeetupAdmissionContext,prepareMeetupAdmission,AdmissionServerError}=await import('../../lib/meetups/admission-server.ts')
const id='11111111-1111-4111-8111-111111111111'
const room={kind:'custom_meetup',id}
const quote={id:'22222222-2222-4222-8222-222222222222',room,amountKrw:17000,currency:'KRW',policyVersion:'test-only-v1',expiresAt:'2099-09-12T12:30:00.000Z',paymentMethods:['new']}
const policy={summary:'테스트 전용',conditions:['실제 결제 아님']}
const context={room,quote,policy,checkoutEnabled:false,preparationOnly:true}
const input={intro:'같이 공부해요',strength:'풀이 설명',paymentMethod:'new',consent:true,quoteId:quote.id,policyVersion:quote.policyVersion,idempotencyKey:'33333333-3333-4333-8333-333333333333'}
const prepared={applicationId:null,intentId:'44444444-4444-4444-8444-444444444444',admission:'draft',payment:'unpaid',preparation:'prepared',checkoutEnabled:false,reused:false}
const client=(data,error=null)=>({rpc:async()=>({data,error})})
test('context preserves configured policy and amount, or the honest unavailable pair',async()=>{
 assert.deepEqual(await getMeetupAdmissionContext(client(context),id),context)
 assert.deepEqual(await getMeetupAdmissionContext(client({...context,quote:null,policy:null}),id),{...context,quote:null,policy:null})
})
test('context rejects mismatched room, malformed terms, and any activated checkout',async()=>{
 for(const value of [{...context,room:{...room,id:quote.id}},{...context,policy:null},{...context,quote:null},{...context,policy:{...policy,conditions:[]}},{...context,checkoutEnabled:true},{...context,providerSecret:'never'},{...context,quote:{...quote,paymentMethods:['carryover']}}])
  await assert.rejects(getMeetupAdmissionContext(client(value),id),e=>e.code==='admission_response_invalid'&&e.status===503)
})
test('prepare sends validated input only to authenticated RPC and returns draft unpaid only',async()=>{
 const calls=[]
 const rpc={rpc:async(name,args)=>{calls.push({name,args});return{data:prepared,error:null}}}
 assert.deepEqual(await prepareMeetupAdmission(rpc,id,input),prepared)
 assert.deepEqual(calls,[{name:'prepare_activity_meetup_admission',args:{p_meetup_id:id,p_input:input}}])
 for(const patch of [{admission:'submitted'},{payment:'held'},{applicationId:id},{checkoutEnabled:true},{providerPaymentKey:'unsafe'},{intentId:'invalid'}])
  await assert.rejects(prepareMeetupAdmission(client({...prepared,...patch}),id,input),e=>e.code==='admission_response_invalid')
})
test('invalid input and carryover never call the RPC',async()=>{
 const rpc={rpc:async()=>assert.fail('RPC must not be reached')}
 for(const patch of [{consent:false},{amountKrw:1},{paymentMethod:'carryover'},{intro:'\u200bhidden'}])await assert.rejects(prepareMeetupAdmission(rpc,id,{...input,...patch}),e=>e instanceof AdmissionServerError&&e.status===400)
 await assert.rejects(getMeetupAdmissionContext(rpc,'../other'),e=>e.code==='invalid_room')
})
test('database errors are bounded codes, never leaked internals or fake success',async()=>{
 for(const [error,code,status] of [[{message:'deposit_quote_expired'},'deposit_quote_expired',409],[{message:'not_authenticated'},'not_authenticated',401],[{message:'meetup_not_found'},'meetup_not_found',404],[{message:'secret table private-actor sql'},'admission_unavailable',503],[{code:'PGRST202',message:'secret schema'},'admission_schema_unavailable',503]])
  await assert.rejects(getMeetupAdmissionContext(client(null,error),id),e=>e.code===code&&e.status===status&&!e.message.includes('secret'))
 await assert.rejects(getMeetupAdmissionContext({rpc:async()=>{throw new Error('private transport')}} ,id),e=>e.code==='admission_unavailable')
})
