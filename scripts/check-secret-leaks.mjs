#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
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
]

const files = listTrackedFiles()
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
  console.error('Tracked secret scan failed. Remove matched secrets from git-tracked files.')
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.detector}`)
  }
  process.exit(1)
}

console.log('Tracked secret scan passed.')

function listTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'buffer',
  })

  if (result.status !== 0) {
    throw new Error('git ls-files failed')
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
  return /fake|example|placeholder|your-|your_|dummy|signature/i.test(value)
}
