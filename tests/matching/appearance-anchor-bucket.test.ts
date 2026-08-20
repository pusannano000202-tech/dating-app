import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260810224500_appearance_anchor_public_bucket.sql'),
  'utf8',
)
const syncScript = readFileSync(
  join(process.cwd(), 'scripts/sync-appearance-anchors.mjs'),
  'utf8',
)

test('approved synthetic anchors use a dedicated public read-only bucket', () => {
  assert.match(migration, /appearance-anchors/i)
  assert.match(migration, /public\s*=\s*TRUE/i)
  assert.match(migration, /image\/png/i)
  assert.match(syncScript, /approved-anchors\.json/i)
  assert.match(syncScript, /reviewStatus\s*!==\s*'approved'/i)
  assert.match(syncScript, /upsert:\s*true/i)
  assert.doesNotMatch(syncScript, /photos['"]/i)
})
