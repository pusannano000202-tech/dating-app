import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { getQuantumEventApiCatalog } from '../../lib/matching/quantum-event-catalog'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260808171105_matching_quantum_event_participation.sql',
)
const friendGroupMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260811154000_quantum_event_friend_party_groups.sql',
)
const legacySoloCompatMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260811170000_quantum_event_legacy_solo_compat.sql',
)
const sameGenderGuardMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260811173000_quantum_event_same_gender_friend_guard.sql',
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

test('friend participation is tied to an accepted two or three person group', () => {
  const sql = fs.readFileSync(friendGroupMigrationPath, 'utf8')

  assert.match(sql, /add column if not exists group_id uuid references public\.groups/i)
  assert.match(sql, /friend_group_leader_required/i)
  assert.match(sql, /v_member_count < 2 or v_member_count > 3/i)
  assert.match(sql, /p_group_id uuid/i)
  assert.match(sql, /revoke execute on function public\.set_my_quantum_event_participation\(text, text, text\)/i)
})

test('legacy event participation keeps solo working while rejecting friend applications', () => {
  const sql = fs.readFileSync(legacySoloCompatMigrationPath, 'utf8')

  assert.match(sql, /p_party_type\s*<>\s*'solo'/i)
  assert.match(sql, /friend_group_required/i)
  assert.match(
    sql,
    /public\.set_my_quantum_event_participation\([\s\S]*p_event_id[\s\S]*p_event_mode[\s\S]*p_party_type[\s\S]*null[\s\S]*\)/i,
  )
  assert.match(
    sql,
    /revoke execute on function public\.set_my_quantum_event_participation\(text, text, text\) from public, anon/i,
  )
  assert.match(
    sql,
    /grant execute on function public\.set_my_quantum_event_participation\(text, text, text\) to authenticated/i,
  )
})

test('friend event participation rejects mixed-gender or incomplete group profiles', () => {
  const sql = fs.readFileSync(sameGenderGuardMigrationPath, 'utf8')

  assert.match(sql, /g\.gender/i)
  assert.match(sql, /left join public\.profiles/i)
  assert.match(sql, /is distinct from v_group_gender/i)
  assert.match(sql, /friend_group_gender_mismatch/i)
  assert.match(
    sql,
    /grant execute on function public\.set_my_quantum_event_participation\(text, text, text, uuid\) to authenticated/i,
  )
})
