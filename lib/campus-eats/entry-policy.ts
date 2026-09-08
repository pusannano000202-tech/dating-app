import type { BracketSession } from './types'
import type { CampusEatsUrlState } from './url-state'

export type PilotView = 'map' | 'setup' | 'battle' | 'result'

export function resolveAutoView(
  request: CampusEatsUrlState,
  targetCategoryId: string,
  session: Pick<BracketSession, 'status'>,
  tournamentStarted = false,
): PilotView {
  if (request.categoryId !== targetCategoryId) return 'map'
  if (request.mode === 'setup') return 'setup'
  if (request.mode !== 'battle') return 'map'
  if (!tournamentStarted) return 'setup'
  if (session.status !== 'active') return 'result'
  return 'battle'
}

export function campusEatsModeForView(view: PilotView): CampusEatsUrlState['mode'] {
  if (view === 'setup') return 'setup'
  return view === 'map' ? 'map' : 'battle'
}
