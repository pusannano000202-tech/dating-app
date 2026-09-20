import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'

test('source-sharing disables automatic deployment only for the exact collaboration branch', () => {
  const config=JSON.parse(readFileSync(new URL('../../vercel.json',import.meta.url),'utf8'))
  assert.deepEqual(config.git.deploymentEnabled, {'codex/collab-app-20260920': false})
  assert.equal(Object.hasOwn(config.git.deploymentEnabled,'main'),false)
  assert.ok(config.crons.length > 0, 'existing production cron configuration must remain intact')
})
