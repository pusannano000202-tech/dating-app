import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

test('matching entry clearly separates today from the single weekly enrollment flow', () => {
  const homeLead = read('components/home/QuantumHomeLead.tsx')
  const discovery = read('components/matching/QuantumMatchDiscovery.tsx')
  const weekly = read('components/matching/WeeklyActivityExplorer.tsx')

  assert.match(homeLead, /href="\/tonight"/)
  assert.match(homeLead, /사진 3장/)
  assert.match(discovery, /href="\/tonight"/)
  assert.match(discovery, /1·2·3순위/)
  assert.match(discovery, /label: '오늘 만나기'/)
  assert.match(discovery, /label: '이번 주 만나기'/)
  assert.match(discovery, /role="group"/)
  assert.match(discovery, /aria-pressed=\{active\}/)
  assert.match(discovery, /<WeeklyActivityExplorer\s*\/>/)
  assert.doesNotMatch(discovery, /<QuantumEventWheel/)
  assert.match(weekly, /이번 주 만나기 · 한 신청 풀/)
  assert.match(weekly, /선택한 .*개 날짜로 한 번만 신청/)
})
