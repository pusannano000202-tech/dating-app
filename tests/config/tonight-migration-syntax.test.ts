import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('pending Tonight migrations use PostgreSQL conditional expressions without schema qualification', () => {
  const directory = path.join(process.cwd(), 'supabase', 'migrations')
  // Already-published history is not rewritten by this release check.
  const candidates = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.sql') && name >= '20260902000000')
  assert.ok(candidates.length > 0)
  const invalid: string[] = []
  for (const name of candidates) {
    const sql = fs.readFileSync(path.join(directory, name), 'utf8')
    sql.split(/\r?\n/).forEach((line, index) => {
      if (/\bpg_catalog\s*\.\s*(?:greatest|least|coalesce|nullif)\s*\(/i.test(line)) {
        invalid.push(`${name}:${index + 1}`)
      }
    })
  }
  assert.deepEqual(invalid, [], 'Conditional expressions are SQL syntax, not schema-qualified functions')
})
