import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { legacyVectorFromBucketWeights } from '../../lib/appearance/bucket-to-legacy'
import type { IdealMetadata } from '../../lib/appearance/metadata'
import { validateWorldcupBracket } from '../../lib/profile/mobile-worldcup'

const metadata = JSON.parse(readFileSync(join(process.cwd(), 'public/appearance-ideal/METADATA.json'), 'utf8')) as IdealMetadata

test('mobile worldcup accepts a complete deterministic 64-person bracket', () => {
  const pool = metadata.items
    .filter((item) => item.gender === 'male' && item.status === 'active' && item.measured && item.bucket_scores && item.final_bucket)
    .sort((a, b) => a.id.localeCompare(b.id))
  const winnerIds: string[] = []
  let round = [...pool]
  while (round.length > 1) {
    const next = []
    for (let index = 0; index < round.length; index += 2) {
      winnerIds.push(round[index].id)
      next.push(round[index])
    }
    round = next
  }

  const result = validateWorldcupBracket(pool, winnerIds)
  assert.ok(result)
  assert.equal(result.logs.length, 63)
  assert.equal(result.finalWinner.id, pool[0].id)
})

test('mobile worldcup rejects a winner that was not in the current pair', () => {
  const pool = metadata.items
    .filter((item) => item.gender === 'female' && item.status === 'active' && item.measured && item.bucket_scores && item.final_bucket)
    .sort((a, b) => a.id.localeCompare(b.id))
  assert.equal(validateWorldcupBracket(pool, Array(63).fill(pool[2].id)), null)
})

test('legacy compatibility vector combines bucket weights into matching engine keys', () => {
  const vector = legacyVectorFromBucketWeights('male', {
    '훈훈/부드러운형': 0.6,
    '운동/건강형': 0.4,
  })

  assert.deepEqual(vector, { cute: 0, pure: 0, chic: 0, warm: 0.6, stylish: 0, healthy: 0.4 })
})

test('mobile worldcup route never returns internal vectors or scores to the client', () => {
  const source = readFileSync(join(process.cwd(), 'app/api/profile/worldcup/route.ts'), 'utf8')
  const getBlock = source.slice(source.indexOf('export async function GET'), source.indexOf('export async function PUT'))

  assert.match(getBlock, /candidates: context\.pool\.map/)
  assert.doesNotMatch(getBlock, /appearance_vector|bucket_scores|appearance_score/)
  assert.match(source, /createSupabaseRequestClient\(request\)/)
  assert.match(source, /validateWorldcupBracket/)
  assert.match(source, /\.eq\('user_id', context\.userId\)/)
})
