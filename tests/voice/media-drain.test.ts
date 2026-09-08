import test from 'node:test'
import assert from 'node:assert/strict'
import { drainVoiceEffects } from '../../lib/voice/media-drain'
test('bounded media cleanup drains several batches and records provider failures for retry', async () => {
  let claims = 0, active = 0, maximum = 0
  const outcomes: boolean[] = []
  const result = await drainVoiceEffects({
    claim: async () => ++claims < 3 ? Array.from({length:25},(_,i)=>i) : [],
    execute: async value => { active++;maximum=Math.max(maximum,active);await Promise.resolve();active--;if(value===4)throw new Error('offline') },
    finish: async (_value,success) => {outcomes.push(success);return true},
  })
  assert.equal(result.processed,50);assert.equal(result.failed,2);assert.ok(maximum<=5);assert.equal(outcomes.length,50)
})
test('acknowledgement failure never reports a successfully completed media cleanup', async () => {
  let calls = 0
  const result=await drainVoiceEffects({claim:async()=>calls++===0?[1]:[],execute:async()=>{},finish:async()=>false})
  assert.equal(result.failed,1)
})
