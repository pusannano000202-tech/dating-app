import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {nativeFixture} from './native-admission-fixture.mjs'

const migration = new URL('../../supabase/migrations/20260913193248_meetup_cancelled_admission_liability.sql', import.meta.url)

async function setup() {
  const f = await nativeFixture()
  try {
    await f.db.exec(await readFile(migration, 'utf8'))
    // Replace the fixture's original draft RPCs with their latest real definitions.
    const integrated = await readFile(new URL('../../supabase/migrations/20260906181225_community_social_integrated.sql', import.meta.url), 'utf8')
    for (const name of ['cancel_my_activity_meetup', 'complete_my_activity_meetup']) {
      const tail = integrated.slice(integrated.indexOf(`create or replace function public.${name}(`))
      await f.db.exec(tail.slice(0, tail.indexOf('$$;') + 3))
    }
    await f.db.query('update quantum_private.activity_meetup_admission_policies set amount_krw=10000 where meetup_id=$1', [f.roomId])
    const accepted = await f.confirm((await f.prepare()).intentId, randomUUID(), 10000)
    await f.as(f.users.mechanicalCaptain)
    await f.decide(accepted.id)
    const pending = await f.confirm((await f.prepare(f.users.mechanicalReserve)).intentId, randomUUID(), 10000)
    f.applications = {accepted, pending}
    f.rows = () => f.db.query(`select a.id,a.state,d.state as payment,d.amount_krw,
      (select count(*)::int from quantum_private.activity_meetup_admission_refund_outbox o where o.deposit_id=d.id)as liabilities
      from quantum_private.activity_meetup_admissions a
      join quantum_private.activity_meetup_admission_deposits d on d.id=a.deposit_id
      where a.meetup_id=$1`, [f.roomId])
    return f
  } catch (error) {
    await f.db.close()
    throw error
  }
}

test('host cancellation records one liability for each accepted or pending deposit, including replay', async () => {
  const f = await setup()
  try {
    await f.as(f.users.mechanicalCaptain)
    const {revision} = (await f.db.query('select revision from public.activity_meetups where id=$1', [f.roomId])).rows[0]
    const args = [f.roomId, '일정 취소', revision, randomUUID()]
    await f.db.exec('set role authenticated')
    await f.value('select public.cancel_my_activity_meetup($1,$2,$3,$4)as value', args)
    await f.value('select public.cancel_my_activity_meetup($1,$2,$3,$4)as value', args)
    await f.db.exec('reset role')
    const {rows} = await f.rows()
    assert.equal(rows.length, 2)
    for (const row of rows) {
      assert.equal(row.state, 'cancelled')
      assert.equal(row.payment, 'refund_due')
      assert.equal(row.amount_krw, 10000)
      assert.equal(row.liabilities, 1)
    }
  } finally {
    await f.db.close()
  }
})

test('normal completion preserves accepted deposit for the user and closes only pending admission', async () => {
  const f = await setup()
  try {
    await f.as(f.users.mechanicalCaptain)
    await f.db.query("update public.activity_meetups set scheduled_at=clock_timestamp()-interval '1 hour' where id=$1", [f.roomId])
    const {revision} = (await f.db.query('select revision from public.activity_meetups where id=$1', [f.roomId])).rows[0]
    await f.db.exec('set role authenticated')
    await f.value('select public.complete_my_activity_meetup($1,$2,$3)as value', [f.roomId, revision, randomUUID()])
    await f.db.exec('reset role')
    const {rows} = await f.rows()
    const accepted = rows.find(row => row.id === f.applications.accepted.id)
    const pending = rows.find(row => row.id === f.applications.pending.id)
    assert.deepEqual([accepted.state, accepted.payment, accepted.liabilities], ['accepted', 'held', 0])
    assert.deepEqual([pending.state, pending.payment, pending.liabilities], ['cancelled', 'refund_due', 1])
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const {rows: privileges} = await f.db.query("select has_function_privilege($1,'quantum_private.admission_room_closed()','EXECUTE')as allowed", [role])
      assert.equal(privileges[0].allowed, false)
    }
  } finally {
    await f.db.close()
  }
})
