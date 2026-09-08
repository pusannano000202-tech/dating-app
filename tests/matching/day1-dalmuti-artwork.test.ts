import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DAY1_DALMUTI_RULES } from '../../lib/matching/day1-dalmuti-rules'
import { DAY1_DALMUTI_RULE_ARTWORK } from '../../lib/matching/day1-dalmuti-artwork'

test('safe dalmuti guide preserves all fourteen illustrated rules', () => {
  const path = 'components/matching/DalmutiRulesGuide.tsx'
  assert.ok(existsSync(path), 'the illustrated rules guide is missing')
  const source = readFileSync(path, 'utf8')
  assert.match(source, /DAY1_DALMUTI_RULES/)
  assert.match(source, /DAY1_DALMUTI_RULE_ARTWORK/)
  assert.match(source, /이전 규칙/)
  assert.match(source, /다음 규칙/)
  assert.doesNotMatch(source, /fetch\(|POST|localStorage|sessionStorage/)
  const assets = readFileSync('lib/matching/day1-dalmuti-artwork.ts', 'utf8')
  const paths = [...assets.matchAll(/'(\/images\/match\/events\/day1-dalmuti\/scene-[^']+\.webp)'/g)].map((match) => match[1])
  assert.equal(paths.length, 14)
  assert.equal(new Set(paths).size, 14)
  assert.equal(DAY1_DALMUTI_RULES.length, DAY1_DALMUTI_RULE_ARTWORK.length)
  assert.deepEqual(paths, [...DAY1_DALMUTI_RULE_ARTWORK])
  assert.match(paths[13], /scene-14-v2/)
  for (const item of paths) assert.ok(existsSync(`public${item}`), item)
  assert.match(readFileSync('lib/matching/day1-dalmuti-rules.ts', 'utf8'), /모욕·외모 평가·접촉·음주 권유 없이 서로 존중/)
})
