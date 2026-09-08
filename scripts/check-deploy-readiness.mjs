#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  buildSupabaseServiceRequestHeaders,
  classifyAiServerSecret,
  classifyAiServerUrl,
  classifyTonightAutomationEnabled,
  classifyTonightDatabaseGate,
  classifyTonightLaunchFlag,
  classifyTonightNoShowForfeitPolicy,
  parseDeployReadinessPhase,
} from './deploy-readiness-env.mjs'

const root = process.cwd()
const COMMAND_TIMEOUT_MS = 10_000
const readinessPhase = parseDeployReadinessPhase(process.argv.slice(2))
const env = {
  ...readLocalEnvFile(),
  ...process.env,
}
const checks = []

checks.push(checkGitBranch())

checks.push(checkVercelCli())
checks.push(checkVercelAuth())

checks.push(checkVercelProjectLink())

checks.push(checkSecretLeaks())
checks.push(checkPaymentEnv())
checks.push(checkDevPreviewAuthEnv())
checks.push(...checkAiServerEnv())

checks.push({
  key: 'NEXT_PUBLIC_APP_ORIGIN',
  status: classifyAppOrigin(env.NEXT_PUBLIC_APP_ORIGIN),
  purpose: 'public callback origin must be a deployed Vercel URL before production',
})

checks.push({
  key: 'NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID',
  status: classifyNaverMapsKey(env.NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID),
  purpose: 'browser map rendering requires the Naver Maps ncpKeyId configured for the deployed origin',
})

checks.push({
  key: 'TONIGHT_CRON_SCHEDULER',
  status: classifyTonightCronScheduler(env.TONIGHT_CRON_SCHEDULER),
  purpose: 'Tonight minute-precision jobs require a live-confirmed Vercel Pro-or-higher project',
})

checks.push({
  key: 'NEXT_PUBLIC_TONIGHT_ENABLED',
  status: classifyTonightLaunchFlag(env.NEXT_PUBLIC_TONIGHT_ENABLED, readinessPhase),
  purpose: readinessPhase === 'launch'
    ? 'launch requires the Tonight user surface to be explicitly visible'
    : 'predeploy keeps the Tonight user surface explicitly hidden',
})

checks.push({
  key: 'TONIGHT_APPLICATIONS_OPEN',
  status: classifyTonightLaunchFlag(env.TONIGHT_APPLICATIONS_OPEN, readinessPhase),
  purpose: readinessPhase === 'launch'
    ? 'launch requires the server application-intake gate to be explicitly enabled'
    : 'predeploy keeps the server application-intake gate explicitly disabled',
})

checks.push({
  key: 'TONIGHT_AUTOMATION_ENABLED',
  status: classifyTonightAutomationEnabled(env.TONIGHT_AUTOMATION_ENABLED, readinessPhase),
  purpose: readinessPhase === 'launch'
    ? 'launch requires Tonight round and allocation intake to be explicitly enabled'
    : 'predeploy keeps Tonight round and allocation intake explicitly disabled',
})

checks.push(await checkTonightDatabaseGate())

checks.push({
  key: 'TONIGHT_PARTNER_FEE_PER_ATTENDEE',
  status: classifyPartnerFeePerAttendee(env.TONIGHT_PARTNER_FEE_PER_ATTENDEE),
  purpose: 'attendance-based partner settlement requires a bounded server-owned per-attendee fee',
})

checks.push({
  key: 'TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED',
  status: classifyTonightNoShowForfeitPolicy(
    env.TONIGHT_CARD_PAYMENTS_ENABLED,
    env.TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED,
  ),
  purpose: 'card checkout stays closed until the explicit no-show deposit policy is legally approved',
})

console.log('Deployment readiness check')
console.log(`phase: ${readinessPhase}`)
console.table(checks)

const blockers = checks.filter((check) => check.status !== 'SET')
if (blockers.length > 0) {
  console.error(`Deployment readiness blockers: ${blockers.map((check) => check.key).join(', ')}`)
  printNextSteps(blockers)
  process.exitCode = 1
} else {
  console.log('Deployment readiness check passed.')
}

function checkGitBranch() {
  const check = {
    key: 'git status --short --branch',
    status: 'INVALID',
    purpose: 'local branch is clean, has an upstream, and exactly matches it before Vercel deployment',
  }
  const statusResult = runResolvedCommand('git', ['status', '--short', '--branch'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (!commandSucceeded(statusResult)) return check

  const lines = statusResult.stdout.split(/\r?\n/).filter(Boolean)
  if (lines.length > 1) return { ...check, status: 'ACTION_REQUIRED' }
  if (lines.length !== 1) return check

  const upstreamResult = runResolvedCommand(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    { cwd: root, encoding: 'utf8' },
  )
  if (!commandSucceeded(upstreamResult) || !upstreamResult.stdout.trim()) {
    return { ...check, status: 'ACTION_REQUIRED' }
  }

  const divergenceResult = runResolvedCommand(
    'git',
    ['rev-list', '--left-right', '--count', 'HEAD...@{u}'],
    { cwd: root, encoding: 'utf8' },
  )
  if (!commandSucceeded(divergenceResult)) return check

  const counts = divergenceResult.stdout.trim().split(/\s+/)
  if (counts.length !== 2 || !counts.every((count) => /^\d+$/.test(count))) return check
  const [ahead, behind] = counts.map(Number)
  return { ...check, status: ahead === 0 && behind === 0 ? 'SET' : 'ACTION_REQUIRED' }
}

function checkVercelProjectLink() {
  const projectFile = join(root, '.vercel', 'project.json')
  const check = {
    key: '.vercel/project.json',
    status: 'INVALID',
    purpose: 'local folder is linked to a Vercel project and organization',
  }
  if (!existsSync(projectFile)) return { ...check, status: 'MISSING' }

  try {
    const { projectId, orgId } = JSON.parse(readFileSync(projectFile, 'utf8'))
    const isValid = typeof projectId === 'string'
      && projectId.trim().length > 0
      && typeof orgId === 'string'
      && orgId.trim().length > 0
    return { ...check, status: isValid ? 'SET' : 'INVALID' }
  } catch {
    return check
  }
}

function checkVercelCli() {
  if (!commandExists('vercel')) {
    return {
      key: 'vercel --version',
      status: 'MISSING',
      purpose: 'Vercel CLI is available for env/link/deploy checks',
    }
  }

  const result = runResolvedCommand('vercel', ['--version'], {
    cwd: root,
    encoding: 'utf8',
  })

  return {
    key: 'vercel --version',
    status: commandSucceeded(result) && result.stdout.trim().length > 0 ? 'SET' : 'MISSING',
    purpose: 'Vercel CLI is available for env/link/deploy checks',
  }
}

function checkVercelAuth() {
  if (!commandExists('vercel')) {
    return {
      key: 'vercel whoami',
      status: 'MISSING',
      purpose: 'Vercel CLI is authenticated for project link/env/deploy checks',
    }
  }

  const result = runResolvedCommand('vercel', ['whoami'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '1',
      VERCEL_TELEMETRY_DISABLED: '1',
    },
  })

  return {
    key: 'vercel whoami',
    status: commandSucceeded(result) && result.stdout.trim().length > 0 ? 'SET' : 'ACTION_REQUIRED',
    purpose: 'Vercel CLI is authenticated for project link/env/deploy checks',
  }
}

function commandExists(command) {
  return resolveCommand(command) !== null
}

function resolveCommand(command) {
  if (!/^[A-Za-z0-9._-]+$/.test(command)) return null
  // Windows uses `where.exe vercel`; POSIX uses `command -v vercel`.
  const result = process.platform === 'win32'
    ? spawnCommandSync('where.exe', [command], {
      cwd: root,
      encoding: 'utf8',
    })
    : spawnCommandSync('sh', ['-lc', `command -v ${command}`], {
      cwd: root,
      encoding: 'utf8',
    })

  if (!commandSucceeded(result)) return null
  const candidates = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (process.platform === 'win32') {
    return candidates.find((line) => /\.(?:cmd|exe|bat)$/i.test(line))
      || candidates[0]
      || null
  }
  return candidates[0] || null
}

function runResolvedCommand(command, args, options) {
  const resolved = resolveCommand(command)
  if (!resolved) return null

  if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(resolved)) {
    const commandLine = [resolved, ...args]
      .map(quoteWindowsCommandToken)
      .join(' ')
    return spawnCommandSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], options)
  }

  return spawnCommandSync(resolved, args, options)
}

function spawnCommandSync(file, args, options = {}) {
  return spawnSync(file, args, {
    ...options,
    timeout: COMMAND_TIMEOUT_MS,
  })
}

function commandSucceeded(result) {
  return result !== null
    && result.error === undefined
    && result.signal === null
    && result.status === 0
}

function quoteWindowsCommandToken(value) {
  const token = String(value)
  if (/^[A-Za-z0-9_./:\\=-]+$/.test(token)) return token
  return `"${token.replaceAll('"', '""')}"`
}

function checkPaymentEnv() {
  const result = spawnCommandSync(process.execPath, ['scripts/check-payment-env.mjs', '--provider=toss'], {
    cwd: root,
    encoding: 'utf8',
  })

  return {
    key: 'scripts/check-payment-env.mjs --provider=toss',
    status: commandSucceeded(result) ? 'SET' : 'ACTION_REQUIRED',
    purpose: 'Toss/Supabase server envs are present and valid without printing secrets',
  }
}

function checkSecretLeaks() {
  const result = spawnCommandSync(process.execPath, ['scripts/check-secret-leaks.mjs', '--include-untracked'], {
    cwd: root,
    encoding: 'utf8',
  })

  return {
    key: 'scripts/check-secret-leaks.mjs',
    status: commandSucceeded(result) ? 'SET' : 'ACTION_REQUIRED',
    purpose: 'tracked and untracked files do not contain known server secret values',
  }
}

function checkDevPreviewAuthEnv() {
  const devAuthEnabled = env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'
  const legacyDemoEnabled = isEnabledLegacyDemoMode(env.NEXT_PUBLIC_BOOTING_DEMO_MODE)

  return {
    key: 'dev preview auth env',
    status: devAuthEnabled || legacyDemoEnabled ? 'ACTION_REQUIRED' : 'SET',
    purpose: 'production deployments must not enable dev preview auth flags',
  }
}

function checkAiServerEnv() {
  return [
    {
      key: 'AI_SERVER_URL',
      status: classifyAiServerUrl(env.AI_SERVER_URL),
      purpose: 'appearance scoring requires a configured internal AI service URL',
    },
    {
      key: 'AI_SERVER_SECRET',
      status: classifyAiServerSecret(env.AI_SERVER_SECRET),
      purpose: 'Next.js and the internal AI service must share a non-placeholder secret',
    },
  ]
}

function classifyAppOrigin(value) {
  if (!value) return 'MISSING'
  const normalized = String(value).trim()
  if (!normalized || isPlaceholderValue(normalized)) return 'INVALID'

  const url = parseStrictAppOrigin(normalized)
  if (!url) return 'INVALID'
  if (/^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)) return 'ACTION_REQUIRED'
  if (url.protocol !== 'https:') return 'INVALID'
  return 'SET'
}

function parseStrictAppOrigin(value) {
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol)
      || url.origin !== value
      || url.pathname !== '/'
      || url.search
      || url.hash
      || url.username
      || url.password
    ) {
      return null
    }
    return url
  } catch {
    return null
  }
}

function classifyNaverMapsKey(value) {
  if (!value) return 'MISSING'
  if (isPlaceholderValue(value)) return 'INVALID'
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(String(value))) return 'INVALID'
  return 'SET'
}

function classifyTonightCronScheduler(value) {
  return value === 'vercel-pro' ? 'SET' : 'ACTION_REQUIRED'
}

function classifyPartnerFeePerAttendee(value) {
  if (!value) return 'MISSING'
  if (!/^(?:0|[1-9]\d*)$/.test(String(value))) return 'INVALID'
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 100_000
    ? 'SET'
    : 'INVALID'
}

async function checkTonightDatabaseGate() {
  const rawUrl = String(env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = String(
    env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '',
  ).trim()
  const result = {
    key: 'remote app_config.tonight_applications_open',
    status: 'ACTION_REQUIRED',
    purpose: 'the remote database must independently allow Tonight application submission',
  }

  if (!rawUrl || !serviceKey) return { ...result, status: 'MISSING' }
  if (isPlaceholderValue(rawUrl) || isPlaceholderValue(serviceKey)) {
    return { ...result, status: 'INVALID' }
  }

  let endpoint
  try {
    const parsed = new URL(rawUrl)
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.port
      || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname)
    ) {
      return { ...result, status: 'INVALID' }
    }
    endpoint = new URL('/rest/v1/rpc/service_get_tonight_activation_gate', parsed)
  } catch {
    return { ...result, status: 'INVALID' }
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildSupabaseServiceRequestHeaders(serviceKey),
      body: '{}',
      signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
    })
    if (!response.ok) return result
    const value = await response.json()
    return { ...result, status: classifyTonightDatabaseGate(value, readinessPhase) }
  } catch {
    return result
  }
}

function readLocalEnvFile() {
  const envFile = join(root, '.env.local')
  if (!existsSync(envFile)) return {}

  const parsed = {}
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index).trim()
    const value = stripQuotes(trimmed.slice(index + 1).trim())
    parsed[key] = value
  }
  return parsed
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function isPlaceholderValue(value) {
  return /(?:your-|your_|example|placeholder|replace_me|changeme|<[^>]+>)/i.test(String(value))
}

function isEnabledLegacyDemoMode(value) {
  if (!value) return false
  return !/^(off|false|0)$/i.test(String(value).trim())
}

function printNextSteps(blockers) {
  console.error('\nNext steps')
  for (const blocker of blockers) {
    console.error(`- ${blocker.key}: ${getNextStep(blocker.key)}`)
  }
}

function getNextStep(key) {
  switch (key) {
    case 'git status --short --branch':
      return 'commit/push current changes before deployment.'
    case 'vercel --version':
      return 'install or expose the Vercel CLI, then rerun this check.'
    case 'vercel whoami':
      return 'run `vercel login` or provide a valid Vercel token in the deployment environment.'
    case '.vercel/project.json':
      return 'run `vercel link` in this folder after Vercel authentication.'
    case 'scripts/check-secret-leaks.mjs':
      return 'remove real secrets from tracked files, then rerun the secret scanner.'
    case 'scripts/check-payment-env.mjs --provider=toss':
      return 'set Toss/Supabase server envs in `.env.local` or Vercel Environment Variables.'
    case 'dev preview auth env':
      return 'keep `NEXT_PUBLIC_DEV_AUTH_BYPASS=false` and remove or disable legacy dev preview flags in production.'
    case 'NEXT_PUBLIC_APP_ORIGIN':
      return 'set `NEXT_PUBLIC_APP_ORIGIN` to the https Vercel production or preview URL.'
    case 'NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID':
      return 'set the browser-safe Naver Maps ncpKeyId and allow the deployed https origin in the Naver Cloud console.'
    case 'TONIGHT_CRON_SCHEDULER':
      return 'confirm the linked Vercel project is Pro or higher, then set `TONIGHT_CRON_SCHEDULER=vercel-pro`; Hobby cannot run these minute-precision jobs.'
    case 'TONIGHT_AUTOMATION_ENABLED':
      return readinessPhase === 'launch'
        ? 'set the server-only intake flag to true for launch; financial and notification workers remain active independently.'
        : 'set the server-only intake flag explicitly to false for predeploy.'
    case 'NEXT_PUBLIC_TONIGHT_ENABLED':
      return readinessPhase === 'launch'
        ? 'set NEXT_PUBLIC_TONIGHT_ENABLED=true only for the explicit launch phase.'
        : 'set NEXT_PUBLIC_TONIGHT_ENABLED=false so Preview does not expose the Tonight surface.'
    case 'TONIGHT_APPLICATIONS_OPEN':
      return readinessPhase === 'launch'
        ? 'set TONIGHT_APPLICATIONS_OPEN=true only after the database gate and launch approval are ready.'
        : 'set TONIGHT_APPLICATIONS_OPEN=false so Preview cannot accept Tonight applications.'
    case 'remote app_config.tonight_applications_open':
      return readinessPhase === 'launch'
        ? 'enable tonight_applications_open with the recently-authenticated super-admin RPC, then rerun with `--phase=launch`.'
        : 'apply the authoritative activation-gate migration and keep tonight_applications_open false for predeploy.'
    case 'TONIGHT_PARTNER_FEE_PER_ATTENDEE':
      return 'set the approved integer fee in KRW (0..100000); the current local contract uses 1000 per confirmed attendee.'
    case 'TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED':
      return 'keep card payments closed, or set this to true only after the no-show forfeiture terms and operator process are approved.'
    case 'AI_SERVER_URL':
      return 'set `AI_SERVER_URL` to the deployed https appearance-scoring service URL.'
    case 'AI_SERVER_SECRET':
      return 'set the same 32+ character `AI_SERVER_SECRET` in Vercel and the AI service.'
    default:
      return 'inspect this check and resolve it before deploying.'
  }
}
