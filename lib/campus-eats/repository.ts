import {
  PNU_CAMPUS_EATS_CATEGORIES,
  isCampusEatsCategoryId,
  resolveCampusEatsCategoryId,
  type CampusEatsCandidate,
  type CampusEatsCategory,
  type CampusEatsCategoryId,
} from './fixtures/pnu-categories'

export { isCampusEatsCategoryId, resolveCampusEatsCategoryId }

export type CampusEatsIncludeStatus = 'include' | 'hold'

export type CampusEatsApiCandidate = CampusEatsCandidate & {
  restaurant_id: string
  include_status: CampusEatsIncludeStatus
}

export type CampusEatsCategoryResponse = {
  source: 'fixture'
  category: Omit<CampusEatsCategory, 'candidates'>
  candidates: readonly CampusEatsApiCandidate[]
}

const APPROVED_FIXTURE_CANDIDATE_IDS = new Set<string>(
  PNU_CAMPUS_EATS_CATEGORIES.flatMap((category) => category.candidates.map((candidate) => candidate.id)),
)

type CandidateWithIncludeStatus = {
  include_status?: string
}

/**
 * The fixture is the temporary repository implementation. A future Supabase
 * repository only needs to return this same shape.
 */
export function selectIncludedCandidates<T extends CandidateWithIncludeStatus>(candidates: readonly T[]): T[] {
  return candidates.filter((candidate) => candidate.include_status === 'include')
}

export function getCampusEatsFixtureIncludeStatus(candidateId: string): CampusEatsIncludeStatus {
  return APPROVED_FIXTURE_CANDIDATE_IDS.has(candidateId) ? 'include' : 'hold'
}

function toApiCandidate(candidate: CampusEatsCandidate): CampusEatsApiCandidate {
  return {
    ...candidate,
    restaurant_id: candidate.id,
    include_status: getCampusEatsFixtureIncludeStatus(candidate.id),
  }
}

export function getCampusEatsCategoryResponse(categoryId: CampusEatsCategoryId): CampusEatsCategoryResponse | null {
  const category = PNU_CAMPUS_EATS_CATEGORIES.find((item) => item.id === categoryId)
  if (!category) return null

  const candidates = selectIncludedCandidates(category.candidates.map(toApiCandidate))
  return {
    source: 'fixture',
    category: {
      id: category.id,
      label: category.label,
      battleTitle: category.battleTitle,
      imageDisclosure: category.imageDisclosure,
    },
    candidates,
  }
}
