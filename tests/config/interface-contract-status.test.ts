import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('public status types follow the persisted match and deposit schema', () => {
  const schema = readSource('supabase/migrations/20260521000001_matching_create_core_tables.sql')
  const types = readSource('lib/types.ts')
  const contract = readSource('docs/engineering/INTERFACE_CONTRACT.md')

  assert.match(
    schema,
    /CHECK \(status IN \('pending', 'confirmed', 'cancelled', 'completed', 'no_show'\)\)/,
  )
  assert.match(
    types,
    /export type MatchStatus = 'pending' \| 'confirmed' \| 'cancelled' \| 'completed' \| 'no_show'/,
  )
  assert.match(
    contract,
    /export type MatchStatus = 'pending' \| 'confirmed' \| 'cancelled' \| 'completed' \| 'no_show'/,
  )

  assert.match(
    schema,
    /CHECK \(status IN \('pending', 'paid', 'held', 'refunded', 'forfeited', 'compensated'\)\)/,
  )
  assert.match(
    types,
    /export type DepositStatus = 'pending' \| 'paid' \| 'held' \| 'refunded' \| 'forfeited' \| 'compensated'/,
  )
  assert.match(
    contract,
    /export type DepositStatus = 'pending' \| 'paid' \| 'held' \| 'refunded' \| 'forfeited' \| 'compensated'/,
  )
})
