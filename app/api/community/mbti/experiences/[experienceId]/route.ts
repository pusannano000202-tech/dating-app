import { parseExperienceId, parseExperiencePatchInput, parseMutationInput, readMbtiJson } from '@/lib/community/mbti/input'
import { assertMbtiMutationOrigin, createAuthenticatedOwnerMbtiRepository } from '@/lib/community/mbti/server-repository'

import { mbtiErrorResponse, mbtiPrivateJson } from '../../_response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ experienceId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertMbtiMutationOrigin(request)
    const repository = await createAuthenticatedOwnerMbtiRepository(request)
    const experienceId = parseExperienceId((await context.params).experienceId)
    const input = parseExperiencePatchInput(await readMbtiJson(request))
    return mbtiPrivateJson({ result: await repository.updateExperience(experienceId, input) })
  } catch (error) {
    return mbtiErrorResponse(error)
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertMbtiMutationOrigin(request)
    const repository = await createAuthenticatedOwnerMbtiRepository(request)
    const experienceId = parseExperienceId((await context.params).experienceId)
    const input = parseMutationInput(await readMbtiJson(request))
    return mbtiPrivateJson({ result: await repository.deleteExperience(experienceId, input) })
  } catch (error) {
    return mbtiErrorResponse(error)
  }
}
