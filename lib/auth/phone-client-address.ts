import { isIP } from 'node:net'

// Never accept client-supplied proxy headers on a directly reachable server.
// Vercel supplies x-vercel-forwarded-for at its own ingress; other deployments
// require a separately reviewed trust boundary before enabling production SMS.
export function resolvePhoneClientAddress(
  headers: { get(name: string): string | null },
  env: { NODE_ENV?: string; VERCEL?: string },
): string | null {
  if (env.VERCEL !== '1') return env.NODE_ENV === 'production' ? null : 'local-shared'
  const value = headers.get('x-vercel-forwarded-for')?.trim()
  if (!value || !isIP(value)) return null
  return isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname.slice(1, -1) : value
}
