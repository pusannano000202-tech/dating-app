import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!specifier.endsWith('.ts')&&context.parentURL?.includes('/lib/meetups/')?specifier+'.ts':specifier,context)}})
const {meetupCheckoutConfig,confirmCheckoutOrder,verifiedAdmissionPayment}=await import('../../lib/meetups/admission-checkout-server.ts')
const {parseCheckoutConfirmation,checkoutRecoveryUrl}=await import('../../lib/meetups/admission-checkout-contract.ts')
const owner='11111111-1111-4111-8111-111111111111',room={kind:'custom_meetup',id:'22222222-2222-4222-8222-222222222222'}
const order={orderId:'meetup_33333333333343338333333333333333',intentId:'33333333-3333-4333-8333-333333333333',ownerId:owner,room,amountKrw:17000,currency:'KRW',policyVersion:'fixture-only',providerMode:'test',metadata:{},expiresAt:'2099-01-01T00:00:00Z',state:'prepared',paymentKey:null}
const paid={orderId:order.orderId,paymentKey:'fixture-payment',totalAmount:17000,balanceAmount:17000,currency:'KRW',status:'DONE',approvedAt:'2026-09-13T10:00:00Z',cancels:[]}
const application={id:'44444444-4444-4444-8444-444444444444',admission:'pending',payment:'held',amountKrw:17000,revision:0,chatHref:null}
const input={room,orderId:order.orderId,paymentKey:paid.paymentKey,amount:17000}
function fixture(patch={}){const calls=[],saved={...order,...patch};return {calls,saved,service:{rpc:async(name,args)=>{calls.push({name,args});if(name.startsWith('get_'))return{data:saved,error:null};if(args.p_state==='confirmed'){saved.state='confirmed';return{data:application,error:null}}saved.state=args.p_state;saved.paymentKey=args.p_payment_key;return{data:saved,error:null}}}}}
test('the new provider path is explicitly off by default, independent from legacy deposit flags',()=>{
 const env={NEXT_PUBLIC_TOSS_CLIENT_KEY:'test_ck_fixture',TOSS_SECRET_KEY:'test_sk_fixture'}
 assert.equal(meetupCheckoutConfig(env).ready,false)
 assert.equal(meetupCheckoutConfig({...env,QUANTUM_MEETUP_CHECKOUT_ENABLED:'true'}).ready,true)
 assert.equal(meetupCheckoutConfig({...env,QUANTUM_MEETUP_CHECKOUT_ENABLED:'true',TOSS_SECRET_KEY:'live_sk_fixture'}).ready,false)
 assert.equal(meetupCheckoutConfig({...env,QUANTUM_MEETUP_CHECKOUT_ENABLED:'true',NODE_ENV:'production'}).ready,false)
 assert.equal(parseCheckoutConfirmation({...input,paid:true}),null)
})
test('refresh recovery retains only the room and opaque order, never payment key/amount/success authority',()=>{
 const url=new URL(checkoutRecoveryUrl(room,order.orderId),'https://quantum.example')
 assert.equal(url.searchParams.get('order'),order.orderId);assert.equal(url.searchParams.get('room'),room.id);assert.equal(url.searchParams.get('checkout'),'recover')
 assert.equal(url.searchParams.has('paymentKey'),false);assert.equal(url.searchParams.has('amount'),false)
})
test('provider environment changes cannot look up or confirm the earlier order',async()=>{
 const f=fixture();await assert.rejects(confirmCheckoutOrder(f.service,{mode:'live',lookup:()=>assert.fail('wrong provider'),confirm:()=>assert.fail('wrong provider')},owner,input),/checkout_provider_changed/)
 assert.ok(f.calls.every(c=>c.name.startsWith('get_')))
})
test('full provider identity and settled money are required before recording admission',()=>{
 assert.equal(verifiedAdmissionPayment(paid,order),true)
 for(const patch of[{currency:'USD'},{totalAmount:1},{balanceAmount:1},{orderId:'other'},{status:'IN_PROGRESS'},{paymentKey:''},{approvedAt:null},{cancels:[{cancelAmount:1}]}])assert.equal(verifiedAdmissionPayment({...paid,...patch},order),false)
})
test('browser callback mismatch cannot even request confirmation or grant membership',async()=>{
 for(const changed of[{...input,amount:1},{...input,paymentKey:'other'}]){const f=fixture();await assert.rejects(confirmCheckoutOrder(f.service,{mode:'test',lookup:async()=>paid,confirm:()=>assert.fail('no charge')},owner,changed),/checkout_evidence_mismatch/);assert.ok(f.calls.every(c=>c.name.startsWith('get_')))}
})
test('a new callback looks up its order first, confirms the canonical amount, then records receipt',async()=>{
 const f=fixture(),events=[]
 const provider={mode:'test',lookup:async id=>{events.push(['lookup',id]);return{...paid,status:'IN_PROGRESS'}},confirm:async params=>{events.push(['confirm',params]);return paid}}
 assert.deepEqual(await confirmCheckoutOrder(f.service,provider,owner,input),application)
 assert.equal(events[0][0],'lookup');assert.equal(events[1][1].amount,17000)
 assert.deepEqual(f.calls.map(c=>c.args.p_state).filter(Boolean),['confirming','confirmed'])
 assert.equal(f.calls.at(-1).args.p_payment_key,paid.paymentKey)
})
test('an uncertain confirm is retried by provider lookup with no second charge',async()=>{
 const f=fixture()
 await assert.rejects(confirmCheckoutOrder(f.service,{mode:'test',lookup:async()=>({...paid,status:'IN_PROGRESS'}),confirm:async()=>{throw new Error('timeout after provider saved')}},owner,input),/checkout_reconciliation_required/)
 assert.equal(f.saved.state,'reconciliation_required')
 assert.deepEqual(await confirmCheckoutOrder(f.service,{mode:'test',lookup:async()=>paid,confirm:()=>assert.fail('already paid')},owner,{...input,paymentKey:null,amount:null}),application)
})
test('failure recovery cannot charge pending, cancelled, expired, wrong-currency or partial-cancel orders',async()=>{
 for(const patch of[{status:'IN_PROGRESS'},{status:'CANCELED'},{currency:'USD'},{status:'PARTIAL_CANCELED',balanceAmount:1000}]){
  const f=fixture();await assert.rejects(confirmCheckoutOrder(f.service,{mode:'test',lookup:async()=>({...paid,...patch}),confirm:()=>assert.fail('no recovery charge')},owner,{...input,paymentKey:null,amount:null}));assert.ok(!f.calls.some(c=>c.args.p_state==='confirmed'))
 }
 const f=fixture({expiresAt:'2020-01-01T00:00:00Z'})
 await assert.rejects(confirmCheckoutOrder(f.service,{mode:'test',lookup:async()=>({...paid,status:'IN_PROGRESS'}),confirm:()=>assert.fail('expired')},owner,input),/deposit_quote_expired/)
 // Already paid late receipts must still reach the lifecycle refund_due handler.
 assert.deepEqual(await confirmCheckoutOrder(f.service,{mode:'test',lookup:async()=>paid,confirm:()=>assert.fail('no repeat')},owner,input),application)
})
