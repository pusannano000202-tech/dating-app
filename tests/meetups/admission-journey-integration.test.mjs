import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { lifecycleFixture } from './admission-lifecycle-fixture.mjs'

// Local HTTP-handler/SQL integration, not a running Next server, GoTrue session,
// PostgREST transport, real provider payment, browser rendering or live RLS proof.
// Only auth/config are controlled. RPC results come from this same memory DB.
const origin = 'https://quantum.test'
const source = path => readFile(new URL('../../' + path, import.meta.url), 'utf8')

async function load(path, dependencies = {}) {
  const compiled = ts.transpileModule(await source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('exports', 'require', 'fetch', compiled)(exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${path}: ${name}`)
    return dependencies[name]
  }, () => assert.fail('External fetch is outside the admission journey fixture'))
  return exports
}

async function journeyFixture() {
  const f = await lifecycleFixture()
  try {
    await f.db.exec(await source('supabase/migrations/20260913103032_meetup_chat_sender_identity.sql'))
    await f.db.query('update quantum_private.activity_meetup_admission_policies set amount_krw=10000 where meetup_id=$1', [f.roomId])
    const actors = { host: f.users.mechanicalCaptain, applicant: f.users.mechanicalMember, member: f.users.mechanicalReserve }
    await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role)values($1,$2,'member')", [f.roomId, actors.member])
    const historyId = (await f.db.query(`insert into public.activity_meetup_messages
      (meetup_id,sender_user_id,sender_alias_snapshot,message,idempotency_key)
      values($1,$2,'기존 참가자','승인 전에 남긴 모임 일정', $3) returning id`, [f.roomId, actors.member, randomUUID()])).rows[0].id
    const calls = []
    const rpcNames = new Set([
      'get_my_activity_meetup_detail', 'get_activity_meetup_admission_context',
      'prepare_activity_meetup_admission', 'get_activity_meetup_admissions',
      'get_my_activity_meetup_admission', 'decide_activity_meetup_admission',
      'get_my_activity_meetup_chat', 'get_activity_meetup_admission_notification',
    ])
    // The map belongs to the harness; request headers cannot choose auth.uid().
    const identities = new WeakMap()
    const transport = { createSupabaseRequestClient(request) {
      const actor = identities.get(request) ?? null
      return {
        auth: { getUser: async () => ({ data: { user: actor ? { id: actor } : null }, error: null }) },
        rpc: async (name, args = {}) => {
          assert.ok(rpcNames.has(name), `Unexpected RPC: ${name}`)
          assert.ok(Object.keys(args).every(key => /^p_[a-z_]+$/.test(key)), 'RPC argument names are identifiers')
          calls.push({ actor, name, args })
          await f.as(actor ?? '')
          await f.db.exec('set role authenticated')
          try {
            const params = Object.values(args).map(value => value && typeof value === 'object' ? JSON.stringify(value) : value)
            const named = Object.keys(args).map((key, index) => `${key}=>$${index + 1}`).join(',')
            const data = await f.value(`select public.${name}(${named}) as value`, params)
            return { data, error: null }
          } catch (error) {
            return { data: null, error: { message: error.message, code: error.code } }
          } finally { await f.db.exec('reset role') }
        },
      }
    } }
    const input = await load('lib/server/tonight/api-contract.ts')
    const originModule = await load('lib/auth/trusted-origin.ts', {
      './api-request-auth': await load('lib/auth/api-request-auth.ts'),
      './strict-app-origin': await load('lib/auth/strict-app-origin.ts'),
    })
    const trustedOrigin = { ...originModule, assertTrustedMutationOrigin: request => originModule.assertTrustedMutationOrigin(request, origin) }
    const http = await load('lib/meetups/http.ts', { '../server/tonight/api-contract': input, '../auth/trusted-origin': originModule })
    const contract = await load('lib/meetups/admission-contract.ts')
    const server = await load('lib/meetups/admission-server.ts', { './admission-contract': contract })
    const lifecycle = await load('lib/meetups/admission-lifecycle.ts', { './admission-contract': contract, './admission-server': server })
    const config = { isSupabaseConfigured: () => true }
    const admissionHttp = await load('lib/meetups/admission-http.ts', {
      '@/lib/auth/trusted-origin': trustedOrigin, './admission-contract': contract,
      './admission-server': server, './http': http, '@/lib/supabase-request': transport, '@/lib/utils': config,
    })
    const dependencies = {
      '@/lib/auth/trusted-origin': trustedOrigin, '@/lib/meetups/admission-contract': contract,
      '@/lib/meetups/admission-server': server, '@/lib/meetups/admission-lifecycle': lifecycle,
      '@/lib/meetups/admission-http': admissionHttp, '@/lib/meetups/http': http,
      '@/lib/supabase-request': transport, '@/lib/utils': config, '@/lib/server/tonight/api-contract': input,
    }
    const routes = {
      application: await load('app/api/meetups/[id]/application/route.ts', dependencies),
      management: await load('app/api/meetups/[id]/applications/route.ts', dependencies),
      status: await load('app/api/meetups/[id]/application/status/route.ts', dependencies),
      chat: await load('app/api/meetups/[id]/chat/route.ts', dependencies),
      notification: await load('app/api/notifications/social/route.ts', {
        '@/lib/notifications/social-server': await load('lib/notifications/social-server.ts', dependencies),
      }),
    }
    async function request(route, actor, { method = 'GET', body, query = '', headers = {} } = {}) {
      const request = new Request(`${origin}/api/meetups/${f.roomId}/${route}${query}`, {
        method, headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      identities.set(request, actor)
      const response = await routes[route][method](request, { params: Promise.resolve({ id: f.roomId }) })
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      return { status: response.status, body: await response.json() }
    }
    async function prepare() {
      const context = await request('application', actors.applicant)
      assert.equal(context.status, 200, JSON.stringify(context.body))
      assert.equal(context.body.quote.amountKrw, 10000)
      const response = await request('application', actors.applicant, { method: 'POST', body: {
        intro: '지원자의 비공개 소개', strength: '기록을 잘해요', paymentMethod: 'new', consent: true,
        policyVersion: context.body.quote.policyVersion, quoteId: context.body.quote.id, idempotencyKey: randomUUID(),
      } })
      assert.equal(response.status, 200, JSON.stringify(response.body))
      return response.body
    }
    const notifications = async (actor, event) => (await f.db.query(
      "select id,payload from public.notifications where user_id=$1 and payload->>'event'=$2 order by created_at,id", [actor, event],
    )).rows
    const joined = async actor => (await f.db.query(
      "select count(*)::int n from public.activity_meetup_members where meetup_id=$1 and user_id=$2 and status='joined'", [f.roomId, actor],
    )).rows[0].n
    const confirm = (intentId, receipt = randomUUID()) => f.confirm(intentId, receipt, 10000)
    return { ...f, actors, historyId, calls, request, prepare, notifications, joined, confirm }
  } catch (error) { await f.db.close(); throw error }
}

test('one memory DB connects HTTP preparation, paid request notices, host approval and prior chat access', async () => {
  const f = await journeyFixture()
  try {
    const { host, applicant, member } = f.actors
    const draft = await f.prepare()
    assert.equal(draft.admission, 'draft')
    assert.equal(draft.payment, 'unpaid')
    assert.equal(await f.joined(applicant), 0)
    assert.equal((await f.notifications(host, 'application_received')).length, 0)
    assert.equal((await f.request('management', host)).body.pendingCount, 0)
    assert.equal((await f.request('chat', applicant)).status, 404)

    // Explicit synthetic provider boundary: no HTTP call or real charge is made.
    const receipt = randomUUID(), paid = await f.confirm(draft.intentId, receipt)
    assert.deepEqual(await f.confirm(draft.intentId, receipt), paid)
    const pending = await f.request('status', applicant)
    assert.equal(pending.status, 200)
    assert.equal(pending.body.accountKey, applicant)
    assert.deepEqual(pending.body.application, paid)
    assert.equal(paid.admission, 'pending')
    assert.equal(paid.payment, 'held')
    assert.equal(paid.chatHref, null)
    assert.equal(await f.joined(applicant), 0)
    assert.equal((await f.request('chat', applicant)).status, 404)

    const hostNotices = await f.notifications(host, 'application_received')
    const memberNotices = await f.notifications(member, 'application_notice')
    assert.equal(hostNotices.length, 1)
    assert.equal(memberNotices.length, 1)
    const management = await f.request('management', host)
    assert.equal(management.status, 200, JSON.stringify(management.body))
    assert.equal(management.body.pendingCount, 1)
    assert.equal(management.body.applications[0].id, paid.id)
    assert.equal(management.body.applications[0].intro, '지원자의 비공개 소개')
    const memberView = await f.request('management', member)
    assert.equal(memberView.status, 200)
    assert.deepEqual(memberView.body.applications, [])
    assert.equal(memberView.body.notices.filter(n => n.kind === 'application_received').length, 1)
    for (const privateValue of [applicant, '지원자의 비공개 소개', '기록을 잘해요']) {
      assert.ok(!JSON.stringify(memberView.body).includes(privateValue))
      assert.ok(!JSON.stringify(memberNotices[0].payload).includes(privateValue))
    }
    const resolve = (actor, id) => f.request('notification', actor, { query: `?id=${id}` })
    assert.equal((await resolve(host, hostNotices[0].id)).body.href, `/meetups/${f.roomId}/applications`)
    assert.equal((await resolve(member, memberNotices[0].id)).body.href, `/chat/rooms/meetup/${f.roomId}`)
    assert.equal((await resolve(applicant, hostNotices[0].id)).status, 404)
    const before = await f.request('chat', member)
    assert.equal(before.status, 200)
    assert.equal(before.body.chat.messages[0].id, f.historyId)

    const decision = { method: 'PATCH', body: { applicationId: paid.id, action: 'approve', revision: 0 } }
    const accepted = await f.request('management', host, decision)
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
    assert.equal(accepted.body.admission, 'accepted')
    assert.deepEqual(await f.request('management', host, decision), accepted)
    assert.equal(await f.joined(applicant), 1)
    assert.equal((await f.request('status', applicant)).body.application.chatHref, `/chat/rooms/meetup/${f.roomId}`)
    const acceptedNotices = await f.notifications(applicant, 'application_accepted')
    assert.equal(acceptedNotices.length, 1)
    assert.equal((await resolve(applicant, acceptedNotices[0].id)).body.href, `/chat/rooms/meetup/${f.roomId}`)
    assert.equal((await resolve(host, hostNotices[0].id)).body.status, 'ended')
    assert.equal((await resolve(member, memberNotices[0].id)).body.status, 'ended')
    const chat = await f.request('chat', applicant)
    assert.equal(chat.status, 200)
    assert.equal(chat.body.chat.phase, 'send')
    assert.equal(chat.body.chat.messages[0].id, f.historyId)
    assert.equal(chat.body.chat.messages[0].message, '승인 전에 남긴 모임 일정')
    assert.equal(chat.body.chat.messages[0].is_me, false)
    assert.equal((await f.request('management', member)).body.notices.filter(n => n.kind === 'application_accepted').length, 1)
  } finally { await f.db.close() }
})

test('HTTP authentication, origin, money injection and host checks preserve the pending SQL state', async () => {
  const f = await journeyFixture()
  try {
    const { host, applicant, member } = f.actors
    const paid = await f.confirm((await f.prepare()).intentId)
    const decision = { method: 'PATCH', body: { applicationId: paid.id, action: 'approve', revision: 0 } }
    assert.equal((await f.request('chat', null)).status, 401)
    assert.equal((await f.request('management', null, decision)).status, 401)
    const callCount = f.calls.length
    assert.equal((await f.request('management', host, { ...decision, headers: { Origin: 'https://elsewhere.test' } })).status, 403)
    assert.equal((await f.request('management', host, { ...decision, body: { ...decision.body, paid: true, amountKrw: 1 } })).status, 400)
    assert.equal(f.calls.length, callCount, 'Rejected origin and forged money must not reach SQL')
    for (const actor of [applicant, member]) {
      assert.equal((await f.request('management', actor, decision)).status, 403)
    }
    assert.equal((await f.request('status', applicant)).body.application.admission, 'pending')
    assert.equal(await f.joined(applicant), 0)
    assert.equal((await f.notifications(applicant, 'application_accepted')).length, 0)
    assert.equal((await f.request('chat', applicant)).status, 404)
  } finally { await f.db.close() }
})
