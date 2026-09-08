import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

test('secret scanner covers modern server credentials without printing their values', () => {
  const scanner = readFileSync(join(ROOT, 'scripts/check-secret-leaks.mjs'), 'utf8')
  const probeName = `secret-scan-probe-${process.pid}.txt`
  const modernSupabaseSecret = ['sb', 'secret', 'A'.repeat(40)].join('_')
  const opaqueSecret = 'B'.repeat(48)

  assert.match(scanner, /supabase_secret_key/)
  assert.match(scanner, /server_secret_env/)
  assert.match(scanner, /PAYMENT_INTERNAL_SECRET/)
  assert.match(scanner, /CRON_SECRET/)
  assert.match(scanner, /AI_SERVER_SECRET/)
  assert.match(scanner, /WEB_PUSH_VAPID_PRIVATE_KEY/)
  assert.match(scanner, /CAMPUS_SEVEN_PUSH_CRON_SECRET/)

  // Other test files scan ROOT concurrently. Never put synthetic credentials there.
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'quantum-secret-scan-'))
  const probePath = join(fixtureRoot, probeName)
  try {
    execFileSync('git', ['init', '--quiet', fixtureRoot], { stdio: 'pipe' })
    writeFileSync(probePath, [
      `SUPABASE_SECRET_KEY=${modernSupabaseSecret}`,
      `PAYMENT_INTERNAL_SECRET=${opaqueSecret}`,
      `CRON_SECRET=${opaqueSecret}`,
      `AI_SERVER_SECRET=${opaqueSecret}`,
      `WEB_PUSH_VAPID_PRIVATE_KEY=${opaqueSecret}`,
      `CAMPUS_SEVEN_PUSH_CRON_SECRET=${opaqueSecret}`,
    ].join('\n'))

    assert.throws(
      () => execFileSync(process.execPath, [join(ROOT, 'scripts/check-secret-leaks.mjs'), '--include-untracked'], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
      (error: unknown) => {
        const output = String((error as { stdout?: unknown; stderr?: unknown }).stdout ?? '')
          + String((error as { stdout?: unknown; stderr?: unknown }).stderr ?? '')
        assert.match(output, new RegExp(`${probeName}:1:supabase_secret_key`))
        assert.match(output, new RegExp(`${probeName}:2:server_secret_env`))
        assert.match(output, new RegExp(`${probeName}:6:server_secret_env`))
        assert.doesNotMatch(output, new RegExp(modernSupabaseSecret))
        assert.doesNotMatch(output, new RegExp(opaqueSecret))
        return true
      },
    )
    const rootOutput = execFileSync(process.execPath, ['scripts/check-secret-leaks.mjs', '--include-untracked'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    assert.match(rootOutput, /Tracked and untracked secret scan passed/)
  } finally {
    // Only remove the unique temporary repository created by this test.
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
