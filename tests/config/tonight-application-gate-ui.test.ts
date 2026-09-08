import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createRehearsalAdapters } from '../../components/tonight/rehearsal-fixtures'

const source = (relativePath: string) => readFileSync(relativePath, 'utf8')

test('rehearsal super-admin can explicitly close and reopen only the database application gate', async () => {
  const { superAdmin } = createRehearsalAdapters(0)

  assert.equal((await superAdmin.load()).databaseApplicationsOpen, true)
  assert.equal(
    (await superAdmin.setDatabaseApplicationsOpen({ value: false })).databaseApplicationsOpen,
    false,
  )
  assert.equal((await superAdmin.load()).databaseApplicationsOpen, false)
  assert.equal(
    (await superAdmin.setDatabaseApplicationsOpen({ value: true })).databaseApplicationsOpen,
    true,
  )
})

test('live super-admin reads and writes tonight_applications_open through the guarded config API', () => {
  const types = source('components/tonight/types.ts')
  const adapter = source('components/tonight/live-adapters.ts')

  assert.match(types, /databaseApplicationsOpen:\s*boolean/)
  assert.match(
    types,
    /setDatabaseApplicationsOpen\(input:\s*\{\s*value:\s*boolean\s*\}\):\s*Promise<SuperAdminTonightData>/,
  )
  assert.match(
    adapter,
    /requestJson\(\s*'\/api\/admin\/config\?key=tonight_applications_open',?\s*\)/,
  )
  assert.match(
    adapter,
    /postJson\('\/api\/admin\/config',\s*\{\s*key:\s*'tonight_applications_open',\s*value:\s*input\.value,?\s*\}\)/,
  )
  assert.match(adapter, /typeof\s+\w+\.value\s*!==\s*'boolean'/)
  assert.match(adapter, /savedValue\s*!==\s*input\.value/)
})

test('config reads are allowlisted behind the same recent-auth super-admin boundary', () => {
  const route = source('app/api/admin/config/route.ts')
  const getHandler = route.slice(
    route.indexOf('export async function GET'),
    route.indexOf('export async function POST'),
  )

  assert.match(
    route,
    /READABLE_CONFIG_KEYS\s*=\s*new Set\(\['match_requires_approval', 'tonight_applications_open'\]\)/,
  )
  assert.match(getHandler, /requireRequestAccess\(req,\s*\{/)
  assert.match(getHandler, /allowedRoles:\s*\['super_admin'\]/)
  assert.match(getHandler, /requireRecentAuth:\s*true/)
  assert.match(getHandler, /READABLE_CONFIG_KEYS\.has\(key\)/)
  assert.doesNotMatch(getHandler, /checkMutationOrigin/)
})

test('only the super-admin UI exposes a two-step database gate control and explains both gates', () => {
  const superAdmin = source('components/tonight/SuperAdminTonightConsole.tsx')
  const admin = source('components/tonight/AdminTonightConsole.tsx')

  assert.match(superAdmin, /DB 신청 Gate/)
  assert.match(superAdmin, /서버\/Vercel Gate와 별도/)
  assert.match(superAdmin, /두 Gate가 모두 승인/)
  assert.match(superAdmin, /pendingDatabaseGate/)
  assert.match(superAdmin, /setDatabaseApplicationsOpen/)
  assert.match(superAdmin, /DB Gate (?:열기|닫기) 확인/)
  assert.doesNotMatch(admin, /DB 신청 Gate|setDatabaseApplicationsOpen|pendingDatabaseGate/)
})
