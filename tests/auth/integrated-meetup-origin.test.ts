import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('meetup creation and membership commands validate mutation origin before any RPC', () => {
  for (const file of ['app/api/meetups/route.ts', 'app/api/meetups/[id]/join/route.ts']) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /assertTrustedMutationOrigin\((?:req|request)\)/)
    assert.match(source, /private, no-store/)
  }
})
