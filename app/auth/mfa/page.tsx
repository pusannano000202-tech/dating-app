import { notFound, redirect } from 'next/navigation'

import AdminMfaPanel, { type AdminMfaFactor } from './AdminMfaPanel'
import { getRoleDestination } from '@/lib/auth/redirect'
import { RequestGuardError, requireServerAccess, type AccessGuardClient } from '@/lib/auth/server-guards'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseConfigIssue } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function AdminMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  if (getSupabaseConfigIssue()) redirect('/auth/unavailable')

  const params = await searchParams
  const requestedReturn = typeof params.returnTo === 'string' ? params.returnTo : null
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  let resolvedAccessRole: 'user' | 'partner' | 'admin' | 'super_admin'

  try {
    supabase = await createSupabaseServerClient()
    const { access } = await requireServerAccess(supabase as unknown as AccessGuardClient)
    resolvedAccessRole = access.accessRole
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) redirect('/login')
    if (error instanceof RequestGuardError && error.status === 403) notFound()
    redirect('/auth/unavailable')
  }

  if (resolvedAccessRole !== 'admin' && resolvedAccessRole !== 'super_admin') notFound()
  const accessRole = resolvedAccessRole
  const returnTo = getRoleDestination(accessRole, requestedReturn)
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance.error || assurance.data.currentLevel === null) redirect('/auth/unavailable')
  if (assurance.data.currentLevel === 'aal2') redirect(returnTo)
  if (assurance.data.currentLevel !== 'aal1') redirect('/auth/unavailable')

  const factors = await supabase.auth.mfa.listFactors()
  if (factors.error) redirect('/auth/unavailable')
  const verifiedFactors: AdminMfaFactor[] = factors.data.totp
    .filter((factor) => factor.status === 'verified')
    .map((factor) => ({ id: factor.id, friendlyName: factor.friendly_name ?? '인증 앱' }))

  return (
    <AdminMfaPanel
      mode={verifiedFactors.length > 0 ? 'challenge' : 'enroll'}
      factors={verifiedFactors}
      returnTo={returnTo}
    />
  )
}
