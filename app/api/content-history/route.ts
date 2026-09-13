import { ContentInputError, parseContentRecord } from '@/lib/content-history/contract'
import { historyRepository, historyJson, historyError, readHistoryJson, historyUuid } from '@/lib/content-history/server'
export const dynamic='force-dynamic'
export async function GET(request: Request) {
  try {
    const repository=await historyRepository(request)
    const params=new URL(request.url).searchParams
    if ([...params.keys()].some(key=>!['type','beforeAt','beforeId'].includes(key))) throw new ContentInputError()
    const kind=params.get('type'), beforeAt=params.get('beforeAt'), beforeId=params.get('beforeId')
    if ((kind!==null && !['visit','places'].includes(kind)) || (!!beforeAt!==!!beforeId) || (beforeAt && !Number.isFinite(Date.parse(beforeAt)))) throw new ContentInputError()
    return historyJson(await repository.rpc('list_my_content_records',{p_kind:kind,p_before_at:beforeAt,p_before_id:beforeId?historyUuid(beforeId):null}))
  } catch(error) {return historyError(error)}
}
export async function POST(request: Request) {
  try {
    const repository=await historyRepository(request)
    return historyJson(await repository.rpc('save_my_content_record',{p_snapshot:parseContentRecord(await readHistoryJson(request))}))
  } catch(error) {return historyError(error)}
}
