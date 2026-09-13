import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const owner='11111111-1111-4111-8111-111111111111',room={kind:'study',id:'22222222-2222-4222-8222-222222222222'},orderId='meetup_33333333333343338333333333333333'
const input={intro:'조용히 같이 공부해요',strength:'',paymentMethod:'new',consent:true,quoteId:room.id,policyVersion:'approved-10000',idempotencyKey:owner}
async function load(path,deps={},globals={}){const code=ts.transpileModule(await readFile(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={};new Function('exports','require',...Object.keys(globals),code)(exports,n=>{assert.ok(Object.hasOwn(deps,n),n);return deps[n]},...Object.values(globals));return exports}
const base=await load('lib/meetups/admission-contract.ts'),contract=await load('lib/meetups/admission-checkout-contract.ts',{'./admission-contract':base}),view=await load('lib/meetups/application-view.ts')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
async function harness({pending=null,enabled=true,application=null,recovery=null}={}){
 const slots=[],effects=[],requests=[],windows=[],storage=new Map();let cursor=0
 const hooks={useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next}]},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()}})}},useMemo(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:fn()};return slots[i].value},useCallback(fn,deps){return this.useMemo(()=>fn,deps)}}
 const fakeFetch=async(url,options={})=>{requests.push([url,options.body?JSON.parse(options.body):null,options.headers]);if(url.endsWith('/checkout/confirm')&&recovery)return Response.json(recovery.body,{status:recovery.status});if(options.method==='POST')return Response.json({accountKey:owner,room,orderId,state:'prepared',checkout:{provider:'toss',clientKey:'test_ck_fixture',method:'CARD',amount:10000,orderId,orderName:'Quantum 참가 보증금',successUrl:'https://quantum.example/meetups/payment-return?checkout=success',failUrl:'https://quantum.example/meetups/payment-return?checkout=failed',customerKey:owner}});if(url.includes('/application/status'))return Response.json({accountKey:owner,application});return Response.json({accountKey:owner,checkoutEnabled:enabled,pendingOrder:pending})}
 // React calls imported hooks without a receiver.
 hooks.useCallback=(fn,deps)=>hooks.useMemo(()=>fn,deps)
 const module=await load('components/meetups/useAdmissionCheckout.ts',{'react':hooks,'@/lib/payments/toss-browser':{requestTossPaymentWindow:async value=>{windows.push(value)}},'@/lib/meetups/admission-checkout-contract':contract,'@/lib/meetups/application-view':view},{fetch:fakeFetch,sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{origin:'https://quantum.example'}})
 return {requests,windows,storage,render(actor=owner){cursor=0;const result=module.useAdmissionCheckout(room,actor,{});effects.splice(0).forEach(fn=>fn());return result},dispose(){slots.forEach(s=>s?.cleanup?.())}}
}
test('real orchestration hook reaches canonical checkout SDK and never reports preparation as submitted',async()=>{
 const f=await harness();try{f.render();await tick();const hook=f.render();assert.equal(typeof hook.submit,'function');const result=await hook.submit(input,{signal:new AbortController().signal})
  assert.deepEqual(result,{applicationId:null,admission:'draft',payment:'pending'});assert.equal(f.windows.length,1);assert.equal(f.windows[0].amount,10000)
  const body=f.requests.find(x=>x[1])[1];assert.equal(body.input.intro,input.intro);assert.deepEqual(body.input.metadata,{})
  assert.ok(!JSON.stringify([...f.storage]).includes(input.intro));assert.ok([...f.storage.values()].includes(orderId))
 }finally{f.dispose()}
})
test('disabled provider and changed accounts expose no payable callback',async()=>{
 const f=await harness({enabled:false});try{f.render();await tick();assert.equal(f.render().submit,undefined);assert.equal(f.render(room.id).submit,undefined);assert.equal(f.windows.length,0)}finally{f.dispose()}
})
test('a recovered pending order blocks new application and explicitly resumes the original saved order',async()=>{
 const f=await harness({pending:{orderId,state:'prepared'}});try{f.render();await tick();const hook=f.render();assert.equal(hook.submit,undefined);assert.equal(hook.application.payment,'reconciliation_required');assert.equal(typeof hook.resume,'function')
  await hook.resume({signal:new AbortController().signal});assert.deepEqual(f.requests.find(x=>x[1])[1],{room,resumeOrderId:orderId});assert.equal(f.windows.length,1)
 }finally{f.dispose()}
})
test('a prior cancelled application cannot clear a newer unresolved checkout or reenable submission',async()=>{
 const old={id:'44444444-4444-4444-8444-444444444444',admission:'cancelled',payment:'refund_due',amountKrw:17000,revision:1,chatHref:null}
 const f=await harness({pending:{orderId,state:'confirming'},application:old,recovery:{status:503,body:{error:'checkout_reconciliation_required'}}})
 try{f.render();await tick();const hook=f.render();assert.equal(hook.application.payment,'reconciliation_required')
  await assert.rejects(hook.refresh({signal:new AbortController().signal}),/checkout_reconciliation_required/)
  const confirmation=f.requests.filter(x=>x[0].endsWith('/checkout/confirm'));assert.equal(confirmation.length,1);assert.deepEqual(confirmation[0][1],{room,orderId,paymentKey:null,amount:null})
  assert.ok([...f.storage.values()].includes(orderId));assert.equal(f.render().submit,undefined)
 }finally{f.dispose()}
})
test('recovery returns only the newer order result and clears pending after that order is verified',async()=>{
 const old={id:'44444444-4444-4444-8444-444444444444',admission:'cancelled',payment:'refund_due',amountKrw:17000,revision:1,chatHref:null},current={...old,id:'55555555-5555-4555-8555-555555555555',admission:'pending',payment:'held',amountKrw:10000,revision:0}
 const f=await harness({pending:{orderId,state:'confirming'},application:old,recovery:{status:200,body:{accountKey:owner,application:current}}})
 try{f.render();await tick();const result=await f.render().refresh({signal:new AbortController().signal});assert.equal(result.applicationId,current.id);assert.equal(result.payment,'held');assert.equal(f.storage.size,0);assert.equal(f.render().application,undefined)}finally{f.dispose()}
})
