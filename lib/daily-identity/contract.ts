export const DAILY_IDENTITY_ODDS = Object.freeze({ SS: 5, A: 15, B: 25, C: 55 })

export const DAILY_IDENTITY_DISCLOSURE = Object.freeze({
  noReroll: '한국 시간 하루에 한 번 정해지며, 새로고침하거나 기기를 바꿔도 바뀌지 않아요.',
  noBenefit: '등급은 오늘의 등장 확률만 뜻해요. 매칭 우선권·유료 혜택·사람의 평가는 없어요.',
  sourceBasis: '마블·DC·디즈니 공식 캐릭터 소개와 2026 산리오 공식 결과를 이름 후보의 참고 자료로 사용했어요. 전 세계 인기 순위를 뜻하지 않으며, 등급은 Quantum의 등장 확률이에요.',
  licenseRisk: '캐릭터 이름을 텍스트로만 참고하며 이미지·로고·공식 아트는 사용하지 않아요. 상용 공개 전 상표·라이선스 검토가 필요해요.',
})

export const DAILY_IDENTITY_SOURCES = Object.freeze([
  { label: '마블 공식 캐릭터', href: 'https://www.marvel.com/characters/spider-man-peter-parker/' },
  { label: '마블 어벤져스', href: 'https://www.marvel.com/Ultron/' },
  { label: 'DC 배트맨', href: 'https://www.dc.com/characters/batman' },
  { label: '디즈니 공식 캐릭터', href: 'https://characters.disney.com/' },
  { label: '겨울왕국 캐릭터', href: 'https://movies.disney.com/frozen-2' },
  {
    label: '2026 산리오 캐릭터 대상 공식 결과',
    href: 'https://corporate.sanrio.co.jp/en/news/20260628_03.html',
  },
  {
    label: '2026 공식 출전 캐릭터 목록',
    href: 'https://ranking.sanrio.co.jp/en/characters/',
  },
])

export type DailyIdentityTier = keyof typeof DAILY_IDENTITY_ODDS

export type DailyIdentity = Readonly<{
  localDate: string
  timezone: 'Asia/Seoul'
  poolVersion: string
  tier: DailyIdentityTier
  characterKey: string
  displayName: string
  odds: typeof DAILY_IDENTITY_ODDS
}>

export function parseDailyIdentityResponse(value: unknown): DailyIdentity | null {
  if (!isRecord(value) || !isRecord(value.odds)) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asString(value.local_date))) return null
  if (value.timezone !== 'Asia/Seoul') return null
  if (!isShortKey(value.pool_version) || !isShortKey(value.character_key)) return null
  if (!isTier(value.tier) || !isDisplayName(value.display_name)) return null
  if (!hasExactOdds(value.odds)) return null

  return Object.freeze({
    localDate: value.local_date as string,
    timezone: 'Asia/Seoul',
    poolVersion: value.pool_version as string,
    tier: value.tier,
    characterKey: value.character_key as string,
    displayName: value.display_name.trim(),
    odds: DAILY_IDENTITY_ODDS,
  })
}

export function rarityPresentation(tier: DailyIdentityTier) {
  const label = tier === 'SS' ? 'SS · 오늘의 희귀 등장' : `${tier} · 오늘의 캐릭터`
  return Object.freeze({ label, chance: `등장 확률 ${DAILY_IDENTITY_ODDS[tier]}%` })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isShortKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
}

function isDisplayName(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const normalized = value.trim()
  return normalized.length >= 1 && normalized.length <= 60 && !/[\u0000-\u001f\u007f]/.test(normalized)
}

function isTier(value: unknown): value is DailyIdentityTier {
  return value === 'SS' || value === 'A' || value === 'B' || value === 'C'
}

function hasExactOdds(value: Record<string, unknown>) {
  return Object.keys(value).length === 4
    && value.SS === DAILY_IDENTITY_ODDS.SS
    && value.A === DAILY_IDENTITY_ODDS.A
    && value.B === DAILY_IDENTITY_ODDS.B
    && value.C === DAILY_IDENTITY_ODDS.C
}
