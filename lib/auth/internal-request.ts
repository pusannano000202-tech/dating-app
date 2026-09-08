import { timingSafeEqual } from 'node:crypto'

export function isAuthorizedInternalRequest(
  authorizationHeader: string | null,
  expectedSecret: string | undefined,
) {
  if (!expectedSecret || expectedSecret.length < 32) return false

  const match = authorizationHeader?.match(/^Bearer\s+([^\s]+)$/i)
  if (!match) return false

  const provided = Buffer.from(match[1])
  const expected = Buffer.from(expectedSecret)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}
