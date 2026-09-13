import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { parseMentoringSnapshot } from '../../lib/mentoring/contract.ts'

const migration = new URL('../../supabase/migrations/20260909170157_mentoring_role_matching.sql', import.meta.url)
const ids = Array.from({ length: 8 }, (_, i) => `40000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`)
async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema quantum_private;
    create table public.users(id uuid primary key);
    create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
    create table quantum_private.community_member_profiles(user_id uuid primary key,school_scope text,department text,community_gender text);
    create table quantum_private.test_blocks(a uuid,b uuid);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function quantum_private.account_deletion_blocks_access(uuid) returns boolean language sql stable as $$ select false $$;
    create function quantum_private.resolve_profile_readiness(uuid) returns table(minimum_signup_complete boolean) language sql stable as $$ select true $$;
    create function quantum_private.get_or_create_daily_identity(uuid,timestamptz) returns jsonb language sql as $$ select jsonb_build_object('display_name','별명') $$;
    create function quantum_private.tonight_invite_pair_is_blocked(x uuid,y uuid) returns boolean language sql stable as $$ select exists(select 1 from quantum_private.test_blocks where (a=x and b=y) or (a=y and b=x)) $$;
  `)
  const source = await readFile(new URL('../../supabase/migrations/20260906181225_community_social_integrated.sql', import.meta.url), 'utf8')
  for (const name of ['canonical_department_key', 'canonical_school_scope_key', 'get_member_department_identity']) {
    const tail = source.slice(source.indexOf(`create or replace function quantum_private.${name}(`))
    await db.exec(tail.slice(0, tail.indexOf('$$;') + 3))
  }
  const access = await readFile(new URL('../../supabase/migrations/20260907113358_automatic_activity_rooms.sql', import.meta.url), 'utf8')
  const tail = access.slice(access.indexOf('create function quantum_private.assert_activity_room_access('))
  await db.exec(tail.slice(0, tail.indexOf('$$;') + 3))
  for (let i = 0; i < ids.length; i++) {
    await db.query('insert into auth.users(id) values($1)', [ids[i]])
    await db.query('insert into public.users values($1)', [ids[i]])
    await db.query('insert into quantum_private.community_member_profiles values($1,$2,$3,$4)', [ids[i], 'pnu_self_selected', i === 7 ? '다른학과' : '미래에너지공학과', i % 2 ? 'female' : 'male'])
  }
  await db.exec(await readFile(migration, 'utf8'))
  async function act(user, action, args = {}) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ''])
    await db.exec('set role authenticated')
    try {
      const result = (await db.query('select public.mentoring_action($1,$2::jsonb) as value', [action, JSON.stringify(args)])).rows[0].value
      assert.ok(parseMentoringSnapshot(result), 'SQL response satisfies the frontend projection contract')
      return result
    }
    finally { await db.exec('reset role') }
  }
  return { db, act }
}
const join = (role = 'mentee', topic = 'courses') => ({ role, topic })

test('mentoring: same department opposite roles, mutual consent, durable chat and private report', async () => {
  const { db, act } = await fixture()
  try {
    assert.equal((await act(ids[0], 'join', join())).phase, 'waiting')
    assert.equal((await act(ids[0], 'status')).role, 'mentee')
    const offered = await act(ids[1], 'join', join('mentor'))
    assert.equal(offered.phase, 'offered')
    assert.equal(offered.peer_alias, null)
    assert.deepEqual(offered.messages, [])
    await assert.rejects(act(ids[0], 'message', { session_id: offered.session_id, text: '아직 안돼요', client_id: crypto.randomUUID() }), /mentoring_not_active/)
    assert.equal((await act(ids[0], 'accept', { session_id: offered.session_id })).phase, 'offered')
    const active = await act(ids[1], 'accept', { session_id: offered.session_id })
    assert.equal(active.phase, 'active')
    assert.ok(active.peer_alias)
    const command = { session_id: offered.session_id, text: '어떤 과목부터 이야기해볼까요?', client_id: crypto.randomUUID() }
    await act(ids[1], 'message', command)
    assert.equal((await act(ids[1], 'message', command)).messages.length, 1, 'retry is idempotent')
    assert.equal((await act(ids[0], 'status')).messages[0].mine, false)
    await assert.rejects(act(ids[2], 'accept', { session_id: offered.session_id }), /mentoring_forbidden/)
    await assert.rejects(act(ids[2], 'message', command), /mentoring_forbidden/)
    const ended = await act(ids[0], 'report', { session_id: offered.session_id, reason: '부적절한 이야기' })
    assert.equal(ended.phase, 'ended')
    assert.equal(JSON.stringify(await act(ids[1], 'status')).includes('부적절한 이야기'), false)
    assert.equal((await db.query('select count(*)::int n from quantum_private.mentoring_reports')).rows[0].n, 1)
    assert.deepEqual(ended.messages, [], 'ended sessions no longer disclose history')
  } finally { await db.close() }
})

test('mentoring: separate pools, duplicates, blocked pairs, cancel and expiry', async () => {
  const { db, act } = await fixture()
  try {
    await act(ids[0], 'join', join())
    await act(ids[0], 'join', join())
    assert.equal((await db.query('select count(*)::int n from quantum_private.mentoring_waiters')).rows[0].n, 1)
    await assert.rejects(act(ids[0], 'join', join('mentor')), /mentoring_already_waiting/)
    assert.equal((await act(ids[2], 'join', join())).phase, 'waiting')
    assert.equal((await act(ids[7], 'join', join('mentor'))).phase, 'waiting', 'other department cannot match')
    assert.equal((await act(ids[3], 'join', join('mentor', 'career'))).phase, 'waiting', 'different topic cannot match')
    await db.query('insert into quantum_private.test_blocks values($1,$2),($1,$3)', [ids[1], ids[0], ids[2]])
    assert.equal((await act(ids[1], 'join', join('mentor'))).phase, 'waiting', 'blocked pair cannot match')
    assert.equal((await act(ids[1], 'cancel')).phase, 'idle')
    await db.query("update quantum_private.mentoring_waiters set expires_at=now()-interval '1 second' where user_id=$1", [ids[0]])
    assert.equal((await act(ids[0], 'status')).phase, 'expired')
    const offered = await act(ids[4], 'join', join('mentor'))
    assert.equal(offered.phase, 'offered')
    await db.query("update quantum_private.mentoring_sessions set expires_at=now()-interval '1 second' where id=$1", [offered.session_id])
    assert.equal((await act(ids[4], 'status')).phase, 'expired')
    assert.equal((await act(ids[2], 'status')).phase, 'expired', 'both informed, no silent rematch')
  } finally { await db.close() }
})

test('mentoring: revoked identity, newly blocked pair, direct SQL and invalid payload reject', async () => {
  const { db, act } = await fixture()
  try {
    await assert.rejects(act(null, 'status'), /not_authenticated/)
    await assert.rejects(act(ids[0], 'join', { role: 'owner', topic: 'courses' }), /mentoring_invalid/)
    await assert.rejects(act(ids[0], 'join', { role: 'mentor', topic: 'courses', user_id: ids[1] }), /mentoring_invalid/)
    await act(ids[0], 'join', join())
    const offered = await act(ids[1], 'join', join('mentor'))
    await act(ids[0], 'accept', { session_id: offered.session_id })
    await act(ids[1], 'accept', { session_id: offered.session_id })
    await db.query('insert into quantum_private.test_blocks values($1,$2)', [ids[0], ids[1]])
    assert.equal((await act(ids[0], 'status')).phase, 'ended')
    await assert.rejects(act(ids[1], 'message', { session_id: offered.session_id, text: 'no', client_id: crypto.randomUUID() }), /mentoring_not_active/)
    await db.query('update auth.users set banned_until=now()+interval \'1 day\' where id=$1', [ids[2]])
    await assert.rejects(act(ids[2], 'status'), /activity_room_forbidden/)
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from quantum_private.mentoring_waiters'), /permission denied/)
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query("select public.mentoring_action('status','{}')"), /permission denied/)
    await db.exec('reset role')
  } finally { await db.close() }
})

test('mentoring: simultaneous offers claim each waiter once and cancelled offers cannot revive', async () => {
  const { db, act } = await fixture()
  const concurrentJoin = user => db.transaction(async transaction => {
    await transaction.query("select set_config('request.jwt.claim.sub',$1,true)", [user])
    await transaction.exec('set local role authenticated')
    return (await transaction.query("select public.mentoring_action('join',$1::jsonb) value", [JSON.stringify(join('mentor'))])).rows[0].value
  })
  try {
    await act(ids[0], 'join', join())
    const results = await Promise.all([concurrentJoin(ids[1]), concurrentJoin(ids[2]), concurrentJoin(ids[3])])
    assert.equal(results.filter(result => result.phase === 'offered').length, 1)
    assert.equal((await db.query('select count(*)::int n from quantum_private.mentoring_sessions')).rows[0].n, 1)
    const offered = results.find(result => result.phase === 'offered')
    await act(ids[0], 'decline', { session_id: offered.session_id })
    await assert.rejects(act(ids[1], 'accept', { session_id: offered.session_id }), /mentoring_not_active|mentoring_forbidden/)
    assert.equal((await act(ids[0], 'status')).phase, 'ended')
  } finally { await db.close() }
})
