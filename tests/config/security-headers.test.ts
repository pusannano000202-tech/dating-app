import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const config = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8')

test('Next responses set baseline browser security headers without breaking OAuth popups', () => {
  assert.match(config, /async headers\(\)/)
  assert.match(config, /X-Content-Type-Options[\s\S]*nosniff/)
  assert.match(config, /Referrer-Policy[\s\S]*strict-origin-when-cross-origin/)
  assert.match(config, /X-Frame-Options[\s\S]*DENY/)
  assert.match(config, /Cross-Origin-Opener-Policy[\s\S]*same-origin-allow-popups/)
  assert.match(config, /Permissions-Policy/)
  assert.match(config, /Content-Security-Policy[\s\S]*frame-ancestors 'none'/)
})
