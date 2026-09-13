import { parseContentNote } from '@/lib/content-history/contract'
import { historyRepository, historyJson, historyError, historyUuid, historyRevision, readHistoryJson } from '@/lib/content-history/server'
type Context={params:Promise<{recordId:string}>}
export const dynamic='force-dynamic'
export async function GET(request: Request,context:Context) {
  try {
    const repository=await historyRepository(request)
    return historyJson(await repository.rpc('get_my_content_record',{p_id:historyUuid((await context.params).recordId)}))
  } catch(error) {return historyError(error)}
}
export async function PATCH(request: Request,context:Context) {
  try {
    const repository=await historyRepository(request)
    return historyJson(await repository.rpc('update_my_content_record_note',{p_id:historyUuid((await context.params).recordId),p_note:parseContentNote(await readHistoryJson(request)),p_revision:historyRevision(request)}))
  } catch(error) {return historyError(error)}
}
export async function DELETE(request: Request,context:Context) {
  try {
    const repository=await historyRepository(request)
    return historyJson(await repository.rpc('delete_my_content_record',{p_id:historyUuid((await context.params).recordId),p_revision:historyRevision(request)}))
  } catch(error) {return historyError(error)}
}
