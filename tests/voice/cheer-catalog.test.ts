import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  CHEER_TEAMS,
  getCheerTeam,
  getCheerTeams,
} from '../../lib/voice/cheer-catalog'

const expectedNames = {
  lck: [
    'Hanwha Life Esports',
    'T1',
    'BNK FEARX',
    'DN SOOPers',
    'HANJIN BRION',
    'Gen.G Esports',
    'Dplus KIA',
    'kt Rolster',
    'NONGSHIM RED FORCE',
    'KIWOOM DRX',
  ],
  kbo: [
    'LG 트윈스',
    '한화 이글스',
    'SSG 랜더스',
    '삼성 라이온즈',
    'NC 다이노스',
    'KT 위즈',
    '롯데 자이언츠',
    'KIA 타이거즈',
    '두산 베어스',
    '키움 히어로즈',
  ],
} as const

test('cheer catalog exposes the 2026 official LCK and KBO display names', () => {
  assert.equal(CHEER_TEAMS.length, 20)
  assert.deepEqual(
    getCheerTeams('lck').map((team) => team.name),
    expectedNames.lck,
  )
  assert.deepEqual(
    getCheerTeams('kbo').map((team) => team.name),
    expectedNames.kbo,
  )
  assert.deepEqual(getCheerTeams(), CHEER_TEAMS)
})

test('cheer catalog has stable unique ids and official provenance', () => {
  const ids = new Set<string>()
  for (const team of CHEER_TEAMS) {
    assert.match(team.id, new RegExp(`^${team.league}-[a-z0-9]+(?:-[a-z0-9]+)*$`))
    assert.equal(ids.has(team.id), false)
    ids.add(team.id)
    assert.equal(team.verifiedAt, '2026-09-07')
    assert.equal(
      team.sourceUrl,
      team.league === 'lck'
        ? 'https://lolesports.com/en-US/tournament/113503357263583149/overview'
        : 'https://www.koreabaseball.com/Kbo/League/TeamInfo.aspx',
    )
    assert.match(team.logo, /^\/social-scenes\/teams\/[a-z0-9-]+\.(?:png|webp)$/)
    assert.equal(getCheerTeam(team.id), team)
    assert.equal(Object.isFrozen(team), true)
  }
  assert.equal(getCheerTeam('lck-not-a-team'), null)
  assert.equal(Object.isFrozen(CHEER_TEAMS), true)
  assert.equal(Object.isFrozen(getCheerTeams('lck')), true)
  assert.equal(Object.isFrozen(getCheerTeams('kbo')), true)
})

test('every catalog logo is a non-empty PNG or WebP local review asset', () => {
  for (const team of CHEER_TEAMS) {
    const assetPath = path.join(process.cwd(), 'public', team.logo.slice(1))
    assert.ok(statSync(assetPath).size > 100, `${team.id} logo is unexpectedly small`)
    const bytes = readFileSync(assetPath)
    const isPng = bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    const isWebp =
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    assert.ok(isPng || isWebp, `${team.id} logo is not a PNG or WebP file`)
  }
})
