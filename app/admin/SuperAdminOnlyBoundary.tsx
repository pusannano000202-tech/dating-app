import type { ReactNode } from 'react'
import { notFound, redirect } from 'next/navigation'

import { RequestGuardError, requireServerAccess, type AccessGuardClient } from '@/lib/auth/server-guards'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseConfigIssue } from '@/lib/utils'

export default async function SuperAdminOnlyBoundary({
  children,
  redirectPath,
}: {
  children: ReactNode
  redirectPath: string
}) {
  if (getSupabaseConfigIssue()) redirect('/auth/unavailable')

  try {
    const supabase = await createSupabaseServerClient()
    await requireServerAccess(supabase as unknown as AccessGuardClient, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
    })
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) {
      redirect(`/login?redirect=${encodeURIComponent(redirectPath)}`)
    }
    if (error instanceof RequestGuardError && error.code === 'mfa_required') {
      redirect(`/auth/mfa?returnTo=${encodeURIComponent(redirectPath)}`)
    }
    if (error instanceof RequestGuardError && error.code === 'reauthentication_required') {
      redirect(`/login?reauth=1&redirect=${encodeURIComponent(redirectPath)}`)
    }
    if (error instanceof RequestGuardError && error.status === 403) notFound()
    redirect('/auth/unavailable')
  }

  return children
}
