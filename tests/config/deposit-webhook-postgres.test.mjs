import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { schemaSql, migrationsSql } from './deposit-webhook-fixture.mjs'

// Opt-in, disposable synthetic PostgreSQL only. No environment connection URL,
// application credentials, ports, bind mounts or remote database are accepted.
const container = process.env.WEBHOOK_TEST_POSTGRES_CONTAINER
const database = 'webhook_ledger_audit'
const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
const psqlArgs = (db = database) => ['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]
function sql(statement, db) {
  return execFileSync('docker', psqlArgs(db), { input: statement, encoding: 'utf8', timeout: 20000 }).trim()
}
function session(name) {
  const child = spawn('docker', psqlArgs(), { stdio: ['pipe','pipe','pipe'] })
  let output = '', errors = ''
  child.stdout.on('data', value => { output += value })
  child.stderr.on('data', value => { errors += value })
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(errors)))
  })
  // Always attach a rejection handler even while waiting for the peer session.
  done.catch(() => {})
  child.stdin.write(`set application_name=${literal(name)}; set statement_timeout='15s';
    set role service_role; select set_config('request.jwt.claim.role','service_role',false);\n`)
  return { child, done, output: () => output, send: text => child.stdin.write(text + '\n'), end: text => child.stdin.end(text + '\n') }
}
async function until(check) {
  const start = Date.now()
  while (!check()) {
    assert.ok(Date.now() - start < 8000, 'Expected overlapping PostgreSQL lock wait')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

test('two PostgreSQL sessions serialize worker/webhook in both orders without reverting actual settlement', {
  skip: !container,
}, async () => {
  assert.equal(container, 'quantum-financial-audit-20260914', 'Only the explicitly authorized audit container is allowed')
  const inspected = JSON.parse(execFileSync('docker',['inspect',container], { encoding: 'utf8' }))[0]
  assert.equal(inspected.HostConfig.NetworkMode, 'none')
  assert.ok(inspected.Mounts.every(mount => mount.Type === 'volume'
    && mount.Destination === '/var/lib/postgresql/data' && /^[0-9a-f]{64}$/.test(mount.Name)))
  assert.deepEqual(inspected.HostConfig.PortBindings ?? {}, {})
  if (!sql(`select 1 from pg_database where datname=${literal(database)};`, 'postgres')) {
    sql(`create database ${database};`, 'postgres')
  }
  if (!sql("select to_regclass('public.deposits');")) sql(schemaSql)
  sql(migrationsSql())
  for (const firstKind of ['worker','webhook']) {
    const ids = Object.fromEntries(['deposit','request','match','group','user'].map(key => [key,randomUUID()]))
    sql(`insert into public.deposits values(${literal(ids.deposit)},${literal(ids.match)},${literal(ids.group)},${literal(ids.user)},
      10000,'held','fixture-order','fixture-payment',0,0,null,null);
      insert into public.deposit_refund_requests(id,deposit_id,match_id,user_id,requested_refund_amount,status)
        values(${literal(ids.request)},${literal(ids.deposit)},${literal(ids.match)},${literal(ids.user)},4000,'pending');`)
    const receipt = { paymentKey:'fixture-payment',orderId:'fixture-order',totalAmount:10000,balanceAmount:0,
      status:'CANCELED',lastTransactionKey:'cancel-full',cancels:[
        {cancelStatus:'DONE',cancelAmount:4000,transactionKey:'cancel-partial',refundableAmount:6000},
        {cancelStatus:'DONE',cancelAmount:6000,transactionKey:'cancel-full',refundableAmount:0},
      ] }
    const worker = `select row_to_json(r) from public.finalize_refund_request(${literal(ids.request)},1,'toss',
      'cancel-partial','original-request','PARTIAL_CANCELED','fixture-payment','fixture-order',4000) r;`
    const webhook = `select row_to_json(r) from public.reconcile_toss_deposit_cancellation(
      ${literal(ids.deposit)},${literal(ids.match)},${literal(ids.group)},${literal(ids.user)},${literal(JSON.stringify(receipt))}::jsonb) r;`
    const first = session('webhook-audit-first'), second = session('webhook-audit-second')
    try {
      first.send(`begin; ${firstKind === 'worker' ? worker : webhook} select 'LOCK_HELD';`)
      await until(() => first.output().includes('LOCK_HELD'))
      second.end(firstKind === 'worker' ? webhook : worker)
      await until(() => sql("select count(*) from pg_stat_activity where datname='webhook_ledger_audit' and application_name='webhook-audit-second' and wait_event_type='Lock';") === '1')
      first.end('commit;')
      const [, secondOutput] = await Promise.all([first.done,second.done])
      if (firstKind === 'webhook') {
        const result = JSON.parse(secondOutput.split('\n').find(line => line.startsWith('{')))
        assert.equal(result.app_revenue, 0)
        assert.equal(result.settled_refund_amount, 10000)
      }
      const state = JSON.parse(sql(`select row_to_json(s) from (select d.refunded_amount,d.retained_amount,
        r.status,r.settled_refund_amount from public.deposits d join public.deposit_refund_requests r on r.deposit_id=d.id
        where d.id=${literal(ids.deposit)}) s;`))
      assert.deepEqual(state, {refunded_amount:10000,retained_amount:0,status:'processed',settled_refund_amount:10000})
      assert.equal(sql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false);
        select count(*) from claim_pending_refund_requests(${literal(randomUUID())},5,120) where refund_request_id=${literal(ids.request)};`).split('\n').at(-1), '0')
    } finally {
      first.child.kill()
      second.child.kill()
    }
  }
})
