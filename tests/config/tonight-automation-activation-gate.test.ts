import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { isTonightAutomationEnabled } from '../../lib/server/tonight/automation-gate'

const INTAKE_ROUTES = [
  'app/api/internal/tonight/allocate/route.ts',
  'app/api/internal/tonight/prepare/route.ts',
] as const

const OBLIGATION_ROUTES = [
  'app/api/internal/tonight/deposit-gate/route.ts',
  'app/api/internal/tonight/deposits/finalize/route.ts',
  'app/api/internal/tonight/deposits/reconcile/route.ts',
  'app/api/internal/tonight/notifications/dispatch/route.ts',
  'app/api/internal/tonight/partner-acceptance-gate/route.ts',
  'app/api/internal/tonight/refunds/process/route.ts',
  'app/api/internal/tonight/settlements/process/route.ts',
] as const

test('Tonight runtime intake is enabled by the exact server-only true value', () => {
  for (const value of [undefined, '', 'false', 'TRUE', ' true ', '1']) {
    assert.equal(isTonightAutomationEnabled(value), false)
  }

  assert.equal(isTonightAutomationEnabled('true'), true)

  const readinessEnv = readFileSync('scripts/deploy-readiness-env.mjs', 'utf8')
  assert.match(
    readinessEnv,
    /export function classifyTonightAutomationEnabled\(value, phase\)[\s\S]*?phase === 'launch'[\s\S]*?'true'[\s\S]*?'false'/,
  )
  assert.match(
    readinessEnv,
    /export function classifyTonightDatabaseGate\(value, phase\)[\s\S]*?phase === 'launch'[\s\S]*?value === true[\s\S]*?value === false/,
  )
})

test('Tonight intake crons authenticate before the automation gate and any service work', () => {
  for (const relativePath of INTAKE_ROUTES) {
    const source = readFileSync(relativePath, 'utf8')
    const handlerStart = source.indexOf('export async function GET')
    const authIndex = source.indexOf('isAuthorizedInternalRequest(', handlerStart)
    const gateIndex = source.indexOf('isTonightAutomationEnabled()', handlerStart)
    const firstSideEffect = firstIndexAfter(source, handlerStart, [
      'createPaymentServiceClient()',
      'getDepositPaymentReadiness(',
      'getTonightWebPushConfig(',
      'getTonightDueRoundPolicy(',
      'readTonight',
      'new Date(',
    ])

    assert.notEqual(handlerStart, -1, `${relativePath}: missing GET handler`)
    assert.notEqual(authIndex, -1, `${relativePath}: missing internal authentication`)
    assert.notEqual(gateIndex, -1, `${relativePath}: missing automation gate`)
    assert.ok(authIndex < gateIndex, `${relativePath}: gate must follow authentication`)
    assert.ok(gateIndex < firstSideEffect, `${relativePath}: gate must precede service/config/time work`)
    assert.match(source, /status:\s*'automation_disabled'/)
  }
})

test('existing Tonight financial and notification obligations keep draining while intake is disabled', () => {
  for (const relativePath of OBLIGATION_ROUTES) {
    const source = readFileSync(relativePath, 'utf8')
    assert.match(source, /isAuthorizedInternalRequest\(/, `${relativePath}: missing cron authentication`)
    assert.doesNotMatch(source, /isTonightAutomationEnabled|automation_disabled/)
    assert.match(source, /createPaymentServiceClient\(\)/, `${relativePath}: worker processing was removed`)
  }
})

test('deployment examples default intake off and readiness separates predeploy from launch', () => {
  for (const relativePath of ['.env.example', '.env.local.example']) {
    const source = readFileSync(relativePath, 'utf8')
    assert.match(source, /^TONIGHT_AUTOMATION_ENABLED=false$/m)
    assert.match(source, /intake only.*deposit.*refund.*reconcil.*settlement.*continue/i)
  }

  const checker = readFileSync('scripts/check-deploy-readiness.mjs', 'utf8')
  assert.match(checker, /parseDeployReadinessPhase\(process\.argv\.slice\(2\)\)/)
  assert.match(checker, /--phase=launch/)
  assert.match(checker, /classifyTonightAutomationEnabled\(env\.TONIGHT_AUTOMATION_ENABLED, readinessPhase\)/)
  assert.match(checker, /classifyTonightAutomationEnabled/)
  assert.match(checker, /service_get_tonight_activation_gate/)
  assert.match(checker, /SUPABASE_SECRET_KEY/)
  assert.match(checker, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(checker, /buildSupabaseServiceRequestHeaders\(serviceKey\)/)
  assert.match(checker, /classifyTonightDatabaseGate\(value, readinessPhase\)/)
  assert.match(checker, /key:\s*'NEXT_PUBLIC_TONIGHT_ENABLED'[\s\S]*?classifyTonightLaunchFlag\(env\.NEXT_PUBLIC_TONIGHT_ENABLED, readinessPhase\)/)
  assert.match(checker, /key:\s*'TONIGHT_APPLICATIONS_OPEN'[\s\S]*?classifyTonightLaunchFlag\(env\.TONIGHT_APPLICATIONS_OPEN, readinessPhase\)/)
  assert.match(checker, /phase: \$\{readinessPhase\}/)
  assert.doesNotMatch(checker, /console\.(?:log|error)\([^\n]*(?:serviceKey|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)/)
})

test('readiness phase and activation classifiers execute fail closed', () => {
  const moduleUrl = pathToFileURL(join(process.cwd(), 'scripts/deploy-readiness-env.mjs')).href
  const script = [
    `import { buildSupabaseServiceRequestHeaders, classifyTonightAutomationEnabled, classifyTonightDatabaseGate, classifyTonightLaunchFlag, parseDeployReadinessPhase } from ${JSON.stringify(moduleUrl)};`,
    'const duplicate = () => { try { parseDeployReadinessPhase([\'--phase=launch\', \'--phase=predeploy\']); return null } catch (error) { return error.message } };',
    'const invalid = () => { try { parseDeployReadinessPhase([\'--phase=production\']); return null } catch (error) { return error.message } };',
    'console.log(JSON.stringify({',
    '  defaultPhase: parseDeployReadinessPhase([]),',
    '  explicitPredeploy: parseDeployReadinessPhase([\'--phase=predeploy\']),',
    '  launch: parseDeployReadinessPhase([\'--phase=launch\']),',
    '  duplicate: duplicate(),',
    '  invalid: invalid(),',
    '  predeployEnvFalse: classifyTonightAutomationEnabled(\'false\', \'predeploy\'),',
    '  predeployEnvTrue: classifyTonightAutomationEnabled(\'true\', \'predeploy\'),',
    '  launchEnvTrue: classifyTonightAutomationEnabled(\'true\', \'launch\'),',
    '  launchEnvFalse: classifyTonightAutomationEnabled(\'false\', \'launch\'),',
    '  predeployDbFalse: classifyTonightDatabaseGate(false, \'predeploy\'),',
    '  predeployDbTrue: classifyTonightDatabaseGate(true, \'predeploy\'),',
    '  launchDbTrue: classifyTonightDatabaseGate(true, \'launch\'),',
    '  launchDbFalse: classifyTonightDatabaseGate(false, \'launch\'),',
    '  predeployLaunchFlagFalse: classifyTonightLaunchFlag(\'false\', \'predeploy\'),',
    '  predeployLaunchFlagTrue: classifyTonightLaunchFlag(\'true\', \'predeploy\'),',
    '  launchFlagTrue: classifyTonightLaunchFlag(\'true\', \'launch\'),',
    '  launchFlagFalse: classifyTonightLaunchFlag(\'false\', \'launch\'),',
    '  opaqueHeaders: buildSupabaseServiceRequestHeaders([\'sb\', \'secret\', \'test\'].join(\'_\')),',
    '  legacyHeaders: buildSupabaseServiceRequestHeaders(\'legacy-service-role-jwt\'),',
    '}));',
  ].join('\n')
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
  })

  assert.deepEqual(JSON.parse(output), {
    defaultPhase: 'predeploy',
    explicitPredeploy: 'predeploy',
    launch: 'launch',
    duplicate: 'invalid_readiness_phase',
    invalid: 'invalid_readiness_phase',
    predeployEnvFalse: 'SET',
    predeployEnvTrue: 'ACTION_REQUIRED',
    launchEnvTrue: 'SET',
    launchEnvFalse: 'ACTION_REQUIRED',
    predeployDbFalse: 'SET',
    predeployDbTrue: 'ACTION_REQUIRED',
    launchDbTrue: 'SET',
    launchDbFalse: 'ACTION_REQUIRED',
    predeployLaunchFlagFalse: 'SET',
    predeployLaunchFlagTrue: 'ACTION_REQUIRED',
    launchFlagTrue: 'SET',
    launchFlagFalse: 'ACTION_REQUIRED',
    opaqueHeaders: {
      apikey: 'sb_secret_test',
      'Content-Type': 'application/json',
    },
    legacyHeaders: {
      apikey: 'legacy-service-role-jwt',
      'Content-Type': 'application/json',
      Authorization: 'Bearer legacy-service-role-jwt',
    },
  })
})

test('user current route requires environment, database, and round gates together', () => {
  const source = readFileSync('app/api/tonight/route.ts', 'utf8')
  assert.match(source, /rpc\('get_tonight_application_gate'\)/)
  assert.match(source, /applicationsAvailable = !gateError && typeof gateData === 'boolean'/)
  assert.match(source, /databaseApplicationsOpen = applicationsAvailable && gateData === true/)
  assert.match(
    source,
    /applications_open:\s*feature\.applicationsOpen\s*&&\s*databaseApplicationsOpen\s*&&\s*isTonightRoundApplicationsOpen\(data\)/,
  )
})

test('package exposes an explicit launch readiness command', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts?: Record<string, string>
  }
  assert.equal(
    packageJson.scripts?.['check:launch-readiness'],
    'node scripts/check-deploy-readiness.mjs --phase=launch',
  )
})

test('super-admin config mutation exposes the database activation key behind every live guard', () => {
  const source = readFileSync('app/api/admin/config/route.ts', 'utf8')
  assert.match(source, /allowedRoles:\s*\['super_admin'\]/)
  assert.match(source, /requireRecentAuth:\s*true/)
  assert.match(source, /checkMutationOrigin:\s*true/)
  assert.match(
    source,
    /new Set\(\['match_requires_approval', 'tonight_applications_open'\]\)/,
  )
  assert.match(source, /typeof body\.value !== 'boolean'/)
  assert.match(source, /rpc\('set_app_config', \{ p_key: key, p_value: body\.value \}\)/)
})

function firstIndexAfter(source: string, start: number, needles: string[]): number {
  const indices = needles
    .map((needle) => source.indexOf(needle, start))
    .filter((index) => index >= 0)
  assert.ok(indices.length > 0, 'route must expose a detectable side-effect boundary')
  return Math.min(...indices)
}
