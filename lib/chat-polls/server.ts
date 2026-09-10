import { requireRequestAccess, RequestGuardError, requestGuardErrorResponse } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { mapChatPollRpcError } from './errors'
import { safeViewerBindingEqual } from './viewer-binding'

export { mapChatPollRpcError } from './errors'

export const MAX_CHAT_POLL_JSON_BYTES = 16 * 1024

export type ChatPollMutationRequest = {
  request: Request
  body: unknown
  viewerBinding: string
}

export function chatPollJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      ...(status === 429 ? { 'Retry-After': '60' } : {}),
    },
  })
}

async function readBoundedChatPollJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new SyntaxError('invalid_request')
  }
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CHAT_POLL_JSON_BYTES) {
    throw new RangeError('payload_too_large')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new SyntaxError('invalid_request')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_CHAT_POLL_JSON_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new RangeError('payload_too_large')
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
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

export async function withChatPollMutation(
  request: Request,
  handler: (mutation: ChatPollMutationRequest) => Response | Promise<Response>,
) {
  let viewerBinding: string
  try {
    const guarded = await requireRequestAccess(request, { allowedRoles: ['user'] })
    viewerBinding = guarded.userId
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return chatPollJson({ error: 'community_unavailable' }, 503)
  }
  let body: unknown
  try {
    body = await readBoundedChatPollJson(request)
  } catch (error) {
    if (error instanceof RangeError && error.message === 'payload_too_large') {
      return chatPollJson({ error: 'payload_too_large' }, 413)
    }
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return chatPollJson({ error: 'invalid_request' }, 400)
    }
    return chatPollJson({ error: 'community_unavailable' }, 503)
  }
  try {
    return await handler({ request, body, viewerBinding })
  } catch {
    return chatPollJson({ error: 'community_unavailable' }, 503)
  }
}

async function invokeAuthorized(
  request: Request,
  viewerBinding: string,
  name: string,
  args: Record<string, unknown>,
  successStatus: number,
) {
  try {
    const client = createSupabaseRequestClient(request)
    const { data, error } = await client.rpc(name, args)
    if (error) {
      const mapped = mapChatPollRpcError(error)
      return chatPollJson({ error: mapped.code }, mapped.status)
    }
    return chatPollJson({ data, viewer_binding: viewerBinding }, successStatus)
  } catch (error) {
    return chatPollJson({ error: 'community_unavailable' }, 503)
  }
}

export async function chatPollRpc(request: Request, name: string, args: Record<string, unknown>) {
  try {
    const guarded = await requireRequestAccess(request, {
      allowedRoles: ['user'],
      checkMutationOrigin: false,
    })
    const expectedViewerBinding = request.headers.get('X-Expected-Account')
    if (!safeViewerBindingEqual(expectedViewerBinding, guarded.userId)) {
      return chatPollJson({ error: 'unauthenticated' }, 401)
    }
    return invokeAuthorized(request, guarded.userId, name, args, 200)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return chatPollJson({ error: 'community_unavailable' }, 503)
  }
}

export function chatPollMutation(
  mutation: ChatPollMutationRequest,
  name: string,
  args: Record<string, unknown>,
  expectedViewerBinding: string,
  successStatus = 200,
) {
  if (!safeViewerBindingEqual(expectedViewerBinding, mutation.viewerBinding)) {
    return Promise.resolve(chatPollJson({ error: 'unauthenticated' }, 401))
  }
  return invokeAuthorized(mutation.request, mutation.viewerBinding, name, args, successStatus)
}
