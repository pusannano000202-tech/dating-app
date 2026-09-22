import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { setup } from './pending-schedule-fixture.mjs'

const migration = new URL('../../supabase/migrations/20260922102338_meetup_activity_list_filter.sql', import.meta.url)
async function fixture() {
  const f = await setup()
  try {
    await f.db.exec(await readFile(new URL('../../supabase/migrations/20260911141856_meetup_pending_schedule.sql', import.meta.url), 'utf8'))
    await f.db.exec(await readFile(migration, 'utf8'))
    await f.db.exec(`grant usage on schema public,auth to authenticated,anon,service_role;
      create or replace function quantum_private.get_community_identity(p_user_id uuid)
      returns table (school text, display_name text) language sql stable security definer set search_path='' as $$
        select case when profile.school_scope='other_school' then '다른대학교' else '부산대학교' end,
          profile.display_name from quantum_private.community_member_profiles profile where profile.user_id=p_user_id
      $$;`)
    return f
  } catch (error) { await f.db.close(); throw error }
}
async function create(f, extra = {}) {
  const p = { category: 'dining', title: '활동별 모임 테스트', description: '', place: null, start: null, capacity: 6,
    gender: 'all', end: null, scope: 'school', activity: 'campus-cafe-chat', key: randomUUID(), state: 'schedule_pending', ...extra }
  return f.value('select public.create_activity_meetup_v4($1,$2,$3,$4,$5::timestamptz,$6,$7,$8::timestamptz,$9,$10,$11::uuid,$12) as value', Object.values(p))
}
const list = async (f, { category = null, limit = 30, gender = 'all', scope = 'school', activity = 'campus-cafe-chat', cursor = null } = {}) =>
  (await f.db.query('select * from public.list_activity_meetups_v5($1,$2,$3,$4,$5,$6)', [category, limit, gender, scope, activity, cursor])).rows

test('real SQL selects exact activities before limit and traverses confirmed/pending keysets without mixing or loss', async () => {
  const f = await fixture()
  try {
    await f.as(f.users.mechanicalCaptain)
    for (let i = 0; i < 35; i++) await create(f, { activity: 'evening-dining', state: 'confirmed', place: '학생 식당', start: new Date(Date.now() + (2 + i) * 3600000).toISOString(), end: new Date(Date.now() + (3 + i) * 3600000).toISOString() })
    const expected = []
    for (let i = 0; i < 4; i++) expected.push(await create(f, { state: 'confirmed', place: '학교 앞 카페', start: new Date(Date.now() + (40 + i) * 3600000).toISOString(), end: new Date(Date.now() + (41 + i) * 3600000).toISOString() }))
    const pending = await create(f)
    const legacy = await create(f, { activity: null })
    const first = await list(f, { limit: 2, category: 'dining' })
    assert.deepEqual(first.map(row => row.id), expected.slice(0, 2).map(row => row.id))
    // The cursor remains valid even if its source room has disappeared from the list.
    await f.db.query("update public.activity_meetups set status='cancelled' where id=$1", [first.at(-1).id])
    const second = await list(f, { limit: 2, cursor: first.at(-1).list_cursor })
    const third = await list(f, { limit: 2, cursor: second.at(-1).list_cursor })
    const all = [...first, ...second, ...third]
    assert.deepEqual(all.map(row => row.id), [...expected.map(row => row.id), pending.id])
    assert.equal(new Set(all.map(row => row.id)).size, 5)
    assert.ok(all.every(row => row.activity_key === 'campus-cafe-chat'))
    assert.ok(all.every(row => row.joined && row.is_host && row.gender_eligibility === 'eligible'))
    assert.equal(third[0].schedule_status, 'schedule_pending')
    assert.equal(third[0].scheduled_at, null)
    assert.equal(third[0].place_name, null)
    assert.deepEqual(await list(f, { cursor: third.at(-1).list_cursor }), [])
    assert.ok(!all.some(row => row.id === legacy.id))
    const old = (await f.db.query("select * from public.list_activity_meetups_v4('dining',31,'all','school',null)")).rows
    assert.equal(old.length, 31)
    assert.ok(old.every(row => row.activity_key === 'evening-dining'))
  } finally { await f.db.close() }
})

test('real SQL preserves school/department and gender eligibility instead of treating all as every gender', async () => {
  const f = await fixture()
  try {
    await f.as(f.users.mechanicalCaptain)
    const school = await create(f)
    const department = await create(f, { scope: 'department' })
    const women = await create(f, { gender: 'female_only' })
    await f.as(f.users.computerCaptain)
    assert.deepEqual((await list(f)).map(row => row.id), [school.id])
    assert.deepEqual(await list(f, { scope: 'department' }), [])
    const otherGender = await list(f, { gender: 'female_only' })
    assert.equal(otherGender[0].id, women.id)
    assert.equal(otherGender[0].gender_eligibility, 'gender_restricted')
    assert.equal(otherGender[0].joined, false)
    assert.equal(otherGender[0].is_host, false)
    await f.as(f.users.mechanicalMember)
    assert.deepEqual((await list(f, { scope: 'department' })).map(row => row.id), [department.id])
    await f.as(f.users.otherSchool)
    assert.deepEqual(await list(f, { scope: null, gender: null }), [])
    await f.as(randomUUID())
    await assert.rejects(list(f), /profile_required/)
  } finally { await f.db.close() }
})

test('new public RPC denies unauthenticated and nonmember roles and rejects malformed direct parameters', async () => {
  const f = await fixture()
  try {
    await f.as('')
    await assert.rejects(list(f), /not_authenticated/)
    await f.as(f.users.mechanicalCaptain)
    for (const activity of [null, '', 'unknown', 'campus-cafe-chat ']) await assert.rejects(list(f, { activity }), /invalid_activity_key/)
    await assert.rejects(list(f, { category: 'other' }), /invalid_activity_key/)
    await assert.rejects(list(f, { scope: 'anywhere' }), /invalid_scope_type/)
    await assert.rejects(list(f, { gender: 'everyone' }), /invalid_gender_mode/)
    await assert.rejects(list(f, { cursor: 'broken' }), /invalid_cursor/)
    const created = await create(f)
    for (const role of ['anon', 'service_role']) {
      await f.db.exec('set role ' + role)
      await assert.rejects(list(f), /permission denied/)
      await f.db.exec('reset role')
    }
    await f.db.exec('set role authenticated')
    assert.deepEqual((await list(f)).map(row => row.id), [created.id])
    await assert.rejects(f.db.query('select * from public.activity_meetups'), /permission denied/)
    await f.db.exec('reset role')
    const config = (await f.db.query("select prosecdef,proconfig from pg_catalog.pg_proc where oid='public.list_activity_meetups_v5(text,integer,text,text,text,text)'::regprocedure")).rows[0]
    assert.equal(config.prosecdef, true)
    assert.deepEqual(config.proconfig, ['search_path=""'])
  } finally { await f.db.close() }
})
