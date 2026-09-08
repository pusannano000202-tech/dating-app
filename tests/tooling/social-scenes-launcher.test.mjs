import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const launcherUrl = new URL(
  '../../scripts/qa/serve-social-scenes-local.mjs',
  import.meta.url,
)

test('social scenes launcher is fixed to local Supabase 56421 and Next 3013', () => {
  assert.equal(existsSync(launcherUrl), true)
  const source = readFileSync(launcherUrl, 'utf8')

  assert.match(source, /COMMUNITY_VOICE_LOCAL/)
  assert.match(source, /buildCommunityVoiceChildEnvironment/)
  assert.match(source, /assertDedicatedRuntimeConfig/)
  assert.match(source, /assertNoNextEnvironmentFiles/)
  assert.match(source, /preflightIntegratedLocalAuth/)
  assert.match(source, /http:\/\/localhost:3013/)
  assert.match(source, /http:\/\/localhost:3010\/auth\/callback/)
  assert.match(source, /NEXT_DIST_DIR:\s*'\.next-social-scenes-local'/)
  assert.match(
    source,
    /\['node_modules\/next\/dist\/bin\/next', 'dev', '-p', '3013', '-H', '127\.0\.0\.1'\]/,
  )
  assert.doesNotMatch(source, /start-integrated-ui\.mjs/)
  assert.doesNotMatch(
    source,
    /npx\.cmd|'npx'|supabase\.exe|writeFile|mkdir|rmSync|migration up|db reset|taskkill|Stop-Process/,
  )
})

test('social scenes launcher strips hosted credentials and reports local-only limits', () => {
  const source = readFileSync(launcherUrl, 'utf8')

  assert.match(source, /process\.argv\.length !== 2/)
  assert.match(source, /runtime-secrets\.json/)
  assert.match(source, /localUiCanWriteLocalData: true/)
  assert.match(source, /databaseStartedByLauncher: false/)
  assert.match(source, /databaseMigrationsAppliedByLauncher: false/)
  assert.match(source, /realPayments: false/)
  assert.match(source, /paymentProvider: 'mock'/)
  assert.match(source, /automationEnabled: false/)
  assert.match(source, /mediaProviderConfigured: false/)
  assert.match(source, /authCallbackChanged: false/)
  assert.match(source, /localhostCookiesMayBeSharedAcrossPorts: true/)
  assert.doesNotMatch(
    source,
    /console\.log\((?:status|secrets|localEnv|childEnv)\)/,
  )
})

test('social scenes launcher rejects command line overrides before reading runtime secrets', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(launcherUrl), '--port=9999'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Usage: node scripts\/qa\/serve-social-scenes-local\.mjs/)
  assert.doesNotMatch(result.stdout, /SUPABASE|secret|token|key/i)
})
