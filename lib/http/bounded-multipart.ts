export type BoundedMultipartErrorCode = 'invalid_request' | 'payload_too_large'

export class BoundedMultipartError extends Error {
  constructor(readonly code: BoundedMultipartErrorCode) {
    super(code)
    this.name = 'BoundedMultipartError'
  }
}

export async function readBoundedMultipartFormData(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError('maxBytes must be a positive safe integer')
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !/boundary=/i.test(contentType)) {
    throw new BoundedMultipartError('invalid_request')
  }

  const declaredLengthText = request.headers.get('content-length')
  if (declaredLengthText !== null) {
    if (!/^\d+$/.test(declaredLengthText)) {
      throw new BoundedMultipartError('invalid_request')
    }
    const declaredLength = Number(declaredLengthText)
    if (!Number.isSafeInteger(declaredLength) || declaredLength > maxBytes) {
      throw new BoundedMultipartError('payload_too_large')
    }
  }

  const reader = request.body?.getReader()
  if (!reader) throw new BoundedMultipartError('invalid_request')

  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break

      receivedBytes += next.value.byteLength
      if (receivedBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new BoundedMultipartError('payload_too_large')
      }
      chunks.push(next.value)
    }
  } catch (error) {
    if (error instanceof BoundedMultipartError) throw error
    throw new BoundedMultipartError('invalid_request')
  }

  try {
    return await new Response(
      Buffer.concat(chunks.map((chunk) => (
        Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      ))),
      { headers: { 'Content-Type': contentType } },
    ).formData()
  } catch {
    throw new BoundedMultipartError('invalid_request')
  }
}
