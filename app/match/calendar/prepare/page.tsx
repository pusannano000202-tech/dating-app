import { notFound, redirect } from 'next/navigation'
import CalendarMatchingPreparation from '@/components/matching/CalendarMatchingPreparation'
import { RequestGuardError, requireServerAccess, type AccessGuardClient } from '@/lib/auth/server-guards'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function CalendarPreparationPage() {
  let expectedOwner: string
  try {
    const client = await createSupabaseServerClient()
    const access = await requireServerAccess(client as unknown as AccessGuardClient, { allowedRoles: ['user'] })
    expectedOwner = access.userId
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) redirect('/login?redirect=%2Fmatch%2Fcalendar%2Fprepare')
    if (error instanceof RequestGuardError && error.status === 403) notFound()
    redirect('/auth/service-unavailable?returnTo=%2Fmatch%2Fcalendar%2Fprepare')
  }
  return <CalendarMatchingPreparation expectedOwner={expectedOwner} />
}
