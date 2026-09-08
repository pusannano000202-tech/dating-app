import { parseMeetingStatsConsentInput, parseMutationInput, readMbtiJson } from '@/lib/community/mbti/input'
import { assertMbtiMutationOrigin, createAuthenticatedOwnerMbtiRepository } from '@/lib/community/mbti/server-repository'

import { mbtiErrorResponse, mbtiPrivateJson } from '../_response'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const repository = await createAuthenticatedOwnerMbtiRepository(request)
    return mbtiPrivateJson({ consent: await repository.getMeetingStatsConsent() })
  } catch (error) {
    return mbtiErrorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    assertMbtiMutationOrigin(request)
    const repository = await createAuthenticatedOwnerMbtiRepository(request)
    const input = parseMeetingStatsConsentInput(await readMbtiJson(request))
    return mbtiPrivateJson({ result: await repository.putMeetingStatsConsent(input) })
  } catch (error) {
    return mbtiErrorResponse(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertMbtiMutationOrigin(request)
    const repository = await createAuthenticatedOwnerMbtiRepository(request)
    const input = parseMutationInput(await readMbtiJson(request))
    return mbtiPrivateJson({ result: await repository.withdrawMeetingStatsConsent(input) })
  } catch (error) {
    return mbtiErrorResponse(error)
  }
}
