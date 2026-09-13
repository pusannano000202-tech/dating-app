import { requireRequestAccess, requestGuardErrorResponse, RequestGuardError } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { classifyRelationshipError, isRelationshipStatus, parseRelationshipState } from '@/lib/relationship/contract'

function json(body: unknown, status = 200) {
  return Response.json(body, {status,headers:{'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Authorization'}})
}
async function execute(request: Request, status?: 'single' | 'in_relationship') {
  try {
    await requireRequestAccess(request,{allowedRoles:['user'],checkMutationOrigin:status !== undefined})
    const client = createSupabaseRequestClient(request)
    const {data,error} = status === undefined
      ? await client.rpc('get_my_relationship_state')
      : await client.rpc('set_my_relationship_state',{p_status:status})
    if (error) {const failure=classifyRelationshipError(error);return json({error:failure.error},failure.status)}
    const state=parseRelationshipState(data)
    return state ? json({data:state}) : json({error:'relationship_unavailable'},503)
  } catch(error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return json({error:'relationship_unavailable'},503)
  }
}
export async function GET(request: Request) { return execute(request) }
export async function PATCH(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({error:'invalid_relationship_status'},400)
  const reader=request.body?.getReader()
  if (!reader) return json({error:'invalid_relationship_status'},400)
  let raw='', bytes=0
  try {
    const decoder=new TextDecoder()
    while(true) {
      const {done,value}=await reader.read(); if(done) break
      bytes+=value.byteLength
      if(bytes>2048) {await reader.cancel();return json({error:'invalid_relationship_status'},400)}
      raw+=decoder.decode(value,{stream:true})
    }
    raw+=decoder.decode()
    const value:unknown=JSON.parse(raw)
    if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==1
      || !('status' in value) || !isRelationshipStatus(value.status)) return json({error:'invalid_relationship_status'},400)
    return execute(request,value.status)
  } catch {return json({error:'invalid_relationship_status'},400)}
  finally {reader.releaseLock()}
}
