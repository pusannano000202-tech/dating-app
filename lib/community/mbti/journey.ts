import type { MbtiExperienceCreateInput, MbtiParticipantInput } from './types'

export function transitionExpandedReviewId(
  current: string | null,
  toggledId: string,
  isOpen: boolean,
): string | null {
  if (isOpen) return toggledId
  return current === toggledId ? null : current
}

export interface MbtiSubmissionPlan {
  participant: MbtiParticipantInput
  experiences: MbtiExperienceCreateInput[]
}

export interface MbtiSubmissionTransport {
  putParticipant: (input: MbtiParticipantInput) => Promise<{ ok: boolean, status: number }>
  postExperience: (input: MbtiExperienceCreateInput) => Promise<{ ok: boolean, status: number }>
}

export type MbtiSubmissionAttemptResult = {
  kind: 'completed' | 'retry_locked' | 'participant_conflict'
  participantConfirmed: boolean
}

export async function runMbtiSubmissionAttempt(
  plan: MbtiSubmissionPlan,
  transport: MbtiSubmissionTransport,
  participantConfirmed: boolean,
): Promise<MbtiSubmissionAttemptResult> {
  try {
    if (!participantConfirmed) {
      const participant = await transport.putParticipant(plan.participant)
      if (!participant.ok) {
        if (participant.status === 409) return { kind: 'participant_conflict', participantConfirmed: false }
        return { kind: 'retry_locked', participantConfirmed: false }
      }
      participantConfirmed = true
    }

    for (const experience of plan.experiences) {
      const response = await transport.postExperience(experience)
      if (!response.ok) return { kind: 'retry_locked', participantConfirmed }
    }
    return { kind: 'completed', participantConfirmed }
  } catch {
    return { kind: 'retry_locked', participantConfirmed }
  }
}
