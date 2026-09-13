import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server.js'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import * as icons from 'lucide-react'

function load(path, dependencies = {}) {
  const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => dependencies[name], URL, process, console })
  return exports
}

const redirect = load('lib/auth/redirect.ts')
const oauth = load('lib/auth/oauth-login.ts', { './redirect': redirect })
const roomId = '11111111-1111-4111-8111-111111111111'
const room = '/meetups/' + roomId
const share = load('lib/meetups/share.ts')

test('OAuth cancellation and retry retain the exact safe recruitment room', () => {
  assert.equal(typeof oauth.getOAuthRetryUrl, 'function', 'OAuth error recovery must retain the room')
  const retry = new URL(oauth.getOAuthRetryUrl('https://quantum.test', room, 'access_denied'))
  assert.equal(retry.pathname, '/login')
  assert.equal(retry.searchParams.get('redirect'), room)
  assert.match(retry.searchParams.get('auth_error'), /취소/)
  const continued = redirect.getPostLoginDestination({ requestedRedirect: retry.searchParams.get('redirect') })
  assert.equal(continued, '/auth/continue?next=' + encodeURIComponent(room))
  assert.equal(redirect.getRoleDestination('user', room), room)
})

test('OAuth retry cannot preserve external or encoded redirect tricks', () => {
  assert.equal(typeof oauth.getOAuthRetryUrl, 'function')
  for (const unsafe of ['https://evil.example', '//evil.example', '/%255cevil.example', '/login', '/auth/continue?next=/admin']) {
    const retry = new URL(oauth.getOAuthRetryUrl('https://quantum.test', unsafe))
    assert.equal(retry.origin, 'https://quantum.test')
    assert.equal(retry.searchParams.has('redirect'), false)
  }
})

test('share URLs use only the exact room on the current public HTTPS origin', () => {
  assert.equal(share.getMeetupShareUrl(roomId, 'https://quantum.school'), 'https://quantum.school' + room)
  assert.equal(share.getMeetupShareUrl(roomId, 'https://quantum.school/'), 'https://quantum.school' + room)
  for (const origin of ['http://localhost:3010', 'https://localhost', 'https://localhost.', 'https://127.0.0.1', 'https://192.168.0.1', 'https://[::1]', 'https://computer.local', 'https://internal', 'http://quantum.school', 'https://example.com', 'https://user:pass@quantum.school', 'https://quantum.school/path', 'https://quantum.school?next=/room']) {
    assert.equal(share.getMeetupShareUrl(roomId, origin), null, origin)
  }
  for (const id of ['../admin', '//evil.example', roomId + '?created=1', roomId + '#admin', 'invalid']) {
    assert.equal(share.getMeetupShareUrl(id, 'https://quantum.school'), null, id)
  }
})

test('native share uses a single user-selected operation; cancellation never copies or sends again', async () => {
  const data = { title: '모임', text: '함께해요', url: 'https://quantum.school' + room }
  let shared = 0, copied = 0
  const device = { share: async value => { shared++; assert.equal(value, data); throw { name: 'AbortError' } }, clipboard: { writeText: async () => { copied++ } } }
  assert.equal(await share.shareMeetupWithDevice(device, data), 'cancelled')
  assert.equal(shared, 1)
  assert.equal(copied, 0)
  device.share = async () => { shared++ }
  assert.equal(await share.shareMeetupWithDevice(device, data), 'opened')
  assert.equal(shared, 2)
  assert.equal(copied, 0)
  device.share = async () => { throw new Error('denied') }
  assert.equal(await share.shareMeetupWithDevice(device, data), 'failed')
  assert.equal(copied, 0)
})

test('unsupported device share and clipboard failures are truthful and recoverable', async () => {
  const data = { title: '모임', text: '함께해요', url: 'https://quantum.school' + room }
  assert.equal(await share.shareMeetupWithDevice({}, data), 'unsupported')
  assert.equal(await share.shareMeetupWithDevice({ share: async () => assert.fail('must not launch'), canShare: () => false }, data), 'unsupported')
  assert.equal(share.canShareMeetup({ share() {}, canShare() { throw new Error('denied') } }, data), false)
  assert.equal(await share.copyMeetupShareLink({}, data.url), 'unsupported')
  assert.equal(await share.copyMeetupShareLink({ clipboard: { writeText: async () => { throw new Error('denied') } } }, data.url), 'failed')
  let copied
  assert.equal(await share.copyMeetupShareLink({ clipboard: { writeText: async value => { copied = value } } }, data.url), 'copied')
  assert.equal(copied, data.url)
})

test('actual OAuth callback cancellation, missing-code and exchange-error branches retain safe room', async () => {
  const callback = load('app/auth/callback/route.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth: { exchangeCodeForSession: async () => ({ error: { message: 'private diagnostic' } }) } }) },
    'next/server': { NextResponse },
    '@/lib/auth/redirect': redirect,
    '@/lib/auth/oauth-login': oauth,
    '@/lib/utils': { getPublicAppOrigin: () => 'https://quantum.school', getSupabaseConfigIssue: () => null, getSupabaseUrl: () => 'https://unused.invalid', getSupabasePublicKey: () => 'unused' },
  })
  for (const state of ['error=access_denied', '', 'code=failed-exchange']) {
    for (const destination of [room, '//evil.example', '/%255cevil.example']) {
      const response = await callback.GET(new NextRequest('https://quantum.school/auth/callback?' + state + '&next=' + encodeURIComponent(destination)))
      const location = new URL(response.headers.get('location'))
      assert.equal(location.origin, 'https://quantum.school')
      assert.equal(location.pathname, '/login')
      assert.equal(location.searchParams.get('redirect'), destination === room ? room : null)
      assert.doesNotMatch(location.searchParams.get('auth_error'), /private diagnostic/)
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
    }
  }
})

test('signed-in login visits preserve safe room through the role resolver and reject external targets', async () => {
  const middleware = load('middleware.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) } }) },
    'next/server': { NextResponse },
    './lib/dev-auth': { isDevAuthBypassEnabled: () => false, shouldIssueDevAuthCookie: () => false },
    './lib/auth/redirect': redirect,
    './lib/auth/account-access': { requiresAccountAccessCheck: () => false, hasConflictingApiActors: () => false },
    './lib/supabase-request': {},
    './lib/auth/service-unavailable': { AUTH_SERVICE_RECOVERY_PATH: '/auth/service-unavailable' },
    './lib/utils': { getPublicAppOrigin: () => 'https://quantum.school', isSupabaseConfigured: () => true, getSupabaseUrl: () => 'https://unused.invalid', getSupabasePublicKey: () => 'unused' },
  }).middleware
  for (const destination of [room, '//evil.example', '/%255cevil.example']) {
    const response = await middleware(new NextRequest('https://quantum.school/login?redirect=' + encodeURIComponent(destination)))
    const location = new URL(response.headers.get('location'))
    assert.equal(location.origin, 'https://quantum.school')
    assert.equal(location.pathname, '/auth/continue')
    assert.equal(location.searchParams.get('next'), destination === room ? room : null)
  }
})

test('the share sheet renders real installed icons and local mode never exposes a public link', () => {
  const Sheet = load('components/meetups/MeetupShareSheet.tsx', {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'lucide-react': icons,
    '@/lib/kakao-share': { hasKakaoJavaScriptKey: () => false },
    '@/lib/meetups/share': share,
    './meetup-share.module.css': { default: {} },
  }).default
  const html = renderToStaticMarkup(React.createElement(Sheet, { meetupId: roomId, title: '함께 공부해요', onClose() {} }))
  assert.match(html, /친구에게 모임 보내기/)
  assert.match(html, /인스타그램/)
  assert.match(html, /다른 기기에서 열 수 없어요/)
  assert.match(html, /DM에 보낼 링크 복사/)
  assert.doesNotMatch(html, /<input|(?:value|href)="https?:\/\//)
  assert.doesNotMatch(html, /지금은 기기 공유나 링크 복사를 이용/)
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3)
})
