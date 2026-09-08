import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createStableMbtiMutationRegistry } from '../../lib/community/mbti/client-mutation'

test('a failed logical mutation keeps the same id until completion', () => {
  let sequence = 0
  const registry = createStableMbtiMutationRegistry(() => `id-${++sequence}`)

  assert.equal(registry.get('delete:experience-a:revision-2'), 'mbti:id-1')
  assert.equal(registry.get('delete:experience-a:revision-2'), 'mbti:id-1')
  assert.equal(registry.get('delete:experience-b:revision-1'), 'mbti:id-2')

  registry.complete('delete:experience-a:revision-2')
  assert.equal(registry.get('delete:experience-a:revision-2'), 'mbti:id-3')
})

test('registry does not persist private mutation details in the server id', () => {
  const registry = createStableMbtiMutationRegistry(() => 'safe-random-suffix')
  assert.equal(
    registry.get('update:experience-a:{"score":5,"relationship":"past"}'),
    'mbti:safe-random-suffix',
  )
})

test('a mutation is not marked complete when the authoritative refresh fails', () => {
  const hub = readFileSync(path.join(process.cwd(), 'components/community/mbti/MbtiHub.tsx'), 'utf8')
  assert.match(hub, /void loadOwnerState\(\)\.catch\(\(\) => \{\s*setAuthenticated\(null\)/)
  assert.match(hub, /await loadOwnerState\(\)\s*setCounts\(\{\}\)\s*setDrafts\(\[\]\)/)
  assert.doesNotMatch(hub, /const loadOwnerState = useCallback\(async \(\) => \{[\s\S]*?\n\s*\} catch \{/)
})
