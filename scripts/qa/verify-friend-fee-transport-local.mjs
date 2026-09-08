import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

// Invalid-input RPC probes only. No order mutation, checkout or provider call.
const cli = 'C:/Users/82108/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe'
const status = JSON.parse(execFileSync(cli, ['status', '--workdir', '.tmp/integrated-live-local', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
assert.equal(status.API_URL, 'http://127.0.0.1:56421')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY || status.SECRET_KEY, options)
const anonymous = createClient(status.API_URL, status.ANON_KEY || status.PUBLISHABLE_KEY, options)
const args = { p_order_id: null, p_owner_user_id: null, p_provider: null, p_provider_order_id: null }
const service = await admin.rpc('begin_continuation_fee_verification_for_service', args)
const denied = await anonymous.rpc('begin_continuation_fee_verification_for_service', args)
assert.equal(service.error?.message, 'invalid_fee_verification')
assert.equal(denied.error?.code, '42501')
console.log(JSON.stringify({ databaseApiPort: 56421, service: { roleAccepted: true, invalidInputRejected: true, status: service.status }, anonymous: { denied: true, status: denied.status }, mutations: false, providerCalls: false }, null, 2))
