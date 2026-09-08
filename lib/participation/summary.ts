export const PARTICIPATION_POLICY_VERSION = '2026-09-07-mandatory-aggregate-v1'
export type ParticipationBasis =
  'valid_applicants' | 'waiting_for_voice' | 'connected_to_voice'
export type ParticipationSummary = {
  scopeId: string
  asOf: string
  totalPeople: number
  genderBreakdown: {
    malePeople: number
    femalePeople: number
    otherOrUnspecifiedPeople: number
  }
  disclosureBasis: 'all_valid_participants'
  policyVersion: string
  basis: ParticipationBasis
}

/** Caller must provide unique, currently eligible people from an authorized scope. */
export function makeParticipationSummary(
  scopeId: string,
  genders: readonly string[],
  basis: ParticipationBasis,
  now = new Date(),
): ParticipationSummary {
  const genderBreakdown = {
    malePeople: 0,
    femalePeople: 0,
    otherOrUnspecifiedPeople: 0,
  }
  for (const gender of genders) {
    if (gender === 'male') genderBreakdown.malePeople++
    else if (gender === 'female') genderBreakdown.femalePeople++
    else genderBreakdown.otherOrUnspecifiedPeople++
  }
  return {
    scopeId,
    asOf: now.toISOString(),
    totalPeople: genders.length,
    genderBreakdown,
    disclosureBasis: 'all_valid_participants',
    policyVersion: PARTICIPATION_POLICY_VERSION,
    basis,
  }
}

export function parseParticipationSummary(
  value: unknown,
): ParticipationSummary {
  if (!value || typeof value !== 'object')
    throw new Error('invalid_participation_summary')
  const v = value as ParticipationSummary
  const b = v.genderBreakdown
  if (
    typeof v.scopeId !== 'string' ||
    typeof v.asOf !== 'string' ||
    !Number.isFinite(Date.parse(v.asOf)) ||
    !b ||
    ![
      v.totalPeople,
      b.malePeople,
      b.femalePeople,
      b.otherOrUnspecifiedPeople,
    ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    v.totalPeople !==
      b.malePeople + b.femalePeople + b.otherOrUnspecifiedPeople ||
    v.disclosureBasis !== 'all_valid_participants' ||
    typeof v.policyVersion !== 'string' ||
    !['valid_applicants', 'waiting_for_voice', 'connected_to_voice'].includes(
      v.basis,
    )
  )
    throw new Error('invalid_participation_summary')
  return v
}
