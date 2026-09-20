'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useHistoryAccount } from '@/components/content-history/useHistoryAccount'
import { parseRelationshipState, type RelationshipState } from '@/lib/relationship/contract'

/** Account-scoped state: an unavailable response never means single. */
export function useRelationshipState() {
  const owner = useHistoryAccount()
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  const version = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const [snapshot, setSnapshot] = useState<{ owner: string; data: RelationshipState } | null>(null)
  const [failed, setFailed] = useState(false)
  const refresh = useCallback(async () => {
    if (!owner || owner === 'unavailable') return
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const requestVersion = ++version.current
    const timeout = window.setTimeout(() => abort.abort(), 10_000)
    try {
      const response = await fetch('/api/profile/relationship', { cache: 'no-store', signal: abort.signal })
      if (requestVersion !== version.current || ownerRef.current !== owner) return
      if (response.status === 401 || response.status === 403) {
        setSnapshot(null)
        setFailed(true)
        return
      }
      const payload: unknown = await response.json()
      const parsed = response.ok && payload && typeof payload === 'object' && 'data' in payload
        ? parseRelationshipState(payload.data) : null
      if (requestVersion !== version.current || ownerRef.current !== owner) return
      if (!parsed) throw new Error('relationship_unavailable')
      setSnapshot({ owner, data: parsed })
      setFailed(false)
    } catch {
      if (requestVersion === version.current && ownerRef.current === owner) {
        // Transient failure can retain this account's setting; explicit access denial above cannot.
        setFailed(true)
      }
    } finally {
      window.clearTimeout(timeout)
      if (requestVersion === version.current) controller.current = null
    }
  }, [owner])
  useEffect(() => {
    version.current += 1
    controller.current?.abort()
    setSnapshot(null)
    setFailed(false)
    void refresh()
    const onFocus = () => { if (document.visibilityState === 'visible' && !controller.current) void refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      version.current += 1
      controller.current?.abort()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])
  const state = snapshot && snapshot.owner === owner ? snapshot.data : null
  return { state, refresh, owner, unavailable: failed || owner === 'unavailable' || owner === null }
}
