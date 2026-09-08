import test from 'node:test'
import assert from 'node:assert/strict'
import {communitySocialReadiness} from '../../scripts/check-community-social-readiness.mjs'
test('release configuration does not claim verified connections and never outputs secrets',()=>{
 const secret='private-example-value-not-an-actual-secret'.repeat(2)
 const rows=communitySocialReadiness({LIVEKIT_API_SECRET:secret})
 assert.equal(rows.find(row=>row.key==='LIVEKIT_API_SECRET').status,'CONFIGURED_NOT_VERIFIED')
 assert.ok(rows.some(row=>row.status==='MISSING_OR_INVALID'))
 assert.equal(JSON.stringify(rows).includes(secret),false)
 assert.equal(rows.find(row=>row.key==='ACCOUNT_DELETION_WORKER_ENABLED').status,'DESTRUCTIVE_WORKER_DISABLED')
})
