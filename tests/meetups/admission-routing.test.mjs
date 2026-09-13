import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8')

test('nonmembers enter the deposit application while existing members keep leave and chat', async () => {
  const source = await read('components/meetups/MeetupDetailExperience.tsx')
  assert.match(source, /\/apply`/)
  assert.match(source, /보증금 확인하고 참가 신청/)
  assert.doesNotMatch(source, /method: leaving \? 'DELETE' : 'POST'/)
  assert.match(source, /method: 'DELETE'/)
  assert.match(source, /참가자 채팅으로/)
})

test('the custom meetup list also routes applicants through deposits instead of legacy immediate join', async () => {
  const source = await read('components/meetups/MeetupHub.tsx')
  assert.match(source, /\/apply`/)
  assert.match(source, /보증금 확인·신청/)
  assert.doesNotMatch(source, /method: meetup.joined \? 'DELETE' : 'POST'/)
})

test('application rehearsal is restricted by development and offline runtime, never a production query flag', async () => {
  const source = await read('app/meetups/dev-application/page.tsx')
  assert.match(source, /NODE_ENV !== 'development'/)
  assert.match(source, /QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui'/)
  assert.match(source, /notFound\(\)/)
})

test('legacy HTTP join no longer admits without a deposit application; leave remains intact', async () => {
  const source = await read('app/api/meetups/[id]/join/route.ts')
  const exports = {}, calls = []
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase-request': { createSupabaseRequestClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'viewer' } }, error: null }) }, rpc: async name => { calls.push(name); return { data: {}, error: null } } }) },
    '@/lib/auth/trusted-origin': { assertTrustedMutationOrigin() {}, TrustedOriginError: class extends Error {} },
    '@/lib/meetups/http': { meetupRpcErrorResponse: () => Response.json({}, { status: 500 }) },
    '@/lib/utils': { isSupabaseConfigured: () => true },
  }
  new Function('exports', 'require', compiled)(exports, name => dependencies[name])
  const id = '10000000-0000-4000-8000-000000000001', context = { params: Promise.resolve({ id }) }
  const response = await exports.POST(new Request('https://quantum.example/api/meetups/' + id + '/join', { method: 'POST' }), context)
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error, 'meetup_application_required')
  assert.deepEqual(calls, [])
  assert.equal((await exports.DELETE(new Request('https://quantum.example/api/meetups/' + id + '/join', { method: 'DELETE' }), context)).status, 200)
  assert.deepEqual(calls, ['leave_activity_meetup'])
})
