export type ActivityExplorerActivity = Readonly<{
  id: string
  title: string
  description: string
  imageUrl: string
  imageAlt: string
  durationMinutes: number
  kind: string
}>

export type ActivityExplorerSnapshot = Readonly<{
  round: Readonly<{
    id: string
    serviceDate: string
    signupCloseAt: string
    status: string
  }>
  activities: readonly ActivityExplorerActivity[]
  applicationsOpen: boolean
}>

export type ActivityExplorerDraft = Readonly<{
  version: 1
  fingerprint: string
  rankedIds: readonly [string, string, string]
}>

function defaultRankedIds(activities: readonly ActivityExplorerActivity[]): readonly string[] {
  return activities.map((activity) => activity.id)
}

export function isExactlyThreeUniqueActivityIds(
  rankedIds: readonly string[],
  activities: readonly Pick<ActivityExplorerActivity, 'id'>[],
): rankedIds is readonly [string, string, string] {
  if (rankedIds.length !== 3 || activities.length !== 3) return false
  const activityIds = activities.map((activity) => activity.id)
  if (activityIds.some((id) => typeof id !== 'string' || !id.trim())) return false
  if (rankedIds.some((id) => typeof id !== 'string' || !id.trim())) return false
  const validIds = new Set(activityIds)
  return validIds.size === 3 && new Set(rankedIds).size === 3 && rankedIds.every((id) => validIds.has(id))
}

export function activityExplorerFingerprint(snapshot: ActivityExplorerSnapshot): string {
  const content = JSON.stringify({
    round: [
      snapshot.round.id,
      snapshot.round.serviceDate,
      snapshot.round.signupCloseAt,
      snapshot.round.status,
      snapshot.applicationsOpen,
    ],
    activities: snapshot.activities.map((activity) => [
      activity.id,
      activity.title,
      activity.description,
      activity.imageUrl,
      activity.imageAlt,
      activity.durationMinutes,
      activity.kind,
    ]),
  })
  let primary = 0x811c9dc5
  let secondary = 0x9e3779b9
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index)
    primary = Math.imul(primary ^ code, 0x01000193)
    secondary = Math.imul(secondary ^ code, 0x85ebca6b)
  }
  return `g1:${(primary >>> 0).toString(16).padStart(8, '0')}${(secondary >>> 0).toString(16).padStart(8, '0')}`
}

export async function guardFreshActivityExplorerAction<T>(
  load: () => Promise<T>,
  isCurrent: () => boolean,
  action: (fresh: T) => Promise<void>,
): Promise<'completed' | 'invalidated'> {
  const fresh = await load()
  if (!isCurrent()) return 'invalidated'
  await action(fresh)
  return 'completed'
}

export function canProgressTonightActivityExplorer(snapshot: ActivityExplorerSnapshot): boolean {
  return snapshot.applicationsOpen
    && snapshot.round.status === 'open'
    && isExactlyThreeUniqueActivityIds(snapshot.activities.map((activity) => activity.id), snapshot.activities)
}

export function classifyFreshActivityExplorerSubmission({
  next,
  expectedFingerprint,
  rankedIds,
  hasExistingApplication,
}: Readonly<{
  next: ActivityExplorerSnapshot
  expectedFingerprint: string
  rankedIds: readonly string[]
  hasExistingApplication: boolean
}>): 'existing_application' | 'invalidated' | 'ready' {
  if (hasExistingApplication) return 'existing_application'
  if (
    !canProgressTonightActivityExplorer(next)
    || activityExplorerFingerprint(next) !== expectedFingerprint
    || !isExactlyThreeUniqueActivityIds(rankedIds, next.activities)
  ) return 'invalidated'
  return 'ready'
}

export function readActivityExplorerDraft(
  raw: unknown,
  snapshot: ActivityExplorerSnapshot,
): ActivityExplorerDraft | null {
  return inspectActivityExplorerDraft(raw, snapshot).draft
}

export function inspectActivityExplorerDraft(
  raw: unknown,
  snapshot: ActivityExplorerSnapshot,
): Readonly<{ draft: ActivityExplorerDraft | null; stale: boolean }> {
  if (!raw || typeof raw !== 'object') return { draft: null, stale: false }
  const draft = raw as Partial<ActivityExplorerDraft>
  if (
    draft.version !== 1
    || typeof draft.fingerprint !== 'string'
    || !Array.isArray(draft.rankedIds)
    || draft.rankedIds.length !== 3
    || draft.rankedIds.some((id) => typeof id !== 'string')
    || new Set(draft.rankedIds).size !== 3
  ) return { draft: null, stale: false }
  if (draft.fingerprint !== activityExplorerFingerprint(snapshot)) return { draft: null, stale: true }
  if (!isExactlyThreeUniqueActivityIds(draft.rankedIds, snapshot.activities)) return { draft: null, stale: false }
  return {
    stale: false,
    draft: {
      version: 1,
      fingerprint: draft.fingerprint,
      rankedIds: [draft.rankedIds[0], draft.rankedIds[1], draft.rankedIds[2]],
    },
  }
}

export function reconcileActivityExplorerState({
  next,
  previousFingerprint,
  previousRankedIds,
}: Readonly<{
  next: ActivityExplorerSnapshot
  previousFingerprint: string | null
  previousRankedIds: readonly string[]
}>): Readonly<{
  fingerprint: string
  rankedIds: readonly string[]
  reset: boolean
  canProgress: boolean
}> {
  const fingerprint = activityExplorerFingerprint(next)
  const changed = previousFingerprint !== null && previousFingerprint !== fingerprint
  const validPreviousRank = isExactlyThreeUniqueActivityIds(previousRankedIds, next.activities)

  return {
    fingerprint,
    rankedIds: !changed && validPreviousRank ? [...previousRankedIds] : defaultRankedIds(next.activities),
    reset: changed || !validPreviousRank,
    canProgress: canProgressTonightActivityExplorer(next),
  }
}
