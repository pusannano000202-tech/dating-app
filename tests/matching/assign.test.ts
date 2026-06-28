import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assignMatches } from '../../lib/matching/assign'
import type { PairScore, SimulatedBatch } from '../../lib/matching/types'

function pair(a: string, b: string, score: number): PairScore {
  return {
    groupAId: a,
    groupBId: b,
    score,
    matchable: { ok: true },
    breakdown: {
      appearanceAB: 0,
      appearanceBA: 0,
      appearance: 0,
      personality: 0,
      time: 0,
      scoreBand: 0,
      weightAlignment: 0,
      asymmetryPenalty: 0,
      ageFit: 0,
    },
  }
}

function batch(candidates: PairScore[]): SimulatedBatch {
  return { candidates, rejected: [] }
}

test('assignMatches picks highest score first and uses each group once', () => {
  const result = assignMatches(
    batch([
      pair('g1', 'g2', 0.6),
      pair('g1', 'g3', 0.9), // 더 높은 점수 → g1 은 여기에 배정
      pair('g3', 'g4', 0.5),
    ]),
  )

  assert.deepEqual(result, [
    { groupAId: 'g1', groupBId: 'g3', score: 0.9 },
  ])
})

test('assignMatches assigns disjoint pairs', () => {
  const result = assignMatches(
    batch([
      pair('g1', 'g2', 0.8),
      pair('g3', 'g4', 0.7),
    ]),
  )

  assert.deepEqual(result.map((r) => [r.groupAId, r.groupBId]), [
    ['g1', 'g2'],
    ['g3', 'g4'],
  ])
})

test('assignMatches re-sorts unsorted candidates defensively', () => {
  const result = assignMatches(
    batch([
      pair('g1', 'g2', 0.3),
      pair('g1', 'g3', 0.95),
    ]),
  )

  assert.deepEqual(result, [
    { groupAId: 'g1', groupBId: 'g3', score: 0.95 },
  ])
})

test('assignMatches returns empty for no candidates', () => {
  assert.deepEqual(assignMatches(batch([])), [])
})
