import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPreservedRecordExport } from '../../lib/campus-eats/preserved-storage'

const key = 'quantum-campus-eats-pnu-chicken-v4'
test('backup preserves malformed and unknown raw records without writes', () => {
  const raw = '{오래된 기록\u0000not-json😀'
  const backup = buildPreservedRecordExport({ getItem: () => raw }, 'pnu', 'chicken', '2026-09-06T00:00:00.000Z')
  assert.equal(JSON.parse(JSON.stringify(backup)).records[0].raw, raw)
  assert.equal(backup.format, 'quantum-campus-eats-raw-backup-v1')
})
test('backup has only explicitly selected campus keys and reports absent records', () => {
  const queried: string[] = []
  const keys = [key, 'quantum-campus-eats-personal-rating-pnu-chicken-v1']
  const backup = buildPreservedRecordExport({ getItem: name => { queried.push(name); return null } }, 'pnu', 'chicken', '2026-09-06T00:00:00.000Z')
  assert.deepEqual(queried, keys)
  assert.deepEqual(backup.records, [])
  assert.deepEqual(backup.missingKeys, keys)
  assert.equal(backup.schoolId, 'pnu')
  assert.equal(backup.categoryId, 'chicken')
})
test('storage read failure does not produce a misleading partial backup', () => {
  assert.throws(() => buildPreservedRecordExport({ getItem: () => { throw new Error('unavailable') } }, 'pnu', 'chicken', '2026-09-06T00:00:00.000Z'), /unavailable/)
})
test('scope cannot inject another storage key or mixed pair', () => {
  for (const school of ['', 'pnu/key', '../auth', 'pnu\u0000']) {
    assert.throws(() => buildPreservedRecordExport({ getItem: () => { throw new Error('must not read') } }, school, 'chicken', '2026-09-06T00:00:00.000Z'), /invalid_backup_scope/)
  }
})
test('backup never reads the battle guide or auth storage', () => {
  const queried: string[] = []
  buildPreservedRecordExport({ getItem: name => { queried.push(name); return '{}' } }, 'pnu', 'coffee-main', '2026-09-06T00:00:00.000Z')
  assert.deepEqual(queried, ['quantum-campus-eats-pnu-coffee-main-v4', 'quantum-campus-eats-personal-rating-pnu-coffee-main-v1'])
})
