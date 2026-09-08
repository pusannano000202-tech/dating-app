import { NextRequest, NextResponse } from 'next/server'

import {
  requestGuardErrorResponse,
  requireRequestAccess,
} from '@/lib/auth/server-guards'

export async function GET(request: NextRequest) {
  try {
    const guarded = await requireRequestAccess(request)
    return NextResponse.json(
      {
        accessRole: guarded.access.accessRole,
        partnerVenueIds: guarded.access.partnerVenueIds,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          Vary: 'Cookie, Authorization',
        },
      },
    )
  } catch (error) {
    return requestGuardErrorResponse(error)
  }
}
