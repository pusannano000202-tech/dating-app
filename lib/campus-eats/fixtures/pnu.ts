import { PNU_CAMPUS_EATS_CATEGORIES, type CampusEatsCandidate } from './pnu-categories'

export type PnuCampusEatsCandidate = CampusEatsCandidate

export const PNU_CAMPUS_EATS_CANDIDATES = PNU_CAMPUS_EATS_CATEGORIES
  .find((category) => category.id === 'donkatsu')
  ?.candidates ?? []

export const PNU_CAMPUS_EATS_IDS = PNU_CAMPUS_EATS_CANDIDATES.map((candidate) => candidate.id)
