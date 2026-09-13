import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'

import { PGlite } from '@electric-sql/pglite'

async function migrationSql() {
  const names = (await readdir(new URL('../../supabase/migrations/', import.meta.url)))
    .filter(name => /^\d{14}_place_worldcup\.sql$/.test(name))
  assert.equal(names.length, 1, 'exactly one place worldcup migration must exist')
  return readFile(new URL(`../../supabase/migrations/${names[0]}`, import.meta.url), 'utf8')
}

async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema quantum_private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object('aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal2'))
    $$;
    create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
    create table public.users(id uuid primary key references auth.users(id) on delete cascade);
    create table public.admins(user_id uuid primary key references public.users(id),role text);
    create function quantum_private.account_deletion_blocks_access(p_user uuid) returns boolean
      language sql stable as $$select current_setting('test.blocked_user',true)=p_user::text$$;
  `)
  const ids = { user: randomUUID(), other: randomUUID(), partner: randomUUID(), admin: randomUUID() }
  for (const id of Object.values(ids)) {
    await db.query('insert into auth.users(id) values($1)', [id])
    await db.query('insert into public.users values($1)', [id])
  }
  await db.query("insert into public.admins values($1,'admin')", [ids.admin])
  await db.exec(await migrationSql())
  return { db, ids }
}

async function as(db, id) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ''])
}

test('research seeds never enter the live bracket until an admin approves two fresh candidates', async () => {
  const fixture = await setup()
  try {
    await as(fixture.db, fixture.ids.user)
    let catalog = (await fixture.db.query("select public.get_place_worldcup_catalog('boardgame') value")).rows[0].value
    assert.equal(catalog.state, 'under_review')
    assert.equal(catalog.candidate_count, 0)
    assert.deepEqual(catalog.candidates, [])

    await as(fixture.db, fixture.ids.admin)
    const queue = (await fixture.db.query('select public.operator_list_place_worldcup_queue() value')).rows[0].value
    const drafts = queue.items.filter(item => item.entity_kind === 'candidate')
    assert.equal(drafts.length, 2)
    for (const draft of drafts) {
      const payload = JSON.stringify({
        entity_kind: 'candidate', entity_id: draft.id, decision: 'approve',
        expected_revision: draft.revision, idempotency_key: randomUUID(),
      })
      const first = (await fixture.db.query('select public.operator_review_place_worldcup($1::jsonb) value', [payload])).rows[0].value
      const replay = (await fixture.db.query('select public.operator_review_place_worldcup($1::jsonb) value', [payload])).rows[0].value
      assert.deepEqual(replay, first)
    }
    await as(fixture.db, fixture.ids.user)
    catalog = (await fixture.db.query("select public.get_place_worldcup_catalog('boardgame') value")).rows[0].value
    assert.equal(catalog.state, 'ready')
    assert.equal(catalog.candidate_count, 2)
    assert.equal(catalog.candidates.length, 2)
  } finally { await fixture.db.close() }
})

test('suggestion submission is owner-bound, idempotent and never fetches or publishes the URL', async () => {
  const fixture = await setup()
  try {
    await as(fixture.db, fixture.ids.user)
    const payload = {
      kind: 'new', category: 'pc', target_candidate_id: null, place_name: '새 장소',
      address: '부산 금정구 대학로 1', source_url: 'https://example.com/store', note: '',
      idempotency_key: randomUUID(),
    }
    const first = (await fixture.db.query('select public.submit_place_worldcup_suggestion($1::jsonb) value', [JSON.stringify(payload)])).rows[0].value
    const replay = (await fixture.db.query('select public.submit_place_worldcup_suggestion($1::jsonb) value', [JSON.stringify(payload)])).rows[0].value
    assert.deepEqual(replay, first)
    await assert.rejects(
      () => fixture.db.query('select public.submit_place_worldcup_suggestion($1::jsonb)', [JSON.stringify({ ...payload, place_name: '다른 곳' })]),
      /idempotency_conflict/,
    )
    assert.equal((await fixture.db.query('select count(*)::int n from quantum_private.place_worldcup_suggestions')).rows[0].n, 1)
    assert.equal(first.status, 'pending')
  } finally { await fixture.db.close() }
})

test('only admins review: venue partners and ordinary users cannot publish candidates', async () => {
  const fixture = await setup()
  try {
    await as(fixture.db, fixture.ids.partner)
    await assert.rejects(() => fixture.db.query('select public.operator_list_place_worldcup_queue()'), /operator_required/)
    await as(fixture.db, fixture.ids.other)
    await assert.rejects(() => fixture.db.query('select public.operator_list_place_worldcup_queue()'), /operator_required/)
    await as(fixture.db, fixture.ids.admin)
    await fixture.db.query("select set_config('request.jwt.claim.aal','aal1',false)")
    await assert.rejects(() => fixture.db.query('select public.operator_list_place_worldcup_queue()'), /mfa_required/)
    await fixture.db.query("select set_config('request.jwt.claim.aal','aal2',false)")
    const privileges = await fixture.db.query(`select
      has_table_privilege('authenticated','quantum_private.place_worldcup_candidates','select') candidate_read,
      has_table_privilege('authenticated','quantum_private.place_worldcup_suggestions','select') suggestion_read,
      has_function_privilege('anon','public.get_place_worldcup_catalog(text)','execute') anon_catalog`)
    assert.deepEqual(privileges.rows[0], { candidate_read: false, suggestion_read: false, anon_catalog: false })
  } finally { await fixture.db.close() }
})

test('deleted, banned and deletion-blocked accounts fail closed and suggestions cascade on account deletion', async () => {
  const fixture = await setup()
  try {
    await as(fixture.db, fixture.ids.user)
    const payload = JSON.stringify({
      kind: 'new', category: 'gym', target_candidate_id: null, place_name: '운동 공간',
      address: '부산 금정구', source_url: 'https://example.com/gym', note: '', idempotency_key: randomUUID(),
    })
    await fixture.db.query('select public.submit_place_worldcup_suggestion($1::jsonb)', [payload])
    await fixture.db.query("select set_config('test.blocked_user',$1,false)", [fixture.ids.user])
    await assert.rejects(() => fixture.db.query("select public.get_place_worldcup_catalog('gym')"), /account_unavailable/)
    await fixture.db.query("select set_config('test.blocked_user','',false)")
    await fixture.db.query("update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=$1", [fixture.ids.other])
    await as(fixture.db, fixture.ids.other)
    await assert.rejects(() => fixture.db.query("select public.get_place_worldcup_catalog('gym')"), /account_unavailable/)
    await fixture.db.query('update auth.users set deleted_at=clock_timestamp() where id=$1', [fixture.ids.partner])
    await as(fixture.db, fixture.ids.partner)
    await assert.rejects(() => fixture.db.query("select public.get_place_worldcup_catalog('gym')"), /account_unavailable/)
    await as(fixture.db, fixture.ids.user)
    await fixture.db.query('delete from auth.users where id=$1', [fixture.ids.user])
    assert.equal((await fixture.db.query('select count(*)::int n from quantum_private.place_worldcup_suggestions')).rows[0].n, 0)
  } finally { await fixture.db.close() }
})

test('stale and insufficient catalogs are distinct and no public vote table exists', async () => {
  const fixture = await setup()
  try {
    await as(fixture.db, fixture.ids.user)
    assert.equal((await fixture.db.query("select public.get_place_worldcup_catalog('pc') value")).rows[0].value.state, 'insufficient')
    await as(fixture.db, fixture.ids.admin)
    const draft = (await fixture.db.query('select public.operator_list_place_worldcup_queue() value')).rows[0].value.items[0]
    await fixture.db.query('select public.operator_review_place_worldcup($1::jsonb)', [JSON.stringify({
      entity_kind: 'candidate', entity_id: draft.id, decision: 'approve', expected_revision: draft.revision,
      idempotency_key: randomUUID(),
    })])
    await fixture.db.query("update quantum_private.place_worldcup_candidates set verified_at=clock_timestamp()-interval '91 days', review_due_at=clock_timestamp()-interval '1 day' where id=$1", [draft.id])
    await as(fixture.db, fixture.ids.user)
    assert.equal((await fixture.db.query("select public.get_place_worldcup_catalog('boardgame') value")).rows[0].value.state, 'stale')
    assert.equal((await fixture.db.query("select to_regclass('public.place_worldcup_votes') value")).rows[0].value, null)
  } finally { await fixture.db.close() }
})

test('catalog deterministically returns the newest 64 of 65 fresh approved candidates', async () => {
  const fixture = await setup()
  try {
    await fixture.db.query(`
      insert into quantum_private.place_worldcup_candidates (
        id, candidate_key, category, place_name, address, map_query, source_url, status,
        verified_at, review_due_at, reviewed_by
      )
      select
        ('10000000-0000-0000-0000-' || lpad(slot::text, 12, '0'))::uuid,
        'catalog-boundary-' || slot,
        'gym',
        '검수 헬스장 ' || lpad(slot::text, 2, '0'),
        '부산 금정구 ' || slot,
        '부산 검수 헬스장 ' || slot,
        'https://example.com/gym/' || slot,
        'approved',
        '2026-09-09 00:00:00+00'::timestamptz,
        '2099-01-01 00:00:00+00'::timestamptz,
        $1
      from generate_series(1, 65) slot
    `, [fixture.ids.admin])

    await as(fixture.db, fixture.ids.user)
    const first = (await fixture.db.query("select public.get_place_worldcup_catalog('gym') value")).rows[0].value
    const second = (await fixture.db.query("select public.get_place_worldcup_catalog('gym') value")).rows[0].value
    assert.equal(first.state, 'ready')
    assert.equal(first.candidate_count, 64, 'candidate_count means candidates included in this response')
    assert.equal(first.candidates.length, 64)
    assert.deepEqual(second, first, 'the capped catalog and revision must be stable for unchanged rows')
    assert.ok(first.candidates.some(candidate => candidate.name === '검수 헬스장 64'))
    assert.ok(!first.candidates.some(candidate => candidate.name === '검수 헬스장 65'))
  } finally { await fixture.db.close() }
})

test('operator queue returns the oldest 500 of 501 pending rows and advances after review', async () => {
  const fixture = await setup()
  try {
    await fixture.db.query(`
      insert into quantum_private.place_worldcup_candidates (
        id, candidate_key, category, place_name, address, map_query, source_url, status, created_at
      )
      select
        ('20000000-0000-0000-0000-' || lpad(slot::text, 12, '0'))::uuid,
        'queue-boundary-' || slot,
        'pc',
        '검수 대기 ' || lpad(slot::text, 3, '0'),
        '부산 금정구 ' || slot,
        '부산 검수 대기 ' || slot,
        'https://example.com/pc/' || slot,
        'research_draft',
        '2020-01-01 00:00:00+00'::timestamptz + slot * interval '1 second'
      from generate_series(1, 501) slot
    `)

    await as(fixture.db, fixture.ids.admin)
    const first = (await fixture.db.query('select public.operator_list_place_worldcup_queue() value')).rows[0].value.items
    assert.equal(first.length, 500)
    assert.equal(first[0].name, '검수 대기 001')
    assert.equal(first[499].name, '검수 대기 500')
    assert.ok(!first.some(item => item.name === '검수 대기 501'))

    await fixture.db.query('select public.operator_review_place_worldcup($1::jsonb)', [JSON.stringify({
      entity_kind: 'candidate', entity_id: first[0].id, decision: 'reject',
      expected_revision: first[0].revision, idempotency_key: randomUUID(),
    })])
    const next = (await fixture.db.query('select public.operator_list_place_worldcup_queue() value')).rows[0].value.items
    assert.equal(next.length, 500)
    assert.equal(next[0].name, '검수 대기 002')
    assert.ok(next.some(item => item.name === '검수 대기 501'))
  } finally { await fixture.db.close() }
})

test('correction suggestions snapshot the target revision and a stale second correction cannot overwrite', async () => {
  const fixture = await setup()
  try {
    await as(fixture.db, fixture.ids.admin)
    const draft = (await fixture.db.query('select public.operator_list_place_worldcup_queue() value')).rows[0].value.items[0]
    await fixture.db.query('select public.operator_review_place_worldcup($1::jsonb)', [JSON.stringify({
      entity_kind: 'candidate', entity_id: draft.id, decision: 'approve', expected_revision: draft.revision,
      idempotency_key: randomUUID(),
    })])

    const correction = (name, key) => JSON.stringify({
      kind: 'correction', category: draft.category, target_candidate_id: draft.id, place_name: name,
      address: draft.address, source_url: draft.source_url, note: '', idempotency_key: key,
    })
    await as(fixture.db, fixture.ids.user)
    await fixture.db.query('select public.submit_place_worldcup_suggestion($1::jsonb)', [correction('첫 수정', randomUUID())])
    await as(fixture.db, fixture.ids.other)
    await fixture.db.query('select public.submit_place_worldcup_suggestion($1::jsonb)', [correction('두 번째 수정', randomUUID())])

    await as(fixture.db, fixture.ids.admin)
    const queue = (await fixture.db.query('select public.operator_list_place_worldcup_queue() value')).rows[0].value.items
    const corrections = queue.filter(item => item.entity_kind === 'suggestion')
    assert.equal(corrections.length, 2)
    assert.equal(corrections[0].target_candidate_revision, 2)
    assert.equal(corrections[1].target_candidate_revision, 2)
    const review = item => JSON.stringify({
      entity_kind: 'suggestion', entity_id: item.id, decision: 'approve', expected_revision: item.revision,
      idempotency_key: randomUUID(),
    })
    const first = corrections.find(item => item.name === '첫 수정')
    const second = corrections.find(item => item.name === '두 번째 수정')
    await fixture.db.query('select public.operator_review_place_worldcup($1::jsonb)', [review(first)])
    await assert.rejects(
      () => fixture.db.query('select public.operator_review_place_worldcup($1::jsonb)', [review(second)]),
      /target_revision_conflict/,
    )
    const candidate = (await fixture.db.query('select place_name,revision from quantum_private.place_worldcup_candidates where id=$1', [draft.id])).rows[0]
    assert.deepEqual(candidate, { place_name: '첫 수정', revision: 3 })
    assert.equal((await fixture.db.query("select count(*)::int n from quantum_private.place_worldcup_suggestions where status='pending'")).rows[0].n, 1)
  } finally { await fixture.db.close() }
})

test('submission cap keeps idempotent replay but rejects a twenty-first unique request', async () => {
  const fixture = await setup()
  try {
    await as(fixture.db, fixture.ids.user)
    const key = randomUUID()
    const payload = index => ({
      kind: 'new', category: 'pc', target_candidate_id: null, place_name: `장소 ${index}`,
      address: `부산 금정구 ${index}`, source_url: `https://example.com/store/${index}`, note: '',
      idempotency_key: index === 0 ? key : randomUUID(),
    })
    const first = (await fixture.db.query('select public.submit_place_worldcup_suggestion($1::jsonb) value', [JSON.stringify(payload(0))])).rows[0].value
    for (let index = 1; index < 20; index += 1) {
      await fixture.db.query('select public.submit_place_worldcup_suggestion($1::jsonb)', [JSON.stringify(payload(index))])
    }
    const replay = (await fixture.db.query('select public.submit_place_worldcup_suggestion($1::jsonb) value', [JSON.stringify(payload(0))])).rows[0].value
    assert.deepEqual(replay, first)
    await assert.rejects(
      () => fixture.db.query('select public.submit_place_worldcup_suggestion($1::jsonb)', [JSON.stringify(payload(20))]),
      /rate_limited/,
    )
    assert.equal((await fixture.db.query('select count(*)::int n from quantum_private.place_worldcup_suggestions')).rows[0].n, 20)
  } finally { await fixture.db.close() }
})
