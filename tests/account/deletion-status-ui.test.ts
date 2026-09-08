import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const COMPONENT_PATH = resolve('components/account/AccountDeletionStatus.tsx')
const COMPILED_COMPONENT_PATH = resolve('.tmp/account-tests/components/account/AccountDeletionStatus.js')

test('account overview includes the deletion status card', () => {
  assert.equal(existsSync(COMPONENT_PATH), true, 'AccountDeletionStatus component must exist')
  if (!existsSync(COMPONENT_PATH)) return

  const page = readFileSync(resolve('app/account/page.tsx'), 'utf8')
  assert.match(page, /import AccountDeletionStatus from ['"]@\/components\/account\/AccountDeletionStatus['"]/)
  assert.match(page, /<AccountDeletionStatus\s*\/>/)
})

test('deletion status response parser keeps only public status and request time', () => {
  const component = require(COMPILED_COMPONENT_PATH) as Record<string, unknown>
  assert.equal(typeof component.parseAccountDeletionStatusPayload, 'function')
  if (typeof component.parseAccountDeletionStatusPayload !== 'function') return
  const parse = component.parseAccountDeletionStatusPayload as (status: number, payload: unknown) => unknown

  assert.deepEqual(parse(401, { error: 'unauthenticated' }), { kind: 'unauthenticated' })
  assert.deepEqual(parse(200, { request: null }), { kind: 'unrequested' })
  assert.deepEqual(parse(200, {
    request: {
      request_id: 'must-not-reach-the-view',
      status: 'cleanup_pending',
      requested_at: '2026-09-07T01:02:03.000Z',
      completed_at: null,
    },
  }), {
    kind: 'request',
    status: 'cleanup_pending',
    requestedAt: '2026-09-07T01:02:03.000Z',
  })
  assert.deepEqual(parse(503, { error: 'service_unavailable' }), { kind: 'error' })
  assert.deepEqual(parse(200, { request: { status: 'internal_only', requested_at: '2026-09-07T01:02:03Z' } }), { kind: 'error' })
  assert.deepEqual(parse(200, { request: { status: 'requested', requested_at: 'not-a-date' } }), { kind: 'error' })
})

test('every server status has explicit safe presentation and pending work explains automatic retry', () => {
  const component = require(COMPILED_COMPONENT_PATH) as Record<string, unknown>
  assert.equal(typeof component.getAccountDeletionStatusPresentation, 'function')
  if (typeof component.getAccountDeletionStatusPresentation !== 'function') return
  const present = component.getAccountDeletionStatusPresentation as (status: string) => {
    title: string
    statusLabel: string
    body: string
    processing: boolean
  }

  for (const status of ['requested', 'cleanup_pending', 'retry_wait', 'auth_delete_pending']) {
    const view = present(status)
    assert.equal(view.processing, true)
    assert.match(view.body, /자동.*다시 시도|자동 재시도/)
    assert.match(view.body, /운영.*활성화/)
  }
  assert.deepEqual(present('completed'), {
    title: '계정 삭제가 완료됐어요',
    statusLabel: '삭제 완료',
    body: '계정과 정리 대상 파일의 삭제 처리가 완료됐어요.',
    processing: false,
  })
  assert.equal(present('cancelled').processing, false)
})

test('client status card uses GET-only refresh and the exact reauthentication route', () => {
  const component = readFileSync(COMPONENT_PATH, 'utf8')
  assert.match(component, /fetch\(['"]\/api\/account\/deletion['"],\s*\{\s*cache:\s*['"]no-store['"]\s*\}\)/)
  assert.doesNotMatch(component, /method:\s*['"]POST['"]/)
  assert.match(component, /href="\/login\?reauth=1&redirect=%2Faccount"/)
  assert.match(component, />\s*새로고침\s*</)
  assert.match(component, /요청 시각/)
})
