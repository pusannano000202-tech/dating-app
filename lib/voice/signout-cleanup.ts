type Ownership = {
  status: string
  revision: number
  session: { id: string; revision: number } | null
  cleanup?: { sessionId: string; revision: number } | null
}

/** Logout is not an ordinary UI command: it must not be dropped by a busy guard. */
export async function cleanVoiceBeforeSignOut(deps: {
  pending: Promise<unknown> | null
  isCurrent: () => boolean
  disconnect: () => Promise<unknown>
  read: () => Promise<Ownership | null>
  cancel: (revision: number) => Promise<unknown>
  leave: (id: string, revision: number) => Promise<unknown>
}) {
  // Stop local sound now while the last server mutation settles.
  const detached = deps.disconnect()
  await deps.pending?.catch(() => undefined)
  await detached
  if (!deps.isCurrent()) return
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const latest = await deps.read()
      if (!deps.isCurrent() || !latest || latest.status === 'idle') return
      if (latest.status === 'waiting') await deps.cancel(latest.revision)
      else if (latest.cleanup) await deps.leave(latest.cleanup.sessionId, latest.cleanup.revision)
      else if (latest.session) await deps.leave(latest.session.id, latest.session.revision)
      return
    } catch (error) {
      if (!deps.isCurrent()) return
      if (attempt === 1) throw error
    }
  }
}
