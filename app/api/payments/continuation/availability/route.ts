import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { requireRequestAccess } from '@/lib/auth/server-guards'
import { continuationJson } from '@/lib/matching/continuation-api'
import { getContinuationFeeProviderAvailability } from '@/lib/payments/continuation-fee-provider'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const availability = getContinuationFeeProviderAvailability()
    return continuationJson({
      available: availability.available,
      provider: availability.provider,
      local_only: availability.localOnly,
      toss_sandbox_available: availability.tossSandbox,
      local_simulator_available: availability.localSimulator,
    })
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}
