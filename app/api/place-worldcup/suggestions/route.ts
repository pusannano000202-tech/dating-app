import { parsePlaceSuggestion, suggestionRpcPayload } from '@/lib/place-worldcup/contract'
import { placeError, placeJson, placeRepository, readPlaceJson, requireExpectedPlaceAccount } from '@/lib/place-worldcup/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const repository = await placeRepository(request, { mutation: true })
    requireExpectedPlaceAccount(request, repository.userId)
    const suggestion = parsePlaceSuggestion(await readPlaceJson(request))
    const data = await repository.rpc('submit_place_worldcup_suggestion', {
      p_payload: suggestionRpcPayload(suggestion),
    })
    return placeJson(data, 201)
  } catch (error) {
    return placeError(error)
  }
}
