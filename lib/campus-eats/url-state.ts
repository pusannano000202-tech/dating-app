import {
  PNU_CAMPUS_EATS_CATEGORIES,
  isCampusEatsCategoryId,
  type CampusEatsCategoryId,
} from './fixtures/pnu-categories'

export type CampusEatsUrlState = {
  categoryId: CampusEatsCategoryId
  selectedRestaurantId: string | null
  rankingOpen: boolean
  mode: 'map' | 'battle'
}

function resolveLegacyCoffeeState(selectedRestaurantId: string | null) {
  const canonicalStoreId = selectedRestaurantId?.replace(/:coffee$/, '') ?? null
  const category = PNU_CAMPUS_EATS_CATEGORIES.find((item) => (
    item.id.startsWith('coffee-')
    && canonicalStoreId !== null
    && item.candidates.some((candidate) => candidate.canonicalStoreId === canonicalStoreId)
  ))
  const categoryId = category?.id ?? 'coffee-main'
  const hasSelectedCandidate = canonicalStoreId !== null
    && category?.candidates.some((candidate) => candidate.canonicalStoreId === canonicalStoreId)

  return {
    categoryId,
    selectedRestaurantId: hasSelectedCandidate ? `${canonicalStoreId}:${categoryId}` : null,
  }
}

export function readCampusEatsUrlState(search: string): CampusEatsUrlState {
  const params = new URLSearchParams(search)
  const category = params.get('category')
  const mode = params.get('mode')
  const selectedRestaurantId = params.get('selected')

  if (category === 'coffee') {
    const legacyCoffeeState = resolveLegacyCoffeeState(selectedRestaurantId)
    return {
      ...legacyCoffeeState,
      rankingOpen: params.get('list') !== 'closed',
      mode: mode === 'battle' ? 'battle' : 'map',
    }
  }

  return {
    categoryId: isCampusEatsCategoryId(category) ? category : 'donkatsu',
    selectedRestaurantId,
    rankingOpen: params.get('list') !== 'closed',
    mode: mode === 'battle' ? 'battle' : 'map',
  }
}

export function writeCampusEatsUrlState(state: CampusEatsUrlState): string {
  const params = new URLSearchParams()
  params.set('category', state.categoryId)
  if (state.selectedRestaurantId) params.set('selected', state.selectedRestaurantId)
  params.set('list', state.rankingOpen ? 'open' : 'closed')
  params.set('mode', state.mode)
  return `?${params.toString()}`
}
