import type { ReactNode } from 'react'
import { notFound, redirect } from 'next/navigation'

import { RequestGuardError, requireServerAccess, type AccessGuardClient } from '@/lib/auth/server-guards'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseConfigIssue } from '@/lib/utils'

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  if (getSupabaseConfigIssue()) redirect('/auth/unavailable')

  try {
    const supabase = await createSupabaseServerClient()
    await requireServerAccess(supabase as unknown as AccessGuardClient, {
      allowedRoles: ['super_admin'],
    })
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) {
      redirect('/login?redirect=%2Fadmin%2Fsuper-admin%2Ftonight')
    }
    if (error instanceof RequestGuardError && error.code === 'mfa_required') {
      redirect('/auth/mfa?returnTo=%2Fadmin%2Fsuper-admin%2Ftonight')
    }
    if (error instanceof RequestGuardError && error.status === 403) notFound()
    redirect('/auth/unavailable')
  }

  return children
}
