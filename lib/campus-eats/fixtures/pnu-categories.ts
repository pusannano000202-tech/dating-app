export type CampusEatsCategoryId = 'donkatsu' | 'coffee'

export type CampusEatsCoordinateStatus = 'search_verified' | 'not_collected'

export type CampusEatsCandidate = {
  id: string
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
  naverSearchUrl: string
}

export type CampusEatsCategory = {
  id: CampusEatsCategoryId
  label: string
  battleTitle: string
  imageDisclosure: string
  candidates: readonly CampusEatsCandidate[]
}

const cutletImages = [
  '/campus-eats/preview/cutlet-classic.webp',
  '/campus-eats/preview/cutlet-katsu.webp',
  '/campus-eats/preview/cutlet-cheese-curry.webp',
  '/campus-eats/preview/cutlet-campus-set.webp',
] as const

type CandidateSeed = Omit<CampusEatsCandidate, 'candidateNumber' | 'categoryId' | 'verifyStatus' | 'coordinateStatus' | 'imageSrc' | 'imageAlt' | 'naverSearchUrl'>

const donkatsuSeeds: readonly CandidateSeed[] = [
  { id: 'pnu:donkatsu:tonshow:geumgangro-247-10', name: '톤쇼우', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 금강로 247-10' },
  { id: 'pnu:donkatsu:katsuan:busandae', name: '카츠안 부산대점', neighborhood: '정문 · 금정로', livingAreaId: 'L1', roadAddress: '부산 금정구 금정로 59-8' },
  { id: 'pnu:donkatsu:1986:sulimro71-43', name: '1986 옛날돈까스', neighborhood: '북문 · 기숙사', livingAreaId: 'L2', roadAddress: '부산 금정구 수림로71번길 43 1층' },
  { id: 'pnu:donkatsu:matnaneun:geumgangro321-57', name: '맛나는돈까스', neighborhood: '북문 · 기숙사', livingAreaId: 'L2', roadAddress: '부산 금정구 금강로321번길 57 1층' },
  { id: 'pnu:donkatsu:ginzaryoko:busandae', name: '긴자료코 부산대점', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 금강로 248-9' },
  { id: 'pnu:donkatsu:susu:busandae', name: '수수하지만굉장해 부산대점', neighborhood: '부산대역 · 장전동', livingAreaId: 'L3', roadAddress: '부산 금정구 금정로52번길 23 1층' },
  { id: 'pnu:donkatsu:hondon:busandae', name: '혼돈 불고기돈까스&함박스테이크', neighborhood: '부산대역 · 장전동', livingAreaId: 'L3', roadAddress: '부산 금정구 부산대학로49번길 43 1층' },
  { id: 'pnu:donkatsu:baeksojeong:busandae', name: '백소정 부산대점', neighborhood: '부산대역 · 장전동', livingAreaId: 'L3', roadAddress: '부산 금정구 부산대학로49번길 14 1층' },
  { id: 'pnu:donkatsu:migarag:busandae', name: '미가락일식돈가스', neighborhood: '부산대역 · 장전동', livingAreaId: 'L3', roadAddress: '부산 금정구 부산대학로 57 DADA 지하 1층' },
  { id: 'pnu:donkatsu:donkatsugyeom:busandae', name: '돈까스겸', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 부산대학로63번길 48 1층' },
  { id: 'pnu:donkatsu:eunhwasu:busandae', name: '은화수식당 부산대점', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 금강로 280 1층' },
  { id: 'pnu:donkatsu:haruensoku:busandae', name: '하루엔소쿠 부산대점', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 금정로 59-1 1층' },
  { id: 'pnu:donkatsu:bistro-toh:geumgangro-295-1', name: '비스트로 토흐', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 금강로 295-1' },
]

const coffeeSeeds: readonly CandidateSeed[] = [
  { id: 'pnu:coffee:cafe-de-pain:geumgangro-247-7', name: '카페드팽', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 금강로 247-7' },
  { id: 'pnu:coffee:goder:north-gate', name: '고더커피 부산대북문점', neighborhood: '북문 · 기숙사', livingAreaId: 'L2', roadAddress: '부산 금정구 수림로85번길 54 1층' },
  { id: 'pnu:coffee:like-that:sulimro91-51', name: '라이크댓커피', neighborhood: '북문 · 기숙사', livingAreaId: 'L2', roadAddress: '부산 금정구 수림로91번길 51 1층' },
  { id: 'pnu:coffee:busan-coffee:jangjeoncheon-93', name: '부산커피', neighborhood: '부산대역 · 장전동', livingAreaId: 'L3', roadAddress: '부산 금정구 장전온천천로 93' },
  { id: 'pnu:coffee:awake:busandae', name: '커피어웨이크 부산대점', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 부산대학로63번길 46-4' },
  { id: 'pnu:coffee:priblic:geumgangro279-20', name: '프리블릭', neighborhood: '북문 · 기숙사', livingAreaId: 'L2', roadAddress: '부산 금정구 금강로279번길 20 1·2층' },
  { id: 'pnu:coffee:court:busandae-63', name: '코트커피', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 부산대학로 63 1층' },
  { id: 'pnu:coffee:different-days:jangjeonro12-11', name: '디퍼런트데이즈', neighborhood: '부산대역 · 장전동', livingAreaId: 'L3', roadAddress: '부산 금정구 장전로12번길 11' },
  { id: 'pnu:coffee:compose:busandae-2', name: '컴포즈커피 부산대2호점', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 금강로 248-10' },
  { id: 'pnu:coffee:smallgood:busandae', name: '스몰굿커피 부산대점', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 금강로 248-6 1층' },
  { id: 'pnu:coffee:ediya:north-gate', name: '이디야커피 부산대북문점', neighborhood: '북문 · 기숙사', livingAreaId: 'L2', roadAddress: '부산 금정구 금강로321번길 45' },
  { id: 'pnu:coffee:beans-espresso:geumjeongro-59-7', name: '빈스에스프레소', neighborhood: '정문 · 금강로', livingAreaId: 'L1', roadAddress: '부산 금정구 금정로 59-7' },
  { id: 'pnu:coffee:mega-mgc:pnu-station', name: '메가MGC커피 부산대역점', neighborhood: '부산대역 · 장전동', livingAreaId: 'L3', roadAddress: '부산 금정구 금정로60번길 38' },
]

function toCandidates(categoryId: CampusEatsCategoryId, seeds: readonly CandidateSeed[]) {
  return seeds.map((seed, index): CampusEatsCandidate => ({
    ...seed,
    categoryId,
    candidateNumber: index + 1,
    verifyStatus: '상호·주소 확인 · 영업은 방문 전 재확인',
    coordinateStatus: 'search_verified',
    imageSrc: categoryId === 'donkatsu' ? cutletImages[index % cutletImages.length] : null,
    imageAlt: categoryId === 'donkatsu' ? '시안용 돈까스 이미지' : '커피 매장 이미지 준비 중',
    naverSearchUrl: `https://map.naver.com/p/search/${encodeURIComponent(`${seed.name} ${seed.roadAddress}`)}`,
  }))
}

export const PNU_CAMPUS_EATS_CATEGORIES: readonly CampusEatsCategory[] = [
  {
    id: 'donkatsu',
    label: '돈까스',
    battleTitle: '부산대 돈까스 대진',
    imageDisclosure: '시안용 이미지 · 실제 매장 메뉴 사진 아님',
    candidates: toCandidates('donkatsu', donkatsuSeeds),
  },
  {
    id: 'coffee',
    label: '커피',
    battleTitle: '부산대 커피 대진',
    imageDisclosure: '매장 사진 권리 확인 전 텍스트 후보로 운영',
    candidates: toCandidates('coffee', coffeeSeeds),
  },
]
