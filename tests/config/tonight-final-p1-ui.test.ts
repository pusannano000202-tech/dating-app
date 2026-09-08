import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function source(relativePath: string): string {
  const absolutePath = join(ROOT, relativePath)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

function migrationSource(): string {
  const directory = join(ROOT, 'supabase', 'migrations')
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(directory, name), 'utf8'))
    .join('\n')
}

test('partner service confirmation is enabled only by the server availability contract', () => {
  const types = source('components/tonight/types.ts')
  const partner = source('components/tonight/PartnerTonightConsole.tsx')
  const adapter = source('components/tonight/live-adapters.ts')
  const migrations = migrationSource()

  assert.match(types, /canConfirmService:\s*boolean/)
  assert.match(types, /serviceConfirmAfter:\s*string/)
  assert.match(adapter, /can_confirm_service/)
  assert.match(adapter, /service_confirm_after/)
  assert.match(partner, /team\.canConfirmService/)
  assert.match(partner, /team\.serviceConfirmAfter/)
  assert.match(partner, /서비스 종료 후 실제 참석 인원을 확정할 수 있어요/)
  assert.doesNotMatch(partner, /Date\.now\(|new Date\(/)
  assert.match(migrations, /can_confirm_service/)
  assert.match(migrations, /service_confirm_after/)
  assert.match(migrations, /CURRENT_TIMESTAMP\s*>=/i)
})

test('live super-admin loads the selected venue snapshots and exposes explicit states', () => {
  const types = source('components/tonight/types.ts')
  const consoleSource = source('components/tonight/SuperAdminTonightConsole.tsx')
  const adapter = source('components/tonight/live-adapters.ts')

  assert.match(types, /loadVenueSnapshots\(input:\s*\{\s*venueId:\s*string\s*\}\)/)
  assert.match(adapter, /\/api\/admin\/super-admin\/tonight\/venues\/snapshot\?venue_id=/)
  assert.match(adapter, /projectVenueSnapshotRow/)
  assert.doesNotMatch(adapter, /venueSnapshots:\s*\[\]/)
  assert.match(consoleSource, /장소 이력을 불러오는 중이에요/)
  assert.match(consoleSource, /이 업장에는 아직 장소 revision이 없어요/)
  assert.match(consoleSource, /장소 이력을 불러오지 못했어요/)
  assert.match(consoleSource, /adapter\.loadVenueSnapshots/)
})

test('bundle swap shows a short unique reference and requires a review step without listing member PII', () => {
  const types = source('components/tonight/types.ts')
  const consoleSource = source('components/tonight/SuperAdminTonightConsole.tsx')
  const adapter = source('components/tonight/live-adapters.ts')

  assert.match(types, /bundleId:\s*string;\s*memberCount:\s*number/)
  assert.doesNotMatch(types, /memberNames/)
  assert.doesNotMatch(adapter, /memberNames/)
  assert.doesNotMatch(consoleSource, /memberNames/)
  assert.match(consoleSource, /묶음 ID/)
  assert.match(consoleSource, /bundleShortReferences\.get\(member\.bundleId\)/)
  assert.doesNotMatch(consoleSource, /member\.bundleId\.slice\(0,\s*6\)/)
  assert.match(consoleSource, /출발 팀/)
  assert.match(consoleSource, /대상 팀/)
  assert.match(consoleSource, /교체 내용 확인/)
  assert.match(consoleSource, /확인한 두 묶음 교체/)
})

test('team-specific safety reporting explains the unavailable state before team assignment', () => {
  const user = source('components/tonight/UserTonightExperience.tsx')

  assert.match(user, /disabled=\{!journey\?\.teamId/)
  assert.match(user, /aria-describedby="tonight-report-unavailable"/)
  assert.match(user, /팀 편성 전에는 오늘밤 팀 신고를 접수할 수 없어요/)
  assert.match(user, /href="tel:112"/)
  assert.match(user, /href="tel:119"/)
})
