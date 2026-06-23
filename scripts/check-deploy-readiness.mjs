#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const env = {
  ...readLocalEnvFile(),
  ...process.env,
}
const checks = []

checks.push(checkCommand(
  'git status --short --branch',
  ['git', ['status', '--short', '--branch']],
  (result) => {
    if (result.status !== 0) return 'INVALID'
    const lines = result.stdout.split(/\r?\n/).filter(Boolean)
    const branchLine = lines[0] ?? ''
    if (lines.length > 1) return 'ACTION_REQUIRED'
    return branchLine.includes('ahead') || branchLine.includes('behind') ? 'ACTION_REQUIRED' : 'SET'
  },
))

checks.push(checkVercelCli())

checks.push({
  key: '.vercel/project.json',
  status: existsSync(join(root, '.vercel', 'project.json')) ? 'SET' : 'MISSING',
  purpose: 'local folder is linked to the Vercel project',
})

checks.push(checkSecretLeaks())
checks.push(checkPaymentEnv())

checks.push({
  key: 'NEXT_PUBLIC_APP_ORIGIN',
  status: classifyAppOrigin(env.NEXT_PUBLIC_APP_ORIGIN),
  purpose: 'public callback origin must be a deployed Vercel URL before production',
})

console.log('Deployment readiness check')
console.table(checks)

const blockers = checks.filter((check) => check.status !== 'SET')
if (blockers.length > 0) {
  console.error(`Deployment readiness blockers: ${blockers.map((check) => check.key).join(', ')}`)
  process.exit(1)
}

console.log('Deployment readiness check passed.')

function checkCommand(key, command, classify) {
  const [file, args] = command
  const result = spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })

  return {
    key,
    status: classify(result),
    purpose: key === 'git status --short --branch'
      ? 'local branch is clean and synced before Vercel deployment'
      : 'Vercel CLI is available for env/link/deploy checks',
  }
}

function checkVercelCli() {
  const exists = commandExists('vercel')
  if (!exists) {
    return {
      key: 'vercel --version',
      status: 'MISSING',
      purpose: 'Vercel CLI is available for env/link/deploy checks',
    }
  }

  const result = spawnSync('vercel', ['--version'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })

  return {
    key: 'vercel --version',
    status: result.status === 0 && result.stdout.trim().length > 0 ? 'SET' : 'MISSING',
    purpose: 'Vercel CLI is available for env/link/deploy checks',
  }
}

function commandExists(command) {
  // Windows uses `where vercel`; POSIX uses `command -v vercel`.
  const result = process.platform === 'win32'
    ? spawnSync('where', [command], {
      cwd: root,
      encoding: 'utf8',
      shell: true,
    })
    : spawnSync('sh', ['-lc', `command -v ${command}`], {
      cwd: root,
      encoding: 'utf8',
    })

  return result.status === 0 && result.stdout.trim().length > 0
}

function checkPaymentEnv() {
  const result = spawnSync(process.execPath, ['scripts/check-payment-env.mjs', '--provider=toss'], {
    cwd: root,
    encoding: 'utf8',
  })

  return {
    key: 'scripts/check-payment-env.mjs --provider=toss',
    status: result.status === 0 ? 'SET' : 'ACTION_REQUIRED',
    purpose: 'Toss/Supabase server envs are present and valid without printing secrets',
  }
}

function checkSecretLeaks() {
  const result = spawnSync(process.execPath, ['scripts/check-secret-leaks.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })

  return {
    key: 'scripts/check-secret-leaks.mjs',
    status: result.status === 0 ? 'SET' : 'ACTION_REQUIRED',
    purpose: 'git-tracked files do not contain Supabase/Toss secret values',
  }
}

function classifyAppOrigin(value) {
  if (!value) return 'MISSING'
  if (isPlaceholderValue(value)) return 'INVALID'
  if (/localhost|127\.0\.0\.1/i.test(value)) return 'ACTION_REQUIRED'
  if (!/^https:\/\/.+/.test(value)) return 'INVALID'
  return 'SET'
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
