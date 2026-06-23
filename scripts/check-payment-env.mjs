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
    validate: (value) => isSupabaseProjectUrl(value),
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: true,
    purpose: 'browser-safe Supabase key',
    value: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    validate: (value) => isSupabasePublicKey(value),
  },
]

if (provider === 'toss') {
  checks.push(
    {
      key: 'NEXT_PUBLIC_PAYMENT_PROVIDER',
      required: true,
      purpose: 'browser payment mode',
      validate: (value) => String(value).trim().toLowerCase() === 'toss',
    },
    {
      key: 'PAYMENT_PROVIDER',
      required: true,
      purpose: 'server payment mode',
      validate: (value) => String(value).trim().toLowerCase() === 'toss',
    },
    {
      key: 'NEXT_PUBLIC_TOSS_CLIENT_KEY',
      required: true,
      purpose: 'browser-safe Toss checkout key',
      validate: (value) => isTossKey(value, 'ck'),
    },
    {
      key: 'TOSS_SECRET_KEY',
      required: true,
      purpose: 'server-only Toss API key',
      validate: (value) => isTossKey(value, 'sk'),
    },
    {
      key: 'PAYMENT_INTERNAL_SECRET',
      required: true,
      purpose: 'protect internal refund/cancel calls',
      validate: (value) => value.length >= 12 && !hasUnsafeEnvValueCharacters(value),
    },
    {
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      required: true,
      purpose: 'server-only payment reconciliation',
      validate: (value) => isSupabaseJwtWithRole(value, 'service_role'),
    },
  )
}

const rows = checks.map((check) => ({
  key: check.key,
  required: check.required ? 'yes' : 'no',
  status: checkStatus(check, env),
  purpose: check.purpose,
}))

console.log('Payment environment check')
console.log(`env file: ${existsSync(ENV_FILE) ? '.env.local found' : '.env.local missing'}`)
console.log(`provider: ${provider}`)
console.table(rows)

const missing = rows.filter((row) => row.required === 'yes' && row.status === 'MISSING')
const invalid = rows.filter((row) => row.required === 'yes' && row.status === 'INVALID')

if (provider === 'mock') {
  console.log('mock provider: Toss keys are not required for local UI review.')
}

if (missing.length > 0) {
  console.error(`Missing required payment env keys: ${missing.map((row) => row.key).join(', ')}`)
  process.exit(1)
}

if (invalid.length > 0) {
  console.error(`Invalid payment env keys: ${invalid.map((row) => row.key).join(', ')}`)
  process.exit(1)
}

console.log('Payment env check passed.')

function checkStatus(check, values) {
  const value = check.value ?? values[check.key]
  if (!value) return 'MISSING'
  if (check.validate && !check.validate(String(value))) return 'INVALID'
  return 'SET'
}

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

function isSupabaseProjectUrl(value) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(value)
}

function isSupabasePublicKey(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  if (value.startsWith('sb_publishable_')) return !hasUnsafeEnvValueCharacters(value)
  return isSupabaseJwtWithRole(value, 'anon')
}

function isTossKey(value, kind) {
  if (typeof value !== 'string') return false
  if (hasUnsafeEnvValueCharacters(value)) return false
  return new RegExp(`^(?:test|live)_(?:g)?${kind}_[A-Za-z0-9_-]{12,}$`).test(value)
}

function isSupabaseJwtWithRole(value, role) {
  if (typeof value !== 'string') return false
  if (hasUnsafeEnvValueCharacters(value)) return false
  const parts = value.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) return false

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return payload?.role === role
  } catch {
    return false
  }
}

function hasUnsafeEnvValueCharacters(value) {
  return /\s/.test(value) || /[^\x21-\x7e]/.test(value)
}
