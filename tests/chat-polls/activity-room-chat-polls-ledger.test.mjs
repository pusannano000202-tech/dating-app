import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

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
    create table public.friend_requests(
      id uuid primary key, sender_user_id uuid not null, receiver_user_id uuid,
      status text not null
    );
    create table public.friendships(
      user_id uuid not null, friend_user_id uuid not null, status text not null,
      created_from_request_id uuid references public.friend_requests(id),
      primary key(user_id, friend_user_id)
    );
    create table public.activity_meetups(
      id uuid primary key, status text not null, host_user_id uuid not null
    );
    create table public.activity_meetup_members(
      meetup_id uuid not null references public.activity_meetups(id),
      user_id uuid not null, role text not null, status text not null,
      primary key(meetup_id,user_id)
    );
    create table public.department_challenges(id uuid primary key,status text not null);
    create table public.department_challenge_roster(
      challenge_id uuid not null references public.department_challenges(id),
      user_id uuid not null,status text not null,
      primary key(challenge_id,user_id)
    );
    create table quantum_private.community_member_profiles(
      user_id uuid primary key, school_scope text not null,
      community_gender text not null, display_name text not null
    );
    create table quantum_private.test_account_deletion_blocks(user_id uuid primary key);
    create function quantum_private.resolve_profile_readiness(p_user uuid)
      returns table(minimum_signup_complete boolean) language sql stable as $$
        select exists(select 1 from quantum_private.community_member_profiles where user_id=p_user)
      $$;
    create function quantum_private.account_deletion_blocks_access(p_user uuid)
      returns boolean language sql stable as $$
        select exists(select 1 from quantum_private.test_account_deletion_blocks where user_id=p_user)
      $$;
    create function quantum_private.meetup_gender_eligibility(p_user uuid,p_mode text)
      returns text language sql stable as $$
        select case when p_mode='all' then 'eligible'
          when p_mode='male_only' and community_gender='male' then 'eligible'
          when p_mode='female_only' and community_gender='female' then 'eligible'
          when community_gender not in ('male','female') then 'gender_required'
          else 'gender_restricted' end
        from quantum_private.community_member_profiles where user_id=p_user
      $$;
    create function quantum_private.tonight_invite_pair_is_blocked(a uuid,b uuid)
      returns boolean language sql stable as $$
        select exists(select 1 from public.friendships where status='blocked'
          and ((user_id=a and friend_user_id=b) or (user_id=b and friend_user_id=a)))
      $$;
    create function quantum_private.friend_pair_lock_key(a uuid,b uuid)
      returns bigint language sql immutable as $$
        select hashtextextended(least(a,b)::text||':'||greatest(a,b)::text,0)
      $$;
    create function quantum_private.activity_meetup_alias(p_user uuid)
      returns text language sql stable as $$
        select display_name from quantum_private.community_member_profiles where user_id=p_user
      $$;
    create function quantum_private.is_active_accepted_friend_pair(a uuid,b uuid)
      returns boolean language sql stable as $$
        select exists(
          select 1 from public.friendships friendship
          join public.friend_requests request on request.id=friendship.created_from_request_id
          where friendship.user_id=least(a,b) and friendship.friend_user_id=greatest(a,b)
            and friendship.status='active' and request.status='accepted'
            and least(request.sender_user_id,request.receiver_user_id)=friendship.user_id
            and greatest(request.sender_user_id,request.receiver_user_id)=friendship.friend_user_id
        )
      $$;
  `)
  await db.exec(await readFile(new URL('../../supabase/migrations/20260907113358_automatic_activity_rooms.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20260907121222_activity_room_history.sql', import.meta.url), 'utf8'))
  const migrationNames = await readdir(new URL('../../supabase/migrations/', import.meta.url))
  const migration = migrationNames.find(name => /_activity_room_chat_polls\.sql$/.test(name))
  assert.ok(migration, 'activity room chat polls migration must exist')
  await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'))

  const users = Array.from({ length: 5 }, () => randomUUID())
  for (let index = 0; index < users.length; index += 1) {
    await db.query('insert into auth.users(id) values($1)', [users[index]])
    await db.query('insert into public.users(id) values($1)', [users[index]])
    await db.query('insert into quantum_private.community_member_profiles values($1,$2,$3,$4)', [
      users[index], index === 4 ? 'other_school' : 'pnu_self_selected', index % 2 ? 'male' : 'female', `별칭${index}`,
    ])
  }
  async function as(user) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]) }
  async function rpc(name, params = [], casts = params.map(() => 'uuid')) {
    const args = casts.map((cast, index) => `$${index + 1}::${cast}`).join(',')
    return (await db.query(`select public.${name}(${args}) as value`, params)).rows[0].value
  }
  await as(users[0])
  const lobby = await rpc('ensure_activity_room_pool', ['team-gaming', 'all'], ['text', 'text'])
  const roomId = lobby.rooms[0].id
  for (const user of users.slice(0, 3)) { await as(user); await rpc('join_activity_room', [roomId]) }
  return { db, users, roomId, as, rpc }
}

async function createPoll(fixture, overrides = {}) {
  const input = {
    purpose: 'place', title: '어디서 만날까요?', mode: 'single',
    options: ['정문', '북문'], key: randomUUID(), ...overrides,
  }
  return fixture.rpc('create_activity_room_poll', [
    fixture.roomId, input.purpose, input.title, input.mode, input.options, input.key,
  ], ['uuid', 'text', 'text', 'text', 'text[]', 'uuid'])
}

test('private poll ledgers are RLS-enabled and only authenticated RPCs are callable', async () => {
  const fixture = await setup()
  try {
    const security = await fixture.db.query(`
      select c.relname,c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='quantum_private' and c.relkind='r' and c.relname like 'activity_room_poll%'
      order by c.relname
    `)
    assert.deepEqual(security.rows.map(row => row.relname), [
      'activity_room_poll_agreement_confirmations', 'activity_room_poll_agreements',
      'activity_room_poll_ballot_choices', 'activity_room_poll_ballots',
      'activity_room_poll_options', 'activity_room_polls',
    ])
    assert.ok(security.rows.every(row => row.relrowsecurity))
    const grants = (await fixture.db.query(`select
      has_function_privilege('authenticated','public.get_activity_room_polls(uuid)','execute') auth_get,
      has_function_privilege('anon','public.get_activity_room_polls(uuid)','execute') anon_get,
      has_function_privilege('authenticated','public.create_activity_room_poll(uuid,text,text,text,text[],uuid)','execute') auth_create,
      has_function_privilege('anon','public.create_activity_room_poll(uuid,text,text,text,text[],uuid)','execute') anon_create
    `)).rows[0]
    assert.deepEqual(grants, { auth_get: true, anon_get: false, auth_create: true, anon_create: false })
  } finally { await fixture.db.close() }
})

test('poll mutators lock domain membership, account, and block state before the authorization recheck', async () => {
  const fixture = await setup()
  try {
    const lockDefinition = (await fixture.db.query(`
      select pg_get_functiondef('quantum_private.lock_chat_poll_room(text,uuid,uuid,boolean)'::regprocedure) as definition
    `)).rows[0].definition.toLowerCase()
    assert.match(lockDefinition, /chat-poll-room-write/)
    assert.match(lockDefinition, /account-delete/)
    assert.match(lockDefinition, /activity_room_rooms[\s\S]+for share/)
    assert.match(lockDefinition, /activity_meetup_members[\s\S]+for share/)
    assert.match(lockDefinition, /department_challenge_roster[\s\S]+for share/)
    assert.match(lockDefinition, /friend_pair_lock_key/)
    assert.match(lockDefinition, /array_agg\(candidate\.user_id order by candidate\.user_id\)/)
    assert.match(lockDefinition, /v_current_members is distinct from v_locked_members/)
    assert.ok(
      lockDefinition.indexOf('resolve_chat_poll_room') < lockDefinition.indexOf('chat-poll-room-write'),
      'nonmembers and arbitrary friend targets are rejected before any user-derived lock',
    )
    assert.ok(
      lockDefinition.indexOf("'account-delete|'||v_member::text") < lockDefinition.indexOf("if p_room_kind='activity_room'"),
      'all account locks use the same sorted member order before domain rows',
    )
    assert.doesNotMatch(
      lockDefinition,
      /'account-delete\|'\|\|p_actor::text/,
      'the actor must not be taken ahead of the globally sorted member locks',
    )
    assert.ok(
      lockDefinition.lastIndexOf('resolve_chat_poll_room') > lockDefinition.lastIndexOf('for share'),
      'authorization is rechecked only after all canonical rows are locked',
    )

    const leafMutators = [
      'public.create_activity_room_poll(uuid,text,text,text,text[],uuid)',
      'public.vote_activity_room_poll(uuid,uuid,uuid[])',
      'public.close_activity_room_poll(uuid,uuid,integer)',
      'public.cancel_activity_room_poll(uuid,uuid,integer)',
      'public.propose_activity_room_poll_agreement(uuid,uuid,uuid,integer,uuid,text)',
      'public.confirm_activity_room_poll_agreement(uuid,uuid,uuid,integer)',
      'public.create_chat_room_poll(text,uuid,text,text,text,text[],uuid)',
      'public.vote_chat_room_poll(text,uuid,uuid,uuid[])',
      'quantum_private.change_chat_poll_status(uuid,text,uuid,uuid,integer,text)',
      'public.propose_chat_room_poll_agreement(text,uuid,uuid,uuid,integer,uuid,text)',
      'public.confirm_chat_room_poll_agreement(text,uuid,uuid,uuid,integer)',
    ]
    for (const signature of leafMutators) {
      const definition = (await fixture.db.query(
        'select pg_get_functiondef($1::regprocedure) as definition', [signature],
      )).rows[0].definition
      assert.match(definition, /lock_chat_poll_room/, `${signature} must use the locked authorization boundary`)
    }

    for (const signature of [
      'public.create_activity_room_poll(uuid,text,text,text,text[],uuid)',
      'public.create_chat_room_poll(text,uuid,text,text,text,text[],uuid)',
    ]) {
      const definition = (await fixture.db.query(
        'select pg_get_functiondef($1::regprocedure) as definition', [signature],
      )).rows[0].definition
      const rateLock = definition.indexOf('chat-poll-create-rate|')
      assert.ok(rateLock >= 0, `${signature} must serialize its per-actor hourly rate ledger`)
      assert.ok(rateLock < definition.indexOf('activity_poll_rate_limited'), 'rate lock precedes count and insert')
    }
  } finally { await fixture.db.close() }
})

test('current room members create and read authoritative counts without voter identity leakage', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const created = await createPoll(fixture)
    assert.equal(created.title, '어디서 만날까요?')
    assert.equal(created.creator_alias, '별칭0')
    assert.deepEqual(created.options.map(option => option.label), ['정문', '북문'])
    assert.ok(created.options.every(option => !('user_id' in option)))

    await fixture.as(fixture.users[4])
    await assert.rejects(() => fixture.rpc('get_activity_room_polls', [fixture.roomId]), /activity_poll_forbidden/)
    await assert.rejects(() => createPoll(fixture), /activity_poll_forbidden/)

    await fixture.as(fixture.users[1])
    const board = await fixture.rpc('get_activity_room_polls', [fixture.roomId])
    assert.equal(board.polls[0].creator_alias, '별칭0')
    assert.equal(board.polls[0].is_creator, false)
    assert.deepEqual(board.polls[0].options.map(option => option.vote_count), [0, 0])

    await fixture.db.query("update quantum_private.community_member_profiles set display_name='바뀐 이름' where user_id=$1", [fixture.users[0]])
    await fixture.as(fixture.users[0])
    await fixture.rpc('leave_activity_room', [fixture.roomId])
    await fixture.as(fixture.users[1])
    const afterCreatorLeft = await fixture.rpc('get_activity_room_polls', [fixture.roomId])
    assert.equal(afterCreatorLeft.polls[0].creator_alias, '별칭0', 'creator alias is frozen when the poll is published')
  } finally { await fixture.db.close() }
})

test('activity and meetup poll creators reuse the later daily-identity membership snapshot', async () => {
  const fixture = await setup()
  try {
    await fixture.db.exec(`
      alter table quantum_private.activity_room_members add column identity_alias_snapshot text;
      alter table public.activity_meetup_members add column identity_alias_snapshot text;
    `)
    await fixture.db.query(
      "update quantum_private.activity_room_members set identity_alias_snapshot='오늘여우' where room_id=$1 and user_id=$2",
      [fixture.roomId, fixture.users[0]],
    )
    await fixture.as(fixture.users[0])
    assert.equal((await createPoll(fixture, { title: '오늘 별칭 확인' })).creator_alias, '오늘여우')

    const meetupId = randomUUID()
    await fixture.db.query("insert into public.activity_meetups values($1,'open',$2)", [meetupId, fixture.users[0]])
    await fixture.db.query(
      "insert into public.activity_meetup_members(meetup_id,user_id,role,status,identity_alias_snapshot) values($1,$2,'host','joined','오늘고양이')",
      [meetupId, fixture.users[0]],
    )
    const meetupPoll = await fixture.rpc('create_chat_room_poll', [
      'meetup', meetupId, 'schedule', '정기 모임 일정', 'single', ['화요일', '수요일'], randomUUID(),
    ], ['text', 'uuid', 'text', 'text', 'text', 'text[]', 'uuid'])
    assert.equal(meetupPoll.creator_alias, '오늘고양이')
  } finally { await fixture.db.close() }
})

test('single and multiple ballots replace atomically while closed, left, and blocked writers are denied', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const poll = await createPoll(fixture)
    const [first, second] = poll.options.map(option => option.id)
    await fixture.rpc('vote_activity_room_poll', [fixture.roomId, poll.id, [first]], ['uuid', 'uuid', 'uuid[]'])
    let replaced = await fixture.rpc('vote_activity_room_poll', [fixture.roomId, poll.id, [second]], ['uuid', 'uuid', 'uuid[]'])
    assert.deepEqual(replaced.options.map(option => option.vote_count), [0, 1])
    assert.deepEqual(replaced.options.filter(option => option.selected_by_me).map(option => option.id), [second])

    await fixture.as(fixture.users[1])
    replaced = await fixture.rpc('vote_activity_room_poll', [fixture.roomId, poll.id, [second]], ['uuid', 'uuid', 'uuid[]'])
    assert.deepEqual(replaced.options.map(option => option.vote_count), [0, 2])
    await assert.rejects(
      () => fixture.rpc('vote_activity_room_poll', [fixture.roomId, poll.id, [first, second]], ['uuid', 'uuid', 'uuid[]']),
      /activity_poll_single_choice_required/,
    )
    await assert.rejects(
      () => fixture.rpc('close_activity_room_poll', [fixture.roomId, poll.id, poll.revision], ['uuid', 'uuid', 'integer']),
      /activity_poll_creator_required/,
    )

    await fixture.as(fixture.users[2])
    await fixture.rpc('leave_activity_room', [fixture.roomId])
    await assert.rejects(
      () => fixture.rpc('vote_activity_room_poll', [fixture.roomId, poll.id, [first]], ['uuid', 'uuid', 'uuid[]']),
      /activity_poll_forbidden/,
    )

    await fixture.as(fixture.users[0])
    await fixture.db.query("insert into public.friendships(user_id,friend_user_id,status) values($1,$2,'blocked')", [fixture.users[0], fixture.users[1]])
    await assert.rejects(() => fixture.rpc('get_activity_room_polls', [fixture.roomId]), /activity_poll_forbidden/)
    await fixture.db.query('delete from public.friendships')
    const closed = await fixture.rpc('close_activity_room_poll', [fixture.roomId, poll.id, poll.revision], ['uuid', 'uuid', 'integer'])
    assert.equal(closed.status, 'closed')
    assert.equal(closed.revision, poll.revision + 1)
    await assert.rejects(
      () => fixture.rpc('vote_activity_room_poll', [fixture.roomId, poll.id, [first]], ['uuid', 'uuid', 'uuid[]']),
      /activity_poll_not_open/,
    )
  } finally { await fixture.db.close() }
})

test('multiple-choice ballots permit distinct options and poll creation retry is idempotent', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const key = randomUUID()
    const poll = await createPoll(fixture, { mode: 'multiple', key })
    const retried = await createPoll(fixture, { mode: 'multiple', key })
    assert.equal(retried.id, poll.id)
    const voted = await fixture.rpc('vote_activity_room_poll', [fixture.roomId, poll.id, poll.options.map(option => option.id)], ['uuid', 'uuid', 'uuid[]'])
    assert.deepEqual(voted.options.map(option => option.vote_count), [1, 1])
    assert.equal(voted.ballot_count, 1)
  } finally { await fixture.db.close() }
})

test('agreement promotion rejects no-response and tied polls, then confirms one explicit immutable version', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[2])
    await fixture.rpc('leave_activity_room', [fixture.roomId])
    await fixture.as(fixture.users[0])
    const empty = await createPoll(fixture, { title: '응답 없음' })
    const emptyClosed = await fixture.rpc('close_activity_room_poll', [fixture.roomId, empty.id, empty.revision], ['uuid', 'uuid', 'integer'])
    await assert.rejects(() => fixture.rpc('propose_activity_room_poll_agreement', [
      fixture.roomId, empty.id, empty.options[0].id, emptyClosed.revision, randomUUID(), '정문에서 만나는 제안',
    ], ['uuid', 'uuid', 'uuid', 'integer', 'uuid', 'text']), /activity_poll_no_response/)

    const tied = await createPoll(fixture, { title: '동률 투표' })
    await fixture.rpc('vote_activity_room_poll', [fixture.roomId, tied.id, [tied.options[0].id]], ['uuid', 'uuid', 'uuid[]'])
    await fixture.as(fixture.users[1])
    await fixture.rpc('vote_activity_room_poll', [fixture.roomId, tied.id, [tied.options[1].id]], ['uuid', 'uuid', 'uuid[]'])
    await fixture.as(fixture.users[0])
    const tiedClosed = await fixture.rpc('close_activity_room_poll', [fixture.roomId, tied.id, tied.revision], ['uuid', 'uuid', 'integer'])
    await assert.rejects(() => fixture.rpc('propose_activity_room_poll_agreement', [
      fixture.roomId, tied.id, tied.options[0].id, tiedClosed.revision, randomUUID(), '동률을 확정하지 않음',
    ], ['uuid', 'uuid', 'uuid', 'integer', 'uuid', 'text']), /activity_poll_tied/)

    const poll = await createPoll(fixture, { title: '최종 장소' })
    await fixture.rpc('vote_activity_room_poll', [fixture.roomId, poll.id, [poll.options[0].id]], ['uuid', 'uuid', 'uuid[]'])
    await fixture.as(fixture.users[1])
    await fixture.rpc('vote_activity_room_poll', [fixture.roomId, poll.id, [poll.options[0].id]], ['uuid', 'uuid', 'uuid[]'])
    await fixture.as(fixture.users[0])
    const closed = await fixture.rpc('close_activity_room_poll', [fixture.roomId, poll.id, poll.revision], ['uuid', 'uuid', 'integer'])
    const agreement = await fixture.rpc('propose_activity_room_poll_agreement', [
      fixture.roomId, poll.id, poll.options[0].id, closed.revision, randomUUID(), '정문에서 만나는 제안',
    ], ['uuid', 'uuid', 'uuid', 'integer', 'uuid', 'text'])
    assert.equal(agreement.status, 'proposal')
    assert.equal(agreement.version, 1)
    assert.equal(agreement.confirmation_count, 0)
    assert.equal(agreement.required_count, 2, 'left members are not in the agreement snapshot')

    let state = await fixture.rpc('confirm_activity_room_poll_agreement', [fixture.roomId, poll.id, agreement.id, 1], ['uuid', 'uuid', 'uuid', 'integer'])
    assert.equal(state.status, 'proposal')
    assert.equal(state.confirmation_count, 1)
    await fixture.as(fixture.users[1])
    state = await fixture.rpc('confirm_activity_room_poll_agreement', [fixture.roomId, poll.id, agreement.id, 1], ['uuid', 'uuid', 'uuid', 'integer'])
    assert.equal(state.status, 'confirmed')
    assert.equal(state.confirmation_count, 2)
    assert.ok(state.confirmed_at)
  } finally { await fixture.db.close() }
})

test('the current agreement poll remains in the bounded board after 31 newer polls for activity and generic rooms', async () => {
  const fixture = await setup()
  try {
    async function addNewerPolls(kind, roomId, prefix) {
      await fixture.db.query(`
        insert into quantum_private.activity_room_polls(
          id,room_kind,room_id,creator_user_id,creator_alias_snapshot,
          purpose,title,selection_mode,idempotency_key,created_at
        )
        select gen_random_uuid(),$1,$2,$3,'별칭0','general',$4||series::text,
          'single',gen_random_uuid(),clock_timestamp()+series*interval '1 second'
        from generate_series(1,31) series
      `, [kind, roomId, fixture.users[4], prefix])
      await fixture.db.query(`
        insert into quantum_private.activity_room_poll_options(poll_id,label,position)
        select poll.id,choice.label,choice.position
        from quantum_private.activity_room_polls poll
        cross join (values('A',0::smallint),('B',1::smallint)) choice(label,position)
        where poll.room_kind=$1 and poll.room_id=$2 and poll.title like $3||'%'
      `, [kind, roomId, prefix])
    }

    await fixture.as(fixture.users[0])
    const activityPoll = await createPoll(fixture, { title: '오래된 활동방 합의' })
    await fixture.rpc('vote_activity_room_poll', [
      fixture.roomId, activityPoll.id, [activityPoll.options[0].id],
    ], ['uuid', 'uuid', 'uuid[]'])
    const closedActivity = await fixture.rpc('close_activity_room_poll', [
      fixture.roomId, activityPoll.id, activityPoll.revision,
    ], ['uuid', 'uuid', 'integer'])
    await fixture.rpc('propose_activity_room_poll_agreement', [
      fixture.roomId, activityPoll.id, activityPoll.options[0].id,
      closedActivity.revision, randomUUID(), '오래된 활동방 합의 제안',
    ], ['uuid', 'uuid', 'uuid', 'integer', 'uuid', 'text'])
    await addNewerPolls('activity_room', fixture.roomId, '활동방 최신 투표 ')
    const activityBoard = await fixture.rpc('get_activity_room_polls', [fixture.roomId])
    assert.equal(activityBoard.polls.length, 30)
    assert.equal(activityBoard.polls[0].id, activityPoll.id)
    assert.equal(activityBoard.polls[0].agreement.status, 'proposal')

    const meetupId = randomUUID()
    await fixture.db.query("insert into public.activity_meetups values($1,'open',$2)", [meetupId, fixture.users[0]])
    for (const [index, role] of [[0, 'host'], [1, 'member']]) {
      await fixture.db.query("insert into public.activity_meetup_members values($1,$2,$3,'joined')", [meetupId, fixture.users[index], role])
    }
    const meetupPoll = await fixture.rpc('create_chat_room_poll', [
      'meetup', meetupId, 'schedule', '오래된 일반모임 합의', 'single', ['오후 2시', '오후 4시'], randomUUID(),
    ], ['text', 'uuid', 'text', 'text', 'text', 'text[]', 'uuid'])
    await fixture.rpc('vote_chat_room_poll', [
      'meetup', meetupId, meetupPoll.id, [meetupPoll.options[0].id],
    ], ['text', 'uuid', 'uuid', 'uuid[]'])
    const closedMeetup = await fixture.rpc('close_chat_room_poll', [
      'meetup', meetupId, meetupPoll.id, meetupPoll.revision,
    ], ['text', 'uuid', 'uuid', 'integer'])
    await fixture.rpc('propose_chat_room_poll_agreement', [
      'meetup', meetupId, meetupPoll.id, meetupPoll.options[0].id,
      closedMeetup.revision, randomUUID(), '오래된 일반모임 합의 제안',
    ], ['text', 'uuid', 'uuid', 'uuid', 'integer', 'uuid', 'text'])
    await addNewerPolls('meetup', meetupId, '일반모임 최신 투표 ')
    const meetupBoard = await fixture.rpc('get_chat_room_polls', ['meetup', meetupId], ['text', 'uuid'])
    assert.equal(meetupBoard.polls.length, 30)
    assert.equal(meetupBoard.polls[0].id, meetupPoll.id)
    assert.equal(meetupBoard.polls[0].agreement.status, 'proposal')
  } finally { await fixture.db.close() }
})

test('room-kind adapters authorize joined meetup and roster members and share one canonical accepted-friend poll', async () => {
  const fixture = await setup()
  try {
    const meetupId = randomUUID(), challengeId = randomUUID(), requestId = randomUUID()
    await fixture.db.query("insert into public.activity_meetups values($1,'open',$2)", [meetupId, fixture.users[0]])
    for (const [index, role] of [[0, 'host'], [1, 'member']]) {
      await fixture.db.query("insert into public.activity_meetup_members values($1,$2,$3,'joined')", [meetupId, fixture.users[index], role])
    }
    await fixture.db.query("insert into public.department_challenges values($1,'recruiting')", [challengeId])
    for (const index of [0, 1]) await fixture.db.query("insert into public.department_challenge_roster values($1,$2,'accepted')", [challengeId, fixture.users[index]])
    await fixture.db.query("insert into public.friend_requests values($1,$2,$3,'accepted')", [requestId, fixture.users[0], fixture.users[1]])
    await fixture.db.query("insert into public.friendships values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),'active',$3)", [fixture.users[0], fixture.users[1], requestId])

    await fixture.as(fixture.users[0])
    const meetupPoll = await fixture.rpc('create_chat_room_poll', [
      'meetup', meetupId, 'schedule', '일반 모임 시간', 'single', ['오후 2시', '오후 4시'], randomUUID(),
    ], ['text', 'uuid', 'text', 'text', 'text', 'text[]', 'uuid'])
    const challengePoll = await fixture.rpc('create_chat_room_poll', [
      'department_challenge', challengeId, 'role', '학과 팀 역할', 'multiple', ['진행', '장비'], randomUUID(),
    ], ['text', 'uuid', 'text', 'text', 'text', 'text[]', 'uuid'])
    const friendPoll = await fixture.rpc('create_chat_room_poll', [
      'friend', fixture.users[1], 'place', '어디서 볼까요?', 'single', ['정문', '북문'], randomUUID(),
    ], ['text', 'uuid', 'text', 'text', 'text', 'text[]', 'uuid'])
    assert.equal(meetupPoll.creator_alias, '별칭0')
    assert.equal(challengePoll.creator_alias, '별칭0')

    await fixture.db.query("update quantum_private.community_member_profiles set display_name='바뀐 이름' where user_id=$1", [fixture.users[0]])
    await fixture.as(fixture.users[1])
    const friendBoard = await fixture.rpc('get_chat_room_polls', ['friend', fixture.users[0]], ['text', 'uuid'])
    assert.equal(friendBoard.polls[0].id, friendPoll.id, 'both accepted friends resolve the same canonical poll room')
    assert.equal(friendBoard.polls[0].creator_alias, '별칭0', 'poll history keeps the authorized alias snapshot from creation')
    const friendVoted = await fixture.rpc('vote_chat_room_poll', [
      'friend', fixture.users[0], friendPoll.id, [friendPoll.options[0].id],
    ], ['text', 'uuid', 'uuid', 'uuid[]'])
    assert.equal(friendVoted.options[0].vote_count, 1)
    assert.equal((await fixture.rpc('get_chat_room_polls', ['meetup', meetupId], ['text', 'uuid'])).polls[0].id, meetupPoll.id)
    assert.equal((await fixture.rpc('get_chat_room_polls', ['department_challenge', challengeId], ['text', 'uuid'])).polls[0].id, challengePoll.id)

    await fixture.as(fixture.users[0])
    const closedFriend = await fixture.rpc('close_chat_room_poll', [
      'friend', fixture.users[1], friendPoll.id, friendPoll.revision,
    ], ['text', 'uuid', 'uuid', 'integer'])
    const friendAgreement = await fixture.rpc('propose_chat_room_poll_agreement', [
      'friend', fixture.users[1], friendPoll.id, friendPoll.options[0].id,
      closedFriend.revision, randomUUID(), '정문에서 만나자는 제안',
    ], ['text', 'uuid', 'uuid', 'uuid', 'integer', 'uuid', 'text'])
    await fixture.rpc('confirm_chat_room_poll_agreement', [
      'friend', fixture.users[1], friendPoll.id, friendAgreement.id, friendAgreement.version,
    ], ['text', 'uuid', 'uuid', 'uuid', 'integer'])
    await fixture.as(fixture.users[1])
    const confirmedFriend = await fixture.rpc('confirm_chat_room_poll_agreement', [
      'friend', fixture.users[0], friendPoll.id, friendAgreement.id, friendAgreement.version,
    ], ['text', 'uuid', 'uuid', 'uuid', 'integer'])
    assert.equal(confirmedFriend.status, 'confirmed')

    await fixture.as(fixture.users[0])
    const cancelPoll = await fixture.rpc('create_chat_room_poll', [
      'meetup', meetupId, 'general', '취소할 투표', 'single', ['A', 'B'], randomUUID(),
    ], ['text', 'uuid', 'text', 'text', 'text', 'text[]', 'uuid'])
    const cancelled = await fixture.rpc('cancel_chat_room_poll', [
      'meetup', meetupId, cancelPoll.id, cancelPoll.revision,
    ], ['text', 'uuid', 'uuid', 'integer'])
    assert.equal(cancelled.status, 'cancelled')

    await fixture.as(fixture.users[3])
    for (const [kind, id] of [['meetup', meetupId], ['department_challenge', challengeId], ['friend', fixture.users[0]]]) {
      await assert.rejects(() => fixture.rpc('get_chat_room_polls', [kind, id], ['text', 'uuid']), /activity_poll_forbidden/)
    }

    await fixture.db.query("update public.friendships set status='blocked' where created_from_request_id=$1", [requestId])
    await fixture.as(fixture.users[0])
    await assert.rejects(
      () => fixture.rpc('get_chat_room_polls', ['friend', fixture.users[1]], ['text', 'uuid']),
      /activity_poll_forbidden/,
      'a revoked or blocked friendship cannot read the shared poll room',
    )
  } finally { await fixture.db.close() }
})

test('direct meetup and department RPCs deny banned and deletion-pending members for read and write', async () => {
  const fixture = await setup()
  try {
    const meetupId = randomUUID(), challengeId = randomUUID()
    await fixture.db.query("insert into public.activity_meetups values($1,'open',$2)", [meetupId, fixture.users[0]])
    for (const [index, role] of [[0, 'host'], [1, 'member']]) {
      await fixture.db.query("insert into public.activity_meetup_members values($1,$2,$3,'joined')", [meetupId, fixture.users[index], role])
    }
    await fixture.db.query("insert into public.department_challenges values($1,'recruiting')", [challengeId])
    for (const index of [0, 1]) {
      await fixture.db.query("insert into public.department_challenge_roster values($1,$2,'accepted')", [challengeId, fixture.users[index]])
    }

    await fixture.as(fixture.users[0])
    const meetupPoll = await fixture.rpc('create_chat_room_poll', [
      'meetup', meetupId, 'schedule', '일반 모임 시간', 'single', ['오후 2시', '오후 4시'], randomUUID(),
    ], ['text', 'uuid', 'text', 'text', 'text', 'text[]', 'uuid'])
    const challengePoll = await fixture.rpc('create_chat_room_poll', [
      'department_challenge', challengeId, 'role', '학과 팀 역할', 'single', ['진행', '장비'], randomUUID(),
    ], ['text', 'uuid', 'text', 'text', 'text', 'text[]', 'uuid'])

    const adapters = [
      ['meetup', meetupId, meetupPoll],
      ['department_challenge', challengeId, challengePoll],
    ]
    for (const accountState of ['banned', 'deletion_pending']) {
      if (accountState === 'banned') {
        await fixture.db.query("update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=$1", [fixture.users[1]])
      } else {
        await fixture.db.query('update auth.users set banned_until=null where id=$1', [fixture.users[1]])
        await fixture.db.query('insert into quantum_private.test_account_deletion_blocks values($1)', [fixture.users[1]])
      }
      await fixture.as(fixture.users[1])
      for (const [kind, roomId, poll] of adapters) {
        await assert.rejects(
          () => fixture.rpc('get_chat_room_polls', [kind, roomId], ['text', 'uuid']),
          /activity_poll_forbidden/,
        )
        await assert.rejects(
          () => fixture.rpc('create_chat_room_poll', [
            kind, roomId, 'general', `${accountState} 계정 투표`, 'single', ['A', 'B'], randomUUID(),
          ], ['text', 'uuid', 'text', 'text', 'text', 'text[]', 'uuid']),
          /activity_poll_forbidden/,
        )
        await assert.rejects(
          () => fixture.rpc('vote_chat_room_poll', [kind, roomId, poll.id, [poll.options[0].id]], ['text', 'uuid', 'uuid', 'uuid[]']),
          /activity_poll_forbidden/,
        )
      }
    }
  } finally { await fixture.db.close() }
})
