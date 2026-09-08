#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const COMMAND_TIMEOUT_MS = 10_000
const detectors = [
  {
    name: 'toss_api_key',
    find: findTossKeys,
  },
  {
    name: 'supabase_service_role_jwt',
    find: findSupabaseServiceRoleJwt,
  },
  {
    name: 'tracked_supabase_public_jwt_env',
    find: findTrackedSupabasePublicJwtEnv,
  },
  {
    name: 'naver_client_secret_env',
    find: findNaverClientSecretEnv,
  },
  {
    name: 'supabase_secret_key',
    find: findSupabaseSecretKeys,
  },
  {
    name: 'server_secret_env',
    find: findServerSecretEnv,
  },
]

const includeUntracked = process.argv.includes('--include-untracked')
const scanLabel = includeUntracked ? 'Tracked and untracked' : 'Tracked'
const files = includeUntracked ? listTrackedAndUntrackedFiles() : listTrackedFiles()
const findings = []

for (const file of files) {
  const text = readTextFile(file)
  if (text === null) continue

  for (const detector of detectors) {
    for (const line of detector.find(text)) {
      findings.push({ file, line, detector: detector.name })
    }
  }
}

if (findings.length > 0) {
  console.error(`${scanLabel} secret scan failed. Remove matched secrets before committing.`)
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.detector}`)
  }
  process.exit(1)
}

console.log(`${scanLabel} secret scan passed.`)

function listTrackedFiles() {
  return listGitFiles(['ls-files', '-z'])
}

function listTrackedAndUntrackedFiles() {
  return [...new Set([
    ...listTrackedFiles(),
    ...listGitFiles(['ls-files', '-z', '--others', '--exclude-standard']),
  ])]
}

function listGitFiles(args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'buffer',
    timeout: COMMAND_TIMEOUT_MS,
  })

  if (result.status !== 0 || result.error || result.signal) {
    throw new Error(`git ${args.join(' ')} failed`)
  }

  return result.stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
}

function readTextFile(path) {
  try {
    const buffer = readFileSync(path)
    if (buffer.includes(0)) return null
    return buffer.toString('utf8')
  } catch {
    return null
  }
}

function findTossKeys(text) {
  return findLines(text, /(?:test|live)_(?:g)?[cs]k_[A-Za-z0-9_-]{12,}/g)
    .filter((match) => !isAllowedPlaceholder(match.value))
    .map((match) => match.line)
}

function findSupabaseServiceRoleJwt(text) {
  return findJwtCandidates(text)
    .filter((match) => {
      const payload = readJwtPayload(match.value)
      return payload?.role === 'service_role'
    })
    .map((match) => match.line)
}

function findTrackedSupabasePublicJwtEnv(text) {
  return findLines(text, /NEXT_PUBLIC_SUPABASE_(?:ANON_KEY|PUBLISHABLE_KEY)\s*=\s*(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g)
    .filter((match) => !isAllowedPlaceholder(match.value))
    .map((match) => match.line)
}

function findNaverClientSecretEnv(text) {
  return findLines(text, /^[ \t]*NAVER_(?:CLIENT_SECRET|MAPS_CLIENT_SECRET)[ \t]*=[ \t]*[^\r\n]*$/gm)
    .filter((match) => {
      const value = match.value.slice(match.value.indexOf('=') + 1).trim()
      return value.length > 0 && !isAllowedPlaceholder(value)
    })
    .map((match) => match.line)
}

function findSupabaseSecretKeys(text) {
  return findLines(text, /sb_secret_[A-Za-z0-9_-]{12,}/g)
    .filter((match) => !isAllowedPlaceholder(match.value))
    .map((match) => match.line)
}

function findServerSecretEnv(text) {
  return findLines(
    text,
    /^[ \t]*(?:PAYMENT_INTERNAL_SECRET|CRON_SECRET|AI_SERVER_SECRET|WEB_PUSH_VAPID_PRIVATE_KEY|CAMPUS_SEVEN_PUSH_CRON_SECRET)[ \t]*=[ \t]*[^\r\n]*$/gm,
  )
    .filter((match) => {
      const value = match.value.slice(match.value.indexOf('=') + 1).trim()
      return value.length > 0
        && !isAllowedPlaceholder(value)
        && !/(?:process\.env|os\.environ|getenv\(|Deno\.env|import\.meta\.env)/i.test(value)
    })
    .map((match) => match.line)
}

function findJwtCandidates(text) {
  return findLines(text, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)
    .filter((match) => !isAllowedPlaceholder(match.value))
}

function findLines(text, regex) {
  const matches = []
  const lineStarts = buildLineStarts(text)
  let match
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      value: match[0],
      line: lineNumberForIndex(lineStarts, match.index),
    })
  }
  return matches
}

function buildLineStarts(text) {
  const starts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1)
  }
  return starts
}

function lineNumberForIndex(starts, index) {
  let low = 0
  let high = starts.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (starts[mid] <= index) low = mid + 1
    else high = mid - 1
  }
  return Math.max(1, high + 1)
}

function readJwtPayload(value) {
  const parts = value.split('.')
  if (parts.length !== 3) return null

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function isAllowedPlaceholder(value) {
  return /fake|example|placeholder|your-|your_|dummy|signature|replace(?:_|-)?me|replace-with|local-|test-/i.test(value)
}
