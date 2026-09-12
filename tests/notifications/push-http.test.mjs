import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const source=new URL('../../lib/notifications/web-push-http.ts',import.meta.url)
const code=ts.transpileModule((await readFile(source,'utf8')).replace("'./web-push-contract'",JSON.stringify(new URL('../../lib/notifications/web-push-contract.ts',import.meta.url).href)),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {readPushBody,pushBodyArgs}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
test('subscription HTTP bodies reject invalid JSON, oversized/chunked content and untrusted additional fields',async()=>{
 const request=(body,contentType='application/json')=>new Request('https://quantum.example/api/notifications/push/subscriptions',{method:'POST',headers:{'Content-Type':contentType},body})
 assert.deepEqual(await readPushBody(request('{"endpoint":"https://fcm.googleapis.com/token"}')),{endpoint:'https://fcm.googleapis.com/token'})
 for(const value of ['{bad','"'+'x'.repeat(5000)+'"'])assert.equal(await readPushBody(request(value)),null)
 assert.equal(await readPushBody(request('{}','text/plain')),null)
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('"'+'a'.repeat(5000)));c.close()}})
 assert.equal(await readPushBody(new Request('https://quantum.example/',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'})),null)
 assert.equal(pushBodyArgs({endpoint:'https://fcm.googleapis.com/token',userId:'other'},'delete'),null)
 assert.equal(pushBodyArgs({endpoint:'https://127.0.0.1/token'},'status'),null)
})
test('routes enforce live authentication, exact mutation origin, account-race fencing and no-secret config',async()=>{
 const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8')
 const api=await read('app/api/notifications/push/subscriptions/route.ts'),status=await read('app/api/notifications/push/subscriptions/status/route.ts'),config=await read('app/api/notifications/push/config/route.ts'),dispatch=await read('app/api/internal/notifications/push/dispatch/route.ts')
 for(const route of[api,status]){assert.ok(route.includes('requireRequestAccess(request)'));assert.ok(route.includes("headers.get('x-quantum-owner')!==userId"));assert.ok(!route.includes('checkMutationOrigin:false'))}
 assert.ok(config.includes('config.publicKey:null'));assert.ok(!config.includes('config.privateKey'));assert.ok(dispatch.includes('isAuthorizedInternalRequest'))
 assert.ok(dispatch.indexOf('isAuthorizedInternalRequest')<dispatch.indexOf('createPaymentServiceClient()'));assert.ok(dispatch.includes('phoneDeliveryVerified:false'))
})
