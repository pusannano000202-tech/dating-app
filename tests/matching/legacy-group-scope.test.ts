import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { getLegacyGroupScope } from '../../lib/matching/legacy-group-scope'

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('only an active legacy group can continue through the legacy management screen', () => {
  assert.equal(getLegacyGroupScope(null), 'redirect_to_match')
  assert.equal(getLegacyGroupScope({ status: 'forming' }), 'continue')
  assert.equal(getLegacyGroupScope({ status: 'ready' }), 'continue')
  assert.equal(getLegacyGroupScope({ status: 'in_pool' }), 'continue')
  assert.equal(getLegacyGroupScope({ status: 'matched' }), 'continue')
  assert.equal(getLegacyGroupScope({ status: 'completed' }), 'redirect_to_match')
  assert.equal(getLegacyGroupScope({ status: 'disbanded' }), 'redirect_to_match')
})

test('legacy group page reads existing state without creating a new group automatically', () => {
  const groupCreate = readSource('app/group/create/page.tsx')

  assert.match(groupCreate, /fetch\('\/api\/groups'\)/)
  assert.doesNotMatch(
    groupCreate,
    /fetch\('\/api\/groups',\s*\{[\s\S]{0,160}?method:\s*'POST'/,
  )
  assert.match(groupCreate, /getLegacyGroupScope\(data\.group\)/)
  assert.match(groupCreate, /router\.replace\('\/match'\)/)
})

test('legacy group page no longer exposes retired size and match-setup controls', () => {
  const groupCreate = readSource('app/group/create/page.tsx')

  assert.doesNotMatch(groupCreate, /매칭 규모 선택/)
  assert.doesNotMatch(groupCreate, /<FreeBetaQueuePanel/)
})
