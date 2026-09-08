import assert from 'node:assert/strict'
import {writeFile,mkdir} from 'node:fs/promises'

// Credential-free checks against this task's isolated local web server only.
const origin='http://localhost:3012'
const paths=['/api/voice/rooms','/api/voice/queue','/api/admin/voice/rooms','/api/admin/community/sports-events','/api/internal/voice/reconcile','/api/internal/retention/process']
const evidence=[]
for(const path of paths){
 const response=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(30000)})
 const body=await response.json()
 assert.ok([401,403,503].includes(response.status),`${path}: unauthorized reads must not return records`)
 assert.ok(response.headers.get('cache-control')?.includes('no-store'),`${path}: no-store`)
 assert.equal(typeof body.error,'string')
 evidence.push({path,status:response.status,error:body.error,cacheControl:response.headers.get('cache-control')})
}
const queue=await fetch(origin+'/api/voice/queue',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({action:'join',topic:'worries',searchId:'11111111-1111-4111-8111-111111111111',idempotencyKey:'22222222-2222-4222-8222-222222222222'}),signal:AbortSignal.timeout(30000)})
assert.ok([401,403,503].includes(queue.status));evidence.push({path:'/api/voice/queue',method:'POST',status:queue.status})
await mkdir('artifacts/community-voice-20260907',{recursive:true})
await writeFile('artifacts/community-voice-20260907/local-http-smoke.json',JSON.stringify({checkedAt:new Date().toISOString(),basis:'credential-free localhost guard checks, not real account or DB success',evidence},null,2))
console.log(JSON.stringify(evidence,null,2))
