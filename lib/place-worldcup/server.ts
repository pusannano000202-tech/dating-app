import 'server-only'

import { NextResponse } from 'next/server'
import { RequestGuardError, requireRequestAccess } from '@/lib/auth/server-guards'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { expectedPlaceAccountMatches, PlaceInputError } from './contract'

const ERROR_STATUS: Readonly<Record<string, number>> = Object.freeze({
  account_unavailable: 403,
  account_changed: 403,
  operator_required: 403,
  mfa_required: 403,
  invalid_category: 400,
  invalid_payload: 400,
  invalid_target: 400,
  idempotency_conflict: 409,
  revision_conflict: 409,
  review_target_unavailable: 409,
  target_revision_conflict: 409,
  rate_limited: 429,
  payload_too_large: 413,
})

const ERROR_MESSAGE: Readonly<Record<string, string>> = Object.freeze({
  account_unavailable: '현재 계정에서는 장소 월드컵을 이용할 수 없어요.',
  account_changed: '로그인 계정이 바뀌었어요. 현재 계정에서 다시 작성해 주세요.',
  operator_required: 'Quantum 운영자 권한이 필요해요.',
  mfa_required: '운영자 다중 인증을 완료해 주세요.',
  invalid_category: '장소 종류를 확인해 주세요.',
  invalid_payload: '입력한 장소 정보를 확인해 주세요.',
  invalid_target: '수정하려는 공개 후보를 다시 확인해 주세요.',
  idempotency_conflict: '같은 제출 키로 다른 요청이 들어왔어요. 화면을 새로 열어 주세요.',
  revision_conflict: '검수 항목이 바뀌었어요. 목록을 다시 불러와 주세요.',
  review_target_unavailable: '이미 처리됐거나 찾을 수 없는 검수 항목이에요.',
  target_revision_conflict: '대상 장소 정보가 먼저 바뀌었어요. 최신 후보를 다시 확인한 뒤 새 수정 요청으로 검수해 주세요.',
  rate_limited: '오늘 보낼 수 있는 제안 수를 넘었어요. 내일 다시 시도해 주세요.',
  payload_too_large: '입력 내용이 너무 커요.',
})

export class PlaceServiceError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}

export function placeJson(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
  })
}

export function placeError(error: unknown): NextResponse {
  if (error instanceof PlaceInputError || error instanceof SyntaxError) {
    return placeJson({ error: 'invalid_input', message: '입력 내용을 확인해 주세요.' }, 400)
  }
  if (error instanceof RequestGuardError) {
    const message = error.status === 401
      ? '로그인 후 장소 월드컵을 이용할 수 있어요.'
      : error.code === 'mfa_required'
        ? '운영자 다중 인증을 완료해 주세요.'
        : error.status === 403
          ? '이 요청을 처리할 권한이 없어요.'
          : '장소 후보 서비스에 연결하지 못했어요.'
    return placeJson({ error: error.code, message }, error.status)
  }
  if (error instanceof PlaceServiceError) {
    return placeJson({
      error: error.code,
      message: ERROR_MESSAGE[error.code] ?? '장소 후보 서비스에 연결하지 못했어요.',
    }, error.status)
  }
  return placeJson({ error: 'service_unavailable', message: '장소 후보 서비스에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.' }, 503)
}

export async function placeRepository(
  request: Request,
  options: Readonly<{ operator?: boolean; mutation?: boolean }> = {},
) {
  if (!isCommunityFeatureEnabled()) throw new PlaceServiceError(503, 'service_unavailable')
  const guarded = await requireRequestAccess(request, {
    checkMutationOrigin: options.mutation ?? false,
    ...(options.operator ? { allowedRoles: ['admin', 'super_admin'] as const } : {}),
  })
  const client = createSupabaseRequestClient(request)
  return {
    userId: guarded.userId,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      const { data, error } = await client.rpc(name, args)
      if (error) {
        const message = typeof error.message === 'string' ? error.message : ''
        const code = Object.keys(ERROR_STATUS).find(candidate => message.includes(candidate))
        throw new PlaceServiceError(code ? ERROR_STATUS[code] : 503, code ?? 'service_unavailable')
      }
      return data
    },
  }
}

export function requireExpectedPlaceAccount(request: Request, authenticatedAccount: string): void {
  if (!expectedPlaceAccountMatches(request.headers.get('X-Expected-Account'), authenticatedAccount)) {
    throw new PlaceServiceError(403, 'account_changed')
  }
}

export async function readPlaceJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new PlaceInputError()
  const reader = request.body?.getReader()
  if (!reader) throw new PlaceInputError()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 20_000) {
        await reader.cancel()
        throw new PlaceServiceError(413, 'payload_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}
