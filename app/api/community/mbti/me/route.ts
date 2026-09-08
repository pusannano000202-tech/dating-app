import { parseParticipantInput, parseExperiencePage, readMbtiJson } from '@/lib/community/mbti/input'
import { assertMbtiMutationOrigin, createAuthenticatedOwnerMbtiRepository } from '@/lib/community/mbti/server-repository'

import { mbtiErrorResponse, mbtiPrivateJson } from '../_response'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const repository = await createAuthenticatedOwnerMbtiRepository(request)
    const state = await repository.getState(parseExperiencePage(new URL(request.url)))
    return mbtiPrivateJson(state)
  } catch (error) {
    return mbtiErrorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    assertMbtiMutationOrigin(request)
    const repository = await createAuthenticatedOwnerMbtiRepository(request)
    const input = parseParticipantInput(await readMbtiJson(request))
    return mbtiPrivateJson({ result: await repository.upsertParticipant(input) })
  } catch (error) {
    return mbtiErrorResponse(error)
  }
}
