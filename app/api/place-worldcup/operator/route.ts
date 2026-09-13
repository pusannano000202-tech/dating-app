import { parsePlaceOperatorReview, parsePlaceQueue } from '@/lib/place-worldcup/contract'
import { placeError, placeJson, placeRepository, readPlaceJson, requireExpectedPlaceAccount } from '@/lib/place-worldcup/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const repository = await placeRepository(request, { operator: true })
    requireExpectedPlaceAccount(request, repository.userId)
    const data = await repository.rpc('operator_list_place_worldcup_queue')
    parsePlaceQueue(data)
    return placeJson(data)
  } catch (error) {
    return placeError(error)
  }
}

export async function POST(request: Request) {
  try {
    const repository = await placeRepository(request, { operator: true, mutation: true })
    requireExpectedPlaceAccount(request, repository.userId)
    const review = parsePlaceOperatorReview(await readPlaceJson(request))
    const data = await repository.rpc('operator_review_place_worldcup', { p_payload: review })
    return placeJson(data)
  } catch (error) {
    return placeError(error)
  }
}
