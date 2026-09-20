import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

test('partner view carries the authoritative assigned member count', () => {
  const types = read('components/tonight/types.ts')
  const adapter = read('components/tonight/live-adapters.ts')
  const partner = read('components/tonight/PartnerTonightConsole.tsx')

  assert.match(types, /export type PartnerTeamView[\s\S]*?memberCount: number/i)
  assert.match(adapter, /memberCount: num\(row\.member_count, 5\)/i)
  assert.match(partner, /team\.paidMemberCount === team\.memberCount/i)
  assert.match(partner, /\{team\.paidMemberCount\}\/\{team\.memberCount\} 보증금/i)
  assert.match(partner, /Array\.from\(\{ length: team\.memberCount \+ 1 \}/i)
  assert.doesNotMatch(partner, /team\.paidMemberCount === 5|5\/5 결제|정확히 5명/i)
})

test('user and super-admin copy describe standard five and female-trio six without reviving 2M3F', () => {
  const user = read('components/tonight/UserTonightExperience.tsx')
  const superAdmin = read('components/tonight/SuperAdminTonightConsole.tsx')
  const rehearsal = read('components/tonight/rehearsal-state.ts')

  assert.match(user, /기본은 남 3명 · 여 2명/i)
  assert.match(user, /여성 친구 3명[\s\S]*?남 3명 · 여 3명/i)
  assert.match(superAdmin, /activeTeam\.memberCount[\s\S]*?activeTeam\.maleCount[\s\S]*?activeTeam\.femaleCount/i)
  assert.match(superAdmin, /activeTeam\.memberCount\}\s*\/\s*\{activeTeam\.memberCount\}명/i)
  assert.doesNotMatch(`${user}\n${superAdmin}\n${rehearsal}`, /남\s*2[^\n]{0,20}여\s*3|2남[^\n]{0,20}3녀/i)
})

test('rehearsal fixtures cover both valid roster profiles and no forbidden normal team', () => {
  const fixtures = read('components/tonight/rehearsal-fixtures.ts')

  assert.match(fixtures, /memberCount: 6/i)
  assert.match(fixtures, /maleCount: 3/i)
  assert.match(fixtures, /femaleCount: team\.memberCount === 6 \? 3 : 2/i)
  assert.match(fixtures, /memberCount: 5[\s\S]*?maleCount: 3[\s\S]*?femaleCount: 2/i)
  assert.doesNotMatch(fixtures, /maleCount:\s*2[\s\S]{0,80}?femaleCount:\s*3/i)
})

test('rehearsal uses the same round-global team-code contract as production', () => {
  const fixtures = read('components/tonight/rehearsal-fixtures.ts')
  const codes = [...fixtures.matchAll(/(?:teamCode|code):\s*'([^']+)'/g)].map((match) => match[1])

  assert.ok(codes.length > 0)
  for (const code of codes) {
    assert.match(code, /^Q-PNU-\d{8}-\d{3,}$/)
  }
  assert.deepEqual([...new Set(codes)].sort(), [
    'Q-PNU-20260903-001',
    'Q-PNU-20260903-002',
    'Q-PNU-20260903-003',
  ])
})

test('rehearsal operations totals reconcile assigned members and waitlist', () => {
  const fixtures = read('components/tonight/rehearsal-fixtures.ts')

  assert.match(fixtures, /applicationCount:\s*40/)
  assert.match(fixtures, /waitlistedCount:\s*stage\s*>=\s*1\s*\?\s*24\s*:\s*0/)
  assert.match(fixtures, /memberCount:\s*5[\s\S]*?memberCount:\s*6[\s\S]*?memberCount:\s*5/)
})

test('Today Night entry, activity and notification copy never promises the retired 2M3F roster', () => {
  const entryCopy = [
    read('components/home/QuantumHomeLead.tsx'),
    read('components/matching/QuantumMatchDiscovery.tsx'),
    read('components/tonight/UserTonightExperience.tsx'),
    read('components/tonight/TonightActivityExplorer.tsx'),
    read('app/notifications/page.tsx'),
    read('lib/matching/tonight-ranked/activity-catalog.ts'),
  ].join('\n')

  assert.match(entryCopy, /기본(?:은)? 남\s*3(?:명)?\s*·\s*여\s*2(?:명)?/i)
  assert.match(entryCopy, /여성 친구 3명[\s\S]*?남(?:성)?\s*3명/i)
  assert.doesNotMatch(entryCopy, /남\s*2[^\n]{0,20}여\s*3|2남[^\n]{0,20}3녀/i)
  assert.doesNotMatch(entryCopy, /오늘밤 5명 팀|5\/5 결제|다섯 명과 장소/i)
})
