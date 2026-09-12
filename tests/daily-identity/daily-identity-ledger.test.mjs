import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'

import { PGlite } from '@electric-sql/pglite'

async function migrationSql() {
  const names = (await readdir(new URL('../../supabase/migrations/', import.meta.url)))
    .filter((name) => /^\d{14}_daily_identity\.sql$/.test(name))
  assert.equal(names.length, 1, 'exactly one timestamped daily identity migration must exist')
  return readFile(new URL(`../../supabase/migrations/${names[0]}`, import.meta.url), 'utf8')
}

async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema quantum_private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
    create table quantum_private.deleted_accounts(user_id uuid primary key);
    create function quantum_private.account_deletion_blocks_access(uuid) returns boolean language sql stable
      as $$select exists(select 1 from quantum_private.deleted_accounts where user_id=$1)$$;
    create table public.users(id uuid primary key references auth.users(id));
    create table public.profiles(user_id uuid primary key, gender text, display_name text);
    create table quantum_private.community_member_profiles(
      user_id uuid primary key, community_gender text, display_name text
    );
    create table public.groups(id uuid primary key);
    create table public.group_members(group_id uuid,user_id uuid,left_at timestamptz);
    create table public.matches(id uuid primary key,group_a_id uuid,group_b_id uuid);
    create table public.match_member_aliases(
      match_id uuid, viewer_group_id uuid, target_user_id uuid, alias text,
      alias_theme text, sort_order int,
      primary key(match_id,viewer_group_id,target_user_id), unique(match_id,viewer_group_id,alias)
    );
    create table public.activity_meetups(id uuid primary key,status text default 'open');
    create table public.activity_meetup_members(
      meetup_id uuid,user_id uuid,role text,status text default 'joined',joined_at timestamptz default now(),left_at timestamptz,
      primary key(meetup_id,user_id)
    );
    create table public.activity_meetup_messages(
      id uuid primary key default gen_random_uuid(),meetup_id uuid,sender_user_id uuid,idempotency_key uuid,message text,created_at timestamptz default now()
    );
    create table public.friendships(user_id uuid,friend_user_id uuid,status text);
    create function quantum_private.activity_meetup_scope_eligible(uuid,uuid)
      returns boolean language sql stable as $$select true$$;
    create table quantum_private.activity_room_pools(
      id uuid primary key,school_scope text,activity_key text,gender_mode text,status text,capacity int
    );
    create table quantum_private.activity_room_rooms(
      id uuid primary key,pool_id uuid,room_number int,status text
    );
    create table quantum_private.activity_room_members(
      room_id uuid,user_id uuid,status text default 'joined',joined_at timestamptz default now(),left_at timestamptz,
      primary key(room_id,user_id)
    );
    create table quantum_private.activity_room_messages(
      id uuid primary key default gen_random_uuid(),room_id uuid,sender_user_id uuid,idempotency_key uuid,message text,created_at timestamptz default now()
    );
    create table public.quantum_continuation_occurrence_members(
      occurrence_id uuid,participant_user_id uuid,alias text not null,
      primary key(occurrence_id,participant_user_id),unique(occurrence_id,alias),
      constraint quantum_continuation_occurrence_members_alias_check check(alias ~ '^참가자 [1-6]$')
    );
  `)
  await db.exec(await migrationSql())
  const users = Array.from({ length: 4 }, () => randomUUID())
  for (let index = 0; index < users.length; index += 1) {
    const gender = index === 0 ? 'male' : index === 1 ? 'female' : 'unknown'
    await db.query('insert into auth.users(id) values($1)', [users[index]])
    await db.query('insert into public.users values($1)', [users[index]])
    await db.query('insert into public.profiles values($1,$2,$3)', [users[index], gender, `legacy-${index}`])
    await db.query('insert into quantum_private.community_member_profiles values($1,$2,$3)', [users[index], gender, `public-${index}`])
  }
  return { db, users }
}

async function as(db, userId) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId ?? ''])
}

test('direct authenticated daily identity RPC rejects banned, deleted and deletion-pending accounts', async () => {
  const {db,users}=await setup()
  try {
    for (const state of ['banned','deleted','pending']) {
      await db.query('update auth.users set deleted_at=null,banned_until=null where id=$1',[users[0]])
      await db.exec('delete from quantum_private.deleted_accounts')
      if(state==='banned') await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[users[0]])
      if(state==='deleted') await db.query('update auth.users set deleted_at=now() where id=$1',[users[0]])
      if(state==='pending') await db.query('insert into quantum_private.deleted_accounts values($1)',[users[0]])
      await as(db,users[0])
      await db.exec('set role authenticated')
      await assert.rejects(()=>db.query('select public.get_my_daily_identity()'),/daily_identity_account_unavailable/)
      await db.exec('reset role')
      assert.equal((await db.query('select count(*)::int n from quantum_private.daily_identity_assignments')).rows[0].n,0)
    }
  } finally {await db.close()}
})

test('Asia/Seoul day boundary and exact rarity bounds are server functions', async () => {
  const fixture = await setup()
  try {
    const days = await fixture.db.query(`select
      quantum_private.daily_identity_local_date(timestamptz '2026-09-08 14:59:59+00')::text before_midnight,
      quantum_private.daily_identity_local_date(timestamptz '2026-09-08 15:00:00+00')::text after_midnight`)
    assert.deepEqual(days.rows[0], { before_midnight: '2026-09-08', after_midnight: '2026-09-09' })
    const tiers = await fixture.db.query(`select
      quantum_private.daily_identity_tier(0) r0, quantum_private.daily_identity_tier(4) r4,
      quantum_private.daily_identity_tier(5) r5, quantum_private.daily_identity_tier(19) r19,
      quantum_private.daily_identity_tier(20) r20, quantum_private.daily_identity_tier(44) r44,
      quantum_private.daily_identity_tier(45) r45, quantum_private.daily_identity_tier(99) r99`)
    assert.deepEqual(tiers.rows[0], { r0: 'SS', r4: 'SS', r5: 'A', r19: 'A', r20: 'B', r44: 'B', r45: 'C', r99: 'C' })
    await assert.rejects(() => fixture.db.query('select quantum_private.daily_identity_tier(100)'), /invalid_daily_identity_roll/)
  } finally { await fixture.db.close() }
})

test('authenticated self draw repeats once per Seoul day and exposes neither owner id nor gender bucket', async () => {
  const fixture = await setup()
  try {
    await as(fixture.db, fixture.users[0])
    const first = (await fixture.db.query('select public.get_my_daily_identity() value')).rows[0].value
    const repeated = (await fixture.db.query('select public.get_my_daily_identity() value')).rows[0].value
    assert.deepEqual(repeated, first)
    assert.deepEqual(first.odds, { SS: 5, A: 15, B: 25, C: 55 })
    assert.equal(first.timezone, 'Asia/Seoul')
    assert.equal(first.user_id, undefined)
    assert.equal(first.gender_pool, undefined)
    assert.equal((await fixture.db.query('select count(*)::int n from quantum_private.daily_identity_assignments')).rows[0].n, 1)
    const sameDay = (await fixture.db.query(
      "select quantum_private.get_or_create_daily_identity($1,timestamptz '2026-09-08 15:00:01+00') value",
      [fixture.users[1]],
    )).rows[0].value
    const sameDayAgain = (await fixture.db.query(
      "select quantum_private.get_or_create_daily_identity($1,timestamptz '2026-09-09 14:59:59+00') value",
      [fixture.users[1]],
    )).rows[0].value
    const nextDay = (await fixture.db.query(
      "select quantum_private.get_or_create_daily_identity($1,timestamptz '2026-09-09 15:00:00+00') value",
      [fixture.users[1]],
    )).rows[0].value
    assert.deepEqual(sameDayAgain, sameDay)
    assert.notEqual(nextDay.local_date, sameDay.local_date)
    await as(fixture.db, null)
    await assert.rejects(() => fixture.db.query('select public.get_my_daily_identity()'), /not_authenticated/)
  } finally { await fixture.db.close() }
})

test('private storage is RLS-locked and the public getter is authenticated-only', async () => {
  const fixture = await setup()
  try {
    const result = await fixture.db.query(`select
      (select relrowsecurity from pg_class where oid='quantum_private.daily_identity_assignments'::regclass) rls,
      has_table_privilege('authenticated','quantum_private.daily_identity_assignments','select') auth_table,
      has_table_privilege('anon','quantum_private.daily_identity_assignments','select') anon_table,
      has_function_privilege('authenticated','public.get_my_daily_identity()','execute') auth_rpc,
      has_function_privilege('anon','public.get_my_daily_identity()','execute') anon_rpc`)
    assert.deepEqual(result.rows[0], { rls: true, auth_table: false, anon_table: false, auth_rpc: true, anon_rpc: false })
    const poolCounts = await fixture.db.query(`select gender_pool,tier,count(*)::int count
      from quantum_private.daily_identity_characters group by gender_pool,tier order by gender_pool,tier`)
    assert.equal(poolCounts.rows.length, 12)
    assert.ok(poolCounts.rows.every(row => row.count >= 3), 'every tier in every gender bucket has multiple candidates')
    const requestedCharacters = await fixture.db.query(`select display_name from quantum_private.daily_identity_characters
      where (gender_pool='male' and tier='SS' and character_key in ('spider-man','batman','iron-man'))
      or (gender_pool='female' and tier='SS' and character_key='elsa')`)
    assert.deepEqual(requestedCharacters.rows.map(row => row.display_name).sort(), ['스파이더맨','배트맨','아이언맨','엘사'].sort())
    const neutral = (await fixture.db.query(
      "select quantum_private.get_or_create_daily_identity($1,timestamptz '2026-09-09 00:00:00+09') value",
      [fixture.users[2]],
    )).rows[0].value
    const stored = (await fixture.db.query(
      'select gender_pool from quantum_private.daily_identity_assignments where user_id=$1 and local_date=$2',
      [fixture.users[2], neutral.local_date],
    )).rows[0]
    assert.equal(stored.gender_pool, 'neutral')
  } finally { await fixture.db.close() }
})

test('new nightly, weekly-event, and continuation aliases freeze daily identity while historical aliases stay unchanged', async () => {
    const fixture = await setup()
  try {
    const [viewer, match, occurrence] = [randomUUID(), randomUUID(), randomUUID()]
    await fixture.db.query('insert into public.groups values($1)', [viewer])
    await fixture.db.query('insert into public.matches values($1,$2,$2)', [match, viewer])
    await fixture.db.exec('alter table public.match_member_aliases disable trigger trg_match_member_daily_identity')
    await fixture.db.query(`insert into public.match_member_aliases values($1,$2,$3,'오소리','animals',0)`, [match, viewer, fixture.users[0]])
    await fixture.db.exec('alter table public.match_member_aliases enable trigger trg_match_member_daily_identity')
    await fixture.db.query(`insert into public.match_member_aliases values($1,$2,$3,'임시값','animals',1)`, [match, viewer, fixture.users[1]])
    await fixture.db.query(`insert into public.match_member_aliases values($1,$2,$3,'참가자 A','event-aliases-v1',2)`, [match, viewer, fixture.users[2]])
    const aliases = await fixture.db.query('select target_user_id,alias,alias_theme from public.match_member_aliases order by sort_order')
    assert.equal(aliases.rows[0].alias, '오소리', 'existing records are not rewritten')
    assert.notEqual(aliases.rows[1].alias, '임시값')
    assert.match(aliases.rows[1].alias_theme, /^daily-character:/)
    assert.notEqual(aliases.rows[2].alias, '참가자 A')
    assert.match(aliases.rows[2].alias_theme, /^daily-character:/)

    await fixture.db.query(`insert into public.quantum_continuation_occurrence_members values($1,$2,'참가자 1')`, [occurrence, fixture.users[3]])
    const frozen = (await fixture.db.query('select alias from public.quantum_continuation_occurrence_members where occurrence_id=$1', [occurrence])).rows[0].alias
    assert.notEqual(frozen, '참가자 1')
    await fixture.db.query(`insert into quantum_private.daily_identity_assignments(
      user_id,local_date,timezone,pool_version,gender_pool,tier,character_key,display_name,entropy
    ) select $1,current_date+1,'Asia/Seoul',pool_version,gender_pool,tier,character_key,display_name,gen_random_uuid()
      from quantum_private.daily_identity_assignments where user_id=$1 limit 1`, [fixture.users[3]])
    assert.equal((await fixture.db.query('select alias from public.quantum_continuation_occurrence_members where occurrence_id=$1', [occurrence])).rows[0].alias, frozen)
  } finally { await fixture.db.close() }
})

test('room collisions receive non-identifying ordinals and sent-name history stays frozen', async () => {
  const fixture = await setup()
  try {
    const meetup = randomUUID()
    await fixture.db.query('insert into public.activity_meetups values($1)', [meetup])
    const date = (await fixture.db.query('select quantum_private.daily_identity_local_date(clock_timestamp()) d')).rows[0].d
    const character = (await fixture.db.query("select * from quantum_private.daily_identity_characters where gender_pool='male' and tier='C' order by selection_order limit 1")).rows[0]
    for (const userId of fixture.users.slice(0, 2)) {
      await fixture.db.query(`insert into quantum_private.daily_identity_assignments(
        user_id,local_date,timezone,pool_version,gender_pool,tier,character_key,display_name,entropy
      ) values($1,$2,'Asia/Seoul',$3,'male','C',$4,$5,gen_random_uuid())`, [userId, date, character.pool_version, character.character_key, character.display_name])
      await fixture.db.query(`insert into public.activity_meetup_members(meetup_id,user_id,role) values($1,$2,'member')`, [meetup, userId])
    }
    const members = await fixture.db.query('select identity_alias_snapshot alias from public.activity_meetup_members order by joined_at,user_id')
    assert.deepEqual(new Set(members.rows.map(row => row.alias)).size, 2)
    assert.ok(members.rows.some(row => /·2$/.test(row.alias)))

    const messageId = randomUUID()
    await fixture.db.query(`insert into public.activity_meetup_messages(id,meetup_id,sender_user_id,idempotency_key,message)
      values($1,$2,$3,gen_random_uuid(),'hello')`, [messageId, meetup, fixture.users[0]])
    const sentAlias = (await fixture.db.query('select sender_alias_snapshot alias from public.activity_meetup_messages where id=$1', [messageId])).rows[0].alias
    await fixture.db.query("update quantum_private.daily_identity_assignments set display_name='다음날이름' where user_id=$1", [fixture.users[0]])
    assert.equal((await fixture.db.query('select sender_alias_snapshot alias from public.activity_meetup_messages where id=$1', [messageId])).rows[0].alias, sentAlias)
    await as(fixture.db, fixture.users[0])
    const chat = (await fixture.db.query('select public.get_my_activity_meetup_chat($1) value', [meetup])).rows[0].value
    assert.equal(chat.messages[0].sender_alias, sentAlias, 'the read model uses the sent-name snapshot')
  } finally { await fixture.db.close() }
})

test('match display names stay unique even when different pool tiers share a character', async () => {
  const fixture = await setup()
  try {
    const [viewer, match] = [randomUUID(), randomUUID()]
    const date = (await fixture.db.query('select quantum_private.daily_identity_local_date(clock_timestamp()) d')).rows[0].d
    const candidates = await fixture.db.query(`select * from quantum_private.daily_identity_characters
      where (gender_pool='male' and tier='SS' and character_key='cinnamoroll')
         or (gender_pool='neutral' and tier='A' and character_key='cinnamoroll')
      order by gender_pool`)
    assert.equal(candidates.rows.length, 2)
    for (const [index, userId] of [fixture.users[0], fixture.users[2]].entries()) {
      const candidate = candidates.rows[index]
      await fixture.db.query(`insert into quantum_private.daily_identity_assignments(
        user_id,local_date,timezone,pool_version,gender_pool,tier,character_key,display_name,entropy
      ) values($1,$2,'Asia/Seoul',$3,$4,$5,$6,$7,gen_random_uuid())`, [
        userId, date, candidate.pool_version, candidate.gender_pool, candidate.tier,
        candidate.character_key, candidate.display_name,
      ])
    }
    await fixture.db.query('insert into public.groups values($1)', [viewer])
    await fixture.db.query('insert into public.matches values($1,$2,$2)', [match, viewer])
    await fixture.db.query(`insert into public.match_member_aliases values($1,$2,$3,'temporary','legacy',0)`, [match, viewer, fixture.users[0]])
    await fixture.db.query(`insert into public.match_member_aliases values($1,$2,$3,'temporary','legacy',1)`, [match, viewer, fixture.users[2]])
    const aliases = await fixture.db.query('select alias from public.match_member_aliases order by sort_order')
    assert.deepEqual(aliases.rows.map(row => row.alias), ['시나모롤', '시나모롤·2'])
  } finally { await fixture.db.close() }
})
