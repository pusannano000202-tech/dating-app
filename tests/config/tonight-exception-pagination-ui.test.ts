import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { normalizeTonightExceptionPage } from '../../lib/server/tonight/exception-page'

const source = (relative: string) => {
  const path = join(process.cwd(), relative)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

test('exception API uses one bounded page plus aggregate counts and never calls legacy full-round RPCs', () => {
  const route = source('app/api/admin/tonight/exceptions/route.ts')

  assert.match(route, /admin_get_tonight_exception_page/)
  assert.match(route, /admin_get_tonight_exception_counts/)
  assert.match(route, /p_limit:\s*50/)
  for (const legacy of [
    'admin_get_tonight_active_exceptions',
    'admin_get_tonight_settlement_exceptions',
    'admin_get_tonight_deposit_terminal_exceptions',
    'admin_get_tonight_reconciliation_exceptions',
    'admin_get_tonight_service_exceptions',
  ]) {
    assert.doesNotMatch(route, new RegExp(legacy))
  }
})

test('a synthetic ten-thousand-row database response is capped to fifty browser rows', () => {
  const rows = Array.from({ length: 10_000 }, (_, index) => ({
    exception_key: `${String(index + 1).padStart(10, '0')}:10:missing_arrival:00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    exception_kind: 'missing_arrival',
    exception_team_id: '00000000-0000-4000-8000-000000000001',
    exception_team_code: `TEAM-${index + 1}`,
    exception_status: 'pending',
  }))
  const page = normalizeTonightExceptionPage(rows, [], 50)

  assert.equal(page.exceptions.length, 50)
  assert.equal(page.nextAfterExceptionKey, rows[49].exception_key)
  assert.equal(page.exceptions.some((row) => 'subject_phone' in row || 'reporter_phone' in row), false)
})

test('one masked business contact is fetched only by explicit selected-detail action', () => {
  const detailRoute = source('app/api/admin/tonight/exceptions/detail/route.ts')
  const adapter = source('components/tonight/live-adapters.ts')
  const admin = source('components/tonight/AdminTonightConsole.tsx')
  const superAdmin = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(detailRoute, /admin_get_tonight_exception_detail/)
  assert.match(adapter, /loadExceptionDetail[\s\S]*?exceptions\/detail\?/)
  assert.match(adapter, /mapException\(value, false\)/)
  assert.match(adapter, /mapException\(payload\.exception, true\)/)
  assert.match(admin, /상세·마스킹 연락처 보기/)
  assert.match(superAdmin, /상세·조치 불러오기/)
})

test('team pagination reuses cached exceptions while exception pagination is explicit', () => {
  const adapter = source('components/tonight/live-adapters.ts')
  const types = source('components/tonight/types.ts')

  assert.match(adapter, /shouldLoadExceptions/)
  assert.match(adapter, /input\?\.afterExceptionKey !== undefined/)
  assert.match(adapter, /currentExceptionPage/)
  assert.match(types, /nextAfterExceptionKey/)
  assert.match(types, /totalCount/)
})
