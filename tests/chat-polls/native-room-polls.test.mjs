import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { nativePollFixture, ids } from './native-room-poll-fixture.mjs'

test('original poll chain rejects native scopes; forward migration preserves private ACLs', async () => {
  const f = await nativePollFixture({ apply: false })
  try {
    for (const kind of Object.keys(f.rooms)) await assert.rejects(f.read(kind), /activity_poll_forbidden/)
    await f.migrate()
    for (const kind of Object.keys(f.rooms)) assert.equal((await f.read(kind)).room_id, f.rooms[kind])
    const helpers = await f.db.query(`select p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('service_role',p.oid,'execute') as service
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='quantum_private'
      and (p.proname like '%before_native' or p.proname in ('chat_poll_current_members','resolve_chat_poll_room','lock_chat_poll_room','chat_poll_creator_alias'))`)
    assert.equal(helpers.rows.length, 8)
    for (const fn of helpers.rows) {
      assert.equal(fn.prosecdef, true)
      assert.ok(fn.proconfig.includes('search_path=""'))
      assert.equal(fn.authenticated || fn.anon || fn.service, false, fn.proname)
    }
    const definition = (await f.db.query("select pg_get_functiondef('quantum_private.lock_chat_poll_room(text,uuid,uuid,boolean)'::regprocedure) as body")).rows[0].body
    assert.ok(definition.indexOf('native_admission_global_lock') < definition.indexOf('quantum:minimum-signup:user:'))
    assert.ok(definition.indexOf('quantum:minimum-signup:user:') < definition.indexOf('native_admission_room_lock'))
    assert.match(definition, /pg_try_advisory_xact_lock\(hashtextextended\('account-delete\|'/)
    assert.match(definition, /for share nowait/)
    assert.match(definition, /v_current_members is distinct from v_locked_members/)
    assert.ok(definition.indexOf('group_mentoring_lock_pairs') < definition.lastIndexOf('resolve_chat_poll_room'))
    const tables = await f.db.query(`select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='quantum_private' and relname in ('activity_room_polls','activity_room_poll_agreements','activity_room_poll_ballots')`)
    assert.equal(tables.rows.length, 3)
    assert.ok(tables.rows.every(row => row.relrowsecurity))
  } finally { await f.db.close() }
})

for (const kind of ['study_room', 'mentoring']) {
  test(`${kind}: user questions, idempotency, native alias snapshot, vote replacement and scope isolation`, async () => {
    const f = await nativePollFixture()
    try {
      const key = randomUUID()
      const poll = await f.createPoll(kind, ids[0], { key })
      assert.equal(poll.title, '직접 정한 질문')
      assert.deepEqual(poll.options.map(option => option.label), ['첫 번째 선택', '두 번째 선택'])
      assert.equal((await f.createPoll(kind, ids[0], { key })).id, poll.id)
      await assert.rejects(f.createPoll(kind, ids[0], { key, title: '바뀐 질문' }), /idempotency_key_reused/)
      const table = kind === 'study_room' ? 'study_room_members' : 'group_mentoring_members'
      const column = kind === 'study_room' ? 'room_id' : 'session_id'
      const alias = (await f.db.query(`select alias from quantum_private.${table} where ${column}=$1 and user_id=$2`, [f.rooms[kind], ids[0]])).rows[0].alias
      assert.equal(poll.creator_alias, alias)
      await f.db.query(`update quantum_private.${table} set alias='바뀐 현재 별칭' where ${column}=$1 and user_id=$2`, [f.rooms[kind], ids[0]])
      assert.equal((await f.read(kind)).polls[0].creator_alias, alias)
      await f.vote(kind, poll.id, [poll.options[0].id])
      await f.vote(kind, poll.id, [poll.options[1].id])
      const count = await f.db.query('select count(*)::int as n from quantum_private.activity_room_poll_ballots where poll_id=$1 and user_id=$2', [poll.id, ids[1]])
      assert.equal(count.rows[0].n, 1)
      const choices = await f.db.query('select option_id from quantum_private.activity_room_poll_ballot_choices where poll_id=$1 and user_id=$2', [poll.id, ids[1]])
      assert.deepEqual(choices.rows.map(row => row.option_id), [poll.options[1].id])
      await assert.rejects(f.vote(kind, poll.id, poll.options.map(option => option.id)), /single_choice_required/)
      const another = await f.createPoll(kind, ids[1])
      await assert.rejects(f.vote(kind, poll.id, [another.options[0].id]), /invalid_activity_poll_options/)
      const otherKind = kind === 'study_room' ? 'mentoring' : 'study_room'
      await assert.rejects(f.vote(otherKind, poll.id, [poll.options[0].id]), /activity_poll_not_found/)
      await assert.rejects(f.vote(kind, poll.id, [poll.options[0].id], ids[1], randomUUID()), /activity_poll_forbidden/)
      await assert.rejects(f.read(kind, ids[2]), /activity_poll_forbidden/)
      await assert.rejects(f.createPoll(kind, ids[2]), /activity_poll_forbidden/)
      await assert.rejects(f.vote(kind, poll.id, [poll.options[0].id], ids[2]), /activity_poll_forbidden/)
      await assert.rejects(f.rpc(ids[1], 'close_chat_room_poll', [kind, f.rooms[kind], poll.id, 0]), /creator_required/)
      await assert.rejects(f.rpc(ids[0], 'close_chat_room_poll', [kind, f.rooms[kind], poll.id, 100]), /stale_revision/)
      await f.rpc(ids[0], 'close_chat_room_poll', [kind, f.rooms[kind], poll.id, poll.revision])
      await assert.rejects(f.vote(kind, poll.id, [poll.options[0].id]), /not_open/)
      await f.rpc(ids[1], 'cancel_chat_room_poll', [kind, f.rooms[kind], another.id, another.revision])
      await assert.rejects(f.vote(kind, another.id, [another.options[0].id]), /not_open/)
    } finally { await f.db.close() }
  })

  test(`${kind}: current membership, live account, department scope and blocks guard reads and writes`, async () => {
    const f = await nativePollFixture()
    try {
      const poll = await f.createPoll(kind)
      const denied = async () => {
        await assert.rejects(f.read(kind, ids[1]), /activity_poll_forbidden/)
        await assert.rejects(f.vote(kind, poll.id, [poll.options[0].id]), /activity_poll_forbidden/)
        await assert.rejects(f.createPoll(kind, ids[1]), /activity_poll_forbidden/)
      }
      for (const field of ['deleted_at', 'banned_until']) {
        await f.db.query(`update auth.users set ${field}=now()+interval '1 day' where id=$1`, [ids[1]])
        await denied()
        await f.db.query(`update auth.users set ${field}=null where id=$1`, [ids[1]])
      }
      await f.db.query('insert into quantum_private.test_deletions values($1)', [ids[1]])
      await denied()
      await f.db.query('delete from quantum_private.test_deletions where user_id=$1', [ids[1]])
      await f.db.query('insert into quantum_private.test_blocks values($1,$2)', [ids[0], ids[1]])
      await denied()
      await f.db.query('delete from quantum_private.test_blocks where a=$1 and b=$2', [ids[0], ids[1]])
      await f.db.query("update quantum_private.community_member_profiles set department='전자공학과' where user_id=$1", [ids[1]])
      await denied()
      await f.db.query("update quantum_private.community_member_profiles set department='기계공학과' where user_id=$1", [ids[1]])
      assert.equal((await f.read(kind, ids[1])).polls.length, 1)
      if (kind === 'study_room') await f.rpc(ids[1], 'study_room_action', ['leave', JSON.stringify({ room_id: f.rooms[kind] })])
      else await f.act(ids[1], 'leave', { session_id: f.rooms[kind] })
      await denied()
    } finally { await f.db.close() }
  })

  test(`${kind}: agreements require the exact current membership and never leak member ids`, async () => {
    const f = await nativePollFixture()
    try {
      const poll = await f.createPoll(kind)
      await f.vote(kind, poll.id, [poll.options[0].id])
      const closed = await f.rpc(ids[0], 'close_chat_room_poll', [kind, f.rooms[kind], poll.id, poll.revision])
      const agreement = await f.rpc(ids[0], 'propose_chat_room_poll_agreement', [kind, f.rooms[kind], poll.id, poll.options[0].id, closed.revision, randomUUID(), '직접 결정한 합의 내용'])
      assert.equal(agreement.required_count, 2)
      assert.equal(agreement.status, 'proposal')
      assert.doesNotMatch(JSON.stringify(agreement), new RegExp(ids.slice(0, 2).join('|')))
      const confirm = (user, version = agreement.version) => f.rpc(user, 'confirm_chat_room_poll_agreement', [kind, f.rooms[kind], poll.id, agreement.id, version])
      await assert.rejects(confirm(ids[2]), /activity_poll_forbidden/)
      await assert.rejects(confirm(ids[1], agreement.version + 1), /stale_version/)
      assert.equal((await confirm(ids[0])).status, 'proposal')
      assert.equal((await confirm(ids[0])).confirmation_count, 1)
      assert.equal((await confirm(ids[1])).status, 'confirmed')
      if (kind === 'study_room') await f.rpc(ids[1], 'study_room_action', ['leave', JSON.stringify({ room_id: f.rooms[kind] })])
      else await f.act(ids[1], 'leave', { session_id: f.rooms[kind] })
      await assert.rejects(confirm(ids[0]), /agreement_membership_changed/)
      await assert.rejects(confirm(ids[1]), /activity_poll_forbidden/)
    } finally { await f.db.close() }
  })
}

test('forward adapter still delegates actual accepted league-team polls and completion gates', async () => {
  const f = await nativePollFixture()
  try {
    const team = await f.team(10)
    const poll = await f.rpc(team.actor, 'create_chat_room_poll', ['league_team', team.team, 'general', '기존 팀 질문', 'single', ['첫째', '둘째'], randomUUID()])
    assert.equal((await f.rpc(team.actor, 'get_chat_room_polls', ['league_team', team.team])).polls[0].id, poll.id)
    await f.rpc(team.actor, 'vote_chat_room_poll', ['league_team', team.team, poll.id, [poll.options[0].id]])
    await assert.rejects(f.rpc(ids[0], 'get_chat_room_polls', ['league_team', team.team]), /activity_poll_forbidden/)
    const opponent = await f.team(15)
    const leagueAct = (user, action, args) => f.rpc(user, 'department_league_action', [action, JSON.stringify(args)])
    for (const current of [team, opponent]) await leagueAct(current.actor, 'queue', { team_id: current.team, waiting: true, gap: 200 })
    await leagueAct(team.actor, 'propose', { team_id: team.team, opponent_team_id: opponent.team })
    await leagueAct(opponent.actor, 'accept', { team_id: opponent.team, opponent_team_id: team.team })
    await f.db.query("update public.department_challenges set status='completed',first_score=1,second_score=0 where id=$1", [team.id])
    await assert.rejects(f.rpc(team.actor, 'vote_chat_room_poll', ['league_team', team.team, poll.id, [poll.options[0].id]]), /activity_poll_forbidden/)
  } finally { await f.db.close() }
})

test('study polls share all ten sessions, retain current-member results after completion and reject writes', async () => {
  const f = await nativePollFixture()
  try {
    const poll = await f.createPoll('study_room')
    await f.db.query('update quantum_private.study_rooms set current_session=2,recruitment_closed=true where id=$1', [f.rooms.study_room])
    assert.equal((await f.read('study_room')).polls[0].id, poll.id)
    await f.vote('study_room', poll.id, [poll.options[0].id])
    await f.db.query('update quantum_private.study_rooms set current_session=10,completed=true where id=$1', [f.rooms.study_room])
    assert.equal((await f.read('study_room')).polls[0].id, poll.id)
    await assert.rejects(f.createPoll('study_room'), /activity_poll_forbidden/)
    await assert.rejects(f.vote('study_room', poll.id, [poll.options[1].id]), /activity_poll_forbidden/)
    await assert.rejects(f.rpc(ids[0], 'close_chat_room_poll', ['study_room', f.rooms.study_room, poll.id, 0]), /activity_poll_forbidden/)
  } finally { await f.db.close() }
})

test('mentoring rejects unaccepted members, legacy groups, expired and ended sessions', async () => {
  const f = await nativePollFixture()
  try {
    const poll = await f.createPoll('mentoring')
    const denied = async () => {
      await assert.rejects(f.read('mentoring', ids[1]), /activity_poll_forbidden/)
      await assert.rejects(f.vote('mentoring', poll.id, [poll.options[0].id]), /activity_poll_forbidden/)
    }
    await f.db.query('update quantum_private.group_mentoring_members set accepted=false where session_id=$1 and user_id=$2', [f.rooms.mentoring, ids[1]])
    await denied()
    await f.db.query('update quantum_private.group_mentoring_members set accepted=true where session_id=$1 and user_id=$2', [f.rooms.mentoring, ids[1]])
    await f.db.query("update quantum_private.group_mentoring_sessions set expires_at=now()-interval '1 second' where id=$1", [f.rooms.mentoring])
    await denied()
    await f.db.query("update quantum_private.group_mentoring_sessions set expires_at=now()+interval '1 day', status='ended' where id=$1", [f.rooms.mentoring])
    await denied()
    await f.db.query("update quantum_private.group_mentoring_sessions set status='active',recruitment_mode='legacy' where id=$1", [f.rooms.mentoring])
    await denied()
  } finally { await f.db.close() }
})

test('mentoring excludes blocked pairs between other members and preserves native host transfer', async () => {
  const f = await nativePollFixture()
  try {
    await f.admit(f.rooms.mentoring, ids[2])
    const poll = await f.createPoll('mentoring')
    await f.db.query('insert into quantum_private.test_blocks values($1,$2)', [ids[1], ids[2]])
    await assert.rejects(f.read('mentoring', ids[0]), /activity_poll_forbidden/)
    await assert.rejects(f.vote('mentoring', poll.id, [poll.options[0].id], ids[0]), /activity_poll_forbidden/)
    await f.db.query('delete from quantum_private.test_blocks where a=$1 and b=$2', [ids[1], ids[2]])
    assert.equal((await f.read('mentoring', ids[1])).polls[0].id, poll.id)
    await f.act(ids[0], 'leave', { session_id: f.rooms.mentoring })
    await assert.rejects(f.read('mentoring', ids[0]), /activity_poll_forbidden/)
    await assert.rejects(f.createPoll('mentoring', ids[0]), /activity_poll_forbidden/)
    assert.equal((await f.act(ids[1], 'status', { session_id: f.rooms.mentoring })).room.is_host, true)
    for (const user of ids.slice(1, 3)) {
      assert.equal((await f.read('mentoring', user)).polls[0].id, poll.id)
      await f.vote('mentoring', poll.id, [poll.options[0].id], user)
    }
    // Missing authoritative host, unlike a successful native transfer, denies.
    await f.db.query('update quantum_private.group_mentoring_sessions set host_user_id=null where id=$1', [f.rooms.mentoring])
    for (const user of ids.slice(1, 3)) {
      await assert.rejects(f.read('mentoring', user), /activity_poll_forbidden/)
      await assert.rejects(f.createPoll('mentoring', user), /activity_poll_forbidden/)
    }
  } finally { await f.db.close() }
})
