// 새 8버킷 → 기존 6 enum (AppearanceType) 임시 매핑
// 기존 `profiles.appearance_type` 컬럼 호환용. 매칭 정밀도는 measured vector 가 책임진다.
// 이 매핑은 PR 가능 컬럼이 추가될 때까지의 호환 레이어다.

import type { AppearanceType } from '@/lib/types'

const FEMALE_MAP: Record<string, AppearanceType> = {
  '귀여운/동안형': 'cute',
  '청순/자연형': 'pure',
  '시크/도도형': 'chic',
  '따뜻한/부드러운형': 'warm',
  '스타일리시/화려형': 'stylish',
  '건강/활동형': 'healthy',
  '성숙/분위기형': 'chic',
  '지적/단정형': 'pure',
}

const MALE_MAP: Record<string, AppearanceType> = {
  '훈훈/부드러운형': 'warm',
  '댄디/단정형': 'stylish',
  '시크/날카로운형': 'chic',
  '소년미/귀여운형': 'cute',
  '운동/건강형': 'healthy',
  '지적/안경형': 'pure',
  '강한 인상/남성미형': 'chic',
  '스타일리시/개성형': 'stylish',
}

export function legacyTypeFromBucketWeights(
  gender: 'female' | 'male',
  bucketWeights: Record<string, number>,
): AppearanceType | null {
  const map = gender === 'female' ? FEMALE_MAP : MALE_MAP
  const entries = Object.entries(bucketWeights)
  if (entries.length === 0) return null
  // 가장 가중치 높은 버킷 → legacy enum
  entries.sort((a, b) => b[1] - a[1])
  const top = entries[0][0]
  return map[top] ?? null
}
