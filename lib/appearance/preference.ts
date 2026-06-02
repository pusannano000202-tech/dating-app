// 이상형 월드컵 선택 로그 → preferred_appearance_vector 계산
// 핵심 원칙: target_type 을 매칭에 직접 쓰지 않는다. measured.appearance_vector 만 사용한다.

import {
  type AppearanceVector,
  type PoolAxisStats,
  addVector,
  scaleVector,
  subVector,
  zeroVector,
  computeAxisPercentileVector,
  computeAxisZVector,
} from './vector'
import type { IdealImageItem } from './metadata'

export type RoundLabel = '64강' | '32강' | '16강' | '8강' | '4강' | '결승' | '최종우승'

// docs/product/profile-worldcup/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md 10-2 표
export const ROUND_WEIGHT: Record<RoundLabel, number> = {
  '64강': 1.00,
  '32강': 1.15,
  '16강': 1.35,
  '8강': 1.60,
  '4강': 1.90,
  '결승': 2.30,
  '최종우승': 2.80,
}

export interface ChoiceLog {
  round: RoundLabel
  match_index: number
  winner_id: string
  loser_id: string
  // winner/loser 벡터는 매칭 엔진 검증을 위해 저장. 사용자에게 노출 금지.
  winner_vector: AppearanceVector
  loser_vector: AppearanceVector
  choice_delta_vector: AppearanceVector
  weight: number
  created_at: string
}

export interface PreferenceResult {
  preferred_appearance_vector: AppearanceVector
  preferred_appearance_delta_vector: AppearanceVector
  preferred_choice_delta_vector: AppearanceVector
  // Codex CODEX_FEMALE_64_IMAGE_GENERATION_PROMPT.md "매칭 유효성 시뮬레이션" 절 핵심:
  // 풀이 청순으로 쏠려있어도 사용자가 청순 상위를 골랐는지 매칭에 반영하려면
  // 절대값(preferred_vector)이나 차이값(delta)만으로 부족하고
  // 풀 분포 내 percentile/z-score 도 필요하다.
  preferred_axis_percentile_vector: AppearanceVector // 0~100, 풀 분포 내 위치
  preferred_axis_z_vector: AppearanceVector // 풀 mean/std 기준 z-score
  preferred_score_range: { mean: number; min: number; max: number }
  preferred_bucket_weights: Record<string, number>
  worldcup_pool_mean_vector: AppearanceVector
  pool_axis_stats: PoolAxisStats // 풀 축별 통계 (디버그/매칭 가중치 산출용)
  choice_logs: ChoiceLog[]
  // 사용자가 직접 본 이미지 풀에서의 통계. 디버그용.
  meta: {
    total_choices: number
    final_winner_id: string | null
    gender: 'female' | 'male'
  }
}

export function buildChoiceLog(
  round: RoundLabel,
  match_index: number,
  winner: IdealImageItem,
  loser: IdealImageItem,
): ChoiceLog {
  const wv = winner.measured!.appearance_vector
  const lv = loser.measured!.appearance_vector
  return {
    round,
    match_index,
    winner_id: winner.id,
    loser_id: loser.id,
    winner_vector: wv,
    loser_vector: lv,
    choice_delta_vector: subVector(wv, lv),
    weight: ROUND_WEIGHT[round],
    created_at: new Date().toISOString(),
  }
}

function emptyVector(gender: 'female' | 'male'): AppearanceVector {
  return zeroVector(gender)
}

export interface ComputeArgs {
  gender: 'female' | 'male'
  choiceLogs: ChoiceLog[]
  poolMeanVector: AppearanceVector
  poolAxisStats: PoolAxisStats
  // 각 라운드별 winner id 의 IdealImageItem 매핑 (벡터/버킷 조회용)
  winnerItems: IdealImageItem[]
  finalWinnerId: string | null
}

export function computePreference(args: ComputeArgs): PreferenceResult {
  const { gender, choiceLogs, poolMeanVector, poolAxisStats, winnerItems, finalWinnerId } = args

  // 1. preferred_appearance_vector
  //    = winner 이미지들의 measured_vector 의 라운드 가중 평균
  //    같은 winner 가 여러 라운드에서 이기면(우승자처럼) 각 라운드 가중치가 누적된다.
  let weightedSum = emptyVector(gender)
  let weightTotal = 0
  for (const log of choiceLogs) {
    const w = log.weight
    weightedSum = addVector(weightedSum, scaleVector(log.winner_vector, w))
    weightTotal += w
  }
  // 최종 우승 가중치는 별도 추가
  if (finalWinnerId) {
    const finalItem = winnerItems.find((it) => it.id === finalWinnerId)
    if (finalItem?.measured) {
      const w = ROUND_WEIGHT['최종우승']
      weightedSum = addVector(weightedSum, scaleVector(finalItem.measured.appearance_vector, w))
      weightTotal += w
    }
  }
  const preferred_appearance_vector =
    weightTotal > 0 ? scaleVector(weightedSum, 1 / weightTotal) : emptyVector(gender)

  // 2. preferred_appearance_delta_vector
  //    = preferred - pool_mean (풀 쏠림 보정 — 절대값 기준)
  const preferred_appearance_delta_vector = subVector(preferred_appearance_vector, poolMeanVector)

  // 3. preferred_choice_delta_vector
  //    = 모든 choice_delta 의 가중 평균
  let cdSum = emptyVector(gender)
  let cdTotal = 0
  for (const log of choiceLogs) {
    cdSum = addVector(cdSum, scaleVector(log.choice_delta_vector, log.weight))
    cdTotal += log.weight
  }
  const preferred_choice_delta_vector =
    cdTotal > 0 ? scaleVector(cdSum, 1 / cdTotal) : emptyVector(gender)

  // 4. preferred_axis_percentile_vector & preferred_axis_z_vector
  //    풀 분포 내 사용자 선택값의 상대 위치. 청순 쏠림 보정의 핵심.
  //    예: 풀의 청순함이 0.65±0.05 일 때 사용자 선택 0.78 → delta=0.13 (작아 보임),
  //         z=2.6 (강한 신호)로 평가된다.
  const preferred_axis_percentile_vector = computeAxisPercentileVector(
    preferred_appearance_vector,
    poolAxisStats,
  )
  const preferred_axis_z_vector = computeAxisZVector(
    preferred_appearance_vector,
    poolAxisStats,
  )

  // 5. preferred_score_range — winner item 의 measured score 통계
  const winnerScores: number[] = []
  for (const log of choiceLogs) {
    const item = winnerItems.find((it) => it.id === log.winner_id)
    if (item?.measured) winnerScores.push(item.measured.appearance_score_normalized)
  }
  const preferred_score_range = {
    mean: winnerScores.length ? winnerScores.reduce((a, b) => a + b, 0) / winnerScores.length : 0,
    min: winnerScores.length ? Math.min(...winnerScores) : 0,
    max: winnerScores.length ? Math.max(...winnerScores) : 0,
  }

  // 6. preferred_bucket_weights — winner item 의 final_bucket 빈도 × 라운드 가중치
  const bucketWeights: Record<string, number> = {}
  for (const log of choiceLogs) {
    const item = winnerItems.find((it) => it.id === log.winner_id)
    if (item?.final_bucket) {
      bucketWeights[item.final_bucket] = (bucketWeights[item.final_bucket] ?? 0) + log.weight
    }
  }
  // 정규화 (합이 1이 되도록)
  const bwTotal = Object.values(bucketWeights).reduce((a, b) => a + b, 0)
  const preferred_bucket_weights: Record<string, number> = {}
  if (bwTotal > 0) {
    for (const [k, v] of Object.entries(bucketWeights)) {
      preferred_bucket_weights[k] = Math.round((v / bwTotal) * 1000) / 1000
    }
  }

  return {
    preferred_appearance_vector,
    preferred_appearance_delta_vector,
    preferred_choice_delta_vector,
    preferred_axis_percentile_vector,
    preferred_axis_z_vector,
    preferred_score_range,
    preferred_bucket_weights,
    worldcup_pool_mean_vector: poolMeanVector,
    pool_axis_stats: poolAxisStats,
    choice_logs: choiceLogs,
    meta: {
      total_choices: choiceLogs.length,
      final_winner_id: finalWinnerId,
      gender,
    },
  }
}
