import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function source(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

test('partner capacity contract carries a 5 or 6 person venue limit end to end', () => {
  const types = source('components/tonight/types.ts')
  const adapter = source('components/tonight/live-adapters.ts')
  const route = source('app/api/partner/tonight/capacity/route.ts')

  assert.match(types, /PartnerCapacityView[\s\S]*?maxTeamHeadcount:\s*5\s*\|\s*6/)
  assert.match(types, /saveCapacity\([\s\S]*?maxTeamHeadcount:\s*5\s*\|\s*6/)
  assert.match(adapter, /maxTeamHeadcount:\s*(?:asTeamHeadcount|teamHeadcount)\(row\.max_team_headcount\)/)
  assert.match(adapter, /max_team_headcount:\s*input\.maxTeamHeadcount/)

  assert.match(route, /'max_team_headcount'/)
  assert.match(
    route,
    /p_max_team_headcount:\s*asInteger\(body\.max_team_headcount,[\s\S]*?min:\s*5,[\s\S]*?max:\s*6/,
  )
})

test('partner gets a plain-language large control for the biggest team the venue can accept', () => {
  const partner = source('components/tonight/PartnerTonightConsole.tsx')

  assert.match(partner, /한 팀에 최대 몇 명/)
  assert.match(partner, /5명/)
  assert.match(partner, /6명/)
  assert.match(partner, /maxTeamHeadcount/)
  assert.match(partner, /6명 팀.*여성 친구 3명|여성 친구 3명.*6명 팀/)
})

test('rehearsal data proves both five-person-only and six-person-capable venues', () => {
  const fixture = source('components/tonight/rehearsal-fixtures.ts')

  assert.match(fixture, /maxTeamHeadcount:\s*5/)
  assert.match(fixture, /maxTeamHeadcount:\s*6/)
})
