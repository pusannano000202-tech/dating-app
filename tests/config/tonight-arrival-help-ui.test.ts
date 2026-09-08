import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

test('Tonight adapters carry one durable contact-free help state across all three roles', () => {
  const types = source('components/tonight/types.ts')
  assert.match(types, /TonightArrivalHelpView/)
  assert.match(types, /arrivalHelpRequest:\s*TonightArrivalHelpView \| null/)
  assert.match(types, /requestArrivalHelp/)
  assert.match(types, /cancelArrivalHelp/)
  assert.equal((types.match(/arrivalHelpRequests:\s*readonly TonightArrivalHelpView\[\]/g) ?? []).length, 2)
  assert.match(types, /updateArrivalHelp/)
})

test('participant can ask for help by concrete problem and cancel after finding the team', () => {
  const user = source('components/tonight/UserTonightExperience.tsx')
  assert.match(user, /못 찾겠어요/)
  assert.match(user, /입구를 못 찾겠어요/)
  assert.match(user, /우리 팀을 못 찾겠어요/)
  assert.match(user, /정확한 업장을 못 찾겠어요/)
  assert.match(user, /이제 찾았어요/)
  assert.match(user, /arrivalHelpRequest\.nextAction/)
  assert.doesNotMatch(user, /arrivalHelpRequest\.(?:phone|email|name)/)
})

test('partner gets an older-friendly team-code queue with two obvious actions and no contact data', () => {
  const partner = source('components/tonight/PartnerTonightConsole.tsx')
  assert.match(partner, /현장 도움 요청/)
  assert.match(partner, /찾으러 가기/)
  assert.match(partner, /해결 완료/)
  assert.match(partner, /운영자 호출/)
  assert.match(partner, /arrivalHelpRequests/)
  assert.doesNotMatch(partner, /help\.(?:phone|email|name)/)
})

test('operator sees escalated arrival help separately from phone-bearing exceptions', () => {
  const admin = source('components/tonight/AdminTonightConsole.tsx')
  assert.match(admin, /현장 지원 요청/)
  assert.match(admin, /연락처 없이 팀 번호와 업장만으로 처리/)
  assert.match(admin, /arrivalHelpRequests/)
  assert.match(admin, /updateArrivalHelp/)
  assert.doesNotMatch(admin, /help\.(?:phone|email|name)/)
})

test('live and rehearsal adapters round-trip arrival-help state instead of UI-only toggles', () => {
  const live = source('components/tonight/live-adapters.ts')
  const rehearsal = source('components/tonight/rehearsal-fixtures.ts')
  for (const endpoint of [
    '/api/tonight/arrival-help',
    '/api/partner/tonight/arrival-help',
    '/api/admin/tonight/arrival-help',
  ]) assert.match(live, new RegExp(endpoint.replaceAll('/', '\\/')))
  assert.match(live, /mapArrivalHelp/)
  assert.match(rehearsal, /refreshArrivalHelp/)
  assert.match(rehearsal, /requestArrivalHelp/)
  assert.match(rehearsal, /cancelArrivalHelp/)
  assert.match(rehearsal, /updateArrivalHelp/)
})
