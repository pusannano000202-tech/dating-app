'use client'

import { useEffect, useRef, useState } from 'react'

import UserTonightExperience from '@/components/tonight/UserTonightExperience'
import { createLiveUserTonightAdapter } from '@/components/tonight/live-adapters'
import { createClient } from '@/lib/supabase'

const adapter = createLiveUserTonightAdapter()
const ACTIVITY_EXPLORER_DRAFT_PREFIX = 'quantum:tonight:g1:activity-draft:'

export default function TonightPage() {
  const [ownerScope, setOwnerScope] = useState<string | null>(null)
  const lastOwnerScopeRef = useRef<string | null>(null)
  const authEventVersionRef = useRef(0)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    const setScope = (nextScope: string | null) => {
      if (!nextScope && lastOwnerScopeRef.current) {
        try {
          window.sessionStorage.removeItem(`${ACTIVITY_EXPLORER_DRAFT_PREFIX}${lastOwnerScopeRef.current}`)
        } catch {
          // A blocked browser storage must not affect the protected server-side access guard.
        }
      }
      lastOwnerScopeRef.current = nextScope
      if (mounted) setOwnerScope(nextScope)
    }

    const initialAuthEventVersion = authEventVersionRef.current
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (authEventVersionRef.current === initialAuthEventVersion) setScope(user?.id ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventVersionRef.current += 1
      setScope(session?.user?.id ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <UserTonightExperience
      key={ownerScope ?? 'signed-out'}
      mode="live"
      adapter={adapter}
      ownerScope={ownerScope}
      isOwnerCurrent={() => lastOwnerScopeRef.current === ownerScope}
    />
  )
}
