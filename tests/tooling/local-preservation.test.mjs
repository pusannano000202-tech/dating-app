import test from 'node:test'
import assert from 'node:assert/strict'
import { compareInventories, readLocalInventory } from '../../scripts/qa/check-local-preservation.mjs'

test('different local totals never become an invented data loss or restoration claim', () => {
  const result = compareInventories([{ label: 'old', rows: 8 }, { label: 'new', rows: 2 }])
  assert.equal(result.dataCopied, false)
  assert.equal(result.allHistoricalDataVerified, false)
  assert.match(result.warning, /not lost-row counts/)
})
test('unknown or misbound local database target is rejected before counting', () => {
  assert.throws(() => readLocalInventory({ label: 'remote', container: 'other', port: '5432' }), /unknown_local_database/)
  assert.throws(() => readLocalInventory({ label: 'integrated-local', container: 'supabase_db_quantum-integrated-campus-20260905', port: '56422' }, () => '{"5432/tcp":[{"HostPort":"56322"}]}'), /local_database_port_mismatch/)
})
