import { CONTINUATION_SERIES_ALBUM_MAX_MULTIPART_BYTES } from './continuation-series-album'

export class ContinuationSeriesAlbumFormError extends Error {
  constructor(
    readonly status: 400 | 413,
    readonly publicCode: 'invalid_request' | 'payload_too_large',
  ) {
    super(publicCode)
  }
}

export async function readStrictContinuationSeriesAlbumForm(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !/boundary=/i.test(contentType)) {
    throw new ContinuationSeriesAlbumFormError(400, 'invalid_request')
  }
  const contentLengthText = request.headers.get('content-length')
  if (contentLengthText && /^\d+$/.test(contentLengthText)) {
    const contentLength = Number(contentLengthText)
    if (!Number.isSafeInteger(contentLength) || contentLength > CONTINUATION_SERIES_ALBUM_MAX_MULTIPART_BYTES) {
      throw new ContinuationSeriesAlbumFormError(413, 'payload_too_large')
    }
  }

  const reader = request.body?.getReader()
  if (!reader) throw new ContinuationSeriesAlbumFormError(400, 'invalid_request')
  const chunks: Uint8Array[] = []
  let byteSize = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    byteSize += next.value.byteLength
    if (byteSize > CONTINUATION_SERIES_ALBUM_MAX_MULTIPART_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new ContinuationSeriesAlbumFormError(413, 'payload_too_large')
    }
    chunks.push(next.value)
  }

  let form: FormData
  try {
    form = await new Response(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))), {
      headers: { 'Content-Type': contentType },
    }).formData()
  } catch {
    throw new ContinuationSeriesAlbumFormError(400, 'invalid_request')
  }

  const allowed = new Set(['targetKind', 'targetId', 'idempotencyKey', 'photo'])
  for (const key of form.keys()) {
    if (!allowed.has(key) || form.getAll(key).length !== 1) {
      throw new ContinuationSeriesAlbumFormError(400, 'invalid_request')
    }
  }
  if ([...allowed].some((key) => !form.has(key))) {
    throw new ContinuationSeriesAlbumFormError(400, 'invalid_request')
  }
  return form
}
