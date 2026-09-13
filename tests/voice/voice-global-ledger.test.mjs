import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

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
  await db.exec(await readFile(new URL('../../docs/implementation/community-voice/g5-g6-schema.sql', import.meta.url), 'utf8'))
  await db.exec(`
    create table quantum_private.test_account_deletion_blocks(user_id uuid primary key);
    create or replace function quantum_private.voice_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from quantum_private.resolve_profile_readiness(p_user) where minimum_signup_complete)
        and exists(select 1 from auth.users where id=p_user and deleted_at is null and (banned_until is null or banned_until<=now()))
        and not exists(select 1 from quantum_private.voice_restrictions where user_id=p_user and until_at>now())
        and not exists(select 1 from quantum_private.test_account_deletion_blocks where user_id=p_user)
    $$;
  `)
  await db.exec(await readFile(new URL('../../supabase/migrations/20260907190000_voice_scene_queues.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20260908164745_voice_global_runtime.sql', import.meta.url), 'utf8'))
  const users = Array.from({ length: 6 }, () => randomUUID())
  for (let index = 0; index < users.length; index += 1) {
    await db.query('insert into auth.users(id) values($1)', [users[index]])
    await db.query('insert into public.users(id) values($1)', [users[index]])
    await db.query(
      'insert into quantum_private.community_member_profiles values($1,$2,$3,$4,$5,$6)',
      [users[index], 'pnu_self_selected', '기계공학과', index % 2 ? 'male' : 'female', `별칭${index}`, `친구이름${index}`],
    )
  }
  async function as(user, role = 'authenticated') {
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [user, role])
    if (role === 'authenticated') await db.query("select public.community_voice_command('acknowledge_rules','{}'::jsonb)")
  }
  async function scene(operation, payload = {}) {
    return (await db.query('select public.community_voice_scene_command($1,$2::jsonb) as value', [operation, JSON.stringify(payload)])).rows[0].value
  }
  async function voice(operation, payload = {}) {
    return (await db.query('select public.community_voice_command($1,$2::jsonb) as value', [operation, JSON.stringify(payload)])).rows[0].value
  }
  async function runtime(operation = 'status', payload = {}) {
    return (await db.query('select public.community_voice_runtime_command($1,$2::jsonb) as value', [operation, JSON.stringify(payload)])).rows[0].value
  }
  return { db, users, as, scene, voice, runtime }
}

test('runtime follows persisted advice wait, mutual offer, and provider-connected state', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    const search0 = randomUUID()
    await fixture.scene('advice_join', { role: 'listener', adviceTopic: 'romance', searchId: search0, idempotencyKey: randomUUID() })
    const waiting = await fixture.runtime()
    assert.equal(waiting.status, 'waiting')
    assert.equal(waiting.queue.kind, 'advice')
    assert.equal(waiting.queue.waiting.totalPeople, 1)
    assert.equal(waiting.queue.waiting.genderBreakdown.femalePeople, 1)
    assert.equal(waiting.queue.listeners, 1)

    await fixture.as(fixture.users[1])
    await fixture.scene('advice_join', { role: 'talker', adviceTopic: 'romance', searchId: randomUUID(), idempotencyKey: randomUUID() })
    const offer1 = await fixture.runtime()
    assert.equal(offer1.status, 'offered')
    assert.equal(offer1.sessionConnected, false)

    await fixture.as(fixture.users[0])
    const offer0 = await fixture.runtime()
    assert.equal(offer0.session.id, offer1.session.id)
    await fixture.voice('session_command', { sessionId: offer0.session.id, action: 'accept', expectedRevision: offer0.revision, idempotencyKey: randomUUID() })
    await fixture.as(fixture.users[1])
    const pending1 = await fixture.runtime()
    await fixture.voice('session_command', { sessionId: pending1.session.id, action: 'accept', expectedRevision: pending1.revision, idempotencyKey: randomUUID() })
    assert.equal((await fixture.runtime()).status, 'offered', 'acceptance alone is not a provider connection')

    const identity = (await fixture.db.query('select identity from quantum_private.voice_members where session_id=$1 and user_id=$2', [offer1.session.id, fixture.users[1]])).rows[0].identity
    await fixture.as(fixture.users[1], 'service_role')
    await fixture.db.query("select public.apply_voice_provider_event($1,'participant_joined',$2,$3,$4,$5)", [randomUUID(), `qv-${offer1.session.id}`, identity, 'provider-sid', Math.floor(Date.now() / 1000)])
    await fixture.as(fixture.users[1])
    assert.equal((await fixture.runtime()).status, 'connected')

    await fixture.db.query(
      "update quantum_private.voice_members set connected=false,disconnected_at=now()-interval '10 minutes' where session_id=$1 and user_id=$2",
      [offer1.session.id, fixture.users[1]],
    )
    const recoverable = await fixture.runtime()
    assert.equal(recoverable.status, 'cleanup_required')
    assert.equal(recoverable.cleanup.sessionId, offer1.session.id, 'stale local media must not hide server ownership or the leave path')
    assert.equal(recoverable.session, null, 'cleanup never re-exposes expired participant details')
    assert.equal(recoverable.room, null)
    await assert.rejects(() => fixture.voice('session', { sessionId: offer1.session.id }), /not_found/)
    await fixture.voice('session_command', { sessionId: offer1.session.id, action: 'leave', expectedRevision: recoverable.revision, idempotencyKey: randomUUID() })
    assert.equal((await fixture.runtime()).status, 'idle')
    const ended = await fixture.db.query('select state from quantum_private.voice_sessions where id=$1', [offer1.session.id])
    assert.equal(ended.rows[0].state, 'ended', 'stale leave also ends the peer session through the existing ledger')
    const cleanup = await fixture.db.query('select count(*)::int as count from quantum_private.voice_media_outbox where room_name=$1', [`qv-${offer1.session.id}`])
    assert.ok(cleanup.rows[0].count > 0, 'provider cleanup is queued rather than orphaned')
  } finally {
    await fixture.db.close()
  }
})

test('expired offers and revoked eligibility keep only self-owned cleanup, not a blocked join dead end', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[0])
    await fixture.scene('advice_join', { role: 'listener', adviceTopic: 'romance', searchId: randomUUID(), idempotencyKey: randomUUID() })
    await fixture.as(fixture.users[1])
    await fixture.scene('advice_join', { role: 'talker', adviceTopic: 'romance', searchId: randomUUID(), idempotencyKey: randomUUID() })
    const offer = await fixture.runtime()
    await fixture.db.query('update quantum_private.community_member_profiles set school_scope=$1 where user_id=$2', ['other_school', fixture.users[1]])
    const revoked = await fixture.runtime()
    assert.equal(revoked.status, 'cleanup_required')
    assert.equal(revoked.room, null)
    assert.equal(revoked.session, null)
    await fixture.db.query('update quantum_private.community_member_profiles set school_scope=$1 where user_id=$2', ['pnu_self_selected', fixture.users[1]])
    await fixture.db.query("update quantum_private.voice_sessions set expires_at=now()-interval '1 second' where id=$1", [offer.session.id])
    const expired = await fixture.runtime()
    assert.equal(expired.status, 'cleanup_required')
    assert.equal(expired.cleanup.sessionId, offer.session.id)
    assert.equal(expired.room, null)
    assert.equal(expired.session, null)
    await fixture.as(fixture.users[2])
    assert.equal((await fixture.runtime()).status, 'idle', 'another account cannot read the cleanup reference')
    await fixture.as(fixture.users[1])
    await fixture.voice('session_command', { sessionId: expired.cleanup.sessionId, action: 'leave', expectedRevision: expired.revision, idempotencyKey: randomUUID() })
    assert.equal((await fixture.runtime()).status, 'idle')
  } finally { await fixture.db.close() }
})

test('waiting cancellation is revision checked, replay safe, and topic counts stay separate', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[2])
    await fixture.voice('queue_command', { action: 'join', topic: 'social', searchId: randomUUID(), idempotencyKey: randomUUID() })
    const social = await fixture.runtime()
    assert.equal(social.queue.waiting.totalPeople, 1)
    await fixture.as(fixture.users[3])
    await fixture.voice('queue_command', { action: 'join', topic: 'baseball', searchId: randomUUID(), idempotencyKey: randomUUID() })
    assert.equal((await fixture.runtime()).queue.waiting.totalPeople, 1)

    const key = randomUUID()
    await assert.rejects(() => fixture.runtime('cancel_waiting', { action: 'cancel_waiting', expectedRevision: social.revision + 1, idempotencyKey: key }), /stale_revision/)
    await fixture.as(fixture.users[2])
    await assert.rejects(
      () => fixture.runtime('cancel_waiting', { expectedRevision: social.revision, idempotencyKey: randomUUID() }),
      /invalid_input/,
    )
    await assert.rejects(
      () => fixture.runtime('cancel_waiting', { action: 'cancel_waiting', expectedRevision: social.revision, idempotencyKey: randomUUID(), userId: fixture.users[3] }),
      /invalid_input/,
    )
    const payload = { action: 'cancel_waiting', expectedRevision: social.revision, idempotencyKey: key }
    const result = await fixture.runtime('cancel_waiting', payload)
    assert.equal(result.status, 'idle')
    assert.deepEqual(await fixture.runtime('cancel_waiting', payload), result)
  } finally {
    await fixture.db.close()
  }
})

test('queue ownership revision changes with the opaque search even inside one transaction timestamp', async () => {
  const fixture = await setup()
  try {
    await fixture.as(fixture.users[4])
    await fixture.db.exec('begin')
    await fixture.voice('queue_command', {
      action: 'join', topic: 'social', searchId: randomUUID(), idempotencyKey: randomUUID(),
    })
    const first = await fixture.runtime()
    await fixture.runtime('cancel_waiting', {
      action: 'cancel_waiting', expectedRevision: first.revision, idempotencyKey: randomUUID(),
    })
    await fixture.voice('queue_command', {
      action: 'join', topic: 'social', searchId: randomUUID(), idempotencyKey: randomUUID(),
    })
    const second = await fixture.runtime()
    assert.notEqual(second.revision, first.revision)
    await fixture.db.exec('rollback')
  } finally {
    await fixture.db.close()
  }
})
