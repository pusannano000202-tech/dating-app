import { parseMutationInput, readMbtiJson } from '@/lib/community/mbti/input'
import { assertMbtiMutationOrigin, createAuthenticatedOwnerMbtiRepository } from '@/lib/community/mbti/server-repository'

import { mbtiErrorResponse, mbtiPrivateJson } from '../_response'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    assertMbtiMutationOrigin(request)
    const repository = await createAuthenticatedOwnerMbtiRepository(request)
    const input = parseMutationInput(await readMbtiJson(request))
    return mbtiPrivateJson({ result: await repository.withdraw(input) })
  } catch (error) {
    return mbtiErrorResponse(error)
  }
}
