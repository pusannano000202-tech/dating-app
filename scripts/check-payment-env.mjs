#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const ENV_FILE = join(ROOT, '.env.local')

const fileEnv = existsSync(ENV_FILE) ? readEnvFile(ENV_FILE) : {}
const env = { ...fileEnv, ...process.env }
const provider = resolveProvider(process.argv, env)

const checks = [
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    required: true,
    purpose: 'Supabase project URL',
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: true,
    purpose: 'browser-safe Supabase key',
    ok: Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  },
]

if (provider === 'toss') {
  checks.push(
    {
      key: 'NEXT_PUBLIC_TOSS_CLIENT_KEY',
      required: true,
      purpose: 'browser-safe Toss checkout key',
    },
    {
      key: 'TOSS_SECRET_KEY',
      required: true,
      purpose: 'server-only Toss API key',
    },
    {
      key: 'PAYMENT_INTERNAL_SECRET',
      required: true,
      purpose: 'protect internal refund/cancel calls',
    },
    {
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      required: true,
      purpose: 'server-only payment reconciliation',
    },
  )
}

const rows = checks.map((check) => ({
  key: check.key,
  required: check.required ? 'yes' : 'no',
  status: (check.ok ?? Boolean(env[check.key])) ? 'SET' : 'MISSING',
  purpose: check.purpose,
}))

console.log('Payment environment check')
console.log(`env file: ${existsSync(ENV_FILE) ? '.env.local found' : '.env.local missing'}`)
console.log(`provider: ${provider}`)
console.table(rows)

const missing = rows.filter((row) => row.required === 'yes' && row.status === 'MISSING')

if (provider === 'mock') {
  console.log('mock provider: Toss keys are not required for local UI review.')
}

if (missing.length > 0) {
  console.error(`Missing required payment env keys: ${missing.map((row) => row.key).join(', ')}`)
  process.exit(1)
}

console.log('Payment env check passed.')

function readEnvFile(path) {
  const parsed = {}
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const index = trimmed.indexOf('=')
    if (index === -1) continue

    const key = trimmed.slice(0, index).trim()
    const rawValue = trimmed.slice(index + 1).trim()
    parsed[key] = stripQuotes(rawValue)
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

function resolveProvider(args, values) {
  const providerArg = args.find((arg) => arg.startsWith('--provider='))
  const raw = providerArg?.split('=')[1]
    ?? values.NEXT_PUBLIC_PAYMENT_PROVIDER
    ?? values.PAYMENT_PROVIDER
    ?? 'mock'
  const normalized = String(raw).trim().toLowerCase()

  return normalized === 'toss' ? 'toss' : 'mock'
}
