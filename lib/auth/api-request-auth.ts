export function getBearerAccessToken(authorization: string | null): string | null {
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] ?? null
}
