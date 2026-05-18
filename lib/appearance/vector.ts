// 외모 벡터 수학 유틸 (성별별 13축/12축 공용)
// 사용자 노출 금지 — 모두 내부 매칭 계산용

export type AppearanceVector = Record<string, number>

export const FEMALE_AXES = [
  '귀여움', '청순함', '시크함', '따뜻함', '스타일리시함',
  '건강함', '성숙함', '지적단정함', '눈큼',
  '부드러운인상', '날카로운인상', '자연스러움', '화려함',
] as const

export const MALE_AXES = [
  '훈훈함', '댄디함', '시크함', '소년미', '건강함',
  '지적단정함', '남성미', '스타일리시함',
  '부드러운인상', '날카로운인상', '체형탄탄함', '자연스러움',
] as const

export type FemaleAxis = typeof FEMALE_AXES[number]
export type MaleAxis = typeof MALE_AXES[number]

export const FEMALE_BUCKETS = [
  '귀여운/동안형', '청순/자연형', '시크/도도형', '따뜻한/부드러운형',
  '스타일리시/화려형', '건강/활동형', '성숙/분위기형', '지적/단정형',
] as const

export const MALE_BUCKETS = [
  '훈훈/부드러운형', '댄디/단정형', '시크/날카로운형', '소년미/귀여운형',
  '운동/건강형', '지적/안경형', '강한 인상/남성미형', '스타일리시/개성형',
] as const

export type FemaleBucket = typeof FEMALE_BUCKETS[number]
export type MaleBucket = typeof MALE_BUCKETS[number]
export type Bucket = FemaleBucket | MaleBucket

export function getAxes(gender: 'female' | 'male'): readonly string[] {
  return gender === 'female' ? FEMALE_AXES : MALE_AXES
}

export function getBuckets(gender: 'female' | 'male'): readonly Bucket[] {
  return gender === 'female' ? FEMALE_BUCKETS : MALE_BUCKETS
}

export function zeroVector(gender: 'female' | 'male'): AppearanceVector {
  const out: AppearanceVector = {}
  for (const axis of getAxes(gender)) out[axis] = 0
  return out
}

export function neutralVector(gender: 'female' | 'male'): AppearanceVector {
  const out: AppearanceVector = {}
  for (const axis of getAxes(gender)) out[axis] = 0.5
  return out
}

export function addVector(a: AppearanceVector, b: AppearanceVector): AppearanceVector {
  const out: AppearanceVector = {}
  for (const key of Object.keys(a)) out[key] = (a[key] ?? 0) + (b[key] ?? 0)
  return out
}

export function scaleVector(v: AppearanceVector, k: number): AppearanceVector {
  const out: AppearanceVector = {}
  for (const key of Object.keys(v)) out[key] = v[key] * k
  return out
}

export function subVector(a: AppearanceVector, b: AppearanceVector): AppearanceVector {
  const out: AppearanceVector = {}
  for (const key of Object.keys(a)) out[key] = (a[key] ?? 0) - (b[key] ?? 0)
  return out
}

export function meanVector(vectors: AppearanceVector[]): AppearanceVector | null {
  if (vectors.length === 0) return null
  const sum = vectors.reduce((acc, v) => addVector(acc, v), zeroVector(detectGender(vectors[0])))
  return scaleVector(sum, 1 / vectors.length)
}

export function weightedMeanVector(
  vectors: { vector: AppearanceVector; weight: number }[],
): AppearanceVector | null {
  if (vectors.length === 0) return null
  const totalWeight = vectors.reduce((s, v) => s + v.weight, 0)
  if (totalWeight === 0) return null
  const acc = zeroVector(detectGender(vectors[0].vector))
  for (const { vector, weight } of vectors) {
    for (const key of Object.keys(vector)) {
      acc[key] = (acc[key] ?? 0) + vector[key] * weight
    }
  }
  return scaleVector(acc, 1 / totalWeight)
}

export function cosineSimilarity(a: AppearanceVector, b: AppearanceVector): number {
  const keys = Object.keys(a).filter((k) => k in b)
  let dot = 0
  let na = 0
  let nb = 0
  for (const k of keys) {
    dot += a[k] * b[k]
    na += a[k] * a[k]
    nb += b[k] * b[k]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function detectGender(v: AppearanceVector): 'female' | 'male' {
  return '귀여움' in v ? 'female' : 'male'
}

// ─── 축별 분포 통계 (Codex CODEX_FEMALE_64_IMAGE_GENERATION_PROMPT.md 축 커버리지 검수용) ─────
// 풀의 각 축에 대해 mean/std/percentiles 를 계산한다.
// 이건 청순 쏠림 보정의 핵심: 풀의 spread 가 좁으면 같은 절대값 차이라도 z-score 는 커진다.

export interface AxisStats {
  mean: number
  std: number
  min: number
  max: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  spread: number // p90 - p10
  values_sorted: number[]
}

export type PoolAxisStats = Record<string, AxisStats>

function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0
  if (sortedAsc.length === 1) return sortedAsc[0]
  const pos = q * (sortedAsc.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (pos - lo) * (sortedAsc[hi] - sortedAsc[lo])
}

export function computePoolAxisStats(
  gender: 'female' | 'male',
  vectors: AppearanceVector[],
): PoolAxisStats {
  const stats: PoolAxisStats = {}
  if (vectors.length === 0) return stats
  for (const axis of getAxes(gender)) {
    const values = vectors.map((v) => v[axis] ?? 0)
    const sorted = [...values].sort((a, b) => a - b)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length
    const std = Math.sqrt(variance)
    const p10 = percentile(sorted, 0.10)
    const p25 = percentile(sorted, 0.25)
    const p50 = percentile(sorted, 0.50)
    const p75 = percentile(sorted, 0.75)
    const p90 = percentile(sorted, 0.90)
    stats[axis] = {
      mean,
      std,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p10, p25, p50, p75, p90,
      spread: p90 - p10,
      values_sorted: sorted,
    }
  }
  return stats
}

// 값 x 가 풀 분포에서 차지하는 percentile (0~100)
// 같은 값이 풀에 여러 개 있으면 평균 rank 사용
export function valuePercentile(x: number, sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 50
  if (sortedAsc.length === 1) return 50
  // 선형 보간으로 percentile 계산
  if (x <= sortedAsc[0]) return 0
  if (x >= sortedAsc[sortedAsc.length - 1]) return 100
  for (let i = 0; i < sortedAsc.length - 1; i++) {
    if (sortedAsc[i] <= x && x <= sortedAsc[i + 1]) {
      const span = sortedAsc[i + 1] - sortedAsc[i]
      const loPct = (i / (sortedAsc.length - 1)) * 100
      const hiPct = ((i + 1) / (sortedAsc.length - 1)) * 100
      if (span === 0) return loPct
      const ratio = (x - sortedAsc[i]) / span
      return loPct + ratio * (hiPct - loPct)
    }
  }
  return 50
}

// 값 x 의 z-score (mean=μ, std=σ 기준)
// std 가 0 이면 z=0 (정의 불가, 분포 무의미)
export function valueZScore(x: number, mean: number, std: number): number {
  if (std === 0 || !isFinite(std)) return 0
  return (x - mean) / std
}

// preferred_axis_percentile_vector 계산
// = preferred_appearance_vector 의 각 축 값을 풀 분포의 percentile 로 변환
export function computeAxisPercentileVector(
  vector: AppearanceVector,
  stats: PoolAxisStats,
): AppearanceVector {
  const out: AppearanceVector = {}
  for (const axis of Object.keys(vector)) {
    const s = stats[axis]
    if (!s) { out[axis] = 50; continue }
    out[axis] = Math.round(valuePercentile(vector[axis], s.values_sorted) * 100) / 100
  }
  return out
}

// preferred_axis_z_vector 계산
// = preferred_appearance_vector 의 각 축 값을 풀 분포의 z-score 로 변환
export function computeAxisZVector(
  vector: AppearanceVector,
  stats: PoolAxisStats,
): AppearanceVector {
  const out: AppearanceVector = {}
  for (const axis of Object.keys(vector)) {
    const s = stats[axis]
    if (!s) { out[axis] = 0; continue }
    out[axis] = Math.round(valueZScore(vector[axis], s.mean, s.std) * 1000) / 1000
  }
  return out
}

// ─── 버킷 점수 계산 ─────────────────────────────────────
// docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md 5, 6절 공식 그대로

export function computeFemaleBucketScores(v: AppearanceVector): Record<FemaleBucket, number> {
  const g = (k: string) => v[k] ?? 0
  const inv = (k: string) => 1 - (v[k] ?? 0)
  return {
    '귀여운/동안형': g('귀여움') * 0.45 + g('눈큼') * 0.20 + g('부드러운인상') * 0.15 + g('따뜻함') * 0.10 + inv('성숙함') * 0.10,
    '청순/자연형':   g('청순함') * 0.45 + g('자연스러움') * 0.25 + g('부드러운인상') * 0.15 + g('지적단정함') * 0.10 + inv('화려함') * 0.05,
    '시크/도도형':   g('시크함') * 0.40 + g('날카로운인상') * 0.30 + g('스타일리시함') * 0.15 + g('성숙함') * 0.10 + inv('따뜻함') * 0.05,
    '따뜻한/부드러운형': g('따뜻함') * 0.40 + g('부드러운인상') * 0.30 + g('자연스러움') * 0.15 + g('청순함') * 0.10 + inv('날카로운인상') * 0.05,
    '스타일리시/화려형': g('스타일리시함') * 0.40 + g('화려함') * 0.30 + g('시크함') * 0.15 + g('성숙함') * 0.10 + g('건강함') * 0.05,
    '건강/활동형':   g('건강함') * 0.50 + g('자연스러움') * 0.20 + g('스타일리시함') * 0.10 + g('따뜻함') * 0.10 + inv('화려함') * 0.10,
    '성숙/분위기형': g('성숙함') * 0.40 + g('청순함') * 0.15 + g('시크함') * 0.15 + g('지적단정함') * 0.15 + g('화려함') * 0.10 + inv('귀여움') * 0.05,
    '지적/단정형':   g('지적단정함') * 0.45 + g('청순함') * 0.15 + g('자연스러움') * 0.15 + g('스타일리시함') * 0.10 + g('부드러운인상') * 0.10 + inv('화려함') * 0.05,
  }
}

export function computeMaleBucketScores(v: AppearanceVector): Record<MaleBucket, number> {
  const g = (k: string) => v[k] ?? 0
  const inv = (k: string) => 1 - (v[k] ?? 0)
  return {
    '훈훈/부드러운형': g('훈훈함') * 0.35 + g('부드러운인상') * 0.30 + g('자연스러움') * 0.15 + g('소년미') * 0.10 + inv('날카로운인상') * 0.10,
    '댄디/단정형':     g('댄디함') * 0.40 + g('지적단정함') * 0.25 + g('스타일리시함') * 0.15 + g('자연스러움') * 0.10 + g('훈훈함') * 0.10,
    '시크/날카로운형': g('시크함') * 0.40 + g('날카로운인상') * 0.30 + g('스타일리시함') * 0.15 + g('남성미') * 0.10 + inv('부드러운인상') * 0.05,
    '소년미/귀여운형': g('소년미') * 0.45 + g('훈훈함') * 0.20 + g('부드러운인상') * 0.15 + g('자연스러움') * 0.10 + inv('남성미') * 0.10,
    '운동/건강형':     g('건강함') * 0.40 + g('체형탄탄함') * 0.30 + g('자연스러움') * 0.10 + g('남성미') * 0.10 + g('스타일리시함') * 0.10,
    '지적/안경형':     g('지적단정함') * 0.45 + g('댄디함') * 0.20 + g('자연스러움') * 0.10 + g('부드러운인상') * 0.10 + g('시크함') * 0.10 + g('스타일리시함') * 0.05,
    '강한 인상/남성미형': g('남성미') * 0.35 + g('날카로운인상') * 0.20 + g('체형탄탄함') * 0.20 + g('건강함') * 0.15 + g('시크함') * 0.10,
    '스타일리시/개성형': g('스타일리시함') * 0.45 + g('시크함') * 0.15 + g('댄디함') * 0.15 + g('자연스러움') * 0.10 + g('날카로운인상') * 0.10 + g('남성미') * 0.05,
  }
}

export function computeBucketScores(
  gender: 'female' | 'male',
  v: AppearanceVector,
): Record<string, number> {
  return gender === 'female' ? computeFemaleBucketScores(v) : computeMaleBucketScores(v)
}
