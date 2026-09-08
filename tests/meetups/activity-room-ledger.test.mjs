import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Embedded PostgreSQL contract fixture. This is not a live Supabase, PostgREST,
// multi-connection concurrency, or deployed-RLS test.
async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema quantum_private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table auth.users(id uuid primary key, deleted_at timestamptz, banned_until timestamptz);
    create table public.users(id uuid primary key references auth.users(id));
    create table public.friendships(
      user_id uuid not null,
      friend_user_id uuid not null,
      status text not null,
      primary key(user_id, friend_user_id)
    );
    create table quantum_private.community_member_profiles(
      user_id uuid primary key,
      school_scope text not null,
      community_gender text not null,
      display_name text not null
    );
    create table quantum_private.test_account_deletion_blocks(user_id uuid primary key);
    create function quantum_private.resolve_profile_readiness(p_user uuid)
      returns table(minimum_signup_complete boolean)
      language sql stable as $$
        select exists(select 1 from quantum_private.community_member_profiles where user_id=p_user)
      $$;
    create function quantum_private.account_deletion_blocks_access(p_user uuid)
      returns boolean language sql stable as $$
        select exists(select 1 from quantum_private.test_account_deletion_blocks where user_id=p_user)
      $$;
    create function quantum_private.meetup_gender_eligibility(p_user uuid,p_mode text)
      returns text language sql stable as $$
        select case
          when p_mode='all' then 'eligible'
          when p_mode='male_only' and community_gender='male' then 'eligible'
          when p_mode='female_only' and community_gender='female' then 'eligible'
          when community_gender not in ('male','female') then 'gender_required'
          else 'gender_restricted'
        end
        from quantum_private.community_member_profiles where user_id=p_user
      $$;
    create function quantum_private.tonight_invite_pair_is_blocked(a uuid,b uuid)
      returns boolean language sql stable as $$
        select exists(
          select 1 from public.friendships
          where status='blocked'
            and ((user_id=a and friend_user_id=b) or (user_id=b and friend_user_id=a))
        )
      $$;
    create function quantum_private.activity_meetup_alias(p_user uuid)
      returns text language sql stable as $$
        select display_name from quantum_private.community_member_profiles where user_id=p_user
      $$;
  `)

  await db.exec(await readFile(new URL(
    '../../supabase/migrations/20260907113358_automatic_activity_rooms.sql',
    import.meta.url,
  ), 'utf8'))
  await db.exec(await readFile(new URL(
    '../../supabase/migrations/20260907121222_activity_room_history.sql',
    import.meta.url,
  ), 'utf8'))

  const users = Array.from({ length: 9 }, () => randomUUID())
  for (let index = 0; index < users.length; index += 1) {
    await db.query('insert into auth.users(id) values($1)', [users[index]])
    await db.query('insert into public.users(id) values($1)', [users[index]])
    await db.query(
      'insert into quantum_private.community_member_profiles values($1,$2,$3,$4)',
      [users[index], index === 8 ? 'other_school' : 'pnu_self_selected', index % 2 ? 'male' : 'female', `별칭${index}`],
    )
  }

  async function as(user) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
  }
  async function rpc(name, args = [], params = []) {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(',')
    return (await db.query(`select public.${name}(${placeholders}) as value`, params)).rows[0].value
  }
  async function list(key = 'team-gaming', mode = 'all') {
    return rpc('list_activity_rooms', ['text', 'text'], [key, mode])
  }
  async function ensure(key = 'team-gaming', mode = 'all') {
    return rpc('ensure_activity_room_pool', ['text', 'text'], [key, mode])
  }
  async function join(roomId) {
    return rpc('join_activity_room', ['uuid'], [roomId])
  }
  async function leave(roomId) {
    return rpc('leave_activity_room', ['uuid'], [roomId])
  }
  async function history(roomId, beforeCreatedAt = null, beforeMessageId = null) {
    return (await db.query(`
      select public.get_activity_room_messages(
        $1::uuid,$2::timestamptz,$3::uuid
      ) as value
    `, [roomId, beforeCreatedAt, beforeMessageId])).rows[0].value
  }
  return { db, users, as, list, ensure, join, leave, history, rpc }
}

test('private room tables use RLS and expose only authenticated RPC execution', async () => {
  const fixture = await setup()
  try {
    const security = await fixture.db.query(`
      select c.relname,c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='quantum_private' and c.relkind='r' and c.relname like 'activity_room_%'
      order by c.relname
    `)
    assert.deepEqual(security.rows, [
      { relname: 'activity_room_members', relrowsecurity: true },
      { relname: 'activity_room_messages', relrowsecurity: true },
      { relname: 'activity_room_pools', relrowsecurity: true },
      { relname: 'activity_room_rooms', relrowsecurity: true },
    ])
    const grants = await fixture.db.query(`
      select
        has_function_privilege('authenticated','public.list_activity_rooms(text,text)','EXECUTE') as auth_list,
        has_function_privilege('anon','public.list_activity_rooms(text,text)','EXECUTE') as anon_list,
        has_function_privilege('authenticated','public.join_activity_room(uuid)','EXECUTE') as auth_join,
        has_function_privilege('anon','public.join_activity_room(uuid)','EXECUTE') as anon_join,
        has_function_privilege(
          'authenticated',
          'public.get_activity_room_messages(uuid,timestamp with time zone,uuid)',
          'EXECUTE'
        ) as auth_history,
        has_function_privilege(
          'anon',
          'public.get_activity_room_messages(uuid,timestamp with time zone,uuid)',
          'EXECUTE'
        ) as anon_history
    `)
    assert.deepEqual(grants.rows[0], {
      auth_list: true,
      anon_list: false,
      auth_join: true,
      anon_join: false,
      auth_history: true,
      anon_history: false,
    })
  } finally { await fixture.db.close() }
})

test('GET-style list is side-effect free and ensure creates one correctly sized first room', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    assert.deepEqual(await fixture.list(), {
      activity_key: 'team-gaming', gender_mode: 'all', capacity: 5, room_count: 0, rooms: [],
    })
    assert.equal((await fixture.db.query('select count(*)::int as count from quantum_private.activity_room_rooms')).rows[0].count, 0)
    const gaming = await fixture.ensure()
    assert.equal(gaming.room_count, 1)
    assert.equal(gaming.rooms[0].capacity, 5)
    assert.equal(gaming.rooms[0].status, 'recruiting')
    assert.equal(gaming.rooms[0].joinable, true)
    assert.equal((await fixture.ensure()).room_count, 1)
    const badminton = await fixture.ensure('evening-badminton', 'all')
    assert.equal(badminton.capacity, 4)
    assert.equal(badminton.rooms[0].capacity, 4)
  } finally { await fixture.db.close() }
})

test('the fifth gaming member fills room one and atomically leaves exactly one empty next room', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const first = await fixture.ensure()
    const firstRoom = first.rooms[0].id
    for (let index = 0; index < 5; index += 1) {
      await fixture.as(fixture.users[index])
      const joined = await fixture.join(firstRoom)
      assert.equal(joined.room_id, firstRoom)
      assert.equal(joined.member_count, index + 1)
    }
    await fixture.as(fixture.users[0])
    const lobby = await fixture.list()
    assert.equal(lobby.room_count, 2)
    assert.deepEqual(lobby.rooms.map(room => [room.room_number, room.member_count]), [[1, 5], [2, 0]])
    assert.deepEqual(lobby.rooms.map(room => room.status), ['full', 'recruiting'])
    assert.equal(lobby.rooms[0].joinable, false)
    assert.equal((await fixture.join(firstRoom)).reused, true)
    await fixture.as(fixture.users[5])
    const secondJoin = await fixture.join(lobby.rooms[1].id)
    assert.equal(secondJoin.room_id, lobby.rooms[1].id)
    assert.equal(secondJoin.member_count, 1)
    await fixture.as(fixture.users[0])
    await fixture.leave(firstRoom)
    await fixture.join(firstRoom)
    assert.equal((await fixture.list()).room_count, 2, 'a partially filled room is already the next recruiting room')
  } finally { await fixture.db.close() }
})

test('an eighth person refills room one without creating room three and can read pre-join promises', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const firstRoom = (await fixture.ensure()).rooms[0].id
    for (let index = 0; index < 5; index += 1) {
      await fixture.as(fixture.users[index])
      await fixture.join(firstRoom)
    }

    await fixture.as(fixture.users[0])
    const afterFull = await fixture.list()
    const secondRoom = afterFull.rooms.find(room => room.room_number === 2).id
    const firstPromise = await fixture.rpc(
      'send_activity_room_message',
      ['uuid', 'text', 'uuid'],
      [firstRoom, '금요일 7시에 정문 앞에서 만나요', randomUUID()],
    )
    await fixture.as(fixture.users[4])
    const leavingMemberPromise = await fixture.rpc(
      'send_activity_room_message',
      ['uuid', 'text', 'uuid'],
      [firstRoom, 'PC방 자리는 들어가서 같이 정해요', randomUUID()],
    )
    await fixture.db.query(`
      update quantum_private.activity_room_messages
      set created_at=case id
        when $1 then timestamptz '2026-09-07 00:00:00+00'
        when $2 then timestamptz '2026-09-07 00:00:01+00'
      end
      where id in ($1,$2)
    `, [firstPromise.id, leavingMemberPromise.id])
    await fixture.db.query(`
      insert into quantum_private.activity_room_messages(
        room_id,sender_user_id,idempotency_key,message,created_at
      )
      select $1,$2,gen_random_uuid(),'later-'||item::text,
        timestamptz '2026-09-07 00:01:00+00'+item*interval '1 second'
      from generate_series(1,100) item
    `, [firstRoom, fixture.users[0]])

    for (let index = 5; index <= 6; index += 1) {
      await fixture.as(fixture.users[index])
      await fixture.join(secondRoom)
    }
    await fixture.as(fixture.users[4])
    await fixture.leave(firstRoom)

    await fixture.as(fixture.users[0])
    const afterLeave = await fixture.list()
    assert.deepEqual(
      afterLeave.rooms.map(room => [room.room_number, room.member_count, room.status]),
      [[1, 4, 'recruiting'], [2, 2, 'recruiting']],
    )

    await fixture.as(fixture.users[7])
    await assert.rejects(() => fixture.history(firstRoom), /activity_room_membership_required/)
    assert.equal((await fixture.join(firstRoom)).room_id, firstRoom)

    const refilled = await fixture.list()
    assert.equal(refilled.room_count, 2)
    assert.deepEqual(
      refilled.rooms.map(room => [room.room_number, room.member_count, room.status]),
      [[1, 5, 'full'], [2, 2, 'recruiting']],
    )
    const recentHistory = await fixture.history(firstRoom)
    assert.equal(recentHistory.messages.length, 100)
    assert.equal(recentHistory.has_more, true)
    assert.ok(recentHistory.messages.every(message => message.message.startsWith('later-')))
    const history = await fixture.history(
      firstRoom,
      recentHistory.next_cursor.created_at,
      recentHistory.next_cursor.id,
    )
    assert.deepEqual(
      history.messages.map(message => message.message),
      ['금요일 7시에 정문 앞에서 만나요', 'PC방 자리는 들어가서 같이 정해요'],
    )
    assert.deepEqual(history.messages.map(message => message.sender_alias), ['별칭0', '별칭4'])

    await fixture.as(fixture.users[4])
    await assert.rejects(() => fixture.history(firstRoom), /activity_room_membership_required/)
    await fixture.as(fixture.users[8])
    await assert.rejects(() => fixture.history(firstRoom), /activity_room_not_found/)

    await fixture.db.query(
      'insert into quantum_private.test_account_deletion_blocks values($1)',
      [fixture.users[7]],
    )
    await fixture.as(fixture.users[7])
    await assert.rejects(() => fixture.history(firstRoom), /account_deletion_pending/)
  } finally { await fixture.db.close() }
})

test('ensure repairs a pool whose full room has lost its next recruiting room', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const firstRoom = (await fixture.ensure()).rooms[0].id
    for (let index = 0; index < 5; index += 1) {
      await fixture.as(fixture.users[index])
      await fixture.join(firstRoom)
    }
    await fixture.db.query(
      "update quantum_private.activity_room_rooms set status='retired' where room_number=2",
    )
    await fixture.as(fixture.users[0])
    const repaired = await fixture.ensure()
    assert.deepEqual(repaired.rooms.map(room => [room.room_number, room.status]), [[1, 'full'], [3, 'recruiting']])
  } finally { await fixture.db.close() }
})

test('school, gender, deletion, and pair-block boundaries fail closed without creating a safety cohort', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const roomId = (await fixture.ensure('team-gaming', 'female_only')).rooms[0].id
    await fixture.join(roomId)

    await fixture.as(fixture.users[1])
    await assert.rejects(() => fixture.join(roomId), /activity_room_gender_restricted/)

    await fixture.as(fixture.users[8])
    await assert.rejects(() => fixture.join(roomId), /activity_room_not_found/)

    await fixture.db.query(
      "insert into public.friendships values($1,$2,'blocked')",
      [fixture.users[0], fixture.users[2]],
    )
    await fixture.as(fixture.users[2])
    await assert.rejects(() => fixture.join(roomId), /blocked_pair/)
    const blockedLobby = await fixture.list('team-gaming', 'female_only')
    assert.equal(blockedLobby.room_count, 1)
    assert.equal(blockedLobby.rooms[0].joinable, false)

    await fixture.db.query('insert into quantum_private.test_account_deletion_blocks values($1)', [fixture.users[4]])
    await fixture.as(fixture.users[4])
    await assert.rejects(() => fixture.ensure(), /account_deletion_pending/)
  } finally { await fixture.db.close() }
})

test('current school membership is rechecked before counts, admission, and room disclosure', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const roomId = (await fixture.ensure()).rooms[0].id
    await fixture.join(roomId)
    await fixture.db.query(
      "update quantum_private.community_member_profiles set school_scope='other_school' where user_id=$1",
      [fixture.users[0]],
    )

    await fixture.as(fixture.users[1])
    assert.equal((await fixture.list()).rooms[0].member_count, 0)
    assert.equal((await fixture.join(roomId)).member_count, 1)

    await fixture.as(fixture.users[0])
    await assert.rejects(() => fixture.rpc('get_activity_room', ['uuid'], [roomId]), /activity_room_not_found/)
    await assert.rejects(() => fixture.history(roomId), /activity_room_not_found/)
  } finally { await fixture.db.close() }
})

test('a member whose current gender no longer matches cannot read or append chat', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const roomId = (await fixture.ensure('team-gaming', 'female_only')).rooms[0].id
    await fixture.join(roomId)
    await fixture.db.query(
      "update quantum_private.community_member_profiles set community_gender='male' where user_id=$1",
      [fixture.users[0]],
    )
    await assert.rejects(
      () => fixture.rpc('get_activity_room', ['uuid'], [roomId]),
      /activity_room_membership_required/,
    )
    await assert.rejects(() => fixture.history(roomId), /activity_room_membership_required/)
    await assert.rejects(
      () => fixture.rpc('send_activity_room_message', ['uuid', 'text', 'uuid'], [roomId, '더 쓸 수 없어요', randomUUID()]),
      /activity_room_membership_required/,
    )
  } finally { await fixture.db.close() }
})

test('membership immediately unlocks idempotent private chat and nonmembers cannot read it', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const roomId = (await fixture.ensure()).rooms[0].id
    await fixture.join(roomId)
    const key = randomUUID()
    const sent = await fixture.rpc(
      'send_activity_room_message',
      ['uuid', 'text', 'uuid'],
      [roomId, '오늘 시간부터 맞춰봐요', key],
    )
    assert.equal(sent.message, '오늘 시간부터 맞춰봐요')
    assert.equal(sent.is_me, true)
    assert.equal((await fixture.rpc('send_activity_room_message', ['uuid', 'text', 'uuid'], [roomId, sent.message, key])).reused, true)
    const detail = await fixture.rpc('get_activity_room', ['uuid'], [roomId])
    assert.equal(detail.joined, true)
    assert.equal(detail.members.length, 1)
    assert.equal(detail.messages.length, 1)

    await fixture.leave(roomId)
    await assert.rejects(
      () => fixture.rpc('send_activity_room_message', ['uuid', 'text', 'uuid'], [roomId, sent.message, key]),
      /activity_room_membership_required/,
    )

    await fixture.as(fixture.users[1])
    await assert.rejects(() => fixture.rpc('get_activity_room', ['uuid'], [roomId]), /activity_room_membership_required/)
    await assert.rejects(
      () => fixture.rpc('send_activity_room_message', ['uuid', 'text', 'uuid'], [roomId, '안녕', randomUUID()]),
      /activity_room_membership_required/,
    )
  } finally { await fixture.db.close() }
})

test('room detail returns only the latest 100 messages in chronological display order', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const roomId = (await fixture.ensure()).rooms[0].id
    await fixture.join(roomId)
    await fixture.db.query(`
      insert into quantum_private.activity_room_messages(
        room_id,sender_user_id,idempotency_key,message,created_at
      )
      select $1,$2,gen_random_uuid(),'message-'||item::text,
        timestamptz '2026-09-07 00:00:00+00'+item*interval '1 second'
      from generate_series(1,105) item
    `, [roomId, fixture.users[0]])
    const detail = await fixture.rpc('get_activity_room', ['uuid'], [roomId])
    assert.equal(detail.messages.length, 100)
    assert.equal(detail.messages[0].message, 'message-6')
    assert.equal(detail.messages.at(-1).message, 'message-105')
  } finally { await fixture.db.close() }
})

test('message history pages backward across identical timestamps without gaps or duplicates', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const roomId = (await fixture.ensure()).rooms[0].id
    await fixture.join(roomId)
    const sameTimestamp = '2026-09-07 12:00:00.123456+00'
    await fixture.db.query(`
      insert into quantum_private.activity_room_messages(
        id,room_id,sender_user_id,idempotency_key,message,created_at
      )
      select
        ('00000000-0000-4000-8000-'||pg_catalog.lpad(item::text,12,'0'))::uuid,
        $1,$2,gen_random_uuid(),'promise-'||pg_catalog.lpad(item::text,3,'0'),$3::timestamptz
      from generate_series(1,201) item
    `, [roomId, fixture.users[0], sameTimestamp])

    const pages = []
    let cursor = null
    do {
      const page = await fixture.history(roomId, cursor?.created_at ?? null, cursor?.id ?? null)
      assert.ok(page.messages.length <= 100)
      pages.push(page)
      cursor = page.next_cursor
    } while (cursor)

    assert.deepEqual(pages.map(page => [page.messages.length, page.has_more]), [
      [100, true],
      [100, true],
      [1, false],
    ])
    for (const page of pages) {
      assert.deepEqual(
        page.messages.map(message => message.id),
        [...page.messages].map(message => message.id).sort(),
      )
    }
    const fetchedMessages = pages.flatMap(page => page.messages)
    assert.equal(fetchedMessages.length, 201)
    assert.equal(new Set(fetchedMessages.map(message => message.id)).size, 201)
    const chronologicalMessages = [...pages].reverse().flatMap(page => page.messages)
    assert.deepEqual(
      chronologicalMessages.map(message => message.message),
      Array.from({ length: 201 }, (_, index) => `promise-${String(index + 1).padStart(3, '0')}`),
    )
    assert.match(pages[0].next_cursor.created_at, /\.123456/)
    assert.equal(pages[0].next_cursor.id, pages[0].messages[0].id)
    assert.equal(pages[2].next_cursor, null)
  } finally { await fixture.db.close() }
})

test('message history rejects partial cursors, wrong rooms, nonmembers, former members, blocks, and unauthenticated callers', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const roomId = (await fixture.ensure()).rooms[0].id
    await fixture.join(roomId)
    await assert.rejects(
      () => fixture.history(roomId, '2026-09-07T12:00:00.123456Z', null),
      /invalid_activity_room_cursor/,
    )
    await assert.rejects(
      () => fixture.history(roomId, null, randomUUID()),
      /invalid_activity_room_cursor/,
    )
    await assert.rejects(() => fixture.history(randomUUID()), /activity_room_not_found/)

    const otherRoom = (await fixture.ensure('evening-badminton', 'all')).rooms[0].id
    await fixture.join(otherRoom)
    const otherMessage = await fixture.rpc(
      'send_activity_room_message',
      ['uuid', 'text', 'uuid'],
      [otherRoom, '다른 방의 커서예요', randomUUID()],
    )
    await assert.rejects(
      () => fixture.history(roomId, otherMessage.created_at, otherMessage.id),
      /invalid_activity_room_cursor/,
    )

    await fixture.as(fixture.users[1])
    await assert.rejects(() => fixture.history(roomId), /activity_room_membership_required/)
    await fixture.join(roomId)
    await fixture.leave(roomId)
    await assert.rejects(() => fixture.history(roomId), /activity_room_membership_required/)

    await fixture.db.query(
      "insert into public.friendships values($1,$2,'blocked')",
      [fixture.users[0], fixture.users[2]],
    )
    await fixture.as(fixture.users[2])
    await assert.rejects(() => fixture.join(roomId), /blocked_pair/)

    await fixture.as(fixture.users[3])
    await fixture.join(roomId)
    await fixture.db.query(
      "insert into public.friendships values($1,$2,'blocked')",
      [fixture.users[0], fixture.users[3]],
    )
    await assert.rejects(() => fixture.history(roomId), /blocked_pair/)

    await fixture.db.query("select set_config('request.jwt.claim.sub','',false)")
    await assert.rejects(() => fixture.history(roomId), /not_authenticated/)
  } finally { await fixture.db.close() }
})

test('new messages are limited to thirty per minute across activity rooms', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const roomId = (await fixture.ensure()).rooms[0].id
    await fixture.join(roomId)
    await fixture.db.query(`
      insert into quantum_private.activity_room_messages(
        room_id,sender_user_id,idempotency_key,message,created_at
      )
      select $1,$2,gen_random_uuid(),'recent-'||item::text,pg_catalog.clock_timestamp()
      from generate_series(1,30) item
    `, [roomId, fixture.users[0]])
    await assert.rejects(
      () => fixture.rpc('send_activity_room_message', ['uuid', 'text', 'uuid'], [roomId, '도배를 막아요', randomUUID()]),
      /activity_room_rate_limited/,
    )
  } finally { await fixture.db.close() }
})

test('leaving a once-full room retires excess empties and keeps one lobby room', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const roomId = (await fixture.ensure()).rooms[0].id
    for (let index = 0; index < 5; index += 1) {
      await fixture.as(fixture.users[index])
      await fixture.join(roomId)
    }
    for (let index = 0; index < 5; index += 1) {
      await fixture.as(fixture.users[index])
      assert.equal((await fixture.leave(roomId)).joined, false)
    }
    await fixture.as(fixture.users[0])
    const lobby = await fixture.list()
    assert.equal(lobby.room_count, 1)
    assert.deepEqual(lobby.rooms.map(room => room.member_count), [0])
    assert.equal((await fixture.db.query("select count(*)::int as count from quantum_private.activity_room_rooms where status='retired'")).rows[0].count, 1)
  } finally { await fixture.db.close() }
})
