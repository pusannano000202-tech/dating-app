import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
async function load(path,deps={}){const exports={},code=ts.transpileModule(await readFile(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,n=>{assert.ok(Object.hasOwn(deps,n),n);return deps[n]});return exports}
const base=await load('lib/meetups/admission-contract.ts'),server=await load('lib/meetups/admission-server.ts',{'./admission-contract':base})
const lifecycle=await load('lib/meetups/admission-lifecycle.ts',{'./admission-contract':base,'./admission-server':server})
const native=await load('lib/meetups/native-admission-contract.ts',{'./admission-contract':base,'./admission-lifecycle':lifecycle})
const checkout=await load('lib/meetups/admission-checkout-contract.ts',{'./admission-contract':base})
const providerServer=await load('lib/meetups/admission-checkout-server.ts',{'./admission-server':server,'./admission-lifecycle':lifecycle,'./native-admission-contract':native,'./admission-checkout-contract':checkout})
const nativeServer=await load('lib/meetups/native-admission-server.ts',{'./admission-server':server,'./admission-lifecycle':lifecycle,'./native-admission-contract':native})
const bodyReader=await load('lib/meetups/native-admission-http.ts',{'./admission-http':{},'./admission-server':server,'./native-admission-contract':native})
const owner='11111111-1111-4111-8111-111111111111',room={kind:'custom_meetup',id:'22222222-2222-4222-8222-222222222222'},intent='33333333-3333-4333-8333-333333333333'
const input={intro:'함께할래요',strength:'',paymentMethod:'new',consent:true,policyVersion:'approved-10000',quoteId:room.id,idempotencyKey:owner}
const prepared={applicationId:null,intentId:intent,admission:'draft',payment:'unpaid',preparation:'prepared',checkoutEnabled:false,reused:false}
const order={orderId:'meetup_'+intent.replace(/-/g,''),intentId:intent,ownerId:owner,room,amountKrw:10000,currency:'KRW',policyVersion:'approved-10000',providerMode:'test',metadata:{},expiresAt:'2099-01-01T00:00:00Z',state:'prepared',paymentKey:null}
const app={id:'44444444-4444-4444-8444-444444444444',admission:'pending',payment:'held',amountKrw:10000,revision:0,chatHref:null}
const payment={orderId:order.orderId,paymentKey:'fixture-payment',totalAmount:10000,balanceAmount:10000,currency:'KRW',status:'IN_PROGRESS',approvedAt:'2026-09-13T12:00:00Z'}
async function harness(options={}){
 const state={enabled:true,loggedIn:true,...options},calls=[]
 const client={rpc:async(name,args)=>{calls.push([name,args]);return{data:name==='get_my_pending_meetup_admission_checkout'?{accountKey:owner,order:{orderId:order.orderId,state:'prepared'}}:prepared,error:null}}}
 const service={rpc:async(name,args)=>{calls.push([name,args]);return {data:name.startsWith('record_')?(args.p_state==='confirmed'?app:{...order,state:args.p_state,paymentKey:args.p_payment_key}):order,error:null}}}
 const guards={requireRequestAccess:async r=>{if(!state.loggedIn)throw{status:401};if(r.method!=='GET'&&r.headers.get('origin')!=='https://quantum.example')throw{status:403};return{userId:owner}},requestGuardErrorResponse:e=>Response.json({error:'guarded'},{status:e.status??503})}
 const common={'@/lib/auth/server-guards':guards,'@/lib/meetups/native-admission-http':bodyReader,'@/lib/meetups/admission-checkout-contract':checkout,'@/lib/meetups/admission-checkout-server':{...providerServer,meetupCheckoutConfig:()=>({ready:state.enabled,clientKey:'test_ck_fixture',mode:'test'})},'@/lib/meetups/admission-server':server,'@/lib/meetups/native-admission-server':nativeServer,'@/lib/payments/deposit-server':{createPaymentServiceClient:()=>service},'@/lib/meetups/http':{meetupJson:(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}})},'@/lib/supabase-request':{createSupabaseRequestClient:()=>client},'@/lib/utils':{getPublicAppOrigin:()=> 'https://quantum.example'},'@/lib/payments/toss':{getTossPaymentByOrderId:async id=>{calls.push(['provider-lookup',id]);return payment},confirmTossPayment:async params=>{calls.push(['provider-confirm',params]);return{...payment,status:'DONE'}}}}
 return {calls,route:await load('app/api/meetups/admission/checkout/route.ts',common),confirm:await load('app/api/meetups/admission/checkout/confirm/route.ts',common)}
}
const request=(body,headers={})=>new Request('https://quantum.example/api/meetups/admission/checkout',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://quantum.example','X-Quantum-Owner':owner,...headers},body:JSON.stringify(body)})
test('HTTP creates an owner-bound canonical 10000 order then verified callback records pending admission',async()=>{
 const f=await harness(),response=await f.route.POST(request({room,input})),body=await response.json()
 assert.equal(response.status,200);assert.equal(body.checkout.amount,10000);assert.equal(body.checkout.orderId,order.orderId);assert.match(body.checkout.successUrl,/checkout=success/)
 assert.ok(!JSON.stringify(body).includes('secretKey'));assert.ok(!JSON.stringify(body).includes('함께할래요'))
 const confirmed=await f.confirm.POST(request({room,orderId:order.orderId,paymentKey:payment.paymentKey,amount:10000}))
 assert.equal(confirmed.status,200);assert.deepEqual(await confirmed.json(),{accountKey:owner,application:app})
 const lookup=f.calls.findIndex(c=>c[0]==='provider-lookup'),charge=f.calls.findIndex(c=>c[0]==='provider-confirm')
 assert.ok(lookup<charge);assert.equal(f.calls[charge][1].amount,10000)
})
test('HTTP default-disabled, missing login, different account/origin never reaches provider or receipt writes',async()=>{
 for(const [options,headers,code]of [[{enabled:false},{},503],[{loggedIn:false},{},401],[{}, {'X-Quantum-Owner':room.id},409],[{}, {Origin:'https://evil.example'},403]]){
  const f=await harness(options);assert.equal((await f.route.POST(request({room,input},headers))).status,code);assert.equal(f.calls.length,0)
  assert.equal((await f.confirm.POST(request({room,orderId:order.orderId,paymentKey:payment.paymentKey,amount:10000},headers))).status,code);assert.equal(f.calls.length,0)
 }
})
test('HTTP rejects browser paid flags, amount injection and mixed new/resume commands',async()=>{
 for(const body of[{room,input:{...input,amountKrw:1}},{room,input,paid:true},{room,input,resumeOrderId:order.orderId}]){const f=await harness();assert.equal((await f.route.POST(request(body))).status,400);assert.equal(f.calls.length,0)}
 const f=await harness();assert.equal((await f.confirm.POST(request({room,orderId:order.orderId,paymentKey:payment.paymentKey,amount:10000,paid:true}))).status,400);assert.equal(f.calls.length,0)
})
test('HTTP recovers and resumes a previously prepared order without replacing the private introduction',async()=>{
 const f=await harness(),read=await f.route.GET(new Request(`https://quantum.example/api/meetups/admission/checkout?kind=custom_meetup&room=${room.id}`))
 assert.equal((await read.json()).pendingOrder.orderId,order.orderId)
 const response=await f.route.POST(request({room,resumeOrderId:order.orderId}));assert.equal(response.status,200)
 assert.ok(f.calls.some(c=>c[0]==='get_meetup_admission_checkout_for_service'))
 assert.ok(!f.calls.some(c=>c[0]==='prepare_activity_meetup_admission'))
})
