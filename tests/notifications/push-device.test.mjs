import test from 'node:test'
import assert from 'node:assert/strict'
import {createPushDeviceCoordinator,checkedPushUnsubscribe} from '../../lib/notifications/web-push-device.ts'
test('unsubscribe false is an unconfirmed failure, not an off state',async()=>{
 await assert.rejects(checkedPushUnsubscribe({unsubscribe:async()=>false}),/not_confirmed/)
 await checkedPushUnsubscribe({unsubscribe:async()=>true})
})
test('old-account cleanup and new subscription cannot overlap across asynchronous device lookup',async()=>{
 const device=createPushDeviceCoordinator(),order=[];device.rememberOwner('A')
 let finishLookup;const lookup=new Promise(resolve=>{finishLookup=resolve})
 const cleanup=device.removeForOwner('A',async()=>{order.push('lookup-old');await lookup;order.push('remove-old')})
 const subscribe=device.exclusive(async()=>{order.push('subscribe-B');device.rememberOwner('B')})
 await Promise.resolve();assert.deepEqual(order,['lookup-old']);finishLookup();await Promise.all([cleanup,subscribe]);assert.deepEqual(order,['lookup-old','remove-old','subscribe-B'])
 await device.removeForOwner('A',async()=>{throw Error('must not delete B on delayed retry')})
})
test('a failed previous cleanup does not wedge registration, while delayed retries preserve the new account',async()=>{
 const device=createPushDeviceCoordinator();device.rememberOwner('A')
 await assert.rejects(device.removeForOwner('A',async()=>{throw Error('device failed')}))
 await device.exclusive(async()=>{device.rememberOwner('B')})
 let removed=false;await device.removeForOwner('A',async()=>{removed=true});assert.equal(removed,false)
 await device.removeForOwner('B',async()=>{removed=true});assert.equal(removed,true)
})
