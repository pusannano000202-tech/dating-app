import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { getQuantumEventApiCatalog } from '../../lib/matching/quantum-event-catalog'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260808171105_matching_quantum_event_participation.sql',
)

test('participation migration accepts every canonical event id', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8')

  for (const event of [...getQuantumEventApiCatalog().tonight, ...getQuantumEventApiCatalog().scheduled]) {
    assert.match(migration, new RegExp(event.id))
  }
})

test('participation migration enforces one owned row and restricted RPC execution', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /user_id\s+uuid\s+primary key/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /auth\.uid\(\)\s+is\s+null/i)
  assert.match(sql, /set search_path\s*=\s*''/i)
  assert.match(sql, /tonight-board-game/)
  assert.match(sql, /scheduled-walk/)
  assert.match(sql, /on conflict \(user_id\)/i)
  assert.match(sql, /revoke execute on function public\.set_my_quantum_event_participation/i)
  assert.match(sql, /grant execute on function public\.set_my_quantum_event_participation[\s\S]*to authenticated/i)
  assert.match(sql, /revoke all on table public\.quantum_event_participations from anon, authenticated/i)
})
