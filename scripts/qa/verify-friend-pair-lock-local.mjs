import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'

// Fixed synthetic local cohort only. Every SQL session rolls back; no provider calls.
const container = 'supabase_db_quantum-integrated-campus-20260905'
const ports = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', container], { encoding: 'utf8' }))
assert(ports['5432/tcp']?.some(binding => binding.HostPort === '56422'), 'wrong local database')
const left = 'd964b372-ef61-4dce-aadd-214fa6f98a43'
const right = 'c6600000-0000-4000-8000-000000000001'
const pair = (a, b) => `least(${a}, ${b})=least('${left}'::uuid, '${right}'::uuid) and greatest(${a}, ${b})=greatest('${left}'::uuid, '${right}'::uuid)`
const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
const read = sql => execFileSync('docker', args, { input: `begin read only; ${sql}; rollback;`, encoding: 'utf8', timeout: 10000 })
for (const [table, a, b] of [['friendships', 'user_id', 'friend_user_id'], ['friend_requests', 'sender_user_id', 'receiver_user_id']]) {
  assert(read(`select count(*) from public.${table} where ${pair(a, b)}`).split(/\r?\n/).includes('1'), `expected one synthetic ${table} row`)
}

let signalHeld
const held = new Promise(resolve => { signalHeld = resolve })
let lockOutput = ''
const lock = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
const ended = new Promise((resolve, reject) => {
  lock.once('error', reject)
  lock.once('close', code => code === 0 ? resolve() : reject(new Error(`lock session failed: ${lockOutput}`)))
})
lock.stdout.on('data', chunk => {
  lockOutput += chunk.toString()
  if (lockOutput.includes('R9_PAIR_LOCK_HELD')) signalHeld()
})
lock.stderr.on('data', chunk => { lockOutput += chunk.toString() })
lock.stdin.end(`begin; set local statement_timeout='10s'; select pg_advisory_xact_lock(quantum_private.friend_pair_lock_key('${left}', '${right}')); select 'R9_PAIR_LOCK_HELD'; select pg_sleep(6); rollback;`)
let timeout
try {
  await Promise.race([held, ended.then(() => { throw new Error('lock ended before signal') }), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('lock signal timeout')), 12000) })])
  clearTimeout(timeout)
  const results = []
  for (const [table, a, b] of [['friendships', 'user_id', 'friend_user_id'], ['friend_requests', 'sender_user_id', 'receiver_user_id']]) {
    const start = performance.now()
    let rejected = false
    try {
      execFileSync('docker', args, { input: `begin; set local lock_timeout='2s'; update public.${table} set status=status where ${pair(a, b)}; rollback;`, encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      const failure = String(error.stderr ?? '')
      rejected = failure.includes('40001') && failure.includes('friend_pair_retryable')
      assert(rejected, `unexpected ${table} contention result: ${failure}`)
    }
    assert(rejected, `${table} bypassed pair lock`)
    results.push({ table, result: 'retryable_40001', elapsedMs: Math.round(performance.now() - start) })
  }
  await ended
  console.log(JSON.stringify({ databasePort: 56422, separateSessions: true, results, persistentWrites: false, providerCalls: false }, null, 2))
} finally {
  clearTimeout(timeout)
  await ended
}
