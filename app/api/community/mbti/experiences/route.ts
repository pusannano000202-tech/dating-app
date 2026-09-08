import { parseExperienceCreateInput, parseExperiencePage, readMbtiJson } from '@/lib/community/mbti/input'
import { assertMbtiMutationOrigin, createAuthenticatedOwnerMbtiRepository } from '@/lib/community/mbti/server-repository'

import { mbtiErrorResponse, mbtiPrivateJson } from '../_response'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const repository = await createAuthenticatedOwnerMbtiRepository(request)
    const state = await repository.getState(parseExperiencePage(new URL(request.url)))
    return mbtiPrivateJson({ experiences: state.experiences, nextCursor: state.nextCursor })
  } catch (error) {
    return mbtiErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    assertMbtiMutationOrigin(request)
    const repository = await createAuthenticatedOwnerMbtiRepository(request)
    const input = parseExperienceCreateInput(await readMbtiJson(request))
    return mbtiPrivateJson({ result: await repository.createExperience(input) }, 201)
  } catch (error) {
    return mbtiErrorResponse(error)
  }
}
