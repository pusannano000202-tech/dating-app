import regionalData from './regional-campuses.json'
import {
  PNU_CAMPUS_EATS_CATEGORIES,
  type CampusEatsCandidate,
  type CampusEatsCategory,
  type CampusEatsCategoryId,
} from './pnu-categories'

export type { CampusEatsCandidate, CampusEatsCategory, CampusEatsCategoryId }

export type CampusEatsSchool = {
  id: string
  name: string
  livingAreaLabel: string
  categories: readonly CampusEatsCategory[]
  candidates: readonly CampusEatsCandidate[]
  candidateIds: readonly string[]
  districtCandidateIds: Readonly<Record<string, readonly string[]>>
}

const previewImages = [
  '/campus-eats/preview/cutlet-classic.webp',
  '/campus-eats/preview/cutlet-katsu.webp',
  '/campus-eats/preview/cutlet-cheese-curry.webp',
  '/campus-eats/preview/cutlet-campus-set.webp',
] as const

export function buildNaverSearchUrl(
  candidate: Pick<CampusEatsCandidate, 'name' | 'neighborhood' | 'roadAddress'>,
  school: Pick<CampusEatsSchool, 'name'>,
) {
  const searchQuery = [candidate.name, candidate.roadAddress || school.name, candidate.neighborhood].join(' ')
  return `https://map.naver.com/p/search/${encodeURIComponent(searchQuery)}`
}

function buildLegacyDonkatsuCategory(school: (typeof regionalData.schools)[number]): CampusEatsCategory {
  const candidates = school.candidates.map((candidate, index): CampusEatsCandidate => {
    const normalized = {
      ...candidate,
      categoryId: 'donkatsu' as const,
      candidateNumber: index + 1,
      neighborhood: candidate.district,
      livingAreaId: 'L3' as const,
      roadAddress: '',
      coordinateStatus: 'not_collected' as const,
      imageSrc: previewImages[index % previewImages.length],
      imageAlt: '시안용 돈까스 이미지',
    }
    return {
      ...normalized,
      naverSearchUrl: buildNaverSearchUrl(normalized, school as Pick<CampusEatsSchool, 'name'>),
    }
  })

  return {
    id: 'donkatsu',
    label: '돈까스',
    battleTitle: `${school.name} 돈까스 대진`,
    imageDisclosure: '시안용 이미지 · 실제 매장 메뉴 사진 아님',
    candidates,
  }
}

export const CAMPUS_EATS_SCHOOLS: readonly CampusEatsSchool[] = regionalData.schools.map((school) => {
  const categories = school.id === 'pnu'
    ? PNU_CAMPUS_EATS_CATEGORIES
    : [buildLegacyDonkatsuCategory(school)]
  const candidates = categories[0].candidates
  const districtCandidateIds = candidates.reduce<Record<string, string[]>>((districts, candidate) => {
    districts[candidate.neighborhood] = [...(districts[candidate.neighborhood] ?? []), candidate.id]
    return districts
  }, {})

  return {
    id: school.id,
    name: school.name,
    livingAreaLabel: school.livingAreaLabel,
    categories,
    candidates,
    candidateIds: candidates.map((candidate) => candidate.id),
    districtCandidateIds,
  }
})

export function getCampusEatsSchool(schoolId: string): CampusEatsSchool {
  return CAMPUS_EATS_SCHOOLS.find((school) => school.id === schoolId) ?? CAMPUS_EATS_SCHOOLS[0]
}

export function getCampusEatsCategory(school: CampusEatsSchool, categoryId: CampusEatsCategoryId) {
  return school.categories.find((category) => category.id === categoryId) ?? school.categories[0]
}
