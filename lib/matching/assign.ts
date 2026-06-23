import type { SimulatedBatch } from './types'

/**
 * 최종 배정 결과 — 한 그룹은 한 번만 등장한다.
 */
export interface Assignment {
  groupAId: string
  groupBId: string
  score: number
}

/**
 * greedy 배정: simulateBatch 가 만든 후보(점수순)에서 각 그룹을 한 번만 쓰도록
 * 점수 높은 쌍부터 확정한다.
 *
 * - 입력 candidates 가 정렬돼 있지 않아도 안전하도록 방어적으로 재정렬한다.
 * - 한쪽이라도 이미 배정된 그룹이면 건너뛴다.
 * - 헝가리안(전역 최적)이 아니라 greedy(국소 최적)지만, 운영 초반 배치 + 운영자
 *   승인 게이트 조합에는 충분하다. 전역 최적화는 추후 교체 지점.
 */
export function assignMatches(batch: SimulatedBatch): Assignment[] {
  const used = new Set<string>()
  const result: Assignment[] = []

  const sorted = [...batch.candidates].sort((a, b) => b.score - a.score)
  for (const candidate of sorted) {
    if (used.has(candidate.groupAId) || used.has(candidate.groupBId)) {
      continue
    }
    used.add(candidate.groupAId)
    used.add(candidate.groupBId)
    result.push({
      groupAId: candidate.groupAId,
      groupBId: candidate.groupBId,
      score: candidate.score,
    })
  }

  return result
}
