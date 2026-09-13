/** Only an explicit rolled-back admission conflict is safe to recompute once.
 * Unknown network outcomes and successful writes must never be replayed here. */
export async function retryDatingAdmissionOnce<T extends {error: unknown}>(
  result: T,
  freshSnapshotAndPublish: () => Promise<T>,
): Promise<T> {
  const error=result.error
  if (!error || typeof error!=='object' || !('message' in error)
    || typeof error.message!=='string' || !error.message.includes('dating_participation_unavailable')) return result
  return freshSnapshotAndPublish()
}
