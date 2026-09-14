import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {nativeFixture} from './native-admission-fixture.mjs'
import {accountFinanceDependencies, erasureMigration} from '../account/admission-finance-fixture.mjs'

async function fixture() {
  const f = await nativeFixture()
  try {
    await f.db.exec(await readFile(new URL('../../supabase/migrations/20260913102522_meetup_admission_checkout_orders.sql', import.meta.url), 'utf8'))
    // This fixture's original user FK was RESTRICT; install the actual Auth
    // cascade for this regression, and remove unrelated stub profile FKs only.
    await f.db.exec(`alter table public.users drop constraint users_id_fkey;
      alter table public.users add constraint users_id_fkey foreign key(id) references auth.users(id) on delete cascade;
      alter table quantum_private.community_member_profiles drop constraint community_member_profiles_user_id_fkey;
      drop function quantum_private.account_deletion_blocks_access(uuid);`)
    await f.db.exec(await accountFinanceDependencies())
    await f.db.exec(await readFile(erasureMigration, 'utf8'))
    await f.enableNativePolicy()
    await f.db.query('update quantum_private.activity_meetup_admission_policies set amount_krw=10000 where study_room_id=$1', [f.nativeRoom])
    f.service = async(name,args) => {
      await f.db.exec("set role service_role;select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)")
      try { return await f.value(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args) }
      finally { await f.db.exec('reset role') }
    }
    return f
  } catch (error) { await f.db.close(); throw error }
}

test('in-flight checkout retains its exact intent and service records refund liability after access revocation', async () => {
  const f = await fixture()
  try {
    const user = f.users.mechanicalMember
    const intent = await f.nativePrepare()
    const order = await f.service('prepare_meetup_admission_checkout_for_service', [user,'study',f.nativeRoom,intent.intentId,'test'])
    const record = state => f.service('record_meetup_admission_checkout_for_service', [user,'study',f.nativeRoom,order.orderId,state,'synthetic-payment',10000])
    await record('confirming')
    const request = randomUUID()
    await f.db.query('insert into quantum_private.account_deletion_requests(id,user_id,idempotency_key) values($1,$2,$3)', [request,user,randomUUID()])
    await assert.rejects(f.db.query('delete from auth.users where id=$1', [user]), /account_financial_retention_pending/)
    assert.equal((await f.db.query('select user_id from quantum_private.activity_meetup_admission_intents where id=$1', [intent.intentId])).rows[0].user_id, user)
    await f.as(user)
    await assert.rejects(f.nativeContext(), /account_deletion_pending/)
    // Actual service RPC remains available while deleting. It saves the verified
    // receipt and refund_due; it must never admit this now-revoked account.
    const settled = await record('confirmed')
    assert.equal(settled.payment, 'refund_due')
    assert.equal(settled.admission, 'cancelled')
    const {rows} = await f.db.query(`select d.user_id,d.intent_id,d.state,o.state as refund_state
      from quantum_private.activity_meetup_admission_deposits d
      join quantum_private.activity_meetup_admission_refund_outbox o on o.deposit_id=d.id where d.intent_id=$1`, [intent.intentId])
    assert.deepEqual(rows, [{user_id:user,intent_id:intent.intentId,state:'refund_due',refund_state:'pending'}])
    await assert.rejects(f.db.query('delete from public.users where id=$1', [user]), /account_financial_retention_pending/)
    assert.equal((await f.db.query('select count(*)::int n from quantum_private.study_room_members where user_id=$1 and room_id=$2 and left_at is null', [user,f.nativeRoom])).rows[0].n, 0)
  } finally { await f.db.close() }
})

test('bare preparation has no dispatched payment and does not create an erasure blocker', async () => {
  const f = await fixture()
  try {
    const user = f.users.mechanicalMember
    const intent = await f.nativePrepare()
    assert.equal((await f.db.query('select quantum_private.account_has_unresolved_meetup_payments($1) value', [user])).rows[0].value, false)
    await f.db.exec("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)")
    await f.db.query('delete from auth.users where id=$1', [user])
    assert.equal((await f.db.query('select count(*)::int n from quantum_private.activity_meetup_admission_intents where id=$1', [intent.intentId])).rows[0].n, 0)
    await assert.rejects(f.service('prepare_meetup_admission_checkout_for_service', [user,'study',f.nativeRoom,intent.intentId,'test']), /checkout_order_not_found/)
  } finally { await f.db.close() }
})
