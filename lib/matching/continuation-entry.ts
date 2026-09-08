export type ContinuationChoice = 'continue' | 'end' | null
export type ContinuationFeeStatus = 'unpaid' | 'pending' | 'verified' | 'recovery_required'

export interface ContinuationTransitionMember {
  userId: string
  present: boolean
  choice: ContinuationChoice
  feeStatus: ContinuationFeeStatus
}

export type ContinuationTransitionState =
  | 'source_not_completed'
  | 'roster_reconsent_required'
  | 'insufficient_participants'
  | 'awaiting_private_choices'
  | 'closed'
  | 'payment_verification_pending'
  | 'schedule_conflict'
  | 'ready_to_schedule'
  | 'terminal'

export function evaluateContinuationTransition(input: {
  sourceStatus: 'completed' | 'open' | 'cancelled'
  rosterRevision: number
  consentRosterRevision: number
  transitionIndex: number
  targetProgramDay: 1 | 2 | 3 | 4 | 5 | null
  members: readonly ContinuationTransitionMember[]
  minimumParticipants: 3 | 5
  hasScheduleConflict: boolean
}): { state: ContinuationTransitionState } {
  if (input.targetProgramDay === null) return { state: 'terminal' }
  if (input.sourceStatus !== 'completed') return { state: 'source_not_completed' }
  if (input.rosterRevision !== input.consentRosterRevision) return { state: 'roster_reconsent_required' }
  const eligible = input.members.filter((member) => member.present)
  if (eligible.length < input.minimumParticipants) return { state: 'insufficient_participants' }
  if (eligible.some((member) => member.choice === null)) return { state: 'awaiting_private_choices' }
  if (eligible.some((member) => member.choice === 'end')) return { state: 'closed' }
  if (eligible.some((member) => member.feeStatus !== 'verified')) return { state: 'payment_verification_pending' }
  if (input.hasScheduleConflict) return { state: 'schedule_conflict' }
  return { state: 'ready_to_schedule' }
}

export function projectPrivateTransition(input: {
  transitionId: string
  state: ContinuationTransitionState
  actorUserId: string
  members: readonly ContinuationTransitionMember[]
}) {
  return {
    transitionId: input.transitionId,
    state: input.state,
    ownChoice: input.members.find((member) => member.userId === input.actorUserId)?.choice ?? null,
  }
}

