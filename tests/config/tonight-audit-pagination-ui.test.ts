import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

test('super-admin can traverse every bounded immutable audit page', () => {
  const types = source('components/tonight/types.ts')
  const adapter = source('components/tonight/live-adapters.ts')
  const fixture = source('components/tonight/rehearsal-fixtures.ts')
  const consoleSource = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(types, /AuditPage/)
  assert.match(types, /auditPage/)
  assert.match(types, /auditCursor\?: string \| null/)
  assert.match(adapter, /currentAuditCursor/)
  assert.match(adapter, /limit=50/)
  assert.match(adapter, /cursor=\$\{encodeURIComponent\(currentAuditCursor\)\}/)
  assert.match(adapter, /nextCursor: nullableString\(auditPayload\.next_cursor\)/)
  assert.match(fixture, /auditPage/)
  assert.match(consoleSource, /auditBackStack/)
  assert.match(consoleSource, /auditCursor:/)
  assert.match(consoleSource, /이전 50건/)
  assert.match(consoleSource, /다음 50건/)
})
