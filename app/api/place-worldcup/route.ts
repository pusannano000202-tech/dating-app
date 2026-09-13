import { PlaceInputError, parsePlaceCatalog, placeCategory } from '@/lib/place-worldcup/contract'
import { placeError, placeJson, placeRepository } from '@/lib/place-worldcup/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    if ([...params.keys()].some(key => key !== 'category')) throw new PlaceInputError()
    const category = placeCategory(params.get('category'))
    const repository = await placeRepository(request)
    const data = await repository.rpc('get_place_worldcup_catalog', { p_category: category })
    parsePlaceCatalog(data)
    return placeJson(data)
  } catch (error) {
    return placeError(error)
  }
}
