import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

// Embedded Postgres contract fixture; not a live Supabase, LiveKit, or deployed-RLS test.
async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema quantum_private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
    create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
    create table public.users(id uuid primary key references auth.users(id));
    create table public.friend_requests(id uuid primary key,sender_user_id uuid,receiver_user_id uuid,status text);
    create table public.friendships(user_id uuid,friend_user_id uuid,status text,created_from_request_id uuid,blocked_by uuid,blocked_at timestamptz,primary key(user_id,friend_user_id));
    create table public.notifications(user_id uuid,kind text,payload jsonb);
    create table quantum_private.community_member_profiles(user_id uuid primary key,school_scope text,department text,community_gender text,display_name text,friend_recognition_name text);
    create function public.get_access_context() returns table(access_role text) language sql stable as $$select 'user'::text$$;
    create function quantum_private.resolve_profile_readiness(p_user uuid) returns table(minimum_signup_complete boolean) language sql stable as $$select exists(select 1 from quantum_private.community_member_profiles where user_id=p_user)$$;
    create function quantum_private.tonight_invite_pair_is_blocked(a uuid,b uuid) returns boolean language sql stable as $$select exists(select 1 from public.friendships where user_id=least(a,b) and friend_user_id=greatest(a,b) and status='blocked')$$;
    create function quantum_private.canonical_department_key(v text) returns text language sql immutable as $$select nullif(lower(regexp_replace(btrim(v),'[[:space:]]+','','g')),'')$$;
    create function quantum_private.get_member_department_key(u uuid) returns text language sql stable as $$select quantum_private.canonical_department_key(department) from quantum_private.community_member_profiles where user_id=u$$;
  `)
  await db.exec(
    await readFile(
      new URL('../../docs/implementation/community-voice/g5-g6-schema.sql', import.meta.url),
      'utf8',
    ),
  )
  await db.exec(`
    create table quantum_private.test_account_deletion_blocks(user_id uuid primary key);
    create or replace function quantum_private.voice_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from quantum_private.resolve_profile_readiness(p_user) where minimum_signup_complete)
        and exists(select 1 from auth.users where id=p_user and deleted_at is null and (banned_until is null or banned_until<=now()))
        and not exists(select 1 from quantum_private.voice_restrictions where user_id=p_user and until_at>now())
        and not exists(select 1 from quantum_private.test_account_deletion_blocks where user_id=p_user)
    $$;
  `)
  await db.exec(
    await readFile(
      new URL(
        '../../supabase/migrations/20260907190000_voice_scene_queues.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  const users = Array.from({ length: 12 }, () => randomUUID())
  for (let index = 0; index < users.length; index += 1) {
    await db.query('insert into auth.users(id) values($1)', [users[index]])
    await db.query('insert into public.users(id) values($1)', [users[index]])
    await db.query(
      'insert into quantum_private.community_member_profiles values($1,$2,$3,$4,$5,$6)',
      [
        users[index],
        index === 11 ? 'other_school' : 'pnu_self_selected',
        '기계공학과',
        index % 2 ? 'male' : 'female',
        `별칭${index}`,
        `친구이름${index}`,
      ],
    )
  }
  async function as(user, acknowledge = true) {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",
      [user],
    )
    if (acknowledge)
      await db.query(
        "select public.community_voice_command('acknowledge_rules','{}'::jsonb)",
      )
  }
  async function scene(operation, payload = {}) {
    return (
      await db.query(
        'select public.community_voice_scene_command($1,$2::jsonb) as value',
        [operation, JSON.stringify(payload)],
      )
    ).rows[0].value
  }
  async function voice(operation, payload = {}) {
    return (
      await db.query(
        'select public.community_voice_command($1,$2::jsonb) as value',
        [operation, JSON.stringify(payload)],
      )
    ).rows[0].value
  }
  return { db, users, as, scene, voice }
}

test('advice status is readable before acknowledgement and a restricted user can leave a queue', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0], false)
    assert.equal((await fixture.scene('advice_status')).queued, false)
    await fixture.as(fixture.users[0])
    const searchId = randomUUID()
    await fixture.scene('advice_join', {
      role: 'talker',
      adviceTopic: 'general',
      searchId,
      idempotencyKey: randomUUID(),
    })
    await fixture.db.query(
      "insert into quantum_private.voice_restrictions(user_id,until_at,reason_code) values($1,now()+interval '1 hour','review')",
      [fixture.users[0]],
    )
    await assert.rejects(
      () => fixture.scene('advice_status', { adviceTopic: 'general' }),
      /minimum_signup_required/,
    )
    const left = await fixture.scene('advice_leave', {
      searchId,
      idempotencyKey: randomUUID(),
    })
    assert.equal(left.queued, false)
    assert.equal('waiting' in left, false)
    assert.deepEqual(Object.keys(left), ['queued'])
  } finally {
    await fixture.db.close()
  }
})

test('advice matching requires opposite roles and preserves role-backed media modes', async () => {
  const fixture = await setup()
  try {
    const searches = [randomUUID(), randomUUID(), randomUUID()]
    await fixture.as(fixture.users[0])
    const first = await fixture.scene('advice_join', {
      role: 'talker',
      adviceTopic: 'romance',
      searchId: searches[0],
      idempotencyKey: randomUUID(),
    })
    assert.equal(first.queued, true)
    await fixture.as(fixture.users[1])
    const sameRole = await fixture.scene('advice_join', {
      role: 'talker',
      adviceTopic: 'romance',
      searchId: searches[1],
      idempotencyKey: randomUUID(),
    })
    assert.equal(sameRole.sessionId, null)
    await fixture.as(fixture.users[2])
    const otherTopic = await fixture.scene('advice_join', {
      role: 'listener',
      adviceTopic: 'career',
      searchId: searches[2],
      idempotencyKey: randomUUID(),
    })
    assert.equal(otherTopic.sessionId, null)
    await fixture.as(fixture.users[3])
    const paired = await fixture.scene('advice_join', {
      role: 'listener',
      adviceTopic: 'romance',
      searchId: randomUUID(),
      idempotencyKey: randomUUID(),
    })
    assert.ok(paired.sessionId)
    const members = await fixture.db.query(
      'select advice_role,advice_topic,mode from quantum_private.voice_members where session_id=$1 order by advice_role',
      [paired.sessionId],
    )
    assert.deepEqual(members.rows, [
      { advice_role: 'listener', advice_topic: 'romance', mode: 'speak' },
      { advice_role: 'talker', advice_topic: 'romance', mode: 'speak' },
    ])
  } finally {
    await fixture.db.close()
  }
})

test('advice next ends the old room, skips the peer, and requeues the same role', async () => {
  const fixture = await setup()
  try {
    const search = [randomUUID(), randomUUID()]
    await fixture.as(fixture.users[0])
    await fixture.scene('advice_join', {
      role: 'talker',
      adviceTopic: 'career',
      searchId: search[0],
      idempotencyKey: randomUUID(),
    })
    await fixture.as(fixture.users[1])
    const paired = await fixture.scene('advice_join', {
      role: 'listener',
      adviceTopic: 'career',
      searchId: search[1],
      idempotencyKey: randomUUID(),
    })
    await fixture.as(fixture.users[2])
    await fixture.scene('advice_join', {
      role: 'listener',
      adviceTopic: 'career',
      searchId: randomUUID(),
      idempotencyKey: randomUUID(),
    })
    await fixture.as(fixture.users[0])
    const next = await fixture.scene('advice_next', {
      sessionId: paired.sessionId,
      idempotencyKey: randomUUID(),
    })
    assert.equal(next.queued, true)
    assert.equal(next.role, 'talker')
    assert.equal(next.adviceTopic, 'career')
    assert.equal(next.sessionId, null)
    await fixture.as(fixture.users[3])
    const cannotClaimPendingPeer = await fixture.scene('advice_join', {
      role: 'listener',
      adviceTopic: 'career',
      searchId: randomUUID(),
      idempotencyKey: randomUUID(),
    })
    assert.equal(cannotClaimPendingPeer.sessionId, null)
    assert.equal(
      (
        await fixture.db.query(
          'select state from quantum_private.voice_sessions where id=$1',
          [paired.sessionId],
        )
      ).rows[0].state,
      'ended',
    )
    assert.equal(
      (
        await fixture.db.query(
          'select count(*)::int as count from quantum_private.voice_skips where user_id=$1 and peer_id=$2',
          [fixture.users[0], fixture.users[1]],
        )
      ).rows[0].count,
      1,
    )
    await fixture.as(fixture.users[0])
    await assert.rejects(
      () =>
        fixture.scene('advice_resume', {
          idempotencyKey: randomUUID(),
        }),
      /media_cleanup_pending/,
    )
    await fixture.db.query(
      'update quantum_private.voice_media_outbox set completed_at=now() where user_id=$1',
      [fixture.users[0]],
    )
    const resumed = await fixture.scene('advice_resume', {
      idempotencyKey: randomUUID(),
    })
    assert.ok(resumed.sessionId)
    assert.equal(resumed.adviceTopic, 'career')
  } finally {
    await fixture.db.close()
  }
})

test('advice matching ignores a stale school snapshot and counts only the selected topic', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    await fixture.scene('advice_join', {
      role: 'talker',
      adviceTopic: 'romance',
      searchId: randomUUID(),
      idempotencyKey: randomUUID(),
    })
    await fixture.db.query(
      "update quantum_private.community_member_profiles set school_scope='other_school' where user_id=$1",
      [fixture.users[0]],
    )
    await fixture.as(fixture.users[1])
    const waiting = await fixture.scene('advice_join', {
      role: 'listener',
      adviceTopic: 'romance',
      searchId: randomUUID(),
      idempotencyKey: randomUUID(),
    })
    assert.equal(waiting.sessionId, null)
    assert.equal(waiting.waiting.totalPeople, 1)
    const career = await fixture.scene('advice_status', { adviceTopic: 'career' })
    assert.equal(career.waiting.totalPeople, 0)
  } finally {
    await fixture.db.close()
  }
})

test('cheer join allocates at most five people and pre-creates one next empty cell', async () => {
  const fixture = await setup()
  try {
    const sessions = []
    for (let index = 0; index < 5; index += 1) {
      await fixture.as(fixture.users[index])
      const joined = await fixture.scene('cheer_join', {
        teamId: 'kbo-lotte-giants',
        idempotencyKey: randomUUID(),
      })
      sessions.push(joined.sessionId)
      assert.ok(joined.memberCount >= 1 && joined.memberCount <= 5)
    }
    assert.equal(new Set(sessions.slice(0, 5)).size, 1)
    const emptyAfterFull = await fixture.db.query(
      `select count(*)::int as count
       from quantum_private.voice_cheer_cells cell
       join quantum_private.voice_sessions session on session.room_id=cell.room_id and session.state='active'
       where cell.team_id='kbo-lotte-giants'
         and not exists(select 1 from quantum_private.voice_members member where member.session_id=session.id and member.active)`,
    )
    assert.equal(emptyAfterFull.rows[0].count, 1)
    await fixture.as(fixture.users[5])
    const sixth = await fixture.scene('cheer_join', {
      teamId: 'kbo-lotte-giants',
      idempotencyKey: randomUUID(),
    })
    sessions.push(sixth.sessionId)
    assert.notEqual(sessions[5], sessions[0])
    await fixture.as(fixture.users[6])
    const listed = await fixture.voice('list_rooms')
    assert.equal(
      listed.rooms.some((room) => room.id === sixth.roomId),
      false,
    )
    await assert.rejects(
      () =>
        fixture.voice('room_command', {
          roomId: sixth.roomId,
          action: 'join',
          mode: 'listen',
          expectedRevision: 1,
          idempotencyKey: randomUUID(),
        }),
      /forbidden/,
    )
    await fixture.as(fixture.users[5])
    await fixture.voice('session_command', {
      sessionId: sixth.sessionId,
      action: 'leave',
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    })
    await fixture.db.query(
      'update quantum_private.voice_media_outbox set completed_at=now() where user_id=$1',
      [fixture.users[5]],
    )
    const rejoined = await fixture.scene('cheer_join', {
      teamId: 'kbo-lotte-giants',
      idempotencyKey: randomUUID(),
    })
    assert.equal(rejoined.sessionId, sixth.sessionId)
    const counts = await fixture.db.query(
      'select session_id,count(*)::int as count from quantum_private.voice_members where active group by session_id order by count desc',
    )
    assert.deepEqual(
      counts.rows.map((row) => row.count),
      [5, 1],
    )
    await fixture.as(fixture.users[0])
    const session = await fixture.voice('session', { sessionId: sessions[0] })
    assert.equal(session.session.participants[0].isModerator, false)
    const privileges = await fixture.db.query(
      "select has_table_privilege('authenticated','quantum_private.voice_advice_queue','SELECT') as advice_exposed,has_table_privilege('authenticated','quantum_private.voice_cheer_cells','SELECT') as cheer_exposed,has_function_privilege('anon','public.community_voice_scene_command(text,jsonb)','EXECUTE') as anon_callable,(select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='quantum_private' and c.relname in ('voice_advice_queue','voice_advice_searches','voice_cheer_teams','voice_cheer_cells')) as scene_rls",
    )
    assert.deepEqual(privileges.rows[0], {
      advice_exposed: false,
      cheer_exposed: false,
      anon_callable: false,
      scene_rls: true,
    })
  } finally {
    await fixture.db.close()
  }
})

test('advice queue cannot overlap legacy random, group, or friend admission', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    await fixture.scene('advice_join', {
      role: 'talker',
      adviceTopic: 'general',
      searchId: randomUUID(),
      idempotencyKey: randomUUID(),
    })
    await assert.rejects(
      () =>
        fixture.voice('queue_command', {
          action: 'join',
          topic: 'social',
          searchId: randomUUID(),
          idempotencyKey: randomUUID(),
        }),
      /already_in_voice/,
    )

    const roomId = randomUUID()
    await fixture.db.query(
      `insert into quantum_private.voice_rooms(id,created_by,school_scope,title,description,topic,kind,scope,capacity,starts_at,ends_at,status)
       values($1,$2,'pnu_self_selected','모집방','설명','department','group','school',5,now()-interval '1 minute',now()+interval '1 hour','open')`,
      [roomId, fixture.users[1]],
    )
    await assert.rejects(
      () =>
        fixture.voice('room_command', {
          roomId,
          action: 'join',
          mode: 'listen',
          expectedRevision: 0,
          idempotencyKey: randomUUID(),
        }),
      /already_in_voice/,
    )

    const requestId = randomUUID()
    await fixture.db.query(
      "insert into public.friend_requests(id,sender_user_id,receiver_user_id,status) values($1,$2,$3,'accepted')",
      [requestId, fixture.users[0], fixture.users[1]],
    )
    await fixture.db.query(
      "insert into public.friendships(user_id,friend_user_id,status,created_from_request_id) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),'active',$3)",
      [fixture.users[0], fixture.users[1], requestId],
    )
    await fixture.as(fixture.users[1])
    const invitation = await fixture.voice('invite_friend', {
      friendUserId: fixture.users[0],
      idempotencyKey: randomUUID(),
    })
    await fixture.as(fixture.users[0])
    await assert.rejects(
      () =>
        fixture.voice('accept_friend', {
          invitationId: invitation.invitationId,
          idempotencyKey: randomUUID(),
        }),
      /already_in_voice/,
    )
  } finally {
    await fixture.db.close()
  }
})

test('service sweep leaves one empty cheer cell after a previously full cell empties', async () => {
  const fixture = await setup()
  try {
    let filledSessionId = null
    for (let index = 0; index < 5; index += 1) {
      await fixture.as(fixture.users[index])
      const joined = await fixture.scene('cheer_join', {
        teamId: 'lck-t1',
        idempotencyKey: randomUUID(),
      })
      filledSessionId = joined.sessionId
    }
    await fixture.db.query(
      "update quantum_private.voice_members set disconnected_at=now()-interval '3 minutes' where session_id=$1",
      [filledSessionId],
    )
    await fixture.db.query(
      "select set_config('request.jwt.claim.role','service_role',false)",
    )
    const swept = (
      await fixture.db.query('select public.sweep_voice_sessions() as value')
    ).rows[0].value
    assert.equal(swept.retiredCheerEmptyCells, 1)
    const empty = await fixture.db.query(
      `select count(*)::int as count
       from quantum_private.voice_cheer_cells cell
       join quantum_private.voice_rooms room on room.id=cell.room_id and room.status='open'
       join quantum_private.voice_sessions session on session.room_id=room.id and session.state='active'
       where cell.team_id='lck-t1'
         and not exists(select 1 from quantum_private.voice_members member where member.session_id=session.id and member.active)`,
    )
    assert.equal(empty.rows[0].count, 1)
  } finally {
    await fixture.db.close()
  }
})

test('account-deletion cleanup succeeds without returning school voice counts', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const searchId = randomUUID()
    await fixture.voice('queue_command', {
      action: 'join',
      topic: 'social',
      searchId,
      idempotencyKey: randomUUID(),
    })
    await fixture.db.query(
      'insert into quantum_private.test_account_deletion_blocks(user_id) values($1)',
      [fixture.users[0]],
    )
    const leftQueue = await fixture.voice('queue_command', {
      action: 'leave',
      searchId,
      idempotencyKey: randomUUID(),
    })
    assert.deepEqual(leftQueue, { queued: false, sessionId: null })
    await assert.rejects(
      () => fixture.scene('advice_status', { adviceTopic: 'general' }),
      /minimum_signup_required/,
    )

    await fixture.db.query(
      'delete from quantum_private.test_account_deletion_blocks where user_id=$1',
      [fixture.users[0]],
    )
    const roomId = randomUUID()
    await fixture.db.query(
      `insert into quantum_private.voice_rooms(id,created_by,school_scope,title,description,topic,kind,scope,capacity,starts_at,ends_at,status)
       values($1,$2,'pnu_self_selected','모집방','설명','department','group','school',5,now()-interval '1 minute',now()+interval '1 hour','open')`,
      [roomId, fixture.users[1]],
    )
    const joined = await fixture.voice('room_command', {
      roomId,
      action: 'join',
      mode: 'listen',
      expectedRevision: 0,
      idempotencyKey: randomUUID(),
    })
    await fixture.db.query(
      'insert into quantum_private.test_account_deletion_blocks(user_id) values($1)',
      [fixture.users[0]],
    )
    const leftSession = await fixture.voice('session_command', {
      sessionId: joined.sessionId,
      action: 'leave',
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    })
    assert.deepEqual(leftSession, { session: { state: 'ended' } })
  } finally {
    await fixture.db.close()
  }
})
