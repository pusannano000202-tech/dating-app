// 이상형 월드컵 메타데이터 로더
// public/appearance-ideal/METADATA.json 을 로드해서 active 이미지만 노출
// 사용자에게 보이는 라벨(target_type, measured_type, primary_type, score)은 절대 화면으로 빠져나가면 안 된다.

import {
  type AppearanceVector,
  type PoolAxisStats,
  computePoolAxisStats,
} from './vector'

export type IdealImageStatus = 'active' | 'candidate' | 'rejected' | 'regenerate'
export type IdealImageDecision = 'active' | 'candidate' | 'rejected' | 'regenerate'
export type DuplicateRisk = 'pass' | 'soft' | 'fail'

export interface IdealImageTarget {
  score: number
  type: string
  subtype: string
  prompt: string
}

export interface IdealImageMeasured {
  subject_gender: 'female' | 'male'
  appearance_score_normalized: number
  score_confidence: number
  primary_type: string
  secondary_types: string[]
  appearance_vector: AppearanceVector
}

export interface IdealImageVisualReview {
  duplicate_risk: DuplicateRisk
  similar_to: string[]
  difference_notes: string
}

export interface IdealImageReview {
  target_measured_mismatch: boolean
  // Codex CODEX_FEMALE_64_IMAGE_GENERATION_PROMPT.md 에 따라 decision 추가
  decision?: IdealImageDecision
  accepted_reason: string
  rejection_reason: string
}

export interface IdealImageItem {
  id: string
  gender: 'female' | 'male'
  file: string // Codex 표준: "public/appearance-ideal/..." 형태로 저장됨
  status: IdealImageStatus
  generation_round: number
  target: IdealImageTarget
  measured: IdealImageMeasured | null
  bucket_scores: Record<string, number> | null
  final_bucket: string | null
  matching_vector_source: 'measured.appearance_vector'
  visual_review?: IdealImageVisualReview // Codex 추가 필드
  review: IdealImageReview
}

export interface IdealMetadata {
  _meta: {
    version: number
    generated_at: string
    design_doc: string
    plan_doc: string
    schema_doc: string
    notes: string[]
  }
  // Codex 가 채울 풀 평균 (없으면 런타임 계산)
  female_pool_mean_vector: AppearanceVector | null
  male_pool_mean_vector: AppearanceVector | null
  items: IdealImageItem[]
}

let cache: IdealMetadata | null = null

export async function loadIdealMetadata(): Promise<IdealMetadata> {
  if (cache) return cache
  const res = await fetch('/appearance-ideal/METADATA.json', { cache: 'force-cache' })
  if (!res.ok) throw new Error(`METADATA.json load failed: ${res.status}`)
  const data: IdealMetadata = await res.json()
  cache = data
  return data
}

export function selectActivePool(
  meta: IdealMetadata,
  gender: 'female' | 'male',
): IdealImageItem[] {
  return meta.items.filter(
    (it) =>
      it.gender === gender &&
      it.status === 'active' &&
      it.measured != null &&
      it.measured.appearance_vector != null,
  )
}

export function computePoolMeanVector(items: IdealImageItem[]): AppearanceVector | null {
  if (items.length === 0) return null
  const first = items[0].measured!.appearance_vector
  const keys = Object.keys(first)
  const sum: Record<string, number> = {}
  for (const k of keys) sum[k] = 0
  for (const it of items) {
    for (const k of keys) sum[k] += it.measured!.appearance_vector[k] ?? 0
  }
  const out: AppearanceVector = {}
  for (const k of keys) out[k] = sum[k] / items.length
  return out
}

export function computePoolStats(
  gender: 'female' | 'male',
  items: IdealImageItem[],
): PoolAxisStats {
  const vectors = items.map((it) => it.measured!.appearance_vector)
  return computePoolAxisStats(gender, vectors)
}

// Codex 가 file 을 "public/appearance-ideal/..." 또는 "appearance-ideal/..." 로 저장할 수 있다.
// Next.js 의 web root 는 public/ 폴더이므로 URL 은 "/appearance-ideal/..." 가 되어야 한다.
export function publicImageUrl(file: string): string {
  let path = file
  // "public/" 접두사 제거
  if (path.startsWith('public/')) path = path.slice('public/'.length)
  if (path.startsWith('/public/')) path = path.slice('/public/'.length)
  // 선두 / 보장
  if (!path.startsWith('/')) path = '/' + path
  return path
}
