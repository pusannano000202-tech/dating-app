export const SCORE_BANDS = [5, 15, 25, 30, 40, 50, 70, 85, 95] as const

export type AppearanceGenderBank = 'female' | 'male'
export type AppearanceAnchorReviewStatus = 'pending' | 'approved' | 'excluded'

export type AppearanceAnchor = {
  anchorId: string
  genderBank: AppearanceGenderBank
  targetScore: number
  reviewerScore: number
  reviewStatus: AppearanceAnchorReviewStatus
  imagePath: string
}

export type AppearanceAnchorReviewAction =
  | { type: 'approve' }
  | { type: 'exclude' }
  | { type: 'lower' }
  | { type: 'raise' }
  | { type: 'set-score'; score: number }

export type AppearanceAnchorReviewSummary = {
  total: number
  approved: number
  excluded: number
  pending: number
  reviewed: number
}

type NeighborSelectionOptions = {
  genderBank: AppearanceGenderBank
  estimatedScore: number
  limit?: number
}

export function selectNeighborAnchors(
  anchors: readonly AppearanceAnchor[],
  options: NeighborSelectionOptions
): AppearanceAnchor[] {
  const estimatedScore = clampScoreRange(options.estimatedScore)
  const limit = Math.min(3, Math.max(1, Math.floor(options.limit ?? 3)))

  return anchors
    .filter(
      (anchor) =>
        anchor.genderBank === options.genderBank &&
        anchor.reviewStatus === 'approved'
    )
    .sort((left, right) => {
      const distance =
        Math.abs(left.reviewerScore - estimatedScore) -
        Math.abs(right.reviewerScore - estimatedScore)
      if (distance !== 0) return distance

      const reviewerScore = left.reviewerScore - right.reviewerScore
      if (reviewerScore !== 0) return reviewerScore

      const targetScore = left.targetScore - right.targetScore
      if (targetScore !== 0) return targetScore

      return left.anchorId.localeCompare(right.anchorId)
    })
    .slice(0, limit)
}

export function applyAnchorReview(
  anchor: AppearanceAnchor,
  action: AppearanceAnchorReviewAction
): AppearanceAnchor {
  switch (action.type) {
    case 'approve':
      return { ...anchor, reviewStatus: 'approved' }
    case 'exclude':
      return { ...anchor, reviewStatus: 'excluded' }
    case 'lower':
      return {
        ...anchor,
        reviewerScore: clampScore(anchor.reviewerScore - 5),
        reviewStatus: 'pending',
      }
    case 'raise':
      return {
        ...anchor,
        reviewerScore: clampScore(anchor.reviewerScore + 5),
        reviewStatus: 'pending',
      }
    case 'set-score':
      return {
        ...anchor,
        reviewerScore: clampScore(action.score),
        reviewStatus: 'pending',
      }
  }
}

export function summarizeAnchorReviews(
  anchors: readonly AppearanceAnchor[]
): AppearanceAnchorReviewSummary {
  const summary: AppearanceAnchorReviewSummary = {
    total: anchors.length,
    approved: 0,
    excluded: 0,
    pending: 0,
    reviewed: 0,
  }

  for (const anchor of anchors) {
    summary[anchor.reviewStatus] += 1
  }
  summary.reviewed = summary.approved + summary.excluded

  return summary
}

function clampScore(score: number): number {
  return Math.round(clampScoreRange(score))
}

function clampScoreRange(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.min(100, Math.max(0, score))
}
