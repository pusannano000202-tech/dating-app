import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('the shared dev layout returns 404 only in production', () => {
  const layoutPath = path.join(process.cwd(), 'app/dev/layout.tsx')
  assert.equal(existsSync(layoutPath), true, 'app/dev must have a shared production boundary')

  const layout = readFileSync(layoutPath, 'utf8')
  assert.match(layout, /import\s+\{\s*notFound\s*\}\s+from\s+['"]next\/navigation['"]/)
  assert.match(layout, /process\.env\.NODE_ENV\s*===\s*['"]production['"]/)
  assert.match(layout, /notFound\(\)/)
  assert.doesNotMatch(layout, /auth|getUser|redirect\(/i)
})
