import 'server-only'
import { NextResponse } from 'next/server'
import { assertTrustedMutationOrigin, TrustedOriginError } from '@/lib/auth/trusted-origin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { getPublicAppOrigin } from '@/lib/utils'
import { ContentInputError } from './contract'

export class HistoryServiceError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
export const historyJson = (data: unknown, status=200) => NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, Authorization'}})
export function historyError(error: unknown) {
  if (error instanceof ContentInputError || error instanceof SyntaxError) return historyJson({error:'invalid_input',message:'입력 내용을 확인해 주세요.'},400)
  if (error instanceof TrustedOriginError) return historyJson({error:'request_not_allowed',message:'요청을 확인할 수 없어요.'},error.status)
  if (error instanceof HistoryServiceError) {
    const message = error.status===401 ? '로그인 후 내 기록을 볼 수 있어요.' : error.status===404 ? '내 기록에서 찾을 수 없어요.' : error.status===409 ? '기록이 바뀌었어요. 다시 불러온 뒤 확인해 주세요.' : error.status===413 ? '기록이 너무 커요.' : error.status===400 ? '기록 내용을 확인해 주세요.' : '기록 서비스에 연결하지 못했어요. 기기 기록은 그대로 유지됩니다.'
    return historyJson({error:error.code,message},error.status)
  }
  return historyJson({error:'service_unavailable',message:'기록 서비스에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.'},503)
}
export async function historyRepository(request: Request) {
  assertTrustedMutationOrigin(request,getPublicAppOrigin())
  const client=createSupabaseRequestClient(request)
  const {data,error}=await client.auth.getUser()
  if (error) {
    if (!('status' in error) || typeof error.status!=='number' || error.status>=500) throw new HistoryServiceError(503,'auth_unavailable')
    throw new HistoryServiceError(401,'auth_required')
  }
  if (!data.user) throw new HistoryServiceError(401,'auth_required')
  const expectedAccount=request.headers.get('X-Expected-Account')
  if ((request.method!=='GET'&&!expectedAccount)||(expectedAccount&&expectedAccount!==data.user.id)) {
    throw new HistoryServiceError(403,'account_changed')
  }
  return {
    async rpc(name: string,args: Record<string,unknown>) {
      const {data,error}=await client.rpc(name,args)
      if (error) {
        const code=['auth_required','account_unavailable','record_not_found','revision_conflict','source_conflict','record_limit','invalid_snapshot','invalid_note','invalid_query'].find(code=>error.message===code)
        const status=code==='auth_required'?401:code==='account_unavailable'?403:code==='record_not_found'?404:code?.endsWith('conflict')?409:code==='record_limit'?429:code?.startsWith('invalid')?400:503
        throw new HistoryServiceError(status,code??'service_unavailable')
      }
      return data
    },
  }
}
export async function readHistoryJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ContentInputError()
  const reader=request.body?.getReader()
  if (!reader) throw new ContentInputError()
  const chunks:Uint8Array[]=[]; let size=0
  try {
    while (true) {
      const {done,value}=await reader.read()
      if (done) break
      size+=value.byteLength
      if (size>200000) { await reader.cancel(); throw new HistoryServiceError(413,'payload_too_large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes=new Uint8Array(size); let offset=0
  for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength}
  return JSON.parse(new TextDecoder().decode(bytes))
}
export function historyUuid(value: string | null): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ContentInputError()
  return value
}
export function historyRevision(request: Request): number {
  const value=request.headers.get('if-match')
  if (!value || !/^[1-9]\d{0,8}$/.test(value)) throw new ContentInputError()
  return Number(value)
}
