import generatedFixture from './pnu-restaurants.generated.json'

export const CAMPUS_EATS_CATEGORY_IDS = [
  'donkatsu',
  'pizza',
  'chicken',
  'coffee-main',
  'coffee-north',
  'gukbap',
  'milmyeon',
] as const

export type CampusEatsCategoryId = (typeof CAMPUS_EATS_CATEGORY_IDS)[number]

export type CampusEatsCoordinateStatus = 'search_verified' | 'not_collected'

export type CampusEatsCandidate = {
  id: string
  canonicalStoreId: string
  categoryId: CampusEatsCategoryId
  candidateNumber: number
  name: string
  neighborhood: string
  livingAreaId: 'L1' | 'L2' | 'L3'
  roadAddress: string
  verifyStatus: string
  coordinateStatus: CampusEatsCoordinateStatus
  imageSrc: string | null
  imageAlt: string
  imageSourceUrl: string
  sourceSha256: string
  naverSearchUrl: string
}

export type CampusEatsCategory = {
  id: CampusEatsCategoryId
  label: string
  battleTitle: string
  imageDisclosure: string
  candidates: readonly CampusEatsCandidate[]
}

type GeneratedRestaurant = {
  canonicalStoreId: string
  categories: CampusEatsCategoryId[]
  name: string
  neighborhood: string
  livingAreaId: 'L1' | 'L2' | 'L3'
  roadAddress: string
  imageSrc: string
  imageAlt: string
  imageSourceUrl: string
  sourceSha256: string
}

const restaurants = generatedFixture.restaurants as GeneratedRestaurant[]

const CATEGORY_META: Readonly<Record<CampusEatsCategoryId, Omit<CampusEatsCategory, 'id' | 'candidates'>>> = {
  donkatsu: {
    label: '돈가스',
    battleTitle: '부산대 돈가스 개인 대진',
    imageDisclosure: '원본 비율 유지 · 방문 전 영업 확인',
  },
  pizza: {
    label: '피자',
    battleTitle: '부산대 피자 개인 대진',
    imageDisclosure: '원본 비율 유지 · 방문 전 영업 확인',
  },
  chicken: {
    label: '치킨',
    battleTitle: '부산대 치킨 개인 대진',
    imageDisclosure: '원본 비율 유지 · 방문 전 영업 확인',
  },
  'coffee-main': {
    label: '정문 커피',
    battleTitle: '부산대 정문권 커피 개인 대진',
    imageDisclosure: '원본 비율 유지 · 방문 전 영업 확인',
  },
  'coffee-north': {
    label: '북문 커피',
    battleTitle: '부산대 북문권 커피 개인 대진',
    imageDisclosure: '원본 비율 유지 · 방문 전 영업 확인',
  },
  gukbap: {
    label: '국밥',
    battleTitle: '부산대 국밥 개인 대진',
    imageDisclosure: '원본 비율 유지 · 방문 전 영업 확인',
  },
  milmyeon: {
    label: '밀면',
    battleTitle: '부산대 밀면 개인 대진',
    imageDisclosure: '원본 비율 유지 · 방문 전 영업 확인',
  },
}

function buildNaverSearchUrl(name: string, roadAddress: string) {
  return `https://map.naver.com/p/search/${encodeURIComponent(`${name} ${roadAddress}`)}`
}

function candidatesFor(categoryId: CampusEatsCategoryId): CampusEatsCandidate[] {
  return restaurants
    .filter((restaurant) => restaurant.categories.includes(categoryId))
    .map((restaurant, index) => ({
      id: `${restaurant.canonicalStoreId}:${categoryId}`,
      canonicalStoreId: restaurant.canonicalStoreId,
      categoryId,
      candidateNumber: index + 1,
      name: restaurant.name,
      neighborhood: restaurant.neighborhood,
      livingAreaId: restaurant.livingAreaId,
      roadAddress: restaurant.roadAddress,
      verifyStatus: '상호·주소·원본 해시 확인 · 영업은 방문 전 재확인',
      coordinateStatus: 'search_verified',
      imageSrc: restaurant.imageSrc,
      imageAlt: restaurant.imageAlt,
      imageSourceUrl: restaurant.imageSourceUrl,
      sourceSha256: restaurant.sourceSha256,
      naverSearchUrl: buildNaverSearchUrl(restaurant.name, restaurant.roadAddress),
    }))
}

export function isCampusEatsCategoryId(value: string | null): value is CampusEatsCategoryId {
  return value !== null && CAMPUS_EATS_CATEGORY_IDS.includes(value as CampusEatsCategoryId)
}

export function resolveCampusEatsCategoryId(value: string | null): CampusEatsCategoryId | null {
  if (value === 'coffee') return 'coffee-main'
  return isCampusEatsCategoryId(value) ? value : null
}

export const PNU_CAMPUS_EATS_CATEGORIES: readonly CampusEatsCategory[] = CAMPUS_EATS_CATEGORY_IDS.map((id) => ({
  id,
  ...CATEGORY_META[id],
  candidates: candidatesFor(id),
}))
