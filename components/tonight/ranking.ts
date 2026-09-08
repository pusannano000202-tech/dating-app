export function moveRankedActivity<T extends string>(
  rankedActivities: readonly T[],
  activityId: string,
  targetRank: 1 | 2 | 3,
): readonly T[] {
  if (rankedActivities.length !== 3 || new Set(rankedActivities).size !== 3) {
    throw new TypeError('ranked_activities_must_be_exactly_three')
  }

  const sourceIndex = rankedActivities.indexOf(activityId as T)
  if (sourceIndex < 0) return rankedActivities

  const next = [...rankedActivities]
  const [selected] = next.splice(sourceIndex, 1)
  next.splice(targetRank - 1, 0, selected)
  return next
}
